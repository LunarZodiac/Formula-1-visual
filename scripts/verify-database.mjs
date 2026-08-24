#!/usr/bin/env node

import pg from "pg";
import { readSeason } from "./jolpica-preview.mjs";

const { Client } = pg;

function assertDatabaseEnvironment() {
  const required = ["PGHOST", "PGPORT", "PGDATABASE", "PGUSER", "PGPASSWORD"];
  const missing = required.filter((name) => !process.env[name]);
  if (missing.length > 0) {
    throw new Error(`Не заданы параметры базы: ${missing.join(", ")}.`);
  }
}

async function scalar(client, sql, values) {
  const result = await client.query(sql, values);
  return Number(result.rows[0]?.count ?? 0);
}

try {
  const season = readSeason(process.argv.slice(2));
  assertDatabaseEnvironment();
  const client = new Client({ application_name: "f1-geovisual-atlas-verifier" });
  await client.connect();

  try {
    const sessionTypesResult = await client.query(
      `SELECT s.session_type, count(*)::integer AS count
       FROM atlas.sessions AS s
       JOIN atlas.races AS r ON r.id = s.race_id
       WHERE r.season_year = $1
       GROUP BY s.session_type
       ORDER BY s.session_type`,
      [season],
    );

    const report = {
      season,
      seasons: await scalar(
        client,
        "SELECT count(*) FROM atlas.seasons WHERE year = $1",
        [season],
      ),
      races: await scalar(
        client,
        "SELECT count(*) FROM atlas.races WHERE season_year = $1",
        [season],
      ),
      circuits: await scalar(
        client,
        "SELECT count(DISTINCT circuit_id) FROM atlas.races WHERE season_year = $1",
        [season],
      ),
      sessions: Object.fromEntries(
        sessionTypesResult.rows.map((row) => [row.session_type, row.count]),
      ),
      sessionResults: await scalar(
        client,
        `SELECT count(*)
         FROM atlas.session_results AS sr
         JOIN atlas.sessions AS s ON s.id = sr.session_id
         JOIN atlas.races AS r ON r.id = s.race_id
         WHERE r.season_year = $1`,
        [season],
      ),
      driverStandingRows: await scalar(
        client,
        "SELECT count(*) FROM atlas.driver_standings WHERE season_year = $1",
        [season],
      ),
      classifiedDrivers: await scalar(
        client,
        "SELECT count(DISTINCT driver_id) FROM atlas.driver_standings WHERE season_year = $1",
        [season],
      ),
      constructorStandingRows: await scalar(
        client,
        "SELECT count(*) FROM atlas.constructor_standings WHERE season_year = $1",
        [season],
      ),
      classifiedConstructors: await scalar(
        client,
        `SELECT count(DISTINCT ce.constructor_id)
         FROM atlas.constructor_standings AS cs
         JOIN atlas.constructor_entries AS ce ON ce.id = cs.constructor_entry_id
         WHERE cs.season_year = $1`,
        [season],
      ),
      sharedPositions: await scalar(
        client,
        `SELECT count(*) FROM (
           SELECT sr.session_id, sr.position_order
           FROM atlas.session_results AS sr
           JOIN atlas.sessions AS s ON s.id = sr.session_id
           JOIN atlas.races AS r ON r.id = s.race_id
           WHERE r.season_year = $1
           GROUP BY sr.session_id, sr.position_order
           HAVING count(*) > 1
         ) AS shared`,
        [season],
      ),
      appliedMigrations: await scalar(
        client,
        "SELECT count(*) FROM public.atlas_schema_migrations",
        [],
      ),
    };

    console.log(JSON.stringify(report, null, 2));
  } finally {
    await client.end();
  }
} catch (error) {
  console.error(`\nОшибка: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}
