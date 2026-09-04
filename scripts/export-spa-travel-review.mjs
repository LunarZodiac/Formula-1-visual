#!/usr/bin/env node

import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const { Client } = pg;
const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, '..');
const required = ['PGHOST', 'PGPORT', 'PGDATABASE', 'PGUSER', 'PGPASSWORD'];
const missing = required.filter((name) => !process.env[name]);
if (missing.length) throw new Error(`Не заданы параметры базы: ${missing.join(', ')}`);

const client = new Client();
await client.connect();
try {
  const result = await client.query(`
    SELECT feature
    FROM (
      SELECT jsonb_build_object(
        'type', 'Feature',
        'geometry', ST_AsGeoJSON(poi.location::geometry)::jsonb,
        'properties', jsonb_build_object(
          'featureType', 'poi', 'id', poi.id, 'name', COALESCE(poi.name_ru, poi.name),
          'role', CASE WHEN poi.id = 'osm-way-234804574' THEN 'circuit' ELSE selected.role END,
          'category', poi.category_id,
          'priority', selected.priority, 'featured', selected.is_featured,
          'reviewStatus', poi.review_status,
          'zones', COALESCE((SELECT jsonb_agg(zone.name_ru ORDER BY link.sort_order)
            FROM atlas.travel_zone_pois link JOIN atlas.travel_zones zone ON zone.id = link.zone_id
            WHERE link.poi_id = poi.id), '[]'::jsonb)
        )
      ) AS feature
      FROM atlas.circuit_travel_recommended_pois recommended
      JOIN atlas.circuit_travel_pois selected
        ON selected.circuit_id = recommended.circuit_id AND selected.poi_id = recommended.poi_id
      JOIN atlas.tourism_pois poi ON poi.id = recommended.poi_id
      WHERE recommended.circuit_id = 'spa'

      UNION ALL

      SELECT jsonb_build_object(
        'type', 'Feature', 'geometry', ST_AsGeoJSON(zone.geometry::geometry)::jsonb,
        'properties', jsonb_build_object(
          'featureType', 'accommodation_zone', 'id', zone.id, 'name', zone.name_ru,
          'priority', zone.priority, 'bestFor', zone.best_for,
          'advantages', zone.advantages_ru, 'disadvantages', zone.disadvantages_ru,
          'reviewStatus', zone.review_status,
          'hotelCount', (SELECT count(*) FROM atlas.travel_zone_pois link WHERE link.zone_id = zone.id),
          'exampleHotels', COALESCE((SELECT jsonb_agg(COALESCE(poi.name_ru, poi.name) ORDER BY link.sort_order)
            FROM atlas.travel_zone_pois link JOIN atlas.tourism_pois poi ON poi.id = link.poi_id
            WHERE link.zone_id = zone.id AND link.is_example), '[]'::jsonb)
        )
      )
      FROM atlas.travel_zones zone
      WHERE zone.circuit_id = 'spa' AND zone.geometry IS NOT NULL

      UNION ALL

      SELECT jsonb_build_object(
        'type', 'Feature', 'geometry', ST_AsGeoJSON(route.geometry::geometry)::jsonb,
        'properties', jsonb_build_object(
          'featureType', 'route', 'id', route.id, 'name', route.name_ru,
          'routeType', route.route_type, 'travelMode', route.travel_mode,
          'distanceM', route.distance_m, 'durationMinutes', route.duration_minutes,
          'reviewStatus', route.review_status
        )
      )
      FROM atlas.travel_routes route WHERE route.circuit_id = 'spa'
    ) AS exported
    ORDER BY feature->'properties'->>'featureType', feature->'properties'->>'name'
  `);

  const outputDirectory = path.join(repositoryRoot, 'data', 'review');
  await mkdir(outputDirectory, { recursive: true });
  const reviewCollection = {
    type: 'FeatureCollection',
    name: 'spa-travel-review',
    properties: { note: 'Районы проживания не входят в лимит рекомендованных POI; гостиницы связаны с районами.' },
    features: result.rows.map((row) => row.feature),
  };
  const outputPath = path.join(outputDirectory, 'spa-travel-review.geojson');
  await writeFile(outputPath, `${JSON.stringify(reviewCollection, null, 2)}\n`, 'utf8');

  const publicFeatures = reviewCollection.features.filter((feature) => {
    const reviewStatus = feature.properties?.reviewStatus;
    if (feature.properties?.featureType === 'route') return reviewStatus === 'published';
    if (feature.properties?.featureType === 'poi' && feature.properties?.featured === false) return false;
    return reviewStatus === 'reviewed' || reviewStatus === 'published';
  });
  const publicCollection = {
    type: 'FeatureCollection',
    name: 'spa-travel-public',
    properties: {
      note: 'Публичный слой содержит только редакционно проверенные или опубликованные объекты.',
      expectedCounts: { poi: 21, accommodation_zone: 6 },
    },
    features: publicFeatures,
  };
  const webOutputDirectory = path.join(repositoryRoot, 'apps', 'web', 'public', 'data', 'travel');
  await mkdir(webOutputDirectory, { recursive: true });
  const webOutputPath = path.join(webOutputDirectory, 'spa.geojson');
  await writeFile(webOutputPath, `${JSON.stringify(publicCollection)}\n`, 'utf8');
  console.log(
    `Экспортировано ${reviewCollection.features.length} объектов для проверки и `
      + `${publicCollection.features.length} публичных объектов: ${outputPath}; веб-слой: ${webOutputPath}`,
  );
} finally {
  await client.end();
}
