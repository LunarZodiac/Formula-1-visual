#!/usr/bin/env node

import { copyFile, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, '..');
const defaultCanonicalPath = path.join(repositoryRoot, 'data/canonical/tracks/circuits-user-digitized.geojson');
const defaultRuntimePath = path.join(repositoryRoot, 'apps/web/app/data/circuits-user-digitized.json');
const requiredProperties = [
  'id',
  'circuitId',
  'name',
  'nameRu',
  'configuration',
  'seasons',
  'fromSeason',
  'toSeason',
  'eventIds',
  'expectedLength',
];

function resolveRepositoryPath(value) {
  return path.isAbsolute(value) ? value : path.resolve(repositoryRoot, value);
}

function readOptions(argv) {
  const positional = argv.filter((value) => !value.startsWith('--'));
  const canonicalOption = argv.find((value) => value.startsWith('--canonical='));
  const runtimeOption = argv.find((value) => value.startsWith('--runtime='));
  const input = positional[0];
  if (!input) {
    throw new Error('Использование: node scripts/import-digitized-track-batch.mjs <вход.geojson> [runtime-выход.json] [--canonical=путь] [--runtime=путь]');
  }
  return {
    inputPath: resolveRepositoryPath(input),
    canonicalPath: canonicalOption
      ? resolveRepositoryPath(canonicalOption.slice('--canonical='.length))
      : defaultCanonicalPath,
    runtimePath: runtimeOption
      ? resolveRepositoryPath(runtimeOption.slice('--runtime='.length))
      : positional[1]
        ? resolveRepositoryPath(positional[1])
        : defaultRuntimePath,
  };
}

async function pathExists(filePath) {
  try {
    await readFile(filePath);
    return true;
  } catch (error) {
    if (error?.code === 'ENOENT') return false;
    throw error;
  }
}

async function publishPairAtomic(canonicalPath, runtimePath, value) {
  if (path.resolve(canonicalPath) === path.resolve(runtimePath)) {
    throw new Error('Канонический и runtime-файлы должны иметь разные пути.');
  }
  const serialized = `${JSON.stringify(value, null, 2)}\n`;
  const targets = [canonicalPath, runtimePath];
  const stagedPaths = targets.map((target) => `${target}.tmp-${process.pid}`);
  const backupPaths = targets.map((target) => `${target}.bak-${process.pid}`);
  const existed = await Promise.all(targets.map(pathExists));
  const backupReady = [false, false];
  const published = [false, false];
  let publishedSha256 = null;

  await Promise.all(targets.map((target) => mkdir(path.dirname(target), { recursive: true })));
  await Promise.all(stagedPaths.map((stagedPath) => writeFile(stagedPath, serialized, 'utf8')));
  try {
    for (const [index, target] of targets.entries()) {
      if (existed[index]) {
        await copyFile(target, backupPaths[index]);
        backupReady[index] = true;
      }
    }
    await rename(stagedPaths[0], targets[0]);
    published[0] = true;
    await rename(stagedPaths[1], targets[1]);
    published[1] = true;

    const [canonicalBuffer, runtimeBuffer] = await Promise.all([
      readFile(canonicalPath),
      readFile(runtimePath),
    ]);
    const canonicalHash = createHash('sha256').update(canonicalBuffer).digest('hex');
    const runtimeHash = createHash('sha256').update(runtimeBuffer).digest('hex');
    if (canonicalHash !== runtimeHash) {
      throw new Error('После публикации canonical/runtime не прошли обязательный sync audit.');
    }
    publishedSha256 = canonicalHash;
  } catch (error) {
    for (const [index, target] of targets.entries()) {
      if (!published[index]) continue;
      if (backupReady[index]) await copyFile(backupPaths[index], target);
      else if (!existed[index]) await rm(target, { force: true });
    }
    throw error;
  } finally {
    await Promise.all([...stagedPaths, ...backupPaths].map((filePath) => rm(filePath, { force: true })));
  }
  return publishedSha256;
}

function assertCoordinate(coordinate, featureId, coordinateIndex) {
  if (!Array.isArray(coordinate) || coordinate.length < 2) {
    throw new Error(`${featureId}: координата ${coordinateIndex} не является парой [longitude, latitude].`);
  }
  const [longitude, latitude] = coordinate;
  if (!Number.isFinite(longitude) || !Number.isFinite(latitude)
      || longitude < -180 || longitude > 180 || latitude < -90 || latitude > 90) {
    throw new Error(`${featureId}: некорректная координата ${coordinateIndex}.`);
  }
}

const earthRadius = 6371008.8;
const toRadians = (degrees) => degrees * Math.PI / 180;
function distance([leftLng, leftLat], [rightLng, rightLat]) {
  const latitudeDelta = toRadians(rightLat - leftLat);
  const longitudeDelta = toRadians(rightLng - leftLng);
  const leftLatitude = toRadians(leftLat);
  const rightLatitude = toRadians(rightLat);
  const value = Math.sin(latitudeDelta / 2) ** 2
    + Math.cos(leftLatitude) * Math.cos(rightLatitude) * Math.sin(longitudeDelta / 2) ** 2;
  return earthRadius * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value));
}

function lineLength(coordinates) {
  return coordinates.slice(1).reduce(
    (total, coordinate, index) => total + distance(coordinates[index], coordinate),
    0,
  );
}

function direction(coordinates) {
  const signedArea = coordinates.slice(1).reduce((area, [longitude, latitude], index) => {
    const [previousLongitude, previousLatitude] = coordinates[index];
    return area + (longitude - previousLongitude) * (latitude + previousLatitude);
  }, 0);
  return signedArea > 0 ? 'clockwise' : 'counterclockwise';
}

const { inputPath, canonicalPath, runtimePath } = readOptions(process.argv.slice(2));
const [sourceBuffer, expectedCanonicalBuffer] = await Promise.all([
  readFile(inputPath, 'utf8'),
  readFile(defaultCanonicalPath, 'utf8'),
]);
const source = JSON.parse(sourceBuffer);
const expectedCanonical = JSON.parse(expectedCanonicalBuffer);
if (source.type !== 'FeatureCollection' || !Array.isArray(source.features) || source.features.length === 0) {
  throw new Error('Входной файл должен быть непустой GeoJSON FeatureCollection.');
}
const expectedIds = new Set(expectedCanonical.features.map((feature) => feature.properties?.id));
const featureIds = new Set();
const features = source.features.map((feature) => {
  const properties = { ...feature.properties };
  if (properties.circuitId === 'adelaide') properties.id = 'au-adelaide-1985';
  if (properties.id === 'fr-charade-1965') {
    properties.seasons = '1965, 1969-1970, 1972';
    properties.fromSeason = 1965;
    properties.toSeason = 1972;
    properties.expectedLength = 8055;
  }
  const featureId = properties.id;
  if (!featureId || featureIds.has(featureId)) {
    throw new Error(`Каждая геометрия должна иметь уникальный properties.id; проблемное значение: ${featureId ?? 'пусто'}.`);
  }
  featureIds.add(featureId);
  const missingProperties = requiredProperties.filter((property) => properties[property] === undefined || properties[property] === null);
  if (missingProperties.length > 0) {
    throw new Error(`${featureId}: отсутствуют обязательные поля ${missingProperties.join(', ')}.`);
  }
  if (feature.geometry?.type !== 'LineString' || !Array.isArray(feature.geometry.coordinates)) {
    throw new Error(`${featureId}: ожидается геометрия LineString.`);
  }
  if (properties.placeholder === true || properties.status === 'placeholder') {
    throw new Error(`${featureId}: placeholder-геометрия не может перезаписать канонический слой.`);
  }

  const coordinates = feature.geometry.coordinates.map((coordinate) => [...coordinate]);
  if (coordinates.length < 3) throw new Error(`${featureId}: линия содержит меньше трёх координат.`);
  coordinates.forEach((coordinate, index) => assertCoordinate(coordinate, featureId, index));
  const first = coordinates[0];
  const last = coordinates.at(-1);
  if (first[0] !== last[0] || first[1] !== last[1]) coordinates.push([...first]);

  const measuredLength = Math.round(lineLength(coordinates));
  const deviation = properties.expectedLength
    ? Math.abs(measuredLength - properties.expectedLength) / properties.expectedLength
    : 0;
  const qualityStatus = deviation > 0.2
    ? 'needs-redigitizing'
    : deviation > 0.1
      ? 'needs-review'
      : 'ready';

  return {
    type: 'Feature',
    properties: {
      ...properties,
      length: measuredLength,
      direction: direction(coordinates),
      source: 'Оцифровка пользователя по картографическим материалам',
      sourceUrl: 'local:f1-track-digitizing-worklist.geojson',
      license: 'User-provided',
      checkedAt: '2026-08-28',
      status: qualityStatus,
      qualityStatus,
      lengthDeviationPercent: properties.expectedLength
        ? Number(((measuredLength - properties.expectedLength) / properties.expectedLength * 100).toFixed(1))
        : null,
      placeholder: false,
      instructions: undefined,
    },
    geometry: { type: 'LineString', coordinates },
  };
});

const missingIds = [...expectedIds].filter((id) => !featureIds.has(id));
const unexpectedIds = [...featureIds].filter((id) => !expectedIds.has(id));
if (missingIds.length > 0 || unexpectedIds.length > 0 || features.length !== expectedIds.size) {
  throw new Error(`Импорт отклонён: ожидается полный набор из ${expectedIds.size} ID; пропущены [${missingIds.join(', ')}], лишние [${unexpectedIds.join(', ')}].`);
}

const collection = {
  type: 'FeatureCollection',
  name: 'circuits-user-digitized',
  properties: {
    importedAt: source.properties?.importedAt ?? '2026-08-28',
    source: path.basename(inputPath),
    note: 'Геометрии доступны в атласе; qualityStatus отделяет готовые линии от требующих проверки.',
  },
  features,
};

const publishedSha256 = await publishPairAtomic(canonicalPath, runtimePath, collection);
const summary = Object.groupBy(features, (feature) => feature.properties.qualityStatus);
console.log(JSON.stringify({
  canonical: canonicalPath,
  runtime: runtimePath,
  publishedSha256,
  features: features.length,
  ready: summary.ready?.length ?? 0,
  needsReview: summary['needs-review']?.map((feature) => feature.properties.id) ?? [],
  needsRedigitizing: summary['needs-redigitizing']?.map((feature) => feature.properties.id) ?? [],
}, null, 2));
