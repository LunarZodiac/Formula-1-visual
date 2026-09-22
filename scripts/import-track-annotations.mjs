import { readFile } from 'node:fs/promises';
import pg from 'pg';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const TYPES = new Map([
  ['turn', 'Point'], ['timing_line', 'Point'], ['drs_detection', 'Point'],
  ['sector', 'LineString'], ['straight', 'LineString'], ['drs_zone', 'LineString'],
]);

function fail(message) { throw new Error(message); }
function year(value, field, index) {
  if (value === undefined || value === null || value === '') return null;
  if (!Number.isInteger(value) || value < 1900 || value > 2100) fail(`feature ${index}: ${field} должен быть годом 1900–2100`);
  return value;
}
function validCoordinate(c) { return Array.isArray(c) && c.length >= 2 && Number.isFinite(c[0]) && Number.isFinite(c[1]) && c[0] >= -180 && c[0] <= 180 && c[1] >= -90 && c[1] <= 90; }
function validateGeometry(geometry, expected, index) {
  if (!geometry || geometry.type !== expected) fail(`feature ${index}: geometry должен быть ${expected}`);
  const coordinates = geometry.coordinates;
  if (expected === 'Point' && !validCoordinate(coordinates)) fail(`feature ${index}: некорректная точка`);
  if (expected === 'LineString' && (!Array.isArray(coordinates) || coordinates.length < 2 || coordinates.length > 10000 || !coordinates.every(validCoordinate))) fail(`feature ${index}: LineString должен содержать от 2 до 10 000 корректных координат`);
  return geometry;
}

export function validateTrackAnnotationPackage(input) {
  if (!input || input.type !== 'FeatureCollection' || !Array.isArray(input.features)) fail('Ожидается GeoJSON FeatureCollection');
  for (const key of ['circuitId', 'layoutId', 'sourceUrl', 'sourceName']) if (typeof input[key] !== 'string' || !input[key].trim()) fail(`Отсутствует обязательное поле коллекции: ${key}`);
  if (!/^[A-Za-z0-9_-]+$/.test(input.circuitId) || !/^[A-Za-z0-9_-]+$/.test(input.layoutId)) fail('circuitId и layoutId содержат недопустимые символы');
  try { const url = new URL(input.sourceUrl); if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) fail('sourceUrl должен быть публичным http/https URL без credentials'); } catch (error) { if (error.message.includes('sourceUrl')) throw error; fail('sourceUrl должен быть корректным URL'); }
  const seen = new Set();
  const features = input.features.map((feature, index) => {
    if (!feature || feature.type !== 'Feature' || !feature.properties || typeof feature.properties !== 'object') fail(`feature ${index}: некорректный Feature`);
    const p = feature.properties;
    for (const key of ['id', 'annotationType']) if (typeof p[key] !== 'string' || !p[key].trim()) fail(`feature ${index}: отсутствует ${key}`);
    if (!/^[A-Za-z0-9_-]+$/.test(p.id)) fail(`feature ${index}: ID содержит недопустимые символы`);
    if (!TYPES.has(p.annotationType)) fail(`feature ${index}: неизвестный annotationType`);
    if (seen.has(p.id)) fail(`Дублирующийся ID: ${p.id}`); seen.add(p.id);
    if (p.labelRu == null && p.labelOriginal == null && p.sequence == null) fail(`feature ${index}: нужен labelRu, labelOriginal или sequence`);
    if (p.sequence != null && (!Number.isInteger(p.sequence) || p.sequence < 1 || p.sequence > 32767)) fail(`feature ${index}: некорректная sequence`);
    const from = year(p.validFromYear, 'validFromYear', index); const to = year(p.validToYear, 'validToYear', index);
    if (from !== null && to !== null && to < from) fail(`feature ${index}: validToYear раньше validFromYear`);
    validateGeometry(feature.geometry, TYPES.get(p.annotationType), index);
    return { ...feature, properties: { ...p, validFromYear: from, validToYear: to } };
  });
  return { ...input, features };
}

export function summarizeTrackAnnotationPackage(input) { return { circuitId: input.circuitId, layoutId: input.layoutId, features: input.features.length, byType: Object.fromEntries([...new Set(input.features.map(f => f.properties.annotationType))].map(t => [t, input.features.filter(f => f.properties.annotationType === t).length])) }; }
export const validateFeatureCollection = validateTrackAnnotationPackage;
export const summary = summarizeTrackAnnotationPackage;

export async function applyTrackAnnotationPackage(data) {
  const pool = new pg.Pool({ max: 2, allowExitOnIdle: true, application_name: 'f1-track-annotation-import' }); const client = await pool.connect();
  const sourceId = `track-annotations-${createHash('sha256').update(data.sourceUrl).digest('hex').slice(0, 16)}`;
  try {
    await client.query('BEGIN');
    const layout = await client.query('SELECT id FROM atlas.track_layouts WHERE id=$1 AND circuit_id=$2 AND centerline IS NOT NULL FOR SHARE', [data.layoutId, data.circuitId]);
    if (!layout.rows.length) fail('Конфигурация не найдена или не имеет centerline');
    await client.query(`INSERT INTO atlas.data_sources(id,name,url,retrieved_at,notes) VALUES($1,$2,$3,now(),'Пакетный импорт разметки трассы') ON CONFLICT(id) DO UPDATE SET name=EXCLUDED.name,url=EXCLUDED.url,retrieved_at=now()`, [sourceId, data.sourceName, data.sourceUrl]);
    for (const feature of data.features) {
      const p = feature.properties;
      const existing = await client.query('SELECT layout_id,review_status FROM atlas.track_layout_annotations WHERE id=$1 FOR UPDATE', [p.id]);
      if (existing.rows.length && existing.rows[0].layout_id !== data.layoutId) fail(`feature ${p.id}: ID уже принадлежит другой конфигурации`);
      if (existing.rows.length && existing.rows[0].review_status !== 'candidate') fail(`feature ${p.id}: пакет не может заменить уже проверенную или скрытую запись`);
      const proximity = await client.query(`WITH input AS (SELECT ST_SetSRID(ST_GeomFromGeoJSON($1),4326) AS geometry), points AS (SELECT (ST_DumpPoints(input.geometry)).geom AS point FROM input) SELECT round(max(ST_Distance(points.point::geography,ST_Force2D(layout.centerline)::geography)))::int AS distance FROM points CROSS JOIN atlas.track_layouts AS layout WHERE layout.id=$2`, [JSON.stringify(feature.geometry), data.layoutId]);
      if (Number(proximity.rows[0]?.distance ?? Infinity) > 2000) fail(`feature ${p.id}: геометрия дальше 2000 м от контура`);
      await client.query(`INSERT INTO atlas.track_layout_annotations(id,layout_id,annotation_type,label_ru,label_original,sequence,description_ru,geometry,valid_from_year,valid_to_year,source_id,review_status) VALUES($1,$2,$3,$4,$5,$6,$7,ST_SetSRID(ST_GeomFromGeoJSON($8),4326)::geography,$9,$10,$11,'candidate') ON CONFLICT(id) DO UPDATE SET layout_id=EXCLUDED.layout_id,annotation_type=EXCLUDED.annotation_type,label_ru=EXCLUDED.label_ru,label_original=EXCLUDED.label_original,sequence=EXCLUDED.sequence,description_ru=EXCLUDED.description_ru,geometry=EXCLUDED.geometry,valid_from_year=EXCLUDED.valid_from_year,valid_to_year=EXCLUDED.valid_to_year,source_id=EXCLUDED.source_id,review_status='candidate',updated_at=now()`, [p.id, data.layoutId, p.annotationType, p.labelRu ?? null, p.labelOriginal ?? null, p.sequence ?? null, p.descriptionRu ?? null, JSON.stringify(feature.geometry), p.validFromYear, p.validToYear, sourceId]);
    }
    await client.query('COMMIT'); return data.features.length;
  } catch (error) { await client.query('ROLLBACK').catch(() => {}); throw error; } finally { client.release(); await pool.end(); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const file = process.argv.find(arg => !arg.startsWith('--') && arg !== process.argv[0] && arg !== process.argv[1]);
  if (!file) { console.error('Использование: node import-track-annotations.mjs FILE [--apply]'); process.exitCode = 2; }
  else try { const data = validateTrackAnnotationPackage(JSON.parse(await readFile(file, 'utf8'))); console.log(JSON.stringify(summarizeTrackAnnotationPackage(data), null, 2)); if (process.argv.includes('--apply')) console.log(`Импортировано: ${await applyTrackAnnotationPackage(data)}`); } catch (error) { console.error(`Ошибка: ${error.message}`); process.exitCode = 1; }
}
