'use client';

import { useId } from 'react';
import { useFormStatus } from 'react-dom';
import { reorderHistoryEraBlocks } from '../../actions';

function movedOrder(orderedIds: number[], index: number, offset: -1 | 1) {
  const targetIndex = index + offset;
  if (targetIndex < 0 || targetIndex >= orderedIds.length) return null;

  const next = [...orderedIds];
  [next[index], next[targetIndex]] = [next[targetIndex], next[index]];
  return JSON.stringify(next);
}

function OrderButtons({
  blockLabel,
  currentPosition,
  total,
  upOrder,
  downOrder,
  statusId,
}: {
  blockLabel: string;
  currentPosition: number;
  total: number;
  upOrder: string | null;
  downOrder: string | null;
  statusId: string;
}) {
  const { pending, data } = useFormStatus();
  const submittedOrder = data?.get('orderedIds');
  const pendingDirection = submittedOrder === upOrder ? 'выше' : submittedOrder === downOrder ? 'ниже' : null;
  const status = pending && pendingDirection
    ? `Перемещаем блок ${pendingDirection}…`
    : total === 1
      ? 'Единственный блок'
      : `Позиция ${currentPosition} из ${total}`;

  return <>
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
      <button
        className="admin-secondary-action"
        type="submit"
        name="orderedIds"
        value={upOrder ?? ''}
        disabled={pending || !upOrder}
        aria-describedby={statusId}
        aria-label={`Переместить блок «${blockLabel}» выше`}
        title={upOrder ? 'Переместить выше' : 'Блок уже первый'}
        style={{ minHeight: 36, padding: '7px 11px', opacity: pending || !upOrder ? 0.45 : 1 }}
      ><span aria-hidden="true">↑</span> Выше</button>
      <button
        className="admin-secondary-action"
        type="submit"
        name="orderedIds"
        value={downOrder ?? ''}
        disabled={pending || !downOrder}
        aria-describedby={statusId}
        aria-label={`Переместить блок «${blockLabel}» ниже`}
        title={downOrder ? 'Переместить ниже' : 'Блок уже последний'}
        style={{ minHeight: 36, padding: '7px 11px', opacity: pending || !downOrder ? 0.45 : 1 }}
      ><span aria-hidden="true">↓</span> Ниже</button>
    </div>
    <span id={statusId} role="status" aria-live="polite" style={{ color: '#aebbc4', fontSize: 12 }}>
      {status}
    </span>
  </>;
}

export function HistoryEraBlockOrderControls({ eraSlug, orderedIds, index, blockLabel }: {
  eraSlug: string;
  orderedIds: number[];
  index: number;
  blockLabel: string;
}) {
  const statusId = useId();
  const upOrder = movedOrder(orderedIds, index, -1);
  const downOrder = movedOrder(orderedIds, index, 1);

  return <form
    action={reorderHistoryEraBlocks}
    aria-label={`Изменить порядок блока «${blockLabel}»`}
    style={{ display: 'grid', justifyItems: 'end', gap: 5 }}
  >
    <input type="hidden" name="eraSlug" value={eraSlug} />
    <input type="hidden" name="expectedOrderedIds" value={JSON.stringify(orderedIds)} />
    <OrderButtons
      blockLabel={blockLabel}
      currentPosition={index + 1}
      total={orderedIds.length}
      upOrder={upOrder}
      downOrder={downOrder}
      statusId={statusId}
    />
  </form>;
}
