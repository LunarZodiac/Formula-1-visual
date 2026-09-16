#!/usr/bin/env node

import { spawn } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

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

function runNodeScript(fileName, args, environment = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(scriptDirectory, fileName), ...args], {
      cwd: path.resolve(scriptDirectory, '..'),
      env: { ...process.env, ...environment },
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

async function seasonHasBothStandings(season) {
  const client = new pg.Client({ application_name: 'f1-atlas-season-sync-planner' });
  await client.connect();
  try {
    const result = await client.query(`SELECT
      EXISTS (SELECT 1 FROM atlas.driver_standings WHERE season_year = $1) AS drivers,
      EXISTS (SELECT 1 FROM atlas.constructor_standings WHERE season_year = $1) AS constructors`, [season]);
    return result.rows[0]?.drivers === true && result.rows[0]?.constructors === true;
  } finally {
    await client.end();
  }
}

async function main() {
  const { season } = readOptions(process.argv.slice(2));
  console.log(`\nСинхронизация сезона ${season}`);

  console.log('\n1/5 Получение API, сохранение JSON и запись в PostgreSQL');
  await runNodeScript('jolpica-import-postgres.mjs', [`--season=${season}`, '--apply']);

  console.log('\n2/5 Проверка записанного сезона');
  await runNodeScript('verify-database.mjs', [`--season=${season}`]);

  console.log('\n3/5 Формирование сезонного веб-снимка');
  await runNodeScript('export-web-snapshots.mjs', [`--season=${season}`]);

  console.log('\n4/5 Обновление каталогов пилотов и команд');
  const canExportCompetitorCatalogs = await seasonHasBothStandings(season);
  if (canExportCompetitorCatalogs) {
    await runNodeScript('export-competitor-catalogs.mjs', [], { CATALOG_SEASON: String(season) });
    await runNodeScript('build-team-catalog-index.mjs', []);
  } else {
    console.log('Каталоги участников пропущены: оба зачёта ещё недоступны или в этом сезоне не проводился Кубок конструкторов.');
  }

  console.log('\n5/5 Обновление общего поиска');
  if (canExportCompetitorCatalogs) {
    await runNodeScript('export-search-index.mjs', []);
  } else {
    console.log('Поисковый индекс сохранён без изменений, чтобы предсезонье не удалило ссылки на действующие профили.');
  }

  console.log(`\nСезон ${season} обновлён: API → JSON → PostgreSQL → проверка → веб-каталоги.`);
}

main().catch((error) => {
  console.error(`\nСинхронизация остановлена: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
