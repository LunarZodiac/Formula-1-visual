import { readFile } from 'node:fs/promises';
import path from 'node:path';

const inputPath = process.argv[2];
if (!inputPath) {
  console.error('Использование: node scripts/validate-track-geometry-batch.mjs <файл.geojson>');
  process.exit(1);
}

const requiredProperties = [
  'id',
  'circuitId',
  'name',
  'nameRu',
  'configuration',
  'fromSeason',
  'toSeason',
  'eventIds',
  'length',
  'direction',
  'source',
  'sourceUrl',
  'license',
  'checkedAt',
];

const absolutePath = path.resolve(process.cwd(), inputPath);
const collection = JSON.parse(await readFile(absolutePath, 'utf8'));
const errors = [];
const ids = new Set();

if (collection.type !== 'FeatureCollection' || !Array.isArray(collection.features)) {
  errors.push('Корневой объект должен быть FeatureCollection с массивом features');
} else {
  collection.features.forEach((feature, index) => {
    const label = `Feature ${index + 1}`;
    const properties = feature.properties ?? {};
    for (const property of requiredProperties) {
      if (properties[property] === undefined || properties[property] === null || properties[property] === '') {
        errors.push(`${label}: отсутствует properties.${property}`);
      }
    }
    if (ids.has(properties.id)) errors.push(`${label}: повторяется id ${properties.id}`);
    ids.add(properties.id);
    if (!Array.isArray(properties.eventIds)) errors.push(`${label}: eventIds должен быть массивом`);
    if (!['clockwise', 'counterclockwise'].includes(properties.direction)) {
      errors.push(`${label}: direction должен быть clockwise или counterclockwise`);
    }
    if (!Number.isInteger(properties.fromSeason) || !Number.isInteger(properties.toSeason)) {
      errors.push(`${label}: fromSeason и toSeason должны быть целыми числами`);
    } else if (properties.fromSeason > properties.toSeason) {
      errors.push(`${label}: fromSeason не может быть позже toSeason`);
    }
    if (feature.geometry?.type !== 'LineString' || !Array.isArray(feature.geometry.coordinates)) {
      errors.push(`${label}: geometry должна быть LineString`);
      return;
    }
    const coordinates = feature.geometry.coordinates;
    if (coordinates.length < 3) errors.push(`${label}: в линии должно быть минимум три точки`);
    for (const [coordinateIndex, coordinate] of coordinates.entries()) {
      const valid = Array.isArray(coordinate)
        && coordinate.length >= 2
        && Number.isFinite(coordinate[0])
        && Number.isFinite(coordinate[1])
        && Math.abs(coordinate[0]) <= 180
        && Math.abs(coordinate[1]) <= 90;
      if (!valid) errors.push(`${label}: некорректная координата №${coordinateIndex + 1}`);
    }
    const first = coordinates[0];
    const last = coordinates.at(-1);
    if (first?.[0] !== last?.[0] || first?.[1] !== last?.[1]) {
      errors.push(`${label}: линия не замкнута — первая и последняя точки должны совпадать`);
    }
  });
}

if (errors.length > 0) {
  console.error(`Найдено ошибок: ${errors.length}`);
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log(`Готово к импорту: ${collection.features.length} конфигураций, ${ids.size} уникальных id`);
