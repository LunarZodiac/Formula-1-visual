#!/usr/bin/env node

import pg from 'pg';
import { syncDriverPublicData } from './lib/driver-public-sync.mjs';
import { databaseConfig } from './lib/database-config.mjs';

const driverId = process.argv[2]?.trim();
if (!driverId || !/^[A-Za-z0-9_-]+$/.test(driverId)) {
  throw new Error('Укажите ID пилота: node --env-file=.env.media.local scripts/sync-driver-public-data.mjs <driver-id>');
}

const client = new pg.Client({
  host: process.env.DATABASE_HOST,
  port: Number(process.env.DATABASE_PORT),
  database: process.env.DATABASE_NAME,
  user: process.env.DATABASE_USER,
  password: process.env.DATABASE_PASSWORD,
  ssl: {
    rejectUnauthorized: false,
  },
  application_name: 'f1-atlas-driver-public-sync',
});
await client.connect();
try {
  const result = await syncDriverPublicData(client, driverId);
  console.log(JSON.stringify({ driverId, ...result }, null, 2));
} finally {
  await client.end();
}
