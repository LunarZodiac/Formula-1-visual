import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import test from 'node:test';
import {
  buildRouteUrl,
  checkRoute,
  parseArguments,
  validateCoordinates,
  validateRouteResponse,
} from '../check-osrm-routing.mjs';

test('CLI accepts only one JSON source and supported profiles', () => {
  assert.deepEqual(parseArguments([
    '--url', 'http://router.invalid', '--mode', 'foot', '--input', 'coordinates.json',
  ]), { url: 'http://router.invalid', mode: 'foot', input: 'coordinates.json' });
  assert.equal(parseArguments([
    '--url', 'http://router.invalid', '--mode', 'driving', '--input', 'coordinates.json',
  ]).mode, 'driving');
  assert.throws(() => parseArguments([
    '--url', 'http://router.invalid', '--mode', 'car', '--input', 'coordinates.json',
  ]), /driving, foot или bicycle/);
});

test('checkRoute bounds its request and reports a connection timeout', async () => {
  await assert.rejects(checkRoute({
    baseUrl: 'http://router.invalid', mode: 'driving', coordinates: [[1, 2], [3, 4]],
    fetchImpl: async (_url, options) => {
      assert.ok(options.signal instanceof AbortSignal);
      const error = new Error('expired');
      error.name = 'TimeoutError';
      throw error;
    },
  }), /не ответил за 10 секунд/);
});

test('coordinate input is bounded and structurally validated', () => {
  assert.deepEqual(validateCoordinates({ coordinates: [[-180, -90], [180, 90]] }), [
    [-180, -90], [180, 90],
  ]);
  assert.throws(() => validateCoordinates([[0, 0]]), /от 2 до 20/);
  assert.throws(() => validateCoordinates([[0, 0], [181, 0]]), /долгота/);
});

test('route URL selects the requested OSRM profile and GeoJSON geometry', () => {
  const url = buildRouteUrl('http://router.invalid/osrm/', 'bicycle', [[-180, -90], [180, 90]]);
  assert.equal(url.pathname, '/osrm/route/v1/bicycle/-180,-90;180,90');
  assert.equal(url.searchParams.get('geometries'), 'geojson');
  assert.equal(url.searchParams.get('overview'), 'full');
});

test('response validation rejects incomplete routes', () => {
  assert.throws(() => validateRouteResponse({ code: 'NoRoute' }), /NoRoute/);
  assert.throws(() => validateRouteResponse({
    code: 'Ok', routes: [{ distance: 1, duration: 1, geometry: null }],
  }), /LineString/);
  assert.throws(() => validateRouteResponse({
    code: 'Ok',
    routes: [{
      distance: 1,
      duration: 1,
      geometry: { type: 'LineString', coordinates: [[0, 0], [0, 0]] },
    }],
  }), /две разные точки/);
  assert.throws(() => validateRouteResponse({
    code: 'Ok',
    routes: [{
      distance: 1,
      duration: 1,
      geometry: { type: 'LineString', coordinates: [[0, 0], [181, 0]] },
    }],
  }), /границ/);
});

test('checkRoute makes one request to a local mock OSRM and returns a compact report', async (t) => {
  let requestCount = 0;
  const server = createServer((request, response) => {
    requestCount += 1;
    assert.match(request.url, /^\/route\/v1\/foot\//);
    response.setHeader('content-type', 'application/json');
    response.end(JSON.stringify({
      code: 'Ok',
      routes: [{
        distance: 1,
        duration: 1,
        geometry: { type: 'LineString', coordinates: [[-180, -90], [180, 90]] },
      }],
    }));
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())));
  const address = server.address();

  const report = await checkRoute({
    baseUrl: `http://127.0.0.1:${address.port}`,
    mode: 'foot',
    coordinates: [[-180, -90], [180, 90]],
  });

  assert.equal(requestCount, 1);
  assert.deepEqual(report, {
    ok: true,
    mode: 'foot',
    waypointCount: 2,
    distanceMeters: 1,
    durationSeconds: 1,
    geometry: { type: 'LineString', coordinateCount: 2 },
    graphProfileVerified: false,
    warning: 'Конфигурация профиля предварительно обработанного графа OSRM не проверена',
  });
});
