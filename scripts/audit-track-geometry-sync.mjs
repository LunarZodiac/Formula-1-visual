#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, '..');
const canonicalPath = path.join(repositoryRoot, 'data/canonical/tracks/circuits-user-digitized.geojson');
const runtimePath = path.join(repositoryRoot, 'apps/web/app/data/circuits-user-digitized.json');
const inventoryPath = path.join(repositoryRoot, 'data/canonical/tracks/circuits-user-digitized.inventory.json');

function sha256(buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}

function inspectCollection(buffer, filePath) {
  const collection = JSON.parse(buffer.toString('utf8'));
  if (collection.type !== 'FeatureCollection' || !Array.isArray(collection.features)) {
    throw new Error(`${filePath}: ожидается GeoJSON FeatureCollection.`);
  }

  const ids = new Set();
  let coordinateCount = 0;
  for (const [featureIndex, feature] of collection.features.entries()) {
    const id = feature.properties?.id;
    if (!id || ids.has(id)) throw new Error(`${filePath}: пустой или повторный id в feature ${featureIndex}.`);
    ids.add(id);
    if (feature.geometry?.type !== 'LineString' || !Array.isArray(feature.geometry.coordinates)) {
      throw new Error(`${filePath}: ${id} не является LineString.`);
    }
    if (feature.properties?.placeholder === true || feature.properties?.status === 'placeholder') {
      throw new Error(`${filePath}: ${id} помечен как placeholder.`);
    }
    for (const [coordinateIndex, coordinate] of feature.geometry.coordinates.entries()) {
      const [longitude, latitude] = coordinate ?? [];
      if (!Array.isArray(coordinate) || coordinate.length < 2
          || !Number.isFinite(longitude) || !Number.isFinite(latitude)
          || longitude < -180 || longitude > 180 || latitude < -90 || latitude > 90) {
        throw new Error(`${filePath}: ${id}, координата ${coordinateIndex} невалидна.`);
      }
      coordinateCount += 1;
    }
  }

  return {
    collection,
    sha256: sha256(buffer),
    bytes: buffer.byteLength,
    featureCount: collection.features.length,
    coordinateCount,
  };
}

function relativePath(filePath) {
  return path.relative(repositoryRoot, filePath).replaceAll(path.sep, '/');
}

async function writeJsonAtomic(filePath, value) {
  await mkdir(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.tmp-${process.pid}`;
  await writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  await rename(temporaryPath, filePath);
}

const [canonicalBuffer, runtimeBuffer] = await Promise.all([
  readFile(canonicalPath),
  readFile(runtimePath),
]);
const canonical = inspectCollection(canonicalBuffer, canonicalPath);
const runtime = inspectCollection(runtimeBuffer, runtimePath);
const geometryEqual = JSON.stringify(canonical.collection.features.map((feature) => ({
  id: feature.properties.id,
  geometry: feature.geometry,
}))) === JSON.stringify(runtime.collection.features.map((feature) => ({
  id: feature.properties.id,
  geometry: feature.geometry,
})));
const propertiesEqual = JSON.stringify(canonical.collection.features.map((feature) => ({
  id: feature.properties.id,
  properties: feature.properties,
}))) === JSON.stringify(runtime.collection.features.map((feature) => ({
  id: feature.properties.id,
  properties: feature.properties,
})));
const collectionMetadataEqual = JSON.stringify({
  type: canonical.collection.type,
  name: canonical.collection.name,
  properties: canonical.collection.properties,
}) === JSON.stringify({
  type: runtime.collection.type,
  name: runtime.collection.name,
  properties: runtime.collection.properties,
});

const inventory = {
  schemaVersion: 1,
  dataset: 'circuits-user-digitized',
  coordinateReferenceSystem: 'WGS 84 (EPSG:4326), GeoJSON coordinate order [longitude, latitude]',
  source: {
    path: relativePath(runtimePath),
    sha256: runtime.sha256,
    bytes: runtime.bytes,
    featureCount: runtime.featureCount,
    coordinateCount: runtime.coordinateCount,
  },
  canonicalCopy: {
    path: relativePath(canonicalPath),
    sha256: canonical.sha256,
    bytes: canonical.bytes,
    featureCount: canonical.featureCount,
    coordinateCount: canonical.coordinateCount,
  },
  equality: {
    byteForByte: canonical.sha256 === runtime.sha256,
    collectionMetadata: collectionMetadataEqual,
    geometry: geometryEqual,
    properties: propertiesEqual,
  },
};

if (process.argv.includes('--write-inventory')) await writeJsonAtomic(inventoryPath, inventory);
console.log(JSON.stringify(inventory, null, 2));

if (canonical.sha256 !== runtime.sha256 || !collectionMetadataEqual || !geometryEqual || !propertiesEqual
    || canonical.featureCount !== runtime.featureCount
    || canonical.coordinateCount !== runtime.coordinateCount) {
  process.exitCode = 1;
}
