'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { GeoJSONSource, MapMouseEvent } from 'maplibre-gl';
import type { FeatureCollection } from 'geojson';
import { previewFirstTrackSector, segmentTrackIntoSectors, snapToCenterline, type TrackCoordinate } from './sector-segmentation';
import { useUnifiedTrackAnnotationMap } from './unified-track-annotation-map';

type Centerline = { type: 'LineString'; coordinates: number[][] };
const empty = { type: 'FeatureCollection' as const, features: [] };
const anchorLabels = ['Старт/финиш · начало S1', 'Конец S1 · начало S2', 'Конец S2 · начало S3'];
function parseCoordinate(value: string): TrackCoordinate | null {
  const tokens = value.trim().split(/[,;\s]+/);
  if (tokens.some(token => !token)) return null;
  const parts = tokens.map(Number);
  return parts.length === 2 && parts.every(Number.isFinite) && Math.abs(parts[0]) <= 180 && Math.abs(parts[1]) <= 90
    ? [parts[0], parts[1]] : null;
}

export function SectorSegmentationEditor({ centerline }: { centerline: Centerline }) {
  const { map, activeTool, setActiveTool, setSectorReady, setSectorStartPoint } = useUnifiedTrackAnnotationMap();
  const previewDataRef = useRef<FeatureCollection>(empty);
  const [anchorText, setAnchorText] = useState(['', '', '']);
  const anchors = useMemo(() => anchorText.map(parseCoordinate), [anchorText]);
  const targetIndex = activeTool?.startsWith('sector:') ? Number(activeTool.slice(7)) : null;
  const targetRef = useRef<number | null>(targetIndex);
  const [highlightedSector, setHighlightedSector] = useState(1);
  const highlightedSectorRef = useRef(1);
  const firstSector = useMemo(() => {
    if (!anchors[0] || !anchors[1]) return { line: null, error: '' };
    try { return { line: previewFirstTrackSector(centerline.coordinates, anchors[0], anchors[1]), error: '' }; }
    catch (error) { return { line: null, error: error instanceof Error ? error.message : 'Не удалось построить S1' }; }
  }, [anchors, centerline.coordinates]);
  const result = useMemo(() => {
    if (anchors.some(value => value === null)) return { sectors: null, error: '' };
    try { return { sectors: segmentTrackIntoSectors(centerline.coordinates, anchors[0]!, anchors[1]!, anchors[2]!), error: '' }; }
    catch (error) { return { sectors: null, error: error instanceof Error ? error.message : 'Не удалось разделить трассу' }; }
  }, [anchors, centerline.coordinates]);

  useEffect(() => { queueMicrotask(() => setSectorReady(Boolean(result.sectors))); }, [result.sectors, setSectorReady]);
  useEffect(() => { queueMicrotask(() => setSectorStartPoint(anchors[0] ?? null)); }, [anchors, setSectorStartPoint]);

  useEffect(() => { targetRef.current = targetIndex; }, [targetIndex]);
  useEffect(() => {
    if (!map) return;
    map.addSource('sector-preview', { type: 'geojson', data: previewDataRef.current });
    map.addLayer({ id: 'sector-preview-lines', type: 'line', source: 'sector-preview', filter: ['==', ['geometry-type'], 'LineString'],
      paint: { 'line-color': ['match', ['get', 'sequence'], 1, '#ff344c', 2, '#32c8e6', 3, '#f2c94c', '#fff'], 'line-width': ['case', ['==', ['get', 'sequence'], highlightedSectorRef.current], 11, 8] } });
    if (map.getLayer('editor-start-finish')) map.moveLayer('editor-start-finish');
    const handleClick = (event: MapMouseEvent) => {
      const index = targetRef.current;
      if (index === null) return;
      const snapped = snapToCenterline(centerline.coordinates as TrackCoordinate[], [event.lngLat.lng, event.lngLat.lat]);
      setAnchorText(current => { const next = [...current]; next[index] = `${snapped.point[0]}, ${snapped.point[1]}`; if (index < 2) next.fill('', index + 1); return next; });
      setActiveTool(index === 0 ? 'sector:1' : null);
    };
    map.on('click', handleClick);
    return () => {
      map.off('click', handleClick);
      if (map.getLayer('sector-preview-lines')) map.removeLayer('sector-preview-lines');
      if (map.getSource('sector-preview')) map.removeSource('sector-preview');
    };
  }, [centerline.coordinates, map, setActiveTool]);

  useEffect(() => {
    const lines = result.sectors ?? (firstSector.line ? [firstSector.line] : []);
    const features = [
      ...lines.map((coordinates, index) => ({ type: 'Feature' as const, properties: { sequence: index + 1 }, geometry: { type: 'LineString' as const, coordinates } })),
    ];
    previewDataRef.current = { type: 'FeatureCollection', features };
    const source = map?.getSource('sector-preview') as GeoJSONSource | undefined;
    source?.setData(previewDataRef.current);
  }, [anchors, firstSector.line, map, result.sectors]);

  useEffect(() => {
    highlightedSectorRef.current = highlightedSector;
    if (map?.getLayer('sector-preview-lines')) map.setPaintProperty('sector-preview-lines', 'line-width', ['case', ['==', ['get', 'sequence'], highlightedSector], 11, 8]);
  }, [highlightedSector, map]);

  return <section className="admin-track-annotation-editor is-controls-only">
    <input type="hidden" name="boundariesJson" value={result.sectors ? JSON.stringify(anchors) : ''} />
    <aside>
      <p>Контур уже загружен. Нажмите «1 сектор» и отметьте начало и конец. Для S2 отметьте только конец: его начало совпадёт с концом S1. S3 замкнётся автоматически. Цветные линии — предварительный результат, положение сверьте со схемой источника</p>
      <div className="admin-track-digitizer-actions" role="group" aria-label="Выбор сектора">
        <button type="button" className={targetIndex === 0 || targetIndex === 1 ? 'is-active' : ''} onClick={() => { setAnchorText(['', '', '']); setHighlightedSector(1); setActiveTool('sector:0'); }}>1 сектор · 2 точки</button>
        <button type="button" disabled={!firstSector.line} className={targetIndex === 2 ? 'is-active' : ''} onClick={() => { setHighlightedSector(2); setActiveTool('sector:2'); }}>2 сектор · конец</button>
        <button type="button" disabled={!result.sectors} className={highlightedSector === 3 ? 'is-active' : ''} onClick={() => { setHighlightedSector(3); setActiveTool(null); }}>3 сектор · автоматически</button>
      </div>
      <p>{targetIndex === 0 ? 'Укажите на контуре начало S1 — линию старта/финиша' : targetIndex === 1 ? 'Укажите конец S1; цветной участок появится сразу' : targetIndex === 2 ? 'Укажите конец S2; S2 и S3 появятся одновременно' : 'Выберите этап или исправьте отдельную границу ниже'}</p>
      {anchorLabels.map((label,index)=><div className="admin-track-anchor-row" key={label}><label><span>{label} · долгота, широта</span><input type="text" inputMode="decimal" value={anchorText[index]} placeholder="5.97, 50.43" onChange={event=>setAnchorText(current=>current.map((value,item)=>item===index?event.target.value:value))}/></label><button type="button" className={targetIndex === index ? 'is-active' : ''} onClick={() => setActiveTool(`sector:${index}`)}>Поправить на карте</button></div>)}
      <div className="admin-track-digitizer-actions"><button type="button" disabled={anchorText.every(value=>!value)} onClick={() => { setAnchorText(current=>{const next=[...current],index=next.findLastIndex(Boolean);if(index>=0)next[index]='';return next;}); setActiveTool(null); }}>Отменить точку</button><button type="button" disabled={anchorText.every(value=>!value)} onClick={() => { setAnchorText(['','','']); setActiveTool(null); }}>Очистить</button><button type="button" disabled={targetIndex === null} onClick={() => setActiveTool(null)}>Прекратить выбор</button></div>
      <output>{result.sectors ? 'Три сектора готовы к сохранению' : firstSector.line ? 'S1 показан; укажите конец S2' : `${anchors.filter(Boolean).length} из 3 границ выбрано`}</output>
      {firstSector.error || result.error ? <p role="alert">{firstSector.error || result.error}</p> : null}
      <button type="submit" disabled={!result.sectors}>Сохранить три сектора</button>
    </aside>
  </section>;
}
