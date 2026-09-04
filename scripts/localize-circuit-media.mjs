#!/usr/bin/env node

import { mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { promisify } from 'node:util';
import pg from 'pg';

const execFileAsync = promisify(execFile);
const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

function wikimediaOriginalUrl(sourceUrl) {
  const marker = '/wiki/File:';
  if (!sourceUrl.includes(marker)) return sourceUrl;
  const filename = decodeURIComponent(sourceUrl.split(marker)[1]).replaceAll(' ', '_');
  const hash = createHash('md5').update(filename).digest('hex');
  return `https://upload.wikimedia.org/wikipedia/commons/${hash[0]}/${hash.slice(0, 2)}/${encodeURIComponent(filename)}`;
}

async function fetchWithRetry(url, assetId) {
  for (let attempt = 1; attempt <= 5; attempt += 1) {
    const response = await fetch(url, {
      headers: { 'User-Agent': 'Formula1AtlasMediaPipeline/1.0 (editorial asset localization)' },
      redirect: 'follow',
    });
    if (response.ok) return response;
    if (response.status !== 429 || attempt === 5) {
      throw new Error(`${assetId}: источник ответил ${response.status}`);
    }
    await wait(attempt * 10000);
  }
  throw new Error(`${assetId}: превышено число попыток`);
}
const circuitId = process.argv[process.argv.indexOf('--circuit') + 1];
if (!circuitId || !process.argv.includes('--apply')) {
  throw new Error('Использование: node scripts/localize-circuit-media.mjs --circuit <id> --apply');
}

const required = ['PGHOST', 'PGPORT', 'PGDATABASE', 'PGUSER', 'PGPASSWORD'];
const missing = required.filter((name) => !process.env[name]);
if (missing.length) throw new Error(`Не заданы параметры базы: ${missing.join(', ')}`);

const publicDirectory = path.resolve('apps', 'web', 'public', 'assets', 'f1', 'circuits', circuitId, 'media');
const workDirectory = path.join(tmpdir(), `f1-atlas-media-${circuitId}`);
await mkdir(publicDirectory, { recursive: true });
await mkdir(workDirectory, { recursive: true });

const client = new pg.Client({ application_name: 'f1-geovisual-atlas-media-localizer' });
await client.connect();
try {
  const result = await client.query(`
    SELECT DISTINCT media.id, media.source_url
    FROM atlas.media_assets AS media
    LEFT JOIN atlas.circuit_history_entries AS history ON history.media_asset_id = media.id
    LEFT JOIN atlas.circuit_media_gallery AS gallery ON gallery.media_asset_id = media.id
    WHERE COALESCE(history.circuit_id, gallery.circuit_id) = $1
      AND media.media_type = 'image'
      AND media.review_status IN ('reviewed', 'published')
      AND media.rights_status = 'verified'
      AND media.source_url IS NOT NULL
      AND (SELECT count(*) FROM atlas.media_asset_derivatives AS derivative
           WHERE derivative.media_asset_id = media.id) < 3
    ORDER BY media.id
  `, [circuitId]);

  for (const asset of result.rows) {
    const response = await fetchWithRetry(
      wikimediaOriginalUrl(asset.source_url), asset.id,
    );

    const sourcePath = path.join(workDirectory, `${asset.id}.source`);
    await writeFile(sourcePath, Buffer.from(await response.arrayBuffer()));
    const { stdout } = await execFileAsync('python', [
      path.resolve('scripts', 'optimize-media-image.py'), sourcePath, publicDirectory, asset.id,
    ]);
    const variants = JSON.parse(stdout);

    for (const variant of variants) {
      const publicUrl = `/assets/f1/circuits/${circuitId}/media/${asset.id}-${variant.variant.replace('w', '')}.webp`;
      await client.query(`
        INSERT INTO atlas.media_asset_derivatives (
          id, media_asset_id, variant, url, mime_type, width_px, height_px, file_size_bytes
        ) VALUES ($1, $2, $3, $4, 'image/webp', $5, $6, $7)
        ON CONFLICT (media_asset_id, variant) DO UPDATE SET
          url = EXCLUDED.url,
          mime_type = EXCLUDED.mime_type,
          width_px = EXCLUDED.width_px,
          height_px = EXCLUDED.height_px,
          file_size_bytes = EXCLUDED.file_size_bytes,
          created_at = now()
      `, [`${asset.id}-${variant.variant}`, asset.id, variant.variant, publicUrl,
        variant.width, variant.height, variant.size]);
    }
    await client.query(`
      UPDATE atlas.media_assets
      SET url = $2
      WHERE id = $1
    `, [asset.id, `/assets/f1/circuits/${circuitId}/media/${asset.id}-1280.webp`]);
    console.log(`Локализовано: ${asset.id}`);
    await wait(5000);
  }
} finally {
  await client.end();
  await rm(workDirectory, { recursive: true, force: true });
}
