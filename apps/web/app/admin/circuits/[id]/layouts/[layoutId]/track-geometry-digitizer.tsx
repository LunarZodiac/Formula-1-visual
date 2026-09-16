'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import * as maplibregl from 'maplibre-gl';
import type { GeoJSONSource, ImageSource, Map as MapLibreMap } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';

type LineGeometry = { type: 'LineString'; coordinates: number[][] };
type LineFeatureCollection = {
  type: 'FeatureCollection';
  features: Array<{ type: 'Feature'; properties: Record<string, never>; geometry: LineGeometry }>;
};
type PointFeatureCollection = {
  type: 'FeatureCollection';
  features: Array<{ type: 'Feature'; properties: { index: number }; geometry: { type: 'Point'; coordinates: number[] } }>;
};

const mapStyle: maplibregl.StyleSpecification = {
  version: 8,
  sources: {
    streets: {
      type: 'vector',
      url: 'https://tiles.openfreemap.org/planet',
      attribution: '&copy; OpenStreetMap contributors &copy; OpenFreeMap',
    },
  },
  layers: [
    { id: 'background', type: 'background', paint: { 'background-color': '#07131b' } },
    { id: 'land', type: 'fill', source: 'streets', 'source-layer': 'landcover', paint: { 'fill-color': '#132730', 'fill-opacity': 0.92 } },
    { id: 'water', type: 'fill', source: 'streets', 'source-layer': 'water', paint: { 'fill-color': '#02090e' } },
    { id: 'roads', type: 'line', source: 'streets', 'source-layer': 'transportation', paint: { 'line-color': '#82949d', 'line-width': ['interpolate', ['linear'], ['zoom'], 7, 0.35, 15, 2.4], 'line-opacity': 0.52 } },
  ],
};

function lineFeature(coordinates: number[][]): LineFeatureCollection {
  return {
    type: 'FeatureCollection',
    features: coordinates.length >= 2 ? [{ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates } }] : [],
  };
}

function pointFeatures(coordinates: number[][]): PointFeatureCollection {
  return {
    type: 'FeatureCollection',
    features: coordinates.map((coordinate, index) => ({
      type: 'Feature', properties: { index: index + 1 }, geometry: { type: 'Point', coordinates: coordinate },
    })),
  };
}

function overlayCorners(center: [number, number], widthM: number, aspect: number, rotationDeg: number): [[number, number], [number, number], [number, number], [number, number]] {
  const halfWidth = widthM / 2;
  const halfHeight = widthM / Math.max(aspect, 0.1) / 2;
  const radians = rotationDeg * Math.PI / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  const metresPerLongitude = 111_320 * Math.max(Math.cos(center[1] * Math.PI / 180), 0.1);
  const transform = ([x, y]: [number, number]): [number, number] => {
    const rotatedX = x * cos + y * sin;
    const rotatedY = -x * sin + y * cos;
    return [center[0] + rotatedX / metresPerLongitude, center[1] + rotatedY / 111_320];
  };
  return [transform([-halfWidth, halfHeight]), transform([halfWidth, halfHeight]), transform([halfWidth, -halfHeight]), transform([-halfWidth, -halfHeight])];
}

export function TrackGeometryDigitizer({
  layoutId,
  longitude,
  latitude,
  existingGeometry,
  onGeoJsonChange,
}: {
  layoutId: string;
  longitude: number;
  latitude: number;
  existingGeometry: LineGeometry | null;
  onGeoJsonChange: (value: string) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const imageUrlRef = useRef('');
  const drawingRef = useRef(false);
  const [imageUrl, setImageUrl] = useState('');
  const [imageName, setImageName] = useState('');
  const [imageAspect, setImageAspect] = useState(1.5);
  const [overlayCenter, setOverlayCenter] = useState<[number, number]>([longitude, latitude]);
  const [overlayWidthM, setOverlayWidthM] = useState(9_000);
  const [overlayRotation, setOverlayRotation] = useState(0);
  const [overlayOpacity, setOverlayOpacity] = useState(0.62);
  const [points, setPoints] = useState<number[][]>([]);
  const [drawing, setDrawing] = useState(false);
  const [closed, setClosed] = useState(false);
  const [draftReady, setDraftReady] = useState(false);
  const draftKey = `atlas-track-digitizer:${layoutId}`;
  const geoJson = useMemo(() => JSON.stringify({ type: 'LineString', coordinates: points }, null, 2), [points]);

  useEffect(() => {
    const restoreDraft = window.setTimeout(() => {
      try {
        const rawDraft = window.localStorage.getItem(draftKey);
        if (rawDraft) {
          const draft = JSON.parse(rawDraft) as {
            points?: unknown;
            closed?: unknown;
            overlayCenter?: unknown;
            overlayWidthM?: unknown;
            overlayRotation?: unknown;
            overlayOpacity?: unknown;
          };
          if (Array.isArray(draft.points) && draft.points.every((point) => Array.isArray(point) && point.length === 2 && point.every(Number.isFinite))) {
            setPoints(draft.points as number[][]);
          }
          if (typeof draft.closed === 'boolean') setClosed(draft.closed);
          if (Array.isArray(draft.overlayCenter) && draft.overlayCenter.length === 2 && draft.overlayCenter.every(Number.isFinite)) {
            setOverlayCenter(draft.overlayCenter as [number, number]);
          }
          if (typeof draft.overlayWidthM === 'number' && Number.isFinite(draft.overlayWidthM)) setOverlayWidthM(draft.overlayWidthM);
          if (typeof draft.overlayRotation === 'number' && Number.isFinite(draft.overlayRotation)) setOverlayRotation(draft.overlayRotation);
          if (typeof draft.overlayOpacity === 'number' && Number.isFinite(draft.overlayOpacity)) setOverlayOpacity(draft.overlayOpacity);
        }
      } catch {
        window.localStorage.removeItem(draftKey);
      }
      setDraftReady(true);
    }, 0);
    return () => window.clearTimeout(restoreDraft);
  }, [draftKey]);

  useEffect(() => {
    if (!draftReady) return;
    try {
      window.localStorage.setItem(draftKey, JSON.stringify({ points, closed, overlayCenter, overlayWidthM, overlayRotation, overlayOpacity }));
    } catch {
      // Оцифровка продолжает работать даже при отключённом локальном хранилище
    }
  }, [closed, draftKey, draftReady, overlayCenter, overlayOpacity, overlayRotation, overlayWidthM, points]);

  useEffect(() => { drawingRef.current = drawing; }, [drawing]);
  useEffect(() => { imageUrlRef.current = imageUrl; }, [imageUrl]);
  useEffect(() => {
    const canvas = mapRef.current?.getCanvas();
    if (canvas) canvas.style.cursor = drawing ? 'crosshair' : '';
  }, [drawing]);

  useEffect(() => {
    if (!containerRef.current) return undefined;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: mapStyle,
      center: [longitude, latitude],
      zoom: 13,
      minZoom: 7,
      maxZoom: 19,
      renderWorldCopies: false,
      attributionControl: false,
    });
    mapRef.current = map;
    map.addControl(new maplibregl.NavigationControl({ showCompass: true }), 'top-right');
    map.on('load', () => {
      map.addSource('existing-layout', { type: 'geojson', data: lineFeature(existingGeometry?.coordinates ?? []) });
      map.addLayer({ id: 'existing-layout', type: 'line', source: 'existing-layout', paint: { 'line-color': '#58c7e8', 'line-width': 3, 'line-opacity': 0.55, 'line-dasharray': [2, 2] } });
      map.addSource('digitized-line', { type: 'geojson', data: lineFeature([]) });
      map.addLayer({ id: 'digitized-line', type: 'line', source: 'digitized-line', paint: { 'line-color': '#ff183f', 'line-width': 4 } });
      map.addSource('digitized-points', { type: 'geojson', data: pointFeatures([]) });
      map.addLayer({ id: 'digitized-points', type: 'circle', source: 'digitized-points', paint: { 'circle-color': '#ff183f', 'circle-radius': 5, 'circle-stroke-color': '#fff', 'circle-stroke-width': 1.5 } });
      if (existingGeometry?.coordinates.length) {
        const first = existingGeometry.coordinates[0] as [number, number];
        const bounds = new maplibregl.LngLatBounds(first, first);
        existingGeometry.coordinates.forEach((coordinate) => bounds.extend(coordinate as [number, number]));
        map.fitBounds(bounds, { padding: 55, duration: 0, maxZoom: 16 });
      }
    });
    map.on('click', (event) => {
      if (!drawingRef.current) return;
      setClosed(false);
      setPoints((current) => [...current, [Number(event.lngLat.lng.toFixed(7)), Number(event.lngLat.lat.toFixed(7))]]);
    });
    return () => {
      map.remove();
      mapRef.current = null;
      if (imageUrlRef.current) URL.revokeObjectURL(imageUrlRef.current);
    };
  }, [existingGeometry, latitude, longitude]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map?.isStyleLoaded()) return;
    (map.getSource('digitized-line') as GeoJSONSource | undefined)?.setData(lineFeature(points));
    (map.getSource('digitized-points') as GeoJSONSource | undefined)?.setData(pointFeatures(points));
  }, [points]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map?.isStyleLoaded() || !imageUrl) return;
    const coordinates = overlayCorners(overlayCenter, overlayWidthM, imageAspect, overlayRotation);
    const source = map.getSource('digitizer-reference') as ImageSource | undefined;
    if (source) source.setCoordinates(coordinates);
    else {
      map.addSource('digitizer-reference', { type: 'image', url: imageUrl, coordinates });
      map.addLayer({ id: 'digitizer-reference', type: 'raster', source: 'digitizer-reference', paint: { 'raster-opacity': overlayOpacity } }, 'existing-layout');
    }
    map.setPaintProperty('digitizer-reference', 'raster-opacity', overlayOpacity);
  }, [imageAspect, imageUrl, overlayCenter, overlayOpacity, overlayRotation, overlayWidthM]);

  async function selectReference(file: File | undefined) {
    if (!file) return;
    if (!['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'].includes(file.type)) return;
    if (file.size > 12_000_000) return;
    if (imageUrlRef.current) URL.revokeObjectURL(imageUrlRef.current);
    const map = mapRef.current;
    if (map?.getLayer('digitizer-reference')) map.removeLayer('digitizer-reference');
    if (map?.getSource('digitizer-reference')) map.removeSource('digitizer-reference');
    const nextUrl = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      setImageAspect(image.naturalWidth / Math.max(image.naturalHeight, 1));
      setImageUrl(nextUrl);
      setImageName(file.name);
    };
    image.src = nextUrl;
  }

  function useMapCenter() {
    const center = mapRef.current?.getCenter();
    if (center) setOverlayCenter([Number(center.lng.toFixed(7)), Number(center.lat.toFixed(7))]);
  }

  function closeLine() {
    if (points.length < 3 || closed) return;
    setPoints((current) => [...current, [...current[0]]]);
    setClosed(true);
    setDrawing(false);
  }

  function clearDraft() {
    window.localStorage.removeItem(draftKey);
    setPoints([]);
    setClosed(false);
    setDrawing(false);
    setOverlayCenter([longitude, latitude]);
    setOverlayWidthM(9_000);
    setOverlayRotation(0);
    setOverlayOpacity(0.62);
  }

  return <section className="admin-track-digitizer">
    <header><div><span className="admin-kicker">Ручная оцифровка</span><h3>Схема поверх карты</h3></div><span>{points.length.toLocaleString('ru-RU')} точек</span></header>
    <p>Подложка обрабатывается только в этом браузере. Установите её над реальными дорогами, затем включите рисование и последовательно поставьте точки центральной линии</p>
    <div className="admin-track-digitizer-grid">
      <div className="admin-track-digitizer-map"><div ref={containerRef} /></div>
      <div className="admin-track-digitizer-controls">
        <label className="admin-file-picker"><span>Схема-подложка</span><input type="file" accept=".svg,.png,.jpg,.jpeg,.webp,image/svg+xml,image/png,image/jpeg,image/webp" onChange={(event) => void selectReference(event.target.files?.[0])} /><span className="admin-file-picker-control"><strong>{imageName ? 'Заменить схему' : 'Выбрать схему'}</strong><em>{imageName || 'SVG, PNG, JPG или WebP до 12 МБ'}</em></span></label>
        {imageUrl ? <>
          <div className="admin-track-overlay-center">
            <label><span>Долгота центра</span><input type="number" min="-180" max="180" step="0.000001" value={overlayCenter[0]} onChange={(event) => setOverlayCenter((current) => [Number(event.target.value), current[1]])} /></label>
            <label><span>Широта центра</span><input type="number" min="-90" max="90" step="0.000001" value={overlayCenter[1]} onChange={(event) => setOverlayCenter((current) => [current[0], Number(event.target.value)])} /></label>
          </div>
          <label><span>Ширина подложки, м</span><input type="number" min="100" max="50000" step="100" value={overlayWidthM} onChange={(event) => setOverlayWidthM(Number(event.target.value) || 100)} /></label>
          <label><span>Поворот, °</span><input type="range" min="-180" max="180" step="1" value={overlayRotation} onChange={(event) => setOverlayRotation(Number(event.target.value))} /><output>{overlayRotation}°</output></label>
          <label><span>Прозрачность</span><input type="range" min="0.1" max="1" step="0.05" value={overlayOpacity} onChange={(event) => setOverlayOpacity(Number(event.target.value))} /><output>{Math.round(overlayOpacity * 100)}%</output></label>
          <button type="button" onClick={useMapCenter}>Поставить подложку в центр карты</button>
        </> : null}
        <div className="admin-track-digitizer-actions">
          <button type="button" className={drawing ? 'is-active' : ''} onClick={() => setDrawing((value) => !value)}>{drawing ? 'Остановить рисование' : 'Рисовать контур'}</button>
          <button type="button" disabled={!points.length} onClick={() => { setClosed(false); setPoints((current) => current.slice(0, -1)); }}>Отменить точку</button>
          <button type="button" disabled={points.length < 3 || closed} onClick={closeLine}>Замкнуть контур</button>
          <button type="button" disabled={!points.length} onClick={() => { setPoints([]); setClosed(false); }}>Очистить</button>
        </div>
        <button type="button" className="admin-track-digitizer-use" disabled={points.length < 2} onClick={() => onGeoJsonChange(geoJson)}>Передать GeoJSON на проверку</button>
        <div className="admin-track-digitizer-draft">
          <span>{points.length ? 'Черновик точек сохранён в этом браузере' : 'Черновик будет сохраняться автоматически'}</span>
          <button type="button" disabled={!points.length} onClick={clearDraft}>Удалить черновик</button>
        </div>
      </div>
    </div>
  </section>;
}
