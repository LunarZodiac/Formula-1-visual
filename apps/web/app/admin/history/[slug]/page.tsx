import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { getAdminSession } from '../../../lib/admin-auth';
import { getAdminHistoryEra, isAdminDatabaseConfigured } from '../../../lib/admin-database';
import { removeHistoryEraBlock, saveHistoryEra, saveHistoryEraBlock } from '../../actions';

const statusOptions = [
  ['draft', 'Черновик'],
  ['review', 'На проверке'],
  ['published', 'Опубликован'],
] as const;

const blockTypeOptions = [
  ['text', 'Текст'],
  ['media', 'Медиа'],
  ['quote', 'Цитата'],
  ['timeline', 'Хронология'],
] as const;

const mediaPositionOptions = [
  ['left', 'Слева'],
  ['right', 'Справа'],
  ['wide', 'На всю ширину'],
] as const;

function StatusSelect({ name, value }: { name: string; value: string }) {
  return <select name={name} defaultValue={value}>{statusOptions.map(([option, label]) => <option value={option} key={option}>{label}</option>)}</select>;
}

export default async function AdminHistoryEraPage({ params, searchParams }: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ saved?: string; deleted?: string; error?: string; syncError?: string }>;
}) {
  if (!await getAdminSession()) redirect('/admin/login');
  if (!isAdminDatabaseConfigured()) redirect('/admin/overview');
  const [{ slug }, state] = await Promise.all([params, searchParams]);
  const detail = await getAdminHistoryEra(slug).catch(() => null);
  if (!detail) notFound();
  const { era, blocks } = detail;

  return <main className="admin-shell"><section className="admin-edit-panel">
    <Link className="admin-back-link" href="/admin/history">← Вернуться к эпохам</Link>
    <header><div><span className="admin-kicker">Эпоха чемпионата</span><h1>{era.titleRu}</h1><p>{era.yearsLabel} · {blocks.length} блоков</p></div><code>{era.slug}</code></header>
    {state.saved === 'era' ? <div className="admin-alert is-success">Основные поля эпохи сохранены</div> : null}
    {state.saved === 'block' ? <div className="admin-alert is-success">Блок сохранён</div> : null}
    {state.deleted ? <div className="admin-alert is-success">Блок удалён</div> : null}
    {state.syncError ? <div className="admin-alert is-error">Запись сохранена в базе, но публичный экспорт не обновлён</div> : null}
    {state.error ? <div className="admin-alert is-error">Не удалось сохранить изменения. Проверьте обязательные поля</div> : null}

    <form action={saveHistoryEra} className="admin-editor-form">
      <input type="hidden" name="slug" value={era.slug} />
      <fieldset><legend>Основная запись</legend><div className="admin-form-grid">
        <label><span>Начальный год</span><input value={era.startYear} readOnly /></label>
        <label><span>Конечный год</span><input value={era.endYear ?? 'наши дни'} readOnly /></label>
        <label className="is-wide"><span>Подпись периода</span><input name="yearsLabel" defaultValue={era.yearsLabel} required /></label>
        <label className="is-wide"><span>Заголовок</span><input name="titleRu" defaultValue={era.titleRu} required /></label>
        <label className="is-wide"><span>Краткое описание</span><textarea name="summaryRu" rows={4} defaultValue={era.summaryRu} required /></label>
        <label><span>Главное изображение</span><input name="heroMediaAssetId" defaultValue={era.heroMediaAssetId ?? ''} placeholder="ID из медиатеки" /></label>
        <label><span>Статус</span><StatusSelect name="editorialStatus" value={era.editorialStatus} /></label>
      </div></fieldset>
      <div className="admin-form-actions"><span>Системный slug не изменяется</span><button type="submit">Сохранить эпоху</button></div>
    </form>

    <section className="admin-related-section"><header><div><span className="admin-kicker">Структура материала</span><h2>Редакционные блоки</h2></div><span>{blocks.length}</span></header>
      <div className="admin-editor-stack">{blocks.map((block, index) => <article className="admin-editor-card" key={block.id}><header><div><span className="admin-kicker">{String(index + 1).padStart(2, '0')} / {block.blockType}</span><h3>{block.titleRu || 'Без заголовка'}</h3></div><code>{block.id}</code></header>
        <form action={saveHistoryEraBlock} className="admin-editor-form">
          <input type="hidden" name="eraSlug" value={era.slug} /><input type="hidden" name="blockId" value={block.id} />
          <div className="admin-form-grid">
            <label><span>Порядок</span><input name="sortOrder" type="number" min="0" defaultValue={block.sortOrder} required /></label>
            <label><span>Тип</span><select name="blockType" defaultValue={block.blockType}>{blockTypeOptions.map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
            <label className="is-wide"><span>Служебная подпись</span><input name="eyebrowRu" defaultValue={block.eyebrowRu ?? ''} /></label>
            <label className="is-wide"><span>Заголовок</span><input name="titleRu" defaultValue={block.titleRu ?? ''} /></label>
            <label className="is-wide"><span>Текст</span><textarea name="bodyRu" rows={8} defaultValue={block.bodyRu ?? ''} /></label>
            <label><span>Положение медиа</span><select name="mediaPosition" defaultValue={block.mediaPosition}>{mediaPositionOptions.map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
            <label><span>ID медиафайла</span><input name="mediaAssetId" defaultValue={block.mediaAssetId ?? ''} placeholder="UUID или ID из медиатеки" /></label>
            <label className="is-wide"><span>URL источника</span><input name="sourceUrl" type="url" defaultValue={block.sourceUrl ?? ''} placeholder="https://…" /></label>
            <label><span>Статус</span><StatusSelect name="editorialStatus" value={block.editorialStatus} /></label>
          </div>
          <div className="admin-form-actions"><span>Блок {index + 1} из {blocks.length}</span><button type="submit">Сохранить блок</button></div>
        </form>
        <form action={removeHistoryEraBlock} className="admin-editor-form"><input type="hidden" name="eraSlug" value={era.slug} /><input type="hidden" name="blockId" value={block.id} /><div className="admin-form-actions"><span>Удаление необратимо</span><button type="submit">Удалить блок</button></div></form>
      </article>)}</div>
      {!blocks.length ? <p className="admin-directory-empty">Блоков пока нет</p> : null}

      <article className="admin-editor-card"><header><div><span className="admin-kicker">Новый блок</span><h3>Добавить раздел</h3></div></header><form action={saveHistoryEraBlock} className="admin-editor-form">
        <input type="hidden" name="eraSlug" value={era.slug} /><input type="hidden" name="blockId" value="" />
        <div className="admin-form-grid">
          <label><span>Порядок</span><input name="sortOrder" type="number" min="0" defaultValue={blocks.length ? Math.max(...blocks.map((block) => block.sortOrder)) + 10 : 10} required /></label>
          <label><span>Тип</span><select name="blockType" defaultValue="text">{blockTypeOptions.map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
          <label className="is-wide"><span>Служебная подпись</span><input name="eyebrowRu" /></label>
          <label className="is-wide"><span>Заголовок</span><input name="titleRu" /></label>
          <label className="is-wide"><span>Текст</span><textarea name="bodyRu" rows={8} /></label>
          <label><span>Положение медиа</span><select name="mediaPosition" defaultValue="right">{mediaPositionOptions.map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
          <label><span>ID медиафайла</span><input name="mediaAssetId" /></label>
          <label className="is-wide"><span>URL источника</span><input name="sourceUrl" type="url" placeholder="https://…" /></label>
          <label><span>Статус</span><StatusSelect name="editorialStatus" value="draft" /></label>
        </div><div className="admin-form-actions"><span>ID блока будет создан автоматически</span><button type="submit">Добавить блок</button></div>
      </form></article>
    </section>
  </section></main>;
}
