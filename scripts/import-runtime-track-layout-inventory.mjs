#!/usr/bin/env node

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import pg from 'pg';

const required = ['PGHOST', 'PGPORT', 'PGDATABASE', 'PGUSER', 'PGPASSWORD'];
const missing = required.filter((name) => !process.env[name]);
if (missing.length) throw new Error(`Не заданы параметры базы: ${missing.join(', ')}`);

const root = path.resolve(import.meta.dirname, '..');
const registryPath = path.join(root, 'apps/web/app/data/track-geometry-registry.ts');
const geometrySources = [
  { path: path.join(root, 'apps/web/app/data/circuits.json'), dataset: 'project-digitized' },
  { path: path.join(root, 'apps/web/app/data/circuits-openstreetmap.json'), dataset: 'openstreetmap' },
  { path: path.join(root, 'apps/web/app/data/circuits-user-digitized.json'), dataset: 'project-digitized' },
];

function parseRegistry(source) {
  const defaultsBlock = source.match(/export const circuitGeometryRegistry = \{([\s\S]*?)\} as const;/)?.[1] ?? '';
  const defaults = new Map([...defaultsBlock.matchAll(/['"]?([\w-]+)['"]?:\s*'([^']+)'/g)].map((match) => [match[1], match[2]]));
  const periodsBlock = source.match(/export const circuitGeometryPeriods[\s\S]*?= \{([\s\S]*?)\n\};\n\nexport function/)?.[1] ?? '';
  const periods = new Map();
  for (const circuitMatch of periodsBlock.matchAll(/^\s{2}([\w-]+): \[([\s\S]*?)^\s{2}\],/gm)) {
    periods.set(circuitMatch[1], [...circuitMatch[2].matchAll(/geometryId: '([^']+)', from: (\d+), to: (\d+), label: '([^']+)'/g)].map((match) => ({
      geometryId: match[1], from: Number(match[2]), to: Number(match[3]), label: match[4],
    })));
  }
  return { defaults, periods };
}

function buildInventory(registry) {
  const entries = new Map();
  for (const [circuitId, geometryId] of registry.defaults) {
    entries.set(geometryId, { geometryId, circuitId, name: 'Основная конфигурация', from: null, to: null, periods: [] });
  }
  for (const [circuitId, periods] of registry.periods) {
    for (const period of periods) {
      const current = entries.get(period.geometryId) ?? {
        geometryId: period.geometryId, circuitId, name: period.label, from: period.from, to: period.to, periods: [],
      };
      if (current.circuitId !== circuitId) throw new Error(`Геометрия ${period.geometryId} назначена разным трассам`);
      current.name = period.label;
      current.from = current.from === null ? period.from : Math.min(current.from, period.from);
      current.to = current.to === null ? period.to : Math.max(current.to, period.to);
      current.periods.push({ from: period.from, to: period.to, label: period.label });
      entries.set(period.geometryId, current);
    }
  }
  return [...entries.values()].sort((left, right) => left.circuitId.localeCompare(right.circuitId) || left.geometryId.localeCompare(right.geometryId));
}

const apply = process.argv.includes('--apply');
const registry = parseRegistry(await readFile(registryPath, 'utf8'));
const geometries = new Map();
for (const source of geometrySources) {
  const collection = JSON.parse(await readFile(source.path, 'utf8'));
  for (const feature of collection.features) geometries.set(feature.properties.id, { feature, dataset: source.dataset });
}
const inventory = buildInventory(registry);
const missingGeometry = inventory.filter((entry) => !geometries.has(entry.geometryId));
if (missingGeometry.length) throw new Error(`В runtime-реестре отсутствуют линии: ${missingGeometry.map((entry) => entry.geometryId).join(', ')}`);

if (!apply) {
  console.log(JSON.stringify({ apply: false, layouts: inventory.length, circuits: new Set(inventory.map((entry) => entry.circuitId)).size }, null, 2));
  process.exit(0);
}

const client = new pg.Client({ application_name: 'f1-geovisual-atlas-runtime-layout-inventory' });
await client.connect();
try {
  await client.query('BEGIN');
  await client.query(`
    INSERT INTO atlas.data_sources (id, name, url, licence, notes)
    VALUES
      ('project_runtime_tracks', 'Локальный реестр геометрий трасс', 'local:apps/web/app/data/track-geometry-registry.ts', 'Требует проверки для публикации', 'Рабочие контуры и исторические периоды из runtime-реестра'),
      ('project_digitized_tracks', 'Самостоятельная оцифровка трасс проекта', 'local:apps/web/app/data/circuits.json', 'Provided by project owner', 'Контуры самостоятельно оцифрованы для проекта'),
      ('openstreetmap', 'OpenStreetMap contributors', 'https://www.openstreetmap.org/copyright', 'ODbL 1.0', 'Геометрии, производные от данных OpenStreetMap')
    ON CONFLICT (id) DO NOTHING
  `);
  let inserted = 0;
  let preserved = 0;
  for (const entry of inventory) {
    const geometry = geometries.get(entry.geometryId);
    const feature = geometry.feature;
    const length = Number(feature.properties.length ?? feature.properties.expectedLength);
    const sourceId = geometry.dataset === 'openstreetmap' ? 'openstreetmap' : 'project_digitized_tracks';
    const provenanceType = geometry.dataset === 'openstreetmap' ? 'open_data' : 'user_digitized';
    const result = await client.query(`
      INSERT INTO atlas.track_layouts (
        id, circuit_id, name, valid_from_year, valid_to_year, length_m, centerline,
        source_id, metadata, provenance_type, review_status, verified_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6,
        ST_Force3D(ST_SetSRID(ST_GeomFromGeoJSON($7), 4326)),
        $8, $9::jsonb, $10, 'candidate', NULL
      )
      ON CONFLICT (id) DO NOTHING
      RETURNING id
    `, [
      entry.geometryId, entry.circuitId, entry.name, entry.from, entry.to,
      Number.isFinite(length) && length > 0 ? Math.round(length) : null,
      JSON.stringify(feature.geometry), sourceId,
      JSON.stringify({
        importedFromRuntimeRegistry: true,
        geometryStatus: 'candidate',
        assignmentStatus: 'blocked_until_geometry_review',
        dataset: geometry.dataset,
        declaredPeriods: entry.periods,
      }),
      provenanceType,
    ]);
    if (result.rowCount) inserted += 1; else preserved += 1;
  }
  await client.query('COMMIT');
  console.log(JSON.stringify({ apply: true, inventory: inventory.length, inserted, preserved }, null, 2));
} catch (error) {
  await client.query('ROLLBACK');
  throw error;
} finally {
  await client.end();
}
