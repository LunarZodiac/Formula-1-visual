#!/usr/bin/env node

import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import pg from 'pg';

const requiredEnvironment = ['PGHOST', 'PGPORT', 'PGDATABASE', 'PGUSER', 'PGPASSWORD'];
const missingEnvironment = requiredEnvironment.filter(name => !process.env[name]);
if (missingEnvironment.length) throw new Error(`Не заданы параметры базы: ${missingEnvironment.join(', ')}`);

const client = new pg.Client({ application_name: 'f1-geovisual-atlas-travel-coverage-audit' });
await client.connect();

try {
  const result = await client.query(`
    SELECT circuit.id,
      coalesce(profile.name_ru,circuit.short_name,circuit.name) AS name,
      count(DISTINCT link.poi_id)::int AS total,
      count(DISTINCT link.poi_id) FILTER (WHERE link.role='transport')::int AS transport,
      count(DISTINCT link.poi_id) FILTER (WHERE link.role='stay')::int AS stay,
      count(DISTINCT link.poi_id) FILTER (WHERE link.role='explore')::int AS explore,
      count(DISTINCT link.poi_id) FILTER (WHERE link.role='essential')::int AS essential,
      count(DISTINCT link.poi_id) FILTER (WHERE link.role='circuit')::int AS circuit_points,
      count(DISTINCT link.poi_id) FILTER (WHERE poi.review_status='candidate')::int AS candidate,
      count(DISTINCT link.poi_id) FILTER (WHERE poi.review_status='reviewed')::int AS reviewed,
      count(DISTINCT link.poi_id) FILTER (WHERE poi.review_status='published')::int AS published,
      count(DISTINCT link.poi_id) FILTER (WHERE poi.review_status='hidden')::int AS hidden,
      count(DISTINCT link.poi_id) FILTER (WHERE link.poi_id IS NOT NULL AND link.distance_to_circuit_m IS NULL)::int AS missing_stored_distance,
      count(DISTINCT link.poi_id) FILTER (WHERE link.distance_to_circuit_m<0)::int AS invalid_distance,
      coalesce(latest.failed_groups,ARRAY[]::text[]) AS latest_failed_groups,
      latest.applied_at AS latest_import_at
    FROM atlas.circuits AS circuit
    LEFT JOIN atlas.circuit_page_profiles AS profile ON profile.circuit_id=circuit.id
    LEFT JOIN atlas.circuit_travel_pois AS link ON link.circuit_id=circuit.id
    LEFT JOIN atlas.tourism_pois AS poi ON poi.id=link.poi_id
    LEFT JOIN LATERAL (
      SELECT run.failed_groups,run.applied_at
      FROM atlas.travel_import_runs AS run
      WHERE run.circuit_id=circuit.id AND run.provider='openstreetmap' AND run.status='imported'
      ORDER BY run.applied_at DESC NULLS LAST,run.created_at DESC LIMIT 1
    ) AS latest ON true
    GROUP BY circuit.id,profile.name_ru,latest.failed_groups,latest.applied_at
    ORDER BY circuit.id`);

  const rows = result.rows.map(row => {
    const groups = { transport:Number(row.transport),stay:Number(row.stay),explore:Number(row.explore),essential:Number(row.essential) };
    const missingGroups = Object.entries(groups).filter(([,count]) => count === 0).map(([name]) => name);
    const lowGroups = Object.entries(groups).filter(([,count]) => count > 0 && count < 3).map(([name]) => name);
    return { id:String(row.id),name:String(row.name),total:Number(row.total),groups,circuitPoints:Number(row.circuit_points),
      statuses:{candidate:Number(row.candidate),reviewed:Number(row.reviewed),published:Number(row.published),hidden:Number(row.hidden)},
      missingStoredDistance:Number(row.missing_stored_distance),invalidDistance:Number(row.invalid_distance),latestFailedGroups:row.latest_failed_groups ?? [],latestImportAt:row.latest_import_at,
      missingGroups,lowGroups,needsRetry:missingGroups.length>0||lowGroups.length>0 };
  });
  const report = { generatedAt:new Date().toISOString(),summary:{circuits:rows.length,withPoints:rows.filter(row=>row.total>0).length,
    nearTarget:rows.filter(row=>row.total>=70).length,empty:rows.filter(row=>row.total===0).length,needsRetry:rows.filter(row=>row.needsRetry).length,
    missingStoredDistances:rows.reduce((sum,row)=>sum+row.missingStoredDistance,0),invalidDistances:rows.reduce((sum,row)=>sum+row.invalidDistance,0),published:rows.reduce((sum,row)=>sum+row.statuses.published,0)},circuits:rows };
  const outputPath = path.resolve(import.meta.dirname,'..','data','review','travel-coverage-audit.json');
  await mkdir(path.dirname(outputPath),{recursive:true});
  await writeFile(outputPath,`${JSON.stringify(report,null,2)}\n`,'utf8');
  console.log(JSON.stringify(report.summary,null,2));
  console.log(`Отчёт: ${outputPath}`);
} finally {
  await client.end();
}
