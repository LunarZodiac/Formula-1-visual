import { createHash, randomUUID, timingSafeEqual } from 'node:crypto';
import { execFile } from 'node:child_process';
import { access, mkdir, readFile, readdir, rename, unlink, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import path from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { syncDriverPublicData } from './lib/driver-public-sync.mjs';
import { syncConstructorPublicData } from './lib/constructor-public-sync.mjs';
import { processCircuitCard, processConstructorCar, processConstructorLogo, processDriverPortrait, processTravelCategoryIcon, processTravelPointPhoto } from './lib/driver-image-processing.mjs';
import { closeDriverBackgroundWorker, removeDriverBackground } from './lib/driver-background-removal.mjs';
import { publishAdminTrackGeometry } from './lib/track-geometry-public-sync.mjs';
import { discoverTravelCandidates } from './lib/travel-candidate-discovery.mjs';
import { mergeRoutedTail, prepareRouteTailReplacement } from './lib/travel-route-tail-preview.mjs';
import { normalizeTravelRouteStop, travelRouteStopsChanged } from './lib/travel-route-stop-fingerprint.mjs';
import { applyGeneratedRouteBatch } from './lib/travel-route-generation-batch.mjs';
import { buildOsrmRequestUrl, OsrmTransportError, requestOsrmJson, resolveOsrmBaseUrl } from './lib/osrm-routing-client.mjs';
import { planHistoryEraBlockOrder } from './lib/history-era-block-order.mjs';
import { normalizeTrackCalloutPoint } from './lib/track-callout-point.mjs';
import { applyTrackAnnotationPackage, summarizeTrackAnnotationPackage, validateTrackAnnotationPackage } from './import-track-annotations.mjs';
import { deleteStorageObject, storageConfig, storageObjectUrl, storagePublicUrl, uploadStorageObject } from './lib/supabase-storage.mjs';
import { isSupabaseDriverPhotoRegistered, saveSupabaseDriverPhoto } from './lib/supabase-admin-rpc.mjs';

const host = '127.0.0.1';
const port = Number(process.env.ADMIN_DATABASE_API_PORT ?? 3102);
const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, '..');
const mapUiSettingsPath = path.join(repositoryRoot, 'apps', 'web', 'app', 'data', 'map-ui-settings.json');
const gamesMediaPath = path.join(repositoryRoot, 'apps', 'web', 'public', 'data', 'games-media.json');
const execFileAsync = promisify(execFile);
const apiSecret = process.env.ADMIN_SESSION_SECRET?.trim();
const osrmBaseUrl = resolveOsrmBaseUrl();
const requiredDatabaseVariables = ['PGHOST', 'PGPORT', 'PGDATABASE', 'PGUSER', 'PGPASSWORD'];
const missingDatabaseVariables = requiredDatabaseVariables.filter((name) => !process.env[name]);

if (!apiSecret) throw new Error('ADMIN_SESSION_SECRET не задан в apps/web/.dev.vars');
if (missingDatabaseVariables.length) throw new Error(`Не заданы параметры PostgreSQL: ${missingDatabaseVariables.join(', ')}`);

const pool = new pg.Pool({
  max: 3,
  idleTimeoutMillis: 10_000,
  connectionTimeoutMillis: 3_000,
  allowExitOnIdle: true,
});
const apiToken = createHash('sha256').update(apiSecret).digest('hex');
const travelImportPreviews = new Map();
const travelImportPreviewTtlMs = 15 * 60 * 1000;
const trackAnnotationImportPreviews = new Map();
const trackAnnotationImportPreviewTtlMs = 20 * 60 * 1000;
const travelRouteGenerationPreviews = new Map();
const travelRouteTailPreviews = new Map();
const travelRouteTailPreviewTtlMs = 15 * 60 * 1000;
const activeSeasonSyncs = new Set();

async function syncJolpicaSeason(rawInput) {
  const season = Number(rawInput?.season);
  const currentYear = new Date().getUTCFullYear();
  if (!Number.isInteger(season) || season < 1950 || season > currentYear + 1) throw new Error('Некорректный сезон для обновления');
  if (activeSeasonSyncs.has(season)) throw new Error(`Обновление сезона ${season} уже выполняется`);
  activeSeasonSyncs.add(season);
  try {
    const { stdout, stderr } = await execFileAsync(process.execPath, [
      path.join(scriptDirectory, 'sync-active-season.mjs'), `--season=${season}`, '--apply',
    ], {
      cwd: repositoryRoot,
      env: process.env,
      maxBuffer: 8 * 1024 * 1024,
      windowsHide: true,
    });
    const manifestPath = path.join(repositoryRoot, 'tmp', 'jolpica-api-snapshots', String(season), 'latest.json');
    const snapshot = JSON.parse(await readFile(manifestPath, 'utf8'));
    return {
      season,
      completedAt: new Date().toISOString(),
      snapshot,
      summary: String(stdout ?? '').split(/\r?\n/).map((line) => line.trim()).filter(Boolean).slice(-12),
      warnings: String(stderr ?? '').split(/\r?\n/).map((line) => line.trim()).filter(Boolean).slice(-12),
    };
  } finally {
    activeSeasonSyncs.delete(season);
  }
}
async function getMapUiSettings() {
  const stored = JSON.parse(await readFile(mapUiSettingsPath, 'utf8').catch(() => '{"detailedAttribution":false}'));
  return { detailedAttribution: stored?.detailedAttribution === true };
}

async function saveMapUiSettings(rawInput) {
  const settings = { detailedAttribution: rawInput?.detailedAttribution === true };
  const temporaryPath = `${mapUiSettingsPath}.tmp-${process.pid}`;
  await writeFile(temporaryPath, `${JSON.stringify(settings, null, 2)}\n`, 'utf8');
  await rename(temporaryPath, mapUiSettingsPath);
  return settings;
}

function safeEqual(left, right) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

function authorized(request) {
  return safeEqual(request.headers.authorization ?? '', `Bearer ${apiToken}`);
}

function json(response, status, value) {
  response.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  response.end(JSON.stringify(value));
}

async function requestBody(request, maximumBytes = 100_000) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > maximumBytes) throw new Error('Слишком большой запрос');
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

async function binaryRequestBody(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 8 * 1024 * 1024) throw new Error('Фотография больше 8 МБ');
    chunks.push(chunk);
  }
  if (size < 1) throw new Error('Пустой файл');
  return Buffer.concat(chunks);
}

function rawUploadMetadata(request) {
  const encoded = request.headers['x-upload-metadata'];
  if (typeof encoded !== 'string' || encoded.length > 8_000) throw new Error('Не указаны сведения о фотографии');
  return JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));
}

function uploadMetadata(request) {
  const value = rawUploadMetadata(request);
  const text = (field, maximum = 500) => {
    const result = typeof value[field] === 'string' ? value[field].trim() : '';
    if (!result || result.length > maximum) throw new Error(`Некорректное поле ${field}`);
    return result;
  };
  const sourceUrl = new URL(text('sourceUrl', 2_000));
  if (!['http:', 'https:'].includes(sourceUrl.protocol) || sourceUrl.username || sourceUrl.password) throw new Error('Некорректный URL источника фотографии');
  const number = (field, minimum, maximum, fallback) => {
    const result = Number(value[field]);
    if (!Number.isFinite(result) || result < minimum || result > maximum) return fallback;
    return result;
  };
  return {
    fileName: text('fileName', 255),
    mimeType: text('mimeType', 100),
    altTextRu: text('altTextRu'),
    author: text('author'),
    licence: text('licence'),
    sourceUrl: sourceUrl.href,
    removeBackground: value.removeBackground === true,
    previewToken: typeof value.previewToken === 'string' ? value.previewToken : '',
    crop: {
      zoom: number('cropZoom', 1, 3, 1),
      x: number('cropX', -50, 50, 0),
      y: number('cropY', -50, 50, 0),
    },
  };
}

function previewMetadata(request) {
  const value = rawUploadMetadata(request);
  const text = (field, maximum = 500) => {
    const result = typeof value[field] === 'string' ? value[field].trim() : '';
    if (!result || result.length > maximum) throw new Error(`Некорректное поле ${field}`);
    return result;
  };
  return {
    fileName: text('fileName', 255),
    mimeType: text('mimeType', 100),
    removeBackground: value.removeBackground === true,
  };
}

function imageFormat(buffer, claimedMimeType) {
  const signatures = [
    { mimeType: 'image/jpeg', extension: 'jpg', valid: buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff },
    { mimeType: 'image/png', extension: 'png', valid: buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) },
    { mimeType: 'image/webp', extension: 'webp', valid: buffer.length >= 12 && buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP' },
  ];
  const detected = signatures.find((format) => format.valid);
  if (!detected || detected.mimeType !== claimedMimeType) throw new Error('Разрешены только корректные JPG, PNG и WebP');
  return detected;
}

function mapDriver(row) {
  return {
    id: String(row.id),
    givenName: String(row.given_name),
    familyName: String(row.family_name),
    abbreviation: row.abbreviation === null ? null : String(row.abbreviation).trim(),
    permanentNumber: row.permanent_number === null ? null : Number(row.permanent_number),
    nationality: row.nationality === null ? null : String(row.nationality),
    driverSourceId: row.driver_source_id === null ? null : String(row.driver_source_id),
    driverUpdatedAt: String(row.driver_updated_at),
    nameRu: row.name_ru === null ? null : String(row.name_ru),
    birthDate: row.birth_date === null ? null : String(row.birth_date),
    birthPlaceRu: row.birth_place_ru === null ? null : String(row.birth_place_ru),
    deathDate: row.death_date === null ? null : String(row.death_date),
    heightCm: row.height_cm === null ? null : String(row.height_cm),
    weightKg: row.weight_kg === null ? null : String(row.weight_kg),
    biographyRu: row.biography_ru === null ? null : String(row.biography_ru),
    nicknames: Array.isArray(row.nicknames) ? row.nicknames.map((nickname) => ({
      id: String(nickname.id), nameRu: String(nickname.nameRu),
      nameOriginal: nickname.nameOriginal === null ? null : String(nickname.nameOriginal),
      contextRu: nickname.contextRu === null ? null : String(nickname.contextRu),
      sourceUrl: String(nickname.sourceUrl), reviewStatus: String(nickname.reviewStatus),
    })) : [],
    quotes: Array.isArray(row.quotes) ? row.quotes.map((quote) => ({
      id: String(quote.id), quoteRu: String(quote.quoteRu),
      quoteOriginal: quote.quoteOriginal === null ? null : String(quote.quoteOriginal),
      attributionRu: String(quote.attributionRu), contextRu: quote.contextRu === null ? null : String(quote.contextRu),
      quoteDate: quote.quoteDate === null ? null : String(quote.quoteDate),
      sourceUrl: String(quote.sourceUrl), reviewStatus: String(quote.reviewStatus),
    })) : [],
    reviewStatus: String(row.review_status ?? 'candidate'),
    profileSourceId: row.profile_source_id === null ? null : String(row.profile_source_id),
    profileUpdatedAt: row.profile_updated_at === null ? null : new Date(row.profile_updated_at).toISOString(),
    nameRuReviewStatus: row.name_ru_review_status === null ? null : String(row.name_ru_review_status),
    nameRuSourceId: row.name_ru_source_id === null ? null : String(row.name_ru_source_id),
    nameRuSourceUrl: row.name_ru_source_url === null ? null : String(row.name_ru_source_url),
    nameRuSourceNote: row.name_ru_source_note === null ? null : String(row.name_ru_source_note),
    photo: row.photo_url === null ? null : {
      url: String(row.photo_url),
      altTextRu: String(row.photo_alt_text_ru),
      author: String(row.photo_author),
      licence: String(row.photo_licence),
      sourceUrl: String(row.photo_source_url),
      rightsStatus: String(row.photo_rights_status),
      reviewStatus: String(row.photo_review_status),
    },
  };
}

const driverSelect = `
  SELECT driver.id, driver.given_name, driver.family_name,
         driver.abbreviation, driver.permanent_number, driver.nationality,
         driver.source_id AS driver_source_id,
         to_char(driver.updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS driver_updated_at,
         to_char(driver.date_of_birth, 'YYYY-MM-DD') AS birth_date,
         profile.name_ru, profile.birth_place_ru,
         to_char(profile.death_date, 'YYYY-MM-DD') AS death_date,
         profile.height_cm, profile.weight_kg, profile.biography_ru,
         coalesce(profile.review_status, 'candidate') AS review_status,
         profile.source_id AS profile_source_id, profile.updated_at AS profile_updated_at,
         name_source.review_status AS name_ru_review_status,
         name_source.source_id AS name_ru_source_id,
         name_source.source_url AS name_ru_source_url,
         name_source.notes AS name_ru_source_note,
         photo.url AS photo_url, photo.alt_text_ru AS photo_alt_text_ru,
         photo.author AS photo_author, photo.licence AS photo_licence,
         photo.source_url AS photo_source_url, photo.rights_status AS photo_rights_status,
         photo.review_status AS photo_review_status,
         coalesce(nicknames.items, '[]'::jsonb) AS nicknames,
         coalesce(quotes.items, '[]'::jsonb) AS quotes
  FROM atlas.drivers AS driver
  LEFT JOIN atlas.driver_profiles AS profile ON profile.driver_id = driver.id
  LEFT JOIN LATERAL (
    SELECT field_source.review_status, field_source.source_id,
           field_source.source_url, field_source.notes
    FROM atlas.driver_profile_field_sources AS field_source
    WHERE field_source.driver_id = driver.id AND field_source.field_name = 'name_ru'
    ORDER BY field_source.retrieved_at DESC,
      CASE field_source.review_status
        WHEN 'verified' THEN 1 WHEN 'reviewed' THEN 2 WHEN 'candidate' THEN 3 ELSE 4 END,
      field_source.source_id
    LIMIT 1
  ) AS name_source ON true
  LEFT JOIN LATERAL (
    SELECT asset.url, asset.alt_text_ru, asset.author, asset.licence,
           asset.source_url, asset.rights_status, asset.review_status
    FROM atlas.media_assets AS asset
    WHERE asset.entity_type = 'driver' AND asset.entity_id = driver.id
      AND asset.media_type = 'image' AND asset.usage_role = 'portrait' AND asset.is_primary
    ORDER BY asset.verified_at DESC NULLS LAST, asset.id
    LIMIT 1
  ) AS photo ON true
  LEFT JOIN LATERAL (
    SELECT jsonb_agg(jsonb_build_object(
      'id', nickname.id, 'nameRu', nickname.name_ru, 'nameOriginal', nickname.name_original,
      'contextRu', nickname.context_ru, 'sourceUrl', nickname.source_url,
      'reviewStatus', nickname.review_status
    ) ORDER BY nickname.sort_order, nickname.id) AS items
    FROM atlas.driver_nicknames AS nickname
    WHERE nickname.driver_id = driver.id
  ) AS nicknames ON true
  LEFT JOIN LATERAL (
    SELECT jsonb_agg(jsonb_build_object(
      'id', quote.id, 'quoteRu', quote.quote_ru, 'quoteOriginal', quote.quote_original,
      'attributionRu', quote.attribution_ru, 'contextRu', quote.context_ru,
      'quoteDate', to_char(quote.quote_date, 'YYYY-MM-DD'), 'sourceUrl', quote.source_url,
      'reviewStatus', quote.review_status
    ) ORDER BY quote.sort_order, quote.id) AS items
    FROM atlas.driver_quotes AS quote
    WHERE quote.driver_id = driver.id
  ) AS quotes ON true
  WHERE driver.id = $1
`;

async function getDriver(id) {
  const result = await pool.query(driverSelect, [id]);
  return result.rows[0] ? mapDriver(result.rows[0]) : null;
}

async function getSeasons() {
  const result = await pool.query(`SELECT season.year, season.status, season.rounds_planned,
      season.source_id, source.url AS source_url, season.updated_at,
      count(race.id)::int AS races_available
    FROM atlas.seasons AS season
    LEFT JOIN atlas.races AS race ON race.season_year = season.year
    LEFT JOIN atlas.data_sources AS source ON source.id = season.source_id
    GROUP BY season.year, season.status, season.rounds_planned, season.source_id, source.url, season.updated_at
    ORDER BY season.year DESC`);
  return result.rows.map((row) => ({
    year: Number(row.year), status: String(row.status),
    roundsPlanned: row.rounds_planned === null ? null : Number(row.rounds_planned),
    racesAvailable: Number(row.races_available), sourceId: row.source_id,
    sourceUrl: row.source_url, updatedAt: new Date(row.updated_at).toISOString(),
  }));
}

async function syncSeasonIndex(client) {
  const result = await client.query(`SELECT season.year, season.status, season.rounds_planned,
      count(race.id)::int AS races_available, season.updated_at
    FROM atlas.seasons AS season LEFT JOIN atlas.races AS race ON race.season_year = season.year
    GROUP BY season.year, season.status, season.rounds_planned, season.updated_at
    ORDER BY season.year DESC`);
  const generatedAt = new Date().toISOString();
  const outputDirectory = path.resolve('apps', 'web', 'public', 'data', 'f1');
  const indexPath = path.join(outputDirectory, 'seasons.json');
  let existingSeasons = [];
  try { existingSeasons = JSON.parse(await readFile(indexPath, 'utf8')).seasons ?? []; } catch {}
  const databaseYears = new Set(result.rows.map((row) => Number(row.year)));
  const rowsWithSnapshots = [];
  for (const row of result.rows) {
    let hasSnapshot = Number(row.races_available) > 0;
    if (!hasSnapshot) try { await access(path.join(outputDirectory, `season-${row.year}.json`)); hasSnapshot = true; } catch {}
    if (hasSnapshot) rowsWithSnapshots.push({ year: Number(row.year), status: row.status,
      roundsPlanned: row.rounds_planned === null ? null : Number(row.rounds_planned), racesAvailable: Number(row.races_available) });
  }
  for (const season of existingSeasons) {
    const year = Number(season?.year);
    if (!Number.isInteger(year) || databaseYears.has(year) || season?.status !== 'planned') continue;
    try { await access(path.join(outputDirectory, `season-${year}.json`)); }
    catch { continue; }
    rowsWithSnapshots.push({ year, status: 'planned', roundsPlanned: Number(season.roundsPlanned ?? 0), racesAvailable: Number(season.racesAvailable ?? 0) });
  }
  rowsWithSnapshots.sort((left, right) => right.year - left.year);
  const document = {
    exportedAt: generatedAt,
    sourceChangedAt: result.rows.reduce((latest, row) => {
      const value = new Date(row.updated_at).toISOString(); return value > latest ? value : latest;
    }, '1970-01-01T00:00:00.000Z'),
    seasons: rowsWithSnapshots,
  };
  const filePath = indexPath;
  const temporaryPath = `${filePath}.tmp-${process.pid}`;
  await writeFile(temporaryPath, `${JSON.stringify(document, null, 2)}\n`, 'utf8');
  await rename(temporaryPath, filePath);
}

async function saveSeason(rawInput, routeYear = null) {
  const year = Number(routeYear ?? rawInput?.year);
  if (!Number.isInteger(year) || year < 1950 || year > 2100) throw new Error('Некорректный год сезона');
  const status = String(rawInput?.status ?? '');
  if (!['planned', 'active', 'completed', 'cancelled'].includes(status)) throw new Error('Некорректный статус сезона');
  const roundsPlanned = rawInput?.roundsPlanned === null || rawInput?.roundsPlanned === '' ? null : Number(rawInput.roundsPlanned);
  if (roundsPlanned !== null && (!Number.isInteger(roundsPlanned) || roundsPlanned < 0 || roundsPlanned > 40)) throw new Error('Некорректное число этапов');
  const sourceUrl = validateEditorialUrl(rawInput?.sourceUrl);
  const sourceId = `admin-${createHash('sha256').update(sourceUrl).digest('hex').slice(0, 16)}`;
  const client = await pool.connect();
  let committed = false;
  try {
    await client.query('BEGIN');
    await client.query(`INSERT INTO atlas.data_sources (id, name, url, retrieved_at, notes)
      VALUES ($1, $2, $3, now(), 'Источник сведений о сезоне')
      ON CONFLICT (id) DO UPDATE SET url = EXCLUDED.url, retrieved_at = EXCLUDED.retrieved_at`,
    [sourceId, new URL(sourceUrl).hostname, sourceUrl]);
    const existing = await client.query('SELECT year FROM atlas.seasons WHERE year = $1', [year]);
    if (routeYear !== null && !existing.rows[0]) { await client.query('ROLLBACK'); return null; }
    await client.query(`INSERT INTO atlas.seasons (year, status, rounds_planned, source_id, updated_at)
      VALUES ($1, $2, $3, $4, now()) ON CONFLICT (year) DO UPDATE SET
      status = EXCLUDED.status, rounds_planned = EXCLUDED.rounds_planned,
      source_id = EXCLUDED.source_id, updated_at = EXCLUDED.updated_at`,
    [year, status, roundsPlanned, sourceId]);
    await client.query('COMMIT'); committed = true;
    let publicDataSynced = true;
    try { await syncSeasonIndex(client); } catch (error) { publicDataSynced = false; console.error('Сезон сохранён, но индекс сезонов не синхронизирован', error); }
    return { year, publicDataSynced };
  } catch (error) {
    if (!committed) await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally { client.release(); }
}

const raceStatusValues = new Set(['scheduled', 'live', 'completed', 'cancelled', 'postponed']);

function dateOnly(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value)) return value.slice(0, 10);
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const year = value.getFullYear(); const month = String(value.getMonth() + 1).padStart(2, '0');
    const day = String(value.getDate()).padStart(2, '0'); return `${year}-${month}-${day}`;
  }
  throw new Error('База вернула некорректную дату этапа');
}

function mapAdminRace(row) {
  return {
    id: String(row.id), seasonYear: Number(row.season_year), round: Number(row.round),
    name: String(row.name), raceDate: dateOnly(row.race_date),
    startTimeUtc: row.start_time_utc === null ? null : String(row.start_time_utc).slice(0, 8),
    status: String(row.status), circuitId: String(row.circuit_id),
    circuitName: String(row.circuit_name), layoutId: row.layout_id === null ? null : String(row.layout_id),
    layoutName: row.layout_name === null ? null : String(row.layout_name),
    sourceUrl: row.source_url === null ? null : String(row.source_url),
    sessionCount: Number(row.session_count ?? 0), completedSessionCount: Number(row.completed_session_count ?? 0),
    resultCount: Number(row.result_count ?? 0),
    winner: row.winner_id === null ? null : { id: String(row.winner_id), name: String(row.winner_name) },
    updatedAt: new Date(row.updated_at).toISOString(),
  };
}

async function getAdminRaces(url) {
  const page = boundedPositiveInteger(url.searchParams.get('page'), 1);
  const limit = boundedPositiveInteger(url.searchParams.get('limit'), 30, 100);
  const requestedSeason = Number(url.searchParams.get('season'));
  const season = Number.isInteger(requestedSeason) && requestedSeason >= 1950 && requestedSeason <= 2100 ? requestedSeason : null;
  const query = String(url.searchParams.get('q') ?? '').trim().slice(0, 120);
  const status = raceStatusValues.has(url.searchParams.get('status')) ? url.searchParams.get('status') : '';
  const circuitId = /^[A-Za-z0-9_-]+$/.test(url.searchParams.get('circuit') ?? '') ? url.searchParams.get('circuit') : '';
  const values = [season, query, status, circuitId, limit, (page - 1) * limit];
  const base = `FROM atlas.races AS race
    JOIN atlas.circuits AS circuit ON circuit.id = race.circuit_id
    LEFT JOIN atlas.circuit_page_profiles AS profile ON profile.circuit_id = circuit.id
    LEFT JOIN atlas.track_layouts AS layout ON layout.id = race.layout_id AND layout.circuit_id = race.circuit_id
    LEFT JOIN atlas.data_sources AS source ON source.id = race.source_id
    LEFT JOIN atlas.sessions AS session ON session.race_id = race.id
    LEFT JOIN atlas.session_results AS result ON result.session_id = session.id
    LEFT JOIN LATERAL (
      SELECT winner.driver_id, coalesce(driver_profile.name_ru, concat_ws(' ', driver.given_name, driver.family_name)) AS name
      FROM atlas.sessions AS race_session
      JOIN atlas.session_results AS winner ON winner.session_id = race_session.id AND winner.position_order = 1
      JOIN atlas.drivers AS driver ON driver.id = winner.driver_id
      LEFT JOIN atlas.driver_profiles AS driver_profile ON driver_profile.driver_id = driver.id
      WHERE race_session.race_id = race.id AND race_session.session_type = 'race'
      ORDER BY winner.position_order LIMIT 1
    ) AS winner ON true
    WHERE ($1::smallint IS NULL OR race.season_year = $1)
      AND ($2 = '' OR concat_ws(' ', race.id, race.name, circuit.id, circuit.name, profile.name_ru) ILIKE '%' || $2 || '%')
      AND ($3 = '' OR race.status = $3) AND ($4 = '' OR race.circuit_id = $4)`;
  const [rows, count, options] = await Promise.all([
    pool.query(`SELECT race.id, race.season_year, race.round, race.name, race.race_date, race.start_time_utc,
      race.status, race.circuit_id, coalesce(profile.name_ru, circuit.short_name, circuit.name) AS circuit_name,
      race.layout_id, layout.name AS layout_name, source.url AS source_url, race.updated_at,
      count(DISTINCT session.id)::int AS session_count,
      count(DISTINCT session.id) FILTER (WHERE session.status = 'completed')::int AS completed_session_count,
      count(DISTINCT (result.session_id, result.driver_id))::int AS result_count,
      winner.driver_id AS winner_id, winner.name AS winner_name
      ${base} GROUP BY race.id, profile.name_ru, circuit.short_name, circuit.name, layout.name,
      source.url, winner.driver_id, winner.name
      ORDER BY race.season_year DESC, race.round ASC LIMIT $5 OFFSET $6`, values),
    pool.query(`SELECT count(DISTINCT race.id)::int AS count ${base}`, values.slice(0, 4)),
    pool.query(`SELECT
      (SELECT array_agg(year ORDER BY year DESC) FROM atlas.seasons) AS seasons,
      (SELECT jsonb_agg(jsonb_build_object('id', circuit.id, 'name', coalesce(profile.name_ru, circuit.short_name, circuit.name)) ORDER BY lower(coalesce(profile.name_ru, circuit.short_name, circuit.name)))
       FROM atlas.circuits AS circuit LEFT JOIN atlas.circuit_page_profiles AS profile ON profile.circuit_id = circuit.id) AS circuits`),
  ]);
  return { rows: rows.rows.map(mapAdminRace), filteredCount: Number(count.rows[0].count), page, limit,
    seasons: options.rows[0].seasons ?? [], circuits: options.rows[0].circuits ?? [] };
}

async function getAdminRace(id) {
  if (!/^[A-Za-z0-9_-]+$/.test(id)) return null;
  const result = await pool.query(`SELECT race.id, race.season_year, race.round, race.name, race.race_date,
      race.start_time_utc, race.status, race.circuit_id,
      coalesce(profile.name_ru, circuit.short_name, circuit.name) AS circuit_name,
      race.layout_id, layout.name AS layout_name, source.url AS source_url, race.updated_at,
      count(DISTINCT session.id)::int AS session_count,
      count(DISTINCT session.id) FILTER (WHERE session.status = 'completed')::int AS completed_session_count,
      count(DISTINCT (result.session_id, result.driver_id))::int AS result_count,
      winner.driver_id AS winner_id, winner.name AS winner_name
    FROM atlas.races AS race
    JOIN atlas.circuits AS circuit ON circuit.id = race.circuit_id
    LEFT JOIN atlas.circuit_page_profiles AS profile ON profile.circuit_id = circuit.id
    LEFT JOIN atlas.track_layouts AS layout ON layout.id = race.layout_id AND layout.circuit_id = race.circuit_id
    LEFT JOIN atlas.data_sources AS source ON source.id = race.source_id
    LEFT JOIN atlas.sessions AS session ON session.race_id = race.id
    LEFT JOIN atlas.session_results AS result ON result.session_id = session.id
    LEFT JOIN LATERAL (
      SELECT winner.driver_id, coalesce(driver_profile.name_ru, concat_ws(' ', driver.given_name, driver.family_name)) AS name
      FROM atlas.sessions AS race_session
      JOIN atlas.session_results AS winner ON winner.session_id = race_session.id AND winner.position_order = 1
      JOIN atlas.drivers AS driver ON driver.id = winner.driver_id
      LEFT JOIN atlas.driver_profiles AS driver_profile ON driver_profile.driver_id = driver.id
      WHERE race_session.race_id = race.id AND race_session.session_type = 'race' ORDER BY winner.position_order LIMIT 1
    ) AS winner ON true
    WHERE race.id = $1 GROUP BY race.id, profile.name_ru, circuit.short_name, circuit.name, layout.name,
      source.url, winner.driver_id, winner.name`, [id]);
  return result.rows[0] ? mapAdminRace(result.rows[0]) : null;
}

async function getRaceEditorOptions() {
  const [seasons, circuits] = await Promise.all([
    pool.query('SELECT year FROM atlas.seasons ORDER BY year DESC'),
    pool.query(`SELECT circuit.id, coalesce(profile.name_ru, circuit.short_name, circuit.name) AS name,
        coalesce(jsonb_agg(jsonb_build_object(
          'id', layout.id, 'name', layout.name, 'validFromYear', layout.valid_from_year,
          'validToYear', layout.valid_to_year, 'reviewStatus', layout.review_status
        ) ORDER BY layout.valid_from_year NULLS LAST, layout.name) FILTER (WHERE layout.id IS NOT NULL), '[]'::jsonb) AS layouts
      FROM atlas.circuits AS circuit
      LEFT JOIN atlas.circuit_page_profiles AS profile ON profile.circuit_id = circuit.id
      LEFT JOIN atlas.track_layouts AS layout ON layout.circuit_id = circuit.id
      GROUP BY circuit.id, profile.name_ru ORDER BY lower(coalesce(profile.name_ru, circuit.short_name, circuit.name))`),
  ]);
  return { seasons: seasons.rows.map((row) => Number(row.year)), circuits: circuits.rows.map((row) => ({
    id: String(row.id), name: String(row.name), layouts: row.layouts,
  })) };
}

function validateRaceInput(rawInput, routeId = null) {
  if (!rawInput || typeof rawInput !== 'object') throw new Error('Некорректные данные этапа');
  const required = (field) => { const value = optionalText(rawInput[field]); if (!value) throw new Error(`Поле ${field} обязательно`); return value; };
  const id = routeId ?? required('id');
  if (!/^[A-Za-z0-9_-]+$/.test(id)) throw new Error('ID этапа может содержать только латинские буквы, цифры, дефис и подчёркивание');
  const seasonYear = Number(rawInput.seasonYear); const round = Number(rawInput.round);
  if (!Number.isInteger(seasonYear) || seasonYear < 1950 || seasonYear > 2100) throw new Error('Некорректный сезон');
  if (!Number.isInteger(round) || round < 1 || round > 40) throw new Error('Некорректный номер этапа');
  const status = required('status'); if (!raceStatusValues.has(status)) throw new Error('Некорректный статус этапа');
  const circuitId = required('circuitId'); if (!/^[A-Za-z0-9_-]+$/.test(circuitId)) throw new Error('Некорректная трасса');
  const layoutId = optionalText(rawInput.layoutId); if (layoutId && !/^[A-Za-z0-9_-]+$/.test(layoutId)) throw new Error('Некорректная конфигурация');
  const raceDate = optionalText(rawInput.raceDate);
  if (raceDate && !/^\d{4}-\d{2}-\d{2}$/.test(raceDate)) throw new Error('Некорректная дата этапа');
  const startTimeUtc = optionalText(rawInput.startTimeUtc);
  if (startTimeUtc && !/^([01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/.test(startTimeUtc)) throw new Error('Некорректное время старта');
  return { id, seasonYear, round, name: required('name'), raceDate, startTimeUtc, status, circuitId, layoutId,
    sourceUrl: validateEditorialUrl(rawInput.sourceUrl), sourceVerified: rawInput.sourceVerified === true };
}

async function syncRacePublicData(seasons) {
  for (const season of [...new Set(seasons)]) {
    await execFileAsync(process.execPath, [path.join(repositoryRoot, 'scripts', 'export-web-snapshots.mjs'), `--season=${season}`], { cwd: repositoryRoot, env: process.env });
  }
  await execFileAsync(process.execPath, [path.join(repositoryRoot, 'scripts', 'export-search-index.mjs')], { cwd: repositoryRoot, env: process.env });
}

async function saveAdminRace(rawInput, routeId = null) {
  const input = validateRaceInput(rawInput, routeId);
  if (['live', 'completed'].includes(input.status) && !input.sourceVerified) throw new Error('Для идущего или завершённого этапа подтвердите источник');
  const client = await pool.connect(); let committed = false; let previousSeason = null;
  try {
    await client.query('BEGIN');
    const [season, circuit, layout, existing, duplicate] = await Promise.all([
      client.query('SELECT year FROM atlas.seasons WHERE year=$1', [input.seasonYear]),
      client.query('SELECT id FROM atlas.circuits WHERE id=$1', [input.circuitId]),
      input.layoutId ? client.query(`SELECT id, valid_from_year, valid_to_year FROM atlas.track_layouts
        WHERE id=$1 AND circuit_id=$2`, [input.layoutId, input.circuitId]) : Promise.resolve({ rows: [] }),
      client.query('SELECT id, season_year FROM atlas.races WHERE id=$1 FOR UPDATE', [input.id]),
      client.query('SELECT id FROM atlas.races WHERE season_year=$1 AND round=$2 AND id<>$3', [input.seasonYear, input.round, input.id]),
    ]);
    if (!season.rows[0]) throw new Error('Сначала добавьте сезон');
    if (!circuit.rows[0]) throw new Error('Трасса не найдена');
    if (input.layoutId && !layout.rows[0]) throw new Error('Конфигурация не относится к выбранной трассе');
    if (input.layoutId && ((layout.rows[0].valid_from_year !== null && input.seasonYear < layout.rows[0].valid_from_year)
      || (layout.rows[0].valid_to_year !== null && input.seasonYear > layout.rows[0].valid_to_year))) throw new Error('Сезон находится вне периода использования конфигурации');
    if (duplicate.rows[0]) throw new Error('В этом сезоне уже существует этап с таким номером');
    if (routeId && !existing.rows[0]) { await client.query('ROLLBACK'); return null; }
    if (!routeId && existing.rows[0]) throw new Error('Этап с таким ID уже существует');
    previousSeason = existing.rows[0]?.season_year === undefined ? null : Number(existing.rows[0].season_year);
    const sourceId = `admin-${createHash('sha256').update(input.sourceUrl).digest('hex').slice(0, 16)}`;
    await client.query(`INSERT INTO atlas.data_sources (id,name,url,retrieved_at,notes) VALUES ($1,$2,$3,now(),$4)
      ON CONFLICT (id) DO UPDATE SET name=EXCLUDED.name,url=EXCLUDED.url,retrieved_at=EXCLUDED.retrieved_at,notes=EXCLUDED.notes`,
    [sourceId, new URL(input.sourceUrl).hostname, input.sourceUrl, input.sourceVerified ? 'Источник этапа проверен в админке' : 'Источник этапа добавлен в админке']);
    await client.query(`INSERT INTO atlas.races (id,season_year,round,circuit_id,layout_id,name,race_date,start_time_utc,status,source_id,updated_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,now()) ON CONFLICT (id) DO UPDATE SET
      season_year=EXCLUDED.season_year,round=EXCLUDED.round,circuit_id=EXCLUDED.circuit_id,layout_id=EXCLUDED.layout_id,
      name=EXCLUDED.name,race_date=EXCLUDED.race_date,start_time_utc=EXCLUDED.start_time_utc,status=EXCLUDED.status,
      source_id=EXCLUDED.source_id,updated_at=now()`,
    [input.id, input.seasonYear, input.round, input.circuitId, input.layoutId, input.name,
      input.raceDate, input.startTimeUtc, input.status, sourceId]);
    await client.query('COMMIT'); committed = true;
    let publicDataSynced = true;
    try { await syncRacePublicData([input.seasonYear, previousSeason].filter(Number.isInteger)); }
    catch (error) { publicDataSynced = false; console.error('Этап сохранён, но публичный календарь не синхронизирован', error); }
    return { id: input.id, seasonYear: input.seasonYear, publicDataSynced };
  } catch (error) {
    if (!committed) await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally { client.release(); }
}

const sessionTypeValues = new Set(['practice_1', 'practice_2', 'practice_3', 'qualifying', 'sprint_shootout', 'sprint', 'race']);

function mapAdminSession(row) {
  return {
    id: String(row.id), raceId: String(row.race_id), sessionType: String(row.session_type), name: String(row.name),
    startsAt: row.starts_at === null ? null : new Date(row.starts_at).toISOString(),
    endsAt: row.ends_at === null ? null : new Date(row.ends_at).toISOString(), status: String(row.status),
    sourceUrl: row.source_url === null ? null : String(row.source_url), resultCount: Number(row.result_count ?? 0),
    updatedAt: new Date(row.updated_at).toISOString(),
  };
}

async function getEventSessions(raceId) {
  if (!/^[A-Za-z0-9_-]+$/.test(raceId)) return null;
  const race = await pool.query('SELECT id FROM atlas.races WHERE id=$1', [raceId]);
  if (!race.rows[0]) return null;
  const result = await pool.query(`SELECT session.id, session.race_id, session.session_type, session.name,
      session.starts_at, session.ends_at, session.status, source.url AS source_url, session.updated_at,
      count(result.driver_id)::int AS result_count
    FROM atlas.sessions AS session
    LEFT JOIN atlas.data_sources AS source ON source.id=session.source_id
    LEFT JOIN atlas.session_results AS result ON result.session_id=session.id
    WHERE session.race_id=$1
    GROUP BY session.id, source.url
    ORDER BY CASE session.session_type WHEN 'practice_1' THEN 1 WHEN 'practice_2' THEN 2 WHEN 'practice_3' THEN 3
      WHEN 'sprint_shootout' THEN 4 WHEN 'sprint' THEN 5 WHEN 'qualifying' THEN 6 WHEN 'race' THEN 7 ELSE 8 END`, [raceId]);
  return { rows: result.rows.map(mapAdminSession) };
}

async function getEventSession(raceId, sessionId) {
  if (!/^[A-Za-z0-9_-]+$/.test(raceId) || !/^[A-Za-z0-9_-]+$/.test(sessionId)) return null;
  const [session, results, drivers, constructors] = await Promise.all([
    pool.query(`SELECT session.id, session.race_id, session.session_type, session.name, session.starts_at, session.ends_at,
        session.status, source.url AS source_url, session.updated_at, count(result.driver_id)::int AS result_count,
        race.season_year, race.round, race.name AS race_name
      FROM atlas.sessions AS session JOIN atlas.races AS race ON race.id=session.race_id
      LEFT JOIN atlas.data_sources AS source ON source.id=session.source_id
      LEFT JOIN atlas.session_results AS result ON result.session_id=session.id
      WHERE session.race_id=$1 AND session.id=$2 GROUP BY session.id, source.url, race.id`, [raceId, sessionId]),
    pool.query(`SELECT result.driver_id, coalesce(profile.name_ru, concat_ws(' ', driver.given_name, driver.family_name)) AS driver_name,
        result.position_order, result.position_text, result.constructor_entry_id, entry.display_name AS constructor_name,
        result.grid_position, result.laps, result.status, result.points, result.elapsed_ms, result.gap_ms, result.gap_text,
        result.fastest_lap_rank, result.fastest_lap_number, result.fastest_lap_ms, result.details,
        source.url AS source_url
      FROM atlas.session_results AS result JOIN atlas.drivers AS driver ON driver.id=result.driver_id
      LEFT JOIN atlas.driver_profiles AS profile ON profile.driver_id=driver.id
      LEFT JOIN atlas.constructor_entries AS entry ON entry.id=result.constructor_entry_id
      LEFT JOIN atlas.data_sources AS source ON source.id=result.source_id
      WHERE result.session_id=$1 ORDER BY result.position_order, result.driver_id`, [sessionId]),
    pool.query(`SELECT driver.id, coalesce(profile.name_ru, concat_ws(' ', driver.given_name, driver.family_name)) AS name
      FROM atlas.drivers AS driver LEFT JOIN atlas.driver_profiles AS profile ON profile.driver_id=driver.id
      ORDER BY lower(coalesce(profile.name_ru, concat_ws(' ', driver.given_name, driver.family_name)))`),
    pool.query(`SELECT entry.id, entry.display_name AS name FROM atlas.constructor_entries AS entry
      JOIN atlas.races AS race ON race.season_year=entry.season_year WHERE race.id=$1 ORDER BY lower(entry.display_name)`, [raceId]),
  ]);
  if (!session.rows[0]) return null;
  const row = session.rows[0];
  return {
    event: { id: String(raceId), seasonYear: Number(row.season_year), round: Number(row.round), name: String(row.race_name) },
    session: mapAdminSession(row),
    results: results.rows.map((item) => ({
      driverId: String(item.driver_id), driverName: String(item.driver_name), positionOrder: Number(item.position_order),
      positionText: String(item.position_text), constructorEntryId: item.constructor_entry_id === null ? null : Number(item.constructor_entry_id),
      constructorName: item.constructor_name === null ? null : String(item.constructor_name),
      gridPosition: item.grid_position === null ? null : Number(item.grid_position), laps: item.laps === null ? null : Number(item.laps),
      status: item.status === null ? null : String(item.status), points: Number(item.points),
      elapsedMs: item.elapsed_ms === null ? null : Number(item.elapsed_ms), gapMs: item.gap_ms === null ? null : Number(item.gap_ms),
      gapText: item.gap_text === null ? null : String(item.gap_text), sourceUrl: item.source_url === null ? null : String(item.source_url),
      fastestLapRank: item.fastest_lap_rank === null ? null : Number(item.fastest_lap_rank),
      fastestLapNumber: item.fastest_lap_number === null ? null : Number(item.fastest_lap_number),
      fastestLapMs: item.fastest_lap_ms === null ? null : Number(item.fastest_lap_ms),
      q1Ms: item.details?.q1_ms == null ? null : Number(item.details.q1_ms),
      q2Ms: item.details?.q2_ms == null ? null : Number(item.details.q2_ms),
      q3Ms: item.details?.q3_ms == null ? null : Number(item.details.q3_ms),
      penaltyNote: typeof item.details?.penalty_note === 'string' ? item.details.penalty_note : null,
    })),
    drivers: drivers.rows.map((item) => ({ id: String(item.id), name: String(item.name) })),
    constructors: constructors.rows.map((item) => ({ id: Number(item.id), name: String(item.name) })),
  };
}

function validateSessionInput(rawInput, raceId, routeId = null) {
  if (!rawInput || typeof rawInput !== 'object') throw new Error('Некорректные данные сессии');
  const sessionType = optionalText(rawInput.sessionType); const name = optionalText(rawInput.name);
  if (!sessionTypeValues.has(sessionType)) throw new Error('Некорректный тип сессии');
  if (!name || name.length > 120) throw new Error('Укажите название сессии');
  const status = optionalText(rawInput.status); if (!raceStatusValues.has(status)) throw new Error('Некорректный статус сессии');
  const id = routeId ?? `${raceId}-${sessionType}`;
  if (!/^[A-Za-z0-9_-]+$/.test(id)) throw new Error('Некорректный ID сессии');
  const parseDateTime = (value) => { const text = optionalText(value); if (!text) return null; const date = new Date(text); if (Number.isNaN(date.getTime())) throw new Error('Некорректная дата сессии'); return date.toISOString(); };
  return { id, raceId, sessionType, name, startsAt: parseDateTime(rawInput.startsAt), endsAt: parseDateTime(rawInput.endsAt), status,
    sourceUrl: validateEditorialUrl(rawInput.sourceUrl), sourceVerified: rawInput.sourceVerified === true };
}

async function saveEventSession(rawInput, raceId, routeId = null) {
  const input = validateSessionInput(rawInput, raceId, routeId);
  if (['live', 'completed'].includes(input.status) && !input.sourceVerified) throw new Error('Для проведённой сессии подтвердите источник');
  const client = await pool.connect(); let committed = false;
  try {
    await client.query('BEGIN');
    const race = await client.query('SELECT id, season_year FROM atlas.races WHERE id=$1', [raceId]);
    if (!race.rows[0]) { await client.query('ROLLBACK'); return null; }
    const existing = await client.query('SELECT id FROM atlas.sessions WHERE id=$1 AND race_id=$2', [input.id, raceId]);
    if (routeId && !existing.rows[0]) { await client.query('ROLLBACK'); return null; }
    if (!routeId && existing.rows[0]) throw new Error('Такая сессия уже существует');
    const sourceId = `admin-${createHash('sha256').update(input.sourceUrl).digest('hex').slice(0, 16)}`;
    await client.query(`INSERT INTO atlas.data_sources (id,name,url,retrieved_at,notes) VALUES ($1,$2,$3,now(),$4)
      ON CONFLICT (id) DO UPDATE SET name=EXCLUDED.name,url=EXCLUDED.url,retrieved_at=EXCLUDED.retrieved_at,notes=EXCLUDED.notes`,
    [sourceId, new URL(input.sourceUrl).hostname, input.sourceUrl, input.sourceVerified ? 'Источник сессии проверен в админке' : 'Источник сессии добавлен в админке']);
    await client.query(`INSERT INTO atlas.sessions (id,race_id,session_type,name,starts_at,ends_at,status,source_id,updated_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,now()) ON CONFLICT (id) DO UPDATE SET session_type=EXCLUDED.session_type,
      name=EXCLUDED.name,starts_at=EXCLUDED.starts_at,ends_at=EXCLUDED.ends_at,status=EXCLUDED.status,source_id=EXCLUDED.source_id,updated_at=now()`,
    [input.id, raceId, input.sessionType, input.name, input.startsAt, input.endsAt, input.status, sourceId]);
    await client.query('COMMIT'); committed = true;
    let publicDataSynced = true; try { await syncRacePublicData([Number(race.rows[0].season_year)]); }
    catch (error) { publicDataSynced = false; console.error('Сессия сохранена, но публичные данные не синхронизированы', error); }
    return { id: input.id, publicDataSynced };
  } catch (error) { if (!committed) await client.query('ROLLBACK').catch(() => {}); throw error; }
  finally { client.release(); }
}

function optionalInteger(value, field, minimum = 0) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value); if (!Number.isInteger(number) || number < minimum) throw new Error(`Некорректное поле ${field}`); return number;
}

async function saveSessionResult(rawInput, raceId, sessionId) {
  if (!rawInput || typeof rawInput !== 'object') throw new Error('Некорректный результат');
  const driverId = optionalText(rawInput.driverId); if (!driverId || !/^[A-Za-z0-9_-]+$/.test(driverId)) throw new Error('Выберите пилота');
  const positionOrder = optionalInteger(rawInput.positionOrder, 'позиция', 1); const positionText = optionalText(rawInput.positionText);
  if (!positionText || positionText.length > 16) throw new Error('Укажите отображаемую позицию');
  const points = Number(rawInput.points ?? 0); if (!Number.isFinite(points) || points < 0 || points > 100) throw new Error('Некорректные очки');
  const sourceUrl = validateEditorialUrl(rawInput.sourceUrl); const sourceVerified = rawInput.sourceVerified === true;
  const client = await pool.connect(); let committed = false;
  try {
    await client.query('BEGIN');
    const session = await client.query(`SELECT session.id, race.season_year FROM atlas.sessions AS session
      JOIN atlas.races AS race ON race.id=session.race_id WHERE session.id=$1 AND session.race_id=$2`, [sessionId, raceId]);
    if (!session.rows[0]) { await client.query('ROLLBACK'); return null; }
    if (!sourceVerified) throw new Error('Подтвердите источник результата');
    const constructorEntryId = optionalInteger(rawInput.constructorEntryId, 'команда', 1);
    if (constructorEntryId !== null) {
      const entry = await client.query('SELECT id FROM atlas.constructor_entries WHERE id=$1 AND season_year=$2', [constructorEntryId, session.rows[0].season_year]);
      if (!entry.rows[0]) throw new Error('Команда не относится к сезону этапа');
    }
    const sourceId = `admin-${createHash('sha256').update(sourceUrl).digest('hex').slice(0, 16)}`;
    await client.query(`INSERT INTO atlas.data_sources (id,name,url,retrieved_at,notes) VALUES ($1,$2,$3,now(),'Источник результата проверен в админке')
      ON CONFLICT (id) DO UPDATE SET name=EXCLUDED.name,url=EXCLUDED.url,retrieved_at=EXCLUDED.retrieved_at,notes=EXCLUDED.notes`,
    [sourceId, new URL(sourceUrl).hostname, sourceUrl]);
    const originalDriverId = optionalText(rawInput.originalDriverId);
    if (originalDriverId && originalDriverId !== driverId) await client.query('DELETE FROM atlas.session_results WHERE session_id=$1 AND driver_id=$2', [sessionId, originalDriverId]);
    const penaltyNote = optionalText(rawInput.penaltyNote);
    if (penaltyNote && penaltyNote.length > 500) throw new Error('Примечание о штрафе слишком длинное');
    const details = { q1_ms: optionalInteger(rawInput.q1Ms, 'Q1'), q2_ms: optionalInteger(rawInput.q2Ms, 'Q2'),
      q3_ms: optionalInteger(rawInput.q3Ms, 'Q3'), penalty_note: penaltyNote };
    await client.query(`INSERT INTO atlas.session_results
      (session_id,position_order,position_text,driver_id,constructor_entry_id,grid_position,laps,status,points,elapsed_ms,gap_ms,gap_text,
       fastest_lap_rank,fastest_lap_number,fastest_lap_ms,details,source_id,updated_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,jsonb_strip_nulls($16::jsonb),$17,now()) ON CONFLICT (session_id,driver_id) DO UPDATE SET
      position_order=EXCLUDED.position_order,position_text=EXCLUDED.position_text,constructor_entry_id=EXCLUDED.constructor_entry_id,
      grid_position=EXCLUDED.grid_position,laps=EXCLUDED.laps,status=EXCLUDED.status,points=EXCLUDED.points,
      elapsed_ms=EXCLUDED.elapsed_ms,gap_ms=EXCLUDED.gap_ms,gap_text=EXCLUDED.gap_text,
      fastest_lap_rank=EXCLUDED.fastest_lap_rank,fastest_lap_number=EXCLUDED.fastest_lap_number,
      fastest_lap_ms=EXCLUDED.fastest_lap_ms,
      details=(session_results.details - ARRAY['q1_ms','q2_ms','q3_ms','penalty_note']) || EXCLUDED.details,
      source_id=EXCLUDED.source_id,updated_at=now()`,
    [sessionId, positionOrder, positionText, driverId, constructorEntryId, optionalInteger(rawInput.gridPosition, 'стартовая позиция'),
      optionalInteger(rawInput.laps, 'круги'), optionalText(rawInput.status), points, optionalInteger(rawInput.elapsedMs, 'время'),
      optionalInteger(rawInput.gapMs, 'отставание'), optionalText(rawInput.gapText), optionalInteger(rawInput.fastestLapRank, 'место быстрого круга', 1),
      optionalInteger(rawInput.fastestLapNumber, 'номер быстрого круга', 1), optionalInteger(rawInput.fastestLapMs, 'быстрый круг'),
      JSON.stringify(details), sourceId]);
    await client.query('COMMIT'); committed = true;
    let publicDataSynced = true; try { await syncRacePublicData([Number(session.rows[0].season_year)]); }
    catch (error) { publicDataSynced = false; console.error('Результат сохранён, но публичные данные не синхронизированы', error); }
    return { driverId, publicDataSynced };
  } catch (error) { if (!committed) await client.query('ROLLBACK').catch(() => {}); throw error; }
  finally { client.release(); }
}

async function saveSessionResults(rawInput, raceId, sessionId) {
  const rows = Array.isArray(rawInput?.rows) ? rawInput.rows : null;
  if (!rows || rows.length < 1 || rows.length > 40) throw new Error('Пакет должен содержать от 1 до 40 результатов');
  const client = await pool.connect(); let committed = false;
  try {
    await client.query('BEGIN');
    const session = await client.query(`SELECT session.id, race.season_year FROM atlas.sessions AS session
      JOIN atlas.races AS race ON race.id=session.race_id WHERE session.id=$1 AND session.race_id=$2`, [sessionId, raceId]);
    if (!session.rows[0]) { await client.query('ROLLBACK'); return null; }
    const seasonYear = Number(session.rows[0].season_year); const driverIds = new Set();
    for (const rawRow of rows) {
      const driverId = optionalText(rawRow?.driverId);
      if (!driverId || !/^[A-Za-z0-9_-]+$/.test(driverId)) throw new Error('В каждой строке должен быть выбран пилот');
      if (driverIds.has(driverId)) throw new Error(`Пилот ${driverId} повторяется в пакете`); driverIds.add(driverId);
      const positionOrder = optionalInteger(rawRow.positionOrder, 'позиция', 1); const positionText = optionalText(rawRow.positionText);
      if (!positionText || positionText.length > 16) throw new Error(`Укажите отображаемую позицию для ${driverId}`);
      const points = Number(rawRow.points ?? 0); if (!Number.isFinite(points) || points < 0 || points > 100) throw new Error(`Некорректные очки для ${driverId}`);
      if (rawRow.sourceVerified !== true) throw new Error(`Подтвердите источник для ${driverId}`);
      const sourceUrl = validateEditorialUrl(rawRow.sourceUrl);
      const constructorEntryId = optionalInteger(rawRow.constructorEntryId, 'команда', 1);
      if (constructorEntryId !== null) {
        const entry = await client.query('SELECT id FROM atlas.constructor_entries WHERE id=$1 AND season_year=$2', [constructorEntryId, seasonYear]);
        if (!entry.rows[0]) throw new Error(`Команда пилота ${driverId} не относится к сезону`);
      }
      const penaltyNote = optionalText(rawRow.penaltyNote); if (penaltyNote && penaltyNote.length > 500) throw new Error(`Примечание для ${driverId} слишком длинное`);
      const details = { q1_ms: optionalInteger(rawRow.q1Ms, 'Q1'), q2_ms: optionalInteger(rawRow.q2Ms, 'Q2'),
        q3_ms: optionalInteger(rawRow.q3Ms, 'Q3'), penalty_note: penaltyNote };
      const sourceId = `admin-${createHash('sha256').update(sourceUrl).digest('hex').slice(0, 16)}`;
      await client.query(`INSERT INTO atlas.data_sources (id,name,url,retrieved_at,notes) VALUES ($1,$2,$3,now(),'Источник результатов проверен в пакетном редакторе')
        ON CONFLICT (id) DO UPDATE SET name=EXCLUDED.name,url=EXCLUDED.url,retrieved_at=EXCLUDED.retrieved_at,notes=EXCLUDED.notes`,
      [sourceId, new URL(sourceUrl).hostname, sourceUrl]);
      const originalDriverId = optionalText(rawRow.originalDriverId);
      if (originalDriverId && originalDriverId !== driverId) await client.query('DELETE FROM atlas.session_results WHERE session_id=$1 AND driver_id=$2', [sessionId, originalDriverId]);
      await client.query(`INSERT INTO atlas.session_results
        (session_id,position_order,position_text,driver_id,constructor_entry_id,grid_position,laps,status,points,elapsed_ms,gap_ms,gap_text,
         fastest_lap_rank,fastest_lap_number,fastest_lap_ms,details,source_id,updated_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,jsonb_strip_nulls($16::jsonb),$17,now())
        ON CONFLICT (session_id,driver_id) DO UPDATE SET position_order=EXCLUDED.position_order,position_text=EXCLUDED.position_text,
        constructor_entry_id=EXCLUDED.constructor_entry_id,grid_position=EXCLUDED.grid_position,laps=EXCLUDED.laps,status=EXCLUDED.status,
        points=EXCLUDED.points,elapsed_ms=EXCLUDED.elapsed_ms,gap_ms=EXCLUDED.gap_ms,gap_text=EXCLUDED.gap_text,
        fastest_lap_rank=EXCLUDED.fastest_lap_rank,fastest_lap_number=EXCLUDED.fastest_lap_number,fastest_lap_ms=EXCLUDED.fastest_lap_ms,
        details=(session_results.details - ARRAY['q1_ms','q2_ms','q3_ms','penalty_note']) || EXCLUDED.details,
        source_id=EXCLUDED.source_id,updated_at=now()`,
      [sessionId, positionOrder, positionText, driverId, constructorEntryId, optionalInteger(rawRow.gridPosition, 'стартовая позиция'),
        optionalInteger(rawRow.laps, 'круги'), optionalText(rawRow.status), points, optionalInteger(rawRow.elapsedMs, 'время'),
        optionalInteger(rawRow.gapMs, 'отставание'), optionalText(rawRow.gapText), optionalInteger(rawRow.fastestLapRank, 'место быстрого круга', 1),
        optionalInteger(rawRow.fastestLapNumber, 'номер быстрого круга', 1), optionalInteger(rawRow.fastestLapMs, 'быстрый круг'), JSON.stringify(details), sourceId]);
    }
    await client.query('COMMIT'); committed = true;
    let publicDataSynced = true; try { await syncRacePublicData([seasonYear]); }
    catch (error) { publicDataSynced = false; console.error('Пакет результатов сохранён, но публичные данные не синхронизированы', error); }
    return { saved: rows.length, publicDataSynced };
  } catch (error) { if (!committed) await client.query('ROLLBACK').catch(() => {}); throw error; }
  finally { client.release(); }
}

async function deleteSessionResult(raceId, sessionId, driverId) {
  if (!/^[A-Za-z0-9_-]+$/.test(driverId)) return null;
  const client = await pool.connect(); let committed = false;
  try {
    await client.query('BEGIN');
    const context = await client.query(`SELECT race.season_year FROM atlas.sessions AS session
      JOIN atlas.races AS race ON race.id=session.race_id WHERE race.id=$1 AND session.id=$2`, [raceId, sessionId]);
    if (!context.rows[0]) { await client.query('ROLLBACK'); return null; }
    const result = await client.query(`DELETE FROM atlas.session_results
      WHERE session_id=$1 AND driver_id=$2 RETURNING driver_id`, [sessionId, driverId]);
    if (!result.rows[0]) { await client.query('ROLLBACK'); return null; }
    await client.query('COMMIT'); committed = true;
    let publicDataSynced = true; try { await syncRacePublicData([Number(context.rows[0].season_year)]); }
    catch (error) { publicDataSynced = false; console.error('Результат удалён, но публичные данные не синхронизированы', error); }
    return { deleted: true, publicDataSynced };
  } catch (error) { if (!committed) await client.query('ROLLBACK').catch(() => {}); throw error; }
  finally { client.release(); }
}

const circuitTypeValues = new Set(['permanent', 'street', 'hybrid', 'temporary']);
const circuitProfileStatuses = new Set(['draft', 'review', 'published']);
const circuitGapValues = new Set(['profile', 'geometry', 'assignments', 'stats', 'history', 'media', 'annotations', 'ready']);

function mapCircuitSummary(row) {
  return {
    id: String(row.id), officialName: String(row.name), shortName: row.short_name,
    nameRu: row.name_ru, cityRu: row.city_ru, countryRu: row.country_ru,
    countryCode: String(row.country_code).trim().toLowerCase(), circuitType: String(row.circuit_type),
    profileStatus: row.editorial_status ?? null, slug: row.slug ?? null,
    firstSeason: row.first_season === null ? null : Number(row.first_season),
    lastSeason: row.last_season === null ? null : Number(row.last_season), races: Number(row.races),
    layoutCount: Number(row.layout_count), reviewedLayouts: Number(row.reviewed_layouts),
    verifiedLayouts: Number(row.verified_layouts), unresolvedLayouts: Number(row.unresolved_layouts),
    unassignedRaces: Number(row.unassigned_races), statsCount: Number(row.stats_count),
    historyCount: Number(row.history_count), mediaCount: Number(row.media_count),
    annotationCount: Number(row.annotation_count), coreReady: Boolean(row.core_ready),
    completenessPercent: Number(row.completeness_percent), missingAreas: row.missing_areas ?? [],
  };
}

async function getCircuits(url) {
  const limit = boundedPositiveInteger(url.searchParams.get('limit'), 30, 100);
  const page = boundedPositiveInteger(url.searchParams.get('page'), 1);
  const query = String(url.searchParams.get('q') ?? '').trim().slice(0, 120);
  const country = String(url.searchParams.get('country') ?? '').trim().toLowerCase();
  const type = circuitTypeValues.has(url.searchParams.get('type')) ? url.searchParams.get('type') : '';
  const statusValue = url.searchParams.get('status');
  const status = [...circuitProfileStatuses, 'missing'].includes(statusValue) ? statusValue : '';
  const layout = ['ready', 'review', 'missing'].includes(url.searchParams.get('layout')) ? url.searchParams.get('layout') : '';
  const gap = circuitGapValues.has(url.searchParams.get('gap')) ? url.searchParams.get('gap') : '';
  const values = [query, country, type, status, layout, gap, limit, (page - 1) * limit];
  const directory = `WITH race_summary AS (
      SELECT circuit_id, min(season_year)::int AS first_season, max(season_year)::int AS last_season,
        count(*)::int AS races, count(*) FILTER (WHERE layout_id IS NULL)::int AS unassigned_races
      FROM atlas.races GROUP BY circuit_id
    ), layout_summary AS (
      SELECT circuit_id, count(*)::int AS layout_count,
        count(*) FILTER (WHERE review_status IN ('reviewed','published'))::int AS reviewed_layouts,
        count(*) FILTER (WHERE review_status IN ('reviewed','published') AND centerline IS NOT NULL
          AND source_id IS NOT NULL AND provenance_type <> 'unknown')::int AS verified_layouts,
        count(*) FILTER (WHERE review_status IN ('candidate','rejected') OR centerline IS NULL
          OR source_id IS NULL OR provenance_type = 'unknown')::int AS unresolved_layouts
      FROM atlas.track_layouts GROUP BY circuit_id
    ), content_summary AS (
      SELECT circuit.id AS circuit_id,
        (SELECT count(*)::int FROM atlas.circuit_page_stats AS item WHERE item.circuit_id=circuit.id) AS stats_count,
        (SELECT count(*)::int FROM atlas.circuit_history_entries AS item WHERE item.circuit_id=circuit.id) AS history_count,
        ((SELECT count(*) FROM atlas.circuit_media_gallery AS item WHERE item.circuit_id=circuit.id)
          + (SELECT count(*) FROM atlas.media_assets AS item WHERE item.entity_type='circuit'
            AND item.entity_id=circuit.id AND item.media_type='image' AND item.usage_role='catalog_card'))::int AS media_count,
        (SELECT count(*)::int FROM atlas.track_layout_annotations AS item
          JOIN atlas.track_layouts AS item_layout ON item_layout.id=item.layout_id
          WHERE item_layout.circuit_id=circuit.id) AS annotation_count,
        (SELECT count(DISTINCT item.field_name)::int FROM atlas.circuit_page_profile_field_sources AS item
          WHERE item.circuit_id=circuit.id AND item.editorial_status='verified'
            AND item.verified_at IS NOT NULL AND item.field_name = ANY(ARRAY[
              'slug','geometry_id','name_ru','city_ru','country_ru','summary_ru','circuit_type_ru'
            ])) AS verified_profile_fields
      FROM atlas.circuits AS circuit
    ), base_directory AS (
      SELECT circuit.id, circuit.name, circuit.short_name, circuit.country_code, circuit.circuit_type,
        profile.name_ru, profile.city_ru, profile.country_ru, profile.slug, profile.editorial_status,
        race.first_season, race.last_season, coalesce(race.races,0)::int AS races,
        coalesce(race.unassigned_races,0)::int AS unassigned_races,
        coalesce(layout.layout_count,0)::int AS layout_count,
        coalesce(layout.reviewed_layouts,0)::int AS reviewed_layouts,
        coalesce(layout.verified_layouts,0)::int AS verified_layouts,
        coalesce(layout.unresolved_layouts,0)::int AS unresolved_layouts,
        content.stats_count, content.history_count, content.media_count, content.annotation_count,
        (profile.circuit_id IS NOT NULL AND profile.slug IS NOT NULL AND profile.name_ru IS NOT NULL
          AND profile.city_ru IS NOT NULL AND profile.country_ru IS NOT NULL AND profile.summary_ru IS NOT NULL
          AND profile.circuit_type_ru IS NOT NULL AND profile.source_id IS NOT NULL
          AND content.verified_profile_fields = 7) AS core_ready
      FROM atlas.circuits AS circuit
      LEFT JOIN atlas.circuit_page_profiles AS profile ON profile.circuit_id=circuit.id
      LEFT JOIN race_summary AS race ON race.circuit_id=circuit.id
      LEFT JOIN layout_summary AS layout ON layout.circuit_id=circuit.id
      JOIN content_summary AS content ON content.circuit_id=circuit.id
    ), directory AS (
      SELECT base_directory.*,
        round(100.0 * ((core_ready::int) + (verified_layouts > 0)::int + (unassigned_races = 0)::int
          + (stats_count > 0)::int + (history_count > 0)::int + (media_count > 0)::int
          + (annotation_count > 0)::int) / 7)::int AS completeness_percent,
        array_remove(ARRAY[
          CASE WHEN NOT core_ready THEN 'profile' END,
          CASE WHEN verified_layouts = 0 THEN 'geometry' END,
          CASE WHEN unassigned_races > 0 THEN 'assignments' END,
          CASE WHEN stats_count = 0 THEN 'stats' END,
          CASE WHEN history_count = 0 THEN 'history' END,
          CASE WHEN media_count = 0 THEN 'media' END,
          CASE WHEN annotation_count = 0 THEN 'annotations' END
        ], NULL) AS missing_areas
      FROM base_directory
    )`;
  const filter = ` WHERE
    ($1 = '' OR concat_ws(' ', id, name, short_name, name_ru, city_ru, country_ru) ILIKE '%' || $1 || '%')
    AND ($2 = '' OR lower(country_code) = $2) AND ($3 = '' OR circuit_type = $3)
    AND ($4 = '' OR ($4 = 'missing' AND editorial_status IS NULL) OR editorial_status = $4)
    AND ($5 = '' OR ($5 = 'ready' AND verified_layouts > 0)
      OR ($5 = 'review' AND unresolved_layouts > 0) OR ($5 = 'missing' AND layout_count = 0))
    AND ($6 = '' OR ($6 = 'profile' AND NOT core_ready) OR ($6 = 'geometry' AND verified_layouts = 0)
      OR ($6 = 'assignments' AND unassigned_races > 0) OR ($6 = 'stats' AND stats_count = 0)
      OR ($6 = 'history' AND history_count = 0) OR ($6 = 'media' AND media_count = 0)
      OR ($6 = 'annotations' AND annotation_count = 0) OR ($6 = 'ready' AND completeness_percent = 100))`;
  const [rows, total, options, summary] = await Promise.all([
    pool.query(`${directory} SELECT * FROM directory${filter} ORDER BY completeness_percent, coalesce(name_ru, short_name, name), id LIMIT $7 OFFSET $8`, values),
    pool.query(`${directory} SELECT count(*)::int AS count FROM directory${filter}`, values.slice(0, 6)),
    pool.query(`SELECT array_agg(DISTINCT lower(country_code) ORDER BY lower(country_code)) AS countries FROM atlas.circuits`),
    pool.query(`${directory} SELECT count(*)::int AS circuits,
      count(*) FILTER (WHERE editorial_status='published')::int AS published_profiles,
      count(*) FILTER (WHERE core_ready)::int AS core_ready,
      count(*) FILTER (WHERE verified_layouts > 0)::int AS verified_geometry,
      count(*) FILTER (WHERE unassigned_races = 0)::int AS assigned_calendars,
      count(*) FILTER (WHERE stats_count > 0)::int AS with_stats,
      count(*) FILTER (WHERE history_count > 0)::int AS with_history,
      count(*) FILTER (WHERE media_count > 0)::int AS with_media,
      count(*) FILTER (WHERE annotation_count > 0)::int AS with_annotations FROM directory`),
  ]);
  const summaryRow = summary.rows[0];
  return { rows: rows.rows.map(mapCircuitSummary), filteredCount: Number(total.rows[0].count), page, limit,
    countries: options.rows[0].countries ?? [], summary: {
      circuits: Number(summaryRow.circuits), publishedProfiles: Number(summaryRow.published_profiles),
      coreReady: Number(summaryRow.core_ready), verifiedGeometry: Number(summaryRow.verified_geometry),
      assignedCalendars: Number(summaryRow.assigned_calendars), withStats: Number(summaryRow.with_stats),
      withHistory: Number(summaryRow.with_history), withMedia: Number(summaryRow.with_media),
      withAnnotations: Number(summaryRow.with_annotations),
    } };
}

async function getCircuit(id, includeGeometry = false) {
  const [circuitResult, layoutsResult, cardMediaResult] = await Promise.all([
    pool.query(`SELECT circuit.id, circuit.name, circuit.short_name, circuit.locality, circuit.country_code,
        circuit.circuit_type, ST_X(circuit.location::geometry) AS longitude,
        ST_Y(circuit.location::geometry) AS latitude, circuit.opened_year, circuit.website_url,
        circuit.source_id AS circuit_source_id, circuit.updated_at,
        profile.slug, profile.geometry_id, profile.name_ru, profile.city_ru, profile.country_ru,
        profile.summary_ru, profile.circuit_type_ru, profile.editorial_status,
        profile.source_id AS profile_source_id, source.url AS profile_source_url
      FROM atlas.circuits AS circuit
      LEFT JOIN atlas.circuit_page_profiles AS profile ON profile.circuit_id = circuit.id
      LEFT JOIN atlas.data_sources AS source ON source.id = profile.source_id
      WHERE circuit.id = $1`, [id]),
    pool.query(`SELECT layout.id, layout.name, layout.valid_from_year, layout.valid_to_year,
        layout.length_m, layout.turns, layout.direction, layout.elevation_min_m, layout.elevation_max_m,
        layout.provenance_type, layout.metadata, layout.centerline IS NOT NULL AS has_geometry,
        CASE WHEN $2 THEN ST_AsGeoJSON(layout.centerline) ELSE NULL END AS centerline_geojson,
        layout.review_status, layout.verified_at, source.url AS source_url,
        count(DISTINCT race.id)::int AS race_count
      FROM atlas.track_layouts AS layout
      LEFT JOIN atlas.races AS race ON race.layout_id = layout.id AND race.circuit_id = layout.circuit_id
      LEFT JOIN atlas.data_sources AS source ON source.id = layout.source_id
      WHERE layout.circuit_id = $1
      GROUP BY layout.id, source.url ORDER BY layout.valid_from_year NULLS LAST, layout.id`, [id, includeGeometry]),
    pool.query(`SELECT asset.id, coalesce(card.url, asset.url) AS url, asset.alt_text_ru,
        asset.author, asset.licence, asset.source_url, asset.rights_status, asset.review_status
      FROM atlas.media_assets AS asset
      LEFT JOIN atlas.media_asset_derivatives AS card
        ON card.media_asset_id=asset.id AND card.variant='card'
      WHERE asset.entity_type='circuit' AND asset.entity_id=$1 AND asset.media_type='image'
        AND asset.usage_role='catalog_card'
      ORDER BY asset.is_primary DESC, asset.verified_at DESC NULLS LAST, asset.id LIMIT 1`, [id]),
  ]);
  const row = circuitResult.rows[0];
  if (!row) return null;
  return {
    id: String(row.id), officialName: String(row.name), shortName: row.short_name,
    locality: row.locality, countryCode: String(row.country_code).trim().toLowerCase(),
    circuitType: String(row.circuit_type), longitude: Number(row.longitude), latitude: Number(row.latitude),
    openedYear: row.opened_year === null ? null : Number(row.opened_year), websiteUrl: row.website_url,
    circuitSourceId: row.circuit_source_id, updatedAt: new Date(row.updated_at).toISOString(),
    profile: row.slug === null ? null : { slug: row.slug, geometryId: row.geometry_id,
      nameRu: row.name_ru, cityRu: row.city_ru, countryRu: row.country_ru,
      summaryRu: row.summary_ru, circuitTypeRu: row.circuit_type_ru,
      editorialStatus: row.editorial_status, sourceId: row.profile_source_id, sourceUrl: row.profile_source_url },
    cardImage: cardMediaResult.rows[0] ? {
      id: String(cardMediaResult.rows[0].id), url: String(cardMediaResult.rows[0].url),
      altTextRu: String(cardMediaResult.rows[0].alt_text_ru), author: String(cardMediaResult.rows[0].author),
      licence: String(cardMediaResult.rows[0].licence), sourceUrl: String(cardMediaResult.rows[0].source_url),
      rightsStatus: String(cardMediaResult.rows[0].rights_status), reviewStatus: String(cardMediaResult.rows[0].review_status),
    } : null,
    layouts: layoutsResult.rows.map((layout) => ({ id: String(layout.id), name: String(layout.name),
      validFromYear: layout.valid_from_year === null ? null : Number(layout.valid_from_year),
      validToYear: layout.valid_to_year === null ? null : Number(layout.valid_to_year),
      lengthM: layout.length_m === null ? null : Number(layout.length_m), turns: layout.turns === null ? null : Number(layout.turns),
      direction: layout.direction,
      elevationMinM: layout.elevation_min_m === null ? null : Number(layout.elevation_min_m),
      elevationMaxM: layout.elevation_max_m === null ? null : Number(layout.elevation_max_m),
      provenanceType: layout.provenance_type, reviewStatus: layout.review_status,
      hasGeometry: Boolean(layout.has_geometry),
      centerlineGeoJson: layout.centerline_geojson ? JSON.parse(layout.centerline_geojson) : null,
      verifiedAt: layout.verified_at === null ? null : new Date(layout.verified_at).toISOString(),
      sourceUrl: layout.source_url, raceCount: Number(layout.race_count) })),
  };
}

const layoutProvenanceValues = new Set(['unknown', 'official', 'open_data', 'user_digitized']);
const layoutReviewValues = new Set(['candidate', 'reviewed', 'published', 'rejected']);

function normalizeTrackGeometryInput(value) {
  let geometry = value;
  let properties = {};
  if (value?.type === 'FeatureCollection') {
    if (!Array.isArray(value.features) || value.features.length !== 1) throw new Error('GeoJSON должен содержать ровно одну линию конфигурации');
    geometry = value.features[0]?.geometry;
    properties = value.features[0]?.properties ?? {};
  } else if (value?.type === 'Feature') {
    geometry = value.geometry;
    properties = value.properties ?? {};
  }
  if (properties?.placeholder === true || properties?.status === 'placeholder') throw new Error('Черновой placeholder нельзя импортировать как контур');
  if (geometry?.type !== 'LineString' || !Array.isArray(geometry.coordinates)) throw new Error('Ожидается GeoJSON LineString');
  if (geometry.coordinates.length < 3) throw new Error('Линия должна содержать минимум три координаты');
  if (geometry.coordinates.length > 50_000) throw new Error('Линия содержит больше 50 000 координат');
  const coordinates = [];
  for (const [index, coordinate] of geometry.coordinates.entries()) {
    if (!Array.isArray(coordinate) || coordinate.length < 2) throw new Error(`Координата ${index + 1} не является парой [долгота, широта]`);
    const longitude = Number(coordinate[0]); const latitude = Number(coordinate[1]);
    const elevation = coordinate.length > 2 ? Number(coordinate[2]) : 0;
    if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180
      || !Number.isFinite(latitude) || latitude < -90 || latitude > 90
      || !Number.isFinite(elevation) || elevation < -1000 || elevation > 10000) {
      throw new Error(`Координата ${index + 1} выходит за допустимые границы`);
    }
    const previous = coordinates.at(-1);
    if (!previous || previous[0] !== longitude || previous[1] !== latitude || previous[2] !== elevation) coordinates.push([longitude, latitude, elevation]);
  }
  if (coordinates.length < 3) throw new Error('После удаления повторов в линии осталось меньше трёх координат');
  const first = coordinates[0]; const last = coordinates.at(-1);
  const wasClosed = first[0] === last[0] && first[1] === last[1];
  if (!wasClosed) coordinates.push([...first]);
  const signedArea = coordinates.slice(1).reduce((area, [longitude, latitude], index) => {
    const [previousLongitude, previousLatitude] = coordinates[index];
    return area + (longitude - previousLongitude) * (latitude + previousLatitude);
  }, 0);
  return { type: 'LineString', coordinates, wasClosed, direction: signedArea > 0 ? 'clockwise' : 'counterclockwise' };
}

async function inspectTrackGeometry(rawGeometry, circuitId, layoutId, client = pool) {
  if (!/^[A-Za-z0-9_-]+$/.test(circuitId) || !/^[A-Za-z0-9_-]+$/.test(layoutId)) throw new Error('Некорректная конфигурация');
  const normalized = normalizeTrackGeometryInput(rawGeometry);
  const geometryJson = JSON.stringify({ type: normalized.type, coordinates: normalized.coordinates });
  const result = await client.query(`WITH selected AS (
      SELECT layout.id, layout.name, layout.length_m, layout.provenance_type, layout.review_status,
        source.url AS source_url, circuit.location,
        ST_Force3D(ST_SetSRID(ST_GeomFromGeoJSON($1), 4326)) AS line
      FROM atlas.track_layouts AS layout
      JOIN atlas.circuits AS circuit ON circuit.id = layout.circuit_id
      LEFT JOIN atlas.data_sources AS source ON source.id = layout.source_id
      WHERE layout.id = $2 AND layout.circuit_id = $3
    ), points AS (
      SELECT selected.*, (ST_DumpPoints(ST_Force2D(selected.line))).geom AS point FROM selected
    ) SELECT id, name, length_m, provenance_type, review_status, source_url,
      round(ST_Length(ST_Force2D(line)::geography))::integer AS measured_length_m,
      round(max(ST_Distance(point::geography, location)))::integer AS maximum_distance_m,
      ST_IsSimple(ST_Force2D(line)) AS is_simple, ST_IsValid(ST_Force2D(line)) AS is_valid,
      ST_NPoints(line)::integer AS point_count
    FROM points GROUP BY id, name, length_m, provenance_type, review_status, source_url, line`,
  [geometryJson, layoutId, circuitId]);
  const row = result.rows[0];
  if (!row) return null;
  const measuredLengthM = Number(row.measured_length_m);
  const maximumDistanceM = Number(row.maximum_distance_m);
  if (!row.is_valid) throw new Error('PostGIS отклонил некорректную линию');
  if (measuredLengthM < 100 || measuredLengthM > 100_000) throw new Error(`Измеренная длина ${measuredLengthM.toLocaleString('ru-RU')} м выходит за допустимый диапазон`);
  if (maximumDistanceM > 75_000) throw new Error('Часть контура находится дальше 75 км от точки трассы — проверьте координаты и порядок [долгота, широта]');
  const expectedLengthM = row.length_m === null ? null : Number(row.length_m);
  const lengthDeviationPercent = expectedLengthM
    ? Number(((measuredLengthM - expectedLengthM) / expectedLengthM * 100).toFixed(1)) : null;
  const warnings = [];
  if (!normalized.wasClosed) warnings.push('Контур не был замкнут — первая точка добавлена в конец автоматически');
  if (!row.is_simple) warnings.push('Линия пересекает сама себя — проверьте, соответствует ли это конфигурации');
  if (lengthDeviationPercent !== null && Math.abs(lengthDeviationPercent) > 10) warnings.push(`Измеренная длина отличается от указанной на ${Math.abs(lengthDeviationPercent).toLocaleString('ru-RU')}%`);
  return {
    geometry: { type: normalized.type, coordinates: normalized.coordinates }, direction: normalized.direction,
    pointCount: Number(row.point_count), measuredLengthM, maximumDistanceM,
    expectedLengthM, lengthDeviationPercent, warnings,
    layout: { id: String(row.id), name: String(row.name), provenanceType: String(row.provenance_type),
      reviewStatus: String(row.review_status), sourceUrl: row.source_url === null ? null : String(row.source_url) },
  };
}

async function saveTrackGeometry(rawInput, circuitId, layoutId) {
  if (!rawInput || rawInput.confirmed !== true) throw new Error('Подтвердите импорт проверенного контура');
  const preview = await inspectTrackGeometry(rawInput.geoJson, circuitId, layoutId);
  if (!preview) return null;
  if (preview.layout.provenanceType === 'unknown') throw new Error('Перед импортом укажите происхождение геометрии в карточке конфигурации');
  const feature = {
    type: 'Feature',
    properties: {
      id: layoutId, circuitId, name: preview.layout.name, length: preview.measuredLengthM,
      source: 'Импорт через локальную админ-панель', sourceUrl: preview.layout.sourceUrl,
      provenanceType: preview.layout.provenanceType, checkedAt: new Date().toISOString().slice(0, 10),
      status: 'candidate', qualityStatus: preview.warnings.length ? 'needs-review' : 'ready', placeholder: false,
    },
    geometry: preview.geometry,
  };
  return publishAdminTrackGeometry(feature, async () => {
    const client = await pool.connect(); let committed = false;
    try {
      await client.query('BEGIN');
      const locked = await client.query('SELECT id FROM atlas.track_layouts WHERE id=$1 AND circuit_id=$2 FOR UPDATE', [layoutId, circuitId]);
      if (!locked.rows[0]) throw new Error('Конфигурация исчезла во время импорта');
      await client.query(`UPDATE atlas.track_layouts SET
        centerline=ST_Force3D(ST_SetSRID(ST_GeomFromGeoJSON($3),4326)), direction=$4,
        review_status='candidate', verified_at=NULL,
        metadata=coalesce(metadata,'{}'::jsonb) || $5::jsonb, updated_at=now()
        WHERE id=$1 AND circuit_id=$2`, [layoutId, circuitId, JSON.stringify(preview.geometry), preview.direction, JSON.stringify({
          adminGeometryImport: { importedAt: new Date().toISOString(), measuredLengthM: preview.measuredLengthM,
            pointCount: preview.pointCount, maximumDistanceM: preview.maximumDistanceM,
            lengthDeviationPercent: preview.lengthDeviationPercent, warnings: preview.warnings },
        })]);
      await client.query('COMMIT'); committed = true;
      return { circuitId, layoutId, preview, publicDataSynced: true };
    } catch (error) {
      if (!committed) await client.query('ROLLBACK').catch(() => {});
      throw error;
    } finally { client.release(); }
  });
}

function validateTrackLayoutInput(value, circuitId, routeLayoutId = null) {
  if (!value || typeof value !== 'object' || !/^[A-Za-z0-9_-]+$/.test(circuitId)) throw new Error('Некорректная конфигурация');
  const required = (field) => { const result = optionalText(value[field]); if (!result) throw new Error(`Поле ${field} обязательно`); return result; };
  const optionalNumber = (field, minimum, maximum) => {
    const raw = optionalText(value[field]); if (raw === null) return null;
    const result = Number(raw); if (!Number.isFinite(result) || result < minimum || result > maximum) throw new Error(`Некорректное поле ${field}`); return result;
  };
  const optionalInteger = (field, minimum, maximum) => {
    const result = optionalNumber(field, minimum, maximum);
    if (result !== null && !Number.isInteger(result)) throw new Error(`Поле ${field} должно быть целым числом`);
    return result;
  };
  const id = routeLayoutId ?? required('id');
  if (!/^[A-Za-z0-9_-]+$/.test(id)) throw new Error('ID конфигурации может содержать только латинские буквы, цифры, дефис и подчёркивание');
  const validFromYear = optionalInteger('validFromYear', 1950, 2100);
  const validToYear = optionalInteger('validToYear', 1950, 2100);
  if (validFromYear !== null && validToYear !== null && validToYear < validFromYear) throw new Error('Конец периода не может быть раньше начала');
  const direction = optionalText(value.direction);
  if (direction && !['clockwise', 'counterclockwise'].includes(direction)) throw new Error('Некорректное направление движения');
  const provenanceType = required('provenanceType');
  if (!layoutProvenanceValues.has(provenanceType)) throw new Error('Некорректное происхождение геометрии');
  const reviewStatus = required('reviewStatus');
  if (!layoutReviewValues.has(reviewStatus)) throw new Error('Некорректный статус проверки');
  const sourceUrl = validateEditorialUrl(value.sourceUrl);
  const elevationMinM = optionalNumber('elevationMinM', -500, 6000);
  const elevationMaxM = optionalNumber('elevationMaxM', -500, 6000);
  if (elevationMinM !== null && elevationMaxM !== null && elevationMaxM < elevationMinM) throw new Error('Максимальная высота не может быть меньше минимальной');
  return {
    id, circuitId, name: required('name'), validFromYear, validToYear,
    lengthM: optionalInteger('lengthM', 1, 100000), turns: optionalInteger('turns', 1, 200), direction,
    elevationMinM, elevationMaxM, provenanceType, reviewStatus, sourceUrl,
    sourceName: optionalText(value.sourceName) ?? new URL(sourceUrl).hostname,
    sourceNotes: optionalText(value.sourceNotes), sourceVerified: value.sourceVerified === true,
  };
}

async function saveTrackLayout(rawInput, circuitId, routeLayoutId = null) {
  const input = validateTrackLayoutInput(rawInput, circuitId, routeLayoutId);
  const client = await pool.connect(); let committed = false;
  try {
    await client.query('BEGIN');
    const circuit = await client.query('SELECT id FROM atlas.circuits WHERE id = $1', [circuitId]);
    if (!circuit.rows[0]) { await client.query('ROLLBACK'); return null; }
    const existing = await client.query(`SELECT id, circuit_id, centerline IS NOT NULL AS has_geometry
      FROM atlas.track_layouts WHERE id = $1`, [input.id]);
    if (routeLayoutId && (!existing.rows[0] || existing.rows[0].circuit_id !== circuitId)) {
      await client.query('ROLLBACK'); return null;
    }
    if (!routeLayoutId && existing.rows[0]) throw new Error('Конфигурация с таким ID уже существует');
    const hasGeometry = Boolean(existing.rows[0]?.has_geometry);
    if (['reviewed', 'published'].includes(input.reviewStatus)) {
      if (!hasGeometry) throw new Error('Нельзя подтвердить конфигурацию без геометрии');
      if (input.provenanceType === 'unknown') throw new Error('Укажите происхождение геометрии');
      if (!input.sourceVerified) throw new Error('Подтвердите проверку источника');
    }
    const sourceId = `admin-${createHash('sha256').update(input.sourceUrl).digest('hex').slice(0, 16)}`;
    await client.query(`INSERT INTO atlas.data_sources (id, name, url, retrieved_at, notes)
      VALUES ($1,$2,$3,now(),$4) ON CONFLICT (id) DO UPDATE SET
      name=EXCLUDED.name, url=EXCLUDED.url, retrieved_at=EXCLUDED.retrieved_at, notes=EXCLUDED.notes`,
    [sourceId, input.sourceName, input.sourceUrl, input.sourceNotes]);
    if (routeLayoutId) {
      await client.query(`UPDATE atlas.track_layouts SET name=$3, valid_from_year=$4, valid_to_year=$5,
        length_m=$6, turns=$7, direction=$8, elevation_min_m=$9, elevation_max_m=$10,
        provenance_type=$11, review_status=$12,
        verified_at=CASE WHEN $12 IN ('reviewed','published') THEN now() ELSE NULL END,
        source_id=$13, updated_at=now() WHERE id=$1 AND circuit_id=$2`,
      [input.id, circuitId, input.name, input.validFromYear, input.validToYear, input.lengthM, input.turns,
        input.direction, input.elevationMinM, input.elevationMaxM, input.provenanceType, input.reviewStatus, sourceId]);
    } else {
      if (input.reviewStatus !== 'candidate') throw new Error('Новая конфигурация без геометрии создаётся только как кандидат');
      await client.query(`INSERT INTO atlas.track_layouts
        (id,circuit_id,name,valid_from_year,valid_to_year,length_m,turns,direction,elevation_min_m,elevation_max_m,
         source_id,provenance_type,review_status,verified_at,updated_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'candidate',NULL,now())`,
      [input.id, circuitId, input.name, input.validFromYear, input.validToYear, input.lengthM, input.turns,
        input.direction, input.elevationMinM, input.elevationMaxM, sourceId, input.provenanceType]);
    }
    await client.query('COMMIT'); committed = true;
    let publicDataSynced = true;
    try { await execFileAsync(process.execPath, [path.join(repositoryRoot, 'scripts', 'export-search-index.mjs')], { cwd: repositoryRoot, env: process.env }); }
    catch (error) { publicDataSynced = false; console.error('Конфигурация сохранена, но поисковый индекс не обновлён', error); }
    return { id: input.id, circuitId, publicDataSynced };
  } catch (error) {
    if (!committed) await client.query('ROLLBACK').catch(() => {}); throw error;
  } finally { client.release(); }
}

const trackAnnotationTypes = new Set(['sector','turn','straight','timing_line','drs_zone','drs_detection','straight_mode_zone','straight_mode_activation','straight_mode_low_grip_activation','overtake_detection','overtake_activation']);
const trackAnnotationPointTypes = new Set(['turn','timing_line','drs_detection','straight_mode_activation','straight_mode_low_grip_activation','overtake_detection','overtake_activation']);
const trackAnnotationStatuses = new Set(['candidate','reviewed','published','hidden']);

function normalizeTrackAnnotationGeometry(rawGeometry, annotationType) {
  let geometry = rawGeometry;
  if (typeof geometry === 'string') geometry = JSON.parse(geometry);
  if (geometry?.type === 'Feature') geometry = geometry.geometry;
  const expectedType = trackAnnotationPointTypes.has(annotationType) ? 'Point' : 'LineString';
  if (geometry?.type !== expectedType) throw new Error(`Для этого типа разметки требуется геометрия ${expectedType}`);
  const validCoordinate = coordinate => Array.isArray(coordinate) && coordinate.length >= 2
    && Number.isFinite(Number(coordinate[0])) && Number(coordinate[0]) >= -180 && Number(coordinate[0]) <= 180
    && Number.isFinite(Number(coordinate[1])) && Number(coordinate[1]) >= -90 && Number(coordinate[1]) <= 90;
  if (expectedType === 'Point') {
    if (!validCoordinate(geometry.coordinates)) throw new Error('Некорректная координата точки');
    return { type:'Point',coordinates:[Number(geometry.coordinates[0]),Number(geometry.coordinates[1])] };
  }
  if (!Array.isArray(geometry.coordinates) || geometry.coordinates.length < 2 || geometry.coordinates.length > 10_000
    || !geometry.coordinates.every(validCoordinate)) throw new Error('Линия разметки должна содержать от 2 до 10 000 координат');
  if (geometry.coordinates.every(coordinate => Math.abs(Number(coordinate[0])-Number(geometry.coordinates[0][0]))<1e-7
    && Math.abs(Number(coordinate[1])-Number(geometry.coordinates[0][1]))<1e-7)) throw new Error('Участок разметки должен иметь ненулевую длину');
  return { type:'LineString',coordinates:geometry.coordinates.map(coordinate => [Number(coordinate[0]),Number(coordinate[1])]) };
}

async function getTrackLayoutAnnotations(circuitId, layoutId) {
  const [layoutResult, annotationsResult] = await Promise.all([
    pool.query(`SELECT layout.id,layout.name,layout.valid_from_year,layout.valid_to_year,
      ST_AsGeoJSON(ST_Force2D(layout.centerline)) AS centerline_geojson,
      coalesce(profile.name_ru,circuit.short_name,circuit.name) AS circuit_name
      FROM atlas.track_layouts AS layout JOIN atlas.circuits AS circuit ON circuit.id=layout.circuit_id
      LEFT JOIN atlas.circuit_page_profiles AS profile ON profile.circuit_id=circuit.id
      WHERE layout.id=$1 AND layout.circuit_id=$2`,[layoutId,circuitId]),
    pool.query(`SELECT annotation.id,annotation.annotation_type,annotation.label_ru,annotation.label_original,
      annotation.sequence,annotation.description_ru,ST_AsGeoJSON(annotation.geometry::geometry) AS geometry_geojson,
      annotation.valid_from_year,annotation.valid_to_year,annotation.review_status,annotation.verified_at,
      annotation.updated_at::text AS revision,
      annotation.properties->'calloutPoint' AS callout_point,
      source.name AS source_name,source.url AS source_url,source.notes AS source_notes
      FROM atlas.track_layout_annotations AS annotation
      LEFT JOIN atlas.data_sources AS source ON source.id=annotation.source_id
      WHERE annotation.layout_id=$1
      ORDER BY annotation.annotation_type,annotation.sequence NULLS LAST,annotation.valid_from_year NULLS FIRST,annotation.id`,[layoutId]),
  ]);
  if (!layoutResult.rows.length) return null;
  const layout=layoutResult.rows[0];
  return { circuit:{id:circuitId,name:String(layout.circuit_name)},layout:{id:layoutId,name:String(layout.name),
    validFromYear:layout.valid_from_year===null?null:Number(layout.valid_from_year),validToYear:layout.valid_to_year===null?null:Number(layout.valid_to_year),
    centerlineGeoJson:layout.centerline_geojson?JSON.parse(layout.centerline_geojson):null},annotations:annotationsResult.rows.map(row=>({
      id:String(row.id),annotationType:String(row.annotation_type),labelRu:row.label_ru,labelOriginal:row.label_original,
      sequence:row.sequence===null?null:Number(row.sequence),descriptionRu:row.description_ru,geometryGeoJson:JSON.parse(row.geometry_geojson),
      calloutPoint:Array.isArray(row.callout_point)?row.callout_point:null,
      validFromYear:row.valid_from_year===null?null:Number(row.valid_from_year),validToYear:row.valid_to_year===null?null:Number(row.valid_to_year),
      reviewStatus:String(row.review_status),verifiedAt:row.verified_at===null?null:new Date(row.verified_at).toISOString(),revision:row.revision,sourceName:row.source_name,sourceUrl:row.source_url,sourceNotes:row.source_notes })) };
}

let trackAnnotationMutationTail=Promise.resolve();
function queueTrackAnnotationMutation(task) {
  const result=trackAnnotationMutationTail.then(task);
  trackAnnotationMutationTail=result.catch(()=>{});
  return result;
}

function saveTrackLayoutAnnotation(rawInput,circuitId,layoutId,annotationId) {
  return queueTrackAnnotationMutation(()=>saveTrackLayoutAnnotationQueued(rawInput,circuitId,layoutId,annotationId));
}

async function saveTrackLayoutAnnotationQueued(rawInput,circuitId,layoutId,annotationId) {
  if(!/^[A-Za-z0-9_-]+$/.test(circuitId)||!/^[A-Za-z0-9_-]+$/.test(layoutId)||!/^[A-Za-z0-9_-]+$/.test(annotationId))throw new Error('Некорректный ID разметки');
  const annotationType=String(rawInput?.annotationType??''),reviewStatus=String(rawInput?.reviewStatus??'candidate');
  if(!trackAnnotationTypes.has(annotationType)||!trackAnnotationStatuses.has(reviewStatus))throw new Error('Некорректный тип или статус разметки');
  const labelRu=optionalText(rawInput?.labelRu),labelOriginal=optionalText(rawInput?.labelOriginal);
  const sequenceRaw=optionalText(rawInput?.sequence),sequence=sequenceRaw===null?null:Number(sequenceRaw);
  if(!labelRu&&!labelOriginal&&sequence===null)throw new Error('Укажите номер или название');
  if(sequence!==null&&(!Number.isInteger(sequence)||sequence<1||sequence>999))throw new Error('Некорректный номер');
  const year=value=>{const raw=optionalText(value);if(raw===null)return null;const parsed=Number(raw);if(!Number.isInteger(parsed)||parsed<1900||parsed>2100)throw new Error('Некорректный год');return parsed;};
  const validFromYear=year(rawInput?.validFromYear),validToYear=year(rawInput?.validToYear);
  if(validFromYear!==null&&validToYear!==null&&validToYear<validFromYear)throw new Error('Конец периода раньше начала');
  if(['straight_mode_zone','straight_mode_activation','straight_mode_low_grip_activation','overtake_detection','overtake_activation'].includes(annotationType)&&(!validFromYear||validFromYear<2026))throw new Error('Для режимов 2026+ укажите год начала не раньше 2026');
  const geometry=normalizeTrackAnnotationGeometry(rawInput?.geometryGeoJson,annotationType);
  const calloutPoint=normalizeTrackCalloutPoint(optionalText(rawInput?.calloutPointJson),annotationType);
  const sourceUrl=validateEditorialUrl(rawInput?.sourceUrl),sourceName=optionalText(rawInput?.sourceName)??new URL(sourceUrl).hostname;
  if(['reviewed','published'].includes(reviewStatus)&&rawInput?.sourceVerified!==true)throw new Error('Подтвердите проверку источника');
  const sourceId=`track-markup-${createHash('sha256').update(sourceUrl).digest('hex').slice(0,16)}`;
  const client=await pool.connect();
  try{await client.query('BEGIN');
    const layout=await client.query('SELECT id,centerline FROM atlas.track_layouts WHERE id=$1 AND circuit_id=$2 FOR SHARE',[layoutId,circuitId]);
    if(!layout.rows.length){await client.query('ROLLBACK');return null;}if(!layout.rows[0].centerline)throw new Error('Сначала загрузите контур конфигурации');
    const proximity=await client.query(`WITH input AS (SELECT ST_SetSRID(ST_GeomFromGeoJSON($1),4326) AS geometry),points AS (
      SELECT (ST_DumpPoints(input.geometry)).geom AS point FROM input)
      SELECT round(max(ST_Distance(points.point::geography,ST_Force2D(layout.centerline)::geography)))::int AS maximum_distance_m
      FROM points CROSS JOIN atlas.track_layouts AS layout WHERE layout.id=$2`,[JSON.stringify(geometry),layoutId]);
    const maximumDistanceM=Number(proximity.rows[0]?.maximum_distance_m??Infinity);
    if(maximumDistanceM>2000)throw new Error(`Разметка удалена от контура до ${maximumDistanceM.toLocaleString('ru-RU')} м`);
    if(calloutPoint){
      const calloutDistance=await client.query(`SELECT ST_Distance(
        ST_SetSRID(ST_MakePoint($1,$2),4326)::geography,
        ST_SetSRID(ST_GeomFromGeoJSON($3),4326)::geography) AS distance_m`,[...calloutPoint,JSON.stringify(geometry)]);
      if(Number(calloutDistance.rows[0]?.distance_m??Infinity)>1000)throw new Error('Выносная подпись должна быть не дальше 1 км от элемента');
    }
    const existing=await client.query('SELECT layout_id,annotation_type,review_status,updated_at::text AS revision FROM atlas.track_layout_annotations WHERE id=$1 FOR UPDATE',[annotationId]);
    if(existing.rows.length&&existing.rows[0].layout_id!==layoutId)throw new Error('ID разметки принадлежит другой конфигурации');
    if(annotationId===`${layoutId}-start-finish`&&(annotationType!=='timing_line'||existing.rows.length&&existing.rows[0].annotation_type!=='timing_line'))throw new Error('ID старта/финиша занят другим типом разметки');
    if(existing.rows.length&&existing.rows[0].revision!==rawInput?.revision)throw new Error('Разметка уже изменена. Обновите страницу перед повторным сохранением');
    if(!existing.rows.length&&rawInput?.revision)throw new Error('Разметка уже удалена. Обновите страницу');
    await client.query(`INSERT INTO atlas.data_sources(id,name,url,retrieved_at,notes)VALUES($1,$2,$3,now(),$4)
      ON CONFLICT(id)DO UPDATE SET name=EXCLUDED.name,url=EXCLUDED.url,retrieved_at=now(),
        notes=CASE WHEN $5::boolean THEN EXCLUDED.notes ELSE data_sources.notes END`,
    [sourceId,sourceName,sourceUrl,optionalText(rawInput?.sourceNotes),Object.hasOwn(rawInput??{},'sourceNotes')]);
    await client.query(`INSERT INTO atlas.track_layout_annotations(id,layout_id,annotation_type,label_ru,label_original,sequence,description_ru,geometry,
      valid_from_year,valid_to_year,source_id,review_status,properties,verified_at,updated_at)
      VALUES($1,$2,$3,$4,$5,$6,$7,ST_SetSRID(ST_GeomFromGeoJSON($8),4326)::geography,$9,$10,$11,$12,$13::jsonb,
        CASE WHEN $12 IN('reviewed','published')THEN now() ELSE NULL END,now())
      ON CONFLICT(id)DO UPDATE SET annotation_type=EXCLUDED.annotation_type,label_ru=EXCLUDED.label_ru,label_original=EXCLUDED.label_original,
        sequence=EXCLUDED.sequence,description_ru=EXCLUDED.description_ru,geometry=EXCLUDED.geometry,valid_from_year=EXCLUDED.valid_from_year,
        valid_to_year=EXCLUDED.valid_to_year,source_id=EXCLUDED.source_id,review_status=EXCLUDED.review_status,properties=EXCLUDED.properties,
        verified_at=EXCLUDED.verified_at,updated_at=now()`,[annotationId,layoutId,annotationType,labelRu,labelOriginal,sequence,
      optionalText(rawInput?.descriptionRu),JSON.stringify(geometry),validFromYear,validToYear,sourceId,reviewStatus,
      JSON.stringify({maximumDistanceToTrackM:maximumDistanceM,editedVia:'admin-track-markup-v2',...(calloutPoint?{calloutPoint}:{})})]);
    await client.query('COMMIT');
    const affectsPublicPage=reviewStatus==='published'||existing.rows[0]?.review_status==='published';
    const publicDataSynced=affectsPublicPage&&['spa','bahrain'].includes(circuitId)
      ? await syncCircuitPublicData(circuitId):true;
    return{id:annotationId,circuitId,layoutId,publicDataSynced};
  }catch(error){await client.query('ROLLBACK').catch(()=>{});throw error;}finally{client.release();}
}

async function saveTrackSectorSegmentation(raw,circuitId,layoutId) {
  if(!/^[A-Za-z0-9_-]+$/.test(circuitId)||!/^[A-Za-z0-9_-]+$/.test(layoutId))throw new Error('Некорректная конфигурация');
  const boundaries=raw?.boundaries;
  const validPoint=point=>Array.isArray(point)&&point.length===2&&Number.isFinite(point[0])&&Number.isFinite(point[1])
    &&point[0]>=-180&&point[0]<=180&&point[1]>=-90&&point[1]<=90;
  if(!Array.isArray(boundaries)||boundaries.length!==3||!boundaries.every(validPoint))throw new Error('Укажите старт/финиш и две границы секторов на оси трассы');
  const year=value=>{const textValue=optionalText(value);if(textValue===null)return null;const parsed=Number(textValue);if(!Number.isInteger(parsed)||parsed<1900||parsed>2100)throw new Error('Некорректный год периода');return parsed;};
  const fromYear=year(raw?.validFromYear),toYear=year(raw?.validToYear);
  if(fromYear!==null&&toYear!==null&&toYear<fromYear)throw new Error('Конец периода раньше начала');
  const sourceUrl=validateEditorialUrl(raw?.sourceUrl),providedSourceName=optionalText(raw?.sourceName),sourceName=providedSourceName??new URL(sourceUrl).hostname;
  const sourceId=`track-markup-${createHash('sha256').update(sourceUrl).digest('hex').slice(0,16)}`;
  const client=await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))',[`track-sectors:${layoutId}`]);
    const layout=await client.query(`SELECT id
      FROM atlas.track_layouts WHERE id=$1 AND circuit_id=$2 AND centerline IS NOT NULL FOR SHARE`,[layoutId,circuitId]);
    if(!layout.rows.length){await client.query('ROLLBACK');return null;}
    const geometry=await client.query(`WITH line AS (SELECT ST_Force2D(centerline) AS original FROM atlas.track_layouts WHERE id=$1),
      anchors AS (SELECT original,ST_SetSRID(ST_MakePoint($2,$3),4326) AS start_point,
        ST_SetSRID(ST_MakePoint($4,$5),4326) AS a,ST_SetSRID(ST_MakePoint($6,$7),4326) AS b FROM line),
      start_location AS (SELECT original,start_point,a,b,ST_LineLocatePoint(original,start_point) AS start_fraction,
        ST_Distance(start_point::geography,ST_ClosestPoint(original,start_point)::geography) AS start_distance FROM anchors),
      rotated AS (SELECT CASE WHEN start_fraction<0.000001 OR start_fraction>0.999999 THEN original
        ELSE ST_MakeLine(ST_LineSubstring(original,start_fraction,1),ST_LineSubstring(original,0,start_fraction)) END AS g,
        start_distance,a,b FROM start_location),
      located AS (SELECT g,ST_IsClosed(g) AS closed,start_distance,ST_LineLocatePoint(g,a) AS f1,ST_LineLocatePoint(g,b) AS f2,
        ST_Distance(a::geography,ST_ClosestPoint(g,a)::geography) AS d1,
        ST_Distance(b::geography,ST_ClosestPoint(g,b)::geography) AS d2 FROM rotated)
      SELECT closed,start_distance,f1,f2,d1,d2,ST_AsGeoJSON(ST_LineSubstring(g,0,f1)) AS s1,
        ST_AsGeoJSON(ST_LineSubstring(g,f1,f2)) AS s2,ST_AsGeoJSON(ST_LineSubstring(g,f2,1)) AS s3 FROM located`,
    [layoutId,...boundaries[0],...boundaries[1],...boundaries[2]]);
    const row=geometry.rows[0];
    if(!row?.closed||Number(row.start_distance)>50||Number(row.d1)>50||Number(row.d2)>50)throw new Error('Старт и границы должны находиться рядом с замкнутой осью трассы');
    const f1=Number(row.f1),f2=Number(row.f2);
    if(!Number.isFinite(f1)||!Number.isFinite(f2)||f1<=0.001||f2>=0.999||f2-f1<=0.001)throw new Error('Границы должны делить круг на три ненулевых сектора');
    if(f1>=f2)throw new Error('Поставьте границы по направлению вектора трассы: сначала конец S1, затем конец S2');
    const sectors=[row.s1,row.s2,row.s3].map(value=>JSON.parse(value));
    if(sectors.some(value=>value.type!=='LineString'||value.coordinates.length<2))throw new Error('Не удалось построить три полных сектора');
    const overlapping=await client.query(`SELECT id FROM atlas.track_layout_annotations
      WHERE layout_id=$1 AND annotation_type='sector' AND review_status<>'hidden'
        AND coalesce(valid_from_year,1900)<=coalesce($3::int,2100)
        AND coalesce(valid_to_year,2100)>=coalesce($2::int,1900) LIMIT 1`,[layoutId,fromYear,toYear]);
    if(overlapping.rows.length)throw new Error('Для этого периода уже есть сектора; проверьте существующую разметку');
    await client.query(`INSERT INTO atlas.data_sources(id,name,url,retrieved_at,notes)VALUES($1,$2,$3,now(),$4)
      ON CONFLICT(id)DO UPDATE SET name=CASE WHEN $5::text IS NULL THEN data_sources.name ELSE EXCLUDED.name END,
        url=EXCLUDED.url,retrieved_at=now(),notes=CASE WHEN $4::text IS NULL THEN data_sources.notes ELSE EXCLUDED.notes END`,
    [sourceId,sourceName,sourceUrl,optionalText(raw?.sourceNotes),providedSourceName]);
    const periodKey=`${fromYear??'all'}-${toYear??'all'}-${randomUUID().slice(0,8)}`;
    for(const [index,sector] of sectors.entries()){
      const sequence=index+1,id=`${layoutId}-sector-${periodKey}-${sequence}`;
      await client.query(`INSERT INTO atlas.track_layout_annotations(id,layout_id,annotation_type,label_ru,sequence,geometry,
        valid_from_year,valid_to_year,source_id,review_status,properties)
        VALUES($1,$2,'sector',$3,$4,ST_SetSRID(ST_GeomFromGeoJSON($5),4326)::geography,$6,$7,$8,'candidate',$9::jsonb)`,
      [id,layoutId,`Сектор ${sequence}`,sequence,JSON.stringify(sector),fromYear,toYear,sourceId,
        JSON.stringify({digitizedVia:'admin-sector-tool-v1',boundaryFractions:[f1,f2]})]);
    }
    await client.query('COMMIT');
    return {circuitId,layoutId,created:3};
  }catch(error){await client.query('ROLLBACK').catch(()=>{});throw error;}finally{client.release();}
}

function deleteTrackLayoutAnnotation(circuitId,layoutId,annotationId,revision){
  return queueTrackAnnotationMutation(()=>deleteTrackLayoutAnnotationQueued(circuitId,layoutId,annotationId,revision));
}

async function deleteTrackLayoutAnnotationQueued(circuitId,layoutId,annotationId,revision){
  if(!revision)throw new Error('Обновите страницу перед удалением элемента');
  const result=await pool.query(`DELETE FROM atlas.track_layout_annotations AS annotation USING atlas.track_layouts AS layout
    WHERE annotation.id=$1 AND annotation.layout_id=$2 AND layout.id=annotation.layout_id AND layout.circuit_id=$3
      AND annotation.updated_at::text=$4
    RETURNING annotation.id,annotation.review_status`,
  [annotationId,layoutId,circuitId,revision]);
  if(!result.rows.length){
    const existing=await pool.query('SELECT 1 FROM atlas.track_layout_annotations WHERE id=$1 AND layout_id=$2',[annotationId,layoutId]);
    if(existing.rows.length)throw new Error('Разметка уже изменена. Обновите страницу перед удалением');
    return null;
  }
  const publicDataSynced=result.rows[0].review_status==='published'&&['spa','bahrain'].includes(circuitId)
    ? await syncCircuitPublicData(circuitId):true;
  return{id:annotationId,circuitId,layoutId,publicDataSynced};
}

function pruneTrackAnnotationImportPreviews() {
  const now = Date.now();
  for (const [token, preview] of trackAnnotationImportPreviews) {
    if (preview.expiresAt <= now) trackAnnotationImportPreviews.delete(token);
  }
  while (trackAnnotationImportPreviews.size >= 20) {
    trackAnnotationImportPreviews.delete(trackAnnotationImportPreviews.keys().next().value);
  }
}

async function createTrackAnnotationImportPreview(rawPackage) {
  const packageData = validateTrackAnnotationPackage(rawPackage);
  const layout = await pool.query(`SELECT layout.id, layout.name, circuit.id AS circuit_id,
      coalesce(profile.name_ru,circuit.short_name,circuit.name) AS circuit_name
    FROM atlas.track_layouts AS layout
    JOIN atlas.circuits AS circuit ON circuit.id=layout.circuit_id
    LEFT JOIN atlas.circuit_page_profiles AS profile ON profile.circuit_id=circuit.id
    WHERE layout.id=$1 AND circuit.id=$2 AND layout.centerline IS NOT NULL`, [packageData.layoutId, packageData.circuitId]);
  if (!layout.rows[0]) throw new Error('Конфигурация не найдена или не имеет загруженного контура');
  const features = [];
  for (const feature of packageData.features) {
    const proximity = await pool.query(`WITH input AS (
        SELECT ST_SetSRID(ST_GeomFromGeoJSON($1),4326) AS geometry
      ), points AS (
        SELECT (ST_DumpPoints(input.geometry)).geom AS point FROM input
      )
      SELECT round(max(ST_Distance(points.point::geography,ST_Force2D(layout.centerline)::geography)))::int AS distance
      FROM points CROSS JOIN atlas.track_layouts AS layout WHERE layout.id=$2`,
    [JSON.stringify(feature.geometry), packageData.layoutId]);
    const maximumDistanceToTrackM = Number(proximity.rows[0]?.distance ?? Infinity);
    if (!Number.isFinite(maximumDistanceToTrackM) || maximumDistanceToTrackM > 2000) {
      throw new Error(`Элемент ${feature.properties.id} удалён от контура более чем на 2 км`);
    }
    if (feature.properties.calloutPoint) {
      const callout = await pool.query(`SELECT ST_Distance(ST_SetSRID(ST_MakePoint($1,$2),4326)::geography,ST_SetSRID(ST_GeomFromGeoJSON($3),4326)::geography) AS distance_m`,
        [...feature.properties.calloutPoint, JSON.stringify(feature.geometry)]);
      if (Number(callout.rows[0]?.distance_m ?? Infinity) > 1000) throw new Error(`Выносная подпись ${feature.properties.id} дальше 1 км от элемента`);
    }
    features.push({
      id: feature.properties.id,
      annotationType: feature.properties.annotationType,
      label: feature.properties.labelRu ?? feature.properties.labelOriginal ?? null,
      sequence: feature.properties.sequence ?? null,
      validFromYear: feature.properties.validFromYear,
      validToYear: feature.properties.validToYear,
      maximumDistanceToTrackM,
      geometry: feature.geometry,
    });
  }
  pruneTrackAnnotationImportPreviews();
  const token = randomUUID();
  const preview = {
    token,
    expiresAt: Date.now() + trackAnnotationImportPreviewTtlMs,
    circuit: { id: String(layout.rows[0].circuit_id), name: String(layout.rows[0].circuit_name) },
    layout: { id: String(layout.rows[0].id), name: String(layout.rows[0].name) },
    summary: summarizeTrackAnnotationPackage(packageData),
    features,
    packageData,
  };
  trackAnnotationImportPreviews.set(token, preview);
  return { ...preview, packageData: undefined };
}

function getTrackAnnotationImportPreview(token) {
  const preview = trackAnnotationImportPreviews.get(token);
  if (!preview || preview.expiresAt <= Date.now()) {
    trackAnnotationImportPreviews.delete(token);
    return null;
  }
  return { ...preview, packageData: undefined };
}

async function applyTrackAnnotationImportPreview(token) {
  const preview = trackAnnotationImportPreviews.get(token);
  if (!preview || preview.expiresAt <= Date.now()) {
    trackAnnotationImportPreviews.delete(token);
    return null;
  }
  const imported = await applyTrackAnnotationPackage(preview.packageData);
  trackAnnotationImportPreviews.delete(token);
  return { imported, circuitId: preview.circuit.id, layoutId: preview.layout.id };
}

function validateCircuitInput(value, routeId) {
  if (!value || typeof value !== 'object' || !/^[A-Za-z0-9_-]+$/.test(routeId)) throw new Error('Некорректный ID трассы');
  const required = (field) => { const result = optionalText(value[field]); if (!result) throw new Error(`Поле ${field} обязательно`); return result; };
  const number = (field, minimum, maximum, nullable = false) => {
    const raw = optionalText(value[field]);
    if (raw === null) { if (nullable) return null; throw new Error(`Поле ${field} обязательно`); }
    const result = Number(raw); if (!Number.isFinite(result) || result < minimum || result > maximum) throw new Error(`Некорректное поле ${field}`); return result;
  };
  const countryCode = required('countryCode').toLowerCase();
  if (!/^[a-z]{2}$/.test(countryCode)) throw new Error('Код страны должен содержать две латинские буквы');
  const circuitType = required('circuitType'); if (!circuitTypeValues.has(circuitType)) throw new Error('Некорректный тип трассы');
  const editorialStatus = required('editorialStatus'); if (!circuitProfileStatuses.has(editorialStatus)) throw new Error('Некорректный статус профиля');
  const slug = required('slug'); if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) throw new Error('Некорректный адрес страницы');
  const websiteRaw = optionalText(value.websiteUrl); const websiteUrl = websiteRaw ? validateEditorialUrl(websiteRaw) : null;
  const sourceUrl = validateEditorialUrl(value.sourceUrl);
  const input = {
    id: routeId, officialName: required('officialName'), shortName: optionalText(value.shortName),
    locality: optionalText(value.locality), countryCode, circuitType,
    longitude: number('longitude', -180, 180), latitude: number('latitude', -90, 90),
    openedYear: number('openedYear', 1800, new Date().getUTCFullYear(), true), websiteUrl,
    slug, geometryId: optionalText(value.geometryId), nameRu: required('nameRu'), cityRu: required('cityRu'),
    countryRu: required('countryRu'), summaryRu: optionalText(value.summaryRu),
    circuitTypeRu: optionalText(value.circuitTypeRu), editorialStatus, sourceUrl,
    sourceName: optionalText(value.sourceName) ?? new URL(sourceUrl).hostname,
    sourceNotes: optionalText(value.sourceNotes),
    sourceVerified: value.sourceVerified === true,
  };
  if (editorialStatus === 'published') {
    if (!['spa', 'bahrain'].includes(routeId)) throw new Error('Публичный шаблон этой трассы ещё не подключён');
    if (!input.geometryId || !input.summaryRu || !input.circuitTypeRu) throw new Error('Опубликованный профиль заполнен не полностью');
  }
  return input;
}

async function listFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true }).catch(() => []);
  const nested = await Promise.all(entries.map((entry) => {
    const entryPath = path.join(directory, entry.name);
    return entry.isDirectory() ? listFiles(entryPath) : [entryPath];
  }));
  return nested.flat();
}

let circuitExportTail = Promise.resolve();
const circuitExportCommandOptions = { cwd: repositoryRoot, env: process.env, windowsHide: true, timeout: 120_000 };
const circuitPageExportOptions = { ...circuitExportCommandOptions, timeout: 30_000 };
function runCircuitExports(circuitId, editorialStatus) {
  const task = circuitExportTail.then(async () => {
    const snapshotDirectory = path.join(repositoryRoot, 'apps', 'web', 'public', 'data', 'f1');
    const explicitFiles = [
      path.join(repositoryRoot, 'apps', 'web', 'app', 'data', 'catalogs', 'circuits.json'),
      path.join(repositoryRoot, 'apps', 'web', 'public', 'data', 'search-index.json'),
      path.join(repositoryRoot, 'apps', 'web', 'app', 'data', 'circuit-pages', `${circuitId}.json`),
      path.join(repositoryRoot, 'apps', 'web', 'public', 'data', 'travel', `${circuitId}.geojson`),
    ];
    const originalDirectoryFiles = await listFiles(snapshotDirectory);
    const originalFiles = new Map();
    for (const filePath of [...explicitFiles, ...originalDirectoryFiles]) {
      originalFiles.set(filePath, await readFile(filePath).catch(() => null));
    }
    try {
      if (editorialStatus === 'published' && ['spa', 'bahrain'].includes(circuitId)) {
        await execFileAsync(process.execPath, [path.join(repositoryRoot, 'scripts', 'export-circuit-pages.mjs'), '--circuit', circuitId], circuitExportCommandOptions);
      }
      await execFileAsync(process.execPath, [path.join(repositoryRoot, 'scripts', 'export-circuit-travel.mjs'), '--circuit', circuitId], circuitExportCommandOptions);
      await execFileAsync(process.execPath, [path.join(repositoryRoot, 'scripts', 'export-circuit-catalog.mjs')], circuitExportCommandOptions);
      await execFileAsync(process.execPath, [path.join(repositoryRoot, 'scripts', 'export-search-index.mjs')], circuitExportCommandOptions);
      await execFileAsync(process.execPath, [path.join(repositoryRoot, 'scripts', 'export-web-snapshots.mjs')], circuitExportCommandOptions);
    } catch (error) {
      const currentDirectoryFiles = await listFiles(snapshotDirectory);
      await Promise.all(currentDirectoryFiles.filter((filePath) => !originalFiles.has(filePath)).map((filePath) => unlink(filePath).catch(() => {})));
      for (const [filePath, contents] of originalFiles) {
        if (contents === null) await unlink(filePath).catch(() => {});
        else { await mkdir(path.dirname(filePath), { recursive: true }); await writeFile(filePath, contents); }
      }
      throw error;
    }
  });
  circuitExportTail = task.catch(() => {});
  return task;
}

async function saveCircuit(rawInput, routeId) {
  const input = validateCircuitInput(rawInput, routeId);
  const client = await pool.connect(); let committed = false;
  try {
    await client.query('BEGIN');
    const current = await client.query(`SELECT circuit.id, circuit.name, circuit.short_name, circuit.locality,
        lower(circuit.country_code) AS country_code, circuit.circuit_type,
        ST_X(circuit.location::geometry) AS longitude, ST_Y(circuit.location::geometry) AS latitude,
        circuit.opened_year, circuit.website_url, profile.slug, profile.geometry_id, profile.name_ru,
        profile.city_ru, profile.country_ru, profile.summary_ru, profile.circuit_type_ru, profile.editorial_status
      FROM atlas.circuits AS circuit LEFT JOIN atlas.circuit_page_profiles AS profile ON profile.circuit_id = circuit.id
      WHERE circuit.id = $1`, [routeId]);
    if (!current.rows[0]) { await client.query('ROLLBACK'); return null; }
    const previous = current.rows[0];
    if (previous.slug !== null && input.slug !== previous.slug) throw new Error('Адрес существующей публичной страницы пока нельзя менять');
    if (previous.editorial_status === 'published' && input.editorialStatus !== 'published') {
      throw new Error('Снятие подключённой страницы с публикации будет доступно после динамического реестра страниц');
    }
    const same = (left, right) => (left ?? null) === (right ?? null);
    const coreChanged = !same(previous.name, input.officialName) || !same(previous.short_name, input.shortName)
      || !same(previous.locality, input.locality) || !same(String(previous.country_code).trim(), input.countryCode)
      || !same(previous.circuit_type, input.circuitType) || Number(previous.longitude) !== input.longitude
      || Number(previous.latitude) !== input.latitude || !same(previous.opened_year === null ? null : Number(previous.opened_year), input.openedYear)
      || !same(previous.website_url, input.websiteUrl);
    const profileFields = new Map([
      ['slug', [previous.slug, input.slug]], ['geometry_id', [previous.geometry_id, input.geometryId]],
      ['name_ru', [previous.name_ru, input.nameRu]], ['city_ru', [previous.city_ru, input.cityRu]],
      ['country_ru', [previous.country_ru, input.countryRu]], ['summary_ru', [previous.summary_ru, input.summaryRu]],
      ['circuit_type_ru', [previous.circuit_type_ru, input.circuitTypeRu]],
    ]);
    const changedProfileFields = [...profileFields].filter(([, [before, after]]) => !same(before, after)).map(([field]) => field);
    if (input.editorialStatus === 'published' && (coreChanged || changedProfileFields.length) && !input.sourceVerified) {
      throw new Error('Изменения опубликованной страницы требуют явного подтверждения источника');
    }
    if (input.editorialStatus === 'published') {
      const layout = await client.query(`SELECT id FROM atlas.track_layouts WHERE id = $1 AND circuit_id = $2
        AND centerline IS NOT NULL AND review_status IN ('reviewed','published')`, [input.geometryId, routeId]);
      if (!layout.rows[0]) throw new Error('Для публикации нужна проверенная конфигурация с геометрией');
    }
    const sourceId = `admin-${createHash('sha256').update(input.sourceUrl).digest('hex').slice(0, 16)}`;
    await client.query(`INSERT INTO atlas.data_sources (id, name, url, retrieved_at, notes)
      VALUES ($1, $2, $3, now(), $4) ON CONFLICT (id) DO UPDATE SET
      name = EXCLUDED.name, url = EXCLUDED.url, retrieved_at = EXCLUDED.retrieved_at, notes = EXCLUDED.notes`,
    [sourceId, input.sourceName, input.sourceUrl, input.sourceNotes]);
    await client.query(`UPDATE atlas.circuits SET name=$2, short_name=$3, locality=$4, country_code=$5,
      circuit_type=$6, location=ST_SetSRID(ST_MakePoint($7,$8),4326)::geography,
      opened_year=$9, website_url=$10, source_id=CASE WHEN $12 THEN $11 ELSE source_id END, updated_at=now() WHERE id=$1`,
    [routeId, input.officialName, input.shortName, input.locality, input.countryCode.toUpperCase(), input.circuitType,
      input.longitude, input.latitude, input.openedYear, input.websiteUrl, sourceId, coreChanged]);
    await client.query(`INSERT INTO atlas.circuit_page_profiles
      (circuit_id, slug, geometry_id, name_ru, city_ru, country_ru, summary_ru, circuit_type_ru, editorial_status, source_id, updated_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,now()) ON CONFLICT (circuit_id) DO UPDATE SET
      slug=EXCLUDED.slug, geometry_id=EXCLUDED.geometry_id, name_ru=EXCLUDED.name_ru,
      city_ru=EXCLUDED.city_ru, country_ru=EXCLUDED.country_ru, summary_ru=EXCLUDED.summary_ru,
      circuit_type_ru=EXCLUDED.circuit_type_ru, editorial_status=EXCLUDED.editorial_status,
      source_id=CASE WHEN $11 THEN EXCLUDED.source_id ELSE atlas.circuit_page_profiles.source_id END,
      updated_at=EXCLUDED.updated_at`,
    [routeId, input.slug, input.geometryId, input.nameRu, input.cityRu, input.countryRu,
      input.summaryRu, input.circuitTypeRu, input.editorialStatus, sourceId, changedProfileFields.length > 0]);
    for (const field of changedProfileFields) {
      await client.query(`INSERT INTO atlas.circuit_page_profile_field_sources
        (circuit_id, field_name, source_id, editorial_status, verified_at, notes)
        VALUES ($1,$2,$3,$4,CASE WHEN $4 = 'verified' THEN now() ELSE NULL END,$5) ON CONFLICT (circuit_id,field_name) DO UPDATE SET
        source_id=EXCLUDED.source_id, editorial_status=EXCLUDED.editorial_status,
        verified_at=EXCLUDED.verified_at, notes=EXCLUDED.notes`,
      [routeId, field, sourceId, input.sourceVerified ? 'verified' : 'candidate', input.sourceNotes]);
    }
    if (input.editorialStatus === 'published') {
      const provenance = await client.query(`SELECT count(DISTINCT field_name)::int AS verified_fields
        FROM atlas.circuit_page_profile_field_sources
        WHERE circuit_id = $1 AND editorial_status = 'verified'
          AND field_name = ANY($2::text[])`,
      [routeId, ['slug', 'geometry_id', 'name_ru', 'city_ru', 'country_ru', 'summary_ru', 'circuit_type_ru']]);
      if (Number(provenance.rows[0].verified_fields) !== 7) {
        throw new Error('Для публикации все обязательные поля должны иметь проверенные источники');
      }
    }
    await client.query('COMMIT'); committed = true;
    let publicDataSynced = true;
    try { await runCircuitExports(routeId, input.editorialStatus); }
    catch (error) { publicDataSynced = false; console.error('Трасса сохранена, но публичные данные не синхронизированы', error); }
    return { id: routeId, publicDataSynced };
  } catch (error) {
    if (!committed) await client.query('ROLLBACK').catch(() => {}); throw error;
  } finally { client.release(); }
}

async function getTravelRegistry(url) {
  const limit = boundedPositiveInteger(url.searchParams.get('limit'), 30, 100);
  const page = boundedPositiveInteger(url.searchParams.get('page'), 1);
  const offset = (page - 1) * limit;
  const search = String(url.searchParams.get('q') ?? '').trim().slice(0, 120);
  const [rowsResult, summaryResult, categoriesResult, importsResult] = await Promise.all([
    pool.query(`
      SELECT circuit.id,
             coalesce(page.name_ru, circuit.short_name, circuit.name) AS name,
             page.slug,
             travel.editorial_status,
             coalesce(points.total, 0)::int AS point_count,
             coalesce(points.published, 0)::int AS published_point_count,
             coalesce(points.candidates, 0)::int AS candidate_point_count,
             coalesce(points.stays, 0)::int AS stay_point_count,
             coalesce(zones.total, 0)::int AS zone_count,
             coalesce(routes.total, 0)::int AS route_count,
             coalesce(routes.published, 0)::int AS published_route_count,
             count(*) OVER()::int AS filtered_count
      FROM atlas.circuits AS circuit
      LEFT JOIN atlas.circuit_page_profiles AS page ON page.circuit_id = circuit.id
      LEFT JOIN atlas.circuit_travel_profiles AS travel ON travel.circuit_id = circuit.id
      LEFT JOIN LATERAL (
        SELECT count(*)::int AS total,
               count(*) FILTER (WHERE poi.review_status = 'published')::int AS published,
               count(*) FILTER (WHERE poi.review_status = 'candidate')::int AS candidates,
               count(*) FILTER (WHERE category.group_id = 'stay')::int AS stays
        FROM atlas.circuit_travel_pois AS link
        JOIN atlas.tourism_pois AS poi ON poi.id = link.poi_id
        JOIN atlas.poi_categories AS category ON category.id = poi.category_id
        WHERE link.circuit_id = circuit.id
      ) AS points ON true
      LEFT JOIN LATERAL (
        SELECT count(*)::int AS total FROM atlas.travel_zones AS zone
        WHERE zone.circuit_id = circuit.id AND zone.review_status <> 'hidden'
      ) AS zones ON true
      LEFT JOIN LATERAL (
        SELECT count(*)::int AS total,
               count(*) FILTER (WHERE route.review_status = 'published')::int AS published
        FROM atlas.travel_routes AS route
        WHERE route.circuit_id = circuit.id AND route.review_status <> 'hidden'
      ) AS routes ON true
      WHERE ($3 = '' OR circuit.id ILIKE '%' || $3 || '%'
        OR circuit.name ILIKE '%' || $3 || '%'
        OR coalesce(page.name_ru, '') ILIKE '%' || $3 || '%')
      ORDER BY lower(coalesce(page.name_ru, circuit.short_name, circuit.name)), circuit.id
      LIMIT $1 OFFSET $2
    `, [limit, offset, search]),
    pool.query(`
      SELECT
        (SELECT count(*)::int FROM atlas.tourism_pois WHERE review_status <> 'hidden') AS points,
        (SELECT count(*)::int FROM atlas.tourism_pois WHERE review_status = 'published') AS published_points,
        (SELECT count(*)::int FROM atlas.travel_zones WHERE review_status <> 'hidden') AS zones,
        (SELECT count(*)::int FROM atlas.travel_routes WHERE review_status <> 'hidden') AS routes,
        (SELECT count(*)::int FROM atlas.circuits) AS circuits
    `),
    pool.query(`
      SELECT groups.id AS group_id, groups.name_ru AS group_name, groups.marker_colour,
             categories.id, categories.name_ru AS name, categories.icon,
             categories.min_zoom::float8 AS min_zoom, categories.is_clustered
      FROM atlas.travel_category_groups AS groups
      JOIN atlas.poi_categories AS categories ON categories.group_id = groups.id
      ORDER BY groups.sort_order, categories.default_priority DESC, categories.name_ru
    `),
    pool.query(`
      SELECT run.id, run.circuit_id, coalesce(profile.name_ru, circuit.short_name, circuit.name) AS circuit_name,
             run.provider, run.parameters, run.status, run.discovered_count, run.imported_count,
             run.failed_groups, run.created_at, run.expires_at, run.applied_at, run.error_message
      FROM atlas.travel_import_runs AS run
      JOIN atlas.circuits AS circuit ON circuit.id = run.circuit_id
      LEFT JOIN atlas.circuit_page_profiles AS profile ON profile.circuit_id = circuit.id
      ORDER BY run.created_at DESC
      LIMIT 10
    `),
  ]);
  const categoryGroups = [];
  for (const row of categoriesResult.rows) {
    let group = categoryGroups.find((candidate) => candidate.id === row.group_id);
    if (!group) {
      group = { id: String(row.group_id), name: String(row.group_name), colour: String(row.marker_colour), categories: [] };
      categoryGroups.push(group);
    }
    group.categories.push({
      id: String(row.id), name: String(row.name), icon: row.icon === null ? null : String(row.icon),
      minZoom: Number(row.min_zoom), clustered: Boolean(row.is_clustered),
    });
  }
  const summary = summaryResult.rows[0];
  return {
    rows: rowsResult.rows.map((row) => ({
      id: String(row.id), name: String(row.name), slug: row.slug === null ? null : String(row.slug),
      editorialStatus: row.editorial_status === null ? null : String(row.editorial_status),
      pointCount: Number(row.point_count), publishedPointCount: Number(row.published_point_count),
      candidatePointCount: Number(row.candidate_point_count), stayPointCount: Number(row.stay_point_count),
      zoneCount: Number(row.zone_count), routeCount: Number(row.route_count),
      publishedRouteCount: Number(row.published_route_count),
    })),
    filteredCount: rowsResult.rows[0] ? Number(rowsResult.rows[0].filtered_count) : 0,
    page, limit,
    summary: {
      circuits: Number(summary.circuits), points: Number(summary.points),
      publishedPoints: Number(summary.published_points), zones: Number(summary.zones), routes: Number(summary.routes),
    },
    categoryGroups,
    recentImports: importsResult.rows.map((row) => ({
      id: String(row.id), circuitId: String(row.circuit_id), circuitName: String(row.circuit_name),
      provider: String(row.provider), status: String(row.status),
      discoveredCount: Number(row.discovered_count), importedCount: Number(row.imported_count),
      failedGroups: row.failed_groups ?? [], createdAt: new Date(row.created_at).toISOString(),
      expiresAt: row.expires_at === null ? null : new Date(row.expires_at).toISOString(),
      appliedAt: row.applied_at === null ? null : new Date(row.applied_at).toISOString(),
      errorMessage: row.error_message === null ? null : String(row.error_message),
    })),
  };
}

async function travelPointCategories() {
  const result = await pool.query(`SELECT category.id, category.name_ru, category.group_id
    FROM atlas.poi_categories AS category
    WHERE category.group_id IS NOT NULL
    ORDER BY category.group_id, category.default_priority DESC, category.name_ru`);
  return result.rows.map((row) => ({ id: String(row.id), name: String(row.name_ru), groupId: String(row.group_id) }));
}

async function saveTravelCategoryIcon(categoryId, rawInput) {
  const icon = String(rawInput?.icon ?? '').trim();
  if (!/^[a-z][a-z0-9-]{0,39}$/.test(icon)) throw new Error('Значок: только латинские буквы, цифры и дефис');
  const result = await pool.query(`UPDATE atlas.poi_categories SET icon=$2 WHERE id=$1 RETURNING id, name_ru, icon`, [categoryId, icon]);
  if (!result.rows.length) return null;
  return { id: String(result.rows[0].id), name: String(result.rows[0].name_ru), icon: String(result.rows[0].icon) };
}

async function saveTravelCategoryIconFile(categoryId, buffer, request) {
  if (!/^[a-z][a-z0-9_-]+$/.test(categoryId)) throw new Error('Некорректная категория');
  const metadata = rawUploadMetadata(request);
  const mimeType = String(metadata.mimeType ?? '').trim();
  if (!['image/svg+xml', 'image/png', 'image/jpeg', 'image/webp'].includes(mimeType)) {
    throw new Error('Разрешены SVG, PNG, JPG и WebP');
  }
  if (mimeType === 'image/svg+xml') {
    const source = buffer.toString('utf8', 0, Math.min(buffer.length, 4096)).replace(/^\uFEFF/, '').trimStart();
    if (!source.startsWith('<svg') && !source.startsWith('<?xml')) throw new Error('Некорректный SVG');
  } else {
    imageFormat(buffer, mimeType);
  }
  const category = await pool.query('SELECT id FROM atlas.poi_categories WHERE id=$1', [categoryId]);
  if (!category.rows.length) return null;
  const bytes = await processTravelCategoryIcon(buffer);
  const hash = createHash('sha256').update(buffer).digest('hex').slice(0, 16);
  const relativeUrl = `/media/travel/category-icons/${categoryId}-${hash}.webp`;
  const outputPath = path.resolve(repositoryRoot, 'apps', 'web', 'public', relativeUrl.replace(/^\/+/, ''));
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, bytes);
  await pool.query('UPDATE atlas.poi_categories SET icon=$2 WHERE id=$1', [categoryId, relativeUrl]);
  return { id: categoryId, icon: relativeUrl };
}

function travelPointPhoto(row) {
  return row.photo_id === null ? null : {
    id: String(row.photo_id), url: String(row.photo_url),
    altTextRu: row.photo_alt_text_ru === null ? null : String(row.photo_alt_text_ru),
    author: row.photo_author == null ? null : String(row.photo_author),
    licence: row.photo_licence == null ? null : String(row.photo_licence),
    sourceUrl: row.photo_source_url == null ? null : String(row.photo_source_url),
    reviewStatus: String(row.photo_review_status), rightsStatus: String(row.photo_rights_status),
  };
}

async function getTravelPoints(circuitId, url) {
  const limit = boundedPositiveInteger(url.searchParams.get('limit'), 30, 100);
  const page = boundedPositiveInteger(url.searchParams.get('page'), 1);
  const offset = (page - 1) * limit;
  const search = String(url.searchParams.get('q') ?? '').trim().slice(0, 120);
  const requestedStatus = url.searchParams.get('status');
  const status = ['candidate', 'reviewed', 'published', 'hidden'].includes(requestedStatus) ? requestedStatus : '';
  const category = String(url.searchParams.get('category') ?? '').trim().slice(0, 80);
  const requestedRole = url.searchParams.get('role');
  const role = ['transport', 'stay', 'explore', 'essential', 'circuit'].includes(requestedRole) ? requestedRole : '';
  const requestedPhoto = url.searchParams.get('photo');
  const photo = ['yes', 'no'].includes(requestedPhoto) ? requestedPhoto : '';
  const requestedFeatured = url.searchParams.get('featured');
  const featured = ['yes', 'no'].includes(requestedFeatured) ? requestedFeatured : '';
  const requestedTranslation = url.searchParams.get('translation');
  const translation = ['ready', 'missing'].includes(requestedTranslation) ? requestedTranslation : '';
  const optionalNumber = (name, maximum = Number.POSITIVE_INFINITY) => {
    const raw = String(url.searchParams.get(name) ?? '').trim().replace(',', '.');
    if (!raw) return null;
    const value = Number(raw);
    return Number.isFinite(value) && value >= 0 ? Math.min(value, maximum) : null;
  };
  const distanceMin = optionalNumber('distanceMin');
  const distanceMax = optionalNumber('distanceMax');
  const importanceMin = optionalNumber('importanceMin', 100);
  const importanceMax = optionalNumber('importanceMax', 100);
  const filterSql = `link.circuit_id=$1 AND ($4='' OR poi.review_status=$4)
    AND ($3='' OR poi.id ILIKE '%'||$3||'%' OR poi.name ILIKE '%'||$3||'%' OR coalesce(poi.name_ru,'') ILIKE '%'||$3||'%')
    AND ($6='' OR poi.category_id=$6) AND ($7='' OR link.role=$7)
    AND ($8='' OR ($8='yes' AND photo.id IS NOT NULL) OR ($8='no' AND photo.id IS NULL))
    AND ($9='' OR ($9='yes' AND link.is_featured) OR ($9='no' AND NOT link.is_featured))
    AND ($10::float8 IS NULL OR coalesce(link.distance_to_circuit_m, ST_Distance(poi.location, circuit.location)) >= $10 * 1000)
    AND ($11::float8 IS NULL OR coalesce(link.distance_to_circuit_m, ST_Distance(poi.location, circuit.location)) <= $11 * 1000)
    AND ($12::float8 IS NULL OR poi.importance >= $12)
    AND ($13::float8 IS NULL OR poi.importance <= $13)
    AND ($14='' OR ($14='missing' AND nullif(trim(coalesce(poi.name_ru,'')),'') IS NULL)
      OR ($14='ready' AND nullif(trim(coalesce(poi.name_ru,'')),'') IS NOT NULL))`;
  const parameters = [circuitId, limit, search, status, offset, category, role, photo, featured, distanceMin, distanceMax, importanceMin, importanceMax, translation];
  const [circuitResult, rowsResult, countResult, mapResult, categories] = await Promise.all([
    pool.query(`SELECT circuit.id, coalesce(profile.name_ru, circuit.short_name, circuit.name) AS name,
        ST_Y(circuit.location::geometry)::float8 AS latitude, ST_X(circuit.location::geometry)::float8 AS longitude
      FROM atlas.circuits AS circuit LEFT JOIN atlas.circuit_page_profiles AS profile ON profile.circuit_id=circuit.id
      WHERE circuit.id=$1`, [circuitId]),
    pool.query(`SELECT poi.id, poi.name, poi.name_ru, category.id AS category_id, category.name_ru AS category_name,
        link.role, poi.importance, poi.review_status, link.is_featured,
        round(coalesce(link.distance_to_circuit_m, ST_Distance(poi.location, circuit.location)))::int AS distance_to_circuit_m,
        photo.id AS photo_id, coalesce(thumb.url, photo.url) AS photo_url, photo.alt_text_ru AS photo_alt_text_ru,
        photo.author AS photo_author, photo.licence AS photo_licence, photo.source_url AS photo_source_url,
        photo.review_status AS photo_review_status, photo.rights_status AS photo_rights_status
      FROM atlas.circuit_travel_pois AS link
      JOIN atlas.tourism_pois AS poi ON poi.id=link.poi_id
      JOIN atlas.poi_categories AS category ON category.id=poi.category_id
      JOIN atlas.circuits AS circuit ON circuit.id=link.circuit_id
      LEFT JOIN LATERAL (SELECT media.* FROM atlas.media_assets AS media
        WHERE media.entity_type='tourism_poi' AND media.entity_id=poi.id AND media.media_type='image'
        ORDER BY media.is_primary DESC, media.id LIMIT 1) AS photo ON true
      LEFT JOIN LATERAL (SELECT derivative.url FROM atlas.media_asset_derivatives AS derivative
        WHERE derivative.media_asset_id=photo.id ORDER BY CASE derivative.variant WHEN '640w' THEN 0 WHEN '1280w' THEN 1 ELSE 2 END LIMIT 1) AS thumb ON true
      WHERE ${filterSql}
      ORDER BY link.priority DESC, lower(coalesce(poi.name_ru,poi.name)), poi.id LIMIT $2 OFFSET $5`,
      parameters),
    pool.query(`SELECT count(*)::int AS count
      FROM atlas.circuit_travel_pois AS link
      JOIN atlas.tourism_pois AS poi ON poi.id=link.poi_id
      JOIN atlas.circuits AS circuit ON circuit.id=link.circuit_id
      LEFT JOIN LATERAL (SELECT media.id FROM atlas.media_assets AS media
        WHERE media.entity_type='tourism_poi' AND media.entity_id=poi.id AND media.media_type='image'
        ORDER BY media.is_primary DESC, media.id LIMIT 1) AS photo ON true
      WHERE ${filterSql}
        AND $2::int >= 1 AND $5::int >= 0`, parameters),
    pool.query(`SELECT poi.id, coalesce(nullif(trim(poi.name_ru),''),poi.name) AS name,
        poi.name AS original_name, nullif(trim(poi.name_ru),'') AS name_ru,
        poi.category_id, category.icon AS category_icon, link.role,
        ST_Y(poi.location::geometry)::float8 AS latitude, ST_X(poi.location::geometry)::float8 AS longitude,
        round(coalesce(link.distance_to_circuit_m, ST_Distance(poi.location, circuit.location)))::int AS distance_to_circuit_m,
        poi.review_status, photo.id AS photo_id
      FROM atlas.circuit_travel_pois AS link
      JOIN atlas.tourism_pois AS poi ON poi.id=link.poi_id
      JOIN atlas.poi_categories AS category ON category.id=poi.category_id
      JOIN atlas.circuits AS circuit ON circuit.id=link.circuit_id
      LEFT JOIN LATERAL (SELECT media.id FROM atlas.media_assets AS media
        WHERE media.entity_type='tourism_poi' AND media.entity_id=poi.id AND media.media_type='image'
        ORDER BY media.is_primary DESC, media.id LIMIT 1) AS photo ON true
      WHERE link.circuit_id=$1 AND ($3='' OR poi.review_status=$3)
        AND ($2='' OR poi.id ILIKE '%'||$2||'%' OR poi.name ILIKE '%'||$2||'%' OR coalesce(poi.name_ru,'') ILIKE '%'||$2||'%')
        AND ($4='' OR poi.category_id=$4) AND ($5='' OR link.role=$5)
        AND ($6='' OR ($6='yes' AND photo.id IS NOT NULL) OR ($6='no' AND photo.id IS NULL))
        AND ($7='' OR ($7='yes' AND link.is_featured) OR ($7='no' AND NOT link.is_featured))
        AND ($8::float8 IS NULL OR coalesce(link.distance_to_circuit_m, ST_Distance(poi.location, circuit.location)) >= $8 * 1000)
        AND ($9::float8 IS NULL OR coalesce(link.distance_to_circuit_m, ST_Distance(poi.location, circuit.location)) <= $9 * 1000)
        AND ($10::float8 IS NULL OR poi.importance >= $10)
        AND ($11::float8 IS NULL OR poi.importance <= $11)
        AND ($12='' OR ($12='missing' AND nullif(trim(coalesce(poi.name_ru,'')),'') IS NULL)
          OR ($12='ready' AND nullif(trim(coalesce(poi.name_ru,'')),'') IS NOT NULL))
      ORDER BY link.priority DESC, poi.id
      LIMIT 2001`, [circuitId, search, status, category, role, photo, featured, distanceMin, distanceMax, importanceMin, importanceMax, translation]),
    travelPointCategories(),
  ]);
  if (!circuitResult.rows.length) return null;
  const circuitRow = circuitResult.rows[0];
  return {
    circuit: { id: String(circuitRow.id), name: String(circuitRow.name), latitude: Number(circuitRow.latitude), longitude: Number(circuitRow.longitude) }, categories,
    rows: rowsResult.rows.map((row) => ({
      id: String(row.id), name: String(row.name), nameRu: row.name_ru === null ? null : String(row.name_ru),
      categoryId: String(row.category_id), categoryName: String(row.category_name), role: String(row.role),
      importance: Number(row.importance), distanceToCircuitM: Number(row.distance_to_circuit_m),
      reviewStatus: String(row.review_status), isFeatured: Boolean(row.is_featured),
      photo: travelPointPhoto(row),
    })),
    mapPoints: mapResult.rows.slice(0, 2000).map((row) => ({
      id: String(row.id), name: String(row.name), nameRu: row.name_ru === null ? null : String(row.name_ru),
      originalName: String(row.original_name), categoryId: String(row.category_id), categoryIcon: String(row.category_icon), role: String(row.role),
      latitude: Number(row.latitude), longitude: Number(row.longitude), distanceToCircuitM: Number(row.distance_to_circuit_m),
      reviewStatus: String(row.review_status),
    })),
    mapPointsTruncated: mapResult.rows.length > 2000,
    mapPointLimit: 2000,
    filteredCount: Number(countResult.rows[0].count), page, limit,
  };
}

async function getTravelPoint(circuitId, pointId) {
  const [result, categories] = await Promise.all([
    pool.query(`SELECT poi.id, poi.category_id, category.name_ru AS category_name, poi.name, poi.name_ru, poi.description_ru,
        ST_Y(poi.location::geometry)::float8 AS latitude, ST_X(poi.location::geometry)::float8 AS longitude,
        poi.address, poi.website_url, poi.opening_hours, poi.importance, poi.review_status,
        link.circuit_id, coalesce(profile.name_ru,circuit.short_name,circuit.name) AS circuit_name,
        link.role, link.priority, link.is_featured, link.editorial_note_ru,
        round(coalesce(link.distance_to_circuit_m, ST_Distance(poi.location, circuit.location)))::int AS distance_to_circuit_m,
        source.name AS source_name, source.url AS source_url,
        photo.id AS photo_id, coalesce(thumb.url,photo.url) AS photo_url, photo.alt_text_ru AS photo_alt_text_ru,
        photo.author AS photo_author, photo.licence AS photo_licence, photo.source_url AS photo_source_url,
        photo.review_status AS photo_review_status, photo.rights_status AS photo_rights_status
      FROM atlas.circuit_travel_pois AS link
      JOIN atlas.tourism_pois AS poi ON poi.id=link.poi_id
      JOIN atlas.poi_categories AS category ON category.id=poi.category_id
      JOIN atlas.circuits AS circuit ON circuit.id=link.circuit_id
      LEFT JOIN atlas.circuit_page_profiles AS profile ON profile.circuit_id=circuit.id
      LEFT JOIN atlas.data_sources AS source ON source.id=poi.source_id
      LEFT JOIN LATERAL (SELECT media.* FROM atlas.media_assets AS media
        WHERE media.entity_type='tourism_poi' AND media.entity_id=poi.id AND media.media_type='image'
        ORDER BY media.is_primary DESC, media.id LIMIT 1) AS photo ON true
      LEFT JOIN LATERAL (SELECT derivative.url FROM atlas.media_asset_derivatives AS derivative
        WHERE derivative.media_asset_id=photo.id ORDER BY CASE derivative.variant WHEN '640w' THEN 0 WHEN '1280w' THEN 1 ELSE 2 END LIMIT 1) AS thumb ON true
      WHERE link.circuit_id=$1 AND poi.id=$2`, [circuitId, pointId]),
    travelPointCategories(),
  ]);
  if (!result.rows.length) return null;
  const row = result.rows[0];
  return { point: {
    id: String(row.id), circuitId: String(row.circuit_id), circuitName: String(row.circuit_name),
    categoryId: String(row.category_id), categoryName: String(row.category_name), role: String(row.role),
    name: String(row.name), nameRu: row.name_ru === null ? null : String(row.name_ru),
    descriptionRu: row.description_ru === null ? null : String(row.description_ru),
    latitude: Number(row.latitude), longitude: Number(row.longitude), address: row.address === null ? null : String(row.address),
    websiteUrl: row.website_url === null ? null : String(row.website_url), openingHours: row.opening_hours === null ? null : String(row.opening_hours),
    importance: Number(row.importance), distanceToCircuitM: Number(row.distance_to_circuit_m),
    reviewStatus: String(row.review_status), priority: Number(row.priority),
    isFeatured: Boolean(row.is_featured), editorialNoteRu: row.editorial_note_ru === null ? null : String(row.editorial_note_ru),
    sourceName: row.source_name === null ? null : String(row.source_name), sourceUrl: row.source_url === null ? null : String(row.source_url),
    photo: travelPointPhoto(row),
  }, categories };
}

async function saveTravelPoint(rawInput, circuitId, pointId) {
  const name = optionalText(rawInput?.name); const categoryId = optionalText(rawInput?.categoryId);
  const role = String(rawInput?.role ?? ''); const reviewStatus = String(rawInput?.reviewStatus ?? '');
  const latitude = Number(rawInput?.latitude); const longitude = Number(rawInput?.longitude);
  const importance = Number(rawInput?.importance); const priority = Number(rawInput?.priority);
  if (!name || !categoryId || !['transport','stay','explore','essential','circuit'].includes(role)
    || !['candidate','reviewed','published','hidden'].includes(reviewStatus)
    || !Number.isFinite(latitude) || latitude < -90 || latitude > 90
    || !Number.isFinite(longitude) || longitude < -180 || longitude > 180
    || !Number.isInteger(importance) || importance < 0 || importance > 100
    || !Number.isInteger(priority) || priority < 0 || priority > 100) throw new Error('Некорректные данные туристической точки');
  const websiteUrl = optionalText(rawInput?.websiteUrl);
  if (websiteUrl) { const parsed = new URL(websiteUrl); if (!['http:','https:'].includes(parsed.protocol) || parsed.username || parsed.password) throw new Error('Некорректный сайт точки'); }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const updated = await client.query(`UPDATE atlas.tourism_pois SET category_id=$3, name=$4, name_ru=$5,
      description_ru=$6, location=ST_SetSRID(ST_MakePoint($7,$8),4326)::geography, address=$9,
      website_url=$10, opening_hours=$11, importance=$12, review_status=$13, updated_at=now()
      WHERE id=$2 AND EXISTS (SELECT 1 FROM atlas.circuit_travel_pois WHERE circuit_id=$1 AND poi_id=$2) RETURNING id`,
      [circuitId, pointId, categoryId, name, optionalText(rawInput?.nameRu), optionalText(rawInput?.descriptionRu), longitude, latitude,
        optionalText(rawInput?.address), websiteUrl, optionalText(rawInput?.openingHours), importance, reviewStatus]);
    if (!updated.rows.length) { await client.query('ROLLBACK'); return null; }
    await client.query(`UPDATE atlas.circuit_travel_pois SET role=$3, priority=$4, is_featured=$5,
      editorial_note_ru=$6, updated_at=now() WHERE circuit_id=$1 AND poi_id=$2`,
      [circuitId, pointId, role, priority, rawInput?.isFeatured === true, optionalText(rawInput?.editorialNoteRu)]);
    await client.query('COMMIT');
  } catch (error) { await client.query('ROLLBACK').catch(() => {}); throw error; }
  finally { client.release(); }
  let publicDataSynced = true;
  try { await runCircuitExports(circuitId, 'published'); }
  catch (error) { publicDataSynced = false; console.error('Точка сохранена, но read-model не обновлён', error); }
  return { id: pointId, circuitId, publicDataSynced };
}

async function saveTravelPointsBulk(rawInput, circuitId) {
  if (circuitId.length > 100 || !/^[A-Za-z0-9_-]+$/.test(circuitId)) throw new Error('Некорректный ID трассы');
  const pointIds = Array.isArray(rawInput?.pointIds) ? rawInput.pointIds : [];
  if (pointIds.length < 1 || pointIds.length > 100
    || pointIds.some((id) => typeof id !== 'string' || id.length > 100 || !/^[A-Za-z0-9_-]+$/.test(id))
    || new Set(pointIds).size !== pointIds.length) throw new Error('Некорректный список туристических точек');
  const hasStatus = Object.hasOwn(rawInput ?? {}, 'reviewStatus');
  const hasFeatured = Object.hasOwn(rawInput ?? {}, 'isFeatured');
  if (hasStatus === hasFeatured) throw new Error('Нужно передать ровно одно пакетное изменение');
  const reviewStatus = hasStatus ? String(rawInput.reviewStatus) : null;
  if (hasStatus && !['candidate', 'reviewed', 'published', 'hidden'].includes(reviewStatus)) throw new Error('Некорректный статус проверки');
  if (hasFeatured && typeof rawInput.isFeatured !== 'boolean') throw new Error('Некорректный признак отбора');
  const client = await pool.connect();
  let updated = 0;
  let affectedCircuitIds = [circuitId];
  try {
    await client.query('BEGIN');
    const linked = await client.query(`SELECT poi_id FROM atlas.circuit_travel_pois
      WHERE circuit_id=$1 AND poi_id=ANY($2::text[]) FOR UPDATE`, [circuitId, pointIds]);
    if (linked.rows.length !== pointIds.length) throw new Error('Одна или несколько точек не относятся к выбранной трассе');
    if (hasStatus) {
      const affected = await client.query(`SELECT DISTINCT circuit_id FROM atlas.circuit_travel_pois
        WHERE poi_id=ANY($1::text[]) ORDER BY circuit_id`, [pointIds]);
      affectedCircuitIds = affected.rows.map((row) => String(row.circuit_id));
    }
    const result = hasStatus
      ? await client.query(`UPDATE atlas.tourism_pois SET review_status=$3,updated_at=now()
          WHERE id=ANY($2::text[]) AND EXISTS (SELECT 1 FROM atlas.circuit_travel_pois WHERE circuit_id=$1 AND poi_id=atlas.tourism_pois.id)`,
        [circuitId, pointIds, reviewStatus])
      : await client.query(`UPDATE atlas.circuit_travel_pois SET is_featured=$3,updated_at=now()
          WHERE circuit_id=$1 AND poi_id=ANY($2::text[])`, [circuitId, pointIds, rawInput.isFeatured]);
    updated = result.rowCount;
    if (updated !== pointIds.length) throw new Error('Не удалось обновить весь выбранный набор');
    await client.query('COMMIT');
  } catch (error) { await client.query('ROLLBACK').catch(() => {}); throw error; }
  finally { client.release(); }
  let publicDataSynced = true;
  for (const affectedCircuitId of affectedCircuitIds) {
    try { await runCircuitExports(affectedCircuitId, 'published'); }
    catch (error) { publicDataSynced = false; console.error(`Точки сохранены, но read-model трассы ${affectedCircuitId} не обновлён`, error); }
  }
  return { circuitId, updated, publicDataSynced };
}

async function applyStoredOsmRussianNames(circuitId) {
  if (!/^[A-Za-z0-9_-]+$/.test(circuitId)) throw new Error('Некорректный ID трассы');
  const result = await pool.query(`UPDATE atlas.tourism_pois AS poi
    SET name_ru = nullif(trim(coalesce(
      poi.properties #>> '{tags,name:ru}',
      poi.properties #>> '{osm,tags,name:ru}'
    )), ''), updated_at = now()
    FROM atlas.circuit_travel_pois AS link
    WHERE link.circuit_id = $1 AND link.poi_id = poi.id
      AND nullif(trim(coalesce(poi.name_ru, '')), '') IS NULL
      AND nullif(trim(coalesce(
        poi.properties #>> '{tags,name:ru}',
        poi.properties #>> '{osm,tags,name:ru}'
      )), '') IS NOT NULL
    RETURNING poi.id`, [circuitId]);
  let publicDataSynced = true;
  if (result.rowCount) {
    try { await runCircuitExports(circuitId, 'published'); }
    catch (error) { publicDataSynced = false; console.error('Названия из OSM сохранены, но публичные данные не обновлены', error); }
  }
  return { circuitId, updated: result.rowCount, publicDataSynced };
}

async function createTravelPointPhotoPreview(buffer, metadata, circuitId, pointId) {
  if (!/^[A-Za-z0-9_-]+$/.test(circuitId) || !/^[A-Za-z0-9_-]+$/.test(pointId)) {
    throw new Error('Некорректный ID туристической точки');
  }
  imageFormat(buffer, metadata.mimeType);
  const processed = await processTravelPointPhoto(buffer);
  const hash = createHash('sha256').update(buffer).update(`:travel-point:${pointId}`).digest('hex');
  const token = randomUUID();
  pruneDriverPhotoPreviews();
  driverPhotoPreviews.set(token, {
    driverId: `travel:${circuitId}:${pointId}`, hash, preparedBuffer: buffer,
    sourceMetadata: processed.sourceMetadata, variants: processed.variants,
    expiresAt: Date.now() + previewLifetimeMs,
  });
  const card = processed.variants.find((variant) => variant.name === '640w') ?? processed.variants[0];
  return { token, imageDataUrl: `data:image/webp;base64,${card.bytes.toString('base64')}`,
    expiresInMinutes: previewLifetimeMs / 60_000 };
}

async function saveTravelPointPhoto(buffer, metadata, circuitId, pointId) {
  if (!/^[A-Za-z0-9_-]+$/.test(circuitId) || !/^[A-Za-z0-9_-]+$/.test(pointId)) {
    throw new Error('Некорректный ID туристической точки');
  }
  const format = imageFormat(buffer, metadata.mimeType);
  const hash = createHash('sha256').update(buffer).update(`:travel-point:${pointId}`).digest('hex');
  const cachedPreview = consumeDriverPhotoPreview(metadata.previewToken, `travel:${circuitId}:${pointId}`, hash);
  if (!cachedPreview) throw new Error('Сначала создайте предпросмотр фотографии');
  const { sourceMetadata } = cachedPreview;
  const { variants } = await processTravelPointPhoto(cachedPreview.preparedBuffer, metadata.crop);
  const assetId = `travel-point-${pointId}-${hash.slice(0, 16)}`;
  const sourceId = `media-${createHash('sha256').update(metadata.sourceUrl).digest('hex').slice(0, 16)}`;
  const originalUrl = `/media/travel/points/${pointId}/original-${hash.slice(0, 16)}.${format.extension}`;
  const processed = variants.map((variant) => ({
    ...variant,
    url: `/media/travel/points/${pointId}/${variant.name}-${hash.slice(0, 16)}.webp`,
  }));
  await mkdir(path.resolve('apps', 'web', 'public', 'media', 'travel', 'points', pointId), { recursive: true });
  const outputs = [{ url: originalUrl, bytes: buffer }, ...processed.map((variant) => ({ url: variant.url, bytes: variant.bytes }))];
  const createdPaths = [];
  for (const output of outputs) {
    const outputPath = path.resolve('apps', 'web', 'public', output.url.replace(/^\/+/, ''));
    let existed = true;
    try { await access(outputPath); } catch { existed = false; }
    await writeFile(outputPath, output.bytes);
    if (!existed) createdPaths.push(outputPath);
  }
  const client = await pool.connect();
  let committed = false;
  try {
    await client.query('BEGIN');
    const point = await client.query(`SELECT poi.id FROM atlas.tourism_pois AS poi
      JOIN atlas.circuit_travel_pois AS link ON link.poi_id=poi.id
      WHERE link.circuit_id=$1 AND poi.id=$2`, [circuitId, pointId]);
    if (!point.rows.length) {
      await client.query('ROLLBACK');
      await Promise.all(createdPaths.map((item) => unlink(item).catch(() => {})));
      return null;
    }
    await client.query(`INSERT INTO atlas.data_sources (id,name,url,licence,retrieved_at,notes)
      VALUES ($1,$2,$3,$4,now(),'Источник фотографии туристической точки') ON CONFLICT (id) DO UPDATE SET
      name=EXCLUDED.name,url=EXCLUDED.url,licence=EXCLUDED.licence,retrieved_at=EXCLUDED.retrieved_at,notes=EXCLUDED.notes`,
    [sourceId, new URL(metadata.sourceUrl).hostname, metadata.sourceUrl, metadata.licence]);
    await client.query(`UPDATE atlas.media_assets SET is_primary=false
      WHERE entity_type='tourism_poi' AND entity_id=$1 AND media_type='image' AND is_primary`, [pointId]);
    const publicUrl = processed.find((variant) => variant.name === '1280w')?.url ?? processed[0].url;
    await client.query(`INSERT INTO atlas.media_assets
      (id,entity_type,entity_id,media_type,url,alt_text_ru,author,licence,source_url,is_primary,usage_role,
       source_id,provenance_type,rights_status,review_status,verified_at,usage_scope)
      VALUES ($1,'tourism_poi',$2,'image',$3,$4,$5,$6,$7,true,'travel_card',$8,'provided_by_user','verified','reviewed',now(),ARRAY['travel_card','travel_popup'])
      ON CONFLICT (id) DO UPDATE SET url=EXCLUDED.url,alt_text_ru=EXCLUDED.alt_text_ru,author=EXCLUDED.author,
       licence=EXCLUDED.licence,source_url=EXCLUDED.source_url,is_primary=true,usage_role='travel_card',source_id=EXCLUDED.source_id,
       rights_status='verified',review_status='reviewed',verified_at=now(),usage_scope=EXCLUDED.usage_scope`,
    [assetId, pointId, publicUrl, metadata.altTextRu, metadata.author, metadata.licence, metadata.sourceUrl, sourceId]);
    await client.query(`INSERT INTO atlas.media_asset_derivatives
      (id,media_asset_id,variant,url,mime_type,width_px,height_px,file_size_bytes)
      VALUES ($1,$2,'original',$3,$4,$5,$6,$7) ON CONFLICT (media_asset_id,variant) DO UPDATE SET
      url=EXCLUDED.url,mime_type=EXCLUDED.mime_type,width_px=EXCLUDED.width_px,height_px=EXCLUDED.height_px,file_size_bytes=EXCLUDED.file_size_bytes,created_at=now()`,
    [`${assetId}-original`, assetId, originalUrl, format.mimeType, sourceMetadata.width ?? null, sourceMetadata.height ?? null, buffer.length]);
    for (const variant of processed) await client.query(`INSERT INTO atlas.media_asset_derivatives
      (id,media_asset_id,variant,url,mime_type,width_px,height_px,file_size_bytes)
      VALUES ($1,$2,$3,$4,'image/webp',$5,$6,$7) ON CONFLICT (media_asset_id,variant) DO UPDATE SET
      url=EXCLUDED.url,mime_type='image/webp',width_px=EXCLUDED.width_px,height_px=EXCLUDED.height_px,file_size_bytes=EXCLUDED.file_size_bytes,created_at=now()`,
    [`${assetId}-${variant.name}`, assetId, variant.name, variant.url, variant.width, variant.height, variant.bytes.length]);
    await client.query('COMMIT');
    committed = true;
    let publicDataSynced = true;
    try { await runCircuitExports(circuitId, 'published'); }
    catch (error) { publicDataSynced = false; console.error('Фотография точки сохранена, но read-model не обновлён', error); }
    return { id: assetId, url: publicUrl, circuitId, pointId, publicDataSynced,
      variants: Object.fromEntries(processed.map((variant) => [variant.name, variant.url])) };
  } catch (error) {
    if (!committed) {
      await client.query('ROLLBACK').catch(() => {});
      await Promise.all(createdPaths.map((item) => unlink(item).catch(() => {})));
    }
    throw error;
  } finally { client.release(); }
}

async function getTravelZones(circuitId) {
  const [circuitResult, zonesResult] = await Promise.all([
    pool.query(`SELECT circuit.id, coalesce(profile.name_ru,circuit.short_name,circuit.name) AS name
      FROM atlas.circuits AS circuit LEFT JOIN atlas.circuit_page_profiles AS profile ON profile.circuit_id=circuit.id
      WHERE circuit.id=$1`, [circuitId]),
    pool.query(`SELECT zone.id,zone.zone_type,zone.name_ru,zone.priority,zone.price_band,zone.review_status,
        zone.geometry IS NOT NULL AS has_geometry,count(link.poi_id)::int AS point_count,
        count(link.poi_id) FILTER (WHERE link.is_example)::int AS example_count
      FROM atlas.travel_zones AS zone LEFT JOIN atlas.travel_zone_pois AS link ON link.zone_id=zone.id
      WHERE zone.circuit_id=$1 GROUP BY zone.id ORDER BY zone.priority DESC,lower(zone.name_ru)`, [circuitId]),
  ]);
  if (!circuitResult.rows.length) return null;
  return { circuit: { id: String(circuitResult.rows[0].id), name: String(circuitResult.rows[0].name) },
    rows: zonesResult.rows.map((row) => ({ id: String(row.id), zoneType: String(row.zone_type), nameRu: String(row.name_ru),
      priority: Number(row.priority), priceBand: row.price_band === null ? null : Number(row.price_band), reviewStatus: String(row.review_status),
      hasGeometry: Boolean(row.has_geometry), pointCount: Number(row.point_count), exampleCount: Number(row.example_count) })) };
}

async function getTravelZone(circuitId, zoneId) {
  const [zoneResult, pointsResult] = await Promise.all([
    pool.query(`SELECT zone.*,ST_AsGeoJSON(zone.geometry::geometry) AS geometry_geojson,
        presentation.sort_order,presentation.character_ru,presentation.travel_time_ru,presentation.tone,
        source.name AS source_name,source.url AS source_url
      FROM atlas.travel_zones AS zone
      LEFT JOIN atlas.circuit_travel_zone_presentations AS presentation ON presentation.zone_id=zone.id
      LEFT JOIN atlas.data_sources AS source ON source.id=zone.source_id
      WHERE zone.circuit_id=$1 AND zone.id=$2`, [circuitId, zoneId]),
    pool.query(`SELECT poi.id,coalesce(poi.name_ru,poi.name) AS name,category.name_ru AS category_name,
        existing.zone_id IS NOT NULL AS selected,coalesce(existing.is_example,false) AS is_example,
        coalesce(existing.sort_order,0)::int AS sort_order
      FROM atlas.circuit_travel_pois AS circuit_link
      JOIN atlas.tourism_pois AS poi ON poi.id=circuit_link.poi_id
      JOIN atlas.poi_categories AS category ON category.id=poi.category_id
      LEFT JOIN atlas.travel_zone_pois AS existing ON existing.poi_id=poi.id AND existing.zone_id=$2
      WHERE circuit_link.circuit_id=$1 AND category.group_id='stay' AND poi.review_status<>'hidden'
      ORDER BY existing.zone_id IS NOT NULL DESC,existing.sort_order,poi.importance DESC,lower(coalesce(poi.name_ru,poi.name))`, [circuitId, zoneId]),
  ]);
  if (!zoneResult.rows.length && zoneId === 'new') {
    const circuit = await pool.query('SELECT id FROM atlas.circuits WHERE id=$1', [circuitId]);
    if (!circuit.rows.length) return null;
    return { zone: { id: '', circuitId, zoneType: 'accommodation', name: '', nameRu: '', descriptionRu: null,
      geometryGeoJson: null, priority: 50, priceBand: null, bestFor: [], advantagesRu: [], disadvantagesRu: [],
      eventOnly: false, reviewStatus: 'candidate', sortOrder: 0, characterRu: 'Район проживания', travelTimeRu: 'Уточняется',
      tone: '#F2C14E', sourceName: null, sourceUrl: null },
      points: pointsResult.rows.map((point) => ({ id: String(point.id), name: String(point.name), categoryName: String(point.category_name),
        selected: false, isExample: false, sortOrder: 0 })) };
  }
  if (!zoneResult.rows.length) return null;
  const row = zoneResult.rows[0];
  return { zone: { id: String(row.id), circuitId: String(row.circuit_id), zoneType: String(row.zone_type), name: String(row.name),
    nameRu: String(row.name_ru), descriptionRu: row.description_ru, geometryGeoJson: row.geometry_geojson,
    priority: Number(row.priority), priceBand: row.price_band === null ? null : Number(row.price_band), bestFor: row.best_for ?? [],
    advantagesRu: row.advantages_ru ?? [], disadvantagesRu: row.disadvantages_ru ?? [], eventOnly: Boolean(row.event_only),
    reviewStatus: String(row.review_status), sortOrder: row.sort_order === null ? 0 : Number(row.sort_order),
    characterRu: row.character_ru ?? '', travelTimeRu: row.travel_time_ru ?? '', tone: row.tone ?? '#F2C14E',
    sourceName: row.source_name, sourceUrl: row.source_url },
    points: pointsResult.rows.map((point) => ({ id: String(point.id), name: String(point.name), categoryName: String(point.category_name),
      selected: Boolean(point.selected), isExample: Boolean(point.is_example), sortOrder: Number(point.sort_order) })) };
}

async function saveTravelZone(rawInput, circuitId, zoneId) {
  const text = (key) => optionalText(rawInput?.[key]);
  const zoneType = String(rawInput?.zoneType ?? ''); const reviewStatus = String(rawInput?.reviewStatus ?? '');
  const priority = Number(rawInput?.priority); const priceBand = rawInput?.priceBand === null ? null : Number(rawInput?.priceBand);
  if (!/^[A-Za-z0-9_-]+$/.test(zoneId) || !text('name') || !text('nameRu')
    || !['accommodation','parking','park_and_ride','access','restricted','walking','travel_time'].includes(zoneType)
    || !['candidate','reviewed','published','hidden'].includes(reviewStatus) || !Number.isInteger(priority) || priority < 0 || priority > 100
    || (priceBand !== null && (!Number.isInteger(priceBand) || priceBand < 1 || priceBand > 4))) throw new Error('Некорректные данные района');
  let geometry = null;
  if (text('geometryGeoJson')) {
    geometry = JSON.parse(text('geometryGeoJson'));
    if (!['Polygon','MultiPolygon'].includes(geometry?.type)) throw new Error('Граница должна быть Polygon или MultiPolygon');
  }
  if (['reviewed','published'].includes(reviewStatus) && !geometry) throw new Error('Для проверки или публикации нужна граница района');
  const sourceUrl = new URL(text('sourceUrl'));
  if (!['http:','https:'].includes(sourceUrl.protocol) || sourceUrl.username || sourceUrl.password) throw new Error('Некорректный источник');
  const sourceId = `travel-${createHash('sha256').update(sourceUrl.href).digest('hex').slice(0,16)}`;
  const selectedPoints = Array.isArray(rawInput?.selectedPoints) ? rawInput.selectedPoints.filter((id) => /^[A-Za-z0-9_-]+$/.test(id)) : [];
  const examplePoints = new Set(Array.isArray(rawInput?.examplePoints) ? rawInput.examplePoints : []);
  const tone = String(rawInput?.tone ?? ''); const sortOrder = Number(rawInput?.sortOrder);
  if (!/^#[0-9A-Fa-f]{6}$/.test(tone) || !Number.isInteger(sortOrder) || sortOrder < 0) throw new Error('Некорректное представление района');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const circuit = await client.query('SELECT id FROM atlas.circuits WHERE id=$1', [circuitId]); if (!circuit.rows.length) { await client.query('ROLLBACK'); return null; }
    const existingZone = await client.query('SELECT circuit_id FROM atlas.travel_zones WHERE id=$1', [zoneId]);
    if (existingZone.rows.length && existingZone.rows[0].circuit_id !== circuitId) throw new Error('ID района уже принадлежит другой трассе');
    await client.query(`INSERT INTO atlas.data_sources(id,name,url,retrieved_at,notes) VALUES($1,$2,$3,now(),'Источник района проживания')
      ON CONFLICT(id) DO UPDATE SET name=EXCLUDED.name,url=EXCLUDED.url,retrieved_at=now()`, [sourceId, sourceUrl.hostname, sourceUrl.href]);
    await client.query(`INSERT INTO atlas.travel_zones(id,circuit_id,zone_type,name,name_ru,description_ru,geometry,priority,price_band,best_for,advantages_ru,disadvantages_ru,event_only,source_id,review_status)
      VALUES($1,$2,$3,$4,$5,$6,CASE WHEN $7::jsonb IS NULL THEN NULL ELSE ST_Multi(ST_SetSRID(ST_GeomFromGeoJSON($7::text),4326))::geography END,$8,$9,$10,$11,$12,$13,$14,$15)
      ON CONFLICT(id) DO UPDATE SET zone_type=EXCLUDED.zone_type,name=EXCLUDED.name,name_ru=EXCLUDED.name_ru,description_ru=EXCLUDED.description_ru,
      geometry=EXCLUDED.geometry,priority=EXCLUDED.priority,price_band=EXCLUDED.price_band,best_for=EXCLUDED.best_for,advantages_ru=EXCLUDED.advantages_ru,
      disadvantages_ru=EXCLUDED.disadvantages_ru,event_only=EXCLUDED.event_only,source_id=EXCLUDED.source_id,review_status=EXCLUDED.review_status,updated_at=now()`,
    [zoneId,circuitId,zoneType,text('name'),text('nameRu'),text('descriptionRu'),geometry ? JSON.stringify(geometry) : null,priority,priceBand,
      rawInput.bestFor ?? [],rawInput.advantagesRu ?? [],rawInput.disadvantagesRu ?? [],rawInput.eventOnly === true,sourceId,reviewStatus]);
    await client.query(`INSERT INTO atlas.circuit_travel_zone_presentations(zone_id,sort_order,character_ru,travel_time_ru,tone)
      VALUES($1,$2,$3,$4,$5) ON CONFLICT(zone_id) DO UPDATE SET sort_order=EXCLUDED.sort_order,character_ru=EXCLUDED.character_ru,travel_time_ru=EXCLUDED.travel_time_ru,tone=EXCLUDED.tone`,
    [zoneId,sortOrder,text('characterRu') ?? 'Район проживания',text('travelTimeRu') ?? 'Уточняется',tone]);
    await client.query('DELETE FROM atlas.travel_zone_pois WHERE zone_id=$1', [zoneId]);
    for (const [index, poiId] of selectedPoints.entries()) await client.query(`INSERT INTO atlas.travel_zone_pois(zone_id,poi_id,is_example,sort_order)
      SELECT $1,$2,$3,$4 WHERE EXISTS(SELECT 1 FROM atlas.circuit_travel_pois WHERE circuit_id=$5 AND poi_id=$2)`,
    [zoneId,poiId,examplePoints.has(poiId),index + 1,circuitId]);
    await client.query('COMMIT');
  } catch (error) { await client.query('ROLLBACK').catch(() => {}); throw error; } finally { client.release(); }
  let publicDataSynced = true; try { await runCircuitExports(circuitId,'published'); } catch (error) { publicDataSynced=false; console.error('Район сохранён, но read-model не обновлён',error); }
  return { id: zoneId,circuitId,publicDataSynced };
}

async function getTravelAccessAnchors(circuitId) {
  const [circuitResult, anchorsResult, pointsResult] = await Promise.all([
    pool.query(`SELECT circuit.id,coalesce(profile.name_ru,circuit.short_name,circuit.name) AS name
      FROM atlas.circuits AS circuit LEFT JOIN atlas.circuit_page_profiles AS profile ON profile.circuit_id=circuit.id
      WHERE circuit.id=$1`, [circuitId]),
    pool.query(`SELECT anchor.id,anchor.poi_id,coalesce(poi.name_ru,poi.name) AS poi_name,anchor.access_kind,
      anchor.travel_modes,anchor.event_scope,anchor.valid_from_year,anchor.valid_to_year,anchor.verification_status,
      anchor.confidence,source.url AS source_url,anchor.evidence_note_ru,anchor.verified_at
      FROM atlas.travel_access_anchors AS anchor JOIN atlas.tourism_pois AS poi ON poi.id=anchor.poi_id
      LEFT JOIN atlas.data_sources AS source ON source.id=anchor.source_id
      WHERE anchor.circuit_id=$1
      ORDER BY CASE anchor.verification_status WHEN 'needs_review' THEN 0 WHEN 'candidate' THEN 1 WHEN 'verified' THEN 2 ELSE 3 END,
        anchor.confidence DESC,lower(coalesce(poi.name_ru,poi.name))`, [circuitId]),
    pool.query(`SELECT poi.id,coalesce(poi.name_ru,poi.name) AS name,category.name_ru AS category_name,poi.review_status
      FROM atlas.circuit_travel_pois AS link JOIN atlas.tourism_pois AS poi ON poi.id=link.poi_id
      JOIN atlas.poi_categories AS category ON category.id=poi.category_id
      WHERE link.circuit_id=$1
      AND (poi.review_status<>'hidden' OR EXISTS(
        SELECT 1 FROM atlas.travel_access_anchors AS hidden_anchor WHERE hidden_anchor.circuit_id=$1 AND hidden_anchor.poi_id=poi.id))
      AND ((link.role='circuit' AND poi.category_id<>'automotive_history')
        OR poi.category_id IN('circuit_access','parking','park_and_ride','event_shuttle','bus_station','railway_station')
        OR EXISTS(SELECT 1 FROM atlas.travel_access_anchors AS existing_anchor WHERE existing_anchor.circuit_id=$1 AND existing_anchor.poi_id=poi.id))
      ORDER BY CASE WHEN link.role='circuit' THEN 0 ELSE 1 END,link.priority DESC,lower(coalesce(poi.name_ru,poi.name))`, [circuitId]),
  ]);
  if (!circuitResult.rows.length) return null;
  return {
    circuit: { id: String(circuitResult.rows[0].id), name: String(circuitResult.rows[0].name) },
    rows: anchorsResult.rows.map((row) => ({
      id: String(row.id), poiId: String(row.poi_id), poiName: String(row.poi_name), accessKind: String(row.access_kind),
      travelModes: Array.isArray(row.travel_modes) ? row.travel_modes.map(String) : [], eventScope: String(row.event_scope),
      validFromYear: row.valid_from_year === null ? null : Number(row.valid_from_year), validToYear: row.valid_to_year === null ? null : Number(row.valid_to_year),
      verificationStatus: String(row.verification_status), confidence: Number(row.confidence), sourceUrl: row.source_url === null ? null : String(row.source_url),
      evidenceNoteRu: row.evidence_note_ru === null ? null : String(row.evidence_note_ru), verifiedAt: row.verified_at === null ? null : new Date(row.verified_at).toISOString(),
    })),
    pointOptions: pointsResult.rows.map((row) => ({ id: String(row.id), name: String(row.name), categoryName: String(row.category_name), reviewStatus: String(row.review_status) })),
  };
}

async function saveTravelAccessAnchor(raw, circuitId, anchorId) {
  const accessKinds = new Set(['gate', 'parking', 'dropoff', 'shuttle_stop', 'approach']);
  const allowedModes = new Set(['car', 'transit', 'shuttle', 'walk', 'bicycle', 'mixed']);
  const statuses = new Set(['candidate', 'needs_review', 'verified', 'rejected', 'expired']);
  const poiId = String(raw?.poiId ?? '').trim();
  const accessKind = String(raw?.accessKind ?? '');
  const eventScope = String(raw?.eventScope ?? '');
  const verificationStatus = String(raw?.verificationStatus ?? '');
  const travelModes = [...new Set(Array.isArray(raw?.travelModes) ? raw.travelModes.map(String) : [])];
  const confidence = Number(raw?.confidence);
  const year = (value) => value === null || value === undefined || value === '' ? null : Number(value);
  const validFromYear = year(raw?.validFromYear);
  const validToYear = year(raw?.validToYear);
  if (!/^[A-Za-z0-9_-]+$/.test(anchorId) || !/^[A-Za-z0-9_-]+$/.test(poiId) || !accessKinds.has(accessKind)
    || !['general', 'event'].includes(eventScope) || !statuses.has(verificationStatus)
    || travelModes.some((mode) => !allowedModes.has(mode)) || !Number.isInteger(confidence) || confidence < 0 || confidence > 100
    || (validFromYear !== null && (!Number.isInteger(validFromYear) || validFromYear < 1900 || validFromYear > 2100))
    || (validToYear !== null && (!Number.isInteger(validToYear) || validToYear < 1900 || validToYear > 2100))
    || (validFromYear !== null && validToYear !== null && validToYear < validFromYear)) throw new Error('Некорректные данные точки доступа');
  const rawSourceUrl = optionalText(raw?.sourceUrl);
  const sourceUrl = rawSourceUrl === null ? null : validateEditorialUrl(rawSourceUrl);
  if (verificationStatus === 'verified' && (!sourceUrl || confidence < 70 || !travelModes.length)) throw new Error('Для подтверждения нужны источник, уверенность не ниже 70% и способ передвижения');
  const sourceId = sourceUrl ? `travel-access-${createHash('sha256').update(sourceUrl).digest('hex').slice(0,16)}` : null;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const linkedPoint = await client.query(`SELECT 1 FROM atlas.circuit_travel_pois WHERE circuit_id=$1 AND poi_id=$2`, [circuitId, poiId]);
    if (!linkedPoint.rows.length) { await client.query('ROLLBACK'); return null; }
    const existing = await client.query('SELECT circuit_id FROM atlas.travel_access_anchors WHERE id=$1 FOR UPDATE', [anchorId]);
    if (existing.rows.length && existing.rows[0].circuit_id !== circuitId) throw new Error('ID точки доступа уже принадлежит другой трассе');
    if (verificationStatus !== 'verified') {
      const protectedAssignment = await client.query(`SELECT route.id FROM atlas.travel_route_access_anchors AS assignment
        JOIN atlas.travel_routes AS route ON route.id=assignment.route_id
        WHERE assignment.anchor_id=$1 AND route.review_status IN('reviewed','published') LIMIT 1`, [anchorId]);
      if (protectedAssignment.rows.length) throw new Error('Точка используется проверенным или опубликованным маршрутом и должна оставаться проверенной');
    }
    if (sourceUrl) await client.query(`INSERT INTO atlas.data_sources(id,name,url,retrieved_at,notes)
      VALUES($1,$2,$3,now(),'Источник точки доступа к трассе') ON CONFLICT(id) DO UPDATE SET name=EXCLUDED.name,url=EXCLUDED.url,retrieved_at=now()`,
    [sourceId, new URL(sourceUrl).hostname, sourceUrl]);
    await client.query(`INSERT INTO atlas.travel_access_anchors(id,circuit_id,poi_id,access_kind,travel_modes,event_scope,valid_from_year,valid_to_year,
      verification_status,confidence,source_id,evidence_note_ru,verified_at)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,CASE WHEN $9='verified' THEN now() ELSE NULL END)
      ON CONFLICT(id) DO UPDATE SET poi_id=EXCLUDED.poi_id,access_kind=EXCLUDED.access_kind,travel_modes=EXCLUDED.travel_modes,event_scope=EXCLUDED.event_scope,
      valid_from_year=EXCLUDED.valid_from_year,valid_to_year=EXCLUDED.valid_to_year,verification_status=EXCLUDED.verification_status,confidence=EXCLUDED.confidence,
      source_id=EXCLUDED.source_id,evidence_note_ru=EXCLUDED.evidence_note_ru,verified_at=EXCLUDED.verified_at`,
    [anchorId,circuitId,poiId,accessKind,travelModes,eventScope,validFromYear,validToYear,verificationStatus,confidence,sourceId,optionalText(raw?.evidenceNoteRu)]);
    await client.query('COMMIT');
    return { id: anchorId, circuitId };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally { client.release(); }
}

async function getTravelRoutes(circuitId) {
  const [circuitResult,routesResult]=await Promise.all([
    pool.query(`SELECT circuit.id,coalesce(profile.name_ru,circuit.short_name,circuit.name) AS name FROM atlas.circuits AS circuit LEFT JOIN atlas.circuit_page_profiles AS profile ON profile.circuit_id=circuit.id WHERE circuit.id=$1`,[circuitId]),
    pool.query(`SELECT route.id,route.name_ru,route.route_type,route.travel_mode,route.distance_m,route.duration_minutes,route.review_status,
      route.route_variant_kind,route.lifecycle,route.display_priority,
      route.geometry IS NOT NULL AS has_geometry,count(stop.sequence)::int AS stop_count,presentation.visible_by_default
      FROM atlas.travel_routes AS route LEFT JOIN atlas.travel_route_stops AS stop ON stop.route_id=route.id
      LEFT JOIN atlas.travel_route_presentations AS presentation ON presentation.route_id=route.id
      WHERE route.circuit_id=$1 GROUP BY route.id,presentation.visible_by_default,presentation.sort_order ORDER BY coalesce(presentation.sort_order,999),route.name_ru`,[circuitId]),
  ]);
  if(!circuitResult.rows.length)return null;
  return {circuit:{id:String(circuitResult.rows[0].id),name:String(circuitResult.rows[0].name)},rows:routesResult.rows.map(row=>({
    id:String(row.id),nameRu:String(row.name_ru),routeType:String(row.route_type),travelMode:String(row.travel_mode),distanceM:Number(row.distance_m),
    durationMinutes:Number(row.duration_minutes),reviewStatus:String(row.review_status),hasGeometry:Boolean(row.has_geometry),stopCount:Number(row.stop_count),visibleByDefault:Boolean(row.visible_by_default),
    routeVariantKind:String(row.route_variant_kind),lifecycle:String(row.lifecycle),displayPriority:Number(row.display_priority)
  }))};
}

async function getTravelRoute(circuitId,routeId){
  const [routeResult,stopsResult,pointsResult,accessAnchorsResult,circuitResult,mapPointsResult,existingRoutesResult]=await Promise.all([
    pool.query(`SELECT route.*,route.updated_at::text AS updated_at_token,ST_AsGeoJSON(route.geometry::geometry) AS geometry_geojson,source.url AS source_url,
      presentation.route_group,presentation.sort_order,presentation.line_offset_px,presentation.line_colour,presentation.min_zoom,presentation.max_zoom,
      presentation.visible_by_default,presentation.notes_ru,presentation.rationale_ru,presentation.highlights_ru,presentation.practical_notes_ru,
      access_assignment.anchor_id AS terminal_access_anchor_id
      FROM atlas.travel_routes AS route LEFT JOIN atlas.data_sources AS source ON source.id=route.source_id
      LEFT JOIN atlas.travel_route_presentations AS presentation ON presentation.route_id=route.id
      LEFT JOIN atlas.travel_route_access_anchors AS access_assignment ON access_assignment.route_id=route.id
      WHERE route.circuit_id=$1 AND route.id=$2`,[circuitId,routeId]),
    pool.query(`SELECT stop.sequence,stop.poi_id,stop.name_ru,stop.dwell_minutes,stop.instruction_ru,
      CASE WHEN stop.location IS NULL THEN NULL ELSE ST_X(stop.location::geometry) END AS longitude,
      CASE WHEN stop.location IS NULL THEN NULL ELSE ST_Y(stop.location::geometry) END AS latitude,
      ST_X((CASE WHEN stop.poi_id IS NOT NULL THEN poi.location ELSE stop.location END)::geometry) AS resolved_longitude,
      ST_Y((CASE WHEN stop.poi_id IS NOT NULL THEN poi.location ELSE stop.location END)::geometry) AS resolved_latitude,
      coalesce(poi.name_ru,poi.name) AS poi_name FROM atlas.travel_route_stops AS stop
      LEFT JOIN atlas.tourism_pois AS poi ON poi.id=stop.poi_id WHERE stop.route_id=$1 ORDER BY stop.sequence`,[routeId]),
    pool.query(`SELECT poi.id,coalesce(poi.name_ru,poi.name) AS name FROM atlas.circuit_travel_pois AS link
      JOIN atlas.tourism_pois AS poi ON poi.id=link.poi_id WHERE link.circuit_id=$1 AND poi.review_status<>'hidden'
      AND (link.is_featured OR poi.review_status IN('reviewed','published') OR EXISTS(
        SELECT 1 FROM atlas.travel_route_stops AS stop WHERE stop.route_id=$2 AND stop.poi_id=poi.id))
      ORDER BY lower(coalesce(poi.name_ru,poi.name))`,[circuitId,routeId]),
    pool.query(`SELECT anchor.id,anchor.poi_id,coalesce(poi.name_ru,poi.name) AS poi_name,anchor.access_kind,anchor.event_scope,
      anchor.verification_status,anchor.confidence
      FROM atlas.travel_access_anchors AS anchor JOIN atlas.tourism_pois AS poi ON poi.id=anchor.poi_id
      LEFT JOIN atlas.travel_route_access_anchors AS selected ON selected.anchor_id=anchor.id AND selected.route_id=$2
      WHERE anchor.circuit_id=$1 AND (anchor.verification_status NOT IN('rejected','expired') OR selected.route_id IS NOT NULL)
      ORDER BY CASE anchor.verification_status WHEN 'verified' THEN 0 WHEN 'needs_review' THEN 1 ELSE 2 END,
        anchor.confidence DESC,lower(coalesce(poi.name_ru,poi.name))`,[circuitId,routeId]),
    pool.query(`SELECT ST_X(location::geometry) AS longitude,ST_Y(location::geometry) AS latitude FROM atlas.circuits WHERE id=$1`,[circuitId]),
    pool.query(`SELECT poi.id,coalesce(poi.name_ru,poi.name) AS name,poi.review_status,
      ST_X(poi.location::geometry) AS longitude,ST_Y(poi.location::geometry) AS latitude
      FROM atlas.circuit_travel_pois AS link JOIN atlas.tourism_pois AS poi ON poi.id=link.poi_id
      WHERE link.circuit_id=$1 AND poi.location IS NOT NULL
        AND NOT ST_IsEmpty(poi.location::geometry) AND ST_IsValid(poi.location::geometry)
      ORDER BY lower(coalesce(poi.name_ru,poi.name)),poi.id`,[circuitId]),
    pool.query(`SELECT route.id,route.name_ru,route.review_status,route.lifecycle,
      ST_AsGeoJSON(route.geometry::geometry) AS geometry_geojson
      FROM atlas.travel_routes AS route
      WHERE route.circuit_id=$1 AND route.lifecycle<>'archived' AND route.geometry IS NOT NULL
        AND NOT ST_IsEmpty(route.geometry::geometry)
      ORDER BY lower(route.name_ru),route.id`,[circuitId]),
  ]);
  if(!circuitResult.rows.length)return null;
  const circuitRow=circuitResult.rows[0];
  const mapCenter=circuitRow.longitude===null||circuitRow.latitude===null?null:[Number(circuitRow.longitude),Number(circuitRow.latitude)];
  const mapPoints=mapPointsResult.rows.map(point=>({id:String(point.id),name:String(point.name),reviewStatus:String(point.review_status),
    longitude:Number(point.longitude),latitude:Number(point.latitude)}));
  const existingRoutes=existingRoutesResult.rows.map(route=>({id:String(route.id),nameRu:String(route.name_ru),reviewStatus:String(route.review_status),
    lifecycle:String(route.lifecycle),geometryGeoJson:String(route.geometry_geojson)}));
  if(!routeResult.rows.length&&routeId==='new')return {mapCenter,route:{id:'',circuitId,routeType:'arrival',travelMode:'car',name:'',nameRu:'',summaryRu:'',geometryGeoJson:null,
    distanceM:1,durationMinutes:1,difficulty:'easy',eventOnly:false,bookingRequired:false,accessibilityNotesRu:'',scheduleNotesRu:'',routeEngine:'',routeEngineProfile:'',
    reviewStatus:'candidate',sourceUrl:'',routeGroup:`${circuitId}-arrival`,sortOrder:0,lineOffsetPx:0,lineColour:'#FF3158',minZoom:7,maxZoom:18,visibleByDefault:false,
    notesRu:'',rationaleRu:'',highlightsRu:[],practicalNotesRu:'',terminalAccessAnchorId:null,routeVariantKind:'recommended',displayPriority:100,geometryMode:'routed',lifecycle:'draft',optimizeWaypointOrder:false,updatedAtToken:''},stops:[],pointOptions:pointsResult.rows.map(point=>({id:String(point.id),name:String(point.name)})),mapPoints,existingRoutes,
    accessAnchorOptions:accessAnchorsResult.rows.map(anchor=>({id:String(anchor.id),poiId:String(anchor.poi_id),poiName:String(anchor.poi_name),accessKind:String(anchor.access_kind),eventScope:String(anchor.event_scope),verificationStatus:String(anchor.verification_status),confidence:Number(anchor.confidence)}))};
  if(!routeResult.rows.length)return null;const row=routeResult.rows[0];
  return {mapCenter,route:{id:String(row.id),circuitId:String(row.circuit_id),routeType:String(row.route_type),travelMode:String(row.travel_mode),name:String(row.name),nameRu:String(row.name_ru),
    summaryRu:row.summary_ru??'',geometryGeoJson:row.geometry_geojson,distanceM:Number(row.distance_m),durationMinutes:Number(row.duration_minutes),difficulty:String(row.difficulty),
    eventOnly:Boolean(row.event_only),bookingRequired:Boolean(row.booking_required),accessibilityNotesRu:row.accessibility_notes_ru??'',scheduleNotesRu:row.schedule_notes_ru??'',
    routeEngine:row.route_engine??'',routeEngineProfile:row.route_engine_profile??'',reviewStatus:String(row.review_status),sourceUrl:row.source_url??'',routeGroup:row.route_group??row.route_type,
    sortOrder:Number(row.sort_order??0),lineOffsetPx:Number(row.line_offset_px??0),lineColour:row.line_colour??'#FF3158',minZoom:Number(row.min_zoom??7),maxZoom:Number(row.max_zoom??18),
    visibleByDefault:Boolean(row.visible_by_default),notesRu:row.notes_ru??'',rationaleRu:row.rationale_ru??'',highlightsRu:row.highlights_ru??[],practicalNotesRu:row.practical_notes_ru??'',
    terminalAccessAnchorId:row.terminal_access_anchor_id??null,routeVariantKind:String(row.route_variant_kind),displayPriority:Number(row.display_priority),geometryMode:String(row.geometry_mode),
    lifecycle:String(row.lifecycle),optimizeWaypointOrder:Boolean(row.optimize_waypoint_order),updatedAtToken:String(row.updated_at_token)},
    stops:stopsResult.rows.map(stop=>({sequence:Number(stop.sequence),poiId:stop.poi_id,poiName:stop.poi_name,nameRu:stop.name_ru,dwellMinutes:stop.dwell_minutes,
      instructionRu:stop.instruction_ru,longitude:stop.longitude===null?null:Number(stop.longitude),latitude:stop.latitude===null?null:Number(stop.latitude),
      resolvedLongitude:stop.resolved_longitude===null?null:Number(stop.resolved_longitude),resolvedLatitude:stop.resolved_latitude===null?null:Number(stop.resolved_latitude)})),
    pointOptions:pointsResult.rows.map(point=>({id:String(point.id),name:String(point.name)})),
    mapPoints,existingRoutes,
    accessAnchorOptions:accessAnchorsResult.rows.map(anchor=>({id:String(anchor.id),poiId:String(anchor.poi_id),poiName:String(anchor.poi_name),accessKind:String(anchor.access_kind),eventScope:String(anchor.event_scope),verificationStatus:String(anchor.verification_status),confidence:Number(anchor.confidence)}))};
}

async function saveTravelRoute(raw,circuitId,routeId,options={}){
  const text=key=>optionalText(raw?.[key]);const routeType=String(raw?.routeType??''),travelMode=String(raw?.travelMode??'');let status=String(raw?.reviewStatus??'');
  const terminalAccessAnchorId=text('terminalAccessAnchorId');
  const routeVariantKind=String(raw?.routeVariantKind??''),geometryMode=String(raw?.geometryMode??'');let lifecycle=String(raw?.lifecycle??'');
  const displayPriority=Number(raw?.displayPriority);
  const distanceM=Number(raw?.distanceM),duration=Number(raw?.durationMinutes),difficulty=String(raw?.difficulty??'');
  if(!/^[A-Za-z0-9_-]+$/.test(routeId)||!text('name')||!text('nameRu')||!['arrival','race_day','event_shuttle','park_and_ride','tourist_half_day','tourist_full_day','walking','scenic_drive'].includes(routeType)
    ||!['car','transit','shuttle','walk','bicycle','mixed'].includes(travelMode)||!['candidate','reviewed','published','hidden'].includes(status)||!['easy','moderate','difficult'].includes(difficulty)
    ||!Number.isInteger(distanceM)||distanceM<1||!Number.isInteger(duration)||duration<1
    ||(terminalAccessAnchorId&&!/^[A-Za-z0-9_-]+$/.test(terminalAccessAnchorId))
    ||!['recommended','fastest','shortest','loop','manual'].includes(routeVariantKind)||!['routed','waypoints','freehand'].includes(geometryMode)
    ||!['draft','active','archived'].includes(lifecycle)||!Number.isInteger(displayPriority)||displayPriority<0||displayPriority>100
    ||(routeVariantKind==='loop'&&displayPriority>49))throw new Error('Некорректные данные маршрута');
  let geometry=null;if(text('geometryGeoJson')){
    geometry=JSON.parse(text('geometryGeoJson'));
    if(geometry?.type!=='LineString'||!Array.isArray(geometry.coordinates)||geometry.coordinates.length<2
      ||geometry.coordinates.some(point=>!Array.isArray(point)||point.length!==2||!Number.isFinite(point[0])||!Number.isFinite(point[1])
        ||point[0]< -180||point[0]>180||point[1]< -90||point[1]>90)
      ||!geometry.coordinates.some(point=>point[0]!==geometry.coordinates[0][0]||point[1]!==geometry.coordinates[0][1]))
      throw new Error('Маршрут должен содержать минимум две различные корректные координаты [долгота, широта]');
  }
  const sourceUrl=new URL(text('sourceUrl'));if(!['http:','https:'].includes(sourceUrl.protocol)||sourceUrl.username||sourceUrl.password)throw new Error('Некорректный источник');
  const colour=String(raw?.lineColour??''),minZoom=Number(raw?.minZoom),maxZoom=Number(raw?.maxZoom),offset=Number(raw?.lineOffsetPx),sortOrder=Number(raw?.sortOrder);
  if(!/^#[0-9A-Fa-f]{6}$/.test(colour)||!Number.isFinite(minZoom)||!Number.isFinite(maxZoom)||minZoom<0||maxZoom>24||maxZoom<minZoom||!Number.isFinite(offset)||offset< -24||offset>24||!Number.isInteger(sortOrder)||sortOrder<0)throw new Error('Некорректное отображение маршрута');
  const sourceId=`travel-${createHash('sha256').update(sourceUrl.href).digest('hex').slice(0,16)}`;const ownsTransaction=!options.client;const client=options.client??await pool.connect();
  try{if(ownsTransaction)await client.query('BEGIN');await client.query('SELECT pg_advisory_xact_lock(hashtext($1))',[`route-generation:${circuitId}`]);await client.query('SELECT pg_advisory_xact_lock(hashtext($1))',[routeId]);const circuit=await client.query('SELECT id FROM atlas.circuits WHERE id=$1',[circuitId]);if(!circuit.rows.length){if(ownsTransaction)await client.query('ROLLBACK');return null;}
    const existing=await client.query('SELECT circuit_id,lifecycle,travel_mode,geometry_mode,distance_m,duration_minutes,updated_at::text AS updated_at_token,ST_AsGeoJSON(geometry::geometry) AS geometry_geojson FROM atlas.travel_routes WHERE id=$1',[routeId]);if(existing.rows.length&&existing.rows[0].circuit_id!==circuitId)throw new Error('ID маршрута принадлежит другой трассе');
    if(existing.rows.length&&raw?.createOnly===true){if(ownsTransaction)await client.query('ROLLBACK');return{id:routeId,circuitId,publicDataSynced:true,created:false};}
    const expectedUpdatedAt=String(raw?.expectedUpdatedAt??'');
    if(raw?.createOnly!==true){
      if(existing.rows.length&&(!expectedUpdatedAt||existing.rows[0].updated_at_token!==expectedUpdatedAt))throw new Error('Маршрут изменился. Обновите страницу и повторите сохранение');
      if(!existing.rows.length&&expectedUpdatedAt)throw new Error('Маршрут удалён. Обновите список маршрутов');
      if(existing.rows.length&&existing.rows[0].lifecycle==='archived')throw new Error('Восстановите архивный маршрут перед редактированием');
    }
    const previousGeometry=existing.rows.length&&existing.rows[0].geometry_geojson?JSON.parse(existing.rows[0].geometry_geojson):null;
    const geometryChanged=existing.rows.length?JSON.stringify(previousGeometry)!==JSON.stringify(geometry):raw?.geometryModified===true;
    const routeSemanticsChanged=existing.rows.length&&(existing.rows[0].travel_mode!==travelMode||existing.rows[0].geometry_mode!==geometryMode
      ||Number(existing.rows[0].distance_m)!==distanceM||Number(existing.rows[0].duration_minutes)!==duration);
    const stops=(Array.isArray(raw?.stops)?raw.stops:[]).map((stop,index)=>normalizeTravelRouteStop(stop,index+1));
    const previousStops=existing.rows.length?await client.query(`SELECT sequence,poi_id AS "poiId",name_ru AS "nameRu",
      ST_X(location::geometry) AS longitude,ST_Y(location::geometry) AS latitude,
      dwell_minutes AS "dwellMinutes",instruction_ru AS "instructionRu"
      FROM atlas.travel_route_stops WHERE route_id=$1 ORDER BY sequence`,[routeId]):null;
    const stopsChanged=existing.rows.length&&travelRouteStopsChanged(
      previousStops.rows.map(stop=>normalizeTravelRouteStop(stop,Number(stop.sequence))),stops);
    if(travelMode!=='car'&&geometryMode==='routed'&&(!existing.rows.length||geometryChanged||existing.rows[0].travel_mode!==travelMode))throw new Error('Дорожный расчёт доступен только для автомобильного маршрута; для другого способа выберите опорные точки или ручную линию');
    if(geometryChanged||routeSemanticsChanged||stopsChanged){
      if(existing.rows[0]?.lifecycle==='archived')throw new Error('Сначала верните маршрут из архива');
      status='candidate';lifecycle='draft';
    }
    if(['reviewed','published'].includes(status)&&!geometry)throw new Error('Для проверки или публикации нужна линия маршрута');
    if(terminalAccessAnchorId){const anchor=await client.query('SELECT circuit_id,verification_status FROM atlas.travel_access_anchors WHERE id=$1 FOR SHARE',[terminalAccessAnchorId]);
      if(!anchor.rows.length||anchor.rows[0].circuit_id!==circuitId)throw new Error('Точка доступа не относится к выбранной трассе');
      if(['rejected','expired'].includes(anchor.rows[0].verification_status)){const unchanged=await client.query('SELECT 1 FROM atlas.travel_route_access_anchors WHERE route_id=$1 AND anchor_id=$2',[routeId,terminalAccessAnchorId]);
        if(!unchanged.rows.length)throw new Error('Отклонённую или устаревшую точку нельзя назначить маршруту');}
      if(['reviewed','published'].includes(status)&&anchor.rows[0].verification_status!=='verified')throw new Error('Для проверенного маршрута конечная точка доступа должна быть проверена');}
    await client.query(`INSERT INTO atlas.data_sources(id,name,url,retrieved_at,notes)VALUES($1,$2,$3,now(),'Источник туристического маршрута')ON CONFLICT(id)DO UPDATE SET name=EXCLUDED.name,url=EXCLUDED.url,retrieved_at=now()`,[sourceId,sourceUrl.hostname,sourceUrl.href]);
    await client.query(`INSERT INTO atlas.travel_routes(id,circuit_id,route_type,travel_mode,name,name_ru,summary_ru,geometry,distance_m,duration_minutes,difficulty,event_only,booking_required,
      accessibility_notes_ru,schedule_notes_ru,source_id,route_engine,route_engine_profile,review_status,verified_at,route_variant_kind,display_priority,geometry_mode,lifecycle,archived_at,optimize_waypoint_order,optimization_metadata)
      VALUES($1,$2,$3,$4,$5,$6,$7,CASE WHEN $8::jsonb IS NULL THEN NULL ELSE ST_SetSRID(ST_GeomFromGeoJSON($8::text),4326)::geography END,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,
      CASE WHEN $19 IN('reviewed','published')THEN now() ELSE NULL END,$20,$21,$22,$23,CASE WHEN $23='archived' THEN now() ELSE NULL END,$24,$25::jsonb)
      ON CONFLICT(id)DO UPDATE SET route_type=EXCLUDED.route_type,travel_mode=EXCLUDED.travel_mode,name=EXCLUDED.name,name_ru=EXCLUDED.name_ru,summary_ru=EXCLUDED.summary_ru,geometry=EXCLUDED.geometry,
      distance_m=EXCLUDED.distance_m,duration_minutes=EXCLUDED.duration_minutes,difficulty=EXCLUDED.difficulty,event_only=EXCLUDED.event_only,booking_required=EXCLUDED.booking_required,
      accessibility_notes_ru=EXCLUDED.accessibility_notes_ru,schedule_notes_ru=EXCLUDED.schedule_notes_ru,source_id=EXCLUDED.source_id,route_engine=EXCLUDED.route_engine,
      route_engine_profile=EXCLUDED.route_engine_profile,review_status=EXCLUDED.review_status,verified_at=EXCLUDED.verified_at,route_variant_kind=EXCLUDED.route_variant_kind,
      display_priority=EXCLUDED.display_priority,geometry_mode=EXCLUDED.geometry_mode,lifecycle=EXCLUDED.lifecycle,
      archived_at=CASE WHEN EXCLUDED.lifecycle='archived' THEN coalesce(travel_routes.archived_at,now()) ELSE NULL END,
      optimize_waypoint_order=EXCLUDED.optimize_waypoint_order,
      optimization_metadata=coalesce(travel_routes.optimization_metadata,'{}'::jsonb)||jsonb_build_object('requested',EXCLUDED.optimize_waypoint_order),updated_at=now()`,
    [routeId,circuitId,routeType,travelMode,text('name'),text('nameRu'),text('summaryRu'),geometry?JSON.stringify(geometry):null,distanceM,duration,difficulty,raw?.eventOnly===true,raw?.bookingRequired===true,text('accessibilityNotesRu'),text('scheduleNotesRu'),sourceId,text('routeEngine'),text('routeEngineProfile'),status,
      routeVariantKind,displayPriority,geometryMode,lifecycle,raw?.optimizeWaypointOrder===true,JSON.stringify({requested:Boolean(raw?.optimizeWaypointOrder)})]);
    if(terminalAccessAnchorId)await client.query(`INSERT INTO atlas.travel_route_access_anchors(route_id,anchor_id)VALUES($1,$2)
      ON CONFLICT(route_id)DO UPDATE SET anchor_id=EXCLUDED.anchor_id,updated_at=now()`,[routeId,terminalAccessAnchorId]);
    else await client.query('DELETE FROM atlas.travel_route_access_anchors WHERE route_id=$1',[routeId]);
    await client.query(`INSERT INTO atlas.travel_route_presentations(route_id,route_group,sort_order,line_offset_px,line_colour,min_zoom,max_zoom,visible_by_default,notes_ru,rationale_ru,highlights_ru,practical_notes_ru)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)ON CONFLICT(route_id)DO UPDATE SET route_group=EXCLUDED.route_group,sort_order=EXCLUDED.sort_order,line_offset_px=EXCLUDED.line_offset_px,
      line_colour=EXCLUDED.line_colour,min_zoom=EXCLUDED.min_zoom,max_zoom=EXCLUDED.max_zoom,visible_by_default=EXCLUDED.visible_by_default,notes_ru=EXCLUDED.notes_ru,
      rationale_ru=EXCLUDED.rationale_ru,highlights_ru=EXCLUDED.highlights_ru,practical_notes_ru=EXCLUDED.practical_notes_ru,updated_at=now()`,
    [routeId,text('routeGroup')??routeType,sortOrder,offset,colour,minZoom,maxZoom,raw?.visibleByDefault===true,text('notesRu'),text('rationaleRu'),raw?.highlightsRu??[],text('practicalNotesRu')]);
    await client.query('DELETE FROM atlas.travel_route_stops WHERE route_id=$1',[routeId]);
    for(const stop of stops){
      if(stop.poiId){const linked=await client.query('SELECT 1 FROM atlas.circuit_travel_pois WHERE circuit_id=$1 AND poi_id=$2',[circuitId,stop.poiId]);if(!linked.rows.length)throw new Error('Остановка не относится к выбранной трассе');}
      await client.query(`INSERT INTO atlas.travel_route_stops(route_id,sequence,poi_id,name_ru,location,dwell_minutes,instruction_ru)
        VALUES($1,$2,$3,$4,CASE WHEN $5::float8 IS NULL OR $6::float8 IS NULL THEN NULL ELSE ST_SetSRID(ST_MakePoint($5,$6),4326)::geography END,$7,$8)`,
      [routeId,stop.sequence,stop.poiId,stop.nameRu,stop.longitude,stop.latitude,stop.dwellMinutes,stop.instructionRu]);
    }
    if(ownsTransaction)await client.query('COMMIT');}catch(error){if(ownsTransaction)await client.query('ROLLBACK').catch(()=>{});throw error;}finally{if(ownsTransaction)client.release();}
  if(!ownsTransaction)return{id:routeId,circuitId,publicDataSynced:false,created:true};
  let publicDataSynced=true;try{await runCircuitExports(circuitId,'published');}catch(error){publicDataSynced=false;console.error('Маршрут сохранён, но read-model не обновлён',error);}return{id:routeId,circuitId,publicDataSynced,created:true};
}

async function changeTravelRouteLifecycle(circuitId,routeId,raw) {
  const operation=String(raw?.operation??''),expectedUpdatedAt=String(raw?.expectedUpdatedAt??'');
  if(!['archive','restore'].includes(operation)||!expectedUpdatedAt)throw new Error('Некорректное действие с маршрутом');
  const client=await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))',[routeId]);
    const current=await client.query('SELECT lifecycle,updated_at::text AS updated_at_token FROM atlas.travel_routes WHERE id=$1 AND circuit_id=$2 FOR UPDATE',[routeId,circuitId]);
    if(!current.rows.length){await client.query('ROLLBACK');return null;}
    if(current.rows[0].updated_at_token!==expectedUpdatedAt)throw new Error('Маршрут изменился. Обновите страницу и повторите действие');
    if(operation==='restore'&&current.rows[0].lifecycle!=='archived')throw new Error('В черновики можно вернуть только архивный маршрут');
    if(operation==='archive'&&current.rows[0].lifecycle==='archived')throw new Error('Маршрут уже находится в архиве');
    const lifecycle=operation==='archive'?'archived':'draft';
    await client.query(`UPDATE atlas.travel_routes SET lifecycle=$3,archived_at=CASE WHEN $3='archived' THEN now() ELSE NULL END,updated_at=now()
      WHERE id=$1 AND circuit_id=$2`,[routeId,circuitId,lifecycle]);
    await client.query('COMMIT');
  } catch(error){await client.query('ROLLBACK').catch(()=>{});throw error;}finally{client.release();}
  let publicDataSynced=true;try{await runCircuitExports(circuitId,'published');}catch(error){publicDataSynced=false;console.error('Жизненный цикл маршрута изменён, но read-model не обновлён',error);}
  return{id:routeId,circuitId,publicDataSynced};
}

async function deleteArchivedTravelRoute(circuitId,routeId,raw) {
  if(String(raw?.confirmRouteId??'')!==routeId||!String(raw?.expectedUpdatedAt??''))throw new Error('Для удаления введите точный ID маршрута');
  const client=await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))',[routeId]);
    const current=await client.query('SELECT lifecycle,updated_at::text AS updated_at_token FROM atlas.travel_routes WHERE id=$1 AND circuit_id=$2 FOR UPDATE',[routeId,circuitId]);
    if(!current.rows.length){await client.query('ROLLBACK');return null;}
    if(current.rows[0].lifecycle!=='archived')throw new Error('Удалить можно только маршрут из архива');
    if(current.rows[0].updated_at_token!==raw.expectedUpdatedAt)throw new Error('Маршрут изменился. Обновите страницу и повторите действие');
    await client.query('DELETE FROM atlas.travel_routes WHERE id=$1 AND circuit_id=$2',[routeId,circuitId]);
    await client.query('COMMIT');
  } catch(error){await client.query('ROLLBACK').catch(()=>{});throw error;}finally{client.release();}
  let publicDataSynced=true;try{await runCircuitExports(circuitId,'published');}catch(error){publicDataSynced=false;console.error('Архивный маршрут удалён, но read-model не обновлён',error);}
  return{id:routeId,circuitId,publicDataSynced};
}

function routePointDistance(left, right) {
  const radians = value => value * Math.PI / 180;
  const latitudeDelta = radians(right.latitude - left.latitude);
  const longitudeDelta = radians(right.longitude - left.longitude);
  const latitude1 = radians(left.latitude);
  const latitude2 = radians(right.latitude);
  const value = Math.sin(latitudeDelta / 2) ** 2
    + Math.cos(latitude1) * Math.cos(latitude2) * Math.sin(longitudeDelta / 2) ** 2;
  return 6371000 * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value));
}

function selectDiverseRoutePoints(points, count, maximumDistanceM) {
  const selected = [];
  for (const point of points) {
    if (point.distanceToCircuitM > maximumDistanceM) continue;
    if (selected.some(existing => routePointDistance(existing, point) < 1200)) continue;
    selected.push(point);
    if (selected.length >= count) break;
  }
  return selected;
}

async function fetchGeneratedRoadRoute(points) {
  const url = buildOsrmRequestUrl(osrmBaseUrl, 'route', 'driving', points.map(point => [point.longitude, point.latitude]), {
    overview: 'full', geometries: 'geojson', steps: 'false',
  });
  const payload = await requestOsrmJson(url, {
    baseUrl: osrmBaseUrl, userAgent: 'F1-Geovisual-Atlas/0.1 (admin route draft generator)',
  });
  if (payload.code !== 'Ok' || !payload.routes?.[0]) throw new Error(`OSRM: ${payload.code ?? 'нет маршрута'}`);
  return payload.routes[0];
}

async function fetchGeneratedRoadAlternatives(points) {
  const url = buildOsrmRequestUrl(osrmBaseUrl, 'route', 'driving', points.map(point => [point.longitude, point.latitude]), {
    alternatives: '3', overview: 'full', geometries: 'geojson', steps: 'false',
  });
  const payload = await requestOsrmJson(url, {
    baseUrl: osrmBaseUrl, userAgent: 'F1-Geovisual-Atlas/0.1 (admin route alternatives)',
  });
  if (payload.code !== 'Ok' || !Array.isArray(payload.routes) || !payload.routes.length) throw new Error(`OSRM: ${payload.code ?? 'нет маршрута'}`);
  return payload.routes.filter(route => route?.geometry?.type === 'LineString'
    && Array.isArray(route.geometry.coordinates) && route.geometry.coordinates.length >= 2
    && Number.isFinite(route.distance) && Number.isFinite(route.duration));
}

async function fetchOptimizedGeneratedRoadRoute(points) {
  const url = buildOsrmRequestUrl(osrmBaseUrl, 'trip', 'driving', points.map(point => [point.longitude, point.latitude]), {
    source: 'first', destination: 'last', roundtrip: 'false', overview: 'full', geometries: 'geojson', steps: 'false',
  });
  const payload = await requestOsrmJson(url, {
    baseUrl: osrmBaseUrl, userAgent: 'F1-Geovisual-Atlas/0.1 (admin route draft optimizer)',
  });
  if (payload.code !== 'Ok' || payload.trips?.length !== 1 || payload.waypoints?.length !== points.length
    || payload.waypoints.some(waypoint => Number(waypoint?.trips_index) !== 0)) throw new Error(`OSRM: ${payload.code ?? 'маршрут состоит из несвязанных частей'}`);
  const waypointOrder = payload.waypoints.map(waypoint => Number(waypoint?.waypoint_index));
  if (new Set(waypointOrder).size !== points.length || waypointOrder.some(value => !Number.isInteger(value) || value < 0 || value >= points.length)
    || waypointOrder[0] !== 0 || waypointOrder[points.length-1] !== points.length-1) throw new Error('OSRM вернул некорректный порядок точек');
  const orderedPoints = points.map((point,index) => ({ point,order:waypointOrder[index] }))
    .sort((left,right) => left.order-right.order).map(item => item.point);
  return { route:payload.trips[0],orderedPoints };
}

async function fetchTailRoadRoute(coordinates, travelMode) {
  const profiles = { car: 'driving' };
  const profile = profiles[travelMode];
  if (!profile) throw new Error('Этот маршрутизатор пока поддерживает только автомобильный профиль');
  const url = buildOsrmRequestUrl(osrmBaseUrl, 'route', profile, coordinates, {
    overview: 'full', geometries: 'geojson', steps: 'false',
  });
  const payload = await requestOsrmJson(url, {
    baseUrl: osrmBaseUrl, userAgent: 'F1-Geovisual-Atlas/0.1 (admin route tail preview)',
  });
  if (payload.code !== 'Ok' || !payload.routes?.[0]?.geometry) throw new Error(`OSRM: ${payload.code ?? 'маршрут не построен'}`);
  return payload.routes[0];
}

async function previewTravelRouteGeometry(circuitId,routeId,raw) {
  const points=Array.isArray(raw?.points)?raw.points:[];
  if(points.length<2||points.length>20||raw?.travelMode!=='car')throw new Error('Для расчёта по дорогам выберите от 2 до 20 точек и автомобильный способ передвижения');
  if(points.some(point=>!Array.isArray(point)||point.length!==2||point.some(value=>typeof value!=='number'||!Number.isFinite(value))))throw new Error('Некорректные координаты маршрута');
  const coordinates=points.map(point=>[Number(point?.[0]),Number(point?.[1])]);
  if(coordinates.some(([longitude,latitude])=>!Number.isFinite(longitude)||!Number.isFinite(latitude)||longitude< -180||longitude>180||latitude< -90||latitude>90))throw new Error('Некорректные координаты маршрута');
  const circuit=await pool.query('SELECT 1 FROM atlas.circuits WHERE id=$1',[circuitId]);
  if(!circuit.rows.length)return null;
  if(routeId!=='new'){
    const route=await pool.query('SELECT 1 FROM atlas.travel_routes WHERE id=$1 AND circuit_id=$2 AND lifecycle<>\'archived\'',[routeId,circuitId]);
    if(!route.rows.length)return null;
  }
  const result=await fetchTailRoadRoute(coordinates,'car');
  if(result.geometry?.type!=='LineString'||!Array.isArray(result.geometry.coordinates)||result.geometry.coordinates.length<2
    ||!Number.isFinite(result.distance)||!Number.isFinite(result.duration))throw new Error('Маршрутизатор вернул неполную линию');
  return{geometryGeoJson:JSON.stringify(result.geometry),distanceM:Math.max(1,Math.round(result.distance)),durationMinutes:Math.max(1,Math.round(result.duration/60))};
}

function travelRouteTailPreviewPayload(preview) {
  return { token:preview.token,expiresAt:new Date(preview.expiresAt).toISOString(),circuitId:preview.circuitId,routeId:preview.routeId,
    anchor:preview.anchor,replacedSide:preview.replacedSide,metrics:preview.metrics,proposed:preview.proposed };
}

function getTravelRouteTailPreview(token) {
  const preview = travelRouteTailPreviews.get(token);
  if (!preview || preview.expiresAt <= Date.now()) { travelRouteTailPreviews.delete(token); return null; }
  return travelRouteTailPreviewPayload(preview);
}

async function createTravelRouteTailPreview(circuitId, routeId) {
  const result = await pool.query(`SELECT route.id,route.circuit_id,route.travel_mode,route.distance_m,route.duration_minutes,route.updated_at,
    ST_AsGeoJSON(route.geometry::geometry) AS geometry_geojson,assignment.anchor_id,anchor.verification_status,anchor.updated_at AS anchor_updated_at,
    poi.updated_at AS poi_updated_at,coalesce(poi.name_ru,poi.name) AS poi_name,ST_X(poi.location::geometry) AS longitude,ST_Y(poi.location::geometry) AS latitude
    FROM atlas.travel_routes AS route
    JOIN atlas.travel_route_access_anchors AS assignment ON assignment.route_id=route.id
    JOIN atlas.travel_access_anchors AS anchor ON anchor.id=assignment.anchor_id
    JOIN atlas.tourism_pois AS poi ON poi.id=anchor.poi_id
    WHERE route.circuit_id=$1 AND route.id=$2 AND route.lifecycle<>'archived'`, [circuitId, routeId]);
  if (!result.rows.length) return null;
  const row = result.rows[0];
  if (['rejected','expired'].includes(row.verification_status)) throw new Error('Для расчёта выберите действующую точку доступа');
  const originalLineString = JSON.parse(row.geometry_geojson);
  const preparation = prepareRouteTailReplacement(originalLineString, [Number(row.longitude), Number(row.latitude)]);
  const routed = await fetchTailRoadRoute(preparation.routingCoordinates, String(row.travel_mode));
  const merged = mergeRoutedTail(preparation, routed.geometry);
  const originalDistanceM = Number(row.distance_m);
  const keptRatio = preparation.metrics.totalMetres > 0 ? preparation.metrics.keptMetres / preparation.metrics.totalMetres : 0;
  const preservedDistanceM = originalDistanceM * keptRatio;
  const durationMinutes = Math.max(1, Math.round(Number(row.duration_minutes) * keptRatio + Number(routed.duration) / 60));
  const token = randomUUID();
  const preview = { token,expiresAt:Date.now()+travelRouteTailPreviewTtlMs,circuitId,routeId,routeUpdatedAt:new Date(row.updated_at).getTime(),anchorId:String(row.anchor_id),
    anchorUpdatedAt:new Date(row.anchor_updated_at).getTime(),poiUpdatedAt:new Date(row.poi_updated_at).getTime(),
    anchor:{id:String(row.anchor_id),poiName:String(row.poi_name)},replacedSide:preparation.side,
    metrics:{originalDistanceM,keptDistanceM:Math.round(preservedDistanceM),replacedOldDistanceM:Math.max(0,Math.round(originalDistanceM-preservedDistanceM)),
      replacedNewDistanceM:Math.round(Number(routed.distance)),seamGapM:Math.round(merged.metrics.seamGapMetres),endpointDistanceM:Math.round(merged.metrics.endpointDistanceMetres)},
    proposed:{distanceM:Math.max(1,Math.round(preservedDistanceM+Number(routed.distance)+merged.metrics.seamGapMetres)),durationMinutes,geometryGeoJson:JSON.stringify(merged.lineString)} };
  travelRouteTailPreviews.set(token, preview);
  return travelRouteTailPreviewPayload(preview);
}

async function applyTravelRouteTailPreview(token, expectedCircuitId, expectedRouteId) {
  const preview = travelRouteTailPreviews.get(token);
  if (!preview || preview.expiresAt <= Date.now()) { travelRouteTailPreviews.delete(token); return null; }
  if (preview.circuitId !== expectedCircuitId || preview.routeId !== expectedRouteId) throw new Error('Предпросмотр не относится к выбранному маршруту');
  if (preview.metrics.seamGapM > 500 || preview.metrics.endpointDistanceM > 500) throw new Error('Предпросмотр имеет слишком большой разрыв и не может быть применён');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const currentAnchor = await client.query(`SELECT anchor.updated_at AS anchor_updated_at,anchor.verification_status,poi.updated_at AS poi_updated_at
      FROM atlas.travel_access_anchors AS anchor JOIN atlas.tourism_pois AS poi ON poi.id=anchor.poi_id WHERE anchor.id=$1 FOR SHARE OF anchor,poi`, [preview.anchorId]);
    if (!currentAnchor.rows.length || ['rejected','expired'].includes(currentAnchor.rows[0].verification_status)
      || new Date(currentAnchor.rows[0].anchor_updated_at).getTime() !== preview.anchorUpdatedAt
      || new Date(currentAnchor.rows[0].poi_updated_at).getTime() !== preview.poiUpdatedAt) throw new Error('Точка доступа изменилась после расчёта. Создайте новый предпросмотр');
    const current = await client.query(`SELECT route.updated_at,route.lifecycle,assignment.anchor_id FROM atlas.travel_routes AS route
      LEFT JOIN atlas.travel_route_access_anchors AS assignment ON assignment.route_id=route.id
      WHERE route.id=$1 AND route.circuit_id=$2 FOR UPDATE OF route`, [preview.routeId, preview.circuitId]);
    if (!current.rows.length || current.rows[0].lifecycle==='archived' || new Date(current.rows[0].updated_at).getTime() !== preview.routeUpdatedAt || current.rows[0].anchor_id !== preview.anchorId) {
      throw new Error('Маршрут или точка доступа изменились после расчёта. Создайте новый предпросмотр');
    }
    await client.query(`UPDATE atlas.travel_routes SET geometry=ST_SetSRID(ST_GeomFromGeoJSON($1),4326)::geography,
      distance_m=$2,duration_minutes=$3,review_status='candidate',lifecycle='draft',archived_at=NULL,verified_at=NULL,updated_at=now() WHERE id=$4`,
    [preview.proposed.geometryGeoJson,preview.proposed.distanceM,preview.proposed.durationMinutes,preview.routeId]);
    await client.query('COMMIT');
  } catch (error) { await client.query('ROLLBACK').catch(() => {}); throw error; } finally { client.release(); }
  travelRouteTailPreviews.delete(token);
  let publicDataSynced=true;try{await runCircuitExports(preview.circuitId,'published');}catch(error){publicDataSynced=false;console.error('Хвост маршрута применён, но read-model не обновлён',error);}
  return {circuitId:preview.circuitId,routeId:preview.routeId,publicDataSynced};
}

function routeGenerationPreviewPayload(preview) {
  return { token: preview.token, expiresAt: new Date(preview.expiresAt).toISOString(), circuit: preview.circuit,
    suggestions: preview.suggestions, blockers: preview.blockers };
}

function getTravelRouteGenerationPreview(token) {
  const preview = travelRouteGenerationPreviews.get(token);
  if (!preview || preview.expiresAt <= Date.now()) {
    travelRouteGenerationPreviews.delete(token);
    return null;
  }
  return routeGenerationPreviewPayload(preview);
}

function generatedRouteSourceFingerprint(rows) {
  const normalized = rows.map(row => ({
    id:String(row.id),poiUpdatedAt:new Date(row.poi_updated_at).toISOString(),linkUpdatedAt:new Date(row.link_updated_at).toISOString(),
    role:String(row.role),reviewStatus:String(row.review_status),longitude:Number(row.longitude),latitude:Number(row.latitude),
  })).sort((left,right) => left.id.localeCompare(right.id));
  return createHash('sha256').update(JSON.stringify(normalized)).digest('hex');
}

function generatedRouteSemanticFingerprint(stops, routeVariantKind) {
  return createHash('sha256').update(JSON.stringify({
    orderedPoiIds:stops.map(stop => String(stop.poiId)),routeVariantKind:String(routeVariantKind??'recommended'),
  })).digest('hex');
}

async function currentGeneratedRouteFingerprints(circuitId, queryable=pool) {
  const result = await queryable.query(`SELECT route.id,route.route_variant_kind,stop.sequence,stop.poi_id
    FROM atlas.travel_routes AS route JOIN atlas.travel_route_stops AS stop ON stop.route_id=route.id
    WHERE route.circuit_id=$1 AND route.route_engine='osrm' AND stop.poi_id IS NOT NULL
    ORDER BY route.id,stop.sequence`, [circuitId]);
  const routes = new Map();
  for (const row of result.rows) {
    const route = routes.get(String(row.id)) ?? { routeVariantKind:String(row.route_variant_kind),stops:[] };
    route.stops.push({ poiId:String(row.poi_id) });
    routes.set(String(row.id),route);
  }
  return new Set([...routes.values()].map(route => generatedRouteSemanticFingerprint(route.stops,route.routeVariantKind)));
}

async function currentGeneratedRouteSourceRows(circuitId, poiIds, queryable=pool) {
  if (!poiIds.length) return [];
  const result = await queryable.query(`SELECT poi.id,poi.updated_at AS poi_updated_at,link.updated_at AS link_updated_at,
    link.role,poi.review_status,ST_X(poi.location::geometry) AS longitude,ST_Y(poi.location::geometry) AS latitude
    FROM atlas.tourism_pois AS poi JOIN atlas.circuit_travel_pois AS link ON link.poi_id=poi.id AND link.circuit_id=$1
    WHERE poi.id=ANY($2::text[]) FOR SHARE OF poi,link`, [circuitId,poiIds]);
  return result.rows;
}

async function createTravelRouteGenerationPreview(circuitId, rawInput = {}) {
  if (!/^[A-Za-z0-9_-]+$/.test(circuitId)) throw new Error('Некорректный ID трассы');
  const [circuitResult, pointsResult, existingResult] = await Promise.all([
    pool.query(`SELECT circuit.id,coalesce(profile.name_ru,circuit.short_name,circuit.name) AS name,
      ST_X(circuit.location::geometry) AS longitude,ST_Y(circuit.location::geometry) AS latitude
      FROM atlas.circuits AS circuit LEFT JOIN atlas.circuit_page_profiles AS profile ON profile.circuit_id=circuit.id
      WHERE circuit.id=$1`, [circuitId]),
    pool.query(`SELECT poi.id,coalesce(poi.name_ru,poi.name) AS name,poi.category_id,link.role,poi.importance,
      poi.updated_at AS poi_updated_at,link.updated_at AS link_updated_at,
      round(coalesce(link.distance_to_circuit_m,ST_Distance(poi.location,circuit.location)))::int AS distance_to_circuit_m,
      poi.review_status,ST_X(poi.location::geometry) AS longitude,ST_Y(poi.location::geometry) AS latitude
      FROM atlas.circuit_travel_pois AS link JOIN atlas.tourism_pois AS poi ON poi.id=link.poi_id
      JOIN atlas.circuits AS circuit ON circuit.id=link.circuit_id
      WHERE link.circuit_id=$1 AND poi.review_status<>'hidden'
      ORDER BY poi.importance DESC,link.distance_to_circuit_m,lower(coalesce(poi.name_ru,poi.name))`, [circuitId]),
    pool.query(`SELECT route.id,route.route_variant_kind,route.route_engine,stop.sequence,stop.poi_id
      FROM atlas.travel_routes AS route LEFT JOIN atlas.travel_route_stops AS stop ON stop.route_id=route.id
      WHERE route.circuit_id=$1 ORDER BY route.id,stop.sequence`, [circuitId]),
  ]);
  if (!circuitResult.rows.length) return null;
  const circuit = { id:circuitId,name:String(circuitResult.rows[0].name),longitude:Number(circuitResult.rows[0].longitude),latitude:Number(circuitResult.rows[0].latitude) };
  const points = pointsResult.rows.map(row => ({ id:String(row.id),name:String(row.name),categoryId:String(row.category_id),role:String(row.role),importance:Number(row.importance),
    distanceToCircuitM:Number(row.distance_to_circuit_m),reviewStatus:String(row.review_status),longitude:Number(row.longitude),latitude:Number(row.latitude) }));
  const existingIds = new Set(existingResult.rows.map(row => String(row.id)));
  const existingGeneratedRoutes = new Map();
  for (const row of existingResult.rows.filter(row => row.route_engine==='osrm' && row.poi_id!==null)) {
    const route = existingGeneratedRoutes.get(String(row.id)) ?? { routeVariantKind:String(row.route_variant_kind),stops:[] };
    route.stops.push({ poiId:String(row.poi_id) });
    existingGeneratedRoutes.set(String(row.id),route);
  }
  const existingFingerprints = new Set([...existingGeneratedRoutes.values()].map(route => generatedRouteSemanticFingerprint(route.stops,route.routeVariantKind)));
  const blockers = [];
  const definitions = [];
  const orderedPoiIds = Array.isArray(rawInput?.orderedPoiIds) ? rawInput.orderedPoiIds.map(String).filter(Boolean) : [];
  const optimizeWaypointOrder = rawInput?.optimizeWaypointOrder === true;
  if (orderedPoiIds.length) {
    if (orderedPoiIds.length < 2 || orderedPoiIds.length > 10 || new Set(orderedPoiIds).size !== orderedPoiIds.length) throw new Error('Выберите от двух до десяти разных точек маршрута');
    const pointsById = new Map(points.map(point => [point.id,point]));
    const selectedPoints = orderedPoiIds.map(id => pointsById.get(id));
    if (selectedPoints.some(point => !point)) throw new Error('Одна из выбранных точек недоступна для этой трассы');
    definitions.push({ id:`${circuitId}-custom-${randomUUID().slice(0,8)}`,routeType:'tourist_half_day',travelMode:'car',
      nameRu:`Маршрут по выбранным точкам — ${circuit.name}`,summaryRu:optimizeWaypointOrder?'Порядок промежуточных точек оптимизирован; начало и конец сохранены':'Черновик в заданном порядке точек',
      points:selectedPoints,optimizeWaypointOrder,routeVariantKind:'recommended' });
  }
  const explore = points.filter(point => point.role === 'explore');
  if (!orderedPoiIds.length) {
    const halfDay = selectDiverseRoutePoints(explore, 3, 30_000);
    const fullDay = selectDiverseRoutePoints(explore.filter(point => !halfDay.some(selected => selected.id === point.id)), 5, 50_000);
    if (halfDay.length >= 3) definitions.push({ id:`${circuitId}-generated-half-day`,routeType:'tourist_half_day',travelMode:'car',nameRu:`Знакомство с окрестностями трассы ${circuit.name}`,summaryRu:'Автоматически предложенный автомобильный маршрут на полдня',points:halfDay });
    else blockers.push('Для маршрута на полдня нужно минимум три разнесённые достопримечательности в радиусе 30 км');
    if (fullDay.length >= 4) definitions.push({ id:`${circuitId}-generated-full-day`,routeType:'tourist_full_day',travelMode:'car',nameRu:`Большой маршрут вокруг трассы ${circuit.name}`,summaryRu:'Автоматически предложенный автомобильный маршрут на полный день',points:fullDay });
    else blockers.push('Для маршрута на полный день нужно минимум четыре дополнительные достопримечательности в радиусе 50 км');
    const accessPoint = points.find(point => point.role === 'circuit' && ['gate','parking','park_and_ride'].includes(point.categoryId) && ['reviewed','published'].includes(point.reviewStatus));
    if (accessPoint) {
      const airport = points.find(point => point.categoryId === 'airport');
      const station = points.find(point => point.categoryId === 'railway_station');
      if (airport) definitions.push({ id:`${circuitId}-generated-airport-arrival`,routeType:'arrival',travelMode:'car',nameRu:`${airport.name} → ${circuit.name}`,summaryRu:'Черновой маршрут от аэропорта к подтверждённой точке доступа',points:[airport,accessPoint] });
      if (station) definitions.push({ id:`${circuitId}-generated-station-arrival`,routeType:'arrival',travelMode:'car',nameRu:`${station.name} → ${circuit.name}`,summaryRu:'Черновой маршрут от железнодорожного вокзала к подтверждённой точке доступа',points:[station,accessPoint] });
    } else blockers.push('Маршруты прибытия не созданы: сначала подтвердите вход, парковку или другую точку доступа к трассе');
  }
  const suggestions = [];
  let routerUnavailable = false;
  for (const definition of definitions) {
    if (existingIds.has(definition.id)) { blockers.push(`Маршрут ${definition.id} уже существует и не будет перезаписан`); continue; }
    try {
      const optimized = definition.optimizeWaypointOrder ? await fetchOptimizedGeneratedRoadRoute(definition.points) : null;
      const routePoints = optimized?.orderedPoints ?? definition.points;
      let alternatives = [];
      if (orderedPoiIds.length) {
        if (optimized) {
          try { alternatives = await fetchGeneratedRoadAlternatives(routePoints); }
          catch (error) {
            if (error instanceof OsrmTransportError) routerUnavailable = true;
            blockers.push(`Альтернативные линии не рассчитаны: ${error instanceof Error ? error.message : String(error)}`);
          }
        } else {
          alternatives = await fetchGeneratedRoadAlternatives(routePoints);
        }
      }
      const primaryRoute = optimized?.route ?? alternatives[0] ?? await fetchGeneratedRoadRoute(routePoints);
      if (primaryRoute?.geometry?.type !== 'LineString' || !Array.isArray(primaryRoute.geometry.coordinates)
        || primaryRoute.geometry.coordinates.length < 2 || !Number.isFinite(primaryRoute.distance)
        || !Number.isFinite(primaryRoute.duration)) throw new Error('Маршрутизатор вернул неполную геометрию');
      const candidates = orderedPoiIds.length ? [primaryRoute,...alternatives] : [primaryRoute];
      const variantCandidates = [{kind:'recommended',route:primaryRoute,label:''}];
      if (orderedPoiIds.length) {
        const fastest = [...candidates].sort((left,right) => left.duration-right.duration)[0];
        const shortest = [...candidates].sort((left,right) => left.distance-right.distance)[0];
        for (const [kind,route,label] of [['fastest',fastest,' · быстрее по времени'],['shortest',shortest,' · меньше по расстоянию']]) {
          if (!variantCandidates.some(candidate => JSON.stringify(candidate.route.geometry) === JSON.stringify(route.geometry))) variantCandidates.push({kind,route,label});
        }
      }
      for (const candidate of variantCandidates) {
        const stops = routePoints.map(point => ({ poiId:point.id,nameRu:point.name }));
        const semanticFingerprint = generatedRouteSemanticFingerprint(stops,orderedPoiIds.length?candidate.kind:(definition.routeVariantKind??'recommended'));
        if (existingFingerprints.has(semanticFingerprint)) {
          blockers.push(`${definition.nameRu}${candidate.label}: маршрут с тем же порядком точек и вариантом уже существует`);
          continue;
        }
        suggestions.push({ id:candidate.kind==='recommended'?definition.id:`${definition.id}-${candidate.kind}`,routeType:definition.routeType,travelMode:definition.travelMode,
          nameRu:`${definition.nameRu}${candidate.label}`,summaryRu:definition.summaryRu,
          geometryGeoJson:JSON.stringify(candidate.route.geometry),distanceM:Math.max(1,Math.round(candidate.route.distance)),durationMinutes:Math.max(1,Math.round(candidate.route.duration/60)),
          stops,highlightsRu:routePoints.map(point => point.name),semanticFingerprint,
          routeVariantKind:orderedPoiIds.length?candidate.kind:(definition.routeVariantKind??'recommended'),optimizeWaypointOrder:Boolean(definition.optimizeWaypointOrder) });
        existingFingerprints.add(semanticFingerprint);
      }
      if (routerUnavailable) {
        blockers.push('Остальные маршруты не рассчитаны: сервис маршрутизации недоступен');
        break;
      }
    } catch (error) {
      blockers.push(`${definition.nameRu}: ${error instanceof Error ? error.message : String(error)}`);
      if (error instanceof OsrmTransportError) {
        blockers.push('Остальные маршруты не рассчитаны: сервис маршрутизации недоступен');
        break;
      }
    }
  }
  const token = randomUUID();
  const sourcePoiIds = [...new Set(suggestions.flatMap(suggestion => suggestion.stops.map(stop => stop.poiId)))];
  const sourceRows = pointsResult.rows.filter(row => sourcePoiIds.includes(String(row.id)));
  const preview = { token,expiresAt:Date.now()+travelImportPreviewTtlMs,circuit,suggestions,blockers,sourceRows };
  travelRouteGenerationPreviews.set(token, preview);
  return routeGenerationPreviewPayload(preview);
}

async function applyTravelRouteGenerationPreview(token, expectedCircuitId, selectedIds) {
  const preview = travelRouteGenerationPreviews.get(token);
  if (!preview || preview.expiresAt <= Date.now()) { travelRouteGenerationPreviews.delete(token); return null; }
  if (preview.circuit.id !== expectedCircuitId) throw new Error('Предпросмотр относится к другой трассе');
  const selected = new Set(Array.isArray(selectedIds) ? selectedIds.map(String) : []);
  const selectedSuggestions = preview.suggestions.filter(item => selected.has(item.id));
  if (!selectedSuggestions.length) throw new Error('Выберите хотя бы один маршрут для сохранения');
  const client = await pool.connect();
  let batch;
  try {
    batch = await applyGeneratedRouteBatch({client,circuitId:preview.circuit.id,suggestions:selectedSuggestions,
      checkSources:async transaction=>{
        const selectedPoiIds = [...new Set(selectedSuggestions.flatMap(suggestion => suggestion.stops.map(stop => stop.poiId)))];
        const selectedPoiIdSet = new Set(selectedPoiIds);
        const previewSourceRows = preview.sourceRows.filter(row => selectedPoiIdSet.has(String(row.id)));
        const currentSourceRows = await currentGeneratedRouteSourceRows(preview.circuit.id,selectedPoiIds,transaction);
        if (generatedRouteSourceFingerprint(currentSourceRows)!==generatedRouteSourceFingerprint(previewSourceRows)) {
          throw new Error('Точки маршрута изменились после расчёта. Создайте новый предпросмотр');
        }
      },
      loadFingerprints:transaction=>currentGeneratedRouteFingerprints(preview.circuit.id,transaction),
      save:(transaction,suggestion,created)=>saveTravelRoute({ ...suggestion,createOnly:true,stops:suggestion.stops.map(stop=>({ ...stop,dwellMinutes:null,longitude:null,latitude:null,instructionRu:null })),name:suggestion.nameRu,difficulty:'easy',eventOnly:false,bookingRequired:false,
      accessibilityNotesRu:'Требует ручной проверки доступности каждой остановки',scheduleNotesRu:'Проверьте часы работы и дорожные ограничения перед поездкой',
      routeEngine:'osrm',routeEngineProfile:'driving',reviewStatus:'candidate',sourceUrl:'https://project-osrm.org/',routeGroup:`${preview.circuit.id}-${suggestion.routeType}`,
      sortOrder:created,lineOffsetPx:0,lineColour:suggestion.routeType==='tourist_full_day'?'#A47CFF':'#7FD98A',minZoom:7,maxZoom:18,visibleByDefault:false,
      routeVariantKind:suggestion.routeVariantKind??'recommended',displayPriority:100,geometryMode:'routed',lifecycle:'draft',optimizeWaypointOrder:Boolean(suggestion.optimizeWaypointOrder),
      notesRu:'Автоматический черновик; публикация разрешена только после ручной проверки',rationaleRu:'Маршрут автоматически объединяет наиболее содержательные и разнесённые туристические точки. Порядок и дорожную линию необходимо проверить вручную.',
      practicalNotesRu:'Перед публикацией проверьте актуальность объектов, часы работы, доступность дорог и фактическое время в пути.' }, preview.circuit.id, suggestion.id,{client:transaction})});
  }
  finally { client.release(); }
  travelRouteGenerationPreviews.delete(token);
  let publicDataSynced=true;
  if(batch.created){try{await runCircuitExports(preview.circuit.id,'published');}catch(error){publicDataSynced=false;console.error('Пакет маршрутов сохранён, но read-model не обновлён',error);}}
  return { circuitId:preview.circuit.id,...batch,publicDataSynced };
}

function travelPreviewPayload(preview) {
  return {
    token: preview.token,
    expiresAt: new Date(preview.expiresAt).toISOString(),
    circuit: preview.result.circuit,
    groups: preview.result.groups,
    radii: preview.result.radii,
    failedGroups: preview.result.failedGroups,
    candidates: preview.result.candidates.map((candidate) => ({
      id: candidate.id, name: candidate.name, nameRu: candidate.nameRu, categoryId: candidate.categoryId, role: candidate.role,
      latitude: candidate.latitude, longitude: candidate.longitude,
      distanceToCircuitM: candidate.distanceToCircuitM, importance: candidate.importance,
      websiteUrl: candidate.websiteUrl, openingHours: candidate.openingHours, address: candidate.address,
    })),
  };
}

function getTravelImportPreview(token) {
  const preview = travelImportPreviews.get(token);
  if (!preview || preview.expiresAt <= Date.now()) {
    travelImportPreviews.delete(token);
    return null;
  }
  return travelPreviewPayload(preview);
}

async function createTravelImportPreview(rawInput) {
  const circuitId = typeof rawInput?.circuitId === 'string' ? rawInput.circuitId.trim() : '';
  const groups = Array.isArray(rawInput?.groups) ? rawInput.groups.map(String) : [];
  const radii = {};
  for (const name of ['airport', 'regionalTransport', 'stay', 'explore', 'essential']) {
    const value = Number(rawInput?.radii?.[name]);
    if (Number.isInteger(value)) radii[name] = value;
  }
  const result = await discoverTravelCandidates(pool, { circuitId, groups, radii });
  const token = randomUUID();
  const preview = { token, expiresAt: Date.now() + travelImportPreviewTtlMs, result };
  travelImportPreviews.set(token, preview);
  await pool.query(
    'INSERT INTO atlas.travel_import_runs '
    + '(id, circuit_id, provider, parameters, status, discovered_count, failed_groups, expires_at) '
    + "VALUES ($1, $2, 'openstreetmap', $3::jsonb, 'previewed', $4, $5, $6)",
    [token, circuitId, JSON.stringify({ groups: result.groups, radii: result.radii }),
      result.candidates.length, result.failedGroups, new Date(preview.expiresAt)],
  );
  return travelPreviewPayload(preview);
}

async function applyTravelImportPreview(token, rawInput) {
  const preview = travelImportPreviews.get(token);
  if (!preview || preview.expiresAt <= Date.now()) {
    travelImportPreviews.delete(token);
    return null;
  }
  const selectedIds = Array.isArray(rawInput?.selectedIds)
    ? [...new Set(rawInput.selectedIds.map(String))].filter((id) => /^[A-Za-z0-9_-]+$/.test(id)).slice(0, 500)
    : [];
  if (!selectedIds.length) throw new Error('Выберите хотя бы одну точку');
  const candidatesById = new Map(preview.result.candidates.map((candidate) => [candidate.id, candidate]));
  const selected = selectedIds.map((id) => candidatesById.get(id)).filter(Boolean);
  if (selected.length !== selectedIds.length) throw new Error('В предпросмотре отсутствует часть выбранных точек');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const candidate of selected) {
      await client.query(
        'INSERT INTO atlas.tourism_pois '
        + '(id, category_id, name, name_ru, location, address, website_url, opening_hours, importance, wheelchair_access, review_status, source_id, properties, updated_at) '
        + "VALUES ($1, $2, $3, $4, ST_SetSRID(ST_MakePoint($5, $6), 4326)::geography, $7, $8, $9, $10, 'unknown', 'candidate', 'openstreetmap', $11::jsonb, now()) "
        + 'ON CONFLICT (id) DO UPDATE SET category_id=EXCLUDED.category_id, name=EXCLUDED.name, location=EXCLUDED.location, '
        + "name_ru=coalesce(nullif(atlas.tourism_pois.name_ru,''),EXCLUDED.name_ru), "
        + 'address=EXCLUDED.address, website_url=EXCLUDED.website_url, opening_hours=EXCLUDED.opening_hours, '
        + 'importance=EXCLUDED.importance, properties=EXCLUDED.properties, updated_at=now() '
        + "WHERE atlas.tourism_pois.review_status = 'candidate'",
        [candidate.id, candidate.categoryId, candidate.name, candidate.nameRu, candidate.longitude, candidate.latitude,
          candidate.address, candidate.websiteUrl, candidate.openingHours, candidate.importance,
          JSON.stringify({ osm: candidate.externalId, tags: candidate.tags, importedVia: 'admin-travel-wizard' })],
      );
      await client.query(
        'INSERT INTO atlas.circuit_travel_pois '
        + '(circuit_id, poi_id, role, priority, distance_to_circuit_m, source_id) '
        + "VALUES ($1, $2, $3, $4, $5, 'openstreetmap') "
        + 'ON CONFLICT (circuit_id, poi_id) DO UPDATE SET role=EXCLUDED.role, priority=EXCLUDED.priority, '
        + "distance_to_circuit_m=EXCLUDED.distance_to_circuit_m, updated_at=now() WHERE atlas.circuit_travel_pois.source_id = 'openstreetmap' AND NOT atlas.circuit_travel_pois.is_featured",
        [preview.result.circuit.id, candidate.id, candidate.role, candidate.importance, candidate.distanceToCircuitM],
      );
      await client.query(
        "INSERT INTO atlas.external_identifiers (provider, entity_type, entity_id, external_id) VALUES ('openstreetmap', 'tourism_poi', $1, $2) "
        + 'ON CONFLICT (provider, entity_type, external_id) DO UPDATE SET entity_id=EXCLUDED.entity_id',
        [candidate.id, candidate.externalId],
      );
    }
    await client.query('COMMIT');
    await pool.query(
      "UPDATE atlas.travel_import_runs SET status='imported', imported_count=$2, applied_at=now() WHERE id=$1",
      [token, selected.length],
    );
    travelImportPreviews.delete(token);
    return { circuitId: preview.result.circuit.id, imported: selected.length };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

async function getDashboard(url) {
  const limit = boundedPositiveInteger(url.searchParams.get('limit'), 50, 200);
  const page = boundedPositiveInteger(url.searchParams.get('page'), 1);
  const offset = (page - 1) * limit;
  const search = String(url.searchParams.get('q') ?? '').trim().slice(0, 120);
  const requestedFilter = url.searchParams.get('filter');
  const filter = ['unresolved-life-data', 'missing-photo'].includes(requestedFilter) ? requestedFilter : '';
  const availablePhotoIds = String(url.searchParams.get('availablePhotoIds') ?? '').split(',')
    .filter((id) => /^[A-Za-z0-9_-]+$/.test(id)).slice(0, 200);
  const [rowsResult, summaryResult] = await Promise.all([
    pool.query(`
      WITH directory AS (
        SELECT driver.id,
               coalesce(profile.name_ru, concat_ws(' ', driver.given_name, driver.family_name)) AS name_ru,
               concat_ws(' ', driver.given_name, driver.family_name) AS name_en,
               min(race.season_year)::int AS first_season,
               max(race.season_year)::int AS latest_season,
                count(DISTINCT race.season_year)::int AS season_count,
                to_char(driver.date_of_birth, 'YYYY-MM-DD') AS birth_date,
                profile.birth_place_ru,
                to_char(profile.death_date, 'YYYY-MM-DD') AS death_date,
                profile.height_cm,
                profile.weight_kg,
                source.url AS source_url,
                profile.birth_place_ru IS NULL AS unresolved_life_data,
               photo.url IS NOT NULL AS has_photo,
               photo.url AS photo_url,
               (array_agg(entry.display_name ORDER BY race.season_year DESC, race.round DESC))[1] AS latest_team
        FROM atlas.drivers AS driver
        JOIN atlas.session_results AS result ON result.driver_id = driver.id
        JOIN atlas.sessions AS session ON session.id = result.session_id AND session.session_type = 'race'
        JOIN atlas.races AS race ON race.id = session.race_id
        LEFT JOIN atlas.constructor_entries AS entry ON entry.id = result.constructor_entry_id
         LEFT JOIN atlas.driver_profiles AS profile ON profile.driver_id = driver.id
         LEFT JOIN atlas.data_sources AS source ON source.id = profile.source_id
         LEFT JOIN LATERAL (
           SELECT coalesce(thumbnail.url, asset.url) AS url
           FROM atlas.media_assets AS asset
           LEFT JOIN atlas.media_asset_derivatives AS thumbnail
             ON thumbnail.media_asset_id = asset.id AND thumbnail.variant = 'thumbnail'
           WHERE asset.entity_type = 'driver' AND asset.entity_id = driver.id
             AND asset.media_type = 'image' AND asset.usage_role = 'portrait' AND asset.is_primary
           ORDER BY asset.verified_at DESC NULLS LAST, asset.id
           LIMIT 1
         ) AS photo ON true
         GROUP BY driver.id, profile.name_ru, profile.birth_place_ru, profile.death_date,
                  profile.height_cm, profile.weight_kg, source.url, photo.url
      )
      SELECT directory.*, count(*) OVER()::int AS filtered_count
      FROM directory
      WHERE ($3 = ''
         OR directory.name_ru ILIKE '%' || $3 || '%'
         OR directory.name_en ILIKE '%' || $3 || '%'
         OR directory.id ILIKE '%' || $3 || '%')
        AND ($4 = ''
          OR ($4 = 'unresolved-life-data' AND directory.unresolved_life_data)
          OR ($4 = 'missing-photo' AND NOT directory.has_photo AND NOT (directory.id = ANY($5::text[]))))
      ORDER BY lower(directory.name_ru), directory.id
      LIMIT $1 OFFSET $2
    `, [limit, offset, search, filter, availablePhotoIds]),
    pool.query(`
      SELECT count(*)::int AS database_drivers,
             count(*) FILTER (WHERE has_results)::int AS catalog_drivers,
             count(*) FILTER (WHERE has_results AND profile.birth_place_ru IS NOT NULL)::int AS birth_places,
             count(*) FILTER (WHERE has_results AND profile.death_date IS NOT NULL)::int AS death_dates,
             count(*) FILTER (WHERE has_results AND (directory.id = ANY($1::text[]) OR EXISTS (
               SELECT 1 FROM atlas.media_assets AS asset
               WHERE asset.entity_type = 'driver' AND asset.entity_id = directory.id
                 AND asset.media_type = 'image' AND asset.usage_role = 'portrait' AND asset.is_primary
             )))::int AS driver_photos,
             count(*) FILTER (WHERE has_results AND profile.birth_place_ru IS NULL)::int AS unresolved_life_data
      FROM (
        SELECT driver.id, EXISTS (
          SELECT 1 FROM atlas.session_results AS result
          JOIN atlas.sessions AS session ON session.id = result.session_id AND session.session_type = 'race'
          WHERE result.driver_id = driver.id
        ) AS has_results
        FROM atlas.drivers AS driver
      ) AS directory
      LEFT JOIN atlas.driver_profiles AS profile ON profile.driver_id = directory.id
    `, [availablePhotoIds]),
  ]);
  const summary = summaryResult.rows[0];
  return {
    rows: rowsResult.rows.map((row) => ({
       id: String(row.id), nameRu: String(row.name_ru), firstSeason: Number(row.first_season),
       birthDate: row.birth_date === null ? null : String(row.birth_date),
       birthPlaceRu: row.birth_place_ru === null ? null : String(row.birth_place_ru),
       deathDate: row.death_date === null ? null : String(row.death_date),
       heightCm: row.height_cm === null ? null : String(row.height_cm),
       weightKg: row.weight_kg === null ? null : String(row.weight_kg),
       sourceUrl: row.source_url === null ? null : String(row.source_url),
       latestSeason: Number(row.latest_season), seasonCount: Number(row.season_count),
      latestTeam: row.latest_team === null ? null : String(row.latest_team), hasPhoto: Boolean(row.has_photo),
      photoUrl: row.photo_url === null ? null : String(row.photo_url),
    })),
    summary: {
      catalogDrivers: Number(summary.catalog_drivers), databaseDrivers: Number(summary.database_drivers),
      birthPlaces: Number(summary.birth_places), deathDates: Number(summary.death_dates), driverPhotos: Number(summary.driver_photos),
      unresolvedLifeData: Number(summary.unresolved_life_data),
    },
    filteredCount: rowsResult.rows[0] ? Number(rowsResult.rows[0].filtered_count) : 0,
  };
}

function optionalText(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function boundedPositiveInteger(value, fallback, maximum = Number.MAX_SAFE_INTEGER) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 1 ? Math.min(Math.trunc(parsed), maximum) : fallback;
}

function quoteIdentifier(value) {
  return `"${String(value).replaceAll('"', '""')}"`;
}

const tableFilterOperators = new Set(['contains', 'equal', 'is-null', 'is-not-null']);
const unsortableTableTypes = new Set(['ARRAY', 'json', 'jsonb']);
const opaqueTableTypes = new Set(['bytea', 'geometry', 'geography']);

async function getTableMetadata(tableName) {
  if (!/^[a-z][a-z0-9_]*$/.test(tableName)) return null;
  const columnsResult = await pool.query(`
    SELECT column_name, data_type, udt_name, is_nullable = 'YES' AS is_nullable,
           is_identity = 'YES' AS is_identity, is_generated <> 'NEVER' AS is_generated,
           ordinal_position
    FROM information_schema.columns
    WHERE table_schema = 'atlas' AND table_name = $1
    ORDER BY ordinal_position
  `, [tableName]);
  if (!columnsResult.rows.length) return null;
  const primaryKeyResult = await pool.query(`
    SELECT column_usage.column_name
    FROM information_schema.table_constraints AS constraint_info
    JOIN information_schema.key_column_usage AS column_usage
      ON column_usage.constraint_schema = constraint_info.constraint_schema
     AND column_usage.constraint_name = constraint_info.constraint_name
    WHERE constraint_info.table_schema = 'atlas' AND constraint_info.table_name = $1
      AND constraint_info.constraint_type = 'PRIMARY KEY'
    ORDER BY column_usage.ordinal_position
  `, [tableName]);
  const primaryKey = primaryKeyResult.rows.map((row) => String(row.column_name));
  return {
    name: tableName,
    primaryKey,
    columns: columnsResult.rows.map((row) => {
      const name = String(row.column_name);
      const dataType = String(row.data_type);
      const udtName = String(row.udt_name);
      const opaque = opaqueTableTypes.has(udtName);
      return {
        name,
        dataType,
        udtName,
        nullable: Boolean(row.is_nullable),
        primaryKey: primaryKey.includes(name),
        editable: !primaryKey.includes(name) && !row.is_identity && !row.is_generated && !opaque,
        filterable: !opaque && !unsortableTableTypes.has(dataType),
        sortable: !opaque && !unsortableTableTypes.has(dataType),
      };
    }),
  };
}

async function getSchemaTables() {
  const result = await pool.query(`
    SELECT tables.table_name,
           count(columns.column_name)::int AS column_count,
           greatest(coalesce(stats.n_live_tup, 0), 0)::bigint AS estimated_rows
    FROM information_schema.tables AS tables
    JOIN information_schema.columns AS columns
      ON columns.table_schema = tables.table_schema AND columns.table_name = tables.table_name
    LEFT JOIN pg_stat_user_tables AS stats
      ON stats.schemaname = tables.table_schema AND stats.relname = tables.table_name
    WHERE tables.table_schema = 'atlas' AND tables.table_type = 'BASE TABLE'
    GROUP BY tables.table_name, stats.n_live_tup
    ORDER BY tables.table_name
  `);
  return {
    schema: 'atlas',
    tables: result.rows.map((row) => ({
      name: String(row.table_name),
      columnCount: Number(row.column_count),
      estimatedRows: Number(row.estimated_rows),
    })),
  };
}

async function getMediaRegistry(url) {
  const limit = boundedPositiveInteger(url.searchParams.get('limit'), 40, 100);
  const page = boundedPositiveInteger(url.searchParams.get('page'), 1);
  const offset = (page - 1) * limit;
  const query = String(url.searchParams.get('q') ?? '').trim().slice(0, 120);
  const entityType = String(url.searchParams.get('entityType') ?? '').trim().slice(0, 50);
  const usageRole = String(url.searchParams.get('usageRole') ?? '').trim().slice(0, 80);
  const rightsStatus = String(url.searchParams.get('rights') ?? '').trim().slice(0, 30);
  const reviewStatus = String(url.searchParams.get('review') ?? '').trim().slice(0, 30);
  const seasonValue = String(url.searchParams.get('season') ?? '').trim();
  const season = seasonValue ? validSeason(seasonValue) : null;
  const [rowsResult, countResult, summaryResult, optionsResult] = await Promise.all([
    pool.query(`
      SELECT asset.id, asset.entity_type, asset.entity_id, asset.media_type, asset.usage_role,
             asset.url, asset.alt_text_ru, asset.author, asset.licence, asset.source_url,
             asset.season_year, asset.is_primary, asset.provenance_type, asset.rights_status,
             asset.review_status, asset.verified_at,
             count(derivative.id)::int AS derivative_count
      FROM atlas.media_assets AS asset
      LEFT JOIN atlas.media_asset_derivatives AS derivative ON derivative.media_asset_id = asset.id
      WHERE ($3 = '' OR asset.id ILIKE '%' || $3 || '%' OR asset.entity_id ILIKE '%' || $3 || '%'
        OR asset.alt_text_ru ILIKE '%' || $3 || '%' OR asset.author ILIKE '%' || $3 || '%')
        AND ($4 = '' OR asset.entity_type = $4)
        AND ($5 = '' OR asset.usage_role = $5)
        AND ($6 = '' OR asset.rights_status = $6)
        AND ($7 = '' OR asset.review_status = $7)
        AND ($8::smallint IS NULL OR asset.season_year = $8)
      GROUP BY asset.id
      ORDER BY asset.season_year DESC NULLS LAST, asset.entity_type, asset.entity_id, asset.usage_role, asset.id
      LIMIT $1 OFFSET $2
    `, [limit, offset, query, entityType, usageRole, rightsStatus, reviewStatus, season]),
    pool.query(`SELECT count(*)::int AS count FROM atlas.media_assets AS asset
      WHERE ($1 = '' OR asset.id ILIKE '%' || $1 || '%' OR asset.entity_id ILIKE '%' || $1 || '%'
        OR asset.alt_text_ru ILIKE '%' || $1 || '%' OR asset.author ILIKE '%' || $1 || '%')
        AND ($2 = '' OR asset.entity_type = $2)
        AND ($3 = '' OR asset.usage_role = $3)
        AND ($4 = '' OR asset.rights_status = $4)
        AND ($5 = '' OR asset.review_status = $5)
        AND ($6::smallint IS NULL OR asset.season_year = $6)`,
    [query, entityType, usageRole, rightsStatus, reviewStatus, season]),
    pool.query(`SELECT count(*)::int AS total,
      count(*) FILTER (WHERE rights_status = 'unresolved')::int AS unresolved_rights,
      count(*) FILTER (WHERE review_status = 'candidate')::int AS candidates,
      count(*) FILTER (WHERE review_status = 'published')::int AS published,
      count(*) FILTER (WHERE is_primary)::int AS primary_assets
      FROM atlas.media_assets`),
    pool.query(`SELECT array_agg(DISTINCT entity_type ORDER BY entity_type) AS entity_types,
      array_agg(DISTINCT usage_role ORDER BY usage_role) AS usage_roles
      FROM atlas.media_assets`),
  ]);
  return {
    rows: rowsResult.rows.map((row) => ({
      id: String(row.id), entityType: String(row.entity_type), entityId: String(row.entity_id),
      mediaType: String(row.media_type), usageRole: String(row.usage_role), url: String(row.url),
      altTextRu: row.alt_text_ru ?? null, author: row.author ?? null, licence: row.licence ?? null,
      sourceUrl: row.source_url ?? null, season: row.season_year === null ? null : Number(row.season_year),
      isPrimary: Boolean(row.is_primary), provenanceType: String(row.provenance_type),
      rightsStatus: String(row.rights_status), reviewStatus: String(row.review_status),
      verifiedAt: row.verified_at === null ? null : new Date(row.verified_at).toISOString(),
      derivativeCount: Number(row.derivative_count),
    })),
    filteredCount: Number(countResult.rows[0].count),
    summary: Object.fromEntries(Object.entries(summaryResult.rows[0]).map(([key, value]) => [key, Number(value)])),
    options: { entityTypes: optionsResult.rows[0].entity_types ?? [], usageRoles: optionsResult.rows[0].usage_roles ?? [] },
    page, limit,
  };
}

async function getMediaAsset(id) {
  const result = await pool.query(`
    SELECT asset.*, source.name AS data_source_name,
           coalesce(json_agg(json_build_object(
             'variant', derivative.variant, 'url', derivative.url,
             'mimeType', derivative.mime_type, 'width', derivative.width_px,
             'height', derivative.height_px, 'fileSize', derivative.file_size_bytes
           ) ORDER BY derivative.variant) FILTER (WHERE derivative.id IS NOT NULL), '[]') AS derivatives
    FROM atlas.media_assets AS asset
    LEFT JOIN atlas.data_sources AS source ON source.id = asset.source_id
    LEFT JOIN atlas.media_asset_derivatives AS derivative ON derivative.media_asset_id = asset.id
    WHERE asset.id = $1
    GROUP BY asset.id, source.name
  `, [id]);
  if (!result.rows[0]) return null;
  const row = result.rows[0];
  return {
    id: String(row.id), entityType: String(row.entity_type), entityId: String(row.entity_id),
    mediaType: String(row.media_type), usageRole: String(row.usage_role), url: String(row.url),
    altTextRu: row.alt_text_ru ?? null, author: row.author ?? null, licence: row.licence ?? null,
    sourceUrl: row.source_url ?? null, sourceId: row.source_id ?? null,
    dataSourceName: row.data_source_name ?? null,
    season: row.season_year === null ? null : Number(row.season_year), isPrimary: Boolean(row.is_primary),
    provenanceType: String(row.provenance_type), rightsStatus: String(row.rights_status),
    reviewStatus: String(row.review_status), usageScope: row.usage_scope ?? [],
    verifiedAt: row.verified_at === null ? null : new Date(row.verified_at).toISOString(),
    derivatives: row.derivatives,
  };
}

async function getCircuitMediaOrder(circuitId) {
  const [profileResult, historyResult, galleryResult] = await Promise.all([
    pool.query(`SELECT circuit_id, slug, name_ru, editorial_status
      FROM atlas.circuit_page_profiles WHERE circuit_id = $1`, [circuitId]),
    pool.query(`SELECT entry.id, entry.sort_order, entry.year_label, entry.title_ru, entry.description_ru,
        media.id AS media_asset_id, media.url, media.alt_text_ru, media.rights_status, media.review_status
      FROM atlas.circuit_history_entries AS entry
      LEFT JOIN atlas.media_assets AS media ON media.id = entry.media_asset_id
      WHERE entry.circuit_id = $1 ORDER BY entry.sort_order, entry.id`, [circuitId]),
    pool.query(`SELECT gallery.media_asset_id AS id, gallery.sort_order, gallery.title_ru, gallery.description_ru,
        media.url, media.alt_text_ru, media.rights_status, media.review_status
      FROM atlas.circuit_media_gallery AS gallery
      JOIN atlas.media_assets AS media ON media.id = gallery.media_asset_id
      WHERE gallery.circuit_id = $1 ORDER BY gallery.sort_order, gallery.media_asset_id`, [circuitId]),
  ]);
  if (!profileResult.rows[0]) return null;
  const profile = profileResult.rows[0];
  const mapItem = (row) => ({
    id: String(row.id), sortOrder: Number(row.sort_order),
    yearLabel: row.year_label === undefined || row.year_label === null ? null : String(row.year_label),
    titleRu: row.title_ru === null ? null : String(row.title_ru),
    descriptionRu: row.description_ru === null ? null : String(row.description_ru),
    mediaAssetId: row.media_asset_id === undefined || row.media_asset_id === null ? null : String(row.media_asset_id),
    url: row.url === null ? null : String(row.url), altTextRu: row.alt_text_ru === null ? null : String(row.alt_text_ru),
    rightsStatus: row.rights_status === null ? null : String(row.rights_status),
    reviewStatus: row.review_status === null ? null : String(row.review_status),
  });
  return {
    circuit: { id: String(profile.circuit_id), slug: String(profile.slug), nameRu: String(profile.name_ru), editorialStatus: String(profile.editorial_status) },
    history: historyResult.rows.map(mapItem), gallery: galleryResult.rows.map(mapItem),
  };
}

async function syncCircuitPublicData(circuitId) {
  let started = false;
  let expired = false;
  let queueTimer;
  try {
    const task=circuitExportTail.then(() => {
      if (expired) return false;
      started = true;
      return execFileAsync(process.execPath, [path.join(scriptDirectory, 'export-circuit-pages.mjs'), '--circuit', circuitId], circuitPageExportOptions);
    });
    circuitExportTail=task.catch(()=>{});
    const queueDeadline = new Promise(resolve => { queueTimer = setTimeout(() => {
      if (!started) { expired = true; resolve(false); }
    }, 20_000); });
    return Boolean(await Promise.race([task, queueDeadline]));
  } catch (error) {
    console.error('Изменения сохранены, но публичная страница трассы не синхронизирована', error);
    return false;
  } finally {
    clearTimeout(queueTimer);
  }
}

async function saveCircuitMediaOrder(circuitId, rawInput) {
  const section = String(rawInput.section ?? '');
  if (!['history', 'gallery'].includes(section)) throw new Error('Некорректный раздел материалов трассы');
  if (!Array.isArray(rawInput.orderedIds) || rawInput.orderedIds.some((id) => typeof id !== 'string' || !id.trim())) {
    throw new Error('Некорректный порядок материалов');
  }
  const orderedIds = rawInput.orderedIds.map((id) => id.trim());
  if (new Set(orderedIds).size !== orderedIds.length) throw new Error('Порядок содержит повторяющиеся записи');
  const table = section === 'history' ? 'circuit_history_entries' : 'circuit_media_gallery';
  const idColumn = section === 'history' ? 'id' : 'media_asset_id';
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const existingResult = await client.query(`SELECT ${idColumn} AS id FROM atlas.${table} WHERE circuit_id = $1 ORDER BY sort_order FOR UPDATE`, [circuitId]);
    const existingIds = existingResult.rows.map((row) => String(row.id));
    if (!existingIds.length) throw new Error('В разделе нет материалов для сортировки');
    if (existingIds.length !== orderedIds.length || existingIds.some((id) => !orderedIds.includes(id))) {
      throw new Error('Набор материалов изменился. Обновите страницу и повторите');
    }
    const maximumResult = await client.query(`SELECT coalesce(max(sort_order), 0)::int AS maximum FROM atlas.${table}`);
    const temporaryBase = Number(maximumResult.rows[0].maximum) + orderedIds.length + 1;
    if (temporaryBase + orderedIds.length > 32767) throw new Error('Не удалось выделить временный диапазон сортировки');
    await client.query(`UPDATE atlas.${table} SET sort_order = $3 + array_position($2::text[], ${idColumn}::text)
      WHERE circuit_id = $1 AND ${idColumn}::text = ANY($2::text[])`, [circuitId, orderedIds, temporaryBase]);
    await client.query(`UPDATE atlas.${table} SET sort_order = array_position($2::text[], ${idColumn}::text) - 1
      WHERE circuit_id = $1 AND ${idColumn}::text = ANY($2::text[])`, [circuitId, orderedIds]);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally { client.release(); }
  const profileResult = await pool.query('SELECT slug FROM atlas.circuit_page_profiles WHERE circuit_id = $1', [circuitId]);
  return { section, slug: profileResult.rows[0] ? String(profileResult.rows[0].slug) : circuitId, publicDataSynced: await syncCircuitPublicData(circuitId) };
}

async function saveMediaAsset(rawInput, id) {
  const optional = (field, maximum = 500) => {
    const value = typeof rawInput[field] === 'string' ? rawInput[field].trim() : '';
    return value ? value.slice(0, maximum) : null;
  };
  const altTextRu = optional('altTextRu');
  const author = optional('author');
  const licence = optional('licence');
  const usageRole = optional('usageRole', 80);
  if (!usageRole || !/^[a-z][a-z0-9_]*$/.test(usageRole)) throw new Error('Некорректное назначение материала');
  const rightsStatus = String(rawInput.rightsStatus ?? '');
  const reviewStatus = String(rawInput.reviewStatus ?? '');
  if (!['verified', 'unresolved', 'restricted'].includes(rightsStatus)) throw new Error('Некорректный статус прав');
  if (!['candidate', 'reviewed', 'published', 'hidden'].includes(reviewStatus)) throw new Error('Некорректный статус проверки');
  const sourceValue = optional('sourceUrl', 2_000);
  let sourceUrl = null;
  if (sourceValue) {
    const parsed = new URL(sourceValue);
    if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password) throw new Error('Некорректный URL источника');
    sourceUrl = parsed.href;
  }
  if (['reviewed', 'published'].includes(reviewStatus)
    && (rightsStatus !== 'verified' || !sourceUrl || !altTextRu || !author || !licence)) {
    throw new Error('Для проверки и публикации нужны подтверждённые права, источник, автор, лицензия и описание');
  }
  const client = await pool.connect();
  let committed = false;
  try {
    await client.query('BEGIN');
    const current = await client.query('SELECT entity_type, entity_id, season_year FROM atlas.media_assets WHERE id = $1 FOR UPDATE', [id]);
    if (!current.rows[0]) { await client.query('ROLLBACK'); return null; }
    let sourceId = null;
    if (sourceUrl) {
      sourceId = `media-${createHash('sha256').update(sourceUrl).digest('hex').slice(0, 16)}`;
      await client.query(`INSERT INTO atlas.data_sources (id, name, url, licence, retrieved_at, notes)
        VALUES ($1, $2, $3, $4, now(), 'Источник медиаматериала, проверенный через редакционную панель')
        ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, url = EXCLUDED.url,
          licence = EXCLUDED.licence, retrieved_at = EXCLUDED.retrieved_at, notes = EXCLUDED.notes`,
        [sourceId, new URL(sourceUrl).hostname, sourceUrl, licence]);
    }
    await client.query(`UPDATE atlas.media_assets SET usage_role = $2, alt_text_ru = $3,
      author = $4, licence = $5, source_url = $6, source_id = $7,
      rights_status = $8, review_status = $9,
      verified_at = CASE WHEN $8 = 'verified' THEN coalesce(verified_at, now()) ELSE NULL END
      WHERE id = $1`, [id, usageRole, altTextRu, author, licence, sourceUrl, sourceId, rightsStatus, reviewStatus]);
    await client.query('COMMIT'); committed = true;
    let publicDataSynced = true;
    try {
      const asset = current.rows[0];
      if (asset.entity_type === 'driver') await syncDriverPublicData(client, asset.entity_id);
      if (asset.entity_type === 'constructor' && asset.season_year) await syncConstructorPublicData(client, asset.entity_id, Number(asset.season_year));
    } catch (error) { publicDataSynced = false; console.error('Медиаматериал сохранён, но публичные данные не синхронизированы', error); }
    return { asset: await getMediaAsset(id), publicDataSynced };
  } catch (error) {
    if (!committed) await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally { client.release(); }
}

async function getTableRows(tableName, url) {
  const metadata = await getTableMetadata(tableName);
  if (!metadata) return null;
  const limit = boundedPositiveInteger(url.searchParams.get('limit'), 25, 100);
  const page = boundedPositiveInteger(url.searchParams.get('page'), 1);
  const offset = (page - 1) * limit;
  const table = `atlas.${quoteIdentifier(tableName)}`;
  const requestedFilterColumn = String(url.searchParams.get('filterColumn') ?? '');
  const filterColumn = metadata.columns.find((column) => column.name === requestedFilterColumn && column.filterable) ?? null;
  const requestedFilterOperator = String(url.searchParams.get('filterOperator') ?? '');
  const filterOperator = filterColumn && tableFilterOperators.has(requestedFilterOperator) ? requestedFilterOperator : null;
  const filterValue = String(url.searchParams.get('filterValue') ?? '').slice(0, 500);
  const hasValueFilter = filterOperator === 'contains' || filterOperator === 'equal';
  const hasFilter = Boolean(filterColumn && filterOperator && (!hasValueFilter || filterValue));
  const whereParameters = [];
  let where = '';
  if (hasFilter && filterColumn && filterOperator) {
    const column = quoteIdentifier(filterColumn.name);
    if (filterOperator === 'contains') {
      whereParameters.push(filterValue);
      where = `WHERE ${column}::text ILIKE '%' || $1 || '%'`;
    } else if (filterOperator === 'equal') {
      whereParameters.push(filterValue);
      where = `WHERE ${column}::text = $1`;
    } else if (filterOperator === 'is-null') {
      where = `WHERE ${column} IS NULL`;
    } else {
      where = `WHERE ${column} IS NOT NULL`;
    }
  }
  const requestedSortColumn = String(url.searchParams.get('sortColumn') ?? '');
  const sortColumn = metadata.columns.find((column) => column.name === requestedSortColumn && column.sortable) ?? null;
  const sortDirection = sortColumn && url.searchParams.get('sortDirection') === 'desc' ? 'desc' : 'asc';
  const fallbackOrder = metadata.primaryKey.length
    ? metadata.primaryKey.map(quoteIdentifier).join(', ')
    : 'ctid';
  const stableSecondaryOrder = sortColumn
    ? metadata.primaryKey.filter((column) => column !== sortColumn.name).map(quoteIdentifier)
    : [];
  const order = sortColumn
    ? `ORDER BY ${quoteIdentifier(sortColumn.name)} ${sortDirection.toUpperCase()} NULLS LAST${stableSecondaryOrder.length ? `, ${stableSecondaryOrder.join(', ')}` : metadata.primaryKey.length ? '' : ', ctid'}`
    : `ORDER BY ${fallbackOrder}`;
  const limitParameter = whereParameters.length + 1;
  const offsetParameter = limitParameter + 1;
  const [rowsResult, countResult] = await Promise.all([
    pool.query(`SELECT * FROM ${table} ${where} ${order} LIMIT $${limitParameter} OFFSET $${offsetParameter}`, [...whereParameters, limit, offset]),
    pool.query(`SELECT count(*)::int AS count FROM ${table} ${where}`, whereParameters),
  ]);
  return {
    ...metadata,
    rows: rowsResult.rows,
    totalRows: Number(countResult.rows[0].count),
    page,
    limit,
    filterColumn: hasFilter && filterColumn ? filterColumn.name : null,
    filterOperator: hasFilter ? filterOperator : null,
    filterValue: hasFilter && hasValueFilter ? filterValue : '',
    sortColumn: sortColumn?.name ?? null,
    sortDirection,
  };
}

function normalizeTableValue(column, value) {
  if (value === null || (value === '' && column.dataType !== 'text' && column.dataType !== 'character varying')) {
    if (!column.nullable) throw new Error(`Поле ${column.name} не может быть пустым`);
    return null;
  }
  if (typeof value !== 'string') throw new Error(`Некорректное поле ${column.name}`);
  if (value === 'null' && column.nullable) return null;
  if (column.dataType === 'boolean') {
    if (!['true', 'false'].includes(value)) throw new Error(`Поле ${column.name}: ожидается true или false`);
    return value === 'true';
  }
  if (column.dataType === 'json' || column.dataType === 'jsonb') return JSON.parse(value);
  if (column.dataType === 'ARRAY') {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) throw new Error(`Поле ${column.name}: ожидается JSON-массив`);
    return parsed;
  }
  if (['smallint', 'integer', 'bigint', 'numeric', 'real', 'double precision'].includes(column.dataType)
      && !/^-?\d+(?:\.\d+)?$/.test(value)) throw new Error(`Поле ${column.name}: ожидается число`);
  return value;
}

async function updateTableRow(tableName, rawInput) {
  const metadata = await getTableMetadata(tableName);
  if (!metadata || !metadata.primaryKey.length) return null;
  if (!rawInput || typeof rawInput !== 'object' || !rawInput.key || !rawInput.values) throw new Error('Некорректная строка');
  const key = rawInput.key;
  const values = rawInput.values;
  const editableColumns = metadata.columns.filter((column) => column.editable);
  const updates = editableColumns.filter((column) => Object.hasOwn(values, column.name));
  if (!updates.length) throw new Error('Нет полей для сохранения');
  if (metadata.primaryKey.some((column) => !Object.hasOwn(key, column))) throw new Error('Не указан первичный ключ');
  const parameters = updates.map((column) => normalizeTableValue(column, values[column.name]));
  const assignments = updates.map((column, index) => `${quoteIdentifier(column.name)} = $${index + 1}`);
  const where = metadata.primaryKey.map((column, index) => {
    parameters.push(key[column]);
    return `${quoteIdentifier(column)} = $${updates.length + index + 1}`;
  });
  const result = await pool.query(
    `UPDATE atlas.${quoteIdentifier(tableName)} SET ${assignments.join(', ')} WHERE ${where.join(' AND ')} RETURNING *`,
    parameters,
  );
  const savedRow = result.rows[0] ?? null;
  const driverId = tableName === 'drivers'
    ? savedRow?.id
    : tableName.startsWith('driver_')
      ? savedRow?.driver_id
      : tableName === 'media_assets' && savedRow?.entity_type === 'driver'
        ? savedRow.entity_id
        : null;
  if (driverId) {
    try { await syncDriverPublicData(pool, String(driverId)); }
    catch (error) { console.error(`Строка atlas.${tableName} сохранена, но каталог пилота не синхронизирован`, error); }
  }
  return savedRow;
}

function validateDriverInput(value, routeId) {
  if (!value || typeof value !== 'object' || value.id !== routeId || !/^[A-Za-z0-9_-]+$/.test(routeId)) throw new Error('Некорректный ID пилота');
  const sourceUrl = new URL(String(value.sourceUrl ?? ''));
  if (!['http:', 'https:'].includes(sourceUrl.protocol) || sourceUrl.username || sourceUrl.password) throw new Error('Некорректный URL источника');
  const date = (field) => {
    const result = optionalText(value[field]);
    if (result && (!/^\d{4}-\d{2}-\d{2}$/.test(result) || Number.isNaN(Date.parse(`${result}T00:00:00Z`)))) throw new Error(`Некорректное поле ${field}`);
    return result;
  };
  const number = (field, minimum, maximum) => {
    const result = optionalText(value[field]);
    if (result === null) return null;
    const parsed = Number(result);
    if (!Number.isFinite(parsed) || parsed < minimum || parsed > maximum) throw new Error(`Некорректное поле ${field}`);
    return String(parsed);
  };
  const input = {
    id: routeId,
    expectedRevision: optionalText(value.expectedRevision),
    nameRu: optionalText(value.nameRu),
    birthDate: date('birthDate'),
    birthPlaceRu: optionalText(value.birthPlaceRu),
    deathDate: date('deathDate'),
    heightCm: number('heightCm', 120, 230),
    weightKg: number('weightKg', 35, 200),
    biographyRu: optionalText(value.biographyRu),
    sourceUrl: sourceUrl.href,
  };
  if (!input.nameRu) throw new Error('Имя на русском обязательно');
  if (!input.expectedRevision || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3,6}Z$/.test(input.expectedRevision)) throw new Error('Обновите страницу перед сохранением');
  if (input.birthDate && input.deathDate && input.deathDate < input.birthDate) throw new Error('Дата смерти раньше даты рождения');
  return input;
}

function changedFields(current, input) {
  const fields = [
    ['birth_date', current.birthDate, input.birthDate], ['name_ru', current.nameRu, input.nameRu],
    ['birth_place_ru', current.birthPlaceRu, input.birthPlaceRu], ['death_date', current.deathDate, input.deathDate],
    ['height_cm', current.heightCm, input.heightCm], ['weight_kg', current.weightKg, input.weightKg],
    ['biography_ru', current.biographyRu, input.biographyRu],
  ];
  return fields.filter(([, before, after]) => (before || null) !== (after || null)).map(([field]) => field);
}

async function saveDriver(rawInput, routeId) {
  const input = validateDriverInput(rawInput, routeId);
  const client = await pool.connect();
  let committed = false;
  try {
    await client.query('BEGIN');
    const revision = await client.query(`SELECT to_char(updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS value
      FROM atlas.drivers WHERE id = $1 FOR UPDATE`, [input.id]);
    if (!revision.rows[0]) { await client.query('ROLLBACK'); return null; }
    if (revision.rows[0].value !== input.expectedRevision) throw new Error('Профиль изменился. Обновите страницу перед сохранением');
    const currentResult = await client.query(driverSelect, [input.id]);
    if (!currentResult.rows[0]) {
      await client.query('ROLLBACK');
      return null;
    }
    const current = mapDriver(currentResult.rows[0]);
    const fields = changedFields(current, input);
    let sourceId = null;
    if (fields.length) {
      const sourceUrl = new URL(input.sourceUrl);
      sourceId = `admin-${createHash('sha256').update(sourceUrl.href).digest('hex').slice(0, 16)}`;
      await client.query(`
        INSERT INTO atlas.data_sources (id, name, url, retrieved_at, notes)
        VALUES ($1, $2, $3, now(), 'Добавлено через локальную редакционную панель')
        ON CONFLICT (id) DO UPDATE SET retrieved_at = EXCLUDED.retrieved_at
      `, [sourceId, sourceUrl.hostname, sourceUrl.href]);
      for (const field of fields) {
        await client.query(`
          INSERT INTO atlas.driver_profile_field_sources
            (driver_id, field_name, source_id, source_url, retrieved_at, review_status, notes)
          VALUES ($1, $2, $3, $4, now(), 'reviewed', 'Ручная редакционная правка')
          ON CONFLICT (driver_id, field_name, source_id) DO UPDATE SET
            source_url = EXCLUDED.source_url, retrieved_at = EXCLUDED.retrieved_at,
            review_status = EXCLUDED.review_status, notes = EXCLUDED.notes
        `, [input.id, field, sourceId, sourceUrl.href]);
      }
    }
    if (fields.length) {
      await client.query('UPDATE atlas.drivers SET date_of_birth = $2::date WHERE id = $1', [input.id, input.birthDate]);
    }
    if (fields.some((field) => field !== 'birth_date')) {
      await client.query(`
        INSERT INTO atlas.driver_profiles
          (driver_id, name_ru, birth_place_ru, death_date, height_cm, weight_kg, biography_ru, source_id, review_status, updated_at)
        VALUES ($1, $2, $3, $4::date, $5::numeric, $6::numeric, $7, $8, 'reviewed', now())
        ON CONFLICT (driver_id) DO UPDATE SET
          name_ru = EXCLUDED.name_ru, birth_place_ru = EXCLUDED.birth_place_ru,
          death_date = EXCLUDED.death_date, height_cm = EXCLUDED.height_cm,
          weight_kg = EXCLUDED.weight_kg, biography_ru = EXCLUDED.biography_ru,
          source_id = EXCLUDED.source_id, review_status = EXCLUDED.review_status,
          updated_at = EXCLUDED.updated_at
      `, [input.id, input.nameRu, input.birthPlaceRu, input.deathDate, input.heightCm, input.weightKg, input.biographyRu, sourceId]);
    }
    await client.query('COMMIT');
    committed = true;
    let publicDataSynced = true;
    if (fields.length) {
      try { await syncDriverPublicData(client, input.id); }
      catch (error) {
        publicDataSynced = false;
        console.error('Профиль сохранён, но публичный каталог не синхронизирован', error);
      }
    }
    return { fields, publicDataSynced };
  } catch (error) {
    if (!committed) await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

function validateEditorialUrl(value) {
  const url = new URL(String(value ?? ''));
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error('Некорректный URL источника');
  return url.href;
}

function validateDriverEditorial(value, routeId) {
  if (!value || typeof value !== 'object' || !/^[A-Za-z0-9_-]+$/.test(routeId)) throw new Error('Некорректные редакционные данные');
  const expectedRevision = optionalText(value.expectedRevision);
  if (!expectedRevision || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3,6}Z$/.test(expectedRevision)) throw new Error('Обновите страницу перед сохранением');
  const sourceRows = (rows, kind) => {
    if (!Array.isArray(rows) || rows.length > 20) throw new Error(`Некорректный список ${kind}`);
    return rows.map((row, index) => {
      if (!row || typeof row !== 'object') throw new Error(`Некорректная запись ${kind}`);
      const result = { ...row, sourceUrl: validateEditorialUrl(row.sourceUrl), sortOrder: index };
      if (kind === 'прозвищ') {
        result.nameRu = optionalText(row.nameRu);
        result.nameOriginal = optionalText(row.nameOriginal);
        result.contextRu = optionalText(row.contextRu);
        if (!result.nameRu || result.nameRu.length > 120) throw new Error('Укажите прозвище на русском');
      } else {
        result.quoteRu = optionalText(row.quoteRu);
        result.quoteOriginal = optionalText(row.quoteOriginal);
        result.attributionRu = optionalText(row.attributionRu);
        result.contextRu = optionalText(row.contextRu);
        result.quoteDate = optionalText(row.quoteDate);
        if (!result.quoteRu || !result.attributionRu) throw new Error('Для цитаты обязательны текст и автор');
        if (result.quoteDate && (!/^\d{4}-\d{2}-\d{2}$/.test(result.quoteDate) || Number.isNaN(Date.parse(`${result.quoteDate}T00:00:00Z`)))) throw new Error('Некорректная дата цитаты');
      }
      return result;
    });
  };
  return { expectedRevision, nicknames: sourceRows(value.nicknames ?? [], 'прозвищ'), quotes: sourceRows(value.quotes ?? [], 'цитат') };
}

async function saveDriverEditorial(rawInput, routeId) {
  const input = validateDriverEditorial(rawInput, routeId);
  const client = await pool.connect();
  let committed = false;
  try {
    await client.query('BEGIN');
    const driver = await client.query(`SELECT to_char(updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS revision
      FROM atlas.drivers WHERE id = $1 FOR UPDATE`, [routeId]);
    if (!driver.rows[0]) { await client.query('ROLLBACK'); return null; }
    if (driver.rows[0].revision !== input.expectedRevision) throw new Error('Редакционные данные изменились. Обновите страницу перед сохранением');
    await client.query('DELETE FROM atlas.driver_nicknames WHERE driver_id = $1', [routeId]);
    await client.query('DELETE FROM atlas.driver_quotes WHERE driver_id = $1', [routeId]);
    for (const row of [...input.nicknames, ...input.quotes]) {
      const sourceId = `admin-${createHash('sha256').update(row.sourceUrl).digest('hex').slice(0, 16)}`;
      await client.query(`INSERT INTO atlas.data_sources (id, name, url, retrieved_at, notes)
        VALUES ($1, $2, $3, now(), 'Источник редакционного материала пилота')
        ON CONFLICT (id) DO UPDATE SET url = EXCLUDED.url, retrieved_at = EXCLUDED.retrieved_at`,
      [sourceId, new URL(row.sourceUrl).hostname, row.sourceUrl]);
      row.sourceId = sourceId;
    }
    for (const row of input.nicknames) await client.query(`INSERT INTO atlas.driver_nicknames
      (driver_id, name_ru, name_original, context_ru, sort_order, source_id, source_url, review_status)
      VALUES ($1, $2, $3, $4, $5, $6, $7, 'reviewed')`,
    [routeId, row.nameRu, row.nameOriginal, row.contextRu, row.sortOrder, row.sourceId, row.sourceUrl]);
    for (const row of input.quotes) await client.query(`INSERT INTO atlas.driver_quotes
      (driver_id, quote_ru, quote_original, attribution_ru, context_ru, quote_date, sort_order, source_id, source_url, review_status)
      VALUES ($1, $2, $3, $4, $5, $6::date, $7, $8, $9, 'reviewed')`,
    [routeId, row.quoteRu, row.quoteOriginal, row.attributionRu, row.contextRu, row.quoteDate, row.sortOrder, row.sourceId, row.sourceUrl]);
    await client.query('UPDATE atlas.drivers SET updated_at = now() WHERE id = $1', [routeId]);
    await client.query('COMMIT');
    committed = true;
    let publicDataSynced = true;
    try { await syncDriverPublicData(client, routeId); }
    catch (error) { publicDataSynced = false; console.error('Редакционные материалы сохранены, но публичный каталог не синхронизирован', error); }
    return { nicknames: input.nicknames.length, quotes: input.quotes.length, publicDataSynced };
  } catch (error) {
    if (!committed) await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally { client.release(); }
}

const driverPhotoPreviews = new Map();
const driverPhotoSaves = new Map();
const previewLifetimeMs = 15 * 60 * 1_000;
const maximumCachedPreviews = 4;

function pruneDriverPhotoPreviews() {
  const now = Date.now();
  for (const [token, preview] of driverPhotoPreviews) {
    if (preview.expiresAt <= now) driverPhotoPreviews.delete(token);
  }
  while (driverPhotoPreviews.size >= maximumCachedPreviews) {
    driverPhotoPreviews.delete(driverPhotoPreviews.keys().next().value);
  }
}

async function createDriverPhotoPreview(buffer, metadata, driverId) {
  if (!/^[A-Za-z0-9_-]+$/.test(driverId)) throw new Error('Некорректный ID пилота');
  imageFormat(buffer, metadata.mimeType);
  const preparedBuffer = metadata.removeBackground ? await removeDriverBackground(buffer) : buffer;
  const processed = await processDriverPortrait(preparedBuffer);
  const hash = createHash('sha256').update(buffer).update(metadata.removeBackground ? ':isnet' : ':original').digest('hex');
  const token = randomUUID();
  pruneDriverPhotoPreviews();
  driverPhotoPreviews.set(token, {
    driverId,
    hash,
    preparedBuffer,
    sourceMetadata: processed.sourceMetadata,
    variants: processed.variants,
    expiresAt: Date.now() + previewLifetimeMs,
  });
  const card = processed.variants.find((variant) => variant.name === 'card') ?? processed.variants[0];
  return {
    token,
    imageDataUrl: `data:image/webp;base64,${card.bytes.toString('base64')}`,
    backgroundRemoved: metadata.removeBackground,
    expiresInMinutes: previewLifetimeMs / 60_000,
  };
}

function consumeDriverPhotoPreview(token, driverId, hash) {
  pruneDriverPhotoPreviews();
  if (!token) return null;
  const preview = driverPhotoPreviews.get(token);
  driverPhotoPreviews.delete(token);
  if (!preview || preview.driverId !== driverId || preview.hash !== hash) {
    throw new Error('Предпросмотр устарел. Создайте его ещё раз перед сохранением');
  }
  return preview;
}

async function saveDriverPhoto(buffer, rawMetadata, driverId) {
  const previous = driverPhotoSaves.get(driverId) ?? Promise.resolve();
  let unlock;
  const current = new Promise((resolve) => { unlock = resolve; });
  driverPhotoSaves.set(driverId, current);
  await previous;
  try {
    return await saveDriverPhotoUnlocked(buffer, rawMetadata, driverId);
  } finally {
    unlock();
    if (driverPhotoSaves.get(driverId) === current) driverPhotoSaves.delete(driverId);
  }
}

async function saveDriverPhotoUnlocked(buffer, rawMetadata, driverId) {
  if (!/^[A-Za-z0-9_-]+$/.test(driverId)) throw new Error('Некорректный ID пилота');
  const metadata = rawMetadata;
  const format = imageFormat(buffer, metadata.mimeType);
  const hash = createHash('sha256').update(buffer).update(metadata.removeBackground ? ':isnet' : ':original').digest('hex');
  const cachedPreview = consumeDriverPhotoPreview(metadata.previewToken, driverId, hash);
  if (!cachedPreview) throw new Error('Сначала создайте предпросмотр фотографии');
  const { sourceMetadata } = cachedPreview;
  const { variants: generatedVariants } = await processDriverPortrait(cachedPreview.preparedBuffer, metadata.crop);
  const uploadId = randomUUID();
  const assetId = `driver-${driverId}-portrait-${uploadId}`;
  const sourceId = `media-${createHash('sha256').update(metadata.sourceUrl).digest('hex').slice(0, 16)}`;
  const { publicBucket, sourceBucket } = storageConfig();
  const originalStoragePath = `drivers/${driverId}/${uploadId}/original.${format.extension}`;

  const originalUrl = storageObjectUrl(sourceBucket, originalStoragePath);

  const processed = generatedVariants.map((variant) => {
    const storagePath = `drivers/${driverId}/${uploadId}/${variant.name}.webp`;
    return {
      ...variant,
      storagePath,
      url: storagePublicUrl(publicBucket, storagePath),
    };
  });

  const publicUrl = processed[0].url;

  const uploadJobs = [
    { bucket: sourceBucket, storagePath: originalStoragePath, bytes: buffer,
      contentType: format.mimeType, cacheControl: '3600', upsert: false },
    ...processed.map((variant) => ({
      bucket: publicBucket, storagePath: variant.storagePath, bytes: variant.bytes,
      contentType: 'image/webp', upsert: false,
    })),
  ];
  const uploads = await Promise.allSettled(uploadJobs.map((job) => uploadStorageObject(job)));
  const uploadedObjects = uploads.flatMap((result) => result.status === 'fulfilled' ? [result.value] : []);
  const failedUpload = uploads.find((result) => result.status === 'rejected');
  if (failedUpload) {
    await Promise.allSettled(uploadedObjects.map(deleteStorageObject));
    throw failedUpload.reason;
  }

  try {
    await saveSupabaseDriverPhoto({
      driverId, assetId, sourceId, sourceUrl: metadata.sourceUrl,
      altTextRu: metadata.altTextRu, author: metadata.author, licence: metadata.licence,
      url: publicUrl,
      original: { url: originalUrl, mimeType: format.mimeType,
        width: sourceMetadata.width, height: sourceMetadata.height, fileSize: buffer.length },
      variants: processed.map((variant) => ({ name: variant.name, url: variant.url,
        width: variant.width, height: variant.height, fileSize: variant.bytes.length })),
    });
  } catch (error) {
    // The RPC may have committed before the connection failed. Keep the objects
    // so a committed media row cannot point to deleted files.
    const registered = await isSupabaseDriverPhotoRegistered(assetId).catch(() => false);
    if (!registered) {
      throw new Error('Статус сохранения фотографии в Supabase не подтверждён. Файлы сохранены для восстановления', { cause: error });
    }
  }

  let client;
  let committed = false;
  try {
    client = await pool.connect();
    await client.query('BEGIN');
    const driver = await client.query('SELECT id FROM atlas.drivers WHERE id = $1 FOR UPDATE', [driverId]);
    if (!driver.rows[0]) {
      throw new Error('Пилот не найден в локальной базе');
    }
    await client.query(`
      INSERT INTO atlas.data_sources (id, name, url, licence, retrieved_at, notes)
      VALUES ($1, $2, $3, $4, now(), 'Источник фотографии, добавленной через редакционную панель')
      ON CONFLICT (id) DO UPDATE SET
        name = EXCLUDED.name, url = EXCLUDED.url, licence = EXCLUDED.licence,
        retrieved_at = EXCLUDED.retrieved_at, notes = EXCLUDED.notes
    `, [sourceId, new URL(metadata.sourceUrl).hostname, metadata.sourceUrl, metadata.licence]);
    await client.query(`
      UPDATE atlas.media_assets
      SET is_primary = false
      WHERE entity_type = 'driver' AND entity_id = $1 AND media_type = 'image'
        AND usage_role = 'portrait' AND is_primary
    `, [driverId]);
    await client.query(`
      INSERT INTO atlas.media_assets
        (id, entity_type, entity_id, media_type, url, alt_text_ru, author, licence,
         source_url, is_primary, usage_role, source_id, provenance_type, rights_status,
         review_status, verified_at, usage_scope)
      VALUES ($1, 'driver', $2, 'image', $3, $4, $5, $6, $7, true, 'portrait', $8,
              'provided_by_user', 'verified', 'reviewed', now(), ARRAY['driver_catalog', 'driver_profile'])
      ON CONFLICT (id) DO UPDATE SET
        url = EXCLUDED.url, alt_text_ru = EXCLUDED.alt_text_ru, author = EXCLUDED.author,
        licence = EXCLUDED.licence, source_url = EXCLUDED.source_url, is_primary = true,
        source_id = EXCLUDED.source_id, provenance_type = EXCLUDED.provenance_type,
        rights_status = EXCLUDED.rights_status, review_status = EXCLUDED.review_status,
        verified_at = EXCLUDED.verified_at, usage_scope = EXCLUDED.usage_scope
    `, [assetId, driverId, publicUrl, metadata.altTextRu, metadata.author, metadata.licence, metadata.sourceUrl, sourceId]);
    await client.query(`
      INSERT INTO atlas.media_asset_derivatives
        (id, media_asset_id, variant, url, mime_type, width_px, height_px, file_size_bytes)
      VALUES ($1, $2, 'original', $3, $4, $5, $6, $7)
      ON CONFLICT (media_asset_id, variant) DO UPDATE SET
        url = EXCLUDED.url, mime_type = EXCLUDED.mime_type,
        width_px = EXCLUDED.width_px, height_px = EXCLUDED.height_px,
        file_size_bytes = EXCLUDED.file_size_bytes, created_at = now()
    `, [`${assetId}-original`, assetId, originalUrl, format.mimeType,
      sourceMetadata.width ?? null, sourceMetadata.height ?? null, buffer.length]);
    for (const variant of processed) {
      await client.query(`
        INSERT INTO atlas.media_asset_derivatives
          (id, media_asset_id, variant, url, mime_type, width_px, height_px, file_size_bytes)
        VALUES ($1, $2, $3, $4, 'image/webp', $5, $6, $7)
        ON CONFLICT (media_asset_id, variant) DO UPDATE SET
          url = EXCLUDED.url, mime_type = EXCLUDED.mime_type,
          width_px = EXCLUDED.width_px, height_px = EXCLUDED.height_px,
          file_size_bytes = EXCLUDED.file_size_bytes, created_at = now()
      `, [`${assetId}-${variant.name}`, assetId, variant.name, variant.url,
        variant.width, variant.height, variant.bytes.length]);
    }
    await client.query('COMMIT');
    committed = true;
    let publicDataSynced = true;
    try { await syncDriverPublicData(client, driverId); }
    catch (error) {
      publicDataSynced = false;
      console.error('Фотография сохранена, но публичный каталог не синхронизирован', error);
    }
    return {
      url: publicUrl,
      publicDataSynced,
      format: 'image/webp',
      backgroundRemoved: metadata.removeBackground,
      variants: Object.fromEntries(processed.map((variant) => [variant.name, variant.url])),
    };
  } catch (error) {
    if (client && !committed) await client.query('ROLLBACK').catch(() => {});
    console.error('Фотография сохранена в Supabase, но локальная копия не обновлена', error);
    return {
      url: publicUrl, publicDataSynced: false, format: 'image/webp',
      backgroundRemoved: metadata.removeBackground,
      variants: Object.fromEntries(processed.map((variant) => [variant.name, variant.url])),
    };
  } finally {
    client?.release();
  }
}

const constructorCarPreviews = new Map();
const gameLogoPreviews = new Map();

async function getConstructorLineages(url) {
  const query = (url.searchParams.get('q') ?? '').trim().slice(0, 120);
  const status = (url.searchParams.get('status') ?? '').trim();
  const values = [];
  const filters = [];
  if (query) {
    values.push(`%${query}%`);
    filters.push(`(predecessor.name ILIKE $${values.length} OR successor.name ILIKE $${values.length}
      OR link.predecessor_constructor_id ILIKE $${values.length} OR link.successor_constructor_id ILIKE $${values.length})`);
  }
  if (status) {
    if (!['candidate', 'reviewed', 'published', 'rejected'].includes(status)) throw new Error('Некорректный статус связи');
    values.push(status);
    filters.push(`link.review_status = $${values.length}`);
  }
  const [links, constructors] = await Promise.all([
    pool.query(`SELECT link.id, link.predecessor_constructor_id, predecessor.name AS predecessor_name,
        link.successor_constructor_id, successor.name AS successor_name, link.relationship_type,
        link.valid_from_year, link.valid_to_year, link.description_ru, link.review_status,
        source.url AS source_url, link.verified_at
      FROM atlas.constructor_lineage_links AS link
      JOIN atlas.constructors AS predecessor ON predecessor.id = link.predecessor_constructor_id
      JOIN atlas.constructors AS successor ON successor.id = link.successor_constructor_id
      JOIN atlas.data_sources AS source ON source.id = link.source_id
      ${filters.length ? `WHERE ${filters.join(' AND ')}` : ''}
      ORDER BY coalesce(link.valid_from_year, 9999), lower(predecessor.name), lower(successor.name)`, values),
    pool.query(`SELECT constructor.id, constructor.name,
        min(entry.season_year)::int AS first_season, max(entry.season_year)::int AS latest_season
      FROM atlas.constructors AS constructor
      LEFT JOIN atlas.constructor_entries AS entry ON entry.constructor_id = constructor.id
      GROUP BY constructor.id, constructor.name
      ORDER BY lower(constructor.name), constructor.id`),
  ]);
  return {
    rows: links.rows.map((row) => ({
      id: Number(row.id), predecessorConstructorId: String(row.predecessor_constructor_id), predecessorName: String(row.predecessor_name),
      successorConstructorId: String(row.successor_constructor_id), successorName: String(row.successor_name),
      relationshipType: String(row.relationship_type), validFromYear: row.valid_from_year === null ? null : Number(row.valid_from_year),
      validToYear: row.valid_to_year === null ? null : Number(row.valid_to_year), descriptionRu: row.description_ru === null ? null : String(row.description_ru),
      reviewStatus: String(row.review_status), sourceUrl: String(row.source_url), verifiedAt: row.verified_at === null ? null : String(row.verified_at),
    })),
    constructors: constructors.rows.map((row) => ({
      id: String(row.id), name: String(row.name), firstSeason: row.first_season === null ? null : Number(row.first_season),
      latestSeason: row.latest_season === null ? null : Number(row.latest_season),
    })),
  };
}

async function saveConstructorLineage(rawInput, linkId = null) {
  const predecessorId = optionalText(rawInput.predecessorConstructorId);
  const successorId = optionalText(rawInput.successorConstructorId);
  const relationshipType = optionalText(rawInput.relationshipType);
  const reviewStatus = optionalText(rawInput.reviewStatus) ?? 'candidate';
  if (!predecessorId || !successorId || predecessorId === successorId) throw new Error('Выберите две разные команды');
  if (!['rename', 'ownership_change', 'factory_takeover', 'licence_transfer', 'continuation', 'other'].includes(relationshipType)) throw new Error('Некорректный тип связи');
  if (!['candidate', 'reviewed', 'published', 'rejected'].includes(reviewStatus)) throw new Error('Некорректный статус связи');
  const validFromYear = rawInput.validFromYear === null || rawInput.validFromYear === '' ? null : optionalInteger(rawInput.validFromYear, 'начальный год', 1950);
  const validToYear = rawInput.validToYear === null || rawInput.validToYear === '' ? null : optionalInteger(rawInput.validToYear, 'конечный год', 1950);
  if ((validFromYear ?? 0) > 2100 || (validToYear ?? 0) > 2100 || (validFromYear !== null && validToYear !== null && validToYear < validFromYear)) throw new Error('Некорректный период связи');
  const sourceUrl = new URL(String(rawInput.sourceUrl ?? '').trim());
  if (!['http:', 'https:'].includes(sourceUrl.protocol) || sourceUrl.username || sourceUrl.password) throw new Error('Некорректный источник');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const constructors = await client.query('SELECT id FROM atlas.constructors WHERE id = ANY($1::text[])', [[predecessorId, successorId]]);
    if (constructors.rowCount !== 2) throw new Error('Команда не найдена');
    const sourceId = `constructor-lineage-${createHash('sha256').update(sourceUrl.href).digest('hex').slice(0, 24)}`;
    await client.query(`INSERT INTO atlas.data_sources(id,name,url,retrieved_at,notes)
      VALUES($1,$2,$3,now(),'Источник связи преемственности команды')
      ON CONFLICT(id) DO UPDATE SET name=EXCLUDED.name,url=EXCLUDED.url,retrieved_at=now()`, [sourceId, sourceUrl.hostname, sourceUrl.href]);
    const parameters = [predecessorId, successorId, relationshipType, validFromYear, validToYear,
      optionalText(rawInput.descriptionRu), sourceId, reviewStatus, reviewStatus === 'candidate' ? null : new Date()];
    let result;
    if (linkId === null) {
      result = await client.query(`INSERT INTO atlas.constructor_lineage_links
        (predecessor_constructor_id,successor_constructor_id,relationship_type,valid_from_year,valid_to_year,description_ru,source_id,review_status,verified_at)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`, parameters);
    } else {
      result = await client.query(`UPDATE atlas.constructor_lineage_links SET
        predecessor_constructor_id=$1,successor_constructor_id=$2,relationship_type=$3,valid_from_year=$4,valid_to_year=$5,
        description_ru=$6,source_id=$7,review_status=$8,verified_at=$9,updated_at=now() WHERE id=$10 RETURNING id`, [...parameters, linkId]);
    }
    await client.query('COMMIT');
    return result.rows[0] ? { id: Number(result.rows[0].id) } : null;
  } catch (error) { await client.query('ROLLBACK'); throw error; }
  finally { client.release(); }
}

async function deleteConstructorLineage(linkId) {
  const result = await pool.query('DELETE FROM atlas.constructor_lineage_links WHERE id=$1 RETURNING id', [linkId]);
  return result.rows[0] ? { id: Number(result.rows[0].id) } : null;
}

function validHistoryEraSlug(value) {
  const slug = String(value ?? '').trim();
  if (!/^(?:\d{4}-\d{4}|\d{4}-present)$/.test(slug)) throw new Error('Некорректный идентификатор эпохи');
  return slug;
}

function mapHistoryEra(row) {
  return {
    slug: String(row.slug),
    startYear: Number(row.start_year),
    endYear: row.end_year === null ? null : Number(row.end_year),
    yearsLabel: String(row.years_label),
    titleRu: String(row.title_ru),
    summaryRu: String(row.summary_ru),
    editorialStatus: String(row.editorial_status),
    heroMediaAssetId: row.hero_media_asset_id === null ? null : String(row.hero_media_asset_id),
    blockCount: Number(row.block_count ?? 0),
    publishedBlockCount: Number(row.published_block_count ?? 0),
    updatedAt: new Date(row.updated_at).toISOString(),
  };
}

function mapHistoryEraBlock(row) {
  return {
    id: Number(row.id),
    eraSlug: String(row.era_slug),
    sortOrder: Number(row.sort_order),
    blockType: String(row.block_type),
    eyebrowRu: row.eyebrow_ru === null ? null : String(row.eyebrow_ru),
    titleRu: row.title_ru === null ? null : String(row.title_ru),
    bodyRu: row.body_ru === null ? null : String(row.body_ru),
    mediaAssetId: row.media_asset_id === null ? null : String(row.media_asset_id),
    mediaPosition: row.media_position === null ? 'wide' : String(row.media_position),
    sourceUrl: row.source_url === null ? null : String(row.source_url),
    editorialStatus: String(row.editorial_status),
    updatedAt: new Date(row.updated_at).toISOString(),
  };
}

const historyEraSelect = `SELECT era.*,
  count(block.id)::int AS block_count,
  count(block.id) FILTER (WHERE block.editorial_status = 'published')::int AS published_block_count
  FROM atlas.history_eras AS era
  LEFT JOIN atlas.history_era_blocks AS block ON block.era_slug = era.slug`;

async function getHistoryEras() {
  const result = await pool.query(`${historyEraSelect}
    GROUP BY era.slug ORDER BY era.start_year, era.slug`);
  return { rows: result.rows.map(mapHistoryEra) };
}

async function getHistoryEra(slugValue) {
  const slug = validHistoryEraSlug(slugValue);
  const [eraResult, blockResult] = await Promise.all([
    pool.query(`${historyEraSelect} WHERE era.slug = $1 GROUP BY era.slug`, [slug]),
    pool.query(`SELECT block.*, coalesce(block.source_url, source.url) AS source_url
      FROM atlas.history_era_blocks AS block
      LEFT JOIN atlas.data_sources AS source ON source.id = block.source_id
      WHERE block.era_slug = $1 ORDER BY block.sort_order, block.id`, [slug]),
  ]);
  if (!eraResult.rows[0]) return null;
  return { era: mapHistoryEra(eraResult.rows[0]), blocks: blockResult.rows.map(mapHistoryEraBlock) };
}

function historyEraStatus(value) {
  const status = String(value ?? '').trim();
  if (!['draft', 'review', 'published'].includes(status)) throw new Error('Некорректный редакционный статус');
  return status;
}

async function syncHistoryEraPublicData() {
  try {
    await execFileAsync(process.execPath, [path.join(scriptDirectory, 'export-history-eras.mjs')], {
      cwd: repositoryRoot, env: process.env, maxBuffer: 8 * 1024 * 1024, windowsHide: true,
    });
    return true;
  } catch (error) {
    console.error('Историческая эпоха сохранена, но публичный экспорт не обновлён', error);
    return false;
  }
}

async function saveHistoryEra(rawInput, slugValue) {
  const slug = validHistoryEraSlug(slugValue);
  const yearsLabel = optionalText(rawInput?.yearsLabel);
  const titleRu = optionalText(rawInput?.titleRu);
  const summaryRu = optionalText(rawInput?.summaryRu);
  const editorialStatus = historyEraStatus(rawInput?.editorialStatus);
  const heroMediaAssetId = optionalText(rawInput?.heroMediaAssetId);
  if (!yearsLabel || !titleRu || !summaryRu) throw new Error('Заполните подпись периода, заголовок и аннотацию');
  if (yearsLabel.length > 80 || titleRu.length > 180 || summaryRu.length > 2_000) throw new Error('Текст эпохи превышает допустимую длину');
  if (editorialStatus === 'published') {
    const publishedBlocks = await pool.query(`SELECT count(*)::int AS count FROM atlas.history_era_blocks
      WHERE era_slug=$1 AND editorial_status='published'`, [slug]);
    if (Number(publishedBlocks.rows[0]?.count ?? 0) === 0) throw new Error('До публикации эпохи опубликуйте хотя бы один блок');
  }
  const result = await pool.query(`UPDATE atlas.history_eras SET
      years_label=$1,title_ru=$2,summary_ru=$3,editorial_status=$4,hero_media_asset_id=$5,updated_at=now()
    WHERE slug=$6 RETURNING slug`, [yearsLabel, titleRu, summaryRu, editorialStatus, heroMediaAssetId, slug]);
  if (!result.rows[0]) return null;
  return { slug, publicDataSynced: await syncHistoryEraPublicData() };
}

async function saveHistoryEraBlock(rawInput, eraSlugValue, blockId = null) {
  const eraSlug = validHistoryEraSlug(eraSlugValue);
  const sortOrder = blockId === null ? optionalInteger(rawInput?.sortOrder, 'порядок блока') : null;
  if (sortOrder !== null && sortOrder > 9999) throw new Error('Некорректный порядок блока');
  const blockType = String(rawInput?.blockType ?? '').trim();
  const editorialStatus = historyEraStatus(rawInput?.editorialStatus);
  if (!['text', 'media', 'quote', 'timeline', 'entities'].includes(blockType)) throw new Error('Некорректный тип блока');
  const mediaAssetId = optionalText(rawInput?.mediaAssetId);
  const mediaPosition = mediaAssetId ? String(rawInput?.mediaPosition ?? '').trim() : null;
  if (mediaAssetId && !['left', 'right', 'wide'].includes(mediaPosition)) throw new Error('Некорректное положение изображения');
  const eyebrowRu = optionalText(rawInput?.eyebrowRu);
  const titleRu = optionalText(rawInput?.titleRu);
  const bodyRu = optionalText(rawInput?.bodyRu);
  if (['text', 'quote'].includes(blockType) && !bodyRu) throw new Error('Текст блока обязателен');
  if (blockType === 'media' && !mediaAssetId) throw new Error('Для медиаблока выберите материал');
  const sourceValue = optionalText(rawInput?.sourceUrl);
  if (editorialStatus === 'published' && !sourceValue) throw new Error('Для публикации укажите источник');
  let sourceUrl = null;
  let sourceId = null;
  if (sourceValue) {
    sourceUrl = new URL(sourceValue);
    if (!['http:', 'https:'].includes(sourceUrl.protocol) || sourceUrl.username || sourceUrl.password) throw new Error('Некорректный URL источника');
    sourceId = `history-era-${createHash('sha256').update(sourceUrl.href).digest('hex').slice(0, 24)}`;
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    if (sourceId) {
      await client.query(`INSERT INTO atlas.data_sources(id,name,url,retrieved_at,notes)
        VALUES($1,$2,$3,now(),'Источник редакционного блока исторической эпохи')
        ON CONFLICT(id) DO UPDATE SET name=EXCLUDED.name,url=EXCLUDED.url,retrieved_at=now()`,
      [sourceId, sourceUrl.hostname, sourceUrl.href]);
    }
    let result;
    if (blockId === null) {
      result = await client.query(`INSERT INTO atlas.history_era_blocks
        (era_slug,sort_order,block_type,eyebrow_ru,title_ru,body_ru,media_asset_id,media_position,source_id,source_url,editorial_status)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id`,
      [eraSlug, sortOrder, blockType, eyebrowRu, titleRu, bodyRu, mediaAssetId,
        mediaPosition, sourceId, sourceUrl?.href ?? null, editorialStatus]);
    } else {
      result = await client.query(`UPDATE atlas.history_era_blocks SET
        block_type=$1,eyebrow_ru=$2,title_ru=$3,body_ru=$4,media_asset_id=$5,
        media_position=$6,source_id=$7,source_url=$8,editorial_status=$9,updated_at=now()
        WHERE id=$10 AND era_slug=$11 RETURNING id`,
      [blockType, eyebrowRu, titleRu, bodyRu, mediaAssetId, mediaPosition, sourceId,
        sourceUrl?.href ?? null, editorialStatus, blockId, eraSlug]);
    }
    await client.query('COMMIT');
    if (!result.rows[0]) return null;
    return { id: Number(result.rows[0].id), publicDataSynced: await syncHistoryEraPublicData() };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function deleteHistoryEraBlock(blockId) {
  const result = await pool.query('DELETE FROM atlas.history_era_blocks WHERE id=$1 RETURNING id', [blockId]);
  if (!result.rows[0]) return null;
  return { id: Number(result.rows[0].id), publicDataSynced: await syncHistoryEraPublicData() };
}

async function saveHistoryEraBlockOrder(eraSlugValue, rawInput) {
  const eraSlug = validHistoryEraSlug(eraSlugValue);
  let orderedIds;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const eraResult = await client.query('SELECT slug FROM atlas.history_eras WHERE slug=$1 FOR UPDATE', [eraSlug]);
    if (!eraResult.rows[0]) throw new Error('Историческая эпоха не найдена');
    const existingResult = await client.query(`SELECT id, sort_order
      FROM atlas.history_era_blocks
      WHERE era_slug=$1
      ORDER BY sort_order,id
      FOR UPDATE`, [eraSlug]);
    const plan = planHistoryEraBlockOrder(existingResult.rows, rawInput);
    orderedIds = plan.orderedIds;

    if (orderedIds.length) {
      await client.query(`UPDATE atlas.history_era_blocks
        SET sort_order=$3 + array_position($2::bigint[],id) - 1,updated_at=now()
        WHERE era_slug=$1 AND id=ANY($2::bigint[])`, [eraSlug, orderedIds, plan.temporaryBase]);
      await client.query(`UPDATE atlas.history_era_blocks
        SET sort_order=array_position($2::bigint[],id) - 1,updated_at=now()
        WHERE era_slug=$1 AND id=ANY($2::bigint[])`, [eraSlug, orderedIds]);
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
  return { eraSlug, orderedIds, publicDataSynced: await syncHistoryEraPublicData() };
}

function validSeason(value) {
  const season = Number(value);
  if (!Number.isInteger(season) || season < 1950 || season > 2100) throw new Error('Некорректный сезон');
  return season;
}

function pruneConstructorCarPreviews() {
  const now = Date.now();
  for (const [token, preview] of constructorCarPreviews) {
    if (preview.expiresAt <= now) constructorCarPreviews.delete(token);
  }
  while (constructorCarPreviews.size >= maximumCachedPreviews) {
    constructorCarPreviews.delete(constructorCarPreviews.keys().next().value);
  }
}

function pruneGameLogoPreviews() {
  const now = Date.now();
  for (const [token, preview] of gameLogoPreviews) {
    if (preview.expiresAt <= now) gameLogoPreviews.delete(token);
  }
  while (gameLogoPreviews.size >= maximumCachedPreviews) {
    gameLogoPreviews.delete(gameLogoPreviews.keys().next().value);
  }
}

function validGameId(gameId) {
  if (!['outline', 'map', 'driver-geography', 'calendar-optimizer'].includes(gameId)) throw new Error('Неизвестная игра');
  return gameId;
}

async function createGameLogoPreview(buffer, metadata, gameId) {
  const id = validGameId(gameId);
  imageFormat(buffer, metadata.mimeType);
  const processed = await processConstructorLogo(buffer);
  const hash = createHash('sha256').update(buffer).update(':game-logo').digest('hex');
  const token = randomUUID();
  pruneGameLogoPreviews();
  gameLogoPreviews.set(token, {
    owner: id, hash, preparedBuffer: buffer, sourceMetadata: processed.sourceMetadata,
    expiresAt: Date.now() + previewLifetimeMs,
  });
  const card = processed.variants.find((variant) => variant.name === 'card') ?? processed.variants[0];
  return { token, imageDataUrl: `data:image/webp;base64,${card.bytes.toString('base64')}`,
    expiresInMinutes: previewLifetimeMs / 60_000 };
}

function consumeGameLogoPreview(token, owner, hash) {
  pruneGameLogoPreviews();
  if (!token) return null;
  const preview = gameLogoPreviews.get(token);
  gameLogoPreviews.delete(token);
  if (!preview || preview.owner !== owner || preview.hash !== hash) {
    throw new Error('Предпросмотр устарел. Создайте его ещё раз перед сохранением');
  }
  return preview;
}

async function saveGameLogo(buffer, metadata, gameId) {
  const id = validGameId(gameId);
  const format = imageFormat(buffer, metadata.mimeType);
  const hash = createHash('sha256').update(buffer).update(':game-logo').digest('hex');
  const cachedPreview = consumeGameLogoPreview(metadata.previewToken, id, hash);
  if (!cachedPreview) throw new Error('Сначала создайте предпросмотр изображения');
  const { variants } = await processConstructorLogo(cachedPreview.preparedBuffer, metadata.crop);
  const baseUrl = `/media/games/${id}`;
  const suffix = hash.slice(0, 16);
  const originalUrl = `${baseUrl}/original-${suffix}.${format.extension}`;
  const processed = variants.map((variant) => ({ ...variant, url: `${baseUrl}/${variant.name}-${suffix}.webp` }));
  const publicUrl = processed.find((variant) => variant.name === 'large')?.url ?? processed[0].url;
  const outputs = [{ url: originalUrl, bytes: buffer }, ...processed.map((variant) => ({ url: variant.url, bytes: variant.bytes }))];
  const createdPaths = [];
  await mkdir(path.resolve('apps', 'web', 'public', baseUrl.replace(/^\/+/, '')), { recursive: true });
  for (const output of outputs) {
    const outputPath = path.resolve('apps', 'web', 'public', output.url.replace(/^\/+/, ''));
    let existed = true;
    try { await access(outputPath); } catch { existed = false; }
    await writeFile(outputPath, output.bytes);
    if (!existed) createdPaths.push(outputPath);
  }
  try {
    const current = JSON.parse(await readFile(gamesMediaPath, 'utf8'));
    const next = {
      schemaVersion: 1,
      logos: { outline: null, map: null, 'driver-geography': null, 'calendar-optimizer': null, ...(current.logos ?? {}), [id]: publicUrl },
      credits: { outline: null, map: null, 'driver-geography': null, 'calendar-optimizer': null, ...(current.credits ?? {}), [id]: {
        altTextRu: metadata.altTextRu, author: metadata.author, licence: metadata.licence, sourceUrl: metadata.sourceUrl,
      } },
    };
    const temporaryPath = `${gamesMediaPath}.tmp-${process.pid}`;
    await writeFile(temporaryPath, `${JSON.stringify(next, null, 2)}\n`, 'utf8');
    await rename(temporaryPath, gamesMediaPath);
  } catch (error) {
    await Promise.all(createdPaths.map((filePath) => unlink(filePath).catch(() => {})));
    throw error;
  }
  return { url: publicUrl, variants: Object.fromEntries(processed.map((variant) => [variant.name, variant.url])) };
}

async function getConstructorEntries(url) {
  const season = validSeason(url.searchParams.get('season') ?? new Date().getUTCFullYear());
  const search = String(url.searchParams.get('q') ?? '').trim().slice(0, 120);
  const result = await pool.query(`
    SELECT entry.season_year, entry.constructor_id, entry.display_name, entry.engine_name,
           entry.team_colour, entry.car_model, entry.car_image_url, entry.logo_image_url,
           car_asset.author AS car_author, car_asset.licence AS car_licence,
           car_asset.source_url AS car_source_url, car_asset.alt_text_ru AS car_alt_text_ru,
           car_asset.rights_status AS car_rights_status, car_asset.review_status AS car_review_status,
           logo_asset.author AS logo_author, logo_asset.licence AS logo_licence,
           logo_asset.source_url AS logo_source_url, logo_asset.alt_text_ru AS logo_alt_text_ru,
           logo_asset.rights_status AS logo_rights_status, logo_asset.review_status AS logo_review_status,
           editorial.source_url AS editorial_source_url
    FROM atlas.constructor_entries AS entry
    LEFT JOIN LATERAL (
      SELECT media.author, media.licence, media.source_url, media.alt_text_ru,
             media.rights_status, media.review_status
      FROM atlas.media_assets AS media
      WHERE media.entity_type = 'constructor' AND media.entity_id = entry.constructor_id
        AND media.media_type = 'image' AND media.usage_role = 'constructor_car'
        AND media.season_year = entry.season_year AND media.is_primary
      ORDER BY media.verified_at DESC NULLS LAST, media.id
      LIMIT 1
    ) AS car_asset ON true
    LEFT JOIN LATERAL (
      SELECT media.author, media.licence, media.source_url, media.alt_text_ru,
             media.rights_status, media.review_status
      FROM atlas.media_assets AS media
      WHERE media.entity_type = 'constructor' AND media.entity_id = entry.constructor_id
        AND media.media_type = 'image' AND media.usage_role = 'team_logo'
        AND media.season_year = entry.season_year AND media.is_primary
      ORDER BY media.verified_at DESC NULLS LAST, media.id
      LIMIT 1
    ) AS logo_asset ON true
    LEFT JOIN LATERAL (
      SELECT source.source_url
      FROM atlas.constructor_entry_field_sources AS source
      WHERE source.season_year = entry.season_year AND source.constructor_id = entry.constructor_id
      ORDER BY source.retrieved_at DESC
      LIMIT 1
    ) AS editorial ON true
    WHERE entry.season_year = $1
      AND ($2 = '' OR entry.display_name ILIKE '%' || $2 || '%'
        OR entry.constructor_id ILIKE '%' || $2 || '%' OR entry.car_model ILIKE '%' || $2 || '%')
    ORDER BY lower(entry.display_name), entry.constructor_id
  `, [season, search]);
  return { season, rows: result.rows.map(mapConstructorEntry) };
}

function mapConstructorEntry(row) {
  return {
    season: Number(row.season_year), constructorId: String(row.constructor_id),
    displayName: String(row.display_name), engineName: row.engine_name ?? null,
    teamColour: row.team_colour?.trim() ?? null, carModel: row.car_model ?? null,
    carImageUrl: row.car_image_url ?? null, logoImageUrl: row.logo_image_url ?? null,
    editorialSourceUrl: row.editorial_source_url ?? null,
    carMedia: row.car_source_url ? {
      altTextRu: row.car_alt_text_ru ?? '', author: row.car_author ?? '', licence: row.car_licence ?? '',
      sourceUrl: row.car_source_url, rightsStatus: row.car_rights_status, reviewStatus: row.car_review_status,
    } : null,
    logoMedia: row.logo_source_url ? {
      altTextRu: row.logo_alt_text_ru ?? '', author: row.logo_author ?? '', licence: row.logo_licence ?? '',
      sourceUrl: row.logo_source_url, rightsStatus: row.logo_rights_status, reviewStatus: row.logo_review_status,
    } : null,
  };
}

async function getConstructorEntry(season, constructorId) {
  const url = new URL(`http://local/?season=${season}&q=${encodeURIComponent(constructorId)}`);
  const result = await getConstructorEntries(url);
  return result.rows.find((entry) => entry.constructorId === constructorId) ?? null;
}

async function saveConstructorEntry(rawInput, season, constructorId) {
  const resolvedSeason = validSeason(season);
  if (!/^[A-Za-z0-9_-]+$/.test(constructorId)) throw new Error('Некорректный ID команды');
  const requiredText = (field, maximum = 250) => {
    const value = typeof rawInput[field] === 'string' ? rawInput[field].trim() : '';
    if (!value || value.length > maximum) throw new Error(`Некорректное поле ${field}`);
    return value;
  };
  const nullableText = (field, maximum = 250) => {
    if (rawInput[field] === null || rawInput[field] === '') return null;
    return requiredText(field, maximum);
  };
  const displayName = requiredText('displayName');
  const engineName = nullableText('engineName');
  const carModel = nullableText('carModel');
  const teamColour = nullableText('teamColour', 7);
  if (teamColour && !/^#[0-9A-Fa-f]{6}$/.test(teamColour)) throw new Error('Цвет должен быть в формате #RRGGBB');
  const sourceUrl = new URL(requiredText('sourceUrl', 2_000));
  if (!['http:', 'https:'].includes(sourceUrl.protocol) || sourceUrl.username || sourceUrl.password) throw new Error('Некорректный URL источника');
  const client = await pool.connect();
  let committed = false;
  try {
    await client.query('BEGIN');
    const current = await client.query(`SELECT display_name, engine_name, team_colour, car_model
      FROM atlas.constructor_entries WHERE season_year = $1 AND constructor_id = $2 FOR UPDATE`, [resolvedSeason, constructorId]);
    if (!current.rows[0]) { await client.query('ROLLBACK'); return null; }
    const next = { display_name: displayName, engine_name: engineName, team_colour: teamColour, car_model: carModel };
    const fields = Object.keys(next).filter((field) => (current.rows[0][field]?.trim?.() ?? current.rows[0][field] ?? null) !== next[field]);
    const sourceId = `editorial-${createHash('sha256').update(sourceUrl.href).digest('hex').slice(0, 16)}`;
    await client.query(`INSERT INTO atlas.data_sources (id, name, url, retrieved_at, notes)
      VALUES ($1, $2, $3, now(), 'Источник редакционной правки сезонной записи команды')
      ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, url = EXCLUDED.url,
        retrieved_at = EXCLUDED.retrieved_at, notes = EXCLUDED.notes`,
      [sourceId, sourceUrl.hostname, sourceUrl.href]);
    await client.query(`UPDATE atlas.constructor_entries SET display_name = $3, engine_name = $4,
      team_colour = $5, car_model = $6, updated_at = now()
      WHERE season_year = $1 AND constructor_id = $2`,
      [resolvedSeason, constructorId, displayName, engineName, teamColour, carModel]);
    for (const field of fields) {
      await client.query(`INSERT INTO atlas.constructor_entry_field_sources
        (season_year, constructor_id, field_name, source_id, source_url, retrieved_at, review_status, notes)
        VALUES ($1, $2, $3, $4, $5, now(), 'reviewed', 'Ручная редакционная правка')
        ON CONFLICT (season_year, constructor_id, field_name, source_id) DO UPDATE SET
          source_url = EXCLUDED.source_url, retrieved_at = EXCLUDED.retrieved_at,
          review_status = EXCLUDED.review_status, notes = EXCLUDED.notes`,
        [resolvedSeason, constructorId, field, sourceId, sourceUrl.href]);
    }
    await client.query('COMMIT'); committed = true;
    let publicDataSynced = true;
    try { await syncConstructorPublicData(client, constructorId, resolvedSeason); }
    catch (error) { publicDataSynced = false; console.error('Команда сохранена, но публичные каталоги не синхронизированы', error); }
    return { fields, publicDataSynced };
  } catch (error) {
    if (!committed) await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally { client.release(); }
}

async function createConstructorMediaPreview(buffer, metadata, season, constructorId, kind) {
  const resolvedSeason = validSeason(season);
  if (!/^[A-Za-z0-9_-]+$/.test(constructorId)) throw new Error('Некорректный ID команды');
  imageFormat(buffer, metadata.mimeType);
  const removeBackground = kind === 'car' && metadata.removeBackground;
  const preparedBuffer = removeBackground ? await removeDriverBackground(buffer) : buffer;
  const processor = kind === 'logo' ? processConstructorLogo : processConstructorCar;
  const processed = await processor(preparedBuffer);
  const hash = createHash('sha256').update(buffer).update(removeBackground ? ':isnet' : ':original').digest('hex');
  const token = randomUUID();
  pruneConstructorCarPreviews();
  constructorCarPreviews.set(token, {
    owner: `${resolvedSeason}:${constructorId}:${kind}`, hash, preparedBuffer,
    sourceMetadata: processed.sourceMetadata, expiresAt: Date.now() + previewLifetimeMs,
  });
  const card = processed.variants.find((variant) => variant.name === 'card') ?? processed.variants[0];
  return { token, imageDataUrl: `data:image/webp;base64,${card.bytes.toString('base64')}`,
    backgroundRemoved: removeBackground, expiresInMinutes: previewLifetimeMs / 60_000 };
}

function consumeConstructorCarPreview(token, owner, hash) {
  pruneConstructorCarPreviews();
  if (!token) return null;
  const preview = constructorCarPreviews.get(token);
  constructorCarPreviews.delete(token);
  if (!preview || preview.owner !== owner || preview.hash !== hash) {
    throw new Error('Предпросмотр устарел. Создайте его ещё раз перед сохранением');
  }
  return preview;
}

async function saveConstructorMedia(buffer, metadata, season, constructorId, kind) {
  const resolvedSeason = validSeason(season);
  if (!/^[A-Za-z0-9_-]+$/.test(constructorId)) throw new Error('Некорректный ID команды');
  const format = imageFormat(buffer, metadata.mimeType);
  const removeBackground = kind === 'car' && metadata.removeBackground;
  const hash = createHash('sha256').update(buffer).update(removeBackground ? ':isnet' : ':original').digest('hex');
  const cachedPreview = consumeConstructorCarPreview(metadata.previewToken, `${resolvedSeason}:${constructorId}:${kind}`, hash);
  if (!cachedPreview) throw new Error('Сначала создайте предпросмотр изображения');
  const processor = kind === 'logo' ? processConstructorLogo : processConstructorCar;
  const { variants: generatedVariants } = await processor(cachedPreview.preparedBuffer, metadata.crop);
  const assetId = `constructor-${constructorId}-${resolvedSeason}-${kind}-${hash.slice(0, 16)}`;
  const sourceId = `media-${createHash('sha256').update(metadata.sourceUrl).digest('hex').slice(0, 16)}`;
  const baseUrl = `/media/constructors/${constructorId}/${resolvedSeason}/${kind}`;
  const originalUrl = `${baseUrl}/original-${hash.slice(0, 16)}.${format.extension}`;
  const processed = generatedVariants.map((variant) => ({ ...variant, url: `${baseUrl}/${variant.name}-${hash.slice(0, 16)}.webp` }));
  const publicVariant = kind === 'logo' ? 'large' : 'hero';
  const publicUrl = processed.find((variant) => variant.name === publicVariant)?.url ?? processed[0].url;
  const outputs = [{ url: originalUrl, bytes: buffer }, ...processed.map((variant) => ({ url: variant.url, bytes: variant.bytes }))];
  const createdPaths = [];
  await mkdir(path.resolve('apps', 'web', 'public', baseUrl.replace(/^\/+/, '')), { recursive: true });
  for (const output of outputs) {
    const outputPath = path.resolve('apps', 'web', 'public', output.url.replace(/^\/+/, ''));
    let existed = true;
    try { await access(outputPath); } catch { existed = false; }
    await writeFile(outputPath, output.bytes);
    if (!existed) createdPaths.push(outputPath);
  }

  const client = await pool.connect();
  let committed = false;
  try {
    await client.query('BEGIN');
    const entry = await client.query('SELECT id FROM atlas.constructor_entries WHERE season_year = $1 AND constructor_id = $2', [resolvedSeason, constructorId]);
    if (!entry.rows[0]) {
      await client.query('ROLLBACK');
      await Promise.all(createdPaths.map((filePath) => unlink(filePath).catch(() => {})));
      return null;
    }
    await client.query(`INSERT INTO atlas.data_sources (id, name, url, licence, retrieved_at, notes)
      VALUES ($1, $2, $3, $4, now(), 'Источник изображения болида, добавленного через редакционную панель')
      ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, url = EXCLUDED.url,
        licence = EXCLUDED.licence, retrieved_at = EXCLUDED.retrieved_at, notes = EXCLUDED.notes`,
      [sourceId, new URL(metadata.sourceUrl).hostname, metadata.sourceUrl, metadata.licence]);
    const usageRole = kind === 'logo' ? 'team_logo' : 'constructor_car';
    await client.query(`UPDATE atlas.media_assets SET is_primary = false
      WHERE entity_type = 'constructor' AND entity_id = $1 AND media_type = 'image'
        AND usage_role = $3 AND season_year = $2 AND is_primary`, [constructorId, resolvedSeason, usageRole]);
    await client.query(`INSERT INTO atlas.media_assets
      (id, entity_type, entity_id, media_type, url, alt_text_ru, author, licence, source_url,
       season_year, is_primary, usage_role, source_id, provenance_type, rights_status,
       review_status, verified_at, usage_scope)
      VALUES ($1, 'constructor', $2, 'image', $3, $4, $5, $6, $7, $8, true,
        $10, $9, 'provided_by_user', 'verified', 'reviewed', now(), $11)
      ON CONFLICT (id) DO UPDATE SET url = EXCLUDED.url, alt_text_ru = EXCLUDED.alt_text_ru,
        author = EXCLUDED.author, licence = EXCLUDED.licence, source_url = EXCLUDED.source_url,
        is_primary = true, source_id = EXCLUDED.source_id, rights_status = EXCLUDED.rights_status,
        review_status = EXCLUDED.review_status, verified_at = EXCLUDED.verified_at,
        usage_scope = EXCLUDED.usage_scope`,
      [assetId, constructorId, publicUrl, metadata.altTextRu, metadata.author, metadata.licence,
        metadata.sourceUrl, resolvedSeason, sourceId, usageRole,
        kind === 'logo' ? ['standings', 'results', 'constructor_profile'] : ['constructor_standings', 'constructor_profile']]);
    await client.query(`INSERT INTO atlas.media_asset_derivatives
      (id, media_asset_id, variant, url, mime_type, width_px, height_px, file_size_bytes)
      VALUES ($1, $2, 'original', $3, $4, $5, $6, $7)
      ON CONFLICT (media_asset_id, variant) DO UPDATE SET url = EXCLUDED.url,
        mime_type = EXCLUDED.mime_type, width_px = EXCLUDED.width_px,
        height_px = EXCLUDED.height_px, file_size_bytes = EXCLUDED.file_size_bytes, created_at = now()`,
      [`${assetId}-original`, assetId, originalUrl, format.mimeType,
        cachedPreview.sourceMetadata.width ?? null, cachedPreview.sourceMetadata.height ?? null, buffer.length]);
    for (const variant of processed) {
      await client.query(`INSERT INTO atlas.media_asset_derivatives
        (id, media_asset_id, variant, url, mime_type, width_px, height_px, file_size_bytes)
        VALUES ($1, $2, $3, $4, 'image/webp', $5, $6, $7)
        ON CONFLICT (media_asset_id, variant) DO UPDATE SET url = EXCLUDED.url,
          mime_type = EXCLUDED.mime_type, width_px = EXCLUDED.width_px,
          height_px = EXCLUDED.height_px, file_size_bytes = EXCLUDED.file_size_bytes, created_at = now()`,
        [`${assetId}-${variant.name}`, assetId, variant.name, variant.url, variant.width, variant.height, variant.bytes.length]);
    }
    const mediaColumn = kind === 'logo' ? 'logo_image_url' : 'car_image_url';
    await client.query(`UPDATE atlas.constructor_entries SET ${mediaColumn} = $3, updated_at = now() WHERE season_year = $1 AND constructor_id = $2`, [resolvedSeason, constructorId, publicUrl]);
    await client.query('COMMIT');
    committed = true;
    let publicDataSynced = true;
    try { await syncConstructorPublicData(client, constructorId, resolvedSeason); }
    catch (error) { publicDataSynced = false; console.error('Болид сохранён, но публичный каталог не синхронизирован', error); }
    return { url: publicUrl, publicDataSynced, format: 'image/webp', backgroundRemoved: removeBackground,
      variants: Object.fromEntries(processed.map((variant) => [variant.name, variant.url])) };
  } catch (error) {
    if (!committed) {
      await client.query('ROLLBACK').catch(() => {});
      await Promise.all(createdPaths.map((filePath) => unlink(filePath).catch(() => {})));
    }
    throw error;
  } finally { client.release(); }
}

function saveConstructorCar(buffer, metadata, season, constructorId) {
  return saveConstructorMedia(buffer, metadata, season, constructorId, 'car');
}

function saveConstructorLogo(buffer, metadata, season, constructorId) {
  return saveConstructorMedia(buffer, metadata, season, constructorId, 'logo');
}

async function createCircuitCardPreview(buffer, metadata, circuitId) {
  if (!/^[A-Za-z0-9_-]+$/.test(circuitId)) throw new Error('Некорректный ID трассы');
  imageFormat(buffer, metadata.mimeType);
  const processed = await processCircuitCard(buffer);
  const hash = createHash('sha256').update(buffer).update(':circuit-card').digest('hex');
  const token = randomUUID();
  pruneDriverPhotoPreviews();
  driverPhotoPreviews.set(token, {
    driverId: `circuit:${circuitId}`, hash, preparedBuffer: buffer,
    sourceMetadata: processed.sourceMetadata, variants: processed.variants,
    expiresAt: Date.now() + previewLifetimeMs,
  });
  const card = processed.variants.find((variant) => variant.name === 'card') ?? processed.variants[0];
  return { token, imageDataUrl: `data:image/webp;base64,${card.bytes.toString('base64')}`,
    backgroundRemoved: false, expiresInMinutes: previewLifetimeMs / 60_000 };
}

async function saveCircuitCard(buffer, metadata, circuitId) {
  if (!/^[A-Za-z0-9_-]+$/.test(circuitId)) throw new Error('Некорректный ID трассы');
  const format = imageFormat(buffer, metadata.mimeType);
  const hash = createHash('sha256').update(buffer).update(':circuit-card').digest('hex');
  const cachedPreview = consumeDriverPhotoPreview(metadata.previewToken, `circuit:${circuitId}`, hash);
  if (!cachedPreview) throw new Error('Сначала создайте предпросмотр изображения');
  const { variants } = await processCircuitCard(cachedPreview.preparedBuffer, metadata.crop);
  const assetId = `circuit-${circuitId}-catalog-${hash.slice(0, 16)}`;
  const sourceId = `media-${createHash('sha256').update(metadata.sourceUrl).digest('hex').slice(0, 16)}`;
  const originalUrl = `/media/circuits/${circuitId}/catalog-original-${hash.slice(0, 16)}.${format.extension}`;
  const processed = variants.map((variant) => ({ ...variant,
    url: `/media/circuits/${circuitId}/catalog-${variant.name}-${hash.slice(0, 16)}.webp` }));
  await mkdir(path.resolve('apps', 'web', 'public', 'media', 'circuits', circuitId), { recursive: true });
  const outputs = [{ url: originalUrl, bytes: buffer }, ...processed.map((variant) => ({ url: variant.url, bytes: variant.bytes }))];
  const createdPaths = [];
  for (const output of outputs) {
    const outputPath = path.resolve('apps', 'web', 'public', output.url.replace(/^\/+/, ''));
    let existed = true; try { await access(outputPath); } catch { existed = false; }
    await writeFile(outputPath, output.bytes); if (!existed) createdPaths.push(outputPath);
  }
  const client = await pool.connect(); let committed = false;
  try {
    await client.query('BEGIN');
    const circuit = await client.query('SELECT id FROM atlas.circuits WHERE id=$1', [circuitId]);
    if (!circuit.rows[0]) { await client.query('ROLLBACK'); await Promise.all(createdPaths.map((item) => unlink(item).catch(() => {}))); return null; }
    await client.query(`INSERT INTO atlas.data_sources (id,name,url,licence,retrieved_at,notes)
      VALUES ($1,$2,$3,$4,now(),'Источник изображения карточки трассы') ON CONFLICT (id) DO UPDATE SET
      name=EXCLUDED.name,url=EXCLUDED.url,licence=EXCLUDED.licence,retrieved_at=EXCLUDED.retrieved_at,notes=EXCLUDED.notes`,
    [sourceId, new URL(metadata.sourceUrl).hostname, metadata.sourceUrl, metadata.licence]);
    await client.query(`UPDATE atlas.media_assets SET is_primary=false
      WHERE entity_type='circuit' AND entity_id=$1 AND media_type='image' AND usage_role='catalog_card' AND is_primary`, [circuitId]);
    const publicUrl = processed.find((variant) => variant.name === 'card')?.url ?? processed[0].url;
    await client.query(`INSERT INTO atlas.media_assets
      (id,entity_type,entity_id,media_type,url,alt_text_ru,author,licence,source_url,is_primary,usage_role,
       source_id,provenance_type,rights_status,review_status,verified_at,usage_scope)
      VALUES ($1,'circuit',$2,'image',$3,$4,$5,$6,$7,true,'catalog_card',$8,'provided_by_user','verified','reviewed',now(),ARRAY['circuit_catalog','circuit_list'])
      ON CONFLICT (id) DO UPDATE SET url=EXCLUDED.url,alt_text_ru=EXCLUDED.alt_text_ru,author=EXCLUDED.author,
       licence=EXCLUDED.licence,source_url=EXCLUDED.source_url,is_primary=true,source_id=EXCLUDED.source_id,
       rights_status='verified',review_status='reviewed',verified_at=now(),usage_scope=EXCLUDED.usage_scope`,
    [assetId, circuitId, publicUrl, metadata.altTextRu, metadata.author, metadata.licence, metadata.sourceUrl, sourceId]);
    await client.query(`INSERT INTO atlas.media_asset_derivatives
      (id,media_asset_id,variant,url,mime_type,width_px,height_px,file_size_bytes)
      VALUES ($1,$2,'original',$3,$4,$5,$6,$7) ON CONFLICT (media_asset_id,variant) DO UPDATE SET
      url=EXCLUDED.url,mime_type=EXCLUDED.mime_type,width_px=EXCLUDED.width_px,height_px=EXCLUDED.height_px,file_size_bytes=EXCLUDED.file_size_bytes,created_at=now()`,
    [`${assetId}-original`, assetId, originalUrl, format.mimeType, cachedPreview.sourceMetadata.width ?? null, cachedPreview.sourceMetadata.height ?? null, buffer.length]);
    for (const variant of processed) await client.query(`INSERT INTO atlas.media_asset_derivatives
      (id,media_asset_id,variant,url,mime_type,width_px,height_px,file_size_bytes)
      VALUES ($1,$2,$3,$4,'image/webp',$5,$6,$7) ON CONFLICT (media_asset_id,variant) DO UPDATE SET
      url=EXCLUDED.url,mime_type='image/webp',width_px=EXCLUDED.width_px,height_px=EXCLUDED.height_px,file_size_bytes=EXCLUDED.file_size_bytes,created_at=now()`,
    [`${assetId}-${variant.name}`, assetId, variant.name, variant.url, variant.width, variant.height, variant.bytes.length]);
    await client.query('COMMIT'); committed = true;
    let publicDataSynced = true;
    try { await runCircuitExports(circuitId, 'draft'); }
    catch (error) { publicDataSynced = false; console.error('Изображение трассы сохранено, но каталог не обновлён', error); }
    return { url: publicUrl, publicDataSynced, format: 'image/webp', backgroundRemoved: false,
      variants: Object.fromEntries(processed.map((variant) => [variant.name, variant.url])) };
  } catch (error) {
    if (!committed) { await client.query('ROLLBACK').catch(() => {}); await Promise.all(createdPaths.map((item) => unlink(item).catch(() => {}))); }
    throw error;
  } finally { client.release(); }
}

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url ?? '/', `http://${host}:${port}`);
    if (request.method === 'GET' && url.pathname === '/health') return json(response, 200, { ok: true });
    if (!authorized(request)) return json(response, 401, { error: 'unauthorized' });
    if (request.method === 'GET' && url.pathname === '/schema/tables') return json(response, 200, await getSchemaTables());
    if (request.method === 'GET' && url.pathname === '/settings/map') return json(response, 200, await getMapUiSettings());
    if (request.method === 'PATCH' && url.pathname === '/settings/map') return json(response, 200, await saveMapUiSettings(await requestBody(request)));
    if (request.method === 'GET' && url.pathname === '/media-assets') return json(response, 200, await getMediaRegistry(url));
    const mediaAssetMatch = url.pathname.match(/^\/media-assets\/([^/]+)$/);
    if (request.method === 'GET' && mediaAssetMatch) {
      const asset = await getMediaAsset(decodeURIComponent(mediaAssetMatch[1]));
      return asset ? json(response, 200, asset) : json(response, 404, { error: 'not_found' });
    }
    if (request.method === 'PATCH' && mediaAssetMatch) {
      const result = await saveMediaAsset(await requestBody(request), decodeURIComponent(mediaAssetMatch[1]));
      return result ? json(response, 200, result) : json(response, 404, { error: 'not_found' });
    }
    const tableMatch = url.pathname.match(/^\/schema\/tables\/([a-z][a-z0-9_]*)$/);
    if (request.method === 'GET' && tableMatch) {
      const result = await getTableRows(tableMatch[1], url);
      return result ? json(response, 200, result) : json(response, 404, { error: 'not_found' });
    }
    if (request.method === 'PATCH' && tableMatch) {
      const result = await updateTableRow(tableMatch[1], await requestBody(request));
      return result ? json(response, 200, result) : json(response, 404, { error: 'not_found' });
    }
    if (request.method === 'GET' && url.pathname === '/drivers') return json(response, 200, await getDashboard(url));
    if (request.method === 'GET' && url.pathname === '/seasons') return json(response, 200, { rows: await getSeasons() });
    if (request.method === 'POST' && url.pathname === '/seasons') return json(response, 200, await saveSeason(await requestBody(request)));
    if (request.method === 'POST' && url.pathname === '/data-sync/jolpica') return json(response, 200, await syncJolpicaSeason(await requestBody(request)));
    const seasonMatch = url.pathname.match(/^\/seasons\/(\d{4})$/);
    if (request.method === 'PATCH' && seasonMatch) {
      const result = await saveSeason(await requestBody(request), seasonMatch[1]);
      return result ? json(response, 200, result) : json(response, 404, { error: 'not_found' });
    }
    if (request.method === 'GET' && url.pathname === '/events') return json(response, 200, await getAdminRaces(url));
    if (request.method === 'POST' && url.pathname === '/events') return json(response, 200, await saveAdminRace(await requestBody(request)));
    if (request.method === 'GET' && url.pathname === '/event-options') return json(response, 200, await getRaceEditorOptions());
    const eventMatch = url.pathname.match(/^\/events\/([A-Za-z0-9_-]+)$/);
    if (request.method === 'GET' && eventMatch) {
      const result = await getAdminRace(eventMatch[1]);
      return result ? json(response, 200, result) : json(response, 404, { error: 'not_found' });
    }
    if (request.method === 'PATCH' && eventMatch) {
      const result = await saveAdminRace(await requestBody(request), eventMatch[1]);
      return result ? json(response, 200, result) : json(response, 404, { error: 'not_found' });
    }
    const eventSessionsMatch = url.pathname.match(/^\/events\/([A-Za-z0-9_-]+)\/sessions$/);
    if (request.method === 'GET' && eventSessionsMatch) {
      const result = await getEventSessions(eventSessionsMatch[1]);
      return result ? json(response, 200, result) : json(response, 404, { error: 'not_found' });
    }
    if (request.method === 'POST' && eventSessionsMatch) {
      const result = await saveEventSession(await requestBody(request), eventSessionsMatch[1]);
      return result ? json(response, 200, result) : json(response, 404, { error: 'not_found' });
    }
    const eventSessionMatch = url.pathname.match(/^\/events\/([A-Za-z0-9_-]+)\/sessions\/([A-Za-z0-9_-]+)$/);
    if (request.method === 'GET' && eventSessionMatch) {
      const result = await getEventSession(eventSessionMatch[1], eventSessionMatch[2]);
      return result ? json(response, 200, result) : json(response, 404, { error: 'not_found' });
    }
    if (request.method === 'PATCH' && eventSessionMatch) {
      const result = await saveEventSession(await requestBody(request), eventSessionMatch[1], eventSessionMatch[2]);
      return result ? json(response, 200, result) : json(response, 404, { error: 'not_found' });
    }
    const sessionResultsMatch = url.pathname.match(/^\/events\/([A-Za-z0-9_-]+)\/sessions\/([A-Za-z0-9_-]+)\/results$/);
    if (request.method === 'POST' && sessionResultsMatch) {
      const result = await saveSessionResult(await requestBody(request), sessionResultsMatch[1], sessionResultsMatch[2]);
      return result ? json(response, 200, result) : json(response, 404, { error: 'not_found' });
    }
    if (request.method === 'PUT' && sessionResultsMatch) {
      const result = await saveSessionResults(await requestBody(request, 500_000), sessionResultsMatch[1], sessionResultsMatch[2]);
      return result ? json(response, 200, result) : json(response, 404, { error: 'not_found' });
    }
    const sessionResultMatch = url.pathname.match(/^\/events\/([A-Za-z0-9_-]+)\/sessions\/([A-Za-z0-9_-]+)\/results\/([A-Za-z0-9_-]+)$/);
    if (request.method === 'DELETE' && sessionResultMatch) {
      const result = await deleteSessionResult(sessionResultMatch[1], sessionResultMatch[2], sessionResultMatch[3]);
      return result ? json(response, 200, result) : json(response, 404, { error: 'not_found' });
    }
    if (request.method === 'GET' && url.pathname === '/travel') return json(response, 200, await getTravelRegistry(url));
    const travelCategoryMatch = url.pathname.match(/^\/travel\/categories\/([a-z][a-z0-9_-]+)$/);
    if (request.method === 'PATCH' && travelCategoryMatch) {
      const result = await saveTravelCategoryIcon(travelCategoryMatch[1], await requestBody(request));
      return result ? json(response, 200, result) : json(response, 404, { error: 'not_found' });
    }
    const travelCategoryIconMatch = url.pathname.match(/^\/travel\/categories\/([a-z][a-z0-9_-]+)\/icon$/);
    if (request.method === 'POST' && travelCategoryIconMatch) {
      const result = await saveTravelCategoryIconFile(travelCategoryIconMatch[1], await binaryRequestBody(request), request);
      return result ? json(response, 200, result) : json(response, 404, { error: 'not_found' });
    }
    const travelPointsMatch = url.pathname.match(/^\/travel\/circuits\/([A-Za-z0-9_-]+)\/points$/);
    if (request.method === 'GET' && travelPointsMatch) {
      const result = await getTravelPoints(travelPointsMatch[1], url);
      return result ? json(response, 200, result) : json(response, 404, { error: 'not_found' });
    }
    const travelPointsBulkMatch = url.pathname.match(/^\/travel\/circuits\/([A-Za-z0-9_-]+)\/points-bulk$/);
    if (request.method === 'PATCH' && travelPointsBulkMatch) {
      const result = await saveTravelPointsBulk(await requestBody(request), travelPointsBulkMatch[1]);
      return json(response, 200, result);
    }
    const travelPointTranslationsMatch = url.pathname.match(/^\/travel\/circuits\/([A-Za-z0-9_-]+)\/translations\/osm$/);
    if (request.method === 'POST' && travelPointTranslationsMatch) {
      return json(response, 200, await applyStoredOsmRussianNames(travelPointTranslationsMatch[1]));
    }
    const travelPointMatch = url.pathname.match(/^\/travel\/circuits\/([A-Za-z0-9_-]+)\/points\/([A-Za-z0-9_-]+)$/);
    if (request.method === 'GET' && travelPointMatch) {
      const result = await getTravelPoint(travelPointMatch[1], travelPointMatch[2]);
      return result ? json(response, 200, result) : json(response, 404, { error: 'not_found' });
    }
    if (request.method === 'PATCH' && travelPointMatch) {
      const result = await saveTravelPoint(await requestBody(request), travelPointMatch[1], travelPointMatch[2]);
      return result ? json(response, 200, result) : json(response, 404, { error: 'not_found' });
    }
    const travelPointPhotoPreviewMatch = url.pathname.match(/^\/travel\/circuits\/([A-Za-z0-9_-]+)\/points\/([A-Za-z0-9_-]+)\/photo\/preview$/);
    if (request.method === 'POST' && travelPointPhotoPreviewMatch) {
      const result = await createTravelPointPhotoPreview(await binaryRequestBody(request), previewMetadata(request), travelPointPhotoPreviewMatch[1], travelPointPhotoPreviewMatch[2]);
      return json(response, 200, result);
    }
    const travelPointPhotoMatch = url.pathname.match(/^\/travel\/circuits\/([A-Za-z0-9_-]+)\/points\/([A-Za-z0-9_-]+)\/photo$/);
    if (request.method === 'POST' && travelPointPhotoMatch) {
      const result = await saveTravelPointPhoto(await binaryRequestBody(request), uploadMetadata(request), travelPointPhotoMatch[1], travelPointPhotoMatch[2]);
      return result ? json(response, 200, result) : json(response, 404, { error: 'not_found' });
    }
    const travelZonesMatch = url.pathname.match(/^\/travel\/circuits\/([A-Za-z0-9_-]+)\/zones$/);
    if (request.method === 'GET' && travelZonesMatch) {
      const result = await getTravelZones(travelZonesMatch[1]);
      return result ? json(response, 200, result) : json(response, 404, { error: 'not_found' });
    }
    const travelZoneMatch = url.pathname.match(/^\/travel\/circuits\/([A-Za-z0-9_-]+)\/zones\/([A-Za-z0-9_-]+)$/);
    if (request.method === 'GET' && travelZoneMatch) {
      const result = await getTravelZone(travelZoneMatch[1], travelZoneMatch[2]);
      return result ? json(response, 200, result) : json(response, 404, { error: 'not_found' });
    }
    if (request.method === 'PUT' && travelZoneMatch) {
      const result = await saveTravelZone(await requestBody(request, 500_000), travelZoneMatch[1], travelZoneMatch[2]);
      return result ? json(response, 200, result) : json(response, 404, { error: 'not_found' });
    }
    const travelAccessAnchorsMatch = url.pathname.match(/^\/travel\/circuits\/([A-Za-z0-9_-]+)\/access-anchors$/);
    if (request.method === 'GET' && travelAccessAnchorsMatch) {
      const result = await getTravelAccessAnchors(travelAccessAnchorsMatch[1]);
      return result ? json(response, 200, result) : json(response, 404, { error: 'not_found' });
    }
    const travelAccessAnchorMatch = url.pathname.match(/^\/travel\/circuits\/([A-Za-z0-9_-]+)\/access-anchors\/([A-Za-z0-9_-]+)$/);
    if (request.method === 'PUT' && travelAccessAnchorMatch) {
      const result = await saveTravelAccessAnchor(await requestBody(request), travelAccessAnchorMatch[1], travelAccessAnchorMatch[2]);
      return result ? json(response, 200, result) : json(response, 404, { error: 'not_found' });
    }
    const travelRoutesMatch = url.pathname.match(/^\/travel\/circuits\/([A-Za-z0-9_-]+)\/routes$/);
    if (request.method === 'GET' && travelRoutesMatch) {
      const result = await getTravelRoutes(travelRoutesMatch[1]);
      return result ? json(response, 200, result) : json(response, 404, { error: 'not_found' });
    }
    const travelRouteGenerationCreateMatch = url.pathname.match(/^\/travel\/circuits\/([A-Za-z0-9_-]+)\/route-generation-previews$/);
    if (request.method === 'POST' && travelRouteGenerationCreateMatch) {
      const result = await createTravelRouteGenerationPreview(travelRouteGenerationCreateMatch[1], await requestBody(request));
      return result ? json(response, 200, result) : json(response, 404, { error: 'not_found' });
    }
    const travelRouteGenerationMatch = url.pathname.match(/^\/travel\/route-generation-previews\/([A-Za-z0-9-]+)$/);
    if (request.method === 'GET' && travelRouteGenerationMatch) {
      const result = getTravelRouteGenerationPreview(travelRouteGenerationMatch[1]);
      return result ? json(response, 200, result) : json(response, 404, { error: 'not_found' });
    }
    const travelRouteGenerationApplyMatch = url.pathname.match(/^\/travel\/route-generation-previews\/([A-Za-z0-9-]+)\/apply$/);
    if (request.method === 'POST' && travelRouteGenerationApplyMatch) {
      const input = await requestBody(request);
      const result = await applyTravelRouteGenerationPreview(travelRouteGenerationApplyMatch[1], String(input?.circuitId??''), input?.routeIds);
      return result ? json(response, 200, result) : json(response, 404, { error: 'not_found' });
    }
    const travelRouteTailPreviewCreateMatch = url.pathname.match(/^\/travel\/circuits\/([A-Za-z0-9_-]+)\/routes\/([A-Za-z0-9_-]+)\/tail-previews$/);
    const travelRouteGeometryPreviewMatch = url.pathname.match(/^\/travel\/circuits\/([A-Za-z0-9_-]+)\/routes\/([A-Za-z0-9_-]+)\/geometry-previews$/);
    if (request.method === 'POST' && travelRouteGeometryPreviewMatch) {
      const result = await previewTravelRouteGeometry(travelRouteGeometryPreviewMatch[1],travelRouteGeometryPreviewMatch[2],await requestBody(request));
      return result ? json(response, 200, result) : json(response, 404, { error: 'not_found' });
    }
    if (request.method === 'POST' && travelRouteTailPreviewCreateMatch) {
      const result = await createTravelRouteTailPreview(travelRouteTailPreviewCreateMatch[1],travelRouteTailPreviewCreateMatch[2]);
      return result ? json(response, 200, result) : json(response, 404, { error: 'not_found' });
    }
    const travelRouteTailPreviewMatch = url.pathname.match(/^\/travel\/route-tail-previews\/([A-Za-z0-9-]+)$/);
    if (request.method === 'GET' && travelRouteTailPreviewMatch) {
      const result = getTravelRouteTailPreview(travelRouteTailPreviewMatch[1]);
      return result ? json(response, 200, result) : json(response, 404, { error: 'not_found' });
    }
    const travelRouteTailPreviewApplyMatch = url.pathname.match(/^\/travel\/route-tail-previews\/([A-Za-z0-9-]+)\/apply$/);
    if (request.method === 'POST' && travelRouteTailPreviewApplyMatch) {
      const input = await requestBody(request);
      const result = await applyTravelRouteTailPreview(travelRouteTailPreviewApplyMatch[1],String(input?.circuitId??''),String(input?.routeId??''));
      return result ? json(response, 200, result) : json(response, 404, { error: 'not_found' });
    }
    const travelRouteMatch = url.pathname.match(/^\/travel\/circuits\/([A-Za-z0-9_-]+)\/routes\/([A-Za-z0-9_-]+)$/);
    const travelRouteLifecycleMatch = url.pathname.match(/^\/travel\/circuits\/([A-Za-z0-9_-]+)\/routes\/([A-Za-z0-9_-]+)\/lifecycle$/);
    if (request.method === 'POST' && travelRouteLifecycleMatch) {
      const result = await changeTravelRouteLifecycle(travelRouteLifecycleMatch[1],travelRouteLifecycleMatch[2],await requestBody(request));
      return result ? json(response, 200, result) : json(response, 404, { error: 'not_found' });
    }
    if (request.method === 'GET' && travelRouteMatch) {
      const result = await getTravelRoute(travelRouteMatch[1],travelRouteMatch[2]);
      return result ? json(response, 200, result) : json(response, 404, { error: 'not_found' });
    }
    if (request.method === 'PUT' && travelRouteMatch) {
      const result = await saveTravelRoute(await requestBody(request,500_000),travelRouteMatch[1],travelRouteMatch[2]);
      return result ? json(response, 200, result) : json(response, 404, { error: 'not_found' });
    }
    if (request.method === 'DELETE' && travelRouteMatch) {
      const result = await deleteArchivedTravelRoute(travelRouteMatch[1],travelRouteMatch[2],await requestBody(request));
      return result ? json(response, 200, result) : json(response, 404, { error: 'not_found' });
    }
    if (request.method === 'POST' && url.pathname === '/travel/import-previews') {
      return json(response, 200, await createTravelImportPreview(await requestBody(request)));
    }
    const travelPreviewMatch = url.pathname.match(/^\/travel\/import-previews\/([A-Za-z0-9-]+)$/);
    if (request.method === 'GET' && travelPreviewMatch) {
      const result = getTravelImportPreview(travelPreviewMatch[1]);
      return result ? json(response, 200, result) : json(response, 404, { error: 'not_found' });
    }
    const travelApplyMatch = url.pathname.match(/^\/travel\/import-previews\/([A-Za-z0-9-]+)\/apply$/);
    if (request.method === 'POST' && travelApplyMatch) {
      const result = await applyTravelImportPreview(travelApplyMatch[1], await requestBody(request));
      return result ? json(response, 200, result) : json(response, 404, { error: 'not_found' });
    }
    if (request.method === 'GET' && url.pathname === '/circuits') return json(response, 200, await getCircuits(url));
    const circuitMediaMatch = url.pathname.match(/^\/circuits\/([A-Za-z0-9_-]+)\/media-order$/);
    if (request.method === 'GET' && circuitMediaMatch) {
      const result = await getCircuitMediaOrder(circuitMediaMatch[1]);
      return result ? json(response, 200, result) : json(response, 404, { error: 'not_found' });
    }
    if (request.method === 'PATCH' && circuitMediaMatch) {
      return json(response, 200, await saveCircuitMediaOrder(circuitMediaMatch[1], await requestBody(request)));
    }
    const circuitLayoutsMatch = url.pathname.match(/^\/circuits\/([A-Za-z0-9_-]+)\/layouts$/);
    if (request.method === 'POST' && circuitLayoutsMatch) {
      const result = await saveTrackLayout(await requestBody(request), circuitLayoutsMatch[1]);
      return result ? json(response, 200, result) : json(response, 404, { error: 'not_found' });
    }
    const circuitLayoutMatch = url.pathname.match(/^\/circuits\/([A-Za-z0-9_-]+)\/layouts\/([A-Za-z0-9_-]+)$/);
    if (request.method === 'PATCH' && circuitLayoutMatch) {
      const result = await saveTrackLayout(await requestBody(request), circuitLayoutMatch[1], circuitLayoutMatch[2]);
      return result ? json(response, 200, result) : json(response, 404, { error: 'not_found' });
    }
    const circuitLayoutGeometryMatch = url.pathname.match(/^\/circuits\/([A-Za-z0-9_-]+)\/layouts\/([A-Za-z0-9_-]+)\/geometry$/);
    if (request.method === 'POST' && circuitLayoutGeometryMatch) {
      const body = await requestBody(request, 2_000_000);
      const result = await inspectTrackGeometry(body.geoJson, circuitLayoutGeometryMatch[1], circuitLayoutGeometryMatch[2]);
      return result ? json(response, 200, result) : json(response, 404, { error: 'not_found' });
    }
    if (request.method === 'PUT' && circuitLayoutGeometryMatch) {
      const result = await saveTrackGeometry(await requestBody(request, 2_000_000), circuitLayoutGeometryMatch[1], circuitLayoutGeometryMatch[2]);
      return result ? json(response, 200, result) : json(response, 404, { error: 'not_found' });
    }
    if (request.method === 'POST' && url.pathname === '/track-annotation-import-previews') {
      return json(response, 201, await createTrackAnnotationImportPreview(await requestBody(request, 5_000_000)));
    }
    const trackAnnotationImportPreviewMatch = url.pathname.match(/^\/track-annotation-import-previews\/([A-Za-z0-9-]+)$/);
    if (request.method === 'GET' && trackAnnotationImportPreviewMatch) {
      const result = getTrackAnnotationImportPreview(trackAnnotationImportPreviewMatch[1]);
      return result ? json(response, 200, result) : json(response, 404, { error: 'not_found' });
    }
    const trackAnnotationImportApplyMatch = url.pathname.match(/^\/track-annotation-import-previews\/([A-Za-z0-9-]+)\/apply$/);
    if (request.method === 'POST' && trackAnnotationImportApplyMatch) {
      const result = await applyTrackAnnotationImportPreview(trackAnnotationImportApplyMatch[1]);
      return result ? json(response, 200, result) : json(response, 404, { error: 'not_found' });
    }
    const circuitLayoutAnnotationsMatch = url.pathname.match(/^\/circuits\/([A-Za-z0-9_-]+)\/layouts\/([A-Za-z0-9_-]+)\/annotations$/);
    if (request.method === 'GET' && circuitLayoutAnnotationsMatch) {
      const result = await getTrackLayoutAnnotations(circuitLayoutAnnotationsMatch[1],circuitLayoutAnnotationsMatch[2]);
      return result ? json(response, 200, result) : json(response, 404, { error: 'not_found' });
    }
    const sectorSegmentationMatch = url.pathname.match(/^\/circuits\/([A-Za-z0-9_-]+)\/layouts\/([A-Za-z0-9_-]+)\/sectors$/);
    if (request.method === 'POST' && sectorSegmentationMatch) {
      const result = await saveTrackSectorSegmentation(await requestBody(request,100_000),sectorSegmentationMatch[1],sectorSegmentationMatch[2]);
      return result ? json(response, 201, result) : json(response, 404, { error: 'not_found' });
    }
    const circuitLayoutAnnotationMatch = url.pathname.match(/^\/circuits\/([A-Za-z0-9_-]+)\/layouts\/([A-Za-z0-9_-]+)\/annotations\/([A-Za-z0-9_-]+)$/);
    if (request.method === 'PUT' && circuitLayoutAnnotationMatch) {
      const result = await saveTrackLayoutAnnotation(await requestBody(request,1_000_000),circuitLayoutAnnotationMatch[1],circuitLayoutAnnotationMatch[2],circuitLayoutAnnotationMatch[3]);
      return result ? json(response, 200, result) : json(response, 404, { error: 'not_found' });
    }
    if (request.method === 'DELETE' && circuitLayoutAnnotationMatch) {
      const input=await requestBody(request,10_000);
      const result = await deleteTrackLayoutAnnotation(circuitLayoutAnnotationMatch[1],circuitLayoutAnnotationMatch[2],circuitLayoutAnnotationMatch[3],input?.revision);
      return result ? json(response, 200, result) : json(response, 404, { error: 'not_found' });
    }
    const circuitMatch = url.pathname.match(/^\/circuits\/([A-Za-z0-9_-]+)$/);
    if (request.method === 'GET' && circuitMatch) {
      const result = await getCircuit(circuitMatch[1], url.searchParams.get('includeGeometry') === '1');
      return result ? json(response, 200, result) : json(response, 404, { error: 'not_found' });
    }
    if (request.method === 'PATCH' && circuitMatch) {
      const result = await saveCircuit(await requestBody(request), circuitMatch[1]);
      return result ? json(response, 200, result) : json(response, 404, { error: 'not_found' });
    }
    const circuitCardPreviewMatch = url.pathname.match(/^\/circuits\/([A-Za-z0-9_-]+)\/card-image\/preview$/);
    if (request.method === 'POST' && circuitCardPreviewMatch) {
      const result = await createCircuitCardPreview(await binaryRequestBody(request), previewMetadata(request), circuitCardPreviewMatch[1]);
      return json(response, 200, result);
    }
    const circuitCardMatch = url.pathname.match(/^\/circuits\/([A-Za-z0-9_-]+)\/card-image$/);
    if (request.method === 'POST' && circuitCardMatch) {
      const result = await saveCircuitCard(await binaryRequestBody(request), uploadMetadata(request), circuitCardMatch[1]);
      return result ? json(response, 200, result) : json(response, 404, { error: 'not_found' });
    }
    if (request.method === 'GET' && url.pathname === '/history-eras') return json(response, 200, await getHistoryEras());
    const historyEraMatch = url.pathname.match(/^\/history-eras\/([A-Za-z0-9-]+)$/);
    if (request.method === 'GET' && historyEraMatch) {
      const result = await getHistoryEra(historyEraMatch[1]);
      return result ? json(response, 200, result) : json(response, 404, { error: 'not_found' });
    }
    if (request.method === 'PATCH' && historyEraMatch) {
      const result = await saveHistoryEra(await requestBody(request, 500_000), historyEraMatch[1]);
      return result ? json(response, 200, result) : json(response, 404, { error: 'not_found' });
    }
    const historyEraBlocksMatch = url.pathname.match(/^\/history-eras\/([A-Za-z0-9-]+)\/blocks$/);
    if (request.method === 'POST' && historyEraBlocksMatch) {
      const result = await saveHistoryEraBlock(await requestBody(request, 500_000), historyEraBlocksMatch[1]);
      return result ? json(response, 201, result) : json(response, 404, { error: 'not_found' });
    }
    const historyEraBlockOrderMatch = url.pathname.match(/^\/history-eras\/([A-Za-z0-9-]+)\/blocks\/order$/);
    if (request.method === 'PATCH' && historyEraBlockOrderMatch) {
      return json(response, 200, await saveHistoryEraBlockOrder(historyEraBlockOrderMatch[1], await requestBody(request, 500_000)));
    }
    const historyEraBlockMatch = url.pathname.match(/^\/history-era-blocks\/(\d+)$/);
    if (request.method === 'PATCH' && historyEraBlockMatch) {
      const current = await pool.query('SELECT era_slug FROM atlas.history_era_blocks WHERE id=$1', [Number(historyEraBlockMatch[1])]);
      if (!current.rows[0]) return json(response, 404, { error: 'not_found' });
      const result = await saveHistoryEraBlock(await requestBody(request, 500_000), current.rows[0].era_slug, Number(historyEraBlockMatch[1]));
      return result ? json(response, 200, result) : json(response, 404, { error: 'not_found' });
    }
    if (request.method === 'DELETE' && historyEraBlockMatch) {
      const result = await deleteHistoryEraBlock(Number(historyEraBlockMatch[1]));
      return result ? json(response, 200, result) : json(response, 404, { error: 'not_found' });
    }
    if (request.method === 'GET' && url.pathname === '/constructor-lineages') return json(response, 200, await getConstructorLineages(url));
    if (request.method === 'POST' && url.pathname === '/constructor-lineages') return json(response, 201, await saveConstructorLineage(await requestBody(request)));
    const constructorLineageMatch = url.pathname.match(/^\/constructor-lineages\/(\d+)$/);
    if (request.method === 'PATCH' && constructorLineageMatch) {
      const result = await saveConstructorLineage(await requestBody(request), Number(constructorLineageMatch[1]));
      return result ? json(response, 200, result) : json(response, 404, { error: 'not_found' });
    }
    if (request.method === 'DELETE' && constructorLineageMatch) {
      const result = await deleteConstructorLineage(Number(constructorLineageMatch[1]));
      return result ? json(response, 200, result) : json(response, 404, { error: 'not_found' });
    }
    if (request.method === 'GET' && url.pathname === '/constructor-entries') return json(response, 200, await getConstructorEntries(url));
    const constructorCarPreviewMatch = url.pathname.match(/^\/constructor-entries\/(\d{4})\/([A-Za-z0-9_-]+)\/car\/preview$/);
    if (request.method === 'POST' && constructorCarPreviewMatch) {
      const result = await createConstructorMediaPreview(await binaryRequestBody(request), previewMetadata(request), constructorCarPreviewMatch[1], constructorCarPreviewMatch[2], 'car');
      return json(response, 200, result);
    }
    const constructorCarMatch = url.pathname.match(/^\/constructor-entries\/(\d{4})\/([A-Za-z0-9_-]+)\/car$/);
    if (request.method === 'POST' && constructorCarMatch) {
      const result = await saveConstructorCar(await binaryRequestBody(request), uploadMetadata(request), constructorCarMatch[1], constructorCarMatch[2]);
      return result ? json(response, 200, result) : json(response, 404, { error: 'not_found' });
    }
    const constructorLogoPreviewMatch = url.pathname.match(/^\/constructor-entries\/(\d{4})\/([A-Za-z0-9_-]+)\/logo\/preview$/);
    if (request.method === 'POST' && constructorLogoPreviewMatch) {
      const result = await createConstructorMediaPreview(await binaryRequestBody(request), previewMetadata(request), constructorLogoPreviewMatch[1], constructorLogoPreviewMatch[2], 'logo');
      return json(response, 200, result);
    }
    const constructorLogoMatch = url.pathname.match(/^\/constructor-entries\/(\d{4})\/([A-Za-z0-9_-]+)\/logo$/);
    if (request.method === 'POST' && constructorLogoMatch) {
      const result = await saveConstructorLogo(await binaryRequestBody(request), uploadMetadata(request), constructorLogoMatch[1], constructorLogoMatch[2]);
      return result ? json(response, 200, result) : json(response, 404, { error: 'not_found' });
    }
    const gameLogoPreviewMatch = url.pathname.match(/^\/games\/(outline|map|driver-geography|calendar-optimizer)\/logo\/preview$/);
    if (request.method === 'POST' && gameLogoPreviewMatch) {
      const result = await createGameLogoPreview(await binaryRequestBody(request), previewMetadata(request), gameLogoPreviewMatch[1]);
      return json(response, 200, result);
    }
    const gameLogoMatch = url.pathname.match(/^\/games\/(outline|map|driver-geography|calendar-optimizer)\/logo$/);
    if (request.method === 'POST' && gameLogoMatch) {
      const result = await saveGameLogo(await binaryRequestBody(request), uploadMetadata(request), gameLogoMatch[1]);
      return json(response, 200, result);
    }
    const constructorEntryMatch = url.pathname.match(/^\/constructor-entries\/(\d{4})\/([A-Za-z0-9_-]+)$/);
    if (request.method === 'GET' && constructorEntryMatch) {
      const entry = await getConstructorEntry(constructorEntryMatch[1], constructorEntryMatch[2]);
      return entry ? json(response, 200, entry) : json(response, 404, { error: 'not_found' });
    }
    if (request.method === 'PATCH' && constructorEntryMatch) {
      const result = await saveConstructorEntry(await requestBody(request), constructorEntryMatch[1], constructorEntryMatch[2]);
      return result ? json(response, 200, result) : json(response, 404, { error: 'not_found' });
    }
    const photoPreviewMatch = url.pathname.match(/^\/drivers\/([A-Za-z0-9_-]+)\/photo\/preview$/);
    if (request.method === 'POST' && photoPreviewMatch) {
      const metadata = previewMetadata(request);
      const result = await createDriverPhotoPreview(await binaryRequestBody(request), metadata, photoPreviewMatch[1]);
      return json(response, 200, result);
    }
    const photoMatch = url.pathname.match(/^\/drivers\/([A-Za-z0-9_-]+)\/photo$/);
    if (request.method === 'POST' && photoMatch) {
      const metadata = uploadMetadata(request);
      const result = await saveDriverPhoto(await binaryRequestBody(request), metadata, photoMatch[1]);
      return result ? json(response, 200, result) : json(response, 404, { error: 'not_found' });
    }
    const driverEditorialMatch = url.pathname.match(/^\/drivers\/([A-Za-z0-9_-]+)\/editorial$/);
    if (request.method === 'PATCH' && driverEditorialMatch) {
      const result = await saveDriverEditorial(await requestBody(request), driverEditorialMatch[1]);
      return result ? json(response, 200, result) : json(response, 404, { error: 'not_found' });
    }
    const match = url.pathname.match(/^\/drivers\/([A-Za-z0-9_-]+)$/);
    if (request.method === 'GET' && match) {
      const driver = await getDriver(match[1]);
      return driver ? json(response, 200, driver) : json(response, 404, { error: 'not_found' });
    }
    if (request.method === 'PATCH' && match) {
      const result = await saveDriver(await requestBody(request), match[1]);
      return result ? json(response, 200, result) : json(response, 404, { error: 'not_found' });
    }
    return json(response, 404, { error: 'not_found' });
  } catch (error) {
    console.error('Ошибка локального API админки', error);
    return json(response, 400, { error: 'invalid_request', message: error instanceof Error ? error.message : 'Неизвестная ошибка' });
  }
});

server.listen(port, host, async () => {
  const result = await pool.query('SELECT count(*)::int AS count FROM atlas.drivers');
  console.log(`Локальная база админки: http://${host}:${port} · ${result.rows[0].count} записей пилотов`);
});

async function shutdown() {
  server.close();
  closeDriverBackgroundWorker();
  await pool.end();
}

process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);
