import type { Metadata } from 'next';
import Link from 'next/link';
import circuitsJson from '../data/catalogs/circuits.json';
import driversJson from '../data/catalogs/drivers-2026.json';
import teamsJson from '../data/catalogs/teams-2026.json';
import seasonsJson from '../../public/data/f1/seasons.json';

export const metadata: Metadata = { title: 'История Formula 1 — География скорости', description: 'Хронология чемпионата и его географическое развитие по данным атласа' };

const eras = [
  ['1950 – 1959', 'Рождение чемпионата', 'Первые сезоны формируют календарь и язык нового мирового первенства'],
  ['1960 – 1979', 'Расширение географии', 'Чемпионат выходит за пределы исходного европейского ядра, а трассы и техника быстро меняются'],
  ['1980 – 1999', 'Глобальная серия', 'Календарь становится устойчиво международным, а команды превращаются в сложные инженерные организации'],
  ['2000 – 2013', 'Эпоха систем', 'Данные, безопасность и регламент всё сильнее определяют развитие машин и автодромов'],
  ['2014 – 2021', 'Гибридный поворот', 'Новая силовая архитектура меняет баланс эффективности, мощности и инженерной конкуренции'],
  ['2022 – наши дни', 'Современная эра', 'Новый технический цикл сочетается с самым широким географическим охватом календаря'],
] as const;

export default function HistoryPage() {
  const seasons = seasonsJson.seasons.filter((item) => item.year <= 2026);
  const countries = new Set(circuitsJson.circuits.map((item) => item.countryRu)).size;
  const availableRaces = seasons.reduce((total, item) => total + item.racesAvailable, 0);
  const updatedAt = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })
    .format(new Date(seasonsJson.sourceChangedAt));

  return <main className="history-page">
    <nav className="page-breadcrumbs" aria-label="Хлебные крошки"><Link href="/">Главная</Link><span>›</span><b>История</b></nav>
    <header className="history-hero"><div><span>Хронология чемпионата</span><h1>История<br />Formula 1</h1><p>Путешествие от первого сезона к современной мировой серии — через географию календаря, трассы и данные</p></div><div className="history-orbit" aria-hidden="true"><i /><i /><i /><i /><i /></div></header>
    <section className="history-stats" aria-label="Охват данных атласа">
      <div><strong>{seasons.length}</strong><span>сезонов с 1950 по 2026 год</span></div>
      <div><strong>{availableRaces.toLocaleString('ru-RU')}</strong><span>гонок в сезонных снимках</span></div>
      <div><strong>{circuitsJson.circuits.length}</strong><span>трасс в каталоге</span></div>
      <div><strong>{countries}</strong><span>стран в каталоге трасс</span></div>
    </section>
    <nav className="history-era-nav" aria-label="Эпохи Formula 1">{eras.map(([years, title], index) => <a href={`#era-${index + 1}`} key={years}><b>{years}</b><span>{title}</span></a>)}</nav>
    <section className="history-timeline"><header><span>Наследие скорости</span><h2>Чемпионат сквозь десятилетия</h2><p>Эпохи служат редакционной навигацией по материалам атласа и не заменяют точную датировку событий</p></header><ol>{eras.map(([years, title, description], index) => { const dates = years.match(/\d{4}/g) ?? []; const start = Number(dates[0]); const end = dates[1] ? Number(dates[1]) : 2026; const eraSeasons = seasons.filter((item) => item.year >= start && item.year <= end); return <li id={`era-${index + 1}`} key={years}><div className="history-era-year"><span>{String(index + 1).padStart(2, '0')}</span><b>{years}</b></div><article><div className="history-era-copy"><h3>{title}</h3><p>{description}</p><Link href={`/?season=${start}#season`}>Открыть сезон {start} →</Link></div><dl><div><dt>Сезонов</dt><dd>{eraSeasons.length}</dd></div><div><dt>Гонок в данных</dt><dd>{eraSeasons.reduce((total, item) => total + item.racesAvailable, 0)}</dd></div></dl></article></li>; })}</ol></section>
    <aside className="history-method-note" aria-labelledby="history-method-title">
      <span>Как читать хронологию</span>
      <div><h2 id="history-method-title">История опирается на доступные данные</h2><p>Сезон, этап, место проведения, трасса и её конфигурация учитываются как разные сущности. Количества на странице показывают охват текущего каталога, а не претендуют на полноту всей истории чемпионата</p></div>
      <div><b>Последнее изменение источника</b><strong>{updatedAt}</strong><Link href="/about#sources">Методика и источники →</Link></div>
    </aside>
    <section className="history-explore"><header><span>История в данных</span><h2>Продолжить исследование</h2></header><div><Link href="/circuits"><b>01</b><strong>Трассы и география</strong><span>Контуры, страны и годы дебюта →</span></Link><Link href="/?season=2026#season"><b>02</b><strong>Сезоны</strong><span>Календарь и результаты →</span></Link><Link href="/drivers"><b>03</b><strong>{driversJson.drivers.length} пилота</strong><span>Состав текущего сезона →</span></Link><Link href="/teams"><b>04</b><strong>{teamsJson.teams.length} команд</strong><span>История участников →</span></Link></div></section>
  </main>;
}
