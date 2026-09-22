'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import * as maplibregl from 'maplibre-gl';
import type { Map as MapLibreMap } from 'maplibre-gl';
import { getTrackGeometry } from '../data/track-geometries';
import 'maplibre-gl/dist/maplibre-gl.css';
import { Breadcrumbs } from './breadcrumbs';
import { addAtlasMapAttribution } from '../lib/map-attribution';
import { countryFlagUrl, flagFallbackDataUrl } from './racing-visuals';
import { useTheme, type AtlasTheme } from './theme-provider';

export type CircuitCatalogItem = {
  id: string; slug: string; nameRu: string; officialName: string; cityRu: string; countryRu: string;
  countryCode: string; typeRu: string; summary: string; status: 'draft' | 'published';
  competitionStatus?: 'active' | 'historic'; firstRound: number; coordinates: [number, number];
  geometry: GeoJSON.LineString | null; layoutCount?: number; seasons?: number[];
  imageUrl?: string | null; imageAlt?: string | null;
  metrics: { length: string | null; turns: string | null; debut: string | null; record: string | null };
};

type Props = { season: number; circuits: CircuitCatalogItem[] };
type ViewMode = 'cards' | 'list' | 'map';
type SortMode = 'priority' | 'alphabet' | 'country' | 'length' | 'turns' | 'debut';
type TrackType = 'permanent' | 'street' | 'mixed';
const PAGE_SIZE = 12;
const regionByCountry: Record<string, string> = {
  ae: 'Азия', at: 'Европа', au: 'Океания', az: 'Европа', be: 'Европа', br: 'Южная Америка',
  ca: 'Северная Америка', cn: 'Азия', es: 'Европа', gb: 'Европа', hu: 'Европа', it: 'Европа',
  jp: 'Азия', mc: 'Европа', mx: 'Северная Америка', my: 'Азия', nl: 'Европа', qa: 'Азия',
  sg: 'Азия', us: 'Северная Америка',
};

const catalogMapStyle: maplibregl.StyleSpecification = {
  version: 8,
  glyphs: 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf',
  sources: { streets: { type: 'vector', url: 'https://tiles.openfreemap.org/planet', attribution: '&copy; OpenStreetMap contributors &copy; OpenFreeMap' } },
  layers: [
    { id: 'background', type: 'background', paint: { 'background-color': '#10232d' } },
    { id: 'catalog-land', type: 'fill', source: 'streets', 'source-layer': 'landcover', paint: { 'fill-color': ['match', ['get', 'class'], 'wood', '#18352f', 'grass', '#1b332d', '#142b33'], 'fill-opacity': .98 } },
    { id: 'catalog-water', type: 'fill', source: 'streets', 'source-layer': 'water', paint: { 'fill-color': '#01070c', 'fill-opacity': 1 } },
    { id: 'catalog-boundaries', type: 'line', source: 'streets', 'source-layer': 'boundary', paint: { 'line-color': '#7897a5', 'line-width': ['interpolate', ['linear'], ['zoom'], 1, .35, 7, 1], 'line-opacity': .34 } },
    { id: 'catalog-roads', type: 'line', source: 'streets', 'source-layer': 'transportation', minzoom: 4, paint: { 'line-color': '#6a7d87', 'line-width': ['interpolate', ['linear'], ['zoom'], 4, .2, 11, 1.1], 'line-opacity': .18 } },
  ],
};

function catalogMapStyleForTheme(theme: AtlasTheme): maplibregl.StyleSpecification {
  const style = structuredClone(catalogMapStyle);
  const isLight = theme === 'light';
  const setPaint = (layerId: string, property: string, value: unknown) => {
    const layer = style.layers.find((item) => item.id === layerId);
    if (layer && 'paint' in layer && layer.paint) (layer.paint as Record<string, unknown>)[property] = value;
  };

  setPaint('background', 'background-color', isLight ? '#e8efef' : '#10232d');
  setPaint('catalog-land', 'fill-color', isLight
    ? ['match', ['get', 'class'], 'wood', '#c8d8cf', 'grass', '#d8e1cf', '#dfe5df']
    : ['match', ['get', 'class'], 'wood', '#18352f', 'grass', '#1b332d', '#142b33']);
  setPaint('catalog-water', 'fill-color', isLight ? '#b9d6df' : '#01070c');
  setPaint('catalog-boundaries', 'line-color', isLight ? '#526d78' : '#7897a5');
  setPaint('catalog-boundaries', 'line-opacity', isLight ? .42 : .34);
  setPaint('catalog-roads', 'line-color', isLight ? '#6d838d' : '#6a7d87');
  setPaint('catalog-roads', 'line-opacity', isLight ? .3 : .18);
  return style;
}

function applyCatalogMapTheme(map: MapLibreMap, theme: AtlasTheme) {
  const isLight = theme === 'light';
  const paint = (layerId: string, property: string, value: unknown) => {
    if (map.getLayer(layerId)) map.setPaintProperty(layerId, property, value);
  };

  paint('background', 'background-color', isLight ? '#e8efef' : '#10232d');
  paint('catalog-land', 'fill-color', isLight
    ? ['match', ['get', 'class'], 'wood', '#c8d8cf', 'grass', '#d8e1cf', '#dfe5df']
    : ['match', ['get', 'class'], 'wood', '#18352f', 'grass', '#1b332d', '#142b33']);
  paint('catalog-water', 'fill-color', isLight ? '#b9d6df' : '#01070c');
  paint('catalog-boundaries', 'line-color', isLight ? '#526d78' : '#7897a5');
  paint('catalog-boundaries', 'line-opacity', isLight ? .42 : .34);
  paint('catalog-roads', 'line-color', isLight ? '#6d838d' : '#6a7d87');
  paint('catalog-roads', 'line-opacity', isLight ? .3 : .18);
  paint('catalog-clusters', 'circle-color', isLight ? '#f7faf8' : '#111d28');
  paint('catalog-cluster-count', 'text-color', isLight ? '#172128' : '#ffffff');
  paint('catalog-points-layer', 'circle-stroke-color', isLight ? '#f7faf8' : '#ffffff');
  paint('catalog-track-shadow', 'line-color', isLight ? '#f7faf8' : '#02070d');
  paint('catalog-track-shadow', 'line-opacity', isLight ? .82 : .9);
}

function trackTypeKey(typeRu: string): TrackType {
  const value = typeRu.toLocaleLowerCase('ru');
  if (value.includes('город')) return 'street';
  if (value.includes('смеш') || value.includes('гибрид') || value.includes('полустационар') || value.includes('врем')) return 'mixed';
  return 'permanent';
}
function trackTypeLabel(typeRu: string) { const key = trackTypeKey(typeRu); return key === 'street' ? 'Городская' : key === 'mixed' ? 'Смешанная' : 'Стационарная'; }
function metricNumber(value: string | null) { const match = value?.replace(',', '.').match(/[\d.]+/); return match ? Number(match[0]) : 0; }
function debutEra(year: number) { if (year < 1980) return '1950–1979'; if (year < 2000) return '1980–1999'; if (year < 2015) return '2000–2014'; return '2015–н.в.'; }

function CircuitFlag({ circuit }: { circuit: CircuitCatalogItem }) {
  const source = countryFlagUrl(circuit.countryCode);
  const fallback = flagFallbackDataUrl(circuit.countryCode);
  // eslint-disable-next-line @next/next/no-img-element
  return <img className="tracks-flag" src={source ?? fallback} alt="" aria-hidden="true" onError={(event) => {
    event.currentTarget.onerror = null;
    event.currentTarget.src = fallback;
  }} />;
}

function TrackShape({ geometry, compact = false }: { geometry: GeoJSON.LineString | null; compact?: boolean }) {
  if (!geometry?.coordinates.length) return <div className="tracks-shape tracks-shape--empty">Контур готовится</div>;
  // Долгота физически сжимается с широтой. Одна общая шкала для обеих осей
  // сохраняет реальные пропорции трассы и не растягивает её под рамку карточки.
  const meanLatitude = geometry.coordinates.reduce((sum, [, latitude]) => sum + latitude, 0) / geometry.coordinates.length;
  const longitudeScale = Math.cos(meanLatitude * Math.PI / 180);
  const projected = geometry.coordinates.map(([longitude, latitude]) => [longitude * longitudeScale, latitude] as const);
  const xs = projected.map(([x]) => x); const ys = projected.map(([, y]) => y);
  const minX = Math.min(...xs); const maxX = Math.max(...xs); const minY = Math.min(...ys); const maxY = Math.max(...ys);
  const width = Math.max(maxX - minX, 0.000001); const height = Math.max(maxY - minY, 0.000001);
  const availableWidth = 144; const availableHeight = 68;
  const scale = Math.min(availableWidth / width, availableHeight / height);
  const renderedWidth = width * scale; const renderedHeight = height * scale;
  const offsetX = 8 + (availableWidth - renderedWidth) / 2;
  const offsetY = 8 + (availableHeight - renderedHeight) / 2;
  const points = projected.map(([x, y]) => `${offsetX + (x - minX) * scale},${offsetY + renderedHeight - (y - minY) * scale}`).join(' ');
  return <svg className={`tracks-shape${compact ? ' tracks-shape--compact' : ''}`} viewBox="0 0 160 84" role="img" aria-label="Контур трассы"><polyline points={points} /></svg>;
}

function TracksHero() {
  return <header className="tracks-hero"><Breadcrumbs items={[{ label: 'Главная', href: '/' }, { label: 'Атлас', href: '/' }, { label: 'Каталог трасс' }]} /><div className="tracks-hero__copy"><span className="tracks-eyebrow">Атлас</span><h1>Каталог трасс</h1><p>Исследуйте легендарные гоночные трассы мира — от современных автодромов Formula 1 до исторических маршрутов, оставивших след в истории автоспорта</p></div><div className="tracks-hero-art" aria-hidden="true" /></header>;
}

type ControlsProps = {
  query: string; country: string; region: string; status: string; type: string; era: string; layouts: string; lengthBand: string; turnsBand: string; sort: SortMode; view: ViewMode;
  countries: string[]; count: number; hasFilters: boolean; setQuery: (value: string) => void; setCountry: (value: string) => void;
  setRegion: (value: string) => void; setStatus: (value: string) => void; setType: (value: string) => void; setEra: (value: string) => void;
  setLayouts: (value: string) => void; setLengthBand: (value: string) => void; setTurnsBand: (value: string) => void; setSort: (value: SortMode) => void; setView: (value: ViewMode) => void; reset: () => void;
};

function TracksControls(p: ControlsProps) {
  return <section className="tracks-controls" aria-label="Поиск и фильтры каталога"><div className="tracks-controls__filters"><div className="tracks-controls__primary"><label className="tracks-search"><span aria-hidden="true">⌕</span><input value={p.query} onChange={(event) => p.setQuery(event.target.value)} placeholder="Поиск трассы или страны" aria-label="Поиск трассы, страны или города" /></label><select value={p.country} onChange={(event) => p.setCountry(event.target.value)} aria-label="Страна"><option value="all">Страна</option>{p.countries.map((item) => <option key={item}>{item}</option>)}</select><select value={p.region} onChange={(event) => p.setRegion(event.target.value)} aria-label="Регион"><option value="all">Континент</option>{['Европа', 'Азия', 'Северная Америка', 'Южная Америка', 'Океания'].map((item) => <option key={item}>{item}</option>)}</select><select value={p.type} onChange={(event) => p.setType(event.target.value)} aria-label="Тип трассы"><option value="all">Тип трассы</option><option value="permanent">Стационарная</option><option value="street">Городская</option><option value="mixed">Смешанная</option></select><button className="tracks-reset" type="button" onClick={p.reset} disabled={!p.hasFilters}>↻ Сбросить</button></div><details className="tracks-controls__more"><summary>Фильтры</summary><div className="tracks-filter-drawer"><label><span>Регион</span><select value={p.region} onChange={(event) => p.setRegion(event.target.value)}><option value="all">Все регионы</option>{['Европа', 'Азия', 'Северная Америка', 'Южная Америка', 'Океания'].map((item) => <option key={item}>{item}</option>)}</select></label><label><span>Страна</span><select value={p.country} onChange={(event) => p.setCountry(event.target.value)}><option value="all">Все страны</option>{p.countries.map((item) => <option key={item}>{item}</option>)}</select></label><label><span>Тип трассы</span><select value={p.type} onChange={(event) => p.setType(event.target.value)}><option value="all">Все типы</option><option value="permanent">Стационарная</option><option value="street">Городская</option><option value="mixed">Смешанная</option></select></label><label><span>Статус</span><select value={p.status} onChange={(event) => p.setStatus(event.target.value)}><option value="all">Любой статус</option><option value="active">Действующие</option><option value="historic">Исторические</option></select></label><label><span>Длина</span><select value={p.lengthBand} onChange={(event) => p.setLengthBand(event.target.value)}><option value="all">Любая длина</option><option value="short">До 4 км</option><option value="medium">4–6 км</option><option value="long">Более 6 км</option></select></label><label><span>Количество поворотов</span><select value={p.turnsBand} onChange={(event) => p.setTurnsBand(event.target.value)}><option value="all">Любое количество</option><option value="few">До 14</option><option value="medium">15–18</option><option value="many">19 и более</option></select></label><label><span>Дебют</span><select value={p.era} onChange={(event) => p.setEra(event.target.value)}><option value="all">Все эпохи</option>{['1950–1979', '1980–1999', '2000–2014', '2015–н.в.'].map((item) => <option key={item}>{item}</option>)}</select></label><label><span>Конфигурации</span><select value={p.layouts} onChange={(event) => p.setLayouts(event.target.value)}><option value="all">Любое количество</option><option value="single">Одна</option><option value="multiple">Несколько</option></select></label></div></details></div><div className="tracks-controls__result"><output>Найдено трасс: <strong>{p.count}</strong></output><div className="tracks-sort"><span>Сортировка</span><select value={p.sort} onChange={(event) => p.setSort(event.target.value as SortMode)} aria-label="Сортировка"><option value="priority">По календарю</option><option value="alphabet">По алфавиту</option><option value="country">По стране</option><option value="length">По длине</option><option value="turns">По поворотам</option><option value="debut">По году дебюта</option></select></div><div className="tracks-view" aria-label="Режим отображения"><button className={p.view === 'cards' ? 'is-active' : ''} onClick={() => p.setView('cards')} aria-label="Карточки">▦</button><button className={p.view === 'list' ? 'is-active' : ''} onClick={() => p.setView('list')} aria-label="Список">☷</button><button className={p.view === 'map' ? 'is-active' : ''} onClick={() => p.setView('map')} aria-label="Карта">⌖</button></div></div></section>;
}

function CircuitMetrics({ circuit }: { circuit: CircuitCatalogItem }) { return <dl className="tracks-metrics"><div><dt>Длина</dt><dd>{circuit.metrics.length ?? '—'}</dd></div><div><dt>Повороты</dt><dd>{circuit.metrics.turns ?? '—'}</dd></div><div><dt>Рекорд круга</dt><dd>{circuit.metrics.record ?? '—'}</dd></div><div><dt>Тип</dt><dd>{trackTypeLabel(circuit.typeRu)}</dd></div></dl>; }

function CircuitCardContent({ circuit, featured = false }: { circuit: CircuitCatalogItem; featured?: boolean }) {
  return <><div className="tracks-card__placeholder" aria-hidden="true">{circuit.imageUrl ? <Image src={circuit.imageUrl} alt="" fill sizes={featured ? '(max-width: 900px) 100vw, 50vw' : '(max-width: 900px) 100vw, 25vw'} /> : null}</div><div className="tracks-card__shade" /><div className="tracks-card__heading"><h2>{circuit.nameRu}</h2><div className="tracks-card__country"><CircuitFlag circuit={circuit} /><span>{circuit.countryRu}</span>{featured && <><i>·</i><span>{circuit.cityRu}</span></>}</div></div><div className="tracks-card__opened"><span>Открыта</span><b>{circuit.metrics.debut ?? '—'}</b></div>{featured && <p className="tracks-card__summary">{circuit.summary}</p>}<TrackShape geometry={circuit.geometry} /><CircuitMetrics circuit={circuit} /></>;
}

function FeaturedTrackCard({ circuit }: { circuit: CircuitCatalogItem }) {
  const content = <CircuitCardContent circuit={circuit} featured />;
  // Все записи каталога ведут на базовый профиль: для черновиков страница
  // честно показывает, какие редакционные разделы ещё ожидают наполнения
  return <Link className="tracks-featured" data-circuit-id={circuit.id} href={`/circuits/${circuit.slug}`}>{content}</Link>;
}

function TrackCard({ circuit }: { circuit: CircuitCatalogItem }) {
  const content = <CircuitCardContent circuit={circuit} />;
  return <Link className="tracks-card" data-circuit-id={circuit.id} href={`/circuits/${circuit.slug}`}>{content}</Link>;
}

function TracksCardsView({ circuits, visibleCount, showMore }: { circuits: CircuitCatalogItem[]; visibleCount: number; showMore: () => void }) {
  const visible = circuits.slice(0, visibleCount); const [featured, ...rest] = visible;
  const loaderRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (visible.length >= circuits.length || !loaderRef.current) return undefined;
    const observer = new IntersectionObserver(([entry]) => { if (entry.isIntersecting) showMore(); }, { rootMargin: '320px 0px' });
    observer.observe(loaderRef.current);
    return () => observer.disconnect();
  }, [circuits.length, showMore, visible.length]);
  return <section className="tracks-cards"><div className="tracks-grid"><FeaturedTrackCard circuit={featured} />{rest.map((circuit) => <TrackCard key={circuit.id} circuit={circuit} />)}</div>{visible.length < circuits.length && <div ref={loaderRef} className="tracks-auto-loader" role="status" aria-live="polite"><span>Загружаем трассы</span><i aria-hidden="true" /></div>}</section>;
}

const FAVORITE_CIRCUITS_KEY = 'f1-atlas-favorite-circuits';

function TracksListView({ circuits, season }: { circuits: CircuitCatalogItem[]; season: number }) {
  const [favorites, setFavorites] = useState<Set<string>>(new Set());
  useEffect(() => {
    try {
      const stored = JSON.parse(window.localStorage.getItem(FAVORITE_CIRCUITS_KEY) ?? '[]');
      if (Array.isArray(stored)) queueMicrotask(() => setFavorites(new Set(stored.filter((item): item is string => typeof item === 'string'))));
    } catch { /* Повреждённое локальное значение не должно ломать каталог. */ }
  }, []);

  const toggleFavorite = (circuitId: string) => {
    const next = new Set(favorites);
    if (next.has(circuitId)) next.delete(circuitId); else next.add(circuitId);
    setFavorites(next);
    window.localStorage.setItem(FAVORITE_CIRCUITS_KEY, JSON.stringify([...next]));
  };

  return <section className="tracks-list" aria-label="Список трасс">{circuits.map((circuit) => {
    const favorite = favorites.has(circuit.id);
    const hasPhoto = Boolean(circuit.imageUrl);
    return <article className="tracks-list-row" data-circuit-id={circuit.id} key={circuit.id}>
      <button className={`tracks-list-favorite${favorite ? ' is-active' : ''}`} type="button" aria-label={favorite ? `Удалить ${circuit.nameRu} из избранного` : `Добавить ${circuit.nameRu} в избранное`} aria-pressed={favorite} onClick={() => toggleFavorite(circuit.id)}>{favorite ? '★' : '☆'}</button>
      <div className={`tracks-list-visual${hasPhoto ? ' has-photo' : ''}`} style={hasPhoto ? { backgroundImage: `url(${circuit.imageUrl})` } : undefined}><span>{hasPhoto ? '' : 'Фото готовится'}</span><b>{trackTypeLabel(circuit.typeRu)}</b></div>
      <div className="tracks-list-shape"><TrackShape geometry={circuit.geometry} compact /></div>
      <div className="tracks-list-copy"><h2>{circuit.nameRu}</h2><div><CircuitFlag circuit={circuit} /><span>{circuit.countryRu}</span></div><p>{circuit.summary}</p></div>
      <dl className="tracks-list-stats"><div><dt>Длина трассы</dt><dd>{circuit.metrics.length ?? '—'}</dd></div><div><dt>Повороты</dt><dd>{circuit.metrics.turns ?? '—'}</dd></div><div><dt>Рекорд круга</dt><dd>{circuit.metrics.record ?? '—'}</dd></div><div><dt>Дебют в F1</dt><dd>{circuit.metrics.debut ?? '—'}</dd></div></dl>
      <div className="tracks-list-actions"><Link className="is-primary" href={`/circuits/${circuit.slug}`}>Открыть профиль <span>→</span></Link><Link href={`/?season=${season}&circuit=${encodeURIComponent(circuit.id)}#atlas`}>⌖ На карте</Link></div>
    </article>;
  })}</section>;
}

function CircuitCatalogMap({ circuits }: { circuits: CircuitCatalogItem[] }) {
  const { theme } = useTheme();
  const containerRef = useRef<HTMLDivElement>(null); const mapRef = useRef<MapLibreMap | null>(null); const [selectedId, setSelectedId] = useState<string | null>(circuits[0]?.id ?? null); const selected = circuits.find((circuit) => circuit.id === selectedId) ?? circuits[0] ?? null;
  useEffect(() => {
    if (!containerRef.current) return undefined;
    const initialTheme = document.documentElement.dataset.theme === 'light' ? 'light' : 'dark';
    const map = new maplibregl.Map({ container: containerRef.current, style: catalogMapStyleForTheme(initialTheme), center: [12, 25], zoom: 1.75, minZoom: 1.5, maxZoom: 16, renderWorldCopies: false, attributionControl: false }); mapRef.current = map; map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'bottom-right'); addAtlasMapAttribution(map);
    map.on('load', () => {
      const points: GeoJSON.FeatureCollection<GeoJSON.Point> = { type: 'FeatureCollection', features: circuits.map((circuit) => ({ type: 'Feature', geometry: { type: 'Point', coordinates: circuit.coordinates }, properties: { id: circuit.id, type: trackTypeKey(circuit.typeRu) } })) };
      const lines: GeoJSON.FeatureCollection<GeoJSON.LineString> = { type: 'FeatureCollection', features: circuits.filter((circuit) => circuit.geometry).map((circuit) => ({ type: 'Feature', geometry: circuit.geometry!, properties: { id: circuit.id } })) };
      map.addSource('catalog-points', { type: 'geojson', data: points, cluster: true, clusterRadius: 44, clusterMaxZoom: 5 }); map.addSource('catalog-tracks', { type: 'geojson', data: lines });
      map.addLayer({ id: 'catalog-clusters', type: 'circle', source: 'catalog-points', filter: ['has', 'point_count'], paint: { 'circle-color': '#111d28', 'circle-radius': ['step', ['get', 'point_count'], 18, 5, 23, 12, 28], 'circle-stroke-color': '#ff2038', 'circle-stroke-width': 2 } });
      map.addLayer({ id: 'catalog-cluster-count', type: 'symbol', source: 'catalog-points', filter: ['has', 'point_count'], layout: { 'text-field': ['get', 'point_count_abbreviated'], 'text-font': ['Noto Sans Regular'], 'text-size': 11, 'text-allow-overlap': true }, paint: { 'text-color': '#ffffff' } });
      map.addLayer({ id: 'catalog-points-layer', type: 'circle', source: 'catalog-points', filter: ['!', ['has', 'point_count']], maxzoom: 8.5, paint: { 'circle-color': ['match', ['get', 'type'], 'street', '#f4a340', 'mixed', '#a47cff', '#ff2038'], 'circle-radius': 7, 'circle-stroke-color': '#ffffff', 'circle-stroke-width': 1.5 } });
      map.addLayer({ id: 'catalog-track-shadow', type: 'line', source: 'catalog-tracks', minzoom: 7.5, paint: { 'line-color': '#02070d', 'line-width': 8, 'line-opacity': 0.9 } }); map.addLayer({ id: 'catalog-track-lines', type: 'line', source: 'catalog-tracks', minzoom: 7.5, paint: { 'line-color': '#ff3150', 'line-width': 3 } });
      applyCatalogMapTheme(map, initialTheme);
    });
    map.on('click', 'catalog-clusters', async (event) => { const feature = map.queryRenderedFeatures(event.point, { layers: ['catalog-clusters'] })[0]; const source = map.getSource('catalog-points') as maplibregl.GeoJSONSource; const zoom = await source.getClusterExpansionZoom(Number(feature?.properties?.cluster_id)); if (feature?.geometry.type === 'Point') map.easeTo({ center: feature.geometry.coordinates as [number, number], zoom }); });
    map.on('click', 'catalog-points-layer', (event) => { const feature = event.features?.[0]; if (!feature || feature.geometry.type !== 'Point') return; setSelectedId(String(feature.properties?.id)); map.easeTo({ center: feature.geometry.coordinates as [number, number], zoom: 10, duration: 900 }); }); map.on('click', 'catalog-track-lines', (event) => { const id = event.features?.[0]?.properties?.id; if (id) setSelectedId(String(id)); });
    return () => { map.remove(); mapRef.current = null; };
  }, [circuits]);
  useEffect(() => {
    const map = mapRef.current;
    if (map?.isStyleLoaded()) applyCatalogMapTheme(map, theme);
  }, [theme]);
  const focus = (circuit: CircuitCatalogItem) => { setSelectedId(circuit.id); mapRef.current?.easeTo({ center: circuit.coordinates, zoom: 8, duration: 800 }); };
  return <section className="tracks-map"><div className="tracks-map__canvas-wrap"><div ref={containerRef} className="tracks-map__canvas" /><div className="tracks-map__legend"><span className="is-permanent" /> стационарная <span className="is-street" /> городская <span className="is-mixed" /> смешанная</div>{selected && <div className="tracks-map__popup"><TrackShape geometry={selected.geometry} compact /><div><strong>{selected.nameRu}</strong><span>{selected.countryRu} · {trackTypeLabel(selected.typeRu)}</span><Link href={`/circuits/${selected.slug}`}>Открыть профиль →</Link></div></div>}</div><aside className="tracks-map__panel"><header><span>Трассы на карте</span><b>{circuits.length}</b></header><div>{circuits.map((circuit) => <button key={circuit.id} className={selected?.id === circuit.id ? 'is-active' : ''} onClick={() => focus(circuit)}><TrackShape geometry={circuit.geometry} compact /><span><strong>{circuit.nameRu}</strong><small>{circuit.countryRu} · {trackTypeLabel(circuit.typeRu)}</small></span></button>)}</div></aside></section>;
}

function EmptyState({ reset }: { reset: () => void }) { return <section className="tracks-empty"><span>0 результатов</span><h2>Ничего не найдено</h2><p>Попробуйте изменить фильтры или очистить поисковый запрос</p><button onClick={reset}>Сбросить фильтры</button></section>; }

function CatalogSummary({ circuits }: { circuits: CircuitCatalogItem[] }) {
  const measured = circuits.filter((item) => metricNumber(item.metrics.length) > 0);
  const longest = measured.reduce<CircuitCatalogItem | null>((best, item) => !best || metricNumber(item.metrics.length) > metricNumber(best.metrics.length) ? item : best, null);
  const shortest = measured.reduce<CircuitCatalogItem | null>((best, item) => !best || metricNumber(item.metrics.length) < metricNumber(best.metrics.length) ? item : best, null);
  const average = measured.length ? measured.reduce((sum, item) => sum + metricNumber(item.metrics.length), 0) / measured.length : 0;
  return <section className="tracks-summary" aria-label="Сводка каталога"><div><span>Всего трасс</span><b>{circuits.length}</b></div><div><span>Стран</span><b>{new Set(circuits.map((item) => item.countryRu)).size}</b></div><div><span>Континентов</span><b>{new Set(circuits.map((item) => regionByCountry[item.countryCode]).filter(Boolean)).size}</b></div><div><span>Самый длинный круг</span><b>{longest?.metrics.length ?? '—'}</b><small>{longest?.nameRu ?? ''}</small></div><div><span>Самый короткий круг</span><b>{shortest?.metrics.length ?? '—'}</b><small>{shortest?.nameRu ?? ''}</small></div><div><span>Средняя длина трассы</span><b>{average ? `${average.toFixed(3).replace('.', ',')} км` : '—'}</b></div></section>;
}

export function CircuitCatalog({ season, circuits }: Props) {
  const [view, setView] = useState<ViewMode>('cards'); const [query, setQuery] = useState(''); const [country, setCountry] = useState('all'); const [region, setRegion] = useState('all'); const [status, setStatus] = useState('all'); const [type, setType] = useState('all'); const [era, setEra] = useState('all'); const [layouts, setLayouts] = useState('all'); const [lengthBand, setLengthBand] = useState('all'); const [turnsBand, setTurnsBand] = useState('all'); const [sort, setSort] = useState<SortMode>('priority'); const [visibleCount, setVisibleCount] = useState(PAGE_SIZE); const [ready, setReady] = useState(false);
  const [selectedSeason, setSelectedSeason] = useState('all');
  useEffect(() => { const params = new URLSearchParams(window.location.search); queueMicrotask(() => { const mode = params.get('view'); setView(mode === 'map' || mode === 'list' ? mode : 'cards'); setQuery(params.get('q') ?? ''); setCountry(params.get('country') ?? 'all'); setRegion(params.get('region') ?? 'all'); setStatus(params.get('status') ?? 'all'); setType(params.get('type') ?? 'all'); setEra(params.get('era') ?? 'all'); setLayouts(params.get('layouts') ?? 'all'); setLengthBand(params.get('length') ?? 'all'); setTurnsBand(params.get('turns') ?? 'all'); setSelectedSeason(params.get('season') ?? 'all'); setSort((params.get('sort') as SortMode) ?? 'priority'); setReady(true); }); }, []);
  useEffect(() => { if (!ready) return; const params = new URLSearchParams(); const values = { view, q: query, country, region, status, type, era, layouts, length: lengthBand, turns: turnsBand, season: selectedSeason, sort }; Object.entries(values).forEach(([key, value]) => { if (value && value !== 'all' && value !== 'cards' && value !== 'priority') params.set(key, value); }); window.history.replaceState(null, '', params.size ? `${window.location.pathname}?${params}` : window.location.pathname); }, [country, era, layouts, lengthBand, query, ready, region, selectedSeason, sort, status, turnsBand, type, view]);
  useEffect(() => { queueMicrotask(() => setVisibleCount(PAGE_SIZE)); }, [country, era, layouts, lengthBand, query, region, selectedSeason, sort, status, turnsBand, type]);
  const atlasCircuits = useMemo(() => circuits.map((circuit) => ({ ...circuit, geometry: getTrackGeometry(circuit.id, season)?.geometry ?? circuit.geometry })), [circuits, season]);
  const countries = useMemo(() => [...new Set(atlasCircuits.map((item) => item.countryRu))].sort((a, b) => a.localeCompare(b, 'ru')), [atlasCircuits]);
  const availableSeasons = useMemo(() => [...new Set(atlasCircuits.flatMap((item) => item.seasons ?? []))].sort((a, b) => b - a), [atlasCircuits]);
  const filtered = useMemo(() => atlasCircuits.filter((circuit) => { const haystack = `${circuit.nameRu} ${circuit.officialName} ${circuit.cityRu} ${circuit.countryRu}`.toLocaleLowerCase('ru'); const layoutCount = circuit.layoutCount ?? 1; const length = metricNumber(circuit.metrics.length); const turns = metricNumber(circuit.metrics.turns); const lengthMatch = lengthBand === 'all' || (lengthBand === 'short' && length > 0 && length < 4) || (lengthBand === 'medium' && length >= 4 && length <= 6) || (lengthBand === 'long' && length > 6); const turnsMatch = turnsBand === 'all' || (turnsBand === 'few' && turns > 0 && turns <= 14) || (turnsBand === 'medium' && turns >= 15 && turns <= 18) || (turnsBand === 'many' && turns >= 19); const seasonMatch = selectedSeason === 'all' || circuit.seasons?.includes(Number(selectedSeason)); return seasonMatch && haystack.includes(query.trim().toLocaleLowerCase('ru')) && (country === 'all' || circuit.countryRu === country) && (region === 'all' || regionByCountry[circuit.countryCode] === region) && (status === 'all' || (circuit.competitionStatus ?? 'active') === status) && (type === 'all' || trackTypeKey(circuit.typeRu) === type) && (era === 'all' || debutEra(metricNumber(circuit.metrics.debut)) === era) && (layouts === 'all' || (layouts === 'multiple' ? layoutCount > 1 : layoutCount <= 1)) && lengthMatch && turnsMatch; }).sort((left, right) => { if (sort === 'alphabet') return left.nameRu.localeCompare(right.nameRu, 'ru'); if (sort === 'country') return left.countryRu.localeCompare(right.countryRu, 'ru') || left.nameRu.localeCompare(right.nameRu, 'ru'); if (sort === 'length') return metricNumber(right.metrics.length) - metricNumber(left.metrics.length); if (sort === 'turns') return metricNumber(right.metrics.turns) - metricNumber(left.metrics.turns); if (sort === 'debut') return metricNumber(left.metrics.debut) - metricNumber(right.metrics.debut); return left.firstRound - right.firstRound; }), [atlasCircuits, country, era, layouts, lengthBand, query, region, selectedSeason, sort, status, turnsBand, type]);
  const reset = () => { setQuery(''); setCountry('all'); setRegion('all'); setStatus('all'); setType('all'); setEra('all'); setLayouts('all'); setLengthBand('all'); setTurnsBand('all'); setSelectedSeason('all'); setSort('priority'); };
  const hasFilters = Boolean(query || country !== 'all' || region !== 'all' || status !== 'all' || type !== 'all' || era !== 'all' || layouts !== 'all' || lengthBand !== 'all' || turnsBand !== 'all' || selectedSeason !== 'all' || sort !== 'priority');
  return <main className="tracks-page"><TracksHero /><section className="tracks-season-filter"><label><span>Сезон Гран-при</span><select value={selectedSeason} onChange={(event) => setSelectedSeason(event.target.value)}><option value="all">Все сезоны</option>{availableSeasons.map((item) => <option key={item} value={item}>{item}</option>)}</select></label><p>{selectedSeason === 'all' ? 'Показаны все трассы чемпионата мира' : `Трассы, принимавшие этапы в сезоне ${selectedSeason}`}</p></section><TracksControls query={query} country={country} region={region} status={status} type={type} era={era} layouts={layouts} lengthBand={lengthBand} turnsBand={turnsBand} sort={sort} view={view} countries={countries} count={filtered.length} hasFilters={hasFilters} setQuery={setQuery} setCountry={setCountry} setRegion={setRegion} setStatus={setStatus} setType={setType} setEra={setEra} setLayouts={setLayouts} setLengthBand={setLengthBand} setTurnsBand={setTurnsBand} setSort={setSort} setView={setView} reset={reset} />{filtered.length === 0 ? <EmptyState reset={reset} /> : view === 'cards' ? <TracksCardsView circuits={filtered} visibleCount={visibleCount} showMore={() => setVisibleCount((value) => value + PAGE_SIZE)} /> : view === 'list' ? <TracksListView circuits={filtered} season={selectedSeason === 'all' ? season : Number(selectedSeason)} /> : <CircuitCatalogMap circuits={filtered} />}<CatalogSummary circuits={atlasCircuits} /></main>;
}
