'use client';

import Link from 'next/link';
import type { CSSProperties } from 'react';
import { useMemo, useState } from 'react';
import { DriverFlag, DriverPortrait, TeamLogo } from './racing-visuals';

import type { DriverCatalogItem } from '../data/competitor-contract';
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

function driverColor(driver: DriverCatalogItem) {
  return driver.team?.color ?? (driver.team ? teamColors[driver.team.id] : null) ?? '#738795';
}

function debutSeason(driver: DriverCatalogItem) {
  return driver.seasonHistory.reduce((oldest, item) => Math.min(oldest, item.season), driver.seasonHistory[0]?.season ?? 0);
}

function DriverIdentity({ driver, season, featured = false }: { driver: DriverCatalogItem; season: number; featured?: boolean }) {
  return (
    <div className={featured ? 'driver-showcase-portrait is-featured' : 'driver-showcase-portrait'} aria-hidden="true">
      <span className="driver-showcase-number">{driver.number === null ? '—' : String(driver.number).padStart(2, '0')}</span>
      <DriverPortrait driverId={driver.id} name={driver.nameRu} />
      <span className="driver-showcase-code">{driver.code ?? 'F1'}</span>
      {driver.team ? <TeamLogo constructorId={driver.team.id} constructorName={driver.team.name} teamColor={driverColor(driver)} season={season} logoUrl={driver.team.logoUrl} /> : null}
    </div>
  );
}

function DriverFacts({ driver, compact = false }: { driver: DriverCatalogItem; compact?: boolean }) {
  const debut = debutSeason(driver);
  return (
    <dl className={compact ? 'driver-showcase-facts is-compact' : 'driver-showcase-facts'}>
      <div><dt>Очки</dt><dd>{driver.points}</dd></div>
      <div><dt>Победы</dt><dd>{driver.wins}</dd></div>
      {!compact ? <div><dt>Сезонов</dt><dd>{driver.seasonHistory.length}</dd></div> : null}
      <div><dt>Дебют</dt><dd>{debut || '—'}</dd></div>
    </dl>
  );
}

export function DriverCatalog({ season, afterRound, drivers }: { season: number; afterRound: number; drivers: DriverCatalogItem[] }) {
  const [query, setQuery] = useState('');
  const [team, setTeam] = useState('all');
  const teams = useMemo(() => Array.from(new Map(drivers.filter((driver) => driver.team).map((driver) => [driver.team!.id, driver.team!.name])).entries()), [drivers]);
  const filtered = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase('ru');
    return drivers
      .filter((driver) => {
        const matchesQuery = !needle || [driver.nameRu, driver.nameEn, driver.code ?? '', driver.team?.name ?? ''].some((value) => value.toLocaleLowerCase('ru').includes(needle));
        return matchesQuery && (team === 'all' || driver.team?.id === team);
      })
      .sort((a, b) => a.position - b.position);
  }, [drivers, query, team]);
  const [featured, ...rest] = filtered;

  return (
    <main className="entity-catalog-page driver-showcase-page">
      <header className="driver-showcase-hero">
        <div>
          <nav className="driver-showcase-breadcrumbs" aria-label="Хлебные крошки"><Link href="/">Главная</Link><span aria-hidden="true">›</span><b>Пилоты</b></nav>
          <small>Сезон {season}</small>
          <h1>Пилоты</h1>
          <p>Пилоты сезона, их команды и путь в Формуле-1 · зачёт после этапа {afterRound}</p>
        </div>
        <div className="driver-showcase-hero-art" aria-hidden="true"><i /><i /><i /></div>
      </header>

      <section className="driver-showcase-toolbar" aria-label="Фильтры пилотов">
        <div className="driver-showcase-tabs" aria-label="Раздел каталога"><b>Все пилоты</b><span>Сезон {season}</span><span>По командам</span></div>
        <label className="driver-showcase-search"><span className="sr-only">Поиск</span><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Поиск пилота…" /></label>
        <label className="driver-showcase-select"><span className="sr-only">Команда</span><select value={team} onChange={(event) => setTeam(event.target.value)}><option value="all">Все команды</option>{teams.map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></label>
        <button type="button" onClick={() => { setQuery(''); setTeam('all'); }} disabled={!query && team === 'all'}>Сбросить</button>
      </section>
      <div className="driver-showcase-count">Найдено пилотов: <strong>{filtered.length}</strong></div>

      {featured ? (
        <>
          <Link className="driver-featured-card" href={`/drivers/${featured.id}`} style={{ '--entity-color': driverColor(featured) } as CSSProperties}>
            <div className="driver-featured-name">
              <span>Лидер выборки · {String(featured.position).padStart(2, '0')}</span>
              <div><DriverFlag driverId={featured.id} /><h2>{featured.nameRu}</h2></div>
              <p>{nationalityNames[featured.nationality ?? ''] ?? featured.nationality ?? 'Страна не указана'} · {featured.team?.name ?? 'Команда не указана'}</p>
            </div>
            <DriverIdentity driver={featured} season={season} featured />
            <div className="driver-featured-data">
              <small>Первый в текущей выборке</small>
              <h3>{featured.position === 1 ? `Лидер личного зачёта ${season}` : `Позиция ${featured.position} в сезоне ${season}`}</h3>
              <p>{featured.points} очков и {featured.wins} {featured.wins === 1 ? 'победа' : featured.wins > 1 && featured.wins < 5 ? 'победы' : 'побед'} в текущем наборе результатов</p>
              <DriverFacts driver={featured} />
              <b>Открыть профиль →</b>
            </div>
          </Link>

          {rest.length > 0 ? <section className="driver-showcase-grid" aria-label="Каталог пилотов">{rest.map((driver) => (
            <Link className="driver-showcase-card" href={`/drivers/${driver.id}`} key={driver.id} style={{ '--entity-color': driverColor(driver) } as CSSProperties}>
              <DriverIdentity driver={driver} season={season} />
              <div className="driver-showcase-card-copy">
                <div className="driver-showcase-card-title"><DriverFlag driverId={driver.id} /><div><h2>{driver.nameRu}</h2><p>{driver.team?.name ?? 'Команда не указана'}</p></div></div>
                <DriverFacts driver={driver} compact />
              </div>
            </Link>
          ))}</section> : null}
        </>
      ) : <p className="entity-catalog-empty">Пилоты по выбранным условиям не найдены</p>}
    </main>
  );
}
