#!/usr/bin/env node

import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const required = ['PGHOST', 'PGPORT', 'PGDATABASE', 'PGUSER', 'PGPASSWORD'];
const missing = required.filter((name) => !process.env[name]);
if (missing.length) throw new Error(`Не заданы параметры базы: ${missing.join(', ')}`);

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outputPath = path.join(repositoryRoot, 'apps', 'web', 'public', 'data', 'search-index.json');
const localizations = JSON.parse(await readFile(path.join(repositoryRoot, 'apps', 'web', 'app', 'data', 'catalogs', 'drivers.json'), 'utf8'));
const driverNameRu = new Map(localizations.map((driver) => [driver.id, driver.nameRu]));
const client = new pg.Client({ application_name: 'f1-geovisual-atlas-search-index-export' });

await client.connect();
try {
  const circuits = await client.query(`SELECT circuit.id, circuit.name, circuit.short_name, profile.name_ru,
                         profile.city_ru, profile.country_ru, profile.slug, profile.editorial_status
                  FROM atlas.circuits AS circuit
                  LEFT JOIN atlas.circuit_page_profiles AS profile ON profile.circuit_id = circuit.id
                  ORDER BY coalesce(profile.name_ru, circuit.short_name, circuit.name)`);
  const layouts = await client.query(`SELECT layout.id, layout.name, layout.valid_from_year, layout.valid_to_year,
                         circuit.name AS circuit_name, profile.name_ru AS circuit_name_ru,
                         profile.slug, profile.editorial_status
                  FROM atlas.track_layouts AS layout
                  JOIN atlas.circuits AS circuit ON circuit.id = layout.circuit_id
                  LEFT JOIN atlas.circuit_page_profiles AS profile ON profile.circuit_id = circuit.id
                  ORDER BY layout.name`);
  const races = await client.query(`SELECT id, name, season_year, round FROM atlas.races ORDER BY season_year DESC, round`);
  const seasons = await client.query(`SELECT year, status FROM atlas.seasons ORDER BY year DESC`);
  const drivers = await client.query(`WITH latest_season AS (SELECT max(year) AS year FROM atlas.seasons),
                         current_drivers AS (SELECT DISTINCT standings.driver_id
                           FROM atlas.driver_standings AS standings
                           JOIN latest_season ON latest_season.year = standings.season_year)
                  SELECT driver.id, driver.given_name, driver.family_name, driver.abbreviation,
                         driver.nationality, (current_drivers.driver_id IS NOT NULL) AS has_profile
                  FROM atlas.drivers AS driver
                  LEFT JOIN current_drivers ON current_drivers.driver_id = driver.id
                  ORDER BY driver.family_name, driver.given_name`);
  const teams = await client.query(`WITH latest_season AS (SELECT max(year) AS year FROM atlas.seasons),
                         current_teams AS (SELECT entry.constructor_id, entry.display_name
                           FROM atlas.constructor_entries AS entry
                           JOIN latest_season ON latest_season.year = entry.season_year)
                  SELECT constructor.id, constructor.name, constructor.nationality,
                         current_teams.display_name, (current_teams.constructor_id IS NOT NULL) AS has_profile
                  FROM atlas.constructors AS constructor
                  LEFT JOIN current_teams ON current_teams.constructor_id = constructor.id
                  ORDER BY coalesce(current_teams.display_name, constructor.name)`);
  const locations = await client.query(`SELECT DISTINCT profile.city_ru, profile.country_ru
                  FROM atlas.circuit_page_profiles AS profile
                  WHERE profile.city_ru IS NOT NULL OR profile.country_ru IS NOT NULL
                  ORDER BY profile.country_ru, profile.city_ru`);

  const items = [];
  for (const row of circuits.rows) items.push({
    id: `circuit:${row.id}`, type: 'circuit', title: row.name_ru ?? row.short_name ?? row.name,
    subtitle: [row.city_ru, row.country_ru].filter(Boolean).join(' · ') || row.name,
    tokens: [row.name, row.short_name, row.name_ru, row.city_ru, row.country_ru].filter(Boolean),
    href: row.editorial_status === 'published' ? `/circuits/${row.slug}` : `/circuits?search=${encodeURIComponent(row.name_ru ?? row.short_name ?? row.name)}`,
  });
  for (const row of layouts.rows) items.push({
    id: `layout:${row.id}`, type: 'layout', title: row.name,
    subtitle: `${row.circuit_name_ru ?? row.circuit_name}${row.valid_from_year ? ` · ${row.valid_from_year}${row.valid_to_year ? `–${row.valid_to_year}` : '–…'}` : ''}`,
    tokens: [row.name, row.circuit_name, row.circuit_name_ru].filter(Boolean),
    href: row.editorial_status === 'published' ? `/circuits/${row.slug}` : null,
  });
  for (const row of races.rows) items.push({
    id: `race:${row.id}`, type: 'race', title: row.name, subtitle: `Сезон ${row.season_year} · этап ${row.round}`,
    tokens: [row.name, String(row.season_year), String(row.round)], href: `/?season=${row.season_year}#season`,
  });
  for (const row of seasons.rows) items.push({
    id: `season:${row.year}`, type: 'season', title: `Сезон ${row.year}`, subtitle: row.status,
    tokens: [String(row.year), `сезон ${row.year}`], href: `/?season=${row.year}#season`,
  });
  for (const row of drivers.rows) {
    const nameEn = `${row.given_name} ${row.family_name}`;
    items.push({ id: `driver:${row.id}`, type: 'driver', title: driverNameRu.get(row.id) ?? nameEn,
      subtitle: [row.abbreviation?.trim(), row.nationality].filter(Boolean).join(' · '),
      tokens: [nameEn, row.abbreviation?.trim(), row.nationality].filter(Boolean), href: row.has_profile ? `/drivers/${row.id}` : null });
  }
  for (const row of teams.rows) items.push({
    id: `team:${row.id}`, type: 'team', title: row.display_name ?? row.name, subtitle: row.nationality ?? 'Команда Formula 1',
    tokens: [row.name, row.display_name, row.nationality].filter(Boolean), href: row.has_profile ? `/teams/${row.id}` : null,
  });
  const locationSet = new Set();
  for (const row of locations.rows) {
    for (const [kind, value] of [['city', row.city_ru], ['country', row.country_ru]]) {
      if (!value || locationSet.has(`${kind}:${value}`)) continue;
      locationSet.add(`${kind}:${value}`);
      items.push({ id: `location:${kind}:${value}`, type: 'location', title: value,
        subtitle: kind === 'city' ? 'Город проведения' : 'Страна проведения', tokens: [value],
        href: `/circuits?search=${encodeURIComponent(value)}` });
    }
  }

  const index = { schemaVersion: 1, generatedAt: new Date().toISOString(), items };
  await mkdir(path.dirname(outputPath), { recursive: true });
  const temporaryPath = `${outputPath}.tmp-${process.pid}`;
  await writeFile(temporaryPath, `${JSON.stringify(index, null, 2)}\n`, 'utf8');
  await rename(temporaryPath, outputPath);
  console.log(`Экспортирован поисковый индекс: ${items.length} объектов`);
} finally {
  await client.end();
}
