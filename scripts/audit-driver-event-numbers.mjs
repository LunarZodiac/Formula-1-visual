#!/usr/bin/env node

import { mkdir, rename, writeFile } from 'node:fs/promises';
import pg from 'pg';

const required = ['PGHOST', 'PGPORT', 'PGDATABASE', 'PGUSER', 'PGPASSWORD'];
const missing = required.filter((name) => !process.env[name]);
if (missing.length) throw new Error(`Не заданы параметры базы: ${missing.join(', ')}`);

const client = new pg.Client({ application_name: 'f1-atlas-driver-event-number-audit' });
await client.connect();
try {
  const summaryResult = await client.query(`
    WITH expected AS (
      SELECT DISTINCT session.race_id, result.driver_id
      FROM atlas.session_results AS result
      JOIN atlas.sessions AS session ON session.id = result.session_id
      WHERE session.session_type = 'race'
    ), coverage AS (
      SELECT expected.race_id, expected.driver_id,
             EXISTS (
               SELECT 1 FROM atlas.driver_event_entries AS entry
               WHERE entry.race_id = expected.race_id AND entry.driver_id = expected.driver_id
             ) AS covered
      FROM expected
    )
    SELECT
      (SELECT count(*)::integer FROM atlas.driver_event_entries) AS entries,
      (SELECT count(DISTINCT race_id)::integer FROM atlas.driver_event_entries) AS races,
      (SELECT count(DISTINCT driver_id)::integer FROM atlas.driver_event_entries) AS drivers,
      (SELECT count(DISTINCT race.season_year)::integer
         FROM atlas.driver_event_entries AS entry JOIN atlas.races AS race ON race.id = entry.race_id) AS seasons,
      (SELECT count(*)::integer FROM atlas.driver_event_entries WHERE car_number IS NULL) AS missing_numbers,
      (SELECT count(*)::integer FROM coverage WHERE NOT covered) AS missing_result_entries
  `);
  const multipleNumbersResult = await client.query(`
    SELECT history.driver_id, driver.given_name, driver.family_name,
           count(DISTINCT number)::integer AS number_count,
           array_agg(DISTINCT number ORDER BY number) AS numbers
    FROM atlas.driver_number_history AS history
    JOIN atlas.drivers AS driver ON driver.id = history.driver_id
    CROSS JOIN LATERAL unnest(history.car_numbers) AS number
    GROUP BY history.driver_id, driver.given_name, driver.family_name
    HAVING count(DISTINCT number) > 1
    ORDER BY number_count DESC, driver.family_name, driver.given_name
  `);
  const missingResultEntriesResult = await client.query(`
    SELECT session.race_id, race.season_year, race.round,
           result.driver_id, driver.given_name, driver.family_name
    FROM atlas.session_results AS result
    JOIN atlas.sessions AS session ON session.id = result.session_id AND session.session_type = 'race'
    JOIN atlas.races AS race ON race.id = session.race_id
    JOIN atlas.drivers AS driver ON driver.id = result.driver_id
    WHERE NOT EXISTS (
      SELECT 1 FROM atlas.driver_event_entries AS entry
      WHERE entry.race_id = session.race_id AND entry.driver_id = result.driver_id
    )
    ORDER BY race.season_year, race.round, result.position_order
  `);
  const seasonChangesResult = await client.query(`
    SELECT history.driver_id, driver.given_name, driver.family_name,
           history.season_year, history.car_numbers
    FROM atlas.driver_number_history AS history
    JOIN atlas.drivers AS driver ON driver.id = history.driver_id
    WHERE cardinality(history.car_numbers) > 1
    ORDER BY history.season_year, driver.family_name, driver.given_name
  `);
  const numberOneResult = await client.query(`
    SELECT entry.driver_id, driver.given_name, driver.family_name,
           min(race.season_year)::integer AS first_season,
           max(race.season_year)::integer AS last_season,
           count(DISTINCT entry.race_id)::integer AS event_count
    FROM atlas.driver_event_entries AS entry
    JOIN atlas.drivers AS driver ON driver.id = entry.driver_id
    JOIN atlas.races AS race ON race.id = entry.race_id
    WHERE entry.car_number = 1
    GROUP BY entry.driver_id, driver.given_name, driver.family_name
    ORDER BY first_season, driver.family_name, driver.given_name
  `);
  const summary = summaryResult.rows[0];
  const report = {
    generatedAt: new Date().toISOString(),
    sourceStatus: 'imported-not-manually-verified',
    coverage: {
      entries: Number(summary.entries),
      races: Number(summary.races),
      drivers: Number(summary.drivers),
      seasons: Number(summary.seasons),
      missingNumbers: Number(summary.missing_numbers),
      raceResultEntriesWithoutNumberHistory: Number(summary.missing_result_entries),
    },
    missingRaceResultEntries: missingResultEntriesResult.rows.map((row) => ({
      raceId: row.race_id,
      season: Number(row.season_year),
      round: Number(row.round),
      driverId: row.driver_id,
      nameEn: `${row.given_name} ${row.family_name}`,
    })),
    driversWithMultipleCareerNumbers: multipleNumbersResult.rows.map((row) => ({
      id: row.driver_id,
      nameEn: `${row.given_name} ${row.family_name}`,
      numbers: row.numbers.map(Number),
    })),
    driverSeasonsWithMultipleNumbers: seasonChangesResult.rows.map((row) => ({
      id: row.driver_id,
      nameEn: `${row.given_name} ${row.family_name}`,
      season: Number(row.season_year),
      numbers: row.car_numbers.map(Number),
    })),
    numberOneUsage: numberOneResult.rows.map((row) => ({
      id: row.driver_id,
      nameEn: `${row.given_name} ${row.family_name}`,
      firstSeason: Number(row.first_season),
      lastSeason: Number(row.last_season),
      eventCount: Number(row.event_count),
    })),
  };
  await mkdir('data/review', { recursive: true });
  const outputPath = 'data/review/driver-event-number-audit.json';
  const temporaryPath = `${outputPath}.tmp-${process.pid}`;
  await writeFile(temporaryPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  await rename(temporaryPath, outputPath);
  console.log(JSON.stringify({
    ...report.coverage,
    driversWithMultipleCareerNumbers: report.driversWithMultipleCareerNumbers.length,
    driverSeasonsWithMultipleNumbers: report.driverSeasonsWithMultipleNumbers.length,
    driversWhoUsedNumberOne: report.numberOneUsage.length,
  }, null, 2));
} finally {
  await client.end();
}
