import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { getAdminSession } from '../../../lib/admin-auth';
import { getAdminCircuit, isAdminDatabaseConfigured } from '../../../lib/admin-database';
import { saveCircuit } from '../../actions';
import { CircuitCardImageForm } from './circuit-card-image-form';

const typeLabels = { permanent: 'Стационарная', street: 'Городская', hybrid: 'Гибридная', temporary: 'Временная' } as const;
const reviewLabels: Record<string, string> = { candidate: 'Кандидат', reviewed: 'Проверена', published: 'Опубликована', rejected: 'Отклонена' };

export default async function AdminCircuitPage({ params, searchParams }: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ saved?: string; cardImageSaved?: string; syncError?: string; error?: string }>;
}) {
  if (!await getAdminSession()) redirect('/admin/login');
  if (!isAdminDatabaseConfigured()) redirect('/admin/overview');
  const [{ id }, state] = await Promise.all([params, searchParams]);
  let circuit: Awaited<ReturnType<typeof getAdminCircuit>> = null;
  try { circuit = await getAdminCircuit(id); }
  catch (error) {
    console.error('Не удалось открыть трассу', error);
    return <main className="admin-shell"><div className="admin-alert is-error">Локальная база трасс недоступна</div></main>;
  }
  if (!circuit) notFound();
  const profile = circuit.profile;
  const draftSlug = circuit.id.toLowerCase().replace(/_/g, '-');
  return <main className="admin-shell"><section className="admin-edit-panel admin-circuit-editor">
    <Link className="admin-back-link" href="/admin/circuits">← Вернуться к трассам</Link>
    <header><div><span className="admin-kicker">Редактор трассы</span><h1>{profile?.nameRu ?? circuit.officialName}</h1><p>Справочная запись и публичный профиль редактируются вместе, конфигурации показаны отдельно</p></div><code>{circuit.id}</code></header>
    {state.saved === '1' ? <div className="admin-alert is-success">{state.syncError === '1' ? 'Трасса сохранена в локальной базе данных' : 'Трасса сохранена в базе, публичные каталоги обновлены'}</div> : null}
    {state.syncError === '1' ? <div className="admin-alert">Изменения сохранены в базе, но экспорт публичных данных завершился не полностью</div> : null}
    {state.error === 'card-image' ? <div className="admin-alert is-error">Не удалось сохранить изображение. Обновите предпросмотр и проверьте поля прав и источника</div> : state.error ? <div className="admin-alert is-error">Не удалось сохранить трассу. Проверьте обязательные поля, координаты, источник и условия публикации</div> : null}
    {state.cardImageSaved === '1' ? <div className="admin-alert is-success">Изображение карточки трассы сохранено{state.syncError === '1' ? ', но публичный каталог не удалось обновить' : ' и подключено к каталогу'}</div> : null}
    <form action={saveCircuit} className="admin-editor-form">
      <input type="hidden" name="id" value={circuit.id} />
      <fieldset><legend>Основная запись</legend><div className="admin-form-grid">
        <label><span>ID трассы</span><input value={circuit.id} disabled /><small>Системный ID защищён от изменения</small></label>
        <label><span>Официальное название</span><input name="officialName" defaultValue={circuit.officialName} required /></label>
        <label><span>Короткое название</span><input name="shortName" defaultValue={circuit.shortName ?? ''} /></label>
        <label><span>Населённый пункт</span><input name="locality" defaultValue={circuit.locality ?? ''} /></label>
        <label><span>Код страны</span><input name="countryCode" defaultValue={circuit.countryCode.toUpperCase()} minLength={2} maxLength={2} required /></label>
        <label><span>Тип трассы</span><select name="circuitType" defaultValue={circuit.circuitType}>{Object.entries(typeLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <label><span>Год открытия</span><input name="openedYear" type="number" min="1800" max={new Date().getUTCFullYear()} defaultValue={circuit.openedYear ?? ''} /></label>
        <label><span>Официальный сайт</span><input name="websiteUrl" type="url" defaultValue={circuit.websiteUrl ?? ''} placeholder="https://…" /></label>
      </div></fieldset>
      <fieldset><legend>Положение на карте</legend><div className="admin-form-grid">
        <label><span>Широта</span><input name="latitude" type="number" min="-90" max="90" step="any" defaultValue={circuit.latitude} required /></label>
        <label><span>Долгота</span><input name="longitude" type="number" min="-180" max="180" step="any" defaultValue={circuit.longitude} required /></label>
      </div><p className="admin-field-note">Это точка места проведения. Геометрия гоночной конфигурации хранится отдельно и здесь не изменяется. <a href={`https://www.openstreetmap.org/?mlat=${circuit.latitude}&mlon=${circuit.longitude}#map=15/${circuit.latitude}/${circuit.longitude}`} target="_blank" rel="noreferrer">Проверить на карте ↗</a></p></fieldset>
      <fieldset><legend>Публичная страница</legend><div className="admin-form-grid">
        <label><span>Адрес страницы</span><input name="slug" defaultValue={profile?.slug ?? draftSlug} pattern="[a-z0-9]+(?:-[a-z0-9]+)*" readOnly={Boolean(profile)} required /><small>{profile ? 'Адрес подключённого профиля защищён до перехода на динамический реестр страниц' : 'Латинские буквы, цифры и дефисы'}</small></label>
        <label><span>Основная конфигурация</span><select name="geometryId" defaultValue={profile?.geometryId ?? ''}><option value="">Не выбрана</option>{circuit.layouts.map((layout) => <option key={layout.id} value={layout.id}>{layout.name} · {reviewLabels[layout.reviewStatus] ?? layout.reviewStatus}</option>)}</select></label>
        <label><span>Название на русском</span><input name="nameRu" defaultValue={profile?.nameRu ?? circuit.officialName} required /></label>
        <label><span>Город на русском</span><input name="cityRu" defaultValue={profile?.cityRu ?? circuit.locality ?? ''} required /></label>
        <label><span>Страна на русском</span><input name="countryRu" defaultValue={profile?.countryRu ?? ''} required /></label>
        <label><span>Тип на русском</span><input name="circuitTypeRu" defaultValue={profile?.circuitTypeRu ?? ''} placeholder="Стационарная гоночная трасса" /></label>
        <label className="is-wide"><span>Краткое описание</span><textarea name="summaryRu" rows={5} defaultValue={profile?.summaryRu ?? ''} /></label>
        <label><span>Статус</span>{profile?.editorialStatus === 'published' ? <><input type="hidden" name="editorialStatus" value="published" /><select value="published" disabled><option value="published">Опубликована</option></select></> : <select name="editorialStatus" defaultValue={profile?.editorialStatus ?? 'draft'}><option value="draft">Черновик</option><option value="review">На проверке</option><option value="published">Опубликована</option></select>}<small>{profile?.editorialStatus === 'published' ? 'Снятие с публикации появится вместе с динамическим реестром страниц' : 'Публикация доступна только для подключённого шаблона и проверенной геометрии'}</small></label>
      </div></fieldset>
      <details className="admin-editor-disclosure" open={!profile?.sourceUrl && !circuit.websiteUrl}>
        <summary><span><strong>Источник и проверка изменений</strong><small>Ссылка, редакторская заметка и подтверждение фактов</small></span></summary>
        <fieldset><legend className="sr-only">Источник изменений</legend><div className="admin-form-grid">
          <label><span>Название источника</span><input name="sourceName" placeholder="Официальный сайт трассы" /></label>
          <label><span>URL источника</span><input name="sourceUrl" type="url" required defaultValue={profile?.sourceUrl ?? circuit.websiteUrl ?? ''} placeholder="https://…" /></label>
          <label className="is-wide"><span>Редакторская заметка</span><textarea name="sourceNotes" rows={3} placeholder="Что именно подтверждает источник" /></label>
          <label className="admin-rights-confirmation"><input type="checkbox" name="sourceVerified" value="yes" /><span><strong>Источник проверен</strong><small>Отметьте только если ссылка действительно подтверждает изменяемые факты. Иначе новые полевые источники сохранятся как кандидаты, а опубликованный профиль изменить нельзя</small></span></label>
        </div></fieldset>
      </details>
      <div className="admin-form-actions"><span>Координаты и факты сохраняются только вместе с источником</span><button type="submit">Сохранить трассу</button></div>
    </form>
    <CircuitCardImageForm circuitId={circuit.id} circuitName={profile?.nameRu ?? circuit.officialName} currentImage={circuit.cardImage} />
    <section className="admin-related-section"><header><div><span className="admin-kicker">Связанные сущности</span><h2>Конфигурации</h2><p>Параметры и периоды редактируются отдельно от трассы; геометрия пока защищена от изменения</p></div><Link className="admin-related-primary-action" href={`/admin/circuits/${encodeURIComponent(circuit.id)}/layouts/new`}>Добавить конфигурацию</Link></header>
      {circuit.layouts.length ? <div className="admin-table-wrap"><table><thead><tr><th>Конфигурация</th><th>Период</th><th>Параметры</th><th>Статус</th><th>Этапов</th><th>Источник</th><th /></tr></thead><tbody>{circuit.layouts.map((layout) => <tr key={layout.id}><td><strong>{layout.name}</strong><small><code>{layout.id}</code></small></td><td>{layout.validFromYear ?? '…'}–{layout.validToYear ?? '…'}</td><td>{layout.lengthM ? `${(layout.lengthM / 1000).toLocaleString('ru-RU')} км` : '—'}{layout.turns ? ` · ${layout.turns} поворотов` : ''}</td><td>{reviewLabels[layout.reviewStatus] ?? layout.reviewStatus}<small>{layout.provenanceType}</small></td><td>{layout.raceCount}</td><td>{layout.sourceUrl ? <a href={layout.sourceUrl} target="_blank" rel="noreferrer">Открыть ↗</a> : '—'}</td><td><Link href={`/admin/circuits/${encodeURIComponent(circuit.id)}/layouts/${encodeURIComponent(layout.id)}`}>Редактировать →</Link></td></tr>)}</tbody></table></div> : <p className="admin-directory-empty">Конфигурации ещё не добавлены</p>}
    </section>
    {profile ? <div className="admin-circuit-links"><Link href={`/admin/circuits/${encodeURIComponent(circuit.id)}/media`}>История и галерея →</Link>{profile.editorialStatus === 'published' ? <Link href={`/circuits/${encodeURIComponent(profile.slug)}`}>Открыть публичную страницу ↗</Link> : null}</div> : null}
  </section></main>;
}
