'use client';

import Link from 'next/link';
import type { CSSProperties } from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { TeamCar, TeamLogo } from './racing-visuals';
import { Breadcrumbs } from './breadcrumbs';
import { TeamTimeline } from './team-timeline';

import type { TeamCatalogItem, TeamListItem } from '../data/competitor-contract';
import { nationalityNames } from '../data/nationality-names';
import { distinctTeamSecondaryName } from '../data/team-secondary-name';
export type { TeamCatalogItem } from '../data/competitor-contract';

const fallbackColors: Record<string, string> = {
  alpine: '#f079b5', aston_martin: '#229971', audi: '#e21b2d', cadillac: '#b8a477', ferrari: '#ef1a2d',
  haas: '#b6bec5', mclaren: '#ff8700', mercedes: '#00d2be', rb: '#55c3ff', red_bull: '#3671c6', williams: '#64c4ff',
};
const teamColor = (team: Pick<TeamCatalogItem, 'id' | 'color'> | Pick<TeamListItem, 'id' | 'color'>) => team.color ?? fallbackColors[team.id] ?? '#738795';
const teamCardStyle = (team: Pick<TeamCatalogItem, 'id' | 'color'> | Pick<TeamListItem, 'id' | 'color'>): CSSProperties => {
  const color = teamColor(team);
  return { '--team-color': color, '--team-hover-color': ['#738795', '#b6bec5'].includes(color.toLowerCase()) ? '#f3a4ad' : color } as CSSProperties;
};
const total = (team: TeamCatalogItem, key: 'points' | 'wins') => team.seasonHistory.reduce((sum, row) => sum + row[key], 0);

type TeamAchievementFilter = 'all' | 'winners' | 'champions';
type TeamSortMode = 'name' | 'firstSeason' | 'wins' | 'titles';

export function AllTeamCatalog({ teams, initialView = 'catalog' }: { teams: TeamListItem[]; initialView?: 'catalog' | 'timeline' }) {
  const [view, setView] = useState(initialView);
  const [query, setQuery] = useState('');
  const [season, setSeason] = useState('all');
  const [nationality, setNationality] = useState('all');
  const [achievement, setAchievement] = useState<TeamAchievementFilter>('all');
  const [sort, setSort] = useState<TeamSortMode>('name');
  const [visibleCount, setVisibleCount] = useState(36);
  const loadMoreRef = useRef<HTMLDivElement>(null);
  const seasons = useMemo(() => [...new Set(teams.flatMap((team) => team.seasons.map((row) => row.season)))].sort((a, b) => b - a), [teams]);
  const nationalities = useMemo(() => [...new Set(teams.map((team) => team.nationality).filter((value): value is string => Boolean(value)))].sort((a, b) => (nationalityNames[a] ?? a).localeCompare(nationalityNames[b] ?? b, 'ru')), [teams]);
  const filtered = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase('ru');
    return teams
      .filter((team) => !needle || [team.name, team.nameRu ?? '', team.nationality ?? '', nationalityNames[team.nationality ?? ''] ?? '', ...team.aliases]
        .some((value) => value.toLocaleLowerCase('ru').includes(needle)))
      .filter((team) => season === 'all' || team.seasons.some((row) => String(row.season) === season))
      .filter((team) => nationality === 'all' || team.nationality === nationality)
      .filter((team) => achievement === 'all' || (achievement === 'winners' ? team.wins > 0 : team.careerTitles > 0))
      .sort((a, b) => {
        const byName = (a.nameRu ?? a.name).localeCompare(b.nameRu ?? b.name, 'ru');
        if (sort === 'firstSeason') return a.firstSeason - b.firstSeason || byName;
        if (sort === 'wins') return b.wins - a.wins || byName;
        if (sort === 'titles') return b.careerTitles - a.careerTitles || byName;
        return byName;
      });
  }, [achievement, nationality, query, season, sort, teams]);
  const visible = filtered.slice(0, visibleCount);
  const hasMore = visibleCount < filtered.length;
  const hasFilters = Boolean(query.trim()) || season !== 'all' || nationality !== 'all' || achievement !== 'all' || sort !== 'name';
  const resetFilters = () => {
    setQuery('');
    setSeason('all');
    setNationality('all');
    setAchievement('all');
    setSort('name');
    setVisibleCount(36);
  };

  useEffect(() => {
    const target = loadMoreRef.current;
    if (!target || !hasMore || view !== 'catalog') return;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) setVisibleCount((value) => Math.min(value + 36, filtered.length));
    }, { rootMargin: '360px 0px' });
    observer.observe(target);
    return () => observer.disconnect();
  }, [filtered, hasMore, view, visibleCount]);

  return <main className="constructors-page">
    <header className="constructors-hero"><div><Breadcrumbs items={[{ label: 'Главная', href: '/' }, { label: 'Команды' }]} /><span>Исторический каталог</span><h1>Все команды Formula 1</h1><p>{teams.length} команд и конструкторов, представленных в доступных сезонах</p></div></header>
    <section className="constructors-toolbar" aria-label="Поиск по историческому каталогу"><label><span>Найти команду</span><input type="search" value={query} onChange={(event) => { setQuery(event.target.value); setVisibleCount(36); }} placeholder="Название, прежнее имя или страна" /></label><Link href="/teams?season=2026">Кубок конструкторов 2026 →</Link></section>
    <section className="constructors-catalog-filters" aria-label="Фильтры исторического каталога">
      <label className="public-catalog-field"><span>Сезон участия</span><select value={season} onChange={(event) => { setSeason(event.target.value); setVisibleCount(36); }}><option value="all">Все сезоны</option>{seasons.map((item) => <option value={item} key={item}>{item}</option>)}</select></label>
      <label className="public-catalog-field"><span>Национальность команды</span><select value={nationality} onChange={(event) => { setNationality(event.target.value); setVisibleCount(36); }}><option value="all">Все национальности</option>{nationalities.map((item) => <option value={item} key={item}>{nationalityNames[item] ?? item}</option>)}</select></label>
      <label className="public-catalog-field"><span>Достижения за карьеру</span><select value={achievement} onChange={(event) => { setAchievement(event.target.value as TeamAchievementFilter); setVisibleCount(36); }}><option value="all">Все</option><option value="winners">С победами</option><option value="champions">С титулами</option></select></label>
      <label className="public-catalog-field"><span>Сортировка</span><select value={sort} onChange={(event) => { setSort(event.target.value as TeamSortMode); setVisibleCount(36); }}><option value="name">По имени</option><option value="firstSeason">По первому сезону</option><option value="wins">По числу побед</option><option value="titles">По числу титулов</option></select></label>
      <button className="tracks-reset" type="button" onClick={resetFilters} disabled={!hasFilters}>↻ Сбросить</button>
    </section>
    <nav className="constructors-view-switch" aria-label="Вид каталога команд"><button type="button" aria-pressed={view === 'catalog'} onClick={() => setView('catalog')}>Каталог</button><button type="button" aria-pressed={view === 'timeline'} onClick={() => setView('timeline')}>Хронология</button></nav>
    <output className="public-catalog-count constructors-catalog-count" aria-live="polite"><strong>{filtered.length}</strong> из {teams.length} команд</output>
    {view === 'timeline' ? <TeamTimeline teams={filtered} allTeams={teams} colorForTeam={teamColor} /> : <section className="constructors-history" aria-labelledby="all-constructors-title"><header><span>1950–2026</span><h2 id="all-constructors-title">История участников</h2></header><div>{visible.length ? visible.map((team) => { const nameRu = distinctTeamSecondaryName(team.name, team.nameRu); return <Link href={`/teams/${team.id}?season=${team.latestSeason}`} key={team.id} style={teamCardStyle(team)}><header><TeamLogo constructorId={team.id} constructorName={team.name} teamColor={teamColor(team)} season={team.latestSeason} logoUrl={team.logoUrl} /><div><strong>{team.name}</strong>{nameRu ? <small className="team-secondary-name">{nameRu}</small> : null}<small>{team.firstSeason === team.latestSeason ? team.latestSeason : `${team.firstSeason}–${team.latestSeason}`} · Сезоны участия: {team.seasonCount}</small></div></header>{team.aliases.length > 1 ? <p>{team.aliases.join(' · ')}</p> : null}<dl><div><dt>Гран-при</dt><dd>{team.raceEntries}</dd></div><div><dt>Победы</dt><dd>{team.wins}</dd></div><div><dt>Титулы</dt><dd>{team.careerTitles}</dd></div></dl></Link>; }) : <p className="constructors-empty">Команды по выбранным условиям не найдены</p>}</div></section>}
    {view === 'catalog' && hasMore ? <div className="constructors-load-sentinel" ref={loadMoreRef} aria-live="polite">Подгружаем следующие команды…</div> : null}
    <p className="constructors-note">Варианты названия показаны внутри периодов участия. Подтверждённые связи преемственности доступны в подробностях соответствующего периода хронологии; статистика команд остаётся раздельной</p>
  </main>;
}

export function TeamCatalog({ season, afterRound, teams }: { season: number; afterRound: number; teams: TeamCatalogItem[] }) {
  const ordered = useMemo(() => [...teams].sort((a, b) => a.position - b.position), [teams]);
  const [query, setQuery] = useState('');
  const [leftId, setLeftId] = useState(ordered[0]?.id ?? '');
  const [rightId, setRightId] = useState(ordered[1]?.id ?? ordered[0]?.id ?? '');
  const filtered = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase('ru');
    return ordered.filter((team) => !needle || [team.name, team.nameRu ?? '', team.engineName ?? '', team.nationality ?? ''].some((value) => value.toLocaleLowerCase('ru').includes(needle)));
  }, [ordered, query]);
  const leader = ordered[0];
  const left = ordered.find((team) => team.id === leftId) ?? ordered[0];
  const right = ordered.find((team) => team.id === rightId) ?? ordered[1] ?? ordered[0];
  const maxPoints = Math.max(1, ...ordered.map((team) => team.points));
  const titleLeader = [...ordered].sort((a, b) => b.careerTitles - a.careerTitles)[0];
  const winsLeader = [...ordered].sort((a, b) => total(b, 'wins') - total(a, 'wins'))[0];
  const mostExperienced = [...ordered].sort((a, b) => b.seasonHistory.length - a.seasonHistory.length)[0];

  return <main className="constructors-page">
    <header className="constructors-hero">
      <div><Breadcrumbs items={[{ label: 'Главная', href: '/' }, { label: 'Команды', href: '/teams' }, { label: 'Кубок конструкторов' }]} /><span>Сезон {season}</span><h1>Кубок конструкторов</h1><p>Команды Formula 1, их составы и положение в чемпионате · зачёт после этапа {afterRound}</p></div>
      {leader ? <div className="constructors-hero-car" style={{ '--team-color': teamColor(leader) } as CSSProperties}><TeamCar season={season} constructorId={leader.id} constructorName={leader.name} carImageUrl={leader.carImageUrl} /><small>Лидер чемпионата</small><strong>{leader.name}</strong>{leader.nameRu ? <span className="team-secondary-name">{leader.nameRu}</span> : null}</div> : null}
    </header>
    <section className="constructors-toolbar" aria-label="Поиск по турнирной таблице"><label><span>Поиск в таблице</span><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Команда, мотор или страна" /></label><output className="public-catalog-count"><strong>{filtered.length}</strong> из {teams.length} в таблице</output></section>
    <div className="constructors-dashboard">
      <section className="constructors-standings" aria-labelledby="constructors-standings-title"><header><div><span>Сезон {season}</span><h2 id="constructors-standings-title">Турнирная таблица</h2></div><small>{ordered.length} команд</small></header><div>{filtered.length ? filtered.map((team) => <Link href={`/teams/${team.id}?season=${season}`} key={team.id} style={{ '--team-color': teamColor(team) } as CSSProperties}><b>{String(team.position).padStart(2, '0')}</b><TeamLogo constructorId={team.id} constructorName={team.name} teamColor={teamColor(team)} season={season} logoUrl={team.logoUrl} /><div className="team-name-stack"><strong>{team.name}</strong>{team.nameRu ? <small className="team-secondary-name">{team.nameRu}</small> : null}</div><div className="constructors-points-bar"><i style={{ width: `${Math.max(3, team.points / maxPoints * 100)}%` }} /></div><span>{team.points}</span></Link>) : <p className="constructors-empty">Команды по выбранным условиям не найдены</p>}</div></section>
      {left && right ? <section className="constructors-comparison" aria-labelledby="constructors-comparison-title"><header><div><span>Сопоставление</span><h2 id="constructors-comparison-title">Сравнение команд</h2></div></header><div className="constructors-compare-selects"><select aria-label="Первая команда" value={left.id} onChange={(event) => setLeftId(event.target.value)}>{ordered.map((team) => <option value={team.id} key={team.id} disabled={team.id === right.id}>{team.name}</option>)}</select><b>VS</b><select aria-label="Вторая команда" value={right.id} onChange={(event) => setRightId(event.target.value)}>{ordered.map((team) => <option value={team.id} key={team.id} disabled={team.id === left.id}>{team.name}</option>)}</select></div><div className="constructors-compare-cars"><TeamCar season={season} constructorId={left.id} constructorName={left.name} carImageUrl={left.carImageUrl} /><TeamCar season={season} constructorId={right.id} constructorName={right.name} carImageUrl={right.carImageUrl} /></div><dl>{[
        ['Очки', left.points, right.points], ['Победы', left.wins, right.wins], ['Позиция', left.position, right.position], ['Победы за доступные сезоны', total(left, 'wins'), total(right, 'wins')], ['Сезоны участия', left.seasonHistory.length, right.seasonHistory.length],
      ].map(([label, a, b]) => <div key={label}><strong>{a}</strong><dt>{label}</dt><strong>{b}</strong></div>)}</dl><footer><Link href={`/teams/${left.id}?season=${season}`}>{left.name} →</Link><Link href={`/teams/${right.id}?season=${season}`}>{right.name} →</Link></footer></section> : null}
    </div>
    <section className="constructors-highlights" aria-labelledby="constructors-highlights-title"><header><span>Статистика команд</span><h2 id="constructors-highlights-title">Команды в цифрах</h2></header><div>
      {leader ? <article><small>Лидер сезона</small><TeamLogo constructorId={leader.id} constructorName={leader.name} teamColor={teamColor(leader)} season={season} logoUrl={leader.logoUrl} /><strong>{leader.name}</strong><span>{leader.points} очков</span></article> : null}
      {titleLeader ? <article><small>Титулы завершённых сезонов</small><TeamLogo constructorId={titleLeader.id} constructorName={titleLeader.name} teamColor={teamColor(titleLeader)} season={season} logoUrl={titleLeader.logoUrl} /><strong>{titleLeader.careerTitles}</strong><span>{titleLeader.name}</span></article> : null}
      {winsLeader ? <article><small>Победы за доступные сезоны</small><TeamLogo constructorId={winsLeader.id} constructorName={winsLeader.name} teamColor={teamColor(winsLeader)} season={season} logoUrl={winsLeader.logoUrl} /><strong>{total(winsLeader, 'wins')}</strong><span>{winsLeader.name}</span></article> : null}
      {mostExperienced ? <article><small>Сезоны участия</small><TeamLogo constructorId={mostExperienced.id} constructorName={mostExperienced.name} teamColor={teamColor(mostExperienced)} season={season} logoUrl={mostExperienced.logoUrl} /><strong>{mostExperienced.seasonHistory.length}</strong><span>{mostExperienced.name}</span></article> : null}
    </div></section>
    <section className="constructors-history" aria-labelledby="constructors-history-title"><header><span>Результаты по годам</span><h2 id="constructors-history-title">История выступлений</h2></header><div>{filtered.map((team) => { const history = [...team.seasonHistory].sort((a, b) => b.season - a.season); const knownPositions = history.map((row) => row.position).filter((position): position is number => position !== null); return <Link href={`/teams/${team.id}?season=${season}`} key={team.id} style={teamCardStyle(team)}><header><TeamLogo constructorId={team.id} constructorName={team.name} teamColor={teamColor(team)} season={season} logoUrl={team.logoUrl} /><div><strong>{team.name}</strong>{team.nameRu ? <small className="team-secondary-name">{team.nameRu}</small> : null}<small>Сезоны участия: {history.length}</small></div></header><dl><div><dt>Лучшее место</dt><dd>{knownPositions.length ? Math.min(...knownPositions) : '—'}</dd></div><div><dt>Победы</dt><dd>{total(team, 'wins')}</dd></div><div><dt>Очки</dt><dd>{total(team, 'points')}</dd></div></dl></Link>; })}</div></section>
    <p className="constructors-note">Статистика учитывает только сезоны, представленные в каталоге</p>
  </main>;
}
