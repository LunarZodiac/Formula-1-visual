#!/usr/bin/env node

import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import pg from 'pg';
import { summarizeRaces, resultGeography, teamHistoryForSeason, isFinalStanding } from './lib/competitor-statistics.mjs';
import { assertCompetitorCatalog } from '../apps/web/app/data/competitor-contract.ts';

const required = ['PGHOST', 'PGPORT', 'PGDATABASE', 'PGUSER', 'PGPASSWORD'];
const missing = required.filter((name) => !process.env[name]);
if (missing.length) throw new Error(`Не заданы параметры базы: ${missing.join(', ')}`);

const outputDirectory = path.resolve('apps', 'web', 'app', 'data', 'catalogs');
const driverLocalizationPath = path.join(outputDirectory, 'drivers.json');
const requestedSeason = Number(process.env.CATALOG_SEASON);
const seasonArgument = Number.isInteger(requestedSeason) && requestedSeason >= 1950 ? requestedSeason : null;

function normalize(value) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();
}

const historicalDriverNames = new Map([
  ['michael schumacher', 'Михаэль Шумахер'],
  ['alain prost', 'Ален Прост'],
  ['ayrton senna', 'Айртон Сенна'],
  ['niki lauda', 'Ники Лауда'],
  ['mika hakkinen', 'Мика Хаккинен'],
  ['nigel mansell', 'Найджел Мэнселл'],
  ['jackie stewart', 'Джеки Стюарт'],
  ['emerson fittipaldi', 'Эмерсон Фиттипальди'],
  ['nelson piquet', 'Нельсон Пике'],
  ['damon hill', 'Деймон Хилл'],
  ['juan manuel fangio', 'Хуан Мануэль Фанхио'],
  ['giuseppe farina', 'Джузеппе Фарина'],
  ['james hunt', 'Джеймс Хант'],
  ['carlos reutemann', 'Карлос Ройтеман'],
]);

function transliterateDriverName(name) {
  const knownName = historicalDriverNames.get(normalize(name));
  if (knownName) return knownName;
  const pairs = [[/sch/g, 'ш'], [/sh/g, 'ш'], [/ch/g, 'ч'], [/zh/g, 'ж'], [/kh/g, 'х'], [/ph/g, 'ф'], [/th/g, 'т'], [/qu/g, 'кв'], [/ck/g, 'к'], [/ya/g, 'я'], [/yu/g, 'ю'], [/yo/g, 'ё'], [/ye/g, 'е'], [/j/g, 'дж'], [/c(?=[eiy])/g, 'с'], [/c/g, 'к'], [/x/g, 'кс'], [/w/g, 'у']];
  const letters = { a: 'а', b: 'б', d: 'д', e: 'е', f: 'ф', g: 'г', h: 'х', i: 'и', k: 'к', l: 'л', m: 'м', n: 'н', o: 'о', p: 'п', q: 'к', r: 'р', s: 'с', t: 'т', u: 'у', v: 'в', y: 'и', z: 'з' };
  let value = normalize(name);
  for (const [pattern, replacement] of pairs) value = value.replace(pattern, replacement);
  return value.split(' ').map((part) => part.replace(/[a-z]/g, (letter) => letters[letter] ?? letter)).map((part) => part ? `${part[0].toLocaleUpperCase('ru-RU')}${part.slice(1)}` : part).join(' ');
}

async function writeJson(fileName, value) {
  await mkdir(outputDirectory, { recursive: true });
  const outputPath = path.join(outputDirectory, fileName);
  const temporaryPath = `${outputPath}.tmp-${process.pid}`;
  await writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  await rename(temporaryPath, outputPath);
}

const localizations = JSON.parse(await readFile(driverLocalizationPath, 'utf8'));
const nameRuById = new Map(localizations.map((driver) => [driver.id, driver.nameRu]));
const nameRuByEnglishName = new Map(localizations.map((driver) => [normalize(driver.nameEn), driver.nameRu]));

const client = new pg.Client({ application_name: 'f1-geovisual-atlas-competitor-catalog-export' });
await client.connect();
try {
  await client.query('BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');
  const seasonResult = await client.query(`SELECT coalesce($1::integer, max(season_year))::integer AS year FROM atlas.driver_standings
    WHERE season_year IN (SELECT season_year FROM atlas.constructor_standings)
      AND ($1::integer IS NULL OR season_year = $1::integer)`, [seasonArgument]);
  const season = Number(seasonResult.rows[0].year);
  if (!season) throw new Error('Нет сезона с таблицами обоих чемпионатов');
  const seasonMetadata = await client.query(`SELECT year, status,
    coalesce((SELECT max(round) FROM atlas.races WHERE season_year=seasons.year AND status <> 'cancelled'),0)::integer AS last_round
    FROM atlas.seasons`);
  const seasonsByYear = new Map(seasonMetadata.rows.map((row) => [Number(row.year), row]));
  const raceFacts = await client.query(`SELECT result.session_id, result.driver_id, result.position_order, result.points,
      result.source_id, entry.constructor_id, entry.display_name AS team_name,
      race.season_year, race.round, race.circuit_id,
      circuit.country_code, ST_X(circuit.location::geometry) AS longitude, ST_Y(circuit.location::geometry) AS latitude,
      coalesce(profile.name_ru,circuit.short_name,circuit.name) AS circuit_name, profile.slug, profile.editorial_status,
      driver.given_name, driver.family_name, driver.abbreviation
    FROM atlas.session_results result
    JOIN atlas.sessions session ON session.id=result.session_id AND session.session_type='race'
    JOIN atlas.races race ON race.id=session.race_id
    JOIN atlas.circuits circuit ON circuit.id=race.circuit_id
    JOIN atlas.drivers driver ON driver.id=result.driver_id
    LEFT JOIN atlas.constructor_entries entry ON entry.id=result.constructor_entry_id
    LEFT JOIN atlas.circuit_page_profiles profile ON profile.circuit_id=circuit.id
    WHERE race.season_year <= $1
    ORDER BY race.season_year DESC, race.round DESC, result.driver_id`, [season]);
  const sourcesResult = await client.query(`SELECT id,name,url,licence,retrieved_at AS "retrievedAt" FROM atlas.data_sources
    WHERE id IN (SELECT DISTINCT source_id FROM atlas.session_results) ORDER BY id`);
  const driversResult = await client.query(`
    WITH final_round AS (
      SELECT max(after_round) AS value
      FROM atlas.driver_standings
      WHERE season_year = $1
    ), final_standings AS (
      SELECT standings.*
      FROM atlas.driver_standings AS standings
      JOIN final_round ON standings.after_round = final_round.value
      WHERE standings.season_year = $1
    ), participants AS (
      SELECT result.driver_id,
             coalesce(sum(result.points), 0) AS result_points,
             count(*) FILTER (WHERE result.position_order = 1)::integer AS result_wins
      FROM atlas.session_results AS result
      JOIN atlas.sessions AS session ON session.id = result.session_id AND session.session_type = 'race'
      JOIN atlas.races AS race ON race.id = session.race_id
      WHERE race.season_year = $1
      GROUP BY result.driver_id
    )
    SELECT standings.position,
           coalesce(standings.points, participants.result_points, 0) AS points,
           coalesce(standings.wins, participants.result_wins, 0) AS wins,
           (standings.driver_id IS NOT NULL) AS standing_available,
           driver.id, driver.given_name, driver.family_name,
           driver.abbreviation, driver.permanent_number, driver.nationality,
           latest_team.constructor_id, latest_team.display_name AS team_name,
           latest_team.team_colour, latest_team.logo_image_url
    FROM participants
    JOIN atlas.drivers AS driver ON driver.id = participants.driver_id
    LEFT JOIN final_standings AS standings ON standings.driver_id = participants.driver_id
    LEFT JOIN LATERAL (
      SELECT entry.constructor_id, entry.display_name, entry.team_colour, entry.logo_image_url
      FROM atlas.session_results AS result
      JOIN atlas.sessions AS session ON session.id = result.session_id AND session.session_type = 'race'
      JOIN atlas.races AS race ON race.id = session.race_id
      JOIN atlas.constructor_entries AS entry ON entry.id = result.constructor_entry_id
      WHERE race.season_year = $1 AND result.driver_id = participants.driver_id
      ORDER BY race.round DESC, CASE session.session_type WHEN 'race' THEN 0 ELSE 1 END
      LIMIT 1
    ) AS latest_team ON true
    ORDER BY standings.position NULLS LAST, driver.family_name, driver.given_name
  `, [season]);
  const teamsResult = await client.query(`
    WITH final_round AS (
      SELECT max(after_round) AS value
      FROM atlas.constructor_standings
      WHERE season_year = $1
    )
    SELECT standings.position, standings.points, standings.wins,
           entry.constructor_id AS id, entry.display_name AS name,
           entry.engine_name, entry.team_colour, entry.logo_image_url,
           entry.car_model, entry.car_image_url, constructor.nationality
    FROM atlas.constructor_standings AS standings
    JOIN final_round ON standings.after_round = final_round.value
    JOIN atlas.constructor_entries AS entry ON entry.id = standings.constructor_entry_id
    JOIN atlas.constructors AS constructor ON constructor.id = entry.constructor_id
    WHERE standings.season_year = $1
    ORDER BY standings.position
  `, [season]);
  const driverSeasonHistoryResult = await client.query(`
    WITH final_rounds AS (
      SELECT season_year, max(after_round) AS value
      FROM atlas.driver_standings
      GROUP BY season_year
    ), final_standings AS (
      SELECT standings.*
      FROM atlas.driver_standings AS standings
      JOIN final_rounds ON final_rounds.season_year = standings.season_year
                       AND final_rounds.value = standings.after_round
      WHERE standings.season_year <= $1
    ), participation AS (
      SELECT result.driver_id, race.season_year, max(race.round)::integer AS after_round,
             coalesce(sum(result.points), 0) AS result_points,
             count(*) FILTER (WHERE result.position_order = 1)::integer AS result_wins
      FROM atlas.session_results AS result
      JOIN atlas.sessions AS session ON session.id = result.session_id AND session.session_type = 'race'
      JOIN atlas.races AS race ON race.id = session.race_id
      WHERE race.season_year <= $1
      GROUP BY result.driver_id, race.season_year
    )
    SELECT participation.driver_id, participation.season_year, standings.position,
           coalesce(standings.after_round, participation.after_round) AS after_round,
           coalesce(standings.points, participation.result_points, 0) AS points,
           coalesce(standings.wins, participation.result_wins, 0) AS wins,
           (standings.driver_id IS NOT NULL) AS standing_available
    FROM participation
    LEFT JOIN final_standings AS standings
      ON standings.driver_id = participation.driver_id
     AND standings.season_year = participation.season_year
    ORDER BY participation.driver_id, participation.season_year DESC
  `, [season]);
  const teamSeasonHistoryResult = await client.query(`
    WITH final_rounds AS (
      SELECT season_year, max(after_round) AS value
      FROM atlas.constructor_standings
      GROUP BY season_year
    )
    SELECT entry.constructor_id, standings.season_year, standings.position, standings.after_round,
           standings.points, standings.wins, entry.display_name
    FROM atlas.constructor_standings AS standings
    JOIN final_rounds ON final_rounds.season_year = standings.season_year
                     AND final_rounds.value = standings.after_round
    JOIN atlas.constructor_entries AS entry ON entry.id = standings.constructor_entry_id
    WHERE standings.season_year <= $1
    ORDER BY entry.constructor_id, standings.season_year DESC
  `, [season]);

  const groupRows = (rows, key) => rows.reduce((groups, row) => {
    (groups[row[key]] ??= []).push(row);
    return groups;
  }, {});
  const driverHistory = groupRows(driverSeasonHistoryResult.rows, 'driver_id');
  const teamHistory = groupRows(teamSeasonHistoryResult.rows, 'constructor_id');

  const generatedAt = new Date().toISOString();
  const drivers = {
    schemaVersion: 2,
    season,
    generatedAt,
    drivers: driversResult.rows.map((row) => {
      const nameEn = `${row.given_name} ${row.family_name}`;
      return {
        id: row.id,
        nameRu: nameRuById.get(row.id) ?? nameRuByEnglishName.get(normalize(nameEn)) ?? transliterateDriverName(nameEn),
        nameEn,
        code: row.abbreviation?.trim() ?? null,
        number: row.permanent_number === null ? null : Number(row.permanent_number),
        nationality: row.nationality,
        position: row.position === null ? null : Number(row.position),
        standingAvailable: row.standing_available,
        points: Number(row.points),
        wins: Number(row.wins),
        team: row.constructor_id ? {
          id: row.constructor_id,
          name: row.team_name,
          color: row.team_colour,
          logoUrl: row.logo_image_url,
        } : null,
        seasonHistory: (driverHistory[row.id] ?? []).map((standing) => ({
          season: Number(standing.season_year),
          afterRound: Number(standing.after_round),
          status: seasonsByYear.get(Number(standing.season_year)).status,
          isFinal: standing.position !== null && isFinalStanding(seasonsByYear.get(Number(standing.season_year)).status, Number(standing.after_round), seasonsByYear.get(Number(standing.season_year)).last_round),
          position: standing.position === null ? null : Number(standing.position),
          standingAvailable: standing.standing_available,
          points: Number(standing.points),
          wins: Number(standing.wins),
        })),
      };
    }),
  };
  const teams = {
    schemaVersion: 2,
    season,
    generatedAt,
    teams: teamsResult.rows.map((row) => ({
      id: row.id,
      name: row.name,
      nationality: row.nationality,
      position: Number(row.position),
      points: Number(row.points),
      wins: Number(row.wins),
      engineName: row.engine_name,
      color: row.team_colour,
      logoUrl: row.logo_image_url,
      carModel: row.car_model,
      carImageUrl: row.car_image_url,
      seasonHistory: (teamHistory[row.id] ?? []).map((standing) => ({
        season: Number(standing.season_year),
        afterRound: Number(standing.after_round),
        status: seasonsByYear.get(Number(standing.season_year)).status,
        isFinal: isFinalStanding(seasonsByYear.get(Number(standing.season_year)).status, Number(standing.after_round), seasonsByYear.get(Number(standing.season_year)).last_round),
        name: standing.display_name,
        position: Number(standing.position),
        points: Number(standing.points),
        wins: Number(standing.wins),
      })),
    })),
  };

  const enrich = (item, facts) => {
    item.raceStatistics = summarizeRaces(facts);
    item.seasonRaceStatistics = summarizeRaces(facts.filter((row) => Number(row.season_year) === season));
    item.resultGeography = resultGeography(facts);
    item.sourceIds = [...new Set(facts.map((row) => row.source_id).filter(Boolean))].sort();
    item.careerTitles = item.seasonHistory.filter((row) => row.isFinal && row.position === 1).length;
    // Legacy cards may still request the short list, but totals use the full geography.
    item.successfulCircuits = item.resultGeography.filter((row) => row.wins > 0).slice(0,8).map(({id,name,slug,isPublished,wins}) => ({id,name,slug,isPublished,wins}));
  };
  for (const driver of drivers.drivers) {
    const facts = raceFacts.rows.filter((row) => row.driver_id === driver.id);
    enrich(driver, facts);
    for (const row of driver.seasonHistory) row.teams = teamHistoryForSeason(facts, row.season);
  }
  for (const team of teams.teams) {
    const facts = raceFacts.rows.filter((row) => row.constructor_id === team.id);
    enrich(team, facts);
    const seasonFacts = facts.filter((row) => Number(row.season_year) === season);
    team.drivers = [...new Set(seasonFacts.map((row) => row.driver_id))].sort().map((id) => {
      const appearances = seasonFacts.filter((row) => row.driver_id === id);
      const first = appearances[0];
      const standing = drivers.drivers.find((row) => row.id === id);
      const nameEn = `${first.given_name} ${first.family_name}`;
      return { id, nameRu: nameRuById.get(id) ?? nameRuByEnglishName.get(normalize(nameEn)) ?? transliterateDriverName(nameEn),
        code: first.abbreviation?.trim() ?? null, position: standing?.position ?? null, points: standing?.points ?? 0,
        raceEntries: summarizeRaces(appearances).raceEntries, teamPoints: summarizeRaces(appearances).points };
    });
    team.driverCount = team.drivers.length;
  }
  for (const [kind, catalog] of [['drivers', drivers], ['teams', teams]]) {
    catalog.seasonStatus = seasonsByYear.get(season).status;
    const seasonRounds = catalog[kind].flatMap((item) => item.seasonHistory.filter((row) => row.season === season).map((row) => row.afterRound));
    catalog.afterRound = seasonRounds.length ? Math.max(...seasonRounds) : 0;
    catalog.sources = sourcesResult.rows.map((source) => ({...source, retrievedAt: source.retrievedAt?.toISOString() ?? null}));
    assertCompetitorCatalog(catalog, kind);
  }
  await client.query('COMMIT');
  await Promise.all([
    writeJson(`drivers-${season}.json`, drivers),
    writeJson(`teams-${season}.json`, teams),
  ]);
  console.log(`Экспортированы каталоги сезона ${season}: ${drivers.drivers.length} пилотов, ${teams.teams.length} команд`);
} finally {
  await client.end();
}
