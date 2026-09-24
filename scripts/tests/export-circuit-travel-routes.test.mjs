import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

const exporter = await readFile(path.resolve(import.meta.dirname, '..', 'export-circuit-travel.mjs'), 'utf8');
const routeQuery = exporter.slice(exporter.indexOf("'featureType','route'"), exporter.indexOf(')exported ORDER BY'));

test('публичный маршрут сохраняет редакционное оформление и упорядоченные остановки', () => {
  assert.notEqual(routeQuery.length, 0);
  for (const field of [
    "'color',presentation.line_colour",
    "'lineOffset',presentation.line_offset_px",
    "'visibleByDefault',presentation.visible_by_default",
    "'lifecycle',route.lifecycle",
    "'rationale',presentation.rationale_ru",
    "'highlights',presentation.highlights_ru",
    "'practicalNotes',presentation.practical_notes_ru",
    "'stops',coalesce((SELECT jsonb_agg(coalesce(nullif(btrim(stop.name_ru),''),nullif(btrim(poi.name_ru),''),nullif(btrim(poi.name),''),'Остановка '||stop.sequence) ORDER BY stop.sequence)",
  ]) assert.ok(routeQuery.includes(field), `Отсутствует поле экспорта: ${field}`);
});

test('экспорт маршрута требует публикации, активного состояния и геометрии', () => {
  assert.match(routeQuery, /route\.circuit_id=\$1 AND route\.geometry IS NOT NULL AND route\.review_status='published' AND route\.lifecycle='active'/);
});

test('экспорт проверяет коллекцию до замены публичного файла', () => {
  const audit = exporter.indexOf('auditPublicTravelCollection(collection)');
  const write = exporter.indexOf('await writeFile(temporary');
  assert.ok(audit >= 0 && write > audit);
});
