const EARTH_RADIUS_METRES = 6_371_000;

function cloneCoordinate(coordinate) {
  return [coordinate[0], coordinate[1]];
}

function coordinatesEqual(first, second) {
  return first[0] === second[0] && first[1] === second[1];
}

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

export function validateCoordinate(coordinate, label = 'coordinate') {
  if (!Array.isArray(coordinate) || coordinate.length !== 2) {
    throw new TypeError(`${label} must be a [longitude, latitude] coordinate`);
  }
  const [longitude, latitude] = coordinate;
  if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) {
    throw new TypeError(`${label} longitude and latitude must be finite numbers`);
  }
  if (longitude < -180 || longitude > 180 || latitude < -90 || latitude > 90) {
    throw new RangeError(`${label} is outside valid longitude/latitude bounds`);
  }
  return [longitude, latitude];
}

export function validateLineString(lineString, label = 'lineString') {
  if (!lineString || lineString.type !== 'LineString' || !Array.isArray(lineString.coordinates)) {
    throw new TypeError(`${label} must be a GeoJSON LineString`);
  }
  if (lineString.coordinates.length < 2) {
    throw new RangeError(`${label} must contain at least two coordinates`);
  }
  return {
    type: 'LineString',
    coordinates: lineString.coordinates.map((coordinate, index) => (
      validateCoordinate(coordinate, `${label}.coordinates[${index}]`)
    )),
  };
}

export function haversineDistanceMetres(firstCoordinate, secondCoordinate) {
  const [firstLongitude, firstLatitude] = validateCoordinate(firstCoordinate, 'firstCoordinate');
  const [secondLongitude, secondLatitude] = validateCoordinate(secondCoordinate, 'secondCoordinate');
  const toRadians = (degrees) => degrees * Math.PI / 180;
  const latitudeDelta = toRadians(secondLatitude - firstLatitude);
  const longitudeDelta = toRadians(secondLongitude - firstLongitude);
  const firstLatitudeRadians = toRadians(firstLatitude);
  const secondLatitudeRadians = toRadians(secondLatitude);
  const haversine = Math.sin(latitudeDelta / 2) ** 2
    + Math.cos(firstLatitudeRadians) * Math.cos(secondLatitudeRadians)
      * Math.sin(longitudeDelta / 2) ** 2;
  const boundedHaversine = clamp(haversine, 0, 1);
  return EARTH_RADIUS_METRES * 2
    * Math.atan2(Math.sqrt(boundedHaversine), Math.sqrt(1 - boundedHaversine));
}

export function cumulativeLineLengthsMetres(lineString) {
  const { coordinates } = validateLineString(lineString);
  const cumulative = [0];
  for (let index = 1; index < coordinates.length; index += 1) {
    cumulative.push(cumulative[index - 1] + haversineDistanceMetres(coordinates[index - 1], coordinates[index]));
  }
  return cumulative;
}

export function nearestLineStringEndpoint(lineString, targetCoordinate) {
  const { coordinates } = validateLineString(lineString);
  const target = validateCoordinate(targetCoordinate, 'targetCoordinate');
  const startDistanceMetres = haversineDistanceMetres(coordinates[0], target);
  const endDistanceMetres = haversineDistanceMetres(coordinates.at(-1), target);
  const side = startDistanceMetres <= endDistanceMetres ? 'start' : 'end';
  return {
    side,
    index: side === 'start' ? 0 : coordinates.length - 1,
    distanceMetres: side === 'start' ? startDistanceMetres : endDistanceMetres,
    startDistanceMetres,
    endDistanceMetres,
  };
}

function closestSpliceIndex(cumulativeLengths, side, desiredReplacementMetres) {
  const totalMetres = cumulativeLengths.at(-1);
  const lastIndex = cumulativeLengths.length - 1;
  let bestIndex = side === 'start' ? 1 : 0;
  let bestDifference = Infinity;
  const firstCandidate = side === 'start' ? 1 : 0;
  const lastCandidate = side === 'start' ? lastIndex : lastIndex - 1;
  for (let index = firstCandidate; index <= lastCandidate; index += 1) {
    const replacementMetres = side === 'start'
      ? cumulativeLengths[index]
      : totalMetres - cumulativeLengths[index];
    const difference = Math.abs(replacementMetres - desiredReplacementMetres);
    if (difference < bestDifference) {
      bestIndex = index;
      bestDifference = difference;
    }
  }
  return bestIndex;
}

export function prepareRouteTailReplacement(lineString, targetCoordinate) {
  const validatedLineString = validateLineString(lineString);
  const coordinates = validatedLineString.coordinates;
  const target = validateCoordinate(targetCoordinate, 'targetCoordinate');
  const endpoint = nearestLineStringEndpoint(validatedLineString, target);
  const cumulativeLengths = cumulativeLineLengthsMetres(validatedLineString);
  const totalMetres = cumulativeLengths.at(-1);
  const desiredReplacementMetres = clamp(totalMetres * 0.12, 300, 3_000);
  const spliceIndex = closestSpliceIndex(cumulativeLengths, endpoint.side, desiredReplacementMetres);
  const spliceCoordinate = cloneCoordinate(coordinates[spliceIndex]);
  const replacedOldMetres = endpoint.side === 'start'
    ? cumulativeLengths[spliceIndex]
    : totalMetres - cumulativeLengths[spliceIndex];
  const keptMetres = totalMetres - replacedOldMetres;

  return {
    side: endpoint.side,
    endpoint,
    spliceIndex,
    spliceCoordinate,
    targetCoordinate: cloneCoordinate(target),
    routingCoordinates: endpoint.side === 'start'
      ? [cloneCoordinate(target), cloneCoordinate(spliceCoordinate)]
      : [cloneCoordinate(spliceCoordinate), cloneCoordinate(target)],
    originalLineString: validatedLineString,
    metrics: {
      totalMetres,
      keptMetres,
      desiredReplacementMetres,
      replacedOldMetres,
    },
  };
}

export function mergeRoutedTail(preparation, routedTailLineString) {
  if (!preparation || !['start', 'end'].includes(preparation.side)) {
    throw new TypeError('preparation must be returned by prepareRouteTailReplacement');
  }
  const original = validateLineString(preparation.originalLineString, 'preparation.originalLineString');
  const routed = validateLineString(routedTailLineString, 'routedTailLineString');
  const splice = validateCoordinate(preparation.spliceCoordinate, 'preparation.spliceCoordinate');
  const target = validateCoordinate(preparation.targetCoordinate, 'preparation.targetCoordinate');
  if (!Number.isInteger(preparation.spliceIndex)
    || preparation.spliceIndex < 0
    || preparation.spliceIndex >= original.coordinates.length) {
    throw new RangeError('preparation.spliceIndex is outside the original LineString');
  }

  const routeSpliceCoordinate = preparation.side === 'start'
    ? routed.coordinates.at(-1)
    : routed.coordinates[0];
  const routeTargetCoordinate = preparation.side === 'start'
    ? routed.coordinates[0]
    : routed.coordinates.at(-1);
  const seamGapMetres = haversineDistanceMetres(routeSpliceCoordinate, splice);
  const endpointDistanceMetres = haversineDistanceMetres(routeTargetCoordinate, target);
  const routedLengths = cumulativeLineLengthsMetres(routed);
  const replacedNewMetres = routedLengths.at(-1);
  const preservedCoordinates = preparation.side === 'start'
    ? original.coordinates.slice(preparation.spliceIndex)
    : original.coordinates.slice(0, preparation.spliceIndex + 1);
  const duplicateSplice = coordinatesEqual(routeSpliceCoordinate, splice);
  const mergedCoordinates = preparation.side === 'start'
    ? [
      ...routed.coordinates.map(cloneCoordinate),
      ...(duplicateSplice ? preservedCoordinates.slice(1) : preservedCoordinates).map(cloneCoordinate),
    ]
    : [
      ...preservedCoordinates.map(cloneCoordinate),
      ...(duplicateSplice ? routed.coordinates.slice(1) : routed.coordinates).map(cloneCoordinate),
    ];

  return {
    lineString: { type: 'LineString', coordinates: mergedCoordinates },
    metrics: {
      totalMetres: preparation.metrics.totalMetres,
      keptMetres: preparation.metrics.keptMetres,
      replacedOldMetres: preparation.metrics.replacedOldMetres,
      replacedNewMetres,
      seamGapMetres,
      endpointDistanceMetres,
      newTotalMetres: preparation.metrics.keptMetres + seamGapMetres + replacedNewMetres,
    },
  };
}
