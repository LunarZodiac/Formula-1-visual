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
  const seasonResult = await client.query('SELECT max(year)::integer AS year FROM atlas.seasons');
  const season = Number(seasonResult.rows[0].year);
  const result = await client.query(`
    SELECT profile.circuit_id AS id, profile.slug, profile.name_ru,
           circuit.name AS official_name, profile.city_ru, profile.country_ru,
           lower(circuit.country_code) AS country_code,
           profile.circuit_type_ru, profile.summary_ru,
           profile.editorial_status,
           min(race.round)::integer AS first_round,
           ST_X(circuit.location::geometry) AS longitude,
           ST_Y(circuit.location::geometry) AS latitude,
           ST_AsGeoJSON(catalog_geometry.centerline)::jsonb AS geometry,
           (SELECT count(*)::integer FROM atlas.track_layouts AS known_layout
            WHERE known_layout.circuit_id = profile.circuit_id) AS layout_count,
           (SELECT array_agg(DISTINCT historical_race.season_year ORDER BY historical_race.season_year)
            FROM atlas.races AS historical_race
            WHERE historical_race.circuit_id = profile.circuit_id) AS seasons,
           (SELECT value_ru FROM atlas.circuit_page_stats
            WHERE circuit_id = profile.circuit_id AND section = 'stat_bar'
              AND label_ru = 'Длина трассы' LIMIT 1) AS length_ru,
           (SELECT value_ru FROM atlas.circuit_page_stats
            WHERE circuit_id = profile.circuit_id AND section = 'stat_bar'
              AND label_ru = 'Повороты' LIMIT 1) AS turns_ru,
           (SELECT value_ru FROM atlas.circuit_page_stats
            WHERE circuit_id = profile.circuit_id AND section = 'stat_bar'
              AND label_ru = 'Дебют в F1' LIMIT 1) AS debut_ru,
           (SELECT value_ru FROM atlas.circuit_page_stats
            WHERE circuit_id = profile.circuit_id AND section = 'stat_bar'
              AND label_ru = 'Рекорд круга F1' LIMIT 1) AS record_ru
    FROM atlas.circuit_page_profiles AS profile
    JOIN atlas.circuits AS circuit ON circuit.id = profile.circuit_id
    JOIN atlas.races AS race
      ON race.circuit_id = profile.circuit_id AND race.season_year = $1
    LEFT JOIN LATERAL (
      SELECT COALESCE(web.centerline_overview, ST_Force2D(layout.centerline)) AS centerline
      FROM atlas.track_layouts AS layout
      LEFT JOIN atlas.track_layout_web_geometries AS web ON web.id = layout.id
      WHERE layout.circuit_id = profile.circuit_id AND layout.centerline IS NOT NULL
      ORDER BY (layout.id = profile.geometry_id) DESC, layout.valid_to_year DESC NULLS FIRST
      LIMIT 1
    ) AS catalog_geometry ON true
    GROUP BY profile.circuit_id, circuit.id, catalog_geometry.centerline
    ORDER BY min(race.round), profile.name_ru
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
      competitionStatus: 'active',
      firstRound: Number(row.first_round),
      coordinates: [Number(row.longitude), Number(row.latitude)],
      geometry: row.geometry,
      layoutCount: Number(row.layout_count),
      seasons: row.seasons?.map(Number) ?? [],
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
