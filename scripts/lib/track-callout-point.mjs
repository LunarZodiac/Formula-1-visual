export function normalizeTrackCalloutPoint(raw, annotationType) {
  if (raw === null || raw === undefined || raw === '') return null;
  if (annotationType !== 'turn' && annotationType !== 'straight') {
    throw new Error('Выносная подпись разрешена только для поворота или прямой');
  }
  let point;
  try { point = typeof raw === 'string' ? JSON.parse(raw) : raw; }
  catch { throw new Error('Некорректная координата выносной подписи'); }
  if (!Array.isArray(point) || point.length !== 2 || !Number.isFinite(point[0]) || Math.abs(point[0]) > 180
    || !Number.isFinite(point[1]) || Math.abs(point[1]) > 90) {
    throw new Error('Некорректная координата выносной подписи');
  }
  return point;
}
