'use client';

import Link from 'next/link';
import type { CSSProperties } from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import * as maplibregl from 'maplibre-gl';
import type { Map as MapLibreMap } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import type { ResultGeography } from '../data/competitor-contract';
import { addAtlasMapAttribution } from '../lib/map-attribution';
import { useTheme, type AtlasTheme } from './theme-provider';

type GeographyMetric = 'wins' | 'podiums' | 'raceEntries' | 'points';
const geographyMetrics: Array<{ key: GeographyMetric; label: string; unit: string }> = [
  { key: 'wins', label: 'Победы', unit: 'побед' },
  { key: 'podiums', label: 'Подиумы', unit: 'подиумов' },
  { key: 'raceEntries', label: 'Этапы', unit: 'этапов' },
  { key: 'points', label: 'Очки', unit: 'очков' },
];

function rankPoints(points: ResultGeography[], metric: GeographyMetric) {
  return [...points].sort((left, right) => right[metric] - left[metric] || right.wins - left.wins || left.name.localeCompare(right.name, 'ru'));
}

const mapStyle: maplibregl.StyleSpecification = {
  version: 8,
  glyphs: 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf',
  sources: {
    base: {
      type: 'vector',
      url: 'https://tiles.openfreemap.org/planet',
      attribution: '&copy; OpenStreetMap contributors &copy; OpenFreeMap',
    },
  },
  layers: [
    { id: 'driver-results-background', type: 'background', paint: { 'background-color': '#071017' } },
    { id: 'driver-results-land', type: 'fill', source: 'base', 'source-layer': 'landcover', paint: { 'fill-color': ['match', ['get', 'class'], 'wood', '#0b1717', 'grass', '#101b19', '#101a20'], 'fill-opacity': .92 } },
    { id: 'driver-results-water', type: 'fill', source: 'base', 'source-layer': 'water', paint: { 'fill-color': '#02080e' } },
    { id: 'driver-results-boundaries', type: 'line', source: 'base', 'source-layer': 'boundary', paint: { 'line-color': '#78909c', 'line-width': ['interpolate', ['linear'], ['zoom'], 1, .35, 7, 1], 'line-opacity': .22 } },
    { id: 'driver-results-roads', type: 'line', source: 'base', 'source-layer': 'transportation', minzoom: 4, maxzoom: 12, paint: { 'line-color': '#6a7d87', 'line-width': ['interpolate', ['linear'], ['zoom'], 4, .25, 10, 1.2], 'line-opacity': .2 } },
    { id: 'driver-results-places', type: 'symbol', source: 'base', 'source-layer': 'place', minzoom: 1.4,
      layout: { 'text-field': ['coalesce', ['get', 'name:ru'], ['get', 'name']], 'text-font': ['Noto Sans Regular'], 'text-size': ['interpolate', ['linear'], ['zoom'], 1.4, 9, 5, 12], 'text-allow-overlap': false },
      paint: { 'text-color': '#8ca2aa', 'text-halo-color': '#061015', 'text-halo-width': 1.2 } },
  ],
};

function applyMapTheme(map: MapLibreMap, theme: AtlasTheme) {
  const light = theme === 'light';
  const paint = (layer: string, property: Parameters<MapLibreMap['setPaintProperty']>[1], value: Parameters<MapLibreMap['setPaintProperty']>[2]) => {
    if (map.getLayer(layer)) map.setPaintProperty(layer, property, value);
  };
  paint('driver-results-background', 'background-color', light ? '#d9e4e7' : '#071017');
  paint('driver-results-land', 'fill-color', light
    ? ['match', ['get', 'class'], 'wood', '#c9d8cf', 'grass', '#d7e1cf', '#dfe5df']
    : ['match', ['get', 'class'], 'wood', '#0b1717', 'grass', '#101b19', '#101a20']);
  paint('driver-results-water', 'fill-color', light ? '#b8d4de' : '#02080e');
  paint('driver-results-boundaries', 'line-color', light ? '#526d78' : '#78909c');
  paint('driver-results-boundaries', 'line-opacity', light ? .42 : .22);
  paint('driver-results-roads', 'line-color', light ? '#6d838d' : '#6a7d87');
  paint('driver-results-roads', 'line-opacity', light ? .3 : .2);
  paint('driver-results-places', 'text-color', light ? '#405965' : '#8ca2aa');
  paint('driver-results-places', 'text-halo-color', light ? '#f4f7f5' : '#061015');
  paint('driver-results-points', 'circle-stroke-color', light ? '#ffffff' : '#dce8ec');
  map.setSky(light ? {
    'sky-color': '#dce9ed', 'horizon-color': '#f8fbfa', 'fog-color': '#c7dce3',
    'fog-ground-blend': .38, 'horizon-fog-blend': .18, 'sky-horizon-blend': .22, 'atmosphere-blend': .88,
  } : {
    'sky-color': '#01070d', 'horizon-color': '#3d7890', 'fog-color': '#123246',
    'fog-ground-blend': .42, 'horizon-fog-blend': .22, 'sky-horizon-blend': .28, 'atmosphere-blend': .9,
  });
}

function fitMap(map: MapLibreMap, node: HTMLDivElement, points: ResultGeography[]) {
  map.resize();
  if (points.length === 0) return;
  const bounds = new maplibregl.LngLatBounds();
  points.forEach((point) => bounds.extend(point.coordinates));
  map.fitBounds(bounds, { padding: Math.max(38, Math.min(node.clientWidth, node.clientHeight) * .08), maxZoom: 2.25, duration: 0 });
}

export function DriverResultsMap({ points, color }: { points: ResultGeography[]; color: string }) {
  const { theme } = useTheme();
  const nodeRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [metric, setMetric] = useState<GeographyMetric>('wins');
  const ranked = useMemo(() => rankPoints(points, metric), [metric, points]);
  const [selectedId, setSelectedId] = useState<string | null>(ranked[0]?.id ?? null);
  const selected = points.find((point) => point.id === selectedId) ?? ranked[0] ?? null;
  const activeMetric = geographyMetrics.find((item) => item.key === metric)!;
  const maxValue = Math.max(0, ...points.map((point) => point[metric]));

  useEffect(() => {
    if (!nodeRef.current) return undefined;
    let map: MapLibreMap;
    try {
      map = new maplibregl.Map({
        container: nodeRef.current,
        style: mapStyle,
        center: [10, 22],
        zoom: 1,
        minZoom: 0,
        maxZoom: 10,
        renderWorldCopies: false,
        attributionControl: false,
      });
    } catch {
      queueMicrotask(() => setFailed(true));
      return undefined;
    }
    mapRef.current = map;
    addAtlasMapAttribution(map);
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'bottom-right');
    map.on('load', () => {
      map.addSource('driver-results-data', {
        type: 'geojson',
        data: {
          type: 'FeatureCollection',
          features: points.map((point) => ({
            type: 'Feature',
            geometry: { type: 'Point', coordinates: point.coordinates },
            properties: { id: point.id, name: point.name, wins: point.wins, podiums: point.podiums, raceEntries: point.raceEntries, points: point.points },
          })),
        },
      });
      map.addLayer({
        id: 'driver-results-points',
        type: 'circle',
        source: 'driver-results-data',
        paint: {
          'circle-radius': 7,
          'circle-color': color,
          'circle-opacity': .92,
          'circle-stroke-color': '#dce8ec',
          'circle-stroke-width': ['case', ['==', ['get', 'id'], selectedId ?? ''], 3, 1.4],
        },
      });
      map.addLayer({
        id: 'driver-results-labels',
        type: 'symbol',
        source: 'driver-results-data',
        minzoom: 0,
        filter: ['==', ['get', 'id'], selectedId ?? ''],
        layout: {
          'text-field': ['get', 'name'],
          'text-font': ['Noto Sans Regular'],
          'text-size': 11,
          'text-offset': [0, 1.9],
          'text-anchor': 'top',
          'text-allow-overlap': false,
        },
        paint: { 'text-color': theme === 'light' ? '#243c46' : '#dce8ec', 'text-halo-color': theme === 'light' ? '#f4f7f5' : '#061015', 'text-halo-width': 1.4 },
      });
      applyMapTheme(map, document.documentElement.dataset.theme === 'light' ? 'light' : 'dark');
      fitMap(map, nodeRef.current!, points);
      setReady(true);
    });
    map.on('error', () => setFailed(true));
    map.on('mouseenter', 'driver-results-points', () => { map.getCanvas().style.cursor = 'pointer'; });
    map.on('mouseleave', 'driver-results-points', () => { map.getCanvas().style.cursor = ''; });
    map.on('click', 'driver-results-points', (event) => {
      const feature = event.features?.[0];
      const id = String(feature?.properties?.id ?? '');
      if (id) setSelectedId(id);
    });
    const observer = new ResizeObserver(() => {
      map.resize();
    });
    observer.observe(nodeRef.current);
    return () => {
      observer.disconnect();
      map.remove();
      mapRef.current = null;
    };
  // Map lifecycle follows data; selection and theme are updated by their own effects.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [color, points]);

  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map?.isStyleLoaded()) return;
    applyMapTheme(map, theme);
    map.setPaintProperty('driver-results-labels', 'text-color', theme === 'light' ? '#243c46' : '#dce8ec');
    map.setPaintProperty('driver-results-labels', 'text-halo-color', theme === 'light' ? '#f4f7f5' : '#061015');
  }, [ready, theme]);

  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map?.getLayer('driver-results-points')) return;
    map.setPaintProperty('driver-results-points', 'circle-stroke-width', ['case', ['==', ['get', 'id'], selectedId ?? ''], 3, 1.4]);
    map.setFilter('driver-results-labels', ['==', ['get', 'id'], selectedId ?? '']);
  }, [ready, selectedId]);

  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map?.getLayer('driver-results-points')) return;
    const maximum = Math.max(1, maxValue);
    map.setPaintProperty('driver-results-points', 'circle-radius', [
      'case',
      ['>', ['get', metric], 0],
      ['interpolate', ['linear'], ['get', metric], 0, 6, maximum, 20],
      4,
    ]);
    map.setPaintProperty('driver-results-points', 'circle-color', ['case', ['>', ['get', metric], 0], color, '#657983']);
    map.setPaintProperty('driver-results-points', 'circle-opacity', ['case', ['>', ['get', metric], 0], .94, .48]);
  }, [color, maxValue, metric, ready]);

  if (points.length === 0) return <p className="driver-profile-empty">География результатов пока не загружена</p>;

  return (
    <div className="driver-results-atlas">
      <div className="driver-results-atlas__map-wrap">
        <div className="driver-results-atlas__toolbar" aria-label="Показатель карты карьеры">
          {geographyMetrics.map((item) => <button type="button" aria-pressed={metric === item.key} className={metric === item.key ? 'is-active' : undefined} onClick={() => { setMetric(item.key); setSelectedId(rankPoints(points, item.key)[0]?.id ?? null); }} key={item.key}>{item.label}</button>)}
        </div>
        <div ref={nodeRef} className="driver-results-atlas__map" aria-label="Карта результатов пилота по трассам" />
        <div className="driver-results-atlas__legend" aria-label="Условные обозначения карты">
          <span><i className="is-win" style={{ '--driver-map-color': color } as CSSProperties} />Размер — {activeMetric.label.toLocaleLowerCase('ru')}</span>
          <span><i />Нет значения по показателю</span>
        </div>
        {failed ? <p className="driver-results-atlas__error" role="status">Картографическая подложка временно недоступна</p> : null}
      </div>
      <aside className="driver-results-atlas__panel" aria-label="Результат на выбранной трассе">
        <header><span>География карьеры</span><strong>{points.length}</strong><small>трасс в базе</small></header>
        {selected ? <article>
          <small>Выбранная трасса</small>
          <h3>{selected.name}</h3>
          <dl>
            <div><dt>Победы</dt><dd>{selected.wins}</dd></div>
            <div><dt>Подиумы</dt><dd>{selected.podiums}</dd></div>
            <div><dt>Этапы</dt><dd>{selected.raceEntries}</dd></div>
            <div><dt>Очки</dt><dd>{selected.points}</dd></div>
          </dl>
          {selected.isPublished && selected.slug ? <Link href={`/circuits/${selected.slug}`}>Открыть профиль трассы <span>→</span></Link> : <p>Профиль трассы ещё не опубликован</p>}
        </article> : null}
        <div className="driver-results-atlas__ranking">
          <span>Рейтинг трасс · {activeMetric.label.toLocaleLowerCase('ru')}</span>
          {ranked.filter((point) => point[metric] > 0).slice(0, 8).map((point, index) => <button type="button" className={point.id === selected?.id ? 'is-active' : undefined} onClick={() => setSelectedId(point.id)} key={point.id}>
            <small>{String(index + 1).padStart(2, '0')}</small><strong>{point.name}</strong><b>{point[metric]}<em>{activeMetric.unit}</em></b>
          </button>)}
        </div>
      </aside>
    </div>
  );
}
