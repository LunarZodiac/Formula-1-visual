'use client';

import * as maplibregl from 'maplibre-gl';
import type { Map as MapLibreMap } from 'maplibre-gl';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import 'maplibre-gl/dist/maplibre-gl.css';
import { BahrainModelViewer } from './bahrain-model-viewer';
import type { CircuitPageData } from '../data/circuit-page-data';
import driverCatalog from '../data/catalogs/drivers.json';
import { circuitTechnicalData } from '../data/circuit-track-details';
import { trackGeometries } from '../data/track-geometries';
import type { SeasonSnapshot, SnapshotSessionResult } from '../data/web-snapshots';

type DetailMode = 'track' | 'travel' | 'model';
type DetailBasemap = 'dark' | 'satellite';
type ResultView = 'sprintQualifying' | 'sprint' | 'qualifying' | 'race';

const resultViewLabels: Record<ResultView, string> = {
  sprintQualifying: 'Спринт-квалификация',
  sprint: 'Спринт',
  qualifying: 'Квалификация',
  race: 'Гонка',
};

const localizedDriverNames = new Map(
  driverCatalog.map((driver) => [driver.nameEn.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase(), driver.nameRu]),
);

function normalizeDriverName(name: string) {
  return name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

function transliterateDriverName(name: string) {
  const pairs: Array<[RegExp, string]> = [
    [/sch/g, 'ш'], [/sh/g, 'ш'], [/ch/g, 'ч'], [/zh/g, 'ж'], [/kh/g, 'х'],
    [/ph/g, 'ф'], [/th/g, 'т'], [/qu/g, 'кв'], [/ck/g, 'к'], [/ya/g, 'я'],
    [/yu/g, 'ю'], [/yo/g, 'ё'], [/ye/g, 'е'], [/j/g, 'дж'], [/c(?=[eiy])/g, 'с'],
    [/c/g, 'к'], [/x/g, 'кс'], [/w/g, 'у'],
  ];
  const letters: Record<string, string> = {
    a: 'а', b: 'б', d: 'д', e: 'е', f: 'ф', g: 'г', h: 'х', i: 'и',
    k: 'к', l: 'л', m: 'м', n: 'н', o: 'о', p: 'п', q: 'к', r: 'р',
    s: 'с', t: 'т', u: 'у', v: 'в', y: 'и', z: 'з',
  };
  let value = normalizeDriverName(name);
  for (const [pattern, replacement] of pairs) value = value.replace(pattern, replacement);
  return value
    .split(' ')
    .map((part) => part.replace(/[a-z]/g, (letter) => letters[letter] ?? letter))
    .map((part) => part ? `${part[0].toLocaleUpperCase('ru-RU')}${part.slice(1)}` : part)
    .join(' ');
}

function localizeDriverName(result: Pick<SnapshotSessionResult, 'givenName' | 'familyName'>) {
  const original = `${result.givenName} ${result.familyName}`;
  return localizedDriverNames.get(normalizeDriverName(original)) ?? transliterateDriverName(original);
}

function formatMilliseconds(milliseconds: number, showHours = false) {
  const totalSeconds = Math.floor(milliseconds / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const millis = milliseconds % 1000;
  if (showHours || hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(millis).padStart(3, '0')}`;
  }
  return `${minutes}:${String(seconds).padStart(2, '0')}.${String(millis).padStart(3, '0')}`;
}

function formatResultValue(result: SnapshotSessionResult, view: ResultView) {
  if (view === 'qualifying') return result.details.q3 ?? result.details.q2 ?? result.details.q1 ?? '—';
  if (view === 'sprintQualifying') return result.details.sq3 ?? result.details.sq2 ?? result.details.sq1 ?? '—';
  if (result.position === 1 && result.elapsedMs !== null) return formatMilliseconds(result.elapsedMs, true);
  if (result.gapText) return result.gapText;
  if (result.gapMs !== null) return `+${(result.gapMs / 1000).toFixed(3)}`;
  return result.status ?? '—';
}

function teamInitials(name: string | null) {
  if (!name) return 'F1';
  return name.split(/\s+/).map((part) => part[0]).join('').slice(0, 2).toUpperCase();
}

function makeTravelPoints(pageData: CircuitPageData): GeoJSON.FeatureCollection<GeoJSON.Point> {
  return {
    type: 'FeatureCollection',
    features: pageData.travel.points.map((point) => ({
      type: 'Feature',
      properties: {
        id: point.id,
        name: point.name,
        kind: point.kindRu,
        description: point.descriptionRu,
      },
      geometry: { type: 'Point', coordinates: point.coordinates },
    })),
  };
}

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
      id: 'context-buildings-3d', type: 'fill-extrusion', source: 'streets', 'source-layer': 'building', minzoom: 14,
      paint: {
        'fill-extrusion-color': '#61727c',
        'fill-extrusion-height': ['coalesce', ['get', 'render_height'], ['get', 'height'], 6],
        'fill-extrusion-base': ['coalesce', ['get', 'render_min_height'], ['get', 'min_height'], 0],
        'fill-extrusion-opacity': ['interpolate', ['linear'], ['zoom'], 14, 0.16, 17, 0.42],
        'fill-extrusion-vertical-gradient': true,
      },
    },
    {
      id: 'context-roads-casing', type: 'line', source: 'streets', 'source-layer': 'transportation', minzoom: 10,
      layout: { visibility: 'none', 'line-cap': 'round', 'line-join': 'round' },
      paint: {
        'line-color': '#02070d',
        'line-width': ['interpolate', ['linear'], ['zoom'], 10, 1.2, 17, 7],
        'line-opacity': 0.72,
      },
    },
    {
      id: 'context-roads', type: 'line', source: 'streets', 'source-layer': 'transportation', minzoom: 10,
      layout: { visibility: 'none', 'line-cap': 'round', 'line-join': 'round' },
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
        'text-color': '#f4f8fa',
        'text-halo-color': 'rgba(2, 7, 13, 0.92)',
        'text-halo-width': 1.4,
        'text-opacity': 0.96,
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
        'text-color': '#f4f8fa',
        'text-halo-color': 'rgba(2, 7, 13, 0.94)',
        'text-halo-width': 1.6,
        'text-opacity': 0.96,
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

function trackBounds(track: GeoJSON.Feature<GeoJSON.LineString> | undefined) {
  if (!track) return undefined;
  const [first, ...coordinates] = track.geometry.coordinates;
  return coordinates.reduce(
    (bounds, coordinate) => bounds.extend(coordinate),
    new maplibregl.LngLatBounds(first, first),
  );
}

export function CircuitExperience({ pageData }: { pageData: CircuitPageData }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const circuitTrack = trackGeometries[pageData.geometryId];
  const technicalData = circuitTechnicalData[pageData.id as keyof typeof circuitTechnicalData];
  const hasTechnicalOverlay = pageData.features.technicalOverlay && Boolean(technicalData);
  const travelPoints = useMemo(() => makeTravelPoints(pageData), [pageData]);
  const circuitSeasonOptions = pageData.results.seasons;
  const [mode, setMode] = useState<DetailMode>('track');
  const [basemap, setBasemap] = useState<DetailBasemap>('satellite');
  const [ready, setReady] = useState(false);
  const [resultSeason, setResultSeason] = useState(pageData.results.defaultSeason);
  const [resultView, setResultView] = useState<ResultView>('race');
  const [seasonSnapshot, setSeasonSnapshot] = useState<SeasonSnapshot | null>(null);
  const [resultStatus, setResultStatus] = useState<'loading' | 'ready' | 'error'>('loading');

  const bahrainRound = useMemo(
    () => seasonSnapshot?.calendar.find((race) => race.circuit.id === pageData.id),
    [pageData.id, seasonSnapshot],
  );
  const resultSessions = useMemo(() => {
    if (!seasonSnapshot || !bahrainRound) return [] as Array<{ id: ResultView; results: SnapshotSessionResult[] }>;
    const round = String(bahrainRound.round);
    return [
      { id: 'sprintQualifying' as const, results: seasonSnapshot.sprintQualifyingResults?.[round] ?? [] },
      { id: 'sprint' as const, results: seasonSnapshot.sprintResults?.[round] ?? [] },
      { id: 'qualifying' as const, results: seasonSnapshot.qualifyingResults?.[round] ?? [] },
      { id: 'race' as const, results: seasonSnapshot.raceResults?.[round] ?? [] },
    ].filter((session) => session.results.length > 0);
  }, [bahrainRound, seasonSnapshot]);
  const activeSession = resultSessions.find((session) => session.id === resultView) ?? resultSessions.at(-1);
  const activeResults = activeSession?.results ?? [];
  const podiumResults = activeResults.slice(0, 3);
  const remainingResults = activeResults.slice(3);
  const fastestLap = activeResults.find((result) => result.fastestLapRank === 1);

  useEffect(() => {
    const seasonFromUrl = Number(new URLSearchParams(window.location.search).get('season'));
    if (circuitSeasonOptions.includes(seasonFromUrl)) {
      queueMicrotask(() => {
        setResultStatus('loading');
        setResultSeason(seasonFromUrl);
      });
    }
  }, [circuitSeasonOptions]);

  useEffect(() => {
    const controller = new AbortController();
    fetch(`/data/f1/season-${resultSeason}.json`, { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error(`Не удалось загрузить сезон ${resultSeason}`);
        return response.json() as Promise<SeasonSnapshot>;
      })
      .then((snapshot) => {
        const race = snapshot.calendar.find((item) => item.circuit.id === pageData.id);
        if (!race) throw new Error(`В сезоне ${resultSeason} отсутствует этап ${pageData.nameRu}`);
        const round = String(race.round);
        const nextView: ResultView = snapshot.raceResults?.[round]?.length
          ? 'race'
          : snapshot.qualifyingResults?.[round]?.length
            ? 'qualifying'
            : snapshot.sprintResults?.[round]?.length
              ? 'sprint'
              : 'sprintQualifying';
        setSeasonSnapshot(snapshot);
        setResultView(nextView);
        setResultStatus('ready');
      })
      .catch((error) => {
        if (error instanceof DOMException && error.name === 'AbortError') return;
        console.error(error);
        setSeasonSnapshot(null);
        setResultStatus('error');
      });
    return () => controller.abort();
  }, [pageData.id, pageData.nameRu, resultSeason]);

  const changeResultSeason = useCallback((season: number) => {
    setResultStatus('loading');
    setResultSeason(season);
    const url = new URL(window.location.href);
    url.searchParams.set('season', String(season));
    window.history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`);
  }, []);

  const focusTrack = useCallback((duration = 1000) => {
    const map = mapRef.current;
    const bounds = trackBounds(circuitTrack);
    if (!map || !bounds) return;

    map.fitBounds(bounds, {
      padding: {
        top: pageData.map.trackCamera.padding,
        right: pageData.map.trackCamera.padding,
        bottom: pageData.map.trackCamera.padding,
        left: pageData.map.trackCamera.padding,
      },
      maxZoom: pageData.map.trackCamera.maxZoom,
      pitch: pageData.map.trackCamera.pitch,
      bearing: pageData.map.trackCamera.bearing,
      duration,
      essential: true,
    });
  }, [circuitTrack, pageData.map.trackCamera]);

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
        'track-glow', 'track-line', 'track-basic-line', 'sector-lines', 'drs-glow', 'drs-lines',
        'drs-detection-leader-casing', 'drs-detection-leaders',
        'drs-detection-points', 'drs-detection-labels',
        'start-finish-leader', 'start-finish-marker',
        'turn-label-leaders', 'turn-points', 'turn-labels',
        'track-info-points', 'track-info-labels',
      ]
        .forEach((layerId) => {
          if (map.getLayer(layerId)) map.setLayoutProperty(layerId, 'visibility', trackVisibility);
        });
      if (map.getLayer('terrain-hillshade')) map.setLayoutProperty('terrain-hillshade', 'visibility', trackVisibility);
    }

    if (nextMode === 'track') {
      map.setTerrain({ source: 'terrainSource', exaggeration: 1 });
      focusTrack(1200);
    } else if (nextMode === 'travel') {
      map.setTerrain(null);
      map.fitBounds(pageData.map.travelBounds, {
        padding: { top: 76, right: 76, bottom: 76, left: 76 },
        maxZoom: pageData.map.travelZoom,
        pitch: 0,
        bearing: 0,
        duration: 1200,
        essential: true,
      });
    } else {
      map.setTerrain(null);
    }
  }, [focusTrack, pageData.map.travelBounds, pageData.map.travelZoom]);

  const selectBasemap = useCallback((nextBasemap: DetailBasemap) => {
    setBasemap(nextBasemap);
    const map = mapRef.current;
    if (!map) return;
    map.setLayoutProperty('base', 'visibility', nextBasemap === 'dark' ? 'visible' : 'none');
    map.setLayoutProperty('satellite-base', 'visibility', nextBasemap === 'satellite' ? 'visible' : 'none');
    map.setLayoutProperty('context-roads-casing', 'visibility', nextBasemap === 'dark' ? 'visible' : 'none');
    map.setLayoutProperty('context-roads', 'visibility', nextBasemap === 'dark' ? 'visible' : 'none');
    map.setPaintProperty('context-road-labels', 'text-color', nextBasemap === 'dark' ? '#e3edf2' : '#ffffff');
    map.setPaintProperty('context-place-labels', 'text-color', nextBasemap === 'dark' ? '#edf5f8' : '#ffffff');
    map.setPaintProperty('context-buildings-3d', 'fill-extrusion-color', nextBasemap === 'dark' ? '#61727c' : '#b8a991');
  }, []);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: detailStyle,
      center: pageData.location.coordinates,
      zoom: 13,
      pitch: pageData.map.trackCamera.pitch,
      bearing: pageData.map.trackCamera.bearing,
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

    const collapseAttribution = () => {
      const attribution = containerRef.current?.querySelector<HTMLElement>('.maplibregl-ctrl-attrib');
      const toggle = attribution?.querySelector<HTMLButtonElement>('.maplibregl-ctrl-attrib-button');
      attribution?.classList.remove('maplibregl-compact-show');
      toggle?.setAttribute('aria-expanded', 'false');
    };
    window.requestAnimationFrame(collapseAttribution);

    map.on('load', () => {
      collapseAttribution();
      map.setTerrain({ source: 'terrainSource', exaggeration: 1 });
      if (!pageData.features.buildings3d && map.getLayer('context-buildings-3d')) {
        map.setLayoutProperty('context-buildings-3d', 'visibility', 'none');
      }
      map.addSource('track', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: circuitTrack ? [circuitTrack] : [] },
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
      if (!hasTechnicalOverlay) {
        map.addLayer({
          id: 'track-basic-line', type: 'line', source: 'track',
          layout: { 'line-cap': 'round', 'line-join': 'round' },
          paint: { 'line-color': '#ff2038', 'line-width': 2.8, 'line-opacity': 0.96 },
        });
      }
      if (hasTechnicalOverlay && technicalData) {
      map.addSource('track-sectors', { type: 'geojson', data: technicalData.trackSectors });
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
      map.addSource('drs-zones', { type: 'geojson', data: technicalData.drsZones });
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
      map.addSource('drs-detection-leaders', { type: 'geojson', data: technicalData.drsDetectionLeaders });
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
      map.addSource('drs-detection-anchors', { type: 'geojson', data: technicalData.drsDetectionAnchors });
      map.addSource('drs-detection-labels', { type: 'geojson', data: technicalData.drsDetectionLabels });
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
      map.addSource('turn-label-leaders', { type: 'geojson', data: technicalData.turnLabelLeaders });
      map.addLayer({
        id: 'turn-label-leaders', type: 'line', source: 'turn-label-leaders',
        paint: {
          'line-color': '#70808a',
          'line-width': 0.8,
          'line-opacity': 0.58,
        },
      });
      map.addSource('turn-labels', { type: 'geojson', data: technicalData.turnLabels });
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
      map.addSource('track-points', { type: 'geojson', data: technicalData.trackPoints });
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
      map.addSource('start-finish-leader', { type: 'geojson', data: technicalData.startFinishLeader });
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
      }
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
      if (hasTechnicalOverlay) {
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
      }
      const bounds = trackBounds(circuitTrack);
      if (bounds) map.fitBounds(bounds, {
        padding: pageData.map.trackCamera.padding,
        maxZoom: pageData.map.trackCamera.maxZoom,
        pitch: pageData.map.trackCamera.pitch,
        bearing: pageData.map.trackCamera.bearing,
        duration: 0,
      });
      setReady(true);
    });

    return () => {
      resizeObserver.disconnect();
      map.remove();
      mapRef.current = null;
    };
  }, [circuitTrack, hasTechnicalOverlay, pageData, technicalData, travelPoints]);

  return (
    <main className="track-page">
      <header className="track-topbar">
        <Link className="brand" href="/" aria-label="Вернуться на главную страницу «География скорости»">
          <span className="brand-mark" aria-hidden="true">F1</span>
          <span><strong>География скорости</strong><small>Скорость • География • История</small></span>
        </Link>
        <Link className="back-to-atlas" href={`/?season=${resultSeason}#atlas`}>← Вернуться к глобусу</Link>
        <span className="track-stage-index">{pageData.nameRu} · {resultSeason}</span>
      </header>

      <section className="track-hero">
        <div className="track-map-wrap">
          <div ref={containerRef} className="track-map" aria-label={`Карта ${pageData.officialName}`} />
          {mode === 'model' && pageData.features.local3dModel && pageData.id === 'bahrain' && <BahrainModelViewer />}
          <div className="track-map-shade" aria-hidden="true" />
          <div
            className="detail-mode"
            role="group"
            aria-label="Режим карты"
            style={{ gridTemplateColumns: `repeat(${1 + Number(pageData.features.travelMode) + Number(pageData.features.local3dModel)}, 1fr)` }}
          >
            <button type="button" className={mode === 'track' ? 'is-active' : ''} onClick={() => showMode('track')} disabled={!ready}>Трасса</button>
            {pageData.features.travelMode && <button type="button" className={mode === 'travel' ? 'is-active' : ''} onClick={() => showMode('travel')} disabled={!ready}>Поездка</button>}
            {pageData.features.local3dModel && <button type="button" className={mode === 'model' ? 'is-active' : ''} onClick={() => showMode('model')} disabled={!ready}>3D</button>}
          </div>
          {mode === 'track' && (
            <div className="track-basemap-control" role="group" aria-label="Подложка карты трассы">
              <button type="button" className={basemap === 'dark' ? 'is-active' : ''} onClick={() => selectBasemap('dark')}>Карта</button>
              <button type="button" className={basemap === 'satellite' ? 'is-active' : ''} onClick={() => selectBasemap('satellite')}>Спутник</button>
            </div>
          )}
          {mode === 'track' && (
            <div className="track-map-legend" aria-label="Условные обозначения схемы трассы">
              {hasTechnicalOverlay ? <>
                <span><i className="legend-turn" />Повороты</span>
                <span><i className="legend-sectors"><b /><b /><b /></i>Секторы 1–3</span>
                <span><i className="legend-drs" />DRS</span>
                <span><i className="legend-drs-detection" />Детекция DRS</span>
              </> : <span><i className="legend-turn" />Контур трассы</span>}
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
          <span className="eyebrow">{pageData.location.cityRu} · {pageData.location.countryRu}</span>
          <p className="track-kicker">{pageData.officialName}</p>
          <h1 className={pageData.nameRu.length > 18 ? 'is-very-long' : pageData.nameRu.length > 10 ? 'is-long' : undefined}>
            {pageData.nameRu}
          </h1>
          <p className="track-lead">{pageData.summary.description}</p>
          <dl className="track-metrics">
            {pageData.summary.metrics.map((metric) => (
              <div key={metric.label}><dt>{metric.label}</dt><dd>{metric.value}</dd></div>
            ))}
          </dl>
          <div className="track-note">
            <span>Тип трассы</span>
            <strong>{pageData.summary.typeRu}</strong>
          </div>
        </aside>
      </section>

      <section
        className={`race-results-section${resultStatus === 'loading' && seasonSnapshot ? ' is-updating' : ''}`}
        aria-labelledby="race-results-title"
        aria-busy={resultStatus === 'loading'}
      >
        <div className="race-results-heading">
          <div className="section-heading">
            <span className="eyebrow">Результаты этапа</span>
            <h2 id="race-results-title">{pageData.nameRu} · {resultSeason}</h2>
          </div>
          <label className="result-season-select">
            <span>Сезон</span>
            <select value={resultSeason} onChange={(event) => changeResultSeason(Number(event.target.value))}>
              {circuitSeasonOptions.map((season) => <option key={season} value={season}>{season}</option>)}
            </select>
          </label>
        </div>

        {resultSessions.length > 0 && (
          <div className="result-session-tabs" role="tablist" aria-label="Сессия этапа">
            {resultSessions.map((session) => (
              <button
                key={session.id}
                type="button"
                role="tab"
                aria-selected={activeSession?.id === session.id}
                className={activeSession?.id === session.id ? 'is-active' : ''}
                onClick={() => setResultView(session.id)}
              >
                {resultViewLabels[session.id]}
              </button>
            ))}
          </div>
        )}

        {resultStatus === 'loading' && !seasonSnapshot && <div className="race-results-status">Загружаем результаты сезона…</div>}
        {resultStatus === 'loading' && seasonSnapshot && <div className="race-results-update">Обновляем результаты…</div>}
        {resultStatus === 'error' && <div className="race-results-status is-error">Для этого сезона результаты пока недоступны</div>}
        {resultStatus === 'ready' && activeResults.length === 0 && <div className="race-results-status">Результаты этой сессии отсутствуют</div>}

        {activeResults.length > 0 && (
          <div className="race-results-grid">
            <div className="race-podium-column">
              <h3>{activeSession?.id === 'race' || activeSession?.id === 'sprint' ? 'Подиум' : 'Топ-3'}</h3>
              <ol className="podium-visual" aria-label="Первые три позиции">
                {[podiumResults[1], podiumResults[0], podiumResults[2]].filter(Boolean).map((result) => (
                  <li
                    key={result.position}
                    className={`is-place-${result.position}`}
                    style={{ '--team-color': result.teamColor ?? '#5b7890' } as CSSProperties}
                  >
                    <div className="podium-driver-portrait" aria-label={`Место для фотографии: ${localizeDriverName(result)}`}>
                      <span className="driver-silhouette" aria-hidden="true" />
                      <strong>{result.code ?? result.positionText}</strong>
                    </div>
                    <div className="podium-driver-name">
                      <strong>{localizeDriverName(result)}</strong>
                      <small><i className="result-team-mark">{teamInitials(result.constructorName)}</i>{result.constructorName ?? 'Команда не указана'}</small>
                    </div>
                    <div className="podium-step"><b>{result.position}</b></div>
                    <time>{formatResultValue(result, activeSession?.id ?? 'race')}</time>
                    {(activeSession?.id === 'race' || activeSession?.id === 'sprint') && <small>{result.points} очков</small>}
                  </li>
                ))}
              </ol>

              {fastestLap && (activeSession?.id === 'race' || activeSession?.id === 'sprint') && (
                <div className="race-fastest-lap" style={{ '--team-color': fastestLap.teamColor ?? '#5b7890' } as CSSProperties}>
                  <span className="fastest-lap-mark" aria-hidden="true">◉</span>
                  <span><small>Быстрый круг</small><strong>{localizeDriverName(fastestLap)}</strong></span>
                  <span className="race-fastest-team"><i className="result-team-mark">{teamInitials(fastestLap.constructorName)}</i>{fastestLap.constructorName}</span>
                  <span><small>Круг {fastestLap.fastestLapNumber ?? '—'}</small><strong>{fastestLap.fastestLapMs !== null ? formatMilliseconds(fastestLap.fastestLapMs) : '—'}</strong></span>
                </div>
              )}
            </div>

            <div className="race-classification">
              <div className="race-classification__heading">
                <h3>Остальные позиции</h3>
                <span>{activeResults.length} участников</span>
              </div>
              <ol start={4}>
                {remainingResults.map((result) => (
                  <li key={`${result.position}-${result.driverId}`} style={{ '--team-color': result.teamColor ?? '#5b7890' } as CSSProperties}>
                    <b>{result.positionText}</b>
                    <span className="classification-code">{result.code ?? '—'}</span>
                    <span className="classification-driver">
                      <strong>{localizeDriverName(result)}</strong>
                      <small><i className="result-team-mark">{teamInitials(result.constructorName)}</i>{result.constructorName ?? 'Команда не указана'}</small>
                    </span>
                    <span className="classification-result">
                      <time>{formatResultValue(result, activeSession?.id ?? 'race')}</time>
                      {(activeSession?.id === 'race' || activeSession?.id === 'sprint') && <small>{result.points} очков</small>}
                    </span>
                  </li>
                ))}
              </ol>
            </div>
          </div>
        )}
      </section>

      {pageData.features.travelMode && <section className="track-content track-content--travel">
        <article className="travel-panel">
          <div className="section-heading">
            <span className="eyebrow">Для поездки</span>
            <h2>География этапа</h2>
          </div>
          <p>{pageData.travel.intro}</p>
          <ul className="travel-categories">
            {pageData.travel.categories.map((category, index) => (
              <li key={category.id}><span>{String(index + 1).padStart(2, '0')}</span>{category.label}</li>
            ))}
          </ul>
        </article>
      </section>}
    </main>
  );
}
