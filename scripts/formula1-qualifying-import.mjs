#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import pg from 'pg';
import { pathToFileURL } from 'node:url';

const { Client } = pg;
const SOURCE_ID = 'formula1-official-results';
const BASE_URL = 'https://www.formula1.com/en/results';
const USER_AGENT = 'F1-Geovisual-Atlas/0.1 official-results-import';
const REQUEST_INTERVAL_MS = 450;
const REQUEST_TIMEOUT_MS = 30_000;
const MAX_RETRIES = 4;

function readSeason(argv) {
  const inline = argv.find((argument) => argument.startsWith('--season='));
  const separateIndex = argv.indexOf('--season');
  const raw = inline?.slice('--season='.length)
    ?? (separateIndex >= 0 ? argv[separateIndex + 1] : null);
  if (!raw || !/^\d{4}$/.test(raw)) {
    throw new Error('Укажите сезон: --season=2002');
  }
  const season = Number(raw);
  if (season < 1950 || season > new Date().getUTCFullYear()) {
    throw new Error(`Сезон ${season} находится вне допустимого диапазона`);
  }
  return season;
}

function assertDatabaseEnvironment() {
  const required = ['PGHOST', 'PGPORT', 'PGDATABASE', 'PGUSER', 'PGPASSWORD'];
  const missing = required.filter((name) => !process.env[name]);
  if (missing.length) throw new Error(`Не заданы параметры базы: ${missing.join(', ')}`);
}

function decodeEntities(value) {
  const named = new Map([
    ['amp', '&'], ['apos', "'"], ['quot', '"'], ['lt', '<'], ['gt', '>'],
    ['nbsp', ' '],
  ]);
  return value.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (entity, code) => {
    if (code.startsWith('#x')) return String.fromCodePoint(Number.parseInt(code.slice(2), 16));
    if (code.startsWith('#')) return String.fromCodePoint(Number.parseInt(code.slice(1), 10));
    return named.get(code.toLowerCase()) ?? entity;
  });
}

function cellText(value) {
  return decodeEntities(value.replace(/<[^>]*>/g, ' '))
    .replace(/[\s\u00a0]+/g, ' ')
    .trim();
}

function driverNameFromCell(value) {
  const text = cellText(value);
  return text.replace(/\s+[A-Z]{3}$/, '').trim();
}

export function parseQualifyingTable(html) {
  const body = html.match(/<tbody[^>]*>([\s\S]*?)<\/tbody>/i)?.[1];
  if (!body) throw new Error('На странице не найдена таблица результатов');

  const rows = [];
  for (const match of body.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const cells = [...match[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)]
      .map((cell) => cell[1]);
    if (cells.length < 6) continue;
    const positionText = cellText(cells[0]);
    const carNumber = Number(cellText(cells[1]));
    const driverName = driverNameFromCell(cells[2]);
    const teamName = cellText(cells[3]);
    const time = cellText(cells[4]);
    const laps = Number(cellText(cells[5]));
    if (!positionText || !Number.isInteger(carNumber) || !driverName) continue;
    rows.push({
      positionOrder: rows.length + 1,
      positionText,
      carNumber,
      driverName,
      teamName,
      time: time || null,
      laps: Number.isInteger(laps) ? laps : null,
    });
  }
  if (!rows.length) throw new Error('Таблица квалификации не содержит строк');
  return rows;
}

export function parseRaceLinks(html, season) {
  const pattern = new RegExp(`/en/results/${season}/races/(\\d+)/([^/"?#]+)/race-result`, 'g');
  const links = [];
  const known = new Set();
  for (const match of html.matchAll(pattern)) {
    const key = `${match[1]}/${match[2]}`;
    if (known.has(key)) continue;
    known.add(key);
    links.push({ meetingId: Number(match[1]), slug: match[2] });
  }
  if (!links.length) throw new Error(`Не найден список этапов Formula 1 сезона ${season}`);
  return links;
}

function normalizedName(value) {
  return value.normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/gi, '')
    .toLowerCase();
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function wait(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

let previousRequestAt = 0;
async function fetchOfficial(url, attempt = 1) {
  const delay = Math.max(0, REQUEST_INTERVAL_MS - (Date.now() - previousRequestAt));
  if (delay) await wait(delay);
  previousRequestAt = Date.now();
  let response;
  try {
    response = await fetch(url, {
      headers: { Accept: 'text/html', 'User-Agent': USER_AGENT },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (error) {
    if (attempt < MAX_RETRIES) {
      await wait(1000 * (2 ** (attempt - 1)));
      return fetchOfficial(url, attempt + 1);
    }
    throw error;
  }
  if (response.ok) return response.text();
  if ((response.status === 429 || response.status >= 500) && attempt < MAX_RETRIES) {
    await wait(1000 * (2 ** (attempt - 1)));
    return fetchOfficial(url, attempt + 1);
  }
  throw new Error(`Formula 1 вернула HTTP ${response.status} для ${url}`);
}

async function loadSeasonContext(client, season) {
  const racesResult = await client.query(`
    SELECT race.id, race.round, race.name,
           EXISTS (
             SELECT 1
             FROM atlas.sessions session
             JOIN atlas.session_results result ON result.session_id = session.id
             WHERE session.race_id = race.id AND session.session_type = 'qualifying'
           ) AS has_qualifying
    FROM atlas.races race
    WHERE race.season_year = $1 AND race.status = 'completed'
    ORDER BY race.round
  `, [season]);
  if (!racesResult.rows.length) throw new Error(`В базе нет завершённых этапов сезона ${season}`);

  const driversResult = await client.query(`
    SELECT id, given_name, family_name
    FROM atlas.drivers
  `);
  const driversByName = new Map();
  for (const row of driversResult.rows) {
    const key = normalizedName(`${row.given_name} ${row.family_name}`);
    const list = driversByName.get(key) ?? [];
    list.push(String(row.id));
    driversByName.set(key, list);
  }
  return { races: racesResult.rows, driversByName };
}

async function resolveRows(client, race, rows, driversByName) {
  const entriesResult = await client.query(`
    SELECT entry.driver_id, entry.constructor_entry_id, entry.car_number
    FROM atlas.driver_event_entries entry
    WHERE entry.race_id = $1
  `, [race.id]);
  const entriesByNumber = new Map();
  for (const entry of entriesResult.rows) {
    if (entry.car_number === null) continue;
    const key = Number(entry.car_number);
    const list = entriesByNumber.get(key) ?? [];
    list.push(entry);
    entriesByNumber.set(key, list);
  }

  return rows.map((row) => {
    const numberMatches = entriesByNumber.get(row.carNumber) ?? [];
    const nameMatches = driversByName.get(normalizedName(row.driverName)) ?? [];
    let driverId = null;
    let constructorEntryId = null;
    let resolution = null;
    if (nameMatches.length === 1) {
      driverId = nameMatches[0];
      const matchingEntry = entriesResult.rows.find((entry) => entry.driver_id === driverId);
      constructorEntryId = matchingEntry?.constructor_entry_id ?? null;
      resolution = 'driver-name';
    } else if (numberMatches.length === 1) {
      driverId = String(numberMatches[0].driver_id);
      constructorEntryId = numberMatches[0].constructor_entry_id;
      resolution = 'event-number';
    }
    return { ...row, driverId, constructorEntryId, resolution };
  });
}

async function saveSnapshot(season, meetings) {
  const directory = path.resolve('tmp', 'formula1-qualifying-snapshots', String(season));
  await mkdir(directory, { recursive: true });
  const filePath = path.join(directory, 'latest.json');
  await writeFile(filePath, `${JSON.stringify({
    schemaVersion: 1,
    provider: SOURCE_ID,
    season,
    fetchedAt: new Date().toISOString(),
    meetings,
  }, null, 2)}\n`, 'utf8');
  return filePath;
}

async function importMeetings(client, season, meetings) {
  await client.query('BEGIN');
  try {
    await client.query(`
      INSERT INTO atlas.data_sources (id, name, url, licence, retrieved_at, notes)
      VALUES ($1, 'Formula 1 — официальный архив результатов', $2,
              'Official website; factual results only', now(),
              'Итоговые таблицы квалификаций из официального архива Formula 1')
      ON CONFLICT (id) DO UPDATE SET retrieved_at = now(), notes = EXCLUDED.notes
    `, [SOURCE_ID, `${BASE_URL}/${season}/races`]);

    for (const meeting of meetings) {
      const preferredSessionId = `${meeting.raceId}-qualifying`;
      const sessionResult = await client.query(`
        INSERT INTO atlas.sessions
          (id, race_id, session_type, name, status, source_id, updated_at)
        VALUES ($1, $2, 'qualifying', 'Квалификация', 'completed', $3, now())
        ON CONFLICT (race_id, session_type) DO UPDATE SET
          name = EXCLUDED.name,
          status = EXCLUDED.status,
          source_id = EXCLUDED.source_id,
          updated_at = now()
        RETURNING id
      `, [preferredSessionId, meeting.raceId, SOURCE_ID]);
      const sessionId = String(sessionResult.rows[0].id);
      await client.query('DELETE FROM atlas.session_results WHERE session_id = $1', [sessionId]);
      for (const row of meeting.rows) {
        await client.query(`
          INSERT INTO atlas.session_results
            (session_id, position_order, position_text, driver_id,
             constructor_entry_id, laps, points, details, source_id)
          VALUES ($1, $2, $3, $4, $5, $6, 0, $7::jsonb, $8)
        `, [
          sessionId,
          row.positionOrder,
          row.positionText,
          row.driverId,
          row.constructorEntryId,
          row.laps,
          JSON.stringify({ q1: row.time, officialUrl: meeting.url, carNumber: row.carNumber }),
          SOURCE_ID,
        ]);
      }
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}

async function run() {
  const argv = process.argv.slice(2);
  const season = readSeason(argv);
  const apply = argv.includes('--apply');
  assertDatabaseEnvironment();
  const client = new Client({ application_name: 'f1-official-qualifying-import' });
  await client.connect();
  try {
    const { races, driversByName } = await loadSeasonContext(client, season);
    const missingRaces = races.filter((race) => !race.has_qualifying);
    if (!missingRaces.length) {
      console.log(JSON.stringify({ season, mode: apply ? 'apply' : 'preview', missingRounds: 0 }, null, 2));
      return;
    }

    const indexUrl = `${BASE_URL}/${season}/races`;
    const indexHtml = await fetchOfficial(indexUrl);
    const links = parseRaceLinks(indexHtml, season);
    if (links.length !== races.length) {
      throw new Error(`Число этапов не совпало: Formula 1 — ${links.length}, база — ${races.length}`);
    }

    const meetings = [];
    for (const race of missingRaces) {
      const link = links[Number(race.round) - 1];
      if (!link) throw new Error(`Не найден официальный этап для раунда ${race.round}`);
      const url = `${BASE_URL}/${season}/races/${link.meetingId}/${link.slug}/qualifying`;
      process.stdout.write(`Раунд ${race.round}: ${url} ... `);
      const html = await fetchOfficial(url);
      const parsedRows = parseQualifyingTable(html);
      const rows = await resolveRows(client, race, parsedRows, driversByName);
      const unresolved = rows.filter((row) => !row.driverId);
      console.log(`${rows.length} строк${unresolved.length ? `, не сопоставлено ${unresolved.length}` : ''}`);
      meetings.push({
        raceId: race.id,
        round: Number(race.round),
        raceName: race.name,
        meetingId: link.meetingId,
        slug: link.slug,
        url,
        htmlSha256: sha256(html),
        rows,
      });
    }

    const unresolved = meetings.flatMap((meeting) => meeting.rows
      .filter((row) => !row.driverId)
      .map((row) => ({ round: meeting.round, carNumber: row.carNumber, driverName: row.driverName })));
    const snapshotPath = await saveSnapshot(season, meetings);
    const report = {
      season,
      mode: apply ? 'apply' : 'preview',
      missingRounds: missingRaces.length,
      fetchedMeetings: meetings.length,
      resultRows: meetings.reduce((sum, meeting) => sum + meeting.rows.length, 0),
      unresolved,
      snapshotPath,
    };
    console.log(JSON.stringify(report, null, 2));
    if (unresolved.length) throw new Error('Запись остановлена: есть несопоставленные пилоты');
    if (!apply) {
      console.log('Предпросмотр завершён. Для записи повторите команду с --apply');
      return;
    }
    await importMeetings(client, season, meetings);
    console.log(`Записаны квалификации сезона ${season}: ${meetings.length}`);
  } finally {
    await client.end();
  }
}

const isCommandLine = process.argv[1]
  && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isCommandLine) {
  run().catch((error) => {
    console.error(`Ошибка: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  });
}
