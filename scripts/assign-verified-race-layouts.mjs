#!/usr/bin/env node

import { mkdir, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import pg from 'pg';

const required = ['PGHOST', 'PGPORT', 'PGDATABASE', 'PGUSER', 'PGPASSWORD'];
const missing = required.filter((name) => !process.env[name]);
if (missing.length) throw new Error(`Не заданы параметры PostgreSQL: ${missing.join(', ')}`);

const apply = process.argv.includes('--apply');
const repositoryRoot = path.resolve(import.meta.dirname, '..');
const reportPath = path.join(repositoryRoot, 'data', 'review', 'race-layout-assignment-preview.json');
const client = new pg.Client({ application_name: 'f1-atlas-verified-layout-assignment' });

const eligibleQuery = `
  SELECT race.id AS race_id, race.season_year, race.round, race.circuit_id,
    layout.id AS layout_id, layout.name AS layout_name,
    count(*) OVER (PARTITION BY race.id) AS candidate_count
  FROM atlas.races AS race
  JOIN atlas.track_layouts AS layout
    ON layout.circuit_id = race.circuit_id
   AND layout.valid_from_year IS NOT NULL
   AND layout.valid_from_year <= race.season_year
   AND (layout.valid_to_year IS NULL OR layout.valid_to_year >= race.season_year)
   AND layout.centerline IS NOT NULL
   AND layout.source_id IS NOT NULL
   AND layout.provenance_type <> 'unknown'
   AND layout.review_status IN ('reviewed', 'published')
   AND layout.verified_at IS NOT NULL
  WHERE race.layout_id IS NULL
`;

const candidateQuery = `
  WITH eligible AS (${eligibleQuery})
  SELECT race_id, season_year, round, circuit_id, layout_id, layout_name, candidate_count::int
  FROM eligible
  ORDER BY season_year, round, race_id, layout_id
`;

async function main() {
  await client.connect();
  let committed = false;
  try {
    const beforeResult = await client.query(
      `SELECT count(*)::int AS total,
        count(*) FILTER (WHERE layout_id IS NOT NULL)::int AS assigned
       FROM atlas.races`,
    );
    const candidatesResult = await client.query(candidateQuery);
    const assignable = candidatesResult.rows.filter((row) => row.candidate_count === 1);
    const ambiguousRaceIds = new Set(
      candidatesResult.rows.filter((row) => row.candidate_count > 1).map((row) => row.race_id),
    );

    let updated = [];
    if (apply && assignable.length) {
      await client.query('BEGIN');
      const updateResult = await client.query(
        `WITH eligible AS (${eligibleQuery}), unique_candidates AS (
           SELECT race_id, min(layout_id) AS layout_id
           FROM eligible
           WHERE candidate_count = 1
           GROUP BY race_id
         )
         UPDATE atlas.races AS race
         SET layout_id = candidate.layout_id, updated_at = now()
         FROM unique_candidates AS candidate
         WHERE race.id = candidate.race_id AND race.layout_id IS NULL
         RETURNING race.id AS race_id, race.season_year, race.round, race.circuit_id, race.layout_id`,
      );
      updated = updateResult.rows;
      await client.query('COMMIT');
      committed = true;
    }

    const afterResult = await client.query(
      `SELECT count(*)::int AS total,
        count(*) FILTER (WHERE layout_id IS NOT NULL)::int AS assigned
       FROM atlas.races`,
    );
    const report = {
      generatedAt: new Date().toISOString(),
      mode: apply ? 'apply' : 'preview',
      rule: 'Назначается только единственная проверенная конфигурация с геометрией, источником, подтверждённым происхождением и явным началом периода',
      before: beforeResult.rows[0],
      after: afterResult.rows[0],
      assignable: assignable.map((row) => ({
        raceId: row.race_id,
        season: Number(row.season_year),
        round: Number(row.round),
        circuitId: row.circuit_id,
        layoutId: row.layout_id,
        layoutName: row.layout_name,
      })),
      ambiguousRaceIds: [...ambiguousRaceIds],
      updated: updated.map((row) => ({
        raceId: row.race_id,
        season: Number(row.season_year),
        round: Number(row.round),
        circuitId: row.circuit_id,
        layoutId: row.layout_id,
      })),
    };
    await mkdir(path.dirname(reportPath), { recursive: true });
    const temporaryPath = `${reportPath}.tmp-${process.pid}`;
    await writeFile(temporaryPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
    await rename(temporaryPath, reportPath);
    console.log(JSON.stringify({
      mode: report.mode,
      races: Number(report.after.total),
      assignedBefore: Number(report.before.assigned),
      assignable: report.assignable.length,
      ambiguous: report.ambiguousRaceIds.length,
      updated: report.updated.length,
      assignedAfter: Number(report.after.assigned),
      reportPath: path.relative(repositoryRoot, reportPath),
    }, null, 2));
  } catch (error) {
    if (apply && !committed) await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
