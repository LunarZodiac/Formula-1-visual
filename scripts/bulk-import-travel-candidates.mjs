#!/usr/bin/env node

import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import pg from 'pg';
import { discoverTravelCandidates, travelImportGroups } from './lib/travel-candidate-discovery.mjs';

const shouldApply = process.argv.includes('--apply');
const includeExisting = process.argv.includes('--include-existing');
const retryIncomplete = process.argv.includes('--retry-incomplete');
const circuitArgument = process.argv.find((value) => value.startsWith('--circuit='))?.slice(10)
  ?? (process.argv.includes('--circuit') ? process.argv[process.argv.indexOf('--circuit') + 1] : null);
const limitArgument = process.argv.find((value) => value.startsWith('--limit='))?.slice(8) ?? '80';
const limit = Number(limitArgument);
const timeoutArgument = process.argv.find((value) => value.startsWith('--timeout='))?.slice(10) ?? '15';
const timeoutSeconds = Number(timeoutArgument);

if (!shouldApply || !Number.isInteger(limit) || limit < 10 || limit > 200 || !Number.isInteger(timeoutSeconds) || timeoutSeconds < 5 || timeoutSeconds > 60) {
  console.error('Использование: node bulk-import-travel-candidates.mjs --apply [--limit=80] [--timeout=15] [--circuit=id] [--include-existing] [--retry-incomplete]');
  process.exit(1);
}
if (circuitArgument && !/^[A-Za-z0-9_-]+$/.test(circuitArgument)) throw new Error('Некорректный ID трассы');

const requiredEnvironment = ['PGHOST', 'PGPORT', 'PGDATABASE', 'PGUSER', 'PGPASSWORD'];
const missingEnvironment = requiredEnvironment.filter((name) => !process.env[name]);
if (missingEnvironment.length) throw new Error(`Не заданы параметры базы: ${missingEnvironment.join(', ')}`);

const roleWeights = { transport: 15, stay: 20, explore: 25, essential: 20 };

function balancedCandidates(candidates, maximum) {
  const selected = [];
  const selectedIds = new Set();
  for (const role of travelImportGroups) {
    const cap = Math.max(1, Math.round(maximum * roleWeights[role] / 80));
    const categoryBuckets = new Map();
    for (const candidate of candidates.filter((item) => item.role === role)) {
      const bucket = categoryBuckets.get(candidate.categoryId) ?? [];
      bucket.push(candidate);
      categoryBuckets.set(candidate.categoryId, bucket);
    }
    let added = 0;
    let offset = 0;
    const buckets = [...categoryBuckets.values()];
    while (added < cap && buckets.some((bucket) => offset < bucket.length)) {
      for (const bucket of buckets) {
        const candidate = bucket[offset];
        if (!candidate || selectedIds.has(candidate.id)) continue;
        selected.push(candidate);
        selectedIds.add(candidate.id);
        added += 1;
        if (added >= cap) break;
      }
      offset += 1;
    }
  }
  for (const candidate of candidates) {
    if (selected.length >= maximum) break;
    if (selectedIds.has(candidate.id)) continue;
    selected.push(candidate);
    selectedIds.add(candidate.id);
  }
  return selected.slice(0, maximum);
}

async function saveCandidates(client, circuitId, candidates, discoveredCount, failedGroups, requestedGroups) {
  const runId = `bulk-${randomUUID()}`;
  await client.query('BEGIN');
  try {
    await client.query(
      `DELETE FROM atlas.circuit_travel_pois AS link
       USING atlas.tourism_pois AS poi
       WHERE link.circuit_id=$1 AND poi.id=link.poi_id AND poi.review_status='candidate'
         AND poi.properties->>'importedVia'='bulk-travel-wizard-v1'
         AND NOT (link.poi_id=ANY($2::text[]))`,
      [circuitId, candidates.map((candidate) => candidate.id)],
    );
    await client.query(
      `INSERT INTO atlas.travel_import_runs
       (id,circuit_id,provider,parameters,status,discovered_count,imported_count,failed_groups,applied_at)
       VALUES($1,$2,'openstreetmap',$3::jsonb,'imported',$4,$5,$6,now())`,
      [runId, circuitId, JSON.stringify({ mode: 'bulk-v1', limit: candidates.length, groups: requestedGroups }), discoveredCount, candidates.length, failedGroups],
    );
    for (const candidate of candidates) {
      await client.query(
        `INSERT INTO atlas.tourism_pois
         (id,category_id,name,location,address,website_url,opening_hours,importance,wheelchair_access,review_status,source_id,properties,updated_at)
         VALUES($1,$2,$3,ST_SetSRID(ST_MakePoint($4,$5),4326)::geography,$6,$7,$8,$9,'unknown','candidate','openstreetmap',$10::jsonb,now())
         ON CONFLICT(id) DO UPDATE SET
           category_id=EXCLUDED.category_id,name=EXCLUDED.name,location=EXCLUDED.location,address=EXCLUDED.address,
           website_url=EXCLUDED.website_url,opening_hours=EXCLUDED.opening_hours,importance=EXCLUDED.importance,
           properties=EXCLUDED.properties,updated_at=now()
         WHERE atlas.tourism_pois.review_status='candidate'`,
        [candidate.id, candidate.categoryId, candidate.name, candidate.longitude, candidate.latitude,
          candidate.address, candidate.websiteUrl, candidate.openingHours, candidate.importance,
          JSON.stringify({ osm: candidate.externalId, tags: candidate.tags, importedVia: 'bulk-travel-wizard-v1' })],
      );
      await client.query(
        `INSERT INTO atlas.circuit_travel_pois
         (circuit_id,poi_id,role,priority,distance_to_circuit_m,source_id)
         VALUES($1,$2,$3,$4,$5,'openstreetmap')
         ON CONFLICT(circuit_id,poi_id) DO UPDATE SET
           role=EXCLUDED.role,priority=EXCLUDED.priority,distance_to_circuit_m=EXCLUDED.distance_to_circuit_m,updated_at=now()
         WHERE atlas.circuit_travel_pois.source_id='openstreetmap' AND NOT atlas.circuit_travel_pois.is_featured`,
        [circuitId, candidate.id, candidate.role, candidate.importance, candidate.distanceToCircuitM],
      );
      await client.query(
        `INSERT INTO atlas.external_identifiers(provider,entity_type,entity_id,external_id)
         VALUES('openstreetmap','tourism_poi',$1,$2)
         ON CONFLICT(provider,entity_type,external_id) DO UPDATE SET entity_id=EXCLUDED.entity_id`,
        [candidate.id, candidate.externalId],
      );
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  }
  return runId;
}

async function loadExistingBulkCandidates(client, circuitId) {
  const result = await client.query(
    `SELECT poi.id,poi.category_id,poi.name,ST_Y(poi.location::geometry) AS latitude,
            ST_X(poi.location::geometry) AS longitude,poi.address,poi.website_url,poi.opening_hours,
            poi.importance,link.role,link.distance_to_circuit_m,poi.properties
     FROM atlas.circuit_travel_pois AS link
     JOIN atlas.tourism_pois AS poi ON poi.id=link.poi_id
     WHERE link.circuit_id=$1 AND poi.review_status='candidate'
       AND poi.properties->>'importedVia'='bulk-travel-wizard-v1'`,
    [circuitId],
  );
  return result.rows.map((row) => ({
    id: String(row.id), externalId: String(row.properties?.osm ?? ''), categoryId: String(row.category_id),
    role: String(row.role), name: String(row.name), latitude: Number(row.latitude), longitude: Number(row.longitude),
    distanceToCircuitM: Number(row.distance_to_circuit_m), websiteUrl: row.website_url,
    openingHours: row.opening_hours, address: row.address, importance: Number(row.importance),
    tags: row.properties?.tags ?? {},
  }));
}

const repositoryRoot = path.resolve(import.meta.dirname, '..');
const reportPath = path.join(repositoryRoot, 'data', 'review', 'travel-bulk-import-progress.json');
const client = new pg.Client({ application_name: 'f1-geovisual-atlas-travel-bulk-import' });
const report = { startedAt: new Date().toISOString(), finishedAt: null, stopReason: null, limit, circuits: [], totals: { discovered: 0, imported: 0, failed: 0 } };

function recordCircuit(entry) {
  const index = report.circuits.findIndex((item) => item.id === entry.id);
  if (index >= 0 && entry.status === 'failed' && report.circuits[index].status === 'imported') {
    report.circuits[index] = { ...report.circuits[index], lastRetryError: entry.error };
  } else if (index >= 0) {
    report.circuits[index] = entry;
  } else {
    report.circuits.push(entry);
  }
  report.circuits.sort((left, right) => left.id.localeCompare(right.id));
  report.totals = report.circuits.reduce((totals, item) => ({
    discovered: totals.discovered + Number(item.discovered ?? 0),
    imported: totals.imported + Number(item.imported ?? 0),
    failed: totals.failed + (item.status === 'failed' ? 1 : 0),
  }), { discovered: 0, imported: 0, failed: 0 });
}

async function persistReport() {
  await mkdir(path.dirname(reportPath), { recursive: true });
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
}

await client.connect();
try {
  const circuitsResult = await client.query(
    `SELECT circuit.id,coalesce(profile.name_ru,circuit.short_name,circuit.name) AS name,
            count(link.poi_id)::int AS point_count,
            count(link.poi_id) FILTER (WHERE link.role='transport')::int AS transport_count,
            count(link.poi_id) FILTER (WHERE link.role='stay')::int AS stay_count,
            count(link.poi_id) FILTER (WHERE link.role='explore')::int AS explore_count,
            count(link.poi_id) FILTER (WHERE link.role='essential')::int AS essential_count,
            coalesce((SELECT run.failed_groups FROM atlas.travel_import_runs AS run
              WHERE run.circuit_id=circuit.id AND run.provider='openstreetmap' AND run.status='imported'
              ORDER BY run.applied_at DESC NULLS LAST,run.created_at DESC LIMIT 1),ARRAY[]::text[]) AS latest_failed_groups,
            EXISTS(
              SELECT 1 FROM atlas.travel_import_runs AS run
              WHERE run.circuit_id=circuit.id AND run.provider='openstreetmap' AND run.status='imported'
                AND run.parameters->>'mode'='bulk-v1' AND cardinality(run.failed_groups)=0
            ) AS bulk_complete
     FROM atlas.circuits AS circuit
     LEFT JOIN atlas.circuit_page_profiles AS profile ON profile.circuit_id=circuit.id
     LEFT JOIN atlas.circuit_travel_pois AS link ON link.circuit_id=circuit.id
     WHERE ($1::text IS NULL OR circuit.id=$1)
     GROUP BY circuit.id,profile.name_ru
     ORDER BY circuit.id`,
    [circuitArgument],
  );
  const previousRuns = await client.query(
    `SELECT DISTINCT ON (run.circuit_id) run.id, run.circuit_id,
            coalesce(profile.name_ru,circuit.short_name,circuit.name) AS name,
            run.discovered_count, run.imported_count, run.failed_groups
     FROM atlas.travel_import_runs AS run
     JOIN atlas.circuits AS circuit ON circuit.id=run.circuit_id
     LEFT JOIN atlas.circuit_page_profiles AS profile ON profile.circuit_id=circuit.id
     WHERE run.provider='openstreetmap' AND run.status='imported'
       AND run.parameters->>'mode'='bulk-v1'
     ORDER BY run.circuit_id,run.applied_at DESC NULLS LAST,run.created_at DESC`,
  );
  previousRuns.rows.forEach((run) => recordCircuit({
    id: run.circuit_id, name: run.name, status: 'imported', discovered: Number(run.discovered_count),
    imported: Number(run.imported_count), failedGroups: run.failed_groups, runId: run.id,
  }));
  const circuits = circuitsResult.rows.filter((row) => {
    if (circuitArgument || includeExisting) return true;
    if (!retryIncomplete) return !row.bulk_complete && Number(row.point_count) < 200;
    const groupCounts = travelImportGroups.map(group => Number(row[`${group}_count`]));
    return Number(row.point_count) < 70 || groupCounts.some(count => count < 3);
  });
  console.log(`К обработке: ${circuits.length} трасс`);
  let consecutiveFailures = 0;
  for (const [index, circuit] of circuits.entries()) {
    console.log(`[${index + 1}/${circuits.length}] ${circuit.name} (${circuit.id})`);
    try {
      const requestedGroups = retryIncomplete
        ? travelImportGroups.filter(group => Number(circuit[`${group}_count`]) < 3)
        : travelImportGroups;
      const result = await discoverTravelCandidates(client, {
        circuitId: circuit.id,
        groups: requestedGroups.length ? requestedGroups : travelImportGroups,
        requestDelayMs: 900,
        maxMirrorAttempts: 2,
        requestTimeoutMs: timeoutSeconds * 1000,
        onProgress: ({ group, status, count }) => console.log(`  ${group}: ${status}${count === undefined ? '' : ` (${count})`}`),
      });
      if (!result.candidates.length) throw new Error(`Источник не вернул кандидатов; группы: ${result.failedGroups.join(', ') || 'неизвестно'}`);
      const existing = await loadExistingBulkCandidates(client, circuit.id);
      const accumulated = [...new Map([...existing, ...result.candidates].map((candidate) => [candidate.id, candidate])).values()]
        .sort((left, right) => right.importance - left.importance || left.distanceToCircuitM - right.distanceToCircuitM);
      const selected = balancedCandidates(accumulated, limit);
      const runId = await saveCandidates(client, circuit.id, selected, result.candidates.length, result.failedGroups, requestedGroups);
      recordCircuit({ id: circuit.id, name: circuit.name, status: 'imported', discovered: result.candidates.length, accumulated: accumulated.length, imported: selected.length, failedGroups: result.failedGroups, runId });
      consecutiveFailures = 0;
      console.log(`Найдено ${result.candidates.length}; сохранено ${selected.length}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      recordCircuit({ id: circuit.id, name: circuit.name, status: 'failed', error: message });
      consecutiveFailures += 1;
      console.warn(`Пропуск ${circuit.id}: ${message}`);
    }
    await persistReport();
    if (!retryIncomplete && consecutiveFailures >= 3) {
      report.stopReason = 'Три трассы подряд не получили ни одной категории; пакет остановлен для защиты публичного API';
      console.warn(report.stopReason);
      break;
    }
    await new Promise((resolve) => setTimeout(resolve, 1200));
  }
  report.finishedAt = new Date().toISOString();
  await persistReport();
  console.log(JSON.stringify(report.totals, null, 2));
} finally {
  await client.end();
}
