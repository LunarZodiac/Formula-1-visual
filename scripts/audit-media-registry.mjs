#!/usr/bin/env node

import { access, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import pg from 'pg';

const required = ['PGHOST', 'PGPORT', 'PGDATABASE', 'PGUSER', 'PGPASSWORD'];
const missing = required.filter((name) => !process.env[name]);
if (missing.length) throw new Error(`Не заданы параметры базы: ${missing.join(', ')}`);

const client = new pg.Client({ application_name: 'f1-geovisual-atlas-media-audit' });
await client.connect();
try {
  const coverage = await client.query(`
      SELECT profile.circuit_id, profile.editorial_status,
             count(DISTINCT history.media_asset_id)::integer AS history_items,
             count(DISTINCT gallery.media_asset_id)::integer AS gallery_items
      FROM atlas.circuit_page_profiles AS profile
      LEFT JOIN atlas.circuit_history_entries AS history USING (circuit_id)
      LEFT JOIN atlas.circuit_media_gallery AS gallery USING (circuit_id)
      WHERE profile.editorial_status = 'published'
      GROUP BY profile.circuit_id, profile.editorial_status
      ORDER BY profile.circuit_id
    `);
  const status = await client.query(`
      SELECT provenance_type, rights_status, review_status, count(*)::integer AS count
      FROM atlas.media_assets
      GROUP BY provenance_type, rights_status, review_status
      ORDER BY provenance_type, rights_status, review_status
    `);
  const duplicates = await client.query(`
      WITH uses AS (
        SELECT circuit_id, media_asset_id FROM atlas.circuit_history_entries
        UNION ALL
        SELECT circuit_id, media_asset_id FROM atlas.circuit_media_gallery
      )
      SELECT media_asset_id, count(DISTINCT circuit_id)::integer AS circuit_count,
             array_agg(DISTINCT circuit_id ORDER BY circuit_id) AS circuits
      FROM uses
      GROUP BY media_asset_id
      HAVING count(DISTINCT circuit_id) > 1
      ORDER BY media_asset_id
    `);
  const derivatives = await client.query(`
      SELECT media.id, media.entity_type, media.entity_id, media.usage_role
      FROM atlas.media_assets AS media
      LEFT JOIN atlas.media_asset_derivatives AS derivative
        ON derivative.media_asset_id = media.id
      WHERE media.media_type = 'image'
        AND media.review_status IN ('reviewed', 'published')
      GROUP BY media.id
      HAVING count(derivative.id) = 0
      ORDER BY media.id
    `);
  const localAssets = await client.query(`
    SELECT id, url
    FROM atlas.media_assets
    WHERE url LIKE '/%'
    ORDER BY id
  `);
  const localAssetChecks = await Promise.all(localAssets.rows.map(async (row) => {
    const filePath = path.resolve('apps', 'web', 'public', row.url.replace(/^\/+/, ''));
    try {
      await access(filePath);
      return null;
    } catch {
      return { id: row.id, url: row.url, expectedFile: filePath };
    }
  }));
  const missingLocalFiles = localAssetChecks.filter(Boolean);

  const report = {
    generatedAt: new Date().toISOString(),
    scope: {
      publishedCircuitPages: coverage.rowCount,
      note: 'Проверка страниц пока ограничена опубликованными шаблонами Спа и Бахрейна.',
    },
    summary: {
      mediaAssets: status.rows.reduce((sum, row) => sum + Number(row.count), 0),
      publishedCircuitPagesWithoutHistory: coverage.rows.filter((row) => Number(row.history_items) === 0).length,
      publishedCircuitPagesWithoutGallery: coverage.rows.filter((row) => Number(row.gallery_items) === 0).length,
      globallyReusedCircuitMedia: duplicates.rowCount,
      reviewedImagesWithoutDerivatives: derivatives.rowCount,
      missingLocalFiles: missingLocalFiles.length,
    },
    circuitCoverage: coverage.rows.map((row) => ({
      circuitId: row.circuit_id,
      historyItems: Number(row.history_items),
      galleryItems: Number(row.gallery_items),
    })),
    registryStatus: status.rows,
    globallyReusedCircuitMedia: duplicates.rows,
    reviewedImagesWithoutDerivatives: derivatives.rows,
    missingLocalFiles,
  };

  const outputPath = path.resolve('data', 'review', 'media-registry-audit.json');
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify(report.summary, null, 2));
} finally {
  await client.end();
}
