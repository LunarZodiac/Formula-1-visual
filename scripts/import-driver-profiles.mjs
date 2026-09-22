#!/usr/bin/env node

import { readFile } from 'node:fs/promises';
import pg from 'pg';

const required = ['PGHOST', 'PGPORT', 'PGDATABASE', 'PGUSER', 'PGPASSWORD'];
const missingEnvironment = required.filter((name) => !process.env[name]);
if (missingEnvironment.length) throw new Error(`Не заданы параметры базы: ${missingEnvironment.join(', ')}`);

const apply = process.argv.includes('--apply');
const input = JSON.parse(await readFile('data/editorial/driver-profiles.json', 'utf8'));
if (input.schemaVersion !== 1 || !Array.isArray(input.profiles)) throw new Error('Неверный формат реестра биографий');

const driverIds = new Set();
for (const profile of input.profiles) {
  if (!profile.driverId || driverIds.has(profile.driverId)) throw new Error(`Пустой или повторяющийся driverId: ${profile.driverId ?? '—'}`);
  driverIds.add(profile.driverId);
  for (const field of ['nameRu', 'birthDate', 'birthPlaceRu', 'biographyRu', 'sourceId', 'sourceName', 'sourceUrl', 'retrievedAt']) {
    if (typeof profile[field] !== 'string' || !profile[field].trim()) throw new Error(`${profile.driverId}: не заполнено поле ${field}`);
  }
  if (!/^https:\/\//.test(profile.sourceUrl)) throw new Error(`${profile.driverId}: источник должен использовать HTTPS`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(profile.birthDate)) throw new Error(`${profile.driverId}: неверный формат даты рождения`);
  if (profile.deathDate !== undefined && profile.deathDate !== null) {
    if (typeof profile.deathDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(profile.deathDate)) {
      throw new Error(`${profile.driverId}: неверный формат даты смерти`);
    }
    if (profile.deathDate < profile.birthDate) throw new Error(`${profile.driverId}: дата смерти раньше даты рождения`);
  }
}

const client = new pg.Client({ application_name: 'f1-atlas-driver-profile-import' });
await client.connect();
try {
  const driversResult = await client.query(`
    SELECT id, to_char(date_of_birth, 'YYYY-MM-DD') AS birth_date
    FROM atlas.drivers
    WHERE id = ANY($1::text[])
  `, [[...driverIds]]);
  const drivers = new Map(driversResult.rows.map((row) => [row.id, row]));
  const errors = [];
  for (const profile of input.profiles) {
    const driver = drivers.get(profile.driverId);
    if (!driver) errors.push(`${profile.driverId}: пилот отсутствует в базе`);
    else if (driver.birth_date !== profile.birthDate) errors.push(`${profile.driverId}: дата ${profile.birthDate} не совпадает с базой (${driver.birth_date ?? 'нет'})`);
  }

  console.log(JSON.stringify({ mode: apply ? 'apply' : 'preview', profiles: input.profiles.length, errors }, null, 2));
  if (errors.length) process.exitCode = 1;
  else if (!apply) console.log('Предпросмотр завершён. Для записи добавьте --apply');
  else {
    await client.query('BEGIN');
    try {
      for (const profile of input.profiles) {
        await client.query(`
          INSERT INTO atlas.data_sources (id, name, url, licence, retrieved_at, notes)
          VALUES ($1, $2, $3, 'Reference only; editorial summary written independently', $4, 'Официальный профиль пилота Formula 1')
          ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, url = EXCLUDED.url,
            licence = EXCLUDED.licence, retrieved_at = EXCLUDED.retrieved_at, notes = EXCLUDED.notes
        `, [profile.sourceId, profile.sourceName, profile.sourceUrl, profile.retrievedAt]);
        await client.query(`
          INSERT INTO atlas.driver_profiles
            (driver_id, name_ru, birth_place_ru, death_date, biography_ru, source_id, review_status, updated_at)
          VALUES ($1, $2, $3, $4, $5, $6, 'reviewed', now())
          ON CONFLICT (driver_id) DO UPDATE SET
            name_ru = EXCLUDED.name_ru,
            birth_place_ru = EXCLUDED.birth_place_ru,
            death_date = COALESCE(EXCLUDED.death_date, atlas.driver_profiles.death_date),
            biography_ru = EXCLUDED.biography_ru,
            source_id = EXCLUDED.source_id,
            review_status = EXCLUDED.review_status,
            updated_at = now()
        `, [profile.driverId, profile.nameRu, profile.birthPlaceRu, profile.deathDate ?? null, profile.biographyRu, profile.sourceId]);
        const sourcedFields = ['birth_date', 'birth_place_ru', 'biography_ru'];
        if (profile.deathDate) sourcedFields.push('death_date');
        for (const fieldName of sourcedFields) {
          await client.query(`
            INSERT INTO atlas.driver_profile_field_sources
              (driver_id, field_name, source_id, source_url, retrieved_at, review_status, notes)
            VALUES ($1, $2, $3, $4, $5, 'reviewed', 'Сверено с официальным профилем Formula 1')
            ON CONFLICT (driver_id, field_name, source_id) DO UPDATE SET
              source_url = EXCLUDED.source_url,
              retrieved_at = EXCLUDED.retrieved_at,
              review_status = EXCLUDED.review_status,
              notes = EXCLUDED.notes
          `, [profile.driverId, fieldName, profile.sourceId, profile.sourceUrl, profile.retrievedAt]);
        }
      }
      await client.query('COMMIT');
      console.log(`Записано биографий: ${input.profiles.length}`);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    }
  }
} finally {
  await client.end();
}
