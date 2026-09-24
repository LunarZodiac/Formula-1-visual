import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeTravelRouteStop, travelRouteStopsChanged } from '../lib/travel-route-stop-fingerprint.mjs';

const stop = (value, sequence = 1) => normalizeTravelRouteStop(value, sequence);
const point = { poiId: 'poi-a', nameRu: 'Поворот', instructionRu: 'Идите прямо', dwellMinutes: 5, longitude: null, latitude: null };

test('unchanged stops survive text trimming and POI coordinates in the editor payload', () => {
  const previous = [stop(point)];
  const submitted = [stop({ ...point, poiId: ' poi-a ', nameRu: ' Поворот ', instructionRu: 'Идите прямо ', longitude: 10, latitude: 20 })];
  assert.equal(travelRouteStopsChanged(previous, submitted), false);
});

test('POI, standalone location, text, dwell, order, and removal each change stops', () => {
  const first = stop(point, 1);
  const second = stop({ poiId: null, nameRu: 'Смотровая', instructionRu: null, dwellMinutes: null, longitude: 1, latitude: 2 }, 2);
  const previous = [first, second];
  const changes = [
    [stop({ ...point, poiId: 'poi-b' }, 1), second],
    [first, stop({ poiId: null, nameRu: 'Смотровая', instructionRu: null, dwellMinutes: null, longitude: 1.1, latitude: 2 }, 2)],
    [stop({ ...point, nameRu: 'Новый поворот' }, 1), second],
    [stop({ ...point, instructionRu: 'Поверните' }, 1), second],
    [stop({ ...point, dwellMinutes: 6 }, 1), second],
    [stop({ ...second, sequence: undefined }, 1), stop({ ...first, sequence: undefined }, 2)],
    [first],
  ];
  for (const next of changes) assert.equal(travelRouteStopsChanged(previous, next), true);
});

test('empty lists compare equal and invalid standalone coordinates are rejected', () => {
  assert.equal(travelRouteStopsChanged([], []), false);
  assert.throws(() => stop({ poiId: null, longitude: null, latitude: 2, dwellMinutes: null }), /Некорректная остановка/);
});
