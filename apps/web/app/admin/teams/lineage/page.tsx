import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getAdminSession } from '../../../lib/admin-auth';
import { getAdminConstructorLineages, isAdminDatabaseConfigured, type AdminConstructorIdentity, type AdminConstructorLineage } from '../../../lib/admin-database';
import { removeConstructorLineage, saveConstructorLineage } from '../../actions';

const relationshipLabels = {
  rename: 'Переименование', ownership_change: 'Смена владельца', factory_takeover: 'Переход заводской команды',
  licence_transfer: 'Передача лицензии', continuation: 'Преемственность', other: 'Другая связь',
} as const;

const statusLabels = { candidate: 'Кандидат', reviewed: 'Проверено', published: 'Опубликовано', rejected: 'Отклонено' } as const;

function ConstructorOptions({ constructors }: { constructors: AdminConstructorIdentity[] }) {
  return <>{constructors.map((constructor) => <option key={constructor.id} value={constructor.id}>
    {constructor.name} · {constructor.id}{constructor.firstSeason ? ` · ${constructor.firstSeason}–${constructor.latestSeason}` : ''}
  </option>)}</>;
}

function LineageFields({ constructors, row }: { constructors: AdminConstructorIdentity[]; row?: AdminConstructorLineage }) {
  return <div className="admin-form-grid">
    <label><span>Команда-предшественник</span><select name="predecessorConstructorId" required defaultValue={row?.predecessorConstructorId ?? ''}><option value="" disabled>Выберите команду</option><ConstructorOptions constructors={constructors} /></select></label>
    <label><span>Команда-преемник</span><select name="successorConstructorId" required defaultValue={row?.successorConstructorId ?? ''}><option value="" disabled>Выберите команду</option><ConstructorOptions constructors={constructors} /></select></label>
    <label><span>Тип связи</span><select name="relationshipType" defaultValue={row?.relationshipType ?? 'continuation'}>{Object.entries(relationshipLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
    <label><span>Статус проверки</span><select name="reviewStatus" defaultValue={row?.reviewStatus ?? 'candidate'}>{Object.entries(statusLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
    <label><span>Начальный год</span><input name="validFromYear" type="number" min="1950" max="2100" defaultValue={row?.validFromYear ?? ''} /></label>
    <label><span>Конечный год</span><input name="validToYear" type="number" min="1950" max="2100" defaultValue={row?.validToYear ?? ''} /></label>
    <label className="is-wide"><span>Описание связи</span><textarea name="descriptionRu" rows={3} defaultValue={row?.descriptionRu ?? ''} placeholder="Что именно изменилось и почему команды считаются связанными" /></label>
    <label className="is-wide"><span>Источник</span><input name="sourceUrl" type="url" required defaultValue={row?.sourceUrl ?? ''} placeholder="https://…" /><small>Проверенный источник обязателен; опубликованная связь без него не сохраняется</small></label>
  </div>;
}

export default async function AdminTeamLineagePage({ searchParams }: { searchParams: Promise<{ q?: string; status?: string; saved?: string; deleted?: string; error?: string }> }) {
  if (!await getAdminSession()) redirect('/admin/login');
  const requested = await searchParams;
  const query = requested.q?.trim().slice(0, 120) ?? '';
  const status = requested.status?.trim() ?? '';
  let bundle: Awaited<ReturnType<typeof getAdminConstructorLineages>> = { rows: [], constructors: [] };
  let error = !isAdminDatabaseConfigured();
  if (!error) {
    try { bundle = await getAdminConstructorLineages(query, status); }
    catch (cause) { console.error('Не удалось загрузить преемственность команд', cause); error = true; }
  }
  return <main className="admin-shell"><section className="admin-edit-panel admin-lineage-editor">
    <Link className="admin-back-link" href="/admin/teams">← Команды и болиды</Link>
    <header><div><span className="admin-kicker">История идентичностей</span><h1>Преемственность команд</h1></div><p>{bundle.rows.length} связей</p></header>
    <p className="admin-editor-intro">Карточки и статистика команд остаются раздельными. Здесь хранится только подтверждённая связь между идентичностями — например, переименование или смена владельца</p>
    {requested.saved ? <div className="admin-alert is-success">Связь сохранена</div> : null}
    {requested.deleted ? <div className="admin-alert is-success">Связь удалена</div> : null}
    {requested.error || error ? <div className="admin-alert is-error">{error ? 'Не удалось загрузить связи команд' : 'Не удалось выполнить действие. Проверьте команды, период и источник'}</div> : null}
    {!error ? <>
      <form className="admin-directory-search" method="get"><label><span>Найти команду</span><input name="q" type="search" defaultValue={query} placeholder="Название или ID" /></label><label><span>Статус</span><select name="status" defaultValue={status}><option value="">Все</option>{Object.entries(statusLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label><button type="submit">Показать</button></form>
      <details className="admin-editorial-card admin-lineage-create"><summary>＋ Добавить связь команд</summary><form action={saveConstructorLineage} className="admin-editor-form"><LineageFields constructors={bundle.constructors} /><div className="admin-form-actions"><span>Новая связь сохраняется кандидатом, если вы не выбрали проверенный статус</span><button type="submit">Добавить связь</button></div></form></details>
      <div className="admin-editorial-list">{bundle.rows.map((row) => <details className="admin-editorial-card" key={row.id}><summary><strong>{row.predecessorName} → {row.successorName}</strong><span>{relationshipLabels[row.relationshipType]} · {row.validFromYear ?? 'год не указан'} · <i className={`admin-status is-${row.reviewStatus}`}>{statusLabels[row.reviewStatus]}</i></span></summary><form action={saveConstructorLineage} className="admin-editor-form"><input type="hidden" name="id" value={row.id} /><LineageFields constructors={bundle.constructors} row={row} /><div className="admin-form-actions"><a href={row.sourceUrl} target="_blank" rel="noreferrer">Открыть источник ↗</a><button type="submit">Сохранить связь</button></div></form><form action={removeConstructorLineage} className="admin-result-delete"><input type="hidden" name="id" value={row.id} /><label><input type="checkbox" name="confirmDelete" value="yes" required /> Подтверждаю удаление связи</label><button type="submit">Удалить</button></form></details>)}</div>
      {!bundle.rows.length ? <p className="admin-editorial-empty">Проверяемые связи пока не добавлены</p> : null}
    </> : null}
  </section></main>;
}
