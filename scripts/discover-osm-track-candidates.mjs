import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const snapshotsDirectory = path.join(repositoryRoot, 'apps/web/public/data/f1');
const registryPath = path.join(repositoryRoot, 'apps/web/app/data/track-geometry-registry.ts');
const overpassUrls = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
];

function parseRegisteredIds(source) {
  const block = source.match(/export const circuitGeometryRegistry = \{([\s\S]*?)\} as const;/)?.[1] ?? '';
  return new Set([...block.matchAll(/['"]?([\w-]+)['"]?:\s*'[^']+'/g)].map((match) => match[1]));
}

async function fetchOverpass(query) {
  let lastError;
  for (const url of overpassUrls) {
    try {
      const response = await fetch(`${url}?data=${encodeURIComponent(query)}`, {
        headers: { 'User-Agent': 'F1-Geovisual-Atlas/0.1 (track candidate audit)' },
      });
      if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
      return response.json();
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError;
}

const snapshotFiles = (await readdir(snapshotsDirectory))
  .filter((name) => /^season-\d{4}\.json$/.test(name))
  .sort();
const circuits = new Map();
for (const snapshotFile of snapshotFiles) {
  const snapshot = JSON.parse(await readFile(path.join(snapshotsDirectory, snapshotFile), 'utf8'));
  for (const event of snapshot.calendar) {
    if (!circuits.has(event.circuit.id)) circuits.set(event.circuit.id, event.circuit);
  }
}

const registered = parseRegisteredIds(await readFile(registryPath, 'utf8'));
const requestedIds = process.argv.slice(2);
const missing = [...circuits.values()].filter((circuit) => (
  requestedIds.length > 0
    ? requestedIds.includes(circuit.id)
    : !registered.has(circuit.id)
));

const selectors = missing.flatMap((circuit) => {
  const [longitude, latitude] = circuit.coordinates;
  return [
    `way(around:12000,${latitude},${longitude})["highway"="raceway"];`,
    `relation(around:12000,${latitude},${longitude})["highway"="raceway"];`,
    `relation(around:12000,${latitude},${longitude})["route"="raceway"];`,
  ];
}).join('\n');
const payload = await fetchOverpass(`[out:json][timeout:120];(${selectors});out tags center;`);

const results = missing.map((circuit) => {
  const [longitude, latitude] = circuit.coordinates;
  const candidates = payload.elements
    .filter((element) => element.center)
    .map((element) => {
      const distance = Math.hypot(
        (element.center.lon - longitude) * Math.cos(latitude * Math.PI / 180),
        element.center.lat - latitude,
      ) * 111.32;
      return {
        type: element.type,
        id: element.id,
        distanceKm: Number(distance.toFixed(2)),
        name: element.tags?.name ?? null,
        ref: element.tags?.ref ?? null,
        sourceUrl: `https://www.openstreetmap.org/${element.type}/${element.id}`,
      };
    })
    .filter(({ distanceKm }) => distanceKm <= 12)
    .sort((a, b) => a.distanceKm - b.distanceKm);
  return {
    circuitId: circuit.id,
    name: circuit.name,
    coordinates: circuit.coordinates,
    candidates,
  };
});

console.log(JSON.stringify(results, null, 2));
