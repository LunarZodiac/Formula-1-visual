import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DEFAULT_OSRM_BASE_URL,
  OsrmTransportError,
  buildOsrmRequestUrl,
  requestOsrmJson,
  resolveOsrmBaseUrl,
} from './osrm-routing-client.mjs';

test('OSRM base URL defaults to the existing public router and preserves a path prefix', () => {
  assert.equal(resolveOsrmBaseUrl(null), DEFAULT_OSRM_BASE_URL);
  assert.equal(resolveOsrmBaseUrl(' http://router.invalid/osrm/// '), 'http://router.invalid/osrm');
  const url = buildOsrmRequestUrl('http://router.invalid/osrm/', 'route', 'driving', [[1, 2], [3, 4]], {
    overview: 'full', geometries: 'geojson',
  });
  assert.equal(url.pathname, '/osrm/route/v1/driving/1,2;3,4');
  assert.equal(url.searchParams.get('overview'), 'full');
  assert.equal(url.searchParams.get('geometries'), 'geojson');
});

test('OSRM base URL rejects unsafe or ambiguous values', () => {
  assert.throws(() => resolveOsrmBaseUrl('router.invalid'), /абсолютным/);
  assert.throws(() => resolveOsrmBaseUrl('ftp://router.invalid'), /HTTP или HTTPS/);
  assert.throws(() => resolveOsrmBaseUrl('http://user:secret@router.invalid'), /логин или пароль/);
  assert.throws(() => resolveOsrmBaseUrl('http://router.invalid?token=secret'), /query-параметры/);
});

test('OSRM request returns JSON through an injected fetch without external calls', async () => {
  let received;
  const payload = await requestOsrmJson(new URL('http://router.invalid/route'), {
    baseUrl: 'http://router.invalid',
    userAgent: 'test',
    fetchImpl: async (url, options) => {
      received = { url: String(url), options };
      return { ok: true, json: async () => ({ code: 'Ok' }) };
    },
  });
  assert.deepEqual(payload, { code: 'Ok' });
  assert.equal(received.url, 'http://router.invalid/route');
  assert.equal(received.options.headers['User-Agent'], 'test');
  assert.ok(received.options.signal instanceof AbortSignal);
});

test('OSRM request reports timeout and unavailable service with actionable context', async () => {
  await assert.rejects(requestOsrmJson(new URL('http://router.invalid/route'), {
    baseUrl: 'http://router.invalid', timeoutMs: 1_500,
    fetchImpl: async () => { const error = new Error('expired'); error.name = 'TimeoutError'; throw error; },
  }), (error) => error instanceof OsrmTransportError && /не ответил за 2 с.*OSRM_BASE_URL/.test(error.message));
  await assert.rejects(requestOsrmJson(new URL('http://router.invalid/route'), {
    baseUrl: 'http://router.invalid',
    fetchImpl: async () => { throw new TypeError('fetch failed'); },
  }), /недоступен.*запуск сервиса.*OSRM_BASE_URL.*fetch failed/);
});

test('OSRM request explains HTTP and malformed JSON failures', async () => {
  await assert.rejects(requestOsrmJson(new URL('http://router.invalid/route'), {
    baseUrl: 'http://router.invalid',
    fetchImpl: async () => ({ ok: false, status: 503, statusText: 'Unavailable' }),
  }), /HTTP 503 Unavailable.*профиль.*OSRM_BASE_URL/);
  await assert.rejects(requestOsrmJson(new URL('http://router.invalid/route'), {
    baseUrl: 'http://router.invalid',
    fetchImpl: async () => ({ ok: true, json: async () => { throw new SyntaxError('bad json'); } }),
  }), /некорректный JSON/);
  await assert.rejects(requestOsrmJson(new URL('http://router.invalid/route'), {
    baseUrl: 'http://router.invalid', timeoutMs: 1_500,
    fetchImpl: async () => ({ ok: true, json: async () => {
      const error = new Error('expired while reading'); error.name = 'TimeoutError'; throw error;
    } }),
  }), /не ответил за 2 с.*OSRM_BASE_URL/);
});
