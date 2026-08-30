'use client';
/* eslint-disable @next/next/no-img-element */

import * as maplibregl from 'maplibre-gl';
import type { Map as MapLibreMap } from 'maplibre-gl';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent as ReactMouseEvent,
} from 'react';
import 'maplibre-gl/dist/maplibre-gl.css';
import driverCatalog from '../data/catalogs/drivers.json';
import { circuitPageCatalog } from '../data/circuit-page-data';
import { season2024, type Circuit } from '../data/season-2024';
import { getTrackData, getTrackGeometry } from '../data/track-geometries';
import { season2024Summary } from '../data/season-summary';
import {
  parseSeasonIndex,
  parseSeasonSnapshot,
  snapshotToCircuits,
  type SeasonIndexItem,
  type SnapshotSessionResult,
  type SeasonSnapshot,
} from '../data/web-snapshots';
import { DriverFlag, TeamCar, TeamLogo } from './racing-visuals';

type Basemap = 'dark' | 'satellite';
type MainSection = 'atlas' | 'season';
type ResultView = 'sprintQualifying' | 'sprint' | 'qualifying' | 'race';

const fallbackCircuits = season2024;
const globeOverview = { center: [70, 18] as [number, number], zoom: 2.08 };

const countryCodes = new Map<string, string>([
  ['ОАЭ', 'AE'], ['Аргентина', 'AR'], ['Австрия', 'AT'], ['Австралия', 'AU'],
  ['Азербайджан', 'AZ'], ['Бельгия', 'BE'], ['Бахрейн', 'BH'], ['Бразилия', 'BR'],
  ['Канада', 'CA'], ['Швейцария', 'CH'], ['Китай', 'CN'], ['Германия', 'DE'],
  ['Испания', 'ES'], ['Франция', 'FR'], ['Великобритания', 'GB'], ['Венгрия', 'HU'],
  ['Индия', 'IN'], ['Италия', 'IT'], ['Япония', 'JP'], ['Республика Корея', 'KR'], ['Южная Корея', 'KR'],
  ['Марокко', 'MA'], ['Монако', 'MC'], ['Мексика', 'MX'], ['Малайзия', 'MY'],
  ['Нидерланды', 'NL'], ['Португалия', 'PT'], ['Катар', 'QA'], ['Россия', 'RU'],
  ['Саудовская Аравия', 'SA'], ['Швеция', 'SE'], ['Сингапур', 'SG'], ['Турция', 'TR'],
  ['США', 'US'], ['Соединенные Штаты', 'US'], ['Соединённые Штаты', 'US'],
  ['Южная Африка', 'ZA'], ['ЮАР', 'ZA'], ['Южно-Африканская Республика', 'ZA'],
]);

function countryFlagCode(country: string) { return countryCodes.get(country)?.toLocaleLowerCase('en-US'); }

function getOverviewZoom() {
  if (window.innerWidth <= 480) return 1.48;
  if (window.innerWidth <= 720) return 1.68;
  return globeOverview.zoom;
}

const teamColorFallbacks = new Map<string, string>([
  ['mclaren', '#ff8000'],
  ['ferrari', '#e8002d'],
  ['red bull', '#3671c6'],
  ['red bull racing', '#3671c6'],
  ['mercedes', '#27f4d2'],
  ['aston martin', '#229971'],
  ['alpine', '#ff87bc'],
  ['alpine f1 team', '#ff87bc'],
  ['haas', '#b6babd'],
  ['haas f1 team', '#b6babd'],
  ['racing bulls', '#6692ff'],
  ['rb', '#6692ff'],
  ['williams', '#64c4ff'],
  ['audi', '#f50537'],
  ['cadillac', '#d4af37'],
  ['sauber', '#52e252'],
  ['kick sauber', '#52e252'],
]);

const historicalDriverNames = new Map<string, string>([
  ['giuseppe farina', 'Джузеппе Фарина'],
  ['juan manuel fangio', 'Хуан Мануэль Фанхио'],
  ['james hunt', 'Джеймс Хант'],
  ['carlos reutemann', 'Карлос Ройтеман'],
]);

const raceDateFormatter = new Intl.DateTimeFormat('ru-RU', {
  day: 'numeric',
  month: 'long',
  timeZone: 'UTC',
});

const dataUpdateFormatter = new Intl.DateTimeFormat('ru-RU', {
  day: 'numeric',
  month: 'long',
  hour: '2-digit',
  minute: '2-digit',
});

function normalizeDriverName(name: string) {
  return name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('en-US');
}

function getTeamColor(teamColor: string | null | undefined, constructorId?: string | null, constructorName?: string | null) {
  if (teamColor) return teamColor;
  const keys = [constructorId?.replaceAll('_', ' '), constructorName]
    .filter((value): value is string => Boolean(value))
    .map((value) => value.toLocaleLowerCase('en-US'));
  for (const key of keys) {
    const exact = teamColorFallbacks.get(key);
    if (exact) return exact;
    const partial = [...teamColorFallbacks].find(([name]) => key.includes(name) || name.includes(key));
    if (partial) return partial[1];
  }
  return '#5b7890';
}

function transliterateDriverName(name: string) {
  const normalized = normalizeDriverName(name);
  const knownName = historicalDriverNames.get(normalized);
  if (knownName) return knownName;

  const pairs: Array<[RegExp, string]> = [
    [/sch/g, 'ш'], [/sh/g, 'ш'], [/ch/g, 'ч'], [/zh/g, 'ж'], [/kh/g, 'х'],
    [/ph/g, 'ф'], [/th/g, 'т'], [/qu/g, 'кв'], [/ck/g, 'к'], [/ya/g, 'я'],
    [/yu/g, 'ю'], [/yo/g, 'ё'], [/ye/g, 'е'], [/j/g, 'дж'], [/c(?=[eiy])/g, 'с'],
    [/c/g, 'к'], [/x/g, 'кс'], [/w/g, 'у'],
  ];
  let value = normalized;
  for (const [pattern, replacement] of pairs) value = value.replace(pattern, replacement);
  const letters: Record<string, string> = {
    a: 'а', b: 'б', d: 'д', e: 'е', f: 'ф', g: 'г', h: 'х', i: 'и',
    k: 'к', l: 'л', m: 'м', n: 'н', o: 'о', p: 'п', q: 'к', r: 'р',
    s: 'с', t: 'т', u: 'у', v: 'в', y: 'и', z: 'з',
  };
  return value
    .split(' ')
    .map((part) => part.replace(/[a-z]/g, (letter) => letters[letter] ?? letter))
    .map((part) => part ? `${part[0].toLocaleUpperCase('ru-RU')}${part.slice(1)}` : part)
    .join(' ');
}

const localizedDriverNames = new Map(
  driverCatalog.map((driver) => [normalizeDriverName(driver.nameEn), driver.nameRu]),
);

function formatDriverName(driver: Pick<SnapshotSessionResult, 'givenName' | 'familyName'>) {
  const originalName = `${driver.givenName} ${driver.familyName}`;
  return localizedDriverNames.get(normalizeDriverName(originalName)) ?? transliterateDriverName(originalName);
}

function formatRaceDate(date: string) {
  if (!date) return 'Дата уточняется';
  return raceDateFormatter.format(new Date(`${date}T00:00:00Z`));
}

function formatDataUpdatedAt(date: string) {
  return dataUpdateFormatter.format(new Date(date));
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

function formatResultTime(result: SnapshotSessionResult) {
  if (result.position === 1 && result.elapsedMs !== null) {
    return formatMilliseconds(result.elapsedMs, true);
  }
  if (result.gapText) return result.gapText;
  if (result.gapMs !== null) return `+${(result.gapMs / 1000).toFixed(3)}`;
  return result.status ?? '—';
}

function formatSessionTime(result: SnapshotSessionResult, view: ResultView) {
  if (view === 'sprintQualifying') {
    return result.details.sq3 ?? result.details.sq2 ?? result.details.sq1 ?? 'Время не указано';
  }
  if (view === 'qualifying') {
    return result.details.q3 ?? result.details.q2 ?? result.details.q1 ?? 'Время не указано';
  }
  return formatResultTime(result);
}

const resultViewLabels: Record<ResultView, string> = {
  sprintQualifying: 'Спринт-квалификация',
  sprint: 'Спринт',
  qualifying: 'Квалификация',
  race: 'Гонка',
};

function makeCircuitMarker(type: Circuit['type']): ImageData {
  const size = 48;
  const center = size / 2;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext('2d');

  if (!context) return new ImageData(size, size);

  context.shadowColor = 'rgba(0, 0, 0, 0.62)';
  context.shadowBlur = 7;
  context.shadowOffsetY = 2;
  context.fillStyle = '#ff2038';
  context.strokeStyle = '#f7fbff';
  context.lineWidth = 4;
  context.beginPath();

  if (type === 'Городская трасса') {
    context.roundRect(10, 10, 28, 28, 5);
  } else if (type === 'Смешанная трасса') {
    context.moveTo(center, 7);
    context.lineTo(41, center);
    context.lineTo(center, 41);
    context.lineTo(7, center);
    context.closePath();
  } else {
    context.arc(center, center, 14, 0, Math.PI * 2);
  }

  context.fill();
  context.stroke();
  return context.getImageData(0, 0, size, size);
}

function getTrackBounds(track: GeoJSON.Feature<GeoJSON.LineString>) {
  const [firstCoordinate, ...coordinates] = track.geometry.coordinates;
  return coordinates.reduce(
    (bounds, coordinate) => bounds.extend(coordinate),
    new maplibregl.LngLatBounds(firstCoordinate, firstCoordinate),
  );
}

const mapStyle: maplibregl.StyleSpecification = {
  version: 8,
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
  },
  layers: [
    { id: 'space', type: 'background', paint: { 'background-color': '#02070d' } },
    {
      id: 'earth-satellite', type: 'raster', source: 'satellite',
      layout: { visibility: 'none' },
      paint: {
        'raster-opacity': 0.98,
        'raster-saturation': -0.08,
        'raster-contrast': 0.12,
        'raster-brightness-min': 0.04,
        'raster-brightness-max': 0.88,
      },
    },
    {
      id: 'earth-dark', type: 'raster', source: 'carto',
      paint: {
        'raster-opacity': 0.98, 'raster-saturation': -0.05,
        'raster-contrast': 0.28, 'raster-brightness-min': 0.14,
        'raster-brightness-max': 1,
      },
    },
  ],
};

function makeGraticule(): GeoJSON.FeatureCollection<GeoJSON.LineString> {
  const features: GeoJSON.Feature<GeoJSON.LineString>[] = [];
  for (let longitude = -150; longitude <= 180; longitude += 30) {
    const coordinates: [number, number][] = [];
    for (let latitude = -80; latitude <= 80; latitude += 2) {
      coordinates.push([longitude, latitude]);
    }
    features.push({
      type: 'Feature', properties: {},
      geometry: { type: 'LineString', coordinates },
    });
  }
  for (let latitude = -60; latitude <= 60; latitude += 30) {
    const coordinates: [number, number][] = [];
    for (let longitude = -180; longitude <= 180; longitude += 2) {
      coordinates.push([longitude, latitude]);
    }
    features.push({
      type: 'Feature', properties: {},
      geometry: { type: 'LineString', coordinates },
    });
  }
  return { type: 'FeatureCollection', features };
}

function makeCircuitGeoJson(circuits: Circuit[]): GeoJSON.FeatureCollection<GeoJSON.Point> {
  return {
    type: 'FeatureCollection',
    features: circuits.map((circuit) => ({
      type: 'Feature',
      properties: {
        id: circuit.id,
        order: circuit.order,
        name: circuit.name,
        type: circuit.type,
        status: circuit.status ?? 'completed',
      },
      geometry: { type: 'Point', coordinates: circuit.coordinates },
    })),
  };
}

function makeRouteGeoJson(circuits: Circuit[]): GeoJSON.FeatureCollection<GeoJSON.LineString> {
  if (circuits.length < 2) return { type: 'FeatureCollection', features: [] };
  return {
    type: 'FeatureCollection',
    features: [{
      type: 'Feature',
      properties: {},
      geometry: { type: 'LineString', coordinates: circuits.map((circuit) => circuit.coordinates) },
    }],
  };
}

export function AtlasExperience() {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const raceListRef = useRef<HTMLOListElement>(null);
  const seasonMenuRef = useRef<HTMLDivElement>(null);
  const seasonMenuScrollRef = useRef(0);
  const sectionNavigationLockRef = useRef(0);
  const mapRef = useRef<MapLibreMap | null>(null);
  const circuitsRef = useRef<Circuit[]>(fallbackCircuits);
  const selectedSeasonRef = useRef(2026);
  const nextCircuitIdRef = useRef<string | null>(null);
  const selectedIdRef = useRef(fallbackCircuits[0].id);
  const selectedEventIdRef = useRef(`2026-${fallbackCircuits[0].order}`);
  const [selectedEventKey, setSelectedEventKey] = useState(`${fallbackCircuits[0].id}:${fallbackCircuits[0].order}`);
  const [selectedSeason, setSelectedSeason] = useState(2026);
  const [availableSeasons, setAvailableSeasons] = useState<SeasonIndexItem[]>([
    { year: 2026, status: 'active', roundsPlanned: 23, racesAvailable: 23 },
    { year: 2024, status: 'completed', roundsPlanned: 24, racesAvailable: 24 },
  ]);
  const [seasonSnapshot, setSeasonSnapshot] = useState<SeasonSnapshot | null>(null);
  const [circuits, setCircuits] = useState<Circuit[]>(fallbackCircuits);
  const [seasonDataStatus, setSeasonDataStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [basemap, setBasemap] = useState<Basemap>('dark');
  const [mapReady, setMapReady] = useState(false);
  const [activeSection, setActiveSection] = useState<MainSection>('atlas');
  const [resultView, setResultView] = useState<ResultView>('race');
  const [seasonMenuOpen, setSeasonMenuOpen] = useState(false);
  const [mapLegendOpen, setMapLegendOpen] = useState(false);

  const orderedCircuits = useMemo(() => [...circuits].sort((left, right) => left.order - right.order), [circuits]);
  const circuitGeoJson = useMemo(() => makeCircuitGeoJson(orderedCircuits), [orderedCircuits]);
  const seasonIsPlanned = availableSeasons.find((season) => season.year === selectedSeason)?.status === 'planned';
  const routeGeoJson = useMemo(
    () => seasonIsPlanned ? makeRouteGeoJson([]) : makeRouteGeoJson(orderedCircuits),
    [orderedCircuits, seasonIsPlanned],
  );
  const seasonMeta = availableSeasons.find((season) => season.year === selectedSeason);
  const seasonIsActive = seasonMeta?.status === 'active';
  const nextCircuitId = useMemo(
    () => seasonIsActive
      ? circuits.find((circuit) => circuit.status === 'live')?.id
        ?? circuits.find((circuit) => circuit.status === 'scheduled' || circuit.status === 'postponed')?.id
        ?? null
      : null,
    [circuits, seasonIsActive],
  );

  const selectedCircuit = useMemo(
    () => circuits.find((circuit) => `${circuit.id}:${circuit.order}` === selectedEventKey)
      ?? circuits[0]
      ?? fallbackCircuits[0],
    [circuits, selectedEventKey],
  );

  const driverStandings = useMemo(() => {
    if (selectedSeason === 2024) {
      return season2024Summary.drivers.map((standing) => ({
        position: standing.position,
        id: standing.driverId,
        code: standing.driver.code,
        countryCode: null,
        name: standing.driver.nameRu,
        constructorId: standing.teamId,
        teamName: standing.teamLabel ?? standing.team.name,
        teamColor: standing.team.color2024,
        logoImageUrl: null,
        points: standing.points,
      }));
    }
    return (seasonSnapshot?.standings.drivers ?? []).map((standing) => ({
      position: standing.position,
      id: standing.driverId,
      code: standing.code ?? standing.familyName.slice(0, 3).toUpperCase(),
      countryCode: standing.countryCode,
      name: formatDriverName(standing),
      constructorId: standing.constructorId,
      teamName: standing.constructorName ?? 'Команда не указана',
      teamColor: getTeamColor(standing.teamColor, standing.constructorId, standing.constructorName),
      logoImageUrl: standing.teamLogoUrl,
      points: standing.points,
    }));
  }, [seasonSnapshot, selectedSeason]);
  const driverStandingMidpoint = Math.ceil(driverStandings.length / 2);
  const driverStandingColumns = [
    driverStandings.slice(0, driverStandingMidpoint),
    driverStandings.slice(driverStandingMidpoint),
  ];

  const constructorStandings = useMemo(() => {
    if (selectedSeason === 2024) {
      return season2024Summary.teams.map((standing) => ({
        position: standing.position,
        id: standing.teamId,
        name: standing.team.name,
        officialName: standing.team.officialName2024,
        teamColor: standing.team.color2024,
        logoImageUrl: null,
        carImageUrl: null,
        points: standing.points,
      }));
    }
    return (seasonSnapshot?.standings.constructors ?? []).map((standing) => ({
      position: standing.position,
      id: standing.constructorId,
      name: standing.name,
      officialName: standing.engineName ?? standing.name,
      teamColor: getTeamColor(standing.teamColor, standing.constructorId, standing.name),
      logoImageUrl: standing.logoImageUrl,
      carImageUrl: standing.carImageUrl,
      points: standing.points,
    }));
  }, [seasonSnapshot, selectedSeason]);
  const constructorStandingMidpoint = Math.ceil(constructorStandings.length / 2);
  const constructorStandingColumns = [
    constructorStandings.slice(0, constructorStandingMidpoint),
    constructorStandings.slice(constructorStandingMidpoint),
  ];

  const selectedRaceResults = useMemo(
    () => seasonSnapshot?.raceResults?.[String(selectedCircuit.order)] ?? [],
    [seasonSnapshot, selectedCircuit.order],
  );
  const selectedQualifyingResults = useMemo(
    () => seasonSnapshot?.qualifyingResults?.[String(selectedCircuit.order)] ?? [],
    [seasonSnapshot, selectedCircuit.order],
  );
  const selectedSprintQualifyingResults = useMemo(
    () => seasonSnapshot?.sprintQualifyingResults?.[String(selectedCircuit.order)] ?? [],
    [seasonSnapshot, selectedCircuit.order],
  );
  const selectedSprintResults = useMemo(
    () => seasonSnapshot?.sprintResults?.[String(selectedCircuit.order)] ?? [],
    [seasonSnapshot, selectedCircuit.order],
  );
  const availableResultViews = useMemo(() => [
    ...(selectedSprintQualifyingResults.length > 0 ? ['sprintQualifying' as const] : []),
    ...(selectedSprintResults.length > 0 ? ['sprint' as const] : []),
    ...(selectedQualifyingResults.length > 0 ? ['qualifying' as const] : []),
    ...(selectedRaceResults.length > 0 ? ['race' as const] : []),
  ], [selectedQualifyingResults.length, selectedRaceResults.length, selectedSprintQualifyingResults.length, selectedSprintResults.length]);
  const activeResultView = availableResultViews.includes(resultView)
    ? resultView
    : availableResultViews[0] ?? 'race';
  const selectedSessionResults = activeResultView === 'sprintQualifying'
    ? selectedSprintQualifyingResults
    : activeResultView === 'qualifying'
    ? selectedQualifyingResults
    : activeResultView === 'sprint'
      ? selectedSprintResults
      : selectedRaceResults;
  const selectedTopThree = selectedSessionResults.filter((result) => result.position <= 3);
  const selectedFastestLap = activeResultView === 'qualifying' || activeResultView === 'sprintQualifying'
    ? undefined
    : selectedSessionResults.find((result) => result.fastestLapRank === 1);

  const scrollToSection = useCallback((event: ReactMouseEvent<HTMLAnchorElement>, sectionId: string) => {
    event.preventDefault();
    sectionNavigationLockRef.current = Date.now() + 900;
    window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}`);
    document.getElementById(sectionId)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, []);

  const focusCircuit = useCallback((circuit: Circuit) => {
    setSelectedEventKey(`${circuit.id}:${circuit.order}`);
    selectedIdRef.current = circuit.id;
    selectedEventIdRef.current = `${selectedSeasonRef.current}-${circuit.order}`;
    const map = mapRef.current;
    const track = getTrackGeometry(circuit.id, selectedSeasonRef.current, selectedEventIdRef.current);
    const trackSource = map?.getSource('selected-track') as maplibregl.GeoJSONSource | undefined;
    trackSource?.setData(getTrackData(
      track ? circuit.id : '',
      selectedSeasonRef.current,
      selectedEventIdRef.current,
    ));

    if (!map) return;
    if (map.getLayer('circuit-active-marker')) {
      map.setFilter('circuit-active-marker', ['==', ['get', 'id'], circuit.id]);
      map.setFilter('circuit-order', ['==', ['get', 'id'], circuit.id]);
    }

    if (track) {
      map.fitBounds(getTrackBounds(track), {
        padding: { top: 96, right: 96, bottom: 96, left: 96 },
        maxZoom: 15.3,
        duration: 2400,
        essential: true,
      });
    } else {
      map.flyTo({
        center: circuit.coordinates,
        zoom: 7.2,
        duration: 2400,
        curve: 1.35,
        essential: true,
      });
    }
  }, []);

  const resetGlobe = useCallback(() => {
    mapRef.current?.flyTo({
      center: globeOverview.center,
      zoom: getOverviewZoom(),
      duration: 1600,
      curve: 1.2,
      essential: true,
    });
  }, []);

  const selectBasemap = useCallback((nextBasemap: Basemap) => {
    const map = mapRef.current;
    setBasemap(nextBasemap);
    if (!map?.getLayer('earth-dark') || !map.getLayer('earth-satellite')) return;

    map.setLayoutProperty('earth-dark', 'visibility', nextBasemap === 'dark' ? 'visible' : 'none');
    map.setLayoutProperty('earth-satellite', 'visibility', nextBasemap === 'satellite' ? 'visible' : 'none');
    map.setSky(nextBasemap === 'satellite' ? {
      'sky-color': '#01060a',
      'horizon-color': '#8bb4c4',
      'fog-color': '#31596d',
      'fog-ground-blend': 0.32,
      'horizon-fog-blend': 0.18,
      'sky-horizon-blend': 0.22,
      'atmosphere-blend': 0.94,
    } : {
      'sky-color': '#01070d',
      'horizon-color': '#3d7890',
      'fog-color': '#123246',
      'fog-ground-blend': 0.42,
      'horizon-fog-blend': 0.22,
      'sky-horizon-blend': 0.28,
      'atmosphere-blend': 0.9,
    });
  }, []);

  useEffect(() => {
    const seasonFromUrl = Number(new URLSearchParams(window.location.search).get('season'));
    if (seasonFromUrl >= 1950 && seasonFromUrl <= 2027 && seasonFromUrl !== selectedSeasonRef.current) {
      queueMicrotask(() => {
        selectedSeasonRef.current = seasonFromUrl;
        setSeasonDataStatus('loading');
        setSelectedSeason(seasonFromUrl);
      });
    }
    if (window.location.hash === '#atlas' || window.location.hash === '#season') {
      window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}`);
    }
  }, []);

  useEffect(() => {
    if (!seasonMenuOpen) return;
    const closeMenu = (event: MouseEvent) => {
      if (!seasonMenuRef.current?.contains(event.target as Node)) setSeasonMenuOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setSeasonMenuOpen(false);
    };
    document.addEventListener('mousedown', closeMenu);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('mousedown', closeMenu);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [seasonMenuOpen]);

  useEffect(() => {
    const controller = new AbortController();
    fetch('/data/f1/seasons.json', { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json() as Promise<unknown>;
      })
      .then(parseSeasonIndex)
      .then((data) => {
        if (data.seasons.length > 0) setAvailableSeasons(data.seasons);
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === 'AbortError') return;
        console.warn('Не удалось загрузить индекс сезонов, используется сезон 2024.', error);
      });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    fetch(`/data/f1/season-${selectedSeason}.json`, { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json() as Promise<unknown>;
      })
      .then((data) => parseSeasonSnapshot(data, selectedSeason))
      .then((snapshot) => {
        const nextCircuits = selectedSeason === 2024
          ? fallbackCircuits
          : snapshotToCircuits(snapshot);
        if (nextCircuits.length === 0) throw new Error('В календаре нет этапов.');

        const firstCircuit = snapshot.season === new Date().getUTCFullYear()
          ? nextCircuits.find((circuit) => circuit.status === 'live')
            ?? nextCircuits.find((circuit) => circuit.status === 'scheduled' || circuit.status === 'postponed')
            ?? nextCircuits[0]
          : nextCircuits[0];
        setSeasonSnapshot(snapshot);
        setCircuits(nextCircuits);
        circuitsRef.current = nextCircuits;
        nextCircuitIdRef.current = firstCircuit.status === 'completed' ? null : firstCircuit.id;
        setSelectedEventKey(`${firstCircuit.id}:${firstCircuit.order}`);
        selectedIdRef.current = firstCircuit.id;
        selectedEventIdRef.current = `${snapshot.season}-${firstCircuit.order}`;
        setSeasonDataStatus('ready');
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === 'AbortError') return;
        console.error(`Не удалось загрузить сезон ${selectedSeason}.`, error);
        setSeasonDataStatus('error');
      });
    return () => controller.abort();
  }, [selectedSeason]);

  useEffect(() => {
    if (!mapReady) return;
    const map = mapRef.current;
    const circuitSource = map?.getSource('circuits') as maplibregl.GeoJSONSource | undefined;
    const routeSource = map?.getSource('season-route') as maplibregl.GeoJSONSource | undefined;
    const trackSource = map?.getSource('selected-track') as maplibregl.GeoJSONSource | undefined;
    circuitSource?.setData(circuitGeoJson);
    routeSource?.setData(routeGeoJson);
    trackSource?.setData(getTrackData(
      selectedIdRef.current,
      selectedSeasonRef.current,
      selectedEventIdRef.current,
    ));
    if (map?.getLayer('circuit-active-marker')) {
      map.setFilter('circuit-active-marker', ['==', ['get', 'id'], selectedIdRef.current]);
      map.setFilter('circuit-order', ['==', ['get', 'id'], selectedIdRef.current]);
    }
    if (map?.getLayer('circuit-next-halo')) {
      map.setFilter('circuit-next-halo', ['==', ['get', 'id'], nextCircuitIdRef.current ?? '__none__']);
    }
  }, [circuitGeoJson, mapReady, routeGeoJson]);

  useEffect(() => {
    const list = raceListRef.current;
    if (!list) return;

    const frame = window.requestAnimationFrame(() => {
      const selectedButton = list.querySelector<HTMLButtonElement>(`button[data-event-key="${selectedEventKey}"]`);
      if (!selectedButton) return;
      const listBounds = list.getBoundingClientRect();
      const buttonBounds = selectedButton.getBoundingClientRect();
      const targetTop = list.scrollTop
        + buttonBounds.top - listBounds.top
        - (list.clientHeight - buttonBounds.height) / 2;
      const maxScrollTop = Math.max(0, list.scrollHeight - list.clientHeight);
      list.scrollTo({ top: Math.min(maxScrollTop, Math.max(0, targetTop)), behavior: 'auto' });
    });

    return () => window.cancelAnimationFrame(frame);
  }, [circuits.length, seasonDataStatus, selectedEventKey]);

  useEffect(() => {
    const atlas = document.getElementById('atlas');
    const season = document.getElementById('season');

    if (!atlas || !season) return;

    const updateActiveSection = () => {
      if (Date.now() < sectionNavigationLockRef.current) return;
      const seasonBoundary = season.offsetTop - Math.min(240, window.innerHeight * 0.28);
      setActiveSection(window.scrollY >= seasonBoundary ? 'season' : 'atlas');
    };

    updateActiveSection();
    window.addEventListener('scroll', updateActiveSection, { passive: true });
    window.addEventListener('resize', updateActiveSection);

    return () => {
      window.removeEventListener('scroll', updateActiveSection);
      window.removeEventListener('resize', updateActiveSection);
    };
  }, []);

  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: mapContainerRef.current,
      style: mapStyle,
      center: globeOverview.center,
      zoom: getOverviewZoom(),
      minZoom: 0.8,
      maxZoom: 18,
      attributionControl: false,
      dragRotate: true,
      pitchWithRotate: false,
    });
    mapRef.current = map;

    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'bottom-left');
    map.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-right');

    const updateResponsiveOverview = () => {
      map.resize();
      if (map.getZoom() < 4) map.easeTo({ zoom: getOverviewZoom(), duration: 300 });
    };
    window.addEventListener('resize', updateResponsiveOverview);

    map.on('style.load', () => {
      map.setProjection({ type: 'globe' });
      map.setSky({
        'sky-color': '#01070d',
        'horizon-color': '#3d7890',
        'fog-color': '#123246',
        'fog-ground-blend': 0.42,
        'horizon-fog-blend': 0.22,
        'sky-horizon-blend': 0.28,
        'atmosphere-blend': 0.9,
      });
      map.addSource('graticule', { type: 'geojson', data: makeGraticule() });
      map.addLayer({
        id: 'graticule', type: 'line', source: 'graticule',
        paint: {
          'line-color': '#9ec8dd', 'line-width': 0.6, 'line-opacity': 0.18,
        },
      });

      map.addSource('season-route', { type: 'geojson', data: makeRouteGeoJson(fallbackCircuits) });
      map.addLayer({
        id: 'season-route-glow', type: 'line', source: 'season-route',
        maxzoom: 8.5,
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': '#ff2038', 'line-width': 5,
          'line-opacity': 0.06, 'line-blur': 3,
        },
      });
      map.addLayer({
        id: 'season-route', type: 'line', source: 'season-route',
        maxzoom: 8.5,
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': '#f3f8fb', 'line-width': 1.15,
          'line-opacity': 0.46, 'line-dasharray': [1, 1.8],
        },
      });

      map.addSource('selected-track', {
        type: 'geojson',
        data: getTrackData(''),
      });
      map.addLayer({
        id: 'selected-track-glow', type: 'line', source: 'selected-track',
        minzoom: 8.5,
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': '#ff2038', 'line-width': 13,
          'line-opacity': 0.28, 'line-blur': 5,
        },
      });
      map.addLayer({
        id: 'selected-track', type: 'line', source: 'selected-track',
        minzoom: 8.5,
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': '#f6fbff', 'line-width': 3.2,
          'line-opacity': 0.96,
        },
      });

      map.addSource('circuits', { type: 'geojson', data: makeCircuitGeoJson(fallbackCircuits) });
      map.addImage('circuit-stationary', makeCircuitMarker('Стационарная трасса'), { pixelRatio: 2 });
      map.addImage('circuit-urban', makeCircuitMarker('Городская трасса'), { pixelRatio: 2 });
      map.addImage('circuit-mixed', makeCircuitMarker('Смешанная трасса'), { pixelRatio: 2 });
      map.addLayer({
        id: 'circuit-next-halo', type: 'circle', source: 'circuits',
        maxzoom: 8.5,
        filter: ['==', ['get', 'id'], '__none__'],
        paint: {
          'circle-radius': 16,
          'circle-color': '#ff2038',
          'circle-opacity': 0.16,
          'circle-stroke-color': '#ff6072',
          'circle-stroke-width': 1.4,
          'circle-stroke-opacity': 0.72,
        },
      });
      map.addLayer({
        id: 'circuit-markers', type: 'symbol', source: 'circuits',
        maxzoom: 8.5,
        layout: {
          'icon-image': [
            'match', ['get', 'type'],
            'Городская трасса', 'circuit-urban',
            'Смешанная трасса', 'circuit-mixed',
            'circuit-stationary',
          ],
          'icon-size': [
            'interpolate', ['linear'], ['zoom'],
            0.8, 0.62,
            3.2, 0.82,
          ],
          'icon-padding': 1,
          'icon-allow-overlap': true,
          'icon-ignore-placement': true,
        },
      });
      map.addLayer({
        id: 'circuit-active-marker', type: 'symbol', source: 'circuits',
        maxzoom: 8.5,
        filter: ['==', ['get', 'id'], selectedIdRef.current],
        layout: {
          'icon-image': [
            'match', ['get', 'type'],
            'Городская трасса', 'circuit-urban',
            'Смешанная трасса', 'circuit-mixed',
            'circuit-stationary',
          ],
          'icon-size': 1.08,
          'icon-allow-overlap': true,
        },
        paint: { 'icon-opacity': 1 },
      });
      map.addLayer({
        id: 'circuits-hit', type: 'circle', source: 'circuits',
        maxzoom: 8.5,
        paint: {
          'circle-radius': 11,
          'circle-color': '#ff2038',
          'circle-opacity': 0.01,
        },
      });
      map.addLayer({
        id: 'circuit-order', type: 'symbol', source: 'circuits',
        maxzoom: 8.5,
        filter: ['==', ['get', 'id'], selectedIdRef.current],
        layout: {
          'text-field': ['to-string', ['get', 'order']],
          'text-size': 11, 'text-offset': [0, -2.1], 'text-allow-overlap': true,
        },
        paint: {
          'text-color': '#ffffff', 'text-halo-color': '#06101a',
          'text-halo-width': 1.2,
        },
      });

      map.on('mouseenter', 'circuits-hit', (event) => {
        map.getCanvas().style.cursor = 'pointer';
        const id = event.features?.[0]?.properties?.id as string | undefined;
        if (id) map.setFilter('circuit-order', ['==', ['get', 'id'], id]);
      });
      map.on('mouseleave', 'circuits-hit', () => {
        map.getCanvas().style.cursor = '';
        map.setFilter('circuit-order', ['==', ['get', 'id'], selectedIdRef.current]);
      });
      map.on('click', 'circuits-hit', (event) => {
        const id = event.features?.[0]?.properties?.id as string | undefined;
        const circuit = circuitsRef.current.find((item) => item.id === id);
        if (circuit) focusCircuit(circuit);
      });
      setMapReady(true);
    });

    return () => {
      window.removeEventListener('resize', updateResponsiveOverview);
      map.remove();
      mapRef.current = null;
    };
  }, [focusCircuit]);

  return (
    <main className="atlas-shell">
      <header className="topbar" id="top">
        <a className="brand" href="#top" aria-label="Formula 1 — География скорости, главная">
          <span className="brand-mark" aria-hidden="true"><img src="/icon.svg" alt="" /></span>
          <span>
            <strong>География скорости</strong>
            <small>Скорость • География • История</small>
          </span>
        </a>

        <nav className="topnav" aria-label="Основная навигация">
          <a
            className={activeSection === 'atlas' ? 'is-active' : ''}
            href="#atlas"
            aria-current={activeSection === 'atlas' ? 'page' : undefined}
            onClick={(event) => {
              setActiveSection('atlas');
              scrollToSection(event, 'atlas');
            }}
          >
            Атлас
          </a>
          <a
            className={activeSection === 'season' ? 'is-active' : ''}
            href="#season"
            aria-current={activeSection === 'season' ? 'page' : undefined}
            onClick={(event) => {
              setActiveSection('season');
              scrollToSection(event, 'season');
            }}
          >
            Сезон
          </a>
          <a href="#history">История</a>
          <a href="#project">О проекте</a>
        </nav>

        <div ref={seasonMenuRef} className="season-control" aria-label="Выбранный сезон">
          <span>Сезон</span>
          <button
            type="button"
            className="season-menu-trigger"
            aria-label="Сезон"
            aria-haspopup="listbox"
            aria-expanded={seasonMenuOpen}
            onClick={() => {
              seasonMenuScrollRef.current = window.scrollY;
              setSeasonMenuOpen((open) => !open);
            }}
          >
            {selectedSeason}
            <span aria-hidden="true">⌄</span>
          </button>
          {seasonMenuOpen && (
            <div className="season-menu" role="listbox" aria-label="Выберите сезон">
              {availableSeasons.map((season) => (
                <button
                  key={season.year}
                  type="button"
                  role="option"
                  aria-selected={season.year === selectedSeason}
                  className={season.year === selectedSeason ? 'is-selected' : ''}
                  onClick={() => {
                    const scrollPosition = seasonMenuScrollRef.current;
                    selectedSeasonRef.current = season.year;
                    setSeasonDataStatus('loading');
                    setSelectedSeason(season.year);
                    setSeasonMenuOpen(false);
                    const url = new URL(window.location.href);
                    url.searchParams.set('season', String(season.year));
                    window.history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`);
                    window.requestAnimationFrame(() => window.scrollTo({ top: scrollPosition, behavior: 'auto' }));
                    window.setTimeout(() => window.scrollTo({ top: scrollPosition, behavior: 'auto' }), 80);
                  }}
                >
                  {season.year}
                </button>
              ))}
            </div>
          )}
        </div>
      </header>

      <section className="intro-hero" aria-labelledby="intro-title">
        <div className="intro-hero-shade" aria-hidden="true" />
        <div className="intro-copy">
          <span className="eyebrow">Интерактивный атлас Formula 1</span>
          <h1 id="intro-title">
            <span>Мир,</span>
            <span>где скорость</span>
            <span>становится искусством</span>
          </h1>
          <p>
            Исследуйте мир Formula 1 — легендарные трассы, города, страны
            и&nbsp;историю чемпионата на&nbsp;интерактивной карте
          </p>
          <a className="intro-action" href="#atlas" onClick={(event) => scrollToSection(event, 'atlas')}>
            Открыть атлас
            <span aria-hidden="true">↓</span>
          </a>
        </div>
        <div className="intro-meta" aria-hidden="true">
          <span>{circuits.length} {seasonIsPlanned ? 'площадки' : 'этапов'}</span>
          <span>{new Set(circuits.map((circuit) => circuit.country)).size} стран</span>
          <span>Сезон {selectedSeason}</span>
        </div>
        <a
          className="hero-scroll-cue"
          href="#atlas"
          aria-label="Прокрутить к интерактивному атласу"
          onClick={(event) => scrollToSection(event, 'atlas')}
        >
          <span aria-hidden="true" />
        </a>
      </section>

      <section className="atlas-stage" id="atlas">
        <div className="map-panel">
          <div ref={mapContainerRef} className="map-canvas" aria-label="Интерактивный глобус с этапами Formula 1" />
          <div className="map-vignette" aria-hidden="true" />

          <div className="basemap-control basemap-control--map">
            <div role="group" aria-label="Картографическая подложка">
              <button
                type="button"
                className={basemap === 'dark' ? 'is-active' : ''}
                aria-pressed={basemap === 'dark'}
                disabled={!mapReady}
                onClick={() => selectBasemap('dark')}
              >
                Карта
              </button>
              <button
                type="button"
                className={basemap === 'satellite' ? 'is-active' : ''}
                aria-pressed={basemap === 'satellite'}
                disabled={!mapReady}
                onClick={() => selectBasemap('satellite')}
              >
                Спутник
              </button>
            </div>
          </div>

          <aside
            id="atlas-map-legend"
            className={`atlas-map-legend${mapLegendOpen ? ' is-open' : ''}`}
            aria-label="Условные обозначения типов трасс"
          >
            <div className="atlas-map-legend__content">
              <strong>Типы трасс</strong>
              <span><i className="atlas-legend-marker atlas-legend-marker--stationary" />Стационарная</span>
              <span><i className="atlas-legend-marker atlas-legend-marker--urban" />Городская</span>
              <span><i className="atlas-legend-marker atlas-legend-marker--mixed" />Смешанная</span>
            </div>
            <button
              type="button"
              className="atlas-map-legend__toggle"
              aria-controls="atlas-map-legend"
              aria-expanded={mapLegendOpen}
              aria-label={mapLegendOpen ? 'Скрыть условные обозначения' : 'Показать условные обозначения'}
              onClick={() => setMapLegendOpen((open) => !open)}
            >
              <i aria-hidden="true" />
              <span>Условные обозначения</span>
            </button>
          </aside>

          <button className="reset-view" type="button" onClick={resetGlobe}>
            <span aria-hidden="true">◎</span> Весь маршрут
          </button>

          {!mapReady && (
            <div className="map-loader" role="status">
              <span />
              Строим глобус
            </div>
          )}

          <div className="map-caption">
            <span className="live-dot" aria-hidden="true" />
            {seasonIsPlanned
              ? `Предварительный состав · ${circuits.length} площадки сезона ${selectedSeason}`
              : `Полный маршрут · ${circuits.length} этапов сезона ${selectedSeason}`}
          </div>
        </div>

        <aside className="race-panel">
          <div className="panel-intro">
            <span className="eyebrow">Сезон {selectedSeason}</span>
            <div className="panel-title-row">
              <h2>{seasonIsPlanned ? 'Планируемые площадки' : 'Календарный маршрут'}</h2>
              <span>{circuits.length} {seasonIsPlanned ? 'площадки' : 'этапов'}</span>
            </div>
            {seasonDataStatus === 'loading' && <small className="season-data-note">Обновляем данные сезона…</small>}
            {seasonDataStatus === 'error' && <small className="season-data-note season-data-note--error">Не удалось обновить данные. Показан последний доступный календарь.</small>}
            {seasonDataStatus === 'ready' && seasonSnapshot && (
              <small className="season-data-note">
                {seasonIsPlanned
                  ? 'Предварительный состав. Даты и порядок уточняются'
                  : `Данные обновлены ${formatDataUpdatedAt(seasonSnapshot.exportedAt)}`}
              </small>
            )}
          </div>

          <ol ref={raceListRef} className="race-list" aria-label={`Этапы сезона ${selectedSeason}`}>
            {orderedCircuits.map((circuit) => (
              <li key={`${circuit.id}:${circuit.order}`}>
                <button
                  type="button"
                  data-event-key={`${circuit.id}:${circuit.order}`}
                  className={[
                    `${circuit.id}:${circuit.order}` === selectedEventKey ? 'is-selected' : '',
                    circuit.id === nextCircuitId ? 'is-next' : '',
                    seasonIsActive && circuit.status === 'completed' ? 'is-completed' : '',
                    circuit.status === 'live' ? 'is-live' : '',
                  ].filter(Boolean).join(' ')}
                  onClick={() => focusCircuit(circuit)}
                  aria-current={`${circuit.id}:${circuit.order}` === selectedEventKey ? 'true' : undefined}
                >
                  <span className="race-number">{seasonIsPlanned ? '—' : String(circuit.order).padStart(2, '0')}</span>
                  <span className="race-name">
                    <strong>{circuit.name}</strong>
                    <small>{circuit.country}</small>
                  </span>
                  <span className="race-meta">
                    <time dateTime={circuit.date}>{formatRaceDate(circuit.date)}</time>
                    {seasonIsActive && circuit.status === 'completed' && <small>Завершён</small>}
                    {circuit.id === nextCircuitId && circuit.status !== 'live' && <small>Следующий</small>}
                    {circuit.status === 'live' && <small>Сейчас</small>}
                    {circuit.status === 'postponed' && <small>Перенесён</small>}
                    {circuit.status === 'cancelled' && <small>Отменён</small>}
                  </span>
                </button>
              </li>
            ))}
          </ol>

          <article className="circuit-card" aria-live="polite">
            <div className="card-topline">
              <span>{seasonIsPlanned ? 'Планируемая площадка' : `Этап ${String(selectedCircuit.order).padStart(2, '0')}`}</span>
              <span>{selectedCircuit.type}</span>
            </div>
            <div className="circuit-card__identity">
              <div>
                <h3>{selectedCircuit.name}</h3>
                <p>Этап чемпионата мира</p>
              </div>
              {countryFlagCode(selectedCircuit.country) && (
                <img
                  className="circuit-country-flag"
                  src={`https://flagcdn.com/${countryFlagCode(selectedCircuit.country)}.svg`}
                  alt={`Флаг страны: ${selectedCircuit.country}`}
                  title={selectedCircuit.country}
                />
              )}
            </div>
            <dl>
              <div><dt>Место</dt><dd>{selectedCircuit.city}</dd></div>
              <div><dt>Страна</dt><dd>{selectedCircuit.country}</dd></div>
              <div><dt>Дата</dt><dd>{formatRaceDate(selectedCircuit.date)}</dd></div>
            </dl>
            {availableResultViews.length > 0 ? (
              <section className="race-result-summary" aria-label="Результаты выбранного этапа">
                <div className="result-view-tabs" role="tablist" aria-label="Тип сессии">
                  {availableResultViews.map((view) => (
                    <button
                      key={view}
                      type="button"
                      role="tab"
                      aria-selected={activeResultView === view}
                      className={activeResultView === view ? 'is-active' : ''}
                      onClick={() => setResultView(view)}
                    >
                      {resultViewLabels[view]}
                    </button>
                  ))}
                </div>
                <div className="race-result-heading">
                  <span>{activeResultView === 'qualifying' || activeResultView === 'sprintQualifying' ? 'Топ-3' : 'Подиум'}</span>
                  <small>{resultViewLabels[activeResultView]}</small>
                </div>
                <ol className="atlas-podium-list">
                  {selectedTopThree.map((result) => (
                    <li
                      key={result.driverId}
                      className={`atlas-podium-place atlas-podium-place--${result.position}`}
                      style={{
                        '--team-color': getTeamColor(result.teamColor, result.constructorId, result.constructorName),
                      } as CSSProperties}
                    >
                      <span>{result.position}</span>
                      <strong>{result.code ?? result.familyName.slice(0, 3).toUpperCase()}</strong>
                      <DriverFlag driverId={result.driverId} countryCode={result.countryCode} />
                      <span className="atlas-podium-driver">
                        <b>{formatDriverName(result)}</b>
                        <small>{result.constructorName ?? 'Команда не указана'}</small>
                      </span>
                      <TeamLogo season={selectedSeason} logoUrl={result.teamLogoUrl} className="identity-team-logo" constructorId={result.constructorId} constructorName={result.constructorName} teamColor={getTeamColor(result.teamColor, result.constructorId, result.constructorName)} />
                      <span className="atlas-podium-time">
                        <b>{formatSessionTime(result, activeResultView)}</b>
                        <small>{activeResultView === 'qualifying' || activeResultView === 'sprintQualifying' ? 'лучшее время' : `${result.points} очков`}</small>
                      </span>
                    </li>
                  ))}
                </ol>
                {selectedFastestLap && (
                  <div className="fastest-lap-row">
                    <span>Быстрый круг</span>
                    <b className="fastest-lap-code">{selectedFastestLap.code ?? selectedFastestLap.familyName.slice(0, 3).toUpperCase()}</b>
                    <DriverFlag driverId={selectedFastestLap.driverId} countryCode={selectedFastestLap.countryCode} />
                    <strong>{formatDriverName(selectedFastestLap)}</strong>
                    <TeamLogo season={selectedSeason} logoUrl={selectedFastestLap.teamLogoUrl} className="identity-team-logo" constructorId={selectedFastestLap.constructorId} constructorName={selectedFastestLap.constructorName} teamColor={getTeamColor(selectedFastestLap.teamColor, selectedFastestLap.constructorId, selectedFastestLap.constructorName)} />
                    <span>
                      {selectedFastestLap.fastestLapMs !== null
                        ? formatMilliseconds(selectedFastestLap.fastestLapMs)
                        : 'Время уточняется'}
                      {selectedFastestLap.fastestLapNumber !== null
                        ? ` · круг ${selectedFastestLap.fastestLapNumber}`
                        : ''}
                    </span>
                  </div>
                )}
              </section>
            ) : (
              <p className="race-result-empty">
                {selectedCircuit.status === 'scheduled' || selectedCircuit.status === 'postponed'
                  ? 'Этап ещё не состоялся — результаты появятся после гонки'
                  : 'Результаты этого этапа пока подготавливаются'}
              </p>
            )}
            {circuitPageCatalog.has(selectedCircuit.id) ? (
              <a href={`/circuits/${circuitPageCatalog.get(selectedCircuit.id)?.slug}?season=${selectedSeason}`}>
                Результаты и схема этапа
                <span aria-hidden="true">↗</span>
              </a>
            ) : (
              <button type="button" disabled title="Страница появится после добавления геометрии трассы">
                Страница готовится
                <span aria-hidden="true">↗</span>
              </button>
            )}
          </article>
        </aside>
      </section>

      <section className="season-overview" id="season" aria-labelledby="season-title">
        <div className="season-overview-heading">
          <div>
            <span className="eyebrow">{seasonIsPlanned ? 'Предварительный состав' : seasonIsActive ? 'Текущий сезон' : 'Итоги сезона'} {selectedSeason}</span>
            <h2 id="season-title">{seasonIsPlanned ? 'География сезона' : 'Чемпионат в цифрах'}</h2>
          </div>
          <p>
            {seasonIsPlanned
              ? 'На глобусе показаны заявленные площадки. Даты и порядок появятся после утверждения календаря FIA'
              : 'Календарь показывает географию чемпионата, а этот раздел фиксирует спортивный итог сезона: лидеров личного и командного зачётов'}
          </p>
        </div>

        <div className="season-stat-strip" aria-label={`Основные показатели сезона ${selectedSeason}`}>
          <div><strong>{circuits.length}</strong><span>{seasonIsPlanned ? 'площадки' : 'этапов'}</span></div>
          <div><strong>{new Set(circuits.map((circuit) => circuit.country)).size}</strong><span>стран</span></div>
          {!seasonIsPlanned && <div><strong>{driverStandings.length}</strong><span>пилотов</span></div>}
          {!seasonIsPlanned && <div><strong>{constructorStandings.length}</strong><span>команд</span></div>}
        </div>

        {!seasonIsPlanned && <div className="standings-grid">
          <article className="standings-panel">
            <div className="standings-title">
              <span>Личный зачёт</span>
              <small>{driverStandings.length} пилотов</small>
            </div>
            {driverStandings.length > 0 ? (
              <div className="standings-columns">
                {driverStandingColumns.map((column, columnIndex) => (
                  <ol key={columnIndex} start={column[0]?.position}>
                    {column.map((standing) => (
                      <li
                        key={standing.id}
                        className={`standing-rank standing-rank--${standing.position <= 3 ? standing.position : 'regular'}`}
                        style={{ '--team-color': standing.teamColor } as CSSProperties}
                      >
                        <span className="standing-position">{String(standing.position).padStart(2, '0')}</span>
                        {standing.position <= 3 && <span className="standing-trophy" aria-label={`${standing.position} место`}>🏆</span>}
                        <span className="driver-code">{standing.code}</span>
                        <DriverFlag driverId={standing.id} countryCode={standing.countryCode} />
                        <span className="standing-name">
                          <strong>{standing.name}</strong>
                          <small>{standing.teamName}</small>
                        </span>
                        <TeamLogo season={selectedSeason} logoUrl={standing.logoImageUrl} className="identity-team-logo" constructorId={standing.constructorId} constructorName={standing.teamName} teamColor={standing.teamColor} />
                        <span className="standing-points"><strong>{standing.points}</strong><small>очков</small></span>
                      </li>
                    ))}
                  </ol>
                ))}
              </div>
            ) : <ol><li className="standings-empty">Данные личного зачёта пока отсутствуют</li></ol>}
          </article>

          <article className="standings-panel standings-panel--teams">
            <div className="standings-title">
              <span>Кубок конструкторов</span>
              <small>{constructorStandings.length} команд</small>
            </div>
            {constructorStandings.length > 0 ? (
              <div className="standings-columns">
                {constructorStandingColumns.map((column, columnIndex) => (
                  <ol key={columnIndex} start={column[0]?.position}>
                    {column.map((standing) => (
                      <li
                        key={standing.id}
                        className={`standing-rank standing-rank--${standing.position <= 3 ? standing.position : 'regular'}`}
                        style={{ '--team-color': standing.teamColor } as CSSProperties}
                      >
                        <span className="standing-position">{String(standing.position).padStart(2, '0')}</span>
                        {standing.position <= 3 && <span className="standing-trophy" aria-label={`${standing.position} место`}>🏆</span>}
                        <TeamLogo season={selectedSeason} logoUrl={standing.logoImageUrl} className="constructor-standing-logo" constructorId={standing.id} constructorName={standing.name} teamColor={standing.teamColor} />
                        <span className="standing-name">
                          <strong>{standing.name}</strong>
                          <small>{standing.officialName}</small>
                        </span>
                        <TeamCar season={selectedSeason} constructorId={standing.id} constructorName={standing.name} carImageUrl={standing.carImageUrl} />
                        <span className="standing-points"><strong>{standing.points}</strong><small>очков</small></span>
                      </li>
                    ))}
                  </ol>
                ))}
              </div>
            ) : <ol><li className="standings-empty">Кубок конструкторов в этом сезоне ещё не проводился</li></ol>}
          </article>
        </div>}
      </section>
    </main>
  );
}
