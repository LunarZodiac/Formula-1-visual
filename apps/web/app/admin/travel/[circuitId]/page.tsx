/* eslint-disable @next/next/no-img-element */
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { getAdminSession } from '../../../lib/admin-auth';
import { getAdminTravelPoints, isAdminDatabaseConfigured, isAdminLocalApiAvailable } from '../../../lib/admin-database';
import { isAdminSupabaseConfigured } from '../../../lib/supabase-admin';
import { AdminPagination } from '../../admin-pagination';
import { TravelPointsMap } from './travel-points-map';
import { TravelModuleNav } from './travel-module-nav';
import { applyTravelPointOsmTranslations, updateTravelPointsBulk } from '../../actions';

const statusLabels: Record<string, string> = { candidate: 'Кандидат', reviewed: 'Проверена', published: 'Опубликована', hidden: 'Скрыта' };
const roleLabels: Record<string, string> = { transport: 'Транспорт', stay: 'Размещение', explore: 'Достопримечательности', essential: 'Полезное рядом', circuit: 'Инфраструктура этапа' };
function distance(value: number) { return value < 1000 ? `${value.toLocaleString('ru-RU')} м` : `${(value / 1000).toLocaleString('ru-RU', { maximumFractionDigits: 1 })} км`; }

export default async function AdminCircuitTravelPage({ params, searchParams }: {
  params: Promise<{ circuitId: string }>;
  searchParams: Promise<{
    page?: string; q?: string; status?: string; category?: string; role?: string; photo?: string; featured?: string; translation?: string;
    distanceMin?: string; distanceMax?: string; importanceMin?: string; importanceMax?: string;
    bulkUpdated?: string; bulkError?: string; syncError?: string; translated?: string; translationError?: string; translationSyncError?: string;
  }>;
}) {
  if (!await getAdminSession()) redirect('/admin/login');
  if (!isAdminDatabaseConfigured()) redirect('/admin/overview');
  const [{ circuitId }, state] = await Promise.all([params, searchParams]);
  const canImport = !isAdminSupabaseConfigured() && await isAdminLocalApiAvailable();
  const page = Math.max(1, Number.parseInt(state.page ?? '1', 10) || 1);
  let registry: Awaited<ReturnType<typeof getAdminTravelPoints>> = null;
  try {
    registry = await getAdminTravelPoints(circuitId, {
      page, query: state.q, status: state.status, category: state.category, role: state.role,
      photo: state.photo, featured: state.featured, translation: state.translation, distanceMin: state.distanceMin,
      distanceMax: state.distanceMax, importanceMin: state.importanceMin, importanceMax: state.importanceMax,
    });
  } catch (error) {
    console.error(`Не удалось загрузить туристические точки трассы ${circuitId}`, error);
    return <main className="admin-shell"><section className="admin-directory"><Link className="admin-back-link" href="/admin/travel">← Вернуться к трассам</Link><div className="admin-alert is-error">База туристических точек временно недоступна. Повторите попытку позже</div></section></main>;
  }
  if (!registry) notFound();
  const totalPages = Math.max(1, Math.ceil(registry.filteredCount / registry.limit));
  if (page > totalPages) {
    const corrected = new URLSearchParams();
    for (const [key, value] of Object.entries(state)) if (key !== 'page' && value) corrected.set(key, value);
    corrected.set('page', String(totalPages));
    redirect(`/admin/travel/${encodeURIComponent(circuitId)}?${corrected}`);
  }
  const returnSearch = new URLSearchParams();
  for (const [key, value] of Object.entries(state)) {
    if (value && !['bulkUpdated', 'bulkError', 'syncError', 'translated', 'translationError', 'translationSyncError'].includes(key)) returnSearch.set(key, value);
  }
  const returnTo = `/admin/travel/${encodeURIComponent(circuitId)}${returnSearch.size ? `?${returnSearch}` : ''}`;
  return <main className="admin-shell"><section className="admin-directory admin-travel-points-directory">
    <Link className="admin-back-link" href="/admin/travel">← Вернуться к трассам</Link>
    <header><div><span className="admin-kicker">Туристический слой</span><h1>{registry.circuit.name}</h1><p>{registry.filteredCount} точек по текущему фильтру</p></div>{canImport ? <div className="admin-directory-header-actions"><Link href="/admin/travel/import">Импортировать из OpenStreetMap</Link></div> : null}</header>
    <TravelModuleNav circuitId={circuitId} active="points" availableSections={isAdminSupabaseConfigured() ? ['points', 'access', 'zones'] : undefined} />
    <form id="travel-point-column-filters" method="get" />
    <TravelPointsMap circuit={registry.circuit} mapPoints={registry.mapPoints} />
    {registry.mapPointsTruncated ? <div className="admin-alert">На карте показаны первые {registry.mapPointLimit.toLocaleString('ru-RU')} точек. Сузьте фильтры, чтобы отобразить нужный набор; таблица и общее количество остаются точными</div> : null}
    {state.bulkUpdated ? <div className="admin-alert">Обновлено точек: {state.bulkUpdated}</div> : null}
    {state.bulkError ? <div className="admin-alert is-error">Не удалось выполнить пакетное действие. Проверьте выбор и повторите попытку</div> : null}
    {state.syncError ? <div className="admin-alert">Изменения сохранены в базе. Публичный туристический слой обновится после отдельной публикации данных</div> : null}
    {state.translated !== undefined ? <div className="admin-alert is-success">Русские названия из OpenStreetMap применены: {state.translated}</div> : null}
    {state.translationError ? <div className="admin-alert is-error">Не удалось применить русские названия из OpenStreetMap</div> : null}
    {state.translationSyncError ? <div className="admin-alert">Названия сохранены в базе. Публичный туристический слой обновится после отдельной публикации данных</div> : null}
    <form action={updateTravelPointsBulk}>
      <input type="hidden" name="circuitId" value={circuitId} />
      <input type="hidden" name="returnTo" value={returnTo} />
      <div className="admin-bulk-actions">
        <select name="bulkOperation" defaultValue="" aria-label="Пакетное действие" required>
          <option value="" disabled>Действие с выбранными</option>
          <option value="status:candidate">Статус: кандидат</option><option value="status:reviewed">Статус: проверена</option>
          <option value="status:published">Статус: опубликована</option><option value="status:hidden">Статус: скрыта</option>
          <option value="featured:yes">Отобрать для сайта</option><option value="featured:no">Убрать из отбора</option>
        </select>
        <button type="submit">Применить к выбранным</button>
        <button type="submit" formAction={applyTravelPointOsmTranslations} formNoValidate className="is-secondary">Подставить русские названия из OSM</button>
      </div>
    <div className="admin-table-wrap"><table><colgroup><col className="is-select"/><col className="is-point"/><col className="is-category"/><col className="is-distance"/><col className="is-priority"/><col className="is-status"/><col className="is-photo"/><col className="is-action"/></colgroup><thead className="admin-column-filters"><tr>
      <th><span>Выбор</span></th>
      <th><span>Точка</span><input form="travel-point-column-filters" name="q" defaultValue={state.q ?? ''} placeholder="Название или ID" aria-label="Фильтр по названию или ID" /><select form="travel-point-column-filters" name="translation" defaultValue={state.translation ?? ''} aria-label="Фильтр по наличию русского названия"><option value="">Любой перевод</option><option value="ready">Есть русское название</option><option value="missing">Нужен перевод</option></select><select form="travel-point-column-filters" name="featured" defaultValue={state.featured ?? ''} aria-label="Фильтр отбора для сайта"><option value="">Любой отбор</option><option value="yes">Для сайта</option><option value="no">Не отобраны</option></select></th>
      <th><span>Категория</span><select form="travel-point-column-filters" name="role" defaultValue={state.role ?? ''} aria-label="Фильтр по группе"><option value="">Все группы</option>{Object.entries(roleLabels).map(([value,label]) => <option key={value} value={value}>{label}</option>)}</select><select form="travel-point-column-filters" name="category" defaultValue={state.category ?? ''} aria-label="Фильтр по категории"><option value="">Все категории</option>{registry.categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></th>
      <th><span>Удаление от трассы</span><div><input form="travel-point-column-filters" name="distanceMin" type="number" min="0" step="0.1" defaultValue={state.distanceMin ?? ''} placeholder="От, км" aria-label="Минимальное удаление в километрах" /><input form="travel-point-column-filters" name="distanceMax" type="number" min="0" step="0.1" defaultValue={state.distanceMax ?? ''} placeholder="До, км" aria-label="Максимальное удаление в километрах" /></div></th>
      <th><span>Приоритет</span><div><input form="travel-point-column-filters" name="importanceMin" type="number" min="0" max="100" defaultValue={state.importanceMin ?? ''} placeholder="От" aria-label="Минимальный приоритет" /><input form="travel-point-column-filters" name="importanceMax" type="number" min="0" max="100" defaultValue={state.importanceMax ?? ''} placeholder="До" aria-label="Максимальный приоритет" /></div></th>
      <th><span>Статус</span><select form="travel-point-column-filters" name="status" defaultValue={state.status ?? ''} aria-label="Фильтр по статусу"><option value="">Все статусы</option>{Object.entries(statusLabels).map(([value,label]) => <option key={value} value={value}>{label}</option>)}</select></th>
      <th><span>Фото</span><select form="travel-point-column-filters" name="photo" defaultValue={state.photo ?? ''} aria-label="Фильтр по наличию фотографии"><option value="">Все</option><option value="yes">Есть</option><option value="no">Нет</option></select></th>
      <th><span className="admin-filter-actions"><button form="travel-point-column-filters" type="submit">Применить</button><Link href={`/admin/travel/${encodeURIComponent(circuitId)}`}>Сбросить</Link></span></th>
    </tr></thead><tbody>{registry.rows.map((point) => <tr key={point.id}>
      <td><input type="checkbox" name="pointId" value={point.id} aria-label={`Выбрать точку ${point.nameRu ?? point.name}`} /></td>
      <td><strong className={point.nameRu ? undefined : 'admin-missing-translation'}>{point.nameRu || 'Перевод не заполнен'}</strong>{point.nameRu !== point.name ? <small className="admin-original-name">Оригинал: <bdi>{point.name}</bdi></small> : null}<small><code>{point.id}</code>{point.isFeatured ? ' · выбрана для сайта' : ''}</small></td>
      <td>{point.categoryName}<small>{roleLabels[point.role] ?? point.role}</small></td><td>{distance(point.distanceToCircuitM)}</td><td>{point.importance}</td>
      <td><span className={`admin-status is-${point.reviewStatus}`}>{statusLabels[point.reviewStatus] ?? point.reviewStatus}</span></td>
      <td>{point.photo ? <img className="admin-travel-point-thumb" src={point.photo.url} alt={point.photo.altTextRu ?? ''} loading="lazy" /> : null}</td>
      <td><Link className="admin-row-action" href={`/admin/travel/${encodeURIComponent(circuitId)}/points/${encodeURIComponent(point.id)}`}>Редактировать →</Link></td>
    </tr>)}</tbody></table></div></form>
    {!registry.rows.length ? <p className="admin-directory-empty">По этому фильтру точек нет</p> : null}
    <AdminPagination basePath={`/admin/travel/${circuitId}`} page={page} totalPages={totalPages} parameters={{
      q: state.q, status: state.status, category: state.category, role: state.role, photo: state.photo, translation: state.translation,
      featured: state.featured, distanceMin: state.distanceMin, distanceMax: state.distanceMax,
      importanceMin: state.importanceMin, importanceMax: state.importanceMax,
    }} label="Страницы точек" />
  </section></main>;
}
