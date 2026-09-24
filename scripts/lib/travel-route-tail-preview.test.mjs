import assert from 'node:assert/strict';
import test from 'node:test';

import {
  cumulativeLineLengthsMetres,
  haversineDistanceMetres,
  mergeRoutedTail,
  nearestLineStringEndpoint,
  prepareRouteTailReplacement,
  validateCoordinate,
  validateLineString,
} from './travel-route-tail-preview.mjs';

const lineString = {
  type: 'LineString',
  coordinates: [
    [0, 0],
    [0.005, 0],
    [0.01, 0],
    [0.015, 0],
    [0.02, 0],
  ],
};

test('replaces the end tail and keeps inputs immutable', () => {
  const originalSnapshot = structuredClone(lineString);
  const target = [0.021, 0.001];
  const preparation = prepareRouteTailReplacement(lineString, target);

  assert.equal(preparation.side, 'end');
  assert.deepEqual(preparation.routingCoordinates, [preparation.spliceCoordinate, target]);
  const routedTail = {
    type: 'LineString',
    coordinates: [preparation.spliceCoordinate, [0.019, 0.0005], target],
  };
  const result = mergeRoutedTail(preparation, routedTail);

  assert.deepEqual(result.lineString.coordinates.at(-1), target);
  assert.equal(result.lineString.coordinates.filter((coordinate) => (
    coordinate[0] === preparation.spliceCoordinate[0] && coordinate[1] === preparation.spliceCoordinate[1]
  )).length, 1);
  assert.equal(result.metrics.seamGapMetres, 0);
  assert.equal(result.metrics.endpointDistanceMetres, 0);
  assert.ok(result.metrics.replacedOldMetres > 0);
  assert.ok(result.metrics.replacedNewMetres > 0);
  assert.deepEqual(lineString, originalSnapshot);
});

test('replaces the start tail with target-to-splice routing order', () => {
  const target = [-0.001, 0.001];
  const preparation = prepareRouteTailReplacement(lineString, target);

  assert.equal(preparation.side, 'start');
  assert.deepEqual(preparation.routingCoordinates, [target, preparation.spliceCoordinate]);
  const routedTail = {
    type: 'LineString',
    coordinates: [target, [0.002, 0.0005], preparation.spliceCoordinate],
  };
  const routedSnapshot = structuredClone(routedTail);
  const result = mergeRoutedTail(preparation, routedTail);

  assert.deepEqual(result.lineString.coordinates[0], target);
  assert.deepEqual(result.lineString.coordinates.at(-1), lineString.coordinates.at(-1));
  assert.equal(result.lineString.coordinates.filter((coordinate) => (
    coordinate[0] === preparation.spliceCoordinate[0] && coordinate[1] === preparation.spliceCoordinate[1]
  )).length, 1);
  assert.equal(result.metrics.seamGapMetres, 0);
  assert.equal(result.metrics.endpointDistanceMetres, 0);
  assert.deepEqual(routedTail, routedSnapshot);
});

test('keeps a displaced routing seam visible and reports its gap', () => {
  const target = [0.021, 0.001];
  const preparation = prepareRouteTailReplacement(lineString, target);
  const displacedSplice = [preparation.spliceCoordinate[0], preparation.spliceCoordinate[1] + 0.0001];
  const result = mergeRoutedTail(preparation, {
    type: 'LineString',
    coordinates: [displacedSplice, target],
  });

  assert.ok(result.metrics.seamGapMetres > 0);
  assert.deepEqual(result.lineString.coordinates[preparation.spliceIndex], preparation.spliceCoordinate);
  assert.deepEqual(result.lineString.coordinates[preparation.spliceIndex + 1], displacedSplice);
});

test('rejects malformed road-line coordinates before preparing a preview', () => {
  const invalidLines = [
    null,
    { type: 'Point', coordinates: [0, 0] },
    { type: 'LineString', coordinates: [[0, 0]] },
    { type: 'LineString', coordinates: [[0, 0], [1]] },
    { type: 'LineString', coordinates: [[0, 0], [Number.NaN, 1]] },
    { type: 'LineString', coordinates: [[0, 0], [181, 1]] },
    { type: 'LineString', coordinates: [[0, 0], [1, -91]] },
  ];

  for (const invalidLine of invalidLines) {
    assert.throws(() => prepareRouteTailReplacement(invalidLine, [0, 0]));
  }
  assert.throws(() => prepareRouteTailReplacement(lineString, [0]), /targetCoordinate/);
  assert.throws(() => prepareRouteTailReplacement(lineString, [0, Infinity]), /targetCoordinate/);
  assert.throws(() => prepareRouteTailReplacement(lineString, [-181, 0]), /targetCoordinate/);
});

test('accepts longitude and latitude boundary values without mutating them', () => {
  const boundaryLine = {
    type: 'LineString',
    coordinates: [[-180, -90], [180, 90]],
  };

  assert.deepEqual(validateCoordinate([-180, 90]), [-180, 90]);
  assert.deepEqual(validateCoordinate([180, -90]), [180, -90]);
  assert.deepEqual(validateLineString(boundaryLine), boundaryLine);
  assert.notEqual(validateLineString(boundaryLine), boundaryLine);
});

test('handles a two-point route and removes a duplicate splice coordinate', () => {
  const twoPointLine = { type: 'LineString', coordinates: [[0, 0], [0.01, 0]] };
  const target = [0.011, 0];
  const preparation = prepareRouteTailReplacement(twoPointLine, target);

  assert.equal(preparation.side, 'end');
  assert.equal(preparation.spliceIndex, 0);
  const result = mergeRoutedTail(preparation, {
    type: 'LineString',
    coordinates: [preparation.spliceCoordinate, target],
  });

  assert.deepEqual(result.lineString.coordinates, [[0, 0], target]);
  assert.equal(result.metrics.seamGapMetres, 0);
  assert.equal(result.metrics.endpointDistanceMetres, 0);
});

test('uses the start endpoint on an exact distance tie', () => {
  const symmetricLine = { type: 'LineString', coordinates: [[-1, 0], [1, 0]] };
  const endpoint = nearestLineStringEndpoint(symmetricLine, [0, 0]);

  assert.equal(endpoint.side, 'start');
  assert.equal(endpoint.index, 0);
  assert.ok(Math.abs(endpoint.startDistanceMetres - endpoint.endDistanceMetres) < 1e-9);
});

test('keeps zero-length route metrics finite', () => {
  const stationaryLine = { type: 'LineString', coordinates: [[10, 20], [10, 20]] };
  const preparation = prepareRouteTailReplacement(stationaryLine, [10, 20]);
  const result = mergeRoutedTail(preparation, stationaryLine);

  assert.deepEqual(cumulativeLineLengthsMetres(stationaryLine), [0, 0]);
  assert.equal(haversineDistanceMetres([10, 20], [10, 20]), 0);
  assert.equal(preparation.metrics.totalMetres, 0);
  assert.equal(result.metrics.newTotalMetres, 0);
  assert.ok(Object.values(result.metrics).every(Number.isFinite));
});

test('reports routed endpoint displacement instead of hiding it', () => {
  const target = [0.021, 0.001];
  const preparation = prepareRouteTailReplacement(lineString, target);
  const displacedTarget = [target[0] + 0.0001, target[1]];
  const result = mergeRoutedTail(preparation, {
    type: 'LineString',
    coordinates: [preparation.spliceCoordinate, displacedTarget],
  });

  assert.ok(result.metrics.endpointDistanceMetres > 0);
  assert.deepEqual(result.lineString.coordinates.at(-1), displacedTarget);
});

test('rejects invalid merge inputs and an out-of-range splice index', () => {
  const preparation = prepareRouteTailReplacement(lineString, [0.021, 0.001]);

  assert.throws(() => mergeRoutedTail(null, lineString), /preparation/);
  assert.throws(() => mergeRoutedTail(preparation, { type: 'LineString', coordinates: [[0, 0]] }), /at least two/);
  assert.throws(() => mergeRoutedTail({ ...preparation, spliceIndex: lineString.coordinates.length }, lineString), /spliceIndex/);
});
