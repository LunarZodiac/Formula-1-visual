'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState, type ReactNode } from 'react';
import { logoutAdmin } from './actions';

const items = [
  { href: '/admin/overview', label: 'Обзор', note: 'Состояние атласа', icon: '⌂' },
  { href: '/admin', label: 'Пилоты', note: 'Профили и фотографии', icon: '01' },
  { href: '/admin/seasons', label: 'Сезоны', note: 'Статус и число этапов', icon: '02' },
  { href: '/admin/events', label: 'Этапы и результаты', note: 'Календарь и сессии', icon: '03' },
  { href: '/admin/teams', label: 'Команды и болиды', note: 'Данные по сезонам', icon: '04' },
  { href: '/admin/games', label: 'Мини-игры', note: 'Логотипы и карточки', icon: '05' },
  { href: '/admin/history', label: 'История', note: 'Эпохи и редакционные блоки', icon: '06' },
  { href: '/admin/media', label: 'Медиатека', note: 'Файлы и права', icon: '07' },
  { href: '/admin/circuits', label: 'Трассы', note: 'Профили и конфигурации', icon: '08' },
  { href: '/admin/travel', label: 'Туристические данные', note: 'Точки, районы и маршруты', icon: '09' },
  { href: '/admin/database', label: 'Все таблицы', note: 'Схема PostgreSQL', icon: '10' },
];

function isCurrent(pathname: string, href: string) {
  if (href === '/admin') return pathname === '/admin' || pathname.startsWith('/admin/drivers/');
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function AdminNavigation({ email, children }: { email: string; children: ReactNode }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  return <div className="admin-workspace">
    <aside id="admin-sidebar" className={`admin-sidebar ${open ? 'is-open' : ''}`}>
      <div className="admin-sidebar-brand"><Link href="/admin/overview"><span>ГС</span><strong>Редакция атласа</strong></Link><button type="button" onClick={() => setOpen(false)} aria-label="Закрыть меню">×</button></div>
      <nav aria-label="Разделы админки">{items.map((item) => <Link key={item.href} href={item.href} onClick={() => setOpen(false)} className={isCurrent(pathname, item.href) ? 'is-active' : undefined} aria-current={isCurrent(pathname, item.href) ? 'page' : undefined}><b>{item.icon}</b><span><strong>{item.label}</strong><small>{item.note}</small></span></Link>)}</nav>
      <div className="admin-sidebar-account"><span>{email}</span><Link href="/">Открыть сайт ↗</Link><form action={logoutAdmin}><button type="submit">Выйти</button></form></div>
    </aside>
    {open ? <button className="admin-sidebar-backdrop" type="button" onClick={() => setOpen(false)} aria-label="Закрыть меню" /> : null}
    <div className="admin-workspace-content"><header className="admin-mobile-bar"><Link href="/admin/overview">Редакция атласа</Link><button type="button" onClick={() => setOpen(true)} aria-expanded={open} aria-controls="admin-sidebar">Меню</button></header>{children}</div>
  </div>;
}
