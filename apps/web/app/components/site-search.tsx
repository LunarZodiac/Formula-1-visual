'use client';

import Link from 'next/link';
import { Breadcrumbs } from './breadcrumbs';
import type { CSSProperties, FormEvent } from 'react';
import { useEffect, useMemo, useState } from 'react';
import circuitsJson from '../data/catalogs/circuits.json';
import driversJson from '../data/catalogs/drivers-2026.json';
import teamsJson from '../data/catalogs/teams-2026.json';
import { getTrackGeometry } from '../data/track-geometries';
import type { CircuitCatalogItem } from './circuit-catalog';
import type { DriverCatalogItem } from './driver-catalog';
import type { TeamCatalogItem } from './team-catalog';
import { countryFlagUrl, DriverFlag, DriverPortrait, TeamCar, TeamLogo } from './racing-visuals';

export type SearchIndexItem = {
  id: string;
  type: 'circuit' | 'layout' | 'race' | 'season' | 'driver' | 'team' | 'location';
  title: string;
  subtitle: string;
  tokens: string[];
  href: string | null;
};

type SearchType = SearchIndexItem['type'] | 'all';
type ScoredItem = { item: SearchIndexItem; score: number };

const groupLabels: Record<SearchIndexItem['type'], string> = {
  circuit: 'Трассы', layout: 'Конфигурации', race: 'Этапы', season: 'Сезоны',
  driver: 'Пилоты', team: 'Команды', location: 'География',
};
const groupOrder: SearchIndexItem['type'][] = ['circuit', 'driver', 'team', 'season', 'race', 'layout', 'location'];
const typeLabels: Record<SearchType, string> = { all: 'Все', ...groupLabels };
const quickQueries = ['Спа', 'Сузука', 'Макс Ферстаппен', 'Ferrari', 'Сезон 2026'];
const recentKey = 'f1-atlas-recent-searches';
const circuits = circuitsJson.circuits as CircuitCatalogItem[];
const drivers = driversJson.drivers as unknown as DriverCatalogItem[];
const teams = teamsJson.teams as TeamCatalogItem[];
const season = driversJson.season;
const teamColors: Record<string, string> = { alpine: '#f079b5', aston_martin: '#229971', audi: '#e21b2d', cadillac: '#c7a866', ferrari: '#ef1a2d', haas: '#b6bec5', mclaren: '#ff8700', mercedes: '#00d2be', rb: '#55c3ff', red_bull: '#3671c6', williams: '#64c4ff' };

function normalize(value: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('ru').replace(/ё/g, 'е').trim();
}

function SearchTrackOutline({ geometry }: { geometry: GeoJSON.LineString | null }) {
  if (!geometry?.coordinates.length) return <span className="search-track-empty">Контур готовится</span>;
  const xs = geometry.coordinates.map(([x]) => x); const ys = geometry.coordinates.map(([, y]) => y);
  const minX = Math.min(...xs); const maxX = Math.max(...xs); const minY = Math.min(...ys); const maxY = Math.max(...ys);
  const width = Math.max(maxX - minX, .000001); const height = Math.max(maxY - minY, .000001);
  const points = geometry.coordinates.map(([x, y]) => `${8 + ((x - minX) / width) * 144},${76 - ((y - minY) / height) * 68}`).join(' ');
  return <svg className="search-track-outline" viewBox="0 0 160 84" aria-label="Контур трассы"><polyline points={points} /></svg>;
}

function SearchFlag({ code }: { code: string }) {
  const source = countryFlagUrl(code);
  if (!source) return null;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={source} alt="" aria-hidden="true" />;
}

function TopMatch({ result }: { result: SearchIndexItem }) {
  const id = result.id.split(':').slice(1).join(':');
  const circuit = result.type === 'circuit' ? circuits.find((item) => item.id === id) : null;
  const driver = result.type === 'driver' ? drivers.find((item) => item.id === id) : null;
  const team = result.type === 'team' ? teams.find((item) => item.id === id) : null;
  const color = team ? team.color ?? teamColors[team.id] ?? '#738795' : driver?.team?.color ?? (driver?.team ? teamColors[driver.team.id] : null) ?? '#738795';
  const copy = <div className="search-top-copy"><small>Лучшее совпадение · {groupLabels[result.type]}</small><h2>{result.title}</h2>{circuit ? <p className="search-top-location"><SearchFlag code={circuit.countryCode} /><span>{circuit.nameRu} · {circuit.countryRu}</span></p> : <p>{result.subtitle}</p>}{circuit ? <dl><div><dt>Длина</dt><dd>{circuit.metrics.length ?? '—'}</dd></div><div><dt>Повороты</dt><dd>{circuit.metrics.turns ?? '—'}</dd></div><div><dt>Дебют</dt><dd>{circuit.metrics.debut ?? '—'}</dd></div></dl> : driver ? <dl><div><dt>Очки</dt><dd>{driver.points}</dd></div><div><dt>Победы</dt><dd>{driver.wins}</dd></div><div><dt>Команда</dt><dd>{driver.team?.name ?? '—'}</dd></div></dl> : team ? <dl><div><dt>Место</dt><dd>{team.position}</dd></div><div><dt>Очки</dt><dd>{team.points}</dd></div><div><dt>Победы</dt><dd>{team.wins}</dd></div></dl> : null}<span>{result.href ? 'Открыть страницу →' : 'Страница ещё не опубликована'}</span></div>;
  const visual = <div className="search-top-visual">{circuit ? <SearchTrackOutline geometry={getTrackGeometry(circuit.id, season)?.geometry ?? circuit.geometry} /> : driver ? <><DriverPortrait driverId={driver.id} name={driver.nameRu} /><div><DriverFlag driverId={driver.id} />{driver.team?.name}</div></> : team ? <><TeamCar season={season} constructorId={team.id} constructorName={team.name} carImageUrl={team.carImageUrl} /><TeamLogo constructorId={team.id} constructorName={team.name} teamColor={color} season={season} logoUrl={team.logoUrl} /></> : <span className="search-top-glyph">⌖</span>}</div>;
  const photo = circuit ? <div className={`search-top-photo${circuit.id === 'spa' ? ' has-photo' : ''}`} aria-hidden="true" /> : null;
  const className = `search-top-match search-top-match--${result.type}`;
  return result.href ? <Link className={className} href={result.href} style={{ '--search-color': color } as CSSProperties}>{copy}{visual}{photo}</Link> : <article className={className} style={{ '--search-color': color } as CSSProperties}>{copy}{visual}{photo}</article>;
}

export function SiteSearch({ initialQuery = '' }: { initialQuery?: string }) {
  const [query, setQuery] = useState(initialQuery);
  const [items, setItems] = useState<SearchIndexItem[]>([]);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [activeType, setActiveType] = useState<SearchType>('all');
  const [availability, setAvailability] = useState<'all' | 'published'>('all');
  const [country, setCountry] = useState('all');
  const [selectedSeason, setSelectedSeason] = useState('all');
  const [sort, setSort] = useState<'relevance' | 'alphabet'>('relevance');
  const [recent, setRecent] = useState<string[]>([]);
  const normalizedQuery = normalize(query);

  useEffect(() => {
    fetch('/data/search-index.json')
      .then((response) => { if (!response.ok) throw new Error(`HTTP ${response.status}`); return response.json() as Promise<{ items: SearchIndexItem[] }>; })
      .then((index) => { setItems(index.items); setStatus('ready'); })
      .catch(() => setStatus('error'));
    queueMicrotask(() => {
      try { const stored = JSON.parse(window.localStorage.getItem(recentKey) ?? '[]'); if (Array.isArray(stored)) setRecent(stored.filter((item): item is string => typeof item === 'string').slice(0, 6)); } catch { setRecent([]); }
    });
  }, []);
  useEffect(() => {
    const url = new URL(window.location.href);
    if (query.trim()) url.searchParams.set('q', query.trim()); else url.searchParams.delete('q');
    window.history.replaceState(null, '', `${url.pathname}${url.search}`);
  }, [query]);

  const countries = useMemo(() => items.filter((item) => item.type === 'location' && item.subtitle === 'Страна проведения').map((item) => item.title).sort((a, b) => a.localeCompare(b, 'ru')), [items]);
  const seasons = useMemo(() => items.filter((item) => item.type === 'season').map((item) => item.title.match(/\d{4}/)?.[0]).filter((item): item is string => Boolean(item)).slice(0, 30), [items]);
  const scored = useMemo<ScoredItem[]>(() => {
    if (normalizedQuery.length < 2) return [];
    return items.flatMap((item) => {
      const title = normalize(item.title); const haystack = normalize([item.title, item.subtitle, ...item.tokens].join(' '));
      if (!haystack.includes(normalizedQuery)) return [];
      if (activeType !== 'all' && item.type !== activeType) return [];
      if (availability === 'published' && !item.href) return [];
      if (country !== 'all' && !haystack.includes(normalize(country))) return [];
      if (selectedSeason !== 'all' && !haystack.includes(selectedSeason)) return [];
      return [{ item, score: title === normalizedQuery ? 0 : title.startsWith(normalizedQuery) ? 1 : title.includes(normalizedQuery) ? 2 : 3 }];
    }).sort((left, right) => sort === 'alphabet' ? left.item.title.localeCompare(right.item.title, 'ru') : left.score - right.score || left.item.title.localeCompare(right.item.title, 'ru'));
  }, [activeType, availability, country, items, normalizedQuery, selectedSeason, sort]);
  const topMatch = scored[0]?.item ?? null;
  const groups = useMemo(() => groupOrder.map((type) => ({ type, items: scored.filter((result) => result.item.type === type && result.item.id !== topMatch?.id).slice(0, 8).map((result) => result.item) })).filter((group) => group.items.length), [scored, topMatch?.id]);

  const remember = (value: string) => {
    const clean = value.trim(); if (clean.length < 2) return;
    const next = [clean, ...recent.filter((item) => normalize(item) !== normalize(clean))].slice(0, 6);
    setRecent(next); window.localStorage.setItem(recentKey, JSON.stringify(next));
  };
  const submit = (event: FormEvent) => { event.preventDefault(); remember(query); };
  const chooseQuery = (value: string) => { setQuery(value); remember(value); };
  const resetFilters = () => { setActiveType('all'); setAvailability('all'); setCountry('all'); setSelectedSeason('all'); setSort('relevance'); };

  return <main className="search-page search-experience">
    <Breadcrumbs items={[{ label: 'Главная', href: '/' }, { label: 'Поиск' }]} />
    <header className="search-page-hero"><span>Единый индекс атласа</span><h1>Поиск по атласу</h1><p>Трассы, пилоты, команды, сезоны, этапы, конфигурации и география Formula 1</p><i aria-hidden="true" /></header>
    <form className="search-box" onSubmit={submit}><div><span aria-hidden="true">⌕</span><input id="global-search" type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Найдите трассу, пилота, команду или сезон" aria-label="Поиск по атласу" /><button type="button" onClick={() => setQuery('')} disabled={!query} aria-label="Очистить поиск">×</button></div></form>
    <nav className="search-type-tabs" aria-label="Категории поиска">{(['all', ...groupOrder] as SearchType[]).map((type) => <button type="button" className={activeType === type ? 'is-active' : ''} onClick={() => setActiveType(type)} key={type}>{typeLabels[type]}</button>)}</nav>

    {status === 'error' ? <section className="search-empty"><strong>Поиск временно недоступен</strong><p>Откройте нужный раздел через каталоги</p><Link href="/circuits">Открыть каталог трасс →</Link></section> : normalizedQuery.length < 2 ? <section className="search-discovery">
      <div className="search-query-panels"><article><header><span>Быстрые запросы</span><small>Готовые точки входа</small></header><div>{quickQueries.map((item) => <button type="button" onClick={() => chooseQuery(item)} key={item}>↗ {item}</button>)}</div></article><article><header><span>Недавние запросы</span><small>Только в этом браузере</small></header>{recent.length ? <div>{recent.map((item) => <button type="button" onClick={() => chooseQuery(item)} key={item}>⌕ {item}</button>)}</div> : <p>История появится после первого поиска</p>}</article></div>
      <div className="search-quick-links"><header><span>Быстрые переходы</span><small>Основные разделы проекта</small></header><div><Link href="/circuits"><b>⌖</b><strong>Трассы</strong><span>Каталог и карта →</span></Link><Link href="/drivers"><b>◉</b><strong>Пилоты</strong><span>Состав сезона →</span></Link><Link href="/teams"><b>◇</b><strong>Команды</strong><span>Кубок конструкторов →</span></Link><Link href="/?season=2026#season"><b>□</b><strong>Сезон</strong><span>Календарь и результаты →</span></Link></div></div>
    </section> : <div className="search-workspace">
      <aside className="search-filters"><header><span>Фильтры</span><button type="button" onClick={resetFilters}>Сбросить</button></header><label><span>Категория</span><select value={activeType} onChange={(event) => setActiveType(event.target.value as SearchType)}>{(['all', ...groupOrder] as SearchType[]).map((type) => <option value={type} key={type}>{typeLabels[type]}</option>)}</select></label><label><span>Страна</span><select value={country} onChange={(event) => setCountry(event.target.value)}><option value="all">Любая страна</option>{countries.map((item) => <option key={item}>{item}</option>)}</select></label><label><span>Сезон</span><select value={selectedSeason} onChange={(event) => setSelectedSeason(event.target.value)}><option value="all">Все сезоны</option>{seasons.map((item) => <option key={item}>{item}</option>)}</select></label><label><span>Доступность</span><select value={availability} onChange={(event) => setAvailability(event.target.value as 'all' | 'published')}><option value="all">Все результаты</option><option value="published">Страница опубликована</option></select></label></aside>
      <section className="search-output"><header><div><span>Результаты поиска</span><strong>{status === 'loading' ? 'Загрузка…' : `${scored.length} найдено`}</strong></div><select value={sort} onChange={(event) => setSort(event.target.value as 'relevance' | 'alphabet')} aria-label="Сортировка"><option value="relevance">По релевантности</option><option value="alphabet">По алфавиту</option></select></header>{topMatch ? <TopMatch result={topMatch} /> : status === 'ready' ? <div className="search-empty"><strong>Ничего не найдено</strong><p>Измените запрос или сбросьте фильтры</p><button type="button" onClick={resetFilters}>Сбросить фильтры</button></div> : null}<div className="search-results">{groups.map((group) => <section className="search-result-group" key={group.type}><header><h2>{groupLabels[group.type]}</h2><span>{group.items.length}</span></header><div>{group.items.map((item) => { const content = <><i aria-hidden="true">{item.type === 'circuit' ? '⌖' : item.type === 'driver' ? '◉' : item.type === 'team' ? '◇' : item.type === 'season' ? '□' : '↗'}</i><strong>{item.title}</strong><small>{item.subtitle}</small><span>{item.href ? 'Открыть →' : 'Страница готовится'}</span></>; return item.href ? <Link href={item.href} key={item.id} onClick={() => remember(query)}>{content}</Link> : <article key={item.id}>{content}</article>; })}</div></section>)}</div></section>
    </div>}
  </main>;
}
