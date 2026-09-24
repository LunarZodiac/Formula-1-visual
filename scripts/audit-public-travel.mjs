#!/usr/bin/env node

import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { auditPublicTravelCollection } from './lib/audit-public-travel.mjs';

const argumentsList = process.argv.slice(2);
if (argumentsList.length > 1 || argumentsList.some((argument) => !/^--circuit=[A-Za-z0-9_-]+$/.test(argument))) {
  throw new Error('Использование: node audit-public-travel.mjs [--circuit=ID]');
}
const circuitId = argumentsList[0]?.slice('--circuit='.length);
const directory = path.resolve(import.meta.dirname, '..', 'apps', 'web', 'public', 'data', 'travel');
const files = circuitId ? [`${circuitId}.geojson`] : (await readdir(directory)).filter((name) => name.endsWith('.geojson')).sort();
let failures = 0;
for (const file of files) {
  try {
    const data = JSON.parse(await readFile(path.join(directory, file), 'utf8'));
    const { counts, issues } = auditPublicTravelCollection(data);
    console.log(`${file}: ${counts.poi} точек, ${counts.zones} зон, ${counts.routes} маршрутов${issues.length ? `; ошибок: ${issues.length}` : '; корректно'}`);
    for (const issue of issues) console.error(`  ${issue}`);
    failures += issues.length;
  } catch (error) {
    failures += 1;
    console.error(`${file}: ${error.message}`);
  }
}
if (failures) process.exitCode = 1;
