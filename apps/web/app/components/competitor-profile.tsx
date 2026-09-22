'use client';

import Link from 'next/link';
import type { CSSProperties } from 'react';
import { useEffect, useState } from 'react';
import type { DriverCatalogItem } from './driver-catalog';
import { DriverFlag, DriverPortrait, TeamCar, TeamLogo } from './racing-visuals';
import { FavoriteToggle } from './favorite-toggle';
import type { TeamCatalogItem } from './team-catalog';
import type { TeamListItem } from '../data/competitor-contract';
import { DriverNumberMark, resolveDriverNumber } from './driver-number-mark';
import { Breadcrumbs } from './breadcrumbs';
import { DriverResultsMap } from './driver-results-map';

const driverTeamColors: Record<string, string> = {
  alpine: '#f079b5', aston_martin: '#229971', audi: '#e21b2d', cadillac: '#c7a866',
  ferrari: '#ef1a2d', haas: '#b6bec5', mclaren: '#ff8700', mercedes: '#00d2be',
  rb: '#55c3ff', red_bull: '#3671c6', williams: '#64c4ff',
};

function fullYearsBetween(start: Date, end: Date) {
  return end.getUTCFullYear() - start.getUTCFullYear()
    - (end.getUTCMonth() < start.getUTCMonth()
      || (end.getUTCMonth() === start.getUTCMonth() && end.getUTCDate() < start.getUTCDate()) ? 1 : 0);
}

function yearLabel(value: number) {
  const lastTwo = value % 100;
  const last = value % 10;
  if (lastTwo >= 11 && lastTwo <= 14) return 'лет';
  if (last === 1) return 'год';
  if (last >= 2 && last <= 4) return 'года';
  return 'лет';
}

export function DriverProfile({ season, driver }: { season: number; driver: DriverCatalogItem }) {
  const [activeSection, setActiveSection] = useState('overview');
  const [showAllSeasons, setShowAllSeasons] = useState(false);
  const [seasonToRestore, setSeasonToRestore] = useState<string | null>(null);
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
  const lastRecordedSeason = orderedHistory[0]?.season ?? null;
  const nationalityNames: Record<string, string> = {
    American: 'США', Argentine: 'Аргентина', Australian: 'Австралия', Austrian: 'Австрия', Belgian: 'Бельгия',
    Brazilian: 'Бразилия', British: 'Великобритания', Canadian: 'Канада', Chilean: 'Чили', Chinese: 'Китай',
    Colombian: 'Колумбия', Czech: 'Чехия', Danish: 'Дания', Dutch: 'Нидерланды', 'East German': 'ГДР',
    Finnish: 'Финляндия', French: 'Франция', German: 'Германия', Hungarian: 'Венгрия', Indian: 'Индия',
    Indonesian: 'Индонезия', Irish: 'Ирландия', Italian: 'Италия', Japanese: 'Япония',
    Liechtensteiner: 'Лихтенштейн', Malaysian: 'Малайзия', Mexican: 'Мексика', Monegasque: 'Монако',
    'New Zealander': 'Новая Зеландия', Polish: 'Польша', Portuguese: 'Португалия', Rhodesian: 'Родезия',
    Russian: 'Россия', 'South African': 'ЮАР', Spanish: 'Испания', Swedish: 'Швеция', Swiss: 'Швейцария',
    Thai: 'Таиланд', Uruguayan: 'Уругвай', Venezuelan: 'Венесуэла',
  };
  const nationality = driver.nationality ? nationalityNames[driver.nationality] ?? driver.nationality : 'Не указана';
  const birthDate = driver.birthDate ? new Date(`${driver.birthDate}T00:00:00Z`) : null;
  const deathDate = driver.deathDate ? new Date(`${driver.deathDate}T00:00:00Z`) : null;
  const validBirthDate = birthDate && Number.isFinite(birthDate.getTime()) ? birthDate : null;
  const validDeathDate = deathDate && Number.isFinite(deathDate.getTime()) ? deathDate : null;
  const age = validBirthDate ? fullYearsBetween(validBirthDate, validDeathDate ?? new Date()) : null;
  const formattedBirthDate = birthDate && Number.isFinite(birthDate.getTime())
    ? new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(birthDate)
    : null;
  const formattedDeathDate = validDeathDate
    ? new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(validDeathDate)
    : null;
  const displayNumber = resolveDriverNumber(driver, season);
  const numberEntries = driver.numberEntries ?? [];
  const usedNumbers = [...new Set(numberEntries.map((entry) => entry.number))];
  const currentYear = new Date().getUTCFullYear();
  const seasonContextLabel = season < currentYear ? 'Архивный сезон' : season > currentYear ? 'Будущий сезон' : 'Текущий сезон';

  useEffect(() => {
    let frame = 0;
    const updateActiveSection = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const headerHeight = document.querySelector<HTMLElement>('.site-header')?.offsetHeight ?? 74;
        const subnavHeight = document.querySelector<HTMLElement>('.driver-profile-subnav')?.offsetHeight ?? 54;
        const threshold = headerHeight + subnavHeight + 40;
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
    const storageKey = `driver-profile-return:${driver.id}`;
    const restoreSeasonPosition = () => {
      const storedSeason = window.sessionStorage.getItem(storageKey);
      if (!storedSeason) return;
      window.sessionStorage.removeItem(storageKey);
      const hiddenIndex = orderedHistory.findIndex((standing) => String(standing.season) === storedSeason);
      if (hiddenIndex >= 5) setShowAllSeasons(true);
      setSeasonToRestore(storedSeason);
    };
    restoreSeasonPosition();
    window.addEventListener('popstate', restoreSeasonPosition);
    window.addEventListener('pageshow', restoreSeasonPosition);
    return () => {
      window.removeEventListener('popstate', restoreSeasonPosition);
      window.removeEventListener('pageshow', restoreSeasonPosition);
    };
  // Восстановление выполняется только при возврате на профиль конкретного пилота.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [driver.id]);

  useEffect(() => {
    if (!seasonToRestore) return;
    const frame = requestAnimationFrame(() => requestAnimationFrame(() => {
      const target = document.getElementById(`driver-season-${seasonToRestore}`);
      if (!target) return;
      target.scrollIntoView({ block: 'center' });
      window.history.scrollRestoration = 'auto';
      setSeasonToRestore(null);
    }));
    return () => cancelAnimationFrame(frame);
  }, [seasonToRestore, showAllSeasons]);

  const rememberSeasonPosition = (seasonYear: number) => {
    window.history.scrollRestoration = 'manual';
    window.sessionStorage.setItem(`driver-profile-return:${driver.id}`, String(seasonYear));
  };

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
      <Breadcrumbs items={[{ label: 'Главная', href: '/' }, { label: 'Пилоты', href: '/drivers' }, { label: driver.nameRu }]} />

      <header className="driver-profile-hero" id="profile">
        <div className="driver-profile-portrait">
          <DriverNumberMark driverId={driver.id} season={season} number={displayNumber} className="driver-profile-number-watermark" />
          <DriverPortrait driverId={driver.id} name={driver.nameRu} />
          <i />
        </div>
        <div className="driver-profile-intro">
          <span>Пилот Formula 1 · сезон {season}</span>
          <FavoriteToggle type="driver" id={driver.id} label="пилота" />
          <h1>{driver.nameRu}</h1>
          <p className="driver-profile-original-name">{driver.nameEn}</p>
          {driver.nicknames?.[0] ? <p className="driver-profile-primary-nickname">«{driver.nicknames[0].nameRu}»{driver.nicknames[0].nameOriginal ? <small>{driver.nicknames[0].nameOriginal}</small> : null}</p> : null}
          <div className="driver-profile-identity"><DriverFlag driverId={driver.id} /><strong>{nationality}</strong><i aria-hidden="true" />{driver.team ? <Link href={`/teams/${driver.team.id}`}>{driver.team.name}</Link> : <span>Команда не указана</span>}</div>
          <dl className="driver-profile-hero-facts">
            <div><dt>Позиция в сезоне</dt><dd>{driver.position ?? '—'}</dd></div>
            <div><dt>Очки</dt><dd>{driver.points}</dd></div>
            <div><dt>Победы</dt><dd>{driver.wins}</dd></div>
            <div><dt>Номер в сезоне</dt><dd>{displayNumber ?? '—'}</dd></div>
          </dl>
        </div>
          <div className="driver-profile-hero-number"><small>{usedNumbers.length > 1 ? 'Последний номер сезона' : 'Гоночный номер сезона'}</small><DriverNumberMark driverId={driver.id} season={season} number={displayNumber} /></div>
      </header>

      <nav className="driver-profile-subnav" aria-label="Разделы профиля" style={{ '--active-section': ['overview', 'biography', 'circuits', 'history'].indexOf(activeSection) } as CSSProperties}>
        {([['overview', 'Обзор'], ['biography', 'Биография'], ['circuits', 'География'], ['history', 'История сезонов']] as const).map(([id, label]) => <a className={activeSection === id ? 'is-active' : undefined} href={`#${id}`} aria-current={activeSection === id ? 'location' : undefined} onClick={(event) => navigateToSection(event, id)} key={id}><span>{label}</span></a>)}
      </nav>

      <section className="driver-profile-overview" id="overview" aria-label="Обзор показателей">
        <article className="driver-profile-panel driver-profile-season-card">
          <header><span>{seasonContextLabel}</span><h2>{season}</h2></header>
          <div className="driver-profile-position"><strong>{driver.position ?? '—'}</strong><span>место<br />в чемпионате</span></div>
          <dl><div><dt>Очки</dt><dd>{driver.points}</dd></div><div><dt>Победы</dt><dd>{driver.wins}</dd></div><div><dt>Трасс с победой</dt><dd>{driver.successfulCircuits.length}</dd></div></dl>
          <Link className="driver-profile-season-atlas" href={`/?season=${season}#season`}>Открыть сезон в атласе <span>↗</span></Link>
        </article>

        <article className="driver-profile-panel driver-profile-career-card">
          <header><span>Сводка по базе</span><h2>Карьера</h2></header>
          <dl><div><dt>Сезонов</dt><dd>{orderedHistory.length}</dd></div><div><dt>Победы</dt><dd>{totals.wins}</dd></div><div><dt>Очки</dt><dd>{totals.points}</dd></div><div><dt>Лучшее место</dt><dd>{bestPosition ?? '—'}</dd></div><div><dt>Первый сезон</dt><dd>{debutSeason ?? '—'}</dd></div><div><dt>Последний сезон</dt><dd>{orderedHistory[0]?.season ?? '—'}</dd></div></dl>
        </article>

        <article className="driver-profile-panel driver-profile-team-card">
          <header><span>Сезон {season}</span><h2>Команда</h2></header>
          {driver.team ? <><div className="driver-profile-team-identity"><TeamLogo constructorId={driver.team.id} constructorName={driver.team.name} season={season} logoUrl={driver.team.logoUrl} /><strong>{driver.team.name}</strong></div><p>Команда пилота в выбранном сезоне</p><Link href={`/teams/${driver.team.id}?season=${season}`}>Профиль команды <span>→</span></Link></> : <p>Команда не указана в загруженном наборе данных</p>}
        </article>
      </section>

      <section className="driver-profile-section driver-profile-biography" id="biography">
        <header><div><span>Личная информация</span><h2>Биография</h2></div><p>Проверенные биографические сведения о пилоте</p></header>
        <div className="driver-profile-biography-scene">
          <article className="driver-profile-biography-story">
            <header><span>Карьерный портрет</span><strong>{debutSeason && lastRecordedSeason ? `${debutSeason}—${lastRecordedSeason}` : 'Период уточняется'}</strong></header>
            <p className={driver.biography ? undefined : 'is-pending'}>{driver.biography ?? 'Редакционная биография ещё не опубликована. До проверки источников здесь остаются только структурированные сведения из базы результатов.'}</p>
            <ol className="driver-profile-biography-milestones" aria-label="Ключевые показатели карьеры">
              <li><small>Первая запись</small><strong>{debutSeason ?? '—'}</strong></li>
              <li><small>Лучший итог</small><strong>{bestPosition ? `№ ${bestPosition}` : '—'}</strong></li>
              <li><small>Титулы</small><strong>{driver.careerTitles}</strong></li>
              <li><small>Последняя запись</small><strong>{lastRecordedSeason ?? '—'}</strong></li>
            </ol>
          </article>
          <aside className="driver-profile-biography-passport" aria-label="Паспорт пилота">
            <div className="driver-profile-biography-origin"><DriverFlag driverId={driver.id} /><div><small>Национальность</small><strong>{nationality}</strong></div></div>
            <dl>
              <div><dt>Дата рождения</dt><dd>{formattedBirthDate ?? 'Не указана'}</dd></div>
              {!validDeathDate ? <div><dt>Возраст</dt><dd>{age === null ? 'Не указан' : `${age} ${yearLabel(age)}`}</dd></div> : null}
              <div><dt>Место рождения</dt><dd>{driver.birthPlace ?? 'Не указано'}</dd></div>
              {formattedDeathDate ? <div><dt>Дата смерти</dt><dd>{formattedDeathDate}{age === null ? '' : ` (${age} ${yearLabel(age)})`}</dd></div> : null}
              <div><dt>Рост</dt><dd>{driver.heightCm ? `${driver.heightCm} см` : 'Не указан'}</dd></div>
              <div><dt>Вес</dt><dd>{driver.weightKg ? `${driver.weightKg} кг` : 'Не указан'}</dd></div>
            </dl>
            <p>Незаполненные поля не заменяются предположениями</p>
          </aside>
        </div>
        {driver.nicknames?.length ? <div className="driver-profile-editorial-block">
          <header><span>Имена, оставшиеся в истории</span><h3>Прозвища</h3></header>
          <div className="driver-profile-nicknames">{driver.nicknames.map((nickname) => <article key={nickname.id}>
            <strong>«{nickname.nameRu}»</strong>
            {nickname.nameOriginal ? <span>{nickname.nameOriginal}</span> : null}
            {nickname.contextRu ? <p>{nickname.contextRu}</p> : null}
            <a href={nickname.sourceUrl} target="_blank" rel="noreferrer">Источник ↗</a>
          </article>)}</div>
        </div> : null}
        {driver.quotes?.length ? <div className="driver-profile-editorial-block">
          <header><span>Слова пилота и о пилоте</span><h3>Цитаты</h3></header>
          <div className="driver-profile-quotes">{driver.quotes.map((quote) => <figure key={quote.id}>
            <blockquote>«{quote.quoteRu}»</blockquote>
            <figcaption><strong>{quote.attributionRu}</strong>{quote.quoteDate ? <time dateTime={quote.quoteDate}>{new Intl.DateTimeFormat('ru-RU', { dateStyle: 'long', timeZone: 'UTC' }).format(new Date(`${quote.quoteDate}T00:00:00Z`))}</time> : null}</figcaption>
            {quote.contextRu ? <p>{quote.contextRu}</p> : null}
            {quote.quoteOriginal ? <details><summary>Оригинальный текст</summary><p>{quote.quoteOriginal}</p></details> : null}
            <a href={quote.sourceUrl} target="_blank" rel="noreferrer">Источник ↗</a>
          </figure>)}</div>
        </div> : null}
      </section>

      <section className="driver-profile-section" id="circuits">
        <header><div><span>География результатов</span><h2>Атлас карьеры</h2></div><p>Сравнивайте победы, подиумы, этапы и очки по трассам. Карта и рейтинг используют один выбранный показатель</p></header>
        <DriverResultsMap points={driver.resultGeography} color={driver.team?.color ?? (driver.team ? driverTeamColors[driver.team.id] : null) ?? '#738795'} />
      </section>

      <section className="driver-profile-section" id="history">
        <header><div><span>Результаты по годам</span><h2>История сезонов</h2></div><p>{orderedHistory.length > 0 ? `${orderedHistory.length} ${orderedHistory.length === 1 ? 'сезон' : orderedHistory.length < 5 ? 'сезона' : 'сезонов'} в текущей базе` : 'История сезонов пока не загружена'}</p></header>
        {numberEntries.length > 0 ? <details className="driver-number-events">
          <summary><span>Номера по этапам сезона {season}</span><strong>{usedNumbers.map((number) => `№ ${number}`).join(' · ')}</strong></summary>
          <div role="table" aria-label={`Гоночные номера по этапам сезона ${season}`}>
            <div className="driver-number-event is-header" role="row"><span role="columnheader">Этап</span><span role="columnheader">Гран-при</span><span role="columnheader">Команда</span><span role="columnheader">Номер</span></div>
            {numberEntries.map((entry) => <div className="driver-number-event" role="row" key={`${entry.raceId}-${entry.team?.id ?? 'none'}-${entry.number}`}><span role="cell">{entry.round}</span><span role="cell">{entry.raceName}</span><span role="cell">{entry.team?.name ?? '—'}</span><strong role="cell">{entry.number}</strong></div>)}
          </div>
        </details> : null}
        {orderedHistory.length > 0 ? <><ol className={`driver-profile-season-journey${showAllSeasons ? ' is-expanded' : ' is-collapsed'}`} aria-label="История результатов пилота">
          {orderedHistory.map((standing, index) => {
            const teams = standing.teams.length ? [...new Set(standing.teams.map((team) => team.name))].join(', ') : 'Команда не указана';
            const numbers = standing.numbers?.length ? standing.numbers.map((number) => `№ ${number}`).join(' · ') : 'Номер не указан';
            const seasonLabel = standing.position === 1
              ? 'Чемпионский сезон'
              : standing.wins > 0
                ? 'Победный сезон'
                : standing.position === null
                  ? 'Итог не загружен'
                  : `Место в чемпионате — ${standing.position}`;
            const hiddenWhileCollapsed = !showAllSeasons && index >= 5;
            return <li className={index === 0 ? 'is-latest' : undefined} id={`driver-season-${standing.season}`} aria-hidden={hiddenWhileCollapsed || undefined} key={standing.season}>
              <Link className="driver-profile-season-link" href={`/?season=${standing.season}#season`} onClick={() => rememberSeasonPosition(standing.season)} tabIndex={hiddenWhileCollapsed ? -1 : undefined} aria-label={`Открыть сезон ${standing.season} в атласе`}>
                <div className="driver-profile-season-index"><time dateTime={String(standing.season)}>{standing.season}</time><span>{seasonLabel}</span></div>
                <div className="driver-profile-season-story">
                <div className="driver-profile-season-team"><small>{standing.teams.length > 1 ? 'Команды сезона' : 'Команда сезона'}</small><strong>{teams}</strong><span>{numbers}</span></div>
                <dl>
                  <div><dt>Место</dt><dd>{standing.position ?? '—'}</dd></div>
                  <div><dt>Очки</dt><dd>{standing.points}</dd></div>
                  <div><dt>Победы</dt><dd>{standing.wins}</dd></div>
                </dl>
                </div>
                <span className="driver-profile-season-atlas-link">Сезон в атласе <i>↗</i></span>
              </Link>
            </li>;
          })}
        </ol>{orderedHistory.length > 5 ? <button className="driver-profile-history-toggle" type="button" aria-expanded={showAllSeasons} onClick={() => setShowAllSeasons((value) => !value)}><span>{showAllSeasons ? 'Свернуть историю' : `Показать все сезоны · ${orderedHistory.length}`}</span><i aria-hidden="true">{showAllSeasons ? '↑' : '↓'}</i></button> : null}</> : <p className="driver-profile-empty">История сезонов пока не загружена</p>}
      </section>
      <p className="driver-profile-data-note">Показатели отражают последний загруженный срез базы и могут измениться после следующего обновления</p>
    </main>
  );
}

export function TeamProfile({ season, team, lineages = [] }: { season: number; team: TeamCatalogItem; lineages?: TeamListItem['lineages'] }) {
  const [showAllSeasons, setShowAllSeasons] = useState(false);
  const history = [...team.seasonHistory].sort((a, b) => b.season - a.season);
  const totals = history.reduce((result, row) => ({ points: result.points + row.points, wins: result.wins + row.wins }), { points: 0, wins: 0 });
  const titles = history.filter((row) => row.position === 1).length;
  const bestPosition = history.length ? Math.min(...history.map((row) => row.position)) : null;
  const firstSeason = history.at(-1)?.season ?? null;
  const color = team.color ?? driverTeamColors[team.id] ?? '#738795';
  const nationalities: Record<string, string> = { Austrian: 'Австрия', British: 'Великобритания', French: 'Франция', German: 'Германия', Italian: 'Италия', Swiss: 'Швейцария', American: 'США' };
  const nationality = team.nationality ? nationalities[team.nationality] ?? team.nationality : null;

  return <main className="team-profile-page" style={{ '--team-profile-color': color } as CSSProperties}>
    <Breadcrumbs items={[{ label: 'Главная', href: '/' }, { label: 'Команды', href: '/teams' }, { label: team.name }]} />
    <header className="team-profile-hero">
      <FavoriteToggle type="team" id={team.id} label="команду" />
      <div className="team-profile-intro"><span>Команда Formula 1 · сезон {season}</span><div className="team-profile-title"><TeamLogo constructorId={team.id} constructorName={team.name} teamColor={color} season={season} logoUrl={team.logoUrl} /><h1>{team.name}</h1></div>{nationality ? <p>{nationality}</p> : null}<dl><div><dt>Позиция</dt><dd>{team.position}</dd></div><div><dt>Очки</dt><dd>{team.points}</dd></div><div><dt>Победы</dt><dd>{team.wins}</dd></div><div><dt>Пилоты</dt><dd>{team.driverCount}</dd></div></dl></div>
      <div className="team-profile-hero-car"><TeamCar season={season} constructorId={team.id} constructorName={team.name} carImageUrl={team.carImageUrl} /><small>{team.carModel ?? team.engineName ?? `Болид сезона ${season}`}</small></div>
    </header>

    <section className="team-profile-facts" aria-label="Факты о команде"><div><span>Сезонов в базе</span><strong>{history.length}</strong></div><div><span>Лучшее место</span><strong>{bestPosition ?? '—'}</strong></div><div><span>Титулы</span><strong>{titles}</strong></div><div><span>Победы</span><strong>{totals.wins}</strong></div><div><span>Первый сезон</span><strong>{firstSeason ?? '—'}</strong></div></section>

    <section className="team-profile-roster-scene" aria-labelledby="team-roster-title">
      <div className="team-profile-roster">
        <header><span>Состав сезона</span><h2 id="team-roster-title">Пилоты {season}</h2></header>
        <div>{team.drivers.length ? team.drivers.map((driver) => <Link href={`/drivers/${driver.id}`} key={driver.id}><div className="team-profile-driver-photo"><DriverPortrait driverId={driver.id} name={driver.nameRu} /></div><div><small>{driver.position ? `№ ${driver.position} в чемпионате` : 'Позиция не указана'}</small><strong>{driver.nameRu}</strong><span>{driver.points} очков · вклад команды {driver.teamPoints}</span></div></Link>) : <p>Состав сезона пока не загружен</p>}</div>
      </div>
      <aside className="team-profile-season-story">
        <span>Сезонный срез</span><p>{season}</p><div className="team-profile-season-position"><strong>{team.position}</strong><span>место в Кубке<br />конструкторов</span></div>
        <dl><div><dt>Очки</dt><dd>{team.points}</dd></div><div><dt>Победы</dt><dd>{team.wins}</dd></div><div><dt>Пилоты</dt><dd>{team.driverCount}</dd></div></dl>
        <small>{team.carModel ?? team.engineName ?? 'Модель болида и двигатель не подтверждены'}</small>
      </aside>
    </section>

    <section className="team-profile-section" id="team-circuits"><header><div><span>География результатов</span><h2>Успешные трассы</h2></div><p>Трассы, на которых команда побеждала в доступном наборе результатов</p></header>{team.successfulCircuits.length ? <div className="team-profile-circuits">{team.successfulCircuits.map((circuit, index) => { const content = <><small>{String(index + 1).padStart(2, '0')}</small><div><strong>{circuit.name}</strong><span>{circuit.wins} побед</span></div><b>↗</b></>; return circuit.isPublished && circuit.slug ? <Link href={`/circuits/${circuit.slug}`} key={circuit.id}>{content}</Link> : <div key={circuit.id}>{content}</div>; })}</div> : <p className="team-profile-empty">В загруженном наборе результатов побед пока нет</p>}</section>
    <TeamLineageSection lineages={lineages} />
    <section className="team-profile-section" id="team-history"><header><div><span>Результаты по годам</span><h2>История сезонов</h2></div><p>{history.length} сезонов в текущей базе</p></header>{history.length ? <><ol className={`team-profile-season-journey${showAllSeasons ? ' is-expanded' : ' is-collapsed'}`} aria-label="История результатов команды">{history.map((row, index) => {
      const seasonLabel = row.position === 1 ? 'Чемпионский сезон' : row.wins > 0 ? 'Победный сезон' : row.position === null ? 'Итог не загружен' : `Место в Кубке — ${row.position}`;
      const hiddenWhileCollapsed = !showAllSeasons && index >= 5;
      return <li className={index === 0 ? 'is-latest' : undefined} aria-hidden={hiddenWhileCollapsed || undefined} key={`${row.season}-${row.name}`}><Link className="team-profile-season-link" href={`/?season=${row.season}#season`} tabIndex={hiddenWhileCollapsed ? -1 : undefined} aria-label={`Открыть сезон ${row.season} в атласе`}><div className="team-profile-season-index"><time dateTime={String(row.season)}>{row.season}</time><span>{seasonLabel}</span></div><div className="team-profile-season-entry"><div><small>Название в сезоне</small><strong>{row.name}</strong></div><dl><div><dt>Место</dt><dd>{row.position ?? '—'}</dd></div><div><dt>Очки</dt><dd>{row.points}</dd></div><div><dt>Победы</dt><dd>{row.wins}</dd></div></dl><span className="team-profile-season-atlas">Сезон в атласе <i>↗</i></span></div></Link></li>;
    })}</ol>{history.length > 5 ? <button className="team-profile-history-toggle" type="button" aria-expanded={showAllSeasons} onClick={() => setShowAllSeasons((value) => !value)}><span>{showAllSeasons ? 'Свернуть историю' : `Показать все сезоны · ${history.length}`}</span><i aria-hidden="true">{showAllSeasons ? '↑' : '↓'}</i></button> : null}</> : <p className="team-profile-empty">История сезонов пока не загружена</p>}</section>
    <p className="team-profile-note">Показатели отражают последний загруженный срез базы; адреса, технические характеристики и персоналии не отображаются, пока для них нет подтверждённых данных</p>
  </main>;
}

export function TeamLineageSection({ lineages = [] }: { lineages?: TeamListItem['lineages'] }) {
  if (!lineages.length) return null;
  return <section className="team-profile-section" id="team-lineage">
    <header><div><span>Проверенная история</span><h2>Преемственность команды</h2></div><p>Связи не объединяют статистику разных команд</p></header>
    <div className="team-profile-lineages">{lineages.map((link) => <article key={`${link.direction}-${link.teamId}-${link.validFromYear ?? 'all'}`}>
      <small>{link.direction === 'predecessor' ? 'Предшественник' : 'Преемник'}</small>
      <h3><Link href={`/teams/${link.teamId}`}>{link.teamName}</Link></h3>
      <p>{link.descriptionRu ?? 'Подтверждённая связь идентичностей команды'}</p>
      <footer><span>{link.validFromYear ? `${link.validFromYear}${link.validToYear && link.validToYear !== link.validFromYear ? `–${link.validToYear}` : ''}` : 'Период не указан'}</span><a href={link.sourceUrl} target="_blank" rel="noreferrer">Источник ↗</a></footer>
    </article>)}</div>
  </section>;
}
