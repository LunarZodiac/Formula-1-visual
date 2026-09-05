#!/usr/bin/env node

import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const catalogDirectory = path.resolve('apps', 'web', 'app', 'data', 'catalogs');
const fileNames = (await readdir(catalogDirectory))
  .filter((name) => /^drivers-\d{4}\.json$/.test(name))
  .sort((left, right) => Number(left.slice(8, 12)) - Number(right.slice(8, 12)));

const drivers = new Map();
let generatedAt = null;
for (const fileName of fileNames) {
  const catalog = JSON.parse(await readFile(path.join(catalogDirectory, fileName), 'utf8'));
  generatedAt = catalog.generatedAt;
  for (const driver of catalog.drivers) {
    drivers.set(driver.id, {
      id: driver.id,
      nameRu: driver.nameRu,
      nameEn: driver.nameEn,
      code: driver.code,
      number: driver.number,
      nationality: driver.nationality,
      position: driver.position,
      points: driver.points,
      wins: driver.wins,
      team: driver.team,
      latestSeason: catalog.season,
      firstSeason: driver.seasonHistory.reduce((oldest, row) => Math.min(oldest, row.season), catalog.season),
      seasonCount: driver.seasonHistory.length,
    });
  }
}

const output = {
  schemaVersion: 1,
  generatedAt,
  drivers: [...drivers.values()].sort((left, right) => left.nameRu.localeCompare(right.nameRu, 'ru')),
};

const outputPath = path.join(catalogDirectory, 'drivers-all.json');
await writeFile(outputPath, `${JSON.stringify(output, null, 2)}\n`, 'utf8');
console.log(`Создан облегчённый индекс: ${output.drivers.length} пилотов`);
