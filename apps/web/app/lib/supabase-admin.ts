import { env } from 'cloudflare:workers';
import type { AdminEventInput } from './admin-database';

function binding(name: string) {
  const bindings = env as unknown as Record<string, unknown>;
  const value = bindings[name];
  return typeof value === 'string' ? value : process.env[name];
}

function configuration() {
  const url = binding('SUPABASE_URL')?.trim();
  const secret = binding('SUPABASE_SERVICE_ROLE_KEY')?.trim();

  if (!url || !secret) {
    throw new Error('Supabase admin configuration is missing');
  }

  return {
    url: url.replace(/\/$/, ''),
    secret,
  };
}

export function isAdminSupabaseConfigured() {
  return Boolean(
    binding('SUPABASE_URL')?.trim()
    && binding('SUPABASE_SERVICE_ROLE_KEY')?.trim(),
  );
}

async function supabaseResponse(
  table: string,
  query = '',
  init: RequestInit = {},
) {
  const { url, secret } = configuration();
  const method = (init.method ?? 'GET').toUpperCase();
  const isRead = method === 'GET' || method === 'HEAD';

  const response = await fetch(`${url}/rest/v1/${table}${query}`, {
    ...init,
    cache: 'no-store',
    headers: {
      apikey: secret,
      ...(isRead
        ? { 'Accept-Profile': 'atlas' }
        : { 'Content-Profile': 'atlas' }),
      ...(init.body
        ? { 'content-type': 'application/json' }
        : {}),
      ...init.headers,
    },
  });

  if (!response.ok) {
    const details = await response.text();
    throw new Error(`Supabase Data API ${response.status}: ${details}`);
  }

  return response;
}

export async function adminSupabaseRequest<T>(
  table: string,
  query = '',
): Promise<T> {
  const response = await supabaseResponse(table, query);
  return response.json() as Promise<T>;
}

export async function adminSupabaseRpc<T>(name: string, body: Record<string, unknown>): Promise<T> {
  const response = await supabaseResponse(`rpc/${name}`, '', {
    method: 'POST',
    body: JSON.stringify(body),
  });
  return response.json() as Promise<T>;
}

async function adminSupabaseCount(
  table: string,
  query: string,
) {
  const separator = query.includes('?') ? '&' : '?';

  const response = await supabaseResponse(
    table,
    `${query}${separator}select=id&limit=1`,
    {
      headers: {
        Prefer: 'count=exact',
      },
    },
  );

  const contentRange = response.headers.get('content-range');
  if (!contentRange) return 0;

  const total = contentRange.split('/')[1];

  return total === '*' ? 0 : Number(total);
}

type DriverDirectoryRow = {
  id: string;
  name_ru: string;
  name_en: string;
  birth_date: string | null;
  birth_place_ru: string | null;
  death_date: string | null;
  height_cm: string | null;
  weight_kg: string | null;
  source_url: string | null;
  first_season: number | null;
  latest_season: number | null;
  season_count: number | null;
  latest_team: string | null;
  photo_url: string | null;
  has_photo: boolean;
  has_results: boolean;
  unresolved_life_data: boolean;
};

type DriverSummaryRow = {
  database_drivers: number;
  catalog_drivers: number;
  birth_places: number;
  death_dates: number;
  driver_photos: number;
  unresolved_life_data: number;
};

export async function getDirectAdminDashboard({
  limit = 50,
  page = 1,
  query = '',
  filter = '',
}: {
  limit?: number;
  page?: number;
  query?: string;
  filter?: 'unresolved-life-data' | 'missing-photo' | '';
} = {}) {
  const filters = new URLSearchParams();

  filters.set('has_results', 'eq.true');

  if (query) {
    const safeQuery = query.replaceAll(',', ' ');
    filters.set(
      'or',
      `(name_ru.ilike.*${safeQuery}*,name_en.ilike.*${safeQuery}*,id.ilike.*${safeQuery}*)`,
    );
  }

  if (filter === 'unresolved-life-data') {
    filters.set('unresolved_life_data', 'eq.true');
  }

  if (filter === 'missing-photo') {
    filters.set('has_photo', 'eq.false');
  }

  const filterQuery = `?${filters.toString()}`;

  const directoryQuery = new URLSearchParams(filters);
  directoryQuery.set(
    'select',
    'id,name_ru,birth_date,birth_place_ru,death_date,height_cm,weight_kg,source_url,first_season,latest_season,season_count,latest_team,has_photo,photo_url',
  );
  directoryQuery.set('order', 'name_ru.asc,id.asc');
  directoryQuery.set('limit', String(limit));
  directoryQuery.set('offset', String((page - 1) * limit));

  const [rows, summaryRows, filteredCount] = await Promise.all([
    adminSupabaseRequest<DriverDirectoryRow[]>(
      'admin_driver_directory',
      `?${directoryQuery.toString()}`,
    ),
    adminSupabaseRequest<DriverSummaryRow[]>(
      'admin_driver_summary',
      '?select=*',
    ),
    adminSupabaseCount(
      'admin_driver_directory',
      filterQuery,
    ),
  ]);

  const summary = summaryRows[0];

  if (!summary) {
    throw new Error('Supabase не вернул сводку пилотов');
  }

  return {
    rows: rows.map((row) => ({
      id: row.id,
      nameRu: row.name_ru,
      birthDate: row.birth_date,
      birthPlaceRu: row.birth_place_ru,
      deathDate: row.death_date,
      heightCm: row.height_cm,
      weightKg: row.weight_kg,
      sourceUrl: row.source_url,
      firstSeason: Number(row.first_season),
      latestSeason: Number(row.latest_season),
      seasonCount: Number(row.season_count),
      latestTeam: row.latest_team,
      hasPhoto: row.has_photo,
      photoUrl: row.photo_url,
    })),
    summary: {
      catalogDrivers: Number(summary.catalog_drivers),
      databaseDrivers: Number(summary.database_drivers),
      birthPlaces: Number(summary.birth_places),
      deathDates: Number(summary.death_dates),
      driverPhotos: Number(summary.driver_photos),
      unresolvedLifeData: Number(summary.unresolved_life_data),
    },
    filteredCount,
  };
}
type AdminSeasonRow = {
  year: number;
  status: 'planned' | 'active' | 'completed' | 'cancelled';
  rounds_planned: number | null;
  races_available: number;
  source_id: string | null;
  source_url: string | null;
  updated_at: string;
};

export async function getDirectAdminSeasons() {
  const rows = await adminSupabaseRequest<AdminSeasonRow[]>(
    'admin_seasons',
    '?select=*&order=year.desc',
  );

  return rows.map((row) => ({
    year: Number(row.year),
    status: row.status,
    roundsPlanned: row.rounds_planned === null
      ? null
      : Number(row.rounds_planned),
    racesAvailable: Number(row.races_available),
    sourceId: row.source_id,
    sourceUrl: row.source_url,
    updatedAt: row.updated_at,
  }));
}
type DirectAdminSeasonInput = {
  year: number;
  status: 'planned' | 'active' | 'completed' | 'cancelled';
  roundsPlanned: number | null;
  sourceUrl: string;
};

function adminSourceId(sourceUrl: string) {
  let hash = 2166136261;

  for (let index = 0; index < sourceUrl.length; index += 1) {
    hash ^= sourceUrl.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return `admin-${(hash >>> 0).toString(16).padStart(8, '0')}`;
}

export async function saveDirectAdminSeason(
  input: DirectAdminSeasonInput,
  create = false,
) {
  const sourceId = adminSourceId(input.sourceUrl);
  const sourceHost = new URL(input.sourceUrl).hostname;

  await supabaseResponse(
    'data_sources',
    '?on_conflict=id',
    {
      method: 'POST',
      headers: {
        Prefer: 'resolution=merge-duplicates',
      },
      body: JSON.stringify({
        id: sourceId,
        name: sourceHost,
        url: input.sourceUrl,
        retrieved_at: new Date().toISOString(),
        notes: 'Источник сведений о сезоне',
      }),
    },
  );

  if (create) {
    await supabaseResponse(
      'seasons',
      '',
      {
        method: 'POST',
        body: JSON.stringify({
          year: input.year,
          status: input.status,
          rounds_planned: input.roundsPlanned,
          source_id: sourceId,
          updated_at: new Date().toISOString(),
        }),
      },
    );
  } else {
    await supabaseResponse(
      'seasons',
      `?year=eq.${input.year}`,
      {
        method: 'PATCH',
        body: JSON.stringify({
          status: input.status,
          rounds_planned: input.roundsPlanned,
          source_id: sourceId,
          updated_at: new Date().toISOString(),
        }),
      },
    );
  }

  return {
    year: input.year,
    publicDataSynced: false,
  };
}
type AdminEventRow = {
  id: string;
  season_year: number;
  round: number;
  name: string;
  race_date: string | null;
  start_time_utc: string | null;
  status: 'scheduled' | 'live' | 'completed' | 'cancelled' | 'postponed';
  circuit_id: string;
  circuit_name: string;
  layout_id: string | null;
  layout_name: string | null;
  source_url: string | null;
  updated_at: string;
  session_count: number;
  completed_session_count: number;
  result_count: number;
  winner_id: string | null;
  winner_name: string | null;
};

type AdminEventCircuitRow = {
  id: string;
  name: string;
  short_name: string | null;
};

type AdminEventCircuitProfileRow = {
  circuit_id: string;
  name_ru: string | null;
};

function mapAdminEvent(row: AdminEventRow) {
  return {
    id: row.id,
    seasonYear: Number(row.season_year),
    round: Number(row.round),
    name: row.name,
    raceDate: row.race_date,
    startTimeUtc: row.start_time_utc,
    status: row.status,
    circuitId: row.circuit_id,
    circuitName: row.circuit_name,
    layoutId: row.layout_id,
    layoutName: row.layout_name,
    sourceUrl: row.source_url,
    sessionCount: Number(row.session_count),
    completedSessionCount: Number(row.completed_session_count),
    resultCount: Number(row.result_count),
    winner: row.winner_id
      ? { id: row.winner_id, name: row.winner_name ?? row.winner_id }
      : null,
    updatedAt: row.updated_at,
  };
}

export async function getDirectAdminEvent(id: string) {
  if (!/^[A-Za-z0-9_-]+$/.test(id)) return null;

  const query = new URLSearchParams({ select: '*', id: `eq.${id}`, limit: '1' });
  const rows = await adminSupabaseRequest<AdminEventRow[]>(
    'admin_events',
    `?${query.toString()}`,
  );

  return rows[0] ? mapAdminEvent(rows[0]) : null;
}

export async function getDirectAdminEvents({
  page = 1,
  limit = 30,
  season,
  query = '',
  status = '',
  circuit = '',
}: {
  page?: number;
  limit?: number;
  season?: number;
  query?: string;
  status?: string;
  circuit?: string;
} = {}) {
  const filters = new URLSearchParams();
  const safePage = Number.isInteger(page) ? Math.max(1, page) : 1;
  const safeLimit = Number.isInteger(limit) ? Math.min(100, Math.max(1, limit)) : 30;

  if (typeof season === 'number' && Number.isInteger(season) && season >= 1950 && season <= 2100) {
    filters.set('season_year', `eq.${season}`);
  }

  if (['scheduled', 'live', 'completed', 'cancelled', 'postponed'].includes(status)) {
    filters.set('status', `eq.${status}`);
  }

  if (/^[A-Za-z0-9_-]+$/.test(circuit)) {
    filters.set('circuit_id', `eq.${circuit}`);
  }

  const safeQuery = query.trim().slice(0, 120).replace(/[^\p{L}\p{N}\s_-]/gu, ' ').trim();
  if (safeQuery) {
    filters.set(
      'or',
      `(id.ilike.*${safeQuery}*,name.ilike.*${safeQuery}*,circuit_name.ilike.*${safeQuery}*)`,
    );
  }

  const rowsQuery = new URLSearchParams(filters);
  rowsQuery.set('select', '*');
  rowsQuery.set('order', 'season_year.desc,round.asc');
  rowsQuery.set('limit', String(safeLimit));
  rowsQuery.set('offset', String((safePage - 1) * safeLimit));

  const [rows, filteredCount, seasons, circuits, circuitProfiles] = await Promise.all([
    adminSupabaseRequest<AdminEventRow[]>(
      'admin_events',
      `?${rowsQuery.toString()}`,
    ),

    adminSupabaseCount(
      'admin_events',
      `?${filters.toString()}`,
    ),

    adminSupabaseRequest<Array<{ year: number }>>(
      'seasons',
      '?select=year&order=year.desc',
    ),

    adminSupabaseRequest<AdminEventCircuitRow[]>(
      'circuits',
      '?select=id,name,short_name&order=name.asc',
    ),

    adminSupabaseRequest<AdminEventCircuitProfileRow[]>(
      'circuit_page_profiles',
      '?select=circuit_id,name_ru',
    ),
  ]);

  const profileNames = new Map(circuitProfiles.map((row) => [row.circuit_id, row.name_ru]));

  return {
    rows: rows.map(mapAdminEvent),

    filteredCount,
    page: safePage,
    limit: safeLimit,

    seasons: seasons.map((row) => Number(row.year)),

    circuits: circuits.map((row) => ({
      id: row.id,
      name: profileNames.get(row.id) ?? row.short_name ?? row.name,
    })).sort((left, right) => left.name.localeCompare(right.name, 'ru')),
  };
}

type AdminEventLayoutRow = {
  id: string;
  circuit_id: string;
  name: string;
  valid_from_year: number | null;
  valid_to_year: number | null;
  review_status: string;
};

export async function getDirectAdminEventEditorOptions() {
  const [seasons, circuits, profiles, layouts] = await Promise.all([
    adminSupabaseRequest<Array<{ year: number }>>('seasons', '?select=year&order=year.desc'),
    adminSupabaseRequest<AdminEventCircuitRow[]>('circuits', '?select=id,name,short_name'),
    adminSupabaseRequest<AdminEventCircuitProfileRow[]>(
      'circuit_page_profiles',
      '?select=circuit_id,name_ru',
    ),
    adminSupabaseRequest<AdminEventLayoutRow[]>(
      'track_layouts',
      '?select=id,circuit_id,name,valid_from_year,valid_to_year,review_status&order=valid_from_year.asc.nullslast,name.asc',
    ),
  ]);

  const profileNames = new Map(profiles.map((row) => [row.circuit_id, row.name_ru]));
  const layoutsByCircuit = new Map<string, Array<{
    id: string; name: string; validFromYear: number | null;
    validToYear: number | null; reviewStatus: string;
  }>>();

  for (const row of layouts) {
    const circuitLayouts = layoutsByCircuit.get(row.circuit_id) ?? [];
    circuitLayouts.push({
      id: row.id,
      name: row.name,
      validFromYear: row.valid_from_year === null ? null : Number(row.valid_from_year),
      validToYear: row.valid_to_year === null ? null : Number(row.valid_to_year),
      reviewStatus: row.review_status,
    });
    layoutsByCircuit.set(row.circuit_id, circuitLayouts);
  }

  return {
    seasons: seasons.map((row) => Number(row.year)),
    circuits: circuits.map((row) => ({
      id: row.id,
      name: profileNames.get(row.id) ?? row.short_name ?? row.name,
      layouts: layoutsByCircuit.get(row.id) ?? [],
    })).sort((left, right) => left.name.localeCompare(right.name, 'ru')),
  };
}

type AdminEventSessionRow = {
  id: string;
  race_id: string;
  session_type: 'practice_1' | 'practice_2' | 'practice_3' | 'qualifying' | 'sprint_shootout' | 'sprint' | 'race';
  name: string;
  starts_at: string | null;
  ends_at: string | null;
  status: AdminEventRow['status'];
  source_id: string | null;
  updated_at: string;
};

const sessionOrder = [
  'practice_1', 'practice_2', 'practice_3', 'sprint_shootout',
  'sprint', 'qualifying', 'race',
];

export async function getDirectAdminEventSessions(eventId: string) {
  if (!/^[A-Za-z0-9_-]+$/.test(eventId)) return [];

  const query = new URLSearchParams({
    select: 'id,race_id,session_type,name,starts_at,ends_at,status,source_id,updated_at',
    race_id: `eq.${eventId}`,
  });
  const sessions = await adminSupabaseRequest<AdminEventSessionRow[]>(
    'sessions',
    `?${query.toString()}`,
  );
  if (!sessions.length) return [];

  const sessionIds = sessions.map((row) => row.id);
  const sourceIds = [...new Set(sessions.map((row) => row.source_id).filter((id): id is string => id !== null))];
  const [results, sources] = await Promise.all([
    adminSupabaseRequest<Array<{ session_id: string }>>(
      'session_results',
      `?${new URLSearchParams({ select: 'session_id', session_id: `in.(${sessionIds.join(',')})` })}`,
    ),
    sourceIds.length
      ? adminSupabaseRequest<Array<{ id: string; url: string }>>(
          'data_sources',
          `?${new URLSearchParams({ select: 'id,url', id: `in.(${sourceIds.join(',')})` })}`,
        )
      : Promise.resolve([]),
  ]);

  const resultCounts = new Map<string, number>();
  for (const result of results) {
    resultCounts.set(result.session_id, (resultCounts.get(result.session_id) ?? 0) + 1);
  }
  const sourceUrls = new Map(sources.map((row) => [row.id, row.url]));

  return sessions.sort((left, right) => (
    sessionOrder.indexOf(left.session_type) - sessionOrder.indexOf(right.session_type)
  )).map((row) => ({
    id: row.id,
    raceId: row.race_id,
    sessionType: row.session_type,
    name: row.name,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    status: row.status,
    sourceUrl: row.source_id ? sourceUrls.get(row.source_id) ?? null : null,
    resultCount: resultCounts.get(row.id) ?? 0,
    updatedAt: row.updated_at,
  }));
}

export async function saveDirectAdminEvent(input: AdminEventInput, create = false) {
  if (!/^[A-Za-z0-9_-]+$/.test(input.id)) throw new Error('Некорректный ID этапа');
  if (!Number.isInteger(input.seasonYear) || input.seasonYear < 1950 || input.seasonYear > 2100) {
    throw new Error('Некорректный сезон');
  }
  if (!Number.isInteger(input.round) || input.round < 1 || input.round > 40) {
    throw new Error('Некорректный номер этапа');
  }
  if (!input.name.trim()) throw new Error('Название этапа обязательно');
  if (!['scheduled', 'live', 'completed', 'cancelled', 'postponed'].includes(input.status)) {
    throw new Error('Некорректный статус этапа');
  }
  if (!/^[A-Za-z0-9_-]+$/.test(input.circuitId)
    || (input.layoutId && !/^[A-Za-z0-9_-]+$/.test(input.layoutId))) {
    throw new Error('Некорректная трасса или конфигурация');
  }
  if (input.raceDate && !/^\d{4}-\d{2}-\d{2}$/.test(input.raceDate)) {
    throw new Error('Некорректная дата этапа');
  }
  if (input.startTimeUtc && !/^([01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/.test(input.startTimeUtc)) {
    throw new Error('Некорректное время старта');
  }
  if (['live', 'completed'].includes(input.status) && !input.sourceVerified) {
    throw new Error('Для идущего или завершённого этапа подтвердите источник');
  }

  const sourceUrl = new URL(input.sourceUrl);
  if (!['http:', 'https:'].includes(sourceUrl.protocol)
    || sourceUrl.username || sourceUrl.password || !sourceUrl.hostname) {
    throw new Error('Некорректный источник этапа');
  }

  const response = await supabaseResponse('rpc/admin_save_event', '', {
    method: 'POST',
    body: JSON.stringify({
      p_id: input.id,
      p_season_year: input.seasonYear,
      p_round: input.round,
      p_name: input.name.trim(),
      p_race_date: input.raceDate,
      p_start_time_utc: input.startTimeUtc,
      p_status: input.status,
      p_circuit_id: input.circuitId,
      p_layout_id: input.layoutId,
      p_source_url: sourceUrl.href,
      p_source_name: sourceUrl.hostname,
      p_source_verified: input.sourceVerified,
      p_create: create,
    }),
  });
  const result = await response.json() as { id: string; seasonYear: number };
  return { ...result, publicDataSynced: false };
}
