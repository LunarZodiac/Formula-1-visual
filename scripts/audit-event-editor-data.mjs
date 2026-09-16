import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, '..');
const reportPath = path.join(repositoryRoot, 'data', 'review', 'event-editor-audit.json');
const requiredDatabaseVariables = ['PGHOST', 'PGPORT', 'PGDATABASE', 'PGUSER', 'PGPASSWORD'];
const missingDatabaseVariables = requiredDatabaseVariables.filter((name) => !process.env[name]);

if (missingDatabaseVariables.length) {
  throw new Error(`Не заданы параметры PostgreSQL: ${missingDatabaseVariables.join(', ')}`);
}

const pool = new pg.Pool({
  max: 1,
  idleTimeoutMillis: 5_000,
  connectionTimeoutMillis: 3_000,
  allowExitOnIdle: true,
});

async function scalar(client, query) {
  const result = await client.query(query);
  return Number(result.rows[0]?.value ?? 0);
}

async function main() {
  const client = await pool.connect();
  try {
    const countsResult = await client.query(`
      SELECT
        (SELECT count(*) FROM atlas.races)::int AS races,
        (SELECT count(*) FROM atlas.sessions)::int AS sessions,
        (SELECT count(*) FROM atlas.session_results)::int AS results,
        (SELECT count(*) FROM atlas.races WHERE layout_id IS NOT NULL)::int AS races_with_layout
    `);
    const counts = countsResult.rows[0];

    const integrity = {
      racesWithoutCircuit: await scalar(client, `
        SELECT count(*) AS value FROM atlas.races WHERE circuit_id IS NULL
      `),
      sessionsWithoutRace: await scalar(client, `
        SELECT count(*) AS value
        FROM atlas.sessions AS session
        LEFT JOIN atlas.races AS race ON race.id = session.race_id
        WHERE race.id IS NULL
      `),
      resultsWithoutSession: await scalar(client, `
        SELECT count(*) AS value
        FROM atlas.session_results AS result
        LEFT JOIN atlas.sessions AS session ON session.id = result.session_id
        WHERE session.id IS NULL
      `),
      duplicateDriversWithinSession: await scalar(client, `
        SELECT count(*) AS value
        FROM (
          SELECT session_id, driver_id
          FROM atlas.session_results
          GROUP BY session_id, driver_id
          HAVING count(*) > 1
        ) AS duplicates
      `),
      resultsWithoutDriver: await scalar(client, `
        SELECT count(*) AS value
        FROM atlas.session_results AS result
        LEFT JOIN atlas.drivers AS driver ON driver.id = result.driver_id
        WHERE driver.id IS NULL
      `),
    };

    const emptyCompletedResult = await client.query(`
      SELECT session.session_type, count(*)::int AS count
      FROM atlas.sessions AS session
      WHERE session.status = 'completed'
        AND NOT EXISTS (
          SELECT 1 FROM atlas.session_results AS result WHERE result.session_id = session.id
        )
      GROUP BY session.session_type
      ORDER BY session.session_type
    `);

    const raceWinnerIssuesResult = await client.query(`
      SELECT session.race_id, session.id AS session_id,
        count(result.*)::int AS result_count,
        count(*) FILTER (WHERE result.position_order = 1)::int AS winner_count
      FROM atlas.sessions AS session
      LEFT JOIN atlas.session_results AS result ON result.session_id = session.id
      WHERE session.session_type = 'race'
      GROUP BY session.race_id, session.id
      HAVING count(result.*) > 0
        AND (
          count(*) FILTER (WHERE result.position_order = 1) = 0
          OR (
            count(*) FILTER (WHERE result.position_order = 1) > 1
            AND count(*) FILTER (
              WHERE result.position_order = 1
                AND COALESCE((result.details ->> 'shared_car')::boolean, false)
            ) != count(*) FILTER (WHERE result.position_order = 1)
          )
        )
      ORDER BY session.race_id
    `);

    const errors = Object.entries(integrity)
      .filter(([, count]) => count > 0)
      .map(([check, count]) => ({ check, count }));

    const report = {
      generatedAt: new Date().toISOString(),
      counts: {
        races: Number(counts.races),
        sessions: Number(counts.sessions),
        results: Number(counts.results),
      },
      coverage: {
        racesWithLayout: Number(counts.races_with_layout),
        racesWithoutLayout: Number(counts.races) - Number(counts.races_with_layout),
        completedSessionsWithoutResultsByType: Object.fromEntries(
          emptyCompletedResult.rows.map((row) => [row.session_type, Number(row.count)]),
        ),
      },
      integrity,
      raceWinnerIssues: raceWinnerIssuesResult.rows.map((row) => ({
        raceId: row.race_id,
        sessionId: row.session_id,
        resultCount: Number(row.result_count),
        winnerCount: Number(row.winner_count),
      })),
      errors,
    };

    await mkdir(path.dirname(reportPath), { recursive: true });
    await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
    console.log(JSON.stringify({
      ...report.counts,
      ...report.coverage,
      integrityErrors: errors.length,
      raceWinnerIssues: report.raceWinnerIssues.length,
      reportPath: path.relative(repositoryRoot, reportPath),
    }, null, 2));
    if (errors.length || report.raceWinnerIssues.length) process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(async (error) => {
  console.error(error instanceof Error ? error.message : String(error));
  await pool.end().catch(() => {});
  process.exitCode = 1;
});
