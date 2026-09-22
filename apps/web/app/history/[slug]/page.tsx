import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Breadcrumbs } from '../../components/breadcrumbs';
import { getHistoryEra, historyEras } from '../../data/history-eras';

type HistoryEraPageProps = { params: Promise<{ slug: string }> };

export function generateStaticParams() {
  return historyEras.map((era) => ({ slug: era.slug }));
}

export async function generateMetadata({ params }: HistoryEraPageProps): Promise<Metadata> {
  const era = getHistoryEra((await params).slug);
  return era ? { title: `${era.title}: ${era.years} — География скорости`, description: era.description } : {};
}

export default async function HistoryEraPage({ params }: HistoryEraPageProps) {
  const era = getHistoryEra((await params).slug);
  if (!era) notFound();
  const currentIndex = historyEras.findIndex((item) => item.slug === era.slug);
  const previous = historyEras[currentIndex - 1];
  const next = historyEras[currentIndex + 1];

  return <main className="history-era-page">
    <Breadcrumbs items={[{ label: 'Главная', href: '/' }, { label: 'История', href: '/history' }, { label: era.title }]} />
    <header className="history-era-hero">
      <p className="history-era-kicker">Эпоха {String(currentIndex + 1).padStart(2, '0')}</p>
      <h1>{era.title}</h1>
      <div><strong>{era.years}</strong><p>{era.description}</p></div>
    </header>

    <article className="history-era-story">
      <p className="history-era-lead">Страница подготовлена как редакционный каркас. Исторические факты, подписи и фотографии будут добавляться только вместе с источниками и сведениями о правах</p>
      {era.chapters.map((chapter, index) => <section className={`history-era-chapter history-era-chapter-${index + 1}`} key={chapter}>
        <div className="history-era-placeholder" role="img" aria-label={`Место для проверенной иллюстрации раздела «${chapter}»`}><span>{String(index + 1).padStart(2, '0')}</span><small>Иллюстрация и подпись</small></div>
        <div><span>{String(index + 1).padStart(2, '0')} / {String(era.chapters.length).padStart(2, '0')}</span><h2>{chapter}</h2><p>Содержательный блок будет собран из проверяемых событий, пространственных изменений и связанных материалов атласа. Такая структура позволяет чередовать текст с изображениями разного масштаба, не превращая страницу в сплошную статью</p></div>
      </section>)}
    </article>

    <nav className="history-era-pagination" aria-label="Навигация между эпохами">
      {previous ? <Link href={`/history/${previous.slug}`}><small>Предыдущая эпоха</small><b>{previous.title}</b></Link> : <span />}
      {next ? <Link href={`/history/${next.slug}`}><small>Следующая эпоха</small><b>{next.title}</b></Link> : <Link href="/history"><small>Вернуться</small><b>Все эпохи</b></Link>}
    </nav>
  </main>;
}
