import { redirect } from 'next/navigation';
import { getAdminSession } from '../../lib/admin-auth';
import { isAdminLocalMediaConfigured } from '../../lib/admin-database';
import { isAdminSupabaseConfigured } from '../../lib/supabase-admin';
import { getDirectAdminGameLogos } from '../../lib/supabase-game-admin';
import { GameLogoForm } from './game-logo-form';

/* eslint-disable @next/next/no-img-element */

const games = [
  { id: 'outline' as const, title: 'Угадай трассу по контуру', note: 'Карточка распознавания конфигураций' },
  { id: 'map' as const, title: 'Найди трассу на карте', note: 'Карточка географического задания' },
  { id: 'driver-geography' as const, title: 'География пилотов', note: 'Карточка стран рождения пилотов' },
  { id: 'calendar-optimizer' as const, title: 'Оптимизатор календаря', note: 'Карточка логистической стратегии' },
];

export default async function AdminGamesPage({ searchParams }: { searchParams: Promise<{ saved?: string; syncError?: string; error?: string }> }) {
  if (!await getAdminSession()) redirect('/admin/login');
  const state = await searchParams;
  const isCloud = isAdminSupabaseConfigured();
  const canUpload = await isAdminLocalMediaConfigured();
  let logos: Awaited<ReturnType<typeof getDirectAdminGameLogos>> = {};
  let readError = false;
  if (isCloud) {
    try { logos = await getDirectAdminGameLogos(); }
    catch (error) { console.error('Не удалось загрузить логотипы игр из Supabase', error); readError = true; }
  }
  return <main className="admin-shell"><section className="admin-directory">
    <header><div><span className="admin-kicker">Пит-лейн знаний</span><h1>Мини-игры</h1></div><p>Загружайте логотипы для игровых карточек с обязательной информацией об источнике и правах</p></header>
    {state.saved ? <div className="admin-alert is-success">Логотип загружен в Supabase Storage и зарегистрирован в базе данных</div> : null}
    {state.syncError === '1' ? <div className="admin-alert">Логотип сохранён в Supabase, но локальный каталог игр не обновился. Проверьте журнал локального сервера</div> : null}
    {readError ? <div className="admin-alert is-error">Не удалось получить логотипы игр из Supabase</div> : null}
    {state.error ? <div className="admin-alert is-error">Не удалось сохранить логотип. Проверьте файл, предпросмотр и сведения об источнике</div> : null}
    <div className="admin-editor-stack">{games.map((game, index) => <article className="admin-editor-card" key={game.id}><header><div><span className="admin-kicker">{String(index + 1).padStart(2, '0')} / Игра</span><h2>{game.title}</h2></div><p>{game.note}</p></header>{canUpload ? <GameLogoForm gameId={game.id} title={game.title} initialLogo={logos[game.id] ?? null} useCloudData={isCloud} /> : <>{logos[game.id] ? <div className="admin-current-logo"><img src={logos[game.id].url} alt={logos[game.id].altTextRu} /><div><strong>Текущий логотип</strong><span>{logos[game.id].author} · {logos[game.id].licence}</span></div></div> : null}<div className="admin-alert">Загрузка доступна через локально запущенный редактор</div></>}</article>)}</div>
  </section></main>;
}
