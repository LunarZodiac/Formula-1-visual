#!/usr/bin/env node

import pg from 'pg';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const API_BASE_URL = 'https://api.jolpi.ca/ergast/f1';
const PAGE_LIMIT = 1000;
const REQUEST_INTERVAL_MS = 750;
const MAX_RETRIES = 6;
const BATCH_SIZE = 500;
const CACHE_DIRECTORY = path.resolve('tmp', 'jolpica-number-history');

function argumentValue(argv, name) {
  const inline = argv.find((argument) => argument.startsWith(`--${name}=`));
  const separateIndex = argv.indexOf(`--${name}`);
  return inline?.slice(name.length + 3) ?? (separateIndex >= 0 ? argv[separateIndex + 1] : undefined);
}

function readOptions(argv) {
  const singleSeason = argumentValue(argv, 'season');
  const fromSeason = Number(singleSeason ?? argumentValue(argv, 'from-season') ?? 1950);
  const throughSeason = Number(singleSeason ?? argumentValue(argv, 'through-season') ?? new Date().getUTCFullYear());
  if (!Number.isInteger(fromSeason) || !Number.isInteger(throughSeason) || fromSeason < 1950 || throughSeason < fromSeason) {
    throw new Error('Укажите корректный диапазон: --season 2024 или --from-season 1950 --through-season 2026');
  }
  return { fromSeason, throughSeason, apply: argv.includes('--apply'), refresh: argv.includes('--refresh') };
}

function assertDatabaseEnvironment() {
  const required = ['PGHOST', 'PGPORT', 'PGDATABASE', 'PGUSER', 'PGPASSWORD'];
  const missing = required.filter((name) => !process.env[name]);
  if (missing.length) throw new Error(`Не заданы параметры базы: ${missing.join(', ')}`);
}

const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
let previousRequestAt = 0;

async function requestJson(url, attempt = 1) {
  const waitFor = Math.max(0, REQUEST_INTERVAL_MS - (Date.now() - previousRequestAt));
  if (waitFor) await wait(waitFor);
  previousRequestAt = Date.now();
  const response = await fetch(url, {
    headers: { Accept: 'application/json', 'User-Agent': 'F1-Geovisual-Atlas/0.1 number-history-import' },
  });
  if (response.ok) return response.json();
  if ((response.status === 429 || response.status >= 500) && attempt < MAX_RETRIES) {
    const retryAfter = Number(response.headers.get('retry-after'));
    await wait(Number.isFinite(retryAfter) ? retryAfter * 1000 : 2000 * 2 ** (attempt - 1));
    return requestJson(url, attempt + 1);
  }
  throw new Error(`Jolpica вернула HTTP ${response.status} для ${url}`);
}

async function fetchSeasonEntries(season, refresh = false) {
  const cachePath = path.join(CACHE_DIRECTORY, `results-${season}.json`);
  if (!refresh) {
    try {
      const cached = JSON.parse(await readFile(cachePath, 'utf8'));
      if (Array.isArray(cached)) return cached;
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error;
    }
  }
  const entries = [];
  let offset = 0;
  let total = Infinity;
  while (offset < total) {
    const url = new URL(`${API_BASE_URL}/${season}/results.json`);
    url.searchParams.set('limit', String(PAGE_LIMIT));
    url.searchParams.set('offset', String(offset));
    const payload = await requestJson(url);
    const data = payload?.MRData;
    if (!data || data.series !== 'f1') throw new Error(`Некорректный ответ Jolpica для сезона ${season}`);
    for (const race of data.RaceTable?.Races ?? []) {
      for (const result of race.Results ?? []) {
        const parsedNumber = result.number === undefined || result.number === '' ? null : Number(result.number);
        const carNumber = Number.isInteger(parsedNumber) && parsedNumber >= 0 ? parsedNumber : null;
        if (!result.Driver?.driverId) continue;
        entries.push({
          raceId: `${season}-${String(race.round).padStart(2, '0')}`,
          season,
          driverId: result.Driver.driverId,
          constructorId: result.Constructor?.constructorId ?? null,
          carNumber,
        });
      }
    }
    total = Number(data.total ?? 0);
    const receivedLimit = Number(data.limit ?? PAGE_LIMIT);
    if (!Number.isFinite(total) || !Number.isFinite(receivedLimit) || receivedLimit <= 0) {
      throw new Error(`Некорректная пагинация Jolpica для сезона ${season}`);
    }
    offset += receivedLimit;
  }
  await mkdir(CACHE_DIRECTORY, { recursive: true });
  await writeFile(cachePath, `${JSON.stringify(entries)}\n`, 'utf8');
  return entries;
}

function chunks(rows, size) {
  return Array.from({ length: Math.ceil(rows.length / size) }, (_, index) => rows.slice(index * size, (index + 1) * size));
}

assertDatabaseEnvironment();
const options = readOptions(process.argv.slice(2));
const downloaded = [];
for (let season = options.fromSeason; season <= options.throughSeason; season++) {
  const rows = await fetchSeasonEntries(season, options.refresh);
  downloaded.push(...rows);
  console.log(`Jolpica ${season}: ${rows.length} записей с номерами`);
}

const client = new pg.Client({ application_name: 'f1-atlas-driver-event-number-backfill' });
await client.connect();
try {
  const racesResult = await client.query(
    'SELECT id FROM atlas.races WHERE season_year BETWEEN $1 AND $2',
    [options.fromSeason, options.throughSeason],
  );
  const driversResult = await client.query('SELECT id FROM atlas.drivers');
  const entriesResult = await client.query(
    'SELECT id, season_year, constructor_id FROM atlas.constructor_entries WHERE season_year BETWEEN $1 AND $2',
    [options.fromSeason, options.throughSeason],
  );
  const raceIds = new Set(racesResult.rows.map((row) => row.id));
  const driverIds = new Set(driversResult.rows.map((row) => row.id));
  const constructorEntries = new Map(entriesResult.rows.map((row) => [`${row.season_year}:${row.constructor_id}`, Number(row.id)]));
  const missingRaces = new Set();
  const missingDrivers = new Set();
  const missingConstructors = new Set();
  const ready = [];
  for (const row of downloaded) {
    if (!raceIds.has(row.raceId)) { missingRaces.add(row.raceId); continue; }
    if (!driverIds.has(row.driverId)) { missingDrivers.add(row.driverId); continue; }
    const constructorEntryId = row.constructorId ? constructorEntries.get(`${row.season}:${row.constructorId}`) ?? null : null;
    if (row.constructorId && constructorEntryId === null) missingConstructors.add(`${row.season}:${row.constructorId}`);
    ready.push({ race_id: row.raceId, driver_id: row.driverId, constructor_entry_id: constructorEntryId, car_number: row.carNumber });
  }

  const summary = {
    range: `${options.fromSeason}-${options.throughSeason}`,
    downloaded: downloaded.length,
    ready: ready.length,
    missingRaces: [...missingRaces],
    missingDrivers: [...missingDrivers],
    missingConstructorEntries: [...missingConstructors],
    mode: options.apply ? 'apply' : 'preview',
  };
  console.log(JSON.stringify(summary, null, 2));
  if (!options.apply) {
    console.log('Предпросмотр завершён. Для записи добавьте --apply');
  } else {
    if (missingRaces.size || missingDrivers.size) {
      throw new Error('Запись отменена: сначала устраните отсутствующие гонки или записи пилотов');
    }
    await client.query('BEGIN');
    try {
      await client.query(`INSERT INTO atlas.data_sources (id, name, url, licence, retrieved_at)
        VALUES ('jolpica', 'Jolpica F1', 'https://api.jolpi.ca/ergast/f1/', 'Jolpica Terms of Use', now())
        ON CONFLICT (id) DO UPDATE SET retrieved_at = now()`);
      let affected = 0;
      for (const batch of chunks(ready, BATCH_SIZE)) {
        const result = await client.query(`
          INSERT INTO atlas.driver_event_entries
            (race_id, driver_id, constructor_entry_id, car_number, number_type, source_id, review_status, updated_at)
          SELECT row.race_id, row.driver_id, row.constructor_entry_id, row.car_number,
                 'event', 'jolpica', 'imported', now()
          FROM jsonb_to_recordset($1::jsonb) AS row(
            race_id text, driver_id text, constructor_entry_id bigint, car_number smallint
          )
          ON CONFLICT ON CONSTRAINT driver_event_entries_identity_unique DO UPDATE SET
            source_id = EXCLUDED.source_id,
            review_status = CASE
              WHEN atlas.driver_event_entries.review_status IN ('reviewed', 'verified')
                THEN atlas.driver_event_entries.review_status
              ELSE EXCLUDED.review_status
            END,
            updated_at = now()
        `, [JSON.stringify(batch)]);
        affected += result.rowCount ?? 0;
      }
      await client.query('COMMIT');
      console.log(`Записано или обновлено: ${affected}`);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    }
  }
} finally {
  await client.end();
}
