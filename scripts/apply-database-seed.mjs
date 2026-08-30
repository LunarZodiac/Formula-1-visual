#!/usr/bin/env node

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import pg from 'pg';

const seedPath = process.argv[2];
if (!seedPath || !process.argv.includes('--apply')) {
  throw new Error('Использование: node scripts/apply-database-seed.mjs <seed.sql> --apply');
}
const required = ['PGHOST', 'PGPORT', 'PGDATABASE', 'PGUSER', 'PGPASSWORD'];
const missing = required.filter((name) => !process.env[name]);
if (missing.length) throw new Error(`Не заданы параметры базы: ${missing.join(', ')}`);

const client = new pg.Client();
await client.connect();
try {
  await client.query(await readFile(path.resolve(seedPath), 'utf8'));
  console.log(`Применён seed: ${seedPath}`);
} finally {
  await client.end();
}
