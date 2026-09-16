import Link from 'next/link';
import type { CSSProperties } from 'react';
import { redirect } from 'next/navigation';
import { getAdminSession } from '../../lib/admin-auth';
import { getAdminCircuits, isAdminDatabaseConfigured } from '../../lib/admin-database';
import { AdminPagination } from '../admin-pagination';

const typeLabels: Record<string, string> = { permanent: 'Стационарная', street: 'Городская', hybrid: 'Гибридная', temporary: 'Временная' };
const statusLabels: Record<string, string> = { draft: 'Черновик', review: 'На проверке', published: 'Опубликована', missing: 'Без профиля' };
const gapLabels: Record<string, string> = { profile: 'Профиль', geometry: 'Контур', assignments: 'Привязка этапов', stats: 'Показатели', history: 'История', media: 'Медиа', annotations: 'Разметка' };

export default async function AdminCircuitsPage({ searchParams }: {
  searchParams: Promise<{ page?: string; q?: string; country?: string; type?: string; status?: string; layout?: string; gap?: string }>;
}) {
  if (!await getAdminSession()) redirect('/admin/login');
  const state = await searchParams;
  const page = Math.max(1, Number.parseInt(state.page ?? '1', 10) || 1);
  let registry: Awaited<ReturnType<typeof getAdminCircuits>> | null = null;
  let databaseError = !isAdminDatabaseConfigured();
  if (!databaseError) {
    try { registry = await getAdminCircuits({ page, query: state.q, country: state.country, type: state.type, status: state.status, layout: state.layout, gap: state.gap }); }
    catch (error) { console.error('Не удалось загрузить каталог трасс', error); databaseError = true; }
  }
  const totalPages = Math.max(1, Math.ceil((registry?.filteredCount ?? 0) / (registry?.limit ?? 30)));
  const parameters = { q: state.q, country: state.country, type: state.type, status: state.status, layout: state.layout, gap: state.gap };
  if (registry && page > totalPages) {
    const corrected = new URLSearchParams();
    for (const [key, value] of Object.entries(parameters)) if (value) corrected.set(key, value);
    corrected.set('page', String(totalPages));
    redirect(`/admin/circuits?${corrected}`);
  }
  return <main className="admin-shell"><section className="admin-directory admin-circuit-directory">
    <header><div><span className="admin-kicker">География чемпионата</span><h1>Трассы</h1></div><p>{registry ? `${registry.filteredCount} записей по текущим фильтрам` : 'Каталог трасс и их публичных профилей'}</p></header>
    {databaseError ? <div className="admin-alert is-error">Локальная база недоступна. Проверьте настройки и перезапустите сайт</div> : null}
    {registry ? <section className="admin-summary admin-circuit-summary" aria-label="Заполненность каталога трасс">
      <div><strong>{registry.summary.circuits}</strong><span>Трасс в каталоге</span><small>Полный исторический список</small></div>
      <Link href="/admin/circuits?status=published"><strong>{registry.summary.publishedProfiles}</strong><span>Опубликовано</span><small>Публичные редакционные профили</small></Link>
      <Link href="/admin/circuits?gap=geometry"><strong>{registry.summary.circuits - registry.summary.verifiedGeometry}</strong><span>Без проверенного контура</span><small>Нет геометрии, источника или происхождения</small></Link>
      <Link href="/admin/circuits?gap=assignments"><strong>{registry.summary.circuits - registry.summary.assignedCalendars}</strong><span>С непривязанными этапами</span><small>Нужно назначить конфигурации календарю</small></Link>
      <Link href="/admin/circuits?gap=annotations"><strong>{registry.summary.circuits - registry.summary.withAnnotations}</strong><span>Без разметки</span><small>Нет поворотов, секторов или DRS</small></Link>
    </section> : null}
    <form id="circuit-column-filters" method="get" />
    {registry ? <div className="admin-table-wrap"><table><thead className="admin-column-filters"><tr>
      <th><span>Трасса</span><input form="circuit-column-filters" name="q" defaultValue={state.q ?? ''} placeholder="Название, город или ID" aria-label="Фильтр по названию, городу или ID трассы" /></th>
      <th><span>Место</span><select form="circuit-column-filters" name="country" defaultValue={state.country ?? ''} aria-label="Фильтр по стране"><option value="">Все страны</option>{registry.countries.map((country) => <option key={country} value={country}>{country.toUpperCase()}</option>)}</select></th>
      <th><span>Тип</span><select form="circuit-column-filters" name="type" defaultValue={state.type ?? ''} aria-label="Фильтр по типу трассы"><option value="">Все типы</option>{Object.entries(typeLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></th>
      <th><span>Сезоны</span></th>
      <th><span>Конфигурации</span><select form="circuit-column-filters" name="layout" defaultValue={state.layout ?? ''} aria-label="Фильтр по конфигурациям"><option value="">Любое состояние</option><option value="ready">Есть проверенная</option><option value="review">Требует проверки</option><option value="missing">Не добавлены</option></select></th>
      <th><span>Наполнение</span><select form="circuit-column-filters" name="gap" defaultValue={state.gap ?? ''} aria-label="Фильтр по недостающему разделу"><option value="">Все уровни</option><option value="ready">Полностью заполнено</option>{Object.entries(gapLabels).map(([value, label]) => <option key={value} value={value}>Нет: {label.toLowerCase()}</option>)}</select></th>
      <th><span>Профиль</span><select form="circuit-column-filters" name="status" defaultValue={state.status ?? ''} aria-label="Фильтр по состоянию профиля"><option value="">Все статусы</option>{Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></th>
      <th><span className="admin-filter-actions"><button form="circuit-column-filters" type="submit">Применить</button><Link href="/admin/circuits">Сбросить</Link></span></th>
    </tr></thead><tbody>
      {registry.rows.map((circuit) => <tr key={circuit.id}>
        <td><Link href={`/admin/circuits/${encodeURIComponent(circuit.id)}`}><strong>{circuit.nameRu ?? circuit.officialName}</strong></Link><small><code>{circuit.id}</code>{circuit.nameRu ? ` · ${circuit.officialName}` : ''}</small></td>
        <td>{circuit.cityRu ?? '—'}<small>{circuit.countryRu ?? circuit.countryCode.toUpperCase()}</small></td>
        <td>{typeLabels[circuit.circuitType] ?? circuit.circuitType}</td>
        <td>{circuit.firstSeason ? `${circuit.firstSeason}–${circuit.lastSeason}` : '—'}<small>{circuit.races} этапов</small></td>
        <td>{circuit.layoutCount}<small>{circuit.verifiedLayouts} подтверждено{circuit.unresolvedLayouts ? ` · ${circuit.unresolvedLayouts} требуют решения` : ''}{circuit.unassignedRaces ? ` · ${circuit.unassignedRaces} этапов без конфигурации` : ''}</small></td>
        <td><div className="admin-completeness"><strong>{circuit.completenessPercent}%</strong><i style={{ '--admin-progress': `${circuit.completenessPercent}%` } as CSSProperties} /></div><small>{circuit.missingAreas.length ? circuit.missingAreas.map((area) => gapLabels[area] ?? area).join(' · ') : 'Основные разделы заполнены'}</small></td>
        <td><span className={`admin-status is-${circuit.profileStatus ?? 'missing'}`}>{statusLabels[circuit.profileStatus ?? 'missing']}</span></td>
        <td><Link className="admin-row-action" href={`/admin/circuits/${encodeURIComponent(circuit.id)}`}>Редактировать →</Link></td>
      </tr>)}
    </tbody></table></div> : null}
    {registry && !registry.rows.length ? <p className="admin-directory-empty">По выбранным фильтрам трассы не найдены</p> : null}
    {registry ? <AdminPagination basePath="/admin/circuits" page={Math.min(page, totalPages)} totalPages={totalPages} parameters={parameters} label="Страницы трасс" /> : null}
  </section></main>;
}
