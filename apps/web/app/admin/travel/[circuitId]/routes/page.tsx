import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { getAdminSession } from '../../../../lib/admin-auth';
import { getAdminTravelRoutes, isAdminDatabaseConfigured } from '../../../../lib/admin-database';
import { TravelModuleNav } from '../travel-module-nav';

const typeLabels: Record<string, string> = {
  arrival: 'Прибытие', race_day: 'Гоночный день', event_shuttle: 'Трансфер', park_and_ride: 'P+R',
  tourist_half_day: 'Полдня', tourist_full_day: 'Полный день', walking: 'Пешком', scenic_drive: 'Обзорная поездка',
};
const statusLabels: Record<string, string> = {
  candidate: 'Кандидат', reviewed: 'Проверен', published: 'Опубликован', hidden: 'Скрыт',
};
const modeLabels: Record<string, string> = {
  car: 'Автомобиль', transit: 'Общественный транспорт', shuttle: 'Трансфер',
  walk: 'Пешком', bicycle: 'Велосипед', mixed: 'Смешанный',
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

  return <main className="admin-shell"><section className="admin-directory admin-travel-subdirectory">
    <Link className="admin-back-link" href={'/admin/travel/' + encodeURIComponent(circuitId)}>← Вернуться к точкам</Link>
    <header><div><span className="admin-kicker">Маршруты</span><h1>{registry.circuit.name}</h1><p>{rows.length} из {registry.rows.length} маршрутов по текущему фильтру</p></div><div className="admin-directory-header-actions"><Link href={'/admin/travel/' + encodeURIComponent(circuitId) + '/routes/generate'}>Предложить автоматически</Link><Link href={'/admin/travel/' + encodeURIComponent(circuitId) + '/routes/new'}>Добавить вручную</Link></div></header>
    <TravelModuleNav circuitId={circuitId} active="routes" />
    {state.generated ? <div className="admin-alert is-success">Создано черновиков маршрутов: {state.generated}</div> : null}
    <form className="admin-directory-search admin-travel-directory-filters" method="get"><label><span>Название или ID</span><input name="q" defaultValue={state.q ?? ''} placeholder="Найти маршрут" /></label><label><span>Тип</span><select name="type" defaultValue={type}><option value="">Все типы</option>{Object.entries(typeLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label><label><span>Линия</span><select name="geometry" defaultValue={geometry}><option value="">Любое состояние</option><option value="yes">Есть</option><option value="no">Нет</option></select></label><label><span>Статус</span><select name="status" defaultValue={status}><option value="">Все статусы</option>{Object.entries(statusLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label><button type="submit">Применить</button><Link href={'/admin/travel/' + encodeURIComponent(circuitId) + '/routes'}>Сбросить</Link></form>
    <div className="admin-table-wrap"><table><thead><tr><th>Маршрут</th><th>Тип</th><th>Способ</th><th>Расстояние</th><th>Время</th><th>Линия</th><th>Статус</th><th><span className="sr-only">Действие</span></th></tr></thead><tbody>{rows.map((route) => <tr key={route.id}>
      <td><strong>{route.nameRu}</strong><small>{route.id} · {route.stopCount} остановок</small></td>
      <td>{typeLabels[route.routeType] ?? route.routeType}</td><td>{modeLabels[route.travelMode] ?? route.travelMode}</td>
      <td>{(route.distanceM / 1000).toLocaleString('ru-RU')} км</td><td>{route.durationMinutes} мин</td>
      <td>{route.hasGeometry ? 'Есть' : 'Нет'}</td>
      <td><span className={'admin-status is-' + route.reviewStatus}>{statusLabels[route.reviewStatus] ?? route.reviewStatus}</span></td>
      <td><Link className="admin-row-action" href={'/admin/travel/' + encodeURIComponent(circuitId) + '/routes/' + encodeURIComponent(route.id)}>Редактировать →</Link></td>
    </tr>)}</tbody></table></div>
    {!rows.length ? <p className="admin-directory-empty">По выбранным фильтрам маршруты не найдены</p> : null}
  </section></main>;
}
