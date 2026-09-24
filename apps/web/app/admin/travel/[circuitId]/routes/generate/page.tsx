import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { getAdminSession } from '../../../../../lib/admin-auth';
import { getAdminTravelRoute, getAdminTravelRouteGenerationPreview, getAdminTravelRoutes, isAdminDatabaseConfigured } from '../../../../../lib/admin-database';
import { applyGeneratedTravelRoutes, previewGeneratedTravelRoutes } from '../../../../actions';
import { OrderedPoiBuilder } from './ordered-poi-builder';
import { RouteGenerationPreview } from './route-generation-preview';

export default async function Page({params,searchParams}:{params:Promise<{circuitId:string}>;searchParams:Promise<{preview?:string;error?:string}>}){
  if(!await getAdminSession())redirect('/admin/login');if(!isAdminDatabaseConfigured())redirect('/admin/overview');
  const [{circuitId},state]=await Promise.all([params,searchParams]);
  const [registry,builder,loadedPreview]=await Promise.all([getAdminTravelRoutes(circuitId).catch(()=>null),getAdminTravelRoute(circuitId,'new').catch(()=>null),state.preview?getAdminTravelRouteGenerationPreview(state.preview).catch(()=>null):Promise.resolve(null)]);
  if(!registry)notFound();
  const preview=loadedPreview?.circuit.id===circuitId?loadedPreview:null;
  return <main className="admin-shell"><section className="admin-edit-panel admin-route-generator">
    <Link className="admin-back-link" href={`/admin/travel/${encodeURIComponent(circuitId)}/routes`}>← Маршруты трассы</Link>
    <header><div><span className="admin-kicker">Автоматизация маршрутов</span><h1>{registry.circuit.name}</h1><p>Генератор создаёт только черновики. Публикация доступна после ручной проверки линии, остановок, источников и практической информации</p></div></header>
    {state.error==='preview'?<div className="admin-alert is-error">Не удалось рассчитать предложения. Проверьте соединение с маршрутизатором и количество туристических точек</div>:null}
    {state.error==='apply'?<div className="admin-alert is-error">Не удалось сохранить выбранные черновики. Создайте новый предпросмотр</div>:null}
    {state.error==='selection'?<div className="admin-alert is-error">Отметьте хотя бы один маршрут для сохранения</div>:null}
    {state.preview&&!preview?<div className="admin-alert is-error">Предпросмотр не найден или истёк. Рассчитайте маршруты заново</div>:null}
    {!preview?<div className="admin-editor-form">
      <form action={previewGeneratedTravelRoutes}><input type="hidden" name="circuitId" value={circuitId}/><fieldset><legend>Маршрут по выбранным точкам</legend>
        <OrderedPoiBuilder pointOptions={builder?.pointOptions ?? []}/>
        <label className="admin-rights-confirmation"><input type="checkbox" name="optimizeWaypointOrder" value="yes"/><span><strong>Оптимизировать промежуточные точки</strong><small>Начальная и конечная точки сохранятся; изменится только порядок между ними</small></span></label>
        <div className="admin-form-actions"><span>Предпросмотр не меняет базу</span><button type="submit" disabled={!builder?.pointOptions.length}>Рассчитать выбранный маршрут</button></div>
      </fieldset></form>
      <form action={previewGeneratedTravelRoutes}><input type="hidden" name="circuitId" value={circuitId}/><fieldset><legend>Автоматические предложения</legend><div className="admin-route-generator-notes"><p>Соберёт маршруты на полдня и полный день из наиболее содержательных и разнесённых достопримечательностей</p><p>Маршруты прибытия появятся только при наличии проверенной точки входа, парковки или P+R</p><p>Дорожная линия, расстояние и время рассчитываются OSRM; существующие маршруты не перезаписываются</p></div><div className="admin-form-actions"><span>Расчёт может занять до нескольких минут</span><button type="submit">Сформировать предложения</button></div></fieldset></form>
    </div>:
    <form action={applyGeneratedTravelRoutes}><input type="hidden" name="circuitId" value={circuitId}/><input type="hidden" name="token" value={preview.token}/>
      <section className="admin-travel-preview-summary"><div><span>Трасса</span><strong>{preview.circuit.name}</strong></div><div><span>Предложено</span><strong>{preview.suggestions.length}</strong></div><div><span>Замечаний</span><strong>{preview.blockers.length}</strong></div><div><span>Предпросмотр до</span><strong>{new Intl.DateTimeFormat('ru-RU',{hour:'2-digit',minute:'2-digit'}).format(new Date(preview.expiresAt))}</strong></div></section>
      {preview.blockers.length?<section className="admin-alert"><strong>Что требует внимания</strong><ul>{preview.blockers.map(blocker=><li key={blocker}>{blocker}</li>)}</ul></section>:null}
      <RouteGenerationPreview suggestions={preview.suggestions}/>
      <div className="admin-form-actions"><Link href={`/admin/travel/${encodeURIComponent(circuitId)}/routes/generate`}>Новый расчёт</Link><button type="submit" disabled={!preview.suggestions.length}>Сохранить выбранные кандидатами</button></div>
    </form>}
  </section></main>;
}
