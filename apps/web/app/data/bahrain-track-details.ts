type TrackPointProperties = {
  kind: 'turn' | 'sector' | 'start';
  label: string;
  title: string;
  description: string;
};

import { trackGeometries } from './track-geometries';

const bahrainCoordinates = trackGeometries.bahrain?.geometry.coordinates ?? [];

export const bahrainTrackSectors: GeoJSON.FeatureCollection<GeoJSON.LineString> = {
  type: 'FeatureCollection',
  features: [
    { type: 'Feature', properties: { sector: 1 }, geometry: { type: 'LineString', coordinates: bahrainCoordinates.slice(0, 25) } },
    { type: 'Feature', properties: { sector: 2 }, geometry: { type: 'LineString', coordinates: bahrainCoordinates.slice(24, 80) } },
    { type: 'Feature', properties: { sector: 3 }, geometry: { type: 'LineString', coordinates: bahrainCoordinates.slice(79) } },
  ],
};

const turnCoordinates: Array<[number, number]> = [
  [50.510764, 26.036871],
  [50.511474, 26.0364],
  [50.511734, 26.036367],
  [50.518364, 26.035566],
  [50.516635, 26.033878],
  [50.516233, 26.033166],
  [50.515807, 26.03302],
  [50.513208, 26.031451],
  [50.51354, 26.034486],
  [50.512776, 26.035288],
  [50.512433, 26.02882],
  [50.514528, 26.030291],
  [50.517493, 26.029612],
  [50.510651, 26.026086],
  [50.510302, 26.026671],
];

const turnLabelCoordinates: Array<[number, number]> = [
  [50.50995, 26.03727],
  [50.51112, 26.03583],
  [50.51197, 26.03682],
  [50.51902, 26.03579],
  [50.5172, 26.03366],
  [50.51655, 26.03269],
  [50.51562, 26.03249],
  [50.51266, 26.03102],
  [50.51404, 26.03486],
  [50.51229, 26.03575],
  [50.51183, 26.02866],
  [50.51454, 26.03093],
  [50.51815, 26.02963],
  [50.51052, 26.02545],
  [50.50963, 26.02672],
];

export const bahrainTurnLabels: GeoJSON.FeatureCollection<GeoJSON.Point, TrackPointProperties> = {
  type: 'FeatureCollection',
  features: turnLabelCoordinates.map((coordinates, index) => ({
    type: 'Feature' as const,
    properties: {
      kind: 'turn' as const,
      label: String(index + 1),
      title: `Поворот ${index + 1}`,
      description: index === 9
        ? 'Технически сложный левый поворот на спуске'
        : `Поворот №${index + 1} конфигурации Гран-при`,
    },
    geometry: { type: 'Point' as const, coordinates },
  })),
};

export const bahrainTurnLabelLeaders: GeoJSON.FeatureCollection<GeoJSON.LineString> = {
  type: 'FeatureCollection',
  features: turnCoordinates.map((coordinate, index) => ({
    type: 'Feature' as const,
    properties: { turn: index + 1 },
    geometry: {
      type: 'LineString' as const,
      coordinates: [coordinate, turnLabelCoordinates[index]],
    },
  })),
};

export const bahrainTrackPoints: GeoJSON.FeatureCollection<
  GeoJSON.Point,
  TrackPointProperties
> = {
  type: 'FeatureCollection',
  features: [
    ...turnCoordinates.map((coordinates, index) => ({
      type: 'Feature' as const,
      properties: {
        kind: 'turn' as const,
        label: String(index + 1),
        title: `Поворот ${index + 1}`,
        description: index === 9
          ? 'Технически сложный левый поворот на спуске'
          : `Поворот №${index + 1} конфигурации Гран-при`,
      },
      geometry: { type: 'Point' as const, coordinates },
    })),
    {
      type: 'Feature',
      properties: {
        kind: 'start', label: '', title: 'Старт и финиш',
        description: 'Стартовая и контрольная линия Bahrain International Circuit',
      },
      geometry: { type: 'Point', coordinates: [50.50962, 26.03178] },
    },
    {
      type: 'Feature',
      properties: {
        kind: 'sector', label: 'S1', title: 'Граница секторов 1–2',
        description: 'Первая контрольная граница круга — в районе пятого поворота',
      },
      geometry: { type: 'Point', coordinates: [50.516635, 26.033878] },
    },
    {
      type: 'Feature',
      properties: {
        kind: 'sector', label: 'S2', title: 'Граница секторов 2–3',
        description: 'Вторая контрольная граница круга — перед тринадцатым поворотом',
      },
      geometry: { type: 'Point', coordinates: [50.517405, 26.029862] },
    },
  ],
};

export const bahrainStartFinishLeader: GeoJSON.FeatureCollection<GeoJSON.LineString> = {
  type: 'FeatureCollection',
  features: [{
    type: 'Feature',
    properties: { kind: 'start-finish' },
    geometry: {
      type: 'LineString',
      coordinates: [[50.510539, 26.031766], [50.50962, 26.03178]],
    },
  }],
};

export const bahrainDrsZones: GeoJSON.FeatureCollection<GeoJSON.LineString> = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      properties: { id: 'drs-1', label: 'DRS 1' },
      geometry: {
        type: 'LineString',
        coordinates: [
          [50.512527, 26.036598], [50.512889, 26.036607],
          [50.518091, 26.035702],
        ],
      },
    },
    {
      type: 'Feature',
      properties: { id: 'drs-2', label: 'DRS 2' },
      geometry: {
        type: 'LineString',
        coordinates: [
          [50.512735, 26.035222], [50.512563, 26.034071],
          [50.512433, 26.031922], [50.512314, 26.029164],
        ],
      },
    },
    {
      type: 'Feature',
      properties: { id: 'drs-3', label: 'DRS 3' },
      geometry: {
        type: 'LineString',
        coordinates: [
          [50.510302, 26.026671], [50.510278, 26.026878],
          [50.510284, 26.027269], [50.510361, 26.029414],
          [50.510539, 26.031766],
        ],
      },
    },
  ],
};

export const bahrainDrsDetectionLeaders: GeoJSON.FeatureCollection<GeoJSON.LineString> = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature', properties: { id: 'detection-1' },
      geometry: { type: 'LineString', coordinates: [[50.51065, 26.0343], [50.5089, 26.0347]] },
    },
    {
      type: 'Feature', properties: { id: 'detection-2' },
      geometry: { type: 'LineString', coordinates: [[50.51349, 26.03405], [50.5155, 26.03465]] },
    },
    {
      type: 'Feature', properties: { id: 'detection-3' },
      geometry: { type: 'LineString', coordinates: [[50.51138, 26.02645], [50.51405, 26.02635]] },
    },
  ],
};

export const bahrainDrsDetectionAnchors: GeoJSON.FeatureCollection<GeoJSON.Point> = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature', properties: { id: 'detection-1' },
      geometry: { type: 'Point', coordinates: [50.51065, 26.0343] },
    },
    {
      type: 'Feature', properties: { id: 'detection-2' },
      geometry: { type: 'Point', coordinates: [50.51349, 26.03405] },
    },
    {
      type: 'Feature', properties: { id: 'detection-3' },
      geometry: { type: 'Point', coordinates: [50.51138, 26.02645] },
    },
  ],
};

export const bahrainDrsDetectionLabels: GeoJSON.FeatureCollection<GeoJSON.Point> = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature', properties: { label: 'DRS · ДЕТЕКЦИЯ 1' },
      geometry: { type: 'Point', coordinates: [50.5089, 26.0347] },
    },
    {
      type: 'Feature', properties: { label: 'DRS · ДЕТЕКЦИЯ 2' },
      geometry: { type: 'Point', coordinates: [50.5155, 26.03465] },
    },
    {
      type: 'Feature', properties: { label: 'DRS · ДЕТЕКЦИЯ 3' },
      geometry: { type: 'Point', coordinates: [50.51405, 26.02635] },
    },
  ],
};

export const bahrainTechnicalData = {
  trackSectors: bahrainTrackSectors,
  turnLabels: bahrainTurnLabels,
  turnLabelLeaders: bahrainTurnLabelLeaders,
  trackPoints: bahrainTrackPoints,
  startFinishLeader: bahrainStartFinishLeader,
  drsZones: bahrainDrsZones,
  drsDetectionLeaders: bahrainDrsDetectionLeaders,
  drsDetectionAnchors: bahrainDrsDetectionAnchors,
  drsDetectionLabels: bahrainDrsDetectionLabels,
};
