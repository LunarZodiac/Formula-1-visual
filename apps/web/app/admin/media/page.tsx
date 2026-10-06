/* eslint-disable @next/next/no-img-element */
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getAdminSession } from '../../lib/admin-auth';
import { getAdminMediaRegistry, isAdminDatabaseConfigured, type AdminMediaAsset } from '../../lib/admin-database';
import { AdminPagination } from '../admin-pagination';

const pageSize = 40;
const entityLabels: Record<string, string> = { driver: 'Пилот', constructor: 'Команда', circuit: 'Трасса', tourism_poi: 'Туристическая точка', race: 'Этап', season: 'Сезон' };
const roleLabels: Record<string, string> = { portrait: 'Портрет', constructor_car: 'Болид', team_logo: 'Логотип команды', hero: 'Главное изображение', card: 'Карточка', gallery: 'Галерея', history: 'История', general: 'Общее' };
const rightsLabels: Record<string, string> = { verified: 'Права подтверждены', unresolved: 'Права не проверены', restricted: 'Ограничено' };
const reviewLabels: Record<string, string> = { candidate: 'Кандидат', reviewed: 'Проверено', published: 'Опубликовано', hidden: 'Скрыто' };

function entityHref(asset: AdminMediaAsset) {
  if (asset.entityType === 'driver') return `/admin/drivers/${encodeURIComponent(asset.entityId)}#photo`;
  if (asset.entityType === 'constructor' && asset.season) return `/admin/teams/${asset.season}/${encodeURIComponent(asset.entityId)}`;
  if (asset.entityType === 'circuit') return `/admin/circuits/${encodeURIComponent(asset.entityId)}/media`;
  if (asset.entityType === 'game') return '/admin/games';
  if (asset.entityType === 'history_era') return `/admin/history/${encodeURIComponent(asset.entityId)}`;
  return null;
}

function EntityLink({ asset }: { asset: AdminMediaAsset }) {
  const href = entityHref(asset);
  return href ? <Link href={href}>Связанная запись</Link> : null;
}

export default async function AdminMediaPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  if (!await getAdminSession()) redirect('/admin/login');
  const requested = await searchParams;
  const page = Math.max(1, Number.parseInt(requested.page ?? '1', 10) || 1);
  const seasonNumber = requested.season ? Number(requested.season) : null;
  const filters = {
    page, limit: pageSize, query: requested.q?.trim().slice(0, 120) ?? '',
    entityType: requested.entityType ?? '', usageRole: requested.usageRole ?? '',
    season: Number.isInteger(seasonNumber) ? seasonNumber : null,
    rights: requested.rights ?? '', review: requested.review ?? '',
  };
  let registry: Awaited<ReturnType<typeof getAdminMediaRegistry>> | null = null;
  if (isAdminDatabaseConfigured()) {
    try { registry = await getAdminMediaRegistry(filters); }
    catch (error) { console.error('Не удалось открыть медиареестр', error); }
  }
  const totalPages = Math.max(1, Math.ceil((registry?.filteredCount ?? 0) / pageSize));
  return <main className="admin-shell admin-media-page">
    <header className="admin-section-header"><div><span className="admin-kicker">Единый реестр материалов</span><h1>Медиатека</h1><p>Изображения, источники, лицензии и состояние публикации</p></div>{registry ? <strong>{registry.summary.total.toLocaleString('ru-RU')} файлов</strong> : null}</header>
    {!registry ? <div className="admin-alert is-error">База данных или медиареестр недоступны</div> : <>
      <section className="admin-media-summary">
        <div><strong>{registry.summary.total}</strong><span>всего материалов</span></div>
        <Link className={filters.rights === 'unresolved' ? 'is-active' : ''} href={filters.rights === 'unresolved' ? '/admin/media' : '/admin/media?rights=unresolved'}><strong>{registry.summary.unresolved_rights}</strong><span>права не проверены</span></Link>
        <Link className={filters.review === 'candidate' ? 'is-active' : ''} href={filters.review === 'candidate' ? '/admin/media' : '/admin/media?review=candidate'}><strong>{registry.summary.candidates}</strong><span>кандидатов</span></Link>
        <div><strong>{registry.summary.published}</strong><span>опубликовано</span></div>
      </section>
      <form className="admin-media-filters" method="get">
        <label className="is-wide"><span>Поиск</span><input name="q" type="search" defaultValue={filters.query} placeholder="ID, сущность, подпись или автор" /></label>
        <label><span>Сущность</span><select name="entityType" defaultValue={filters.entityType}><option value="">Все сущности</option>{registry.options.entityTypes.map((value) => <option value={value} key={value}>{entityLabels[value] ?? value}</option>)}</select></label>
        <label><span>Назначение</span><select name="usageRole" defaultValue={filters.usageRole}><option value="">Любое назначение</option>{registry.options.usageRoles.map((value) => <option value={value} key={value}>{roleLabels[value] ?? value}</option>)}</select></label>
        <label><span>Сезон</span><input name="season" type="number" min="1950" max="2100" defaultValue={filters.season ?? ''} placeholder="Все" /></label>
        <label><span>Права</span><select name="rights" defaultValue={filters.rights}><option value="">Любой статус</option>{Object.entries(rightsLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
        <label><span>Проверка</span><select name="review" defaultValue={filters.review}><option value="">Любой статус</option>{Object.entries(reviewLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
        <div><button type="submit">Применить</button><Link href="/admin/media">Сбросить</Link></div>
      </form>
      <p className="admin-media-count">Найдено материалов: {registry.filteredCount.toLocaleString('ru-RU')}</p>
      <section className="admin-media-list">{registry.rows.map((asset) => <article key={asset.id}>
        <div className="admin-media-thumb">{asset.mediaType === 'image' ? <img src={asset.url} alt={asset.altTextRu ?? ''} loading="lazy" /> : <span>{asset.mediaType}</span>}</div>
        <div className="admin-media-main"><span>{entityLabels[asset.entityType] ?? asset.entityType} · {roleLabels[asset.usageRole] ?? asset.usageRole}</span><h2>{asset.altTextRu || asset.id}</h2><code>{asset.entityId}{asset.season ? ` · ${asset.season}` : ''}</code><p>{asset.author || 'Автор не указан'} · {asset.licence || 'Лицензия не указана'}</p></div>
        <div className="admin-media-state"><span className={`admin-status is-${asset.rightsStatus}`}>{rightsLabels[asset.rightsStatus] ?? asset.rightsStatus}</span><span className={`admin-status is-${asset.reviewStatus}`}>{reviewLabels[asset.reviewStatus] ?? asset.reviewStatus}</span><small>Производных файлов: {asset.derivativeCount}</small></div>
        <div className="admin-media-actions"><Link className="is-primary" href={`/admin/media/${encodeURIComponent(asset.id)}`}>Редактировать</Link><EntityLink asset={asset} />{asset.sourceUrl ? <a href={asset.sourceUrl} target="_blank" rel="noreferrer">Источник ↗</a> : null}</div>
      </article>)}</section>
      {!registry.rows.length ? <p className="admin-directory-empty">По выбранным фильтрам материалов нет</p> : null}
      <AdminPagination basePath="/admin/media" page={page} totalPages={totalPages} parameters={{ q: filters.query, entityType: filters.entityType, usageRole: filters.usageRole, season: filters.season, rights: filters.rights, review: filters.review }} label="Страницы медиатеки" />
    </>}
  </main>;
}
