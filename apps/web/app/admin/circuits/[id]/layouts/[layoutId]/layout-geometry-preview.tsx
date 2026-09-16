export function LayoutGeometryPreview({ geometry, label = 'Предпросмотр существующего контура конфигурации', caption }: {
  geometry: { type: 'LineString'; coordinates: number[][] } | null;
  label?: string;
  caption?: string;
}) {
  const coordinates = geometry?.coordinates.filter((point) => point.length >= 2 && point.every(Number.isFinite)) ?? [];
  if (coordinates.length < 2) return <div className="admin-layout-geometry-empty"><strong>Контур не загружен</strong><span>Сначала сохраните конфигурацию-кандидат. Импорт и проверка GeoJSON будут следующим подэтапом</span></div>;
  const samplingStep = Math.max(1, Math.ceil(coordinates.length / 2_500));
  const renderedCoordinates = samplingStep === 1 ? coordinates : coordinates.filter((_, index) => index % samplingStep === 0 || index === coordinates.length - 1);
  const xs = renderedCoordinates.map((point) => point[0]);
  const ys = renderedCoordinates.map((point) => point[1]);
  const minX = Math.min(...xs); const maxX = Math.max(...xs);
  const minY = Math.min(...ys); const maxY = Math.max(...ys);
  const width = Math.max(maxX - minX, 0.000001); const height = Math.max(maxY - minY, 0.000001);
  const padding = 12;
  const points = renderedCoordinates.map(([x, y]) => {
    const px = padding + ((x - minX) / width) * (100 - padding * 2);
    const py = padding + (1 - (y - minY) / height) * (100 - padding * 2);
    return `${px.toFixed(3)},${py.toFixed(3)}`;
  });
  const path = points.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point}`).join(' ');
  return <div className="admin-layout-geometry-preview">
    <svg viewBox="0 0 100 100" role="img" aria-label={label} preserveAspectRatio="xMidYMid meet">
      <rect x="0" y="0" width="100" height="100" fill="#030c13" />
      <path d="M 10 10 H 90 M 10 30 H 90 M 10 50 H 90 M 10 70 H 90 M 10 90 H 90 M 10 10 V 90 M 30 10 V 90 M 50 10 V 90 M 70 10 V 90 M 90 10 V 90" className="admin-layout-grid" />
      <path d={path} className="admin-layout-line" fill="none" stroke="#ff2748" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
    </svg>
    <span>{coordinates.length.toLocaleString('ru-RU')} точек · {caption ?? 'сохранено в PostGIS'}</span>
  </div>;
}
