type GeometryType = GeoJSON.Geometry['type'];

type GeoJsonContractOptions = {
  label: string;
  allowedGeometryTypes?: readonly GeometryType[];
  requireFeatureId?: boolean;
};

function fail(label: string, path: string, message: string): never {
  throw new Error(`Некорректный GeoJSON «${label}»: ${path} ${message}`);
}

function object(value: unknown, label: string, path: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(label, path, 'должен быть объектом');
  return value as Record<string, unknown>;
}

function list(value: unknown, label: string, path: string): unknown[] {
  if (!Array.isArray(value)) fail(label, path, 'должен быть массивом');
  return value;
}

function position(value: unknown, label: string, path: string) {
  const coordinates = list(value, label, path);
  if (coordinates.length < 2) fail(label, path, 'должен содержать долготу и широту');
  const [longitude, latitude] = coordinates;
  if (typeof longitude !== 'number' || !Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
    fail(label, `${path}[0]`, 'содержит некорректную долготу');
  }
  if (typeof latitude !== 'number' || !Number.isFinite(latitude) || latitude < -90 || latitude > 90) {
    fail(label, `${path}[1]`, 'содержит некорректную широту');
  }
}

function line(value: unknown, label: string, path: string, minimum = 2) {
  const coordinates = list(value, label, path);
  if (coordinates.length < minimum) fail(label, path, `должен содержать минимум ${minimum} координаты`);
  coordinates.forEach((item, index) => position(item, label, `${path}[${index}]`));
  return coordinates;
}

function polygon(value: unknown, label: string, path: string) {
  const rings = list(value, label, path);
  if (rings.length === 0) fail(label, path, 'должен содержать хотя бы одно кольцо');
  rings.forEach((item, index) => {
    const ring = line(item, label, `${path}[${index}]`, 4);
    const first = ring[0] as unknown[];
    const last = ring.at(-1) as unknown[];
    if (first[0] !== last[0] || first[1] !== last[1]) fail(label, `${path}[${index}]`, 'должен быть замкнут');
  });
}

function geometry(value: unknown, label: string, path: string, allowed?: ReadonlySet<GeometryType>) {
  const item = object(value, label, path);
  const type = item.type as GeometryType;
  if (allowed && !allowed.has(type)) fail(label, `${path}.type`, `имеет недопустимое значение ${String(type)}`);
  switch (type) {
    case 'Point': position(item.coordinates, label, `${path}.coordinates`); break;
    case 'MultiPoint':
    case 'LineString': line(item.coordinates, label, `${path}.coordinates`); break;
    case 'MultiLineString': list(item.coordinates, label, `${path}.coordinates`).forEach((item, index) => line(item, label, `${path}.coordinates[${index}]`)); break;
    case 'Polygon': polygon(item.coordinates, label, `${path}.coordinates`); break;
    case 'MultiPolygon': list(item.coordinates, label, `${path}.coordinates`).forEach((item, index) => polygon(item, label, `${path}.coordinates[${index}]`)); break;
    default: fail(label, `${path}.type`, `имеет неподдерживаемое значение ${String(type)}`);
  }
}

export function parseGeoJsonFeatureCollection(
  value: unknown,
  options: GeoJsonContractOptions,
): GeoJSON.FeatureCollection<GeoJSON.Geometry, Record<string, unknown>> {
  const root = object(value, options.label, 'root');
  if (root.type !== 'FeatureCollection') fail(options.label, 'root.type', 'должен иметь значение FeatureCollection');
  const features = list(root.features, options.label, 'root.features');
  const allowed = options.allowedGeometryTypes ? new Set(options.allowedGeometryTypes) : undefined;
  const ids = new Set<string>();
  features.forEach((value, index) => {
    const feature = object(value, options.label, `features[${index}]`);
    if (feature.type !== 'Feature') fail(options.label, `features[${index}].type`, 'должен иметь значение Feature');
    const properties = object(feature.properties, options.label, `features[${index}].properties`);
    const id = properties.id;
    if (options.requireFeatureId && (typeof id !== 'string' || id.length === 0)) {
      fail(options.label, `features[${index}].properties.id`, 'должен быть непустой строкой');
    }
    if (typeof id === 'string') {
      if (ids.has(id)) fail(options.label, `features[${index}].properties.id`, `дублирует идентификатор ${id}`);
      ids.add(id);
    }
    geometry(feature.geometry, options.label, `features[${index}].geometry`, allowed);
  });
  return value as GeoJSON.FeatureCollection<GeoJSON.Geometry, Record<string, unknown>>;
}
