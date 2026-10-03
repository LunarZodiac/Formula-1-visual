import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Breadcrumbs } from '../../components/breadcrumbs';
import { getHistoryEra, historyEras } from '../../data/history-eras';
import styles from './history-era.module.css';

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

  return <main className={`history-era-page ${styles.page}`}>
    <Breadcrumbs items={[{ label: 'Главная', href: '/' }, { label: 'История', href: '/history' }, { label: era.title }]} />
    <header className={styles.hero}>
      <p className={styles.kicker}>Эпоха {String(currentIndex + 1).padStart(2, '0')}</p>
      <h1 className={styles.title}>{era.title}</h1>
      <div className={styles.heroSummary}><strong>{era.years}</strong><p>{era.description}</p></div>
    </header>

    <article className={styles.story}>
      {era.blocks.length ? era.blocks.map((block, index) => {
        const position = block.mediaPosition ?? (index % 2 === 0 ? 'right' : 'left');
        const hasCopy = Boolean(block.titleRu || block.bodyRu || block.eyebrowRu);
        const chapterClassName = [
          styles.chapter,
          styles[`position${position[0].toUpperCase()}${position.slice(1)}` as keyof typeof styles],
          styles[`type${block.type[0].toUpperCase()}${block.type.slice(1)}` as keyof typeof styles],
          block.media && !hasCopy ? styles.mediaOnly : '',
          !block.media ? styles.copyOnly : '',
        ].filter(Boolean).join(' ');

        return <section className={chapterClassName} key={block.id}>
          {block.media ? <figure className={styles.media}>
            <Image
              src={block.media.url}
              alt={block.media.altTextRu}
              fill
              priority={index === 0}
              sizes={position === 'wide' || !hasCopy ? '(max-width: 760px) 100vw, 1240px' : '(max-width: 760px) 100vw, 55vw'}
            />
          </figure> : null}
          {hasCopy ? <div className={styles.copy}>
            <span className={styles.eyebrow}>{block.eyebrowRu || `${String(index + 1).padStart(2, '0')} / ${String(era.blocks.length).padStart(2, '0')}`}</span>
            {block.titleRu ? <h2>{block.titleRu}</h2> : null}
            {block.bodyRu ? block.type === 'quote' ? <blockquote>{block.bodyRu}</blockquote> : <p>{block.bodyRu}</p> : null}
          </div> : null}
        </section>;
      }) : <>
      <p className={styles.lead}>На странице пока нет опубликованных исторических материалов. Тексты и изображения появятся после проверки источников и сведений о правах.</p>
      {era.chapters.map((chapter, index) => <section className={`${styles.chapter} ${index % 2 === 0 ? styles.positionRight : styles.positionLeft}`} key={chapter}>
        <div className={styles.placeholder} role="img" aria-label={`Место для проверенной иллюстрации раздела «${chapter}»`}><span>{String(index + 1).padStart(2, '0')}</span><small>Иллюстрация и подпись</small></div>
        <div className={styles.copy}><span className={styles.eyebrow}>{String(index + 1).padStart(2, '0')} / {String(era.chapters.length).padStart(2, '0')}</span><h2>{chapter}</h2><p>Материал для этого раздела пока не опубликован. Текст и иллюстрации появятся после проверки источников и сведений о правах.</p></div>
      </section>)}</>}
    </article>

    <nav className={styles.pagination} aria-label="Навигация между эпохами">
      {previous ? <Link href={`/history/${previous.slug}`}><small>Предыдущая эпоха</small><b>{previous.title}</b></Link> : <span />}
      {next ? <Link href={`/history/${next.slug}`}><small>Следующая эпоха</small><b>{next.title}</b></Link> : <Link href="/history"><small>Вернуться</small><b>Все эпохи</b></Link>}
    </nav>
  </main>;
}
