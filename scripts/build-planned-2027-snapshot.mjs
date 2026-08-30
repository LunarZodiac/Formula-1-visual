import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const snapshotsDirectory = path.join(root, 'apps', 'web', 'public', 'data', 'f1');
const indexPath = path.join(snapshotsDirectory, 'seasons.json');

// Stable presentation order from the official F1 ticket portal. It is not a
// sporting round order: FIA dates and calendar order have not been published.
const plannedEvents = [
  ['albert_park', 'Australian Grand Prix'],
  ['shanghai', 'Chinese Grand Prix'],
  ['suzuka', 'Japanese Grand Prix'],
  ['bahrain', 'Bahrain Grand Prix'],
  ['jeddah', 'Saudi Arabian Grand Prix'],
  ['miami', 'Miami Grand Prix'],
  ['villeneuve', 'Canadian Grand Prix'],
  ['monaco', 'Monaco Grand Prix'],
  ['red_bull_ring', 'Austrian Grand Prix'],
  ['silverstone', 'British Grand Prix'],
  ['spa', 'Belgian Grand Prix'],
  ['hungaroring', 'Hungarian Grand Prix'],
  ['monza', 'Italian Grand Prix'],
  ['madring', 'Spanish Grand Prix'],
  ['portimao', 'Portuguese Grand Prix'],
  ['istanbul', 'Turkish Grand Prix'],
  ['baku', 'Azerbaijan Grand Prix'],
  ['marina_bay', 'Singapore Grand Prix'],
  ['americas', 'United States Grand Prix'],
  ['rodriguez', 'Mexico City Grand Prix'],
  ['interlagos', 'São Paulo Grand Prix'],
  ['vegas', 'Las Vegas Grand Prix'],
  ['losail', 'Qatar Grand Prix'],
  ['yas_marina', 'Abu Dhabi Grand Prix'],
];

const snapshotFiles = (await readdir(snapshotsDirectory))
  .filter((name) => /^season-\d{4}\.json$/.test(name) && name !== 'season-2027.json')
  .sort()
  .reverse();
const circuits = new Map();

for (const file of snapshotFiles) {
  const snapshot = JSON.parse(await readFile(path.join(snapshotsDirectory, file), 'utf8'));
  for (const event of snapshot.calendar ?? []) {
    if (!circuits.has(event.circuit.id)) circuits.set(event.circuit.id, event.circuit);
  }
}

const missing = plannedEvents.filter(([id]) => !circuits.has(id)).map(([id]) => id);
if (missing.length > 0) throw new Error(`Не найдены данные трасс: ${missing.join(', ')}`);

const exportedAt = new Date().toISOString();
const snapshot = {
  exportedAt,
  season: 2027,
  calendar: plannedEvents.map(([circuitId, name], index) => ({
    id: `2027-planned-${String(index + 1).padStart(2, '0')}`,
    round: index + 1,
    name,
    date: null,
    status: 'scheduled',
    circuit: circuits.get(circuitId),
  })),
  standings: { drivers: [], constructors: [] },
  raceResults: {},
  qualifyingResults: {},
  sprintQualifyingResults: {},
  sprintResults: {},
};

await writeFile(
  path.join(snapshotsDirectory, 'season-2027.json'),
  `${JSON.stringify(snapshot, null, 2)}\n`,
  'utf8',
);

const index = JSON.parse(await readFile(indexPath, 'utf8'));
index.exportedAt = exportedAt;
index.seasons = [
  { year: 2027, status: 'planned', roundsPlanned: plannedEvents.length, racesAvailable: 0 },
  ...index.seasons.filter((season) => season.year !== 2027),
];
await writeFile(indexPath, `${JSON.stringify(index, null, 2)}\n`, 'utf8');

console.log(`Сформирован предварительный сезон 2027: ${plannedEvents.length} площадки`);
