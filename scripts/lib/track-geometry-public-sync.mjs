import { copyFile, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const moduleDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(moduleDirectory, '..', '..');
const canonicalPath = path.join(repositoryRoot, 'data', 'canonical', 'tracks', 'circuits-admin-imported.geojson');
const runtimePath = path.join(repositoryRoot, 'apps', 'web', 'app', 'data', 'circuits-admin-imported.json');
let publicationTail = Promise.resolve();

async function exists(filePath) {
  try { await readFile(filePath); return true; }
  catch (error) { if (error?.code === 'ENOENT') return false; throw error; }
}

async function readCollection() {
  try {
    const value = JSON.parse(await readFile(canonicalPath, 'utf8'));
    if (value.type !== 'FeatureCollection' || !Array.isArray(value.features)) throw new Error('Некорректный реестр импортированных контуров');
    return value;
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
    return { type: 'FeatureCollection', name: 'circuits-admin-imported', features: [] };
  }
}

async function replacePair(value) {
  const serialized = `${JSON.stringify(value, null, 2)}\n`;
  const targets = [canonicalPath, runtimePath];
  const staged = targets.map((target) => `${target}.tmp-${process.pid}`);
  const backups = targets.map((target) => `${target}.bak-${process.pid}`);
  const present = await Promise.all(targets.map(exists));
  const published = [false, false];
  await Promise.all(targets.map((target) => mkdir(path.dirname(target), { recursive: true })));
  await Promise.all(staged.map((filePath) => writeFile(filePath, serialized, 'utf8')));
  try {
    for (const [index, target] of targets.entries()) if (present[index]) await copyFile(target, backups[index]);
    for (const [index, target] of targets.entries()) {
      await rename(staged[index], target);
      published[index] = true;
    }
    const [canonical, runtime] = await Promise.all(targets.map((target) => readFile(target, 'utf8')));
    if (canonical !== runtime) throw new Error('Публичные копии GeoJSON не синхронизированы');
  } catch (error) {
    for (const [index, target] of targets.entries()) {
      if (!published[index]) continue;
      if (present[index]) await copyFile(backups[index], target);
      else await rm(target, { force: true });
    }
    throw error;
  } finally {
    await Promise.all([...staged, ...backups].map((filePath) => rm(filePath, { force: true })));
  }
}

async function publish(feature, databaseOperation) {
  const collection = await readCollection();
  const previousFiles = await Promise.all([canonicalPath, runtimePath].map(async (filePath) => ({
    filePath,
    present: await exists(filePath),
    contents: await readFile(filePath).catch((error) => error?.code === 'ENOENT' ? null : Promise.reject(error)),
  })));
  const next = {
    ...collection,
    properties: { updatedAt: new Date().toISOString(), source: 'Локальная админ-панель' },
    features: [...collection.features.filter((item) => item?.properties?.id !== feature.properties.id), feature]
      .sort((left, right) => String(left.properties.id).localeCompare(String(right.properties.id))),
  };
  await replacePair(next);
  try {
    return await databaseOperation();
  } catch (error) {
    await Promise.all(previousFiles.map(async ({ filePath, present, contents }) => {
      if (present && contents) {
        const temporaryPath = `${filePath}.rollback-${process.pid}`;
        await writeFile(temporaryPath, contents);
        await rename(temporaryPath, filePath);
      } else await rm(filePath, { force: true });
    }));
    throw error;
  }
}

export function publishAdminTrackGeometry(feature, databaseOperation) {
  const task = publicationTail.then(() => publish(feature, databaseOperation));
  publicationTail = task.catch(() => {});
  return task;
}
