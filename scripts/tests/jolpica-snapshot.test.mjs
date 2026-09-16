import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { buildSeasonReport, saveSeasonSnapshot } from '../jolpica-preview.mjs';

const emptySeason = {
  schedule: [], drivers: [], constructors: [], results: [], qualifying: [], sprints: [],
  driverStandings: [], constructorStandings: [],
};

test('empty API data cannot pass the import report', () => {
  const report = buildSeasonReport(2026, emptySeason, '2026-09-12T00:00:00.000Z');
  assert.ok(report.warnings.some((warning) => warning.includes('календарь')));
  assert.ok(report.warnings.some((warning) => warning.includes('участников')));
});

test('standings are optional before the first race and constructor standings before 1958', () => {
  const preseason = {
    ...emptySeason,
    schedule: [{ round: '1' }],
    drivers: [{ driverId: 'driver' }],
    constructors: [{ constructorId: 'team' }],
  };
  assert.ok(buildSeasonReport(2027, preseason).warnings.every((warning) => !warning.includes('зачёт')));

  const season1950 = {
    ...preseason,
    results: [{ round: '1', Results: [{}] }],
    driverStandings: [{}],
  };
  assert.ok(buildSeasonReport(1950, season1950).warnings.every((warning) => !warning.includes('зачёт команд')));
});

test('missing standings stop a season that already has race results', () => {
  const activeSeason = {
    ...emptySeason,
    schedule: [{ round: '1' }],
    drivers: [{ driverId: 'driver' }],
    constructors: [{ constructorId: 'team' }],
    results: [{ round: '1', Results: [{}] }],
  };
  const warnings = buildSeasonReport(2026, activeSeason).warnings;
  assert.ok(warnings.some((warning) => warning.includes('личный зачёт')));
  assert.ok(warnings.some((warning) => warning.includes('зачёт команд')));
});

test('raw snapshot and latest manifest share one checksum', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'f1-jolpica-snapshot-'));
  try {
    const snapshot = {
      schemaVersion: 1,
      provider: 'jolpica',
      apiBaseUrl: 'https://api.jolpi.ca/ergast/f1',
      season: 2026,
      fetchedAt: '2026-09-12T00:00:00.000Z',
      endpoints: { schedule: { pathname: '2026/races/', pages: [] } },
    };
    const saved = await saveSeasonSnapshot(snapshot, directory);
    const stored = JSON.parse(await readFile(saved.filePath, 'utf8'));
    const manifest = JSON.parse(await readFile(path.join(directory, '2026', 'latest.json'), 'utf8'));
    assert.deepEqual(stored, snapshot);
    assert.equal(manifest.sha256, saved.sha256);
    assert.equal(manifest.fileName, saved.fileName);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
