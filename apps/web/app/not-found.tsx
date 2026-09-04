import Link from 'next/link';

function RouteIcon({ type }: { type: 'home' | 'atlas' | 'circuits' }) {
  if (type === 'home') return <svg viewBox="0 0 48 48" aria-hidden="true"><path d="M7 23 24 8l17 15M12 20v20h10V28h4v12h10V20" /></svg>;
  if (type === 'atlas') return <svg viewBox="0 0 48 48" aria-hidden="true"><circle cx="24" cy="24" r="18" /><path d="M6 24h36M24 6c6 5 9 11 9 18s-3 13-9 18c-6-5-9-11-9-18s3-13 9-18Z" /></svg>;
  return <svg viewBox="0 0 48 48" aria-hidden="true"><path d="M9 35c4-8 7-12 13-12 7 0 7-11 15-11 4 0 6 3 5 6-2 8-12 7-14 13-2 7-9 9-14 8-4-1-7-2-5-4Z" /><circle cx="37" cy="15" r="3" /><circle cx="12" cy="35" r="3" /></svg>;
}

export default function NotFound() {
  return (
    <main className="not-found-page">
      <section className="not-found-content" aria-labelledby="not-found-title">
        <strong className="not-found-code" data-text="404" aria-hidden="true">404</strong>
        <h1 id="not-found-title">Вы свернули не туда</h1>
        <p>Такой страницы нет в нашем атласе.<br />Но впереди ещё много интересного</p>
        <nav className="not-found-actions" aria-label="Куда перейти">
          <Link href="/"><RouteIcon type="home" /><span>На главную</span><small>Начать сначала</small></Link>
          <Link className="is-primary" href="/#atlas"><RouteIcon type="atlas" /><span>Открыть атлас</span><small>Исследовать карту</small></Link>
          <Link href="/circuits"><RouteIcon type="circuits" /><span>Каталог трасс</span><small>Выбрать маршрут</small></Link>
        </nav>
      </section>
      <aside className="not-found-coordinates" aria-label="Координаты несуществующей страницы">
        <i aria-hidden="true" />
        <div><span>Точка вне маршрута</span><strong>Координаты не найдены</strong><small>0.0000° N · 0.0000° E</small></div>
      </aside>
    </main>
  );
}
