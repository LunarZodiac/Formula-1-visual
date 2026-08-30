'use client';
/* eslint-disable @next/next/no-img-element */

import * as maplibregl from 'maplibre-gl';
import type { Map as MapLibreMap } from 'maplibre-gl';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import 'maplibre-gl/dist/maplibre-gl.css';
import type { CircuitPageData } from '../data/circuit-page-data';
import driverCatalog from '../data/catalogs/drivers.json';
import { circuitTechnicalData } from '../data/circuit-track-details';
import { parseGeoJsonFeatureCollection } from '../data/geojson-contract';
import { trackGeometries } from '../data/track-geometries';
import type { SeasonSnapshot, SnapshotSessionResult } from '../data/web-snapshots';
import { DriverFlag, DriverPortrait, TeamLogo } from './racing-visuals';

type DetailMode = 'track' | 'travel' | 'model';
type DetailBasemap = 'dark' | 'satellite';
type ResultView = 'sprintQualifying' | 'sprint' | 'qualifying' | 'race';
type TravelRoleFilter = 'all' | keyof typeof travelRoleLabels;

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

function makeTravelPoints(pageData: CircuitPageData): GeoJSON.FeatureCollection<GeoJSON.Point> {
  return {
    type: 'FeatureCollection',
    features: pageData.travel.points.map((point) => ({
      type: 'Feature',
      properties: {
        featureType: 'poi',
        id: point.id,
        name: point.name,
        role: point.id === 'circuit' ? 'circuit' : 'explore',
        categoryRu: point.kindRu,
        description: point.descriptionRu,
      },
      geometry: { type: 'Point', coordinates: point.coordinates },
    })),
  };
}

type TravelMapCollection = GeoJSON.FeatureCollection<GeoJSON.Geometry, Record<string, unknown>>;

function travelFeatureId(feature: GeoJSON.Feature<GeoJSON.Geometry, Record<string, unknown>>) {
  return String(feature.properties?.id ?? '');
}

function travelCollections(collection: TravelMapCollection, roleFilter: TravelRoleFilter = 'all') {
  const points = collection.features.filter((feature) => (
    feature.geometry.type === 'Point'
      && (roleFilter === 'all' || feature.properties?.role === roleFilter)
  ));
  const zones = collection.features.filter((feature) => feature.properties?.featureType === 'accommodation_zone');
  const routes = collection.features
    .filter((feature) => feature.properties?.featureType === 'route')
    .map((feature, index, routeFeatures) => ({
      ...feature,
      properties: {
        ...feature.properties,
        lineOffset: (index - (routeFeatures.length - 1) / 2) * 2.6,
      },
    }));
  return {
    points: { type: 'FeatureCollection', features: points } as TravelMapCollection,
    zones: { type: 'FeatureCollection', features: zones } as TravelMapCollection,
    routes: { type: 'FeatureCollection', features: routes } as TravelMapCollection,
  };
}

const travelRoleLabels: Record<string, string> = {
  transport: 'Транспорт', stay: 'Размещение', explore: 'Достопримечательности',
  essential: 'Полезное рядом', circuit: 'Инфраструктура этапа',
};
const travelRoleColors: Record<string, string> = {
  transport: '#58c7e8', stay: '#f2c14e', explore: '#a47cff',
  essential: '#7fd98a', circuit: '#ff3158',
};
const travelRouteColors = ['#ff3158', '#58c7e8', '#f2c14e', '#a47cff', '#7fd98a', '#ff8a4c', '#e06cff', '#b7d657'];

const detailStyle: maplibregl.StyleSpecification = {
  version: 8,
  glyphs: 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf',
  sources: {
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
    hillshadeSource: {
      type: 'raster-dem',
      url: 'https://tiles.mapterhorn.com/tilejson.json',
    },
  },
  layers: [
    { id: 'background', type: 'background', paint: { 'background-color': '#02070d' } },
    {
      id: 'base', type: 'background',
      layout: { visibility: 'none' },
      paint: { 'background-color': '#07111a' },
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
      id: 'context-landcover', type: 'fill', source: 'streets', 'source-layer': 'landcover',
      layout: { visibility: 'none' },
      paint: {
        'fill-color': ['match', ['get', 'class'], 'wood', '#0d1e1c', 'grass', '#11211d', '#0b1720'],
        'fill-opacity': 0.78,
      },
    },
    {
      id: 'context-water', type: 'fill', source: 'streets', 'source-layer': 'water',
      layout: { visibility: 'none' },
      paint: { 'fill-color': '#071d2b', 'fill-opacity': 0.96 },
    },
    {
      id: 'terrain-hillshade', type: 'hillshade', source: 'hillshadeSource',
      paint: {
        'hillshade-method': 'standard',
        'hillshade-illumination-direction': 315,
        'hillshade-shadow-color': '#02070d',
        'hillshade-highlight-color': '#a4b5be',
        'hillshade-accent-color': '#26343c',
        'hillshade-exaggeration': 0.28,
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
        'text-field': ['get', 'name:ru'],
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
        'text-field': ['get', 'name:ru'],
        'text-font': ['Noto Sans Regular'],
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
  ],
};

function applyBasemap(map: MapLibreMap, nextBasemap: DetailBasemap) {
  if (map.getLayer('base')) map.setLayoutProperty('base', 'visibility', nextBasemap === 'dark' ? 'visible' : 'none');
  if (map.getLayer('satellite-base')) map.setLayoutProperty('satellite-base', 'visibility', nextBasemap === 'satellite' ? 'visible' : 'none');
  if (map.getLayer('context-roads-casing')) map.setLayoutProperty('context-roads-casing', 'visibility', nextBasemap === 'dark' ? 'visible' : 'none');
  if (map.getLayer('context-roads')) map.setLayoutProperty('context-roads', 'visibility', nextBasemap === 'dark' ? 'visible' : 'none');
  if (map.getLayer('context-landcover')) map.setLayoutProperty('context-landcover', 'visibility', nextBasemap === 'dark' ? 'visible' : 'none');
  if (map.getLayer('context-water')) map.setLayoutProperty('context-water', 'visibility', nextBasemap === 'dark' ? 'visible' : 'none');
  if (map.getLayer('context-road-labels')) map.setPaintProperty('context-road-labels', 'text-color', nextBasemap === 'dark' ? '#e3edf2' : '#ffffff');
  if (map.getLayer('context-place-labels')) map.setPaintProperty('context-place-labels', 'text-color', nextBasemap === 'dark' ? '#edf5f8' : '#ffffff');
  if (map.getLayer('context-buildings-3d')) map.setPaintProperty('context-buildings-3d', 'fill-extrusion-color', nextBasemap === 'dark' ? '#61727c' : '#b8a991');
}

function trackBounds(track: GeoJSON.Feature<GeoJSON.LineString> | undefined) {
  if (!track) return undefined;
  const [first, ...coordinates] = track.geometry.coordinates;
  return coordinates.reduce(
    (bounds, coordinate) => bounds.extend(coordinate),
    new maplibregl.LngLatBounds(first, first),
  );
}

function pointCollectionBounds(collection: TravelMapCollection) {
  const coordinates = collection.features.flatMap((feature) => (
    feature.geometry.type === 'Point' ? [feature.geometry.coordinates as [number, number]] : []
  ));
  if (coordinates.length === 0) return undefined;
  return coordinates.slice(1).reduce(
    (result, coordinate) => result.extend(coordinate),
    new maplibregl.LngLatBounds(coordinates[0], coordinates[0]),
  );
}

function featureCollectionBounds(features: TravelMapCollection['features']) {
  let bounds: maplibregl.LngLatBounds | undefined;
  const visitCoordinates = (value: unknown) => {
    if (!Array.isArray(value)) return;
    if (value.length >= 2 && typeof value[0] === 'number' && typeof value[1] === 'number') {
      const coordinate: [number, number] = [value[0], value[1]];
      bounds = bounds ? bounds.extend(coordinate) : new maplibregl.LngLatBounds(coordinate, coordinate);
      return;
    }
    value.forEach(visitCoordinates);
  };
  features.forEach((feature) => {
    if ('coordinates' in feature.geometry) visitCoordinates(feature.geometry.coordinates);
  });
  return bounds;
}

type TravelPoiMapProps = {
  collection: TravelMapCollection;
  track?: GeoJSON.Feature<GeoJSON.LineString>;
  roleFilter: TravelRoleFilter;
  selectedId: string | null;
  focusFeatureIds: string[];
  bounds: [[number, number], [number, number]];
  onSelect: (featureId: string) => void;
};

function TravelPoiMap({ collection, track, roleFilter, selectedId, focusFeatureIds, bounds, onSelect }: TravelPoiMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const onSelectRef = useRef(onSelect);
  const [basemap, setBasemap] = useState<DetailBasemap>('dark');
  const [showAllPoints, setShowAllPoints] = useState(true);
  const [ready, setReady] = useState(false);
  const mapCollections = useMemo(() => travelCollections(collection, roleFilter), [collection, roleFilter]);
  const visiblePoints = useMemo(() => ({
    ...mapCollections.points,
    features: [
      ...mapCollections.points.features.filter((feature) => feature.properties?.role !== 'circuit'),
      ...travelCollections(collection).points.features.filter((feature) => feature.properties?.role === 'circuit'),
    ],
  }) as TravelMapCollection, [collection, mapCollections.points]);

  useEffect(() => { onSelectRef.current = onSelect; }, [onSelect]);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: detailStyle,
      bounds,
      fitBoundsOptions: { padding: 48 },
      minZoom: 4.5,
      maxZoom: 18,
      attributionControl: false,
    });
    mapRef.current = map;
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'bottom-left');
    map.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-right');
    const observer = new ResizeObserver(() => map.resize());
    observer.observe(containerRef.current);

    map.on('load', () => {
      applyBasemap(map, 'dark');
      map.addSource('poi-section-track', { type: 'geojson', data: { type: 'FeatureCollection', features: track ? [track] : [] } });
      map.addLayer({
        id: 'poi-section-track-glow', type: 'line', source: 'poi-section-track',
        minzoom: 11.5,
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': '#ffffff', 'line-width': 7, 'line-opacity': .16, 'line-blur': 3 },
      });
      map.addLayer({
        id: 'poi-section-track', type: 'line', source: 'poi-section-track',
        minzoom: 11.5,
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': '#ff3158', 'line-width': 2.2, 'line-opacity': .9 },
      });
      map.addSource('poi-section-zones', { type: 'geojson', data: mapCollections.zones });
      map.addLayer({
        id: 'poi-section-zones-fill', type: 'fill', source: 'poi-section-zones',
        paint: { 'fill-color': '#58c7e8', 'fill-opacity': .055 },
      });
      map.addLayer({
        id: 'poi-section-zones-line', type: 'line', source: 'poi-section-zones',
        paint: { 'line-color': '#7eb6c9', 'line-width': 1.2, 'line-opacity': .42, 'line-dasharray': [2, 2] },
      });
      map.addSource('poi-section-routes', { type: 'geojson', data: mapCollections.routes });
      map.addLayer({
        id: 'poi-section-routes', type: 'line', source: 'poi-section-routes',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': ['coalesce', ['get', 'color'], '#f2c14e'],
          'line-width': ['interpolate', ['linear'], ['zoom'], 7, 2, 14, 4],
          'line-opacity': .86,
          'line-offset': ['coalesce', ['get', 'lineOffset'], 0],
        },
      });
      map.addSource('poi-section-points', { type: 'geojson', data: visiblePoints, cluster: true, clusterRadius: 42, clusterMaxZoom: 13 });
      map.addLayer({
        id: 'poi-section-clusters', type: 'circle', source: 'poi-section-points', filter: ['has', 'point_count'],
        paint: { 'circle-radius': ['step', ['get', 'point_count'], 15, 8, 19], 'circle-color': '#0b1b26', 'circle-stroke-color': '#ff3158', 'circle-stroke-width': 2 },
      });
      map.addLayer({
        id: 'poi-section-cluster-count', type: 'symbol', source: 'poi-section-points', filter: ['has', 'point_count'],
        layout: { 'text-field': ['get', 'point_count_abbreviated'], 'text-font': ['Noto Sans Regular'], 'text-size': 10 },
        paint: { 'text-color': '#ffffff' },
      });
      map.addLayer({
        id: 'poi-section-points', type: 'circle', source: 'poi-section-points',
        filter: ['all', ['!', ['has', 'point_count']], ['!=', ['get', 'role'], 'circuit']],
        paint: {
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 8, 4, 14, 8],
          'circle-color': ['match', ['get', 'role'], 'transport', travelRoleColors.transport, 'stay', travelRoleColors.stay, 'explore', travelRoleColors.explore, 'essential', travelRoleColors.essential, 'circuit', travelRoleColors.circuit, '#a9b7bf'],
          'circle-stroke-color': '#ffffff', 'circle-stroke-width': 1.5,
        },
      });
      map.addLayer({
        id: 'poi-section-circuit-point', type: 'circle', source: 'poi-section-points', maxzoom: 11.5,
        filter: ['all', ['!', ['has', 'point_count']], ['==', ['get', 'role'], 'circuit']],
        paint: {
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 4.5, 5, 10, 9],
          'circle-color': '#ff3158', 'circle-stroke-color': '#ffffff', 'circle-stroke-width': 2,
        },
      });
      map.addLayer({
        id: 'poi-section-circuit-label', type: 'symbol', source: 'poi-section-points', minzoom: 7, maxzoom: 11.5,
        filter: ['all', ['!', ['has', 'point_count']], ['==', ['get', 'role'], 'circuit']],
        layout: { 'text-field': ['get', 'name'], 'text-font': ['Noto Sans Regular'], 'text-size': 10, 'text-offset': [0, 1.45], 'text-anchor': 'top' },
        paint: { 'text-color': '#ffffff', 'text-halo-color': '#06101a', 'text-halo-width': 1.5 },
      });
      map.addSource('poi-section-selection', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
      map.addLayer({
        id: 'poi-section-selected-shape', type: 'line', source: 'poi-section-selection',
        paint: { 'line-color': '#ffffff', 'line-width': 3, 'line-opacity': .95 },
      });
      map.addLayer({
        id: 'poi-section-selected-point', type: 'circle', source: 'poi-section-selection',
        filter: ['==', ['geometry-type'], 'Point'],
        paint: {
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 8, 8, 14, 13],
          'circle-color': 'rgba(255,49,88,.32)',
          'circle-opacity': ['case', ['==', ['get', 'role'], 'circuit'], ['step', ['zoom'], 1, 11.5, 0], 1],
          'circle-stroke-color': '#ffffff',
          'circle-stroke-width': 3,
          'circle-stroke-opacity': ['case', ['==', ['get', 'role'], 'circuit'], ['step', ['zoom'], 1, 11.5, 0], 1],
        },
      });
      map.addSource('poi-section-focus', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
      map.addLayer({
        id: 'poi-section-focus-shape', type: 'line', source: 'poi-section-focus',
        paint: { 'line-color': '#f2c14e', 'line-width': 2.5, 'line-opacity': .92 },
      });
      map.addLayer({
        id: 'poi-section-focus-point', type: 'circle', source: 'poi-section-focus',
        filter: ['==', ['geometry-type'], 'Point'],
        paint: {
          'circle-radius': 9,
          'circle-color': '#07131d',
          'circle-opacity': ['case', ['==', ['get', 'role'], 'circuit'], ['step', ['zoom'], 1, 11.5, 0], 1],
          'circle-stroke-color': '#f2c14e',
          'circle-stroke-width': 3,
          'circle-stroke-opacity': ['case', ['==', ['get', 'role'], 'circuit'], ['step', ['zoom'], 1, 11.5, 0], 1],
        },
      });
      map.addLayer({
        id: 'poi-section-labels', type: 'symbol', source: 'poi-section-points',
        filter: ['all', ['!', ['has', 'point_count']], ['!=', ['get', 'role'], 'circuit']],
        layout: { 'text-field': ['get', 'name'], 'text-font': ['Noto Sans Regular'], 'text-size': 10, 'text-offset': [0, 1.55], 'text-anchor': 'top', 'text-optional': true },
        paint: { 'text-color': '#ffffff', 'text-halo-color': '#06101a', 'text-halo-width': 1.5 },
      });
      map.on('click', 'poi-section-points', (event) => {
        const feature = event.features?.[0];
        if (!feature || feature.geometry.type !== 'Point') return;
        onSelectRef.current(String(feature.properties?.id ?? ''));
      });
      map.on('click', 'poi-section-circuit-point', (event) => {
        const feature = event.features?.[0];
        if (feature) onSelectRef.current(String(feature.properties?.id ?? ''));
      });
      map.on('click', 'poi-section-zones-fill', (event) => {
        const feature = event.features?.[0];
        if (feature) onSelectRef.current(String(feature.properties?.id ?? ''));
      });
      map.on('click', 'poi-section-clusters', async (event) => {
        const feature = event.features?.[0];
        if (!feature || feature.geometry.type !== 'Point') return;
        const source = map.getSource('poi-section-points') as maplibregl.GeoJSONSource;
        const zoom = await source.getClusterExpansionZoom(Number(feature.properties?.cluster_id));
        map.easeTo({ center: feature.geometry.coordinates as [number, number], zoom, duration: 500, essential: true });
      });
      ['poi-section-points', 'poi-section-clusters', 'poi-section-circuit-point', 'poi-section-zones-fill'].forEach((layer) => {
        map.on('mouseenter', layer, () => { map.getCanvas().style.cursor = 'pointer'; });
        map.on('mouseleave', layer, () => { map.getCanvas().style.cursor = ''; });
      });
      setReady(true);
      map.resize();
    });

    return () => {
      observer.disconnect();
      map.remove();
      mapRef.current = null;
    };
  // Map lifecycle is intentionally independent from filters and selection.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    const source = map.getSource('poi-section-points') as maplibregl.GeoJSONSource | undefined;
    if (!source) return;
    source.setData(visiblePoints);
    (map.getSource('poi-section-zones') as maplibregl.GeoJSONSource | undefined)?.setData(mapCollections.zones);
    (map.getSource('poi-section-routes') as maplibregl.GeoJSONSource | undefined)?.setData(mapCollections.routes);
    if (!showAllPoints) return;
    const allBounds = pointCollectionBounds(visiblePoints);
    if (!allBounds) return;
    const frame = window.requestAnimationFrame(() => {
      map.stop();
      map.fitBounds(allBounds, { padding: 64, maxZoom: 12.5, duration: 0 });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [mapCollections.routes, mapCollections.zones, ready, showAllPoints, visiblePoints]);

  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map?.isStyleLoaded()) return;
    const selectionSource = map.getSource('poi-section-selection') as maplibregl.GeoJSONSource | undefined;
    const feature = collection.features.find((candidate) => travelFeatureId(candidate) === selectedId);
    selectionSource?.setData({ type: 'FeatureCollection', features: feature ? [feature] : [] });
    if (!feature) return;
    const selectedBounds = featureCollectionBounds([feature]);
    if (selectedBounds) map.fitBounds(selectedBounds, { padding: 86, maxZoom: 13.2, duration: 650, essential: true });
  }, [collection, ready, selectedId]);

  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map?.isStyleLoaded()) return;
    const focusedFeatures = collection.features.filter((feature) => focusFeatureIds.includes(travelFeatureId(feature)));
    (map.getSource('poi-section-focus') as maplibregl.GeoJSONSource | undefined)?.setData({
      type: 'FeatureCollection', features: focusedFeatures,
    });
    const focusedBounds = featureCollectionBounds(focusedFeatures);
    if (focusedBounds) map.fitBounds(focusedBounds, { padding: 74, maxZoom: 12, duration: 700, essential: true });
  }, [collection, focusFeatureIds, ready]);

  const chooseBasemap = (next: DetailBasemap) => {
    setBasemap(next);
    if (mapRef.current) applyBasemap(mapRef.current, next);
  };

  const togglePointExtent = () => {
    const map = mapRef.current;
    if (!map) return;
    const nextShowAll = !showAllPoints;
    setShowAllPoints(nextShowAll);
    if (nextShowAll) {
      const allBounds = pointCollectionBounds(visiblePoints);
      if (allBounds) map.fitBounds(allBounds, { padding: 64, maxZoom: 12.5, duration: 650, essential: true });
    } else {
      map.fitBounds(trackBounds(track) ?? bounds, { padding: 58, maxZoom: 14, duration: 650, essential: true });
    }
  };

  return (
    <div className="spa-poi-map-shell">
      <div ref={containerRef} className="spa-poi-map" aria-label="Карта ориентиров поездки" />
      <div className="spa-poi-basemap" role="group" aria-label="Подложка карты ориентиров">
        <button type="button" className={basemap === 'dark' ? 'is-active' : ''} onClick={() => chooseBasemap('dark')}>Карта</button>
        <button type="button" className={basemap === 'satellite' ? 'is-active' : ''} onClick={() => chooseBasemap('satellite')}>Спутник</button>
      </div>
      <button type="button" className="spa-poi-extent" onClick={togglePointExtent}>
        {showAllPoints ? 'К трассе' : 'Показать все точки'}
      </button>
    </div>
  );
}

export function CircuitExperience({ pageData }: { pageData: CircuitPageData }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const galleryRef = useRef<HTMLDivElement>(null);
  const mediaDialogRef = useRef<HTMLDialogElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const circuitTrack = trackGeometries[pageData.geometryId];
  const technicalData = circuitTechnicalData[pageData.id as keyof typeof circuitTechnicalData];
  const hasTechnicalOverlay = pageData.features.technicalOverlay && Boolean(technicalData);
  const fallbackTravelPoints = useMemo(() => makeTravelPoints(pageData), [pageData]);
  const [travelMapData, setTravelMapData] = useState<TravelMapCollection>(fallbackTravelPoints);
  const [travelRoleFilter, setTravelRoleFilter] = useState<TravelRoleFilter>('all');
  const [selectedTravelFeatureId, setSelectedTravelFeatureId] = useState<string | null>(null);
  const [travelFocusFeatureIds, setTravelFocusFeatureIds] = useState<string[]>([]);
  const [activeTravelChapterId, setActiveTravelChapterId] = useState<string | null>(null);
  const circuitSeasonOptions = pageData.results.seasons;
  const [, setMode] = useState<DetailMode>('track');
  const [, setBasemap] = useState<DetailBasemap>('satellite');
  const [, setTravelLegendOpen] = useState(false);
  const [ready, setReady] = useState(false);
  const [mapBearing, setMapBearing] = useState(pageData.map.trackCamera.bearing);
  const [resultSeason, setResultSeason] = useState(pageData.results.defaultSeason);
  const [resultView, setResultView] = useState<ResultView>('race');
  const [seasonSnapshot, setSeasonSnapshot] = useState<SeasonSnapshot | null>(null);
  const [resultStatus, setResultStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [isFavorite, setIsFavorite] = useState(false);
  const [openMediaIndex, setOpenMediaIndex] = useState<number | null>(null);
  const travelStory = pageData.travel.story;
  const travelPoints = useMemo(
    () => travelCollections(travelMapData, travelRoleFilter).points.features,
    [travelMapData, travelRoleFilter],
  );
  const publishedTravelRouteCount = useMemo(
    () => travelCollections(travelMapData).routes.features.length,
    [travelMapData],
  );
  const availableTravelRoles = useMemo(() => {
    const roles = new Set(
      travelCollections(travelMapData).points.features.map((feature) => String(feature.properties?.role ?? '')),
    );
    return Object.entries(travelRoleLabels).filter(([role]) => roles.has(role));
  }, [travelMapData]);
  const usesEditorialTemplate = true;
  const trackHighlights = pageData.summary.highlights ?? ['Пустынный рельеф', 'Ночная гонка', 'Зоны торможения'];
  const summaryMetric = (label: string) => pageData.summary.metrics.find((metric) => metric.label === label)?.value ?? 'Уточняется';
  const templateStatBar = pageData.summary.statBar ?? [
    { label: 'Длина трассы', value: summaryMetric('Длина'), icon: 'length' as const },
    { label: 'Повороты', value: summaryMetric('Повороты'), icon: 'turns' as const },
    { label: 'Дебют в F1', value: summaryMetric('Дебют'), icon: 'debut' as const },
    { label: 'Рекорд гонки', value: 'Уточняется', icon: 'record' as const },
    { label: 'Перепад высот', value: 'Уточняется', icon: 'elevation' as const },
    { label: 'Тип трассы', value: pageData.summary.typeRu, icon: 'type' as const },
  ];

  useEffect(() => {
    if (openMediaIndex === null) return;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const dialog = mediaDialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();
    return () => {
      if (dialog?.open) dialog.close();
      previousFocus?.focus();
    };
  }, [openMediaIndex]);

  const changeTravelRoleFilter = useCallback((nextFilter: TravelRoleFilter) => {
    setTravelRoleFilter(nextFilter);
    setTravelFocusFeatureIds([]);
    setActiveTravelChapterId(null);
    if (!selectedTravelFeatureId || nextFilter === 'all') return;
    const selectedFeature = travelMapData.features.find((feature) => travelFeatureId(feature) === selectedTravelFeatureId);
    if (selectedFeature?.properties?.role !== nextFilter) setSelectedTravelFeatureId(null);
  }, [selectedTravelFeatureId, travelMapData]);

  const revealTravelFeatures = useCallback((featureIds: string[], selectedId: string | null = null) => {
    setTravelRoleFilter('all');
    setSelectedTravelFeatureId(selectedId);
    setTravelFocusFeatureIds(featureIds);
    window.requestAnimationFrame(() => {
      document.getElementById('circuit-pois')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }, []);

  const selectPlannerFeature = useCallback((featureId: string) => {
    setActiveTravelChapterId(null);
    setTravelFocusFeatureIds([]);
    setSelectedTravelFeatureId(featureId);
  }, []);

  useEffect(() => {
    if (!pageData.features.travelMode) return;
    const controller = new AbortController();
    fetch(`/data/travel/${pageData.id}.geojson`, { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error(`Туристический слой ${pageData.id} пока не опубликован`);
        return response.json() as Promise<unknown>;
      })
      .then((data) => parseGeoJsonFeatureCollection(data, {
        label: `туристический слой ${pageData.id}`,
        allowedGeometryTypes: ['Point', 'LineString', 'MultiLineString', 'Polygon', 'MultiPolygon'],
        requireFeatureId: true,
      }) as TravelMapCollection)
      .then((collection) => {
        const routeIndexes = new Map<string, number>();
        const features = collection.features
          .filter((feature) => {
            const reviewStatus = feature.properties?.reviewStatus;
            return reviewStatus === 'reviewed' || reviewStatus === 'published';
          })
          .filter((feature) => (
            feature.properties?.featureType !== 'route'
              || feature.properties?.reviewStatus === 'published'
          ))
          .map((feature) => {
          if (feature.properties?.role === 'circuit') {
            return { ...feature, properties: { ...feature.properties, name: pageData.nameRu } };
          }
          if (feature.properties?.featureType !== 'route') return feature;
          const id = String(feature.properties.id ?? 'route');
          const index = routeIndexes.size;
          routeIndexes.set(id, index);
            return { ...feature, properties: { ...feature.properties, color: travelRouteColors[index % travelRouteColors.length] } };
          });
        setTravelMapData({ ...collection, features });
      })
      .catch((error) => {
        if (!(error instanceof DOMException && error.name === 'AbortError')) console.warn(error);
      });
    return () => controller.abort();
  }, [pageData.features.travelMode, pageData.id, pageData.nameRu]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map?.isStyleLoaded()) return;
    const collections = travelCollections(travelMapData, travelRoleFilter);
    (map.getSource('travel-pois') as maplibregl.GeoJSONSource | undefined)?.setData(collections.points);
    (map.getSource('travel-zones') as maplibregl.GeoJSONSource | undefined)?.setData(collections.zones);
    (map.getSource('travel-routes') as maplibregl.GeoJSONSource | undefined)?.setData(collections.routes);
  }, [travelMapData, travelRoleFilter, ready]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map?.isStyleLoaded()) return;
    const selectedPointFilter: maplibregl.FilterSpecification = selectedTravelFeatureId
      ? ['==', ['get', 'id'], selectedTravelFeatureId]
      : ['==', ['get', 'id'], ''];
    if (map.getLayer('travel-selected-point')) map.setFilter('travel-selected-point', selectedPointFilter);
    if (map.getLayer('travel-selected-zone')) map.setFilter('travel-selected-zone', selectedPointFilter);
  }, [ready, selectedTravelFeatureId]);

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
  const remainingResultsMidpoint = Math.ceil(remainingResults.length / 2);
  const remainingResultColumns = [
    remainingResults.slice(0, remainingResultsMidpoint),
    remainingResults.slice(remainingResultsMidpoint),
  ];
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
    if (nextMode !== 'travel') setTravelLegendOpen(false);
    const map = mapRef.current;
    if (!map) return;

    const travelVisibility = nextMode === 'travel' ? 'visible' : 'none';
    const trackVisibility = nextMode === 'track' ? 'visible' : 'none';
    if (map.getLayer('travel-points')) {
      [
        'travel-zones-fill', 'travel-zones-line', 'travel-selected-zone', 'travel-routes',
        'travel-clusters', 'travel-cluster-count', 'travel-points', 'travel-selected-point', 'travel-labels',
      ]
        .forEach((layerId) => {
          if (map.getLayer(layerId)) map.setLayoutProperty(layerId, 'visibility', travelVisibility);
        });
      [
        'track-glow', 'track-line', 'track-basic-line', 'sector-lines', 'drs-glow', 'drs-lines',
        'drs-zone-labels',
        'drs-detection-leader-casing', 'drs-detection-leaders',
        'drs-detection-points', 'drs-detection-labels',
        'start-finish-leader', 'start-finish-marker',
        'turn-label-leaders', 'turn-points', 'turn-labels',
        'track-info-points', 'track-info-labels',
      ]
        .forEach((layerId) => {
          if (map.getLayer(layerId)) map.setLayoutProperty(layerId, 'visibility', trackVisibility);
        });
      if (map.getLayer('terrain-hillshade')) {
        map.setLayoutProperty('terrain-hillshade', 'visibility', nextMode === 'model' ? 'none' : 'visible');
      }
    }

    if (nextMode === 'track') {
      map.setTerrain({ source: 'terrainSource', exaggeration: 1 });
      focusTrack(1200);
    } else if (nextMode === 'travel') {
      setBasemap('satellite');
      applyBasemap(map, 'satellite');
      map.setTerrain({ source: 'terrainSource', exaggeration: 1 });
      map.fitBounds(pageData.map.travelBounds, {
        padding: { top: 76, right: 76, bottom: 76, left: 76 },
        maxZoom: pageData.map.travelZoom,
        pitch: 48,
        bearing: -18,
        duration: 1200,
        essential: true,
      });
    } else {
      map.setTerrain(null);
    }
  }, [focusTrack, pageData.map.travelBounds, pageData.map.travelZoom]);

  const selectTravelFeature = useCallback((featureId: string) => {
    const map = mapRef.current;
    const feature = travelMapData.features.find((candidate) => travelFeatureId(candidate) === featureId);
    setSelectedTravelFeatureId(featureId);
    if (!map || !feature || !map.isStyleLoaded()) return;

    showMode('travel');
    window.requestAnimationFrame(() => {
      if (feature.geometry.type === 'Point') {
        map.easeTo({
          center: feature.geometry.coordinates as [number, number],
          zoom: Math.max(map.getZoom(), 13.2),
          pitch: 48,
          duration: 700,
          essential: true,
        });
        return;
      }
      if (feature.geometry.type === 'Polygon' || feature.geometry.type === 'MultiPolygon') {
        const coordinates = feature.geometry.type === 'Polygon'
          ? feature.geometry.coordinates.flat(1)
          : feature.geometry.coordinates.flat(2);
        const first = coordinates[0];
        if (!first) return;
        const bounds = coordinates.slice(1).reduce(
          (nextBounds, coordinate) => nextBounds.extend(coordinate as [number, number]),
          new maplibregl.LngLatBounds(first as [number, number], first as [number, number]),
        );
        map.fitBounds(bounds, { padding: 90, maxZoom: 13.5, pitch: 48, duration: 800, essential: true });
      }
    });
  }, [showMode, travelMapData]);

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
      interactive: true,
    });
    mapRef.current = map;
    const updateBearing = () => setMapBearing(map.getBearing());
    map.on('rotate', updateBearing);
    let resizeFrame: number | null = null;
    const resizeObserver = new ResizeObserver(() => {
      if (resizeFrame !== null) window.cancelAnimationFrame(resizeFrame);
      resizeFrame = window.requestAnimationFrame(() => {
        resizeFrame = null;
        map.resize();
      });
    });
    resizeObserver.observe(containerRef.current);
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'bottom-right');
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
      if (usesEditorialTemplate) map.addLayer({
        id: 'drs-zone-labels', type: 'symbol', source: 'drs-zones',
        layout: {
          'symbol-placement': 'line-center',
          'text-field': ['get', 'label'],
          'text-font': ['Noto Sans Regular'],
          'text-size': 9,
          'text-letter-spacing': 0.06,
          'text-allow-overlap': true,
        },
        paint: {
          'text-color': '#9bff73',
          'text-halo-color': '#06100b',
          'text-halo-width': 2,
          'text-halo-blur': 0.5,
        },
      });
      if (!usesEditorialTemplate) {
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
          'text-font': ['Noto Sans Regular'],
          'text-size': 8,
          'text-allow-overlap': true,
        },
        paint: {
          'text-color': '#06100b',
        },
      });
      }
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
          'text-font': ['Noto Sans Regular'],
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
      if (!usesEditorialTemplate) map.addLayer({
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
      if (!usesEditorialTemplate) map.addLayer({
        id: 'track-info-labels', type: 'symbol', source: 'track-points',
        filter: ['==', ['get', 'kind'], 'sector'],
        layout: {
          'text-field': ['get', 'label'],
          'text-font': ['Noto Sans Regular'],
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
      const initialTravelCollections = travelCollections(fallbackTravelPoints);
      map.addSource('travel-pois', {
        type: 'geojson',
        data: initialTravelCollections.points,
        cluster: true,
        clusterMaxZoom: 13,
        clusterRadius: 48,
      });
      map.addSource('travel-zones', { type: 'geojson', data: initialTravelCollections.zones });
      map.addSource('travel-routes', { type: 'geojson', data: initialTravelCollections.routes });
      map.addLayer({
        id: 'travel-zones-fill', type: 'fill', source: 'travel-zones',
        layout: { visibility: 'none' },
        paint: { 'fill-color': '#f2c14e', 'fill-opacity': 0.09 },
      });
      map.addLayer({
        id: 'travel-zones-line', type: 'line', source: 'travel-zones',
        layout: { visibility: 'none' },
        paint: { 'line-color': '#f2c14e', 'line-width': 1.5, 'line-opacity': 0.8, 'line-dasharray': [2, 2] },
      });
      map.addLayer({
        id: 'travel-selected-zone', type: 'line', source: 'travel-zones',
        filter: ['==', ['get', 'id'], ''],
        layout: { visibility: 'none' },
        paint: { 'line-color': '#ffffff', 'line-width': 4, 'line-opacity': 0.95 },
      });
      map.addLayer({
        id: 'travel-routes', type: 'line', source: 'travel-routes',
        layout: { visibility: 'none', 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': ['coalesce', ['get', 'color'], '#ff3158'],
          'line-width': 3.5,
          'line-offset': ['coalesce', ['get', 'lineOffset'], 0],
          'line-opacity': 0.92,
        },
      });
      map.addLayer({
        id: 'travel-clusters', type: 'circle', source: 'travel-pois',
        filter: ['has', 'point_count'],
        layout: { visibility: 'none' },
        paint: {
          'circle-radius': ['step', ['get', 'point_count'], 15, 8, 19, 16, 23],
          'circle-color': '#0c1b26',
          'circle-stroke-color': '#ff3158',
          'circle-stroke-width': 2,
          'circle-opacity': 0.96,
        },
      });
      map.addLayer({
        id: 'travel-cluster-count', type: 'symbol', source: 'travel-pois',
        filter: ['has', 'point_count'],
        layout: {
          visibility: 'none',
          'text-field': ['get', 'point_count_abbreviated'],
          'text-font': ['Noto Sans Regular'],
          'text-size': 10,
        },
        paint: { 'text-color': '#ffffff' },
      });
      map.addLayer({
        id: 'travel-points', type: 'circle', source: 'travel-pois',
        filter: ['!', ['has', 'point_count']],
        layout: { visibility: 'none' },
        paint: {
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 8, 4, 12, 6.5, 15, 8],
          'circle-color': [
            'match', ['get', 'role'],
            'transport', travelRoleColors.transport,
            'stay', travelRoleColors.stay,
            'explore', travelRoleColors.explore,
            'essential', travelRoleColors.essential,
            'circuit', travelRoleColors.circuit,
            '#a9b7bf',
          ],
          'circle-stroke-color': '#f7fbff',
          'circle-stroke-width': 1.5,
        },
      });
      map.addLayer({
        id: 'travel-selected-point', type: 'circle', source: 'travel-pois',
        filter: ['==', ['get', 'id'], ''],
        layout: { visibility: 'none' },
        paint: {
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 8, 8, 15, 13],
          'circle-color': 'rgba(255, 49, 88, .2)',
          'circle-stroke-color': '#ffffff',
          'circle-stroke-width': 3,
        },
      });
      map.addLayer({
        id: 'travel-labels', type: 'symbol', source: 'travel-pois',
        filter: ['!', ['has', 'point_count']],
        layout: {
          visibility: 'none',
          'text-field': ['get', 'name'],
          'text-font': ['Noto Sans Regular'],
          'text-size': 10,
          'text-offset': [0, 1.6],
          'text-anchor': 'top',
          'text-optional': true,
        },
        paint: {
          'text-color': '#ffffff',
          'text-halo-color': '#06101a',
          'text-halo-width': 1.5,
        },
      });
      map.on('mouseenter', 'travel-clusters', () => { map.getCanvas().style.cursor = 'pointer'; });
      map.on('mouseleave', 'travel-clusters', () => { map.getCanvas().style.cursor = ''; });
      map.on('click', 'travel-clusters', async (event) => {
        const feature = event.features?.[0];
        if (!feature || feature.geometry.type !== 'Point') return;
        const clusterId = Number(feature.properties?.cluster_id);
        const source = map.getSource('travel-pois') as maplibregl.GeoJSONSource;
        const zoom = await source.getClusterExpansionZoom(clusterId);
        map.easeTo({ center: feature.geometry.coordinates as [number, number], zoom, duration: 600, essential: true });
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
        setSelectedTravelFeatureId(String(feature.properties?.id ?? ''));

        const popupContent = document.createElement('div');
        const kind = document.createElement('span');
        const name = document.createElement('strong');
        const description = document.createElement('p');
        kind.textContent = travelRoleLabels[String(feature.properties?.role ?? '')] ?? 'Точка интереса';
        name.textContent = String(feature.properties?.name ?? 'Объект');
        const zones = feature.properties?.zones;
        description.textContent = Array.isArray(zones) && zones.length > 0
          ? `Район проживания: ${zones.join(', ')}`
          : zones
            ? `Район проживания: ${String(zones).replace(/[\[\]"]/g, '')}`
            : String(feature.properties?.categoryRu ?? feature.properties?.description ?? 'Откройте объект, чтобы изучить его на карте');
        popupContent.className = 'poi-popup-content';
        popupContent.append(kind, name, description);

        new maplibregl.Popup({ offset: 14, className: 'atlas-poi-popup' })
          .setLngLat(feature.geometry.coordinates as [number, number])
          .setDOMContent(popupContent)
          .addTo(map);
      });
      ['travel-routes', 'travel-zones-fill'].forEach((layerId) => {
        map.on('mouseenter', layerId, () => { map.getCanvas().style.cursor = 'pointer'; });
        map.on('mouseleave', layerId, () => { map.getCanvas().style.cursor = ''; });
        map.on('click', layerId, (event) => {
          const feature = event.features?.[0];
          if (!feature) return;
          setSelectedTravelFeatureId(String(feature.properties?.id ?? ''));
          const isRoute = feature.properties?.featureType === 'route';
          const popupContent = document.createElement('div');
          const kind = document.createElement('span');
          const name = document.createElement('strong');
          const description = document.createElement('p');
          kind.textContent = isRoute ? 'Маршрут' : 'Район проживания';
          name.textContent = String(feature.properties?.name ?? 'Объект');
          description.textContent = isRoute
            ? `${Math.round(Number(feature.properties?.distanceM ?? 0) / 1000)} км · ${feature.properties?.durationMinutes ?? '—'} минут`
            : `Подходящих вариантов размещения: ${feature.properties?.hotelCount ?? '—'}`;
          popupContent.className = 'poi-popup-content';
          popupContent.append(kind, name, description);
          new maplibregl.Popup({ offset: 12, className: 'atlas-poi-popup' })
            .setLngLat(event.lngLat)
            .setDOMContent(popupContent)
            .addTo(map);
        });
      });
      if (hasTechnicalOverlay && !usesEditorialTemplate) {
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
      if (resizeFrame !== null) window.cancelAnimationFrame(resizeFrame);
      map.off('rotate', updateBearing);
      map.remove();
      mapRef.current = null;
    };
  }, [circuitTrack, fallbackTravelPoints, hasTechnicalOverlay, pageData, technicalData, usesEditorialTemplate]);

  return (
    <main className="track-page track-page--spa">
      <header className="track-topbar">
        <Link className="brand" href="/" aria-label="Вернуться на главную страницу «География скорости»">
          <span className="brand-mark" aria-hidden="true"><img src="/icon.svg" alt="" /></span>
          <span><strong>География скорости</strong><small>Скорость • География • История</small></span>
        </Link>
        <Link className="back-to-atlas" href={`/?season=${resultSeason}#atlas`}>← Вернуться к глобусу</Link>
        <span className="track-stage-index">{pageData.nameRu} · {resultSeason}</span>
      </header>

      <section className="track-hero">
        <div className="track-map-wrap">
          <div ref={containerRef} className="track-map" aria-label={`Карта трассы ${pageData.nameRu}`} />
          <div className="track-map-shade" aria-hidden="true" />
          <div className="track-hero-actions">
            <a href="#circuit-pois">◎ На карте</a>
            <button type="button" aria-pressed={isFavorite} onClick={() => setIsFavorite((favorite) => !favorite)}>
              {isFavorite ? '★ В избранном' : '☆ Добавить в избранное'}
            </button>
          </div>
          <div className="track-map-legend" aria-label="Условные обозначения схемы трассы">
              {hasTechnicalOverlay ? <>
                  <span><i className="legend-sector legend-sector--one" />Сектор 1</span>
                  <span><i className="legend-sector legend-sector--two" />Сектор 2</span>
                  <span><i className="legend-sector legend-sector--three" />Сектор 3</span>
                  <span><i className="legend-drs" />DRS</span>
              </> : <span><i className="legend-turn" />Контур трассы</span>}
          </div>
          <button
            type="button"
            className="track-north-indicator"
            aria-label="Вернуть исходное направление карты"
            title="Исходное направление"
            onClick={() => mapRef.current?.easeTo({
              center: pageData.map.trackCamera.center,
              zoom: pageData.map.trackCamera.zoom,
              bearing: pageData.map.trackCamera.bearing,
              pitch: pageData.map.trackCamera.pitch,
              duration: 650,
              essential: true,
            })}
          >
            <span style={{ transform: `rotate(${-mapBearing}deg)` }} aria-hidden="true">
              <i />
              <b>N</b>
            </span>
          </button>
        </div>

        <aside className="track-summary">
          <nav className="track-breadcrumbs" aria-label="Хлебные крошки">Трассы <span>›</span> {pageData.location.countryRu} <span>›</span> {pageData.nameRu}</nav>
          <h1 className={pageData.nameRu.length > 18 ? 'is-very-long' : pageData.nameRu.length > 10 ? 'is-long' : undefined}>
            {pageData.nameRu}
          </h1>
          <div className="track-country">
            {pageData.location.countryCode && <img src={`https://flagcdn.com/${pageData.location.countryCode}.svg`} alt="" aria-hidden="true" />}
            <strong>{pageData.location.countryRu}</strong>
          </div>
          <p className="track-lead">{pageData.summary.description}</p>
          <div className="track-highlights">
            {trackHighlights.map((highlight) => <span key={highlight}>{highlight}</span>)}
          </div>
        </aside>
      </section>

      <dl className="spa-stat-bar" aria-label="Характеристики трассы">
          {templateStatBar.map((stat) => (
            <div key={stat.label}>
              <span className={`spa-stat-icon spa-stat-icon--${stat.icon ?? 'type'}`} aria-hidden="true" />
              <dt>{stat.label}</dt>
              <dd>{stat.value}</dd>
              {stat.note && <small>{stat.note}</small>}
            </div>
          ))}
      </dl>

      <section
        className={`race-results-section race-results-section--spa${resultStatus === 'loading' && seasonSnapshot ? ' is-updating' : ''}`}
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
                      <DriverPortrait driverId={result.driverId} name={localizeDriverName(result)} />
                    </div>
                    <div className="podium-driver-name">
                      <span className="podium-driver-title">
                        <DriverFlag driverId={result.driverId} countryCode={result.countryCode} />
                        <strong>{localizeDriverName(result)}</strong>
                        <TeamLogo season={resultSeason} logoUrl={result.teamLogoUrl} className="identity-team-logo" constructorId={result.constructorId} constructorName={result.constructorName} teamColor={result.teamColor} />
                      </span>
                      <small>{result.constructorName ?? 'Команда не указана'}</small>
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
                  <span><small>Быстрый круг</small><strong className="fastest-lap-driver-code">{fastestLap.code ?? '—'}</strong></span>
                  <DriverFlag driverId={fastestLap.driverId} countryCode={fastestLap.countryCode} />
                  <strong className="fastest-lap-driver-name">{localizeDriverName(fastestLap)}</strong>
                  <TeamLogo season={resultSeason} logoUrl={fastestLap.teamLogoUrl} className="identity-team-logo" constructorId={fastestLap.constructorId} constructorName={fastestLap.constructorName} teamColor={fastestLap.teamColor} />
                  <span className="race-fastest-team">{fastestLap.constructorName}</span>
                  <span><small>Круг {fastestLap.fastestLapNumber ?? '—'}</small><strong>{fastestLap.fastestLapMs !== null ? formatMilliseconds(fastestLap.fastestLapMs) : '—'}</strong></span>
                </div>
              )}
            </div>

            <div className="race-classification">
              <div className="race-classification__heading">
                <h3>Остальные позиции</h3>
                <span>{activeResults.length} участников</span>
              </div>
              <div className="race-classification-columns">
                {remainingResultColumns.map((column, columnIndex) => (
                  <ol key={columnIndex} start={column[0]?.position ?? 4}>
                    {column.map((result) => (
                      <li key={`${result.position}-${result.driverId}`} style={{ '--team-color': result.teamColor ?? '#5b7890' } as CSSProperties}>
                        <b>{result.positionText}</b>
                        <span className="classification-code">{result.code ?? '—'}</span>
                        <DriverFlag driverId={result.driverId} countryCode={result.countryCode} />
                        <span className="classification-driver">
                          <strong>{localizeDriverName(result)}</strong>
                          <small>{result.constructorName ?? 'Команда не указана'}</small>
                        </span>
                        <TeamLogo season={resultSeason} logoUrl={result.teamLogoUrl} className="identity-team-logo" constructorId={result.constructorId} constructorName={result.constructorName} teamColor={result.teamColor} />
                        <span className="classification-result">
                          <time>{formatResultValue(result, activeSession?.id ?? 'race')}</time>
                          {(activeSession?.id === 'race' || activeSession?.id === 'sprint') && <small>{result.points} очков</small>}
                        </span>
                      </li>
                    ))}
                  </ol>
                ))}
              </div>
            </div>
          </div>
        )}
      </section>

      {travelStory && (
        <>
          <section className="spa-planner" aria-labelledby="spa-planner-title">
            <header className="spa-section-heading">
              <div>
                <span className="eyebrow">Для поездки</span>
                <h2 id="spa-planner-title">Планируйте поездку</h2>
              </div>
              <p>{pageData.travel.intro}</p>
            </header>
            {(pageData.travel.planner?.sourceNote || pageData.travel.planner?.routeNote) && (
              <aside className="spa-planner-data-note" aria-label="Источники и маршруты">
                {pageData.travel.planner.sourceNote && <p><strong>Источники</strong>{pageData.travel.planner.sourceNote}</p>}
                {pageData.travel.planner.routeNote && <p><strong>Маршруты · {publishedTravelRouteCount > 0 ? publishedTravelRouteCount : 'на проверке'}</strong>{pageData.travel.planner.routeNote}</p>}
              </aside>
            )}
            <div className="spa-planner-grid">
              <section className="spa-planner-stays" aria-labelledby="spa-stays-title">
                <h3 id="spa-stays-title">Где остановиться</h3>
                <ul>
                  {travelStory.zones.map((zone) => (
                    <li key={zone.id} className={selectedTravelFeatureId === zone.mapFeatureId ? 'is-selected' : ''}>
                      <button type="button" onClick={() => { setActiveTravelChapterId(null); revealTravelFeatures([zone.mapFeatureId], zone.mapFeatureId); }}>
                        <i style={{ background: zone.tone }} aria-hidden="true" />
                        <span><strong>{zone.name}</strong><small>{zone.character}</small></span>
                        <time>{zone.travelTime}</time>
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
              <section className="spa-planner-scenarios" aria-labelledby="spa-scenarios-title">
                <h3 id="spa-scenarios-title">Сценарии поездки</h3>
                <ol>
                  {travelStory.chapters.map((chapter) => (
                    <li key={chapter.id} className={activeTravelChapterId === chapter.id ? 'is-selected' : ''}>
                      <button
                        type="button"
                        aria-pressed={activeTravelChapterId === chapter.id}
                        onClick={() => {
                          setActiveTravelChapterId(chapter.id);
                          revealTravelFeatures(chapter.mapFeatureIds ?? []);
                        }}
                      >
                        <span>{chapter.index}</span>
                        <div><strong>{chapter.title}</strong><small>{chapter.eyebrow} · показать на карте</small></div>
                      </button>
                    </li>
                  ))}
                </ol>
              </section>
              <section className="spa-planner-useful" aria-labelledby="spa-useful-title">
                <h3 id="spa-useful-title">Полезная информация</h3>
                <dl>
                  {pageData.travel.planner?.useful.map((item) => (
                    <div key={item.label}>
                      <dt>{item.label}</dt>
                      <dd>{item.value}</dd>
                      <small>{item.detail}</small>
                    </div>
                  ))}
                </dl>
              </section>
            </div>
          </section>

          <section className="spa-poi-section" id="circuit-pois" aria-labelledby="spa-poi-title">
            <header className="spa-section-heading">
              <div>
                <span className="eyebrow">Точки интереса</span>
                <h2 id="spa-poi-title">Ориентиры поездки</h2>
              </div>
              <div className="spa-poi-filter">
                <label htmlFor="spa-poi-role">Категория</label>
                <select
                  id="spa-poi-role"
                  value={travelRoleFilter}
                  onChange={(event) => changeTravelRoleFilter(event.target.value as TravelRoleFilter)}
                >
                  <option value="all">Все объекты ({travelCollections(travelMapData).points.features.length})</option>
                  {availableTravelRoles.map(([role, label]) => <option key={role} value={role}>{label}</option>)}
                </select>
              </div>
            </header>
            <div className="spa-poi-layout">
              <TravelPoiMap
                collection={travelMapData}
                track={circuitTrack}
                roleFilter={travelRoleFilter}
                selectedId={selectedTravelFeatureId}
                focusFeatureIds={travelFocusFeatureIds}
                bounds={pageData.map.travelBounds}
                onSelect={selectPlannerFeature}
              />
              <div className="spa-poi-list-panel">
                <div className="spa-poi-list-heading"><strong>Важное</strong><span>{travelPoints.length} объектов</span></div>
                {travelPoints.length > 0 ? (
                  <ul className="travel-poi-list">
                    {travelPoints.map((feature) => {
                      const featureId = travelFeatureId(feature);
                      const role = String(feature.properties?.role ?? '');
                      return (
                        <li key={featureId}>
                          <button
                            type="button"
                            className={selectedTravelFeatureId === featureId ? 'is-selected' : ''}
                            aria-pressed={selectedTravelFeatureId === featureId}
                            onClick={() => selectPlannerFeature(featureId)}
                          >
                            <i style={{ backgroundColor: travelRoleColors[role] ?? '#a9b7bf' }} aria-hidden="true" />
                            <span><strong>{String(feature.properties?.name ?? 'Точка интереса')}</strong><small>{travelRoleLabels[role] ?? String(feature.properties?.categoryRu ?? 'Точка интереса')}</small></span>
                            <b aria-hidden="true">↗</b>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                ) : <p className="travel-poi-empty">В этой категории пока нет проверенных точек</p>}
              </div>
            </div>
          </section>
        </>
      )}

      {false && travelStory && pageData.features.travelMode && (
        <section className="track-content track-content--travel">
          <header className="travel-experience__heading">
            <div className="section-heading">
              <span className="eyebrow">Для поездки</span>
              <h2 id="travel-story-title">География этапа</h2>
            </div>
            <p>{pageData.travel.intro}</p>
          </header>

          <dl className="travel-stat-strip">
            {travelStory.stats.map((stat) => (
              <div key={stat.label}><dt>{stat.value}</dt><dd>{stat.label}</dd></div>
            ))}
          </dl>

          <div className="travel-scenario-grid" aria-label="Сценарии поездки">
            {travelStory.chapters.map((chapter) => (
              <article key={chapter.id}>
                {chapter.image && <img src={chapter.image} alt="" aria-hidden="true" />}
                <div className="travel-card-copy">
                <span>{chapter.index}</span>
                <small>{chapter.eyebrow}</small>
                <h3>{chapter.title}</h3>
                <p>{chapter.description}</p>
                </div>
              </article>
            ))}
          </div>
          <p className="travel-map-instruction">
            Все точки, районы проживания и маршруты собраны на карте выше — откройте режим «Поездка» и выберите объект
          </p>

          <section className="travel-pois" aria-labelledby="travel-pois-title">
            <div className="travel-subheading">
              <span className="eyebrow">Точки интереса</span>
              <h3 id="travel-pois-title">Ориентиры поездки</h3>
              <p>Фильтр одновременно обновляет список и точки на карте; выбор объекта сохраняется между обоими представлениями</p>
            </div>
            <div className="travel-poi-filter">
              <label htmlFor="travel-poi-role">Показать на карте</label>
              <select
                id="travel-poi-role"
                value={travelRoleFilter}
                onChange={(event) => changeTravelRoleFilter(event.target.value as TravelRoleFilter)}
              >
                <option value="all">Все точки ({travelCollections(travelMapData).points.features.length})</option>
                {availableTravelRoles.map(([role, label]) => (
                  <option key={role} value={role}>{label}</option>
                ))}
              </select>
            </div>
            {travelPoints.length > 0 ? (
              <ul className="travel-poi-list">
                {travelPoints.map((feature) => {
                  const featureId = travelFeatureId(feature);
                  const role = String(feature.properties?.role ?? '');
                  return (
                    <li key={featureId}>
                      <button
                        type="button"
                        className={selectedTravelFeatureId === featureId ? 'is-selected' : ''}
                        aria-pressed={selectedTravelFeatureId === featureId}
                        disabled={!ready}
                        onClick={() => selectTravelFeature(featureId)}
                      >
                        <i style={{ backgroundColor: travelRoleColors[role] ?? '#a9b7bf' }} aria-hidden="true" />
                        <span>
                          <strong>{String(feature.properties?.name ?? 'Точка интереса')}</strong>
                          <small>{travelRoleLabels[role] ?? String(feature.properties?.categoryRu ?? 'Точка интереса')}</small>
                        </span>
                        <b aria-hidden="true">↗</b>
                      </button>
                    </li>
                  );
                })}
              </ul>
            ) : <p className="travel-poi-empty">В этой категории пока нет проверенных точек</p>}
          </section>

          <section className="travel-zones" aria-labelledby="travel-zones-title">
            <div className="travel-subheading">
              <span className="eyebrow">Где остановиться</span>
              <h3 id="travel-zones-title">Шесть характеров одного уик-энда</h3>
              <p>Зона важнее отдельного отеля: сначала выбираем ритм поездки, затем конкретное размещение</p>
            </div>
            <div className="travel-zone-grid">
              {travelStory.zones.map((zone, index) => (
                <article
                  key={zone.id}
                  className={selectedTravelFeatureId === zone.mapFeatureId ? 'is-selected' : ''}
                  style={{ '--zone-tone': zone.tone } as CSSProperties}
                >
                  {zone.image && <img src={zone.image} alt="" aria-hidden="true" />}
                  <button
                    type="button"
                    className="travel-card-copy"
                    aria-pressed={selectedTravelFeatureId === zone.mapFeatureId}
                    disabled={!ready}
                    onClick={() => selectTravelFeature(zone.mapFeatureId)}
                  >
                    <span>{String(index + 1).padStart(2, '0')}</span>
                    <small>{zone.character}</small>
                    <h4>{zone.name}</h4>
                    <p>{zone.bestFor}</p>
                    <time>{zone.travelTime}</time>
                  </button>
                </article>
              ))}
            </div>
          </section>

          {travelStory.routes.length > 0 && <section className="travel-featured-routes" aria-labelledby="travel-routes-title">
            <div className="travel-subheading">
              <span className="eyebrow">Готовые сценарии</span>
              <h3 id="travel-routes-title">Маршрут — это часть этапа</h3>
              <p>Не просто линия на карте, а понятный план на гоночный день или свободное время</p>
            </div>
            <div className="travel-route-grid">
              {travelStory.routes.map((route, index) => (
                <article key={route.id}>
                  {route.image && <img src={route.image} alt="" aria-hidden="true" />}
                  <div className="travel-card-copy">
                  <header><span>{route.type}</span><b>0{index + 1}</b></header>
                  <h4>{route.title}</h4>
                  <p>{route.description}</p>
                  <div className="travel-route-line" aria-hidden="true"><i /><i /><i /></div>
                  <ol>
                    {route.stops.map((stop) => <li key={stop}>{stop}</li>)}
                  </ol>
                  <footer><strong>{route.distance}</strong><span>{route.duration}</span></footer>
                  </div>
                </article>
              ))}
            </div>
          </section>}

          {travelStory.gallery && travelStory.gallery.length > 0 && (
            <section className="track-gallery" aria-labelledby="track-gallery-title">
              <div className="travel-subheading track-gallery__heading">
                <span className="eyebrow">Атмосфера трассы</span>
                <h3 id="track-gallery-title">Арденны в движении</h3>
                <div className="track-gallery__controls">
                  <button type="button" aria-label="Предыдущие фотографии" onClick={() => galleryRef.current?.scrollBy({ left: -galleryRef.current.clientWidth * 0.72, behavior: 'smooth' })}>←</button>
                  <button type="button" aria-label="Следующие фотографии" onClick={() => galleryRef.current?.scrollBy({ left: galleryRef.current.clientWidth * 0.72, behavior: 'smooth' })}>→</button>
                </div>
              </div>
              <div className="track-gallery__rail" ref={galleryRef}>
                {travelStory.gallery.map((image, index) => (
                  <figure key={`${image.src}-${index}`}>
                    <img src={image.src} alt={image.title} loading="lazy" />
                    <figcaption><span>{String(index + 1).padStart(2, '0')}</span><strong>{image.title}</strong><small>{image.description}</small></figcaption>
                  </figure>
                ))}
              </div>
            </section>
          )}
        </section>
      )}
      {!travelStory && pageData.features.travelMode && (
        <section className="track-content track-content--travel">
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
        </section>
      )}

      {pageData.history && pageData.history.length > 0 && (
        <section className="spa-history" aria-labelledby="spa-history-title">
          <header className="spa-section-heading">
            <div><span className="eyebrow">Эволюция</span><h2 id="spa-history-title">История трассы</h2></div>
          </header>
          <ol>
            {pageData.history.map((item) => (
              <li key={item.year}>
                {item.image && <img src={item.image} alt={item.imageAlt ?? item.title} loading="lazy" />}
                <time>{item.year}</time>
                <strong>{item.title}</strong>
                <p>{item.description}</p>
                {item.sourceUrl && <a className="spa-history-credit" href={item.sourceUrl} target="_blank" rel="noreferrer">{item.credit} · {item.license}</a>}
              </li>
            ))}
          </ol>
        </section>
      )}

      {travelStory?.gallery && travelStory.gallery.length > 0 && (
        <section className="spa-media" aria-labelledby="spa-media-title">
          <header className="spa-section-heading">
            <div><span className="eyebrow">Фотоархив</span><h2 id="spa-media-title">Медиатека</h2></div>
            <div className="spa-media-controls">
              <button type="button" aria-label="Предыдущие фотографии" onClick={() => galleryRef.current?.scrollBy({ left: -520, behavior: 'smooth' })}>←</button>
              <button type="button" aria-label="Следующие фотографии" onClick={() => galleryRef.current?.scrollBy({ left: 520, behavior: 'smooth' })}>→</button>
            </div>
          </header>
          <div className="spa-media-rail" ref={galleryRef}>
            {travelStory.gallery.map((image, index) => (
              <button type="button" key={`${image.src}-${index}`} onClick={() => setOpenMediaIndex(index)} aria-label={`Открыть фотографию «${image.title}»`}>
                <img src={image.src} alt={image.title} loading="lazy" />
                <span><strong>{image.title}</strong><small>{image.description}</small><small>{image.credit} · {image.license}</small></span>
              </button>
            ))}
          </div>
        </section>
      )}
      {openMediaIndex !== null && travelStory?.gallery?.[openMediaIndex] && (
        <dialog ref={mediaDialogRef} className="spa-media-lightbox" aria-label={travelStory.gallery[openMediaIndex].title} onCancel={() => setOpenMediaIndex(null)} onClick={(event) => { if (event.target === event.currentTarget) setOpenMediaIndex(null); }}>
          <button autoFocus type="button" className="spa-media-lightbox__close" aria-label="Закрыть" onClick={() => setOpenMediaIndex(null)}>×</button>
          <figure onClick={(event) => event.stopPropagation()}>
            <img src={travelStory.gallery[openMediaIndex].src} alt={travelStory.gallery[openMediaIndex].title} />
            <figcaption>
              <strong>{travelStory.gallery[openMediaIndex].title}</strong>
              <span>{travelStory.gallery[openMediaIndex].description}</span>
              {travelStory.gallery[openMediaIndex].sourceUrl && <a href={travelStory.gallery[openMediaIndex].sourceUrl} target="_blank" rel="noreferrer">{travelStory.gallery[openMediaIndex].credit} · {travelStory.gallery[openMediaIndex].license}</a>}
            </figcaption>
          </figure>
        </dialog>
      )}
    </main>
  );
}
