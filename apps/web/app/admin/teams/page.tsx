import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getAllTeamCatalog } from '../../data/season-catalogs';
import { getAdminSession } from '../../lib/admin-auth';
import { getAdminConstructorEntries, isAdminDatabaseConfigured } from '../../lib/admin-database';
import { AdminPagination } from '../admin-pagination';

const pageSize = 25;
const firstSeason = 1950;
const currentSeason = new Date().getUTCFullYear();

export default async function AdminTeamsPage({ searchParams }: {
  searchParams: Promise<{ season?: string; q?: string; page?: string }>;
}) {
  if (!await getAdminSession()) redirect('/admin/login');
  const requested = await searchParams;
  const parsedSeason = Number(requested.season);
  const season = Number.isInteger(parsedSeason) && parsedSeason >= firstSeason && parsedSeason <= 2100 ? parsedSeason : null;
  const query = requested.q?.trim().slice(0, 120) ?? '';
  const normalizedQuery = query.toLocaleLowerCase('ru-RU');
  const parsedPage = Number.parseInt(requested.page ?? '1', 10);
  const page = Number.isFinite(parsedPage) && parsedPage > 0 ? parsedPage : 1;
  const allTeams = getAllTeamCatalog().teams.filter((team) => !normalizedQuery || (
    (team.id + ' ' + team.name + ' ' + team.aliases.join(' ')).toLocaleLowerCase('ru-RU').includes(normalizedQuery)
  ));

  let seasonRows: Awaited<ReturnType<typeof getAdminConstructorEntries>>['rows'] = [];
  let error = false;
  if (season !== null) {
    error = !isAdminDatabaseConfigured();
    if (!error) {
      try { seasonRows = (await getAdminConstructorEntries(season, query)).rows; }
      catch (cause) { console.error('Не удалось загрузить команды в админке', cause); error = true; }
    }
  }
  const rows = season === null ? allTeams : seasonRows;
  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const pageStart = (currentPage - 1) * pageSize;
  const visibleTeams = allTeams.slice(pageStart, pageStart + pageSize);
  const visibleSeasonRows = seasonRows.slice(pageStart, pageStart + pageSize);
  const seasonOptions = Array.from({ length: currentSeason - firstSeason + 1 }, (_, index) => currentSeason - index);

  return <main className="admin-shell"><section className="admin-directory admin-team-directory">
    <header><div><span className="admin-kicker">Историческая медиатека</span><h1>Команды и болиды</h1></div><div className="admin-directory-heading-actions"><p>{season === null ? rows.length + ' команд за 1950–' + currentSeason : rows.length + ' команд в сезоне ' + season} · изображения назначаются отдельно по сезонам</p><Link className="admin-row-action" href="/admin/teams/lineage">Преемственность команд →</Link></div></header>
    {error ? <div className="admin-alert is-error">Локальная база недоступна. Проверьте настройки и перезапустите сайт</div> : null}
    <form className="admin-directory-search admin-team-directory-filters" method="get"><label><span>Название или ID</span><input name="q" type="search" defaultValue={query} placeholder="Найти команду" /></label><label><span>Срез данных</span><select name="season" defaultValue={season === null ? '' : String(season)}><option value="">Все исторические команды</option>{seasonOptions.map((year) => <option value={year} key={year}>Сезон {year}</option>)}</select></label><button type="submit">Применить</button><Link href="/admin/teams">Сбросить</Link></form>
    <div className="admin-table-wrap"><table><thead><tr>
      <th>Команда</th>
      <th><span>ID</span></th>
      {season === null ? <><th><span>Период</span></th><th><span>Сезонов</span></th><th><span>Медиа последнего сезона</span></th></> : <><th><span>Модель</span></th><th><span>Двигатель</span></th><th><span>Медиа</span></th></>}
      <th><span className="sr-only">Действие</span></th>
    </tr></thead><tbody>
      {season === null ? visibleTeams.map((team) => {
        const editSeason = team.latestSeason;
        const hasMedia = Boolean(team.logoUrl || team.carImageUrl);
        return <tr key={team.id}><td><strong>{team.name}</strong><small>{team.aliases.length > 1 ? team.aliases.slice(0, 3).join(' · ') : 'Историческая команда'}</small></td><td><code>{team.id}</code></td><td>{team.firstSeason}–{team.latestSeason}</td><td>{team.seasonCount}</td><td><span className={'admin-status ' + (hasMedia ? 'is-ready' : '')}>{hasMedia ? 'Есть' : 'Нет'}</span><small>Редактор откроется для {editSeason} года</small></td><td><Link className={'admin-photo-link ' + (hasMedia ? 'has-photo' : '')} href={'/admin/teams/' + editSeason + '/' + encodeURIComponent(team.id)}>{hasMedia ? 'Изменить медиа' : 'Добавить медиа'}</Link></td></tr>;
      }) : visibleSeasonRows.map((entry) => {
        const hasMedia = Boolean(entry.carImageUrl || entry.logoImageUrl);
        return <tr key={entry.constructorId}><td>{entry.displayName}</td><td><code>{entry.constructorId}</code></td><td>{entry.carModel || '—'}</td><td>{entry.engineName || '—'}</td><td><span className={'admin-status ' + (hasMedia ? 'is-ready' : '')}>{hasMedia ? 'Есть' : 'Нет'}</span></td><td><Link className={'admin-photo-link ' + (hasMedia ? 'has-photo' : '')} href={'/admin/teams/' + season + '/' + encodeURIComponent(entry.constructorId)}>{hasMedia ? 'Изменить медиа' : 'Добавить медиа'}</Link></td></tr>;
      })}
    </tbody></table></div>
    {!rows.length && !error ? <p className="admin-directory-empty">По выбранным условиям команды не найдены</p> : null}
    {!error ? <AdminPagination basePath="/admin/teams" page={currentPage} totalPages={totalPages} parameters={{ season: season ?? '', q: query }} label="Страницы команд" /> : null}
  </section></main>;
}
