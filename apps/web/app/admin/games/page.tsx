import { redirect } from 'next/navigation';
import { getAdminSession } from '../../lib/admin-auth';
import { GameLogoForm } from './game-logo-form';

const games = [
  { id: 'outline' as const, title: 'Угадай трассу по контуру', note: 'Карточка распознавания конфигураций' },
  { id: 'map' as const, title: 'Найди трассу на карте', note: 'Карточка географического задания' },
  { id: 'driver-geography' as const, title: 'География пилотов', note: 'Карточка стран рождения пилотов' },
  { id: 'calendar-optimizer' as const, title: 'Оптимизатор календаря', note: 'Карточка логистической стратегии' },
];

export default async function AdminGamesPage({ searchParams }: { searchParams: Promise<{ saved?: string; error?: string }> }) {
  if (!await getAdminSession()) redirect('/admin/login');
  const state = await searchParams;
  return <main className="admin-shell"><section className="admin-directory">
    <header><div><span className="admin-kicker">Пит-лейн знаний</span><h1>Мини-игры</h1></div><p>Загружайте логотипы для игровых карточек с обязательной информацией об источнике и правах</p></header>
    {state.saved ? <div className="admin-alert is-success">Логотип сохранён и появится на странице игр после обновления</div> : null}
    {state.error ? <div className="admin-alert is-error">Не удалось сохранить логотип. Проверьте файл, предпросмотр и сведения об источнике</div> : null}
    <div className="admin-editor-stack">{games.map((game, index) => <article className="admin-editor-card" key={game.id}><header><div><span className="admin-kicker">{String(index + 1).padStart(2, '0')} / Игра</span><h2>{game.title}</h2></div><p>{game.note}</p></header><GameLogoForm gameId={game.id} title={game.title} /></article>)}</div>
  </section></main>;
}
