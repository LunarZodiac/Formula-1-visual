import type {
  AdminConstructorEntry,
  AdminConstructorEntryInput,
  AdminConstructorLineage,
  AdminConstructorLineageInput,
} from './admin-database';
import { adminSupabaseRequest, adminSupabaseRpc } from './supabase-admin';

const safeId = /^[A-Za-z0-9_-]+$/;
const statuses = new Set(['candidate', 'reviewed', 'published', 'rejected']);
const relationshipTypes = new Set([
  'rename', 'ownership_change', 'factory_takeover', 'licence_transfer', 'continuation', 'other',
]);

type EntryRow = {
  season_year: number; constructor_id: string; display_name: string;
  engine_name: string | null; team_colour: string | null; car_model: string | null;
  car_image_url: string | null; logo_image_url: string | null;
};
type MediaRow = {
  id: string; entity_id: string; usage_role: string;
  alt_text_ru: string | null; author: string | null; licence: string | null;
  source_url: string | null; rights_status: string; review_status: string;
};
type FieldSourceRow = { constructor_id: string; source_url: string };
type LineageRow = {
  id: number; predecessor_constructor_id: string; successor_constructor_id: string;
  relationship_type: AdminConstructorLineage['relationshipType'];
  valid_from_year: number | null; valid_to_year: number | null;
  description_ru: string | null; review_status: AdminConstructorLineage['reviewStatus'];
  source_id: string; verified_at: string | null;
};
type IdentityRow = {
  id: string; name: string; first_season: number | null; latest_season: number | null;
};
type DirectoryRow = IdentityRow & {
  season_count: number; aliases: string[];
  logo_image_url: string | null; car_image_url: string | null;
};

export async function getDirectAdminConstructorDirectory() {
  const rows = await adminSupabaseRequest<DirectoryRow[]>(
    'admin_constructor_directory',
    '?select=id,name,first_season,latest_season,season_count,aliases,logo_image_url,car_image_url&order=name.asc,id.asc',
  );
  return rows.filter((row) => row.latest_season !== null).map((row) => ({
    id: row.id, name: row.name,
    firstSeason: Number(row.first_season), latestSeason: Number(row.latest_season),
    seasonCount: Number(row.season_count),
    aliases: row.aliases?.filter((alias) => alias !== row.name).sort((a, b) => a.localeCompare(b, 'ru')) ?? [],
    logoUrl: row.logo_image_url, carImageUrl: row.car_image_url,
  }));
}

function validSeason(season: number) {
  if (!Number.isInteger(season) || season < 1950 || season > 2100) {
    throw new Error('Некорректный сезон');
  }
  return season;
}

function validSource(value: string) {
  const url = new URL(value.trim());
  if (!['http:', 'https:'].includes(url.protocol) || !url.hostname || url.username || url.password
    || url.href.length > 2000) {
    throw new Error('Некорректный URL источника');
  }
  return { url: url.href, name: url.hostname };
}

function mediaMetadata(row?: MediaRow) {
  return row?.source_url ? {
    altTextRu: row.alt_text_ru ?? '', author: row.author ?? '', licence: row.licence ?? '',
    sourceUrl: row.source_url, rightsStatus: row.rights_status, reviewStatus: row.review_status,
  } : null;
}

export async function getDirectAdminConstructorEntries(season: number, query = '') {
  validSeason(season);
  const entryQuery = new URLSearchParams({
    select: 'season_year,constructor_id,display_name,engine_name,team_colour,car_model,car_image_url,logo_image_url',
    season_year: `eq.${season}`, order: 'display_name.asc,constructor_id.asc',
  });
  const mediaQuery = new URLSearchParams({
    select: 'id,entity_id,usage_role,alt_text_ru,author,licence,source_url,rights_status,review_status',
    entity_type: 'eq.constructor', media_type: 'eq.image', is_primary: 'eq.true',
    season_year: `eq.${season}`, order: 'verified_at.desc.nullslast,id.asc',
  });
  const sourceQuery = new URLSearchParams({
    select: 'constructor_id,source_url', season_year: `eq.${season}`,
    order: 'retrieved_at.desc,source_id.asc',
  });
  const [entries, media, fieldSources] = await Promise.all([
    adminSupabaseRequest<EntryRow[]>('constructor_entries', `?${entryQuery}`),
    adminSupabaseRequest<MediaRow[]>('media_assets', `?${mediaQuery}`),
    adminSupabaseRequest<FieldSourceRow[]>('constructor_entry_field_sources', `?${sourceQuery}`),
  ]);

  const mediaByEntry = new Map<string, MediaRow>();
  for (const row of media) {
    const key = `${row.entity_id}:${row.usage_role}`;
    if (!mediaByEntry.has(key)) mediaByEntry.set(key, row);
  }
  const sourceByEntry = new Map<string, string>();
  for (const row of fieldSources) {
    if (!sourceByEntry.has(row.constructor_id)) sourceByEntry.set(row.constructor_id, row.source_url);
  }

  const rows: AdminConstructorEntry[] = entries.map((row) => ({
    season: Number(row.season_year), constructorId: row.constructor_id,
    displayName: row.display_name, engineName: row.engine_name,
    teamColour: row.team_colour?.trim() ?? null, carModel: row.car_model,
    carImageUrl: row.car_image_url, logoImageUrl: row.logo_image_url,
    editorialSourceUrl: sourceByEntry.get(row.constructor_id) ?? null,
    carMedia: mediaMetadata(mediaByEntry.get(`${row.constructor_id}:constructor_car`)),
    logoMedia: mediaMetadata(mediaByEntry.get(`${row.constructor_id}:team_logo`)),
  }));
  const search = query.trim().slice(0, 120).toLocaleLowerCase('ru');
  return {
    season,
    rows: search ? rows.filter((row) => [row.displayName, row.constructorId, row.carModel]
      .some((value) => value?.toLocaleLowerCase('ru').includes(search))) : rows,
  };
}

export async function getDirectAdminConstructorEntry(season: number, constructorId: string) {
  if (!safeId.test(constructorId)) return null;
  const bundle = await getDirectAdminConstructorEntries(season);
  return bundle.rows.find((row) => row.constructorId === constructorId) ?? null;
}

export async function saveDirectAdminConstructorEntry(input: AdminConstructorEntryInput) {
  validSeason(input.season);
  if (!safeId.test(input.constructorId) || !input.displayName.trim()
    || input.displayName.trim().length > 250 ||
    [input.engineName, input.carModel].some((value) => value !== null && value.trim().length > 250) ||
    (input.teamColour !== null && !/^#[0-9A-Fa-f]{6}$/.test(input.teamColour))) {
    throw new Error('Некорректные сведения о команде');
  }
  const source = validSource(input.sourceUrl);
  const result = await adminSupabaseRpc<{ fields: string[] }>('admin_save_constructor_entry', {
    p_season_year: input.season,
    p_constructor_id: input.constructorId,
    p_display_name: input.displayName.trim(),
    p_engine_name: input.engineName?.trim() || null,
    p_team_colour: input.teamColour,
    p_car_model: input.carModel?.trim() || null,
    p_source_url: source.url,
    p_source_name: source.name,
  });
  return { ...result, publicDataSynced: false };
}

export async function getDirectAdminConstructorLineages(query = '', status = '') {
  if (status && !statuses.has(status)) throw new Error('Некорректный статус связи');
  const linkQuery = new URLSearchParams({
    select: 'id,predecessor_constructor_id,successor_constructor_id,relationship_type,valid_from_year,valid_to_year,description_ru,review_status,source_id,verified_at',
    order: 'valid_from_year.asc.nullslast,id.asc',
  });
  if (status) linkQuery.set('review_status', `eq.${status}`);
  const [links, identities] = await Promise.all([
    adminSupabaseRequest<LineageRow[]>('constructor_lineage_links', `?${linkQuery}`),
    adminSupabaseRequest<IdentityRow[]>('admin_constructor_identities', '?select=id,name,first_season,latest_season&order=name.asc,id.asc'),
  ]);
  const sourceIds = [...new Set(links.map((row) => row.source_id))];
  const sources = sourceIds.length ? await adminSupabaseRequest<Array<{ id: string; url: string }>>(
    'data_sources', `?${new URLSearchParams({ select: 'id,url', id: `in.(${sourceIds.map((id) => JSON.stringify(id)).join(',')})` })}`,
  ) : [];
  const names = new Map(identities.map((row) => [row.id, row.name]));
  const sourceUrls = new Map(sources.map((row) => [row.id, row.url]));
  const search = query.trim().slice(0, 120).toLocaleLowerCase('ru');
  const rows: AdminConstructorLineage[] = links.map((row) => ({
    id: Number(row.id), predecessorConstructorId: row.predecessor_constructor_id,
    predecessorName: names.get(row.predecessor_constructor_id) ?? row.predecessor_constructor_id,
    successorConstructorId: row.successor_constructor_id,
    successorName: names.get(row.successor_constructor_id) ?? row.successor_constructor_id,
    relationshipType: row.relationship_type, validFromYear: row.valid_from_year,
    validToYear: row.valid_to_year, descriptionRu: row.description_ru,
    reviewStatus: row.review_status, sourceUrl: sourceUrls.get(row.source_id) ?? '',
    verifiedAt: row.verified_at,
  })).filter((row) => !search || [row.predecessorName, row.successorName,
    row.predecessorConstructorId, row.successorConstructorId]
    .some((value) => value.toLocaleLowerCase('ru').includes(search)));
  rows.sort((left, right) => (left.validFromYear ?? 9999) - (right.validFromYear ?? 9999)
    || left.predecessorName.localeCompare(right.predecessorName, 'ru')
    || left.successorName.localeCompare(right.successorName, 'ru'));
  return {
    rows,
    constructors: identities.map((row) => ({
      id: row.id, name: row.name,
      firstSeason: row.first_season === null ? null : Number(row.first_season),
      latestSeason: row.latest_season === null ? null : Number(row.latest_season),
    })),
  };
}

export async function saveDirectAdminConstructorLineage(input: AdminConstructorLineageInput, id: number | null) {
  if (![input.predecessorConstructorId, input.successorConstructorId].every((value) => safeId.test(value))
    || input.predecessorConstructorId === input.successorConstructorId
    || !relationshipTypes.has(input.relationshipType) || !statuses.has(input.reviewStatus)
    || (id !== null && (!Number.isInteger(id) || id < 1))) {
    throw new Error('Некорректная связь команд');
  }
  for (const year of [input.validFromYear, input.validToYear]) {
    if (year !== null && (!Number.isInteger(year) || year < 1950 || year > 2100)) {
      throw new Error('Некорректный период связи');
    }
  }
  if (input.validFromYear !== null && input.validToYear !== null
    && input.validToYear < input.validFromYear) throw new Error('Некорректный период связи');
  const source = validSource(input.sourceUrl);
  return adminSupabaseRpc<{ id: number }>('admin_save_constructor_lineage', {
    p_id: id,
    p_predecessor_id: input.predecessorConstructorId,
    p_successor_id: input.successorConstructorId,
    p_relationship_type: input.relationshipType,
    p_valid_from_year: input.validFromYear,
    p_valid_to_year: input.validToYear,
    p_description_ru: input.descriptionRu?.trim() || null,
    p_review_status: input.reviewStatus,
    p_source_url: source.url,
    p_source_name: source.name,
  });
}

export async function deleteDirectAdminConstructorLineage(id: number) {
  if (!Number.isInteger(id) || id < 1) throw new Error('Некорректный ID связи');
  const result = await adminSupabaseRpc<{ id: number | null }>('admin_delete_constructor_lineage', { p_id: id });
  if (result.id === null) throw new Error('Связь не найдена. Обновите страницу');
  return { id: result.id };
}
