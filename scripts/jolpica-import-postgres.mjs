#!/usr/bin/env node

import pg from "pg";
import { loadSeasonData, readSeason } from "./jolpica-preview.mjs";

const { Client } = pg;

const COUNTRY_CODES = new Map([
  ["Argentina", "AR"], ["Australia", "AU"], ["Austria", "AT"],
  ["Azerbaijan", "AZ"], ["Bahrain", "BH"], ["Belgium", "BE"],
  ["Brazil", "BR"], ["Canada", "CA"], ["China", "CN"],
  ["France", "FR"], ["Germany", "DE"], ["Hungary", "HU"],
  ["India", "IN"], ["Italy", "IT"], ["Japan", "JP"],
  ["Korea", "KR"], ["Malaysia", "MY"], ["Mexico", "MX"],
  ["Monaco", "MC"], ["Morocco", "MA"], ["Netherlands", "NL"],
  ["Portugal", "PT"], ["Qatar", "QA"], ["Russia", "RU"],
  ["Saudi Arabia", "SA"], ["Singapore", "SG"], ["South Africa", "ZA"],
  ["Spain", "ES"], ["Sweden", "SE"], ["Switzerland", "CH"],
  ["Turkey", "TR"], ["UAE", "AE"], ["UK", "GB"], ["USA", "US"],
  ["United States", "US"], ["United Arab Emirates", "AE"],
]);

function numberOrNull(value) {
  if (value === undefined || value === null || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function raceId(season, round) {
  return `${season}-${String(round).padStart(2, "0")}`;
}

function sessionId(season, round, type) {
  return `${raceId(season, round)}-${type}`;
}

function findCountryCode(country) {
  const code = COUNTRY_CODES.get(country);
  if (!code) {
    throw new Error(`Неизвестная страна трассы: ${country}`);
  }
  return code;
}

function assertApplyFlag(argv) {
  if (!argv.includes("--apply")) {
    throw new Error(
      "Запись отключена. После проверки запустите команду повторно с флагом --apply.",
    );
  }
}

function assertDatabaseEnvironment() {
  const required = ["PGHOST", "PGPORT", "PGDATABASE", "PGUSER", "PGPASSWORD"];
  const missing = required.filter((name) => !process.env[name]);
  if (missing.length > 0) {
    throw new Error(
      `Не заданы параметры базы: ${missing.join(", ")}. Используйте .env.database.local.`,
    );
  }
}

async function upsertExternalId(client, entityType, entityId, externalId = entityId) {
  await client.query(
    `INSERT INTO atlas.external_identifiers
       (provider, entity_type, entity_id, external_id)
     VALUES ('jolpica', $1, $2, $3)
     ON CONFLICT (provider, entity_type, external_id)
     DO UPDATE SET entity_id = EXCLUDED.entity_id`,
    [entityType, entityId, externalId],
  );
}

async function importCatalogs(client, season, data) {
  for (const driver of data.drivers) {
    await client.query(
      `INSERT INTO atlas.drivers
         (id, given_name, family_name, abbreviation, permanent_number,
          date_of_birth, nationality, source_id, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'jolpica', now())
       ON CONFLICT (id) DO UPDATE SET
         given_name = EXCLUDED.given_name,
         family_name = EXCLUDED.family_name,
         abbreviation = COALESCE(EXCLUDED.abbreviation, atlas.drivers.abbreviation),
         permanent_number = COALESCE(EXCLUDED.permanent_number, atlas.drivers.permanent_number),
         date_of_birth = COALESCE(EXCLUDED.date_of_birth, atlas.drivers.date_of_birth),
         nationality = COALESCE(EXCLUDED.nationality, atlas.drivers.nationality),
         source_id = EXCLUDED.source_id,
         updated_at = now()`,
      [
        driver.driverId,
        driver.givenName,
        driver.familyName,
        driver.code || null,
        numberOrNull(driver.permanentNumber),
        driver.dateOfBirth || null,
        driver.nationality || null,
      ],
    );
    await upsertExternalId(client, "driver", driver.driverId);
  }

  const entryIds = new Map();
  for (const constructor of data.constructors) {
    await client.query(
      `INSERT INTO atlas.constructors
         (id, name, nationality, source_id, updated_at)
       VALUES ($1, $2, $3, 'jolpica', now())
       ON CONFLICT (id) DO UPDATE SET
         name = EXCLUDED.name,
         nationality = COALESCE(EXCLUDED.nationality, atlas.constructors.nationality),
         source_id = EXCLUDED.source_id,
         updated_at = now()`,
      [constructor.constructorId, constructor.name, constructor.nationality || null],
    );
    await upsertExternalId(client, "constructor", constructor.constructorId);

    const entryResult = await client.query(
      `INSERT INTO atlas.constructor_entries
         (season_year, constructor_id, display_name)
       VALUES ($1, $2, $3)
       ON CONFLICT (season_year, constructor_id) DO UPDATE SET
         display_name = EXCLUDED.display_name
       RETURNING id`,
      [season, constructor.constructorId, constructor.name],
    );
    entryIds.set(constructor.constructorId, entryResult.rows[0].id);
  }

  return entryIds;
}

async function importSchedule(client, season, data) {
  const resultRounds = new Set(data.results.map((race) => Number(race.round)));

  for (const race of data.schedule) {
    const circuit = race.Circuit;
    const location = circuit.Location;
    const longitude = Number(location.long);
    const latitude = Number(location.lat);
    if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) {
      throw new Error(`Некорректные координаты трассы ${circuit.circuitId}.`);
    }

    await client.query(
      `INSERT INTO atlas.circuits
         (id, name, locality, country_code, location, source_id, updated_at)
       VALUES (
         $1, $2, $3, $4,
         ST_SetSRID(ST_MakePoint($5, $6), 4326)::geography,
         'jolpica', now()
       )
       ON CONFLICT (id) DO UPDATE SET
         name = EXCLUDED.name,
         locality = EXCLUDED.locality,
         country_code = EXCLUDED.country_code,
         location = EXCLUDED.location,
         source_id = EXCLUDED.source_id,
         updated_at = now()`,
      [
        circuit.circuitId,
        circuit.circuitName,
        location.locality || null,
        findCountryCode(location.country),
        longitude,
        latitude,
      ],
    );
    await upsertExternalId(client, "circuit", circuit.circuitId);

    const round = Number(race.round);
    const status = resultRounds.has(round) ? "completed" : "scheduled";
    const startTime = race.time ? race.time.replace(/Z$/, "") : null;
    await client.query(
      `INSERT INTO atlas.races
         (id, season_year, round, circuit_id, name, race_date,
          start_time_utc, status, source_id, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'jolpica', now())
       ON CONFLICT (id) DO UPDATE SET
         circuit_id = EXCLUDED.circuit_id,
         name = EXCLUDED.name,
         race_date = EXCLUDED.race_date,
         start_time_utc = EXCLUDED.start_time_utc,
         status = EXCLUDED.status,
         source_id = EXCLUDED.source_id,
         updated_at = now()`,
      [
        raceId(season, round),
        season,
        round,
        circuit.circuitId,
        race.raceName,
        race.date || null,
        startTime,
        status,
      ],
    );
  }
}

function sessionRows(race, childName) {
  return Array.isArray(race[childName]) ? race[childName] : [];
}

async function importSessions(client, season, races, type, childName, entryIds) {
  for (const race of races) {
    const round = Number(race.round);
    const currentSessionId = sessionId(season, round, type);
    const rows = sessionRows(race, childName);
    const scheduleField =
      type === "race" ? null : type === "sprint" ? race.Sprint : race.Qualifying;
    const startsAt = scheduleField?.date
      ? `${scheduleField.date}T${scheduleField.time ?? "00:00:00Z"}`
      : type === "race" && race.date
        ? `${race.date}T${race.time ?? "00:00:00Z"}`
        : null;

    await client.query(
      `INSERT INTO atlas.sessions
         (id, race_id, session_type, name, starts_at, status, source_id, updated_at)
       VALUES ($1, $2, $3, $4, $5, 'completed', 'jolpica', now())
       ON CONFLICT (id) DO UPDATE SET
         name = EXCLUDED.name,
         starts_at = COALESCE(EXCLUDED.starts_at, atlas.sessions.starts_at),
         status = EXCLUDED.status,
         source_id = EXCLUDED.source_id,
         updated_at = now()`,
      [
        currentSessionId,
        raceId(season, round),
        type,
        type === "race" ? "Гонка" : type === "sprint" ? "Спринт" : "Квалификация",
        startsAt,
      ],
    );

    await client.query("DELETE FROM atlas.session_results WHERE session_id = $1", [
      currentSessionId,
    ]);

    const winnerMillis = numberOrNull(rows[0]?.Time?.millis);
    for (const row of rows) {
      const position = numberOrNull(row.position);
      if (!position || !row.Driver?.driverId) continue;
      const totalMillis = numberOrNull(row.Time?.millis);
      const gapMillis =
        position > 1 && totalMillis !== null && winnerMillis !== null
          ? totalMillis - winnerMillis
          : null;
      const details =
        type === "qualifying"
          ? { q1: row.Q1 ?? null, q2: row.Q2 ?? null, q3: row.Q3 ?? null }
          : {};

      await client.query(
        `INSERT INTO atlas.session_results
           (session_id, position_order, position_text, driver_id,
            constructor_entry_id, grid_position, laps, status, points,
            elapsed_ms, gap_ms, gap_text, fastest_lap_rank,
            fastest_lap_number, fastest_lap_ms, details, source_id)
         VALUES (
           $1, $2, $3, $4, $5, $6, $7, $8, $9,
           $10, $11, $12, $13, $14, $15, $16::jsonb, 'jolpica'
         )`,
        [
          currentSessionId,
          position,
          row.positionText || String(position),
          row.Driver.driverId,
          entryIds.get(row.Constructor?.constructorId) ?? null,
          numberOrNull(row.grid),
          numberOrNull(row.laps),
          row.status || null,
          numberOrNull(row.points) ?? 0,
          type === "qualifying" ? null : totalMillis,
          gapMillis,
          position > 1 ? row.Time?.time ?? null : null,
          numberOrNull(row.FastestLap?.rank),
          numberOrNull(row.FastestLap?.lap),
          numberOrNull(row.FastestLap?.Time?.millis),
          JSON.stringify(details),
        ],
      );
    }
  }
}

async function importStandings(client, season, data, entryIds) {
  const afterRound = data.results.reduce(
    (maximum, race) => Math.max(maximum, Number(race.round)),
    0,
  );

  await client.query(
    "DELETE FROM atlas.driver_standings WHERE season_year = $1 AND after_round = $2",
    [season, afterRound],
  );
  for (const row of data.driverStandings) {
    const position = numberOrNull(row.position);
    if (!position || !row.Driver?.driverId) continue;
    await client.query(
      `INSERT INTO atlas.driver_standings
         (season_year, after_round, position, driver_id, points, wins)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        season,
        afterRound,
        position,
        row.Driver.driverId,
        numberOrNull(row.points) ?? 0,
        numberOrNull(row.wins) ?? 0,
      ],
    );
  }

  await client.query(
    "DELETE FROM atlas.constructor_standings WHERE season_year = $1 AND after_round = $2",
    [season, afterRound],
  );
  for (const row of data.constructorStandings) {
    const position = numberOrNull(row.position);
    const entryId = entryIds.get(row.Constructor?.constructorId);
    if (!position || !entryId) continue;
    await client.query(
      `INSERT INTO atlas.constructor_standings
         (season_year, after_round, position, constructor_entry_id, points, wins)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        season,
        afterRound,
        position,
        entryId,
        numberOrNull(row.points) ?? 0,
        numberOrNull(row.wins) ?? 0,
      ],
    );
  }
}

async function importSeason(client, season, data) {
  await client.query("BEGIN");
  try {
    await client.query(
      `INSERT INTO atlas.data_sources (id, name, url, licence, retrieved_at)
       VALUES ('jolpica', 'Jolpica F1', 'https://api.jolpi.ca/ergast/f1/',
               'Jolpica Terms of Use', now())
       ON CONFLICT (id) DO UPDATE SET retrieved_at = now()`,
    );

    const currentYear = new Date().getUTCFullYear();
    const seasonStatus = season < currentYear ? "completed" : season === currentYear ? "active" : "planned";
    await client.query(
      `INSERT INTO atlas.seasons
         (year, status, rounds_planned, source_id, updated_at)
       VALUES ($1, $2, $3, 'jolpica', now())
       ON CONFLICT (year) DO UPDATE SET
         status = EXCLUDED.status,
         rounds_planned = EXCLUDED.rounds_planned,
         source_id = EXCLUDED.source_id,
         updated_at = now()`,
      [season, seasonStatus, data.schedule.length],
    );

    const entryIds = await importCatalogs(client, season, data);
    await importSchedule(client, season, data);
    await importSessions(client, season, data.results, "race", "Results", entryIds);
    await importSessions(
      client,
      season,
      data.qualifying,
      "qualifying",
      "QualifyingResults",
      entryIds,
    );
    await importSessions(client, season, data.sprints, "sprint", "SprintResults", entryIds);
    await importStandings(client, season, data, entryIds);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}

try {
  const argv = process.argv.slice(2);
  const season = readSeason(argv);
  assertApplyFlag(argv);
  assertDatabaseEnvironment();

  const client = new Client({ application_name: "f1-geovisual-atlas-importer" });
  await client.connect();
  try {
    const schemaCheck = await client.query(
      "SELECT to_regclass('atlas.seasons') AS seasons_table",
    );
    if (!schemaCheck.rows[0]?.seasons_table) {
      throw new Error("Схема atlas не найдена. Сначала примените миграцию 001.");
    }

    console.log(`Получение и проверка сезона ${season}...`);
    const { data, report } = await loadSeasonData(season);
    if (report.warnings.length > 0) {
      throw new Error(`Импорт остановлен: ${report.warnings.join(" ")}`);
    }

    await importSeason(client, season, data);
    console.log(`Сезон ${season} успешно записан в PostgreSQL одной транзакцией.`);
    console.log(JSON.stringify(report.counts, null, 2));
  } finally {
    await client.end();
  }
} catch (error) {
  console.error(`\nОшибка: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}
