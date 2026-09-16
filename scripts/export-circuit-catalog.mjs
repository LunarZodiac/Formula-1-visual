#!/usr/bin/env node

import { mkdir, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import pg from 'pg';

const required = ['PGHOST', 'PGPORT', 'PGDATABASE', 'PGUSER', 'PGPASSWORD'];
const missing = required.filter((name) => !process.env[name]);
if (missing.length) throw new Error(`Не заданы параметры базы: ${missing.join(', ')}`);

const outputPath = path.resolve('apps', 'web', 'app', 'data', 'catalogs', 'circuits.json');
const client = new pg.Client({ application_name: 'f1-geovisual-atlas-circuit-catalog-export' });
await client.connect();
try {
  const seasonResult = await client.query('SELECT max(season_year)::integer AS year FROM atlas.races');
  const season = Number(seasonResult.rows[0].year);
  const result = await client.query(`
    SELECT circuit.id, coalesce(profile.slug, replace(lower(circuit.id), '_', '-')) AS slug,
           coalesce(profile.name_ru, circuit.short_name, circuit.name) AS name_ru,
           circuit.name AS official_name, coalesce(profile.city_ru, circuit.locality, '') AS city_ru,
           coalesce(profile.country_ru, upper(circuit.country_code)) AS country_ru,
           lower(circuit.country_code) AS country_code,
           coalesce(profile.circuit_type_ru, CASE circuit.circuit_type
             WHEN 'street' THEN 'Городская трасса' WHEN 'temporary' THEN 'Временная трасса'
             WHEN 'hybrid' THEN 'Смешанная трасса' ELSE 'Стационарная трасса' END) AS circuit_type_ru,
           coalesce(profile.summary_ru, '') AS summary_ru,
           coalesce(profile.editorial_status, 'draft') AS editorial_status,
           coalesce(min(race.round), 999)::integer AS first_round,
           ST_X(circuit.location::geometry) AS longitude,
           ST_Y(circuit.location::geometry) AS latitude,
           -- Каталог страницы получает каноническую линию без LOD-упрощения.
           -- Уменьшенные варианты остаются в web view только для обзорных слоёв карты.
           ST_AsGeoJSON(catalog_geometry.centerline)::jsonb AS geometry,
           (SELECT count(*)::integer FROM atlas.track_layouts AS known_layout
            WHERE known_layout.circuit_id = circuit.id) AS layout_count,
           (SELECT array_agg(DISTINCT historical_race.season_year ORDER BY historical_race.season_year)
            FROM atlas.races AS historical_race
            WHERE historical_race.circuit_id = circuit.id) AS seasons,
           coalesce((SELECT value_ru FROM atlas.circuit_page_stats
            WHERE circuit_id = circuit.id AND section = 'stat_bar'
              AND label_ru = 'Длина трассы' LIMIT 1),
             CASE WHEN catalog_geometry.review_status IN ('reviewed', 'published') AND catalog_geometry.length_m IS NOT NULL
               THEN replace(to_char(catalog_geometry.length_m / 1000.0, 'FM9990.000'), '.', ',') || ' км' END) AS length_ru,
           coalesce((SELECT value_ru FROM atlas.circuit_page_stats
            WHERE circuit_id = circuit.id AND section = 'stat_bar'
              AND label_ru = 'Повороты' LIMIT 1),
             CASE WHEN catalog_geometry.review_status IN ('reviewed', 'published') THEN catalog_geometry.turns::text END) AS turns_ru,
           coalesce((SELECT value_ru FROM atlas.circuit_page_stats
            WHERE circuit_id = circuit.id AND section = 'stat_bar'
              AND label_ru = 'Дебют в F1' LIMIT 1),
             (SELECT min(historical_race.season_year)::text FROM atlas.races AS historical_race
              WHERE historical_race.circuit_id = circuit.id)) AS debut_ru,
           (SELECT value_ru FROM atlas.circuit_page_stats
            WHERE circuit_id = circuit.id AND section = 'stat_bar'
              AND label_ru = 'Рекорд круга F1' LIMIT 1) AS record_ru,
           card_media.url AS card_image_url, card_media.alt_text_ru AS card_image_alt
    FROM atlas.circuits AS circuit
    LEFT JOIN atlas.circuit_page_profiles AS profile ON profile.circuit_id = circuit.id
    LEFT JOIN atlas.races AS race ON race.circuit_id = circuit.id AND race.season_year = $1
    LEFT JOIN LATERAL (
      SELECT ST_Force2D(layout.centerline) AS centerline,
             layout.length_m, layout.turns, layout.review_status
      FROM atlas.track_layouts AS layout
      WHERE layout.circuit_id = circuit.id AND layout.centerline IS NOT NULL
      ORDER BY (layout.id = profile.geometry_id) DESC, layout.valid_to_year DESC NULLS FIRST
      LIMIT 1
    ) AS catalog_geometry ON true
    LEFT JOIN LATERAL (
      SELECT coalesce(card.url, asset.url) AS url, asset.alt_text_ru
      FROM atlas.media_assets AS asset
      LEFT JOIN atlas.media_asset_derivatives AS card ON card.media_asset_id=asset.id AND card.variant='card'
      WHERE asset.entity_type='circuit' AND asset.entity_id=circuit.id AND asset.media_type='image'
        AND asset.usage_role='catalog_card' AND asset.is_primary
      ORDER BY asset.verified_at DESC NULLS LAST, asset.id LIMIT 1
    ) AS card_media ON true
    GROUP BY circuit.id, profile.circuit_id, catalog_geometry.centerline, catalog_geometry.length_m,
             catalog_geometry.turns, catalog_geometry.review_status, card_media.url, card_media.alt_text_ru
    ORDER BY coalesce(min(race.round), 999), coalesce(profile.name_ru, circuit.short_name, circuit.name)
  `, [season]);

  const catalog = {
    schemaVersion: 1,
    season,
    generatedAt: new Date().toISOString(),
    circuits: result.rows.map((row) => ({
      id: row.id,
      slug: row.slug,
      nameRu: row.name_ru,
      officialName: row.official_name,
      cityRu: row.city_ru,
      countryRu: row.country_ru,
      countryCode: row.country_code,
      typeRu: row.circuit_type_ru,
      summary: row.summary_ru,
      status: row.editorial_status,
      competitionStatus: row.seasons?.map(Number).includes(season) ? 'active' : 'historic',
      firstRound: Number(row.first_round),
      coordinates: [Number(row.longitude), Number(row.latitude)],
      geometry: row.geometry,
      layoutCount: Number(row.layout_count),
      seasons: row.seasons?.map(Number) ?? [],
      imageUrl: row.card_image_url,
      imageAlt: row.card_image_alt,
      metrics: {
        length: row.length_ru,
        turns: row.turns_ru,
        debut: row.debut_ru,
        record: row.record_ru,
      },
    })),
  };

  await mkdir(path.dirname(outputPath), { recursive: true });
  const temporaryPath = `${outputPath}.tmp-${process.pid}`;
  await writeFile(temporaryPath, `${JSON.stringify(catalog, null, 2)}\n`, 'utf8');
  await rename(temporaryPath, outputPath);
  console.log(`Экспортирован каталог ${catalog.circuits.length} трасс сезона ${season}: ${outputPath}`);
} finally {
  await client.end();
}
