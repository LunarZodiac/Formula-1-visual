'use client';

import { useMemo, useState } from 'react';
import type { AdminEventEditorOptions } from '../../../lib/admin-database';

export function CircuitLayoutFields({ circuits, defaultCircuitId, defaultLayoutId, defaultSeason }: {
  circuits: AdminEventEditorOptions['circuits']; defaultCircuitId: string; defaultLayoutId: string; defaultSeason: number;
}) {
  const [circuitId, setCircuitId] = useState(defaultCircuitId);
  const [season, setSeason] = useState(defaultSeason);
  const layouts = useMemo(() => circuits.find((circuit) => circuit.id === circuitId)?.layouts.filter((layout) => (
    (layout.validFromYear === null || season >= layout.validFromYear)
      && (layout.validToYear === null || season <= layout.validToYear)
  )) ?? [], [circuits, circuitId, season]);
  const selectedLayoutAvailable = layouts.some((layout) => layout.id === defaultLayoutId);
  return <>
    <label><span>Сезон</span><input name="seasonYear" type="number" min="1950" max="2100" value={season} onChange={(event) => setSeason(Number(event.target.value))} required /></label>
    <label><span>Трасса</span><select name="circuitId" value={circuitId} onChange={(event) => setCircuitId(event.target.value)} required><option value="">Выберите трассу</option>{circuits.map((circuit) => <option key={circuit.id} value={circuit.id}>{circuit.name} · {circuit.id}</option>)}</select></label>
    <label><span>Конфигурация</span><select name="layoutId" defaultValue={selectedLayoutAvailable ? defaultLayoutId : ''} key={`${circuitId}:${season}`}><option value="">Не привязана</option>{layouts.map((layout) => <option key={layout.id} value={layout.id}>{layout.name} · {layout.id} · {layout.reviewStatus}</option>)}</select><small>{layouts.length ? 'Показаны конфигурации этой трассы, подходящие выбранному сезону' : 'Для трассы и сезона нет подходящей конфигурации'}</small></label>
  </>;
}
