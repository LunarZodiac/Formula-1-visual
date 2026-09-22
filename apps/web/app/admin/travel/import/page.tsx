import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getAdminSession } from '../../../lib/admin-auth';
import { getAdminTravelImportPreview, getAdminTravelRegistry, isAdminDatabaseConfigured } from '../../../lib/admin-database';
import { applyTravelCandidates, previewTravelCandidates } from '../../actions';
import { TravelCandidatePreview } from './travel-candidate-preview';

const groups = [
  { id: 'transport', name: 'Транспорт', note: 'Аэропорты, вокзалы, автостанции и P+R' },
  { id: 'stay', name: 'Размещение', note: 'Отели и другие варианты внутри будущих районов проживания' },
  { id: 'explore', name: 'Достопримечательности', note: 'История, музеи, природа и интересные места' },
  { id: 'essential', name: 'Полезное рядом', note: 'Медицина, магазины, рестораны и кафе' },
];

export default async function AdminTravelImportPage({ searchParams }: {
  searchParams: Promise<{ circuit?: string; preview?: string; error?: string }>;
}) {
  if (!await getAdminSession()) redirect('/admin/login');
  if (!isAdminDatabaseConfigured()) redirect('/admin/overview');
  const state = await searchParams;
  const [registry, preview] = await Promise.all([
    getAdminTravelRegistry({ limit: 100 }),
    state.preview ? getAdminTravelImportPreview(state.preview) : Promise.resolve(null),
  ]);
  return <main className="admin-shell"><section className="admin-edit-panel admin-travel-import">
    <Link className="admin-back-link" href="/admin/travel">← Туристические данные</Link>
    <header><div><span className="admin-kicker">Импорт из OpenStreetMap</span><h1>Поиск кандидатов</h1><p>Сначала создаётся временный предпросмотр. PostgreSQL изменится только после подтверждения выбранных строк</p></div></header>
    {state.error === 'preview' ? <div className="admin-alert is-error">Источник не вернул точки или запрос завершился ошибкой. Попробуйте отдельные группы</div> : null}
    {state.error === 'apply' ? <div className="admin-alert is-error">Не удалось сохранить выбранные точки. Предпросмотр ещё можно использовать</div> : null}
    {state.error === 'expired' ? <div className="admin-alert is-error">Предпросмотр устарел. Запустите поиск заново</div> : null}
    {!preview ? <form action={previewTravelCandidates} className="admin-editor-form">
      <fieldset><legend>Трасса и группы</legend><div className="admin-form-grid">
        <label className="is-wide"><span>Трасса</span><select name="circuitId" defaultValue={state.circuit ?? ''} required><option value="">Выберите трассу</option>{registry.rows.map((circuit) => <option key={circuit.id} value={circuit.id}>{circuit.name} · {circuit.id}</option>)}</select><small>Постоянные точки сохраняются один раз для трассы, без сезонных копий</small></label>
      </div><div className="admin-travel-group-options">{groups.map((group) => <label key={group.id}><input type="checkbox" name="groups" value={group.id} defaultChecked /><span><strong>{group.name}</strong><small>{group.note}</small></span></label>)}</div></fieldset>
      <fieldset><legend>Радиусы поиска</legend><div className="admin-form-grid">
        <label><span>Аэропорты, км</span><input name="airportRadius" type="number" min="1" max="250" defaultValue="200" /></label>
        <label><span>Станции и P+R, км</span><input name="transportRadius" type="number" min="1" max="250" defaultValue="50" /></label>
        <label><span>Размещение, км</span><input name="stayRadius" type="number" min="1" max="250" defaultValue="50" /></label>
        <label><span>Достопримечательности, км</span><input name="exploreRadius" type="number" min="1" max="250" defaultValue="50" /></label>
        <label><span>Полезное рядом, км</span><input name="essentialRadius" type="number" min="1" max="250" defaultValue="15" /></label>
      </div></fieldset>
      <div className="admin-form-actions"><span>Поиск может занять до нескольких минут и ничего не публикует автоматически</span><button type="submit">Найти точки</button></div>
    </form> : <form action={applyTravelCandidates}>
      <input type="hidden" name="token" value={preview.token} />
      <section className="admin-travel-preview-summary"><div><span>Трасса</span><strong>{preview.circuit.name}</strong></div><div><span>Найдено</span><strong>{preview.candidates.length}</strong></div><div><span>Предложено</span><strong>{Math.min(80, preview.candidates.length)}</strong></div><div><span>Предпросмотр действует до</span><strong>{new Intl.DateTimeFormat('ru-RU', { hour: '2-digit', minute: '2-digit' }).format(new Date(preview.expiresAt))}</strong></div></section>
      {preview.failedGroups.length ? <div className="admin-alert">Некоторые группы получены не полностью: {preview.failedGroups.join(', ')}</div> : null}
      <div className="admin-travel-preview-toolbar"><div><strong>Выберите кандидатов</strong><span>Первые 80 отмечены по рейтингу. Русское название из OpenStreetMap подставится автоматически, а исходное сохранится для проверки</span></div><Link className="admin-row-action" href={`/admin/travel/import?circuit=${encodeURIComponent(preview.circuit.id)}`}>Новый поиск</Link></div>
      <TravelCandidatePreview preview={preview} />
      <div className="admin-form-actions"><span>После импорта точки будут доступны для дальнейшей проверки, но не появятся на сайте</span><button type="submit">Импортировать выбранные</button></div>
    </form>}
  </section></main>;
}
