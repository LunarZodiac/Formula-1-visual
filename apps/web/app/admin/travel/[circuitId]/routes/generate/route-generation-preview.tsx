'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import * as maplibregl from 'maplibre-gl';
import type { AdminTravelRouteGenerationPreview } from '../../../../../lib/admin-database';
import { addAtlasMapAttribution } from '../../../../../lib/map-attribution';
import 'maplibre-gl/dist/maplibre-gl.css';
import styles from './route-generator.module.css';

type Suggestion = AdminTravelRouteGenerationPreview['suggestions'][number] & { routeVariantKind?: string };
type RouteFeature = GeoJSON.Feature<GeoJSON.LineString>;

const typeLabels: Record<string, string> = {
  arrival: 'Прибытие',
  tourist_half_day: 'Туристический маршрут на полдня',
  tourist_full_day: 'Туристический маршрут на полный день',
};
const variantLabels: Record<string, string> = {
  recommended: 'Рекомендуемый',
  fastest: 'Быстрее среди альтернатив',
  shortest: 'Короче среди альтернатив',
  loop: 'Кольцевой',
  manual: 'Ручной',
};
const mapStyle: maplibregl.StyleSpecification = {
  version: 8,
  sources: { streets: { type: 'vector', url: 'https://tiles.openfreemap.org/planet', attribution: '&copy; OpenStreetMap contributors &copy; OpenFreeMap' } },
  layers: [
    { id: 'background', type: 'background', paint: { 'background-color': '#0c1b24' } },
    { id: 'land', type: 'fill', source: 'streets', 'source-layer': 'landcover', paint: { 'fill-color': '#132a31', 'fill-opacity': .96 } },
    { id: 'water', type: 'fill', source: 'streets', 'source-layer': 'water', paint: { 'fill-color': '#02090e' } },
    { id: 'roads', type: 'line', source: 'streets', 'source-layer': 'transportation', paint: { 'line-color': '#718690', 'line-width': ['interpolate', ['linear'], ['zoom'], 5, .25, 14, 2], 'line-opacity': .35 } },
  ],
};

function distance(value: number) {
  return `${(value / 1000).toLocaleString('ru-RU', { maximumFractionDigits: 1 })} км`;
}

function routeFeature(value: string): RouteFeature | null {
  try {
    const parsed = JSON.parse(value) as GeoJSON.LineString | RouteFeature;
    const geometry = parsed.type === 'Feature' ? parsed.geometry : parsed;
    if (geometry.type !== 'LineString' || geometry.coordinates.length < 2) return null;
    if (!geometry.coordinates.every((point) => point.length >= 2 && point.every(Number.isFinite))) return null;
    return { type: 'Feature', properties: {}, geometry };
  } catch { return null; }
}

function RouteMap({ route }: { route: Suggestion }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const geometry = useMemo(() => routeFeature(route.geometryGeoJson), [route.geometryGeoJson]);
  useEffect(() => {
    if (!containerRef.current || !geometry) return undefined;
    const first = geometry.geometry.coordinates[0] as [number, number];
    const last = geometry.geometry.coordinates.at(-1) as [number, number];
    const map = new maplibregl.Map({ container: containerRef.current, style: mapStyle, center: first, zoom: 11, minZoom: 2, maxZoom: 18, renderWorldCopies: false, attributionControl: false });
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
    addAtlasMapAttribution(map);
    map.on('load', () => {
      map.addSource('generated-route', { type: 'geojson', data: geometry });
      map.addLayer({ id: 'generated-route-outline', type: 'line', source: 'generated-route', paint: { 'line-color': '#07131b', 'line-width': 8, 'line-opacity': .8 } });
      map.addLayer({ id: 'generated-route-line', type: 'line', source: 'generated-route', paint: { 'line-color': '#ff3158', 'line-width': 5, 'line-opacity': .95 } });
      map.addSource('generated-route-ends', { type: 'geojson', data: { type: 'FeatureCollection', features: [
        { type: 'Feature', properties: { kind: 'start' }, geometry: { type: 'Point', coordinates: first } },
        { type: 'Feature', properties: { kind: 'finish' }, geometry: { type: 'Point', coordinates: last } },
      ] } });
      map.addLayer({ id: 'generated-route-ends', type: 'circle', source: 'generated-route-ends', paint: { 'circle-color': ['match', ['get', 'kind'], 'start', '#7fd98a', '#ff3158'], 'circle-radius': 7, 'circle-stroke-color': '#ffffff', 'circle-stroke-width': 2 } });
      const bounds = new maplibregl.LngLatBounds(first, first);
      geometry.geometry.coordinates.forEach((point) => bounds.extend(point as [number, number]));
      map.fitBounds(bounds, { padding: 48, maxZoom: 15, duration: 0 });
    });
    return () => map.remove();
  }, [geometry]);
  if (!geometry) return <div className={styles.mapFallback}>Линия маршрута отсутствует или не распознана</div>;
  return <div ref={containerRef} className={styles.routeMap} aria-label={`Линия маршрута «${route.nameRu}»`} />;
}

export function RouteGenerationPreview({ suggestions }: { suggestions: Suggestion[] }) {
  const [focusedId, setFocusedId] = useState(suggestions[0]?.id ?? null);
  const [selectedIds, setSelectedIds] = useState(() => new Set(suggestions.map((route) => route.id)));
  const focused = suggestions.find((route) => route.id === focusedId) ?? suggestions[0] ?? null;
  if (!focused) return <p className="admin-directory-empty">Подходящие маршруты пока не сформированы. Причины указаны выше</p>;
  const selectedCount = suggestions.reduce((count, route) => count + (selectedIds.has(route.id) ? 1 : 0), 0);
  const selectAll = () => setSelectedIds(new Set(suggestions.map((route) => route.id)));
  const selectNone = () => setSelectedIds(new Set());
  return <div className={styles.previewLayout}>
    <section className={styles.previewMapPanel}>
      <header>
        <div><span>{variantLabels[focused.routeVariantKind ?? 'recommended'] ?? focused.routeVariantKind ?? 'Рекомендуемый'}</span><strong>{focused.nameRu}</strong></div>
        <dl><div><dt>Остановок</dt><dd>{focused.stops.length}</dd></div><div><dt>Расстояние</dt><dd>{distance(focused.distanceM)}</dd></div><div><dt>Время</dt><dd>{focused.durationMinutes} мин</dd></div></dl>
      </header>
      <RouteMap key={focused.id} route={focused} />
      <p className={styles.variantNote}>Это предварительный расчёт, а не готовый маршрут для сайта. Сохраните подходящий вариант кандидатом, затем откройте его карточку и проверьте остановки, линию, конечную точку и источники перед публикацией</p>
      <p className={styles.stopSequence}>{focused.stops.map((stop) => stop.nameRu).join(' → ')}</p>
      {focused.routeVariantKind === 'fastest' || focused.routeVariantKind === 'shortest' ? <p className={styles.variantNote}>Сравнение выполнено только среди альтернатив, предложенных сервисом маршрутизации; это не гарантированный глобальный оптимум</p> : null}
    </section>
    <div className={styles.suggestionList} aria-label="Рассчитанные маршруты">
      <div className={styles.selectionToolbar}>
        <span>Выбрано: {selectedCount} из {suggestions.length}</span>
        <div className={styles.selectionActions}>
          <button type="button" onClick={selectAll} disabled={selectedCount === suggestions.length}>Выбрать все</button>
          <button type="button" onClick={selectNone} disabled={selectedCount === 0}>Снять выбор</button>
        </div>
      </div>
      {suggestions.map((route) => <article key={route.id} className={`${styles.suggestionCard} ${route.id === focused.id ? styles.isFocused : ''}`}>
        <label className={styles.suggestionChoice}>
          <input type="checkbox" name="routeId" value={route.id} checked={selectedIds.has(route.id)} onChange={() => setSelectedIds((current) => {
            const next = new Set(current);
            if (next.has(route.id)) next.delete(route.id); else next.add(route.id);
            return next;
          })} aria-label={`Сохранить ${route.nameRu}`} />
          <span>Сохранить</span>
        </label>
        <button type="button" className={styles.suggestionFocus} onClick={() => setFocusedId(route.id)} aria-pressed={route.id === focused.id}>
          <span>{typeLabels[route.routeType] ?? route.routeType}</span>
          <strong>{route.nameRu}</strong>
          <small>{route.summaryRu}</small>
          <span className={styles.variantBadge}>{variantLabels[route.routeVariantKind ?? 'recommended'] ?? route.routeVariantKind ?? 'Рекомендуемый'}</span>
          <span className={styles.cardMetrics}>{route.stops.length} остановок · {distance(route.distanceM)} · {route.durationMinutes} мин</span>
        </button>
      </article>)}
    </div>
  </div>;
}
