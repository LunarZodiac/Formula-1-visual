#!/usr/bin/env node

import { mkdir, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const requiredEnvironment = ['PGHOST', 'PGPORT', 'PGDATABASE', 'PGUSER', 'PGPASSWORD'];
const missingEnvironment = requiredEnvironment.filter((name) => !process.env[name]);
if (missingEnvironment.length > 0) {
  throw new Error(`Не заданы параметры базы: ${missingEnvironment.join(', ')}`);
}

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outputPath = path.join(repositoryRoot, 'apps', 'web', 'app', 'data', 'history-eras.generated.json');
const client = new pg.Client({ application_name: 'f1-geovisual-atlas-history-era-export' });

function mediaFromRow(row, prefix) {
  const id = row[`${prefix}_media_id`];
  if (!id) return null;
  return {
    id,
    type: row[`${prefix}_media_type`],
    url: row[`${prefix}_media_url`],
    altTextRu: row[`${prefix}_media_alt_text_ru`],
    author: row[`${prefix}_media_author`],
    licence: row[`${prefix}_media_licence`],
    sourceUrl: row[`${prefix}_media_source_url`],
    sourceId: row[`${prefix}_media_source_id`],
    seasonYear: row[`${prefix}_media_season_year`] === null
      ? null
      : Number(row[`${prefix}_media_season_year`]),
    usageRole: row[`${prefix}_media_usage_role`],
    provenanceType: row[`${prefix}_media_provenance_type`],
    rightsStatus: row[`${prefix}_media_rights_status`],
    reviewStatus: row[`${prefix}_media_review_status`],
    derivatives: row[`${prefix}_media_derivatives`] ?? [],
  };
}

await client.connect();
try {
  await client.query('BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');

  const erasResult = await client.query(`
    SELECT era.slug, era.start_year, era.end_year, era.years_label,
           era.title_ru, era.summary_ru, era.hero_media_asset_id,
           hero.id AS hero_media_id, hero.media_type AS hero_media_type,
           hero.url AS hero_media_url, hero.alt_text_ru AS hero_media_alt_text_ru,
           hero.author AS hero_media_author, hero.licence AS hero_media_licence,
           hero.source_url AS hero_media_source_url, hero.source_id AS hero_media_source_id,
           hero.season_year AS hero_media_season_year, hero.usage_role AS hero_media_usage_role,
           hero.provenance_type AS hero_media_provenance_type,
           hero.rights_status AS hero_media_rights_status,
           hero.review_status AS hero_media_review_status,
           COALESCE((
             SELECT jsonb_agg(jsonb_build_object(
               'variant', derivative.variant,
               'url', derivative.url,
               'mimeType', derivative.mime_type,
               'widthPx', derivative.width_px,
               'heightPx', derivative.height_px,
               'fileSizeBytes', derivative.file_size_bytes
             ) ORDER BY derivative.variant)
             FROM atlas.media_asset_derivatives AS derivative
             WHERE derivative.media_asset_id = hero.id
           ), '[]'::jsonb) AS hero_media_derivatives
    FROM atlas.history_eras AS era
    LEFT JOIN atlas.media_assets AS hero ON hero.id = era.hero_media_asset_id
    WHERE era.editorial_status = 'published'
    ORDER BY era.start_year, era.slug
  `);

  const blocksResult = await client.query(`
    SELECT block.id, block.era_slug, block.sort_order, block.block_type,
           block.eyebrow_ru, block.title_ru, block.body_ru,
           block.media_asset_id, block.media_position, block.source_id, block.source_url,
           source.name AS source_name, source.url AS registered_source_url,
           source.licence AS source_licence, source.retrieved_at AS source_retrieved_at,
           media.id AS block_media_id, media.media_type AS block_media_type,
           media.url AS block_media_url, media.alt_text_ru AS block_media_alt_text_ru,
           media.author AS block_media_author, media.licence AS block_media_licence,
           media.source_url AS block_media_source_url, media.source_id AS block_media_source_id,
           media.season_year AS block_media_season_year, media.usage_role AS block_media_usage_role,
           media.provenance_type AS block_media_provenance_type,
           media.rights_status AS block_media_rights_status,
           media.review_status AS block_media_review_status,
           COALESCE((
             SELECT jsonb_agg(jsonb_build_object(
               'variant', derivative.variant,
               'url', derivative.url,
               'mimeType', derivative.mime_type,
               'widthPx', derivative.width_px,
               'heightPx', derivative.height_px,
               'fileSizeBytes', derivative.file_size_bytes
             ) ORDER BY derivative.variant)
             FROM atlas.media_asset_derivatives AS derivative
             WHERE derivative.media_asset_id = media.id
           ), '[]'::jsonb) AS block_media_derivatives
    FROM atlas.history_era_blocks AS block
    JOIN atlas.history_eras AS era
      ON era.slug = block.era_slug AND era.editorial_status = 'published'
    LEFT JOIN atlas.data_sources AS source ON source.id = block.source_id
    LEFT JOIN atlas.media_assets AS media ON media.id = block.media_asset_id
    WHERE block.editorial_status = 'published'
    ORDER BY era.start_year, block.sort_order, block.id
  `);

  const unpublishedMedia = [
    ...erasResult.rows
      .filter((row) => row.hero_media_asset_id && !row.hero_media_id)
      .map((row) => `эпоха ${row.slug}: ${row.hero_media_asset_id}`),
    ...blocksResult.rows
      .filter((row) => row.media_asset_id && !row.block_media_id)
      .map((row) => `блок ${row.id}: ${row.media_asset_id}`),
  ];
  if (unpublishedMedia.length > 0) {
    throw new Error(`Не найдены связанные медиа: ${unpublishedMedia.join(', ')}`);
  }

  const unsafeMedia = [
    ...erasResult.rows
      .filter((row) => row.hero_media_id)
      .map((row) => ({ owner: `эпоха ${row.slug}`, row, prefix: 'hero' })),
    ...blocksResult.rows
      .filter((row) => row.block_media_id)
      .map((row) => ({ owner: `блок ${row.id}`, row, prefix: 'block' })),
  ].filter(({ row, prefix }) => {
    const mediaId = row[`${prefix}_media_id`];
    return mediaId && (row[`${prefix}_media_review_status`] !== 'published'
      || row[`${prefix}_media_rights_status`] !== 'verified'
      || row[`${prefix}_media_provenance_type`] === 'unknown'
      || !row[`${prefix}_media_author`]
      || !row[`${prefix}_media_licence`]
      || !row[`${prefix}_media_source_url`]
      || !row[`${prefix}_media_alt_text_ru`]);
  });
  if (unsafeMedia.length > 0) {
    throw new Error(`У опубликованного материала нет полных прав или происхождения: ${unsafeMedia.map(({ owner }) => owner).join(', ')}`);
  }

  const blockIds = blocksResult.rows.map((row) => row.id);
  const entitiesResult = blockIds.length === 0 ? { rows: [] } : await client.query(`
    SELECT link.block_id, link.sort_order, link.entity_type, link.label_ru,
           link.season_year, link.circuit_id, link.driver_id, link.constructor_id, link.race_id
    FROM atlas.history_era_block_entities AS link
    WHERE link.block_id = ANY($1::bigint[])
    ORDER BY link.block_id, link.sort_order, link.id
  `, [blockIds]);

  await client.query('COMMIT');

  const entitiesByBlock = new Map();
  for (const row of entitiesResult.rows) {
    const entityId = row.season_year ?? row.circuit_id ?? row.driver_id
      ?? row.constructor_id ?? row.race_id;
    const entity = {
      type: row.entity_type,
      id: row.entity_type === 'season' ? Number(entityId) : entityId,
      sortOrder: Number(row.sort_order),
      ...(row.label_ru ? { labelRu: row.label_ru } : {}),
    };
    const entities = entitiesByBlock.get(String(row.block_id)) ?? [];
    entities.push(entity);
    entitiesByBlock.set(String(row.block_id), entities);
  }

  const invalidEntityBlocks = blocksResult.rows.filter((row) => {
    const entityCount = entitiesByBlock.get(String(row.id))?.length ?? 0;
    return (row.block_type === 'entities' && entityCount === 0)
      || (row.block_type !== 'entities' && entityCount > 0);
  });
  if (invalidEntityBlocks.length > 0) {
    throw new Error(`Нарушены связи блоков entities: ${invalidEntityBlocks.map((row) => row.id).join(', ')}`);
  }

  const blocksByEra = new Map();
  for (const row of blocksResult.rows) {
    const media = mediaFromRow(row, 'block');
    const block = {
      id: String(row.id),
      sortOrder: Number(row.sort_order),
      type: row.block_type,
      ...(row.eyebrow_ru ? { eyebrowRu: row.eyebrow_ru } : {}),
      ...(row.title_ru ? { titleRu: row.title_ru } : {}),
      ...(row.body_ru ? { bodyRu: row.body_ru } : {}),
      ...(media ? { media, mediaPosition: row.media_position } : {}),
      ...(row.source_id ? {
        source: {
          id: row.source_id,
          name: row.source_name,
          url: row.source_url ?? row.registered_source_url,
          licence: row.source_licence,
          retrievedAt: row.source_retrieved_at?.toISOString() ?? null,
        },
      } : {}),
      entities: entitiesByBlock.get(String(row.id)) ?? [],
    };
    const blocks = blocksByEra.get(row.era_slug) ?? [];
    blocks.push(block);
    blocksByEra.set(row.era_slug, blocks);
  }

  const payload = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    eras: erasResult.rows.map((row) => ({
      slug: row.slug,
      startYear: Number(row.start_year),
      endYear: row.end_year === null ? null : Number(row.end_year),
      yearsLabel: row.years_label,
      titleRu: row.title_ru,
      summaryRu: row.summary_ru,
      heroMedia: mediaFromRow(row, 'hero'),
      blocks: blocksByEra.get(row.slug) ?? [],
    })),
  };

  await mkdir(path.dirname(outputPath), { recursive: true });
  const temporaryPath = `${outputPath}.tmp-${process.pid}`;
  await writeFile(temporaryPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  await rename(temporaryPath, outputPath);
  console.log(`Экспортировано эпох: ${payload.eras.length}, блоков: ${blocksResult.rowCount}, связей: ${entitiesResult.rows.length}`);
} catch (error) {
  await client.query('ROLLBACK').catch(() => {});
  throw error;
} finally {
  await client.end();
}
