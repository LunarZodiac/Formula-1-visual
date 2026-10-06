/* eslint-disable @next/next/no-img-element */
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { getAdminSession } from '../../../lib/admin-auth';
import { getAdminMediaAsset, isAdminDatabaseConfigured } from '../../../lib/admin-database';
import { isAdminSupabaseConfigured } from '../../../lib/supabase-admin';
import { updateMediaAsset } from '../../actions';

function formatBytes(value: number | null) {
  if (!value) return '—';
  if (value < 1024 * 1024) return `${Math.round(value / 1024)} КБ`;
  return `${(value / 1024 / 1024).toFixed(1)} МБ`;
}

export default async function AdminMediaAssetPage({ params, searchParams }: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ saved?: string; syncError?: string; error?: string }>;
}) {
  if (!await getAdminSession()) redirect('/admin/login');
  if (!isAdminDatabaseConfigured()) redirect('/admin/media');
  const { id } = await params;
  const state = await searchParams;
  let asset: Awaited<ReturnType<typeof getAdminMediaAsset>> = null;
  try { asset = await getAdminMediaAsset(id); }
  catch (error) {
    console.error('Не удалось открыть медиаматериал', error);
    return <main className="admin-shell"><div className="admin-alert is-error">База данных или медиареестр недоступны</div></main>;
  }
  if (!asset) notFound();
  return <main className="admin-shell"><section className="admin-edit-panel admin-media-editor">
    <Link className="admin-back-link" href="/admin/media">← Вернуться в медиатеку</Link>
    <header><div><span className="admin-kicker">Редактирование материала</span><h1>{asset.altTextRu || asset.id}</h1><p>{asset.entityType} · {asset.entityId}{asset.season ? ` · сезон ${asset.season}` : ''}</p></div><code>{asset.id}</code></header>
    {state.saved === '1' ? <div className="admin-alert is-success">Метаданные и статусы сохранены</div> : null}
    {state.syncError === '1' ? <div className="admin-alert">{isAdminSupabaseConfigured()
      ? 'Изменения сохранены в Supabase. Публичные каталоги обновятся после отдельной публикации данных'
      : 'Запись сохранена, но локальные публичные данные не синхронизированы'}</div> : null}
    {state.error ? <div className="admin-alert is-error">Не удалось сохранить материал. Для статусов «Проверено» и «Опубликовано» обязательны подтверждённые права, источник, автор, лицензия и описание</div> : null}
    <div className="admin-media-editor-preview">{asset.mediaType === 'image' ? <img src={asset.url} alt={asset.altTextRu ?? ''} /> : <a href={asset.url} target="_blank" rel="noreferrer">Открыть файл</a>}<div><span>Основной адрес</span><code>{asset.url}</code><span>Сущность</span><strong>{asset.entityType} · {asset.entityId}</strong><span>Сезон</span><strong>{asset.season ?? 'Без привязки'}</strong><span>Исходная запись</span><strong>{asset.dataSourceName || asset.sourceId || 'Не указана'}</strong></div></div>
    <form action={updateMediaAsset} className="admin-editor-form">
      <input type="hidden" name="id" value={asset.id} />
      <fieldset><legend>Описание и назначение</legend><div className="admin-form-grid">
        <label className="is-wide"><span>Описание для доступности</span><input name="altTextRu" defaultValue={asset.altTextRu ?? ''} /></label>
        <label><span>Назначение</span><input name="usageRole" defaultValue={asset.usageRole} required pattern="[a-z][a-z0-9_]*" /><small>Например: portrait, hero, gallery, history</small></label>
        <label><span>Области использования</span><input value={asset.usageScope.join(', ') || '—'} disabled /></label>
        <label><span>Автор или правообладатель</span><input name="author" defaultValue={asset.author ?? ''} /></label>
        <label><span>Лицензия или разрешение</span><input name="licence" defaultValue={asset.licence ?? ''} /></label>
        <label className="is-wide"><span>Страница-источник</span><input name="sourceUrl" type="url" defaultValue={asset.sourceUrl ?? ''} placeholder="https://…" /></label>
      </div></fieldset>
      <fieldset><legend>Права и публикация</legend><div className="admin-form-grid">
        <label><span>Статус прав</span><select name="rightsStatus" defaultValue={asset.rightsStatus}><option value="unresolved">Не проверены</option><option value="verified">Подтверждены</option><option value="restricted">Использование ограничено</option></select></label>
        <label><span>Редакционный статус</span><select name="reviewStatus" defaultValue={asset.reviewStatus}><option value="candidate">Кандидат</option><option value="reviewed">Проверено</option><option value="published">Опубликовано</option><option value="hidden">Скрыто</option></select></label>
      </div><p className="admin-field-note">Публикация разрешена только при подтверждённых правах и полностью заполненных сведениях. Статус «Скрыто» сохраняет файл и запись, но исключает материал из проверенных публичных выборок</p></fieldset>
      <div className="admin-form-actions"><span>Сам файл не изменяется</span><button type="submit">Сохранить материал</button></div>
    </form>
    <section className="admin-media-derivatives"><header><span className="admin-kicker">Подготовленные размеры</span><h2>Производные файлы</h2></header>{asset.derivatives.length ? <table><thead><tr><th>Вариант</th><th>Формат</th><th>Размер</th><th>Вес</th><th>Файл</th></tr></thead><tbody>{asset.derivatives.map((item) => <tr key={item.variant}><td>{item.variant}</td><td>{item.mimeType}</td><td>{item.width && item.height ? `${item.width}×${item.height}` : '—'}</td><td>{formatBytes(item.fileSize)}</td><td><a href={item.url} target="_blank" rel="noreferrer">Открыть ↗</a></td></tr>)}</tbody></table> : <p>Производные файлы ещё не создавались</p>}</section>
  </section></main>;
}
