#!/usr/bin/env node

import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import pg from 'pg';

const apply = process.argv.includes('--apply');
const driversPath = process.env.F1DB_DRIVERS_PATH ?? 'tmp/f1db-json-splitted/f1db-drivers.json';
const countriesPath = process.env.F1DB_COUNTRIES_PATH ?? 'tmp/f1db-json-splitted/f1db-countries.json';
const outputPath = 'data/review/driver-life-data-audit.json';
const sourceId = 'f1db-v2026-12-0';
const sourceUrl = 'https://github.com/f1db/f1db/releases/tag/v2026.12.0';
const retrievedAt = new Date().toISOString();

// Stable aliases verified manually against the local driver identity, birth date,
// and the corresponding F1DB record. Keep ambiguous or conflicting identities
// out of this map so they remain visible in the review report.
const f1dbIdByLocalDriverId = new Map(Object.entries({
  ahrens: 'kurt-ahrens-jr',
  bechem: 'karl-gunther-bechem',
  bira: 'birabongse-bhanudej',
  cabantous: 'yves-giraud-cabantous',
  crossley: 'geoffrey-crossley',
  cruz: 'adolfo-schwelm-cruz',
  fangio: 'juan-manuel-fangio',
  filippis: 'maria-teresa-de-filippis',
  fontes: 'asdrubal-fontes-bayardo',
  foyt: 'anthony-joseph-foyt',
  galvez: 'oscar-alfredo-galvez',
  graffenried: 'emmanuel-de-graffenried',
  hayje: 'boy-hayje',
  jerry_unser: 'jerry-unser-jr',
  lehto: 'jj-lehto',
  ramos: 'hermano-da-silva-ramos',
  sainz: 'carlos-sainz-jr',
  tomaso: 'alejandro-de-tomaso',
  webb: 'spider-webb',
  zanardi: 'alex-zanardi',
}));

const required = ['PGHOST', 'PGPORT', 'PGDATABASE', 'PGUSER', 'PGPASSWORD'];
const missingEnvironment = required.filter((name) => !process.env[name]);
if (missingEnvironment.length) throw new Error(`Не заданы параметры базы: ${missingEnvironment.join(', ')}`);

function normalizeName(value) {
  return value.normalize('NFKD').replace(/\p{Diacritic}/gu, '').toLocaleLowerCase('en')
    .replace(/[^a-z0-9]+/g, ' ').trim();
}

function namesFor(driver) {
  return [...new Set([
    driver.name,
    `${driver.firstName} ${driver.lastName}`,
    driver.fullName,
  ].filter(Boolean).map(normalizeName))];
}

function findMatch(driver, candidates, bySlug) {
  const mappedId = f1dbIdByLocalDriverId.get(driver.id);
  if (mappedId) {
    const mappedMatch = bySlug.get(mappedId);
    if (mappedMatch?.dateOfBirth === driver.birth_date) return { match: mappedMatch, method: 'reviewed-id-alias-and-birth-date' };
  }
  const slugMatch = bySlug.get(driver.id.replaceAll('_', '-'));
  if (slugMatch?.dateOfBirth === driver.birth_date) return { match: slugMatch, method: 'id-and-birth-date' };
  const localName = normalizeName(`${driver.given_name} ${driver.family_name}`);
  const exact = candidates.filter((candidate) => namesFor(candidate).includes(localName));
  return exact.length === 1 ? { match: exact[0], method: 'name-and-birth-date' } : { match: null, method: exact.length ? 'ambiguous' : 'not-found' };
}

const [f1dbDrivers, countries] = await Promise.all([
  readFile(driversPath, 'utf8').then(JSON.parse),
  readFile(countriesPath, 'utf8').then(JSON.parse),
]);
const byBirthDate = new Map();
const bySlug = new Map(f1dbDrivers.map((driver) => [driver.id, driver]));
for (const driver of f1dbDrivers) (byBirthDate.get(driver.dateOfBirth) ?? byBirthDate.set(driver.dateOfBirth, []).get(driver.dateOfBirth)).push(driver);
const countriesById = new Map(countries.map((country) => [country.id, country]));
const countryNamesRu = new Intl.DisplayNames(['ru'], { type: 'region' });

const client = new pg.Client({ application_name: 'f1-atlas-f1db-driver-life-import' });
await client.connect();
try {
  const databaseResult = await client.query(`
    SELECT driver.id, driver.given_name, driver.family_name,
           to_char(driver.date_of_birth, 'YYYY-MM-DD') AS birth_date,
           profile.birth_place_ru, to_char(profile.death_date, 'YYYY-MM-DD') AS death_date
    FROM atlas.drivers AS driver
    JOIN atlas.session_results AS result ON result.driver_id = driver.id
    JOIN atlas.sessions AS session ON session.id = result.session_id AND session.session_type = 'race'
    LEFT JOIN atlas.driver_profiles AS profile ON profile.driver_id = driver.id
    GROUP BY driver.id, profile.driver_id
    ORDER BY driver.id
  `);

  const candidates = [];
  const rejected = [];
  for (const driver of databaseResult.rows) {
    const result = findMatch(driver, byBirthDate.get(driver.birth_date) ?? [], bySlug);
    if (!result.match) {
      rejected.push({ driverId: driver.id, name: `${driver.given_name} ${driver.family_name}`, birthDate: driver.birth_date, reason: result.method });
      continue;
    }
    const country = countriesById.get(result.match.countryOfBirthCountryId);
    const countryRu = country?.alpha2Code ? countryNamesRu.of(country.alpha2Code) : null;
    const place = result.match.placeOfBirth?.trim() || null;
    const birthPlaceRu = place ? (countryRu && normalizeName(place) !== normalizeName(country.name) ? `${place}, ${countryRu}` : countryRu ?? place) : null;
    candidates.push({
      driverId: driver.id,
      name: `${driver.given_name} ${driver.family_name}`,
      birthDate: driver.birth_date,
      birthPlaceRu,
      deathDate: result.match.dateOfDeath || null,
      matchMethod: result.method,
      f1dbDriverId: result.match.id,
      preservesExistingBirthPlace: Boolean(driver.birth_place_ru),
      preservesExistingDeathDate: Boolean(driver.death_date),
    });
  }

  if (apply) {
    await client.query('BEGIN');
    try {
      await client.query(`
        INSERT INTO atlas.data_sources (id, name, url, licence, retrieved_at, notes)
        VALUES ($1, 'F1DB — справочник пилотов v2026.12.0', $2, 'CC BY 4.0', $3,
          'Место рождения и дата смерти; автоматическое сопоставление по ID или имени и дате рождения')
        ON CONFLICT (id) DO UPDATE SET url = EXCLUDED.url, licence = EXCLUDED.licence,
          retrieved_at = EXCLUDED.retrieved_at, notes = EXCLUDED.notes
      `, [sourceId, sourceUrl, retrievedAt]);
      for (const candidate of candidates) {
        await client.query(`
          INSERT INTO atlas.driver_profiles (driver_id, birth_place_ru, death_date, source_id, review_status, updated_at)
          VALUES ($1, $2, $3, $4, 'candidate', now())
          ON CONFLICT (driver_id) DO UPDATE SET
            birth_place_ru = COALESCE(atlas.driver_profiles.birth_place_ru, EXCLUDED.birth_place_ru),
            death_date = COALESCE(atlas.driver_profiles.death_date, EXCLUDED.death_date),
            source_id = COALESCE(atlas.driver_profiles.source_id, EXCLUDED.source_id),
            updated_at = now()
        `, [candidate.driverId, candidate.birthPlaceRu, candidate.deathDate, sourceId]);
        for (const [fieldName, value] of [['birth_place_ru', candidate.birthPlaceRu], ['death_date', candidate.deathDate]]) {
          if (!value) continue;
          await client.query(`
            INSERT INTO atlas.driver_profile_field_sources
              (driver_id, field_name, source_id, source_url, retrieved_at, review_status, notes)
            VALUES ($1, $2, $3, $4, $5, 'candidate', $6)
            ON CONFLICT (driver_id, field_name, source_id) DO UPDATE SET
              source_url = EXCLUDED.source_url, retrieved_at = EXCLUDED.retrieved_at,
              review_status = EXCLUDED.review_status, notes = EXCLUDED.notes
          `, [candidate.driverId, fieldName, sourceId, sourceUrl, retrievedAt, `Сопоставление: ${candidate.matchMethod}; F1DB ID: ${candidate.f1dbDriverId}`]);
        }
      }
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    }
  }

  const report = {
    generatedAt: retrievedAt,
    mode: apply ? 'apply' : 'preview',
    source: { id: sourceId, url: sourceUrl, licence: 'CC BY 4.0' },
    note: 'Названия населённых пунктов пока сохранены в написании источника; русификация требует редакторской проверки.',
    totals: {
      databaseDrivers: databaseResult.rowCount,
      f1dbDrivers: f1dbDrivers.length,
      candidates: candidates.length,
      birthPlaces: candidates.filter((item) => item.birthPlaceRu).length,
      deathDates: candidates.filter((item) => item.deathDate).length,
      rejected: rejected.length,
    },
    candidates,
    rejected,
  };
  await mkdir('data/review', { recursive: true });
  const temporaryPath = `${outputPath}.tmp-${process.pid}`;
  await writeFile(temporaryPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  await rename(temporaryPath, outputPath);
  console.log(JSON.stringify(report.totals, null, 2));
  console.log(apply ? 'Кандидаты записаны в базу' : 'Предпросмотр завершён. Для записи добавьте --apply');
} finally {
  await client.end();
}
