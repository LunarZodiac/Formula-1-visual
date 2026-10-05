import type {
  AdminEventSessionInput,
  AdminSessionResultInput,
} from './admin-database';
import { adminSupabaseRequest, adminSupabaseRpc } from './supabase-admin';

const safeId = /^[A-Za-z0-9_-]+$/;
const sessionTypes = new Set([
  'practice_1', 'practice_2', 'practice_3', 'qualifying',
  'sprint_shootout', 'sprint', 'race',
]);
const statuses = new Set(['scheduled', 'live', 'completed', 'cancelled', 'postponed']);

type SessionRow = {
  id: string; race_id: string; session_type: AdminEventSessionInput['sessionType'];
  name: string; starts_at: string | null; ends_at: string | null;
  status: AdminEventSessionInput['status']; source_id: string | null; updated_at: string;
};

type ResultRow = {
  driver_id: string; position_order: number; position_text: string;
  constructor_entry_id: number | null; grid_position: number | null; laps: number | null;
  status: string | null; points: number | string; elapsed_ms: number | null;
  gap_ms: number | null; gap_text: string | null; fastest_lap_rank: number | null;
  fastest_lap_number: number | null; fastest_lap_ms: number | null;
  details: Record<string, unknown> | null; source_id: string | null;
};

function inFilter(ids: string[]) {
  return `in.(${ids.map((id) => JSON.stringify(id)).join(',')})`;
}

async function allRows<T>(table: string, select: string, order: string): Promise<T[]> {
  const rows: T[] = [];
  const chunk = 500;
  for (let offset = 0; ; offset += chunk) {
    const query = new URLSearchParams({ select, order, limit: String(chunk), offset: String(offset) });
    const page = await adminSupabaseRequest<T[]>(table, `?${query}`);
    rows.push(...page);
    if (page.length < chunk) return rows;
  }
}

function source(url: string) {
  const parsed = new URL(url);
  if (!['http:', 'https:'].includes(parsed.protocol)
    || parsed.username || parsed.password || !parsed.hostname) {
    throw new Error('Некорректный источник');
  }
  return { url: parsed.href, name: parsed.hostname };
}

function dateTime(value: string | null) {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) throw new Error('Некорректная дата сессии');
  return parsed.toISOString();
}

function optionalInteger(value: number | null, label: string, minimum = 0) {
  if (value === null) return null;
  if (!Number.isInteger(value) || value < minimum) throw new Error(`Некорректное поле ${label}`);
  return value;
}

export async function getDirectAdminEventSession(raceId: string, sessionId: string) {
  if (!safeId.test(raceId) || !safeId.test(sessionId)) return null;

  const raceQuery = new URLSearchParams({ select: 'id,season_year,round,name', id: `eq.${raceId}`, limit: '1' });
  const sessionQuery = new URLSearchParams({
    select: 'id,race_id,session_type,name,starts_at,ends_at,status,source_id,updated_at',
    id: `eq.${sessionId}`, race_id: `eq.${raceId}`, limit: '1',
  });
  const [races, sessions] = await Promise.all([
    adminSupabaseRequest<Array<{ id: string; season_year: number; round: number; name: string }>>('races', `?${raceQuery}`),
    adminSupabaseRequest<SessionRow[]>('sessions', `?${sessionQuery}`),
  ]);
  const race = races[0];
  const session = sessions[0];
  if (!race || !session) return null;

  const resultQuery = new URLSearchParams({
    select: 'driver_id,position_order,position_text,constructor_entry_id,grid_position,laps,status,points,elapsed_ms,gap_ms,gap_text,fastest_lap_rank,fastest_lap_number,fastest_lap_ms,details,source_id',
    session_id: `eq.${sessionId}`, order: 'position_order.asc,driver_id.asc',
  });
  const constructorQuery = new URLSearchParams({
    select: 'id,display_name', season_year: `eq.${race.season_year}`, order: 'display_name.asc',
  });
  const [results, drivers, profiles, constructors] = await Promise.all([
    adminSupabaseRequest<ResultRow[]>('session_results', `?${resultQuery}`),
    allRows<{ id: string; given_name: string; family_name: string }>('drivers', 'id,given_name,family_name', 'id.asc'),
    allRows<{ driver_id: string; name_ru: string | null }>('driver_profiles', 'driver_id,name_ru', 'driver_id.asc'),
    adminSupabaseRequest<Array<{ id: number; display_name: string }>>('constructor_entries', `?${constructorQuery}`),
  ]);

  const sourceIds = [...new Set([session.source_id, ...results.map((row) => row.source_id)]
    .filter((id): id is string => id !== null))];
  const sources = sourceIds.length
    ? await adminSupabaseRequest<Array<{ id: string; url: string | null }>>(
        'data_sources',
        `?${new URLSearchParams({ select: 'id,url', id: inFilter(sourceIds) })}`,
      )
    : [];
  const sourceUrls = new Map(sources.map((row) => [row.id, row.url]));
  const profileNames = new Map(profiles.map((row) => [row.driver_id, row.name_ru]));
  const driverOptions = drivers.map((row) => ({
    id: row.id,
    name: profileNames.get(row.id) || `${row.given_name} ${row.family_name}`.trim(),
  })).sort((left, right) => left.name.localeCompare(right.name, 'ru'));
  const driverNames = new Map(driverOptions.map((row) => [row.id, row.name]));
  const constructorOptions = constructors.map((row) => ({ id: Number(row.id), name: row.display_name }));
  const constructorNames = new Map(constructorOptions.map((row) => [row.id, row.name]));

  return {
    event: { id: race.id, seasonYear: Number(race.season_year), round: Number(race.round), name: race.name },
    session: {
      id: session.id, raceId: session.race_id, sessionType: session.session_type,
      name: session.name, startsAt: session.starts_at, endsAt: session.ends_at,
      status: session.status, sourceUrl: session.source_id ? sourceUrls.get(session.source_id) ?? null : null,
      resultCount: results.length, updatedAt: session.updated_at,
    },
    results: results.map((row) => ({
      driverId: row.driver_id,
      driverName: driverNames.get(row.driver_id) ?? row.driver_id,
      positionOrder: Number(row.position_order),
      positionText: row.position_text,
      constructorEntryId: row.constructor_entry_id === null ? null : Number(row.constructor_entry_id),
      constructorName: row.constructor_entry_id === null ? null : constructorNames.get(Number(row.constructor_entry_id)) ?? null,
      gridPosition: row.grid_position === null ? null : Number(row.grid_position),
      laps: row.laps === null ? null : Number(row.laps),
      status: row.status,
      points: Number(row.points),
      elapsedMs: row.elapsed_ms === null ? null : Number(row.elapsed_ms),
      gapMs: row.gap_ms === null ? null : Number(row.gap_ms),
      gapText: row.gap_text,
      sourceUrl: row.source_id ? sourceUrls.get(row.source_id) ?? null : null,
      fastestLapRank: row.fastest_lap_rank === null ? null : Number(row.fastest_lap_rank),
      fastestLapNumber: row.fastest_lap_number === null ? null : Number(row.fastest_lap_number),
      fastestLapMs: row.fastest_lap_ms === null ? null : Number(row.fastest_lap_ms),
      q1Ms: row.details?.q1_ms == null ? null : Number(row.details.q1_ms),
      q2Ms: row.details?.q2_ms == null ? null : Number(row.details.q2_ms),
      q3Ms: row.details?.q3_ms == null ? null : Number(row.details.q3_ms),
      penaltyNote: typeof row.details?.penalty_note === 'string' ? row.details.penalty_note : null,
    })),
    drivers: driverOptions,
    constructors: constructorOptions,
  };
}

export async function saveDirectAdminEventSession(input: AdminEventSessionInput, create = false) {
  if (!safeId.test(input.raceId) || (!create && !safeId.test(input.id))) {
    throw new Error('Некорректный ID сессии');
  }
  if (!sessionTypes.has(input.sessionType) || !statuses.has(input.status)) {
    throw new Error('Некорректный тип или статус сессии');
  }
  if (!input.name.trim() || input.name.trim().length > 120) throw new Error('Укажите название сессии');
  if (['live', 'completed'].includes(input.status) && !input.sourceVerified) {
    throw new Error('Для проведённой сессии подтвердите источник');
  }
  const sessionId = create ? `${input.raceId}-${input.sessionType}` : input.id;
  if (!safeId.test(sessionId)) throw new Error('Некорректный ID сессии');
  const sessionSource = source(input.sourceUrl);
  const result = await adminSupabaseRpc<{ id: string }>('admin_save_event_session', {
    p_id: sessionId,
    p_race_id: input.raceId,
    p_session_type: input.sessionType,
    p_name: input.name.trim(),
    p_starts_at: dateTime(input.startsAt),
    p_ends_at: dateTime(input.endsAt),
    p_status: input.status,
    p_source_url: sessionSource.url,
    p_source_name: sessionSource.name,
    p_source_verified: input.sourceVerified,
    p_create: create,
  });
  return { ...result, publicDataSynced: false };
}

function resultPayload(input: AdminSessionResultInput) {
  if (!safeId.test(input.driverId)
    || (input.originalDriverId && !safeId.test(input.originalDriverId))) {
    throw new Error('Выберите пилота');
  }
  optionalInteger(input.positionOrder, 'позиция', 1);
  if (!input.positionText.trim() || input.positionText.trim().length > 16) {
    throw new Error('Укажите отображаемую позицию');
  }
  if (!Number.isFinite(input.points) || input.points < 0 || input.points > 100) {
    throw new Error('Некорректные очки');
  }
  for (const [label, value, minimum] of [
    ['команда', input.constructorEntryId, 1], ['стартовая позиция', input.gridPosition, 0],
    ['круги', input.laps, 0], ['время', input.elapsedMs, 0], ['отставание', input.gapMs, 0],
    ['место быстрого круга', input.fastestLapRank, 1],
    ['номер быстрого круга', input.fastestLapNumber, 1],
    ['быстрый круг', input.fastestLapMs, 0], ['Q1', input.q1Ms, 0],
    ['Q2', input.q2Ms, 0], ['Q3', input.q3Ms, 0],
  ] as const) optionalInteger(value, label, minimum);
  if (input.penaltyNote && input.penaltyNote.trim().length > 500) {
    throw new Error('Примечание о штрафе слишком длинное');
  }
  if (!input.sourceVerified) throw new Error('Подтвердите источник результата');
  const resultSource = source(input.sourceUrl);
  return {
    driver_id: input.driverId,
    original_driver_id: input.originalDriverId,
    position_order: input.positionOrder,
    position_text: input.positionText.trim(),
    constructor_entry_id: input.constructorEntryId,
    grid_position: input.gridPosition,
    laps: input.laps,
    status: input.status,
    points: input.points,
    elapsed_ms: input.elapsedMs,
    gap_ms: input.gapMs,
    gap_text: input.gapText,
    fastest_lap_rank: input.fastestLapRank,
    fastest_lap_number: input.fastestLapNumber,
    fastest_lap_ms: input.fastestLapMs,
    q1_ms: input.q1Ms,
    q2_ms: input.q2Ms,
    q3_ms: input.q3Ms,
    penalty_note: input.penaltyNote?.trim() || null,
    source_url: resultSource.url,
    source_name: resultSource.name,
    source_verified: input.sourceVerified,
  };
}

export async function saveDirectAdminSessionResults(input: {
  raceId: string; sessionId: string; rows: AdminSessionResultInput[];
}) {
  if (!safeId.test(input.raceId) || !safeId.test(input.sessionId)) {
    throw new Error('Некорректный этап или сессия');
  }
  if (input.rows.length < 1 || input.rows.length > 40) {
    throw new Error('Пакет должен содержать от 1 до 40 результатов');
  }
  const seenDrivers = new Set<string>();
  const seenOriginals = new Set<string>();
  const rows = input.rows.map((row) => {
    if (row.raceId !== input.raceId || row.sessionId !== input.sessionId) {
      throw new Error('Результат относится к другому этапу или сессии');
    }
    const payload = resultPayload(row);
    if (seenDrivers.has(row.driverId)
      || (row.originalDriverId && seenOriginals.has(row.originalDriverId))) {
      throw new Error('Пилот повторяется в пакете');
    }
    seenDrivers.add(row.driverId);
    if (row.originalDriverId) seenOriginals.add(row.originalDriverId);
    return payload;
  });
  const result = await adminSupabaseRpc<{ saved: number }>('admin_save_session_results', {
    p_race_id: input.raceId,
    p_session_id: input.sessionId,
    p_rows: rows,
  });
  return { ...result, publicDataSynced: false };
}

export async function saveDirectAdminSessionResult(input: AdminSessionResultInput) {
  await saveDirectAdminSessionResults({ raceId: input.raceId, sessionId: input.sessionId, rows: [input] });
  return { driverId: input.driverId, publicDataSynced: false };
}

export async function deleteDirectAdminSessionResult(raceId: string, sessionId: string, driverId: string) {
  if (![raceId, sessionId, driverId].every((id) => safeId.test(id))) {
    throw new Error('Некорректный результат');
  }
  const result = await adminSupabaseRpc<{ deleted: boolean }>('admin_delete_session_result', {
    p_race_id: raceId,
    p_session_id: sessionId,
    p_driver_id: driverId,
  });
  return { ...result, publicDataSynced: false };
}
