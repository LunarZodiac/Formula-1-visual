import type {
  AdminCircuit, AdminCircuitInput, AdminCircuitMediaOrder, AdminCircuitMediaOrderItem,
  AdminCircuitRegistry, AdminCircuitSummary,
  AdminTrackGeometryInspection, AdminTrackLayoutInput,
} from './admin-database';
import { adminSupabaseRequest, adminSupabaseRpc } from './supabase-admin';

type DirectoryRow = {
  id: string; name: string; short_name: string | null; name_ru: string | null;
  city_ru: string | null; country_ru: string | null; country_code: string;
  circuit_type: string; editorial_status: AdminCircuitSummary['profileStatus'];
  slug: string | null; first_season: number | null; last_season: number | null;
  races: number; layout_count: number; reviewed_layouts: number;
  verified_layouts: number; unresolved_layouts: number; unassigned_races: number;
  stats_count: number; history_count: number; media_count: number;
  annotation_count: number; core_ready: boolean; completeness_percent: number;
  missing_areas: string[];
};

type DetailRow = {
  id: string; name: string; short_name: string | null; locality: string | null;
  country_code: string; circuit_type: string; longitude: number; latitude: number;
  opened_year: number | null; website_url: string | null; circuit_source_id: string | null;
  updated_at: string; slug: string | null; geometry_id: string | null;
  name_ru: string | null; city_ru: string | null; country_ru: string | null;
  summary_ru: string | null; circuit_type_ru: string | null;
  editorial_status: 'draft' | 'review' | 'published' | null;
  profile_source_id: string | null; profile_source_url: string | null;
};

type LayoutRow = {
  id: string; name: string; valid_from_year: number | null; valid_to_year: number | null;
  length_m: number | null; turns: number | null; direction: string | null;
  elevation_min_m: number | null; elevation_max_m: number | null;
  has_geometry: boolean; centerline_geojson?: string | null;
  provenance_type: string; review_status: string; verified_at: string | null;
  source_url: string | null; race_count: number;
};

type CardMediaRow = {
  id: string; url: string | null; alt_text_ru: string | null;
  author: string | null; licence: string | null;
  source_url: string | null; rights_status: string; review_status: string;
};

const directorySelect = 'id,name,short_name,name_ru,city_ru,country_ru,country_code,circuit_type,editorial_status,slug,first_season,last_season,races,layout_count,reviewed_layouts,verified_layouts,unresolved_layouts,unassigned_races,stats_count,history_count,media_count,annotation_count,core_ready,completeness_percent,missing_areas';

async function getDirectoryRows() {
  const rows: DirectoryRow[] = [];
  for (let offset = 0; ; offset += 500) {
    const batch = await adminSupabaseRequest<DirectoryRow[]>(
      'admin_circuit_directory',
      `?select=${directorySelect}&order=id.asc&limit=500&offset=${offset}`,
    );
    rows.push(...batch);
    if (batch.length < 500) return rows;
  }
}

function mapSummary(row: DirectoryRow): AdminCircuitSummary {
  return {
    id: row.id, officialName: row.name, shortName: row.short_name,
    nameRu: row.name_ru, cityRu: row.city_ru, countryRu: row.country_ru,
    countryCode: row.country_code.trim().toLowerCase(), circuitType: row.circuit_type,
    profileStatus: row.editorial_status, slug: row.slug,
    firstSeason: row.first_season, lastSeason: row.last_season, races: row.races,
    layoutCount: row.layout_count, reviewedLayouts: row.reviewed_layouts,
    verifiedLayouts: row.verified_layouts, unresolvedLayouts: row.unresolved_layouts,
    unassignedRaces: row.unassigned_races, statsCount: row.stats_count,
    historyCount: row.history_count, mediaCount: row.media_count,
    annotationCount: row.annotation_count, coreReady: row.core_ready,
    completenessPercent: row.completeness_percent, missingAreas: row.missing_areas,
  };
}

export async function getDirectAdminCircuits(filters: {
  page?: number; limit?: number; query?: string; country?: string; type?: string;
  status?: string; layout?: string; gap?: string;
} = {}): Promise<AdminCircuitRegistry> {
  const all = await getDirectoryRows();
  const page = Math.max(1, Math.trunc(filters.page ?? 1) || 1);
  const limit = Math.min(100, Math.max(1, Math.trunc(filters.limit ?? 30) || 30));
  const query = filters.query?.trim().slice(0, 120).toLocaleLowerCase() ?? '';
  const country = filters.country?.trim().toLowerCase() ?? '';
  const type = ['permanent', 'street', 'hybrid', 'temporary'].includes(filters.type ?? '') ? filters.type : '';
  const status = ['draft', 'review', 'published', 'missing'].includes(filters.status ?? '') ? filters.status : '';
  const layout = ['ready', 'review', 'missing'].includes(filters.layout ?? '') ? filters.layout : '';
  const gap = ['profile', 'geometry', 'assignments', 'stats', 'history', 'media', 'annotations', 'ready']
    .includes(filters.gap ?? '') ? filters.gap : '';
  const filtered = all.filter((row) => {
    if (query && ![row.id, row.name, row.short_name, row.name_ru, row.city_ru, row.country_ru]
      .filter(Boolean).join(' ').toLocaleLowerCase().includes(query)) return false;
    if (country && row.country_code.trim().toLowerCase() !== country) return false;
    if (type && row.circuit_type !== type) return false;
    if (status && (status === 'missing'
      ? row.editorial_status !== null : row.editorial_status !== status)) return false;
    if (layout === 'ready' && row.verified_layouts === 0) return false;
    if (layout === 'review' && row.unresolved_layouts === 0) return false;
    if (layout === 'missing' && row.layout_count !== 0) return false;
    if (gap === 'ready') return row.completeness_percent === 100;
    if (gap && !row.missing_areas.includes(gap)) return false;
    return true;
  });
  filtered.sort((a, b) => a.completeness_percent - b.completeness_percent
    || (a.name_ru ?? a.short_name ?? a.name).localeCompare(b.name_ru ?? b.short_name ?? b.name)
    || a.id.localeCompare(b.id));
  return {
    rows: filtered.slice((page - 1) * limit, page * limit).map(mapSummary),
    filteredCount: filtered.length, page, limit,
    countries: [...new Set(all.map((row) => row.country_code.trim().toLowerCase()))].sort(),
    summary: {
      circuits: all.length,
      publishedProfiles: all.filter((row) => row.editorial_status === 'published').length,
      coreReady: all.filter((row) => row.core_ready).length,
      verifiedGeometry: all.filter((row) => row.verified_layouts > 0).length,
      assignedCalendars: all.filter((row) => row.unassigned_races === 0).length,
      withStats: all.filter((row) => row.stats_count > 0).length,
      withHistory: all.filter((row) => row.history_count > 0).length,
      withMedia: all.filter((row) => row.media_count > 0).length,
      withAnnotations: all.filter((row) => row.annotation_count > 0).length,
    },
  };
}

export async function getDirectAdminCircuit(id: string, includeGeometry = false): Promise<AdminCircuit | null> {
  const encodedId = encodeURIComponent(id);
  const layoutSelect = 'id,name,valid_from_year,valid_to_year,length_m,turns,direction,elevation_min_m,elevation_max_m,has_geometry,provenance_type,review_status,verified_at,source_url,race_count'
    + (includeGeometry ? ',centerline_geojson' : '');
  const [details, layouts, media] = await Promise.all([
    adminSupabaseRequest<DetailRow[]>('admin_circuit_details', `?id=eq.${encodedId}&limit=1`),
    adminSupabaseRequest<LayoutRow[]>('admin_circuit_layouts',
      `?select=${layoutSelect}&circuit_id=eq.${encodedId}&order=valid_from_year.asc.nullslast,id.asc`),
    adminSupabaseRequest<CardMediaRow[]>('admin_circuit_card_media',
      `?select=id,url,alt_text_ru,author,licence,source_url,rights_status,review_status&circuit_id=eq.${encodedId}&order=is_primary.desc,verified_at.desc.nullslast,id.asc&limit=1`),
  ]);
  const row = details[0];
  if (!row) return null;
  return {
    id: row.id, officialName: row.name, shortName: row.short_name, locality: row.locality,
    countryCode: row.country_code.trim().toLowerCase(), circuitType: row.circuit_type,
    longitude: Number(row.longitude), latitude: Number(row.latitude),
    openedYear: row.opened_year, websiteUrl: row.website_url,
    circuitSourceId: row.circuit_source_id, updatedAt: new Date(row.updated_at).toISOString(),
    profile: row.slug === null ? null : {
      slug: row.slug, geometryId: row.geometry_id, nameRu: row.name_ru ?? '',
      cityRu: row.city_ru ?? '', countryRu: row.country_ru ?? '',
      summaryRu: row.summary_ru, circuitTypeRu: row.circuit_type_ru,
      editorialStatus: row.editorial_status ?? 'draft', sourceId: row.profile_source_id,
      sourceUrl: row.profile_source_url,
    },
    cardImage: media[0]?.url ? {
      id: media[0].id, url: media[0].url, altTextRu: media[0].alt_text_ru ?? '',
      author: media[0].author ?? '', licence: media[0].licence ?? '',
      sourceUrl: media[0].source_url ?? '', rightsStatus: media[0].rights_status,
      reviewStatus: media[0].review_status,
    } : null,
    layouts: layouts.map((layout) => ({
      id: layout.id, name: layout.name, validFromYear: layout.valid_from_year,
      validToYear: layout.valid_to_year, lengthM: layout.length_m, turns: layout.turns,
      direction: layout.direction, elevationMinM: layout.elevation_min_m,
      elevationMaxM: layout.elevation_max_m, hasGeometry: layout.has_geometry,
      centerlineGeoJson: layout.centerline_geojson ? JSON.parse(layout.centerline_geojson) : null,
      provenanceType: layout.provenance_type, reviewStatus: layout.review_status,
      verifiedAt: layout.verified_at ? new Date(layout.verified_at).toISOString() : null,
      sourceUrl: layout.source_url, raceCount: layout.race_count,
    })),
  };
}

export async function saveDirectAdminCircuit(input: AdminCircuitInput) {
  if (!/^[A-Za-z0-9_-]+$/.test(input.id)
    || !/^[a-z]{2}$/.test(input.countryCode.toLowerCase())
    || !['permanent', 'street', 'hybrid', 'temporary'].includes(input.circuitType)
    || !['draft', 'review', 'published'].includes(input.editorialStatus)
    || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(input.slug)
    || !input.officialName.trim() || !input.nameRu.trim()
    || !input.cityRu.trim() || !input.countryRu.trim()
    || !Number.isFinite(input.longitude) || input.longitude < -180 || input.longitude > 180
    || !Number.isFinite(input.latitude) || input.latitude < -90 || input.latitude > 90
    || (input.openedYear !== null && (!Number.isInteger(input.openedYear)
      || input.openedYear < 1800 || input.openedYear > new Date().getUTCFullYear()))) {
    throw new Error('Некорректные сведения о трассе');
  }
  const source = new URL(input.sourceUrl);
  if (!['http:', 'https:'].includes(source.protocol) || !source.hostname
    || source.username || source.password || source.href.length > 2000) {
    throw new Error('Некорректный URL источника');
  }
  if (input.websiteUrl) {
    const website = new URL(input.websiteUrl);
    if (!['http:', 'https:'].includes(website.protocol) || !website.hostname
      || website.username || website.password || website.href.length > 2000) {
      throw new Error('Некорректный адрес сайта трассы');
    }
  }
  if (input.editorialStatus === 'published'
    && (!['spa', 'bahrain'].includes(input.id)
      || !input.geometryId || !input.summaryRu || !input.circuitTypeRu)) {
    throw new Error('Публичный профиль этой трассы не готов к публикации');
  }
  return adminSupabaseRpc<{ id: string; publicDataSynced: boolean }>(
    'admin_save_circuit_profile',
    { p_input: { ...input, countryCode: input.countryCode.toLowerCase(),
      sourceUrl: source.href, sourceName: input.sourceName?.trim() || source.hostname } },
  );
}

export async function saveDirectAdminTrackLayout(input: AdminTrackLayoutInput, create = false) {
  if (!/^[A-Za-z0-9_-]+$/.test(input.id)
    || !/^[A-Za-z0-9_-]+$/.test(input.circuitId)
    || !input.name.trim()
    || !['unknown', 'official', 'open_data', 'user_digitized'].includes(input.provenanceType)
    || !['candidate', 'reviewed', 'published', 'rejected'].includes(input.reviewStatus)
    || (create && input.reviewStatus !== 'candidate')
    || (['reviewed', 'published'].includes(input.reviewStatus)
      && (input.provenanceType === 'unknown' || !input.sourceVerified))) {
    throw new Error('Некорректные сведения о конфигурации');
  }
  const validInteger = (value: number | null, min: number, max: number) =>
    value === null || (Number.isInteger(value) && value >= min && value <= max);
  const validNumber = (value: number | null, min: number, max: number) =>
    value === null || (Number.isFinite(value) && value >= min && value <= max);
  if (!validInteger(input.validFromYear, 1950, 2100)
    || !validInteger(input.validToYear, 1950, 2100)
    || (input.validFromYear !== null && input.validToYear !== null
      && input.validToYear < input.validFromYear)
    || !validInteger(input.lengthM, 1, 100000)
    || !validInteger(input.turns, 1, 200)
    || !validNumber(input.elevationMinM, -500, 6000)
    || !validNumber(input.elevationMaxM, -500, 6000)
    || (input.elevationMinM !== null && input.elevationMaxM !== null
      && input.elevationMaxM < input.elevationMinM)
    || (input.direction !== null && !['clockwise', 'counterclockwise'].includes(input.direction))) {
    throw new Error('Некорректные числовые параметры конфигурации');
  }
  const source = new URL(input.sourceUrl);
  if (!['http:', 'https:'].includes(source.protocol) || !source.hostname
    || source.username || source.password || source.href.length > 2000) {
    throw new Error('Некорректный URL источника');
  }
  return adminSupabaseRpc<{ id: string; circuitId: string; publicDataSynced: boolean }>(
    'admin_save_track_layout',
    { p_input: { ...input, sourceUrl: source.href,
      sourceName: input.sourceName?.trim() || source.hostname }, p_create: create },
  );
}

function normalizeTrackGeometry(input: unknown) {
  const document = input as Record<string, unknown> | null;
  let feature = document;
  if (document?.type === 'FeatureCollection') {
    const features = document.features;
    if (!Array.isArray(features) || features.length !== 1) {
      throw new Error('GeoJSON должен содержать ровно одну линию конфигурации');
    }
    feature = features[0] as Record<string, unknown> | null;
  }
  const properties = feature?.type === 'Feature'
    ? feature.properties as Record<string, unknown> | null : null;
  if (properties?.placeholder === true || properties?.status === 'placeholder') {
    throw new Error('Черновой placeholder нельзя импортировать как контур');
  }
  const geometry = feature?.type === 'Feature'
    ? feature.geometry as Record<string, unknown> | null : feature;
  if (geometry?.type !== 'LineString' || !Array.isArray(geometry.coordinates)
    || geometry.coordinates.length < 3 || geometry.coordinates.length > 50_000) {
    throw new Error('Ожидается GeoJSON LineString от 3 до 50 000 координат');
  }
  const coordinates: number[][] = [];
  for (const [index, raw] of geometry.coordinates.entries()) {
    if (!Array.isArray(raw) || raw.length < 2) {
      throw new Error(`Координата ${index + 1} не является парой [долгота, широта]`);
    }
    const longitude = Number(raw[0]);
    const latitude = Number(raw[1]);
    const elevation = raw.length > 2 ? Number(raw[2]) : 0;
    if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180
      || !Number.isFinite(latitude) || latitude < -90 || latitude > 90
      || !Number.isFinite(elevation) || elevation < -1000 || elevation > 10000) {
      throw new Error(`Координата ${index + 1} выходит за допустимые границы`);
    }
    const previous = coordinates.at(-1);
    if (!previous || previous[0] !== longitude || previous[1] !== latitude
      || previous[2] !== elevation) {
      coordinates.push([longitude, latitude, elevation]);
    }
  }
  if (coordinates.length < 3) {
    throw new Error('После удаления повторов в линии осталось меньше трёх координат');
  }
  const first = coordinates[0];
  const last = coordinates.at(-1)!;
  const wasClosed = first[0] === last[0] && first[1] === last[1];
  if (!wasClosed) coordinates.push([...first]);
  const signedArea = coordinates.slice(1).reduce((area, [longitude, latitude], index) => {
    const [previousLongitude, previousLatitude] = coordinates[index];
    return area + (longitude - previousLongitude) * (latitude + previousLatitude);
  }, 0);
  return {
    geometry: { type: 'LineString' as const, coordinates }, wasClosed,
    direction: signedArea > 0 ? 'clockwise' as const : 'counterclockwise' as const,
  };
}

export function inspectDirectAdminTrackGeometry(circuitId: string, layoutId: string, geoJson: unknown) {
  if (!/^[A-Za-z0-9_-]+$/.test(circuitId) || !/^[A-Za-z0-9_-]+$/.test(layoutId)) {
    throw new Error('Некорректная конфигурация');
  }
  const normalized = normalizeTrackGeometry(geoJson);
  return adminSupabaseRpc<AdminTrackGeometryInspection>('admin_inspect_track_geometry', {
    p_circuit_id: circuitId, p_layout_id: layoutId,
    p_geometry: normalized.geometry, p_direction: normalized.direction,
    p_was_closed: normalized.wasClosed,
  });
}

export function importDirectAdminTrackGeometry(circuitId: string, layoutId: string, geoJson: unknown) {
  if (!/^[A-Za-z0-9_-]+$/.test(circuitId) || !/^[A-Za-z0-9_-]+$/.test(layoutId)) {
    throw new Error('Некорректная конфигурация');
  }
  const normalized = normalizeTrackGeometry(geoJson);
  return adminSupabaseRpc<{
    circuitId: string; layoutId: string; preview: AdminTrackGeometryInspection;
    publicDataSynced: boolean;
  }>('admin_import_track_geometry', {
    p_circuit_id: circuitId, p_layout_id: layoutId,
    p_geometry: normalized.geometry, p_direction: normalized.direction,
    p_was_closed: normalized.wasClosed,
  });
}

type MediaOrderRow = {
  id: string; sort_order: number; year_label: string | null;
  title_ru: string | null; description_ru: string | null;
  media_asset_id: string | null; url: string | null; alt_text_ru: string | null;
  rights_status: string | null; review_status: string | null;
};

function mapMediaOrder(row: MediaOrderRow): AdminCircuitMediaOrderItem {
  return {
    id: row.id, sortOrder: row.sort_order, yearLabel: row.year_label,
    titleRu: row.title_ru, descriptionRu: row.description_ru,
    mediaAssetId: row.media_asset_id, url: row.url, altTextRu: row.alt_text_ru,
    rightsStatus: row.rights_status, reviewStatus: row.review_status,
  };
}

export async function getDirectAdminCircuitMediaOrder(circuitId: string): Promise<AdminCircuitMediaOrder | null> {
  if (!/^[A-Za-z0-9_-]+$/.test(circuitId)) return null;
  const id = encodeURIComponent(circuitId);
  const [profiles, history, gallery] = await Promise.all([
    adminSupabaseRequest<Array<{ id: string; slug: string | null; name_ru: string | null;
      editorial_status: string | null }>>('admin_circuit_details',
      `?select=id,slug,name_ru,editorial_status&id=eq.${id}&limit=1`),
    adminSupabaseRequest<MediaOrderRow[]>('admin_circuit_media_history',
      `?circuit_id=eq.${id}&order=sort_order.asc,id.asc`),
    adminSupabaseRequest<MediaOrderRow[]>('admin_circuit_media_gallery',
      `?circuit_id=eq.${id}&order=sort_order.asc,id.asc`),
  ]);
  const profile = profiles[0];
  if (!profile?.slug) return null;
  return {
    circuit: { id: profile.id, slug: profile.slug, nameRu: profile.name_ru ?? '',
      editorialStatus: profile.editorial_status ?? 'draft' },
    history: history.map(mapMediaOrder), gallery: gallery.map(mapMediaOrder),
  };
}

export function updateDirectAdminCircuitMediaOrder(
  circuitId: string, section: 'history' | 'gallery', orderedIds: string[],
) {
  if (!/^[A-Za-z0-9_-]+$/.test(circuitId) || !['history', 'gallery'].includes(section)
    || orderedIds.length === 0 || orderedIds.some((id) => !id.trim())
    || new Set(orderedIds).size !== orderedIds.length) {
    throw new Error('Некорректный порядок материалов трассы');
  }
  return adminSupabaseRpc<{ section: 'history' | 'gallery'; slug: string;
    publicDataSynced: boolean }>('admin_reorder_circuit_media', {
    p_circuit_id: circuitId, p_section: section, p_ordered_ids: orderedIds,
  });
}
