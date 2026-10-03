import type { Metadata } from 'next';
import Link from 'next/link';
import circuitsJson from '../data/catalogs/circuits.json';
import driversJson from '../data/catalogs/drivers-2026.json';
import teamsJson from '../data/catalogs/teams-2026.json';
import { Breadcrumbs } from '../components/breadcrumbs';

export const metadata: Metadata = {
  title: 'О проекте — География скорости',
  description: 'Идея, методика и источники интерактивного атласа Formula 1',
};

const pipeline = [
  ['01', 'Сбор', 'Исходный ответ сохраняется снимком до изменения базы данных'],
  ['02', 'Нормализация', 'Названия и идентификаторы приводятся к единой структуре атласа'],
  ['03', 'Проверка', 'Импорт проходит транзакционно, затем запускаются автоматические аудиты'],
  ['04', 'Публикация', 'Для интерфейса собираются проверенные JSON и GeoJSON'],
] as const;

const entities = [
  ['01', 'Место проведения', 'Город и географическая точка, где проходит событие'],
  ['02', 'Трасса', 'Самостоятельный объект с названием, страной и историей'],
  ['03', 'Конфигурация', 'Конкретная геометрия трассы для выбранного периода'],
  ['04', 'Этап', 'Гоночный уик-энд в календаре определённого сезона'],
  ['05', 'Сезон', 'Последовательность этапов, участников и результатов'],
] as const;

export default function AboutPage() {
  const countries = new Set(circuitsJson.circuits.map((item) => item.countryRu)).size;
  return (
    <main className="project-page">
      <Breadcrumbs items={[{ label: 'Главная', href: '/' }, { label: 'О проекте' }]} />
      <header className="project-hero"><div><span>Исследовательский проект</span><h1>О проекте</h1><h2>Интерактивный атлас трасс, сезонов и участников Formula 1</h2><p>«География скорости» связывает трассы и места проведения с сезонами, пилотами, командами и результатами чемпионата. Поэтому географию календаря и спортивные данные можно изучать вместе</p></div><div className="project-map" aria-hidden="true"><i /><i /><i /><i /><i /><i /></div></header>
      <section className="project-stats" aria-label="Охват атласа"><div><strong>{circuitsJson.circuits.length}</strong><span>трасс в общем каталоге</span></div><div><strong>{countries}</strong><span>стран в каталоге трасс</span></div><div><strong>{driversJson.drivers.length}</strong><span>пилота сезона 2026</span></div><div><strong>{teamsJson.teams.length}</strong><span>команд сезона 2026</span></div></section>
      <section className="project-block project-pillars"><header><span>01</span><h2>Идея проекта</h2></header><div><article><b>◎</b><strong>Трассы и места</strong><p>Каждая трасса связана с местом, страной, конфигурацией и сезоном</p></article><article><b>◷</b><strong>Версии во времени</strong><p>Сезоны и версии объектов разделены по времени</p></article><article><b>▥</b><strong>Происхождение данных</strong><p>Показатели сопровождаются происхождением, статусом и датой проверки</p></article></div></section>
      <section className="project-block project-research"><header><span>02</span><h2>Связь с выпускной работой</h2></header><div><h3>Пространственное исследование данных</h3><p>Атлас служит практической частью ВКР: собирает сведения из источников в воспроизводимый набор данных, показывает связи на карте и хранит редакционные выводы отдельно от исходных записей</p></div><dl><div><dt>Данные</dt><dd>Снимки источников и контроль импорта</dd></div><div><dt>Метод</dt><dd>Сопоставление места, времени и результата</dd></div><div><dt>Форма</dt><dd>Интерактивная карта и связанные профили</dd></div></dl></section>
      <section className="project-block project-entities"><header><span>03</span><h2>Как связаны данные</h2></header><p className="project-lead">Атлас не смешивает географию, конфигурацию и спортивное событие. Это позволяет показывать одну трассу в разных сезонах и сохранять её исторические варианты</p><ol>{entities.map(([number, title, text]) => <li key={number}><b>{number}</b><strong>{title}</strong><p>{text}</p></li>)}</ol></section>
      <section className="project-block project-study"><header><span>04</span><h2>Что можно изучать</h2></header><div><Link href="/circuits"><span aria-hidden="true">01</span><strong>Трассы</strong><p>Контуры, параметры, карта и история конфигураций</p><em>Открыть раздел →</em></Link><Link href="/?season=2026#season"><span aria-hidden="true">02</span><strong>Сезоны</strong><p>Календарь, результаты и география чемпионата</p><em>Открыть сезон →</em></Link><Link href="/drivers"><span aria-hidden="true">03</span><strong>Пилоты</strong><p>Карьера, команды и спортивный срез сезона</p><em>Открыть раздел →</em></Link><Link href="/history"><span aria-hidden="true">04</span><strong>История</strong><p>Периоды календаря и изменения его географии по доступным данным</p><em>Открыть хронологию →</em></Link></div></section>
      <section className="project-block project-method" id="method"><header><span>05</span><h2>Как создаётся атлас</h2></header><ol>{pipeline.map(([number, title, text]) => <li key={number}><b>{number}</b><strong>{title}</strong><p>{text}</p></li>)}</ol></section>
      <section className="project-block project-sources" id="sources"><header><span>06</span><h2>Источники и ограничения</h2></header><div><article><strong>Спортивные данные</strong><p>Календарь, участники и результаты загружаются из Jolpica F1 API. Снимок сохраняется до импорта и сопровождается контрольной суммой</p><a href="https://api.jolpi.ca/ergast/f1/" target="_blank" rel="noreferrer">Jolpica F1 API ↗</a></article><article><strong>Картография</strong><p>PostgreSQL и PostGIS хранят точки, линии и конфигурации. Векторная подложка использует данные OpenStreetMap через OpenFreeMap</p><a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">Условия OpenStreetMap ↗</a></article><article><strong>Медиа и права</strong><p>Происхождение изображения, авторство и право использования фиксируются отдельно. Неподтверждённые материалы не считаются готовыми</p></article><article><strong>Статус материала</strong><p>Черновик означает, что сведения или медиа ещё требуют редакционной проверки. Отсутствующие факты не заменяются догадками</p></article></div></section>
    </main>
  );
}
