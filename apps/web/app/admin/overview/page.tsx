import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getAdminSession } from '../../lib/admin-auth';
import { getAdminCircuits, getAdminConstructorEntries, getAdminDashboard, getAdminEvents, getAdminMapUiSettings, getAdminMediaRegistry, getAdminSchemaTables, getAdminSeasons, getAdminTravelRegistry, isAdminDatabaseConfigured } from '../../lib/admin-database';
import { saveMapUiSettings } from '../actions';

export default async function AdminOverviewPage({ searchParams }: { searchParams: Promise<{ mapSettingsSaved?: string; error?: string }> }) {
  if (!await getAdminSession()) redirect('/admin/login');
  const state = await searchParams;
  let dashboard: Awaited<ReturnType<typeof getAdminDashboard>> | null = null;
  let teamCount = 0;
  let tableCount = 0;
  let mediaCount = 0;
  let seasonCount = 0;
  let circuitCount = 0;
  let eventCount = 0;
  let travelPointCount = 0;
  let mapSettings = { detailedAttribution: false };
  if (isAdminDatabaseConfigured()) {
    try {
      [dashboard, teamCount, tableCount, mediaCount, seasonCount, circuitCount, eventCount, travelPointCount, mapSettings] = await Promise.all([
        getAdminDashboard({ limit: 1 }),
        getAdminConstructorEntries(2026).then((result) => result.rows.length),
        getAdminSchemaTables().then((result) => result.tables.length),
        getAdminMediaRegistry({ limit: 1 }).then((result) => result.summary.total),
        getAdminSeasons().then((result) => result.length),
        getAdminCircuits({ limit: 1 }).then((result) => result.filteredCount),
        getAdminEvents({ limit: 1 }).then((result) => result.filteredCount),
        getAdminTravelRegistry({ limit: 1 }).then((result) => result.summary.points),
        getAdminMapUiSettings(),
      ]);
    } catch (error) { console.error('Не удалось собрать сводку админки', error); }
  }
  const cards = [
    { href: '/admin', index: '01', title: 'Пилоты', value: dashboard?.summary.catalogDrivers ?? '—', text: 'Профили, биографии, номера и портреты' },
    { href: '/admin/seasons', index: '02', title: 'Сезоны', value: seasonCount || '—', text: 'Статус чемпионата и плановое число этапов' },
    { href: '/admin/events', index: '03', title: 'Этапы и результаты', value: eventCount || '—', text: 'Календарь, привязка конфигураций, сессии и классификация' },
    { href: '/admin/teams', index: '04', title: 'Команды и болиды', value: teamCount || '—', text: 'Сезонные составы, логотипы и изображения машин' },
    { href: '/admin/media', index: '05', title: 'Медиатека', value: mediaCount || '—', text: 'Источники, лицензии, статусы и публикация файлов' },
    { href: '/admin/circuits', index: '06', title: 'Трассы', value: circuitCount || '—', text: 'Справочные данные, публичные профили, конфигурации и материалы' },
    { href: '/admin/travel', index: '07', title: 'Туристические данные', value: travelPointCount || '—', text: 'Точки, районы проживания, маршруты и источники' },
    { href: '/admin/database', index: '08', title: 'Все таблицы', value: tableCount || '—', text: 'Полный доступ к структуре локальной PostgreSQL' },
  ];
  return <main className="admin-shell admin-overview">
    <header><div><span className="admin-kicker">Главное меню</span><h1>Редакция атласа</h1><p>Выберите раздел для работы с данными и материалами сайта</p></div><span className={`admin-connection-status ${dashboard ? 'is-online' : ''}`}>{dashboard ? 'PostgreSQL подключена' : 'База недоступна'}</span></header>
    {state.mapSettingsSaved ? <div className="admin-alert is-success">Вид подписей на картах обновлён</div> : null}
    {state.error === 'map-settings' ? <div className="admin-alert is-error">Не удалось сохранить вид подписей</div> : null}
    <form className="admin-map-settings" action={saveMapUiSettings}><div><span className="admin-kicker">Карты</span><strong>Развёрнутые сноски</strong><p>Выключено: компактная ссылка «© OSM · OFM». Включено: полные названия поставщиков</p></div><label className="admin-switch"><input type="checkbox" name="detailedAttribution" value="yes" defaultChecked={mapSettings.detailedAttribution} /><span aria-hidden="true" /><b>{mapSettings.detailedAttribution ? 'Включены' : 'Выключены'}</b></label><button type="submit">Сохранить</button></form>
    <section className="admin-overview-grid">{cards.map((card) => <Link href={card.href} key={card.href}><span>{card.index}</span><strong>{card.title}</strong><b>{typeof card.value === 'number' ? card.value.toLocaleString('ru-RU') : card.value}</b><p>{card.text}</p><i>Открыть раздел →</i></Link>)}</section>
    {dashboard ? <section className="admin-overview-issues"><header><div><span className="admin-kicker">Требует внимания</span><h2>Редакционные задачи</h2></div></header><div><Link href="/admin?filter=unresolved-life-data"><strong>{dashboard.summary.unresolvedLifeData}</strong><span>профилей пилотов без места рождения</span></Link><Link href="/admin?filter=missing-photo"><strong>{dashboard.summary.catalogDrivers - dashboard.summary.driverPhotos}</strong><span>пилотов без загруженного портрета</span></Link><Link href="/admin/media?rights=unresolved"><strong>→</strong><span>материалы с неподтверждёнными правами</span></Link></div></section> : <div className="admin-alert is-error">Не удалось подключиться к локальной базе данных</div>}
  </main>;
}
