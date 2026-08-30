#!/usr/bin/env node

import pg from 'pg';

const { Client } = pg;
const circuitId = process.argv[2];
const shouldApply = process.argv.includes('--apply');
const groupArgument = process.argv.find((argument) => argument.startsWith('--group='));
const requestedGroup = groupArgument?.split('=')[1] ?? 'all';

if (!circuitId || !shouldApply) {
  console.error('Использование: node import-travel-candidates.mjs <circuit-id> --apply [--group=all|transport|stay|explore|essential]');
  process.exit(1);
}

const requiredEnvironment = ['PGHOST', 'PGPORT', 'PGDATABASE', 'PGUSER', 'PGPASSWORD'];
const missingEnvironment = requiredEnvironment.filter((name) => !process.env[name]);
if (missingEnvironment.length > 0) {
  throw new Error(`Не заданы параметры базы: ${missingEnvironment.join(', ')}`);
}

const overpassUrls = [
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
  'https://overpass-api.de/api/interpreter',
];

function overpassQueries(latitude, longitude) {
  return {
    transport_airport: `[out:json][timeout:35];(
      nwr(around:140000,${latitude},${longitude})[aeroway=aerodrome][name];
    );out center tags qt;`,
    transport_rail: `[out:json][timeout:35];(
      nwr(around:60000,${latitude},${longitude})[railway=station][name];
    );out center tags qt;`,
    transport_bus: `[out:json][timeout:35];(
      nwr(around:60000,${latitude},${longitude})[amenity=bus_station][name];
    );out center tags qt;`,
    transport_parking: `[out:json][timeout:35];(
      nwr(around:45000,${latitude},${longitude})[amenity=parking][park_ride][name];
    );out center tags qt;`,
    stay: `[out:json][timeout:35];(
      nwr(around:45000,${latitude},${longitude})[tourism~"hotel|hostel|guest_house|apartment|camp_site"][name];
    );out center tags qt;`,
    explore: `[out:json][timeout:35];(
      nwr(around:50000,${latitude},${longitude})[tourism~"attraction|museum|viewpoint"][name];
      nwr(around:50000,${latitude},${longitude})[tourism=information][information~"office|visitor_centre"][name];
      nwr(around:50000,${latitude},${longitude})[historic~"castle|monument|ruins|archaeological_site"][name];
      nwr(around:50000,${latitude},${longitude})[natural~"peak|waterfall|cave_entrance"][name];
    );out center tags qt;`,
    essential: `[out:json][timeout:35];(
      nwr(around:18000,${latitude},${longitude})[amenity~"hospital|pharmacy"][name];
      nwr(around:18000,${latitude},${longitude})[shop=supermarket][name];
    );out center tags qt;`,
  };
}

async function fetchOverpass(query) {
  let lastError;
  for (const url of overpassUrls) {
    try {
      console.log(`Запрос к ${new URL(url).hostname}`);
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
          'User-Agent': 'F1-Geovisual-Atlas/0.1 (travel candidate import)',
        },
        body: `data=${encodeURIComponent(query)}`,
        signal: AbortSignal.timeout(45_000),
      });
      if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
      return response.json();
    } catch (error) {
      lastError = error;
    }
  }
  throw new Error('Серверы Overpass не вернули данные', { cause: lastError });
}

function classify(tags) {
  if (tags.aeroway === 'aerodrome') return ['airport', 'transport'];
  if (tags.railway === 'station') return ['railway_station', 'transport'];
  if (tags.amenity === 'bus_station') return ['bus_station', 'transport'];
  if (tags.amenity === 'parking' && tags.park_ride && tags.park_ride !== 'no') return ['park_and_ride', 'transport'];
  if (tags.tourism === 'hotel') return ['hotel', 'stay'];
  if (tags.tourism === 'hostel') return ['hostel', 'stay'];
  if (tags.tourism === 'guest_house') return ['guest_house', 'stay'];
  if (tags.tourism === 'apartment') return ['apartment', 'stay'];
  if (tags.tourism === 'camp_site') return ['camp_site', 'stay'];
  if (tags.tourism === 'museum') return ['museum', 'explore'];
  if (tags.tourism === 'viewpoint') return ['viewpoint', 'explore'];
  if (tags.tourism === 'attraction') return ['attraction', 'explore'];
  if (tags.tourism === 'information') return ['tourist_information', 'essential'];
  if (tags.historic) return ['heritage', 'explore'];
  if (tags.natural) return ['nature', 'explore'];
  if (tags.amenity === 'hospital') return ['hospital', 'essential'];
  if (tags.amenity === 'pharmacy') return ['pharmacy', 'essential'];
  if (tags.shop === 'supermarket') return ['supermarket', 'essential'];
  return undefined;
}

function elementPoint(element) {
  const latitude = element.lat ?? element.center?.lat;
  const longitude = element.lon ?? element.center?.lon;
  return Number.isFinite(latitude) && Number.isFinite(longitude)
    ? { latitude, longitude }
    : undefined;
}

function scoreCandidate(candidate) {
  const tags = candidate.tags;
  let score = 50;
  if (tags.wikidata) score += 12;
  if (tags.wikipedia) score += 8;
  if (tags.website || tags['contact:website']) score += 6;
  if (tags.iata) score += 12;
  if (tags.stars) score += Math.min(Number(tags.stars) || 0, 5);
  if (candidate.role === 'transport') score += 8;
  if (candidate.categoryId === 'hospital') score += 10;
  return Math.min(score, 100);
}

const client = new Client({ application_name: 'f1-geovisual-atlas-travel-import' });
await client.connect();

try {
  const circuitResult = await client.query(
    `SELECT ST_Y(location::geometry) AS latitude, ST_X(location::geometry) AS longitude
     FROM atlas.circuits WHERE id = $1`,
    [circuitId],
  );
  if (circuitResult.rowCount === 0) throw new Error(`Трасса ${circuitId} не найдена в базе`);

  const { latitude, longitude } = circuitResult.rows[0];
  console.log(`Сбор кандидатов для ${circuitId}: ${latitude}, ${longitude}`);
  const queries = overpassQueries(latitude, longitude);
  if (!['all', 'transport'].includes(requestedGroup) && !queries[requestedGroup]) {
    throw new Error(`Неизвестная группа ${requestedGroup}. Доступны: ${Object.keys(queries).join(', ')}, transport, all`);
  }
  const selectedQueries = requestedGroup === 'transport'
    ? Object.entries(queries).filter(([group]) => group.startsWith('transport_'))
    : requestedGroup === 'all'
    ? Object.entries(queries)
    : [[requestedGroup, queries[requestedGroup]]];
  const elements = [];
  const failedGroups = [];
  for (const [group, query] of selectedQueries) {
    try {
      console.log(`Группа: ${group}`);
      const payload = await fetchOverpass(query);
      console.log(`Получено объектов: ${payload.elements.length}`);
      elements.push(...payload.elements);
    } catch (error) {
      failedGroups.push(group);
      console.warn(`Группа ${group} пропущена: ${error.message}`);
    }
  }
  if (elements.length === 0) {
    throw new Error(`Не удалось получить ни одной группы (${failedGroups.join(', ')})`);
  }
  const candidates = elements.flatMap((element) => {
    const classification = classify(element.tags ?? {});
    const point = elementPoint(element);
    if (!classification || !point || !element.tags?.name) return [];
    const [categoryId, role] = classification;
    const candidate = {
      osmId: `${element.type}/${element.id}`,
      id: `osm-${element.type}-${element.id}`,
      categoryId,
      role,
      name: element.tags.name,
      point,
      tags: element.tags,
    };
    return [{ ...candidate, importance: scoreCandidate(candidate) }];
  });

  const uniqueCandidates = [...new Map(candidates.map((candidate) => [candidate.id, candidate])).values()];

  await client.query('BEGIN');
  for (const candidate of uniqueCandidates) {
    const website = candidate.tags.website ?? candidate.tags['contact:website'] ?? null;
    await client.query(
      `INSERT INTO atlas.tourism_pois (
          id, category_id, name, name_ru, location, address, website_url,
          opening_hours, importance, wheelchair_access, review_status,
          source_id, properties, updated_at
       ) VALUES (
          $1, $2, $3, NULL,
          ST_SetSRID(ST_MakePoint($4, $5), 4326)::geography,
          $6, $7, $8, $9, $10, 'candidate', 'openstreetmap', $11::jsonb, now()
       ) ON CONFLICT (id) DO UPDATE SET
          category_id = EXCLUDED.category_id,
          name = EXCLUDED.name,
          location = EXCLUDED.location,
          address = EXCLUDED.address,
          website_url = EXCLUDED.website_url,
          opening_hours = EXCLUDED.opening_hours,
          importance = EXCLUDED.importance,
          wheelchair_access = EXCLUDED.wheelchair_access,
          properties = EXCLUDED.properties,
          updated_at = now()`,
      [
        candidate.id,
        candidate.categoryId,
        candidate.name,
        candidate.point.longitude,
        candidate.point.latitude,
        candidate.tags['addr:full'] ?? candidate.tags['addr:street'] ?? null,
        website,
        candidate.tags.opening_hours ?? null,
        candidate.importance,
        ['yes', 'limited', 'no'].includes(candidate.tags.wheelchair) ? candidate.tags.wheelchair : 'unknown',
        JSON.stringify({ osm: candidate.osmId, tags: candidate.tags }),
      ],
    );
    await client.query(
      `INSERT INTO atlas.circuit_travel_pois (
          circuit_id, poi_id, role, priority, distance_to_circuit_m, source_id
       ) SELECT $1, $2, $3, $4,
          round(ST_Distance(p.location, c.location))::integer, 'openstreetmap'
       FROM atlas.tourism_pois p, atlas.circuits c
       WHERE p.id = $2 AND c.id = $1
       ON CONFLICT (circuit_id, poi_id) DO UPDATE SET
          role = EXCLUDED.role,
          priority = EXCLUDED.priority,
          distance_to_circuit_m = EXCLUDED.distance_to_circuit_m,
          updated_at = now()`,
      [circuitId, candidate.id, candidate.role, candidate.importance],
    );
    await client.query(
      `INSERT INTO atlas.external_identifiers (provider, entity_type, entity_id, external_id)
       VALUES ('openstreetmap', 'tourism_poi', $1, $2)
       ON CONFLICT (provider, entity_type, external_id) DO UPDATE SET entity_id = EXCLUDED.entity_id`,
      [candidate.id, candidate.osmId],
    );
  }
  await client.query('COMMIT');

  const counts = await client.query(
    `SELECT ctp.role, count(*)::integer AS count
     FROM atlas.circuit_travel_pois ctp
     JOIN atlas.tourism_pois p ON p.id = ctp.poi_id
     WHERE ctp.circuit_id = $1 AND p.review_status = 'candidate'
     GROUP BY ctp.role ORDER BY ctp.role`,
    [circuitId],
  );
  console.log(JSON.stringify({
    circuitId,
    imported: uniqueCandidates.length,
    failedGroups,
    byRole: counts.rows,
  }, null, 2));
} catch (error) {
  try { await client.query('ROLLBACK'); } catch {}
  throw error;
} finally {
  await client.end();
}
