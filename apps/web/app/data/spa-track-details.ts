import { trackGeometries } from './track-geometries';

type TrackPointProperties = {
  kind: 'turn' | 'sector' | 'start';
  label: string;
  title: string;
  description: string;
};

export type SpaNamedTrackFeatureProperties = {
  kind: 'corner_group' | 'straight';
  turnNumbers: number[];
  nameRu: string;
  nameOriginal: string;
  alternativeName?: string;
  priority: 1 | 2 | 3;
  minZoom: number;
  sourceId: string;
  sourceUrl: string;
  reviewedAt: string;
};

type SpaNamedTrackDefinition = SpaNamedTrackFeatureProperties & {
  anchorIndex: number;
  labelOffset: [number, number];
};

const coordinates = trackGeometries.spa?.geometry.coordinates ?? [];
const point = (index: number): [number, number] => coordinates[index] as [number, number];

const turnIndices = [0, 5, 9, 15, 19, 25, 29, 39, 47, 54, 59, 70, 77, 87, 100, 114, 121, 138, 149];
const turnCoordinates = turnIndices.map(point);
// Индивидуальные выносы сохраняют все номера видимыми и разводят плотные группы поворотов.
const turnLabelOffsets: Array<[number, number]> = [
  [-0.0014, 0.0008], [-0.0012, 0.0014], [0.0011, 0.001], [0.0018, 0.0006],
  [0.0028, -0.001], [0.0015, -0.0002], [0.0014, 0], [0.0014, 0],
  [0.0014, -0.0004], [0.0002, -0.0011], [0.0012, -0.0009], [0.0012, -0.0007],
  [0.0012, 0.0005], [-0.0003, -0.0012], [-0.0014, -0.0007], [-0.0015, 0.0003],
  [-0.0006, 0.001], [-0.0013, 0.0008], [-0.0026, 0.0009],
];
const turnLabelCoordinates = turnCoordinates.map(([longitude, latitude], index) => [
  longitude + turnLabelOffsets[index][0],
  latitude + turnLabelOffsets[index][1],
] as [number, number]);

const formula1CornerNamesSource = {
  sourceId: 'formula1-spa-corner-names-2026',
  sourceUrl: 'https://www.formula1.com/en/latest/article/explained-how-every-corner-at-the-circuit-de-spa-francorchamps-got-its-name.1o6cyXf5F6q9VFFcgMqTqs.1o6cyXf5F6q9VFFcgMqTqs',
  reviewedAt: '2026-09-17',
} as const;

const spaOperatorMapSource = {
  sourceId: 'spa-francorchamps-organiser-access-map',
  sourceUrl: 'https://www.spa-francorchamps.be/sites/default/files/pdf/en/SF_access-organiser.pdf',
  reviewedAt: '2026-09-17',
} as const;

const namedTrackDefinitions: SpaNamedTrackDefinition[] = [
  { kind: 'corner_group', anchorIndex: turnIndices[0], labelOffset: [-0.0026, 0.00135], turnNumbers: [1], nameRu: 'Ля-Сурс', nameOriginal: 'La Source', priority: 1, minZoom: 10, ...formula1CornerNamesSource },
  { kind: 'corner_group', anchorIndex: turnIndices[1], labelOffset: [-0.0031, -0.00045], turnNumbers: [2], nameRu: 'О-Руж', nameOriginal: 'Eau Rouge', priority: 1, minZoom: 12.2, ...formula1CornerNamesSource },
  { kind: 'corner_group', anchorIndex: turnIndices[2], labelOffset: [0.0012, 0.00205], turnNumbers: [3, 4], nameRu: 'Радийон', nameOriginal: 'Raidillon', priority: 1, minZoom: 12.2, ...formula1CornerNamesSource },
  { kind: 'straight', anchorIndex: 17, labelOffset: [0.00315, 0.00125], turnNumbers: [4, 5], nameRu: 'Прямая Кеммель', nameOriginal: 'Kemmel Straight', priority: 1, minZoom: 12.2, ...formula1CornerNamesSource },
  { kind: 'corner_group', anchorIndex: turnIndices[4], labelOffset: [0.003, 0.00025], turnNumbers: [5, 6], nameRu: 'Ле-Комб', nameOriginal: 'Les Combes', priority: 2, minZoom: 13.2, ...formula1CornerNamesSource },
  { kind: 'corner_group', anchorIndex: turnIndices[6], labelOffset: [0.0025, 0.0008], turnNumbers: [7], nameRu: 'Мальмеди', nameOriginal: 'Malmedy', priority: 3, minZoom: 14.4, ...formula1CornerNamesSource },
  { kind: 'corner_group', anchorIndex: turnIndices[7], labelOffset: [0.0028, -0.0001], turnNumbers: [8], nameRu: 'Брюссель', nameOriginal: 'Bruxelles', alternativeName: 'Rivage', priority: 2, minZoom: 13.2, ...formula1CornerNamesSource },
  { kind: 'corner_group', anchorIndex: turnIndices[8], labelOffset: [0.0025, -0.0015], turnNumbers: [9], nameRu: 'Поворот Жаки Икса', nameOriginal: 'Jacky Ickx Curve', alternativeName: 'Speaker Corner', priority: 3, minZoom: 14.4, ...formula1CornerNamesSource },
  { kind: 'corner_group', anchorIndex: turnIndices[9], labelOffset: [0.00085, -0.0008], turnNumbers: [10, 11], nameRu: 'Пуон', nameOriginal: 'Pouhon', alternativeName: 'Double Gauche', priority: 1, minZoom: 12.2, ...formula1CornerNamesSource },
  { kind: 'corner_group', anchorIndex: turnIndices[11], labelOffset: [0.002, -0.0013], turnNumbers: [12, 13], nameRu: 'Фань', nameOriginal: 'Fagnes', alternativeName: 'Pif-Paf', priority: 2, minZoom: 13.2, ...formula1CornerNamesSource },
  { kind: 'corner_group', anchorIndex: turnIndices[13], labelOffset: [-0.0015, -0.0015], turnNumbers: [14], nameRu: 'Кампюс', nameOriginal: 'Campus', priority: 3, minZoom: 14.4, ...formula1CornerNamesSource },
  { kind: 'corner_group', anchorIndex: turnIndices[14], labelOffset: [-0.0024, -0.001], turnNumbers: [15], nameRu: 'Поворот Поля Фрера', nameOriginal: 'Courbe Paul Frère', priority: 3, minZoom: 14.4, ...formula1CornerNamesSource },
  { kind: 'corner_group', anchorIndex: turnIndices[15], labelOffset: [-0.0013, -0.00055], turnNumbers: [16, 17], nameRu: 'Бланшимон', nameOriginal: 'Blanchimont', priority: 1, minZoom: 12.2, ...formula1CornerNamesSource },
  { kind: 'corner_group', anchorIndex: turnIndices[17], labelOffset: [-0.0024, -0.00135], turnNumbers: [18, 19], nameRu: 'Шикана «Бас-стоп»', nameOriginal: 'Bus Stop Chicane', priority: 1, minZoom: 12.2, ...formula1CornerNamesSource },
  { kind: 'straight', anchorIndex: 151, labelOffset: [-0.0038, 0.001], turnNumbers: [19, 1], nameRu: 'Старт-финишная прямая', nameOriginal: 'Start/Finish Straight', priority: 1, minZoom: 12.2, ...spaOperatorMapSource },
];

const namedTrackLabelPosition = (anchorIndex: number, labelOffset: [number, number]): [number, number] => {
  const [longitude, latitude] = point(anchorIndex);
  return [longitude + labelOffset[0], latitude + labelOffset[1]];
};

export const spaNamedTrackFeatures: GeoJSON.FeatureCollection<GeoJSON.Point, SpaNamedTrackFeatureProperties> = {
  type: 'FeatureCollection',
  features: namedTrackDefinitions.map(({ anchorIndex: _anchorIndex, labelOffset: _labelOffset, ...properties }) => ({
    type: 'Feature',
    properties,
    geometry: { type: 'Point', coordinates: namedTrackLabelPosition(_anchorIndex, _labelOffset) },
  })),
};

export const spaNamedTrackLeaders: GeoJSON.FeatureCollection<GeoJSON.LineString, SpaNamedTrackFeatureProperties> = {
  type: 'FeatureCollection',
  features: namedTrackDefinitions.map(({ anchorIndex, labelOffset, ...properties }) => ({
    type: 'Feature',
    properties,
    geometry: { type: 'LineString', coordinates: [point(anchorIndex), namedTrackLabelPosition(anchorIndex, labelOffset)] },
  })),
};

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
  namedTrackFeatures: spaNamedTrackFeatures,
  namedTrackLeaders: spaNamedTrackLeaders,
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
