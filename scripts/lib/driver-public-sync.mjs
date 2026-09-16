import { mkdir, readFile, readdir, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const catalogDirectory = path.join(projectRoot, 'apps', 'web', 'app', 'data', 'catalogs');

async function writeJsonAtomic(filePath, value) {
  await mkdir(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.tmp-${process.pid}-${Date.now()}`;
  await writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  for (let attempt = 1; attempt <= 10; attempt++) {
    try {
      await rename(temporaryPath, filePath);
      return;
    } catch (error) {
      const canRetry = error?.code === 'EPERM' || error?.code === 'EBUSY';
      if (!canRetry || attempt === 10) throw error;
      await new Promise((resolve) => setTimeout(resolve, attempt * 50));
    }
  }
}

function updateDriverRecord(driver, profile) {
  if (!driver || driver.id !== profile.id) return false;
  driver.nameRu = profile.nameRu;
  driver.birthDate = profile.birthDate;
  driver.deathDate = profile.deathDate;
  driver.birthPlace = profile.birthPlace;
  driver.heightCm = profile.heightCm;
  driver.weightKg = profile.weightKg;
  driver.biography = profile.biography;
  driver.nicknames = profile.nicknames;
  driver.quotes = profile.quotes;
  driver.photoUrl = profile.photoUrl;
  return true;
}

export async function syncDriverPublicData(client, driverId) {
  const profileResult = await client.query(`
    SELECT driver.id,
           coalesce(profile.name_ru, concat_ws(' ', driver.given_name, driver.family_name)) AS name_ru,
           to_char(driver.date_of_birth, 'YYYY-MM-DD') AS birth_date,
           to_char(profile.death_date, 'YYYY-MM-DD') AS death_date,
           profile.birth_place_ru, profile.height_cm, profile.weight_kg, profile.biography_ru,
           media.url AS photo_url
    FROM atlas.drivers AS driver
    LEFT JOIN atlas.driver_profiles AS profile ON profile.driver_id = driver.id
    LEFT JOIN LATERAL (
      SELECT asset.url
      FROM atlas.media_assets AS asset
      WHERE asset.entity_type = 'driver' AND asset.entity_id = driver.id
        AND asset.media_type = 'image' AND asset.usage_role = 'portrait'
        AND asset.is_primary AND asset.rights_status = 'verified'
        AND asset.review_status IN ('reviewed', 'published')
      ORDER BY asset.verified_at DESC NULLS LAST, asset.id
      LIMIT 1
    ) AS media ON true
    WHERE driver.id = $1
  `, [driverId]);
  if (!profileResult.rows[0]) throw new Error(`Не найден пилот ${driverId}`);
  const [nicknamesResult, quotesResult] = await Promise.all([
    client.query(`SELECT id, name_ru, name_original, context_ru, source_url, sort_order
      FROM atlas.driver_nicknames WHERE driver_id = $1
        AND review_status IN ('reviewed', 'verified', 'published')
      ORDER BY sort_order, id`, [driverId]),
    client.query(`SELECT id, quote_ru, quote_original, attribution_ru, context_ru,
        to_char(quote_date, 'YYYY-MM-DD') AS quote_date, source_url, sort_order
      FROM atlas.driver_quotes WHERE driver_id = $1
        AND review_status IN ('reviewed', 'verified', 'published')
      ORDER BY sort_order, id`, [driverId]),
  ]);
  const row = profileResult.rows[0];
  const profile = {
    id: String(row.id),
    nameRu: String(row.name_ru),
    birthDate: row.birth_date ?? null,
    deathDate: row.death_date ?? null,
    birthPlace: row.birth_place_ru ?? null,
    heightCm: row.height_cm === null ? null : Number(row.height_cm),
    weightKg: row.weight_kg === null ? null : Number(row.weight_kg),
    biography: row.biography_ru ?? null,
    nicknames: nicknamesResult.rows.map((nickname) => ({
      id: String(nickname.id), nameRu: nickname.name_ru,
      nameOriginal: nickname.name_original, contextRu: nickname.context_ru,
      sourceUrl: nickname.source_url, sortOrder: Number(nickname.sort_order),
    })),
    quotes: quotesResult.rows.map((quote) => ({
      id: String(quote.id), quoteRu: quote.quote_ru, quoteOriginal: quote.quote_original,
      attributionRu: quote.attribution_ru, contextRu: quote.context_ru,
      quoteDate: quote.quote_date, sourceUrl: quote.source_url, sortOrder: Number(quote.sort_order),
    })),
    photoUrl: row.photo_url ?? null,
  };

  const fileNames = await readdir(catalogDirectory);
  let updatedFiles = 0;
  for (const fileName of fileNames) {
    if (!/^(drivers(?:-all|-\d{4})?|teams-\d{4})\.json$/.test(fileName)) continue;
    const filePath = path.join(catalogDirectory, fileName);
    const document = JSON.parse(await readFile(filePath, 'utf8'));
    let changed = false;
    if (Array.isArray(document)) {
      for (const driver of document) changed = updateDriverRecord(driver, profile) || changed;
    } else if (Array.isArray(document.drivers)) {
      for (const driver of document.drivers) changed = updateDriverRecord(driver, profile) || changed;
    } else if (Array.isArray(document.teams)) {
      for (const team of document.teams) {
        for (const driver of team.drivers ?? []) {
          if (driver.id !== profile.id) continue;
          driver.nameRu = profile.nameRu;
          changed = true;
        }
      }
    }
    if (!changed) continue;
    if (!Array.isArray(document) && 'generatedAt' in document) document.generatedAt = new Date().toISOString();
    await writeJsonAtomic(filePath, document);
    updatedFiles++;
  }

  const mediaResult = await client.query(`
    SELECT entity_id, url
    FROM atlas.media_assets
    WHERE entity_type = 'driver' AND media_type = 'image' AND usage_role = 'portrait'
      AND is_primary AND rights_status = 'verified'
      AND review_status IN ('reviewed', 'published')
    ORDER BY entity_id
  `);
  await writeJsonAtomic(path.join(catalogDirectory, 'driver-media.json'), {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    drivers: Object.fromEntries(mediaResult.rows.map((media) => [media.entity_id, media.url])),
  });
  return { updatedFiles, photoUrl: profile.photoUrl };
}
