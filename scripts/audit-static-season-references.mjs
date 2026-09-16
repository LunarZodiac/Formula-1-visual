#!/usr/bin/env node

import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

const dataDirectory = path.resolve('apps', 'web', 'app', 'data');
const seasonDirectory = path.join(dataDirectory, 'seasons');
const drivers = JSON.parse(await readFile(path.join(dataDirectory, 'catalogs', 'drivers.json'), 'utf8'));
const teams = JSON.parse(await readFile(path.join(dataDirectory, 'catalogs', 'teams.json'), 'utf8'));
const driverIds = new Set(drivers.map((driver) => driver.id));
const teamIds = new Set(teams.map((team) => team.id));
const errors = [];

function inspect(value, fileName, location = '$') {
  if (Array.isArray(value)) {
    value.forEach((item, index) => inspect(item, fileName, `${location}[${index}]`));
    return;
  }
  if (!value || typeof value !== 'object') return;
  if (typeof value.driverId === 'string' && !driverIds.has(value.driverId)) {
    errors.push({ file: fileName, location, field: 'driverId', id: value.driverId });
  }
  if (typeof value.teamId === 'string' && !teamIds.has(value.teamId)) {
    errors.push({ file: fileName, location, field: 'teamId', id: value.teamId });
  }
  for (const [key, child] of Object.entries(value)) inspect(child, fileName, `${location}.${key}`);
}

const files = (await readdir(seasonDirectory)).filter((fileName) => fileName.endsWith('.json')).sort();
for (const fileName of files) {
  inspect(JSON.parse(await readFile(path.join(seasonDirectory, fileName), 'utf8')), fileName);
}

console.log(JSON.stringify({ files: files.length, drivers: driverIds.size, teams: teamIds.size, errors }, null, 2));
if (errors.length) process.exitCode = 1;
