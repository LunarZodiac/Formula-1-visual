'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { CSSProperties } from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { DriverFlag, DriverPortrait, TeamLogo } from './racing-visuals';

import type { DriverListItem } from '../data/competitor-contract';
export type { DriverCatalogItem } from '../data/competitor-contract';

const teamColors: Record<string, string> = {
  alpine: '#f079b5', aston_martin: '#229971', audi: '#e21b2d', cadillac: '#c7a866',
  ferrari: '#ef1a2d', haas: '#b6bec5', mclaren: '#ff8700', mercedes: '#00d2be',
  rb: '#55c3ff', red_bull: '#3671c6', williams: '#64c4ff',
};

const nationalityNames: Record<string, string> = {
  Argentine: 'Аргентина', Australian: 'Австралия', Brazilian: 'Бразилия', British: 'Великобритания',
  Canadian: 'Канада', Dutch: 'Нидерланды', Finnish: 'Финляндия', French: 'Франция', German: 'Германия',
  Italian: 'Италия', Japanese: 'Япония', Mexican: 'Мексика', Monegasque: 'Монако',
  'New Zealander': 'Новая Зеландия', Spanish: 'Испания', Thai: 'Таиланд',
};

function driverColor(driver: DriverListItem) {
  return driver.team?.color ?? (driver.team ? teamColors[driver.team.id] : null) ?? '#738795';
}

function debutSeason(driver: DriverListItem) {
  return driver.firstSeason ?? driver.seasonHistory?.reduce((oldest, item) => Math.min(oldest, item.season), driver.seasonHistory[0]?.season ?? 0) ?? 0;
}

function DriverIdentity({ driver, season, featured = false }: { driver: DriverListItem; season: number; featured?: boolean }) {
  return (
    <div className={featured ? 'driver-showcase-portrait is-featured' : 'driver-showcase-portrait'} aria-hidden="true">
      <span className="driver-showcase-number">{driver.number === null ? '—' : String(driver.number).padStart(2, '0')}</span>
      <DriverPortrait driverId={driver.id} name={driver.nameRu} />
      {driver.team ? <TeamLogo constructorId={driver.team.id} constructorName={driver.team.name} teamColor={driverColor(driver)} season={season} logoUrl={driver.team.logoUrl} /> : null}
    </div>
  );
}

function DriverFacts({ driver, compact = false }: { driver: DriverListItem; compact?: boolean }) {
  const debut = debutSeason(driver);
  return (
    <dl className={compact ? 'driver-showcase-facts is-compact' : 'driver-showcase-facts'}>
      <div><dt>Очки</dt><dd>{driver.points}</dd></div>
      <div><dt>Победы</dt><dd>{driver.wins}</dd></div>
      {!compact ? <div><dt>Сезонов</dt><dd>{driver.seasonCount ?? driver.seasonHistory?.length ?? 0}</dd></div> : null}
      <div><dt>Дебют</dt><dd>{debut || '—'}</dd></div>
    </dl>
  );
}

export function DriverCatalog({ season, afterRound, drivers, seasonSelected = false }: { season: number; afterRound: number; drivers: DriverListItem[]; seasonSelected?: boolean }) {
  const router = useRouter();
  const teamSelectRef = useRef<HTMLSelectElement>(null);
  const loadMoreRef = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState('');
  const [team, setTeam] = useState('all');
  const [teamMode, setTeamMode] = useState(false);
  const [visibleCount, setVisibleCount] = useState(48);
  const teams = useMemo(() => Array.from(new Map(drivers.filter((driver) => driver.team).map((driver) => [driver.team!.id, driver.team!.name])).entries()).sort((left, right) => left[1].localeCompare(right[1], 'ru', { sensitivity: 'base' })), [drivers]);
  const filtered = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase('ru');
    return drivers
      .filter((driver) => {
        const matchesQuery = !needle || [driver.nameRu, driver.nameEn, driver.code ?? '', driver.team?.name ?? ''].some((value) => value.toLocaleLowerCase('ru').includes(needle));
        return matchesQuery && (team === 'all' || driver.team?.id === team);
      })
      .sort((a, b) => seasonSelected
        ? (a.position ?? Number.MAX_SAFE_INTEGER) - (b.position ?? Number.MAX_SAFE_INTEGER) || a.nameRu.localeCompare(b.nameRu, 'ru')
        : a.nameRu.localeCompare(b.nameRu, 'ru'));
  }, [drivers, query, seasonSelected, team]);
  const visibleDrivers = seasonSelected ? filtered : filtered.slice(0, visibleCount);
  const [featured, ...rest] = visibleDrivers;
  const activeTab = teamMode || team !== 'all' ? 'teams' : seasonSelected ? 'season' : 'all';
  const profileHref = (id: string) => `/drivers/${id}${seasonSelected ? `?season=${season}` : ''}`;

  useEffect(() => {
    const target = loadMoreRef.current;
    if (seasonSelected || !target || visibleDrivers.length >= filtered.length) return;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) setVisibleCount((count) => Math.min(count + 48, filtered.length));
    }, { rootMargin: '600px 0px' });
    observer.observe(target);
    return () => observer.disconnect();
  }, [filtered.length, seasonSelected, visibleDrivers.length]);

  return (
    <main className="entity-catalog-page driver-showcase-page">
      <header className="driver-showcase-hero">
        <div>
          <nav className="driver-showcase-breadcrumbs" aria-label="Хлебные крошки"><Link href="/">Главная</Link><span aria-hidden="true">›</span><b>Пилоты</b></nav>
          <small>{seasonSelected ? `Сезон ${season}` : 'Все сезоны'}</small>
          <h1>Пилоты</h1>
          <p>{seasonSelected ? `Пилоты сезона, их команды и путь в Формуле-1 · зачёт после этапа ${afterRound}` : 'Все пилоты чемпионата мира Formula 1 с 1950 года'}</p>
        </div>
        <div className="driver-showcase-hero-art" aria-hidden="true"><i /><i /><i /></div>
      </header>

      <section className="driver-showcase-toolbar" aria-label="Фильтры пилотов">
        <div className={`driver-showcase-tabs is-${activeTab}`} aria-label="Раздел каталога"><button type="button" className={activeTab === 'all' ? 'is-active' : ''} onClick={() => router.push('/drivers')}>Все пилоты</button><button type="button" className={activeTab === 'season' ? 'is-active' : ''} onClick={() => router.push(`/drivers?season=${season}`)}>Сезон {season}</button><button type="button" className={activeTab === 'teams' ? 'is-active' : ''} onClick={() => { setTeamMode(true); teamSelectRef.current?.focus(); }}>По командам</button></div>
        <label className="driver-showcase-search"><span className="sr-only">Поиск</span><input type="search" value={query} onChange={(event) => { setQuery(event.target.value); setVisibleCount(48); }} placeholder="Поиск пилота…" /></label>
        <label className="driver-showcase-select"><span className="sr-only">Команда</span><select ref={teamSelectRef} value={team} onChange={(event) => { setTeam(event.target.value); setTeamMode(event.target.value !== 'all'); setVisibleCount(48); }}><option value="all">Все команды</option>{teams.map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></label>
        <button type="button" onClick={() => { setQuery(''); setTeam('all'); setTeamMode(false); setVisibleCount(48); }} disabled={!query && team === 'all' && !teamMode}>Сбросить</button>
      </section>
      <div className="driver-showcase-count">Найдено пилотов: <strong>{filtered.length}</strong></div>

      {featured ? (
        <>
          <Link className="driver-featured-card" href={profileHref(featured.id)} style={{ '--entity-color': driverColor(featured) } as CSSProperties}>
            <div className="driver-featured-name">
              <div><DriverFlag driverId={featured.id} /><h2>{featured.nameRu}</h2></div>
              <p>{nationalityNames[featured.nationality ?? ''] ?? featured.nationality ?? 'Страна не указана'} · {featured.team?.name ?? 'Команда не указана'}</p>
            </div>
            <DriverIdentity driver={featured} season={season} featured />
            <div className="driver-featured-data">
              <h3>{featured.position === 1 ? `Лидер личного зачёта ${season}` : featured.position === null ? `Участник сезона ${season}` : `Позиция ${featured.position} в сезоне ${season}`}</h3>
              <p>{featured.points} очков и {featured.wins} {featured.wins === 1 ? 'победа' : featured.wins > 1 && featured.wins < 5 ? 'победы' : 'побед'} в текущем наборе результатов</p>
              <DriverFacts driver={featured} />
              <b>Открыть профиль →</b>
            </div>
          </Link>

          {rest.length > 0 ? <section className="driver-showcase-grid" aria-label="Каталог пилотов">{rest.map((driver) => (
            <Link className="driver-showcase-card" href={profileHref(driver.id)} key={driver.id} style={{ '--entity-color': driverColor(driver) } as CSSProperties}>
              <DriverIdentity driver={driver} season={season} />
              <div className="driver-showcase-card-copy">
                <div className="driver-showcase-card-title"><DriverFlag driverId={driver.id} /><div><h2>{driver.nameRu}</h2><p>{driver.team?.name ?? 'Команда не указана'}</p></div></div>
                <DriverFacts driver={driver} compact />
              </div>
            </Link>
          ))}</section> : null}
          {!seasonSelected && visibleDrivers.length < filtered.length ? <div className="driver-showcase-loader" ref={loadMoreRef} role="status" aria-live="polite"><i aria-hidden="true" /><span>Загружаем следующие карточки</span></div> : null}
        </>
      ) : <p className="entity-catalog-empty">Пилоты по выбранным условиям не найдены</p>}
    </main>
  );
}
