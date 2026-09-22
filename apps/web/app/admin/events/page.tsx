import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getAdminSession } from '../../lib/admin-auth';
import { getAdminEvents, isAdminDatabaseConfigured } from '../../lib/admin-database';
import { AdminPagination } from '../admin-pagination';

const statusLabels: Record<string, string> = {
  scheduled: 'Запланирован', live: 'Идёт сейчас', completed: 'Завершён',
  postponed: 'Перенесён', cancelled: 'Отменён',
};

export default async function AdminEventsPage({ searchParams }: {
  searchParams: Promise<{ page?: string; season?: string; q?: string; status?: string; circuit?: string }>;
}) {
  if (!await getAdminSession()) redirect('/admin/login');
  const state = await searchParams;
  const page = Math.max(1, Number.parseInt(state.page ?? '1', 10) || 1);
  const season = Number.parseInt(state.season ?? '', 10);
  let registry: Awaited<ReturnType<typeof getAdminEvents>> | null = null;
  let databaseError = !isAdminDatabaseConfigured();
  if (!databaseError) {
    try { registry = await getAdminEvents({ page, season: Number.isInteger(season) ? season : undefined, query: state.q, status: state.status, circuit: state.circuit }); }
    catch (error) { console.error('Не удалось загрузить этапы', error); databaseError = true; }
  }
  const totalPages = Math.max(1, Math.ceil((registry?.filteredCount ?? 0) / (registry?.limit ?? 30)));
  const parameters = { season: state.season, q: state.q, status: state.status, circuit: state.circuit };
  if (registry && page > totalPages) {
    const corrected = new URLSearchParams();
    for (const [key, value] of Object.entries(parameters)) if (value) corrected.set(key, value);
    corrected.set('page', String(totalPages)); redirect(`/admin/events?${corrected}`);
  }
  const newEventHref = `/admin/events/new${state.season ? `?season=${encodeURIComponent(state.season)}` : ''}`;
  return <main className="admin-shell"><section className="admin-directory admin-event-directory">
    <header><div><span className="admin-kicker">Календарь и результаты</span><h1>Этапы</h1></div><div className="admin-directory-heading-actions"><p>{registry ? `${registry.filteredCount} этапов по текущим фильтрам` : 'Календарные записи чемпионата'}</p><Link className="admin-row-action" href={newEventHref}>Добавить этап</Link></div></header>
    {databaseError ? <div className="admin-alert is-error">Локальная база этапов недоступна</div> : null}
    {registry ? <form className="admin-directory-search admin-event-filters" method="get">
      <label><span>Сезон</span><select name="season" defaultValue={state.season ?? ''}><option value="">Все сезоны</option>{registry.seasons.map((year) => <option key={year} value={year}>{year}</option>)}</select></label>
      <label><span>Название или ID</span><input name="q" defaultValue={state.q ?? ''} placeholder="Найти этап" /></label>
      <label><span>Трасса</span><select name="circuit" defaultValue={state.circuit ?? ''}><option value="">Все трассы</option>{registry.circuits.map((circuit) => <option key={circuit.id} value={circuit.id}>{circuit.name}</option>)}</select></label>
      <label><span>Статус</span><select name="status" defaultValue={state.status ?? ''}><option value="">Все статусы</option>{Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      <button type="submit">Применить</button><Link href="/admin/events">Сбросить</Link>
    </form> : null}
    {registry ? <div className="admin-table-wrap"><table><thead><tr>
      <th>Этап</th><th>Дата</th><th>Трасса</th><th>Конфигурация</th><th>Статус</th><th>Сессии</th><th>Победитель</th><th><span className="sr-only">Действие</span></th>
    </tr></thead><tbody>
      {registry.rows.map((event) => <tr key={event.id}>
        <td><strong>{event.seasonYear} · {event.round.toString().padStart(2, '0')}</strong><small><code>{event.id}</code> · {event.name}</small></td>
        <td>{event.raceDate ? new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(`${event.raceDate}T12:00:00Z`)) : 'Не указана'}<small>{event.startTimeUtc ? `${event.startTimeUtc.slice(0, 5)} UTC` : 'Время не указано'}</small></td>
        <td>{event.circuitName}<small><code>{event.circuitId}</code></small></td>
        <td>{event.layoutName ?? 'Не выбрана'}<small>{event.layoutId ?? 'Историческая привязка не задана'}</small></td>
        <td><span className={`admin-status is-${event.status}`}>{statusLabels[event.status] ?? event.status}</span></td>
        <td>{event.completedSessionCount}/{event.sessionCount}<small>{event.resultCount} строк результатов</small></td>
        <td>{event.winner?.name ?? '—'}<small>{event.winner ? 'Вычислено по результату гонки' : 'Результат гонки отсутствует'}</small></td>
        <td><Link className="admin-row-action" href={`/admin/events/${encodeURIComponent(event.id)}`}>Редактировать →</Link></td>
      </tr>)}
    </tbody></table></div> : null}
    {registry && !registry.rows.length ? <p className="admin-directory-empty">По выбранным фильтрам этапы не найдены</p> : null}
    {registry ? <AdminPagination basePath="/admin/events" page={Math.min(page, totalPages)} totalPages={totalPages} parameters={parameters} label="Страницы этапов" /> : null}
  </section></main>;
}
