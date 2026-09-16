#!/usr/bin/env node

import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import pg from 'pg';

const required = ['PGHOST', 'PGPORT', 'PGDATABASE', 'PGUSER', 'PGPASSWORD'];
const missingEnvironment = required.filter((name) => !process.env[name]);
if (missingEnvironment.length) throw new Error(`Не заданы параметры базы: ${missingEnvironment.join(', ')}`);

const directory = JSON.parse(await readFile('apps/web/app/data/catalogs/drivers-all.json', 'utf8'));
const directoryIds = new Set(directory.drivers.map((driver) => driver.id));
const normalize = (value) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLocaleLowerCase('en-US');
const groupDuplicates = (key) => {
  const groups = new Map();
  for (const driver of directory.drivers) {
    const value = normalize(driver[key]);
    const rows = groups.get(value) ?? [];
    rows.push({ id: driver.id, nameRu: driver.nameRu, nameEn: driver.nameEn });
    groups.set(value, rows);
  }
  return [...groups.values()].filter((rows) => rows.length > 1);
};

const client = new pg.Client({ application_name: 'f1-atlas-driver-directory-audit' });
await client.connect();
try {
  const result = await client.query(`
    SELECT driver.id, driver.given_name, driver.family_name, driver.date_of_birth,
           driver.nationality, driver.permanent_number,
           profile.name_ru, name_source.review_status AS name_review_status,
           name_source.source_id AS name_source_id,
           count(DISTINCT race.season_year)::integer AS seasons_with_results,
           count(DISTINCT result.session_id) FILTER (WHERE session.session_type = 'race')::integer AS race_results,
           count(DISTINCT entry.constructor_id)::integer AS constructor_count
    FROM atlas.drivers AS driver
    LEFT JOIN atlas.driver_profiles AS profile ON profile.driver_id = driver.id
    LEFT JOIN LATERAL (
      SELECT field_source.review_status, field_source.source_id
      FROM atlas.driver_profile_field_sources AS field_source
      WHERE field_source.driver_id = driver.id AND field_source.field_name = 'name_ru'
      ORDER BY CASE field_source.review_status
        WHEN 'verified' THEN 1 WHEN 'reviewed' THEN 2 WHEN 'candidate' THEN 3 ELSE 4 END,
        field_source.retrieved_at DESC
      LIMIT 1
    ) AS name_source ON true
    LEFT JOIN atlas.session_results AS result ON result.driver_id = driver.id
    LEFT JOIN atlas.sessions AS session ON session.id = result.session_id
    LEFT JOIN atlas.races AS race ON race.id = session.race_id
    LEFT JOIN atlas.constructor_entries AS entry ON entry.id = result.constructor_entry_id
    GROUP BY driver.id, profile.name_ru, name_source.review_status, name_source.source_id
    ORDER BY driver.family_name, driver.given_name
  `);
  const catalogRows = result.rows.filter((row) => directoryIds.has(row.id));
  const report = {
    generatedAt: new Date().toISOString(),
    scope: {
      databaseDrivers: result.rows.length,
      catalogDrivers: directory.drivers.length,
      databaseDriversOutsideCatalog: result.rows.filter((row) => !directoryIds.has(row.id)).map((row) => row.id),
      databaseDriversOutsideCatalogWithRaceResults: result.rows.filter((row) => !directoryIds.has(row.id) && row.race_results > 0).map((row) => row.id),
    },
    localization: {
      storedNames: catalogRows.filter((row) => row.name_ru).length,
      candidates: catalogRows.filter((row) => row.name_review_status === 'candidate').map((row) => row.id),
      reviewedOrVerified: catalogRows.filter((row) => ['reviewed', 'verified'].includes(row.name_review_status)).map((row) => row.id),
      automaticallyTransliterated: catalogRows.filter((row) => row.name_source_id === 'atlas-automatic-transliteration').map((row) => row.id),
      missingFromDatabase: catalogRows.filter((row) => !row.name_ru).map((row) => row.id),
      namesContainingLatinCharacters: directory.drivers.filter((driver) => /[A-Za-z]/.test(driver.nameRu)).map((driver) => ({ id: driver.id, nameRu: driver.nameRu })),
      duplicateRussianNames: groupDuplicates('nameRu'),
      duplicateEnglishNames: groupDuplicates('nameEn'),
    },
    completeness: {
      missingBirthDate: catalogRows.filter((row) => !row.date_of_birth).map((row) => row.id),
      missingNationality: catalogRows.filter((row) => !row.nationality).map((row) => row.id),
      missingPermanentNumber: catalogRows.filter((row) => row.permanent_number === null).map((row) => row.id),
      withoutRaceResults: catalogRows.filter((row) => row.race_results === 0).map((row) => row.id),
      withoutConstructor: catalogRows.filter((row) => row.constructor_count === 0).map((row) => row.id),
    },
    nextEditorialTasks: ['verify_name_ru', 'source_birth_place', 'source_height_weight', 'write_biography_ru', 'record_public_relationship_claims'],
  };
  await mkdir('data/review', { recursive: true });
  const outputPath = 'data/review/driver-directory-audit.json';
  const temporaryPath = `${outputPath}.tmp-${process.pid}`;
  await writeFile(temporaryPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  await rename(temporaryPath, outputPath);
  console.log(JSON.stringify({
    databaseDrivers: report.scope.databaseDrivers,
    catalogDrivers: report.scope.catalogDrivers,
    outsideCatalogWithRaceResults: report.scope.databaseDriversOutsideCatalogWithRaceResults.length,
    storedRussianNames: report.localization.storedNames,
    candidateRussianNames: report.localization.candidates.length,
    reviewedOrVerifiedNames: report.localization.reviewedOrVerified.length,
    automaticallyTransliteratedNames: report.localization.automaticallyTransliterated.length,
    missingBirthDate: report.completeness.missingBirthDate.length,
    missingNationality: report.completeness.missingNationality.length,
    missingPermanentNumber: report.completeness.missingPermanentNumber.length,
    duplicateRussianNames: report.localization.duplicateRussianNames.length,
  }, null, 2));
} finally {
  await client.end();
}
