import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { getAdminSession } from '../../../../../lib/admin-auth';
import { getAdminTravelZone, isAdminDatabaseConfigured } from '../../../../../lib/admin-database';
import { saveTravelZone } from '../../../../actions';

const typeLabels: Record<string,string> = { accommodation:'Размещение',parking:'Парковка',park_and_ride:'P+R',access:'Доступ',restricted:'Ограничение',walking:'Пешеходная',travel_time:'Время в пути' };
const lines = (values: string[]) => values.join('\n');

export default async function AdminTravelZonePage({ params,searchParams }: { params: Promise<{ circuitId:string;zoneId:string }>; searchParams: Promise<{ saved?:string;syncError?:string;error?:string }> }) {
  if (!await getAdminSession()) redirect('/admin/login'); if (!isAdminDatabaseConfigured()) redirect('/admin/overview');
  const [{ circuitId,zoneId },state] = await Promise.all([params,searchParams]); const detail = await getAdminTravelZone(circuitId,zoneId).catch(() => null); if (!detail) notFound(); const { zone,points }=detail;
  return <main className="admin-shell"><section className="admin-edit-panel admin-travel-zone-editor">
    <Link className="admin-back-link" href={`/admin/travel/${encodeURIComponent(circuitId)}/zones`}>← Вернуться к районам</Link>
    <header><div><span className="admin-kicker">Район проживания</span><h1>{zone.nameRu || 'Новый район'}</h1></div>{zone.id?<code>{zone.id}</code>:null}</header>
    {state.saved==='1'?<div className="admin-alert is-success">{state.syncError==='1'?'Район сохранён в базе':'Район сохранён, публичные данные обновлены'}</div>:null}
    {state.error?<div className="admin-alert is-error">Не удалось сохранить район. Проверьте границу, источник и обязательные поля</div>:null}
    <form action={saveTravelZone} className="admin-editor-form"><input type="hidden" name="circuitId" value={circuitId}/>{zone.id?<input type="hidden" name="zoneId" value={zone.id}/>:null}
      <fieldset><legend>Карточка района</legend><div className="admin-form-grid">
        {!zone.id?<label className="is-wide"><span>ID района</span><input name="zoneId" defaultValue={`${circuitId}-stay-`} pattern="[A-Za-z0-9_-]+" required/><small>Стабильный системный ID, например spa-stay-malmedy</small></label>:null}
        <label><span>Исходное название</span><input name="name" defaultValue={zone.name} required/></label><label><span>Название на русском</span><input name="nameRu" defaultValue={zone.nameRu} required/></label>
        <label><span>Тип зоны</span><select name="zoneType" defaultValue={zone.zoneType}>{Object.entries(typeLabels).map(([id,label])=><option key={id} value={id}>{label}</option>)}</select></label>
        <label><span>Приоритет</span><input type="number" name="priority" min="0" max="100" defaultValue={zone.priority} required/></label>
        <label><span>Ценовой диапазон</span><select name="priceBand" defaultValue={zone.priceBand ?? ''}><option value="">Не указан</option>{[1,2,3,4].map(value=><option key={value} value={value}>{'₽'.repeat(value)}</option>)}</select></label>
        <label><span>Статус</span><select name="reviewStatus" defaultValue={zone.reviewStatus}><option value="candidate">Кандидат</option><option value="reviewed">Проверена</option><option value="published">Опубликована</option><option value="hidden">Скрыта</option></select></label>
        <label className="is-wide"><span>Описание</span><textarea name="descriptionRu" rows={4} defaultValue={zone.descriptionRu ?? ''}/></label>
        <label><span>Подходит для — по одному пункту в строке</span><textarea name="bestFor" rows={5} defaultValue={lines(zone.bestFor)}/></label><label><span>Преимущества</span><textarea name="advantagesRu" rows={5} defaultValue={lines(zone.advantagesRu)}/></label>
        <label className="is-wide"><span>Недостатки</span><textarea name="disadvantagesRu" rows={4} defaultValue={lines(zone.disadvantagesRu)}/></label>
      </div></fieldset>
      <fieldset><legend>Публичное представление</legend><div className="admin-form-grid">
        <label><span>Характер района</span><input name="characterRu" defaultValue={zone.characterRu} required/></label><label><span>Время до трассы</span><input name="travelTimeRu" defaultValue={zone.travelTimeRu} required/></label>
        <label><span>Порядок</span><input type="number" name="sortOrder" min="0" defaultValue={zone.sortOrder}/></label><label><span>Цвет</span><input type="color" name="tone" defaultValue={zone.tone}/></label>
        <label className="admin-rights-confirmation is-wide"><input type="checkbox" name="eventOnly" value="yes" defaultChecked={zone.eventOnly}/><span><strong>Только во время этапа</strong><small>Используйте для временных парковок, ограничений и сезонной инфраструктуры</small></span></label>
      </div></fieldset>
      <fieldset><legend>Граница и источник</legend><div className="admin-form-grid"><label className="is-wide"><span>GeoJSON Polygon или MultiPolygon</span><textarea name="geometryGeoJson" rows={9} defaultValue={zone.geometryGeoJson ?? ''}/><small>Кандидат можно сохранить без границы; для проверки и публикации она обязательна</small></label>
        <label className="is-wide"><span>Страница источника</span><input type="url" name="sourceUrl" defaultValue={zone.sourceUrl ?? ''} required/></label></div></fieldset>
      <fieldset><legend>Жильё в районе</legend><p className="admin-field-note">Отмеченные объекты появляются при приближении к району. «Характерные» можно использовать в краткой карточке района</p>
        <div className="admin-zone-point-list">{points.map((point)=><div key={point.id} className="admin-zone-point-row"><label><input type="checkbox" name="selectedPoint" value={point.id} defaultChecked={point.selected}/><span><strong>{point.name}</strong><small>{point.categoryName} · {point.id}</small></span></label><label><input type="checkbox" name="examplePoint" value={point.id} defaultChecked={point.isExample}/><span>Характерный вариант</span></label></div>)}</div>
        {!points.length?<p className="admin-directory-empty">Сначала импортируйте точки из группы «Размещение»</p>:null}</fieldset>
      <div className="admin-form-actions"><span>{points.filter(point=>point.selected).length} объектов связано сейчас</span><button type="submit">Сохранить район</button></div>
    </form>
  </section></main>;
}
