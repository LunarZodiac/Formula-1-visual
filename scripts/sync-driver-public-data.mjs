#!/usr/bin/env node

import pg from 'pg';
import { syncDriverPublicData } from './lib/driver-public-sync.mjs';

const required = ['PGHOST', 'PGPORT', 'PGDATABASE', 'PGUSER', 'PGPASSWORD'];
const missing = required.filter((name) => !process.env[name]);
if (missing.length) throw new Error(`Не заданы параметры базы: ${missing.join(', ')}`);
const driverId = process.argv[2]?.trim();
if (!driverId || !/^[A-Za-z0-9_-]+$/.test(driverId)) {
  throw new Error('Укажите ID пилота: node --env-file=.env.database.local scripts/sync-driver-public-data.mjs <driver-id>');
}

const client = new pg.Client({ application_name: 'f1-atlas-driver-public-sync' });
await client.connect();
try {
  const result = await syncDriverPublicData(client, driverId);
  console.log(JSON.stringify({ driverId, ...result }, null, 2));
} finally {
  await client.end();
}
