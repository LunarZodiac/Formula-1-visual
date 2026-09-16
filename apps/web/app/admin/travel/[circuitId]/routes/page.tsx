import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { getAdminSession } from '../../../../lib/admin-auth';
import { getAdminTravelRoutes, isAdminDatabaseConfigured } from '../../../../lib/admin-database';

const typeLabels: Record<string, string> = {
  arrival: 'Прибытие', race_day: 'Гоночный день', event_shuttle: 'Трансфер', park_and_ride: 'P+R',
  tourist_half_day: 'Полдня', tourist_full_day: 'Полный день', walking: 'Пешком', scenic_drive: 'Обзорная поездка',
};
const statusLabels: Record<string, string> = {
  candidate: 'Кандидат', reviewed: 'Проверен', published: 'Опубликован', hidden: 'Скрыт',
};

export default async function AdminTravelRoutesPage({ params, searchParams }: {
  params: Promise<{ circuitId: string }>;
  searchParams: Promise<{ generated?: string; q?: string; type?: string; status?: string; geometry?: string }>;
}) {
  if (!await getAdminSession()) redirect('/admin/login');
  if (!isAdminDatabaseConfigured()) redirect('/admin/overview');
  const [{ circuitId }, state] = await Promise.all([params, searchParams]);
  let registry: Awaited<ReturnType<typeof getAdminTravelRoutes>> = null;
  try { registry = await getAdminTravelRoutes(circuitId); }
  catch (error) {
    console.error(`Не удалось загрузить маршруты трассы ${circuitId}`, error);
    return <main className="admin-shell"><section className="admin-directory"><Link className="admin-back-link" href={'/admin/travel/' + encodeURIComponent(circuitId)}>← Вернуться к точкам</Link><div className="admin-alert is-error">Локальная база маршрутов временно недоступна. Проверьте локальный сервер и повторите попытку</div></section></main>;
  }
  if (!registry) notFound();

  const query = state.q?.trim().slice(0, 120).toLocaleLowerCase('ru-RU') ?? '';
  const type = state.type && state.type in typeLabels ? state.type : '';
  const status = state.status && state.status in statusLabels ? state.status : '';
  const geometry = state.geometry === 'yes' || state.geometry === 'no' ? state.geometry : '';
  const rows = registry.rows.filter((route) => (
    (!query || (route.nameRu + ' ' + route.id).toLocaleLowerCase('ru-RU').includes(query))
    && (!type || route.routeType === type)
    && (!status || route.reviewStatus === status)
    && (!geometry || (geometry === 'yes' ? route.hasGeometry : !route.hasGeometry))
  ));

  return <main className="admin-shell"><section className="admin-directory">
    <Link className="admin-back-link" href={'/admin/travel/' + encodeURIComponent(circuitId)}>← Вернуться к точкам</Link>
    <header><div><span className="admin-kicker">Маршруты</span><h1>{registry.circuit.name}</h1></div><p>{rows.length} из {registry.rows.length} маршрутов<br/><Link href={'/admin/travel/' + encodeURIComponent(circuitId) + '/routes/generate'}>Предложить автоматически →</Link><br/><Link href={'/admin/travel/' + encodeURIComponent(circuitId) + '/routes/new'}>Добавить вручную →</Link></p></header>
    {state.generated ? <div className="admin-alert is-success">Создано черновиков маршрутов: {state.generated}</div> : null}
    <form id="route-column-filters" method="get" />
    <div className="admin-table-wrap"><table><thead className="admin-column-filters"><tr>
      <th><span>Маршрут</span><input form="route-column-filters" name="q" defaultValue={state.q ?? ''} placeholder="Название или ID" aria-label="Фильтр маршрутов по названию или ID" /></th>
      <th><span>Тип</span><select form="route-column-filters" name="type" defaultValue={type} aria-label="Фильтр по типу маршрута"><option value="">Все типы</option>{Object.entries(typeLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></th>
      <th><span>Режим</span></th><th><span>Расстояние</span></th><th><span>Время</span></th>
      <th><span>Линия</span><select form="route-column-filters" name="geometry" defaultValue={geometry} aria-label="Фильтр по наличию линии"><option value="">Любое состояние</option><option value="yes">Есть</option><option value="no">Нет</option></select></th>
      <th><span>Статус</span><select form="route-column-filters" name="status" defaultValue={status} aria-label="Фильтр по статусу маршрута"><option value="">Все статусы</option>{Object.entries(statusLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></th>
      <th><span className="admin-filter-actions"><button form="route-column-filters" type="submit">Применить</button><Link href={'/admin/travel/' + encodeURIComponent(circuitId) + '/routes'}>Сбросить</Link></span></th>
    </tr></thead><tbody>{rows.map((route) => <tr key={route.id}>
      <td><strong>{route.nameRu}</strong><small>{route.id} · {route.stopCount} остановок</small></td>
      <td>{typeLabels[route.routeType] ?? route.routeType}</td><td>{route.travelMode}</td>
      <td>{(route.distanceM / 1000).toLocaleString('ru-RU')} км</td><td>{route.durationMinutes} мин</td>
      <td>{route.hasGeometry ? 'Есть' : 'Нет'}</td>
      <td><span className={'admin-status is-' + route.reviewStatus}>{statusLabels[route.reviewStatus] ?? route.reviewStatus}</span></td>
      <td><Link className="admin-row-action" href={'/admin/travel/' + encodeURIComponent(circuitId) + '/routes/' + encodeURIComponent(route.id)}>Редактировать →</Link></td>
    </tr>)}</tbody></table></div>
    {!rows.length ? <p className="admin-directory-empty">По выбранным фильтрам маршруты не найдены</p> : null}
  </section></main>;
}
