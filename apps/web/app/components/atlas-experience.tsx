'use client';

import * as maplibregl from 'maplibre-gl';
import type { Map as MapLibreMap } from 'maplibre-gl';
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import 'maplibre-gl/dist/maplibre-gl.css';
import { season2024, type Circuit } from '../data/season-2024';
import { getTrackData, trackGeometries } from '../data/track-geometries';
import { season2024Summary } from '../data/season-summary';
import {
  snapshotToCircuits,
  type SeasonIndexItem,
  type SeasonSnapshot,
} from '../data/web-snapshots';

type Basemap = 'dark' | 'satellite';
type MainSection = 'atlas' | 'season';

const fallbackCircuits = season2024;

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

function formatRaceDate(date: string) {
  if (!date) return 'Дата уточняется';
  return raceDateFormatter.format(new Date(`${date}T00:00:00Z`));
}

function formatDataUpdatedAt(date: string) {
  return dataUpdateFormatter.format(new Date(date));
}

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
  const mapRef = useRef<MapLibreMap | null>(null);
  const circuitsRef = useRef<Circuit[]>(fallbackCircuits);
  const selectedSeasonRef = useRef(2024);
  const selectedIdRef = useRef(fallbackCircuits[0].id);
  const [selectedId, setSelectedId] = useState(fallbackCircuits[0].id);
  const [selectedSeason, setSelectedSeason] = useState(2024);
  const [availableSeasons, setAvailableSeasons] = useState<SeasonIndexItem[]>([{
    year: 2024,
    status: 'completed',
    roundsPlanned: 24,
    racesAvailable: 24,
  }]);
  const [seasonSnapshot, setSeasonSnapshot] = useState<SeasonSnapshot | null>(null);
  const [circuits, setCircuits] = useState<Circuit[]>(fallbackCircuits);
  const [seasonDataStatus, setSeasonDataStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [basemap, setBasemap] = useState<Basemap>('dark');
  const [mapReady, setMapReady] = useState(false);
  const [activeSection, setActiveSection] = useState<MainSection>('atlas');

  const circuitGeoJson = useMemo(() => makeCircuitGeoJson(circuits), [circuits]);
  const routeGeoJson = useMemo(() => makeRouteGeoJson(circuits), [circuits]);
  const seasonMeta = availableSeasons.find((season) => season.year === selectedSeason);
  const seasonIsActive = seasonMeta?.status === 'active';

  const selectedCircuit = useMemo(
    () => circuits.find((circuit) => circuit.id === selectedId) ?? circuits[0] ?? fallbackCircuits[0],
    [circuits, selectedId],
  );

  const driverStandings = useMemo(() => {
    if (selectedSeason === 2024) {
      return season2024Summary.drivers.map((standing) => ({
        position: standing.position,
        id: standing.driverId,
        code: standing.driver.code,
        name: standing.driver.nameRu,
        teamName: standing.teamLabel ?? standing.team.name,
        teamColor: standing.team.color2024,
        points: standing.points,
      }));
    }
    return (seasonSnapshot?.standings.drivers ?? []).map((standing) => ({
      position: standing.position,
      id: standing.driverId,
      code: standing.code ?? standing.familyName.slice(0, 3).toUpperCase(),
      name: `${standing.givenName} ${standing.familyName}`,
      teamName: standing.constructorName ?? 'Команда не указана',
      teamColor: standing.teamColor ?? '#5b7890',
      points: standing.points,
    }));
  }, [seasonSnapshot, selectedSeason]);

  const constructorStandings = useMemo(() => {
    if (selectedSeason === 2024) {
      return season2024Summary.teams.map((standing) => ({
        position: standing.position,
        id: standing.teamId,
        name: standing.team.name,
        officialName: standing.team.officialName2024,
        teamColor: standing.team.color2024,
        points: standing.points,
      }));
    }
    return (seasonSnapshot?.standings.constructors ?? []).map((standing) => ({
      position: standing.position,
      id: standing.constructorId,
      name: standing.name,
      officialName: standing.engineName ?? standing.name,
      teamColor: standing.teamColor ?? '#5b7890',
      points: standing.points,
    }));
  }, [seasonSnapshot, selectedSeason]);

  const focusCircuit = useCallback((circuit: Circuit) => {
    setSelectedId(circuit.id);
    selectedIdRef.current = circuit.id;
    const map = mapRef.current;
    const track = selectedSeasonRef.current === 2024 ? trackGeometries[circuit.id] : undefined;
    const trackSource = map?.getSource('selected-track') as maplibregl.GeoJSONSource | undefined;
    trackSource?.setData(getTrackData(track ? circuit.id : ''));

    if (!map) return;
    if (map.getLayer('circuit-active-marker')) {
      map.setFilter('circuit-active-marker', ['==', ['get', 'id'], circuit.id]);
      map.setFilter('circuit-order', ['==', ['get', 'id'], circuit.id]);
    }

    if (track) {
      map.fitBounds(getTrackBounds(track), {
        padding: { top: 96, right: 96, bottom: 96, left: 96 },
        maxZoom: 15.3,
        duration: 2200,
        essential: true,
      });
    } else {
      map.flyTo({
        center: circuit.coordinates,
        zoom: 3.4,
        duration: 1400,
        essential: true,
      });
    }
  }, []);

  const resetGlobe = useCallback(() => {
    mapRef.current?.flyTo({
      center: [70, 18], zoom: 1.25, duration: 1400, essential: true,
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
    const controller = new AbortController();
    fetch('/data/f1/seasons.json', { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json() as Promise<{ seasons: SeasonIndexItem[] }>;
      })
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
        return response.json() as Promise<SeasonSnapshot>;
      })
      .then((snapshot) => {
        const nextCircuits = selectedSeason === 2024
          ? fallbackCircuits
          : snapshotToCircuits(snapshot);
        if (nextCircuits.length === 0) throw new Error('В календаре нет этапов.');

        const firstCircuit = nextCircuits[0];
        setSeasonSnapshot(snapshot);
        setCircuits(nextCircuits);
        circuitsRef.current = nextCircuits;
        setSelectedId(firstCircuit.id);
        selectedIdRef.current = firstCircuit.id;
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
    trackSource?.setData(getTrackData(selectedSeasonRef.current === 2024 ? selectedIdRef.current : ''));
    if (map?.getLayer('circuit-active-marker')) {
      map.setFilter('circuit-active-marker', ['==', ['get', 'id'], selectedIdRef.current]);
      map.setFilter('circuit-order', ['==', ['get', 'id'], selectedIdRef.current]);
    }
  }, [circuitGeoJson, mapReady, routeGeoJson]);

  useEffect(() => {
    const atlas = document.getElementById('atlas');
    const season = document.getElementById('season');

    if (!atlas || !season) return;

    const updateActiveSection = () => {
      const seasonBoundary = season.offsetTop - 148;
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
      center: [70, 18],
      zoom: 1.25,
      minZoom: 0.8,
      maxZoom: 18,
      attributionControl: false,
      dragRotate: true,
      pitchWithRotate: false,
    });
    mapRef.current = map;

    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'bottom-left');
    map.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-right');

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
        data: getTrackData(selectedIdRef.current),
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
      map.remove();
      mapRef.current = null;
    };
  }, [focusCircuit]);

  return (
    <main className="atlas-shell">
      <header className="topbar" id="top">
        <a className="brand" href="#top" aria-label="F1 Geovisual Atlas — главная">
          <span className="brand-mark" aria-hidden="true">F1</span>
          <span>
            <strong>Geovisual Atlas</strong>
            <small>География скорости</small>
          </span>
        </a>

        <nav className="topnav" aria-label="Основная навигация">
          <a
            className={activeSection === 'atlas' ? 'is-active' : ''}
            href="#atlas"
            aria-current={activeSection === 'atlas' ? 'page' : undefined}
            onClick={() => setActiveSection('atlas')}
          >
            Атлас
          </a>
          <a
            className={activeSection === 'season' ? 'is-active' : ''}
            href="#season"
            aria-current={activeSection === 'season' ? 'page' : undefined}
            onClick={() => setActiveSection('season')}
          >
            Сезон
          </a>
          <a href="#history">История</a>
          <a href="#project">О проекте</a>
        </nav>

        <div className="season-control" aria-label="Выбранный сезон">
          <span>Сезон</span>
          <select
            value={selectedSeason}
            aria-label="Сезон"
            onChange={(event) => {
              selectedSeasonRef.current = Number(event.target.value);
              setSeasonDataStatus('loading');
              setSelectedSeason(selectedSeasonRef.current);
            }}
          >
            {availableSeasons.map((season) => (
              <option key={season.year} value={season.year}>{season.year}</option>
            ))}
          </select>
        </div>
      </header>

      <section className="intro-hero" aria-labelledby="intro-title">
        <div className="intro-hero-shade" aria-hidden="true" />
        <div className="intro-copy">
          <span className="eyebrow">Интерактивный атлас Formula 1</span>
          <h1 id="intro-title">Мир как гоночная трасса</h1>
          <p>
            Исследуйте географию чемпионата, маршруты сезонов и&nbsp;историю трасс
            через&nbsp;интерактивную карту.
          </p>
          <a className="intro-action" href="#atlas">
            Открыть атлас
            <span aria-hidden="true">↓</span>
          </a>
        </div>
        <div className="intro-meta" aria-hidden="true">
          <span>{circuits.length} этапов</span>
          <span>{new Set(circuits.map((circuit) => circuit.country)).size} стран</span>
          <span>Сезон {selectedSeason}</span>
        </div>
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
            Полный маршрут · {circuits.length} этапов сезона {selectedSeason}
          </div>
        </div>

        <aside className="race-panel">
          <div className="panel-intro">
            <span className="eyebrow">Сезон {selectedSeason}</span>
            <div className="panel-title-row">
              <h2>Календарный маршрут</h2>
              <span>{circuits.length} этапов</span>
            </div>
            {seasonDataStatus === 'loading' && <small className="season-data-note">Обновляем данные сезона…</small>}
            {seasonDataStatus === 'error' && <small className="season-data-note season-data-note--error">Не удалось обновить данные. Показан последний доступный календарь.</small>}
            {seasonDataStatus === 'ready' && seasonSnapshot && (
              <small className="season-data-note">
                Данные обновлены {formatDataUpdatedAt(seasonSnapshot.exportedAt)}
              </small>
            )}
          </div>

          <ol className="race-list" aria-label={`Этапы сезона ${selectedSeason}`}>
            {circuits.map((circuit) => (
              <li key={circuit.id}>
                <button
                  type="button"
                  className={circuit.id === selectedId ? 'is-selected' : ''}
                  onClick={() => focusCircuit(circuit)}
                  aria-current={circuit.id === selectedId ? 'true' : undefined}
                >
                  <span className="race-number">{String(circuit.order).padStart(2, '0')}</span>
                  <span className="race-name">
                    <strong>{circuit.name}</strong>
                    <small>{circuit.country}</small>
                  </span>
                  <time dateTime={circuit.date}>{formatRaceDate(circuit.date)}</time>
                </button>
              </li>
            ))}
          </ol>

          <article className="circuit-card" aria-live="polite">
            <div className="card-topline">
              <span>Этап {String(selectedCircuit.order).padStart(2, '0')}</span>
              <span>{selectedCircuit.type}</span>
            </div>
            <h3>{selectedCircuit.name}</h3>
            <p>{selectedCircuit.officialName}</p>
            <dl>
              <div><dt>Место</dt><dd>{selectedCircuit.city}</dd></div>
              <div><dt>Страна</dt><dd>{selectedCircuit.country}</dd></div>
              <div><dt>Дата</dt><dd>{formatRaceDate(selectedCircuit.date)}</dd></div>
            </dl>
            {selectedCircuit.id === 'bahrain' && selectedSeason === 2024 ? (
              <a href="/circuits/bahrain">
                Открыть страницу трассы
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
            <span className="eyebrow">{seasonIsActive ? 'Текущий сезон' : 'Итоги сезона'} {selectedSeason}</span>
            <h2 id="season-title">Чемпионат в&nbsp;цифрах</h2>
          </div>
          <p>
            Календарь показывает географию чемпионата, а&nbsp;этот раздел фиксирует
            спортивный итог сезона: лидеров личного и&nbsp;командного зачётов.
          </p>
        </div>

        <div className="season-stat-strip" aria-label={`Основные показатели сезона ${selectedSeason}`}>
          <div><strong>{circuits.length}</strong><span>этапов</span></div>
          <div><strong>{new Set(circuits.map((circuit) => circuit.country)).size}</strong><span>стран</span></div>
          <div><strong>{driverStandings.length}</strong><span>пилотов</span></div>
          <div><strong>{constructorStandings.length}</strong><span>команд</span></div>
        </div>

        <div className="standings-grid">
          <article className="standings-panel">
            <div className="standings-title">
              <span>Личный зачёт</span>
              <small>{driverStandings.length} пилотов</small>
            </div>
            <ol>
              {driverStandings.map((standing) => (
                <li
                  key={standing.id}
                  className={`standing-rank standing-rank--${standing.position <= 3 ? standing.position : 'regular'}`}
                  style={{ '--team-color': standing.teamColor } as CSSProperties}
                >
                  <span className="standing-position">{String(standing.position).padStart(2, '0')}</span>
                  {standing.position <= 3 && <span className="standing-trophy" aria-label={`${standing.position} место`}>🏆</span>}
                  <span className="driver-code">{standing.code}</span>
                  <span className="standing-name">
                    <strong>{standing.name}</strong>
                    <small>{standing.teamName}</small>
                  </span>
                  <span className="standing-points"><strong>{standing.points}</strong><small>очков</small></span>
                </li>
              ))}
              {driverStandings.length === 0 && <li className="standings-empty">Данные личного зачёта пока отсутствуют.</li>}
            </ol>
          </article>

          <article className="standings-panel standings-panel--teams">
            <div className="standings-title">
              <span>Кубок конструкторов</span>
              <small>{constructorStandings.length} команд</small>
            </div>
            <ol>
              {constructorStandings.map((standing) => (
                <li
                  key={standing.id}
                  className={`standing-rank standing-rank--${standing.position <= 3 ? standing.position : 'regular'}`}
                  style={{ '--team-color': standing.teamColor } as CSSProperties}
                >
                  <span className="standing-position">{String(standing.position).padStart(2, '0')}</span>
                  {standing.position <= 3 && <span className="standing-trophy" aria-label={`${standing.position} место`}>🏆</span>}
                  <span className="standing-name">
                    <strong>{standing.name}</strong>
                    <small>{standing.officialName}</small>
                  </span>
                  <span className="team-car-mark" aria-hidden="true"><i /><i /></span>
                  <span className="standing-points"><strong>{standing.points}</strong><small>очков</small></span>
                </li>
              ))}
              {constructorStandings.length === 0 && <li className="standings-empty">Кубок конструкторов в этом сезоне ещё не проводился.</li>}
            </ol>
          </article>
        </div>
      </section>
    </main>
  );
}
