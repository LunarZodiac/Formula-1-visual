import assert from 'node:assert/strict';
import test from 'node:test';
import pg from 'pg';
import { importCatalogs, importSchedule, importSessions, upsertSeason } from '../jolpica-import-postgres.mjs';

test('repeat import preserves admin session, roster and result', {
  skip: !process.env.PGHOST && 'Requires local PostgreSQL configuration',
}, async () => {
  const client = new pg.Client({ application_name: 'f1-atlas-jolpica-repeat-test' });
  await client.connect();
  try {
    await client.query('BEGIN');
    const fixture = await client.query(`
      SELECT s.id AS session_id, r.id AS race_id, r.season_year, r.round,
             r.name AS race_name, r.circuit_id, c.name AS circuit_name,
             sr.driver_id, sr.position_order, sr.points,
             ce.id AS entry_id, ce.constructor_id,
             ce.display_name, dee.car_number,
             d.given_name, co.name AS constructor_name
      FROM atlas.sessions AS s
      JOIN atlas.races AS r ON r.id = s.race_id
      JOIN atlas.circuits AS c ON c.id = r.circuit_id
      JOIN atlas.session_results AS sr ON sr.session_id = s.id AND sr.source_id = 'jolpica'
      JOIN atlas.drivers AS d ON d.id = sr.driver_id
      JOIN atlas.constructor_entries AS ce ON ce.id = sr.constructor_entry_id
      JOIN atlas.constructors AS co ON co.id = ce.constructor_id
      JOIN atlas.driver_event_entries AS dee
        ON dee.race_id = r.id AND dee.driver_id = sr.driver_id
       AND dee.source_id = 'jolpica' AND dee.review_status = 'imported'
      WHERE s.source_id = 'jolpica' AND s.session_type = 'race'
        AND r.source_id = 'jolpica'
      ORDER BY r.season_year DESC, r.round DESC
      LIMIT 1 FOR UPDATE OF s, sr, dee
    `);
    assert.equal(fixture.rowCount, 1, 'A Jolpica race fixture is required in the local database');
    const row = fixture.rows[0];
    const sourceId = 'admin-jolpica-repeat-test';
    await client.query(`
      INSERT INTO atlas.data_sources (id, name, url)
      VALUES ($1, 'Контроль повторного импорта', 'https://example.org/jolpica-repeat-test')
      ON CONFLICT (id) DO NOTHING
    `, [sourceId]);

    const input = [{
      round: String(row.round),
      date: '2026-01-01',
      Results: [{
        position: String(row.position_order),
        points: '0',
        number: String(row.car_number ?? 1),
        Driver: { driverId: row.driver_id },
        Constructor: { constructorId: row.constructor_id },
      }],
    }];
    const entryIds = new Map([[row.constructor_id, row.entry_id]]);

    await client.query('UPDATE atlas.sessions SET source_id = $2 WHERE id = $1', [row.session_id, sourceId]);
    await importSessions(client, row.season_year, input, 'race', 'Results', entryIds);
    const protectedSession = await client.query('SELECT source_id FROM atlas.sessions WHERE id = $1', [row.session_id]);
    const protectedRoster = await client.query(`
      SELECT source_id, car_number FROM atlas.driver_event_entries
      WHERE race_id = $1 AND driver_id = $2
    `, [row.race_id, row.driver_id]);
    assert.equal(protectedSession.rows[0].source_id, sourceId);
    assert.equal(protectedRoster.rows[0].source_id, 'jolpica');
    assert.equal(protectedRoster.rows[0].car_number, row.car_number);

    await client.query('UPDATE atlas.sessions SET source_id = $2 WHERE id = $1', [row.session_id, 'jolpica']);
    await client.query(`
      UPDATE atlas.session_results SET source_id = $3, points = 123.45
      WHERE session_id = $1 AND driver_id = $2
    `, [row.session_id, row.driver_id, sourceId]);
    await importSessions(client, row.season_year, input, 'race', 'Results', entryIds);
    const protectedResult = await client.query(`
      SELECT source_id, points FROM atlas.session_results
      WHERE session_id = $1 AND driver_id = $2
    `, [row.session_id, row.driver_id]);
    assert.equal(protectedResult.rows[0].source_id, sourceId);
    assert.equal(Number(protectedResult.rows[0].points), 123.45);

    for (const [table, id] of [
      ['drivers', row.driver_id], ['constructors', row.constructor_id],
      ['circuits', row.circuit_id], ['races', row.race_id],
    ]) {
      await client.query(`UPDATE atlas.${table} SET source_id = $2 WHERE id = $1`, [id, sourceId]);
    }
    await importCatalogs(client, row.season_year, {
      drivers: [{ driverId: row.driver_id, givenName: 'Incorrect', familyName: 'Incorrect' }],
      constructors: [{ constructorId: row.constructor_id, name: 'Incorrect' }],
    });
    await importSchedule(client, row.season_year, {
      schedule: [{
        round: String(row.round), season: String(row.season_year),
        raceName: 'Incorrect', date: '2026-01-01',
        Circuit: {
          circuitId: row.circuit_id, circuitName: 'Incorrect',
          Location: { lat: '0', long: '0', country: 'Australia' },
        },
      }],
      results: [],
    });
    const entities = await client.query(`
      SELECT r.name AS race_name, r.source_id AS race_source,
             c.name AS circuit_name, c.source_id AS circuit_source,
             d.given_name, d.source_id AS driver_source,
             co.name AS constructor_name, co.source_id AS constructor_source,
             ce.display_name
      FROM atlas.races AS r
      JOIN atlas.circuits AS c ON c.id = r.circuit_id
      JOIN atlas.drivers AS d ON d.id = $2
      JOIN atlas.constructor_entries AS ce
        ON ce.season_year = r.season_year AND ce.constructor_id = $3
      JOIN atlas.constructors AS co ON co.id = ce.constructor_id
      WHERE r.id = $1
    `, [row.race_id, row.driver_id, row.constructor_id]);
    assert.deepEqual(entities.rows[0], {
      race_name: row.race_name, race_source: sourceId,
      circuit_name: row.circuit_name, circuit_source: sourceId,
      given_name: row.given_name, driver_source: sourceId,
      constructor_name: row.constructor_name, constructor_source: sourceId,
      display_name: row.display_name,
    });

    await client.query(`
      UPDATE atlas.seasons SET source_id = $2, status = 'cancelled', rounds_planned = 7
      WHERE year = $1
    `, [row.season_year, sourceId]);
    await upsertSeason(client, row.season_year, 24);
    const protectedSeasonRow = await client.query(`
      SELECT source_id, status, rounds_planned FROM atlas.seasons WHERE year = $1
    `, [row.season_year]);
    assert.deepEqual(protectedSeasonRow.rows[0], {
      source_id: sourceId, status: 'cancelled', rounds_planned: 7,
    });

    await client.query('UPDATE atlas.seasons SET source_id = NULL WHERE year = $1', [row.season_year]);
    await client.query('UPDATE atlas.races SET source_id = NULL WHERE id = $1', [row.race_id]);
    await upsertSeason(client, row.season_year, 24);
    await importSchedule(client, row.season_year, {
      schedule: [{
        round: String(row.round), raceName: 'Incorrect', date: '2026-01-01',
        Circuit: {
          circuitId: row.circuit_id, circuitName: 'Incorrect',
          Location: { lat: '0', long: '0', country: 'Australia' },
        },
      }],
      results: [],
    });
    const unclassified = await client.query(`
      SELECT season.source_id AS season_source, season.status,
             season.rounds_planned, race.source_id AS race_source,
             race.name AS race_name
      FROM atlas.seasons AS season
      JOIN atlas.races AS race ON race.season_year = season.year
      WHERE season.year = $1 AND race.id = $2
    `, [row.season_year, row.race_id]);
    assert.deepEqual(unclassified.rows[0], {
      season_source: null, status: 'cancelled', rounds_planned: 7,
      race_source: null, race_name: row.race_name,
    });
  } finally {
    await client.query('ROLLBACK').catch(() => {});
    await client.end();
  }
});
