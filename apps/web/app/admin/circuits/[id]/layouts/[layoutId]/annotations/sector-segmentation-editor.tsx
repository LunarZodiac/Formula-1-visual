'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import * as maplibregl from 'maplibre-gl';
import type { GeoJSONSource, Map as MapLibreMap } from 'maplibre-gl';
import { addAtlasMapAttribution } from '../../../../../../lib/map-attribution';
import { segmentTrackIntoSectors, snapToCenterline, type TrackCoordinate } from './sector-segmentation';
import { trackAnnotationMapStyle } from './track-annotation-geometry-editor';

type Centerline = { type: 'LineString'; coordinates: number[][] };
const empty = { type: 'FeatureCollection' as const, features: [] };
const anchorLabels = ['Старт/финиш', 'Конец S1', 'Конец S2'];
function parseCoordinate(value: string): TrackCoordinate | null {
  const tokens = value.trim().split(/[,;\s]+/);
  if (tokens.some(token => !token)) return null;
  const parts = tokens.map(Number);
  return parts.length === 2 && parts.every(Number.isFinite) && Math.abs(parts[0]) <= 180 && Math.abs(parts[1]) <= 90
    ? [parts[0], parts[1]] : null;
}

export function SectorSegmentationEditor({ centerline }: { centerline: Centerline }) {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const [anchorText, setAnchorText] = useState(['', '', '']);
  const anchors = useMemo(() => anchorText.map(parseCoordinate), [anchorText]);
  const [drawing, setDrawing] = useState(false);
  const drawingRef = useRef(false);
  const result = useMemo(() => {
    if (anchors.some(value => value === null)) return { sectors: null, error: '' };
    try { return { sectors: segmentTrackIntoSectors(centerline.coordinates, anchors[0]!, anchors[1]!, anchors[2]!), error: '' }; }
    catch (error) { return { sectors: null, error: error instanceof Error ? error.message : 'Не удалось разделить трассу' }; }
  }, [anchors, centerline.coordinates]);

  useEffect(() => { drawingRef.current = drawing; mapRef.current?.getCanvas().style.setProperty('cursor', drawing ? 'crosshair' : ''); }, [drawing]);
  useEffect(() => {
    if (!container.current) return;
    const map = new maplibregl.Map({ container: container.current, style: trackAnnotationMapStyle,
      center: centerline.coordinates[0] as TrackCoordinate, zoom: 14, minZoom: 7, maxZoom: 20,
      renderWorldCopies: false, attributionControl: false });
    mapRef.current = map;
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
    addAtlasMapAttribution(map);
    map.on('load', () => {
      map.addSource('sector-centerline', { type: 'geojson', data: { type: 'Feature', properties: {}, geometry: centerline } });
      map.addLayer({ id: 'sector-centerline', type: 'line', source: 'sector-centerline', paint: { 'line-color': '#eef6f8', 'line-width': 5, 'line-opacity': 0.7 } });
      map.addSource('sector-preview', { type: 'geojson', data: empty });
      map.addLayer({ id: 'sector-preview-lines', type: 'line', source: 'sector-preview', filter: ['==', ['geometry-type'], 'LineString'],
        paint: { 'line-color': ['match', ['get', 'sequence'], 1, '#ff3158', 2, '#58c7e8', 3, '#f2c14e', '#fff'], 'line-width': 8 } });
      map.addLayer({ id: 'sector-preview-points', type: 'circle', source: 'sector-preview', filter: ['==', ['geometry-type'], 'Point'],
        paint: { 'circle-color': '#fff', 'circle-radius': 7, 'circle-stroke-color': '#ff3158', 'circle-stroke-width': 3 } });
      const bounds = new maplibregl.LngLatBounds(); centerline.coordinates.forEach(point => bounds.extend(point as TrackCoordinate));
      map.fitBounds(bounds, { padding: 55, duration: 0, maxZoom: 17 });
    });
    map.on('click', event => {
      if (!drawingRef.current) return;
      const snapped = snapToCenterline(centerline.coordinates as TrackCoordinate[], [event.lngLat.lng, event.lngLat.lat]);
      setAnchorText(current => { const next=[...current],index=next.findIndex(value=>!value);if(index<0)return [`${snapped.point[0]}, ${snapped.point[1]}`,'',''];next[index]=`${snapped.point[0]}, ${snapped.point[1]}`;return next; });
    });
    return () => { map.remove(); mapRef.current = null; };
  }, [centerline]);

  useEffect(() => {
    const source = mapRef.current?.getSource('sector-preview') as GeoJSONSource | undefined;
    if (!source) return;
    const features = result.sectors
      ? result.sectors.map((coordinates, index) => ({ type: 'Feature' as const, properties: { sequence: index + 1 }, geometry: { type: 'LineString' as const, coordinates } }))
      : anchors.flatMap((coordinates, index) => coordinates ? [{ type: 'Feature' as const, properties: { sequence: index + 1 }, geometry: { type: 'Point' as const, coordinates } }] : []);
    source.setData({ type: 'FeatureCollection', features });
  }, [anchors, result.sectors]);

  return <section className="admin-track-annotation-editor">
    <input type="hidden" name="boundariesJson" value={result.sectors ? JSON.stringify(anchors) : ''} />
    <div className="admin-track-annotation-map" ref={container} />
    <aside>
      <p>Отметьте старт/финиш, затем конец S1 и конец S2 по направлению круга. Сверьте все три положения с источником</p>
      <button type="button" className={drawing ? 'is-active' : ''} onClick={() => setDrawing(value => !value)}>{drawing ? 'Завершить выбор' : 'Выбрать три точки на карте'}</button>
      {anchorLabels.map((label,index)=><label key={label}><span>{label} · долгота, широта</span><input type="text" inputMode="decimal" value={anchorText[index]} placeholder="5.97, 50.43" onChange={event=>setAnchorText(current=>current.map((value,item)=>item===index?event.target.value:value))}/></label>)}
      <div className="admin-track-digitizer-actions"><button type="button" disabled={anchorText.every(value=>!value)} onClick={() => setAnchorText(current=>{const next=[...current],index=next.findLastIndex(Boolean);if(index>=0)next[index]='';return next;})}>Отменить точку</button><button type="button" disabled={anchorText.every(value=>!value)} onClick={() => setAnchorText(['','',''])}>Очистить</button></div>
      <output>{result.sectors ? 'Три сектора готовы к сохранению' : `${anchors.filter(Boolean).length} из 3 точек выбрано`}</output>
      {result.error ? <p role="alert">{result.error}</p> : null}
      <button type="submit" disabled={!result.sectors}>Сохранить три сектора</button>
    </aside>
  </section>;
}
