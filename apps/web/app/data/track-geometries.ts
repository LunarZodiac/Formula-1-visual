import circuitsGeoJson from './circuits.json';
import { season2024 } from './season-2024';
import { circuitGeometryRegistry } from './track-geometry-registry';

type TrackFeature = GeoJSON.Feature<
  GeoJSON.LineString,
  {
    id: string;
    name?: string;
    length?: number;
    [key: string]: unknown;
  }
>;

const sourceFeatures = (
  circuitsGeoJson as GeoJSON.FeatureCollection<GeoJSON.LineString>
).features as TrackFeature[];

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

export function getTrackData(
  circuitId: string,
): GeoJSON.FeatureCollection<GeoJSON.LineString> {
  const feature = trackGeometries[circuitId];

  return {
    type: 'FeatureCollection',
    features: feature ? [feature] : [],
  };
}
