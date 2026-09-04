import type { Metadata } from 'next';
import Link from 'next/link';
import circuitsJson from '../data/catalogs/circuits.json';
import driversJson from '../data/catalogs/drivers-2026.json';
import teamsJson from '../data/catalogs/teams-2026.json';

export const metadata: Metadata = {
  title: 'О проекте — География скорости',
  description: 'Идея, методика и источники интерактивного атласа Formula 1',
};

const pipeline = [
  ['01', 'Сбор', 'Фиксируем источник, дату и область применимости'],
  ['02', 'Проверка', 'Отделяем подтверждённые факты от редакционных черновиков'],
  ['03', 'Геометрия', 'Храним трассы, конфигурации и места как разные сущности'],
  ['04', 'Публикация', 'Собираем проверенные JSON и GeoJSON для интерфейса'],
] as const;

export default function AboutPage() {
  const countries = new Set(circuitsJson.circuits.map((item) => item.countryRu)).size;
  return (
    <main className="project-page">
      <nav className="page-breadcrumbs" aria-label="Хлебные крошки"><Link href="/">Главная</Link><span>›</span><b>О проекте</b></nav>
      <header className="project-hero"><div><span>Исследовательский проект</span><h1>О проекте</h1><h2>Интерактивный атлас мира Formula 1</h2><p>«География скорости» объединяет места, время и результаты чемпионата. Здесь трассы, сезоны, пилоты и команды можно исследовать как связанную систему, а не набор отдельных карточек</p></div><div className="project-map" aria-hidden="true"><i /><i /><i /><i /><i /><i /></div></header>
      <section className="project-stats"><div><strong>{circuitsJson.circuits.length}</strong><span>трассы сезона 2026</span></div><div><strong>{countries}</strong><span>стран в каталоге</span></div><div><strong>{driversJson.drivers.length}</strong><span>пилота</span></div><div><strong>{teamsJson.teams.length}</strong><span>команд</span></div></section>
      <section className="project-block project-pillars"><header><span>01</span><h2>Идея проекта</h2></header><div><article><b>◎</b><strong>География в деталях</strong><p>Каждая трасса связана с местом, страной, конфигурацией и сезоном</p></article><article><b>◷</b><strong>История и контекст</strong><p>Данные читаются во времени и не смешивают разные эпохи и версии объектов</p></article><article><b>▥</b><strong>Данные и аналитика</strong><p>Показатели сопровождаются происхождением, статусом и датой проверки</p></article></div></section>
      <section className="project-block project-study"><header><span>02</span><h2>Что можно изучать</h2></header><div><Link href="/circuits"><b>⌁</b><strong>Трассы</strong><p>Контуры, параметры, карта и история конфигураций</p></Link><Link href="/?season=2026#season"><b>□</b><strong>Сезоны</strong><p>Календарь, результаты и география чемпионата</p></Link><Link href="/drivers"><b>◉</b><strong>Пилоты</strong><p>Карьера, команды и спортивный срез сезона</p></Link><Link href="/history"><b>⚑</b><strong>История</strong><p>Эпохи, ключевые изменения и развитие календаря</p></Link></div></section>
      <section className="project-block project-method" id="method"><header><span>03</span><h2>Как создаётся атлас</h2></header><ol>{pipeline.map(([number, title, text]) => <li key={number}><b>{number}</b><strong>{title}</strong><p>{text}</p></li>)}</ol></section>
      <section className="project-block project-sources" id="sources"><header><span>04</span><h2>Источники и ограничения</h2></header><div><article><strong>Спортивные данные</strong><p>Календарь, участники и результаты проходят импорт, нормализацию и автоматический аудит</p></article><article><strong>Картография</strong><p>PostgreSQL и PostGIS хранят точки, линии и конфигурации; GeoJSON используется как веб-снимок</p></article><article><strong>Медиа</strong><p>Происхождение изображения и право его использования фиксируются отдельно; неподтверждённые материалы не считаются готовыми</p></article><article><strong>Редакционный статус</strong><p>Неполные профили остаются черновиками, а отсутствующие факты не заменяются догадками</p></article></div></section>
      <section className="project-cta"><div><span>Готовы к путешествию?</span><h2>Откройте географию скорости</h2><p>Начните с карты трасс или найдите конкретный объект в едином индексе</p></div><nav><Link href="/#atlas">Открыть атлас →</Link><Link href="/search">Перейти к поиску</Link></nav></section>
    </main>
  );
}
