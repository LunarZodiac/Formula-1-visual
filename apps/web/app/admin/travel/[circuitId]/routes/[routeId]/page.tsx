import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { getAdminSession } from '../../../../../lib/admin-auth';
import { getAdminCircuit, getAdminTravelRoute, getAdminTravelRouteTailPreview, isAdminDatabaseConfigured } from '../../../../../lib/admin-database';
import { getTrackGeometry } from '../../../../../data/track-geometries';
import { changeTravelRouteLifecycle, deleteArchivedTravelRoute, saveTravelRoute } from '../../../../actions';
import { RouteStopsEditor } from './route-stops-editor';
import { RouteGeometryEditor } from './route-geometry-editor';
import { RouteTailPreview } from './route-tail-preview';

const types = {
  arrival: 'Прибытие в регион', race_day: 'Гоночный день', event_shuttle: 'Официальный трансфер',
  park_and_ride: 'P+R', tourist_half_day: 'Туристический на полдня', tourist_full_day: 'Туристический на день',
  walking: 'Пешеходный', scenic_drive: 'Обзорная поездка',
};
const modes = { car: 'Автомобиль', transit: 'Общественный транспорт', shuttle: 'Трансфер', walk: 'Пешком', bicycle: 'Велосипед', mixed: 'Смешанный' };
const accessKinds: Record<string, string> = { gate: 'Вход', parking: 'Парковка', dropoff: 'Высадка', shuttle_stop: 'Остановка трансфера', approach: 'Подход к трассе' };
const accessStatuses: Record<string, string> = { candidate: 'кандидат', needs_review: 'нужна проверка', verified: 'проверена', rejected: 'отклонена', expired: 'устарела' };
const variantKinds = { recommended: 'Рекомендуемый', fastest: 'Самый быстрый', shortest: 'Самый короткий', loop: 'Кольцевой (второстепенный)', manual: 'Авторский' };

export default async function AdminTravelRoutePage({ params, searchParams }: {
  params: Promise<{ circuitId: string; routeId: string }>;
  searchParams: Promise<{ saved?: string; syncError?: string; error?: string; tailPreview?: string; routeAction?: string }>;
}) {
  if (!await getAdminSession()) redirect('/admin/login');
  if (!isAdminDatabaseConfigured()) redirect('/admin/overview');
  const [{ circuitId, routeId }, state] = await Promise.all([params, searchParams]);
  const [detail, circuit] = await Promise.all([
    getAdminTravelRoute(circuitId, routeId).catch(() => null),
    getAdminCircuit(circuitId, true).catch(() => null),
  ]);
  if (!detail) notFound();
  const { route, stops, pointOptions, accessAnchorOptions } = detail;
  const selectedCenterline = circuit?.layouts.find(layout => layout.id === circuit.profile?.geometryId)?.centerlineGeoJson ?? null;
  const trackCenterline = selectedCenterline ?? getTrackGeometry(circuitId)?.geometry ?? null;
  const trackSource = selectedCenterline ? 'selected' : trackCenterline ? 'catalog' : 'missing';
  const isNew = !route.id;
  const tailPreview = state.tailPreview ? await getAdminTravelRouteTailPreview(state.tailPreview).catch(() => null) : null;
  const matchingTailPreview = tailPreview?.circuitId === circuitId && tailPreview.routeId === routeId ? tailPreview : null;

  return <main className="admin-shell"><section className="admin-edit-panel admin-travel-route-editor">
    <Link className="admin-back-link" href={`/admin/travel/${encodeURIComponent(circuitId)}/routes`}>← Вернуться к маршрутам</Link>
    <header><div><span className="admin-kicker">Туристический маршрут</span><h1>{route.nameRu || 'Новый маршрут'}</h1></div>{route.id ? <code>{route.id}</code> : null}</header>
    {state.saved ? <div className="admin-alert is-success">Маршрут сохранён{state.syncError ? ' в базе, но публичный слой не обновился' : '; публичный слой обновлён'}. Текущий статус: {route.reviewStatus === 'candidate' ? '«Кандидат»' : route.reviewStatus === 'reviewed' ? '«Проверен»' : route.reviewStatus === 'published' ? '«Опубликован»' : '«Скрыт»'}; {route.lifecycle === 'draft' ? 'черновик' : route.lifecycle === 'active' ? 'активный' : 'архив'}</div> : null}
    {state.routeAction ? <div className="admin-alert is-success">{state.routeAction === 'archive' ? 'Маршрут отправлен в архив' : 'Маршрут возвращён в черновики'}{state.syncError ? ' · публичные данные пока не обновились' : ''}</div> : null}
    {state.error ? <div className="admin-alert is-error">{state.error === 'tail-preview' ? 'Не удалось рассчитать конечный участок. Проверьте профиль маршрута, линию и точку доступа' : state.error === 'tail-apply' ? 'Не удалось применить предпросмотр: маршрут или точка доступа могли измениться' : state.error === 'lifecycle' ? 'Не удалось изменить состояние маршрута. Обновите страницу и повторите действие' : state.error === 'delete' ? 'Не удалось удалить архивный маршрут. Проверьте ID и обновите страницу' : 'Не удалось сохранить маршрут. Проверьте поля и обновите страницу, если маршрут изменился в другой вкладке'}</div> : null}

    {route.lifecycle === 'archived' ? <div className="admin-alert">Архивный маршрут доступен только для просмотра. Верните его в черновики, чтобы изменить</div> : null}
    <form action={saveTravelRoute} className="admin-editor-form">
      <input type="hidden" name="circuitId" value={circuitId} />
      {route.id ? <input type="hidden" name="routeId" value={route.id} /> : null}
      {route.id ? <input type="hidden" name="expectedUpdatedAt" value={route.updatedAtToken} /> : null}

      <fieldset disabled={route.lifecycle === 'archived'}><legend>Основные сведения</legend><div className="admin-form-grid">
        {isNew ? <label className="is-wide"><span>ID маршрута</span><input name="routeId" defaultValue={`${circuitId}-route-`} required pattern="[A-Za-z0-9_-]+" /><small>Стабильный системный ID латиницей, например spa-route-airport</small></label> : null}
        <label><span>Исходное название</span><input name="name" defaultValue={route.name} required /></label>
        <label><span>Название на русском</span><input name="nameRu" defaultValue={route.nameRu} required /></label>
        <label><span>Тип маршрута</span><select name="routeType" defaultValue={route.routeType}>{Object.entries(types).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <label><span>Способ передвижения</span><select name="travelMode" defaultValue={route.travelMode}>{Object.entries(modes).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <label className="is-wide"><span>Конечная точка доступа</span><select name="terminalAccessAnchorId" defaultValue={route.terminalAccessAnchorId ?? ''}><option value="">Не выбрана</option>{accessAnchorOptions.map((anchor) => <option key={anchor.id} value={anchor.id} disabled={anchor.id !== route.terminalAccessAnchorId && ['rejected', 'expired'].includes(anchor.verificationStatus)}>{anchor.poiName} · {accessKinds[anchor.accessKind] ?? anchor.accessKind} · {accessStatuses[anchor.verificationStatus] ?? anchor.verificationStatus} ({anchor.confidence}%)</option>)}</select><small>{accessAnchorOptions.length ? 'Для проверенного или опубликованного маршрута точка также должна быть проверена' : 'Сначала добавьте точку во вкладке «Доступ»'}</small></label>
        <label><span>Статус</span><select name="reviewStatus" defaultValue={route.reviewStatus}><option value="candidate">Кандидат</option><option value="reviewed">Проверен</option><option value="published">Опубликован</option><option value="hidden">Скрыт</option></select></label>
        <label><span>Вариант</span><select name="routeVariantKind" defaultValue={route.routeVariantKind}>{Object.entries(variantKinds).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label>
        {route.lifecycle === 'archived' ? <label><span>Жизненный цикл</span><input value="Архив" disabled /><input type="hidden" name="lifecycle" value="archived" /><small>Для восстановления используйте отдельную кнопку ниже</small></label> : <label><span>Жизненный цикл</span><select name="lifecycle" defaultValue={route.lifecycle}><option value="draft">Черновик</option><option value="active">Активный</option></select></label>}
        <label><span>Приоритет показа</span><input name="displayPriority" type="number" min="0" max="100" defaultValue={route.displayPriority}/><small>Чем больше число, тем выше маршрут; для кольцевого максимум 49</small></label>
        <label className="is-wide"><span>Краткое описание</span><textarea name="summaryRu" rows={3} defaultValue={route.summaryRu ?? ''} /></label>
      </div></fieldset>

      <fieldset disabled={route.lifecycle === 'archived'}><legend>Редакционный материал</legend><div className="admin-form-grid">
        <label className="is-wide"><span>Почему выбран этот маршрут</span><textarea name="rationaleRu" rows={4} defaultValue={route.rationaleRu} /></label>
        <label className="is-wide"><span>Что видно и что можно посетить — по пункту в строке</span><textarea name="highlightsRu" rows={5} defaultValue={route.highlightsRu.join('\n')} /></label>
        <label className="is-wide"><span>Практические советы</span><textarea name="practicalNotesRu" rows={4} defaultValue={route.practicalNotesRu} /></label>
      </div></fieldset>

      <fieldset disabled={route.lifecycle === 'archived'}><legend>Линия и расчёт</legend><div className="admin-form-grid">
        <RouteGeometryEditor initialValue={route.geometryGeoJson ?? ''} colour={route.lineColour} initialMode={route.geometryMode as 'routed'|'waypoints'|'freehand'} initialDistance={route.distanceM} initialDuration={route.durationMinutes} travelMode={route.travelMode} circuitId={circuitId} routeId={route.id || 'new'} archived={route.lifecycle === 'archived'} mapCenter={detail.mapCenter} stopCoordinates={stops.map(stop => stop.resolvedLongitude === null || stop.resolvedLatitude === null ? null : [stop.resolvedLongitude, stop.resolvedLatitude] as [number, number])} mapPoints={detail.mapPoints} existingRoutes={detail.existingRoutes} trackCenterline={trackCenterline} trackSource={trackSource} />
        <label><span>Сложность</span><select name="difficulty" defaultValue={route.difficulty}><option value="easy">Простой</option><option value="moderate">Средний</option><option value="difficult">Сложный</option></select></label>
        <label className="is-wide"><span>Страница источника</span><input type="url" name="sourceUrl" defaultValue={route.sourceUrl} required /></label>
      </div></fieldset>

      <fieldset disabled={route.lifecycle === 'archived'}><legend>Условия поездки</legend><div className="admin-form-grid">
        <label className="is-wide"><span>Доступность</span><textarea name="accessibilityNotesRu" rows={3} defaultValue={route.accessibilityNotesRu} /></label>
        <label className="is-wide"><span>Расписание и ограничения</span><textarea name="scheduleNotesRu" rows={3} defaultValue={route.scheduleNotesRu} /></label>
        <label className="admin-rights-confirmation"><input type="checkbox" name="eventOnly" value="yes" defaultChecked={route.eventOnly} /><span><strong>Только во время этапа</strong><small>Маршрут зависит от временной инфраструктуры гоночного уик-энда</small></span></label>
        <label className="admin-rights-confirmation"><input type="checkbox" name="bookingRequired" value="yes" defaultChecked={route.bookingRequired} /><span><strong>Нужно бронирование</strong><small>Посетителю потребуется заранее оформить билет или место</small></span></label>
      </div></fieldset>

      <RouteStopsEditor initialStops={stops} pointOptions={pointOptions} disabled={route.lifecycle === 'archived'} isNew={isNew} />

      <details className="admin-editor-disclosure" open={isNew || !route.routeGroup}>
        <summary><span><strong>Технические настройки</strong><small>Маршрутизатор, оформление линии и диапазон масштаба</small></span></summary>
        <fieldset disabled={route.lifecycle === 'archived'}><legend className="sr-only">Технические настройки маршрута</legend><div className="admin-form-grid">
          <label><span>Маршрутизатор</span><input name="routeEngine" defaultValue={route.routeEngine} /></label>
          <label><span>Профиль маршрутизатора</span><input name="routeEngineProfile" defaultValue={route.routeEngineProfile} /></label>
          <label><span>Группа на карте</span><input name="routeGroup" defaultValue={route.routeGroup} required /></label>
          <label><span>Порядок</span><input type="number" min="0" name="sortOrder" defaultValue={route.sortOrder} /></label>
          <label><span>Цвет линии</span><input type="color" name="lineColour" defaultValue={route.lineColour} /></label>
          <label><span>Смещение линии, px</span><input type="number" step="0.5" min="-24" max="24" name="lineOffsetPx" defaultValue={route.lineOffsetPx} /></label>
          <label><span>Минимальный масштаб</span><input type="number" step="0.5" min="0" max="24" name="minZoom" defaultValue={route.minZoom} /></label>
          <label><span>Максимальный масштаб</span><input type="number" step="0.5" min="0" max="24" name="maxZoom" defaultValue={route.maxZoom} /></label>
        <label className="admin-rights-confirmation"><input type="checkbox" name="visibleByDefault" value="yes" defaultChecked={route.visibleByDefault} /><span><strong>Показывать по умолчанию</strong><small>Линия видна сразу после открытия туристического слоя</small></span></label>
          <label className="admin-rights-confirmation"><input type="checkbox" name="optimizeWaypointOrder" value="yes" defaultChecked={route.optimizeWaypointOrder} /><span><strong>Предлагать оптимизацию порядка</strong><small>Порядок изменится только после отдельного предпросмотра и подтверждения</small></span></label>
          <label className="is-wide"><span>Внутренняя заметка</span><textarea name="notesRu" rows={3} defaultValue={route.notesRu} /></label>
        </div></fieldset>
      </details>

      <div className="admin-form-actions"><span>{stops.length} остановок сохранено сейчас</span><button type="submit" disabled={route.lifecycle === 'archived'}>Сохранить маршрут</button></div>
    </form>
    {!isNew && route.lifecycle !== 'archived' ? <RouteTailPreview circuitId={circuitId} routeId={route.id} anchorId={route.terminalAccessAnchorId} travelMode={route.travelMode} preview={matchingTailPreview} /> : null}
    {!isNew ? <section className="admin-editor-disclosure" aria-label="Архив маршрута">
      <h2>Архив маршрута</h2>
      <p>{route.lifecycle === 'archived' ? 'Маршрут скрыт с публичной карты. Его можно вернуть в черновики или удалить окончательно' : 'Архивирование уберёт маршрут с публичной карты и сохранит его данные для возможного восстановления'}</p>
      <form action={changeTravelRouteLifecycle} className="admin-form-actions">
        <input type="hidden" name="circuitId" value={circuitId} /><input type="hidden" name="routeId" value={route.id} />
        <input type="hidden" name="expectedUpdatedAt" value={route.updatedAtToken} />
        <input type="hidden" name="operation" value={route.lifecycle === 'archived' ? 'restore' : 'archive'} />
        <button type="submit">{route.lifecycle === 'archived' ? 'Вернуть в черновики' : 'Отправить в архив'}</button>
      </form>
      {route.lifecycle === 'archived' ? <form action={deleteArchivedTravelRoute} className="admin-editor-form">
        <input type="hidden" name="circuitId" value={circuitId} /><input type="hidden" name="routeId" value={route.id} />
        <input type="hidden" name="expectedUpdatedAt" value={route.updatedAtToken} />
        <label><span>Для окончательного удаления введите ID маршрута: {route.id}</span><input name="confirmRouteId" required autoComplete="off" pattern="[A-Za-z0-9_-]+" /></label>
        <div className="admin-form-actions"><button type="submit">Удалить из архива навсегда</button></div>
      </form> : null}
    </section> : null}
  </section></main>;
}
