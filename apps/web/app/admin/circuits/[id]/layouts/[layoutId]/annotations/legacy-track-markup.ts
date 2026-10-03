import { bahrainTechnicalData } from '../../../../../../data/bahrain-track-details';
import { spaTechnicalData } from '../../../../../../data/spa-track-details';

// Разметка старых публичных карт пока не является записью редактора. Сохраняем
// её отдельным справочным слоем: отсутствие источника нельзя принять за ревью.
export type LegacyTrackMarkup = {
  trackSectors: GeoJSON.FeatureCollection<GeoJSON.LineString>;
  turnLabels: GeoJSON.FeatureCollection<GeoJSON.Point>;
  turnLabelLeaders: GeoJSON.FeatureCollection<GeoJSON.LineString>;
  drsZones: GeoJSON.FeatureCollection<GeoJSON.LineString>;
  drsDetectionLeaders: GeoJSON.FeatureCollection<GeoJSON.LineString>;
  drsDetectionLabels: GeoJSON.FeatureCollection<GeoJSON.Point>;
  drsDetectionAnchors: GeoJSON.FeatureCollection<GeoJSON.Point>;
  trackPoints: GeoJSON.FeatureCollection<GeoJSON.Point>;
  startFinishLeader: GeoJSON.FeatureCollection<GeoJSON.LineString>;
  namedTrackFeatures?: GeoJSON.FeatureCollection<GeoJSON.Point>;
  namedTrackLeaders?: GeoJSON.FeatureCollection<GeoJSON.LineString>;
};

export function getLegacyTrackMarkup(circuitId: string, layoutId: string): LegacyTrackMarkup | null {
  if (circuitId === 'spa' && layoutId === 'be-1925') return spaTechnicalData;
  if (circuitId === 'bahrain' && layoutId === 'bh-2002') return bahrainTechnicalData;
  return null;
}

export function hideTransferredLegacyMarkup(markup: LegacyTrackMarkup, layoutId: string, existingIds: Set<string>, existingTypesAndNumbers: Set<string>): LegacyTrackMarkup {
  const annotationType: Record<string, string> = { sector: 'sector', turn: 'turn', drs: 'drs_zone', 'drs-detection': 'drs_detection' };
  const keep = (kind: string, index: number) => !existingIds.has(`${layoutId}-legacy-${kind}-${index + 1}`)
    && !existingTypesAndNumbers.has(`${annotationType[kind]}:${index + 1}:2025`);
  const filter = <G extends GeoJSON.Geometry>(collection: GeoJSON.FeatureCollection<G>, kind: string): GeoJSON.FeatureCollection<G> => ({
    ...collection, features: collection.features.filter((_, index) => keep(kind, index)),
  });
  return {
    ...markup,
    trackSectors: filter(markup.trackSectors, 'sector'),
    turnLabels: filter(markup.turnLabels, 'turn'),
    turnLabelLeaders: filter(markup.turnLabelLeaders, 'turn'),
    trackPoints: { ...markup.trackPoints, features: markup.trackPoints.features.filter(feature => feature.properties?.kind !== 'turn' || keep('turn', Number(feature.properties.label) - 1)) },
    drsZones: filter(markup.drsZones, 'drs'),
    drsDetectionAnchors: filter(markup.drsDetectionAnchors, 'drs-detection'),
    drsDetectionLeaders: filter(markup.drsDetectionLeaders, 'drs-detection'),
    drsDetectionLabels: filter(markup.drsDetectionLabels, 'drs-detection'),
  };
}

export function buildLegacyTrackAnnotationPackage(circuitId: string, layoutId: string, sourceName: string, sourceUrl: string) {
  const markup = getLegacyTrackMarkup(circuitId, layoutId);
  if (!markup) return null;
  const turns = markup.trackPoints.features.filter(feature => feature.properties?.kind === 'turn');
  const features: GeoJSON.Feature[] = [
    ...markup.trackSectors.features.map((feature, index) => ({
      type: 'Feature' as const,
      properties: { id: `${layoutId}-legacy-sector-${index + 1}`, annotationType: 'sector', sequence: index + 1, validFromYear: 2025, validToYear: 2025 },
      geometry: feature.geometry,
    })),
    ...turns.map((feature, index) => ({
      type: 'Feature' as const,
      properties: { id: `${layoutId}-legacy-turn-${index + 1}`, annotationType: 'turn', sequence: index + 1, validFromYear: 2025, validToYear: 2025,
        calloutPoint: markup.turnLabels.features[index]?.geometry.coordinates },
      geometry: feature.geometry,
    })),
    ...markup.drsZones.features.map((feature, index) => ({
      type: 'Feature' as const,
      properties: { id: `${layoutId}-legacy-drs-${index + 1}`, annotationType: 'drs_zone', sequence: index + 1,
        labelRu: `DRS ${index + 1}`, validFromYear: 2025, validToYear: 2025 },
      geometry: feature.geometry,
    })),
    ...markup.drsDetectionAnchors.features.map((feature, index) => ({
      type: 'Feature' as const,
      properties: { id: `${layoutId}-legacy-drs-detection-${index + 1}`, annotationType: 'drs_detection', sequence: index + 1,
        labelRu: `Детекция DRS ${index + 1}`, validFromYear: 2025, validToYear: 2025 },
      geometry: feature.geometry,
    })),
  ];
  return { type: 'FeatureCollection' as const, circuitId, layoutId, sourceName, sourceUrl, preserveExisting: true, features };
}
