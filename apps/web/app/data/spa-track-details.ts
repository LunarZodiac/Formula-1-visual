import { trackGeometries } from './track-geometries';

type TrackPointProperties = {
  kind: 'turn' | 'sector' | 'start';
  label: string;
  title: string;
  description: string;
};

const coordinates = trackGeometries.spa?.geometry.coordinates ?? [];
const point = (index: number): [number, number] => coordinates[index] as [number, number];

const turnIndices = [0, 5, 9, 15, 19, 25, 29, 39, 47, 54, 59, 70, 77, 87, 100, 114, 121, 138, 149];
const turnCoordinates = turnIndices.map(point);
const turnLabelCoordinates = turnCoordinates.map(([longitude, latitude], index) => [
  longitude + (index % 2 === 0 ? -0.00062 : 0.00062),
  latitude + (index % 3 === 0 ? 0.00042 : -0.00036),
] as [number, number]);

export const spaTrackSectors: GeoJSON.FeatureCollection<GeoJSON.LineString> = {
  type: 'FeatureCollection',
  features: [
    { type: 'Feature', properties: { sector: 1 }, geometry: { type: 'LineString', coordinates: coordinates.slice(0, 21) } },
    { type: 'Feature', properties: { sector: 2 }, geometry: { type: 'LineString', coordinates: coordinates.slice(20, 97) } },
    { type: 'Feature', properties: { sector: 3 }, geometry: { type: 'LineString', coordinates: coordinates.slice(96) } },
  ],
};

export const spaTurnLabels: GeoJSON.FeatureCollection<GeoJSON.Point, TrackPointProperties> = {
  type: 'FeatureCollection',
  features: turnLabelCoordinates.map((position, index) => ({
    type: 'Feature' as const,
    properties: {
      kind: 'turn' as const,
      label: String(index + 1),
      title: `Поворот ${index + 1}`,
      description: `Поворот №${index + 1} конфигурации Гран-при Спа-Франкоршам`,
    },
    geometry: { type: 'Point' as const, coordinates: position },
  })),
};

export const spaTurnLabelLeaders: GeoJSON.FeatureCollection<GeoJSON.LineString> = {
  type: 'FeatureCollection',
  features: turnCoordinates.map((position, index) => ({
    type: 'Feature' as const,
    properties: { turn: index + 1 },
    geometry: { type: 'LineString' as const, coordinates: [position, turnLabelCoordinates[index]] },
  })),
};

export const spaTrackPoints: GeoJSON.FeatureCollection<GeoJSON.Point, TrackPointProperties> = {
  type: 'FeatureCollection',
  features: [
    ...turnCoordinates.map((position, index) => ({
      type: 'Feature' as const,
      properties: {
        kind: 'turn' as const,
        label: String(index + 1),
        title: `Поворот ${index + 1}`,
        description: `Поворот №${index + 1} конфигурации Гран-при Спа-Франкоршам`,
      },
      geometry: { type: 'Point' as const, coordinates: position },
    })),
    {
      type: 'Feature',
      properties: { kind: 'start', label: '', title: 'Старт и финиш', description: 'Стартовая и контрольная линия Circuit de Spa-Francorchamps' },
      geometry: { type: 'Point', coordinates: point(151) },
    },
    {
      type: 'Feature',
      properties: { kind: 'sector', label: 'S1', title: 'Граница секторов 1–2', description: 'Первая контрольная граница круга после четвёртого поворота' },
      geometry: { type: 'Point', coordinates: point(20) },
    },
    {
      type: 'Feature',
      properties: { kind: 'sector', label: 'S2', title: 'Граница секторов 2–3', description: 'Вторая контрольная граница круга перед пятнадцатым поворотом' },
      geometry: { type: 'Point', coordinates: point(96) },
    },
  ],
};

export const spaStartFinishLeader: GeoJSON.FeatureCollection<GeoJSON.LineString> = {
  type: 'FeatureCollection',
  features: [{
    type: 'Feature',
    properties: { kind: 'start-finish' },
    geometry: { type: 'LineString', coordinates: [point(148), point(151)] },
  }],
};

export const spaDrsZones: GeoJSON.FeatureCollection<GeoJSON.LineString> = {
  type: 'FeatureCollection',
  features: [
    { type: 'Feature', properties: { id: 'drs-1', label: 'DRS 1' }, geometry: { type: 'LineString', coordinates: coordinates.slice(23, 31) } },
    { type: 'Feature', properties: { id: 'drs-2', label: 'DRS 2' }, geometry: { type: 'LineString', coordinates: coordinates.slice(126, 139) } },
  ],
};

const detectionAnchors: Array<[number, number]> = [point(20), point(100)];
const detectionLabels: Array<[number, number]> = [
  [detectionAnchors[0][0] + 0.002, detectionAnchors[0][1] + 0.0007],
  [detectionAnchors[1][0] - 0.002, detectionAnchors[1][1] - 0.0007],
];

export const spaDrsDetectionLeaders: GeoJSON.FeatureCollection<GeoJSON.LineString> = {
  type: 'FeatureCollection',
  features: detectionAnchors.map((position, index) => ({
    type: 'Feature' as const,
    properties: { id: `detection-${index + 1}` },
    geometry: { type: 'LineString' as const, coordinates: [position, detectionLabels[index]] },
  })),
};

export const spaDrsDetectionAnchors: GeoJSON.FeatureCollection<GeoJSON.Point> = {
  type: 'FeatureCollection',
  features: detectionAnchors.map((position, index) => ({
    type: 'Feature' as const,
    properties: { id: `detection-${index + 1}` },
    geometry: { type: 'Point' as const, coordinates: position },
  })),
};

export const spaDrsDetectionLabels: GeoJSON.FeatureCollection<GeoJSON.Point> = {
  type: 'FeatureCollection',
  features: detectionLabels.map((position, index) => ({
    type: 'Feature' as const,
    properties: { label: `DRS · ДЕТЕКЦИЯ ${index + 1}` },
    geometry: { type: 'Point' as const, coordinates: position },
  })),
};

export const spaTechnicalData = {
  trackSectors: spaTrackSectors,
  turnLabels: spaTurnLabels,
  turnLabelLeaders: spaTurnLabelLeaders,
  trackPoints: spaTrackPoints,
  startFinishLeader: spaStartFinishLeader,
  drsZones: spaDrsZones,
  drsDetectionLeaders: spaDrsDetectionLeaders,
  drsDetectionAnchors: spaDrsDetectionAnchors,
  drsDetectionLabels: spaDrsDetectionLabels,
};
