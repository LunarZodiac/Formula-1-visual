import Link from 'next/link';
import { redirect } from 'next/navigation';
import type { CSSProperties } from 'react';
import { getAdminSession } from '../../lib/admin-auth';
import { getAdminTravelRegistry, getAdminLocalCapabilities, isAdminDatabaseConfigured } from '../../lib/admin-database';
import { AdminPagination } from '../admin-pagination';
import { saveTravelCategoryIcon, uploadTravelCategoryIcon } from '../actions';

export default async function AdminTravelPage({ searchParams }: {
  searchParams: Promise<{ page?: string; q?: string; imported?: string; circuit?: string; categorySaved?: string; categorySyncError?: string; categoryPublicPending?: string; error?: string }>;
}) {
  if (!await getAdminSession()) redirect('/admin/login');
  const state = await searchParams;
  const localCapabilities = await getAdminLocalCapabilities();
  const localApiAvailable = localCapabilities !== null;
  const canUploadCategoryIcon = localCapabilities?.mediaStorageReady === true;
  const page = Math.max(1, Number.parseInt(state.page ?? '1', 10) || 1);
  let registry: Awaited<ReturnType<typeof getAdminTravelRegistry>> | null = null;
  let databaseError = !isAdminDatabaseConfigured();
  if (!databaseError) {
    try { registry = await getAdminTravelRegistry({ page, query: state.q }); }
    catch (error) { console.error('Не удалось загрузить туристический каталог', error); databaseError = true; }
  }
  const totalPages = Math.max(1, Math.ceil((registry?.filteredCount ?? 0) / (registry?.limit ?? 30)));
  if (registry && page > totalPages) redirect(`/admin/travel?page=${totalPages}`);
  return <main className="admin-shell"><section className="admin-directory admin-travel-directory">
    <header><div><span className="admin-kicker">Туристический слой</span><h1>Точки и маршруты</h1></div><div className="admin-directory-heading-actions"><p>Данные организованы по трассам; даты действия используются только для временной инфраструктуры этапа</p>{localApiAvailable ? <Link className="admin-row-action" href="/admin/travel/import">Импортировать точки</Link> : null}</div></header>
    {state.imported ? <div className="admin-alert is-success">Импортировано кандидатов: {state.imported}. Перед публикацией проверьте координаты и источники</div> : null}
    {databaseError ? <div className="admin-alert is-error">База туристических данных недоступна</div> : null}
    {registry ? <>
      <section className="admin-travel-summary" aria-label="Сводка туристического слоя">
        <div><strong>{registry.summary.circuits}</strong><span>трасс</span></div>
        <div><strong>{registry.summary.points}</strong><span>точек в работе</span></div>
        <div><strong>{registry.summary.publishedPoints}</strong><span>опубликовано</span></div>
        <div><strong>{registry.summary.zones}</strong><span>районов и зон</span></div>
        <div><strong>{registry.summary.routes}</strong><span>маршрутов</span></div>
      </section>
      <section className="admin-travel-categories">
        <header><div><span className="admin-kicker">Система обозначений</span><h2>Категории и значки</h2></div><p>{canUploadCategoryIcon ? 'Можно использовать текстовый символ или загрузить SVG, PNG, JPG либо WebP' : 'Можно использовать текстовый символ; загрузка файла доступна в локальном редакторе'}</p></header>
        {state.categorySaved ? <div className="admin-alert is-success">Значок категории обновлён</div> : null}
        {state.categoryPublicPending ? <div className="admin-alert">Публичные туристические данные обновятся после отдельной публикации</div> : null}
        {state.categorySyncError ? <div className="admin-alert">Значок сохранён в Supabase, но локальная копия базы не обновилась</div> : null}
        {state.error === 'category' ? <div className="admin-alert is-error">Не удалось обновить текстовый значок. Используйте латинские буквы, цифры и дефис</div> : null}
        {state.error === 'category-file' ? <div className="admin-alert is-error">Не удалось загрузить файл значка. Разрешены SVG, PNG, JPG и WebP до 2 МБ</div> : null}
        <div>{registry.categoryGroups.map((group) => <article key={group.id} style={{ '--travel-group-colour': group.colour } as CSSProperties}><h3>{group.name}</h3><ul>{group.categories.map((category) => {
          const customIcon = category.icon && (category.icon.startsWith('/') || category.icon.startsWith('https://')) ? category.icon : null;
          return <li key={category.id}>
            <div className="admin-travel-category-icon-preview">{customIcon
              // eslint-disable-next-line @next/next/no-img-element
              ? <img src={customIcon} alt="" aria-hidden="true" />
              : <span>{category.icon ?? category.id.slice(0, 1).toUpperCase()}</span>}</div>
            <div className="admin-travel-category-copy"><strong>{category.name}</strong><small>с масштаба {category.minZoom}</small></div>
            <form action={saveTravelCategoryIcon} className="admin-travel-category-text-icon"><input type="hidden" name="id" value={category.id} /><input name="icon" defaultValue={customIcon ? category.id : category.icon ?? ''} aria-label={`Текстовый значок: ${category.name}`} required pattern="[a-z][a-z0-9-]{0,39}" /><button type="submit" title={`Сохранить текстовый значок ${category.name}`}>✓</button></form>
            {canUploadCategoryIcon ? <form action={uploadTravelCategoryIcon} className="admin-travel-category-file-icon"><input type="hidden" name="id" value={category.id} /><label><span>Файл</span><input type="file" name="iconFile" accept="image/svg+xml,image/png,image/jpeg,image/webp" required /></label><button type="submit">Загрузить</button></form> : null}
          </li>;
        })}</ul></article>)}</div>
      </section>
      <form className="admin-circuit-filters" method="get"><label className="is-wide"><span>Найти трассу</span><input name="q" defaultValue={state.q ?? ''} placeholder="Спа, Бахрейн, circuit ID…" /></label><button type="submit">Найти</button><Link href="/admin/travel">Сбросить</Link></form>
      <div className="admin-table-wrap"><table><thead><tr><th>Трасса</th><th>Точки</th><th>Жильё</th><th>Районы и зоны</th><th>Маршруты</th><th>Состояние</th><th /></tr></thead><tbody>{registry.rows.map((circuit) => <tr key={circuit.id}>
        <td><strong>{circuit.name}</strong><small><code>{circuit.id}</code></small></td>
        <td>{circuit.pointCount}<small>{circuit.publishedPointCount} опубликовано · {circuit.candidatePointCount} кандидатов</small></td>
        <td>{circuit.stayPointCount}<small>появляются при приближении к району</small></td>
        <td>{circuit.zoneCount}</td>
        <td>{circuit.routeCount}<small>{circuit.publishedRouteCount} опубликовано</small></td>
        <td><span className={`admin-status is-${circuit.editorialStatus ?? 'draft'}`}>{circuit.editorialStatus ?? 'Не настроено'}</span></td>
        <td>{localApiAvailable ? <Link className="admin-row-action" href={`/admin/travel/${encodeURIComponent(circuit.id)}`}>Открыть точки →</Link> : <span>Точки доступны в локальном редакторе</span>}</td>
      </tr>)}</tbody></table></div>
      <AdminPagination basePath="/admin/travel" page={Math.min(page, totalPages)} totalPages={totalPages} parameters={{ q: state.q }} label="Страницы трасс" />
      <section className="admin-travel-import-history"><header><div><span className="admin-kicker">Воспроизводимость</span><h2>Последние импорты</h2></div><p>Каждый предпросмотр фиксирует трассу, источник, параметры и итог подтверждения</p></header>{registry.recentImports.length ? <div className="admin-table-wrap"><table><thead><tr><th>Время</th><th>Трасса</th><th>Источник</th><th>Найдено</th><th>Импортировано</th><th>Статус</th></tr></thead><tbody>{registry.recentImports.map((run) => <tr key={run.id}><td>{new Intl.DateTimeFormat('ru-RU', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(run.createdAt))}</td><td><strong>{run.circuitName}</strong><small><code>{run.circuitId}</code></small></td><td>{run.provider}</td><td>{run.discoveredCount}</td><td>{run.importedCount}</td><td><span className={`admin-status is-${run.status}`}>{run.status === 'imported' ? 'Импортирован' : run.status === 'previewed' ? 'Предпросмотр' : run.status === 'expired' ? 'Истёк' : 'Ошибка'}</span></td></tr>)}</tbody></table></div> : <p className="admin-directory-empty">Запусков импорта пока нет</p>}</section>
    </> : null}
  </section></main>;
}
