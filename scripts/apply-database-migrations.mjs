#!/usr/bin/env node

import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import pg from "pg";

const { Client } = pg;
const MIGRATIONS_DIRECTORY = path.resolve("database", "migrations");

function assertApplyFlag(argv) {
  if (!argv.includes("--apply")) {
    throw new Error("Миграции не применены: добавьте явный флаг --apply.");
  }
}

function assertDatabaseEnvironment() {
  const required = ["PGHOST", "PGPORT", "PGDATABASE", "PGUSER", "PGPASSWORD"];
  const missing = required.filter((name) => !process.env[name]);
  if (missing.length > 0) {
    throw new Error(`Не заданы параметры базы: ${missing.join(", ")}.`);
  }
}

async function listMigrationFiles() {
  return (await readdir(MIGRATIONS_DIRECTORY))
    .filter((filename) => /^\d+_.+\.sql$/.test(filename))
    .sort((left, right) => left.localeCompare(right, "en"));
}

async function ensureMigrationLog(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS public.atlas_schema_migrations (
      filename text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    )
  `);
}

async function baselineExistingSchema(client, migrationFiles) {
  const schemaResult = await client.query(
    "SELECT to_regclass('atlas.seasons') AS seasons_table",
  );
  const logResult = await client.query(
    "SELECT count(*)::integer AS count FROM public.atlas_schema_migrations",
  );

  if (schemaResult.rows[0]?.seasons_table && logResult.rows[0]?.count === 0) {
    const initialMigration = migrationFiles.find((filename) => filename.startsWith("001_"));
    if (initialMigration) {
      await client.query(
        `INSERT INTO public.atlas_schema_migrations (filename)
         VALUES ($1) ON CONFLICT DO NOTHING`,
        [initialMigration],
      );
      console.log(`Зафиксирована ранее применённая миграция: ${initialMigration}`);
    }
  }
}

async function applyMigrations(client) {
  const migrationFiles = await listMigrationFiles();
  await ensureMigrationLog(client);
  await baselineExistingSchema(client, migrationFiles);

  const appliedResult = await client.query(
    "SELECT filename FROM public.atlas_schema_migrations ORDER BY filename",
  );
  const applied = new Set(appliedResult.rows.map((row) => row.filename));

  let appliedCount = 0;
  for (const filename of migrationFiles) {
    if (applied.has(filename)) {
      console.log(`Пропуск: ${filename}`);
      continue;
    }

    const sql = await readFile(path.join(MIGRATIONS_DIRECTORY, filename), "utf8");
    console.log(`Применение: ${filename}`);
    await client.query(sql);
    await client.query(
      "INSERT INTO public.atlas_schema_migrations (filename) VALUES ($1)",
      [filename],
    );
    appliedCount += 1;
  }

  return appliedCount;
}

try {
  assertApplyFlag(process.argv.slice(2));
  assertDatabaseEnvironment();

  const client = new Client({ application_name: "f1-geovisual-atlas-migrations" });
  await client.connect();
  try {
    const appliedCount = await applyMigrations(client);
    console.log(
      appliedCount === 0
        ? "Новых миграций нет."
        : `Успешно применено миграций: ${appliedCount}.`,
    );
  } finally {
    await client.end();
  }
} catch (error) {
  console.error(`\nОшибка: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}
