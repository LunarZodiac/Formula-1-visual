'use client';

import Link from 'next/link';
import type { CSSProperties } from 'react';
import { useEffect, useState } from 'react';
import type { DriverCatalogItem } from './driver-catalog';
import { DriverFlag, DriverPortrait, TeamCar, TeamLogo } from './racing-visuals';
import { FavoriteToggle } from './favorite-toggle';
import type { TeamCatalogItem } from './team-catalog';

const driverTeamColors: Record<string, string> = {
  alpine: '#f079b5', aston_martin: '#229971', audi: '#e21b2d', cadillac: '#c7a866',
  ferrari: '#ef1a2d', haas: '#b6bec5', mclaren: '#ff8700', mercedes: '#00d2be',
  rb: '#55c3ff', red_bull: '#3671c6', williams: '#64c4ff',
};

export function DriverProfile({ season, driver }: { season: number; driver: DriverCatalogItem }) {
  const [activeSection, setActiveSection] = useState('overview');
  const orderedHistory = [...driver.seasonHistory].sort((a, b) => b.season - a.season);
  const totals = orderedHistory.reduce((result, standing) => ({
    points: result.points + standing.points,
    wins: result.wins + standing.wins,
  }), { points: 0, wins: 0 });
  const rankedHistory = orderedHistory.filter((standing) => standing.position !== null);
  const bestPosition = rankedHistory.length > 0
    ? Math.min(...rankedHistory.map((standing) => standing.position as number))
    : null;
  const debutSeason = orderedHistory.at(-1)?.season ?? null;
  const nationalityNames: Record<string, string> = {
    Argentine: 'Аргентина', Australian: 'Австралия', Brazilian: 'Бразилия', British: 'Великобритания',
    Canadian: 'Канада', Dutch: 'Нидерланды', Finnish: 'Финляндия', French: 'Франция', German: 'Германия',
    Italian: 'Италия', Japanese: 'Япония', Mexican: 'Мексика', Monegasque: 'Монако',
    'New Zealander': 'Новая Зеландия', Spanish: 'Испания', Thai: 'Таиланд',
  };
  const nationality = driver.nationality ? nationalityNames[driver.nationality] ?? driver.nationality : 'Не указана';
  const winLabel = (wins: number) => wins === 1 ? 'победа' : wins > 1 && wins < 5 ? 'победы' : 'побед';

  useEffect(() => {
    let frame = 0;
    const updateActiveSection = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const headerHeight = document.querySelector<HTMLElement>('.site-header')?.offsetHeight ?? 74;
        const subnavHeight = document.querySelector<HTMLElement>('.driver-profile-subnav')?.offsetHeight ?? 54;
        const threshold = headerHeight + subnavHeight + 18;
        const sections = ['overview', 'biography', 'circuits', 'history']
          .map((id) => document.getElementById(id))
          .filter((section): section is HTMLElement => Boolean(section));
        const current = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4
          ? sections.at(-1)?.id ?? 'overview'
          : sections.reduce((selected, section) => section.getBoundingClientRect().top <= threshold ? section.id : selected, sections[0]?.id ?? 'overview');
        setActiveSection(current);
      });
    };
    updateActiveSection();
    window.addEventListener('scroll', updateActiveSection, { passive: true });
    window.addEventListener('resize', updateActiveSection);
    return () => { cancelAnimationFrame(frame); window.removeEventListener('scroll', updateActiveSection); window.removeEventListener('resize', updateActiveSection); };
  }, []);

  useEffect(() => {
    const syncHashTarget = () => {
      const id = window.location.hash.slice(1);
      if (!['overview', 'biography', 'circuits', 'history'].includes(id)) return;
      const target = document.getElementById(id);
      if (!target) return;
      setActiveSection(id);
      requestAnimationFrame(() => {
        const headerHeight = document.querySelector<HTMLElement>('.site-header')?.offsetHeight ?? 74;
        const subnavHeight = document.querySelector<HTMLElement>('.driver-profile-subnav')?.offsetHeight ?? 54;
        const top = window.scrollY + target.getBoundingClientRect().top - headerHeight - subnavHeight - 12;
        window.scrollTo({ top, behavior: 'auto' });
      });
    };
    syncHashTarget();
    window.addEventListener('hashchange', syncHashTarget);
    window.addEventListener('popstate', syncHashTarget);
    return () => { window.removeEventListener('hashchange', syncHashTarget); window.removeEventListener('popstate', syncHashTarget); };
  }, []);

  const navigateToSection = (event: React.MouseEvent<HTMLAnchorElement>, id: string) => {
    event.preventDefault();
    const target = document.getElementById(id);
    if (!target) return;
    const headerHeight = document.querySelector<HTMLElement>('.site-header')?.offsetHeight ?? 74;
    const subnavHeight = document.querySelector<HTMLElement>('.driver-profile-subnav')?.offsetHeight ?? 54;
    const top = window.scrollY + target.getBoundingClientRect().top - headerHeight - subnavHeight - 12;
    setActiveSection(id);
    window.history.replaceState(null, '', `#${id}`);
    window.scrollTo({ top, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  };

  return (
    <main className="driver-profile-page" style={{ '--driver-team-color': driver.team?.color ?? (driver.team ? driverTeamColors[driver.team.id] : null) ?? '#738795' } as CSSProperties}>
      <nav className="driver-profile-breadcrumbs" aria-label="Хлебные крошки">
        <Link href="/">Главная</Link><span aria-hidden="true">›</span><Link href="/drivers">Пилоты</Link><span aria-hidden="true">›</span><b>{driver.nameRu}</b>
      </nav>

      <header className="driver-profile-hero" id="profile">
        <div className="driver-profile-portrait">
          <strong>{driver.number === null ? driver.code ?? 'F1' : String(driver.number).padStart(2, '0')}</strong>
          <DriverPortrait driverId={driver.id} name={driver.nameRu} />
          <i />
        </div>
        <div className="driver-profile-intro">
          <span>Пилот Formula 1 · сезон {season}</span>
          <FavoriteToggle type="driver" id={driver.id} label="пилота" />
          <h1>{driver.nameRu}</h1>
          <p className="driver-profile-original-name">{driver.nameEn}</p>
          <div className="driver-profile-identity"><DriverFlag driverId={driver.id} /><strong>{nationality}</strong><i aria-hidden="true" />{driver.team ? <Link href={`/teams/${driver.team.id}`}>{driver.team.name}</Link> : <span>Команда не указана</span>}</div>
          <dl className="driver-profile-hero-facts">
            <div><dt>Позиция в сезоне</dt><dd>{driver.position ?? '—'}</dd></div>
            <div><dt>Очки</dt><dd>{driver.points}</dd></div>
            <div><dt>Победы</dt><dd>{driver.wins}</dd></div>
            <div><dt>Номер</dt><dd>{driver.number ?? '—'}</dd></div>
          </dl>
        </div>
          <div className="driver-profile-hero-number"><small>Номер пилота</small><strong>{driver.number ?? '—'}</strong></div>
      </header>

      <nav className="driver-profile-subnav" aria-label="Разделы профиля" style={{ '--active-section': ['overview', 'biography', 'circuits', 'history'].indexOf(activeSection) } as CSSProperties}>
        {([['overview', 'Обзор'], ['biography', 'Биография'], ['circuits', 'Трассы'], ['history', 'История сезонов']] as const).map(([id, label]) => <a className={activeSection === id ? 'is-active' : undefined} href={`#${id}`} aria-current={activeSection === id ? 'location' : undefined} onClick={(event) => navigateToSection(event, id)} key={id}>{label}</a>)}
      </nav>

      <section className="driver-profile-overview" id="overview" aria-label="Обзор показателей">
        <article className="driver-profile-panel driver-profile-season-card">
          <header><span>Текущий сезон</span><h2>Сезон {season}</h2></header>
          <div className="driver-profile-position"><strong>{driver.position ?? '—'}</strong><span>место<br />в чемпионате</span></div>
          <dl><div><dt>Очки</dt><dd>{driver.points}</dd></div><div><dt>Победы</dt><dd>{driver.wins}</dd></div><div><dt>Трасс с победой</dt><dd>{driver.successfulCircuits.length}</dd></div></dl>
        </article>

        <article className="driver-profile-panel driver-profile-career-card">
          <header><span>Сводка по базе</span><h2>Карьера</h2></header>
          <dl><div><dt>Сезонов</dt><dd>{orderedHistory.length}</dd></div><div><dt>Победы</dt><dd>{totals.wins}</dd></div><div><dt>Очки</dt><dd>{totals.points}</dd></div><div><dt>Лучшее место</dt><dd>{bestPosition ?? '—'}</dd></div><div><dt>Первый сезон</dt><dd>{debutSeason ?? '—'}</dd></div><div><dt>Последний сезон</dt><dd>{orderedHistory[0]?.season ?? '—'}</dd></div></dl>
        </article>

        <article className="driver-profile-panel driver-profile-team-card">
          <header><span>Сезон {season}</span><h2>Команда</h2></header>
          {driver.team ? <><TeamLogo constructorId={driver.team.id} constructorName={driver.team.name} season={season} logoUrl={driver.team.logoUrl} /><strong>{driver.team.name}</strong><p>Команда пилота в текущем загруженном срезе сезона</p><Link href={`/teams/${driver.team.id}`}>Профиль команды <span>→</span></Link></> : <p>Команда не указана в загруженном наборе данных</p>}
        </article>
      </section>

      <section className="driver-profile-section driver-profile-biography" id="biography">
        <header><div><span>Личная информация</span><h2>Биография</h2></div><p>Проверенные биографические сведения о пилоте</p></header>
        <div className="driver-profile-biography-grid">
          <div className="driver-profile-biography-copy"><p>{driver.biography ?? 'Биографическая справка готовится. Мы добавим её после проверки источников.'}</p></div>
          <dl className="driver-profile-biography-facts">
            <div><dt>Дата рождения</dt><dd>{driver.birthDate ?? 'Не указана'}</dd></div>
            <div><dt>Место рождения</dt><dd>{driver.birthPlace ?? 'Не указано'}</dd></div>
            <div><dt>Рост</dt><dd>{driver.heightCm ? `${driver.heightCm} см` : 'Не указан'}</dd></div>
            <div><dt>Вес</dt><dd>{driver.weightKg ? `${driver.weightKg} кг` : 'Не указан'}</dd></div>
          </dl>
        </div>
      </section>

      <section className="driver-profile-section" id="circuits">
        <header><div><span>География результатов</span><h2>Успешные трассы</h2></div><p>Трассы, на которых зафиксированы победы пилота в загруженном наборе результатов</p></header>
        {driver.successfulCircuits.length > 0 ? <div className="driver-profile-circuits">{driver.successfulCircuits.map((circuit, index) => {
          const content = <><small>{String(index + 1).padStart(2, '0')}</small><div><strong>{circuit.name}</strong><span>{circuit.wins} {winLabel(circuit.wins)}</span></div><b aria-hidden="true">↗</b></>;
          return circuit.isPublished && circuit.slug ? <Link key={circuit.id} href={`/circuits/${circuit.slug}`}>{content}</Link> : <div key={circuit.id}>{content}</div>;
        })}</div> : <p className="driver-profile-empty">В загруженном наборе результатов побед пока нет</p>}
      </section>

      <section className="driver-profile-section" id="history">
        <header><div><span>Результаты по годам</span><h2>История сезонов</h2></div><p>{orderedHistory.length > 0 ? `${orderedHistory.length} ${orderedHistory.length === 1 ? 'сезон' : orderedHistory.length < 5 ? 'сезона' : 'сезонов'} в текущей базе` : 'История сезонов пока не загружена'}</p></header>
        {orderedHistory.length > 0 ? <div className="driver-profile-history" role="table" aria-label="История результатов пилота">
          <div className="driver-profile-history-row is-header" role="row"><span role="columnheader">Сезон</span><span role="columnheader">Команды</span><span role="columnheader">Место</span><span role="columnheader">Очки</span><span role="columnheader">Победы</span></div>
          {orderedHistory.map((standing) => <div className="driver-profile-history-row" role="row" key={standing.season}><strong role="cell">{standing.season}</strong><span role="cell">{standing.teams.length ? [...new Set(standing.teams.map((team) => team.name))].join(', ') : '—'}</span><span role="cell">{standing.position ?? '—'}</span><span role="cell">{standing.points}</span><span role="cell">{standing.wins}</span></div>)}
        </div> : <p className="driver-profile-empty">История сезонов пока не загружена</p>}
      </section>
      <p className="driver-profile-data-note">Показатели отражают последний загруженный срез базы и могут измениться после следующего обновления</p>
    </main>
  );
}

export function TeamProfile({ season, team }: { season: number; team: TeamCatalogItem }) {
  const history = [...team.seasonHistory].sort((a, b) => b.season - a.season);
  const totals = history.reduce((result, row) => ({ points: result.points + row.points, wins: result.wins + row.wins }), { points: 0, wins: 0 });
  const titles = history.filter((row) => row.position === 1).length;
  const bestPosition = history.length ? Math.min(...history.map((row) => row.position)) : null;
  const firstSeason = history.at(-1)?.season ?? null;
  const color = team.color ?? driverTeamColors[team.id] ?? '#738795';
  const nationalities: Record<string, string> = { Austrian: 'Австрия', British: 'Великобритания', French: 'Франция', German: 'Германия', Italian: 'Италия', Swiss: 'Швейцария', American: 'США' };
  const nationality = team.nationality ? nationalities[team.nationality] ?? team.nationality : null;

  return <main className="team-profile-page" style={{ '--team-profile-color': color } as CSSProperties}>
    <nav className="team-profile-breadcrumbs" aria-label="Хлебные крошки"><Link href="/">Главная</Link><span>›</span><Link href="/teams">Кубок конструкторов</Link><span>›</span><b>{team.name}</b></nav>
    <header className="team-profile-hero">
      <FavoriteToggle type="team" id={team.id} label="команду" />
      <div className="team-profile-intro"><span>Команда Formula 1 · сезон {season}</span><div className="team-profile-title"><TeamLogo constructorId={team.id} constructorName={team.name} teamColor={color} season={season} logoUrl={team.logoUrl} /><h1>{team.name}</h1></div>{nationality ? <p>{nationality}</p> : null}<dl><div><dt>Позиция</dt><dd>{team.position}</dd></div><div><dt>Очки</dt><dd>{team.points}</dd></div><div><dt>Победы</dt><dd>{team.wins}</dd></div><div><dt>Пилоты</dt><dd>{team.driverCount}</dd></div></dl></div>
      <div className="team-profile-hero-car"><TeamCar season={season} constructorId={team.id} constructorName={team.name} carImageUrl={team.carImageUrl} /><small>{team.carModel ?? team.engineName ?? `Болид сезона ${season}`}</small></div>
    </header>

    <section className="team-profile-facts" aria-label="Факты о команде"><div><span>Лучшее место в базе</span><strong>{bestPosition ?? '—'}</strong></div><div><span>Титулы в базе</span><strong>{titles}</strong></div><div><span>Победы в базе</span><strong>{totals.wins}</strong></div><div><span>Очки в базе</span><strong>{totals.points}</strong></div><div><span>Первый сезон в базе</span><strong>{firstSeason ?? '—'}</strong></div></section>

    <div className="team-profile-dashboard">
      <section className="team-profile-panel team-profile-drivers"><header><span>Состав</span><h2>Пилоты {season}</h2></header><div>{team.drivers.length ? team.drivers.map((driver) => <Link href={`/drivers/${driver.id}`} key={driver.id}><div className="team-profile-driver-photo"><DriverPortrait driverId={driver.id} name={driver.nameRu} /></div><div><strong>{driver.nameRu}</strong><span>{driver.points} очков · {driver.position} место</span></div></Link>) : <p>Состав сезона пока не загружен</p>}</div></section>
      <section className="team-profile-panel team-profile-season"><header><span>Текущий срез</span><h2>Сезон {season}</h2></header><div className="team-profile-season-position"><strong>{team.position}</strong><span>место в Кубке<br />конструкторов</span></div><dl><div><dt>Очки</dt><dd>{team.points}</dd></div><div><dt>Победы</dt><dd>{team.wins}</dd></div><div><dt>Пилоты</dt><dd>{team.driverCount}</dd></div></dl></section>
      <section className="team-profile-panel team-profile-summary"><header><span>Все загруженные сезоны</span><h2>Сводка по базе</h2></header><dl><div><dt>Сезоны</dt><dd>{history.length}</dd></div><div><dt>Титулы</dt><dd>{titles}</dd></div><div><dt>Победы</dt><dd>{totals.wins}</dd></div><div><dt>Очки</dt><dd>{totals.points}</dd></div></dl></section>
    </div>

    <section className="team-profile-section" id="team-circuits"><header><div><span>География результатов</span><h2>Успешные трассы</h2></div><p>Трассы, на которых команда побеждала в доступном наборе результатов</p></header>{team.successfulCircuits.length ? <div className="team-profile-circuits">{team.successfulCircuits.map((circuit, index) => { const content = <><small>{String(index + 1).padStart(2, '0')}</small><div><strong>{circuit.name}</strong><span>{circuit.wins} побед</span></div><b>↗</b></>; return circuit.isPublished && circuit.slug ? <Link href={`/circuits/${circuit.slug}`} key={circuit.id}>{content}</Link> : <div key={circuit.id}>{content}</div>; })}</div> : <p className="team-profile-empty">В загруженном наборе результатов побед пока нет</p>}</section>
    <section className="team-profile-section" id="team-history"><header><div><span>Результаты по годам</span><h2>История сезонов</h2></div><p>{history.length} сезонов в текущей базе</p></header>{history.length ? <div className="team-profile-history" role="table" aria-label="История результатов команды"><div className="team-profile-history-row is-header" role="row"><span role="columnheader">Сезон</span><span role="columnheader">Название</span><span role="columnheader">Место</span><span role="columnheader">Очки</span><span role="columnheader">Победы</span></div>{history.map((row) => <div className="team-profile-history-row" role="row" key={`${row.season}-${row.name}`}><strong role="cell">{row.season}</strong><span role="cell">{row.name}</span><span role="cell">{row.position}</span><span role="cell">{row.points}</span><span role="cell">{row.wins}</span></div>)}</div> : <p className="team-profile-empty">История сезонов пока не загружена</p>}</section>
    <p className="team-profile-note">Показатели отражают последний загруженный срез базы; адреса, технические характеристики и персоналии не отображаются, пока для них нет подтверждённых данных</p>
  </main>;
}
