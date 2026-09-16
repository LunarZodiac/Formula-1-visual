import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getAdminSession } from '../../lib/admin-auth';
import { getAdminSeasons, isAdminDatabaseConfigured } from '../../lib/admin-database';
import { AdminPagination } from '../admin-pagination';
import { saveSeason, syncSeasonFromJolpica } from '../actions';

const pageSize = 25;
const statusLabels = { planned: 'Запланирован', active: 'Идёт сейчас', completed: 'Завершён', cancelled: 'Отменён' } as const;

export default async function AdminSeasonsPage({ searchParams }: {
  searchParams: Promise<{ page?: string; q?: string; status?: string; saved?: string; syncError?: string; error?: string; synced?: string; snapshot?: string; syncFailed?: string; syncMessage?: string }>;
}) {
  if (!await getAdminSession()) redirect('/admin/login');
  const state = await searchParams;
  const requestedPage = Number.parseInt(state.page ?? '1', 10);
  let rows: Awaited<ReturnType<typeof getAdminSeasons>> = [];
  let databaseError = !isAdminDatabaseConfigured();
  if (!databaseError) {
    try { rows = await getAdminSeasons(); } catch (error) { console.error('Не удалось загрузить сезоны', error); databaseError = true; }
  }
  const query = state.q?.trim().slice(0, 4) ?? '';
  const status = state.status && state.status in statusLabels ? state.status : '';
  const filteredRows = rows.filter((season) => (!query || String(season.year).includes(query)) && (!status || season.status === status));
  const totalPages = Math.max(1, Math.ceil(filteredRows.length / pageSize));
  const page = Math.min(Number.isFinite(requestedPage) && requestedPage > 0 ? requestedPage : 1, totalPages);
  const visibleRows = filteredRows.slice((page - 1) * pageSize, page * pageSize);

  return <main className="admin-shell"><section className="admin-directory admin-season-directory">
    <header><div><span className="admin-kicker">Календарь чемпионата</span><h1>Сезоны</h1></div><p>{filteredRows.length} из {rows.length} сезонов · в публичный выбор попадают сезоны с календарём или подготовленным снимком</p></header>
    {databaseError ? <div className="admin-alert is-error">Локальная база недоступна. Проверьте настройки и перезапустите сайт</div> : null}
    {state.saved ? <div className="admin-alert is-success">Сезон {state.saved} сохранён</div> : null}
    {state.syncError === '1' ? <div className="admin-alert">Сезон сохранён в базе, но публичный список сезонов не обновился</div> : null}
    {state.error ? <div className="admin-alert is-error">Не удалось сохранить сезон {state.error}. Проверьте год, статус, число этапов и источник</div> : null}
    {state.synced ? <div className="admin-alert is-success">Сезон {state.synced} обновлён: API → исходный JSON → PostgreSQL → публичные каталоги{state.snapshot ? <small>Снимок: {state.snapshot}</small> : null}</div> : null}
    {state.syncFailed ? <div className="admin-alert is-error">Обновление сезона {state.syncFailed === 'invalid-season' ? '' : state.syncFailed} не завершилось в интерфейсе. Проверьте журнал локального сервера и дождитесь окончания текущего процесса перед повторным запуском: исходный снимок или запись в БД могли уже сохраниться{state.syncMessage ? <small>{state.syncMessage}</small> : null}</div> : null}

    <form action={syncSeasonFromJolpica} className="admin-season-sync">
      <div><span className="admin-kicker">Автоматическое обновление</span><strong>Получить свежие данные Jolpica</strong><p>Сначала сохраняется исходный JSON с контрольной суммой, затем выполняются транзакционный импорт, аудит и обновление публичных файлов</p></div>
      <label><span>Сезон</span><input name="season" type="number" min="1950" max={new Date().getUTCFullYear() + 1} defaultValue={new Date().getUTCFullYear()} required /></label>
      <button type="submit">Получить и обновить</button>
    </form>

    <form action={saveSeason} className="admin-season-create admin-editor-form">
      <input type="hidden" name="create" value="1" />
      <label><span>Новый сезон</span><input name="year" type="number" min="1950" max="2100" required placeholder="2028" /><small>Появится на сайте после добавления календаря</small></label>
      <label><span>Статус</span><select name="status" defaultValue="planned">{Object.entries(statusLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
      <label><span>Этапов запланировано</span><input name="roundsPlanned" type="number" min="0" max="40" /></label>
      <label><span>URL источника</span><input name="sourceUrl" type="url" required placeholder="https://…" /></label>
      <button type="submit">Добавить сезон</button>
    </form>

    <form id="season-column-filters" method="get" />
    <div className="admin-table-wrap"><table><thead className="admin-column-filters"><tr>
      <th><span>Сезон</span><input form="season-column-filters" name="q" inputMode="numeric" maxLength={4} defaultValue={query} placeholder="Например, 2026" aria-label="Фильтр по году сезона" /></th>
      <th><span>Статус</span><select form="season-column-filters" name="status" defaultValue={status} aria-label="Фильтр по статусу сезона"><option value="">Все статусы</option>{Object.entries(statusLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></th>
      <th><span>Этапов в базе</span></th><th><span>Запланировано</span></th><th><span>Источник изменений</span></th>
      <th><span className="admin-filter-actions"><button form="season-column-filters" type="submit">Применить</button><Link href="/admin/seasons">Сбросить</Link></span></th>
    </tr></thead><tbody>
      {visibleRows.map((season) => {
        const formId = `season-${season.year}`;
        return <tr key={season.year}>
          <td><strong>{season.year}</strong><form id={formId} action={saveSeason}><input type="hidden" name="year" value={season.year} /></form></td>
          <td><select form={formId} name="status" defaultValue={season.status} aria-label={`Статус сезона ${season.year}`}>{Object.entries(statusLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></td>
          <td>{season.racesAvailable}</td>
          <td><input form={formId} name="roundsPlanned" type="number" min="0" max="40" defaultValue={season.roundsPlanned ?? ''} aria-label={`Плановое число этапов сезона ${season.year}`} /></td>
          <td><input form={formId} name="sourceUrl" type="url" required defaultValue={season.sourceUrl ?? ''} placeholder="https://…" aria-label={`Источник сезона ${season.year}`} /></td>
          <td><button form={formId} type="submit">Сохранить</button></td>
        </tr>;
      })}
    </tbody></table></div>
    {!visibleRows.length && !databaseError ? <p className="admin-directory-empty">По выбранным фильтрам сезоны не найдены</p> : null}
    {!databaseError ? <AdminPagination basePath="/admin/seasons" page={page} totalPages={totalPages} parameters={{ q: query, status }} label="Страницы сезонов" /> : null}
  </section></main>;
}
