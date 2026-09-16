#!/usr/bin/env node

import { readFile } from 'node:fs/promises';
import pg from 'pg';

const required = ['PGHOST', 'PGPORT', 'PGDATABASE', 'PGUSER', 'PGPASSWORD'];
const missing = required.filter((name) => !process.env[name]);
if (missing.length) throw new Error(`Не заданы параметры базы: ${missing.join(', ')}`);

const apply = process.argv.includes('--apply');
const normalize = (value) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLocaleLowerCase('en-US');
const catalog = JSON.parse(await readFile('apps/web/app/data/catalogs/drivers-all.json', 'utf8'));
const editorialLocalizations = JSON.parse(await readFile('apps/web/app/data/catalogs/drivers.json', 'utf8'));
if (!Array.isArray(catalog.drivers) || !Array.isArray(editorialLocalizations)) {
  throw new Error('Неверный формат каталогов пилотов');
}
const editorialById = new Map(editorialLocalizations.map((driver) => [driver.id, driver.nameRu]));
const editorialByName = new Map(editorialLocalizations.map((driver) => [normalize(driver.nameEn), driver.nameRu]));

const client = new pg.Client({ application_name: 'f1-atlas-driver-localization-import' });
await client.connect();
try {
  const driversResult = await client.query(`
    SELECT driver.id, driver.given_name, driver.family_name, profile.name_ru,
           EXISTS (
             SELECT 1 FROM atlas.driver_profile_field_sources AS field_source
             WHERE field_source.driver_id = driver.id AND field_source.field_name = 'name_ru'
           ) AS has_name_source
    FROM atlas.drivers AS driver
    LEFT JOIN atlas.driver_profiles AS profile ON profile.driver_id = driver.id
  `);
  const byId = new Map(driversResult.rows.map((row) => [row.id, row]));
  const byName = new Map(driversResult.rows.map((row) => [normalize(`${row.given_name} ${row.family_name}`), row]));
  const matched = [];
  const unmatched = [];
  for (const localization of catalog.drivers) {
    const driver = byId.get(localization.id) ?? byName.get(normalize(localization.nameEn));
    if (!driver) unmatched.push({ id: localization.id, nameEn: localization.nameEn });
    else matched.push({
      driverId: driver.id,
      nameRu: localization.nameRu,
      sourceId: editorialById.get(localization.id) === localization.nameRu
          || editorialByName.get(normalize(localization.nameEn)) === localization.nameRu
        ? 'atlas-editorial'
        : 'atlas-automatic-transliteration',
      alreadyStored: Boolean(driver.name_ru),
      hasNameSource: driver.has_name_source,
    });
  }
  const missingLocalizations = matched.filter((row) => !row.alreadyStored);
  const missingNameSources = matched.filter((row) => !row.hasNameSource);
  console.log(JSON.stringify({
    sourceRows: catalog.drivers.length,
    matched: matched.length,
    alreadyStored: matched.length - missingLocalizations.length,
    toInsert: missingLocalizations.length,
    provenanceToInsert: missingNameSources.length,
    editorialCandidates: missingLocalizations.filter((row) => row.sourceId === 'atlas-editorial').length,
    automaticCandidates: missingLocalizations.filter((row) => row.sourceId === 'atlas-automatic-transliteration').length,
    unmatched,
    mode: apply ? 'apply' : 'preview',
  }, null, 2));
  if (!apply) {
    console.log('Предпросмотр завершён. Для записи добавьте --apply');
  } else {
    await client.query('BEGIN');
    try {
      await client.query(`INSERT INTO atlas.data_sources (id, name, licence, retrieved_at, notes)
        VALUES ('atlas-editorial', 'Редакция «Географии скорости»', 'Internal editorial data', now(),
                'Русские имена, подготовленные внутри проекта; требуют поэтапной проверки')
        ON CONFLICT (id) DO UPDATE SET retrieved_at = now(), notes = EXCLUDED.notes`);
      await client.query(`INSERT INTO atlas.data_sources (id, name, licence, retrieved_at, notes)
        VALUES ('atlas-automatic-transliteration', 'Автоматическая транслитерация каталога', 'Internal generated data', now(),
                'Черновые русские имена из полного каталога; каждое имя требует редакционной проверки')
        ON CONFLICT (id) DO UPDATE SET retrieved_at = now(), notes = EXCLUDED.notes`);
      const result = await client.query(`
        INSERT INTO atlas.driver_profiles (driver_id, name_ru, source_id, review_status, updated_at)
        SELECT row.driver_id, row.name_ru, row.source_id, 'candidate', now()
        FROM jsonb_to_recordset($1::jsonb) AS row(driver_id text, name_ru text, source_id text)
        ON CONFLICT (driver_id) DO UPDATE SET
          name_ru = COALESCE(atlas.driver_profiles.name_ru, EXCLUDED.name_ru),
          source_id = CASE WHEN atlas.driver_profiles.name_ru IS NULL THEN EXCLUDED.source_id ELSE atlas.driver_profiles.source_id END,
          updated_at = CASE WHEN atlas.driver_profiles.name_ru IS NULL THEN now() ELSE atlas.driver_profiles.updated_at END
      `, [JSON.stringify(missingLocalizations.map((row) => ({
        driver_id: row.driverId,
        name_ru: row.nameRu,
        source_id: row.sourceId,
      })))]);
      await client.query(`
        INSERT INTO atlas.driver_profile_field_sources
          (driver_id, field_name, source_id, retrieved_at, review_status, notes)
        SELECT row.driver_id, 'name_ru', row.source_id, now(), 'candidate',
               CASE WHEN row.source_id = 'atlas-editorial'
                    THEN 'Редакционная локализация; требует проверки источника'
                    ELSE 'Автоматическая транслитерация; требует ручной проверки' END
        FROM jsonb_to_recordset($1::jsonb) AS row(driver_id text, source_id text)
        ON CONFLICT (driver_id, field_name, source_id) DO UPDATE SET
          retrieved_at = EXCLUDED.retrieved_at,
          notes = EXCLUDED.notes
      `, [JSON.stringify(missingNameSources.map((row) => ({
        driver_id: row.driverId,
        source_id: row.sourceId,
      })))]);
      await client.query('COMMIT');
      console.log(`Добавлено отсутствующих локализаций: ${result.rowCount ?? 0}`);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    }
  }
} finally {
  await client.end();
}
