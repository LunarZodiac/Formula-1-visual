#!/usr/bin/env node

import { spawn } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));

function readOptions(argv) {
  const inlineSeason = argv.find((value) => value.startsWith('--season='));
  const seasonIndex = argv.indexOf('--season');
  const rawSeason = inlineSeason?.slice('--season='.length) ?? argv[seasonIndex + 1];
  const season = rawSeason ? Number(rawSeason) : new Date().getUTCFullYear();

  if (!Number.isInteger(season) || season < 1950 || season > new Date().getUTCFullYear() + 1) {
    throw new Error(`Некорректный сезон: ${rawSeason ?? season}.`);
  }
  if (!argv.includes('--apply')) {
    throw new Error('Синхронизация изменяет базу и снимки. Добавьте флаг --apply.');
  }
  return { season };
}

function runNodeScript(fileName, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(scriptDirectory, fileName), ...args], {
      cwd: path.resolve(scriptDirectory, '..'),
      env: process.env,
      stdio: 'inherit',
      windowsHide: true,
    });
    child.on('error', reject);
    child.on('exit', (code, signal) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(
        signal
          ? `${fileName} остановлен сигналом ${signal}.`
          : `${fileName} завершился с кодом ${code}.`,
      ));
    });
  });
}

async function main() {
  const { season } = readOptions(process.argv.slice(2));
  console.log(`\nСинхронизация сезона ${season}`);

  console.log('\n1/3 Получение API и запись в PostgreSQL');
  await runNodeScript('jolpica-import-postgres.mjs', [`--season=${season}`, '--apply']);

  console.log('\n2/3 Проверка записанного сезона');
  await runNodeScript('verify-database.mjs', [`--season=${season}`]);

  console.log('\n3/3 Формирование веб-снимков');
  await runNodeScript('export-web-snapshots.mjs', [`--season=${season}`]);

  console.log(`\nСезон ${season} обновлён: API → PostgreSQL → веб-снимки.`);
}

main().catch((error) => {
  console.error(`\nСинхронизация остановлена: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
