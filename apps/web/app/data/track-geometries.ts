import circuitsGeoJson from './circuits.json';
import openStreetMapCircuitsGeoJson from './circuits-openstreetmap.json';
import userDigitizedCircuitsGeoJson from './circuits-user-digitized.json';
import { parseGeoJsonFeatureCollection } from './geojson-contract';
import { season2024 } from './season-2024';
import { circuitGeometryRegistry, getCircuitGeometryId } from './track-geometry-registry';

type TrackFeature = GeoJSON.Feature<
  GeoJSON.LineString,
  {
    id: string;
    name?: string;
    length?: number;
    [key: string]: unknown;
  }
>;

const trackSources = [
  ['основные трассы', circuitsGeoJson],
  ['трассы OpenStreetMap', openStreetMapCircuitsGeoJson],
  ['оцифрованные трассы', userDigitizedCircuitsGeoJson],
] as const;

const sourceFeatures = trackSources.flatMap(([label, source]) => (
  parseGeoJsonFeatureCollection(source, {
    label,
    allowedGeometryTypes: ['LineString'],
    requireFeatureId: true,
  }).features as TrackFeature[]
));

const sourceByGeometryId = new Map(
  sourceFeatures.map((feature) => [feature.properties.id, feature]),
);

export const trackGeometries: Partial<
  Record<string, TrackFeature>
> = Object.fromEntries(
  Object.entries(circuitGeometryRegistry).flatMap(([circuitId, geometryId]) => {
    const sourceFeature = sourceByGeometryId.get(geometryId);

    if (!sourceFeature) return [];

    return [[
      circuitId,
      {
        ...sourceFeature,
        properties: {
          ...sourceFeature.properties,
          circuitId,
          geometryId,
        },
      },
    ]];
  }),
);

export const missingSeason2024TrackIds = season2024
  .filter((circuit) => !trackGeometries[circuit.id])
  .map((circuit) => circuit.id);

export const registeredTrackIds = Object.keys(trackGeometries);

export function getTrackGeometry(circuitId: string, season?: number, eventId?: string) {
  const geometryId = getCircuitGeometryId(circuitId, season, eventId);
  if (!geometryId) return undefined;

  const sourceFeature = sourceByGeometryId.get(geometryId);
  if (!sourceFeature) return undefined;

  return {
    ...sourceFeature,
    properties: {
      ...sourceFeature.properties,
      circuitId,
      geometryId,
    },
  } satisfies TrackFeature;
}

export function getTrackData(
  circuitId: string,
  season?: number,
  eventId?: string,
): GeoJSON.FeatureCollection<GeoJSON.LineString> {
  const feature = getTrackGeometry(circuitId, season, eventId);

  return {
    type: 'FeatureCollection',
    features: feature ? [feature] : [],
  };
}
