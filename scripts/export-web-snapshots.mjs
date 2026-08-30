#!/usr/bin/env node

import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const { Client } = pg;
const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, '..');

// Jolpica stores a driver's nationality as an English demonym. Keep the
// conversion explicit: an unknown or historically ambiguous value must remain
// null instead of silently displaying a different country's flag.
const NATIONALITY_COUNTRY_CODES = new Map([
  ['American', 'us'],
  ['Argentine', 'ar'],
  ['Australian', 'au'],
  ['Austrian', 'at'],
  ['Belgian', 'be'],
  ['Brazilian', 'br'],
  ['British', 'gb'],
  ['Canadian', 'ca'],
  ['Chilean', 'cl'],
  ['Chinese', 'cn'],
  ['Colombian', 'co'],
  ['Czech', 'cz'],
  ['Danish', 'dk'],
  ['Dutch', 'nl'],
  ['Finnish', 'fi'],
  ['French', 'fr'],
  ['German', 'de'],
  ['Hungarian', 'hu'],
  ['Indian', 'in'],
  ['Indonesian', 'id'],
  ['Irish', 'ie'],
  ['Italian', 'it'],
  ['Japanese', 'jp'],
  ['Liechtensteiner', 'li'],
  ['Malaysian', 'my'],
  ['Mexican', 'mx'],
  ['Monegasque', 'mc'],
  ['New Zealander', 'nz'],
  ['Polish', 'pl'],
  ['Portuguese', 'pt'],
  ['Russian', 'ru'],
  ['South African', 'za'],
  ['Spanish', 'es'],
  ['Swedish', 'se'],
  ['Swiss', 'ch'],
  ['Thai', 'th'],
  ['Uruguayan', 'uy'],
  ['Venezuelan', 've'],
]);

function nationalityCountryCode(nationality) {
  return nationality ? NATIONALITY_COUNTRY_CODES.get(nationality) ?? null : null;
}

function assertDatabaseEnvironment() {
  const required = ['PGHOST', 'PGPORT', 'PGDATABASE', 'PGUSER', 'PGPASSWORD'];
  const missing = required.filter((name) => !process.env[name]);
  if (missing.length > 0) {
    throw new Error(`Не заданы параметры базы: ${missing.join(', ')}.`);
  }
}

function readOptions(argv) {
  const inlineOutput = argv.find((value) => value.startsWith('--output='));
  const outputIndex = argv.indexOf('--output');
  const output = inlineOutput?.slice('--output='.length)
    ?? (outputIndex >= 0 ? argv[outputIndex + 1] : undefined)
    ?? 'apps/web/public/data/f1';
  if (output.startsWith('--')) throw new Error('Не задан путь после --output.');
  const inlineSeason = argv.find((value) => value.startsWith('--season='));
  const seasonIndex = argv.indexOf('--season');
  const rawSeason = inlineSeason?.slice('--season='.length)
    ?? (seasonIndex >= 0 ? argv[seasonIndex + 1] : undefined);
  const season = rawSeason === undefined ? null : Number(rawSeason);
  if (season !== null && (!Number.isInteger(season) || season < 1950)) {
    throw new Error(`Некорректный сезон для экспорта: ${rawSeason}.`);
  }
  return {
    outputDirectory: path.isAbsolute(output) ? output : path.resolve(repositoryRoot, output),
    season,
    checkOnly: argv.includes('--check'),
  };
}

async function writeJsonAtomic(filePath, value) {
  const temporaryPath = `${filePath}.tmp-${process.pid}`;
  await writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  await rename(temporaryPath, filePath);
}

function withoutExportMetadata(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
  const {
    exportedAt: _exportedAt,
    sourceChangedAt: _sourceChangedAt,
    ...semanticValue
  } = value;
  return semanticValue;
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]),
  );
}

function semanticJson(value) {
  return JSON.stringify(canonicalize(value));
}

async function readJsonIfPresent(filePath) {
  let existingValue = null;
  try {
    existingValue = JSON.parse(await readFile(filePath, 'utf8'));
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }
  return existingValue;
}

function timestampIsCurrent(existingTimestamp, sourceChangedAt) {
  const existingTime = Date.parse(existingTimestamp);
  const sourceTime = Date.parse(sourceChangedAt);
  return Number.isFinite(existingTime) && Number.isFinite(sourceTime) && existingTime >= sourceTime;
}

async function snapshotIsFresh(filePath, sourceChangedAt, expectedSeason) {
  const existingValue = await readJsonIfPresent(filePath);
  return existingValue?.season === expectedSeason
    && timestampIsCurrent(existingValue.sourceChangedAt, sourceChangedAt);
}

async function readEditorialPlannedSeasons(outputDirectory, databaseYears) {
  const index = await readJsonIfPresent(path.join(outputDirectory, 'seasons.json'));
  if (!Array.isArray(index?.seasons)) return [];
  const plannedSeasons = [];
  for (const season of index.seasons) {
    if (season?.status !== 'planned' || databaseYears.has(Number(season.year))) continue;
    const snapshot = await readJsonIfPresent(path.join(outputDirectory, `season-${season.year}.json`));
    if (snapshot?.season !== season.year || !Array.isArray(snapshot.calendar)) continue;
    plannedSeasons.push({
      year: Number(season.year),
      status: 'planned',
      roundsPlanned: Number(season.roundsPlanned ?? snapshot.calendar.length),
      racesAvailable: Number(season.racesAvailable ?? 0),
    });
  }
  return plannedSeasons;
}

async function publishJsonIfChanged(
  filePath,
  semanticValue,
  exportedAt,
  sourceChangedAt,
  checkOnly,
) {
  const existingValue = await readJsonIfPresent(filePath);

  const unchanged = existingValue !== null
    && semanticJson(withoutExportMetadata(existingValue)) === semanticJson(semanticValue)
    && timestampIsCurrent(existingValue.sourceChangedAt, sourceChangedAt);
  if (unchanged) return false;
  if (!checkOnly) {
    await writeJsonAtomic(filePath, { exportedAt, sourceChangedAt, ...semanticValue });
  }
  return true;
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
         d.nationality,
         latest_team.constructor_id,
         latest_team.display_name AS constructor_name,
         latest_team.team_colour,
         latest_team.logo_image_url
       FROM atlas.driver_standings AS ds
       JOIN final_round AS fr ON ds.after_round = fr.value
       JOIN atlas.drivers AS d ON d.id = ds.driver_id
       LEFT JOIN LATERAL (
         SELECT ce.constructor_id, ce.display_name, ce.team_colour, ce.logo_image_url
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
         ce.logo_image_url,
         ce.car_model,
         ce.car_image_url
       FROM atlas.constructor_standings AS cs
       JOIN final_round AS fr ON cs.after_round = fr.value
       JOIN atlas.constructor_entries AS ce ON ce.id = cs.constructor_entry_id
       WHERE cs.season_year = $1
       ORDER BY cs.position`,
      [season],
    );
  const sessionResult = await client.query(
    `SELECT
       r.round,
       s.session_type,
       sr.position_order,
       sr.position_text,
       sr.points,
       sr.laps,
       sr.status,
       sr.elapsed_ms,
       sr.gap_ms,
       sr.gap_text,
       sr.fastest_lap_rank,
       sr.fastest_lap_number,
       sr.fastest_lap_ms,
       sr.details,
       d.id AS driver_id,
       d.given_name,
       d.family_name,
       d.abbreviation,
       d.nationality,
       ce.constructor_id,
       ce.display_name AS constructor_name,
       ce.team_colour,
       ce.logo_image_url
     FROM atlas.session_results AS sr
     JOIN atlas.sessions AS s ON s.id = sr.session_id
     JOIN atlas.races AS r ON r.id = s.race_id
     JOIN atlas.drivers AS d ON d.id = sr.driver_id
     LEFT JOIN atlas.constructor_entries AS ce ON ce.id = sr.constructor_entry_id
     WHERE r.season_year = $1
       AND s.session_type IN ('race', 'qualifying', 'sprint_shootout', 'sprint')
     ORDER BY r.round, s.session_type, sr.position_order`,
    [season],
  );

  const resultsByType = {
    race: {},
    qualifying: {},
    sprint_shootout: {},
    sprint: {},
  };
  for (const row of sessionResult.rows) {
    const round = String(row.round);
    const resultGroup = resultsByType[row.session_type];
    resultGroup[round] ??= [];
    resultGroup[round].push({
      position: Number(row.position_order),
      positionText: row.position_text,
      driverId: row.driver_id,
      givenName: row.given_name,
      familyName: row.family_name,
      code: row.abbreviation?.trim() ?? null,
      countryCode: nationalityCountryCode(row.nationality),
      constructorId: row.constructor_id,
      constructorName: row.constructor_name,
      teamColor: row.team_colour,
      teamLogoUrl: row.logo_image_url,
      points: asNumber(row.points) ?? 0,
      laps: row.laps === null ? null : Number(row.laps),
      status: row.status,
      elapsedMs: asNumber(row.elapsed_ms),
      gapMs: asNumber(row.gap_ms),
      gapText: row.gap_text,
      fastestLapRank: row.fastest_lap_rank === null ? null : Number(row.fastest_lap_rank),
      fastestLapNumber: row.fastest_lap_number === null ? null : Number(row.fastest_lap_number),
      fastestLapMs: row.fastest_lap_ms === null ? null : Number(row.fastest_lap_ms),
      details: row.details ?? {},
    });
  }
  for (const sessionType of ['race', 'sprint']) {
    for (const results of Object.values(resultsByType[sessionType])) {
      const winner = results.find((result) => result.position === 1);
      if (winner?.elapsedMs === null || winner?.elapsedMs === undefined) continue;
      for (const result of results) {
        if (result.position > 1 && result.gapMs === null && result.elapsedMs !== null) {
          result.gapMs = Math.max(0, result.elapsedMs - winner.elapsedMs);
        }
      }
    }
  }

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
        countryCode: nationalityCountryCode(row.nationality),
        points: asNumber(row.points) ?? 0,
        wins: Number(row.wins),
        constructorId: row.constructor_id,
        constructorName: row.constructor_name,
        teamColor: row.team_colour,
        teamLogoUrl: row.logo_image_url,
      })),
      constructors: constructorResult.rows.map((row) => ({
        position: Number(row.position),
        constructorId: row.constructor_id,
        name: row.display_name,
        engineName: row.engine_name,
        points: asNumber(row.points) ?? 0,
        wins: Number(row.wins),
        teamColor: row.team_colour,
        logoImageUrl: row.logo_image_url,
        carModel: row.car_model,
        carImageUrl: row.car_image_url,
      })),
    },
    raceResults: resultsByType.race,
    qualifyingResults: resultsByType.qualifying,
    sprintQualifyingResults: resultsByType.sprint_shootout,
    sprintResults: resultsByType.sprint,
  };
}

async function main() {
  assertDatabaseEnvironment();
  const { outputDirectory, season: requestedSeason, checkOnly } = readOptions(process.argv.slice(2));
  const client = new Client({ application_name: 'f1-geovisual-atlas-web-exporter' });
  await client.connect();

  try {
    const seasonsResult = await client.query(
      `SELECT
         s.year,
         s.status,
         s.rounds_planned,
         count(r.id)::integer AS races_available,
         f.changed_at
       FROM atlas.seasons AS s
       LEFT JOIN atlas.races AS r ON r.season_year = s.year
       JOIN atlas.web_export_freshness AS f ON f.season_year = s.year
       GROUP BY s.year, s.status, s.rounds_planned, f.changed_at
       ORDER BY s.year DESC`,
    );

    await mkdir(outputDirectory, { recursive: true });
    const exportedAt = new Date().toISOString();
    let changedFiles = 0;
    const seasonRows = seasonsResult.rows.map((row) => ({
      year: Number(row.year),
      status: row.status,
      roundsPlanned: row.rounds_planned === null ? null : Number(row.rounds_planned),
      racesAvailable: Number(row.races_available),
      sourceChangedAt: new Date(row.changed_at).toISOString(),
    }));
    const databaseYears = new Set(seasonRows.map((season) => season.year));
    const editorialPlannedSeasons = await readEditorialPlannedSeasons(outputDirectory, databaseYears);
    const seasons = [
      ...editorialPlannedSeasons,
      ...seasonRows.map(({ sourceChangedAt: _sourceChangedAt, ...season }) => season),
    ].sort((left, right) => right.year - left.year);
    const seasonsToExport = requestedSeason === null
      ? seasonRows
      : seasonRows.filter((season) => season.year === requestedSeason);
    if (seasonsToExport.length === 0) {
      throw new Error(`Сезон ${requestedSeason} отсутствует в PostgreSQL.`);
    }

    let skippedSeasons = 0;
    for (const [index, season] of seasonsToExport.entries()) {
      const filePath = path.join(outputDirectory, `season-${season.year}.json`);
      if (await snapshotIsFresh(filePath, season.sourceChangedAt, season.year)) {
        skippedSeasons += 1;
        process.stdout.write(`\rЭкспорт сезонов: ${index + 1}/${seasonsToExport.length}`);
        continue;
      }
      const snapshot = await readSeasonSnapshot(client, season.year);
      if (await publishJsonIfChanged(
        filePath,
        snapshot,
        exportedAt,
        season.sourceChangedAt,
        checkOnly,
      )) changedFiles += 1;
      process.stdout.write(`\rЭкспорт сезонов: ${index + 1}/${seasonsToExport.length}`);
    }

    const indexSourceChangedAt = seasonRows.reduce(
      (latest, season) => season.sourceChangedAt > latest ? season.sourceChangedAt : latest,
      '1970-01-01T00:00:00.000Z',
    );
    if (await publishJsonIfChanged(path.join(outputDirectory, 'seasons.json'), {
      seasons,
    }, exportedAt, indexSourceChangedAt, checkOnly)) changedFiles += 1;
    process.stdout.write('\n');
    console.log(checkOnly
      ? `Проверка веб-снимков: ${changedFiles === 0 ? 'актуальны' : `устарело ${changedFiles} файлов`}`
      : `Веб-снимки обновлены: ${changedFiles}; пропущено актуальных сезонов: ${skippedSeasons}`);
    if (checkOnly && changedFiles > 0) process.exitCode = 1;
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(`\nОшибка: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
