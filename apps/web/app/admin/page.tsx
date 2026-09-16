import { redirect } from 'next/navigation';
import Link from 'next/link';
import drivers from '../data/catalogs/drivers-all.json';
import { driverPhotoUrl } from '../data/driver-photo-sources';
import { getAdminSession } from '../lib/admin-auth';
import { getAdminDashboard, isAdminDatabaseConfigured, type AdminDriverListItem } from '../lib/admin-database';
import { AdminDriverTable } from './admin-driver-table';
import { AdminPagination } from './admin-pagination';

const pageSize = 50;

export default async function AdminPage({ searchParams }: { searchParams: Promise<{ q?: string; page?: string; filter?: string; savedDriver?: string; quickError?: string; syncError?: string }> }) {
  const session = await getAdminSession();
  if (!session) redirect('/admin/login');
  const requested = await searchParams;
  const query = requested.q?.trim().slice(0, 120) ?? '';
  const activeFilter = requested.filter === 'unresolved-life-data' || requested.filter === 'missing-photo' ? requested.filter : '';
  const parsedPage = Number.parseInt(requested.page ?? '1', 10);
  const page = Number.isFinite(parsedPage) && parsedPage > 0 ? parsedPage : 1;
  const databaseConfigured = isAdminDatabaseConfigured();
  const availablePhotoIds = drivers.drivers.filter((driver) => driverPhotoUrl(driver.id, 160)).map((driver) => driver.id);
  let databaseError = false;
  let dashboard: Awaited<ReturnType<typeof getAdminDashboard>> | null = null;
  if (databaseConfigured) {
    try {
      dashboard = await getAdminDashboard({ limit: pageSize, page, query, filter: activeFilter, availablePhotoIds });
    } catch (error) {
      console.error('Не удалось загрузить локальную базу для админки', error);
      databaseError = true;
    }
  }
  const fallbackDirectory: AdminDriverListItem[] = drivers.drivers.map((driver) => ({
    id: driver.id,
    nameRu: driver.nameRu,
    birthDate: driver.birthDate ?? null,
    birthPlaceRu: driver.birthPlace ?? null,
    deathDate: driver.deathDate ?? null,
    heightCm: null,
    weightKg: null,
    sourceUrl: null,
    firstSeason: driver.firstSeason,
    latestSeason: driver.latestSeason,
    seasonCount: driver.seasonCount,
    latestTeam: driver.team?.name ?? null,
    hasPhoto: Boolean(driverPhotoUrl(driver.id, 160)),
    photoUrl: driverPhotoUrl(driver.id, 160),
  }));
  const issueFilteredFallback = activeFilter === 'unresolved-life-data'
    ? fallbackDirectory.filter((driver) => !drivers.drivers.find((catalogDriver) => catalogDriver.id === driver.id)?.birthPlace)
    : activeFilter === 'missing-photo'
      ? fallbackDirectory.filter((driver) => !driver.hasPhoto)
      : fallbackDirectory;
  const filteredFallback = query ? issueFilteredFallback.filter((driver) => `${driver.id} ${driver.nameRu}`.toLocaleLowerCase('ru').includes(query.toLocaleLowerCase('ru'))) : issueFilteredFallback;
  const rows = (dashboard?.rows ?? filteredFallback.slice((page - 1) * pageSize, page * pageSize)).map((driver) => {
    const availablePhoto = driver.photoUrl ?? driverPhotoUrl(driver.id, 160);
    return { ...driver, photoUrl: availablePhoto, hasPhoto: Boolean(availablePhoto) };
  });
  const filteredCount = dashboard?.filteredCount ?? filteredFallback.length;
  const totalPages = Math.max(1, Math.ceil(filteredCount / pageSize));
  const catalogDriverCount = dashboard?.summary.catalogDrivers ?? drivers.drivers.length;
  const birthPlaceCount = dashboard?.summary.birthPlaces ?? drivers.drivers.filter((driver) => driver.birthPlace).length;
  const deathDateCount = dashboard?.summary.deathDates ?? drivers.drivers.filter((driver) => driver.deathDate).length;
  const driverPhotoCount = dashboard?.summary.driverPhotos ?? fallbackDirectory.filter((driver) => driver.hasPhoto).length;
  const unresolvedLifeDataCount = dashboard?.summary.unresolvedLifeData ?? catalogDriverCount - birthPlaceCount;
  const currentParameters = new URLSearchParams({
    ...(query ? { q: query } : {}),
    ...(activeFilter ? { filter: activeFilter } : {}),
    page: String(page),
  });
  const returnTo = `/admin?${currentParameters}`;

  return <main className="admin-shell">
    <header className="admin-header">
      <div><span className="admin-kicker">География скорости</span><h1>Редакция атласа</h1><p>{dashboard ? `Локальная PostgreSQL · ${dashboard.summary.databaseDrivers} записей · ${catalogDriverCount} участников Гран-при` : `Экспортированный каталог · ${catalogDriverCount} пилотов`}</p></div>
      <span className={`admin-connection-status ${dashboard ? 'is-online' : ''}`}>{dashboard ? 'PostgreSQL подключена' : 'Экспортированный каталог'}</span>
    </header>
    <section className="admin-summary" aria-label="Состояние данных">
      <div><strong>{catalogDriverCount}</strong><span>пилотов в каталоге</span></div>
      <div><strong>{birthPlaceCount}</strong><span>мест рождения</span></div>
      <div><strong>{deathDateCount}</strong><span>дат смерти</span></div>
      <Link className={activeFilter === 'missing-photo' ? 'is-active' : ''} href={activeFilter === 'missing-photo' ? '/admin' : '/admin?filter=missing-photo'} aria-current={activeFilter === 'missing-photo' ? 'true' : undefined}>
        <strong>{driverPhotoCount}</strong><span>загружено портретов</span><small>{activeFilter === 'missing-photo' ? 'Показать весь каталог' : `Без загруженного портрета: ${catalogDriverCount - driverPhotoCount}`}</small>
      </Link>
      <Link className={activeFilter === 'unresolved-life-data' ? 'is-active' : ''} href={activeFilter === 'unresolved-life-data' ? '/admin' : '/admin?filter=unresolved-life-data'} aria-current={activeFilter === 'unresolved-life-data' ? 'true' : undefined}>
        <strong>{unresolvedLifeDataCount}</strong><span>запись требует решения</span><small>{activeFilter ? 'Показать весь каталог' : 'Показать запись'}</small>
      </Link>
    </section>
    {!databaseConfigured ? <div className="admin-alert">Каталог доступен для просмотра. Чтобы включить редактирование, добавьте параметры PostgreSQL в apps/web/.dev.vars</div> : null}
    {databaseError ? <div className="admin-alert is-error">Не удалось подключиться к PostgreSQL. Проверьте параметры базы в apps/web/.dev.vars и перезапустите сайт</div> : null}
    {requested.savedDriver ? <div className="admin-alert is-success">Изменения пилота сохранены</div> : null}
    {requested.quickError ? <div className="admin-alert is-error">Не удалось сохранить строку. Проверьте поля и ссылку на источник</div> : null}
    {requested.syncError ? <div className="admin-alert is-error">База обновлена, но публичный каталог не синхронизирован</div> : null}
    <section className="admin-directory">
      <header><div><span className="admin-kicker">Первый модуль</span><h2>Пилоты</h2></div><p>{filteredCount} записей · страница {Math.min(page, totalPages)} из {totalPages}. Нажмите на имя для редактирования</p></header>
      <form className="admin-directory-search" method="get">{activeFilter ? <input type="hidden" name="filter" value={activeFilter} /> : null}<label><span>Найти пилота</span><input name="q" type="search" defaultValue={query} placeholder="Русское имя, исходное имя или ID" /></label><button type="submit">Найти</button>{query || activeFilter ? <Link href="/admin">Сбросить</Link> : null}</form>
      <AdminDriverTable rows={rows} databaseConfigured={databaseConfigured && !databaseError} returnTo={returnTo} />
      {!rows.length ? <p className="admin-directory-empty">Пилоты по запросу не найдены</p> : null}
      <AdminPagination basePath="/admin" page={page} totalPages={totalPages} parameters={{ q: query, filter: activeFilter }} label="Страницы каталога пилотов" />
    </section>
  </main>;
}
