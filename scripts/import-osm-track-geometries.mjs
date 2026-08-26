import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outputPath = path.join(repositoryRoot, 'apps/web/app/data/circuits-openstreetmap.json');
const overpassUrl = 'https://overpass-api.de/api/interpreter';

const trackDefinitions = [
  {
    id: 'in-2011',
    circuitId: 'buddh',
    name: 'Buddh International Circuit',
    location: 'Greater Noida',
    opened: 2011,
    firstGrandPrix: 2011,
    expectedLength: 5125,
    wayIds: [188020619, 169886195, 188020614, 188020617, 188020613, 188020620],
    build(ways) {
      return stitchWays(this.wayIds.map((id) => ways.get(id)));
    },
  },
  {
    id: 'kr-2010',
    circuitId: 'yeongam',
    name: 'Korean International Circuit',
    location: 'Yeongam',
    opened: 2010,
    firstGrandPrix: 2010,
    expectedLength: 5615,
    wayIds: [234764328, 234764539],
    build(ways) {
      const permanent = ways.get(234764328);
      const grandPrixExtension = ways.get(234764539);
      const startIndex = nearestPointIndex(permanent, grandPrixExtension[0]);
      const endIndex = nearestPointIndex(permanent, grandPrixExtension.at(-1));
      const returnArc = permanent.slice(endIndex).concat(permanent.slice(1, startIndex + 1));
      return joinSegments([grandPrixExtension, returnArc]);
    },
  },
  {
    id: 'jp-1990',
    circuitId: 'okayama',
    name: 'Okayama International Circuit',
    location: 'Mimasaka',
    opened: 1990,
    firstGrandPrix: 1994,
    expectedLength: 3703,
    wayIds: [177330893],
    build(ways) {
      return ways.get(177330893);
    },
  },
];

function samePoint(a, b, tolerance = 1e-7) {
  return Math.abs(a[0] - b[0]) <= tolerance && Math.abs(a[1] - b[1]) <= tolerance;
}

function joinSegments(segments) {
  const result = [];
  for (const segment of segments) {
    if (!segment?.length) throw new Error('OSM вернул пустой участок трассы');
    if (result.length === 0) {
      result.push(...segment);
      continue;
    }
    if (samePoint(result.at(-1), segment[0])) result.push(...segment.slice(1));
    else result.push(...segment);
  }
  return result;
}

function stitchWays(segments) {
  const remaining = segments.map((segment) => [...segment]);
  const result = remaining.shift();
  while (remaining.length > 0) {
    const tail = result.at(-1);
    const index = remaining.findIndex((segment) => samePoint(tail, segment[0]) || samePoint(tail, segment.at(-1)));
    if (index < 0) throw new Error('Не удалось последовательно соединить OSM-участки');
    const [next] = remaining.splice(index, 1);
    if (!samePoint(tail, next[0])) next.reverse();
    result.push(...next.slice(1));
  }
  return result;
}

function nearestPointIndex(coordinates, target) {
  return coordinates.reduce(
    (best, coordinate, index) => {
      const distance = haversineDistance(coordinate, target);
      return distance < best.distance ? { index, distance } : best;
    },
    { index: -1, distance: Number.POSITIVE_INFINITY },
  ).index;
}

function haversineDistance(a, b) {
  const radius = 6_371_000;
  const radians = Math.PI / 180;
  const latitudeDelta = (b[1] - a[1]) * radians;
  const longitudeDelta = (b[0] - a[0]) * radians;
  const value = Math.sin(latitudeDelta / 2) ** 2
    + Math.cos(a[1] * radians) * Math.cos(b[1] * radians) * Math.sin(longitudeDelta / 2) ** 2;
  return 2 * radius * Math.asin(Math.sqrt(value));
}

function lineLength(coordinates) {
  return coordinates.slice(1).reduce(
    (total, coordinate, index) => total + haversineDistance(coordinates[index], coordinate),
    0,
  );
}

function boundingBox(coordinates) {
  return coordinates.reduce(
    ([west, south, east, north], [longitude, latitude]) => [
      Math.min(west, longitude),
      Math.min(south, latitude),
      Math.max(east, longitude),
      Math.max(north, latitude),
    ],
    [Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY],
  );
}

async function fetchWays(ids) {
  const query = `[out:json][timeout:30];way(id:${ids.join(',')});out tags geom;`;
  const response = await fetch(`${overpassUrl}?data=${encodeURIComponent(query)}`, {
    headers: { 'User-Agent': 'F1-Geovisual-Atlas/0.1 (track geometry import)' },
  });
  if (!response.ok) throw new Error(`Overpass вернул HTTP ${response.status}`);
  const payload = await response.json();
  return new Map(payload.elements.map((way) => [
    way.id,
    way.geometry.map(({ lon, lat }) => [lon, lat]),
  ]));
}

const allWayIds = [...new Set(trackDefinitions.flatMap((track) => track.wayIds))];
const ways = await fetchWays(allWayIds);
const features = trackDefinitions.map((track) => {
  const coordinates = track.build(ways);
  if (!samePoint(coordinates[0], coordinates.at(-1), 2e-5)) {
    throw new Error(`${track.name}: контур не замкнут`);
  }
  const measuredLength = Math.round(lineLength(coordinates));
  if (Math.abs(measuredLength - track.expectedLength) > 180) {
    throw new Error(`${track.name}: длина ${measuredLength} м не совпадает с ожидаемой ${track.expectedLength} м`);
  }
  return {
    type: 'Feature',
    properties: {
      id: track.id,
      circuitId: track.circuitId,
      Location: track.location,
      Name: track.name,
      opened: track.opened,
      firstgp: track.firstGrandPrix,
      length: measuredLength,
      source: 'OpenStreetMap contributors',
      sourceUrl: 'https://www.openstreetmap.org/copyright',
      license: 'ODbL-1.0',
      checkedAt: '2026-08-26',
    },
    bbox: boundingBox(coordinates),
    geometry: { type: 'LineString', coordinates },
  };
});

const collection = {
  type: 'FeatureCollection',
  name: 'f1-circuits-openstreetmap',
  bbox: boundingBox(features.flatMap((feature) => feature.geometry.coordinates)),
  features,
};

await mkdir(path.dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(collection, null, 2)}\n`, 'utf8');
console.log(`Записано трасс: ${features.length}`);
for (const feature of features) {
  console.log(`${feature.properties.circuitId}: ${feature.properties.length} м`);
}
