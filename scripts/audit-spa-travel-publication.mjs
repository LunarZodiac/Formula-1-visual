#!/usr/bin/env node

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, '..');
const publicPath = path.join(repositoryRoot, 'apps', 'web', 'public', 'data', 'travel', 'spa.geojson');
const collection = JSON.parse(await readFile(publicPath, 'utf8'));
const allowedStatuses = new Set(['reviewed', 'published']);
const errors = [];
const ids = new Set();
const counts = {};

if (collection.type !== 'FeatureCollection') errors.push('Корень GeoJSON должен иметь тип FeatureCollection');
if (!Array.isArray(collection.features) || collection.features.length === 0) {
  errors.push('Публичный туристический слой не должен быть пустым');
}

for (const feature of collection.features ?? []) {
  const id = feature.properties?.id ?? 'без id';
  const featureType = feature.properties?.featureType ?? 'unknown';
  const status = feature.properties?.reviewStatus;
  if (ids.has(id)) errors.push(`${id}: идентификатор встречается больше одного раза`);
  ids.add(id);
  counts[featureType] = (counts[featureType] ?? 0) + 1;
  if (!allowedStatuses.has(status)) {
    errors.push(`${id}: недопустимый публичный статус ${status ?? 'не задан'}`);
  }
  if (featureType === 'poi' && feature.geometry?.type !== 'Point') {
    errors.push(`${id}: POI должен иметь геометрию Point`);
  }
  if (featureType === 'accommodation_zone' && !['Polygon', 'MultiPolygon'].includes(feature.geometry?.type)) {
    errors.push(`${id}: район проживания должен иметь геометрию Polygon или MultiPolygon`);
  }
  if (featureType === 'route' && feature.geometry?.type !== 'LineString') {
    errors.push(`${id}: маршрут должен иметь геометрию LineString`);
  }
  if (featureType === 'route' && status !== 'published') {
    errors.push(`${id}: геометрия маршрута должна иметь статус published`);
  }
}

const declaredCounts = collection.properties?.counts;
if (declaredCounts) {
  const countMapping = { poi: 'poi', zones: 'accommodation_zone', routes: 'route' };
  for (const [declaredType, featureType] of Object.entries(countMapping)) {
    const declaredCount = declaredCounts[declaredType] ?? 0;
    if ((counts[featureType] ?? 0) !== declaredCount) {
      errors.push(`${featureType}: в метаданных указано ${declaredCount}, получено ${counts[featureType] ?? 0}`);
    }
  }
}

const duplicatedCircuit = (collection.features ?? []).find((feature) => feature.properties?.role === 'circuit');
if (duplicatedCircuit) {
  errors.push('Точка трассы не должна дублироваться в туристическом GeoJSON: она поступает из read-model страницы');
}

if (errors.length > 0) {
  console.error(errors.join('\n'));
  process.exitCode = 1;
} else {
  console.log(`Публичный туристический слой Спа прошёл аудит: ${JSON.stringify(counts)}`);
}
