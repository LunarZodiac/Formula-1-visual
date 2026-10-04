import { createHash } from 'node:crypto';
import { existsSync, readFileSync, promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { databaseConfig } from './lib/database-config.mjs';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '..');

const GROUPS = {
  drivers: { entityType: 'driver', table: 'drivers', defaultImageRole: 'portrait' },
  constructors: { entityType: 'constructor', table: 'constructors', defaultImageRole: 'general' },
  circuits: { entityType: 'circuit', table: 'circuits', defaultImageRole: 'general' },
};

const EXTENSIONS = new Set([
  '.jpg', '.jpeg', '.png', '.webp', '.avif', '.gif', '.svg',
  '.mp4', '.webm', '.glb', '.gltf', '.pdf',
]);

const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.avif', '.gif', '.svg']);
const VIDEO_EXTENSIONS = new Set(['.mp4', '.webm']);
const MODEL_EXTENSIONS = new Set(['.glb', '.gltf']);

function parseArgs(argv) {
  const args = { dryRun: false, dir: path.join(repoRoot, 'media-import') };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--dry-run') args.dryRun = true;
    else if (arg === '--dir') {
      const value = argv[i + 1];
      if (!value) throw new Error('--dir requires a path');
      args.dir = path.resolve(process.cwd(), value);
      i += 1;
    } else if (arg === '--help' || arg === '-h') {
      args.help = true;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return args;
}

function printHelp() {
  console.log(`
Formula 1 media importer

Usage:
  node scripts/import-media.mjs --dry-run
  node scripts/import-media.mjs
  node scripts/import-media.mjs --dir "D:\\F1-media"

Expected folders:
  media-import/
    drivers/<driver_id>/<file>
    constructors/<constructor_id>/<file>
    circuits/<circuit_id>/<file>

Optional sidecar metadata:
  profile.webp.json
`);
}

function loadLocalEnv(filePath) {
  if (!existsSync(filePath)) return;
  const text = readFileSync(filePath, 'utf8');
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq < 1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
}

function mediaTypeForExtension(ext) {
  if (IMAGE_EXTENSIONS.has(ext)) return 'image';
  if (VIDEO_EXTENSIONS.has(ext)) return 'video';
  if (MODEL_EXTENSIONS.has(ext)) return 'model_3d';
  return 'document';
}

function inferRole(group, filename, mediaType) {
  const stem = path.parse(filename).name.toLowerCase();

  if (mediaType !== 'image') {
    if (mediaType === 'model_3d') return 'model';
    return 'general';
  }

  if (/^(catalog[-_.]?hero|hero|cover)([-_.]|$)/.test(stem)) return 'hero';

  if (/^(catalog[-_.]?card|card)([-_.]|$)/.test(stem)) {
    return 'catalog_card';
  }

  if (/^(catalog[-_.]?thumbnail|thumbnail|thumb)([-_.]|$)/.test(stem)) {
    return 'thumbnail';
  }
  
  if (/^(profile|portrait|headshot)([-_.]|$)/.test(stem)) {
    return 'portrait';
  }

  if (/^(logo)([-_.]|$)/.test(stem)) return 'team_logo';
  if (/^(car)([-_.]|$)/.test(stem)) return 'constructor_car';
  if (/^(gallery)([-_.]|$)/.test(stem)) return 'gallery';

  return GROUPS[group]?.defaultImageRole ?? 'general';
}

function inferPrimary(filename, usageRole) {
  const stem = path.parse(filename).name.toLowerCase();
  if (/^(gallery)([-_.]|$)/.test(stem)) return false;
  return [
  'portrait',
  'team_logo',
  'catalog_card',
  'thumbnail',
  'hero',
  ].includes(usageRole);
}

function stableId(bucket, storagePath) {
  const digest = createHash('sha256').update(`${bucket}/${storagePath}`).digest('hex').slice(0, 24);
  return `media_${digest}`;
}

function encodeStoragePath(storagePath) {
  return storagePath.split('/').map(encodeURIComponent).join('/');
}

function publicUrl(supabaseUrl, bucket, storagePath) {
  return `${supabaseUrl}/storage/v1/object/public/${encodeURIComponent(bucket)}/${encodeStoragePath(storagePath)}`;
}

async function walk(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...await walk(fullPath));
    else files.push(fullPath);
  }
  return files;
}

async function readSidecar(filePath) {
  const candidates = [
    `${filePath}.json`,
    path.join(path.dirname(filePath), `${path.parse(filePath).name}.json`),
  ];
  for (const candidate of candidates) {
    if (!existsSync(candidate)) continue;
    return JSON.parse(await fs.readFile(candidate, 'utf8'));
  }
  return {};
}

function normalizeSlash(value) {
  return value.split(path.sep).join('/');
}

function sqlLiteral(value) {
  if (value === null || value === undefined) return 'null';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : 'null';
  if (Array.isArray(value)) return `ARRAY[${value.map((item) => sqlLiteral(String(item))).join(', ')}]::text[]`;
  return `'${String(value).replaceAll("'", "''")}'`;
}

function validateReviewMetadata(item) {
  if (!['reviewed', 'published'].includes(item.review_status)) return;
  const required = ['source_id', 'source_url', 'author', 'licence', 'alt_text_ru', 'verified_at'];
  const missing = required.filter((key) => !item[key]);
  if (missing.length) {
    throw new Error(`${item.storagePath}: review_status=${item.review_status} requires: ${missing.join(', ')}`);
  }
  if (item.rights_status !== 'verified') {
    throw new Error(`${item.storagePath}: reviewed/published media must have rights_status=verified`);
  }
}

async function buildItems(importDir, bucket, supabaseUrl) {
  if (!existsSync(importDir)) throw new Error(`Import folder not found: ${importDir}`);
  const allFiles = await walk(importDir);
  const mediaFiles = allFiles.filter((filePath) => {
    const ext = path.extname(filePath).toLowerCase();
    const filename = path.basename(filePath).toLowerCase();

    if (!EXTENSIONS.has(ext)) return false;

    // Исходники сохраняем локально, но в публичный Storage не импортируем.
    if (
      filename.startsWith('original-') ||
      filename.startsWith('catalog-original-')
    ) {
      return false;
    }

    return true;
  });
  const items = [];

  for (const filePath of mediaFiles) {
    const rel = normalizeSlash(path.relative(importDir, filePath));
    const parts = rel.split('/');
    if (parts.length < 3) throw new Error(`${rel}: expected <group>/<entity_id>/<file>`);

    const [group, entityId] = parts;
    const groupConfig = GROUPS[group];
    if (!groupConfig) throw new Error(`${rel}: unsupported group "${group}"`);

    const ext = path.extname(filePath).toLowerCase();
    const mediaType = mediaTypeForExtension(ext);
    const inferredRole = inferRole(group, path.basename(filePath), mediaType);
    const sidecar = await readSidecar(filePath);

    const item = {
      filePath,
      group,
      table: groupConfig.table,
      entity_type: groupConfig.entityType,
      entity_id: entityId,
      storagePath: rel,
      id: sidecar.id ?? stableId(bucket, rel),
      media_type: sidecar.media_type ?? mediaType,
      url: publicUrl(supabaseUrl, bucket, rel),
      alt_text_ru: sidecar.alt_text_ru ?? null,
      author: sidecar.author ?? null,
      licence: sidecar.licence ?? null,
      source_url: sidecar.source_url ?? null,
      season_year: sidecar.season_year ?? null,
      is_primary:
        sidecar.is_primary ??
        inferPrimary(path.basename(filePath), inferredRole),

        _primaryWasExplicit:
        typeof sidecar.is_primary === 'boolean',
      usage_role: sidecar.usage_role ?? inferredRole,
      source_id: sidecar.source_id ?? null,
      provenance_type: sidecar.provenance_type ?? 'provided_by_user',
      rights_status: sidecar.rights_status ?? 'unresolved',
      review_status: sidecar.review_status ?? 'candidate',
      verified_at: sidecar.verified_at ?? null,
      usage_scope: Array.isArray(sidecar.usage_scope) ? sidecar.usage_scope : [],
    };

    validateReviewMetadata(item);
    items.push(item);
  }

  const grouped = new Map();

  for (const item of items) {
    const key = [
      item.entity_type,
      item.entity_id,
      item.media_type,
      item.usage_role,
      item.season_year ?? 0,
    ].join('|');

    if (!grouped.has(key)) {
      grouped.set(key, []);
    }

    grouped.get(key).push(item);
  }

  for (const groupItems of grouped.values()) {
    const explicitlyPrimary = groupItems.filter(
      (item) =>
        item._primaryWasExplicit === true &&
        item.is_primary === true,
    );

    if (explicitlyPrimary.length > 1) {
      throw new Error(
        `Multiple explicitly primary media files: ${explicitlyPrimary
          .map((item) => item.storagePath)
          .join(', ')}`,
      );
    }

    // Если primary указан вручную в sidecar JSON — используем его.
    if (explicitlyPrimary.length === 1) {
      for (const item of groupItems) {
        item.is_primary = item === explicitlyPrimary[0];
      }

      continue;
    }

    // Иначе автоматически выбираем один основной файл.
    const sorted = [...groupItems].sort((a, b) =>
      a.storagePath.localeCompare(b.storagePath),
    );

    for (const item of groupItems) {
      item.is_primary = item === sorted[0];
    }
  }

  return items;
}

function contentType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const types = {
    '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp',
    '.avif': 'image/avif', '.gif': 'image/gif', '.svg': 'image/svg+xml', '.mp4': 'video/mp4',
    '.webm': 'video/webm', '.glb': 'model/gltf-binary', '.gltf': 'model/gltf+json', '.pdf': 'application/pdf',
  };
  return types[ext] ?? 'application/octet-stream';
}

async function uploadObject({ supabaseUrl, serviceKey, bucket, item }) {
  const body = await fs.readFile(item.filePath);
  const endpoint = `${supabaseUrl}/storage/v1/object/${encodeURIComponent(bucket)}/${encodeStoragePath(item.storagePath)}`;
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      'Content-Type': contentType(item.filePath),
      'Cache-Control': '3600',
      'x-upsert': 'true',
    },
    body,
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Upload failed for ${item.storagePath}: ${response.status} ${text}`);
  }
}

function buildMetadataSql(items) {
  const validations = [];
  const statements = [];

  for (const item of items) {
    validations.push(`
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM atlas.${item.table}
    WHERE id = ${sqlLiteral(item.entity_id)}
  ) THEN
    RAISE EXCEPTION
      'Unknown ${item.entity_type} id: %',
      ${sqlLiteral(item.entity_id)};
  END IF;
END
$$;`);

    const filename = path.basename(item.storagePath);

    const columns = [
      'id',
      'entity_type',
      'entity_id',
      'media_type',
      'url',
      'alt_text_ru',
      'author',
      'licence',
      'source_url',
      'season_year',
      'is_primary',
      'usage_role',
      'source_id',
      'provenance_type',
      'rights_status',
      'review_status',
      'verified_at',
      'usage_scope',
    ];

    const desiredPrimary = item.is_primary === true;

    const primaryExpression = desiredPrimary
      ? `NOT EXISTS (
          SELECT 1
          FROM atlas.media_assets existing_primary
          WHERE existing_primary.entity_type = ${sqlLiteral(item.entity_type)}
            AND existing_primary.entity_id = ${sqlLiteral(item.entity_id)}
            AND existing_primary.media_type = ${sqlLiteral(item.media_type)}
            AND existing_primary.usage_role = ${sqlLiteral(item.usage_role)}
            AND COALESCE(existing_primary.season_year::integer, 0)
                = COALESCE(${sqlLiteral(item.season_year)}::integer, 0)
            AND existing_primary.is_primary = true
        )`
      : 'false';

    const values = columns.map((column) => {
      if (column === 'is_primary') {
        return primaryExpression;
      }

      return sqlLiteral(item[column]);
    });

    statements.push(`
WITH matched_existing AS (
  UPDATE atlas.media_assets
  SET url = ${sqlLiteral(item.url)}
  WHERE entity_type = ${sqlLiteral(item.entity_type)}
    AND entity_id = ${sqlLiteral(item.entity_id)}
    AND regexp_replace(url, '^.*/', '') = ${sqlLiteral(filename)}
  RETURNING id
)
INSERT INTO atlas.media_assets (
  ${columns.join(', ')}
)
SELECT
  ${values.join(', ')}
WHERE NOT EXISTS (
  SELECT 1 FROM matched_existing
)
ON CONFLICT (id) DO UPDATE
SET url = EXCLUDED.url;`);
  }

  return `
BEGIN;

${validations.join('\n')}

${statements.join('\n')}

COMMIT;
`;
}

async function runDatabaseSql(sql) {
  const client = new pg.Client(
    databaseConfig('f1-atlas-media-import'),
  );

  await client.connect();

  try {
    await client.query(sql);
  } finally {
    await client.end();
  }
}

function requiredEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing ${name}. Add it to .env.media.local`);
  return value;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) { printHelp(); return; }

  loadLocalEnv(path.join(repoRoot, '.env.media.local'));

  const supabaseUrl = (process.env.SUPABASE_URL || 'https://ioddkglettrykhbjiavs.supabase.co').replace(/\/$/, '');
  const bucket = process.env.SUPABASE_MEDIA_BUCKET || 'geography-speed-media';

  const items = await buildItems(args.dir, bucket, supabaseUrl);
  if (!items.length) {
    console.log(`No supported media files found in ${args.dir}`);
    return;
  }

  console.log(`Found ${items.length} media file(s).`);
  for (const item of items) console.log(`  ${item.storagePath} -> ${item.entity_type}:${item.entity_id} [${item.usage_role}]`);

  if (args.dryRun) {
    console.log('\nDry run complete. No files or database rows were changed.');
    return;
  }

  const serviceKey = requiredEnv('SUPABASE_SERVICE_ROLE_KEY');

  let uploaded = 0;
  for (const item of items) {
    process.stdout.write(`Uploading ${item.storagePath} ... `);
    await uploadObject({ supabaseUrl, serviceKey, bucket, item });
    uploaded += 1;
    console.log('OK');
  }

  console.log(`Uploaded ${uploaded} file(s). Syncing atlas.media_assets ...`);
  await runDatabaseSql(buildMetadataSql(items));
  console.log(`Done. ${items.length} media asset(s) synchronized.`);
}

main().catch((error) => {
  console.error('\nMedia import failed:');
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
