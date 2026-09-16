'use client';

/* eslint-disable @next/next/no-img-element */
import Link from 'next/link';
import { useState } from 'react';
import type { AdminCircuitMediaOrderItem } from '../../../../lib/admin-database';
import { updateCircuitMediaOrder } from '../../../actions';

const rightsLabels: Record<string, string> = { verified: 'Права подтверждены', unresolved: 'Права не проверены', restricted: 'Ограничено' };
const reviewLabels: Record<string, string> = { candidate: 'Кандидат', reviewed: 'Проверено', published: 'Опубликовано', hidden: 'Скрыто' };

export function CircuitMediaOrderEditor({ circuitId, section, title, note, initialItems }: {
  circuitId: string;
  section: 'history' | 'gallery';
  title: string;
  note: string;
  initialItems: AdminCircuitMediaOrderItem[];
}) {
  const [items, setItems] = useState(initialItems);
  const move = (index: number, offset: -1 | 1) => {
    const destination = index + offset;
    if (destination < 0 || destination >= items.length) return;
    setItems((current) => {
      const next = [...current];
      [next[index], next[destination]] = [next[destination], next[index]];
      return next;
    });
  };
  const changed = items.some((item, index) => item.id !== initialItems[index]?.id);

  return <section className="admin-circuit-media-section">
    <header><div><span className="admin-kicker">Порядок на публичной странице</span><h2>{title}</h2><p>{note}</p></div><strong>{items.length} материалов</strong></header>
    <form action={updateCircuitMediaOrder}>
      <input type="hidden" name="circuitId" value={circuitId} />
      <input type="hidden" name="section" value={section} />
      <input type="hidden" name="orderedIds" value={JSON.stringify(items.map((item) => item.id))} />
      <ol className="admin-circuit-media-list">{items.map((item, index) => <li key={item.id}>
        <span className="admin-circuit-media-position">{String(index + 1).padStart(2, '0')}</span>
        <div className="admin-circuit-media-preview">{item.url ? <img src={item.url} alt={item.altTextRu ?? ''} loading="lazy" /> : <span>Нет изображения</span>}</div>
        <div className="admin-circuit-media-copy">
          <span>{item.yearLabel || (section === 'history' ? 'Без даты' : 'Галерея')}</span>
          <strong>{item.titleRu || item.altTextRu || item.id}</strong>
          <small>{item.descriptionRu || item.altTextRu || 'Описание не указано'}</small>
        </div>
        <div className="admin-circuit-media-statuses">
          {item.rightsStatus ? <span className={`admin-status is-${item.rightsStatus}`}>{rightsLabels[item.rightsStatus] ?? item.rightsStatus}</span> : null}
          {item.reviewStatus ? <span className={`admin-status is-${item.reviewStatus}`}>{reviewLabels[item.reviewStatus] ?? item.reviewStatus}</span> : null}
        </div>
        <div className="admin-circuit-media-actions">
          <button type="button" onClick={() => move(index, -1)} disabled={index === 0} aria-label={`Поднять «${item.titleRu || item.id}»`}>↑</button>
          <button type="button" onClick={() => move(index, 1)} disabled={index === items.length - 1} aria-label={`Опустить «${item.titleRu || item.id}»`}>↓</button>
          {item.mediaAssetId ? <Link href={`/admin/media/${encodeURIComponent(item.mediaAssetId)}`}>Материал</Link> : null}
        </div>
      </li>)}</ol>
      <div className="admin-form-actions"><span>{changed ? 'Порядок изменён — сохраните его' : 'Перемещайте материалы стрелками вверх и вниз'}</span><button type="submit" disabled={!changed}>Сохранить порядок</button></div>
    </form>
  </section>;
}
