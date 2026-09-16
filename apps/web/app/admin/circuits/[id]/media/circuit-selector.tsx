'use client';

import { useRouter } from 'next/navigation';

export function CircuitSelector({ currentId, circuits }: {
  currentId: string;
  circuits: Array<{ id: string; name: string }>;
}) {
  const router = useRouter();
  return <label className="admin-circuit-selector">
    <span>Выбрать трассу</span>
    <select value={currentId} onChange={(event) => router.push(`/admin/circuits/${encodeURIComponent(event.target.value)}/media`)}>
      {circuits.map((circuit) => <option value={circuit.id} key={circuit.id}>{circuit.name}</option>)}
    </select>
  </label>;
}
