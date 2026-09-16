#!/usr/bin/env node

import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

const repositoryRoot = path.resolve(import.meta.dirname, '..');
const catalogPath = path.join(repositoryRoot, 'apps', 'web', 'app', 'data', 'catalogs', 'circuits.json');
const flagsDirectory = path.join(repositoryRoot, 'apps', 'web', 'public', 'assets', 'flags');
const reportPath = path.join(repositoryRoot, 'data', 'review', 'circuit-catalog-audit.json');
const expectedCircuitCount = 78;
const countryNamesRu = {
  ae: 'Объединённые Арабские Эмираты', ar: 'Аргентина', at: 'Австрия', au: 'Австралия', az: 'Азербайджан',
  be: 'Бельгия', bh: 'Бахрейн', br: 'Бразилия', ca: 'Канада', ch: 'Швейцария',
  cn: 'Китай', de: 'Германия', es: 'Испания', fr: 'Франция', gb: 'Великобритания',
  hu: 'Венгрия', in: 'Индия', it: 'Италия', jp: 'Япония', kr: 'Республика Корея',
  ma: 'Марокко', mc: 'Монако', mx: 'Мексика', my: 'Малайзия', nl: 'Нидерланды',
  pt: 'Португалия', qa: 'Катар', ru: 'Россия', sa: 'Саудовская Аравия', se: 'Швеция',
  sg: 'Сингапур', tr: 'Турция', us: 'Соединённые Штаты Америки', za: 'Южно-Африканская Республика',
};

const catalog = JSON.parse(await readFile(catalogPath, 'utf8'));
const circuits = Array.isArray(catalog.circuits) ? catalog.circuits : [];
const errors = [];
const warnings = [];

if (circuits.length !== expectedCircuitCount) {
  errors.push(`Ожидалось ${expectedCircuitCount} трасс, получено ${circuits.length}`);
}

const duplicateIds = circuits
  .map((circuit) => circuit.id)
  .filter((id, index, ids) => ids.indexOf(id) !== index);
if (duplicateIds.length) errors.push(`Повторяющиеся ID: ${[...new Set(duplicateIds)].join(', ')}`);

const missing = {
  russianName: [], countryName: [], city: [], geometry: [], flag: [], summary: [],
  length: [], turns: [], debut: [], record: [],
};
for (const circuit of circuits) {
  if (!/[А-Яа-яЁё]/.test(circuit.nameRu ?? '')) missing.russianName.push(circuit.id);
  const expectedCountry = countryNamesRu[circuit.countryCode];
  if (!expectedCountry || circuit.countryRu !== expectedCountry) missing.countryName.push(circuit.id);
  if (!circuit.cityRu) missing.city.push(circuit.id);
  if (!circuit.geometry?.coordinates?.length) missing.geometry.push(circuit.id);
  if (!circuit.summary) missing.summary.push(circuit.id);
  for (const metric of ['length', 'turns', 'debut', 'record']) {
    if (!circuit.metrics?.[metric]) missing[metric].push(circuit.id);
  }

  const flagPath = path.join(flagsDirectory, `${circuit.countryCode}.svg`);
  try {
    const [fileInfo, contents] = await Promise.all([stat(flagPath), readFile(flagPath, 'utf8')]);
    if (fileInfo.size === 0 || !/<svg(?:\s|>)/i.test(contents)) missing.flag.push(circuit.id);
  } catch {
    missing.flag.push(circuit.id);
  }
}

for (const field of ['russianName', 'countryName', 'city', 'geometry', 'flag']) {
  if (missing[field].length) errors.push(`${field}: ${missing[field].join(', ')}`);
}
for (const field of ['summary', 'length', 'turns', 'debut', 'record']) {
  if (missing[field].length) warnings.push(`${field}: не заполнено у ${missing[field].length} трасс`);
}

const report = {
  generatedAt: new Date().toISOString(),
  circuitCount: circuits.length,
  countryCount: new Set(circuits.map((circuit) => circuit.countryCode)).size,
  errors,
  warnings,
  missing,
};
await mkdir(path.dirname(reportPath), { recursive: true });
await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({
  circuitCount: report.circuitCount,
  countryCount: report.countryCount,
  errors: errors.length,
  editorialDebt: Object.fromEntries(['summary', 'length', 'turns', 'debut', 'record'].map((field) => [field, missing[field].length])),
  reportPath: path.relative(repositoryRoot, reportPath),
}, null, 2));
if (errors.length) process.exitCode = 1;
