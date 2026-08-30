#!/usr/bin/env node

import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const { Client } = pg;
const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, '..');
const snapshotDirectory = path.join(repositoryRoot, 'apps', 'web', 'app', 'data', 'circuit-pages');
const outputPath = path.join(repositoryRoot, 'data', 'review', 'circuit-page-data-audit.json');

function assertDatabaseEnvironment() {
  const required = ['PGHOST', 'PGPORT', 'PGDATABASE', 'PGUSER', 'PGPASSWORD'];
  const missing = required.filter((name) => !process.env[name]);
  if (missing.length > 0) throw new Error(`Не заданы параметры базы: ${missing.join(', ')}`);
}

async function readSnapshots() {
  const filenames = (await readdir(snapshotDirectory)).filter((name) => name.endsWith('.json'));
  return Promise.all(filenames.map(async (filename) => {
    const value = JSON.parse(await readFile(path.join(snapshotDirectory, filename), 'utf8'));
    return { filename, id: value.id, slug: value.slug };
  }));
}

async function main() {
  assertDatabaseEnvironment();
  const client = new Client({ application_name: 'f1-geovisual-atlas-circuit-page-audit' });
  await client.connect();
  try {
    const snapshots = await readSnapshots();
    const profilesResult = await client.query(
        `SELECT
           profile.circuit_id,
           profile.slug,
           profile.editorial_status,
           count(DISTINCT stat.section || ':' || stat.sort_order)::integer AS stats,
           count(DISTINCT history.id)::integer AS history_entries,
           count(DISTINCT gallery.media_asset_id)::integer AS gallery_items
         FROM atlas.circuit_page_profiles AS profile
         LEFT JOIN atlas.circuit_page_stats AS stat ON stat.circuit_id = profile.circuit_id
         LEFT JOIN atlas.circuit_history_entries AS history ON history.circuit_id = profile.circuit_id
         LEFT JOIN atlas.circuit_media_gallery AS gallery ON gallery.circuit_id = profile.circuit_id
         GROUP BY profile.circuit_id, profile.slug, profile.editorial_status
         ORDER BY profile.circuit_id`,
      );
    const unsourcedStatsResult = await client.query(
        `SELECT circuit_id, section, sort_order, label_ru
         FROM atlas.circuit_page_stats
         WHERE source_id IS NULL
         ORDER BY circuit_id, section, sort_order`,
      );
    const incompleteMediaResult = await client.query(
        `SELECT id, entity_type, entity_id,
                author IS NULL AS missing_author,
                licence IS NULL AS missing_licence,
                source_url IS NULL AS missing_source_url,
                alt_text_ru IS NULL AS missing_alt_text_ru
         FROM atlas.media_assets
         WHERE id IN (
           SELECT media_asset_id FROM atlas.circuit_history_entries
           UNION
           SELECT media_asset_id FROM atlas.circuit_media_gallery
         )
           AND (author IS NULL OR licence IS NULL OR source_url IS NULL OR alt_text_ru IS NULL)
         ORDER BY id`,
      );
    const duplicateMediaResult = await client.query(
        `WITH page_media AS (
           SELECT history.circuit_id, media.url
           FROM atlas.circuit_history_entries AS history
           JOIN atlas.media_assets AS media ON media.id = history.media_asset_id
           UNION ALL
           SELECT gallery.circuit_id, media.url
           FROM atlas.circuit_media_gallery AS gallery
           JOIN atlas.media_assets AS media ON media.id = gallery.media_asset_id
         )
         SELECT circuit_id, url, count(*)::integer AS uses
         FROM page_media
         GROUP BY circuit_id, url
         HAVING count(*) > 1
         ORDER BY circuit_id, url`,
      );

    const profiles = profilesResult.rows.map((row) => ({
      circuitId: row.circuit_id,
      slug: row.slug,
      editorialStatus: row.editorial_status,
      stats: Number(row.stats),
      historyEntries: Number(row.history_entries),
      galleryItems: Number(row.gallery_items),
    }));
    const profileIds = new Set(profiles.map((profile) => profile.circuitId));
    const snapshotIds = new Set(snapshots.map((snapshot) => snapshot.id));
    const report = {
      generatedAt: new Date().toISOString(),
      summary: {
        snapshots: snapshots.length,
        databaseProfiles: profiles.length,
        snapshotsWithoutProfile: snapshots.filter((snapshot) => !profileIds.has(snapshot.id)).length,
        profilesWithoutSnapshot: profiles.filter((profile) => !snapshotIds.has(profile.circuitId)).length,
        unsourcedStats: unsourcedStatsResult.rowCount,
        incompleteMedia: incompleteMediaResult.rowCount,
        duplicateMediaWithinPage: duplicateMediaResult.rowCount,
      },
      profiles,
      snapshotsWithoutProfile: snapshots.filter((snapshot) => !profileIds.has(snapshot.id)),
      profilesWithoutSnapshot: profiles.filter((profile) => !snapshotIds.has(profile.circuitId)),
      unsourcedStats: unsourcedStatsResult.rows.map((row) => ({
        circuitId: row.circuit_id,
        section: row.section,
        sortOrder: Number(row.sort_order),
        label: row.label_ru,
      })),
      incompleteMedia: incompleteMediaResult.rows,
      duplicateMediaWithinPage: duplicateMediaResult.rows,
    };

    await mkdir(path.dirname(outputPath), { recursive: true });
    await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
    console.log(JSON.stringify(report.summary, null, 2));
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(`Ошибка: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
