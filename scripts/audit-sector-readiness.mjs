#!/usr/bin/env node

import pg from 'pg';

const required = ['PGHOST', 'PGPORT', 'PGDATABASE', 'PGUSER', 'PGPASSWORD'];
const missing = required.filter((key) => !process.env[key]);
if (missing.length) throw new Error(`Не заданы параметры PostgreSQL: ${missing.join(', ')}`);

const client = new pg.Client({ application_name: 'f1-atlas-sector-readiness-audit' });
try {
  await client.connect();
  await client.query('BEGIN READ ONLY');
  const result = await client.query(`SELECT l.id, l.circuit_id, l.name, l.review_status,
      CASE WHEN l.centerline IS NULL THEN 'no_centerline'
        WHEN ST_NPoints(l.centerline) < 4 OR ST_Length(ST_Force2D(l.centerline)) = 0 THEN 'degenerate'
        WHEN ABS(ST_X(ST_StartPoint(l.centerline))-ST_X(ST_EndPoint(l.centerline))) >= 1e-7
          OR ABS(ST_Y(ST_StartPoint(l.centerline))-ST_Y(ST_EndPoint(l.centerline))) >= 1e-7 THEN 'open'
        ELSE 'ready' END AS geometry_status,
      COALESCE(f.sector_count,0)::integer AS sector_count
    FROM atlas.track_layouts l
    LEFT JOIN (SELECT layout_id,COUNT(*) AS sector_count FROM atlas.track_features
      WHERE feature_type='sector' GROUP BY layout_id) f ON f.layout_id=l.id
    ORDER BY l.circuit_id,l.id`);
  await client.query('COMMIT');
  const layouts = result.rows.map((row) => ({
    id: row.id, circuitId: row.circuit_id, name: row.name,
    reviewStatus: row.review_status, geometryStatus: row.geometry_status,
    sectorCount: row.sector_count,
  }));
  const summary = {
    total: layouts.length,
    geometryReadyWithoutSectors: layouts.filter((item) => item.geometryStatus === 'ready' && item.sectorCount === 0).length,
    reviewedGeometryWithoutSectors: layouts.filter((item) => item.geometryStatus === 'ready'
      && ['reviewed', 'published'].includes(item.reviewStatus) && item.sectorCount === 0).length,
    alreadySegmented: layouts.filter((item) => item.sectorCount >= 3).length,
    needsGeometryReview: layouts.filter((item) => item.geometryStatus !== 'ready').length,
    partialSectors: layouts.filter((item) => item.sectorCount > 0 && item.sectorCount < 3).length,
  };
  console.log(JSON.stringify({ summary, layouts }, null, 2));
} finally {
  await client.end();
}
