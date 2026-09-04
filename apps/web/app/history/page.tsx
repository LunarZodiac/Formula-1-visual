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
  return <main className="history-page">
    <nav className="page-breadcrumbs" aria-label="Хлебные крошки"><Link href="/">Главная</Link><span>›</span><b>История</b></nav>
    <header className="history-hero"><div><span>Хронология чемпионата</span><h1>История<br />Formula 1</h1><p>Путешествие от первого сезона к современной мировой серии — через географию календаря, трассы и данные</p></div><div className="history-orbit" aria-hidden="true"><i /><i /><i /><i /><i /></div></header>
    <section className="history-stats" aria-label="География чемпионата"><div><strong>{countries}</strong><span>стран</span></div></section>
    <nav className="history-era-nav" aria-label="Эпохи Formula 1">{eras.map(([years, title], index) => <a href={`#era-${index + 1}`} key={years}><b>{years}</b><span>{title}</span></a>)}</nav>
    <section className="history-timeline"><header><span>Наследие скорости</span><h2>Чемпионат сквозь десятилетия</h2><p>Эпохи служат навигацией по материалам атласа; границы не подменяют точную датировку событий</p></header><ol>{eras.map(([years, title, description], index) => { const dates = years.match(/\d{4}/g) ?? []; const start = Number(dates[0]); const end = dates[1] ? Number(dates[1]) : 2026; return <li id={`era-${index + 1}`} key={years}><div className="history-era-year"><span>{String(index + 1).padStart(2, '0')}</span><b>{years}</b></div><article><h3>{title}</h3><p>{description}</p><div><span>Сезоны в срезе</span><strong>{seasons.filter((item) => item.year >= start && item.year <= end).length}</strong></div></article></li>; })}</ol></section>
    <section className="history-explore"><header><span>История в данных</span><h2>Продолжить исследование</h2></header><div><Link href="/circuits"><b>01</b><strong>Трассы и география</strong><span>Контуры, страны и годы дебюта →</span></Link><Link href="/?season=2026#season"><b>02</b><strong>Сезоны</strong><span>Календарь и результаты →</span></Link><Link href="/drivers"><b>03</b><strong>{driversJson.drivers.length} пилота</strong><span>Состав текущего сезона →</span></Link><Link href="/teams"><b>04</b><strong>{teamsJson.teams.length} команд</strong><span>История участников →</span></Link></div></section>
  </main>;
}
