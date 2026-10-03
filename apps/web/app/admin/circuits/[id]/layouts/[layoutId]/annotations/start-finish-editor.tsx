'use client';

import { useEffect, useRef, useState } from 'react';
import type { GeoJSONSource, MapLayerMouseEvent, MapLayerTouchEvent, MapMouseEvent, MapTouchEvent } from 'maplibre-gl';
import type { AdminTrackAnnotation } from '../../../../../../lib/admin-database';
import { useUnifiedTrackAnnotationMap, type TrackCenterline } from './unified-track-annotation-map';

function snapToLine(line: number[][], candidate: number[]): number[] {
  const latitudeScale = Math.cos(candidate[1] * Math.PI / 180);
  let closest = line[0] ?? candidate;
  let bestDistance = Infinity;
  for (let index = 0; index < line.length - 1; index++) {
    const start = line[index], end = line[index + 1];
    const dx = (end[0] - start[0]) * latitudeScale, dy = end[1] - start[1];
    const length = dx * dx + dy * dy;
    const ratio = length ? Math.max(0, Math.min(1, (((candidate[0] - start[0]) * latitudeScale) * dx + (candidate[1] - start[1]) * dy) / length)) : 0;
    const point = [start[0] + (end[0] - start[0]) * ratio, start[1] + (end[1] - start[1]) * ratio];
    const distance = ((candidate[0] - point[0]) * latitudeScale) ** 2 + (candidate[1] - point[1]) ** 2;
    if (distance < bestDistance) { bestDistance = distance; closest = point; }
  }
  return closest.map(value => Number(value.toFixed(7)));
}

export function StartFinishEditor({ centerline, autoPoint, manual, circuitId, layoutId, validFromYear, validToYear, action }: {
  centerline: TrackCenterline;
  autoPoint: number[];
  manual: AdminTrackAnnotation | null;
  circuitId: string;
  layoutId: string;
  validFromYear: number | null;
  validToYear: number | null;
  action: (formData: FormData) => void | Promise<void>;
}) {
  const { map, activeTool, setActiveTool, sectorStartPoint } = useUnifiedTrackAnnotationMap();
  const [point, setPoint] = useState(() => manual?.geometryGeoJson.type === 'Point' ? manual.geometryGeoJson.coordinates : autoPoint);
  const [isManual, setIsManual] = useState(Boolean(manual));
  const dragging = useRef(false);
  const dragPanWasEnabled = useRef(false);
  const suppressClickUntil = useRef(0);
  const currentAuto = sectorStartPoint ?? autoPoint;
  const [autoLongitude, autoLatitude] = currentAuto;
  const reviewStatus = manual?.reviewStatus ?? 'candidate';
  const requiresSourceConfirmation = reviewStatus === 'reviewed' || reviewStatus === 'published';

  useEffect(() => {
    if (!isManual) queueMicrotask(() => setPoint(previous => previous[0] === autoLongitude && previous[1] === autoLatitude ? previous : [autoLongitude, autoLatitude]));
  }, [autoLongitude, autoLatitude, isManual]);

  useEffect(() => {
    const source = map?.getSource('editor-start-finish') as GeoJSONSource | undefined;
    source?.setData({ type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: point } });
  }, [map, point]);

  useEffect(() => {
    if (!map) return;
    const place = (event: MapMouseEvent) => {
      if (activeTool !== 'finish:place' || Date.now() < suppressClickUntil.current) return;
      setPoint(snapToLine(centerline.coordinates, [event.lngLat.lng, event.lngLat.lat]));
      setIsManual(true);
      setActiveTool(null);
    };
    const beginDrag = (event: MapLayerMouseEvent | MapLayerTouchEvent) => {
      if (activeTool !== 'finish:place') return;
      if ('touches' in event.originalEvent && event.originalEvent.touches.length !== 1) return;
      event.preventDefault();
      dragging.current = true;
      dragPanWasEnabled.current = map.dragPan.isEnabled();
      map.dragPan.disable();
      map.getCanvas().style.cursor = 'grabbing';
    };
    const move = (event: MapMouseEvent | MapTouchEvent) => {
      if (!dragging.current) return;
      setPoint(snapToLine(centerline.coordinates, [event.lngLat.lng, event.lngLat.lat]));
      setIsManual(true);
    };
    const endDrag = () => {
      if (!dragging.current) return;
      dragging.current = false;
      suppressClickUntil.current = Date.now() + 250;
      if (dragPanWasEnabled.current) map.dragPan.enable();
      map.getCanvas().style.cursor = '';
      setActiveTool(null);
    };
    map.on('click', place);
    if (map.getLayer('editor-start-finish')) map.on('mousedown', 'editor-start-finish', beginDrag);
    if (map.getLayer('editor-start-finish')) map.on('touchstart', 'editor-start-finish', beginDrag);
    map.on('mousemove', move);
    map.on('touchmove', move);
    map.on('mouseup', endDrag);
    map.on('touchend', endDrag);
    window.addEventListener('mouseup', endDrag);
    window.addEventListener('touchend', endDrag);
    window.addEventListener('touchcancel', endDrag);
    return () => {
      map.off('click', place);
      if (map.getLayer('editor-start-finish')) map.off('mousedown', 'editor-start-finish', beginDrag);
      if (map.getLayer('editor-start-finish')) map.off('touchstart', 'editor-start-finish', beginDrag);
      map.off('mousemove', move);
      map.off('touchmove', move);
      map.off('mouseup', endDrag);
      map.off('touchend', endDrag);
      window.removeEventListener('mouseup', endDrag);
      window.removeEventListener('touchend', endDrag);
      window.removeEventListener('touchcancel', endDrag);
      if (dragging.current && dragPanWasEnabled.current) map.dragPan.enable();
    };
  }, [activeTool, centerline.coordinates, map, setActiveTool]);

  return <form id="start-finish-editor" className="admin-editor-form admin-start-finish-editor" action={action}>
    <input type="hidden" name="circuitId" value={circuitId} />
    <input type="hidden" name="layoutId" value={layoutId} />
    {manual ? <input type="hidden" name="revision" value={manual.revision} /> : null}
    <input type="hidden" name="reviewStatus" value={reviewStatus} />
    <input type="hidden" name="geometryGeoJson" value={JSON.stringify({ type: 'Point', coordinates: point })} />
    <h2>Старт/финиш</h2>
    <p>По умолчанию круглая отметка стоит в начале первого сектора. Если нужно уточнить её место, нажмите кнопку и затем точку на контуре или перетащите отметку</p>
    <div className="admin-track-digitizer-actions">
      <button type="button" className={activeTool === 'finish:place' ? 'is-active' : ''} onClick={() => setActiveTool(activeTool === 'finish:place' ? null : 'finish:place')}>{activeTool === 'finish:place' ? 'Выберите место на карте' : 'Перенести на карте'}</button>
      <button type="button" onClick={() => { setPoint(currentAuto); setIsManual(false); setActiveTool(null); }}>К началу S1</button>
    </div>
    <p className="admin-field-note">{isManual ? 'Ручное положение' : 'Начало первого сектора'} · {point[0].toFixed(6)}, {point[1].toFixed(6)}</p>
    <details className="admin-track-source-details" open={requiresSourceConfirmation || !manual?.sourceUrl}><summary>Период и источник</summary><div className="admin-form-grid">
      <label><span>Действует с года</span><input name="validFromYear" type="number" min="1900" max="2100" defaultValue={manual?.validFromYear ?? validFromYear ?? ''} /></label>
      <label><span>Действует до года</span><input name="validToYear" type="number" min="1900" max="2100" defaultValue={manual?.validToYear ?? validToYear ?? ''} /></label>
      <label><span>Название источника</span><input name="sourceName" defaultValue={manual?.sourceName ?? ''} /></label>
      <label><span>URL схемы</span><input name="sourceUrl" type="url" required defaultValue={manual?.sourceUrl ?? ''} placeholder="https://…" /></label>
      <label><span>Примечание</span><textarea name="sourceNotes" rows={2} defaultValue={manual?.sourceNotes ?? ''} /></label>
      {requiresSourceConfirmation ? <label className="admin-rights-confirmation"><input type="checkbox" name="sourceVerified" value="yes" required /><span><strong>Источник проверен</strong><small>Подтвердите схему перед изменением проверенной или опубликованной отметки</small></span></label> : null}
    </div></details>
    <p className="admin-field-note">{reviewStatus === 'published' ? 'Изменение опубликованной отметки сразу обновит публичную карту после подтверждения источника' : reviewStatus === 'reviewed' ? 'Отметка останется проверенной после подтверждения источника' : 'Новая ручная точка сохраняется кандидатом и не меняет публичную карту без проверки'}</p>
    <button type="submit">Сохранить положение</button>
  </form>;
}
