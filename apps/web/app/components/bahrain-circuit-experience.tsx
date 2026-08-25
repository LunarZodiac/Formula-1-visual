'use client';

import * as maplibregl from 'maplibre-gl';
import type { Map as MapLibreMap } from 'maplibre-gl';
import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import 'maplibre-gl/dist/maplibre-gl.css';
import { BahrainModelViewer } from './bahrain-model-viewer';
import {
  bahrainDrsDetectionAnchors,
  bahrainDrsDetectionLabels,
  bahrainDrsDetectionLeaders,
  bahrainDrsZones,
  bahrainStartFinishLeader,
  bahrainTrackPoints,
  bahrainTrackSectors,
  bahrainTurnLabelLeaders,
  bahrainTurnLabels,
} from '../data/bahrain-track-details';
import { trackGeometries } from '../data/track-geometries';
import { bahrain2024Result } from '../data/race-results';

type DetailMode = 'track' | 'travel' | 'model';
type DetailBasemap = 'dark' | 'satellite';

const bahrainTrack = trackGeometries.bahrain;

const travelPoints: GeoJSON.FeatureCollection<GeoJSON.Point> = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      properties: {
        name: 'Bahrain International Circuit',
        kind: 'Трасса',
        description: 'Сахир · точка проведения Гран-при Бахрейна',
      },
      geometry: { type: 'Point', coordinates: [50.5106, 26.0325] },
    },
    {
      type: 'Feature',
      properties: {
        name: 'Манама',
        kind: 'Город',
        description: 'Главный городской ориентир для поездки на этап',
      },
      geometry: { type: 'Point', coordinates: [50.5861, 26.2235] },
    },
    {
      type: 'Feature',
      properties: {
        name: 'Аэропорт BAH',
        kind: 'Транспорт',
        description: 'Международный аэропорт Бахрейна',
      },
      geometry: { type: 'Point', coordinates: [50.6336, 26.2708] },
    },
  ],
};

const detailStyle: maplibregl.StyleSpecification = {
  version: 8,
  glyphs: 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf',
  sources: {
    carto: {
      type: 'raster',
      tiles: [
        'https://a.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}.png',
        'https://b.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}.png',
        'https://c.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}.png',
      ],
      tileSize: 256,
      attribution: '&copy; OpenStreetMap contributors &copy; CARTO',
    },
    satellite: {
      type: 'raster',
      tiles: [
        'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      ],
      tileSize: 256,
      maxzoom: 19,
      attribution: 'Sources: Esri, Maxar, Earthstar Geographics, and the GIS User Community',
    },
    streets: {
      type: 'vector',
      url: 'https://tiles.openfreemap.org/planet',
      attribution: '&copy; OpenStreetMap contributors &copy; OpenFreeMap',
    },
    terrainSource: {
      type: 'raster-dem',
      url: 'https://tiles.mapterhorn.com/tilejson.json',
    },
  },
  layers: [
    { id: 'background', type: 'background', paint: { 'background-color': '#02070d' } },
    {
      id: 'base', type: 'raster', source: 'carto',
      layout: { visibility: 'none' },
      paint: {
        'raster-opacity': 0.96,
        'raster-saturation': -0.12,
        'raster-contrast': 0.24,
        'raster-brightness-min': 0.1,
      },
    },
    {
      id: 'satellite-base', type: 'raster', source: 'satellite',
      paint: {
        'raster-opacity': 0.96,
        'raster-saturation': -0.12,
        'raster-contrast': 0.1,
        'raster-brightness-max': 0.82,
      },
    },
    {
      id: 'context-buildings', type: 'fill', source: 'streets', 'source-layer': 'building', minzoom: 13,
      paint: {
        'fill-color': '#53616a',
        'fill-opacity': ['interpolate', ['linear'], ['zoom'], 13, 0.08, 17, 0.22],
        'fill-outline-color': 'rgba(164, 184, 194, 0.2)',
      },
    },
    {
      id: 'context-roads-casing', type: 'line', source: 'streets', 'source-layer': 'transportation', minzoom: 10,
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: {
        'line-color': '#02070d',
        'line-width': ['interpolate', ['linear'], ['zoom'], 10, 1.2, 17, 7],
        'line-opacity': 0.72,
      },
    },
    {
      id: 'context-roads', type: 'line', source: 'streets', 'source-layer': 'transportation', minzoom: 10,
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: {
        'line-color': [
          'match', ['get', 'class'],
          ['motorway', 'trunk', 'primary'], '#8798a2',
          ['secondary', 'tertiary'], '#657781',
          '#44545d',
        ],
        'line-width': ['interpolate', ['linear'], ['zoom'], 10, 0.55, 17, 3.2],
        'line-opacity': ['interpolate', ['linear'], ['zoom'], 10, 0.22, 15, 0.48],
      },
    },
    {
      id: 'context-road-labels', type: 'symbol', source: 'streets', 'source-layer': 'transportation_name', minzoom: 12,
      layout: {
        'symbol-placement': 'line',
        'text-field': ['coalesce', ['get', 'name:ru'], ['get', 'name:latin'], ['get', 'name:en'], ['get', 'name']],
        'text-font': ['Noto Sans Regular'],
        'text-size': ['interpolate', ['linear'], ['zoom'], 12, 9, 17, 12],
        'text-letter-spacing': 0.04,
        'text-max-angle': 35,
      },
      paint: {
        'text-color': '#aebbc2',
        'text-halo-color': 'rgba(2, 7, 13, 0.92)',
        'text-halo-width': 1.4,
        'text-opacity': 0.82,
      },
    },
    {
      id: 'context-place-labels', type: 'symbol', source: 'streets', 'source-layer': 'place', minzoom: 8, maxzoom: 16,
      layout: {
        'text-field': ['coalesce', ['get', 'name:ru'], ['get', 'name:latin'], ['get', 'name:en'], ['get', 'name']],
        'text-font': ['Noto Sans Medium'],
        'text-size': ['interpolate', ['linear'], ['zoom'], 8, 10, 14, 14],
        'text-max-width': 9,
      },
      paint: {
        'text-color': '#c7d3d9',
        'text-halo-color': 'rgba(2, 7, 13, 0.94)',
        'text-halo-width': 1.6,
        'text-opacity': 0.82,
      },
    },
    {
      id: 'terrain-hillshade', type: 'hillshade', source: 'terrainSource',
      paint: {
        'hillshade-method': 'standard',
        'hillshade-illumination-direction': 315,
        'hillshade-shadow-color': '#02070d',
        'hillshade-highlight-color': '#a4b5be',
        'hillshade-accent-color': '#26343c',
        'hillshade-exaggeration': 0.28,
      },
    },
  ],
};

function trackBounds() {
  if (!bahrainTrack) return undefined;
  const [first, ...coordinates] = bahrainTrack.geometry.coordinates;
  return coordinates.reduce(
    (bounds, coordinate) => bounds.extend(coordinate),
    new maplibregl.LngLatBounds(first, first),
  );
}

export function BahrainCircuitExperience() {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const [mode, setMode] = useState<DetailMode>('track');
  const [basemap, setBasemap] = useState<DetailBasemap>('satellite');
  const [ready, setReady] = useState(false);

  const focusTrack = useCallback((duration = 1000) => {
    const map = mapRef.current;
    const bounds = trackBounds();
    if (!map || !bounds) return;

    map.fitBounds(bounds, {
      padding: { top: 92, right: 92, bottom: 92, left: 92 },
      maxZoom: 15.3,
      pitch: 52,
      bearing: -18,
      duration,
      essential: true,
    });
  }, []);

  const showMode = useCallback((nextMode: DetailMode) => {
    setMode(nextMode);
    const map = mapRef.current;
    if (!map) return;

    const travelVisibility = nextMode === 'travel' ? 'visible' : 'none';
    const trackVisibility = nextMode === 'track' ? 'visible' : 'none';
    if (map.getLayer('travel-points')) {
      map.setLayoutProperty('travel-points', 'visibility', travelVisibility);
      map.setLayoutProperty('travel-labels', 'visibility', travelVisibility);
      [
        'track-glow', 'track-line', 'sector-lines', 'drs-glow', 'drs-lines',
        'drs-detection-leader-casing', 'drs-detection-leaders',
        'drs-detection-points', 'drs-detection-labels',
        'start-finish-leader', 'start-finish-marker',
        'turn-label-leaders', 'turn-points', 'turn-labels',
        'track-info-points', 'track-info-labels',
      ]
        .forEach((layerId) => map.setLayoutProperty(layerId, 'visibility', trackVisibility));
      map.setLayoutProperty('terrain-hillshade', 'visibility', trackVisibility);
    }

    if (nextMode === 'track') {
      map.setTerrain({ source: 'terrainSource', exaggeration: 1 });
      focusTrack(1200);
    } else if (nextMode === 'travel') {
      map.setTerrain(null);
      map.fitBounds([[50.48, 25.99], [50.67, 26.3]], {
        padding: { top: 76, right: 76, bottom: 76, left: 76 },
        maxZoom: 10.8,
        pitch: 0,
        bearing: 0,
        duration: 1200,
        essential: true,
      });
    } else {
      map.setTerrain(null);
    }
  }, [focusTrack]);

  const selectBasemap = useCallback((nextBasemap: DetailBasemap) => {
    setBasemap(nextBasemap);
    const map = mapRef.current;
    if (!map) return;
    map.setLayoutProperty('base', 'visibility', nextBasemap === 'dark' ? 'visible' : 'none');
    map.setLayoutProperty('satellite-base', 'visibility', nextBasemap === 'satellite' ? 'visible' : 'none');
  }, []);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: detailStyle,
      center: [50.5106, 26.0325],
      zoom: 13,
      pitch: 52,
      bearing: -18,
      minZoom: 7,
      maxZoom: 18,
      maxPitch: 75,
      attributionControl: false,
    });
    mapRef.current = map;
    const resizeObserver = new ResizeObserver(() => map.resize());
    resizeObserver.observe(containerRef.current);
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'bottom-left');
    map.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-right');

    map.on('load', () => {
      map.setTerrain({ source: 'terrainSource', exaggeration: 1 });
      map.addSource('track', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: bahrainTrack ? [bahrainTrack] : [] },
      });
      map.addLayer({
        id: 'track-glow', type: 'line', source: 'track',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': '#d9e7ef', 'line-width': 18, 'line-opacity': 0.16, 'line-blur': 8 },
      });
      map.addLayer({
        id: 'track-line', type: 'line', source: 'track',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': '#02070d', 'line-width': 6.2, 'line-opacity': 0.98 },
      });
      map.addSource('track-sectors', { type: 'geojson', data: bahrainTrackSectors });
      map.addLayer({
        id: 'sector-lines', type: 'line', source: 'track-sectors',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': [
            'match', ['get', 'sector'],
            1, '#ff344c',
            2, '#32c8e6',
            3, '#f2c94c',
            '#f5f8fa',
          ],
          'line-width': 3,
          'line-opacity': 0.98,
        },
      });
      map.addSource('drs-zones', { type: 'geojson', data: bahrainDrsZones });
      map.addLayer({
        id: 'drs-glow', type: 'line', source: 'drs-zones',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': '#45e38b', 'line-width': 13,
          'line-opacity': 0.22, 'line-blur': 5,
        },
      });
      map.addLayer({
        id: 'drs-lines', type: 'line', source: 'drs-zones',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': '#70f2a8', 'line-width': 2.1,
          'line-opacity': 0.92, 'line-dasharray': [1.15, 2.35],
        },
      });
      map.addSource('drs-detection-leaders', { type: 'geojson', data: bahrainDrsDetectionLeaders });
      map.addLayer({
        id: 'drs-detection-leader-casing', type: 'line', source: 'drs-detection-leaders',
        layout: { 'line-cap': 'round' },
        paint: {
          'line-color': '#06100b', 'line-width': 4.5,
          'line-opacity': 0.92,
        },
      });
      map.addLayer({
        id: 'drs-detection-leaders', type: 'line', source: 'drs-detection-leaders',
        layout: { 'line-cap': 'round' },
        paint: {
          'line-color': '#9bff73', 'line-width': 1.8,
          'line-opacity': 1,
        },
      });
      map.addSource('drs-detection-anchors', { type: 'geojson', data: bahrainDrsDetectionAnchors });
      map.addSource('drs-detection-labels', { type: 'geojson', data: bahrainDrsDetectionLabels });
      map.addLayer({
        id: 'drs-detection-points', type: 'circle', source: 'drs-detection-anchors',
        paint: {
          'circle-radius': 5,
          'circle-color': '#9bff73',
          'circle-stroke-color': '#06100b',
          'circle-stroke-width': 2.5,
        },
      });
      const calloutCanvas = document.createElement('canvas');
      calloutCanvas.width = 96;
      calloutCanvas.height = 32;
      const calloutContext = calloutCanvas.getContext('2d');
      if (calloutContext) {
        calloutContext.fillStyle = '#9bff73';
        calloutContext.fillRect(2, 2, 92, 28);
        calloutContext.strokeStyle = '#06100b';
        calloutContext.lineWidth = 4;
        calloutContext.strokeRect(2, 2, 92, 28);
        map.addImage('drs-callout-background', calloutContext.getImageData(0, 0, 96, 32), {
          pixelRatio: 2,
          stretchX: [[12, 84]],
          stretchY: [[10, 22]],
          content: [12, 8, 84, 24],
        });
      }
      map.addLayer({
        id: 'drs-detection-labels', type: 'symbol', source: 'drs-detection-labels',
        layout: {
          'icon-image': 'drs-callout-background',
          'icon-text-fit': 'both',
          'icon-text-fit-padding': [5, 7, 5, 7],
          'icon-allow-overlap': true,
          'text-field': ['get', 'label'],
          'text-size': 8,
          'text-allow-overlap': true,
        },
        paint: {
          'text-color': '#06100b',
        },
      });
      map.addSource('turn-label-leaders', { type: 'geojson', data: bahrainTurnLabelLeaders });
      map.addLayer({
        id: 'turn-label-leaders', type: 'line', source: 'turn-label-leaders',
        paint: {
          'line-color': '#70808a',
          'line-width': 0.8,
          'line-opacity': 0.58,
        },
      });
      map.addSource('turn-labels', { type: 'geojson', data: bahrainTurnLabels });
      map.addLayer({
        id: 'turn-points', type: 'circle', source: 'turn-labels',
        paint: {
          'circle-radius': 9,
          'circle-color': '#121b23',
          'circle-stroke-color': '#02070d',
          'circle-stroke-width': 3,
        },
      });
      map.addLayer({
        id: 'turn-labels', type: 'symbol', source: 'turn-labels',
        layout: {
          'text-field': ['get', 'label'],
          'text-size': 9,
          'text-allow-overlap': true,
        },
        paint: { 'text-color': '#f6f9fa' },
      });
      map.addSource('track-points', { type: 'geojson', data: bahrainTrackPoints });
      const checkerCanvas = document.createElement('canvas');
      checkerCanvas.width = 32;
      checkerCanvas.height = 32;
      const checkerContext = checkerCanvas.getContext('2d');
      if (checkerContext) {
        checkerContext.clearRect(0, 0, 32, 32);
        checkerContext.save();
        checkerContext.beginPath();
        checkerContext.arc(16, 16, 13, 0, Math.PI * 2);
        checkerContext.clip();
        const square = 6.5;
        for (let row = 0; row < 4; row += 1) {
          for (let column = 0; column < 4; column += 1) {
            checkerContext.fillStyle = (row + column) % 2 === 0 ? '#f5f8fa' : '#101820';
            checkerContext.fillRect(3 + column * square, 3 + row * square, square, square);
          }
        }
        checkerContext.restore();
        checkerContext.beginPath();
        checkerContext.arc(16, 16, 13.5, 0, Math.PI * 2);
        checkerContext.strokeStyle = '#02070d';
        checkerContext.lineWidth = 4;
        checkerContext.stroke();
        const checkerImage = checkerContext.getImageData(0, 0, 32, 32);
        map.addImage('finish-checker', checkerImage, { pixelRatio: 2 });
      }
      map.addSource('start-finish-leader', { type: 'geojson', data: bahrainStartFinishLeader });
      map.addLayer({
        id: 'start-finish-leader', type: 'line', source: 'start-finish-leader',
        paint: { 'line-color': '#a7b4bc', 'line-width': 0.9, 'line-opacity': 0.72 },
      });
      map.addLayer({
        id: 'start-finish-marker', type: 'symbol', source: 'track-points',
        filter: ['==', ['get', 'kind'], 'start'],
        layout: {
          'icon-image': 'finish-checker',
          'icon-size': 1,
          'icon-allow-overlap': true,
        },
      });
      map.addLayer({
        id: 'track-info-points', type: 'circle', source: 'track-points',
        filter: ['==', ['get', 'kind'], 'sector'],
        paint: {
          'circle-radius': 5,
          'circle-color': [
            'match', ['get', 'kind'],
            'start', '#ff2038',
            '#ffd34e',
          ],
          'circle-stroke-color': '#f7fbff',
          'circle-stroke-width': 1.5,
        },
      });
      map.addLayer({
        id: 'track-info-labels', type: 'symbol', source: 'track-points',
        filter: ['==', ['get', 'kind'], 'sector'],
        layout: {
          'text-field': ['get', 'label'],
          'text-size': 10,
          'text-offset': [0, 1.25],
          'text-anchor': 'top',
          'text-allow-overlap': true,
        },
        paint: {
          'text-color': '#ffffff',
          'text-halo-color': '#06101a',
          'text-halo-width': 1.5,
        },
      });
      map.addSource('travel', { type: 'geojson', data: travelPoints });
      map.addLayer({
        id: 'travel-points', type: 'circle', source: 'travel',
        layout: { visibility: 'none' },
        paint: {
          'circle-radius': 7,
          'circle-color': '#ff2038',
          'circle-stroke-color': '#f7fbff',
          'circle-stroke-width': 2,
        },
      });
      map.addLayer({
        id: 'travel-labels', type: 'symbol', source: 'travel',
        layout: {
          visibility: 'none',
          'text-field': ['get', 'name'],
          'text-size': 11,
          'text-offset': [0, 1.6],
          'text-anchor': 'top',
        },
        paint: {
          'text-color': '#ffffff',
          'text-halo-color': '#06101a',
          'text-halo-width': 1.5,
        },
      });
      map.on('mouseenter', 'travel-points', () => {
        map.getCanvas().style.cursor = 'pointer';
      });
      map.on('mouseleave', 'travel-points', () => {
        map.getCanvas().style.cursor = '';
      });
      map.on('click', 'travel-points', (event) => {
        const feature = event.features?.[0];
        if (!feature || feature.geometry.type !== 'Point') return;

        const popupContent = document.createElement('div');
        const kind = document.createElement('span');
        const name = document.createElement('strong');
        const description = document.createElement('p');
        kind.textContent = String(feature.properties?.kind ?? 'Точка интереса');
        name.textContent = String(feature.properties?.name ?? 'Объект');
        description.textContent = String(feature.properties?.description ?? '');
        popupContent.className = 'poi-popup-content';
        popupContent.append(kind, name, description);

        new maplibregl.Popup({ offset: 14, className: 'atlas-poi-popup' })
          .setLngLat(feature.geometry.coordinates as [number, number])
          .setDOMContent(popupContent)
          .addTo(map);
      });
      map.on('mouseenter', 'turn-points', () => {
        map.getCanvas().style.cursor = 'pointer';
      });
      map.on('mouseleave', 'turn-points', () => {
        map.getCanvas().style.cursor = '';
      });
      map.on('click', 'turn-points', (event) => {
        const feature = event.features?.[0];
        if (!feature || feature.geometry.type !== 'Point') return;

        const popupContent = document.createElement('div');
        const kind = document.createElement('span');
        const title = document.createElement('strong');
        const description = document.createElement('p');
        kind.textContent = 'Элемент трассы';
        title.textContent = String(feature.properties?.title ?? 'Поворот');
        description.textContent = String(feature.properties?.description ?? '');
        popupContent.className = 'poi-popup-content';
        popupContent.append(kind, title, description);

        new maplibregl.Popup({ offset: 13, className: 'atlas-poi-popup' })
          .setLngLat(feature.geometry.coordinates as [number, number])
          .setDOMContent(popupContent)
          .addTo(map);
      });
      const bounds = trackBounds();
      if (bounds) map.fitBounds(bounds, {
        padding: 92, maxZoom: 15.3, pitch: 52, bearing: -18, duration: 0,
      });
      setReady(true);
    });

    return () => {
      resizeObserver.disconnect();
      map.remove();
      mapRef.current = null;
    };
  }, []);

  return (
    <main className="track-page">
      <header className="track-topbar">
        <Link className="brand" href="/" aria-label="Вернуться в F1 Geovisual Atlas">
          <span className="brand-mark" aria-hidden="true">F1</span>
          <span><strong>Geovisual Atlas</strong><small>География скорости</small></span>
        </Link>
        <Link className="back-to-atlas" href="/">← Вернуться к глобусу</Link>
        <span className="track-stage-index">Этап 01 · 2024</span>
      </header>

      <section className="track-hero">
        <div className="track-map-wrap">
          <div ref={containerRef} className="track-map" aria-label="Карта Bahrain International Circuit" />
          {mode === 'model' && <BahrainModelViewer />}
          <div className="track-map-shade" aria-hidden="true" />
          <div className="detail-mode" role="group" aria-label="Режим карты">
            <button type="button" className={mode === 'track' ? 'is-active' : ''} onClick={() => showMode('track')} disabled={!ready}>Трасса</button>
            <button type="button" className={mode === 'travel' ? 'is-active' : ''} onClick={() => showMode('travel')} disabled={!ready}>Поездка</button>
            <button type="button" className={mode === 'model' ? 'is-active' : ''} onClick={() => showMode('model')} disabled={!ready}>3D</button>
          </div>
          {mode === 'track' && (
            <div className="track-basemap-control" role="group" aria-label="Подложка карты трассы">
              <button type="button" className={basemap === 'dark' ? 'is-active' : ''} onClick={() => selectBasemap('dark')}>Карта</button>
              <button type="button" className={basemap === 'satellite' ? 'is-active' : ''} onClick={() => selectBasemap('satellite')}>Спутник</button>
            </div>
          )}
          {mode === 'track' && (
            <div className="track-map-legend" aria-label="Условные обозначения схемы трассы">
              <span><i className="legend-turn" />Повороты</span>
              <span><i className="legend-sectors"><b /><b /><b /></i>Секторы 1–3</span>
              <span><i className="legend-drs" />DRS</span>
              <span><i className="legend-drs-detection" />Детекция DRS</span>
            </div>
          )}
          {mode === 'track' && (
            <button className="return-to-track" type="button" onClick={() => focusTrack()} disabled={!ready}>
              <span aria-hidden="true">◎</span>
              Вернуться к трассе
            </button>
          )}
          <div className="track-map-caption">
            <span className="live-dot" aria-hidden="true" />
            {mode === 'track'
              ? 'Контур конфигурации Гран-при'
              : mode === 'travel'
                ? 'Пилотный туристический слой'
                : 'Интерактивная модель рельефа трассы'}
          </div>
        </div>

        <aside className="track-summary">
          <span className="eyebrow">Сахир · Бахрейн</span>
          <p className="track-kicker">Bahrain International Circuit</p>
          <h1>Бахрейн</h1>
          <p className="track-lead">Пустынная трасса, открывающая сезон 2024. Первый пилотный объект подробного картографического атласа.</p>
          <dl className="track-metrics">
            <div><dt>Длина</dt><dd>5,412 км</dd></div>
            <div><dt>Круги</dt><dd>57</dd></div>
            <div><dt>Повороты</dt><dd>15</dd></div>
            <div><dt>Дебют</dt><dd>2004</dd></div>
          </dl>
          <div className="track-note">
            <span>Тип трассы</span>
            <strong>Стационарная</strong>
          </div>
        </aside>
      </section>

      <section className="track-content">
        <article className="podium-panel">
          <div className="section-heading">
            <span className="eyebrow">Результат этапа</span>
            <h2>Подиум 2024</h2>
          </div>
          <ol className="podium-list">
            {bahrain2024Result.podium.map((result) => (
              <li key={result.position}>
                <span className="podium-place">P{result.position}</span>
                <span><strong>{result.driver.nameRu}</strong><small>{result.team.name}</small></span>
                <span className="podium-result"><time>{result.time}</time><small>{result.points} очков</small></span>
              </li>
            ))}
          </ol>
          <div className="fastest-lap">
            <span className="fastest-lap-mark" aria-hidden="true">◉</span>
            <span><small>Быстрый круг</small><strong>{bahrain2024Result.fastestLap.driver.nameRu}</strong></span>
            <span><small>Круг {bahrain2024Result.fastestLap.lap}</small><strong>{bahrain2024Result.fastestLap.time}</strong></span>
          </div>
        </article>

        <article className="travel-panel">
          <div className="section-heading">
            <span className="eyebrow">Для поездки</span>
            <h2>География этапа</h2>
          </div>
          <p>Режим «Поездка» связывает трассу с Манамой и международным аэропортом. Далее сюда добавятся проверенные категории мест без перегрузки основной карты.</p>
          <ul className="travel-categories">
            <li><span>01</span>Транспорт</li>
            <li><span>02</span>Размещение</li>
            <li><span>03</span>Достопримечательности</li>
          </ul>
        </article>
      </section>
    </main>
  );
}
