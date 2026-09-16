'use client';

import { useMemo, useState } from 'react';
import type { AdminSessionResult } from '../../../../../lib/admin-database';
import { saveSessionResultsBulk } from '../../../../actions';

type Row = {
  key: string; isNew: boolean; originalDriverId: string; driverId: string; positionOrder: string; positionText: string;
  constructorEntryId: string; gridPosition: string; laps: string; points: string; status: string;
  elapsedTime: string; gapTime: string; gapText: string; fastestLapRank: string; fastestLapNumber: string;
  fastestLapTime: string; q1Time: string; q2Time: string; q3Time: string; penaltyNote: string;
};

function duration(value: number | null) {
  if (value === null) return '';
  const hours = Math.floor(value / 3_600_000); const minutes = Math.floor((value % 3_600_000) / 60_000);
  const seconds = Math.floor((value % 60_000) / 1000); const milliseconds = value % 1000;
  const tail = `${String(seconds).padStart(2, '0')}.${String(milliseconds).padStart(3, '0')}`;
  return hours ? `${hours}:${String(minutes).padStart(2, '0')}:${tail}` : `${minutes}:${tail}`;
}

function fromResult(result: AdminSessionResult): Row {
  return {
    key: result.driverId, isNew: false, originalDriverId: result.driverId, driverId: result.driverId,
    positionOrder: String(result.positionOrder), positionText: result.positionText,
    constructorEntryId: result.constructorEntryId === null ? '' : String(result.constructorEntryId),
    gridPosition: result.gridPosition === null ? '' : String(result.gridPosition), laps: result.laps === null ? '' : String(result.laps),
    points: String(result.points), status: result.status ?? '', elapsedTime: duration(result.elapsedMs), gapTime: duration(result.gapMs),
    gapText: result.gapText ?? '', fastestLapRank: result.fastestLapRank === null ? '' : String(result.fastestLapRank),
    fastestLapNumber: result.fastestLapNumber === null ? '' : String(result.fastestLapNumber), fastestLapTime: duration(result.fastestLapMs),
    q1Time: duration(result.q1Ms), q2Time: duration(result.q2Ms), q3Time: duration(result.q3Ms), penaltyNote: result.penaltyNote ?? '',
  };
}

function emptyRow(position: number): Row {
  return { key: `new-${Date.now()}-${position}`, isNew: true, originalDriverId: '', driverId: '', positionOrder: String(position),
    positionText: String(position), constructorEntryId: '', gridPosition: '', laps: '', points: '0', status: '', elapsedTime: '',
    gapTime: '', gapText: '', fastestLapRank: '', fastestLapNumber: '', fastestLapTime: '', q1Time: '', q2Time: '', q3Time: '', penaltyNote: '' };
}

export function BulkResultsEditor({ raceId, sessionId, sourceUrl, results, constructors }: {
  raceId: string; sessionId: string; sourceUrl: string; results: AdminSessionResult[];
  constructors: Array<{ id: number; name: string }>;
}) {
  const [rows, setRows] = useState<Row[]>(() => results.map(fromResult));
  const payload = useMemo(() => JSON.stringify(rows, (key, value) => key === 'key' || key === 'isNew' ? undefined : value), [rows]);
  const update = (key: string, field: keyof Row, value: string) => setRows((current) => current.map((row) => row.key === key ? { ...row, [field]: value } : row));
  const add = () => setRows((current) => [...current, emptyRow(current.length + 1)]);
  const removeNew = (key: string) => setRows((current) => current.filter((row) => row.key !== key));
  return <form action={saveSessionResultsBulk} className="admin-bulk-results">
    <input type="hidden" name="raceId" value={raceId} /><input type="hidden" name="sessionId" value={sessionId} />
    <input type="hidden" name="rows" value={payload} />
    <div className="admin-bulk-results-toolbar"><div><strong>Пакетный режим</strong><span>Все изменения сохраняются одной транзакцией</span></div><button type="button" onClick={add}>＋ Добавить строку</button></div>
    <div className="admin-bulk-results-table"><table><thead><tr><th>№</th><th>Позиция</th><th>Пилот</th><th>Команда</th><th>Старт</th><th>Круги</th><th>Очки</th><th>Статус</th><th>Время</th><th>Отставание</th><th>Текст отставания</th><th>БК место</th><th>БК круг</th><th>БК время</th><th>Q1</th><th>Q2</th><th>Q3</th><th>Штраф / примечание</th><th /></tr></thead>
      <tbody>{rows.map((row) => <tr key={row.key}>
        <td><input aria-label="Порядок" type="number" min="1" value={row.positionOrder} onChange={(event) => update(row.key, 'positionOrder', event.target.value)} required /></td>
        <td><input aria-label="Отображаемая позиция" value={row.positionText} onChange={(event) => update(row.key, 'positionText', event.target.value)} required /></td>
        <td><input aria-label="ID пилота" list="event-driver-options" value={row.driverId} onChange={(event) => update(row.key, 'driverId', event.target.value)} placeholder="driver_id" required /></td>
        <td><select aria-label="Команда" value={row.constructorEntryId} onChange={(event) => update(row.key, 'constructorEntryId', event.target.value)}><option value="">—</option>{constructors.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></td>
        {(['gridPosition', 'laps', 'points'] as const).map((field) => <td key={field}><input aria-label={field} type="number" min="0" step={field === 'points' ? '0.01' : '1'} value={row[field]} onChange={(event) => update(row.key, field, event.target.value)} /></td>)}
        <td><input aria-label="Статус" value={row.status} onChange={(event) => update(row.key, 'status', event.target.value)} /></td>
        {(['elapsedTime', 'gapTime', 'gapText', 'fastestLapRank', 'fastestLapNumber', 'fastestLapTime', 'q1Time', 'q2Time', 'q3Time'] as const).map((field) => <td key={field}><input aria-label={field} value={row[field]} onChange={(event) => update(row.key, field, event.target.value)} /></td>)}
        <td><input aria-label="Штраф или примечание" value={row.penaltyNote} onChange={(event) => update(row.key, 'penaltyNote', event.target.value)} /></td>
        <td>{row.isNew ? <button type="button" onClick={() => removeNew(row.key)} aria-label="Убрать новую строку">×</button> : null}</td>
      </tr>)}</tbody></table></div>
    <div className="admin-bulk-results-submit"><label><span>Общий источник классификации</span><input name="sourceUrl" type="url" defaultValue={sourceUrl} required /></label><label className="admin-bulk-confirm"><input type="checkbox" name="sourceVerified" value="yes" required /> Источник проверен</label><button type="submit" disabled={!rows.length}>Сохранить {rows.length} строк</button></div>
  </form>;
}
