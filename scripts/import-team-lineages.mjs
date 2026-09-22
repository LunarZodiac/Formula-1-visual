#!/usr/bin/env node

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import pg from 'pg';

const requiredEnvironment = ['PGHOST', 'PGPORT', 'PGDATABASE', 'PGUSER', 'PGPASSWORD'];
const missingEnvironment = requiredEnvironment.filter((name) => !process.env[name]);
if (missingEnvironment.length) throw new Error(`Не заданы параметры базы: ${missingEnvironment.join(', ')}`);

const apply = process.argv.includes('--apply');
const registryPath = path.resolve(import.meta.dirname, '..', 'data', 'editorial', 'team-lineages.json');
const registry = JSON.parse(await readFile(registryPath, 'utf8'));
if (registry.schemaVersion !== 1 || !Array.isArray(registry.sources) || !Array.isArray(registry.lineages)) {
  throw new Error('Неверный формат реестра преемственности команд');
}

const allowedTypes = new Set(['rename', 'ownership_change', 'factory_takeover', 'licence_transfer', 'continuation', 'other']);
const sources = new Map();
for (const source of registry.sources) {
  if (!source.id || sources.has(source.id) || !source.name || !/^https:\/\//.test(source.url)
    || !/^\d{4}-\d{2}-\d{2}T/.test(source.retrievedAt)) {
    throw new Error(`Некорректный или повторяющийся источник: ${source.id ?? '—'}`);
  }
  sources.set(source.id, source);
}

const identities = new Set();
for (const lineage of registry.lineages) {
  const identity = `${lineage.predecessorId}:${lineage.successorId}:${lineage.relationshipType}:${lineage.validFromYear ?? 0}`;
  if (!lineage.predecessorId || !lineage.successorId || lineage.predecessorId === lineage.successorId
    || !allowedTypes.has(lineage.relationshipType) || identities.has(identity)
    || !sources.has(lineage.sourceId) || !lineage.descriptionRu?.trim()
    || !Number.isInteger(lineage.validFromYear) || lineage.validFromYear < 1950 || lineage.validFromYear > 2100
    || (lineage.validToYear !== undefined && (!Number.isInteger(lineage.validToYear) || lineage.validToYear < lineage.validFromYear))) {
    throw new Error(`Некорректная или повторяющаяся связь: ${identity}`);
  }
  identities.add(identity);
}

const client = new pg.Client({ application_name: 'f1-atlas-team-lineage-import' });
await client.connect();
try {
  const constructorIds = [...new Set(registry.lineages.flatMap((lineage) => [lineage.predecessorId, lineage.successorId]))];
  const constructorsResult = await client.query('SELECT id FROM atlas.constructors WHERE id = ANY($1::text[])', [constructorIds]);
  const existingIds = new Set(constructorsResult.rows.map((row) => row.id));
  const unknownIds = constructorIds.filter((id) => !existingIds.has(id));
  console.log(JSON.stringify({ mode: apply ? 'apply' : 'preview', sources: sources.size, lineages: registry.lineages.length, unknownIds }, null, 2));
  if (unknownIds.length) process.exitCode = 1;
  else if (!apply) console.log('Предпросмотр завершён. Для записи добавьте --apply');
  else {
    await client.query('BEGIN');
    try {
      for (const source of sources.values()) {
        await client.query(`INSERT INTO atlas.data_sources (id,name,url,licence,retrieved_at,notes)
          VALUES($1,$2,$3,'Reference only; editorial summary written independently',$4,'Официальный источник по преемственности команд')
          ON CONFLICT(id) DO UPDATE SET name=EXCLUDED.name,url=EXCLUDED.url,retrieved_at=EXCLUDED.retrieved_at,notes=EXCLUDED.notes`,
        [source.id, source.name, source.url, source.retrievedAt]);
      }
      await client.query('DELETE FROM atlas.constructor_lineage_links WHERE source_id = ANY($1::text[])', [[...sources.keys()]]);
      for (const lineage of registry.lineages) {
        const source = sources.get(lineage.sourceId);
        await client.query(`INSERT INTO atlas.constructor_lineage_links
          (predecessor_constructor_id,successor_constructor_id,relationship_type,valid_from_year,valid_to_year,description_ru,source_id,review_status,verified_at)
          VALUES($1,$2,$3,$4,$5,$6,$7,'published',$8)`, [lineage.predecessorId, lineage.successorId, lineage.relationshipType,
          lineage.validFromYear, lineage.validToYear ?? null, lineage.descriptionRu, lineage.sourceId, source.retrievedAt]);
      }
      await client.query('COMMIT');
      console.log(`Опубликовано связей: ${registry.lineages.length}`);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    }
  }
} finally {
  await client.end();
}
