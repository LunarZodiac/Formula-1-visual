'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import * as maplibregl from 'maplibre-gl';
import type { GeoJSONSource, Map as MapLibreMap, StyleSpecification } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { addAtlasMapAttribution } from '../../../../../lib/map-attribution';
import { previewTravelRouteGeometry } from '../../../../actions';
import { ROUTE_STOPS_CHANGED } from './route-stops-editor';

type Point = [number, number];
type Mode = 'routed' | 'waypoints' | 'freehand';
type MapPoint = { id: string; name: string; reviewStatus: string; longitude: number; latitude: number };
type ExistingRoute = { id: string; nameRu: string; reviewStatus: string; lifecycle: string; geometryGeoJson: string };
type TrackCenterline = { type: 'LineString'; coordinates: number[][] } | null;
type LineFeature = { type: 'Feature'; properties: Record<string, never>; geometry: { type: 'LineString'; coordinates: Point[] } };
const empty = { type: 'FeatureCollection' as const, features: [] };
const style: StyleSpecification = { version: 8, glyphs: 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf', sources: { streets: { type: 'vector', url: 'https://tiles.openfreemap.org/planet', attribution: '&copy; OpenStreetMap contributors &copy; OpenFreeMap' } }, layers: [
  { id: 'background', type: 'background', paint: { 'background-color': '#0c1b24' } },
  { id: 'water', type: 'fill', source: 'streets', 'source-layer': 'water', paint: { 'fill-color': '#02090e' } },
  { id: 'roads', type: 'line', source: 'streets', 'source-layer': 'transportation', paint: { 'line-color': '#718690', 'line-width': ['interpolate', ['linear'], ['zoom'], 5, .3, 14, 2], 'line-opacity': .45 } },
  { id: 'road-labels', type: 'symbol', source: 'streets', 'source-layer': 'transportation_name', minzoom: 11,
    layout: { 'symbol-placement': 'line', 'text-field': ['coalesce', ['get', 'name:ru'], ['get', 'name']], 'text-font': ['Noto Sans Regular'], 'text-size': 11 },
    paint: { 'text-color': '#c9d7dc', 'text-halo-color': '#0c1b24', 'text-halo-width': 1.5 } },
  { id: 'place-labels', type: 'symbol', source: 'streets', 'source-layer': 'place', minzoom: 5,
    layout: { 'text-field': ['coalesce', ['get', 'name:ru'], ['get', 'name']], 'text-font': ['Noto Sans Regular'], 'text-size': ['interpolate', ['linear'], ['zoom'], 5, 10, 14, 14], 'text-max-width': 9 },
    paint: { 'text-color': '#e1e9ec', 'text-halo-color': '#0c1b24', 'text-halo-width': 1.5 } },
] };
function parse(value: string): LineFeature | null {
  try {
    const geometry = JSON.parse(value) as { type?: string; coordinates?: unknown };
    const coordinates = geometry.coordinates;
    return geometry?.type === 'LineString' && Array.isArray(coordinates) && coordinates.length >= 2
      && coordinates.every((point: unknown) => Array.isArray(point) && point.length === 2 && point.every(Number.isFinite)
        && point[0] >= -180 && point[0] <= 180 && point[1] >= -90 && point[1] <= 90)
      && coordinates.some((point: Point) => point[0] !== coordinates[0][0] || point[1] !== coordinates[0][1])
      ? { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: coordinates as Point[] } } : null;
  } catch { return null; }
}
function line(points: Point[]) { return JSON.stringify({ type: 'LineString', coordinates: points }); }
function lineLengthMeters(points: Point[]) {
  const radians = Math.PI / 180;
  let length = 0;
  for (let index = 1; index < points.length; index += 1) {
    const [previousLongitude, previousLatitude] = points[index - 1];
    const [longitude, latitude] = points[index];
    const latitudeDelta = (latitude - previousLatitude) * radians;
    const longitudeDelta = (longitude - previousLongitude) * radians;
    const haversine = Math.sin(latitudeDelta / 2) ** 2
      + Math.cos(previousLatitude * radians) * Math.cos(latitude * radians) * Math.sin(longitudeDelta / 2) ** 2;
    length += 2 * 6371008.8 * Math.asin(Math.min(1, Math.sqrt(haversine)));
  }
  return Math.round(length);
}
function applyContextVisibility(map: MapLibreMap, showPoints: boolean, showRoutes: boolean) {
  for (const layer of ['context-poi-clusters', 'context-poi-count', 'context-poi-points', 'context-poi-labels']) {
    if (map.getLayer(layer)) map.setLayoutProperty(layer, 'visibility', showPoints ? 'visible' : 'none');
  }
  if (map.getLayer('existing-routes')) map.setLayoutProperty('existing-routes', 'visibility', showRoutes ? 'visible' : 'none');
}

export function RouteGeometryEditor({ initialValue, colour, initialMode, initialDistance, initialDuration, travelMode, circuitId, routeId, archived, mapCenter, stopCoordinates, mapPoints, existingRoutes, trackCenterline, trackSource }: {
  initialValue: string; colour: string; initialMode: Mode; initialDistance: number; initialDuration: number;
  travelMode: string; circuitId: string; routeId: string; archived: boolean; mapCenter: Point | null; stopCoordinates: Array<Point | null>;
  mapPoints: MapPoint[]; existingRoutes: ExistingRoute[]; trackCenterline: TrackCenterline; trackSource: 'selected' | 'catalog' | 'missing';
}) {
  const requiresManualInitial = !archived && travelMode !== 'car' && initialMode === 'routed';
  const [value, setValue] = useState(initialValue);
  const [mode, setMode] = useState<Mode>(requiresManualInitial ? 'freehand' : initialMode);
  const [selectedTravelMode, setSelectedTravelMode] = useState(travelMode);
  const [distance, setDistance] = useState(String(initialDistance));
  const [duration, setDuration] = useState(String(initialDuration));
  const [points, setPoints] = useState<Point[]>([]);
  const [drawing, setDrawing] = useState(false);
  const [modified, setModified] = useState(requiresManualInitial);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [snappedPointName, setSnappedPointName] = useState('');
  const [showContextPoints, setShowContextPoints] = useState(true);
  const [showExistingRoutes, setShowExistingRoutes] = useState(true);
  const [currentStopCoordinates, setCurrentStopCoordinates] = useState(stopCoordinates);
  const [travelModeNotice, setTravelModeNotice] = useState(requiresManualInitial ? 'Автомобильная линия сохранена как ручная. Проверьте её пригодность, расстояние и время для выбранного способа передвижения' : '');
  const container = useRef<HTMLDivElement>(null);
  const geometryInput = useRef<HTMLTextAreaElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const pointsRef = useRef<Point[]>([]);
  const modeRef = useRef(mode);
  const drawingRef = useRef(drawing);
  const strokeRef = useRef<Point[]>([]);
  const screenRef = useRef<{ x: number; y: number } | null>(null);
  const requestVersion = useRef(0);
  const contextVisibilityRef = useRef({ points: true, routes: true });
  const trackFeature = useMemo(() => trackCenterline ? parse(JSON.stringify(trackCenterline)) : null, [trackCenterline]);
  const contextRoutes = useMemo(() => existingRoutes.flatMap(route => {
    const feature = route.id === routeId ? null : parse(route.geometryGeoJson);
    return feature ? [{ ...feature, properties: { id: route.id, name: route.nameRu, status: route.reviewStatus, lifecycle: route.lifecycle } }] : [];
  }), [existingRoutes, routeId]);
  const contextPoints = useMemo(() => mapPoints.filter(point => Number.isFinite(point.longitude) && Number.isFinite(point.latitude)
    && point.longitude >= -180 && point.longitude <= 180 && point.latitude >= -90 && point.latitude <= 90)
    .map(point => ({ type: 'Feature' as const, properties: { id: point.id, name: point.name, status: point.reviewStatus },
      geometry: { type: 'Point' as const, coordinates: [point.longitude, point.latitude] as Point } })), [mapPoints]);
  useEffect(() => { modeRef.current = mode; drawingRef.current = drawing; }, [mode, drawing]);
  const setControlPoints = (next: Point[]) => { pointsRef.current = next; setPoints(next); setSnappedPointName(''); };
  const valid = !value || Boolean(parse(value));
  useEffect(() => {
    geometryInput.current?.setCustomValidity(valid ? '' : 'Укажите корректный GeoJSON LineString с минимум двумя разными точками');
  }, [valid]);
  const estimatedLength = mode === 'routed' ? null : lineLengthMeters(parse(value)?.geometry.coordinates ?? []);
  const canSeedStops = currentStopCoordinates.length >= 2 && currentStopCoordinates.every(point => point !== null && point.every(Number.isFinite)
    && point[0] >= -180 && point[0] <= 180 && point[1] >= -90 && point[1] <= 90)
    && currentStopCoordinates.some(point => point?.[0] !== currentStopCoordinates[0]?.[0] || point?.[1] !== currentStopCoordinates[0]?.[1]);

  useEffect(() => {
    const form = container.current?.closest('form');
    if (!form) return;
    const update = (event: Event) => setCurrentStopCoordinates((event as CustomEvent<Array<Point | null>>).detail);
    form.addEventListener(ROUTE_STOPS_CHANGED, update);
    return () => form.removeEventListener(ROUTE_STOPS_CHANGED, update);
  }, []);

  useEffect(() => {
    const select = container.current?.closest('form')?.querySelector('select[name="travelMode"]') as HTMLSelectElement | null;
    if (!select) return;
    const update = () => {
      setSelectedTravelMode(select.value);
      if (!archived && select.value !== 'car' && modeRef.current === 'routed') {
        requestVersion.current += 1;
        modeRef.current = 'freehand';
        setMode('freehand'); setDrawing(false); setControlPoints([]); setModified(true);
        setTravelModeNotice('Автомобильная линия сохранена как ручная. Проверьте её пригодность, расстояние и время для выбранного способа передвижения');
      }
    };
    update(); select.addEventListener('change', update);
    return () => select.removeEventListener('change', update);
  }, [archived]);

  useEffect(() => {
    if (!container.current) return;
    const feature = parse(initialValue);
    const first = feature?.geometry.coordinates[0] ?? trackFeature?.geometry.coordinates[0] ?? mapCenter ?? [0, 0];
    const map = new maplibregl.Map({ container: container.current, style, center: first as Point, zoom: feature || mapCenter ? 9 : 2, attributionControl: false, renderWorldCopies: false });
    mapRef.current = map;
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
    addAtlasMapAttribution(map);
    map.on('load', () => {
      map.addSource('track-centerline', { type: 'geojson', data: trackFeature ?? empty });
      map.addLayer({ id: 'track-halo', type: 'line', source: 'track-centerline', paint: { 'line-color': '#07141c', 'line-width': 7, 'line-opacity': .85 } });
      map.addLayer({ id: 'track-centerline', type: 'line', source: 'track-centerline', paint: { 'line-color': '#f4f8fa', 'line-width': 3, 'line-opacity': .9 } });
      map.addSource('existing-routes', { type: 'geojson', data: { type: 'FeatureCollection', features: contextRoutes } });
      map.addLayer({ id: 'existing-routes', type: 'line', source: 'existing-routes', paint: {
        'line-color': ['case', ['==', ['get', 'lifecycle'], 'draft'], '#8b979e', ['match', ['get', 'status'], 'published', '#83abc0', 'reviewed', '#c3a875', 'candidate', '#d89b67', '#738b98']],
        'line-width': 3, 'line-opacity': ['case', ['==', ['get', 'lifecycle'], 'draft'], .48, .78], 'line-dasharray': [2, 1.5],
      } });
      const currentValue = (container.current?.closest('form')?.querySelector('textarea[name="geometryGeoJson"]') as HTMLTextAreaElement | null)?.value ?? initialValue;
      const currentFeature = parse(currentValue);
      map.addSource('route-line', { type: 'geojson', data: currentFeature ?? empty });
      map.addLayer({ id: 'route-line', type: 'line', source: 'route-line', paint: { 'line-color': colour, 'line-width': 5, 'line-opacity': .9 } });
      map.addSource('route-points', { type: 'geojson', data: { type: 'FeatureCollection', features: pointsRef.current.map(coordinates => ({ type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates } })) } });
      map.addLayer({ id: 'route-points', type: 'circle', source: 'route-points', paint: { 'circle-color': '#ff3158', 'circle-radius': 6, 'circle-stroke-color': '#fff', 'circle-stroke-width': 2 } });
      map.addSource('context-pois', { type: 'geojson', data: { type: 'FeatureCollection', features: contextPoints }, cluster: true, clusterRadius: 45, clusterMaxZoom: 13 });
      map.addLayer({ id: 'context-poi-clusters', type: 'circle', source: 'context-pois', filter: ['has', 'point_count'], paint: { 'circle-color': '#227d9a', 'circle-radius': ['step', ['get', 'point_count'], 14, 20, 19, 100, 25], 'circle-opacity': .9, 'circle-stroke-color': '#e8f6fa', 'circle-stroke-width': 1 } });
      map.addLayer({ id: 'context-poi-count', type: 'symbol', source: 'context-pois', filter: ['has', 'point_count'], layout: { 'text-field': ['get', 'point_count_abbreviated'], 'text-font': ['Noto Sans Regular'], 'text-size': 11 }, paint: { 'text-color': '#fff' } });
      map.addLayer({ id: 'context-poi-points', type: 'circle', source: 'context-pois', filter: ['!', ['has', 'point_count']], paint: { 'circle-color': ['match', ['get', 'status'], ['reviewed', 'published'], '#3eb7d5', 'candidate', '#d89b67', '#7b8991'], 'circle-radius': 4, 'circle-stroke-color': '#0a2633', 'circle-stroke-width': 1.5 } });
      map.addLayer({ id: 'context-poi-labels', type: 'symbol', source: 'context-pois', filter: ['!', ['has', 'point_count']], minzoom: 13, layout: { 'text-field': ['get', 'name'], 'text-font': ['Noto Sans Regular'], 'text-size': 11, 'text-offset': [0, 1.2], 'text-max-width': 12 }, paint: { 'text-color': '#e8f6fa', 'text-halo-color': '#0c1b24', 'text-halo-width': 1.5 } });
      map.moveLayer('route-points');
      applyContextVisibility(map, contextVisibilityRef.current.points, contextVisibilityRef.current.routes);
      map.on('click', 'context-poi-clusters', event => { if (!drawingRef.current) map.easeTo({ center: event.lngLat, zoom: Math.min(map.getZoom() + 2, 16), duration: 350 }); });
      map.on('click', 'context-poi-points', event => {
        if (drawingRef.current) return;
        const properties = event.features?.[0]?.properties;
        if (properties?.name) new maplibregl.Popup({ closeButton: false, className: 'admin-route-map-popup' }).setLngLat(event.lngLat).setText(`${String(properties.name)} · ${properties.status === 'candidate' ? 'кандидат' : properties.status === 'hidden' ? 'скрыта' : properties.status === 'published' ? 'опубликована' : 'проверена'}`).addTo(map);
      });
      map.on('click', 'existing-routes', event => {
        if (drawingRef.current) return;
        const properties = event.features?.[0]?.properties;
        if (properties?.name) new maplibregl.Popup({ closeButton: false, className: 'admin-route-map-popup' }).setLngLat(event.lngLat).setText(`${properties.lifecycle === 'draft' ? 'Черновик маршрута' : 'Маршрут'}: ${String(properties.name)}`).addTo(map);
      });
      if (currentFeature || trackFeature) {
        const bounds = new maplibregl.LngLatBounds();
        (currentFeature ?? trackFeature)?.geometry.coordinates.forEach(point => bounds.extend(point as Point));
        map.fitBounds(bounds, { padding: 45, duration: 0, maxZoom: 15 });
      }
    });
    map.on('click', event => {
      if (!drawingRef.current || modeRef.current === 'freehand') return;
      if (map.queryRenderedFeatures(event.point, { layers: ['context-poi-clusters'] }).length) return;
      const nearby = map.queryRenderedFeatures([
        [event.point.x - 12, event.point.y - 12], [event.point.x + 12, event.point.y + 12],
      ], { layers: ['context-poi-points'] });
      const poi = nearby.filter(feature => feature.geometry.type === 'Point').sort((left, right) => {
        const leftPoint = map.project(left.geometry.type === 'Point' ? left.geometry.coordinates as Point : [event.lngLat.lng, event.lngLat.lat]);
        const rightPoint = map.project(right.geometry.type === 'Point' ? right.geometry.coordinates as Point : [event.lngLat.lng, event.lngLat.lat]);
        return Math.hypot(leftPoint.x - event.point.x, leftPoint.y - event.point.y)
          - Math.hypot(rightPoint.x - event.point.x, rightPoint.y - event.point.y);
      })[0];
      const coordinates = poi?.geometry.type === 'Point' ? poi.geometry.coordinates as Point : [event.lngLat.lng, event.lngLat.lat] as Point;
      setSnappedPointName(poi?.properties?.name ? String(poi.properties.name) : '');
      const next: Point[] = [...pointsRef.current, coordinates];
      if (modeRef.current === 'routed' && next.length > 20) { setError('Для расчёта по дорогам выберите не более 20 точек'); return; }
      requestVersion.current += 1; pointsRef.current = next; setPoints(next); setModified(true); setError('');
      setValue(modeRef.current === 'waypoints' && next.length >= 2 ? line(next) : '');
      setDistance(''); setDuration('');
    });
    map.on('mousedown', event => {
      if (!drawingRef.current || modeRef.current !== 'freehand') return;
      event.preventDefault(); map.dragPan.disable();
      strokeRef.current = [[event.lngLat.lng, event.lngLat.lat]];
      screenRef.current = event.point;
    });
    map.on('mousemove', event => {
      if (!strokeRef.current.length) return;
      const previous = screenRef.current;
      if (previous && Math.hypot(event.point.x - previous.x, event.point.y - previous.y) < 7) return;
      strokeRef.current.push([event.lngLat.lng, event.lngLat.lat]);
      screenRef.current = event.point;
      if (strokeRef.current.length >= 2 && map.isStyleLoaded()) {
        (map.getSource('route-line') as GeoJSONSource).setData({ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: strokeRef.current } });
      }
    });
    const finishStroke = () => {
      if (!strokeRef.current.length) return;
      map.dragPan.enable(); map.touchZoomRotate.enable();
      const next = strokeRef.current; strokeRef.current = []; screenRef.current = null;
      if (next.length < 2) return;
      requestVersion.current += 1; pointsRef.current = next; setPoints(next); setSnappedPointName(''); setValue(line(next));
      setDistance(''); setDuration(''); setModified(true); setError('');
    };
    map.on('touchstart', event => {
      if (!drawingRef.current || modeRef.current !== 'freehand' || event.points.length !== 1) return;
      event.preventDefault(); map.dragPan.disable(); map.touchZoomRotate.disable();
      strokeRef.current = [[event.lngLat.lng, event.lngLat.lat]];
      screenRef.current = event.point;
    });
    map.on('touchmove', event => {
      if (!strokeRef.current.length || event.points.length !== 1) return;
      event.preventDefault();
      const previous = screenRef.current;
      if (previous && Math.hypot(event.point.x - previous.x, event.point.y - previous.y) < 7) return;
      strokeRef.current.push([event.lngLat.lng, event.lngLat.lat]);
      screenRef.current = event.point;
      if (strokeRef.current.length >= 2 && map.isStyleLoaded()) {
        (map.getSource('route-line') as GeoJSONSource).setData({ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: strokeRef.current } });
      }
    });
    map.on('touchend', finishStroke);
    map.on('touchcancel', finishStroke);
    window.addEventListener('mouseup', finishStroke);
    return () => { window.removeEventListener('mouseup', finishStroke); map.remove(); mapRef.current = null; };
  }, [colour, initialValue, mapCenter, trackFeature, contextRoutes, contextPoints]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map?.isStyleLoaded()) return;
    (map.getSource('route-line') as GeoJSONSource | undefined)?.setData(parse(value) ?? empty);
    (map.getSource('route-points') as GeoJSONSource | undefined)?.setData({ type: 'FeatureCollection', features: points.map(coordinates => ({ type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates } })) });
  }, [value, points]);

  useEffect(() => {
    contextVisibilityRef.current = { points: showContextPoints, routes: showExistingRoutes };
    const map = mapRef.current;
    if (!map?.isStyleLoaded()) return;
    applyContextVisibility(map, showContextPoints, showExistingRoutes);
  }, [showContextPoints, showExistingRoutes]);

  const fitContext = (target: 'track' | 'points') => {
    const map = mapRef.current;
    const coordinates = target === 'track' ? trackFeature?.geometry.coordinates : contextPoints.map(feature => feature.geometry.coordinates);
    if (!map || !coordinates?.length) return;
    const bounds = new maplibregl.LngLatBounds();
    coordinates.forEach(point => bounds.extend(point as Point));
    map.fitBounds(bounds, { padding: 45, duration: 450, maxZoom: target === 'track' ? 15 : 12 });
  };

  const reset = () => {
    requestVersion.current += 1;
    const requiresManualMode = !archived && selectedTravelMode !== 'car' && initialMode === 'routed';
    setControlPoints([]); setValue(initialValue); setMode(requiresManualMode ? 'freehand' : initialMode); setDistance(String(initialDistance)); setDuration(String(initialDuration));
    setDrawing(false); setModified(requiresManualMode); setError(''); setTravelModeNotice(requiresManualMode ? 'Автомобильная линия сохранена как ручная. Проверьте её пригодность, расстояние и время для выбранного способа передвижения' : ''); strokeRef.current = []; mapRef.current?.dragPan.enable(); mapRef.current?.touchZoomRotate.enable();
  };
  const start = () => {
    requestVersion.current += 1;
    setControlPoints([]); setValue(''); setDistance(''); setDuration(''); setDrawing(true); setModified(true); setError('');
  };
  const seedFromStops = () => {
    if (!canSeedStops) return;
    const next = currentStopCoordinates as Point[];
    const nextMode: Mode = selectedTravelMode === 'car' && next.length <= 20 ? 'routed' : 'waypoints';
    requestVersion.current += 1;
    modeRef.current = nextMode;
    setMode(nextMode); setControlPoints([...next]); setDrawing(true); setModified(true); setError('');
    setValue(nextMode === 'waypoints' ? line(next) : '');
    setDistance(''); setDuration('');
    setTravelModeNotice(nextMode === 'routed'
      ? 'Остановки перенесены на карту. Рассчитайте автомобильную линию по дорогам; прежняя линия не изменится в базе до сохранения'
      : 'Остановки соединены прямыми. Проверьте линию, расстояние и время; прежняя линия не изменится в базе до сохранения');
    const map = mapRef.current;
    if (map) {
      const bounds = new maplibregl.LngLatBounds();
      next.forEach(point => bounds.extend(point));
      map.fitBounds(bounds, { padding: 45, duration: 450, maxZoom: 15 });
    }
  };
  const removeLast = () => {
    requestVersion.current += 1;
    const next = pointsRef.current.slice(0, -1);
    setControlPoints(next); setValue(mode === 'waypoints' && next.length >= 2 ? line(next) : '');
    setDistance(''); setDuration(''); setModified(true);
  };
  const calculate = async () => {
    if (points.length < 2 || points.length > 20 || selectedTravelMode !== 'car') return;
    const version = ++requestVersion.current;
    setPending(true); setError('');
    try {
      const result = await previewTravelRouteGeometry({ circuitId, routeId, travelMode: 'car', points });
      const currentMode = (container.current?.closest('form')?.querySelector('select[name="travelMode"]') as HTMLSelectElement | null)?.value;
      if (version !== requestVersion.current || currentMode !== 'car' || modeRef.current !== 'routed') return;
      setValue(result.geometryGeoJson); setDistance(String(result.distanceM)); setDuration(String(result.durationMinutes));
      setModified(true); setDrawing(false);
    } catch { if (version === requestVersion.current) setError('Не удалось построить автомобильную линию. Проверьте точки и доступность сервиса маршрутизации, затем повторите расчёт'); }
    finally { setPending(false); }
  };
  return <div className="is-wide admin-route-geometry">
    <input type="hidden" name="geometryMode" value={mode} />
    <input type="hidden" name="geometryModified" value={modified ? 'yes' : 'no'} />
    <div className="admin-form-grid">
      <label><span>Способ построения</span><select value={mode} disabled={archived} onChange={event => { requestVersion.current += 1; strokeRef.current = []; mapRef.current?.dragPan.enable(); mapRef.current?.touchZoomRotate.enable(); modeRef.current = event.target.value as Mode; setMode(event.target.value as Mode); setDrawing(false); setControlPoints([]); setValue(''); setDistance(''); setDuration(''); setModified(true); setTravelModeNotice(''); }}><option value="routed" disabled={selectedTravelMode !== 'car'}>По автомобильным дорогам</option><option value="waypoints">Через опорные точки</option><option value="freehand">Свободная линия</option></select></label>
      <label><span>Расстояние, м</span><input type="number" min="1" name="distanceM" value={distance} onChange={event => { setDistance(event.target.value); setModified(true); }} readOnly={archived} required /></label>
      <label><span>Время, мин</span><input type="number" min="1" name="durationMinutes" value={duration} onChange={event => { setDuration(event.target.value); setModified(true); }} readOnly={archived} required /></label>
    </div>
    <div className="admin-route-geometry-actions">
      <button type="button" onClick={start} disabled={archived || (mode === 'routed' && selectedTravelMode !== 'car')}>Начать новую линию</button>
      <button type="button" onClick={seedFromStops} disabled={archived || !canSeedStops}>Взять текущие остановки</button>
      <button type="button" onClick={removeLast} disabled={archived || !points.length || mode === 'freehand'}>Убрать последнюю точку</button>
      {mode === 'routed' ? <button type="button" onClick={calculate} disabled={archived || pending || points.length < 2 || selectedTravelMode !== 'car'}>{pending ? 'Считаем…' : 'Построить по дорогам'}</button> : null}
      {mode !== 'routed' ? <button type="button" onClick={() => { if (estimatedLength) { setDistance(String(estimatedLength)); setModified(true); } }} disabled={archived || !estimatedLength}>Подставить длину линии</button> : null}
      <button type="button" onClick={reset} disabled={archived}>Вернуть сохранённую линию</button>
    </div>
    <p className="admin-field-note">{mode === 'routed' ? selectedTravelMode === 'car' ? `Нажмите на карту в 2–20 местах по порядку, затем рассчитайте линию по дорогам. Сейчас выбрано: ${points.length}` : 'Для этого способа передвижения автоматическая дорожная линия пока недоступна' : mode === 'waypoints' ? 'Нажимайте на карту по порядку: точки соединятся прямыми отрезками. Расстояние и время проверьте вручную' : 'Проведите линию мышью или пальцем на карте. Расстояние и время укажите после проверки'}</p>
    {!canSeedStops ? <p className="admin-field-note">Для переноса нужны минимум две остановки с известными координатами. Если выбрана новая туристическая точка, сначала сохраните маршрут и обновите страницу</p> : null}
    {mode !== 'routed' && estimatedLength ? <p className="admin-field-note">Длина нарисованной линии ≈ {estimatedLength.toLocaleString('ru-RU')} м. Это геометрическая оценка, а не расчёт по дорогам; время поездки укажите отдельно</p> : null}
    {modified ? <p className="admin-field-note">Изменённые линия, способ построения или показатели потребуют повторной проверки: маршрут станет черновиком со статусом «Кандидат»</p> : null}
    {travelModeNotice ? <p className="admin-field-note" role="status">{travelModeNotice}</p> : null}
    {snappedPointName ? <p className="admin-field-note" role="status">Последняя опорная точка привязана к объекту «{snappedPointName}»</p> : null}
    {error ? <p role="alert" className="admin-alert is-error">{error}</p> : null}
    <div className="admin-route-geometry-actions">
      <button type="button" onClick={() => fitContext('track')} disabled={!trackFeature}>К трассе</button>
      <button type="button" onClick={() => fitContext('points')} disabled={!contextPoints.length}>Все точки</button>
      <label className="admin-route-context-toggle"><input type="checkbox" checked={showContextPoints} onChange={event => setShowContextPoints(event.target.checked)} /> Туристические точки</label>
      <label className="admin-route-context-toggle"><input type="checkbox" checked={showExistingRoutes} onChange={event => setShowExistingRoutes(event.target.checked)} /> Другие маршруты</label>
      <span className="admin-field-note">Контур трассы: {trackSource === 'selected' ? 'выбранная конфигурация' : trackSource === 'catalog' ? 'справочный контур каталога' : 'нет данных'} · Туристические точки: {contextPoints.length} · Другие маршруты: {contextRoutes.length}, из них черновиков {contextRoutes.filter(route => route.properties.lifecycle === 'draft').length}</span>
    </div>
    <div ref={container} className="route-geometry-map" aria-label="Карта редактирования линии маршрута" />
    <p className="admin-field-note">Белая линия — контур трассы{trackSource === 'catalog' ? ' из справочного каталога' : ''}, голубые точки — проверенные туристические объекты, оранжевые — кандидаты, серые — скрытые; пунктир — другие неархивные маршруты (черновики серым), красная линия — текущий маршрут. При построении клик по точке привязывает опорную точку к её координате</p>
    <label><span>GeoJSON LineString</span><textarea ref={geometryInput} name="geometryGeoJson" rows={7} value={value} onChange={event => { requestVersion.current += 1; modeRef.current = 'freehand'; setMode('freehand'); setDrawing(false); setControlPoints([]); setValue(event.target.value); setModified(true); setDistance(''); setDuration(''); setError(''); setTravelModeNotice('GeoJSON изменён вручную. Проверьте линию, расстояние и время перед сохранением'); }} readOnly={archived} aria-invalid={!valid} /></label>
    <small>{valid ? 'Линия распознана. Проверьте геометрию и показатели перед публикацией' : 'GeoJSON не распознан как LineString'}</small>
  </div>;
}
