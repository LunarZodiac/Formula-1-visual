export const DEFAULT_OSRM_BASE_URL = 'https://router.project-osrm.org';
export const OSRM_REQUEST_TIMEOUT_MS = 45_000;

export class OsrmTransportError extends Error {}

export function resolveOsrmBaseUrl(value = process.env.OSRM_BASE_URL) {
  const rawValue = String(value ?? DEFAULT_OSRM_BASE_URL).trim();
  let url;
  try {
    url = new URL(rawValue);
  } catch {
    throw new Error('OSRM_BASE_URL должен быть абсолютным HTTP(S)-адресом');
  }
  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new Error('OSRM_BASE_URL должен использовать HTTP или HTTPS');
  }
  if (url.username || url.password) {
    throw new Error('OSRM_BASE_URL не должен содержать логин или пароль');
  }
  if (url.search || url.hash) {
    throw new Error('OSRM_BASE_URL не должен содержать query-параметры или фрагмент');
  }
  url.pathname = url.pathname.replace(/\/+$/, '');
  return url.href.replace(/\/$/, '');
}

export function buildOsrmRequestUrl(baseUrl, service, profile, coordinates, searchParams = {}) {
  const url = new URL(resolveOsrmBaseUrl(baseUrl));
  const coordinateText = coordinates
    .map(([longitude, latitude]) => `${longitude},${latitude}`)
    .join(';');
  url.pathname = `${url.pathname.replace(/\/$/, '')}/${service}/v1/${profile}/${coordinateText}`;
  url.search = new URLSearchParams(searchParams).toString();
  return url;
}

function endpointLabel(baseUrl) {
  const url = new URL(baseUrl);
  return `${url.origin}${url.pathname.replace(/\/$/, '')}`;
}

function osrmTimeoutError(label, timeoutMs, cause) {
  return new OsrmTransportError(`OSRM не ответил за ${Math.ceil(timeoutMs / 1000)} с. Проверьте доступность ${label} и значение OSRM_BASE_URL`, { cause });
}

export async function requestOsrmJson(requestUrl, {
  baseUrl,
  userAgent,
  fetchImpl = fetch,
  timeoutMs = OSRM_REQUEST_TIMEOUT_MS,
} = {}) {
  const resolvedBaseUrl = resolveOsrmBaseUrl(baseUrl);
  const label = endpointLabel(resolvedBaseUrl);
  let response;
  try {
    response = await fetchImpl(requestUrl, {
      headers: { 'User-Agent': userAgent },
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    if (error?.name === 'AbortError' || error?.name === 'TimeoutError') {
      throw osrmTimeoutError(label, timeoutMs, error);
    }
    throw new OsrmTransportError(`OSRM недоступен по адресу ${label}. Проверьте запуск сервиса и значение OSRM_BASE_URL: ${error?.message ?? 'ошибка соединения'}`, { cause: error });
  }
  if (!response.ok) {
    const statusText = response.statusText ? ` ${response.statusText}` : '';
    throw new Error(`OSRM по адресу ${label} ответил HTTP ${response.status}${statusText}. Проверьте профиль, граф маршрутизации и значение OSRM_BASE_URL`);
  }
  try {
    return await response.json();
  } catch (error) {
    if (error?.name === 'AbortError' || error?.name === 'TimeoutError') {
      throw osrmTimeoutError(label, timeoutMs, error);
    }
    if (!(error instanceof SyntaxError)) {
      throw new OsrmTransportError(`Соединение с OSRM по адресу ${label} прервалось при чтении ответа. Проверьте состояние сервиса: ${error?.message ?? 'ошибка соединения'}`, { cause: error });
    }
    throw new Error(`OSRM по адресу ${label} вернул некорректный JSON. Проверьте адрес и состояние сервиса`, { cause: error });
  }
}
