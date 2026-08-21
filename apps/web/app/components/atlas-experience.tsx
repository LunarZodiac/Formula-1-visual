'use client';

import * as maplibregl from 'maplibre-gl';
import type { Map as MapLibreMap } from 'maplibre-gl';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import 'maplibre-gl/dist/maplibre-gl.css';

type Circuit = {
  id: string;
  order: number;
  name: string;
  officialName: string;
  city: string;
  country: string;
  date: string;
  type: string;
  coordinates: [number, number];
};

const circuits: Circuit[] = [
  {
    id: 'bahrain', order: 1, name: 'Бахрейн',
    officialName: 'Bahrain International Circuit', city: 'Сахир',
    country: 'Бахрейн', date: '2 марта', type: 'Стационарная трасса',
    coordinates: [50.5106, 26.0325],
  },
  {
    id: 'jeddah', order: 2, name: 'Джидда',
    officialName: 'Jeddah Corniche Circuit', city: 'Джидда',
    country: 'Саудовская Аравия', date: '9 марта', type: 'Городская трасса',
    coordinates: [39.1044, 21.6319],
  },
  {
    id: 'albert-park', order: 3, name: 'Альберт-Парк',
    officialName: 'Albert Park Grand Prix Circuit', city: 'Мельбурн',
    country: 'Австралия', date: '24 марта', type: 'Смешанная трасса',
    coordinates: [144.968, -37.8497],
  },
  {
    id: 'suzuka', order: 4, name: 'Сузука',
    officialName: 'Suzuka International Racing Course', city: 'Сузука',
    country: 'Япония', date: '7 апреля', type: 'Стационарная трасса',
    coordinates: [136.541, 34.8431],
  },
  {
    id: 'shanghai', order: 5, name: 'Шанхай',
    officialName: 'Shanghai International Circuit', city: 'Шанхай',
    country: 'Китай', date: '21 апреля', type: 'Стационарная трасса',
    coordinates: [121.22, 31.3389],
  },
  {
    id: 'miami', order: 6, name: 'Майами',
    officialName: 'Miami International Autodrome', city: 'Майами',
    country: 'США', date: '5 мая', type: 'Смешанная трасса',
    coordinates: [-80.2389, 25.9581],
  },
];

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
  },
  layers: [
    { id: 'space', type: 'background', paint: { 'background-color': '#02070d' } },
    {
      id: 'earth', type: 'raster', source: 'carto',
      paint: {
        'raster-opacity': 0.92, 'raster-saturation': -0.2,
        'raster-contrast': 0.18, 'raster-brightness-max': 0.82,
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

const circuitGeoJson: GeoJSON.FeatureCollection<GeoJSON.Point> = {
  type: 'FeatureCollection',
  features: circuits.map((circuit) => ({
    type: 'Feature',
    properties: { id: circuit.id, order: circuit.order, name: circuit.name },
    geometry: { type: 'Point', coordinates: circuit.coordinates },
  })),
};

const routeGeoJson: GeoJSON.FeatureCollection<GeoJSON.LineString> = {
  type: 'FeatureCollection',
  features: [{
    type: 'Feature', properties: {},
    geometry: {
      type: 'LineString',
      coordinates: circuits.map((circuit) => circuit.coordinates),
    },
  }],
};

export function AtlasExperience() {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const [selectedId, setSelectedId] = useState(circuits[0].id);
  const [mapReady, setMapReady] = useState(false);

  const selectedCircuit = useMemo(
    () => circuits.find((circuit) => circuit.id === selectedId) ?? circuits[0],
    [selectedId],
  );

  const focusCircuit = useCallback((circuit: Circuit) => {
    setSelectedId(circuit.id);
    mapRef.current?.flyTo({
      center: circuit.coordinates,
      zoom: 3.4,
      duration: 1400,
      essential: true,
    });
  }, []);

  const resetGlobe = useCallback(() => {
    mapRef.current?.flyTo({
      center: [70, 18], zoom: 1.25, duration: 1400, essential: true,
    });
  }, []);

  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: mapContainerRef.current,
      style: mapStyle,
      center: [70, 18],
      zoom: 1.25,
      minZoom: 0.8,
      maxZoom: 8,
      attributionControl: false,
      dragRotate: true,
      pitchWithRotate: false,
    });
    mapRef.current = map;

    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'bottom-left');
    map.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-right');

    map.on('style.load', () => {
      map.setProjection({ type: 'globe' });
      map.addSource('graticule', { type: 'geojson', data: makeGraticule() });
      map.addLayer({
        id: 'graticule', type: 'line', source: 'graticule',
        paint: {
          'line-color': '#9ec8dd', 'line-width': 0.6, 'line-opacity': 0.18,
        },
      });

      map.addSource('season-route', { type: 'geojson', data: routeGeoJson });
      map.addLayer({
        id: 'season-route-glow', type: 'line', source: 'season-route',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': '#ff2038', 'line-width': 7,
          'line-opacity': 0.15, 'line-blur': 3,
        },
      });
      map.addLayer({
        id: 'season-route', type: 'line', source: 'season-route',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': '#f3f8fb', 'line-width': 1.5,
          'line-opacity': 0.8, 'line-dasharray': [1, 1.6],
        },
      });

      map.addSource('circuits', { type: 'geojson', data: circuitGeoJson });
      map.addLayer({
        id: 'circuit-pulse', type: 'circle', source: 'circuits',
        paint: {
          'circle-radius': 13, 'circle-color': '#ff2038',
          'circle-opacity': 0.2, 'circle-blur': 0.4,
        },
      });
      map.addLayer({
        id: 'circuits-hit', type: 'circle', source: 'circuits',
        paint: {
          'circle-radius': 6, 'circle-color': '#ff2038',
          'circle-stroke-color': '#f7fbff', 'circle-stroke-width': 2.5,
        },
      });
      map.addLayer({
        id: 'circuit-order', type: 'symbol', source: 'circuits',
        layout: {
          'text-field': ['to-string', ['get', 'order']],
          'text-size': 10, 'text-offset': [0, -1.7], 'text-allow-overlap': true,
        },
        paint: {
          'text-color': '#ffffff', 'text-halo-color': '#06101a',
          'text-halo-width': 1.2,
        },
      });

      map.on('mouseenter', 'circuits-hit', () => {
        map.getCanvas().style.cursor = 'pointer';
      });
      map.on('mouseleave', 'circuits-hit', () => {
        map.getCanvas().style.cursor = '';
      });
      map.on('click', 'circuits-hit', (event) => {
        const id = event.features?.[0]?.properties?.id as string | undefined;
        const circuit = circuits.find((item) => item.id === id);
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
    <main className="atlas-shell" id="top">
      <header className="topbar">
        <a className="brand" href="#top" aria-label="F1 Geovisual Atlas — главная">
          <span className="brand-mark" aria-hidden="true">F1</span>
          <span>
            <strong>Geovisual Atlas</strong>
            <small>География скорости</small>
          </span>
        </a>

        <nav className="topnav" aria-label="Основная навигация">
          <a className="is-active" href="#atlas">Атлас</a>
          <a href="#season">Сезон</a>
          <a href="#history">История</a>
          <a href="#project">О проекте</a>
        </nav>

        <div className="season-control" aria-label="Выбранный сезон">
          <span>Сезон</span>
          <select defaultValue="2024" aria-label="Сезон">
            <option value="2024">2024</option>
            <option disabled>Другие сезоны — скоро</option>
          </select>
        </div>
      </header>

      <section className="atlas-stage" id="atlas">
        <div className="map-panel">
          <div ref={mapContainerRef} className="map-canvas" aria-label="Интерактивный глобус с этапами Formula 1" />
          <div className="map-vignette" aria-hidden="true" />

          <div className="map-heading">
            <span className="eyebrow">Маршрут чемпионата</span>
            <h1>Мир как гоночная трасса</h1>
            <p>Выберите этап на глобусе или в календаре.</p>
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
            Демонстрация · первые 6 этапов сезона 2024
          </div>
        </div>

        <aside className="race-panel" id="season">
          <div className="panel-intro">
            <span className="eyebrow">Сезон 2024</span>
            <div className="panel-title-row">
              <h2>Календарный маршрут</h2>
              <span>06 этапов</span>
            </div>
          </div>

          <ol className="race-list" aria-label="Этапы демонстрационного маршрута">
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
                  <time>{circuit.date}</time>
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
              <div><dt>Дата</dt><dd>{selectedCircuit.date}</dd></div>
            </dl>
            <button type="button" disabled title="Раздел появится на следующем этапе">
              Открыть историю трассы
              <span aria-hidden="true">↗</span>
            </button>
          </article>
        </aside>
      </section>
    </main>
  );
}
