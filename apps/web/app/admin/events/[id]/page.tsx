import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { getAdminSession } from '../../../lib/admin-auth';
import { getAdminEvent, getAdminEventEditorOptions, getAdminEventSessions, isAdminDatabaseConfigured } from '../../../lib/admin-database';
import { saveEvent, saveEventSession } from '../../actions';
import { CircuitLayoutFields } from './circuit-layout-fields';

const statusLabels = {
  scheduled: 'Запланирован', live: 'Идёт сейчас', completed: 'Завершён',
  postponed: 'Перенесён', cancelled: 'Отменён',
} as const;

const sessionLabels = {
  practice_1: 'Практика 1', practice_2: 'Практика 2', practice_3: 'Практика 3', qualifying: 'Квалификация',
  sprint_shootout: 'Спринт-квалификация', sprint: 'Спринт', race: 'Гонка',
} as const;

export default async function AdminEventPage({ params, searchParams }: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ season?: string; saved?: string; syncError?: string; error?: string }>;
}) {
  if (!await getAdminSession()) redirect('/admin/login');
  if (!isAdminDatabaseConfigured()) redirect('/admin/overview');
  const [{ id }, state] = await Promise.all([params, searchParams]);
  const create = id === 'new';
  let event: Awaited<ReturnType<typeof getAdminEvent>> = null;
  let options: Awaited<ReturnType<typeof getAdminEventEditorOptions>>;
  try { [event, options] = await Promise.all([create ? Promise.resolve(null) : getAdminEvent(id), getAdminEventEditorOptions()]); }
  catch (error) {
    console.error('Не удалось открыть этап', error);
    return <main className="admin-shell"><div className="admin-alert is-error">Локальная база этапов недоступна</div></main>;
  }
  if (!create && !event) notFound();
  const requestedSeason = Number.parseInt(state.season ?? '', 10);
  const defaultSeason = event?.seasonYear ?? (Number.isInteger(requestedSeason) ? requestedSeason : options.seasons[0] ?? 2026);
  const defaultCircuit = event?.circuitId ?? options.circuits[0]?.id ?? '';
  const sessions = event ? await getAdminEventSessions(event.id) : [];
  return <main className="admin-shell"><section className="admin-edit-panel admin-event-editor">
    <Link className="admin-back-link" href={`/admin/events${event ? `?season=${event.seasonYear}` : ''}`}>← Вернуться к этапам</Link>
    <header><div><span className="admin-kicker">Календарная запись</span><h1>{event?.name ?? 'Новый этап'}</h1><p>{event ? `${event.seasonYear} · этап ${event.round}` : 'Добавление этапа чемпионата'}</p></div>{event ? <code>{event.id}</code> : null}</header>
    {state.saved === '1' ? <div className="admin-alert is-success">Этап сохранён и календарные данные обновлены</div> : null}
    {state.syncError === '1' ? <div className="admin-alert">Этап сохранён в PostgreSQL, но публичный снимок сезона не обновился</div> : null}
    {state.error ? <div className="admin-alert is-error">Не удалось сохранить этап. Проверьте сезон, номер, трассу, конфигурацию и источник</div> : null}
    {event ? <section className="admin-event-summary"><div><span>Сессии</span><strong>{event.completedSessionCount}/{event.sessionCount}</strong></div><div><span>Результаты</span><strong>{event.resultCount}</strong></div><div><span>Победитель</span><strong>{event.winner?.name ?? 'Не определён'}</strong></div><div><span>Обновлено</span><strong>{new Intl.DateTimeFormat('ru-RU', { dateStyle: 'medium' }).format(new Date(event.updatedAt))}</strong></div></section> : null}
    <form action={saveEvent} className="admin-editor-form">
      <input type="hidden" name="create" value={create ? '1' : '0'} />
      <fieldset><legend>Идентичность и календарь</legend><div className="admin-form-grid">
        <label><span>ID этапа</span>{create ? <input name="id" pattern="[A-Za-z0-9_-]+" placeholder={`${defaultSeason}-01`} required /> : <><input type="hidden" name="id" value={event!.id} /><input value={event!.id} disabled /></>}<small>Системный ID после создания не меняется</small></label>
        <CircuitLayoutFields circuits={options.circuits} defaultCircuitId={defaultCircuit} defaultLayoutId={event?.layoutId ?? ''} defaultSeason={defaultSeason} />
        <label><span>Номер этапа</span><input name="round" type="number" min="1" max="40" defaultValue={event?.round ?? ''} required /></label>
        <label className="is-wide"><span>Официальное название</span><input name="name" defaultValue={event?.name ?? ''} placeholder="Belgian Grand Prix" required /></label>
        <label><span>Дата гонки</span><input name="raceDate" type="date" defaultValue={event?.raceDate ?? ''} /></label>
        <label><span>Время старта UTC</span><input name="startTimeUtc" type="time" step="60" defaultValue={event?.startTimeUtc?.slice(0, 5) ?? ''} /></label>
        <label><span>Статус</span><select name="status" defaultValue={event?.status ?? 'scheduled'}>{Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      </div></fieldset>
      <fieldset><legend>Источник</legend><div className="admin-form-grid">
        <label className="is-wide"><span>URL источника календаря или результата</span><input name="sourceUrl" type="url" defaultValue={event?.sourceUrl ?? ''} placeholder="https://…" required /></label>
        <label className="admin-rights-confirmation"><input type="checkbox" name="sourceVerified" value="yes" /><span><strong>Источник проверен</strong><small>Обязательно, если этап уже идёт или завершён</small></span></label>
      </div></fieldset>
      <div className="admin-form-actions"><span>Победитель вычисляется из результатов гонки и здесь не редактируется</span><button type="submit">{create ? 'Добавить этап' : 'Сохранить этап'}</button></div>
    </form>
    {event ? <section className="admin-related-section admin-session-section"><header><div><span className="admin-kicker">Программа этапа</span><h2>Сессии и результаты</h2></div><span>{event.sessionCount} сессий · {event.resultCount} результатов</span></header>
      {sessions.length ? <div className="admin-session-tabs">{sessions.map((session) => <Link key={session.id} href={`/admin/events/${event.id}/sessions/${session.id}`}>
        <span>{sessionLabels[session.sessionType]}</span><strong>{session.name}</strong><small>{statusLabels[session.status]} · {session.resultCount} строк</small>
      </Link>)}</div> : <p className="admin-related-note">Сессий пока нет. Добавьте первую практику, квалификацию, спринт или гонку</p>}
      <details className="admin-session-create"><summary>+ Добавить сессию</summary><form action={saveEventSession} className="admin-editor-form">
        <input type="hidden" name="raceId" value={event.id} /><input type="hidden" name="id" value="" /><input type="hidden" name="create" value="1" />
        <div className="admin-form-grid"><label><span>Тип</span><select name="sessionType" defaultValue="practice_1">{Object.entries(sessionLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          <label><span>Название</span><input name="name" defaultValue="Практика 1" required /></label>
          <label><span>Начало, UTC</span><input type="datetime-local" name="startsAt" /></label><label><span>Окончание, UTC</span><input type="datetime-local" name="endsAt" /></label>
          <label><span>Статус</span><select name="status" defaultValue="scheduled">{Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          <label><span>Источник</span><input name="sourceUrl" type="url" defaultValue={event.sourceUrl ?? ''} required /></label>
          <label className="admin-rights-confirmation"><input type="checkbox" name="sourceVerified" value="yes" /><span><strong>Источник проверен</strong><small>Обязательно для завершённой сессии</small></span></label>
        </div><div className="admin-form-actions"><span>ID сформируется из этапа и типа сессии</span><button type="submit">Добавить сессию</button></div>
      </form></details>
    </section> : null}
  </section></main>;
}
