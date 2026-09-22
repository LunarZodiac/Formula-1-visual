import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { getAdminSession } from '../../../../../lib/admin-auth';
import { getAdminTravelRoute, isAdminDatabaseConfigured } from '../../../../../lib/admin-database';
import { saveTravelRoute } from '../../../../actions';
import { RouteStopsEditor } from './route-stops-editor';
import { RouteGeometryEditor } from './route-geometry-editor';

const types = {
  arrival: 'Прибытие в регион', race_day: 'Гоночный день', event_shuttle: 'Официальный трансфер',
  park_and_ride: 'P+R', tourist_half_day: 'Туристический на полдня', tourist_full_day: 'Туристический на день',
  walking: 'Пешеходный', scenic_drive: 'Обзорная поездка',
};
const modes = { car: 'Автомобиль', transit: 'Общественный транспорт', shuttle: 'Трансфер', walk: 'Пешком', bicycle: 'Велосипед', mixed: 'Смешанный' };

export default async function AdminTravelRoutePage({ params, searchParams }: {
  params: Promise<{ circuitId: string; routeId: string }>;
  searchParams: Promise<{ saved?: string; syncError?: string; error?: string }>;
}) {
  if (!await getAdminSession()) redirect('/admin/login');
  if (!isAdminDatabaseConfigured()) redirect('/admin/overview');
  const [{ circuitId, routeId }, state] = await Promise.all([params, searchParams]);
  const detail = await getAdminTravelRoute(circuitId, routeId).catch(() => null);
  if (!detail) notFound();
  const { route, stops, pointOptions } = detail;
  const isNew = !route.id;

  return <main className="admin-shell"><section className="admin-edit-panel admin-travel-route-editor">
    <Link className="admin-back-link" href={`/admin/travel/${encodeURIComponent(circuitId)}/routes`}>← Вернуться к маршрутам</Link>
    <header><div><span className="admin-kicker">Туристический маршрут</span><h1>{route.nameRu || 'Новый маршрут'}</h1></div>{route.id ? <code>{route.id}</code> : null}</header>
    {state.saved ? <div className="admin-alert is-success">Маршрут сохранён{state.syncError ? ' в базе' : ' и экспортирован'}</div> : null}
    {state.error ? <div className="admin-alert is-error">Не удалось сохранить маршрут. Проверьте линию и обязательные поля</div> : null}

    <form action={saveTravelRoute} className="admin-editor-form">
      <input type="hidden" name="circuitId" value={circuitId} />
      {route.id ? <input type="hidden" name="routeId" value={route.id} /> : null}

      <fieldset><legend>Основные сведения</legend><div className="admin-form-grid">
        {isNew ? <label className="is-wide"><span>ID маршрута</span><input name="routeId" defaultValue={`${circuitId}-route-`} required pattern="[A-Za-z0-9_-]+" /><small>Стабильный системный ID латиницей, например spa-route-airport</small></label> : null}
        <label><span>Исходное название</span><input name="name" defaultValue={route.name} required /></label>
        <label><span>Название на русском</span><input name="nameRu" defaultValue={route.nameRu} required /></label>
        <label><span>Тип маршрута</span><select name="routeType" defaultValue={route.routeType}>{Object.entries(types).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <label><span>Способ передвижения</span><select name="travelMode" defaultValue={route.travelMode}>{Object.entries(modes).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <label><span>Статус</span><select name="reviewStatus" defaultValue={route.reviewStatus}><option value="candidate">Кандидат</option><option value="reviewed">Проверен</option><option value="published">Опубликован</option><option value="hidden">Скрыт</option></select></label>
        <label className="is-wide"><span>Краткое описание</span><textarea name="summaryRu" rows={3} defaultValue={route.summaryRu ?? ''} /></label>
      </div></fieldset>

      <fieldset><legend>Редакционный материал</legend><div className="admin-form-grid">
        <label className="is-wide"><span>Почему выбран этот маршрут</span><textarea name="rationaleRu" rows={4} defaultValue={route.rationaleRu} /></label>
        <label className="is-wide"><span>Что видно и что можно посетить — по пункту в строке</span><textarea name="highlightsRu" rows={5} defaultValue={route.highlightsRu.join('\n')} /></label>
        <label className="is-wide"><span>Практические советы</span><textarea name="practicalNotesRu" rows={4} defaultValue={route.practicalNotesRu} /></label>
      </div></fieldset>

      <fieldset><legend>Линия и расчёт</legend><div className="admin-form-grid">
        <RouteGeometryEditor initialValue={route.geometryGeoJson ?? ''} colour={route.lineColour} />
        <label><span>Расстояние, м</span><input type="number" min="1" name="distanceM" defaultValue={route.distanceM} required /></label>
        <label><span>Время, мин</span><input type="number" min="1" name="durationMinutes" defaultValue={route.durationMinutes} required /></label>
        <label><span>Сложность</span><select name="difficulty" defaultValue={route.difficulty}><option value="easy">Простой</option><option value="moderate">Средний</option><option value="difficult">Сложный</option></select></label>
        <label className="is-wide"><span>Страница источника</span><input type="url" name="sourceUrl" defaultValue={route.sourceUrl} required /></label>
      </div></fieldset>

      <fieldset><legend>Условия поездки</legend><div className="admin-form-grid">
        <label className="is-wide"><span>Доступность</span><textarea name="accessibilityNotesRu" rows={3} defaultValue={route.accessibilityNotesRu} /></label>
        <label className="is-wide"><span>Расписание и ограничения</span><textarea name="scheduleNotesRu" rows={3} defaultValue={route.scheduleNotesRu} /></label>
        <label className="admin-rights-confirmation"><input type="checkbox" name="eventOnly" value="yes" defaultChecked={route.eventOnly} /><span><strong>Только во время этапа</strong><small>Маршрут зависит от временной инфраструктуры гоночного уик-энда</small></span></label>
        <label className="admin-rights-confirmation"><input type="checkbox" name="bookingRequired" value="yes" defaultChecked={route.bookingRequired} /><span><strong>Нужно бронирование</strong><small>Посетителю потребуется заранее оформить билет или место</small></span></label>
      </div></fieldset>

      <RouteStopsEditor initialStops={stops} pointOptions={pointOptions} />

      <details className="admin-editor-disclosure" open={isNew || !route.routeGroup}>
        <summary><span><strong>Технические настройки</strong><small>Маршрутизатор, оформление линии и диапазон масштаба</small></span></summary>
        <fieldset><legend className="sr-only">Технические настройки маршрута</legend><div className="admin-form-grid">
          <label><span>Маршрутизатор</span><input name="routeEngine" defaultValue={route.routeEngine} /></label>
          <label><span>Профиль маршрутизатора</span><input name="routeEngineProfile" defaultValue={route.routeEngineProfile} /></label>
          <label><span>Группа на карте</span><input name="routeGroup" defaultValue={route.routeGroup} required /></label>
          <label><span>Порядок</span><input type="number" min="0" name="sortOrder" defaultValue={route.sortOrder} /></label>
          <label><span>Цвет линии</span><input type="color" name="lineColour" defaultValue={route.lineColour} /></label>
          <label><span>Смещение линии, px</span><input type="number" step="0.5" min="-24" max="24" name="lineOffsetPx" defaultValue={route.lineOffsetPx} /></label>
          <label><span>Минимальный масштаб</span><input type="number" step="0.5" min="0" max="24" name="minZoom" defaultValue={route.minZoom} /></label>
          <label><span>Максимальный масштаб</span><input type="number" step="0.5" min="0" max="24" name="maxZoom" defaultValue={route.maxZoom} /></label>
          <label className="admin-rights-confirmation"><input type="checkbox" name="visibleByDefault" value="yes" defaultChecked={route.visibleByDefault} /><span><strong>Показывать по умолчанию</strong><small>Линия видна сразу после открытия туристического слоя</small></span></label>
          <label className="is-wide"><span>Внутренняя заметка</span><textarea name="notesRu" rows={3} defaultValue={route.notesRu} /></label>
        </div></fieldset>
      </details>

      <div className="admin-form-actions"><span>{stops.length} остановок сохранено сейчас</span><button type="submit">Сохранить маршрут</button></div>
    </form>
  </section></main>;
}
