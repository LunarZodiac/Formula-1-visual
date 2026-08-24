#!/usr/bin/env node

import { copyFile, mkdir, readdir, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import pg from 'pg';

const { Client } = pg;

function assertDatabaseEnvironment() {
  const required = ['PGHOST', 'PGPORT', 'PGDATABASE', 'PGUSER', 'PGPASSWORD'];
  const missing = required.filter((name) => !process.env[name]);
  if (missing.length > 0) {
    throw new Error(`Не заданы параметры базы: ${missing.join(', ')}.`);
  }
}

function readOptions(argv) {
  const option = argv.find((value) => value.startsWith('--output='));
  const output = option?.slice('--output='.length) ?? 'apps/web/public/data/f1';
  const inlineSeason = argv.find((value) => value.startsWith('--season='));
  const seasonIndex = argv.indexOf('--season');
  const rawSeason = inlineSeason?.slice('--season='.length) ?? argv[seasonIndex + 1];
  const season = rawSeason === undefined ? null : Number(rawSeason);
  if (season !== null && (!Number.isInteger(season) || season < 1950)) {
    throw new Error(`Некорректный сезон для экспорта: ${rawSeason}.`);
  }
  return { outputDirectory: path.resolve(output), season };
}

async function writeJsonAtomic(filePath, value) {
  const temporaryPath = `${filePath}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  await rename(temporaryPath, filePath);
}

async function publishStagedDirectory(stagingDirectory, outputDirectory) {
  await mkdir(outputDirectory, { recursive: true });
  const entries = await readdir(stagingDirectory, { withFileTypes: true });

  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith('.json')) continue;
    const sourcePath = path.join(stagingDirectory, entry.name);
    const targetPath = path.join(outputDirectory, entry.name);
    const temporaryPath = `${targetPath}.tmp`;
    try {
      await copyFile(sourcePath, temporaryPath);
      await rename(temporaryPath, targetPath);
    } finally {
      await rm(temporaryPath, { force: true });
    }
  }
}

function asNumber(value) {
  if (value === null || value === undefined) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

async function readSeasonSnapshot(client, season) {
  const calendarResult = await client.query(
      `SELECT
         r.id,
         r.round,
         r.name,
         to_char(r.race_date, 'YYYY-MM-DD') AS race_date,
         r.status,
         c.id AS circuit_id,
         c.name AS circuit_name,
         c.short_name,
         c.locality,
         c.country_code,
         c.circuit_type,
         ST_X(c.location::geometry) AS longitude,
         ST_Y(c.location::geometry) AS latitude
       FROM atlas.races AS r
       JOIN atlas.circuits AS c ON c.id = r.circuit_id
       WHERE r.season_year = $1
       ORDER BY r.round`,
      [season],
    );
  const driverResult = await client.query(
      `WITH final_round AS (
         SELECT max(after_round) AS value
         FROM atlas.driver_standings
         WHERE season_year = $1
       )
       SELECT
         ds.position,
         ds.driver_id,
         ds.points,
         ds.wins,
         d.given_name,
         d.family_name,
         d.abbreviation,
         latest_team.constructor_id,
         latest_team.display_name AS constructor_name,
         latest_team.team_colour
       FROM atlas.driver_standings AS ds
       JOIN final_round AS fr ON ds.after_round = fr.value
       JOIN atlas.drivers AS d ON d.id = ds.driver_id
       LEFT JOIN LATERAL (
         SELECT ce.constructor_id, ce.display_name, ce.team_colour
         FROM atlas.session_results AS sr
         JOIN atlas.sessions AS s ON s.id = sr.session_id
         JOIN atlas.races AS r ON r.id = s.race_id
         JOIN atlas.constructor_entries AS ce ON ce.id = sr.constructor_entry_id
         WHERE r.season_year = ds.season_year
           AND sr.driver_id = ds.driver_id
         ORDER BY r.round DESC, CASE s.session_type WHEN 'race' THEN 0 ELSE 1 END
         LIMIT 1
       ) AS latest_team ON true
       WHERE ds.season_year = $1
       ORDER BY ds.position`,
      [season],
    );
  const constructorResult = await client.query(
      `WITH final_round AS (
         SELECT max(after_round) AS value
         FROM atlas.constructor_standings
         WHERE season_year = $1
       )
       SELECT
         cs.position,
         cs.points,
         cs.wins,
         ce.constructor_id,
         ce.display_name,
         ce.engine_name,
         ce.team_colour,
         ce.car_model,
         ce.car_image_url
       FROM atlas.constructor_standings AS cs
       JOIN final_round AS fr ON cs.after_round = fr.value
       JOIN atlas.constructor_entries AS ce ON ce.id = cs.constructor_entry_id
       WHERE cs.season_year = $1
       ORDER BY cs.position`,
      [season],
    );

  return {
    season,
    calendar: calendarResult.rows.map((row) => ({
      id: row.id,
      round: Number(row.round),
      name: row.name,
      date: row.race_date,
      status: row.status,
      circuit: {
        id: row.circuit_id,
        name: row.circuit_name,
        shortName: row.short_name,
        locality: row.locality,
        countryCode: row.country_code.trim(),
        type: row.circuit_type,
        coordinates: [asNumber(row.longitude), asNumber(row.latitude)],
      },
    })),
    standings: {
      drivers: driverResult.rows.map((row) => ({
        position: Number(row.position),
        driverId: row.driver_id,
        givenName: row.given_name,
        familyName: row.family_name,
        code: row.abbreviation?.trim() ?? null,
        points: asNumber(row.points) ?? 0,
        wins: Number(row.wins),
        constructorId: row.constructor_id,
        constructorName: row.constructor_name,
        teamColor: row.team_colour,
      })),
      constructors: constructorResult.rows.map((row) => ({
        position: Number(row.position),
        constructorId: row.constructor_id,
        name: row.display_name,
        engineName: row.engine_name,
        points: asNumber(row.points) ?? 0,
        wins: Number(row.wins),
        teamColor: row.team_colour,
        carModel: row.car_model,
        carImageUrl: row.car_image_url,
      })),
    },
  };
}

async function main() {
  assertDatabaseEnvironment();
  const { outputDirectory, season: requestedSeason } = readOptions(process.argv.slice(2));
  const stagingDirectory = `${outputDirectory}.staging-${process.pid}`;
  const client = new Client({ application_name: 'f1-geovisual-atlas-web-exporter' });
  await client.connect();

  try {
    const seasonsResult = await client.query(
      `SELECT
         s.year,
         s.status,
         s.rounds_planned,
         count(r.id)::integer AS races_available
       FROM atlas.seasons AS s
       LEFT JOIN atlas.races AS r ON r.season_year = s.year
       GROUP BY s.year, s.status, s.rounds_planned
       ORDER BY s.year DESC`,
    );

    await rm(stagingDirectory, { recursive: true, force: true });
    await mkdir(stagingDirectory, { recursive: true });
    const exportedAt = new Date().toISOString();
    const seasons = seasonsResult.rows.map((row) => ({
      year: Number(row.year),
      status: row.status,
      roundsPlanned: row.rounds_planned === null ? null : Number(row.rounds_planned),
      racesAvailable: Number(row.races_available),
    }));
    const seasonsToExport = requestedSeason === null
      ? seasons
      : seasons.filter((season) => season.year === requestedSeason);
    if (seasonsToExport.length === 0) {
      throw new Error(`Сезон ${requestedSeason} отсутствует в PostgreSQL.`);
    }

    for (const [index, season] of seasonsToExport.entries()) {
      const snapshot = await readSeasonSnapshot(client, season.year);
      await writeJsonAtomic(path.join(stagingDirectory, `season-${season.year}.json`), {
        exportedAt,
        ...snapshot,
      });
      process.stdout.write(`\rЭкспорт сезонов: ${index + 1}/${seasonsToExport.length}`);
    }

    await writeJsonAtomic(path.join(stagingDirectory, 'seasons.json'), {
      exportedAt,
      seasons,
    });
    await publishStagedDirectory(stagingDirectory, outputDirectory);
    process.stdout.write('\n');
    console.log(`Веб-снимки сохранены: ${outputDirectory}`);
  } finally {
    await client.end();
    await rm(stagingDirectory, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(`\nОшибка: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
