#!/usr/bin/env node

import { readFile } from 'node:fs/promises';
import pg from 'pg';

const apply = process.argv.includes('--apply');
const inputPath = process.env.DRIVER_LIFE_DATA_PATH ?? 'data/editorial/driver-life-data-manual.json';
const sourceId = 'atlas-driver-life-manual-review-2026-09-05';
const required = ['PGHOST', 'PGPORT', 'PGDATABASE', 'PGUSER', 'PGPASSWORD'];
const missingEnvironment = required.filter((name) => !process.env[name]);
if (missingEnvironment.length) throw new Error(`Не заданы параметры базы: ${missingEnvironment.join(', ')}`);

function requiredText(value, field) {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${field}: ожидается непустая строка`);
  return value.trim();
}

function isoDate(value, field) {
  const text = requiredText(value, field);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text) || Number.isNaN(Date.parse(`${text}T00:00:00Z`))) {
    throw new Error(`${field}: ожидается дата YYYY-MM-DD`);
  }
  return text;
}

const document = JSON.parse(await readFile(inputPath, 'utf8'));
if (document.schemaVersion !== 1 || !Array.isArray(document.profiles)) throw new Error('Неподдерживаемая структура редакционного файла');
const profiles = document.profiles.map((row, index) => ({
  driverId: requiredText(row.driverId, `profiles[${index}].driverId`),
  birthDate: isoDate(row.birthDate, `profiles[${index}].birthDate`),
  birthPlaceRu: requiredText(row.birthPlaceRu, `profiles[${index}].birthPlaceRu`),
  deathDate: isoDate(row.deathDate, `profiles[${index}].deathDate`),
  sourceUrl: requiredText(row.sourceUrl, `profiles[${index}].sourceUrl`),
  notes: typeof row.notes === 'string' && row.notes.trim() ? row.notes.trim() : null,
}));
if (new Set(profiles.map((row) => row.driverId)).size !== profiles.length) throw new Error('В редакционном файле повторяется driverId');

const client = new pg.Client({ application_name: 'f1-atlas-manual-driver-life-import' });
await client.connect();
try {
  const ids = profiles.map((row) => row.driverId);
  const existing = await client.query('SELECT id, to_char(date_of_birth, \'YYYY-MM-DD\') AS birth_date FROM atlas.drivers WHERE id = ANY($1::text[])', [ids]);
  const existingById = new Map(existing.rows.map((row) => [row.id, row]));
  const missingDrivers = ids.filter((id) => !existingById.has(id));
  if (missingDrivers.length) throw new Error(`Не найдены пилоты: ${missingDrivers.join(', ')}`);
  const changedBirthDates = profiles.filter((row) => existingById.get(row.driverId).birth_date !== row.birthDate)
    .map((row) => ({ driverId: row.driverId, from: existingById.get(row.driverId).birth_date, to: row.birthDate }));

  console.log(JSON.stringify({ mode: apply ? 'apply' : 'preview', profiles: profiles.length, changedBirthDates, unresolved: document.unresolved ?? [] }, null, 2));
  if (!apply) {
    console.log('Предпросмотр завершён. Для записи добавьте --apply');
  } else {
    await client.query('BEGIN');
    try {
      await client.query(`
        INSERT INTO atlas.data_sources (id, name, licence, retrieved_at, notes)
        VALUES ($1, 'Ручная проверка биографических данных пилотов', 'Per-source terms', $2, $3)
        ON CONFLICT (id) DO UPDATE SET retrieved_at = EXCLUDED.retrieved_at, notes = EXCLUDED.notes
      `, [sourceId, document.reviewedAt, 'Редакторское сопоставление места рождения, даты рождения и даты смерти с индивидуальным источником для каждого пилота']);

      for (const profile of profiles) {
        await client.query('UPDATE atlas.drivers SET date_of_birth = $2, updated_at = now() WHERE id = $1', [profile.driverId, profile.birthDate]);
        await client.query(`
          INSERT INTO atlas.driver_profiles (driver_id, birth_place_ru, death_date, source_id, review_status, updated_at)
          VALUES ($1, $2, $3, $4, 'reviewed', now())
          ON CONFLICT (driver_id) DO UPDATE SET
            birth_place_ru = EXCLUDED.birth_place_ru,
            death_date = EXCLUDED.death_date,
            source_id = EXCLUDED.source_id,
            review_status = 'reviewed',
            updated_at = now()
        `, [profile.driverId, profile.birthPlaceRu, profile.deathDate, sourceId]);
        for (const [fieldName, value] of [['birth_date', profile.birthDate], ['birth_place_ru', profile.birthPlaceRu], ['death_date', profile.deathDate]]) {
          await client.query(`
            INSERT INTO atlas.driver_profile_field_sources
              (driver_id, field_name, source_id, source_url, retrieved_at, review_status, notes)
            VALUES ($1, $2, $3, $4, $5, 'reviewed', $6)
            ON CONFLICT (driver_id, field_name, source_id) DO UPDATE SET
              source_url = EXCLUDED.source_url,
              retrieved_at = EXCLUDED.retrieved_at,
              review_status = 'reviewed',
              notes = EXCLUDED.notes
          `, [profile.driverId, fieldName, sourceId, profile.sourceUrl, document.reviewedAt, profile.notes]);
        }
      }
      await client.query('COMMIT');
      console.log(`Записано проверенных профилей: ${profiles.length}`);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    }
  }
} finally {
  await client.end();
}
