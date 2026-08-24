#!/usr/bin/env node

const API_BASE_URL = "https://api.jolpi.ca/ergast/f1";
const USER_AGENT = "F1-Geovisual-Atlas/0.1 data-preview";
const PAGE_LIMIT = 100;
const REQUEST_INTERVAL_MS = 320;
const MAX_RETRIES = 3;

function readSeason(argv) {
  const inline = argv.find((argument) => argument.startsWith("--season="));
  const separateIndex = argv.indexOf("--season");
  const rawValue = inline?.split("=")[1] ?? argv[separateIndex + 1];

  if (!rawValue || !/^\d{4}$/.test(rawValue)) {
    throw new Error("Укажите сезон: node scripts/jolpica-preview.mjs --season 2024");
  }

  const season = Number(rawValue);
  if (season < 1950 || season > new Date().getUTCFullYear() + 1) {
    throw new Error(`Сезон ${season} находится вне допустимого диапазона.`);
  }

  return season;
}

function wait(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

let previousRequestAt = 0;

async function rateLimitedFetch(url, attempt = 1) {
  const waitFor = Math.max(0, REQUEST_INTERVAL_MS - (Date.now() - previousRequestAt));
  if (waitFor > 0) {
    await wait(waitFor);
  }

  previousRequestAt = Date.now();
  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
      "User-Agent": USER_AGENT,
    },
  });

  if (response.ok) {
    return response;
  }

  if ((response.status === 429 || response.status >= 500) && attempt < MAX_RETRIES) {
    const retryAfterSeconds = Number(response.headers.get("retry-after"));
    const backoff = Number.isFinite(retryAfterSeconds)
      ? retryAfterSeconds * 1000
      : 1000 * 2 ** (attempt - 1);
    await wait(backoff);
    return rateLimitedFetch(url, attempt + 1);
  }

  throw new Error(`Jolpica вернула HTTP ${response.status} для ${url}`);
}

async function fetchPages(pathname) {
  const pages = [];
  let offset = 0;
  let total = Infinity;

  while (offset < total) {
    const url = new URL(`${API_BASE_URL}/${pathname}`);
    url.searchParams.set("limit", String(PAGE_LIMIT));
    url.searchParams.set("offset", String(offset));

    const response = await rateLimitedFetch(url);
    const payload = await response.json();
    const mrData = payload?.MRData;

    if (!mrData || mrData.series !== "f1") {
      throw new Error(`Некорректный ответ Jolpica для ${url}`);
    }

    pages.push(mrData);
    total = Number(mrData.total ?? 0);
    const receivedLimit = Number(mrData.limit ?? PAGE_LIMIT);

    if (!Number.isFinite(total) || !Number.isFinite(receivedLimit) || receivedLimit <= 0) {
      throw new Error(`Некорректная пагинация Jolpica для ${url}`);
    }

    offset += receivedLimit;
  }

  return pages;
}

function collectTableItems(pages, tableName, itemName) {
  return pages.flatMap((page) => page?.[tableName]?.[itemName] ?? []);
}

function collectRaceRows(pages, childName) {
  const races = new Map();

  for (const page of pages) {
    for (const race of page?.RaceTable?.Races ?? []) {
      const key = `${race.season}-${race.round}`;
      const existing = races.get(key) ?? { ...race, [childName]: [] };
      const knownDrivers = new Set(
        existing[childName].map((row) => row?.Driver?.driverId).filter(Boolean),
      );

      for (const row of race[childName] ?? []) {
        const driverId = row?.Driver?.driverId;
        if (!driverId || !knownDrivers.has(driverId)) {
          existing[childName].push(row);
          if (driverId) knownDrivers.add(driverId);
        }
      }

      races.set(key, existing);
    }
  }

  return [...races.values()].sort((left, right) => Number(left.round) - Number(right.round));
}

function collectStandings(pages, childName) {
  const rows = [];
  const knownIds = new Set();

  for (const page of pages) {
    for (const list of page?.StandingsTable?.StandingsLists ?? []) {
      for (const row of list[childName] ?? []) {
        const entityId = row?.Driver?.driverId ?? row?.Constructor?.constructorId;
        if (!entityId || !knownIds.has(entityId)) {
          rows.push(row);
          if (entityId) knownIds.add(entityId);
        }
      }
    }
  }

  return rows;
}

function validateSchedule(season, races) {
  const warnings = [];
  const seenRounds = new Set();

  for (const race of races) {
    const round = Number(race.round);
    if (!Number.isInteger(round) || round <= 0) {
      warnings.push(`Некорректный номер этапа: ${race.round}`);
    }
    if (seenRounds.has(round)) {
      warnings.push(`Повторяется этап ${round}.`);
    }
    seenRounds.add(round);

    if (!race.Circuit?.circuitId || !race.Circuit?.Location) {
      warnings.push(`У этапа ${round} отсутствуют данные трассы.`);
    }
    if (Number(race.season) !== season) {
      warnings.push(`Этап ${round} относится к сезону ${race.season}.`);
    }
  }

  return warnings;
}

async function loadSeasonPreview(season) {
  const endpointPages = {};
  const endpoints = [
    ["schedule", `${season}/races.json`],
    ["drivers", `${season}/drivers.json`],
    ["constructors", `${season}/constructors.json`],
    ["results", `${season}/results.json`],
    ["qualifying", `${season}/qualifying.json`],
    ["sprints", `${season}/sprint.json`],
    ["driverStandings", `${season}/driverstandings.json`],
    ["constructorStandings", `${season}/constructorstandings.json`],
  ];

  for (const [name, pathname] of endpoints) {
    process.stdout.write(`Получение ${name}... `);
    endpointPages[name] = await fetchPages(pathname);
    console.log(`${endpointPages[name].length} стр.`);
  }

  const schedule = collectRaceRows(endpointPages.schedule, "__scheduleItems");
  const results = collectRaceRows(endpointPages.results, "Results");
  const qualifying = collectRaceRows(endpointPages.qualifying, "QualifyingResults");
  const sprints = collectRaceRows(endpointPages.sprints, "SprintResults");
  const drivers = collectTableItems(endpointPages.drivers, "DriverTable", "Drivers");
  const constructors = collectTableItems(
    endpointPages.constructors,
    "ConstructorTable",
    "Constructors",
  );
  const driverStandings = collectStandings(endpointPages.driverStandings, "DriverStandings");
  const constructorStandings = collectStandings(
    endpointPages.constructorStandings,
    "ConstructorStandings",
  );

  return {
    season,
    mode: "preview-only",
    fetchedAt: new Date().toISOString(),
    counts: {
      scheduledRounds: schedule.length,
      drivers: drivers.length,
      constructors: constructors.length,
      racesWithResults: results.length,
      raceResultRows: results.reduce((sum, race) => sum + race.Results.length, 0),
      qualifyingSessions: qualifying.length,
      qualifyingRows: qualifying.reduce(
        (sum, race) => sum + race.QualifyingResults.length,
        0,
      ),
      sprintSessions: sprints.length,
      sprintRows: sprints.reduce((sum, race) => sum + race.SprintResults.length, 0),
      driverStandings: driverStandings.length,
      constructorStandings: constructorStandings.length,
    },
    warnings: validateSchedule(season, schedule),
  };
}

try {
  const season = readSeason(process.argv.slice(2));
  console.log(`Jolpica: предварительная проверка сезона ${season}`);
  const report = await loadSeasonPreview(season);
  console.log("\nОтчёт (данные не записывались):");
  console.log(JSON.stringify(report, null, 2));
} catch (error) {
  console.error(`\nОшибка: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}
