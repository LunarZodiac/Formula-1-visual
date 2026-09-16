'use client';

import { useMemo, useRef, useState, useTransition } from 'react';
import { importTrackGeometry, previewTrackGeometry } from '../../../../actions';
import type { AdminTrackGeometryInspection } from '../../../../../lib/admin-database';
import { LayoutGeometryPreview } from './layout-geometry-preview';
import { TrackGeometryDigitizer } from './track-geometry-digitizer';

export function TrackGeometryImporter({ circuitId, layoutId, longitude, latitude, existingGeometry }: {
  circuitId: string;
  layoutId: string;
  longitude: number;
  latitude: number;
  existingGeometry: { type: 'LineString'; coordinates: number[][] } | null;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [rawGeoJson, setRawGeoJson] = useState('');
  const [fileName, setFileName] = useState('');
  const [inspection, setInspection] = useState<AdminTrackGeometryInspection | null>(null);
  const [error, setError] = useState('');
  const [pending, startTransition] = useTransition();
  const draftGeometry = useMemo(() => {
    if (!rawGeoJson.trim()) return null;
    try {
      const value = JSON.parse(rawGeoJson) as Record<string, unknown>;
      let geometry: unknown = value;
      if (value.type === 'Feature') geometry = value.geometry;
      if (value.type === 'FeatureCollection') {
        const features = Array.isArray(value.features) ? value.features : [];
        geometry = features.length === 1 && features[0] && typeof features[0] === 'object'
          ? (features[0] as Record<string, unknown>).geometry : null;
      }
      if (!geometry || typeof geometry !== 'object') return null;
      const candidate = geometry as { type?: unknown; coordinates?: unknown };
      if (candidate.type !== 'LineString' || !Array.isArray(candidate.coordinates)) return null;
      const coordinates = candidate.coordinates.filter((point): point is number[] => (
        Array.isArray(point) && point.length >= 2 && point.every((coordinate) => typeof coordinate === 'number' && Number.isFinite(coordinate))
      ));
      return coordinates.length >= 2 ? { type: 'LineString' as const, coordinates } : null;
    } catch { return null; }
  }, [rawGeoJson]);

  function updateRaw(value: string) {
    setRawGeoJson(value); setInspection(null); setError('');
  }

  async function selectFile(file: File | undefined) {
    if (!file) return;
    setFileName(file.name);
    if (file.size > 1_800_000) { updateRaw(''); setError('Файл больше 1,8 МБ'); return; }
    try { updateRaw(await file.text()); }
    catch { updateRaw(''); setError('Не удалось прочитать файл'); }
  }

  function inspect() {
    setError('');
    startTransition(async () => {
      const response = await previewTrackGeometry(circuitId, layoutId, rawGeoJson);
      if (!response.ok) { setInspection(null); setError(response.error); return; }
      setInspection(response.result);
    });
  }

  return <div className="admin-track-importer">
    <TrackGeometryDigitizer layoutId={layoutId} longitude={longitude} latitude={latitude} existingGeometry={existingGeometry} onGeoJsonChange={updateRaw} />
    <div className="admin-track-importer-controls">
      <label className="admin-file-picker">
        <span>Файл GeoJSON</span>
        <input ref={inputRef} type="file" accept=".geojson,.json,application/geo+json,application/json" onChange={(event) => void selectFile(event.target.files?.[0])} />
        <span className="admin-file-picker-control"><strong>{fileName ? 'Заменить файл' : 'Выбрать файл'}</strong>{fileName ? <em>{fileName}</em> : <em>LineString, Feature или FeatureCollection с одной линией</em>}</span>
      </label>
      <label><span>GeoJSON</span><textarea rows={9} value={rawGeoJson} onChange={(event) => updateRaw(event.target.value)} placeholder={'{"type":"LineString","coordinates":[[5.9,50.4], …]}'} spellCheck={false} /></label>
      {draftGeometry && !inspection ? <div className="admin-track-draft-preview"><strong>Черновой предпросмотр</strong><LayoutGeometryPreview geometry={draftGeometry} label="Черновой предпросмотр выбранного GeoJSON" caption="появился сразу после выбора файла, ещё не проверен" /></div> : null}
      <button type="button" onClick={inspect} disabled={pending || !rawGeoJson.trim()}>{pending ? 'Проверяем…' : 'Проверить и показать'}</button>
    </div>
    {error ? <div className="admin-alert is-error" role="alert">{error}</div> : null}
    {inspection ? <div className="admin-track-import-result">
      <LayoutGeometryPreview geometry={inspection.geometry} label="Предпросмотр загружаемого контура" caption="проверенный предпросмотр, ещё не сохранён" />
      <dl>
        <div><dt>Точек</dt><dd>{inspection.pointCount.toLocaleString('ru-RU')}</dd></div>
        <div><dt>Измеренная длина</dt><dd>{inspection.measuredLengthM.toLocaleString('ru-RU')} м</dd></div>
        <div><dt>Указанная длина</dt><dd>{inspection.expectedLengthM?.toLocaleString('ru-RU') ?? 'Не указана'}{inspection.lengthDeviationPercent === null ? '' : ` · ${inspection.lengthDeviationPercent > 0 ? '+' : ''}${inspection.lengthDeviationPercent}%`}</dd></div>
        <div><dt>Самая дальняя точка от центра трассы</dt><dd>{inspection.maximumDistanceM.toLocaleString('ru-RU')} м</dd></div>
      </dl>
      {inspection.warnings.length ? <div className="admin-track-import-warnings"><strong>Нужно проверить</strong><ul>{inspection.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul></div> : <div className="admin-alert is-success">Автоматические проверки пройдены без предупреждений</div>}
      <form action={importTrackGeometry} className="admin-track-import-confirmation">
        <input type="hidden" name="circuitId" value={circuitId} />
        <input type="hidden" name="layoutId" value={layoutId} />
        <input type="hidden" name="geoJson" value={rawGeoJson} />
        <label><input type="checkbox" name="confirmed" value="yes" required /><span><strong>Контур и источник проверены</strong><small>После импорта статус конфигурации станет «Кандидат». Для публикации потребуется отдельная редакторская проверка</small></span></label>
        <button type="submit">Импортировать в PostGIS и карту</button>
      </form>
    </div> : null}
  </div>;
}
