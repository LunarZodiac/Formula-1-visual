#!/usr/bin/env node

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const { Client } = pg;
const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const registryPath = path.join(repositoryRoot, 'apps/web/app/data/track-geometry-registry.ts');
const geometrySources = [
  { path: path.join(repositoryRoot, 'apps/web/app/data/circuits.json'), dataset: 'project-digitized' },
  { path: path.join(repositoryRoot, 'apps/web/app/data/circuits-openstreetmap.json'), dataset: 'openstreetmap' },
  { path: path.join(repositoryRoot, 'apps/web/app/data/circuits-user-digitized.json'), dataset: 'project-digitized' },
];

function parseOptions(argv) {
  const seasonArgument = argv.find((value) => value.startsWith('--season='));
  return {
    season: Number(seasonArgument?.slice('--season='.length) ?? 2026),
    apply: argv.includes('--apply'),
  };
}

function parseRegistry(source) {
  const block = source.match(/export const circuitGeometryRegistry = \{([\s\S]*?)\} as const;/)?.[1] ?? '';
  return new Map(
    [...block.matchAll(/['"]?([\w-]+)['"]?:\s*'([^']+)'/g)]
      .map((match) => [match[1], match[2]]),
  );
}

function assertEnvironment() {
  const required = ['PGHOST', 'PGPORT', 'PGDATABASE', 'PGUSER', 'PGPASSWORD'];
  const missing = required.filter((name) => !process.env[name]);
  if (missing.length > 0) throw new Error(`Не заданы параметры базы: ${missing.join(', ')}`);
}

async function main() {
  assertEnvironment();
  const options = parseOptions(process.argv.slice(2));
  if (!Number.isInteger(options.season)) throw new Error('Сезон должен быть целым числом');

  const registry = parseRegistry(await readFile(registryPath, 'utf8'));
  const geometries = new Map();
  for (const source of geometrySources) {
    const collection = JSON.parse(await readFile(source.path, 'utf8'));
    for (const feature of collection.features) {
      geometries.set(feature.properties.id, { feature, dataset: source.dataset });
    }
  }

  const client = new Client({ application_name: 'f1-geovisual-atlas-track-layout-import' });
  await client.connect();
  try {
    const circuitsResult = await client.query(
      `SELECT DISTINCT circuit.id, circuit.name
       FROM atlas.races AS race
       JOIN atlas.circuits AS circuit ON circuit.id = race.circuit_id
       JOIN atlas.circuit_page_profiles AS profile ON profile.circuit_id = circuit.id
       WHERE race.season_year = $1
       ORDER BY circuit.id`,
      [options.season],
    );

    const candidates = circuitsResult.rows.map((circuit) => {
      const geometryId = registry.get(circuit.id);
      const geometry = geometryId ? geometries.get(geometryId) : null;
      return { ...circuit, geometryId, geometry };
    });
    const missing = candidates.filter((item) => !item.geometryId || !item.geometry);
    if (missing.length > 0) {
      throw new Error(`Нет геометрии: ${missing.map((item) => item.id).join(', ')}`);
    }

    if (!options.apply) {
      console.log(JSON.stringify({ season: options.season, candidates: candidates.length, apply: false }, null, 2));
      return;
    }

    await client.query('BEGIN');
    try {
      await client.query(
        `INSERT INTO atlas.data_sources (id, name, url, licence, notes)
         VALUES (
           'project_digitized_tracks',
           'Самостоятельная оцифровка трасс проекта',
           'local:apps/web/app/data/circuits.json',
           'Provided by project owner',
           'Контуры самостоятельно оцифрованы для проекта; внешний источник линии не заявляется'
         )
         ON CONFLICT (id) DO UPDATE SET
           name = EXCLUDED.name, url = EXCLUDED.url,
           licence = EXCLUDED.licence, notes = EXCLUDED.notes`,
      );

      for (const candidate of candidates) {
        const { feature, dataset } = candidate.geometry;
        const sourceId = dataset === 'openstreetmap' ? 'openstreetmap' : 'project_digitized_tracks';
        const provenanceType = dataset === 'openstreetmap' ? 'open_data' : 'user_digitized';
        const length = Number(feature.properties.length ?? feature.properties.expectedLength);
        await client.query(
          `INSERT INTO atlas.track_layouts (
             id, circuit_id, name, length_m, centerline, source_id,
             provenance_type, review_status, verified_at, metadata
           ) VALUES (
             $1, $2, $3, $4,
             ST_Force3D(ST_SetSRID(ST_GeomFromGeoJSON($5), 4326)),
             $6, $7, 'reviewed', now(), $8::jsonb
           )
           ON CONFLICT (id) DO UPDATE SET
             circuit_id = EXCLUDED.circuit_id,
             name = EXCLUDED.name,
             length_m = EXCLUDED.length_m,
             centerline = EXCLUDED.centerline,
             source_id = EXCLUDED.source_id,
             provenance_type = EXCLUDED.provenance_type,
             review_status = EXCLUDED.review_status,
             verified_at = EXCLUDED.verified_at,
             metadata = EXCLUDED.metadata,
             updated_at = now()`,
          [
            candidate.geometryId,
            candidate.id,
            feature.properties.name ?? feature.properties.Name ?? candidate.name,
            Number.isFinite(length) && length > 0 ? Math.round(length) : null,
            JSON.stringify(feature.geometry),
            sourceId,
            provenanceType,
            JSON.stringify({ dataset, importedForSeason: options.season, geometryId: candidate.geometryId }),
          ],
        );
        await client.query(
          `UPDATE atlas.circuit_page_profiles
           SET geometry_id = $2, updated_at = now()
           WHERE circuit_id = $1
             AND editorial_status = 'draft'`,
          [candidate.id, candidate.geometryId],
        );
        await client.query(
          `INSERT INTO atlas.circuit_page_profile_field_sources (
             circuit_id, field_name, source_id, editorial_status, verified_at, notes
           )
           SELECT $1, 'geometry_id', $2, 'verified', now(),
                  'Контур проверен как самостоятельная оцифровка проекта'
           FROM atlas.circuit_page_profiles
           WHERE circuit_id = $1 AND editorial_status = 'draft'
           ON CONFLICT (circuit_id, field_name) DO UPDATE SET
             source_id = EXCLUDED.source_id,
             editorial_status = EXCLUDED.editorial_status,
             verified_at = EXCLUDED.verified_at,
             notes = EXCLUDED.notes`,
          [candidate.id, sourceId],
        );
      }
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    }

    console.log(JSON.stringify({ season: options.season, imported: candidates.length, apply: true }, null, 2));
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(`Ошибка: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
