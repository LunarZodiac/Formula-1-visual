'use client';

import Image from 'next/image';
import Link from 'next/link';

const groups = [
  { title: 'Атлас', links: [['Трассы', '/circuits'], ['Пилоты', '/drivers'], ['Команды', '/teams'], ['Избранное', '/favorites']] },
  { title: 'Чемпионат', links: [['Сезон 2026', '/?season=2026#season'], ['Календарь', '/?season=2026#season'], ['Кубок конструкторов', '/teams']] },
  { title: 'Проект', links: [['История', '/history'], ['О проекте', '/about'], ['Поиск', '/search'], ['Методика', '/about#method']] },
] as const;

export function SiteFooter() {
  return <footer className="site-footer">
    <div className="site-footer-grid"><div className="site-footer-brand"><Link href="/"><Image src="/icon.svg" alt="" width={58} height={36} /><span><strong>География скорости</strong><small>Скорость • География • История</small></span></Link><p>Интерактивный атлас трасс, пилотов, команд и сезонов Formula 1</p></div>{groups.map((group) => <section key={group.title}><h2>{group.title}</h2><nav>{group.links.map(([label, href]) => <Link href={href} key={label}>{label}</Link>)}</nav></section>)}<section className="site-footer-contacts"><h2>Контакты</h2><div><span>Тут будет почта</span><span>Тут будет Telegram</span><span>Тут будут социальные сети</span></div></section></div>
  </footer>;
}
