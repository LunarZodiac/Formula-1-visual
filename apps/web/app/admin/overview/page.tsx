import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getAdminSession } from '../../lib/admin-auth';
import {
  getAdminCircuits,
  getAdminConstructorEntries,
  getAdminDashboard,
  getAdminEvents,
  getAdminMapUiSettings,
  getAdminMediaRegistry,
  getAdminSchemaTables,
  getAdminSeasons,
  getAdminTravelRegistry,
  isAdminDatabaseConfigured,
} from '../../lib/admin-database';
import { saveMapUiSettings } from '../actions';

async function safeCount<T>(
  request: () => Promise<T>,
  fallback: T,
) {
  try {
    return await request();
  } catch {
    return fallback;
  }
}

export default async function AdminOverviewPage({
  searchParams,
}: {
  searchParams: Promise<{
    mapSettingsSaved?: string;
    error?: string;
  }>;
}) {
  if (!await getAdminSession()) redirect('/admin/login');

  const state = await searchParams;

  let dashboard: Awaited<ReturnType<typeof getAdminDashboard>> | null = null;

  if (isAdminDatabaseConfigured()) {
    try {
      dashboard = await getAdminDashboard({ limit: 1 });
    } catch (error) {
      console.error('Не удалось получить сводку Supabase', error);
    }
  }

  const [
    teamCount,
    tableCount,
    mediaCount,
    seasonCount,
    circuitCount,
    eventCount,
    travelPointCount,
    mapSettings,
  ] = await Promise.all([
    safeCount(
      () => getAdminConstructorEntries(2026).then((result) => result.rows.length),
      0,
    ),
    safeCount(
      () => getAdminSchemaTables().then((result) => result.tables.length),
      0,
    ),
    safeCount(
      () => getAdminMediaRegistry({ limit: 1 }).then((result) => result.summary.total),
      0,
    ),
    safeCount(
      () => getAdminSeasons().then((result) => result.length),
      0,
    ),
    safeCount(
      () => getAdminCircuits({ limit: 1 }).then((result) => result.filteredCount),
      0,
    ),
    safeCount(
      () => getAdminEvents({ limit: 1 }).then((result) => result.filteredCount),
      0,
    ),
    safeCount(
      () => getAdminTravelRegistry({ limit: 1 }).then((result) => result.summary.points),
      0,
    ),
    safeCount(
      () => getAdminMapUiSettings(),
      { detailedAttribution: false },
    ),
  ]);

  const cards = [
    {
      href: '/admin',
      index: '01',
      title: 'Пилоты',
      value: dashboard?.summary.catalogDrivers ?? '—',
      text: 'Профили, биографии, номера и портреты',
    },
    {
      href: '/admin/seasons',
      index: '02',
      title: 'Сезоны',
      value: seasonCount || '—',
      text: 'Статус чемпионата и плановое число этапов',
    },
    {
      href: '/admin/events',
      index: '03',
      title: 'Этапы и результаты',
      value: eventCount || '—',
      text: 'Календарь, привязка конфигураций, сессии и классификация',
    },
    {
      href: '/admin/teams',
      index: '04',
      title: 'Команды и болиды',
      value: teamCount || '—',
      text: 'Сезонные составы, логотипы и изображения машин',
    },
    {
      href: '/admin/history',
      index: '05',
      title: 'История',
      value: 6,
      text: 'Эпохи чемпионата, редакционные блоки и источники',
    },
    {
      href: '/admin/media',
      index: '06',
      title: 'Медиатека',
      value: mediaCount || '—',
      text: 'Источники, лицензии, статусы и публикация файлов',
    },
    {
      href: '/admin/circuits',
      index: '07',
      title: 'Трассы',
      value: circuitCount || '—',
      text: 'Справочные данные, публичные профили, конфигурации и материалы',
    },
    {
      href: '/admin/travel',
      index: '08',
      title: 'Туристические данные',
      value: travelPointCount || '—',
      text: 'Точки, районы проживания, маршруты и источники',
    },
    {
      href: '/admin/database',
      index: '09',
      title: 'Все таблицы',
      value: tableCount || '—',
      text: 'Структура базы данных PostgreSQL в Supabase',
    },
  ];

  return (
    <main className="admin-shell admin-overview">
      <header>
        <div>
          <span className="admin-kicker">Главное меню</span>
          <h1>Редакция атласа</h1>
          <p>Выберите раздел для работы с данными и материалами сайта</p>
        </div>

        <span
          className={`admin-connection-status ${dashboard ? 'is-online' : ''}`}
        >
          {dashboard ? 'Supabase подключена' : 'Supabase недоступна'}
        </span>
      </header>

      {state.mapSettingsSaved ? (
        <div className="admin-alert is-success">
          Вид подписей на картах обновлён
        </div>
      ) : null}

      {state.error === 'map-settings' ? (
        <div className="admin-alert is-error">
          Не удалось сохранить вид подписей
        </div>
      ) : null}

      <form
        className="admin-map-settings"
        action={saveMapUiSettings}
      >
        <div>
          <span className="admin-kicker">Карты</span>
          <strong>Развёрнутые сноски</strong>
          <p>
            Выключено: компактная ссылка «© OSM · OFM».
            Включено: полные названия поставщиков
          </p>
        </div>

        <label className="admin-switch">
          <input
            type="checkbox"
            name="detailedAttribution"
            value="yes"
            defaultChecked={mapSettings.detailedAttribution}
          />
          <span aria-hidden="true" />
          <b>
            {mapSettings.detailedAttribution
              ? 'Включены'
              : 'Выключены'}
          </b>
        </label>

        <button type="submit">
          Сохранить
        </button>
      </form>

      <section className="admin-overview-grid">
        {cards.map((card) => (
          <Link
            href={card.href}
            key={card.href}
          >
            <span>{card.index}</span>
            <strong>{card.title}</strong>
            <b>
              {typeof card.value === 'number'
                ? card.value.toLocaleString('ru-RU')
                : card.value}
            </b>
            <p>{card.text}</p>
            <i>Открыть раздел →</i>
          </Link>
        ))}
      </section>

      {dashboard ? (
        <section className="admin-overview-issues">
          <header>
            <div>
              <span className="admin-kicker">
                Требует внимания
              </span>
              <h2>Редакционные задачи</h2>
            </div>
          </header>

          <div>
            <Link href="/admin?filter=unresolved-life-data">
              <strong>
                {dashboard.summary.unresolvedLifeData}
              </strong>
              <span>
                профилей пилотов без места рождения
              </span>
            </Link>

            <Link href="/admin?filter=missing-photo">
              <strong>
                {dashboard.summary.catalogDrivers
                  - dashboard.summary.driverPhotos}
              </strong>
              <span>
                пилотов без загруженного портрета
              </span>
            </Link>

            <Link href="/admin/media?rights=unresolved">
              <strong>→</strong>
              <span>
                материалы с неподтверждёнными правами
              </span>
            </Link>
          </div>
        </section>
      ) : (
        <div className="admin-alert is-error">
          Не удалось получить данные из Supabase
        </div>
      )}
    </main>
  );
}