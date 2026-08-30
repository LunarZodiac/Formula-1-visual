import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const registryPath = path.join(repositoryRoot, 'apps/web/app/data/track-geometry-registry.ts');
const defaultCatalogPath = path.join(repositoryRoot, 'tmp/f1-layout-catalog.json');
const catalogPath = process.argv[2]
  ? path.resolve(process.cwd(), process.argv[2])
  : defaultCatalogPath;

const externalToInternalIds = {
  aida: 'okayama',
  austin: 'americas',
  'brands-hatch': 'brands_hatch',
  'buenos-aires': 'galvez',
  bugatti: 'lemans',
  'caesars-palace': 'las_vegas',
  'clermont-ferrand': 'charade',
  'east-london': 'george',
  'las-vegas': 'vegas',
  'long-beach': 'long_beach',
  lusail: 'losail',
  'magny-cours': 'magny_cours',
  'marina-bay': 'marina_bay',
  melbourne: 'albert_park',
  'mexico-city': 'rodriguez',
  'mont-tremblant': 'tremblant',
  montreal: 'villeneuve',
  'paul-ricard': 'ricard',
  porto: 'boavista',
  rouen: 'essarts',
  'spa-francorchamps': 'spa',
  spielberg: 'red_bull_ring',
  'watkins-glen': 'watkins_glen',
  'yas-marina': 'yas_marina',
};

function parseRegistry(source) {
  const registryBlock = source.match(
    /export const circuitGeometryRegistry = \{([\s\S]*?)\} as const;/,
  )?.[1] ?? '';
  const registry = new Map(
    [...registryBlock.matchAll(/['"]?([\w-]+)['"]?:\s*'([^']+)'/g)]
      .map((match) => [match[1], match[2]]),
  );
  const periodsBlock = source.match(
    /export const circuitGeometryPeriods[\s\S]*?= \{([\s\S]*?)\n\};\n\nexport function/,
  )?.[1] ?? '';
  const periodGeometryIds = new Map();
  for (const circuitMatch of periodsBlock.matchAll(/^\s{2}([\w-]+): \[([\s\S]*?)^\s{2}\],/gm)) {
    periodGeometryIds.set(
      circuitMatch[1],
      [...circuitMatch[2].matchAll(/geometryId: '([^']+)'/g)].map((match) => match[1]),
    );
  }
  return { registry, periodGeometryIds };
}

const [catalogSource, registrySource] = await Promise.all([
  readFile(catalogPath, 'utf8'),
  readFile(registryPath, 'utf8'),
]);
const catalog = JSON.parse(catalogSource);
const { registry, periodGeometryIds } = parseRegistry(registrySource);

const circuits = catalog.map((entry) => {
  const circuitId = externalToInternalIds[entry.id] ?? entry.id;
  const geometryIds = new Set([
    registry.get(circuitId),
    ...(periodGeometryIds.get(circuitId) ?? []),
  ].filter(Boolean));
  const expectedLayouts = entry.layouts.map(({ layoutId, seasons }) => ({ layoutId, seasons }));
  return {
    circuitId,
    name: entry.name,
    expectedLayouts,
    availableGeometryIds: [...geometryIds],
    missingLayoutCount: Math.max(0, expectedLayouts.length - geometryIds.size),
    status: !registry.has(circuitId)
      ? 'missing-circuit'
      : geometryIds.size < expectedLayouts.length
        ? 'missing-layouts'
        : 'covered-by-count-needs-period-verification',
  };
});

const report = {
  source: 'https://github.com/julesr0y/f1-circuits-svg',
  sourceLicense: 'CC-BY-4.0',
  catalogCircuits: circuits.length,
  registeredCircuits: circuits.filter(({ availableGeometryIds }) => availableGeometryIds.length > 0).length,
  circuitsMissingCompletely: circuits.filter(({ status }) => status === 'missing-circuit').length,
  circuitsWithMissingLayouts: circuits.filter(({ status }) => status === 'missing-layouts').length,
  strictHistoricalCatalogGap: circuits.reduce((sum, item) => sum + item.missingLayoutCount, 0),
  scopeNote: 'Расширенный исторический максимум, не текущая очередь импорта',
  gaps: circuits.filter(({ status }) => status !== 'covered-by-count-needs-period-verification'),
};

console.log(JSON.stringify(report, null, 2));
