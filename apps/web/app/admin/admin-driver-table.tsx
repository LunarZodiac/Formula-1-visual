'use client';
/* eslint-disable @next/next/no-img-element */

import { Fragment, useState } from 'react';
import Link from 'next/link';
import type { AdminDriverListItem } from '../lib/admin-database';
import { quickUpdateDriver } from './actions';

function EditIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m4 16.5-.8 4.3 4.3-.8L19 8.5 15.5 5 4 16.5Z" /><path d="m13.8 6.7 3.5 3.5" /></svg>;
}

export function AdminDriverTable({ rows, databaseConfigured, returnTo }: {
  rows: AdminDriverListItem[];
  databaseConfigured: boolean;
  returnTo: string;
}) {
  const [editMode, setEditMode] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  function closeEditing() {
    setEditingId(null);
    setEditMode(false);
  }

  return <>
    <div className="admin-table-toolbar">
      <span>{editMode ? 'Выберите строку для редактирования' : 'Имя открывает полную карточку пилота'}</span>
      <button type="button" className={editMode ? 'is-active' : ''} disabled={!databaseConfigured} aria-pressed={editMode} onClick={() => { setEditMode((value) => !value); setEditingId(null); }}>
        <EditIcon />{editMode ? 'Закрыть редактирование' : 'Редактировать таблицу'}
      </button>
    </div>
    <div className="admin-table-wrap"><table><thead><tr><th>ID</th><th>Имя</th><th>Первый сезон</th><th>Последний сезон</th><th>Сезонов</th><th>Последняя команда</th><th>Фотография</th>{editMode ? <th><span className="sr-only">Действия</span></th> : null}</tr></thead>
      <tbody>{rows.map((driver) => <Fragment key={driver.id}>
        <tr className={editingId === driver.id ? 'is-editing' : undefined}>
          <td><code>{driver.id}</code></td>
          <td><Link href={`/admin/drivers/${encodeURIComponent(driver.id)}`}>{driver.nameRu}</Link></td>
          <td>{driver.firstSeason}</td><td>{driver.latestSeason}</td><td>{driver.seasonCount}</td><td>{driver.latestTeam ?? '—'}</td>
          <td><div className="admin-driver-photo-cell">
            {driver.photoUrl ? <img src={driver.photoUrl} alt="" loading="lazy" decoding="async" width="44" height="55" /> : <span aria-hidden="true">—</span>}
            <Link className={`admin-photo-link ${driver.hasPhoto ? 'has-photo' : ''}`} href={`/admin/drivers/${encodeURIComponent(driver.id)}#photo`}>{driver.hasPhoto ? 'Заменить' : 'Добавить'}</Link>
          </div></td>
          {editMode ? <td className="admin-table-action"><button type="button" aria-label={`Редактировать ${driver.nameRu}`} aria-expanded={editingId === driver.id} onClick={() => setEditingId((value) => value === driver.id ? null : driver.id)}><EditIcon /></button></td> : null}
        </tr>
        {editingId === driver.id ? <tr className="admin-quick-editor-row"><td colSpan={8}>
          <form action={quickUpdateDriver} className="admin-quick-editor">
            <input type="hidden" name="id" value={driver.id} />
            <input type="hidden" name="returnTo" value={returnTo} />
            <input type="hidden" name="initialValues" value={JSON.stringify({ nameRu: driver.nameRu, birthDate: driver.birthDate, birthPlaceRu: driver.birthPlaceRu, deathDate: driver.deathDate, heightCm: driver.heightCm, weightKg: driver.weightKg, sourceUrl: driver.sourceUrl })} />
            <label><span>Имя на русском</span><input name="nameRu" required defaultValue={driver.nameRu} /></label>
            <label><span>Место рождения</span><input name="birthPlaceRu" defaultValue={driver.birthPlaceRu ?? ''} placeholder="Город, страна" /></label>
            <label><span>Дата рождения</span><input name="birthDate" type="date" defaultValue={driver.birthDate ?? ''} /></label>
            <label><span>Дата смерти</span><input name="deathDate" type="date" defaultValue={driver.deathDate ?? ''} /></label>
            <label><span>Рост, см</span><input name="heightCm" type="number" min="120" max="230" step="0.1" defaultValue={driver.heightCm ?? ''} /></label>
            <label><span>Вес, кг</span><input name="weightKg" type="number" min="35" max="200" step="0.1" defaultValue={driver.weightKg ?? ''} /></label>
            <label className="admin-quick-source"><span>Источник изменений</span><input name="sourceUrl" type="url" required defaultValue={driver.sourceUrl ?? ''} placeholder="https://…" /></label>
            <div className="admin-quick-actions"><button type="button" onClick={closeEditing}>Отмена</button><button type="submit">Сохранить</button></div>
          </form>
        </td></tr> : null}
      </Fragment>)}</tbody>
    </table></div>
  </>;
}
