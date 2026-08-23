import circuitsGeoJson from './circuits.json';
import { season2024 } from './season-2024';

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
  season2024.flatMap((circuit) => {
    const sourceFeature = sourceByGeometryId.get(circuit.geometryId);

    if (!sourceFeature) return [];

    return [[
      circuit.id,
      {
        ...sourceFeature,
        properties: {
          ...sourceFeature.properties,
          circuitId: circuit.id,
          geometryId: circuit.geometryId,
        },
      },
    ]];
  }),
);

export const missingSeason2024TrackIds = season2024
  .filter((circuit) => !sourceByGeometryId.has(circuit.geometryId))
  .map((circuit) => circuit.id);

export function getTrackData(
  circuitId: string,
): GeoJSON.FeatureCollection<GeoJSON.LineString> {
  const feature = trackGeometries[circuitId];

  return {
    type: 'FeatureCollection',
    features: feature ? [feature] : [],
  };
}
