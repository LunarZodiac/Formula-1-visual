import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { getAdminSession } from '../../../../../lib/admin-auth';
import { getAdminTravelRouteGenerationPreview, getAdminTravelRoutes, isAdminDatabaseConfigured } from '../../../../../lib/admin-database';
import { applyGeneratedTravelRoutes, previewGeneratedTravelRoutes } from '../../../../actions';

const typeLabels: Record<string,string> = { arrival:'Прибытие',tourist_half_day:'Туристический маршрут на полдня',tourist_full_day:'Туристический маршрут на полный день' };
function distance(value:number){return `${(value/1000).toLocaleString('ru-RU',{maximumFractionDigits:1})} км`;}

export default async function Page({params,searchParams}:{params:Promise<{circuitId:string}>;searchParams:Promise<{preview?:string;error?:string}>}){
  if(!await getAdminSession())redirect('/admin/login');if(!isAdminDatabaseConfigured())redirect('/admin/overview');
  const [{circuitId},state]=await Promise.all([params,searchParams]);
  const [registry,preview]=await Promise.all([getAdminTravelRoutes(circuitId).catch(()=>null),state.preview?getAdminTravelRouteGenerationPreview(state.preview).catch(()=>null):Promise.resolve(null)]);
  if(!registry)notFound();
  return <main className="admin-shell"><section className="admin-edit-panel admin-route-generator">
    <Link className="admin-back-link" href={`/admin/travel/${encodeURIComponent(circuitId)}/routes`}>← Маршруты трассы</Link>
    <header><div><span className="admin-kicker">Автоматизация маршрутов</span><h1>{registry.circuit.name}</h1><p>Генератор создаёт только черновики. Публикация доступна после ручной проверки линии, остановок, источников и практической информации</p></div></header>
    {state.error==='preview'?<div className="admin-alert is-error">Не удалось рассчитать предложения. Проверьте соединение с маршрутизатором и количество туристических точек</div>:null}
    {state.error==='apply'?<div className="admin-alert is-error">Не удалось сохранить выбранные черновики. Создайте новый предпросмотр</div>:null}
    {!preview?<form action={previewGeneratedTravelRoutes} className="admin-editor-form"><input type="hidden" name="circuitId" value={circuitId}/><fieldset><legend>Что сделает генератор</legend><div className="admin-route-generator-notes"><p>Соберёт маршруты на полдня и полный день из наиболее содержательных и разнесённых достопримечательностей</p><p>Маршруты прибытия появятся только при наличии проверенной точки входа, парковки или P+R</p><p>Дорожная линия, расстояние и время рассчитываются OSRM; существующие маршруты не перезаписываются</p></div></fieldset><div className="admin-form-actions"><span>Расчёт может занять до нескольких минут и не меняет базу</span><button type="submit">Сформировать предпросмотр</button></div></form>:
    <form action={applyGeneratedTravelRoutes}><input type="hidden" name="circuitId" value={circuitId}/><input type="hidden" name="token" value={preview.token}/>
      <section className="admin-travel-preview-summary"><div><span>Трасса</span><strong>{preview.circuit.name}</strong></div><div><span>Предложено</span><strong>{preview.suggestions.length}</strong></div><div><span>Замечаний</span><strong>{preview.blockers.length}</strong></div><div><span>Предпросмотр до</span><strong>{new Intl.DateTimeFormat('ru-RU',{hour:'2-digit',minute:'2-digit'}).format(new Date(preview.expiresAt))}</strong></div></section>
      {preview.blockers.length?<section className="admin-alert"><strong>Что требует внимания</strong><ul>{preview.blockers.map(blocker=><li key={blocker}>{blocker}</li>)}</ul></section>:null}
      <div className="admin-table-wrap"><table><thead><tr><th>Выбрать</th><th>Маршрут</th><th>Тип</th><th>Остановки</th><th>Расстояние</th><th>Время</th></tr></thead><tbody>{preview.suggestions.map(route=><tr key={route.id}><td><input type="checkbox" name="routeId" value={route.id} defaultChecked aria-label={`Выбрать ${route.nameRu}`}/></td><td><strong>{route.nameRu}</strong><small>{route.summaryRu}<br/><code>{route.id}</code></small></td><td>{typeLabels[route.routeType]??route.routeType}</td><td>{route.stops.map(stop=>stop.nameRu).join(' → ')}</td><td>{distance(route.distanceM)}</td><td>{route.durationMinutes} мин</td></tr>)}</tbody></table></div>
      {!preview.suggestions.length?<p className="admin-directory-empty">Подходящие маршруты пока не сформированы. Причины указаны выше</p>:null}
      <div className="admin-form-actions"><Link href={`/admin/travel/${encodeURIComponent(circuitId)}/routes/generate`}>Новый расчёт</Link><button type="submit" disabled={!preview.suggestions.length}>Сохранить выбранные кандидатами</button></div>
    </form>}
  </section></main>;
}
