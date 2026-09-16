#!/usr/bin/env node

import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import pg from 'pg';

const required = ['PGHOST', 'PGPORT', 'PGDATABASE', 'PGUSER', 'PGPASSWORD'];
const missing = required.filter((name) => !process.env[name]);
if (missing.length) throw new Error(`Не заданы параметры базы: ${missing.join(', ')}`);

const repositoryRoot = path.resolve(import.meta.dirname, '..');
const registryPath = path.join(repositoryRoot, 'apps', 'web', 'app', 'data', 'track-geometry-registry.ts');
const reportPath = path.join(repositoryRoot, 'data', 'review', 'historical-layout-audit.json');

function parseRegistry(source) {
  const registryBlock = source.match(/export const circuitGeometryRegistry = \{([\s\S]*?)\} as const;/)?.[1] ?? '';
  const defaults = new Map([...registryBlock.matchAll(/['"]?([\w-]+)['"]?:\s*'([^']+)'/g)].map((match) => [match[1], match[2]]));
  const periodsBlock = source.match(/export const circuitGeometryPeriods[\s\S]*?= \{([\s\S]*?)\n\};\n\nexport function/)?.[1] ?? '';
  const periods = new Map();
  for (const circuitMatch of periodsBlock.matchAll(/^\s{2}([\w-]+): \[([\s\S]*?)^\s{2}\],/gm)) {
    periods.set(circuitMatch[1], [...circuitMatch[2].matchAll(/geometryId: '([^']+)', from: (\d+), to: (\d+), label: '([^']+)'/g)].map((match) => ({ geometryId: match[1], from: Number(match[2]), to: Number(match[3]), label: match[4] })));
  }
  return { defaults, periods };
}

function compressYears(years) {
  const sorted = [...new Set(years.map(Number))].sort((left, right) => left - right);
  const ranges = [];
  let start = sorted[0];
  let previous = sorted[0];
  for (const year of sorted.slice(1)) {
    if (year === previous + 1) { previous = year; continue; }
    ranges.push(start === previous ? String(start) : `${start}–${previous}`);
    start = year; previous = year;
  }
  if (start !== undefined) ranges.push(start === previous ? String(start) : `${start}–${previous}`);
  return ranges.join(', ');
}

const registry = parseRegistry(await readFile(registryPath, 'utf8'));
const client = new pg.Client({ application_name: 'f1-geovisual-atlas-historical-layout-audit' });
await client.connect();
try {
  const raceStats = await client.query(`
    SELECT circuit.id, circuit.name,
           count(race.id)::integer AS race_count,
           count(race.layout_id)::integer AS assigned_races,
           array_agg(DISTINCT race.season_year ORDER BY race.season_year) AS seasons
    FROM atlas.circuits AS circuit
    JOIN atlas.races AS race ON race.circuit_id = circuit.id
    GROUP BY circuit.id, circuit.name
    ORDER BY circuit.id
  `);
  const layoutsResult = await client.query(`
    SELECT id, circuit_id, name, valid_from_year, valid_to_year, length_m,
           centerline IS NOT NULL AS has_geometry,
           source_id, provenance_type, review_status, verified_at
    FROM atlas.track_layouts
    ORDER BY circuit_id, valid_from_year NULLS FIRST, id
  `);
  const invalidAssignments = await client.query(`
    SELECT race.id AS race_id, race.season_year, race.circuit_id, race.layout_id,
           layout.valid_from_year, layout.valid_to_year,
           layout.centerline IS NOT NULL AS has_geometry,
           layout.provenance_type, layout.review_status
    FROM atlas.races AS race
    JOIN atlas.track_layouts AS layout ON layout.id = race.layout_id
    WHERE (layout.valid_from_year IS NOT NULL AND race.season_year < layout.valid_from_year)
       OR (layout.valid_to_year IS NOT NULL AND race.season_year > layout.valid_to_year)
       OR layout.centerline IS NULL
       OR layout.provenance_type = 'unknown'
       OR layout.review_status NOT IN ('reviewed', 'published')
    ORDER BY race.season_year, race.round
  `);
  const ambiguousCandidates = await client.query(`
    SELECT race.id AS race_id, race.season_year, race.circuit_id,
           array_agg(layout.id ORDER BY layout.id) AS candidate_layout_ids
    FROM atlas.races AS race
    JOIN atlas.track_layouts AS layout ON layout.circuit_id = race.circuit_id
      AND (layout.valid_from_year IS NULL OR layout.valid_from_year <= race.season_year)
      AND (layout.valid_to_year IS NULL OR layout.valid_to_year >= race.season_year)
    GROUP BY race.id, race.season_year, race.circuit_id
    HAVING count(layout.id) > 1
    ORDER BY race.season_year, race.id
  `);

  const layoutsByCircuit = layoutsResult.rows.reduce((groups, layout) => {
    (groups[layout.circuit_id] ??= []).push(layout);
    return groups;
  }, {});
  const circuits = raceStats.rows.map((row) => {
    const layouts = layoutsByCircuit[row.id] ?? [];
    const periods = registry.periods.get(row.id) ?? [];
    const raceCount = Number(row.race_count);
    const assignedRaces = Number(row.assigned_races);
    const reviewedLayouts = layouts.filter((layout) => layout.has_geometry && layout.provenance_type !== 'unknown' && ['reviewed', 'published'].includes(layout.review_status)).length;
    return {
      circuitId: row.id,
      name: row.name,
      raceCount,
      seasons: compressYears(row.seasons),
      firstSeason: Number(row.seasons[0]),
      lastSeason: Number(row.seasons[row.seasons.length - 1]),
      assignedRaces,
      unassignedRaces: raceCount - assignedRaces,
      databaseLayouts: layouts.length,
      reviewedLayouts,
      layoutInventory: layouts.map((layout) => ({
        id: layout.id,
        name: layout.name,
        validFromYear: layout.valid_from_year,
        validToYear: layout.valid_to_year,
        lengthM: layout.length_m,
        hasGeometry: layout.has_geometry,
        sourceId: layout.source_id,
        provenanceType: layout.provenance_type,
        reviewStatus: layout.review_status,
        verifiedAt: layout.verified_at,
      })),
      runtimeDefaultGeometryId: registry.defaults.get(row.id) ?? null,
      runtimeHistoricalPeriods: periods,
      status: layouts.length === 0
        ? 'missing-layout-inventory'
        : assignedRaces < raceCount
          ? 'race-layout-assignment-required'
          : reviewedLayouts < layouts.length
            ? 'layout-review-required'
            : periods.length > 1 || layouts.length > 1
              ? 'ready-for-evolution-review'
              : 'single-layout-reviewed',
    };
  });
  const report = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    scope: 'Исторические конфигурации этапов чемпионата мира Formula 1 в загруженной базе',
    methodology: [
      'Каждый этап должен ссылаться на конкретную конфигурацию, использовавшуюся в соответствующем сезоне',
      'Период действия конфигурации должен включать сезон этапа',
      'Для публикации требуются геометрия, подтверждённое происхождение и review_status reviewed/published',
      'Наличие одного современного контура не считается доказательством исторической точности',
    ],
    summary: {
      circuits: circuits.length,
      races: circuits.reduce((sum, circuit) => sum + circuit.raceCount, 0),
      assignedRaces: circuits.reduce((sum, circuit) => sum + circuit.assignedRaces, 0),
      unassignedRaces: circuits.reduce((sum, circuit) => sum + circuit.unassignedRaces, 0),
      databaseLayouts: layoutsResult.rows.length,
      reviewedDatabaseLayouts: layoutsResult.rows.filter((layout) => layout.has_geometry && layout.provenance_type !== 'unknown' && ['reviewed', 'published'].includes(layout.review_status)).length,
      runtimeRegisteredCircuits: registry.defaults.size,
      runtimeCircuitsWithExplicitPeriods: registry.periods.size,
      circuitsMissingLayoutInventory: circuits.filter((circuit) => circuit.databaseLayouts === 0).length,
      circuitsRequiringRaceAssignments: circuits.filter((circuit) => circuit.unassignedRaces > 0).length,
      invalidAssignedRaces: invalidAssignments.rows.length,
      ambiguousCandidateRaces: ambiguousCandidates.rows.length,
    },
    priorityQueue: [...circuits].sort((left, right) => right.raceCount - left.raceCount || left.circuitId.localeCompare(right.circuitId)),
    invalidAssignments: invalidAssignments.rows,
    ambiguousCandidates: ambiguousCandidates.rows,
  };
  await mkdir(path.dirname(reportPath), { recursive: true });
  const temporaryPath = `${reportPath}.tmp-${process.pid}`;
  await writeFile(temporaryPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  await rename(temporaryPath, reportPath);
  console.log(JSON.stringify({ ...report.summary, reportPath: path.relative(repositoryRoot, reportPath) }, null, 2));
} finally {
  await client.end();
}
