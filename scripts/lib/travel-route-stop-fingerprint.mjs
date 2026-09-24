const optionalText = value => typeof value === 'string' && value.trim() ? value.trim() : null;

export function normalizeTravelRouteStop(stop, sequence) {
  const poiId = optionalText(stop?.poiId);
  const nameRu = optionalText(stop?.nameRu);
  const instructionRu = optionalText(stop?.instructionRu);
  const dwellMinutes = stop?.dwellMinutes === null ? null : Number(stop?.dwellMinutes);
  const parsedLongitude = Number(stop?.longitude), parsedLatitude = Number(stop?.latitude);
  const longitude = poiId || stop?.longitude === null || stop?.longitude === '' || !Number.isFinite(parsedLongitude) ? null : parsedLongitude;
  const latitude = poiId || stop?.latitude === null || stop?.latitude === '' || !Number.isFinite(parsedLatitude) ? null : parsedLatitude;
  if (!Number.isInteger(sequence) || sequence < 1 || (dwellMinutes !== null && (!Number.isInteger(dwellMinutes) || dwellMinutes < 0))
    || (!poiId && (!Number.isFinite(longitude) || !Number.isFinite(latitude) || longitude < -180 || longitude > 180 || latitude < -90 || latitude > 90)))
    throw new Error('Некорректная остановка маршрута');
  return { sequence, poiId, nameRu, longitude, latitude, dwellMinutes, instructionRu };
}

export function travelRouteStopsChanged(previous, next) {
  return JSON.stringify(previous) !== JSON.stringify(next);
}
