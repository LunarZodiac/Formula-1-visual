export type TrackCoordinate = [number, number];
type Snap = { point: TrackCoordinate; segment: number; position: number };

function samePoint(a: TrackCoordinate, b: TrackCoordinate) {
  return Math.abs(a[0] - b[0]) < 1e-7 && Math.abs(a[1] - b[1]) < 1e-7;
}

function validPoint(value: number[]): value is TrackCoordinate {
  return value.length === 2 && Number.isFinite(value[0]) && Number.isFinite(value[1])
    && Math.abs(value[0]) <= 180 && Math.abs(value[1]) <= 90;
}

export function snapToCenterline(centerline: TrackCoordinate[], candidate: TrackCoordinate): Snap {
  if (centerline.length < 2 || !validPoint(candidate)) throw new Error('Некорректная ось трассы или точка');
  const longitudeScale = Math.cos(candidate[1] * Math.PI / 180);
  let nearest: Snap | null = null;
  let shortest = Number.POSITIVE_INFINITY;
  for (let index = 0; index < centerline.length - 1; index += 1) {
    const start = centerline[index], end = centerline[index + 1];
    const dx = (end[0] - start[0]) * longitudeScale, dy = end[1] - start[1];
    const denominator = dx * dx + dy * dy;
    if (denominator === 0) continue;
    const fraction = Math.max(0, Math.min(1, (((candidate[0] - start[0]) * longitudeScale) * dx + (candidate[1] - start[1]) * dy) / denominator));
    const point: TrackCoordinate = [start[0] + (end[0] - start[0]) * fraction, start[1] + (end[1] - start[1]) * fraction];
    const distance = ((candidate[0] - point[0]) * longitudeScale) ** 2 + (candidate[1] - point[1]) ** 2;
    if (distance < shortest) { shortest = distance; nearest = { point, segment: index, position: index + fraction }; }
  }
  if (!nearest) throw new Error('Ось трассы не содержит отрезков');
  return nearest;
}

function slice(centerline: TrackCoordinate[], start: Snap, end: Snap): TrackCoordinate[] {
  const raw = [start.point, ...centerline.slice(start.segment + 1, end.segment + 1), end.point];
  return raw.filter((point, index) => index === 0 || !samePoint(point, raw[index - 1]));
}

function rotatedCenterline(centerlineInput: number[][], startFinish: TrackCoordinate): TrackCoordinate[] {
  if (centerlineInput.length < 4 || centerlineInput.some(point => !validPoint(point))) throw new Error('Нужна корректная замкнутая ось трассы');
  const centerline = centerlineInput.map(point => [point[0], point[1]] as TrackCoordinate);
  if (!samePoint(centerline[0], centerline[centerline.length - 1])) throw new Error('Ось трассы должна быть замкнута');
  const startPoint = snapToCenterline(centerline, startFinish);
  return samePoint(startPoint.point, centerline[0]) ? centerline : [startPoint.point, ...centerline.slice(startPoint.segment + 1, -1),
    ...centerline.slice(0, startPoint.segment + 1), startPoint.point];
}

export function previewFirstTrackSector(centerlineInput: number[][], startFinish: TrackCoordinate, firstBoundary: TrackCoordinate): TrackCoordinate[] {
  const rotated = rotatedCenterline(centerlineInput, startFinish);
  const first = snapToCenterline(rotated, firstBoundary);
  if (first.position <= 0 || first.position >= rotated.length - 1) throw new Error('Конец S1 должен находиться после старта по направлению оси трассы');
  return slice(rotated, { point: rotated[0], segment: 0, position: 0 }, first);
}

export function segmentTrackIntoSectors(centerlineInput: number[][], startFinish: TrackCoordinate, firstBoundary: TrackCoordinate, secondBoundary: TrackCoordinate): TrackCoordinate[][] {
  const rotated = rotatedCenterline(centerlineInput, startFinish);
  const first = snapToCenterline(rotated, firstBoundary);
  const second = snapToCenterline(rotated, secondBoundary);
  const start: Snap = { point: rotated[0], segment: 0, position: 0 };
  const finish: Snap = { point: rotated[rotated.length - 1], segment: rotated.length - 2, position: rotated.length - 1 };
  if (first.position <= 0 || first.position >= second.position || second.position >= finish.position) {
    throw new Error('Поставьте две разные границы по направлению оси трассы, после линии старта');
  }
  const sectors = [slice(rotated, start, first), slice(rotated, first, second), slice(rotated, second, finish)];
  if (sectors.some(points => points.length < 2 || points.every(point => samePoint(point, points[0])))) {
    throw new Error('Каждый сектор должен содержать ненулевой участок трассы');
  }
  return sectors;
}
