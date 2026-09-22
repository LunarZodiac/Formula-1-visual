import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { getAdminSession } from '../../../../lib/admin-auth';
import { getAdminTravelZones, isAdminDatabaseConfigured } from '../../../../lib/admin-database';
import { TravelModuleNav } from '../travel-module-nav';

const typeLabels: Record<string,string> = { accommodation:'Размещение',parking:'Парковка',park_and_ride:'P+R',access:'Доступ',restricted:'Ограничение',walking:'Пешеходная',travel_time:'Время в пути' };
const statusLabels: Record<string,string> = { candidate:'Кандидат',reviewed:'Проверена',published:'Опубликована',hidden:'Скрыта' };

export default async function AdminTravelZonesPage({ params, searchParams }: {
  params: Promise<{ circuitId: string }>;
  searchParams: Promise<{ q?: string; type?: string; status?: string; geometry?: string }>;
}) {
  if (!await getAdminSession()) redirect('/admin/login');
  if (!isAdminDatabaseConfigured()) redirect('/admin/overview');
  const [{ circuitId }, state] = await Promise.all([params, searchParams]);
  let registry: Awaited<ReturnType<typeof getAdminTravelZones>> = null;
  try { registry = await getAdminTravelZones(circuitId); }
  catch (error) {
    console.error(`Не удалось загрузить районы трассы ${circuitId}`, error);
    return <main className="admin-shell"><section className="admin-directory"><Link className="admin-back-link" href={`/admin/travel/${encodeURIComponent(circuitId)}`}>← Вернуться к точкам</Link><div className="admin-alert is-error">Локальная база районов временно недоступна. Проверьте локальный сервер и повторите попытку</div></section></main>;
  }
  if (!registry) notFound();
  const query = state.q?.trim().slice(0, 120).toLocaleLowerCase('ru-RU') ?? '';
  const type = state.type && state.type in typeLabels ? state.type : '';
  const status = state.status && state.status in statusLabels ? state.status : '';
  const geometry = state.geometry === 'yes' || state.geometry === 'no' ? state.geometry : '';
  const rows = registry.rows.filter((zone) => (
    (!query || `${zone.nameRu} ${zone.id}`.toLocaleLowerCase('ru-RU').includes(query))
    && (!type || zone.zoneType === type)
    && (!status || zone.reviewStatus === status)
    && (!geometry || (geometry === 'yes' ? zone.hasGeometry : !zone.hasGeometry))
  ));
  return <main className="admin-shell"><section className="admin-directory admin-travel-subdirectory">
    <Link className="admin-back-link" href={`/admin/travel/${encodeURIComponent(circuitId)}`}>← Вернуться к точкам</Link>
    <header><div><span className="admin-kicker">Районы и зоны</span><h1>{registry.circuit.name}</h1><p>{rows.length} из {registry.rows.length} зон по текущему фильтру</p></div><div className="admin-directory-header-actions"><Link href={`/admin/travel/${encodeURIComponent(circuitId)}/zones/new`}>Добавить район</Link></div></header>
    <TravelModuleNav circuitId={circuitId} active="zones" />
    <form className="admin-directory-search admin-travel-directory-filters" method="get"><label><span>Название или ID</span><input name="q" defaultValue={state.q ?? ''} placeholder="Найти район" /></label><label><span>Тип</span><select name="type" defaultValue={type}><option value="">Все типы</option>{Object.entries(typeLabels).map(([value,label]) => <option value={value} key={value}>{label}</option>)}</select></label><label><span>Граница</span><select name="geometry" defaultValue={geometry}><option value="">Любое состояние</option><option value="yes">Есть</option><option value="no">Не задана</option></select></label><label><span>Статус</span><select name="status" defaultValue={status}><option value="">Все статусы</option>{Object.entries(statusLabels).map(([value,label]) => <option value={value} key={value}>{label}</option>)}</select></label><button type="submit">Применить</button><Link href={`/admin/travel/${encodeURIComponent(circuitId)}/zones`}>Сбросить</Link></form>
    <div className="admin-table-wrap"><table><thead><tr><th>Район</th><th>Тип</th><th>Граница</th><th>Объекты</th><th>Приоритет</th><th>Статус</th><th><span className="sr-only">Действие</span></th></tr></thead><tbody>
      {rows.map((zone) => <tr key={zone.id}><td><strong>{zone.nameRu}</strong><small><code>{zone.id}</code></small></td><td>{typeLabels[zone.zoneType] ?? zone.zoneType}</td>
        <td>{zone.hasGeometry ? 'Есть' : 'Не задана'}</td><td>{zone.pointCount}<small>{zone.exampleCount} характерных</small></td><td>{zone.priority}</td>
        <td><span className={`admin-status is-${zone.reviewStatus}`}>{statusLabels[zone.reviewStatus] ?? zone.reviewStatus}</span></td>
        <td><Link className="admin-row-action" href={`/admin/travel/${encodeURIComponent(circuitId)}/zones/${encodeURIComponent(zone.id)}`}>Редактировать →</Link></td></tr>)}
    </tbody></table></div>{!rows.length ? <p className="admin-directory-empty">По выбранным фильтрам районы не найдены</p> : null}
  </section></main>;
}
