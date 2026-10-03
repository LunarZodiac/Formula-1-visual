'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import * as maplibregl from 'maplibre-gl';
import { useRouter } from 'next/navigation';
import type { Map as MapLibreMap } from 'maplibre-gl';
import { addAtlasMapAttribution } from '../../../../../../lib/map-attribution';
import type { LegacyTrackMarkup } from './legacy-track-markup';
import 'maplibre-gl/dist/maplibre-gl.css';

export type TrackCenterline = { type: 'LineString'; coordinates: number[][] };

function closeLegacyLabels(labels: GeoJSON.FeatureCollection<GeoJSON.Point>, leaders: GeoJSON.FeatureCollection<GeoJSON.LineString>) {
  return { ...labels, features: labels.features.map((feature, index) => {
    const anchor = leaders.features[index]?.geometry.coordinates[0];
    const original = feature.geometry.coordinates;
    if (!anchor) return feature;
    return { ...feature, geometry: { ...feature.geometry, coordinates: [anchor[0] + (original[0] - anchor[0]) * .26, anchor[1] + (original[1] - anchor[1]) * .26] } };
  }) };
}

export const trackAnnotationMapStyle: maplibregl.StyleSpecification = { version: 8, glyphs: 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf', sources: {
  satellite: { type: 'raster', tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'], tileSize: 256, maxzoom: 19, attribution: 'Sources: Esri, Maxar, Earthstar Geographics, and the GIS User Community' },
  streets: { type: 'vector', url: 'https://tiles.openfreemap.org/planet', attribution: '&copy; OpenStreetMap contributors &copy; OpenFreeMap' },
}, layers: [
  { id: 'background', type: 'background', paint: { 'background-color': '#07131b' } },
  { id: 'satellite-base', type: 'raster', source: 'satellite', paint: { 'raster-opacity': .96, 'raster-saturation': -.12, 'raster-contrast': .1, 'raster-brightness-max': .82 } },
  { id: 'land', type: 'fill', source: 'streets', 'source-layer': 'landcover', layout: { visibility: 'none' }, paint: { 'fill-color': '#132730', 'fill-opacity': .9 } },
  { id: 'water', type: 'fill', source: 'streets', 'source-layer': 'water', layout: { visibility: 'none' }, paint: { 'fill-color': '#02090e' } },
  { id: 'roads', type: 'line', source: 'streets', 'source-layer': 'transportation', layout: { visibility: 'none' }, paint: { 'line-color': '#718690', 'line-width': ['interpolate', ['linear'], ['zoom'], 9, .3, 17, 2.2], 'line-opacity': .32 } },
  { id: 'place-labels', type: 'symbol', source: 'streets', 'source-layer': 'place', minzoom: 9, layout: { visibility: 'none', 'text-field': ['coalesce', ['get', 'name:ru'], ['get', 'name']], 'text-font': ['Noto Sans Regular'], 'text-size': 11 }, paint: { 'text-color': '#acc2cb', 'text-halo-color': '#07131b', 'text-halo-width': 1.5 } },
] };

type SharedMapContextValue = {
  map: MapLibreMap | null;
  activeTool: string | null;
  setActiveTool: (tool: string | null) => void;
  panelMode: string;
  setPanelMode: (mode: string) => void;
  sectorReady: boolean;
  setSectorReady: (ready: boolean) => void;
  sectorStartPoint: number[] | null;
  setSectorStartPoint: (point: number[] | null) => void;
};

const SharedMapContext = createContext<SharedMapContextValue | null>(null);

export function useUnifiedTrackAnnotationMap() {
  const value = useContext(SharedMapContext);
  if (!value) throw new Error('Редактор разметки должен находиться внутри общей карты');
  return value;
}

export function TrackEditorPanelNav() {
  const { panelMode, setPanelMode, setActiveTool, sectorReady } = useUnifiedTrackAnnotationMap();
  const choose = (mode: string) => { setActiveTool(null); setPanelMode(mode); };
  return <nav className="admin-track-editor-nav" aria-label="Разделы редактора">
    {([['element', 'Элемент'], ['sector', 'Сектора'], ['finish', 'Старт/финиш'], ['list', 'Список'], ['extra', 'Ещё']] as const).map(([mode, label]) => <button key={mode} type="button" className={panelMode === mode ? 'is-active' : ''} aria-current={panelMode === mode ? 'page' : undefined} onClick={() => choose(mode)}>{label}</button>)}
    {panelMode === 'element' ? <button type="submit" form="element-editor" className="admin-track-editor-save">Сохранить изменения</button> : null}
    {panelMode === 'sector' ? <button type="submit" form="sector-segmentation-form" className="admin-track-editor-save" disabled={!sectorReady}>Сохранить три сектора</button> : null}
    {panelMode === 'finish' ? <button type="submit" form="start-finish-editor" className="admin-track-editor-save">Сохранить положение</button> : null}
    {panelMode === 'sector' && !sectorReady ? <p className="admin-track-editor-save-hint">Сначала отметьте начало S1 и две границы секторов на карте</p> : null}
    {panelMode === 'extra' ? <a className="admin-track-editor-extra-link" href="#batch-import">Пакетный импорт GeoJSON ↓</a> : null}
  </nav>;
}

export function UnifiedTrackAnnotationMap({ centerline, legacyMarkup, initialPanel = 'element', children }: { centerline: TrackCenterline; legacyMarkup?: LegacyTrackMarkup | null; initialPanel?: string; children: ReactNode }) {
  const router = useRouter();
  const container = useRef<HTMLDivElement>(null);
  const camera = useRef<{ center: [number, number]; zoom: number } | null>(null);
  const sourceData = useRef({ centerline, legacyMarkup });
  const sourceSignature = JSON.stringify([centerline, legacyMarkup]);
  const [map, setMap] = useState<MapLibreMap | null>(null);
  const [activeTool, setActiveToolState] = useState<string | null>(null);
  const [panelMode, setPanelMode] = useState(initialPanel);
  const [sectorReady, setSectorReady] = useState(false);
  const [sectorStartPoint, setSectorStartPoint] = useState<number[] | null>(null);
  const [mapStatus, setMapStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const setActiveTool = useCallback((tool: string | null) => setActiveToolState(tool), []);

  useEffect(() => { sourceData.current = { centerline, legacyMarkup }; }, [centerline, legacyMarkup]);

  useEffect(() => {
    const panel = new URLSearchParams(window.location.search).get('panel');
    if (panel && ['element', 'sector', 'finish', 'list', 'extra'].includes(panel)) queueMicrotask(() => setPanelMode(panel));
  }, []);

  useEffect(() => {
    const { centerline, legacyMarkup } = sourceData.current;
    if (!container.current || !centerline.coordinates.length) return;
    setMapStatus('loading');
    let didLoad = false;
    const instance = new maplibregl.Map({
      container: container.current,
      style: trackAnnotationMapStyle,
      center: camera.current?.center ?? centerline.coordinates[0] as [number, number],
      zoom: camera.current?.zoom ?? 14,
      minZoom: 7,
      maxZoom: 20,
      renderWorldCopies: false,
      attributionControl: false,
    });
    instance.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
    addAtlasMapAttribution(instance);
    const handleLoad = () => {
      const badge = document.createElement('canvas');
      badge.width = 48; badge.height = 48;
      const badgeContext = badge.getContext('2d');
      if (badgeContext) {
        badgeContext.beginPath(); badgeContext.arc(24, 24, 19, 0, Math.PI * 2);
        badgeContext.fillStyle = '#121b23'; badgeContext.fill();
        badgeContext.lineWidth = 5; badgeContext.strokeStyle = '#02070d'; badgeContext.stroke();
        instance.addImage('track-turn-badge', badgeContext.getImageData(0, 0, 48, 48), { pixelRatio: 2 });
      }
      const drsBadge = document.createElement('canvas');
      drsBadge.width = 96; drsBadge.height = 32;
      const drsContext = drsBadge.getContext('2d');
      if (drsContext) {
        drsContext.fillStyle = '#9bff73'; drsContext.fillRect(2, 2, 92, 28);
        drsContext.strokeStyle = '#06100b'; drsContext.lineWidth = 4; drsContext.strokeRect(2, 2, 92, 28);
        instance.addImage('track-drs-callout', drsContext.getImageData(0, 0, 96, 32), { pixelRatio: 2, stretchX: [[12, 84]], stretchY: [[10, 22]], content: [12, 8, 84, 24] });
      }
      const finishMarker = document.createElement('canvas');
      finishMarker.width = 32; finishMarker.height = 32;
      const finishContext = finishMarker.getContext('2d');
      if (finishContext) {
        finishContext.save();
        finishContext.beginPath(); finishContext.arc(16, 16, 13, 0, Math.PI * 2); finishContext.clip();
        const square = 6.5;
        for (let row = 0; row < 4; row++) for (let column = 0; column < 4; column++) {
          finishContext.fillStyle = (row + column) % 2 ? '#101820' : '#f5f8fa';
          finishContext.fillRect(3 + column * square, 3 + row * square, square, square);
        }
        finishContext.restore();
        finishContext.beginPath(); finishContext.arc(16, 16, 13.5, 0, Math.PI * 2);
        finishContext.strokeStyle = '#02070d'; finishContext.lineWidth = 4; finishContext.stroke();
        instance.addImage('track-finish-marker', finishContext.getImageData(0, 0, 32, 32), { pixelRatio: 2 });
      }
      instance.addSource('layout-centerline', { type: 'geojson', data: { type: 'Feature', properties: {}, geometry: centerline } });
      instance.addLayer({ id: 'layout-centerline', type: 'line', source: 'layout-centerline', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#08121a', 'line-width': 8.2, 'line-opacity': .94 } });
      if (legacyMarkup) {
        instance.addSource('legacy-sectors', { type: 'geojson', data: legacyMarkup.trackSectors });
        instance.addLayer({ id: 'legacy-sectors', type: 'line', source: 'legacy-sectors', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': ['match', ['get', 'sector'], 1, '#ff344c', 2, '#32c8e6', 3, '#f2c94c', '#a47cff'], 'line-width': 4.2, 'line-opacity': .98 } });
        instance.addSource('legacy-turn-labels', { type: 'geojson', data: closeLegacyLabels(legacyMarkup.turnLabels, legacyMarkup.turnLabelLeaders) });
        instance.addLayer({ id: 'legacy-turn-labels', type: 'symbol', source: 'legacy-turn-labels', layout: { 'icon-image': 'track-turn-badge', 'icon-allow-overlap': false, 'icon-padding': 4, 'text-field': ['get', 'label'], 'text-font': ['Noto Sans Regular'], 'text-size': 9, 'text-allow-overlap': false, 'text-padding': 5 }, paint: { 'text-color': '#f6f9fa' } });
        instance.addSource('legacy-drs-zones', { type: 'geojson', data: legacyMarkup.drsZones });
        instance.addLayer({ id: 'legacy-drs-glow', type: 'line', source: 'legacy-drs-zones', layout: { 'line-cap': 'round' }, paint: { 'line-color': '#45e38b', 'line-width': 13, 'line-opacity': .22, 'line-blur': 5 } });
        instance.addLayer({ id: 'legacy-drs-zones', type: 'line', source: 'legacy-drs-zones', layout: { 'line-cap': 'round' }, paint: { 'line-color': '#70f2a8', 'line-width': 2.1, 'line-opacity': .92, 'line-dasharray': [1.15, 2.35] } });
        instance.addLayer({ id: 'legacy-drs-zone-labels', type: 'symbol', source: 'legacy-drs-zones', layout: { 'symbol-placement': 'line-center', 'text-field': ['get', 'label'], 'text-font': ['Noto Sans Regular'], 'text-size': 9, 'text-letter-spacing': .06, 'text-allow-overlap': false }, paint: { 'text-color': '#9bff73', 'text-halo-color': '#06100b', 'text-halo-width': 2, 'text-halo-blur': .5 } });
        instance.addSource('legacy-drs-leaders', { type: 'geojson', data: legacyMarkup.drsDetectionLeaders });
        instance.addLayer({ id: 'legacy-drs-leaders', type: 'line', source: 'legacy-drs-leaders', paint: { 'line-color': '#70f2a8', 'line-width': 1.5, 'line-dasharray': [2, 1], 'line-opacity': .7 } });
        instance.addSource('legacy-drs-labels', { type: 'geojson', data: legacyMarkup.drsDetectionLabels });
        instance.addLayer({ id: 'legacy-drs-labels', type: 'symbol', source: 'legacy-drs-labels', layout: { 'icon-image': 'track-drs-callout', 'icon-text-fit': 'both', 'icon-text-fit-padding': [5, 7, 5, 7], 'icon-allow-overlap': false, 'text-field': ['get', 'label'], 'text-font': ['Noto Sans Regular'], 'text-size': 8, 'text-allow-overlap': false }, paint: { 'text-color': '#06100b' } });
        if (legacyMarkup.namedTrackLeaders && legacyMarkup.namedTrackFeatures) {
          instance.addSource('legacy-named-labels', { type: 'geojson', data: closeLegacyLabels(legacyMarkup.namedTrackFeatures, legacyMarkup.namedTrackLeaders) });
          ([1, 2, 3] as const).forEach(priority => {
            const filter: maplibregl.FilterSpecification = ['all', ['==', ['get', 'priority'], priority], ['!=', ['get', 'nameRu'], 'Старт-финишная прямая']];
            instance.addLayer({ id: `legacy-named-labels-p${priority}`, type: 'symbol', source: 'legacy-named-labels', filter, minzoom: 10, layout: { 'text-field': ['get', 'nameRu'], 'text-font': ['Noto Sans Regular'], 'text-size': 10, 'text-letter-spacing': .04, 'text-max-width': 13, 'text-anchor': 'center', 'text-allow-overlap': true, 'text-ignore-placement': true, 'symbol-sort-key': priority }, paint: { 'text-color': ['match', ['get', 'kind'], 'straight', '#dce9ee', '#ffffff'], 'text-halo-color': '#06101a', 'text-halo-width': 2.2, 'text-halo-blur': .4 } });
          });
        }
      }
      instance.addSource('editor-start-finish', { type: 'geojson', data: { type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: centerline.coordinates[0] } } });
      instance.addLayer({ id: 'editor-start-finish', type: 'symbol', source: 'editor-start-finish', layout: { 'icon-image': 'track-finish-marker', 'icon-size': 1.25, 'icon-allow-overlap': true, 'icon-ignore-placement': true } });
      const bounds = new maplibregl.LngLatBounds();
      centerline.coordinates.forEach(point => bounds.extend(point as [number, number]));
      if (!camera.current) instance.fitBounds(bounds, { padding: 55, duration: 0, maxZoom: 17 });
      let overviewZoom = instance.getZoom();
      let previousWidth = instance.getCanvas().clientWidth;
      didLoad = true;
      setMap(instance);
      setMapStatus('ready');
      instance.on('resize', () => {
        const nextWidth = instance.getCanvas().clientWidth;
        if (Math.abs(nextWidth - previousWidth) > 40 && instance.getZoom() <= overviewZoom + .25) {
          instance.fitBounds(bounds, { padding: Math.min(55, Math.max(24, nextWidth * .06)), duration: 0, maxZoom: 17 });
          overviewZoom = instance.getZoom();
        }
        previousWidth = nextWidth;
      });
    };
    instance.once('load', handleLoad);
    instance.on('error', () => { if (!didLoad) setMapStatus('error'); });
    return () => {
      if (didLoad) camera.current = { center: [instance.getCenter().lng, instance.getCenter().lat], zoom: instance.getZoom() };
      setMap(null);
      instance.remove();
    };
  }, [sourceSignature]);

  useEffect(() => {
    if (!map) return;
    map.getCanvas().style.cursor = activeTool === 'annotation:select' ? 'pointer' : activeTool ? 'crosshair' : '';
  }, [activeTool, map]);

  useEffect(() => {
    if (!map || activeTool !== 'annotation:select') return;
    const select = (event: maplibregl.MapMouseEvent) => {
      const layers = ['annotation-points', 'annotation-turn-labels', 'annotation-lines', 'annotation-drs-lines', 'annotation-point-labels', 'annotation-line-labels', 'annotation-callout-labels'].filter(id => map.getLayer(id));
      const feature = layers.length ? map.queryRenderedFeatures(event.point, { layers }).find(item => typeof item.properties?.id === 'string') : null;
      if (!feature) return;
      setActiveTool(null);
      setPanelMode('element');
      router.push(`?edit=${encodeURIComponent(feature.properties!.id)}`, { scroll: false });
    };
    map.on('click', select);
    return () => { map.off('click', select); };
  }, [activeTool, map, router, setActiveTool]);

  const value = useMemo(() => ({ map, activeTool, setActiveTool, panelMode, setPanelMode, sectorReady, setSectorReady, sectorStartPoint, setSectorStartPoint }), [activeTool, map, panelMode, sectorReady, sectorStartPoint, setActiveTool]);
  return <SharedMapContext.Provider value={value}>
    <div className="admin-track-editor-workspace">
    <section className="admin-track-map-workspace" aria-label="Общая карта разметки конфигурации">
      <header><div><span className="admin-kicker">Рабочая карта</span><h2>Контур и вся разметка</h2></div><button type="button" className={`admin-map-edit-toggle${activeTool === 'annotation:select' ? ' is-active' : ''}`} onClick={() => setActiveTool(activeTool === 'annotation:select' ? null : 'annotation:select')} aria-pressed={activeTool === 'annotation:select'}>✎ {activeTool === 'annotation:select' ? 'Выберите элемент на карте' : 'Редактировать на карте'}</button></header>
      <div className="admin-track-annotation-map" ref={container} />
      {legacyMarkup ? <p className="admin-track-map-legacy-note"><span aria-hidden="true" /> Справочные слои старой карты: только просмотр до переноса и проверки источника</p> : null}
      {mapStatus !== 'ready' ? <div className={`admin-track-map-status${mapStatus === 'error' ? ' is-error' : ''}`} role="status">{mapStatus === 'error' ? 'Не удалось загрузить подложку карты. Проверьте подключение и обновите страницу' : 'Карта загружается…'}</div> : null}
    </section>
    <aside className="admin-track-editor-sidebar" data-panel={panelMode} aria-label="Инструменты редактирования" onClick={event => { if ((event.target as HTMLElement).closest('.admin-track-existing-list a')) setPanelMode('element'); }}><TrackEditorPanelNav />{children}</aside>
    </div>
  </SharedMapContext.Provider>;
}
