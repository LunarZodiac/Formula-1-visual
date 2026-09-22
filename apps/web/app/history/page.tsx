import type { Metadata } from 'next';
import Link from 'next/link';
import circuitsJson from '../data/catalogs/circuits.json';
import seasonsJson from '../../public/data/f1/seasons.json';
import { Breadcrumbs } from '../components/breadcrumbs';
import { historyEras } from '../data/history-eras';

export const metadata: Metadata = { title: 'История Formula 1 — География скорости', description: 'Хронология чемпионата и его географическое развитие по данным атласа' };

export default function HistoryPage() {
  const seasons = seasonsJson.seasons.filter((item) => item.year <= 2026);
  const countries = new Set(circuitsJson.circuits.map((item) => item.countryRu)).size;
  const availableRaces = seasons.reduce((total, item) => total + item.racesAvailable, 0);
  return <main className="history-page">
    <Breadcrumbs items={[{ label: 'Главная', href: '/' }, { label: 'История' }]} />
    <header className="history-hero"><div><span>Хронология чемпионата</span><h1>История<br />Formula 1</h1><p>Путешествие от первого сезона к современной мировой серии — через географию календаря, трассы и данные</p></div><div className="history-orbit" aria-hidden="true"><i /><i /><i /><i /><i /></div></header>
    <section className="history-stats" aria-label="Охват данных атласа">
      <div><strong>{seasons.length}</strong><span>сезонов с 1950 по 2026 год</span></div>
      <div><strong>{availableRaces.toLocaleString('ru-RU')}</strong><span>гонок в сезонных снимках</span></div>
      <div><strong>{circuitsJson.circuits.length}</strong><span>трасс в каталоге</span></div>
      <div><strong>{countries}</strong><span>стран в каталоге трасс</span></div>
    </section>
    <nav className="history-era-nav" aria-label="Эпохи Formula 1">{historyEras.map((era) => <Link href={`/history/${era.slug}`} key={era.slug}><b>{era.years}</b><span>{era.title}</span></Link>)}</nav>
    <section className="history-timeline"><header><span>Наследие скорости</span><h2>Чемпионат сквозь десятилетия</h2><p>Каждая эпоха ведёт к отдельному редакционному материалу; интервалы помогают навигации и не заменяют точную датировку событий</p></header><ol>{historyEras.map((era, index) => { const eraSeasons = seasons.filter((item) => item.year >= era.startYear && item.year <= era.endYear); return <li id={`era-${index + 1}`} key={era.slug}><div className="history-era-year"><span>{String(index + 1).padStart(2, '0')}</span><b>{era.years}</b></div><article><div className="history-era-copy"><h3>{era.title}</h3><p>{era.description}</p><Link href={`/history/${era.slug}`}>Открыть эпоху →</Link></div><dl><div><dt>Сезонов</dt><dd>{eraSeasons.length}</dd></div><div><dt>Гонок в данных</dt><dd>{eraSeasons.reduce((total, item) => total + item.racesAvailable, 0)}</dd></div></dl></article></li>; })}</ol></section>
  </main>;
}
