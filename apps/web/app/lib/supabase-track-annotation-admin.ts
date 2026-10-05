import type {
  AdminTrackAnnotation, AdminTrackAnnotationImportPreview, AdminTrackAnnotationRegistry,
} from './admin-database';
import { adminSupabaseRequest, adminSupabaseRpc } from './supabase-admin';

const safeId = /^[A-Za-z0-9_-]+$/;
const annotationTypes = new Set([
  'sector', 'turn', 'straight', 'timing_line', 'drs_zone', 'drs_detection',
  'straight_mode_zone', 'straight_mode_activation',
  'straight_mode_low_grip_activation', 'overtake_detection', 'overtake_activation',
]);
const pointTypes = new Set([
  'turn', 'timing_line', 'drs_detection', 'straight_mode_activation',
  'straight_mode_low_grip_activation', 'overtake_detection', 'overtake_activation',
]);

type LayoutRow = {
  id: string; circuit_id: string; name: string; circuit_name: string;
  valid_from_year: number | null; valid_to_year: number | null;
  centerline_geojson: string | null;
};

type AnnotationRow = {
  id: string; annotation_type: AdminTrackAnnotation['annotationType'];
  label_ru: string | null; label_original: string | null;
  sequence: number | null; description_ru: string | null;
  geometry_geojson: string; callout_point: number[] | null;
  valid_from_year: number | null; valid_to_year: number | null;
  review_status: AdminTrackAnnotation['reviewStatus'];
  verified_at: string | null; revision: string;
  source_name: string | null; source_url: string | null; source_notes: string | null;
};

function mapAnnotation(row: AnnotationRow): AdminTrackAnnotation {
  return {
    id: row.id, annotationType: row.annotation_type,
    labelRu: row.label_ru, labelOriginal: row.label_original,
    sequence: row.sequence, descriptionRu: row.description_ru,
    geometryGeoJson: JSON.parse(row.geometry_geojson),
    calloutPoint: Array.isArray(row.callout_point) ? row.callout_point : null,
    validFromYear: row.valid_from_year, validToYear: row.valid_to_year,
    reviewStatus: row.review_status,
    verifiedAt: row.verified_at ? new Date(row.verified_at).toISOString() : null,
    revision: row.revision, sourceName: row.source_name,
    sourceUrl: row.source_url, sourceNotes: row.source_notes,
  };
}

export async function getDirectAdminTrackAnnotations(
  circuitId: string, layoutId: string,
): Promise<AdminTrackAnnotationRegistry | null> {
  if (!safeId.test(circuitId) || !safeId.test(layoutId)) return null;
  const annotationRows = async () => {
    const rows: AnnotationRow[] = [];
    for (let offset = 0; ; offset += 500) {
      const batch = await adminSupabaseRequest<AnnotationRow[]>('admin_track_annotation_items',
        `?layout_id=eq.${encodeURIComponent(layoutId)}&order=annotation_type.asc,sequence.asc.nullslast,valid_from_year.asc.nullsfirst,id.asc&limit=500&offset=${offset}`);
      rows.push(...batch);
      if (batch.length < 500) return rows;
    }
  };
  const [layouts, annotations] = await Promise.all([
    adminSupabaseRequest<LayoutRow[]>('admin_track_annotation_layouts',
      `?id=eq.${encodeURIComponent(layoutId)}&circuit_id=eq.${encodeURIComponent(circuitId)}&limit=1`),
    annotationRows(),
  ]);
  const layout = layouts[0];
  if (!layout) return null;
  return {
    circuit: { id: circuitId, name: layout.circuit_name },
    layout: { id: layoutId, name: layout.name,
      validFromYear: layout.valid_from_year, validToYear: layout.valid_to_year,
      centerlineGeoJson: layout.centerline_geojson ? JSON.parse(layout.centerline_geojson) : null },
    annotations: annotations.map(mapAnnotation),
  };
}

function normalizeGeometry(raw: unknown, annotationType: string) {
  let value = typeof raw === 'string' ? JSON.parse(raw) : raw;
  if (value && typeof value === 'object' && 'type' in value && value.type === 'Feature') {
    value = value.geometry;
  }
  const geometry = value as { type?: string; coordinates?: unknown } | null;
  const expected = pointTypes.has(annotationType) ? 'Point' : 'LineString';
  if (geometry?.type !== expected || !Array.isArray(geometry.coordinates)) {
    throw new Error(`Для этого типа разметки требуется геометрия ${expected}`);
  }
  const coordinate = (point: unknown): point is number[] => Array.isArray(point)
    && point.length >= 2 && Number.isFinite(Number(point[0]))
    && Number(point[0]) >= -180 && Number(point[0]) <= 180
    && Number.isFinite(Number(point[1]))
    && Number(point[1]) >= -90 && Number(point[1]) <= 90;
  if (expected === 'Point') {
    if (!coordinate(geometry.coordinates)) throw new Error('Некорректная координата точки');
    return { type: 'Point', coordinates: geometry.coordinates.slice(0, 2).map(Number) };
  }
  if (geometry.coordinates.length < 2 || geometry.coordinates.length > 10_000
    || !geometry.coordinates.every(coordinate)) {
    throw new Error('Линия разметки должна содержать от 2 до 10 000 координат');
  }
  const points = geometry.coordinates.map((point: number[]) => point.slice(0, 2).map(Number));
  if (points.every((point: number[]) => Math.abs(point[0] - points[0][0]) < 1e-7
    && Math.abs(point[1] - points[0][1]) < 1e-7)) {
    throw new Error('Участок разметки должен иметь ненулевую длину');
  }
  return { type: 'LineString', coordinates: points };
}

export function saveDirectAdminTrackAnnotation(
  circuitId: string, layoutId: string, annotationId: string, input: Record<string, unknown>,
) {
  if (!safeId.test(circuitId) || !safeId.test(layoutId) || !safeId.test(annotationId)) {
    throw new Error('Некорректный ID разметки');
  }
  const annotationType = String(input.annotationType ?? '');
  if (!annotationTypes.has(annotationType)) throw new Error('Некорректный тип разметки');
  const geometryGeoJson = normalizeGeometry(input.geometryGeoJson, annotationType);
  let calloutPoint: number[] | null = null;
  if (input.calloutPointJson) {
    if (!['turn', 'straight'].includes(annotationType)) {
      throw new Error('Выносная подпись разрешена только для поворота или прямой');
    }
    const raw = typeof input.calloutPointJson === 'string'
      ? JSON.parse(input.calloutPointJson) : input.calloutPointJson;
    if (!Array.isArray(raw) || raw.length !== 2
      || !raw.every((value) => typeof value === 'number' && Number.isFinite(value))
      || Math.abs(raw[0]) > 180 || Math.abs(raw[1]) > 90) {
      throw new Error('Некорректная координата выносной подписи');
    }
    calloutPoint = raw;
  }
  const source = new URL(String(input.sourceUrl ?? ''));
  if (!['http:', 'https:'].includes(source.protocol) || !source.hostname
    || source.username || source.password || source.href.length > 2000) {
    throw new Error('Некорректный URL источника');
  }
  return adminSupabaseRpc<{ id: string; circuitId: string; layoutId: string;
    publicDataSynced: boolean }>('admin_save_track_annotation', {
    p_circuit_id: circuitId, p_layout_id: layoutId, p_annotation_id: annotationId,
    p_input: { ...input, geometryGeoJson, calloutPoint,
      sourceUrl: source.href, sourceName: String(input.sourceName ?? '').trim() || source.hostname },
  });
}

export function deleteDirectAdminTrackAnnotation(
  circuitId: string, layoutId: string, annotationId: string, revision: string,
) {
  if (!safeId.test(circuitId) || !safeId.test(layoutId) || !safeId.test(annotationId)) {
    throw new Error('Некорректный ID разметки');
  }
  return adminSupabaseRpc<{ id: string; circuitId: string; layoutId: string;
    publicDataSynced: boolean } | null>('admin_delete_track_annotation', {
    p_circuit_id: circuitId, p_layout_id: layoutId,
    p_annotation_id: annotationId, p_revision: revision,
  });
}

export function createDirectAdminTrackSectors(
  circuitId: string, layoutId: string, input: Record<string, unknown>,
) {
  if (!safeId.test(circuitId) || !safeId.test(layoutId)) {
    throw new Error('Некорректная конфигурация');
  }
  const boundaries = input.boundaries;
  if (!Array.isArray(boundaries) || boundaries.length !== 3
    || boundaries.some((point) => !Array.isArray(point) || point.length !== 2
      || point.some((value) => typeof value !== 'number' || !Number.isFinite(value))
      || Math.abs(point[0]) > 180 || Math.abs(point[1]) > 90)) {
    throw new Error('Укажите старт и две границы секторов на оси трассы');
  }
  const source = new URL(String(input.sourceUrl ?? ''));
  if (!['http:', 'https:'].includes(source.protocol) || !source.hostname
    || source.username || source.password || source.href.length > 2000) {
    throw new Error('Некорректный URL источника');
  }
  return adminSupabaseRpc<{ circuitId: string; layoutId: string; created: number }>(
    'admin_create_track_sectors', {
      p_circuit_id: circuitId, p_layout_id: layoutId,
      p_input: { ...input, sourceUrl: source.href,
        sourceName: String(input.sourceName ?? '').trim() || source.hostname },
    },
  );
}

type AnnotationPackageFeature = {
  type: 'Feature';
  geometry: { type: 'Point' | 'LineString'; coordinates: number[] | number[][] };
  properties: Record<string, unknown>;
};

function validPoint(point: unknown): point is number[] {
  return Array.isArray(point) && point.length >= 2
    && typeof point[0] === 'number' && Number.isFinite(point[0])
    && point[0] >= -180 && point[0] <= 180
    && typeof point[1] === 'number' && Number.isFinite(point[1])
    && point[1] >= -90 && point[1] <= 90;
}

function validateAnnotationPackage(raw: unknown) {
  const value = raw as Record<string, unknown> | null;
  if (value?.type !== 'FeatureCollection' || !Array.isArray(value.features)
    || value.features.length < 1 || value.features.length > 1000
    || typeof value.circuitId !== 'string' || !safeId.test(value.circuitId)
    || typeof value.layoutId !== 'string' || !safeId.test(value.layoutId)
    || typeof value.sourceName !== 'string' || !value.sourceName.trim()) {
    throw new Error('Некорректный пакет разметки');
  }
  const source = new URL(String(value.sourceUrl ?? ''));
  if (!['http:', 'https:'].includes(source.protocol) || !source.hostname
    || source.username || source.password || source.href.length > 2000) {
    throw new Error('Некорректный URL источника пакета');
  }
  const ids = new Set<string>();
  const features = value.features.map((rawFeature, index): AnnotationPackageFeature => {
    const feature = rawFeature as Record<string, unknown> | null;
    const properties = feature?.properties as Record<string, unknown> | null;
    const geometry = feature?.geometry as AnnotationPackageFeature['geometry'] | null;
    const id = properties?.id;
    const type = properties?.annotationType;
    if (feature?.type !== 'Feature' || !properties
      || typeof id !== 'string' || !safeId.test(id) || ids.has(id)
      || typeof type !== 'string' || !annotationTypes.has(type)
      || (properties.labelRu == null && properties.labelOriginal == null
        && properties.sequence == null)) {
      throw new Error(`Некорректный элемент пакета ${index + 1}`);
    }
    ids.add(id);
    const sequence = properties.sequence;
    if (sequence != null && (!Number.isInteger(sequence)
      || (sequence as number) < 1 || (sequence as number) > 32767)) {
      throw new Error(`Некорректный номер элемента ${id}`);
    }
    const from = properties.validFromYear;
    const to = properties.validToYear;
    for (const year of [from, to]) {
      if (year != null && (!Number.isInteger(year) || (year as number) < 1900
        || (year as number) > 2100)) throw new Error(`Некорректный период элемента ${id}`);
    }
    if (typeof from === 'number' && typeof to === 'number' && to < from) {
      throw new Error(`Некорректный период элемента ${id}`);
    }
    if (['straight_mode_zone', 'straight_mode_activation',
      'straight_mode_low_grip_activation', 'overtake_detection', 'overtake_activation']
      .includes(type) && (typeof from !== 'number' || from < 2026)) {
      throw new Error(`Для элемента ${id} нужен год начала не раньше 2026`);
    }
    const expected = pointTypes.has(type) ? 'Point' : 'LineString';
    if (geometry?.type !== expected
      || (expected === 'Point' && !validPoint(geometry.coordinates))
      || (expected === 'LineString' && (!Array.isArray(geometry.coordinates)
        || geometry.coordinates.length < 2 || geometry.coordinates.length > 10_000
        || !geometry.coordinates.every(validPoint)))) {
      throw new Error(`Некорректная геометрия элемента ${id}`);
    }
    if (expected === 'LineString') {
      const points = geometry.coordinates as number[][];
      if (points.every((point) => point[0] === points[0][0] && point[1] === points[0][1])) {
        throw new Error(`Нулевая длина элемента ${id}`);
      }
    }
    if (properties.calloutPoint != null
      && (!['turn', 'straight'].includes(type)
        || !validPoint(properties.calloutPoint))) {
      throw new Error(`Некорректная выносная подпись элемента ${id}`);
    }
    return { type: 'Feature', geometry,
      properties: { ...properties, validFromYear: from ?? null, validToYear: to ?? null } };
  });
  return { ...value, sourceUrl: source.href, sourceName: value.sourceName.trim(), features };
}

export function createDirectAdminTrackAnnotationImportPreview(packageData: unknown) {
  return adminSupabaseRpc<AdminTrackAnnotationImportPreview>(
    'admin_create_track_annotation_preview',
    { p_package: validateAnnotationPackage(packageData) },
  );
}

export async function getDirectAdminTrackAnnotationImportPreview(token: string) {
  if (!/^[0-9a-fA-F-]{36}$/.test(token)) return null;
  return adminSupabaseRpc<AdminTrackAnnotationImportPreview | null>(
    'admin_get_track_annotation_preview', { p_token: token },
  );
}

export async function applyDirectAdminTrackAnnotationImportPreview(
  token: string, circuitId: string, layoutId: string,
) {
  if (!/^[0-9a-fA-F-]{36}$/.test(token)
    || !safeId.test(circuitId) || !safeId.test(layoutId)) return null;
  return adminSupabaseRpc<{ imported: number; circuitId: string; layoutId: string } | null>(
    'admin_apply_track_annotation_preview', {
      p_token: token, p_expected_circuit_id: circuitId,
      p_expected_layout_id: layoutId,
    },
  );
}
