#!/usr/bin/env node

import pg from 'pg';

const { Client } = pg;
const shouldApply = process.argv.includes('--apply');
const circuitApproachPoiId = 'spa-routing-anchor-combes';

if (!shouldApply) {
  console.error('Использование: node build-spa-travel-routes.mjs --apply');
  process.exit(1);
}

const routes = [
  {
    id: 'spa-route-verviers-shuttle',
    type: 'event_shuttle',
    mode: 'shuttle',
    nameRu: 'Вервье-Центральный → трасса',
    summaryRu: 'Основной маршрут общественным транспортом в дни Гран-при',
    stops: ['osm-node-26446051', circuitApproachPoiId],
    sourceId: 'spa_grand_prix',
    eventOnly: true,
    bookingRequired: true,
    scheduleNotesRu: 'Билет на платный трансфер приобретается отдельно; расписание проверяется для каждого сезона',
  },
  {
    id: 'spa-route-liege-arrival', type: 'arrival', mode: 'car',
    nameRu: 'Льеж → трасса', summaryRu: 'Маршрут от вокзала Льеж-Гийемен',
    stops: ['osm-node-5307127700', circuitApproachPoiId], sourceId: 'spa_grand_prix',
  },
  {
    id: 'spa-route-brussels-airport', type: 'arrival', mode: 'car',
    nameRu: 'Аэропорт Брюссель → трасса', summaryRu: 'Автомобильный маршрут из главного аэропорта Бельгии',
    stops: ['osm-way-370594935', circuitApproachPoiId], sourceId: 'spa_grand_prix',
  },
  {
    id: 'spa-route-charleroi-airport', type: 'arrival', mode: 'car',
    nameRu: 'Аэропорт Шарлеруа → трасса', summaryRu: 'Маршрут из аэропорта Брюссель-Шарлеруа',
    stops: ['osm-way-63223157', circuitApproachPoiId], sourceId: 'spa_grand_prix',
  },
  {
    id: 'spa-route-cologne-airport', type: 'arrival', mode: 'car',
    nameRu: 'Аэропорт Кёльн/Бонн → трасса', summaryRu: 'Трансграничный автомобильный маршрут из Германии',
    stops: ['osm-relation-2269304', circuitApproachPoiId], sourceId: 'spa_grand_prix',
  },
  {
    id: 'spa-route-stavelot', type: 'arrival', mode: 'car',
    nameRu: 'Ставло → трасса', summaryRu: 'Короткий маршрут из исторического центра Ставло',
    stops: ['osm-way-1418726543', circuitApproachPoiId], sourceId: 'visit_wallonia',
  },
  {
    id: 'spa-route-coo-half-day', type: 'tourist_half_day', mode: 'car',
    nameRu: 'Ставло и водопад Коо', summaryRu: 'Короткий маршрут по главным местам к югу от трассы',
    stops: [circuitApproachPoiId, 'osm-way-1418726543', 'osm-node-5771053254', circuitApproachPoiId],
    sourceId: 'visit_wallonia',
  },
  {
    id: 'spa-route-high-fens', type: 'tourist_full_day', mode: 'car',
    nameRu: 'Высокие Фены и замок Рейнхардштайн', summaryRu: 'Природный маршрут через высшую точку Бельгии и долину Варш',
    stops: [circuitApproachPoiId, 'osm-relation-1346961', 'osm-node-1955780257', 'osm-way-105586318', circuitApproachPoiId],
    sourceId: 'visit_wallonia',
  },
];

async function loadPoi(id) {
  const result = await client.query(
    `SELECT id, COALESCE(name_ru, name) AS name,
            ST_X(location::geometry) AS longitude,
            ST_Y(location::geometry) AS latitude
     FROM atlas.tourism_pois WHERE id = $1`,
    [id],
  );
  if (result.rowCount === 0) throw new Error(`Не найдена точка маршрута ${id}`);
  return result.rows[0];
}

const routableRoutes = routes.filter((definition) => definition.mode === 'car');
routableRoutes.forEach(assertRouteCanBeBuilt);

const client = new Client({ application_name: 'f1-geovisual-atlas-spa-routes' });
await client.connect();

async function fetchRoute(points) {
  const coordinates = points.map((point) => `${point.longitude},${point.latitude}`).join(';');
  const url = `https://router.project-osrm.org/route/v1/driving/${coordinates}?overview=full&geometries=geojson&steps=false`;
  const response = await fetch(url, {
    headers: { 'User-Agent': 'F1-Geovisual-Atlas/0.1 (travel route builder)' },
    signal: AbortSignal.timeout(45_000),
  });
  if (!response.ok) throw new Error(`OSRM: ${response.status} ${response.statusText}`);
  const payload = await response.json();
  if (payload.code !== 'Ok' || !payload.routes?.[0]) throw new Error(`OSRM: ${payload.code}`);
  return payload.routes[0];
}

function assertRouteCanBeBuilt(definition) {
  if (definition.stops.includes('osm-way-234804574')) {
    throw new Error(
      `${definition.id}: центр полигона автодрома нельзя использовать как точку въезда; `
        + 'сначала добавьте проверенную точку доступа для конкретного типа события',
    );
  }
}

async function inspectTrackConflict(geometry) {
  const result = await client.query(
    `WITH route AS (
       SELECT ST_Force2D(ST_SetSRID(ST_GeomFromGeoJSON($1), 4326)) AS geometry
     ), layout AS (
       SELECT ST_Force2D(track.centerline) AS centerline
       FROM atlas.track_layouts AS track
       WHERE track.circuit_id = 'spa'
         AND track.review_status IN ('reviewed', 'published')
       ORDER BY (track.review_status = 'published') DESC,
                track.valid_to_year DESC NULLS FIRST,
                track.id
       LIMIT 1
     )
     SELECT
       round(ST_Distance(ST_EndPoint(route.geometry)::geography, layout.centerline::geography))::integer
         AS endpoint_distance_m,
       round(ST_Length(ST_Intersection(
         ST_LineSubstring(route.geometry, 0.02, 0.98),
         ST_Buffer(layout.centerline::geography, 20)::geometry
       )::geography))::integer AS track_buffer_overlap_m
     FROM route CROSS JOIN layout`,
    [JSON.stringify(geometry)],
  );
  if (result.rowCount !== 1) throw new Error('Не найдена актуальная геометрия Спа для проверки маршрута');
  return result.rows[0];
}

try {
  await client.query(
    `INSERT INTO atlas.data_sources (id, name, url, licence, notes)
     VALUES ('osrm', 'Open Source Routing Machine', 'https://project-osrm.org/', 'BSD-2-Clause', 'Расчёт дорожной геометрии и ориентировочного времени в пути')
     ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, url = EXCLUDED.url,
       licence = EXCLUDED.licence, notes = EXCLUDED.notes`,
  );

  console.log('Маршрут трансфера пропущен: автомобильный OSRM не моделирует официальную автобусную схему');
  for (const definition of routableRoutes) {
    const points = [];
    for (const poiId of definition.stops) points.push(await loadPoi(poiId));
    console.log(`Маршрут: ${definition.nameRu}`);
    const result = await fetchRoute(points);
    const trackConflict = await inspectTrackConflict(result.geometry);
    const reviewStatus = trackConflict.track_buffer_overlap_m > 0 ? 'hidden' : 'candidate';
    await client.query('BEGIN');
    await client.query(
      `INSERT INTO atlas.travel_routes (
          id, circuit_id, route_type, travel_mode, name, name_ru, summary_ru,
          geometry, distance_m, duration_minutes, event_only, booking_required,
          schedule_notes_ru, source_id, route_engine, route_engine_profile,
          properties, review_status, updated_at
       ) VALUES (
          $1, 'spa', $2, $3, $4, $4, $5,
          ST_SetSRID(ST_GeomFromGeoJSON($6), 4326)::geography,
          $7, $8, $9, $10, $11, $12, 'osrm', 'driving',
          $13::jsonb, $14, now()
       ) ON CONFLICT (id) DO UPDATE SET
          route_type = EXCLUDED.route_type,
          travel_mode = EXCLUDED.travel_mode,
          name = EXCLUDED.name,
          name_ru = EXCLUDED.name_ru,
          geometry = EXCLUDED.geometry,
          distance_m = EXCLUDED.distance_m,
          duration_minutes = EXCLUDED.duration_minutes,
          summary_ru = EXCLUDED.summary_ru,
          event_only = EXCLUDED.event_only,
          booking_required = EXCLUDED.booking_required,
          schedule_notes_ru = EXCLUDED.schedule_notes_ru,
          source_id = EXCLUDED.source_id,
          route_engine = EXCLUDED.route_engine,
          route_engine_profile = EXCLUDED.route_engine_profile,
          properties = EXCLUDED.properties,
          review_status = EXCLUDED.review_status,
          verified_at = NULL,
          updated_at = now()`,
      [
        definition.id, definition.type, definition.mode, definition.nameRu,
        definition.summaryRu, JSON.stringify(result.geometry), Math.round(result.distance),
        Math.max(1, Math.round(result.duration / 60)), definition.eventOnly ?? false,
        definition.bookingRequired ?? false, definition.scheduleNotesRu ?? null,
        definition.sourceId,
        JSON.stringify({
          routingSource: 'osrm',
          editorialSource: definition.sourceId,
          approachPoiId: circuitApproachPoiId,
          endpointDistanceToTrackM: trackConflict.endpoint_distance_m,
          trackBufferOverlapM: trackConflict.track_buffer_overlap_m,
        }),
        reviewStatus,
      ],
    );
    await client.query('DELETE FROM atlas.travel_route_stops WHERE route_id = $1', [definition.id]);
    for (const [index, point] of points.entries()) {
      await client.query(
        `INSERT INTO atlas.travel_route_stops (route_id, sequence, poi_id, name_ru)
         VALUES ($1, $2, $3, $4)`,
        [definition.id, index + 1, point.id, point.name],
      );
    }
    await client.query('COMMIT');
    console.log(
      `  до трассы ${trackConflict.endpoint_distance_m} м; пересечение буфера: `
        + `${trackConflict.track_buffer_overlap_m} м; статус ${reviewStatus}`,
    );
  }
} catch (error) {
  try { await client.query('ROLLBACK'); } catch {}
  throw error;
} finally {
  await client.end();
}

console.log(`Сохранено автомобильных маршрутов: ${routableRoutes.length}`);
