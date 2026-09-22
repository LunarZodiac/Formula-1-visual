#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import pg from 'pg';
import { acceptedSpaCulturalRecords, validateSpaCulturalReview } from './lib/spa-travel-cultural-review.mjs';

const requiredEnvironment = ['PGHOST', 'PGPORT', 'PGDATABASE', 'PGUSER', 'PGPASSWORD'];
const missingEnvironment = requiredEnvironment.filter((name) => !process.env[name]);
if (missingEnvironment.length) throw new Error(`Не заданы параметры базы: ${missingEnvironment.join(', ')}`);

const apply = process.argv.includes('--apply');
const reviewPath = path.resolve(import.meta.dirname, '..', 'data', 'review', 'spa-travel-cultural-review.json');
const review = validateSpaCulturalReview(JSON.parse(await readFile(reviewPath, 'utf8')));
const acceptedRecords = acceptedSpaCulturalRecords(review);
const sourceId = (url) => `spa-cultural-${createHash('sha256').update(url).digest('hex').slice(0, 12)}`;

const client = new pg.Client({ application_name: 'f1-atlas-spa-cultural-review-import' });
await client.connect();

try {
  const candidateIds = review.records.map((record) => record.candidateId);
  const result = await client.query(
    `SELECT p.id,p.name,p.name_ru,p.review_status,p.website_url,p.source_id,
            link.role,link.priority,link.is_featured,link.editorial_note_ru
     FROM atlas.tourism_pois p
     LEFT JOIN atlas.circuit_travel_pois link
       ON link.poi_id=p.id AND link.circuit_id=$1
     WHERE p.id=ANY($2::text[])
     ORDER BY p.id`,
    [review.circuitId, candidateIds],
  );
  const existingById = new Map(result.rows.map((row) => [row.id, row]));
  const missingIds = candidateIds.filter((id) => !existingById.has(id));
  const unlinkedIds = candidateIds.filter((id) => existingById.has(id) && existingById.get(id).role === null);
  const changes = acceptedRecords.map((record) => ({
    id: record.candidateId,
    decision: record.decision,
    currentStatus: existingById.get(record.candidateId)?.review_status ?? null,
    nextStatus: 'reviewed',
    currentNameRu: existingById.get(record.candidateId)?.name_ru ?? null,
    nextNameRu: record.nameRu,
    featured: existingById.get(record.candidateId)?.is_featured ?? null,
    sourceId: sourceId(record.sourceUrl),
  }));

  console.log(JSON.stringify({
    mode: apply ? 'apply' : 'preview',
    circuitId: review.circuitId,
    totalReviewed: review.records.length,
    accepted: acceptedRecords.length,
    deferred: review.records.length - acceptedRecords.length,
    missingIds,
    unlinkedIds,
    changes,
  }, null, 2));

  if (missingIds.length || unlinkedIds.length) {
    throw new Error('Перенос остановлен: не все редакционные кандидаты существуют и связаны с трассой Спа');
  }
  if (!apply) {
    console.log('Предпросмотр завершён. Для записи добавьте --apply');
    process.exit(0);
  }

  await client.query('BEGIN');
  try {
    for (const record of acceptedRecords) {
      const editorialSourceId = sourceId(record.sourceUrl);
      await client.query(
        `INSERT INTO atlas.data_sources (id,name,url,licence,retrieved_at,notes)
         VALUES($1,$2,$3,'Reference only; editorial summary written independently',$4,$5)
         ON CONFLICT(id) DO UPDATE SET
           name=EXCLUDED.name,url=EXCLUDED.url,licence=EXCLUDED.licence,
           retrieved_at=EXCLUDED.retrieved_at,notes=EXCLUDED.notes`,
        [
          editorialSourceId,
          `Официальный источник: ${record.nameOriginal}`,
          record.sourceUrl,
          record.sourceDate,
          'Проверка названия, назначения и редакционного описания туристической точки Спа',
        ],
      );
      await client.query(
        `UPDATE atlas.tourism_pois SET
           name=$2,name_ru=$3,description_ru=$4,website_url=$5,source_id=$6,
           review_status='reviewed',verified_at=$7,updated_at=now()
         WHERE id=$1`,
        [
          record.candidateId,
          record.nameOriginal,
          record.nameRu,
          record.descriptionRu,
          record.sourceUrl,
          editorialSourceId,
          record.sourceDate,
        ],
      );
      await client.query(
        `UPDATE atlas.circuit_travel_pois SET editorial_note_ru=$3,updated_at=now()
         WHERE circuit_id=$1 AND poi_id=$2`,
        [review.circuitId, record.candidateId, record.riskNotes],
      );
    }
    await client.query('COMMIT');
    console.log(`Перенесено в статус «проверено»: ${acceptedRecords.length}. Публичная видимость не изменена`);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
} finally {
  await client.end();
}
