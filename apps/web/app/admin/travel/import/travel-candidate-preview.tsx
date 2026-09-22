'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import * as maplibregl from 'maplibre-gl';
import type { GeoJSONSource, Map as MapLibreMap } from 'maplibre-gl';
import type { AdminTravelImportPreview } from '../../../lib/admin-database';
import 'maplibre-gl/dist/maplibre-gl.css';
import { addAtlasMapAttribution } from '../../../lib/map-attribution';

type Candidate = AdminTravelImportPreview['candidates'][number];
const pageSize = 100;
const roleLabels: Record<string, string> = {
  transport: 'Транспорт', stay: 'Размещение', explore: 'Достопримечательности', essential: 'Полезное рядом',
};
const groupColours: Record<string, string> = {
  transport: '#58C7E8', stay: '#F2C14E', explore: '#A47CFF', essential: '#7FD98A',
};
const categoryLabels: Record<string, string> = {
  airport: 'Аэропорт', railway_station: 'Вокзал', bus_station: 'Автостанция',
  park_and_ride: 'P+R', hotel: 'Отель', hostel: 'Хостел', guest_house: 'Гостевой дом',
  apartment: 'Апартаменты', camp_site: 'Кемпинг', museum: 'Музей', viewpoint: 'Смотровая',
  attraction: 'Достопримечательность', tourist_information: 'Туристический центр',
  heritage: 'Историческое место', nature: 'Природа', hospital: 'Медицина',
  pharmacy: 'Аптека', supermarket: 'Супермаркет', restaurant: 'Ресторан или кафе',
};
const categoryGlyphs: Record<string, string> = {
  airport: '✈', railway_station: '▥', bus_station: '▣', park_and_ride: 'P↗',
  hotel: 'H', hostel: 'h', guest_house: '⌂', apartment: '▦', camp_site: '△',
  museum: 'M', viewpoint: '◉', attraction: '★', tourist_information: 'i',
  heritage: '◆', nature: '♧', hospital: '+', pharmacy: '✚', supermarket: '▤', restaurant: '●',
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

function distance(value: number) {
  return value < 1000 ? `${value} м` : `${(value / 1000).toLocaleString('ru-RU', { maximumFractionDigits: 1 })} км`;
}

function features(candidates: Candidate[], selected: Set<string>): GeoJSON.FeatureCollection<GeoJSON.Point> {
  return {
    type: 'FeatureCollection',
    features: candidates.map((candidate) => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [candidate.longitude, candidate.latitude] },
      properties: {
        id: candidate.id, role: candidate.role, category: candidate.categoryId,
        selected: selected.has(candidate.id) ? 1 : 0,
      },
    })),
  };
}

export function TravelCandidatePreview({ preview }: { preview: AdminTravelImportPreview }) {
  const [selected, setSelected] = useState(() => new Set(preview.candidates.slice(0, 80).map((candidate) => candidate.id)));
  const [role, setRole] = useState('all');
  const [category, setCategory] = useState('all');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const selectedRef = useRef(selected);
  useEffect(() => { selectedRef.current = selected; }, [selected]);
  const categories = useMemo(() => [...new Set(preview.candidates.map((candidate) => candidate.categoryId))]
    .sort((left, right) => (categoryLabels[left] ?? left).localeCompare(categoryLabels[right] ?? right, 'ru')), [preview.candidates]);
  const filtered = useMemo(() => preview.candidates.filter((candidate) => (
    (role === 'all' || candidate.role === role)
    && (category === 'all' || candidate.categoryId === category)
    && (!query.trim() || `${candidate.nameRu ?? ''} ${candidate.name}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()))
  )), [category, preview.candidates, query, role]);
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const visible = filtered.slice((Math.min(page, totalPages) - 1) * pageSize, Math.min(page, totalPages) * pageSize);
  const focused = preview.candidates.find((candidate) => candidate.id === focusedId) ?? null;
  useEffect(() => { queueMicrotask(() => setPage(1)); }, [category, query, role]);
  useEffect(() => {
    if (!mapContainerRef.current) return undefined;
    const map = new maplibregl.Map({
      container: mapContainerRef.current, style: mapStyle,
      center: [preview.circuit.longitude, preview.circuit.latitude], zoom: 8,
      minZoom: 3, maxZoom: 18, renderWorldCopies: false, attributionControl: false,
    });
    mapRef.current = map;
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
    addAtlasMapAttribution(map);
    map.on('load', () => {
      map.addSource('travel-candidates', { type: 'geojson', data: features(preview.candidates, selectedRef.current), cluster: true, clusterRadius: 36, clusterMaxZoom: 11 });
      map.addLayer({ id: 'candidate-clusters', type: 'circle', source: 'travel-candidates', filter: ['has', 'point_count'], paint: {
        'circle-color': '#142733', 'circle-radius': ['step', ['get', 'point_count'], 17, 20, 22, 80, 28],
        'circle-stroke-color': '#ff3158', 'circle-stroke-width': 2,
      } });
      map.addLayer({ id: 'candidate-points', type: 'circle', source: 'travel-candidates', filter: ['!', ['has', 'point_count']], paint: {
        'circle-color': ['match', ['get', 'role'], 'transport', groupColours.transport, 'stay', groupColours.stay, 'explore', groupColours.explore, groupColours.essential],
        'circle-radius': ['case', ['==', ['get', 'selected'], 1], 8, 6],
        'circle-stroke-color': ['case', ['==', ['get', 'selected'], 1], '#ffffff', '#07131b'],
        'circle-stroke-width': ['case', ['==', ['get', 'selected'], 1], 2.5, 1],
      } });
      map.addSource('preview-circuit', { type: 'geojson', data: { type: 'Point', coordinates: [preview.circuit.longitude, preview.circuit.latitude] } });
      map.addLayer({ id: 'circuit-point', type: 'circle', source: 'preview-circuit', paint: {
        'circle-color': '#ff183f', 'circle-radius': 9, 'circle-stroke-color': '#fff', 'circle-stroke-width': 2,
      } });
    });
    map.on('click', 'candidate-points', (event) => {
      const id = String(event.features?.[0]?.properties?.id ?? '');
      if (!id) return;
      setFocusedId(id);
      setSelected((current) => {
        const next = new Set(current);
        if (next.has(id)) next.delete(id); else next.add(id);
        return next;
      });
    });
    map.on('click', 'candidate-clusters', async (event) => {
      const feature = event.features?.[0];
      if (!feature || feature.geometry.type !== 'Point') return;
      const source = map.getSource('travel-candidates') as GeoJSONSource;
      const zoom = await source.getClusterExpansionZoom(Number(feature.properties?.cluster_id));
      map.easeTo({ center: feature.geometry.coordinates as [number, number], zoom });
    });
    return () => { map.remove(); mapRef.current = null; };
  }, [preview.candidates, preview.circuit.latitude, preview.circuit.longitude]);
  useEffect(() => {
    const source = mapRef.current?.getSource('travel-candidates') as GeoJSONSource | undefined;
    source?.setData(features(filtered, selected));
  }, [filtered, selected]);
  const toggle = (id: string) => setSelected((current) => {
    const next = new Set(current);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const selectFiltered = () => setSelected((current) => new Set([...current, ...filtered.map((candidate) => candidate.id)]));
  const clearFiltered = () => setSelected((current) => {
    const next = new Set(current);
    for (const candidate of filtered) next.delete(candidate.id);
    return next;
  });
  return <>
    {[...selected].map((id) => <input key={id} type="hidden" name="candidate" value={id} />)}
    <section className="admin-travel-preview-controls">
      <label><span>Группа</span><select value={role} onChange={(event) => setRole(event.target.value)}><option value="all">Все группы</option>{Object.entries(roleLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      <label><span>Категория</span><select value={category} onChange={(event) => setCategory(event.target.value)}><option value="all">Все категории</option>{categories.map((value) => <option key={value} value={value}>{categoryLabels[value] ?? value}</option>)}</select></label>
      <label className="is-wide"><span>Название</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Фильтр по названию…" /></label>
      <div><button type="button" onClick={selectFiltered}>Выбрать найденные</button><button type="button" onClick={clearFiltered}>Снять найденные</button></div>
    </section>
    <section className="admin-travel-preview-map"><div ref={mapContainerRef} /><aside>{focused ? <><span>{categoryGlyphs[focused.categoryId] ?? '•'} {categoryLabels[focused.categoryId] ?? focused.categoryId}</span><strong>{focused.nameRu ?? focused.name}</strong>{focused.nameRu && focused.nameRu !== focused.name ? <small>Оригинал: <bdi>{focused.name}</bdi></small> : null}<p>{distance(focused.distanceToCircuitM)} от трассы · рейтинг {focused.importance}/100</p>{focused.websiteUrl ? <a href={focused.websiteUrl} target="_blank" rel="noreferrer">Открыть сайт ↗</a> : <small>Сайт не указан</small>}<button type="button" onClick={() => toggle(focused.id)}>{selected.has(focused.id) ? 'Убрать из импорта' : 'Добавить в импорт'}</button></> : <p>Нажмите на точку, чтобы увидеть краткую карточку и изменить выбор</p>}</aside></section>
    <div className="admin-travel-preview-count"><strong>{filtered.length}</strong> найдено по фильтрам · <strong>{selected.size}</strong> выбрано для импорта</div>
    <div className="admin-table-wrap"><table><thead><tr><th>Добавить</th><th>Объект</th><th>Категория</th><th>Расстояние</th><th>Рейтинг</th><th>Данные источника</th></tr></thead><tbody>{visible.map((candidate) => <tr key={candidate.id} className={focusedId === candidate.id ? 'is-focused' : undefined}>
      <td><input type="checkbox" checked={selected.has(candidate.id)} onChange={() => toggle(candidate.id)} aria-label={`Добавить ${candidate.name}`} /></td>
      <td><button className="admin-travel-focus" type="button" onClick={() => { setFocusedId(candidate.id); mapRef.current?.easeTo({ center: [candidate.longitude, candidate.latitude], zoom: 14 }); }}><strong>{candidate.nameRu ?? candidate.name}</strong>{candidate.nameRu && candidate.nameRu !== candidate.name ? <small>Оригинал: <bdi>{candidate.name}</bdi></small> : null}<small><code>{candidate.id}</code></small></button></td>
      <td><span className="admin-travel-category-glyph" style={{ borderColor: groupColours[candidate.role], color: groupColours[candidate.role] }}>{categoryGlyphs[candidate.categoryId] ?? '•'}</span>{categoryLabels[candidate.categoryId] ?? candidate.categoryId}<small>{roleLabels[candidate.role] ?? candidate.role}</small></td>
      <td>{distance(candidate.distanceToCircuitM)}</td><td>{candidate.importance}/100</td>
      <td>{candidate.websiteUrl ? <a href={candidate.websiteUrl} target="_blank" rel="noreferrer">Сайт ↗</a> : 'Без сайта'}<small>{candidate.openingHours ?? candidate.address ?? 'Требует дополнения'}</small></td>
    </tr>)}</tbody></table></div>
    {totalPages > 1 ? <div className="admin-travel-client-pagination"><button type="button" onClick={() => setPage((value) => Math.max(1, value - 1))} disabled={page <= 1}>← Предыдущая</button><span>Страница {Math.min(page, totalPages)} из {totalPages}</span><button type="button" onClick={() => setPage((value) => Math.min(totalPages, value + 1))} disabled={page >= totalPages}>Следующая →</button></div> : null}
  </>;
}
