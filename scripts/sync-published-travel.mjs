#!/usr/bin/env node

import { spawn } from 'node:child_process';
import path from 'node:path';
import pg from 'pg';
import { parsePublicationArgs, publicationSummary } from './lib/travel-publication-plan.mjs';

const { circuitId, apply } = parsePublicationArgs(process.argv.slice(2));
const required = ['PGHOST', 'PGPORT', 'PGDATABASE', 'PGUSER', 'PGPASSWORD'];
const missing = required.filter(name => !process.env[name]);
if (missing.length) throw new Error(`Не заданы параметры базы: ${missing.join(', ')}`);

// These predicates mirror export-circuit-travel.mjs. This query only previews counts;
// the existing exporter remains responsible for producing the public GeoJSON.
const previewSql = `SELECT
  (SELECT count(*) FROM atlas.circuit_travel_pois link
    JOIN atlas.tourism_pois poi ON poi.id=link.poi_id
    JOIN atlas.poi_categories category ON category.id=poi.category_id
    WHERE link.circuit_id=$1 AND link.role<>'circuit'
      AND (link.is_featured OR (category.group_id='stay' AND EXISTS (
        SELECT 1 FROM atlas.travel_zone_pois zp JOIN atlas.travel_zones z ON z.id=zp.zone_id
        WHERE zp.poi_id=poi.id AND z.circuit_id=$1 AND z.review_status IN ('reviewed','published'))))
      AND poi.review_status IN ('reviewed','published')) AS poi,
  (SELECT count(*) FROM atlas.travel_zones zone
    WHERE zone.circuit_id=$1 AND zone.geometry IS NOT NULL
      AND zone.review_status IN ('reviewed','published')) AS zones,
  (SELECT count(*) FROM atlas.travel_routes route
    JOIN atlas.travel_route_presentations presentation ON presentation.route_id=route.id
    WHERE route.circuit_id=$1 AND route.geometry IS NOT NULL
      AND route.review_status='published' AND route.lifecycle='active') AS routes,
  (SELECT count(*) FROM atlas.circuit_travel_pois link WHERE link.circuit_id=$1 AND link.role<>'circuit')
    - (SELECT count(*) FROM atlas.circuit_travel_pois link
      JOIN atlas.tourism_pois poi ON poi.id=link.poi_id
      JOIN atlas.poi_categories category ON category.id=poi.category_id
      WHERE link.circuit_id=$1 AND link.role<>'circuit'
        AND (link.is_featured OR (category.group_id='stay' AND EXISTS (
          SELECT 1 FROM atlas.travel_zone_pois zp JOIN atlas.travel_zones z ON z.id=zp.zone_id
          WHERE zp.poi_id=poi.id AND z.circuit_id=$1 AND z.review_status IN ('reviewed','published'))))
        AND poi.review_status IN ('reviewed','published')) AS skipped_poi,
  (SELECT count(*) FROM atlas.travel_zones zone
    WHERE zone.circuit_id=$1 AND (zone.geometry IS NULL OR zone.review_status IS DISTINCT FROM 'reviewed' AND zone.review_status IS DISTINCT FROM 'published')) AS skipped_zones,
  (SELECT count(*) FROM atlas.travel_routes route
    LEFT JOIN atlas.travel_route_presentations presentation ON presentation.route_id=route.id
    WHERE route.circuit_id=$1 AND (route.geometry IS NULL OR route.review_status IS DISTINCT FROM 'published'
      OR route.lifecycle IS DISTINCT FROM 'active' OR presentation.route_id IS NULL)) AS skipped_routes`;

const client = new pg.Client();
await client.connect();
let circuits;
try {
  if (circuitId) {
    const found = await client.query('SELECT id FROM atlas.circuits WHERE id=$1', [circuitId]);
    if (!found.rowCount) throw new Error(`Трасса не найдена: ${circuitId}`);
    circuits = [circuitId];
  } else {
    circuits = (await client.query('SELECT id FROM atlas.circuits ORDER BY id')).rows.map(row => String(row.id));
  }

  console.log(apply ? 'Синхронизация опубликованных туристических данных' : 'Сухой прогон: публичные файлы не изменяются');
  for (const id of circuits) {
    const { counts, skippedNonpublished } = publicationSummary((await client.query(previewSql, [id])).rows[0]);
    console.log(`${id}: к экспорту ${counts.poi} точек, ${counts.zones} зон, ${counts.routes} опубликованных активных маршрутов; не включено в публичный слой: ${skippedNonpublished.poi} точек, ${skippedNonpublished.zones} зон, ${skippedNonpublished.routes} маршрутов`);
  }
} finally {
  await client.end();
}

if (apply) {
  const exporter = path.resolve(import.meta.dirname, 'export-circuit-travel.mjs');
  const args = [exporter, ...(circuitId ? [`--circuit=${circuitId}`] : [])];
  const exitCode = await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, { stdio: 'inherit', env: process.env });
    child.once('error', reject);
    child.once('exit', (code, signal) => signal ? reject(new Error(`Экспорт прерван сигналом ${signal}`)) : resolve(code));
  });
  if (exitCode !== 0) process.exitCode = exitCode || 1;
}
