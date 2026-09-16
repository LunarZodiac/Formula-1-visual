#!/usr/bin/env node

import { createReadStream } from "node:fs";
import path from "node:path";
import { parse } from "csv-parse";
import pg from "pg";

const { Client } = pg;

const ISO3_TO_ISO2 = new Map([
  ["ARE", "AE"], ["ARG", "AR"], ["AUS", "AU"], ["AUT", "AT"],
  ["AZE", "AZ"], ["BEL", "BE"], ["BHR", "BH"], ["BRA", "BR"],
  ["CAN", "CA"], ["CHE", "CH"], ["CHN", "CN"], ["DEU", "DE"],
  ["ESP", "ES"], ["FRA", "FR"], ["GBR", "GB"], ["HUN", "HU"],
  ["IND", "IN"], ["ITA", "IT"], ["JPN", "JP"], ["KOR", "KR"],
  ["MAR", "MA"], ["MCO", "MC"], ["MEX", "MX"], ["MYS", "MY"],
  ["NLD", "NL"], ["PRT", "PT"], ["QAT", "QA"], ["RUS", "RU"],
  ["SAU", "SA"], ["SGP", "SG"], ["SWE", "SE"], ["TUR", "TR"],
  ["USA", "US"], ["ZAF", "ZA"],
]);

const SESSION_TYPES = new Map([
  ["FP1", "practice_1"], ["FP2", "practice_2"], ["FP3", "practice_3"],
  ["Q1", "qualifying"], ["Q2", "qualifying"], ["Q3", "qualifying"],
  ["QA", "qualifying"], ["QB", "qualifying"], ["QO", "qualifying"],
  ["SQ1", "sprint_shootout"], ["SQ2", "sprint_shootout"],
  ["SQ3", "sprint_shootout"], ["SR", "sprint"], ["R", "race"],
]);

const SESSION_NAMES = {
  practice_1: "Свободная практика 1",
  practice_2: "Свободная практика 2",
  practice_3: "Свободная практика 3",
  qualifying: "Квалификация",
  sprint_shootout: "Квалификация к спринту",
  sprint: "Спринт",
  race: "Гонка",
};

const TABLE_FILES = {
  seasons: "formula_one_season.csv",
  circuits: "formula_one_circuit.csv",
  drivers: "formula_one_driver.csv",
  teams: "formula_one_team.csv",
  teamDrivers: "formula_one_teamdriver.csv",
  rounds: "formula_one_round.csv",
  roundEntries: "formula_one_roundentry.csv",
  sessions: "formula_one_session.csv",
  sessionEntries: "formula_one_sessionentry.csv",
  driverChampionships: "formula_one_driverchampionship.csv",
  teamChampionships: "formula_one_teamchampionship.csv",
};

function argumentValue(argv, name, fallback) {
  const inline = argv.find((argument) => argument.startsWith(`--${name}=`));
  const separateIndex = argv.indexOf(`--${name}`);
  return inline?.slice(name.length + 3) ?? argv[separateIndex + 1] ?? fallback;
}

function readOptions(argv) {
  const directory = argumentValue(argv, "directory");
  if (!directory) throw new Error("Укажите --directory с распакованными CSV.");
  const throughSeason = Number(
    argumentValue(argv, "through-season", new Date().getUTCFullYear() - 1),
  );
  if (!Number.isInteger(throughSeason) || throughSeason < 1950) {
    throw new Error("Некорректный --through-season.");
  }
  return { directory: path.resolve(directory), throughSeason, apply: argv.includes("--apply") };
}

function numberOrNull(value) {
  if (value === undefined || value === null || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function booleanValue(value) {
  return value === true || value === "t" || value === "true" || value === "1";
}

function stableId(reference, prefix, numericId) {
  return reference?.trim() || `jolpica-${prefix}-${numericId}`;
}

function raceId(year, round) {
  return `${year}-${String(round).padStart(2, "0")}`;
}

function normalizeColour(value) {
  if (!value) return null;
  const colour = value.startsWith("#") ? value : `#${value}`;
  return /^#[0-9a-f]{6}$/i.test(colour) ? colour.toUpperCase() : null;
}

function durationToMilliseconds(value) {
  if (!value) return null;
  const pieces = value.split(":").map(Number);
  if (pieces.some((piece) => !Number.isFinite(piece))) return null;
  if (pieces.length === 3) {
    return Math.round((pieces[0] * 3600 + pieces[1] * 60 + pieces[2]) * 1000);
  }
  if (pieces.length === 2) return Math.round((pieces[0] * 60 + pieces[1]) * 1000);
  return Math.round(pieces[0] * 1000);
}

async function readCsv(directory, filename) {
  const rows = [];
  const parser = createReadStream(path.join(directory, filename)).pipe(
    parse({ columns: true, bom: true, relax_column_count: false, skip_empty_lines: true }),
  );
  for await (const row of parser) rows.push(row);
  return rows;
}

async function readDump(directory) {
  const data = {};
  for (const [name, filename] of Object.entries(TABLE_FILES)) {
    process.stdout.write(`Чтение ${filename}... `);
    data[name] = await readCsv(directory, filename);
    console.log(data[name].length);
  }
  return data;
}

function indexBy(rows, key = "id") {
  return new Map(rows.map((row) => [row[key], row]));
}

function selectChampionshipSnapshots(rows, throughSeason) {
  const latestSessionByRound = new Map();
  for (const row of rows) {
    const year = numberOrNull(row.year);
    const round = numberOrNull(row.round_number);
    const sessionNumber = numberOrNull(row.session_number) ?? 0;
    if (!year || year > throughSeason || !round) continue;
    const key = `${year}:${round}`;
    latestSessionByRound.set(key, Math.max(latestSessionByRound.get(key) ?? 0, sessionNumber));
  }
  return rows.filter((row) => {
    const year = numberOrNull(row.year);
    const round = numberOrNull(row.round_number);
    const sessionNumber = numberOrNull(row.session_number) ?? 0;
    return year && year <= throughSeason && round &&
      latestSessionByRound.get(`${year}:${round}`) === sessionNumber;
  });
}

function normalizeDump(raw, throughSeason) {
  const sourceDateMatch = raw.sourceDirectory.match(/jolpica-(\d{4}-\d{2}-\d{2})$/);
  const sourceDate = sourceDateMatch?.[1] ?? null;
  const seasonsById = indexBy(raw.seasons);
  const circuitsById = indexBy(raw.circuits);
  const driversById = indexBy(raw.drivers);
  const teamsById = indexBy(raw.teams);
  const teamDriversById = indexBy(raw.teamDrivers);
  const roundsById = indexBy(raw.rounds);
  const roundEntriesById = indexBy(raw.roundEntries);
  const sessionsById = indexBy(raw.sessions);

  const seasons = raw.seasons
    .map((row) => ({ year: Number(row.year), sourceExternalId: row.api_id }))
    .filter((row) => row.year >= 1950 && row.year <= throughSeason);
  const includedYears = new Set(seasons.map((row) => row.year));
  const includedSeasonIds = new Set(
    raw.seasons.filter((row) => includedYears.has(Number(row.year))).map((row) => row.id),
  );

  const circuits = raw.circuits.map((row) => {
    const countryCode = ISO3_TO_ISO2.get(row.country_code);
    if (!countryCode) throw new Error(`Нет ISO2 для страны трассы ${row.country_code}.`);
    return {
      id: stableId(row.reference, "circuit", row.id),
      sourceId: row.id,
      externalId: row.api_id,
      name: row.name,
      locality: row.locality || null,
      countryCode,
      longitude: Number(row.longitude),
      latitude: Number(row.latitude),
      altitude: numberOrNull(row.altitude),
      website: row.wikipedia || null,
    };
  });
  const circuitStableIds = new Map(circuits.map((row) => [row.sourceId, row.id]));

  const drivers = raw.drivers.map((row) => ({
    id: stableId(row.reference, "driver", row.id),
    sourceId: row.id,
    externalId: row.api_id,
    givenName: row.forename,
    familyName: row.surname,
    abbreviation: row.abbreviation || null,
    permanentNumber: numberOrNull(row.permanent_car_number),
    dateOfBirth: row.date_of_birth || null,
    nationality: row.nationality || null,
  }));
  const driverStableIds = new Map(drivers.map((row) => [row.sourceId, row.id]));

  const constructors = raw.teams.map((row) => ({
    id: stableId(row.reference, "team", row.id),
    sourceId: row.id,
    externalId: row.api_id,
    name: row.name,
    nationality: row.nationality || null,
    colour: normalizeColour(row.primary_color),
  }));
  const constructorStableIds = new Map(constructors.map((row) => [row.sourceId, row.id]));

  const entriesMap = new Map();
  for (const row of raw.teamDrivers) {
    if (!includedSeasonIds.has(row.season_id)) continue;
    const season = seasonsById.get(row.season_id);
    const team = teamsById.get(row.team_id);
    const constructorId = constructorStableIds.get(row.team_id);
    if (!season || !team || !constructorId) continue;
    const year = Number(season.year);
    entriesMap.set(`${year}:${constructorId}`, {
      year,
      constructorId,
      displayName: team.name,
      colour: normalizeColour(team.primary_color),
    });
  }

  const rounds = [];
  const includedRoundIds = new Set();
  for (const row of raw.rounds) {
    const season = seasonsById.get(row.season_id);
    const year = Number(season?.year);
    if (!includedYears.has(year)) continue;
    const round = Number(row.number);
    const circuitId = circuitStableIds.get(row.circuit_id);
    if (!circuitId) throw new Error(`Не найдена трасса этапа ${row.id}.`);
    includedRoundIds.add(row.id);
    rounds.push({
      id: raceId(year, round), year, round, circuitId,
      name: row.name, date: row.date || null,
      status: booleanValue(row.is_cancelled) ? "cancelled" : "completed",
      externalId: row.api_id,
    });
  }

  const sourceSessions = raw.sessions
    .filter((row) => includedRoundIds.has(row.round_id) && SESSION_TYPES.has(row.type))
    .sort((left, right) => Number(left.number) - Number(right.number));
  const sessionGroups = new Map();
  const sourceSessionToGroup = new Map();
  for (const row of sourceSessions) {
    const round = roundsById.get(row.round_id);
    const season = seasonsById.get(round.season_id);
    const year = Number(season.year);
    const type = SESSION_TYPES.get(row.type);
    const key = `${raceId(year, Number(round.number))}:${type}`;
    const existing = sessionGroups.get(key) ?? {
      id: `${raceId(year, Number(round.number))}-${type}`,
      raceId: raceId(year, Number(round.number)), type,
      name: SESSION_NAMES[type], startsAt: null,
      status: booleanValue(row.is_cancelled) ? "cancelled" : "completed",
      resultMap: new Map(),
    };
    if (row.timestamp && (!existing.startsAt || row.timestamp < existing.startsAt)) {
      existing.startsAt = row.timestamp;
    }
    if (!booleanValue(row.is_cancelled)) existing.status = "completed";
    sessionGroups.set(key, existing);
    sourceSessionToGroup.set(row.id, existing);
  }

  for (const row of raw.sessionEntries) {
    const sourceSession = sessionsById.get(row.session_id);
    const group = sourceSessionToGroup.get(row.session_id);
    if (!sourceSession || !group) continue;
    const roundEntry = roundEntriesById.get(row.round_entry_id);
    const teamDriver = teamDriversById.get(roundEntry?.team_driver_id);
    const driverId = driverStableIds.get(teamDriver?.driver_id);
    const constructorId = constructorStableIds.get(teamDriver?.team_id);
    if (!driverId) continue;
    const existingResult = group.resultMap.get(driverId);
    const result = existingResult ?? {
      sessionId: group.id, driverId, constructorId,
      position: null, positionText: "NC", grid: null, laps: null,
      status: null, points: 0, elapsedMs: null,
      fastestLapRank: null, details: {},
    };
    const position = numberOrNull(row.position);
    const points = numberOrNull(row.points) ?? 0;
    const isBetterClassification = position && (
      !result.position
      || position < result.position
      || (position === result.position && points > result.points)
    );
    if (isBetterClassification) {
      result.position = position;
      result.positionText = String(position);
      result.constructorId = constructorId;
      result.grid = numberOrNull(row.grid);
      result.laps = numberOrNull(row.laps_completed);
      result.status = row.detail || row.status || null;
      result.points = points;
      result.elapsedMs = durationToMilliseconds(row.time);
      result.fastestLapRank = numberOrNull(row.fastest_lap_rank);
    }
    const detailKey = sourceSession.type.toLowerCase();
    const previousDetail = result.details[detailKey];
    const currentDetail = row.time || null;
    result.details[detailKey] = previousDetail === undefined
      ? currentDetail
      : Array.isArray(previousDetail)
        ? [...previousDetail, currentDetail]
        : [previousDetail, currentDetail];
    group.resultMap.set(driverId, result);
  }

  const sessions = [...sessionGroups.values()].map(({ resultMap, ...session }) => session);
  const sessionResults = [...sessionGroups.values()].flatMap((group) =>
    [...group.resultMap.values()].filter((row) => row.position),
  );

  const driverStandings = selectChampionshipSnapshots(
    raw.driverChampionships,
    throughSeason,
  ).flatMap((row) => {
    const position = numberOrNull(row.position);
    const driverId = driverStableIds.get(row.driver_id);
    if (!position || !driverId) return [];
    return [{
      year: Number(row.year), afterRound: Number(row.round_number), position,
      driverId, points: numberOrNull(row.points) ?? 0,
      wins: numberOrNull(row.win_count) ?? 0,
    }];
  });

  const teamStandings = selectChampionshipSnapshots(
    raw.teamChampionships,
    throughSeason,
  ).flatMap((row) => {
    const position = numberOrNull(row.position);
    const constructorId = constructorStableIds.get(row.team_id);
    if (!position || !constructorId) return [];
    const year = Number(row.year);
    const team = teamsById.get(row.team_id);
    if (!entriesMap.has(`${year}:${constructorId}`) && team) {
      entriesMap.set(`${year}:${constructorId}`, {
        year, constructorId, displayName: team.name,
        colour: normalizeColour(team.primary_color),
      });
    }
    return [{
      year, afterRound: Number(row.round_number), position, constructorId,
      points: numberOrNull(row.points) ?? 0, wins: numberOrNull(row.win_count) ?? 0,
    }];
  });

  return {
    sourceDate,
    sourceId: `jolpica-csv-${sourceDate ?? "unknown"}`,
    throughSeason,
    seasons, circuits, drivers, constructors,
    constructorEntries: [...entriesMap.values()], rounds, sessions,
    sessionResults, driverStandings, teamStandings,
  };
}

function report(normalized) {
  return Object.fromEntries(
    ["seasons", "circuits", "drivers", "constructors", "constructorEntries",
      "rounds", "sessions", "sessionResults", "driverStandings", "teamStandings"]
      .map((name) => [name, normalized[name].length]),
  );
}

function assertDatabaseEnvironment() {
  const required = ["PGHOST", "PGPORT", "PGDATABASE", "PGUSER", "PGPASSWORD"];
  const missing = required.filter((name) => !process.env[name]);
  if (missing.length) throw new Error(`Не заданы параметры базы: ${missing.join(", ")}.`);
}

async function insertRows(client, table, columns, rows, conflictSql, chunkSize = 500) {
  for (let offset = 0; offset < rows.length; offset += chunkSize) {
    const chunk = rows.slice(offset, offset + chunkSize);
    const values = [];
    const placeholders = chunk.map((row, rowIndex) => {
      const fields = columns.map((column, columnIndex) => {
        values.push(row[column]);
        return `$${rowIndex * columns.length + columnIndex + 1}`;
      });
      return `(${fields.join(", ")})`;
    });
    await client.query(
      `INSERT INTO ${table} (${columns.join(",")}) VALUES ${placeholders.join(",")}
       ${conflictSql}`,
      values,
    );
  }
}

async function writeToDatabase(client, normalized) {
  await client.query("BEGIN");
  try {
    await client.query(
      `INSERT INTO atlas.data_sources (id, name, url, licence, retrieved_at, notes)
       VALUES ($1, 'Jolpica F1 CSV dump',
               'https://api.jolpi.ca/data/dumps/download/',
               'CC BY-NC-SA 4.0', $2, 'Delayed public CSV dump')
       ON CONFLICT (id) DO UPDATE SET retrieved_at = EXCLUDED.retrieved_at`,
      [normalized.sourceId, normalized.sourceDate],
    );

    await insertRows(client, "atlas.seasons",
      ["year", "status", "rounds_planned", "source_id"],
      normalized.seasons.map((row) => ({
        year: row.year, status: "completed",
        rounds_planned: normalized.rounds.filter((round) => round.year === row.year).length,
        source_id: normalized.sourceId,
      })),
      `ON CONFLICT (year) DO UPDATE SET status=EXCLUDED.status,
       rounds_planned=EXCLUDED.rounds_planned, source_id=EXCLUDED.source_id, updated_at=now()`);

    for (const row of normalized.circuits) {
      await client.query(
        `INSERT INTO atlas.circuits
           (id,name,locality,country_code,location,source_id,updated_at)
         VALUES ($1,$2,$3,$4,ST_SetSRID(ST_MakePoint($5,$6),4326)::geography,$7,now())
         ON CONFLICT (id) DO UPDATE SET name=EXCLUDED.name, locality=EXCLUDED.locality,
           country_code=EXCLUDED.country_code, location=EXCLUDED.location,
           source_id=EXCLUDED.source_id, updated_at=now()`,
        [row.id,row.name,row.locality,row.countryCode,row.longitude,row.latitude,normalized.sourceId],
      );
    }

    await insertRows(client, "atlas.drivers",
      ["id","given_name","family_name","abbreviation","permanent_number","date_of_birth","nationality","source_id"],
      normalized.drivers.map((row) => ({
        id:row.id,given_name:row.givenName,family_name:row.familyName,
        abbreviation:row.abbreviation,permanent_number:row.permanentNumber,
        date_of_birth:row.dateOfBirth,nationality:row.nationality,source_id:normalized.sourceId,
      })),
      `ON CONFLICT (id) DO UPDATE SET given_name=EXCLUDED.given_name,
       family_name=EXCLUDED.family_name, abbreviation=COALESCE(EXCLUDED.abbreviation,atlas.drivers.abbreviation),
       permanent_number=COALESCE(EXCLUDED.permanent_number,atlas.drivers.permanent_number),
       date_of_birth=COALESCE(EXCLUDED.date_of_birth,atlas.drivers.date_of_birth),
       nationality=COALESCE(EXCLUDED.nationality,atlas.drivers.nationality),
       source_id=EXCLUDED.source_id,updated_at=now()`);

    await insertRows(client, "atlas.constructors",
      ["id","name","nationality","team_colour","source_id"],
      normalized.constructors.map((row) => ({
        id:row.id,name:row.name,nationality:row.nationality,
        team_colour:row.colour,source_id:normalized.sourceId,
      })),
      `ON CONFLICT (id) DO UPDATE SET name=EXCLUDED.name,
       nationality=COALESCE(EXCLUDED.nationality,atlas.constructors.nationality),
       team_colour=COALESCE(EXCLUDED.team_colour,atlas.constructors.team_colour),
       source_id=EXCLUDED.source_id,updated_at=now()`);

    await insertRows(client, "atlas.constructor_entries",
      ["season_year","constructor_id","display_name","team_colour"],
      normalized.constructorEntries.map((row) => ({
        season_year:row.year,constructor_id:row.constructorId,
        display_name:row.displayName,team_colour:row.colour,
      })),
      `ON CONFLICT (season_year,constructor_id) DO UPDATE SET
       display_name=EXCLUDED.display_name,
       team_colour=COALESCE(EXCLUDED.team_colour,atlas.constructor_entries.team_colour)`);

    await insertRows(client, "atlas.races",
      ["id","season_year","round","circuit_id","name","race_date","status","source_id"],
      normalized.rounds.map((row) => ({
        id:row.id,season_year:row.year,round:row.round,circuit_id:row.circuitId,
        name:row.name,race_date:row.date,status:row.status,source_id:normalized.sourceId,
      })),
      `ON CONFLICT (id) DO UPDATE SET circuit_id=EXCLUDED.circuit_id,name=EXCLUDED.name,
       race_date=EXCLUDED.race_date,status=EXCLUDED.status,source_id=EXCLUDED.source_id,updated_at=now()`);

    await insertRows(client, "atlas.sessions",
      ["id","race_id","session_type","name","starts_at","status","source_id"],
      normalized.sessions.map((row) => ({
        id:row.id,race_id:row.raceId,session_type:row.type,name:row.name,
        starts_at:row.startsAt,status:row.status,source_id:normalized.sourceId,
      })),
      `ON CONFLICT (id) DO UPDATE SET name=EXCLUDED.name,starts_at=EXCLUDED.starts_at,
       status=EXCLUDED.status,source_id=EXCLUDED.source_id,updated_at=now()`);

    const entryResult = await client.query(
      "SELECT id,season_year,constructor_id FROM atlas.constructor_entries WHERE season_year <= $1",
      [normalized.throughSeason],
    );
    const entryIds = new Map(entryResult.rows.map((row) => [`${row.season_year}:${row.constructor_id}`,row.id]));
    const raceYears = new Map(normalized.rounds.map((row) => [row.id,row.year]));
    const sessionYears = new Map(normalized.sessions.map((row) => [row.id,raceYears.get(row.raceId)]));

    await client.query(
      `DELETE FROM atlas.session_results AS sr USING atlas.sessions AS s,atlas.races AS r
       WHERE sr.session_id=s.id AND s.race_id=r.id AND r.season_year <= $1`,
      [normalized.throughSeason],
    );
    await insertRows(client, "atlas.session_results",
      ["session_id","position_order","position_text","driver_id","constructor_entry_id",
       "grid_position","laps","status","points","elapsed_ms","fastest_lap_rank","details","source_id"],
      normalized.sessionResults.map((row) => ({
        session_id:row.sessionId,position_order:row.position,position_text:row.positionText,
        driver_id:row.driverId,constructor_entry_id:entryIds.get(`${sessionYears.get(row.sessionId)}:${row.constructorId}`)??null,
        grid_position:row.grid,laps:row.laps,status:row.status,points:row.points,
        elapsed_ms:row.elapsedMs,fastest_lap_rank:row.fastestLapRank,
        details:JSON.stringify(row.details),source_id:normalized.sourceId,
      })), "", 300);

    await client.query("DELETE FROM atlas.driver_standings WHERE season_year <= $1", [normalized.throughSeason]);
    await insertRows(client, "atlas.driver_standings",
      ["season_year","after_round","position","driver_id","points","wins"],
      normalized.driverStandings.map((row) => ({
        season_year:row.year,after_round:row.afterRound,position:row.position,
        driver_id:row.driverId,points:row.points,wins:row.wins,
      })), "", 500);

    await client.query("DELETE FROM atlas.constructor_standings WHERE season_year <= $1", [normalized.throughSeason]);
    await insertRows(client, "atlas.constructor_standings",
      ["season_year","after_round","position","constructor_entry_id","points","wins"],
      normalized.teamStandings.flatMap((row) => {
        const id=entryIds.get(`${row.year}:${row.constructorId}`);
        return id?[{season_year:row.year,after_round:row.afterRound,position:row.position,
          constructor_entry_id:id,points:row.points,wins:row.wins}]:[];
      }), "", 500);

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}

try {
  const options = readOptions(process.argv.slice(2));
  const raw = await readDump(options.directory);
  raw.sourceDirectory = options.directory;
  const normalized = normalizeDump(raw, options.throughSeason);
  console.log("\nНормализация завершена:");
  console.log(JSON.stringify(report(normalized), null, 2));

  if (!options.apply) {
    console.log("\nПредпросмотр: база не изменялась. Для записи добавьте --apply.");
  } else {
    assertDatabaseEnvironment();
    const client = new Client({ application_name: "f1-geovisual-atlas-dump-import" });
    await client.connect();
    try {
      await writeToDatabase(client, normalized);
    } finally {
      await client.end();
    }
    console.log(`\nСезоны 1950–${options.throughSeason} записаны одной транзакцией.`);
  }
} catch (error) {
  console.error(`\nОшибка: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}
