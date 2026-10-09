import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { saveTravelAccessAnchor } from '../../../actions';
import { getAdminSession } from '../../../../lib/admin-auth';
import { getAdminTravelAccessAnchors, isAdminDatabaseConfigured } from '../../../../lib/admin-database';
import { isAdminSupabaseConfigured } from '../../../../lib/supabase-admin';
import { TravelModuleNav } from '../travel-module-nav';

const kindLabels: Record<string, string> = {
  gate: 'Вход',
  parking: 'Парковка',
  dropoff: 'Высадка',
  shuttle_stop: 'Остановка трансфера',
  approach: 'Подход к трассе',
};

const modeLabels: Record<string, string> = {
  car: 'Автомобиль',
  transit: 'Общественный транспорт',
  shuttle: 'Трансфер',
  walk: 'Пешком',
  bicycle: 'Велосипед',
  mixed: 'Смешанный',
};

const scopeLabels: Record<string, string> = {
  general: 'Постоянный доступ',
  event: 'Только во время этапа',
};

const statusLabels: Record<string, string> = {
  candidate: 'Кандидат',
  needs_review: 'Нужна проверка',
  verified: 'Проверена',
  rejected: 'Отклонена',
  expired: 'Устарела',
};

export default async function AdminTravelAccessPage({ params, searchParams }: {
  params: Promise<{ circuitId: string }>;
  searchParams: Promise<{ edit?: string; saved?: string; error?: string }>;
}) {
  if (!await getAdminSession()) redirect('/admin/login');
  if (!isAdminDatabaseConfigured()) redirect('/admin/overview');

  const [{ circuitId }, state] = await Promise.all([params, searchParams]);
  let registry: Awaited<ReturnType<typeof getAdminTravelAccessAnchors>> = null;
  try {
    registry = await getAdminTravelAccessAnchors(circuitId);
  } catch (error) {
    console.error(`Не удалось загрузить точки доступа трассы ${circuitId}`, error);
    return <main className="admin-shell"><section className="admin-directory">
      <Link className="admin-back-link" href={`/admin/travel/${encodeURIComponent(circuitId)}`}>← Вернуться к точкам</Link>
      <div className="admin-alert is-error">База точек доступа временно недоступна. Повторите попытку позже</div>
    </section></main>;
  }
  if (!registry) notFound();

  const selected = state.edit ? registry.rows.find((row) => row.id === state.edit) : undefined;
  const basePath = `/admin/travel/${encodeURIComponent(circuitId)}/access`;
  const defaultId = `${circuitId}-access-`;

  return <main className="admin-shell"><section className="admin-directory admin-travel-subdirectory">
    <Link className="admin-back-link" href={`/admin/travel/${encodeURIComponent(circuitId)}`}>← Вернуться к точкам</Link>
    <header><div><span className="admin-kicker">Ручной реестр доступа</span><h1>{registry.circuit.name}</h1><p>{registry.rows.length} точек и кандидатов</p></div></header>
    <TravelModuleNav circuitId={circuitId} active="access" availableSections={isAdminSupabaseConfigured() ? ['points', 'access'] : undefined} />

    {state.saved ? <div className="admin-alert is-success">Точка доступа сохранена: {state.saved}</div> : null}
    {state.error === 'conflict' ? <div className="admin-alert is-error">Точку доступа изменили после открытия страницы. Проверьте новые данные и сохраните ещё раз</div> : state.error ? <div className="admin-alert is-error">Не удалось сохранить точку доступа. Проверьте обязательные поля, период и требования проверки</div> : null}
    {state.edit && !selected ? <div className="admin-alert is-error">Запись для редактирования не найдена</div> : null}

    <form action={saveTravelAccessAnchor} className="admin-editor-form">
      <input type="hidden" name="circuitId" value={circuitId} />
      <input type="hidden" name="editing" value={selected ? 'yes' : 'no'} />
      <input type="hidden" name="expectedRevision" value={selected?.revision ?? ''} />
      <fieldset><legend>{selected ? 'Редактировать точку доступа' : 'Добавить точку доступа'}</legend><div className="admin-form-grid">
        <label className="is-wide"><span>ID записи</span><input name="id" defaultValue={selected?.id ?? defaultId} readOnly={Boolean(selected)} required pattern="[A-Za-z0-9_-]+" /><small>Стабильный системный ID латиницей</small></label>
        <label className="is-wide"><span>Туристическая точка</span><select name="poiId" defaultValue={selected?.poiId ?? ''} required><option value="" disabled>Выберите точку</option>{registry.pointOptions.map((point) => <option key={point.id} value={point.id}>{point.name} · {point.categoryName} · {statusLabels[point.reviewStatus] ?? point.reviewStatus}</option>)}</select>{!registry.pointOptions.length ? <small>Сначала добавьте туристическую точку для этой трассы</small> : null}</label>
        <label><span>Тип доступа</span><select name="accessKind" defaultValue={selected?.accessKind ?? 'gate'}>{Object.entries(kindLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <label><span>Период использования</span><select name="eventScope" defaultValue={selected?.eventScope ?? 'general'}>{Object.entries(scopeLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <label><span>Действует с года</span><input name="validFromYear" type="number" min="1900" max="2100" defaultValue={selected?.validFromYear ?? ''} /></label>
        <label><span>Действует до года</span><input name="validToYear" type="number" min="1900" max="2100" defaultValue={selected?.validToYear ?? ''} /></label>
        <label><span>Статус проверки</span><select name="verificationStatus" defaultValue={selected?.verificationStatus ?? 'candidate'}>{Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <label><span>Уверенность, %</span><input name="confidence" type="number" min="0" max="100" defaultValue={selected?.confidence ?? 0} required /></label>
        <div className="is-wide"><span>Способы передвижения</span><div className="admin-travel-group-options">{Object.entries(modeLabels).map(([value, label]) => <label key={value}><input type="checkbox" name="travelModes" value={value} defaultChecked={selected?.travelModes.includes(value) ?? false} /><span><strong>{label}</strong></span></label>)}</div></div>
        <label className="is-wide"><span>URL источника</span><input name="sourceUrl" type="url" defaultValue={selected?.sourceUrl ?? ''} placeholder="https://…" /></label>
        <label className="is-wide"><span>Что подтверждает источник</span><textarea name="evidenceNoteRu" rows={3} defaultValue={selected?.evidenceNoteRu ?? ''} /></label>
      </div>
      <p className="admin-field-note">Для статуса «Проверена» обязательны источник, уверенность не ниже 70% и хотя бы один способ передвижения</p></fieldset>
      <div className="admin-form-actions"><span>{selected ? `Редактируется ${selected.id}` : 'Новая запись сохранится в ручной реестр'}</span><div>{selected ? <Link href={basePath}>Отменить</Link> : null} <button type="submit" disabled={!registry.pointOptions.length}>{selected ? 'Сохранить изменения' : 'Добавить точку'}</button></div></div>
    </form>

    <div className="admin-table-wrap"><table><thead><tr><th>Точка</th><th>Тип</th><th>Способы</th><th>Период</th><th>Проверка</th><th>Источник</th><th><span className="sr-only">Действие</span></th></tr></thead><tbody>{registry.rows.map((row) => <tr key={row.id}>
      <td><strong>{row.poiName}</strong><small><code>{row.id}</code></small></td>
      <td>{kindLabels[row.accessKind] ?? row.accessKind}<small>{scopeLabels[row.eventScope] ?? row.eventScope}</small></td>
      <td>{row.travelModes.length ? row.travelModes.map((mode) => modeLabels[mode] ?? mode).join(', ') : 'Не указаны'}</td>
      <td>{row.validFromYear || row.validToYear ? `${row.validFromYear ?? '…'}–${row.validToYear ?? '…'}` : 'Без ограничения'}</td>
      <td><span className={`admin-status is-${row.verificationStatus}`}>{statusLabels[row.verificationStatus] ?? row.verificationStatus}</span><small>{row.confidence}%{row.verifiedAt ? ` · ${new Date(row.verifiedAt).toLocaleDateString('ru-RU')}` : ''}</small></td>
      <td>{row.sourceUrl ? <a href={row.sourceUrl} target="_blank" rel="noreferrer">Открыть ↗</a> : 'Не указан'}{row.evidenceNoteRu ? <small>{row.evidenceNoteRu}</small> : null}</td>
      <td><Link className="admin-row-action" href={`${basePath}?edit=${encodeURIComponent(row.id)}`}>Редактировать →</Link></td>
    </tr>)}</tbody></table></div>
    {!registry.rows.length ? <p className="admin-directory-empty">Точек доступа пока нет</p> : null}
  </section></main>;
}
