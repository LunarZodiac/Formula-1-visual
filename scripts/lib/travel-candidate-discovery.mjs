const overpassUrls = [
  'https://lz4.overpass-api.de/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
  'https://overpass-api.de/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
];

export const travelImportGroups = ['transport', 'stay', 'explore', 'essential'];

export const defaultTravelRadii = {
  airport: 200000,
  regionalTransport: 50000,
  stay: 50000,
  explore: 50000,
  essential: 15000,
};

function query(radius, latitude, longitude, selectors, elementTypes = ['node']) {
  const latitudeDelta = radius / 111_320;
  const longitudeDelta = radius / (111_320 * Math.max(0.2, Math.cos(latitude * Math.PI / 180)));
  const bounds = [latitude - latitudeDelta, longitude - longitudeDelta, latitude + latitudeDelta, longitude + longitudeDelta]
    .map((value) => value.toFixed(6)).join(',');
  const statements = elementTypes.flatMap((elementType) => selectors.map((selector) => elementType + '(' + bounds + ')' + selector + '[name];')).join('\n');
  return '[out:json][timeout:35];(\n' + statements + '\n);out center tags qt 2500;';
}

function overpassQueries(latitude, longitude, radii) {
  return {
    transport: [
      query(radii.airport, latitude, longitude, ['[aeroway=aerodrome]'], ['node', 'way']),
      query(radii.regionalTransport, latitude, longitude, [
        '[railway=station]',
        '[amenity=bus_station]',
        '[amenity=parking][park_ride]',
      ]),
    ],
    stay: [query(radii.stay, latitude, longitude, [
      '[tourism=hotel]', '[tourism=hostel]', '[tourism=guest_house]',
      '[tourism=apartment]', '[tourism=camp_site]',
    ])],
    explore: [query(radii.explore, latitude, longitude, [
      '[tourism=attraction]', '[tourism=museum]', '[tourism=viewpoint]',
      '[tourism=information][information~"office|visitor_centre"]',
      '[historic~"castle|monument|ruins|archaeological_site"]',
      '[natural~"peak|waterfall|cave_entrance"]',
    ])],
    essential: [query(radii.essential, latitude, longitude, [
      '[amenity=hospital]', '[amenity=pharmacy]', '[shop=supermarket]',
      '[amenity=restaurant]', '[amenity=cafe]',
    ])],
  };
}

async function fetchOverpass(queryText, { maxMirrorAttempts = overpassUrls.length, requestTimeoutMs = 50_000 } = {}) {
  let lastError;
  for (const url of overpassUrls.slice(0, maxMirrorAttempts)) {
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
          'User-Agent': 'F1-Geovisual-Atlas/0.1 (travel candidate discovery)',
        },
        body: 'data=' + encodeURIComponent(queryText),
        signal: AbortSignal.timeout(requestTimeoutMs),
      });
      if (!response.ok) throw new Error(response.status + ' ' + response.statusText);
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
  if (tags.amenity === 'restaurant') return ['restaurant', 'essential'];
  if (tags.amenity === 'cafe') return ['cafe', 'essential'];
  return null;
}

function elementPoint(element) {
  const latitude = element.lat ?? element.center?.lat;
  const longitude = element.lon ?? element.center?.lon;
  return Number.isFinite(latitude) && Number.isFinite(longitude) ? { latitude, longitude } : null;
}

function distanceMetres(first, second) {
  const toRadians = (value) => value * Math.PI / 180;
  const latitudeDelta = toRadians(second.latitude - first.latitude);
  const longitudeDelta = toRadians(second.longitude - first.longitude);
  const latitude1 = toRadians(first.latitude);
  const latitude2 = toRadians(second.latitude);
  const value = Math.sin(latitudeDelta / 2) ** 2
    + Math.cos(latitude1) * Math.cos(latitude2) * Math.sin(longitudeDelta / 2) ** 2;
  return Math.round(6371000 * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value)));
}

function scoreCandidate(candidate) {
  const tags = candidate.tags;
  let score = 45;
  if (tags.wikidata) score += 12;
  if (tags.wikipedia) score += 8;
  if (tags.website || tags['contact:website']) score += 7;
  if (tags.opening_hours) score += 4;
  if (tags.iata) score += 12;
  if (candidate.role === 'transport') score += 8;
  if (['hospital', 'airport', 'railway_station'].includes(candidate.categoryId)) score += 8;
  return Math.min(score, 100);
}

export async function discoverTravelCandidates(client, {
  circuitId,
  groups = travelImportGroups,
  radii = {},
  requestDelayMs = 0,
  maxMirrorAttempts = overpassUrls.length,
  requestTimeoutMs = 50_000,
  onProgress = null,
}) {
  if (!/^[A-Za-z0-9_-]+$/.test(circuitId)) throw new Error('Некорректный ID трассы');
  const selectedGroups = [...new Set(groups)].filter((group) => travelImportGroups.includes(group));
  if (!selectedGroups.length) throw new Error('Выберите хотя бы одну группу');
  const resolvedRadii = { ...defaultTravelRadii, ...radii };
  for (const [name, value] of Object.entries(resolvedRadii)) {
    if (!Number.isInteger(value) || value < 1000 || value > 250000) throw new Error('Некорректный радиус ' + name);
  }
  const circuitResult = await client.query(
    'SELECT coalesce(profile.name_ru, circuit.short_name, circuit.name) AS name, '
      + 'ST_Y(circuit.location::geometry) AS latitude, ST_X(circuit.location::geometry) AS longitude '
      + 'FROM atlas.circuits AS circuit LEFT JOIN atlas.circuit_page_profiles AS profile ON profile.circuit_id = circuit.id '
      + 'WHERE circuit.id = $1',
    [circuitId],
  );
  if (!circuitResult.rows[0]) throw new Error('Трасса не найдена');
  const circuit = {
    id: circuitId,
    name: String(circuitResult.rows[0].name),
    latitude: Number(circuitResult.rows[0].latitude),
    longitude: Number(circuitResult.rows[0].longitude),
  };
  const queries = overpassQueries(circuit.latitude, circuit.longitude, resolvedRadii);
  const elements = [];
  const failedGroups = [];
  let lastRequestAt = 0;
  for (const group of selectedGroups) {
    for (const queryText of queries[group]) {
      try {
        onProgress?.({ group, status: 'request' });
        const remainingDelay = requestDelayMs - (Date.now() - lastRequestAt);
        if (remainingDelay > 0) await new Promise((resolve) => setTimeout(resolve, remainingDelay));
        const payload = await fetchOverpass(queryText, { maxMirrorAttempts, requestTimeoutMs });
        lastRequestAt = Date.now();
        elements.push(...(payload.elements ?? []));
        onProgress?.({ group, status: 'received', count: payload.elements?.length ?? 0 });
      } catch {
        lastRequestAt = Date.now();
        failedGroups.push(group);
        onProgress?.({ group, status: 'failed' });
      }
    }
  }
  const candidates = elements.flatMap((element) => {
    const classification = classify(element.tags ?? {});
    const point = elementPoint(element);
    if (!classification || !point || !element.tags?.name) return [];
    const [categoryId, role] = classification;
    const base = {
      id: 'osm-' + element.type + '-' + element.id,
      externalId: element.type + '/' + element.id,
      categoryId,
      role,
      name: String(element.tags.name),
      latitude: point.latitude,
      longitude: point.longitude,
      distanceToCircuitM: distanceMetres(circuit, point),
      websiteUrl: element.tags.website ?? element.tags['contact:website'] ?? null,
      openingHours: element.tags.opening_hours ?? null,
      address: element.tags['addr:full'] ?? element.tags['addr:street'] ?? null,
      tags: element.tags,
    };
    return [{ ...base, importance: scoreCandidate(base) }];
  });
  const uniqueCandidates = [...new Map(candidates.map((candidate) => [candidate.id, candidate])).values()]
    .filter((candidate) => {
      const maximumDistance = candidate.categoryId === 'airport' ? resolvedRadii.airport
        : candidate.role === 'transport' ? resolvedRadii.regionalTransport
        : candidate.role === 'stay' ? resolvedRadii.stay
        : candidate.role === 'explore' ? resolvedRadii.explore
        : resolvedRadii.essential;
      return candidate.distanceToCircuitM <= maximumDistance;
    })
    .sort((left, right) => right.importance - left.importance || left.distanceToCircuitM - right.distanceToCircuitM);
  return { circuit, groups: selectedGroups, radii: resolvedRadii, failedGroups: [...new Set(failedGroups)], candidates: uniqueCandidates };
}
