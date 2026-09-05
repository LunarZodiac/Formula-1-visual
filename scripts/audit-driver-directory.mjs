#!/usr/bin/env node

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import pg from 'pg';

const required = ['PGHOST', 'PGPORT', 'PGDATABASE', 'PGUSER', 'PGPASSWORD'];
const missingEnvironment = required.filter((name) => !process.env[name]);
if (missingEnvironment.length) throw new Error(`Не заданы параметры базы: ${missingEnvironment.join(', ')}`);

const directory = JSON.parse(await readFile('apps/web/app/data/catalogs/drivers-all.json', 'utf8'));
const localizations = JSON.parse(await readFile('apps/web/app/data/catalogs/drivers.json', 'utf8'));
const directoryIds = new Set(directory.drivers.map((driver) => driver.id));
const localizedIds = new Set(localizations.map((driver) => driver.id));
const normalize = (value) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLocaleLowerCase('en-US');
const localizedEnglishNames = new Set(localizations.map((driver) => normalize(driver.nameEn)));
const hasReviewedLocalization = (row) => localizedIds.has(row.id) || localizedEnglishNames.has(normalize(`${row.given_name} ${row.family_name}`));
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
           count(DISTINCT race.season_year)::integer AS seasons_with_results,
           count(DISTINCT result.session_id) FILTER (WHERE session.session_type = 'race')::integer AS race_results,
           count(DISTINCT entry.constructor_id)::integer AS constructor_count
    FROM atlas.drivers AS driver
    LEFT JOIN atlas.session_results AS result ON result.driver_id = driver.id
    LEFT JOIN atlas.sessions AS session ON session.id = result.session_id
    LEFT JOIN atlas.races AS race ON race.id = session.race_id
    LEFT JOIN atlas.constructor_entries AS entry ON entry.id = result.constructor_entry_id
    GROUP BY driver.id
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
      explicitlyReviewed: catalogRows.filter(hasReviewedLocalization).length,
      automaticallyTransliterated: catalogRows.filter((row) => !hasReviewedLocalization(row)).map((row) => row.id),
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
    schemaGaps: ['birth_place', 'height_cm', 'weight_kg', 'biography_ru', 'driver_event_number', 'driver_media_link'],
  };
  await mkdir('data/review', { recursive: true });
  await writeFile('data/review/driver-directory-audit.json', `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({
    databaseDrivers: report.scope.databaseDrivers,
    catalogDrivers: report.scope.catalogDrivers,
    outsideCatalogWithRaceResults: report.scope.databaseDriversOutsideCatalogWithRaceResults.length,
    explicitlyReviewedNames: report.localization.explicitlyReviewed,
    automaticallyTransliteratedNames: report.localization.automaticallyTransliterated.length,
    missingBirthDate: report.completeness.missingBirthDate.length,
    missingNationality: report.completeness.missingNationality.length,
    missingPermanentNumber: report.completeness.missingPermanentNumber.length,
    duplicateRussianNames: report.localization.duplicateRussianNames.length,
  }, null, 2));
} finally {
  await client.end();
}
