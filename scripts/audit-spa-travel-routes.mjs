#!/usr/bin/env node

import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const { Client } = pg;
const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const reportPath = path.join(repositoryRoot, 'data', 'review', 'spa-travel-route-audit.json');
const client = new Client({ application_name: 'f1-geovisual-atlas-spa-route-audit' });

await client.connect();
try {
  const routesResult = await client.query(`
    WITH layout AS (
      SELECT ST_Force2D(centerline) AS centerline
      FROM atlas.track_layouts
      WHERE circuit_id = 'spa' AND review_status IN ('reviewed', 'published')
      ORDER BY (review_status = 'published') DESC,
               valid_to_year DESC NULLS FIRST, id
      LIMIT 1
    )
    SELECT
      route.id,
      route.name_ru,
      route.route_type,
      route.review_status,
      route.distance_m,
      presentation.route_group,
      presentation.line_offset_px,
      presentation.min_zoom,
      presentation.max_zoom,
      round(ST_Distance(
        ST_EndPoint(route.geometry::geometry)::geography,
        layout.centerline::geography
      ))::integer AS endpoint_distance_to_track_m,
      round(ST_Length(ST_Intersection(
        ST_LineSubstring(route.geometry::geometry, 0.02, 0.98),
        ST_Buffer(layout.centerline::geography, 20)::geometry
      )::geography))::integer AS track_buffer_overlap_m
    FROM atlas.travel_routes AS route
    LEFT JOIN atlas.travel_route_presentations AS presentation
      ON presentation.route_id = route.id
    CROSS JOIN layout
    WHERE route.circuit_id = 'spa'
      AND route.review_status IN ('candidate', 'reviewed', 'published')
    ORDER BY route.id
  `);

  const overlapsResult = await client.query(`
    SELECT
      first_route.id AS first_route_id,
      second_route.id AS second_route_id,
      round(ST_Length(ST_Intersection(
        first_route.geometry::geometry,
        ST_Buffer(second_route.geometry, 8)::geometry
      )::geography))::integer AS nearby_overlap_m,
      first_presentation.route_group,
      first_presentation.line_offset_px AS first_offset_px,
      second_presentation.line_offset_px AS second_offset_px
    FROM atlas.travel_routes AS first_route
    JOIN atlas.travel_routes AS second_route ON first_route.id < second_route.id
    LEFT JOIN atlas.travel_route_presentations AS first_presentation
      ON first_presentation.route_id = first_route.id
    LEFT JOIN atlas.travel_route_presentations AS second_presentation
      ON second_presentation.route_id = second_route.id
    WHERE first_route.circuit_id = 'spa'
      AND second_route.circuit_id = 'spa'
      AND first_route.review_status IN ('candidate', 'reviewed', 'published')
      AND second_route.review_status IN ('candidate', 'reviewed', 'published')
      AND ST_DWithin(first_route.geometry, second_route.geometry, 8)
    ORDER BY nearby_overlap_m DESC, first_route.id, second_route.id
  `);

  const routes = routesResult.rows.map((route) => ({
    ...route,
    line_offset_px: route.line_offset_px === null ? null : Number(route.line_offset_px),
    min_zoom: route.min_zoom === null ? null : Number(route.min_zoom),
    max_zoom: route.max_zoom === null ? null : Number(route.max_zoom),
  }));
  const overlaps = overlapsResult.rows.filter((item) => item.nearby_overlap_m > 100).map((item) => ({
    ...item,
    first_offset_px: item.first_offset_px === null ? null : Number(item.first_offset_px),
    second_offset_px: item.second_offset_px === null ? null : Number(item.second_offset_px),
  }));
  const errors = [];
  for (const route of routes) {
    if (!route.route_group) errors.push(`${route.id}: отсутствуют настройки отображения`);
    if (route.track_buffer_overlap_m > 0) {
      errors.push(`${route.id}: центральная часть пересекает буфер трассы на ${route.track_buffer_overlap_m} м`);
    }
  }
  for (const overlap of overlaps) {
    if (overlap.first_offset_px === overlap.second_offset_px) {
      errors.push(`${overlap.first_route_id} и ${overlap.second_route_id}: общий участок без разведения линий`);
    }
  }

  const report = {
    generatedAt: new Date().toISOString(),
    circuitId: 'spa',
    routeCount: routes.length,
    routes,
    overlappingPairsOver100m: overlaps,
    errors,
  };
  await mkdir(path.dirname(reportPath), { recursive: true });
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({
    routeCount: routes.length,
    overlappingPairsOver100m: overlaps.length,
    errors: errors.length,
    reportPath: path.relative(repositoryRoot, reportPath),
  }, null, 2));
  if (errors.length > 0) process.exitCode = 1;
} finally {
  await client.end();
}
