import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { getAdminSession as getLoginSession } from '../../../../../lib/admin-auth';
import { getAdminEventSession, isAdminDatabaseConfigured, type AdminSessionResult } from '../../../../../lib/admin-database';
import { deleteSessionResult, saveEventSession, saveSessionResult } from '../../../../actions';
import { BulkResultsEditor } from './bulk-results-editor';

const statusLabels = {
  scheduled: 'Запланирована', live: 'Идёт сейчас', completed: 'Завершена', postponed: 'Перенесена', cancelled: 'Отменена',
} as const;

const sessionLabels = {
  practice_1: 'Практика 1', practice_2: 'Практика 2', practice_3: 'Практика 3', qualifying: 'Квалификация',
  sprint_shootout: 'Спринт-квалификация', sprint: 'Спринт', race: 'Гонка',
} as const;

function localUtc(value: string | null) {
  return value ? value.slice(0, 16) : '';
}

function formatDuration(value: number | null) {
  if (value === null) return '';
  const hours = Math.floor(value / 3_600_000); const minutes = Math.floor((value % 3_600_000) / 60_000);
  const seconds = Math.floor((value % 60_000) / 1000); const milliseconds = value % 1000;
  const tail = `${String(seconds).padStart(2, '0')}.${String(milliseconds).padStart(3, '0')}`;
  return hours ? `${hours}:${String(minutes).padStart(2, '0')}:${tail}` : `${minutes}:${tail}`;
}

function ResultFields({ result, sourceUrl, constructors }: {
  result?: AdminSessionResult; sourceUrl: string; constructors: Array<{ id: number; name: string }>;
}) {
  return <div className="admin-session-result-grid">
    <input type="hidden" name="originalDriverId" value={result?.driverId ?? ''} />
    <label><span>Пилот</span><input name="driverId" list="event-driver-options" defaultValue={result?.driverId ?? ''} placeholder="ID пилота" required /></label>
    <label><span>Позиция</span><input name="positionOrder" type="number" min="1" defaultValue={result?.positionOrder ?? ''} required /></label>
    <label><span>Обозначение</span><input name="positionText" defaultValue={result?.positionText ?? ''} placeholder="1, DNF, DSQ" required /></label>
    <label><span>Команда</span><select name="constructorEntryId" defaultValue={result?.constructorEntryId ?? ''}><option value="">Не указана</option>{constructors.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
    <label><span>Старт</span><input name="gridPosition" type="number" min="0" defaultValue={result?.gridPosition ?? ''} /></label>
    <label><span>Круги</span><input name="laps" type="number" min="0" defaultValue={result?.laps ?? ''} /></label>
    <label><span>Очки</span><input name="points" type="number" min="0" max="100" step="0.01" defaultValue={result?.points ?? 0} /></label>
    <label><span>Статус финиша</span><input name="resultStatus" defaultValue={result?.status ?? ''} placeholder="Finished, Retired…" /></label>
    <details className="admin-result-advanced">
      <summary><span><strong>Дополнительные показатели</strong><small>Время, отставание, быстрый круг, квалификация и штрафы</small></span></summary>
      <div className="admin-result-advanced-grid">
        <label><span>Общее время</span><input name="elapsedTime" defaultValue={formatDuration(result?.elapsedMs ?? null)} placeholder="1:32:15.456" /></label>
        <label><span>Отставание по времени</span><input name="gapTime" defaultValue={formatDuration(result?.gapMs ?? null)} placeholder="0:05.123" /></label>
        <label><span>Отображаемое отставание</span><input name="gapText" defaultValue={result?.gapText ?? ''} placeholder="+5.123, +1 круг" /></label>
        <label><span>Место быстрого круга</span><input name="fastestLapRank" type="number" min="1" defaultValue={result?.fastestLapRank ?? ''} /></label>
        <label><span>Номер быстрого круга</span><input name="fastestLapNumber" type="number" min="1" defaultValue={result?.fastestLapNumber ?? ''} /></label>
        <label><span>Время быстрого круга</span><input name="fastestLapTime" defaultValue={formatDuration(result?.fastestLapMs ?? null)} placeholder="1:47.263" /></label>
        <label><span>Q1</span><input name="q1Time" defaultValue={formatDuration(result?.q1Ms ?? null)} placeholder="1:21.456" /></label>
        <label><span>Q2</span><input name="q2Time" defaultValue={formatDuration(result?.q2Ms ?? null)} placeholder="1:20.987" /></label>
        <label><span>Q3</span><input name="q3Time" defaultValue={formatDuration(result?.q3Ms ?? null)} placeholder="1:20.321" /></label>
        <label className="is-wide"><span>Штраф или примечание</span><textarea name="penaltyNote" rows={2} defaultValue={result?.penaltyNote ?? ''} placeholder="Штраф на стартовой решётке, добавленное время или причина исключения" /></label>
      </div>
    </details>
    <label className="is-wide"><span>Источник результата</span><input name="sourceUrl" type="url" defaultValue={result?.sourceUrl ?? sourceUrl} required /></label>
    <label className="admin-rights-confirmation"><input type="checkbox" name="sourceVerified" value="yes" required /><span><strong>Источник проверен</strong><small>Результат публикуется только с подтверждённым источником</small></span></label>
  </div>;
}

export default async function AdminEventSessionPage({ params, searchParams }: {
  params: Promise<{ id: string; sessionId: string }>;
  searchParams: Promise<{ saved?: string; resultSaved?: string; bulkSaved?: string; deleted?: string; syncError?: string; error?: string }>;
}) {
  if (!await getLoginSession()) redirect('/admin/login');
  if (!isAdminDatabaseConfigured()) redirect('/admin/overview');
  const [{ id, sessionId }, state] = await Promise.all([params, searchParams]);
  let bundle: Awaited<ReturnType<typeof getAdminEventSession>>;
  try { bundle = await getAdminEventSession(id, sessionId); }
  catch (error) {
    console.error('Не удалось загрузить сессию', error);
    return <main className="admin-shell"><div className="admin-alert is-error">Не удалось загрузить данные сессии</div></main>;
  }
  if (!bundle) notFound();
  const sourceUrl = bundle.session.sourceUrl ?? '';
  return <main className="admin-shell"><section className="admin-edit-panel admin-event-editor admin-session-editor">
    <Link className="admin-back-link" href={`/admin/events/${encodeURIComponent(id)}`}>← Вернуться к этапу</Link>
    <header><div><span className="admin-kicker">Сессия этапа</span><h1>{bundle.session.name}</h1><p>{bundle.event.seasonYear} · этап {bundle.event.round} · {bundle.event.name}</p></div><code>{bundle.session.id}</code></header>
    {state.saved === '1' ? <div className="admin-alert is-success">Сессия сохранена</div> : null}
    {state.resultSaved === '1' ? <div className="admin-alert is-success">Строка классификации сохранена</div> : null}
    {state.bulkSaved ? <div className="admin-alert is-success">Пакетно сохранено строк: {state.bulkSaved}</div> : null}
    {state.deleted === '1' ? <div className="admin-alert is-success">Ошибочная строка классификации удалена</div> : null}
    {state.syncError === '1' ? <div className="admin-alert">Изменение сохранено, но публичные данные пока не обновлены</div> : null}
    {state.error ? <div className="admin-alert is-error">Не удалось сохранить данные. Проверьте обязательные поля и источник</div> : null}
    <form action={saveEventSession} className="admin-editor-form">
      <input type="hidden" name="create" value="0" /><input type="hidden" name="raceId" value={id} /><input type="hidden" name="id" value={sessionId} />
      <fieldset><legend>Параметры сессии</legend><div className="admin-form-grid">
        <label><span>Тип</span><select name="sessionType" defaultValue={bundle.session.sessionType}>{Object.entries(sessionLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <label><span>Название</span><input name="name" defaultValue={bundle.session.name} required /></label>
        <label><span>Начало, UTC</span><input name="startsAt" type="datetime-local" defaultValue={localUtc(bundle.session.startsAt)} /></label>
        <label><span>Окончание, UTC</span><input name="endsAt" type="datetime-local" defaultValue={localUtc(bundle.session.endsAt)} /></label>
        <label><span>Статус</span><select name="status" defaultValue={bundle.session.status}>{Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <label className="is-wide"><span>Источник</span><input name="sourceUrl" type="url" defaultValue={sourceUrl} required /></label>
        <label className="admin-rights-confirmation"><input type="checkbox" name="sourceVerified" value="yes" /><span><strong>Источник проверен</strong><small>Обязательно для завершённой сессии</small></span></label>
      </div></fieldset>
      <div className="admin-form-actions"><span>{bundle.session.resultCount} строк классификации</span><button type="submit">Сохранить сессию</button></div>
    </form>
    <datalist id="event-driver-options">{bundle.drivers.map((driver) => <option key={driver.id} value={driver.id}>{driver.name}</option>)}</datalist>
    <section className="admin-related-section admin-session-results"><header><div><span className="admin-kicker">Классификация</span><h2>Результаты</h2></div><span>{bundle.results.length} записей</span></header>
      <details className="admin-bulk-results-section"><summary>Открыть пакетный редактор всей таблицы</summary><BulkResultsEditor raceId={id} sessionId={sessionId} sourceUrl={sourceUrl} results={bundle.results} constructors={bundle.constructors} /></details>
      <details className="admin-session-result-card is-new"><summary>＋ Добавить пилота</summary><form action={saveSessionResult} className="admin-editor-form"><input type="hidden" name="raceId" value={id} /><input type="hidden" name="sessionId" value={sessionId} /><ResultFields sourceUrl={sourceUrl} constructors={bundle.constructors} /><div className="admin-form-actions"><span>Пилота можно найти по системному ID</span><button type="submit">Добавить результат</button></div></form></details>
      {bundle.results.map((result) => <details className="admin-session-result-card" key={result.driverId}><summary><b>{result.positionText}</b><span>{result.driverName}</span><small>{result.constructorName ?? 'Команда не указана'} · {result.points} очков</small><i>Редактировать</i></summary><form action={saveSessionResult} className="admin-editor-form"><input type="hidden" name="raceId" value={id} /><input type="hidden" name="sessionId" value={sessionId} /><ResultFields result={result} sourceUrl={sourceUrl} constructors={bundle.constructors} /><div className="admin-form-actions"><span>Позиции могут быть разделены между несколькими пилотами</span><button type="submit">Сохранить строку</button></div></form><form action={deleteSessionResult} className="admin-result-delete"><input type="hidden" name="raceId" value={id} /><input type="hidden" name="sessionId" value={sessionId} /><input type="hidden" name="driverId" value={result.driverId} /><label><input type="checkbox" name="confirmDelete" value="yes" required /> Подтверждаю удаление этой строки</label><button type="submit">Удалить результат</button></form></details>)}
    </section>
  </section></main>;
}
