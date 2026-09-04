'use client';

import Link from 'next/link';
import type { CSSProperties } from 'react';
import { useEffect, useMemo, useState } from 'react';
import type { CircuitCatalogItem } from './circuit-catalog';
import type { DriverCatalogItem } from './driver-catalog';
import type { TeamCatalogItem } from './team-catalog';
import { DriverFlag, DriverPortrait, TeamCar, TeamLogo } from './racing-visuals';
import { getTrackGeometry } from '../data/track-geometries';

type FavoriteType = 'all' | 'circuits' | 'drivers' | 'teams';
type FavoriteItem =
  | { kind: 'circuits'; id: string; title: string; search: string; circuit: CircuitCatalogItem }
  | { kind: 'drivers'; id: string; title: string; search: string; driver: DriverCatalogItem }
  | { kind: 'teams'; id: string; title: string; search: string; team: TeamCatalogItem };

const storageKeys = {
  circuits: 'f1-atlas-favorite-circuits',
  drivers: 'f1-atlas-favorite-drivers',
  teams: 'f1-atlas-favorite-teams',
} as const;

const teamColors: Record<string, string> = {
  alpine: '#f079b5', aston_martin: '#229971', audi: '#e21b2d', cadillac: '#c7a866', ferrari: '#ef1a2d',
  haas: '#b6bec5', mclaren: '#ff8700', mercedes: '#00d2be', rb: '#55c3ff', red_bull: '#3671c6', williams: '#64c4ff',
};

function readIds(key: string) {
  try {
    const value = JSON.parse(window.localStorage.getItem(key) ?? '[]');
    return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
  } catch { return []; }
}

function TrackOutline({ geometry }: { geometry: GeoJSON.LineString | null }) {
  if (!geometry?.coordinates.length) return <span className="favorites-outline-empty">Контур готовится</span>;
  const xs = geometry.coordinates.map(([x]) => x); const ys = geometry.coordinates.map(([, y]) => y);
  const minX = Math.min(...xs); const maxX = Math.max(...xs); const minY = Math.min(...ys); const maxY = Math.max(...ys);
  const width = Math.max(maxX - minX, .000001); const height = Math.max(maxY - minY, .000001);
  const points = geometry.coordinates.map(([x, y]) => `${7 + ((x - minX) / width) * 146},${77 - ((y - minY) / height) * 70}`).join(' ');
  return <svg className="favorites-outline" viewBox="0 0 160 84" aria-label={`Контур трассы`}><polyline points={points} /></svg>;
}

function FavoriteCircuitFlag({ code }: { code: string }) {
  // Небольшие внешние SVG-флаги уже используются в каталогах проекта.
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={`https://flagcdn.com/${code}.svg`} alt="" aria-hidden="true" />;
}

export function FavoritesPage({ season, circuits, drivers, teams }: { season: number; circuits: CircuitCatalogItem[]; drivers: DriverCatalogItem[]; teams: TeamCatalogItem[] }) {
  const [ids, setIds] = useState({ circuits: [] as string[], drivers: [] as string[], teams: [] as string[] });
  const [active, setActive] = useState<FavoriteType>('all');
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<'saved' | 'alphabet'>('saved');
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const load = () => setIds({ circuits: readIds(storageKeys.circuits), drivers: readIds(storageKeys.drivers), teams: readIds(storageKeys.teams) });
    queueMicrotask(() => { load(); setReady(true); });
    window.addEventListener('storage', load);
    window.addEventListener('f1-favorites-changed', load);
    return () => { window.removeEventListener('storage', load); window.removeEventListener('f1-favorites-changed', load); };
  }, []);

  const items = useMemo<FavoriteItem[]>(() => [
    ...ids.circuits.map((id) => circuits.find((item) => item.id === id)).filter((item): item is CircuitCatalogItem => Boolean(item)).map((circuit) => ({ kind: 'circuits' as const, id: circuit.id, title: circuit.nameRu, search: `${circuit.nameRu} ${circuit.cityRu} ${circuit.countryRu}`, circuit: { ...circuit, geometry: getTrackGeometry(circuit.id, season)?.geometry ?? circuit.geometry } })),
    ...ids.drivers.map((id) => drivers.find((item) => item.id === id)).filter((item): item is DriverCatalogItem => Boolean(item)).map((driver) => ({ kind: 'drivers' as const, id: driver.id, title: driver.nameRu, search: `${driver.nameRu} ${driver.nameEn} ${driver.team?.name ?? ''}`, driver })),
    ...ids.teams.map((id) => teams.find((item) => item.id === id)).filter((item): item is TeamCatalogItem => Boolean(item)).map((team) => ({ kind: 'teams' as const, id: team.id, title: team.name, search: `${team.name} ${team.nationality ?? ''}`, team })),
  ], [circuits, drivers, ids, season, teams]);

  const visible = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase('ru');
    const filtered = items.filter((item) => (active === 'all' || item.kind === active) && (!needle || item.search.toLocaleLowerCase('ru').includes(needle)));
    return sort === 'alphabet' ? [...filtered].sort((a, b) => a.title.localeCompare(b.title, 'ru')) : filtered;
  }, [active, items, query, sort]);

  const remove = (kind: Exclude<FavoriteType, 'all'>, id: string) => {
    const next = ids[kind].filter((item) => item !== id);
    window.localStorage.setItem(storageKeys[kind], JSON.stringify(next));
    setIds((current) => ({ ...current, [kind]: next }));
    window.dispatchEvent(new Event('f1-favorites-changed'));
  };
  const counts = { all: items.length, circuits: items.filter((item) => item.kind === 'circuits').length, drivers: items.filter((item) => item.kind === 'drivers').length, teams: items.filter((item) => item.kind === 'teams').length };
  const labels: Record<FavoriteType, string> = { all: 'Все', circuits: 'Трассы', drivers: 'Пилоты', teams: 'Команды' };

  return <main className="favorites-page">
    <nav className="favorites-breadcrumbs" aria-label="Хлебные крошки"><Link href="/">Главная</Link><span>›</span><b>Избранное</b></nav>
    <header className="favorites-hero"><span>Личная коллекция</span><h1>Избранное</h1><p>Сохранённые трассы, пилоты и команды для быстрого возвращения к важному</p></header>
    <section className="favorites-toolbar" aria-label="Фильтры избранного">
      <div className="favorites-tabs">{(Object.keys(labels) as FavoriteType[]).map((type) => <button className={active === type ? 'is-active' : ''} type="button" onClick={() => setActive(type)} key={type}>{labels[type]} <span>{counts[type]}</span></button>)}</div>
      <label className="favorites-search"><span aria-hidden="true">⌕</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Поиск в избранном" /></label>
      <select value={sort} onChange={(event) => setSort(event.target.value as 'saved' | 'alphabet')} aria-label="Сортировка"><option value="saved">В порядке сохранения</option><option value="alphabet">По алфавиту</option></select>
    </section>
    <div className="favorites-layout">
      <section className="favorites-results" aria-live="polite">
        {!ready ? <p className="favorites-loading">Загружаем избранное</p> : visible.length ? <div className="favorites-grid">{visible.map((item, index) => {
          const featured = index === 0 && item.kind === 'circuits';
          if (item.kind === 'circuits') { const { circuit } = item; return <article className={`favorite-card favorite-card--circuit${featured ? ' is-featured' : ''}`} key={`${item.kind}:${item.id}`}>
            <button className="favorite-remove" type="button" onClick={() => remove(item.kind, item.id)} aria-label={`Удалить ${item.title} из избранного`}>★</button>
            <div className="favorite-circuit-visual" style={circuit.id === 'spa' ? { backgroundImage: "url('/assets/f1/circuits/spa/media/spa-gallery-circuit-2013-1280.webp')" } : undefined}><span>{circuit.competitionStatus === 'historic' ? 'Историческая' : 'Трасса'}</span></div>
            <div className="favorite-card-copy"><small>Трасса</small><h2>{circuit.nameRu}</h2><p><FavoriteCircuitFlag code={circuit.countryCode} />{circuit.countryRu} · {circuit.cityRu}</p>{featured ? <em>{circuit.summary}</em> : null}<dl><div><dt>Длина</dt><dd>{circuit.metrics.length ?? '—'}</dd></div><div><dt>Повороты</dt><dd>{circuit.metrics.turns ?? '—'}</dd></div><div><dt>Дебют</dt><dd>{circuit.metrics.debut ?? '—'}</dd></div></dl>{circuit.status === 'published' ? <Link href={`/circuits/${circuit.slug}`}>Открыть трассу →</Link> : <span className="favorite-unavailable">Страница готовится</span>}</div>
            <TrackOutline geometry={circuit.geometry} />
          </article>; }
          if (item.kind === 'drivers') { const { driver } = item; const color = driver.team?.color ?? (driver.team ? teamColors[driver.team.id] : null) ?? '#738795'; return <article className="favorite-card favorite-card--driver" style={{ '--favorite-color': color } as CSSProperties} key={`${item.kind}:${item.id}`}>
            <button className="favorite-remove" type="button" onClick={() => remove(item.kind, item.id)} aria-label={`Удалить ${item.title} из избранного`}>★</button><div className="favorite-driver-photo"><DriverPortrait driverId={driver.id} name={driver.nameRu} /></div><div className="favorite-card-copy"><small>Пилот</small><h2>{driver.nameRu}</h2><p><DriverFlag driverId={driver.id} />{driver.team?.name ?? 'Команда не указана'}</p><dl><div><dt>Очки</dt><dd>{driver.points}</dd></div><div><dt>Победы</dt><dd>{driver.wins}</dd></div><div><dt>Дебют</dt><dd>{driver.seasonHistory.at(-1)?.season ?? '—'}</dd></div></dl><Link href={`/drivers/${driver.id}`}>Открыть профиль →</Link></div>
          </article>; }
          const { team } = item; const color = team.color ?? teamColors[team.id] ?? '#738795'; return <article className="favorite-card favorite-card--team" style={{ '--favorite-color': color } as CSSProperties} key={`${item.kind}:${item.id}`}>
            <button className="favorite-remove" type="button" onClick={() => remove(item.kind, item.id)} aria-label={`Удалить ${item.title} из избранного`}>★</button><div className="favorite-team-car"><TeamCar season={season} constructorId={team.id} constructorName={team.name} carImageUrl={team.carImageUrl} /></div><div className="favorite-card-copy"><small>Команда</small><div className="favorite-team-title"><TeamLogo constructorId={team.id} constructorName={team.name} teamColor={color} season={season} logoUrl={team.logoUrl} /><h2>{team.name}</h2></div><dl><div><dt>Место</dt><dd>{team.position}</dd></div><div><dt>Очки</dt><dd>{team.points}</dd></div><div><dt>Победы</dt><dd>{team.wins}</dd></div></dl><Link href={`/teams/${team.id}`}>Открыть команду →</Link></div>
          </article>;
        })}<Link className="favorites-add-card" href="/circuits"><span>＋</span><strong>Добавить ещё</strong><small>Сохраняйте интересные страницы в одном месте</small></Link></div> : <div className="favorites-empty"><span>☆</span><h2>{items.length ? 'Ничего не найдено' : 'Здесь пока пусто'}</h2><p>{items.length ? 'Измените фильтр или поисковый запрос' : 'Добавляйте трассы в каталоге, а пилотов и команды — на страницах их профилей'}</p><div><Link href="/circuits">Выбрать трассы →</Link><Link href="/drivers">Открыть пилотов →</Link></div></div>}
      </section>
      <aside className="favorites-summary"><span>Ваше избранное</span><h2>{counts.all}</h2><p>сохранённых материалов</p><dl><div><dt>Трассы</dt><dd>{counts.circuits}</dd></div><div><dt>Пилоты</dt><dd>{counts.drivers}</dd></div><div><dt>Команды</dt><dd>{counts.teams}</dd></div></dl><Link href="/circuits">Найти ещё →</Link></aside>
    </div>
  </main>;
}
