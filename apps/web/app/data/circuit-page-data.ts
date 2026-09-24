import bahrainPageJson from './circuit-pages/bahrain.json';
import spaPageJson from './circuit-pages/spa.json';
import circuitCatalogJson from './catalogs/circuits.json';
import { getTrackGeometry } from './track-geometries';

export type CircuitPageData = {
  schemaVersion: 1;
  id: string;
  slug: string;
  geometryId: string;
  nameRu: string;
  officialName: string;
  location: {
    cityRu: string;
    countryRu: string;
    countryCode?: string;
    coordinates: [number, number];
  };
  summary: {
    description: string;
    typeRu: string;
    metrics: Array<{ label: string; value: string }>;
    highlights?: string[];
    statBar?: Array<{
      label: string;
      value: string;
      note?: string;
      icon?: 'length' | 'turns' | 'debut' | 'record' | 'elevation' | 'type';
    }>;
  };
  map: {
    trackCamera: {
      maxZoom: number;
      pitch: number;
      bearing: number;
      padding: number;
    };
    travelBounds: [[number, number], [number, number]];
    travelZoom: number;
  };
  results: {
    seasons: number[];
    defaultSeason: number;
  };
  features: {
    technicalOverlay: boolean;
    travelMode: boolean;
    local3dModel: boolean;
    buildings3d: boolean;
  };
  trackPresentation?: {
    seasonLayoutIds: Record<string, string>;
    layouts: Array<{
      id: string;
      name: string;
      validFromYear?: number;
      validToYear?: number;
      centerline: GeoJSON.Feature<GeoJSON.LineString>;
      annotations: Array<{
        id: string;
        type: 'sector' | 'turn' | 'straight' | 'timing_line' | 'drs_zone' | 'drs_detection';
        labelRu?: string;
        labelOriginal?: string;
        sequence?: number;
        descriptionRu?: string;
        validFromYear?: number;
        validToYear?: number;
        geometry: GeoJSON.Point | GeoJSON.LineString;
        source: { name: string; url?: string };
      }>;
    }>;
  };
  travel: {
    intro: string;
    categories: Array<{ id: string; label: string }>;
    points: Array<{
      id: string;
      name: string;
      kindRu: string;
      descriptionRu: string;
      coordinates: [number, number];
      role?: 'transport' | 'stay' | 'explore' | 'essential' | 'circuit';
      imageUrl?: string;
      imageAltRu?: string;
    }>;
    story?: {
      stats: Array<{ value: string; label: string }>;
      chapters: Array<{
        id: string;
        index: string;
        eyebrow: string;
        title: string;
        description: string;
        mapFeatureIds?: string[];
        image?: string;
      }>;
      zones: Array<{
        id: string;
        mapFeatureId: string;
        name: string;
        character: string;
        travelTime: string;
        bestFor: string;
        tone: string;
        image?: string;
      }>;
      routes: Array<{
        id: string;
        type: string;
        title: string;
        distance: string;
        duration: string;
        stops: string[];
        description: string;
        rationale?: string;
        highlights?: string[];
        practicalNotes?: string;
        image?: string;
      }>;
      gallery?: Array<{
        src: string;
        srcSet?: string;
        fullSrc?: string;
        title: string;
        description: string;
        credit?: string;
        license?: string;
        sourceUrl?: string;
      }>;
    };
    planner?: {
      useful: Array<{ label: string; value: string; detail: string }>;
      sourceNote?: string;
      routeNote?: string;
    };
  };
  history?: Array<{
    year: string;
    title: string;
    description: string;
    image?: string;
    imageSrcSet?: string;
    imageAlt?: string;
    credit?: string;
    license?: string;
    sourceUrl?: string;
  }>;
};

// These generated JSON documents follow the CircuitPageData export contract.
export const bahrainCircuitPage = bahrainPageJson as unknown as CircuitPageData;
export const spaCircuitPage = spaPageJson as unknown as CircuitPageData;

type CircuitCatalogRow = (typeof circuitCatalogJson.circuits)[number];

function aroundCoordinate([longitude, latitude]: [number, number]): [[number, number], [number, number]] {
  const delta = 0.18;
  return [[longitude - delta, Math.max(-85, latitude - delta)], [longitude + delta, Math.min(85, latitude + delta)]];
}

/**
 * Формирует безопасную базовую страницу для трассы, у которой ещё нет полного
 * редакционного профиля. Здесь используются только поля каталога; пустые
 * разделы явно показывают, что материалы ожидают проверки, а не имитируют
 * готовую историю или туристические рекомендации
 */
export function buildCircuitPageFromCatalog(circuit: CircuitCatalogRow): CircuitPageData {
  const seasons = circuit.seasons?.length ? circuit.seasons : [circuitCatalogJson.season];
  const coordinates: [number, number] = [circuit.coordinates[0], circuit.coordinates[1]];
  const fallbackFeature: GeoJSON.Feature<GeoJSON.LineString> | null = circuit.geometry?.type === 'LineString'
    ? { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: circuit.geometry.coordinates } }
    : null;
  const layoutsById = new Map<string, { id: string; centerline: GeoJSON.Feature<GeoJSON.LineString> }>();
  const seasonLayoutIds: Record<string, string> = {};
  for (const season of seasons) {
    const feature = getTrackGeometry(circuit.id, season);
    const geometryId = String(feature?.properties.geometryId ?? circuit.id);
    const layoutId = `${circuit.id}-${geometryId}-catalog-layout`;
    const centerline = feature ?? fallbackFeature;
    if (!centerline) continue;
    seasonLayoutIds[String(season)] = layoutId;
    if (!layoutsById.has(layoutId)) layoutsById.set(layoutId, { id: layoutId, centerline });
  }
  const trackPresentation = layoutsById.size ? {
    seasonLayoutIds,
    layouts: [...layoutsById.values()].map(({ id, centerline }) => ({
      id,
      name: 'Канонический контур',
      centerline,
      annotations: [],
    })),
  } : undefined;
  const metrics = [
    { label: 'Длина', value: circuit.metrics.length ?? 'Уточняется' },
    { label: 'Повороты', value: circuit.metrics.turns ?? 'Уточняется' },
    { label: 'Дебют', value: circuit.metrics.debut ?? 'Уточняется' },
    { label: 'Рекорд круга', value: circuit.metrics.record ?? 'Уточняется' },
  ];
  return {
    schemaVersion: 1,
    id: circuit.id,
    slug: circuit.slug,
    geometryId: circuit.id,
    nameRu: circuit.nameRu,
    officialName: circuit.officialName,
    location: { cityRu: circuit.cityRu, countryRu: circuit.countryRu, countryCode: circuit.countryCode, coordinates },
    summary: {
      description: circuit.summary || 'Публичный редакционный профиль трассы готовится: базовые сведения взяты из каталога, дополнительные факты и источники будут добавлены после проверки',
      typeRu: circuit.typeRu,
      metrics,
      highlights: ['Профиль готовится', circuit.countryRu, circuit.typeRu],
      statBar: [
        { label: 'Длина трассы', value: circuit.metrics.length ?? 'Уточняется', icon: 'length' },
        { label: 'Повороты', value: circuit.metrics.turns ?? 'Уточняется', icon: 'turns' },
        { label: 'Дебют в F1', value: circuit.metrics.debut ?? 'Уточняется', icon: 'debut' },
        { label: 'Рекорд круга', value: circuit.metrics.record ?? 'Уточняется', icon: 'record' },
        { label: 'Перепад высот', value: 'Уточняется', icon: 'elevation' },
        { label: 'Тип трассы', value: circuit.typeRu, icon: 'type' },
      ],
    },
    map: { trackCamera: { maxZoom: 14.8, pitch: 46, bearing: 0, padding: 92 }, travelBounds: aroundCoordinate(coordinates), travelZoom: 11 },
    results: { seasons, defaultSeason: seasons[0] },
    features: { technicalOverlay: false, travelMode: false, local3dModel: false, buildings3d: false },
    trackPresentation,
    travel: { intro: 'Туристический слой для этой трассы будет добавлен после редакционной проверки', categories: [], points: [] },
  };
}

export const circuitPageCatalog = new Map<string, CircuitPageData>([
  [bahrainCircuitPage.slug, bahrainCircuitPage],
  [spaCircuitPage.slug, spaCircuitPage],
  ...circuitCatalogJson.circuits
    .filter((circuit) => circuit.slug !== bahrainCircuitPage.slug && circuit.slug !== spaCircuitPage.slug)
    .map((circuit) => [circuit.slug, buildCircuitPageFromCatalog(circuit)] as const),
]);
