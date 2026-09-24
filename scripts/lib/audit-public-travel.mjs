const coordinatesAreValid = (coordinates) => Array.isArray(coordinates)
  && coordinates.length === 2
  && Number.isFinite(coordinates[0]) && coordinates[0] >= -180 && coordinates[0] <= 180
  && Number.isFinite(coordinates[1]) && coordinates[1] >= -90 && coordinates[1] <= 90;

const ringIsValid = (ring) => Array.isArray(ring) && ring.length >= 4
  && ring.every(coordinatesAreValid)
  && ring[0][0] === ring.at(-1)[0] && ring[0][1] === ring.at(-1)[1]
  && new Set(ring.slice(0, -1).map((point) => point.join(','))).size >= 3;
const polygonIsValid = (polygon) => Array.isArray(polygon) && polygon.length > 0 && polygon.every(ringIsValid);
const zoneGeometryIsValid = (geometry) => geometry?.type === 'Polygon'
  ? polygonIsValid(geometry.coordinates)
  : geometry?.type === 'MultiPolygon' && Array.isArray(geometry.coordinates)
    && geometry.coordinates.length > 0 && geometry.coordinates.every(polygonIsValid);

export function auditPublicTravelCollection(collection) {
  const issues = [];
  const counts = { poi: 0, zones: 0, routes: 0 };
  if (collection?.type !== 'FeatureCollection' || !Array.isArray(collection.features)) {
    return { counts, issues: ['Ожидался GeoJSON FeatureCollection с массивом features'] };
  }

  const ids = new Set();
  for (const [index, feature] of collection.features.entries()) {
    const properties = feature?.properties ?? {};
    const id = typeof properties.id === 'string' ? properties.id : '';
    const label = id || `объект ${index + 1}`;
    if (!id) issues.push(`${label}: отсутствует ID`);
    else if (ids.has(id)) issues.push(`${label}: повторяющийся ID`);
    ids.add(id);

    if (properties.featureType === 'route') {
      counts.routes += 1;
      if (properties.reviewStatus !== 'published') issues.push(`${label}: неопубликованный маршрут попал в публичный слой`);
      if (properties.lifecycle !== 'active') issues.push(`${label}: неактивный маршрут попал в публичный слой`);
      const points = feature.geometry?.type === 'LineString' ? feature.geometry.coordinates : null;
      if (!Array.isArray(points) || points.length < 2 || !points.every(coordinatesAreValid)
        || !points.some((point) => point[0] !== points[0][0] || point[1] !== points[0][1])) {
        issues.push(`${label}: некорректная линия маршрута`);
      }
      if (!Number.isFinite(properties.distanceM) || properties.distanceM <= 0
        || !Number.isFinite(properties.durationMinutes) || properties.durationMinutes <= 0) {
        issues.push(`${label}: отсутствуют корректные расстояние и время в пути`);
      }
      if (!Array.isArray(properties.stops) || !properties.stops.every((stop) => typeof stop === 'string' && stop.trim())) {
        issues.push(`${label}: остановки должны быть массивом подписей`);
      }
      const minZoom = properties.minZoom ?? 0;
      const maxZoom = properties.maxZoom ?? 24;
      if (!Number.isFinite(minZoom) || !Number.isFinite(maxZoom) || minZoom < 0 || maxZoom > 24 || minZoom > maxZoom) {
        issues.push(`${label}: некорректный диапазон масштаба`);
      }
      if (properties.visibleByDefault !== undefined && typeof properties.visibleByDefault !== 'boolean') {
        issues.push(`${label}: параметр показа по умолчанию должен быть логическим`);
      }
      if (typeof properties.color !== 'string' || !/^#[0-9a-f]{6}$/i.test(properties.color)
        || !Number.isFinite(properties.lineOffset) || properties.lineOffset < -24 || properties.lineOffset > 24) {
        issues.push(`${label}: некорректное оформление линии`);
      }
    } else if (properties.featureType === 'poi') {
      counts.poi += 1;
      if (!['reviewed', 'published'].includes(properties.reviewStatus)) issues.push(`${label}: непроверенная точка попала в публичный слой`);
      if (feature.geometry?.type !== 'Point' || !coordinatesAreValid(feature.geometry.coordinates)) issues.push(`${label}: некорректная координата точки`);
    } else if (properties.featureType === 'accommodation_zone') {
      counts.zones += 1;
      if (!['reviewed', 'published'].includes(properties.reviewStatus)) issues.push(`${label}: непроверенная зона попала в публичный слой`);
      if (!zoneGeometryIsValid(feature.geometry)) issues.push(`${label}: зона должна иметь непустую корректную полигональную геометрию`);
    } else issues.push(`${label}: неизвестный тип туристического объекта`);
  }

  for (const key of Object.keys(counts)) {
    if (collection.properties?.counts?.[key] !== undefined && collection.properties.counts[key] !== counts[key]) {
      issues.push(`Счётчик ${key} не совпадает с объектами GeoJSON`);
    }
  }
  return { counts, issues };
}
