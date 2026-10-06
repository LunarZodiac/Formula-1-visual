import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { getAdminSession } from '../../../../lib/admin-auth';
import { getAdminHistoryEra, getAdminMediaAsset, isAdminDatabaseConfigured } from '../../../../lib/admin-database';
import { isAdminSupabaseConfigured } from '../../../../lib/supabase-admin';
import { getDirectAdminHistoryMedia } from '../../../../lib/supabase-history-admin';
import storyStyles from '../../../../history/[slug]/history-era.module.css';
import styles from './preview.module.css';

type PreviewProps = { params: Promise<{ slug: string }> };

const statusLabels = {
  draft: 'Черновик',
  review: 'На проверке',
  published: 'Опубликован',
} as const;

export const dynamic = 'force-dynamic';
export const metadata: Metadata = {
  title: 'Предпросмотр эпохи — Редакция атласа',
  robots: { index: false, follow: false, noarchive: true },
};

export default async function AdminHistoryEraPreviewPage({ params }: PreviewProps) {
  if (!await getAdminSession()) redirect('/admin/login');
  if (!isAdminDatabaseConfigured()) redirect('/admin/overview');

  const { slug } = await params;
  const detail = await getAdminHistoryEra(slug).catch(() => null);
  if (!detail) notFound();

  const { era } = detail;
  const blocks = [...detail.blocks].sort((left, right) => left.sortOrder - right.sortOrder || left.id - right.id);
  const mediaIds = [...new Set(blocks.map((block) => block.mediaAssetId).filter((id): id is string => Boolean(id)))];
  const mediaEntries = await Promise.all(mediaIds.map(async (id) => [id,
    await (isAdminSupabaseConfigured() ? getDirectAdminHistoryMedia(id) : getAdminMediaAsset(id)).catch(() => null),
  ] as const));
  const mediaById = new Map(mediaEntries);

  return <main className={`history-era-page ${storyStyles.page} ${styles.preview}`}>
    <div className={styles.toolbar} role="status">
      <div><strong>Предпросмотр — не опубликовано</strong><span>Показаны все редакционные блоки, включая черновики и материалы на проверке</span></div>
      <Link href={`/admin/history/${encodeURIComponent(era.slug)}`}>← Вернуться к редактированию</Link>
    </div>

    <header className={storyStyles.hero}>
      <p className={storyStyles.kicker}>Эпоха · {statusLabels[era.editorialStatus]}</p>
      <h1 className={storyStyles.title}>{era.titleRu}</h1>
      <div className={storyStyles.heroSummary}><strong>{era.yearsLabel}</strong><p>{era.summaryRu}</p></div>
    </header>

    <article className={storyStyles.story}>
      {blocks.length ? blocks.map((block, index) => {
        const media = block.mediaAssetId ? mediaById.get(block.mediaAssetId) : null;
        const position = block.mediaPosition ?? (index % 2 === 0 ? 'right' : 'left');
        const hasCopy = Boolean(block.titleRu || block.bodyRu || block.eyebrowRu);
        const hasMedia = Boolean(block.mediaAssetId);
        const chapterClassName = [
          storyStyles.chapter,
          storyStyles[`position${position[0].toUpperCase()}${position.slice(1)}` as keyof typeof storyStyles],
          storyStyles[`type${block.blockType[0].toUpperCase()}${block.blockType.slice(1)}` as keyof typeof storyStyles],
          hasMedia && !hasCopy ? storyStyles.mediaOnly : '',
          !hasMedia ? storyStyles.copyOnly : '',
        ].filter(Boolean).join(' ');

        return <section className={chapterClassName} key={block.id}>
          {hasMedia ? media?.url ? <figure className={storyStyles.media}>
            <Image
              src={media.url}
              alt={media.altTextRu || block.titleRu || 'Иллюстрация эпохи'}
              fill
              unoptimized
              sizes={position === 'wide' || !hasCopy ? '(max-width: 760px) 100vw, 1240px' : '(max-width: 760px) 100vw, 55vw'}
            />
          </figure> : <div className={storyStyles.placeholder} role="img" aria-label="Медиафайл не найден"><span>{String(index + 1).padStart(2, '0')}</span><small>Медиафайл не найден</small></div> : null}
          {hasCopy ? <div className={storyStyles.copy}>
            <span className={storyStyles.eyebrow}>{block.eyebrowRu || `${String(index + 1).padStart(2, '0')} / ${String(blocks.length).padStart(2, '0')}`}</span>
            {block.titleRu ? <h2>{block.titleRu}</h2> : null}
            {block.bodyRu ? block.blockType === 'quote' ? <blockquote>{block.bodyRu}</blockquote> : <p>{block.bodyRu}</p> : null}
            <span className={styles.status}>{statusLabels[block.editorialStatus]}</span>
          </div> : <span className={styles.mediaStatus}>{statusLabels[block.editorialStatus]}</span>}
        </section>;
      }) : <p className={styles.empty}>В этой эпохе пока нет редакционных блоков</p>}
    </article>
  </main>;
}
