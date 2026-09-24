#!/usr/bin/env node

import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const HELP = `Проверка self-hosted OSRM-профиля без изменения данных.

Использование:
  node scripts/check-osrm-routing.mjs --url <OSRM_URL> --mode <driving|foot|bicycle> --input <coordinates.json>
  node scripts/check-osrm-routing.mjs --url <OSRM_URL> --mode <driving|foot|bicycle> --coordinates-json '<JSON>'

Формат JSON (от 2 до 20 точек, порядок: долгота, широта):
  [[<longitude>, <latitude>], [<longitude>, <latitude>]]
  {"coordinates":[[<longitude>, <latitude>], [<longitude>, <latitude>]]}

Скрипт выполняет ровно один GET-запрос и только печатает результат.
Важно: сегмент режима в URL выбирает endpoint, но не доказывает,
что граф OSRM был предварительно обработан соответствующим профилем.`;

function fail(message) {
  throw new Error(message);
}

export function parseArguments(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--help' || argument === '-h') return { help: true };
    if (!['--url', '--mode', '--input', '--coordinates-json'].includes(argument)) {
      fail(`Неизвестный аргумент: ${argument}`);
    }
    const value = argv[index + 1];
    if (!value || value.startsWith('--')) fail(`Не задано значение для ${argument}`);
    options[argument.slice(2)] = value;
    index += 1;
  }

  if (!options.url) fail('Обязателен аргумент --url');
  if (!['driving', 'foot', 'bicycle'].includes(options.mode)) fail('--mode должен быть driving, foot или bicycle');
  if (Boolean(options.input) === Boolean(options['coordinates-json'])) {
    fail('Задайте ровно один источник координат: --input или --coordinates-json');
  }
  return options;
}

export function validateCoordinates(document) {
  const coordinates = Array.isArray(document) ? document : document?.coordinates;
  if (!Array.isArray(coordinates) || coordinates.length < 2 || coordinates.length > 20) {
    fail('JSON должен содержать от 2 до 20 координат');
  }

  return coordinates.map((coordinate, index) => {
    if (!Array.isArray(coordinate) || coordinate.length !== 2) {
      fail(`Координата ${index + 1} должна быть парой [долгота, широта]`);
    }
    const [longitude, latitude] = coordinate;
    if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
      fail(`Некорректная долгота в координате ${index + 1}`);
    }
    if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) {
      fail(`Некорректная широта в координате ${index + 1}`);
    }
    return [longitude, latitude];
  });
}

export function buildRouteUrl(baseUrl, mode, coordinates) {
  let url;
  try {
    url = new URL(baseUrl);
  } catch {
    fail('--url должен быть абсолютным HTTP(S)-адресом');
  }
  if (!['http:', 'https:'].includes(url.protocol)) fail('--url должен использовать HTTP или HTTPS');
  url.pathname = `${url.pathname.replace(/\/$/, '')}/route/v1/${mode}/${coordinates
    .map(([longitude, latitude]) => `${longitude},${latitude}`)
    .join(';')}`;
  url.search = new URLSearchParams({ alternatives: 'false', overview: 'full', geometries: 'geojson' });
  return url;
}

export function validateRouteResponse(payload) {
  if (payload?.code !== 'Ok') fail(`OSRM вернул код ${payload?.code ?? 'без кода'}`);
  const route = payload.routes?.[0];
  if (!route) fail('OSRM не вернул маршрут');
  if (!Number.isFinite(route.distance) || route.distance <= 0) fail('Некорректная дистанция маршрута');
  if (!Number.isFinite(route.duration) || route.duration <= 0) fail('Некорректное время маршрута');
  if (route.geometry?.type !== 'LineString' || !Array.isArray(route.geometry.coordinates)
    || route.geometry.coordinates.length < 2) {
    fail('OSRM не вернул корректную GeoJSON LineString-геометрию');
  }
  const geometryCoordinates = route.geometry.coordinates.map((coordinate) => {
    if (!Array.isArray(coordinate) || coordinate.length < 2) {
      fail('Геометрия OSRM содержит некорректную координату');
    }
    const [longitude, latitude] = coordinate;
    if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180
      || !Number.isFinite(latitude) || latitude < -90 || latitude > 90) {
      fail('Геометрия OSRM содержит координату вне допустимых границ');
    }
    return [longitude, latitude];
  });
  const [firstLongitude, firstLatitude] = geometryCoordinates[0];
  if (!geometryCoordinates.some(([longitude, latitude]) => (
    longitude !== firstLongitude || latitude !== firstLatitude
  ))) {
    fail('Геометрия OSRM должна содержать минимум две разные точки');
  }
  return route;
}

export async function checkRoute({ baseUrl, mode, coordinates, fetchImpl = fetch }) {
  const requestUrl = buildRouteUrl(baseUrl, mode, coordinates);
  let response;
  try {
    response = await fetchImpl(requestUrl, {
      headers: { accept: 'application/json' },
      signal: AbortSignal.timeout(10_000),
    });
  } catch (error) {
    if (error?.name === 'TimeoutError' || error?.name === 'AbortError') fail('OSRM не ответил за 10 секунд');
    fail(`Не удалось подключиться к OSRM: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (!response.ok) fail(`OSRM ответил HTTP ${response.status}`);
  let payload;
  try {
    payload = await response.json();
  } catch (error) {
    if (error?.name === 'TimeoutError' || error?.name === 'AbortError') fail('OSRM не ответил за 10 секунд');
    fail('Ответ OSRM не является JSON');
  }
  const route = validateRouteResponse(payload);
  return {
    ok: true,
    mode,
    waypointCount: coordinates.length,
    distanceMeters: route.distance,
    durationSeconds: route.duration,
    geometry: { type: route.geometry.type, coordinateCount: route.geometry.coordinates.length },
    graphProfileVerified: false,
    warning: 'Конфигурация профиля предварительно обработанного графа OSRM не проверена',
  };
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  if (options.help) {
    console.log(HELP);
    return;
  }
  const rawJson = options.input
    ? await readFile(options.input, 'utf8')
    : options['coordinates-json'];
  let document;
  try {
    document = JSON.parse(rawJson);
  } catch {
    fail('Не удалось разобрать JSON с координатами');
  }
  const coordinates = validateCoordinates(document);
  const report = await checkRoute({ baseUrl: options.url, mode: options.mode, coordinates });
  console.log(JSON.stringify(report));
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(JSON.stringify({ ok: false, error: error.message }));
    process.exitCode = 1;
  });
}
