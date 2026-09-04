import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const snapshotsDirectory = path.join(repositoryRoot, 'apps/web/public/data/f1');
const registryPath = path.join(repositoryRoot, 'apps/web/app/data/track-geometry-registry.ts');
const reportPath = path.join(repositoryRoot, 'data/review/track-geometry-coverage.json');
const geometrySources = [
  {
    path: path.join(repositoryRoot, 'apps/web/app/data/circuits.json'),
    dataset: 'project-digitized', source: 'Самостоятельная оцифровка трасс проекта',
    licence: 'Provided by project owner', provenanceStatus: 'documented-local',
  },
  {
    path: path.join(repositoryRoot, 'apps/web/app/data/circuits-openstreetmap.json'),
    dataset: 'openstreetmap', source: 'OpenStreetMap contributors',
    licence: 'ODbL 1.0', provenanceStatus: 'documented',
  },
  {
    path: path.join(repositoryRoot, 'apps/web/app/data/circuits-user-digitized.json'),
    dataset: 'user-digitized', source: 'User-provided digitisation',
    licence: 'User-provided', provenanceStatus: 'documented-local',
  },
];

function compressYears(years) {
  const sorted = [...new Set(years)].sort((a, b) => a - b);
  const ranges = [];
  let start = sorted[0];
  let previous = sorted[0];
  for (const year of sorted.slice(1)) {
    if (year === previous + 1) {
      previous = year;
      continue;
    }
    ranges.push(start === previous ? String(start) : `${start}–${previous}`);
    start = year;
    previous = year;
  }
  if (start !== undefined) ranges.push(start === previous ? String(start) : `${start}–${previous}`);
  return ranges.join(', ');
}

function parseRegistry(source) {
  const registryBlock = source.match(
    /export const circuitGeometryRegistry = \{([\s\S]*?)\} as const;/,
  )?.[1] ?? '';
  return new Map(
    [...registryBlock.matchAll(/['"]?([\w-]+)['"]?:\s*'([^']+)'/g)]
      .map((match) => [match[1], match[2]]),
  );
}

function parsePeriods(source) {
  const periodsBlock = source.match(
    /export const circuitGeometryPeriods[\s\S]*?= \{([\s\S]*?)\n\};\n\nexport function/,
  )?.[1] ?? '';
  const periods = new Map();
  for (const circuitMatch of periodsBlock.matchAll(/^\s{2}([\w-]+): \[([\s\S]*?)^\s{2}\],/gm)) {
    periods.set(
      circuitMatch[1],
      [...circuitMatch[2].matchAll(
        /geometryId: '([^']+)', from: (\d+), to: (\d+), label: '([^']+)'/g,
      )].map((match) => ({
        geometryId: match[1],
        from: Number(match[2]),
        to: Number(match[3]),
        label: match[4],
      })),
    );
  }
  return periods;
}

const snapshotFiles = (await readdir(snapshotsDirectory))
  .filter((name) => /^season-\d{4}\.json$/.test(name))
  .sort();
const appearances = new Map();
for (const snapshotFile of snapshotFiles) {
  const snapshot = JSON.parse(await readFile(path.join(snapshotsDirectory, snapshotFile), 'utf8'));
  for (const event of snapshot.calendar) {
    const appearance = appearances.get(event.circuit.id) ?? {
      id: event.circuit.id,
      name: event.circuit.name,
      seasons: [],
      coordinates: event.circuit.coordinates,
    };
    appearance.seasons.push(snapshot.season);
    appearances.set(event.circuit.id, appearance);
  }
}

const registrySource = await readFile(registryPath, 'utf8');
const registry = parseRegistry(registrySource);
const periods = parsePeriods(registrySource);
const geometries = new Map();
for (const geometrySource of geometrySources) {
  const collection = JSON.parse(await readFile(geometrySource.path, 'utf8'));
  for (const feature of collection.features) {
    geometries.set(feature.properties.id, {
      properties: feature.properties,
      dataset: geometrySource.dataset,
      source: feature.properties.source ?? geometrySource.source,
      licence: feature.properties.license ?? geometrySource.licence,
      provenanceStatus: geometrySource.provenanceStatus,
    });
  }
}

const missingCircuits = [];
const missingPeriods = [];
for (const appearance of [...appearances.values()].sort((a, b) => a.id.localeCompare(b.id))) {
  const defaultGeometryId = registry.get(appearance.id);
  if (!defaultGeometryId) {
    missingCircuits.push({ ...appearance, years: compressYears(appearance.seasons) });
    continue;
  }
  const circuitPeriods = periods.get(appearance.id);
  if (!circuitPeriods) continue;
  const uncoveredYears = appearance.seasons.filter(
    (year) => !circuitPeriods.some((period) => year >= period.from && year <= period.to),
  );
  if (uncoveredYears.length > 0) {
    missingPeriods.push({ ...appearance, seasons: uncoveredYears, years: compressYears(uncoveredYears) });
  }
}

const brokenReferences = [...registry.entries()]
  .filter(([, geometryId]) => !geometries.has(geometryId))
  .map(([circuitId, geometryId]) => ({ circuitId, geometryId }));
for (const [circuitId, circuitPeriods] of periods) {
  for (const period of circuitPeriods) {
    if (!geometries.has(period.geometryId)) {
      brokenReferences.push({ circuitId, geometryId: period.geometryId });
    }
  }
}

const report = {
  scopeNote: 'Проверяет техническую разрешимость runtime-геометрии, но не подтверждает историческую точность и связь races.layout_id. Для этого используется audit-historical-layouts.mjs.',
  seasons: snapshotFiles.length,
  uniqueCircuits: appearances.size,
  registeredCircuits: [...appearances.keys()].filter((id) => registry.has(id)).length,
  automaticallyCoveredCircuits: appearances.size - missingCircuits.length - missingPeriods.length,
  unresolvedGeometryProvenance: [...registry.values()].filter((geometryId) => (
    geometries.get(geometryId)?.provenanceStatus === 'unresolved'
  )).length,
  registeredGeometries: [...registry.entries()].map(([circuitId, geometryId]) => ({
    circuitId,
    geometryId,
    length: geometries.get(geometryId)?.properties.length ?? null,
    years: compressYears(appearances.get(circuitId)?.seasons ?? []),
    dataset: geometries.get(geometryId)?.dataset ?? null,
    source: geometries.get(geometryId)?.source ?? null,
    licence: geometries.get(geometryId)?.licence ?? null,
    provenanceStatus: geometries.get(geometryId)?.provenanceStatus ?? 'missing',
  })),
  missingCircuits,
  missingPeriods,
  invalidCoordinates: [...appearances.values()]
    .filter(({ coordinates }) => (
      !Array.isArray(coordinates)
      || coordinates.length !== 2
      || !Number.isFinite(coordinates[0])
      || !Number.isFinite(coordinates[1])
      || Math.abs(coordinates[0]) > 180
      || Math.abs(coordinates[1]) > 90
    ))
    .map(({ id, name, coordinates }) => ({ id, name, coordinates })),
  brokenReferences,
};

await mkdir(path.dirname(reportPath), { recursive: true });
await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({
  scopeNote: report.scopeNote,
  seasons: report.seasons,
  uniqueCircuits: report.uniqueCircuits,
  registeredCircuits: report.registeredCircuits,
  automaticallyCoveredCircuits: report.automaticallyCoveredCircuits,
  unresolvedGeometryProvenance: report.unresolvedGeometryProvenance,
  missingCircuits: report.missingCircuits.length,
  missingPeriods: report.missingPeriods.length,
  invalidCoordinates: report.invalidCoordinates.length,
  brokenReferences: report.brokenReferences.length,
  reportPath: path.relative(repositoryRoot, reportPath),
}, null, 2));
if (brokenReferences.length > 0) process.exitCode = 1;
