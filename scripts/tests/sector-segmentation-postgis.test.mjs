import assert from 'node:assert/strict';
import test from 'node:test';
import pg from 'pg';

const configured = ['PGHOST', 'PGPORT', 'PGDATABASE', 'PGUSER', 'PGPASSWORD'].every(key => process.env[key]);

test('PostGIS rotates a real closed centerline and splits it into three continuous sectors without writes',
  { skip: configured ? false : 'Нужна локальная тестовая PostGIS-конфигурация' }, async () => {
    const pool = new pg.Pool({ max: 1, connectionTimeoutMillis: 3000 });
    try {
      const layout = await pool.query(`SELECT id FROM atlas.track_layouts
        WHERE centerline IS NOT NULL AND ST_IsClosed(ST_Force2D(centerline))
        ORDER BY id LIMIT 1`);
      assert.ok(layout.rows.length, 'Нужна хотя бы одна замкнутая конфигурация');
      const result = await pool.query(`WITH line AS (
        SELECT ST_Force2D(centerline) AS original FROM atlas.track_layouts WHERE id=$1
      ), anchors AS (
        SELECT original,ST_LineInterpolatePoint(original,0.2) AS start_point,
          ST_LineInterpolatePoint(original,0.4) AS a,ST_LineInterpolatePoint(original,0.7) AS b FROM line
      ), start_location AS (
        SELECT original,a,b,ST_LineLocatePoint(original,start_point) AS start_fraction FROM anchors
      ), rotated AS (
        SELECT ST_MakeLine(ST_LineSubstring(original,start_fraction,1),
          ST_LineSubstring(original,0,start_fraction)) AS g,a,b FROM start_location
      ), located AS (
        SELECT g,ST_LineLocatePoint(g,a) AS f1,ST_LineLocatePoint(g,b) AS f2 FROM rotated
      ), sectors AS (
        SELECT g,ST_LineSubstring(g,0,f1) AS s1,ST_LineSubstring(g,f1,f2) AS s2,
          ST_LineSubstring(g,f2,1) AS s3 FROM located
      ) SELECT ST_IsClosed(g) AS closed,ST_NPoints(s1) AS points1,ST_NPoints(s2) AS points2,
        ST_NPoints(s3) AS points3,ST_Equals(ST_EndPoint(s1),ST_StartPoint(s2)) AS join1,
        ST_Equals(ST_EndPoint(s2),ST_StartPoint(s3)) AS join2,
        ST_Equals(ST_EndPoint(s3),ST_StartPoint(s1)) AS closes FROM sectors`, [layout.rows[0].id]);
      const row = result.rows[0];
      assert.equal(row.closed, true);
      assert.ok(row.points1 >= 2 && row.points2 >= 2 && row.points3 >= 2);
      assert.equal(row.join1, true);
      assert.equal(row.join2, true);
      assert.equal(row.closes, true);
    } finally { await pool.end(); }
  });
