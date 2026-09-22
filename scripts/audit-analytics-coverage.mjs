import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const snapshotsDirectory = path.join(repositoryRoot, 'apps', 'web', 'public', 'data', 'f1');
const reportPath = path.join(repositoryRoot, 'data', 'review', 'analytics-coverage-audit.json');
const seasonFilePattern = /^season-(\d{4})\.json$/;

const files = (await fs.readdir(snapshotsDirectory))
  .map((name) => ({ name, match: name.match(seasonFilePattern) }))
  .filter((item) => item.match)
  .map((item) => ({ name: item.name, year: Number(item.match[1]) }))
  .sort((a, b) => a.year - b.year);

const report = {
  generatedAt: new Date().toISOString(),
  scope: {
    firstSeason: files[0]?.year ?? null,
    lastSeason: files.at(-1)?.year ?? null,
    snapshotCount: files.length,
  },
  summary: {
    calendarRounds: 0,
    completedRounds: 0,
    raceRounds: 0,
    raceRows: 0,
    qualifyingRounds: 0,
    qualifyingRows: 0,
    sprintRounds: 0,
    sprintRows: 0,
    sprintQualifyingRounds: 0,
    sprintQualifyingRows: 0,
    completedRoundsWithoutRaceResults: 0,
    raceRoundsWithoutQualifyingResults: 0,
  },
  structuralErrors: [],
  seasons: [],
};

function sessions(snapshot, key) {
  const value = snapshot[key];
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function countRows(record) {
  return Object.values(record).reduce(
    (sum, rows) => sum + (Array.isArray(rows) ? rows.length : 0),
    0,
  );
}

for (const file of files) {
  const snapshot = JSON.parse(
    await fs.readFile(path.join(snapshotsDirectory, file.name), 'utf8'),
  );
  const calendar = Array.isArray(snapshot.calendar) ? snapshot.calendar : [];
  const raceResults = sessions(snapshot, 'raceResults');
  const qualifyingResults = sessions(snapshot, 'qualifyingResults');
  const sprintResults = sessions(snapshot, 'sprintResults');
  const sprintQualifyingResults = sessions(snapshot, 'sprintQualifyingResults');
  const calendarRounds = new Set(calendar.map((round) => Number(round.round)));
  const completedRounds = calendar
    .filter((round) => round.status === 'completed')
    .map((round) => Number(round.round));
  const resultRounds = (record) =>
    Object.entries(record)
      .filter(([, rows]) => Array.isArray(rows) && rows.length > 0)
      .map(([round]) => Number(round));
  const raceRounds = resultRounds(raceResults);
  const qualifyingRounds = resultRounds(qualifyingResults);
  const sprintRounds = resultRounds(sprintResults);
  const sprintQualifyingRounds = resultRounds(sprintQualifyingResults);
  const completedWithoutRace = completedRounds.filter(
    (round) => !raceRounds.includes(round),
  );
  const racesWithoutQualifying = raceRounds.filter(
    (round) => !qualifyingRounds.includes(round),
  );
  const orphanSessionRounds = [
    ...new Set(
      [raceRounds, qualifyingRounds, sprintRounds, sprintQualifyingRounds]
        .flat()
        .filter((round) => !calendarRounds.has(round)),
    ),
  ].sort((a, b) => a - b);

  if (snapshot.season !== file.year) {
    report.structuralErrors.push(
      `${file.name}: поле season=${snapshot.season} не совпадает с именем файла`,
    );
  }
  if (!Array.isArray(snapshot.standings?.drivers)) {
    report.structuralErrors.push(`${file.name}: отсутствует массив standings.drivers`);
  }
  if (orphanSessionRounds.length) {
    report.structuralErrors.push(
      `${file.name}: сессии без этапа календаря — ${orphanSessionRounds.join(', ')}`,
    );
  }

  const seasonReport = {
    season: file.year,
    calendarRounds: calendar.length,
    completedRounds: completedRounds.length,
    raceRounds: raceRounds.length,
    raceRows: countRows(raceResults),
    qualifyingRounds: qualifyingRounds.length,
    qualifyingRows: countRows(qualifyingResults),
    sprintRounds: sprintRounds.length,
    sprintRows: countRows(sprintResults),
    sprintQualifyingRounds: sprintQualifyingRounds.length,
    sprintQualifyingRows: countRows(sprintQualifyingResults),
    completedRoundsWithoutRaceResults: completedWithoutRace,
    raceRoundsWithoutQualifyingResults: racesWithoutQualifying,
  };
  report.seasons.push(seasonReport);

  for (const key of Object.keys(report.summary)) {
    const value = seasonReport[key];
    report.summary[key] += Array.isArray(value) ? value.length : value;
  }
}

await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

console.log(
  JSON.stringify(
    {
      ...report.scope,
      ...report.summary,
      structuralErrors: report.structuralErrors.length,
      reportPath,
    },
    null,
    2,
  ),
);

if (report.structuralErrors.length) process.exitCode = 1;
