#!/usr/bin/env node

import { readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const { Client } = pg;
const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, '..');
const outputDirectory = path.join(repositoryRoot, 'apps', 'web', 'app', 'data', 'circuit-pages');

function readOptions(argv) {
  const inlineCircuit = argv.find((value) => value.startsWith('--circuit='));
  const circuitIndex = argv.indexOf('--circuit');
  return {
    circuitId: inlineCircuit?.slice('--circuit='.length)
      ?? (circuitIndex >= 0 ? argv[circuitIndex + 1] : null),
    checkOnly: argv.includes('--check'),
  };
}

function assertDatabaseEnvironment() {
  const required = ['PGHOST', 'PGPORT', 'PGDATABASE', 'PGUSER', 'PGPASSWORD'];
  const missing = required.filter((name) => !process.env[name]);
  if (missing.length > 0) throw new Error(`Не заданы параметры базы: ${missing.join(', ')}`);
}

async function writeJsonAtomic(filePath, value) {
  const temporaryPath = `${filePath}.tmp-${process.pid}`;
  await writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  await rename(temporaryPath, filePath);
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]),
  );
}

function semanticJson(value) {
  return JSON.stringify(canonicalize(value));
}

async function readPageData(client, circuitId) {
  const profileResult = await client.query(
      `SELECT
         profile.circuit_id,
         profile.slug,
         profile.geometry_id,
         profile.name_ru,
         profile.city_ru,
         profile.country_ru,
         profile.summary_ru,
         profile.circuit_type_ru,
         circuit.name AS official_name,
         lower(circuit.country_code) AS country_code,
         ST_X(circuit.location::geometry) AS longitude,
         ST_Y(circuit.location::geometry) AS latitude
       FROM atlas.circuit_page_profiles AS profile
       JOIN atlas.circuits AS circuit ON circuit.id = profile.circuit_id
       WHERE profile.circuit_id = $1
         AND profile.editorial_status = 'published'`,
      [circuitId],
    );
  const statsResult = await client.query(
      `SELECT section, label_ru, value_ru, note_ru, icon
       FROM atlas.circuit_page_stats
       WHERE circuit_id = $1
       ORDER BY section, sort_order`,
      [circuitId],
    );
  const historyResult = await client.query(
      `SELECT
         entry.year_label,
         entry.title_ru,
         entry.description_ru,
         media.url,
         media.alt_text_ru,
         media.author,
         media.licence,
         media.source_url
       FROM atlas.circuit_history_entries AS entry
       LEFT JOIN atlas.media_assets AS media ON media.id = entry.media_asset_id
       WHERE entry.circuit_id = $1
       ORDER BY entry.sort_order`,
      [circuitId],
    );
  const galleryResult = await client.query(
      `SELECT
         gallery.title_ru,
         gallery.description_ru,
         media.url,
         media.author,
         media.licence,
         media.source_url
       FROM atlas.circuit_media_gallery AS gallery
       JOIN atlas.media_assets AS media ON media.id = gallery.media_asset_id
       WHERE gallery.circuit_id = $1
       ORDER BY gallery.sort_order`,
      [circuitId],
    );

  if (profileResult.rowCount !== 1) {
    throw new Error(`Опубликованный профиль страницы трассы ${circuitId} не найден`);
  }
  const mediaUrls = [
    ...historyResult.rows.map((item) => item.url),
    ...galleryResult.rows.map((item) => item.url),
  ].filter(Boolean);
  const duplicatedMediaUrls = mediaUrls.filter((url, index) => mediaUrls.indexOf(url) !== index);
  if (duplicatedMediaUrls.length > 0) {
    throw new Error(`На странице ${circuitId} повторяются медиа: ${[...new Set(duplicatedMediaUrls)].join(', ')}`);
  }
  const profile = profileResult.rows[0];
  const stats = statsResult.rows;
  return {
    profile,
    highlights: stats.filter((item) => item.section === 'highlight').map((item) => item.label_ru),
    metrics: stats.filter((item) => item.section === 'metric').map((item) => ({
      label: item.label_ru,
      value: item.value_ru,
    })),
    statBar: stats.filter((item) => item.section === 'stat_bar').map((item) => ({
      label: item.label_ru,
      value: item.value_ru,
      ...(item.note_ru ? { note: item.note_ru } : {}),
      ...(item.icon ? { icon: item.icon } : {}),
    })),
    history: historyResult.rows.map((item) => ({
      year: item.year_label,
      title: item.title_ru,
      description: item.description_ru,
      ...(item.url ? { image: item.url } : {}),
      ...(item.alt_text_ru ? { imageAlt: item.alt_text_ru } : {}),
      ...(item.author ? { credit: item.author } : {}),
      ...(item.licence ? { license: item.licence } : {}),
      ...(item.source_url ? { sourceUrl: item.source_url } : {}),
    })),
    gallery: galleryResult.rows.map((item) => ({
      src: item.url,
      title: item.title_ru,
      description: item.description_ru,
      ...(item.author ? { credit: item.author } : {}),
      ...(item.licence ? { license: item.licence } : {}),
      ...(item.source_url ? { sourceUrl: item.source_url } : {}),
    })),
  };
}

function buildReadModel(existing, databasePage) {
  const { profile, highlights, metrics, statBar, history, gallery } = databasePage;
  if (gallery.length > 0 && !existing.travel?.story) {
    throw new Error(`Для медиатеки ${profile.slug} в snapshot отсутствует travel.story`);
  }
  const readModel = {
    ...existing,
    schemaVersion: 1,
    id: profile.circuit_id,
    slug: profile.slug,
    geometryId: profile.geometry_id,
    nameRu: profile.name_ru,
    officialName: profile.official_name,
    location: {
      cityRu: profile.city_ru,
      countryRu: profile.country_ru,
      countryCode: profile.country_code,
      coordinates: [Number(profile.longitude), Number(profile.latitude)],
    },
    summary: {
      description: profile.summary_ru,
      typeRu: profile.circuit_type_ru,
      highlights,
      statBar,
      metrics,
    },
    history,
  };
  if (existing.travel?.story) {
    readModel.travel = {
      ...existing.travel,
      story: {
        ...existing.travel.story,
        gallery,
      },
    };
  }
  return readModel;
}

async function main() {
  assertDatabaseEnvironment();
  const options = readOptions(process.argv.slice(2));
  const client = new Client({ application_name: 'f1-geovisual-atlas-circuit-page-exporter' });
  await client.connect();
  try {
    const profilesResult = await client.query(
      `SELECT circuit_id FROM atlas.circuit_page_profiles
       WHERE editorial_status = 'published'
         AND ($1::text IS NULL OR circuit_id = $1)
       ORDER BY circuit_id`,
      [options.circuitId],
    );
    if (profilesResult.rowCount === 0) {
      throw new Error(options.circuitId
        ? `Опубликованный профиль ${options.circuitId} отсутствует`
        : 'Нет опубликованных профилей страниц трасс');
    }

    let changedFiles = 0;
    for (const { circuit_id: circuitId } of profilesResult.rows) {
      const databasePage = await readPageData(client, circuitId);
      const filePath = path.join(outputDirectory, `${databasePage.profile.slug}.json`);
      const existing = JSON.parse(await readFile(filePath, 'utf8'));
      const readModel = buildReadModel(existing, databasePage);
      const changed = semanticJson(existing) !== semanticJson(readModel);
      if (changed) {
        changedFiles += 1;
        if (!options.checkOnly) await writeJsonAtomic(filePath, readModel);
      }
      console.log(`${databasePage.profile.slug}: ${changed ? 'требуется обновление' : 'актуален'}`);
    }

    if (options.checkOnly && changedFiles > 0) process.exitCode = 1;
    console.log(options.checkOnly
      ? `Проверка страниц трасс: ${changedFiles === 0 ? 'актуальны' : `устарело ${changedFiles}`}`
      : `Обновлено страниц трасс: ${changedFiles}`);
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(`Ошибка: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
