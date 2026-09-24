import assert from 'node:assert/strict';
import test from 'node:test';
import { auditPublicTravelCollection } from '../lib/audit-public-travel.mjs';

const route = (overrides = {}) => ({
  type: 'Feature',
  geometry: { type: 'LineString', coordinates: [[5, 50], [5.1, 50.1]] },
  properties: {
    id: 'sample-route', featureType: 'route', reviewStatus: 'published', lifecycle: 'active',
    distanceM: 15000, durationMinutes: 30, stops: ['Начало', 'Финиш'],
    minZoom: 6, maxZoom: 15, visibleByDefault: false, color: '#e51b36', lineOffset: 0, ...overrides,
  },
});

test('проверенный публичный маршрут проходит аудит без реальных координат', () => {
  const result = auditPublicTravelCollection({ type: 'FeatureCollection', properties: { counts: { poi: 0, zones: 0, routes: 1 } }, features: [route()] });
  assert.deepEqual(result, { counts: { poi: 0, zones: 0, routes: 1 }, issues: [] });
});

test('аудит не допускает кандидата, некорректную линию и ложный счётчик', () => {
  const sample = route({ reviewStatus: 'candidate', lifecycle: 'draft', minZoom: 18, maxZoom: 12, color: 'red' });
  sample.geometry.coordinates = [[5, 50], [5, 50]];
  const result = auditPublicTravelCollection({ type: 'FeatureCollection', properties: { counts: { routes: 0 } }, features: [sample] });
  assert.ok(result.issues.some((issue) => issue.includes('неопубликованный маршрут')));
  assert.ok(result.issues.some((issue) => issue.includes('неактивный маршрут')));
  assert.ok(result.issues.some((issue) => issue.includes('некорректная линия')));
  assert.ok(result.issues.some((issue) => issue.includes('диапазон масштаба')));
  assert.ok(result.issues.some((issue) => issue.includes('оформление линии')));
  assert.ok(result.issues.some((issue) => issue.includes('Счётчик routes')));
});

test('аудит отклоняет пустую или незамкнутую туристическую зону', () => {
  const zone = (geometry) => ({ type: 'Feature', geometry, properties: { id: 'zone-1', featureType: 'accommodation_zone', reviewStatus: 'published' } });
  for (const geometry of [
    { type: 'MultiPolygon', coordinates: [] },
    { type: 'Polygon', coordinates: [[[5, 50], [5.1, 50], [5.1, 50.1], [5, 50.1]]] },
  ]) {
    const result = auditPublicTravelCollection({ type: 'FeatureCollection', features: [zone(geometry)] });
    assert.ok(result.issues.some((issue) => issue.includes('полигональную геометрию')));
  }
  const valid = auditPublicTravelCollection({ type: 'FeatureCollection', features: [zone({ type: 'Polygon', coordinates: [[[5, 50], [5.1, 50], [5, 50.1], [5, 50]]] })] });
  assert.deepEqual(valid.issues, []);
});
