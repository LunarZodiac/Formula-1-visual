import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getAdminSession } from '../../lib/admin-auth';
import { getAdminHistoryEras, isAdminDatabaseConfigured } from '../../lib/admin-database';

const statusLabels: Record<string, string> = {
  draft: 'Черновик',
  review: 'На проверке',
  reviewed: 'Проверена',
  published: 'Опубликована',
  hidden: 'Скрыта',
};

export default async function AdminHistoryPage() {
  if (!await getAdminSession()) redirect('/admin/login');
  let eras: Awaited<ReturnType<typeof getAdminHistoryEras>>['rows'] = [];
  let databaseError = !isAdminDatabaseConfigured();
  if (!databaseError) {
    try { eras = (await getAdminHistoryEras()).rows; }
    catch (error) { console.error('Не удалось загрузить эпохи истории', error); databaseError = true; }
  }

  return <main className="admin-shell"><section className="admin-directory">
    <header><div><span className="admin-kicker">Хронология чемпионата</span><h1>История</h1></div><p>{eras.length || 6} эпох · редакционные тексты, медиа и источники</p></header>
    {databaseError ? <div className="admin-alert is-error">База данных истории недоступна</div> : null}
    {!databaseError && eras.length ? <div className="admin-table-wrap"><table><thead><tr><th>Эпоха</th><th>Годы</th><th>Статус</th><th>Блоки</th><th /></tr></thead><tbody>{eras.map((era) => <tr key={era.slug}>
      <td><strong>{era.titleRu}</strong><small><code>{era.slug}</code></small></td>
      <td>{era.yearsLabel}</td>
      <td><span className={`admin-status is-${era.editorialStatus}`}>{statusLabels[era.editorialStatus] ?? era.editorialStatus}</span></td>
      <td>{era.blockCount}</td>
      <td><Link className="admin-row-action" href={`/admin/history/${encodeURIComponent(era.slug)}`}>Редактировать →</Link></td>
    </tr>)}</tbody></table></div> : null}
    {!databaseError && !eras.length ? <p className="admin-directory-empty">Эпохи ещё не загружены</p> : null}
  </section></main>;
}
