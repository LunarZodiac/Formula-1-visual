'use client';

import { useEffect, useRef } from 'react';
import * as maplibregl from 'maplibre-gl';
import type { GeoJSONSource, Map as MapLibreMap } from 'maplibre-gl';
import type { AdminTravelPointRegistry } from '../../../lib/admin-database';
import 'maplibre-gl/dist/maplibre-gl.css';
import { addAtlasMapAttribution } from '../../../lib/map-attribution';

type MapPoint = AdminTravelPointRegistry['mapPoints'][number];

const roleColours: Record<string, string> = { transport: '#58C7E8', stay: '#F2C14E', explore: '#A47CFF', essential: '#7FD98A', circuit: '#FF3158' };
const iconGlyphs: Record<string, string> = {
  airport: '✈', train: '▥', bus: 'B', transport: 'T', shuttle: 'S', 'park-and-ride': 'P', parking: 'P', taxi: 'T', car: 'C',
  hotel: 'H', hostel: 'h', 'guest-house': '⌂', apartment: 'A', camping: '△', helmet: 'M', museum: 'M', landmark: '◆', architecture: 'A', nature: 'N', viewpoint: '◉', family: 'F',
  restaurant: 'R', cafe: 'C', supermarket: 'S', pharmacy: '+', hospital: '+', information: 'i', gate: 'G', grandstand: 'G', flag: 'F',
};
const mapStyle: maplibregl.StyleSpecification = {
  version: 8,
  sources: { streets: { type: 'vector', url: 'https://tiles.openfreemap.org/planet', attribution: '&copy; OpenStreetMap contributors &copy; OpenFreeMap' } },
  layers: [
    { id: 'background', type: 'background', paint: { 'background-color': '#0c1b24' } },
    { id: 'land', type: 'fill', source: 'streets', 'source-layer': 'landcover', paint: { 'fill-color': '#132a31', 'fill-opacity': .96 } },
    { id: 'water', type: 'fill', source: 'streets', 'source-layer': 'water', paint: { 'fill-color': '#02090e' } },
    { id: 'roads', type: 'line', source: 'streets', 'source-layer': 'transportation', paint: { 'line-color': '#718690', 'line-width': ['interpolate', ['linear'], ['zoom'], 5, .25, 14, 2], 'line-opacity': .35 } },
  ],
};

function pointCollection(points: MapPoint[]): GeoJSON.FeatureCollection<GeoJSON.Point> {
  return { type: 'FeatureCollection', features: points.map((point) => ({
    type: 'Feature', geometry: { type: 'Point', coordinates: [point.longitude, point.latitude] },
    properties: {
      ...point,
      colour: roleColours[point.role] ?? '#9fb1bd',
      glyph: iconGlyphs[point.categoryIcon] ?? point.categoryIcon.slice(0, 1).toUpperCase(),
      iconKey: point.categoryIcon.startsWith('/') ? `category-${point.categoryId}` : '',
      customIconUrl: point.categoryIcon.startsWith('/') ? point.categoryIcon : '',
    },
  })) };
}

function loadImage(url: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const element = new Image();
    element.onload = () => resolve(element);
    element.onerror = () => reject(new Error(`Не удалось загрузить значок ${url}`));
    element.src = url;
  });
}

function formatDistance(value: number) {
  return value < 1000 ? `${value.toLocaleString('ru-RU')} м` : `${(value / 1000).toLocaleString('ru-RU', { maximumFractionDigits: 1 })} км`;
}

export function TravelPointsMap({ circuit, mapPoints }: Pick<AdminTravelPointRegistry, 'circuit' | 'mapPoints'>) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  useEffect(() => {
    if (!containerRef.current) return undefined;
    const map = new maplibregl.Map({ container: containerRef.current, style: mapStyle, center: [circuit.longitude, circuit.latitude], zoom: 8, minZoom: 2, maxZoom: 18, renderWorldCopies: false, attributionControl: false });
    mapRef.current = map;
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
    addAtlasMapAttribution(map);
    map.on('load', async () => {
      map.addSource('travel-points', { type: 'geojson', data: pointCollection(mapPoints), cluster: true, clusterRadius: 38, clusterMaxZoom: 12 });
      const customIcons = new Map(mapPoints
        .filter((point) => point.categoryIcon.startsWith('/'))
        .map((point) => [`category-${point.categoryId}`, point.categoryIcon]));
      await Promise.all([...customIcons].map(async ([key, url]) => {
        try {
          const element = await loadImage(url);
          if (!map.hasImage(key)) map.addImage(key, element, { pixelRatio: 2 });
        } catch (error) { console.warn(error); }
      }));
      map.addLayer({ id: 'travel-point-clusters', type: 'circle', source: 'travel-points', filter: ['has', 'point_count'], paint: { 'circle-color': '#142733', 'circle-radius': ['step', ['get', 'point_count'], 17, 20, 22, 100, 28], 'circle-stroke-color': '#ff3158', 'circle-stroke-width': 2 } });
      map.addLayer({ id: 'travel-point-cluster-count', type: 'symbol', source: 'travel-points', filter: ['has', 'point_count'], layout: { 'text-field': ['get', 'point_count_abbreviated'], 'text-size': 11 }, paint: { 'text-color': '#fff' } });
      map.addLayer({ id: 'travel-point-dots', type: 'circle', source: 'travel-points', filter: ['!', ['has', 'point_count']], paint: { 'circle-color': ['get', 'colour'], 'circle-radius': 9, 'circle-stroke-color': '#07131b', 'circle-stroke-width': 1.5 } });
      map.addLayer({ id: 'travel-point-glyphs', type: 'symbol', source: 'travel-points', filter: ['all', ['!', ['has', 'point_count']], ['==', ['get', 'iconKey'], '']], layout: { 'text-field': ['get', 'glyph'], 'text-size': 10, 'text-allow-overlap': true }, paint: { 'text-color': '#061018' } });
      map.addLayer({ id: 'travel-point-custom-icons', type: 'symbol', source: 'travel-points', filter: ['all', ['!', ['has', 'point_count']], ['!=', ['get', 'iconKey'], '']], layout: { 'icon-image': ['get', 'iconKey'], 'icon-size': .55, 'icon-allow-overlap': true } });
      map.addSource('travel-circuit', { type: 'geojson', data: { type: 'Point', coordinates: [circuit.longitude, circuit.latitude] } });
      map.addLayer({ id: 'travel-circuit-point', type: 'circle', source: 'travel-circuit', paint: { 'circle-color': '#ff183f', 'circle-radius': 10, 'circle-stroke-color': '#fff', 'circle-stroke-width': 2 } });
      if (mapPoints.length) {
        const bounds = new maplibregl.LngLatBounds([circuit.longitude, circuit.latitude], [circuit.longitude, circuit.latitude]);
        mapPoints.forEach((point) => bounds.extend([point.longitude, point.latitude]));
        map.fitBounds(bounds, { padding: 45, maxZoom: 13, duration: 0 });
      }
    });
    map.on('click', 'travel-point-clusters', async (event) => {
      const feature = event.features?.[0]; if (!feature || feature.geometry.type !== 'Point') return;
      const source = map.getSource('travel-points') as GeoJSONSource;
      map.easeTo({ center: feature.geometry.coordinates as [number, number], zoom: await source.getClusterExpansionZoom(Number(feature.properties?.cluster_id)) });
    });
    map.on('click', 'travel-point-dots', (event) => {
      const feature = event.features?.[0]; if (!feature || feature.geometry.type !== 'Point') return;
      const content = document.createElement('div'); content.className = 'poi-popup-content';
      const kind = document.createElement('span'); kind.textContent = String(feature.properties?.categoryId ?? 'Точка');
      const name = document.createElement('strong'); name.textContent = String(feature.properties?.nameRu || 'Перевод не заполнен');
      const original = document.createElement('small'); original.textContent = `Оригинал: ${String(feature.properties?.originalName ?? feature.properties?.name ?? '—')}`;
      const detail = document.createElement('p'); detail.textContent = `${formatDistance(Number(feature.properties?.distanceToCircuitM ?? 0))} от трассы · ${String(feature.properties?.reviewStatus ?? '')}`;
      const link = document.createElement('a'); link.href = `/admin/travel/${encodeURIComponent(circuit.id)}/points/${encodeURIComponent(String(feature.properties?.id ?? ''))}`; link.textContent = 'Редактировать →';
      content.append(kind, name, original, detail, link);
      new maplibregl.Popup({ offset: 14, className: 'atlas-poi-popup' }).setLngLat(feature.geometry.coordinates as [number, number]).setDOMContent(content).addTo(map);
    });
    ['travel-point-clusters', 'travel-point-dots'].forEach((layer) => { map.on('mouseenter', layer, () => { map.getCanvas().style.cursor = 'pointer'; }); map.on('mouseleave', layer, () => { map.getCanvas().style.cursor = ''; }); });
    return () => { map.remove(); mapRef.current = null; };
  }, [circuit.id, circuit.latitude, circuit.longitude, mapPoints]);
  return <section className="admin-travel-points-map" aria-label={`Все найденные точки трассы ${circuit.name}`}><header><strong>{mapPoints.length.toLocaleString('ru-RU')} точек на карте</strong><span>Карта учитывает те же фильтры, что и таблица</span></header><div ref={containerRef} /></section>;
}
