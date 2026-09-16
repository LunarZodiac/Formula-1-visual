'use client';

import Link from 'next/link';
import type { CSSProperties } from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { TeamCar, TeamLogo } from './racing-visuals';

import type { TeamCatalogItem, TeamListItem } from '../data/competitor-contract';
export type { TeamCatalogItem } from '../data/competitor-contract';

const fallbackColors: Record<string, string> = {
  alpine: '#f079b5', aston_martin: '#229971', audi: '#e21b2d', cadillac: '#b8a477', ferrari: '#ef1a2d',
  haas: '#b6bec5', mclaren: '#ff8700', mercedes: '#00d2be', rb: '#55c3ff', red_bull: '#3671c6', williams: '#64c4ff',
};
const teamColor = (team: Pick<TeamCatalogItem, 'id' | 'color'> | Pick<TeamListItem, 'id' | 'color'>) => team.color ?? fallbackColors[team.id] ?? '#738795';
const total = (team: TeamCatalogItem, key: 'points' | 'wins') => team.seasonHistory.reduce((sum, row) => sum + row[key], 0);

export function AllTeamCatalog({ teams }: { teams: TeamListItem[] }) {
  const [query, setQuery] = useState('');
  const [visibleCount, setVisibleCount] = useState(36);
  const loadMoreRef = useRef<HTMLDivElement>(null);
  const filtered = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase('ru');
    return teams.filter((team) => !needle || [team.name, team.nationality ?? '', ...team.aliases]
      .some((value) => value.toLocaleLowerCase('ru').includes(needle)));
  }, [query, teams]);
  const visible = filtered.slice(0, visibleCount);
  const hasMore = visibleCount < filtered.length;

  useEffect(() => {
    const target = loadMoreRef.current;
    if (!target || !hasMore) return;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) setVisibleCount((value) => Math.min(value + 36, filtered.length));
    }, { rootMargin: '360px 0px' });
    observer.observe(target);
    return () => observer.disconnect();
  }, [filtered.length, hasMore]);

  return <main className="constructors-page">
    <nav className="constructors-breadcrumbs" aria-label="Хлебные крошки"><Link href="/">Главная</Link><span>›</span><b>Команды</b></nav>
    <header className="constructors-hero"><div><span>Исторический каталог</span><h1>Все команды Formula 1</h1><p>{teams.length} конструкторов и участников чемпионата по доступным сезонам базы</p></div></header>
    <section className="constructors-toolbar" aria-label="Поиск по историческому каталогу"><label><span>Найти команду</span><input type="search" value={query} onChange={(event) => { setQuery(event.target.value); setVisibleCount(36); }} placeholder="Название, прежнее имя или страна" /></label><output>{filtered.length} из {teams.length} команд</output><Link href="/teams?season=2026">Кубок конструкторов 2026 →</Link></section>
    <section className="constructors-history" aria-labelledby="all-constructors-title"><header><span>1950–2026</span><h2 id="all-constructors-title">История участников</h2></header><div>{visible.map((team) => <Link href={`/teams/${team.id}?season=${team.latestSeason}`} key={team.id} style={{ '--team-color': teamColor(team) } as CSSProperties}><header><TeamLogo constructorId={team.id} constructorName={team.name} teamColor={teamColor(team)} season={team.latestSeason} logoUrl={team.logoUrl} /><div><strong>{team.name}</strong><small>{team.firstSeason === team.latestSeason ? team.latestSeason : `${team.firstSeason}–${team.latestSeason}`} · {team.seasonCount} сезонов</small></div></header>{team.aliases.length > 1 ? <p>{team.aliases.join(' · ')}</p> : null}<dl><div><dt>Гран-при</dt><dd>{team.raceEntries}</dd></div><div><dt>Победы</dt><dd>{team.wins}</dd></div><div><dt>Титулы</dt><dd>{team.careerTitles}</dd></div></dl></Link>)}</div></section>
    {hasMore ? <div className="constructors-load-sentinel" ref={loadMoreRef} aria-live="polite">Подгружаем следующие команды…</div> : null}
    <p className="constructors-note">Переименования внутри одного идентификатора показаны как варианты названия. Преемственность разных конструкторов будет добавляться только подтверждёнными связями</p>
  </main>;
}

export function TeamCatalog({ season, afterRound, teams }: { season: number; afterRound: number; teams: TeamCatalogItem[] }) {
  const ordered = useMemo(() => [...teams].sort((a, b) => a.position - b.position), [teams]);
  const [query, setQuery] = useState('');
  const [leftId, setLeftId] = useState(ordered[0]?.id ?? '');
  const [rightId, setRightId] = useState(ordered[1]?.id ?? ordered[0]?.id ?? '');
  const filtered = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase('ru');
    return ordered.filter((team) => !needle || [team.name, team.engineName ?? '', team.nationality ?? ''].some((value) => value.toLocaleLowerCase('ru').includes(needle)));
  }, [ordered, query]);
  const leader = ordered[0];
  const left = ordered.find((team) => team.id === leftId) ?? ordered[0];
  const right = ordered.find((team) => team.id === rightId) ?? ordered[1] ?? ordered[0];
  const maxPoints = Math.max(1, ...ordered.map((team) => team.points));
  const titleLeader = [...ordered].sort((a, b) => b.careerTitles - a.careerTitles)[0];
  const winsLeader = [...ordered].sort((a, b) => total(b, 'wins') - total(a, 'wins'))[0];
  const mostExperienced = [...ordered].sort((a, b) => b.seasonHistory.length - a.seasonHistory.length)[0];

  return <main className="constructors-page">
    <nav className="constructors-breadcrumbs" aria-label="Хлебные крошки"><Link href="/">Главная</Link><span>›</span><b>Кубок конструкторов</b></nav>
    <header className="constructors-hero">
      <div><span>Сезон {season}</span><h1>Кубок конструкторов</h1><p>Команды Formula 1, их составы и положение в чемпионате · зачёт после этапа {afterRound}</p></div>
      {leader ? <div className="constructors-hero-car" style={{ '--team-color': teamColor(leader) } as CSSProperties}><TeamCar season={season} constructorId={leader.id} constructorName={leader.name} carImageUrl={leader.carImageUrl} /><small>Лидер чемпионата</small><strong>{leader.name}</strong></div> : null}
    </header>
    <section className="constructors-toolbar" aria-label="Поиск по турнирной таблице"><label><span>Поиск в таблице</span><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Команда, мотор или страна" /></label><output>{filtered.length} из {teams.length} в таблице</output></section>
    <div className="constructors-dashboard">
      <section className="constructors-standings" aria-labelledby="constructors-standings-title"><header><div><span>Сезон {season}</span><h2 id="constructors-standings-title">Турнирная таблица</h2></div><small>{ordered.length} команд</small></header><div>{filtered.length ? filtered.map((team) => <Link href={`/teams/${team.id}?season=${season}`} key={team.id} style={{ '--team-color': teamColor(team) } as CSSProperties}><b>{String(team.position).padStart(2, '0')}</b><TeamLogo constructorId={team.id} constructorName={team.name} teamColor={teamColor(team)} season={season} logoUrl={team.logoUrl} /><strong>{team.name}</strong><div className="constructors-points-bar"><i style={{ width: `${Math.max(3, team.points / maxPoints * 100)}%` }} /></div><span>{team.points}</span></Link>) : <p className="constructors-empty">Команды по выбранным условиям не найдены</p>}</div></section>
      {left && right ? <section className="constructors-comparison" aria-labelledby="constructors-comparison-title"><header><div><span>Сопоставление</span><h2 id="constructors-comparison-title">Сравнение команд</h2></div></header><div className="constructors-compare-selects"><select aria-label="Первая команда" value={left.id} onChange={(event) => setLeftId(event.target.value)}>{ordered.map((team) => <option value={team.id} key={team.id} disabled={team.id === right.id}>{team.name}</option>)}</select><b>VS</b><select aria-label="Вторая команда" value={right.id} onChange={(event) => setRightId(event.target.value)}>{ordered.map((team) => <option value={team.id} key={team.id} disabled={team.id === left.id}>{team.name}</option>)}</select></div><div className="constructors-compare-cars"><TeamCar season={season} constructorId={left.id} constructorName={left.name} carImageUrl={left.carImageUrl} /><TeamCar season={season} constructorId={right.id} constructorName={right.name} carImageUrl={right.carImageUrl} /></div><dl>{[
        ['Очки', left.points, right.points], ['Победы', left.wins, right.wins], ['Позиция', left.position, right.position], ['Победы в базе', total(left, 'wins'), total(right, 'wins')], ['Сезоны в базе', left.seasonHistory.length, right.seasonHistory.length],
      ].map(([label, a, b]) => <div key={label}><strong>{a}</strong><dt>{label}</dt><strong>{b}</strong></div>)}</dl><footer><Link href={`/teams/${left.id}?season=${season}`}>{left.name} →</Link><Link href={`/teams/${right.id}?season=${season}`}>{right.name} →</Link></footer></section> : null}
    </div>
    <section className="constructors-highlights" aria-labelledby="constructors-highlights-title"><header><span>Данные каталога</span><h2 id="constructors-highlights-title">Команды в цифрах</h2></header><div>
      {leader ? <article><small>Лидер сезона</small><TeamLogo constructorId={leader.id} constructorName={leader.name} teamColor={teamColor(leader)} season={season} logoUrl={leader.logoUrl} /><strong>{leader.name}</strong><span>{leader.points} очков</span></article> : null}
      {titleLeader ? <article><small>Титулы завершённых сезонов</small><TeamLogo constructorId={titleLeader.id} constructorName={titleLeader.name} teamColor={teamColor(titleLeader)} season={season} logoUrl={titleLeader.logoUrl} /><strong>{titleLeader.careerTitles}</strong><span>{titleLeader.name}</span></article> : null}
      {winsLeader ? <article><small>Победы в базе</small><TeamLogo constructorId={winsLeader.id} constructorName={winsLeader.name} teamColor={teamColor(winsLeader)} season={season} logoUrl={winsLeader.logoUrl} /><strong>{total(winsLeader, 'wins')}</strong><span>{winsLeader.name}</span></article> : null}
      {mostExperienced ? <article><small>Сезонов в базе</small><TeamLogo constructorId={mostExperienced.id} constructorName={mostExperienced.name} teamColor={teamColor(mostExperienced)} season={season} logoUrl={mostExperienced.logoUrl} /><strong>{mostExperienced.seasonHistory.length}</strong><span>{mostExperienced.name}</span></article> : null}
    </div></section>
    <section className="constructors-history" aria-labelledby="constructors-history-title"><header><span>Результаты по годам</span><h2 id="constructors-history-title">История выступлений</h2></header><div>{filtered.map((team) => { const history = [...team.seasonHistory].sort((a, b) => b.season - a.season); return <Link href={`/teams/${team.id}?season=${season}`} key={team.id} style={{ '--team-color': teamColor(team) } as CSSProperties}><header><TeamLogo constructorId={team.id} constructorName={team.name} teamColor={teamColor(team)} season={season} logoUrl={team.logoUrl} /><div><strong>{team.name}</strong><small>{history.length} сезонов в базе</small></div></header><dl><div><dt>Лучшее место</dt><dd>{history.length ? Math.min(...history.map((row) => row.position)) : '—'}</dd></div><div><dt>Победы</dt><dd>{total(team, 'wins')}</dd></div><div><dt>Очки</dt><dd>{total(team, 'points')}</dd></div></dl></Link>; })}</div></section>
    <p className="constructors-note">Показатели рассчитаны только по сезонам, доступным в текущей базе</p>
  </main>;
}
