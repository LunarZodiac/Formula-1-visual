import { env } from 'cloudflare:workers';

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

  const response = await fetch(
    `${url}/rest/v1/${table}${query}`,
    {
      ...init,
      cache: 'no-store',
      headers: {
        apikey: secret,
        'Accept-Profile': 'atlas',
        ...init.headers,
      },
    },
  );

  if (!response.ok) {
    const details = await response.text();

    throw new Error(
      `Supabase Data API ${response.status}: ${details}`,
    );
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