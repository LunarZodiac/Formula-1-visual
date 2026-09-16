/* eslint-disable @next/next/no-img-element */
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { getAdminSession } from '../../../../../lib/admin-auth';
import { getAdminTravelPoint, isAdminDatabaseConfigured } from '../../../../../lib/admin-database';
import { saveTravelPoint, uploadTravelPointPhoto } from '../../../../actions';

const groupLabels: Record<string, string> = { transport: 'Транспорт', stay: 'Размещение', explore: 'Достопримечательности', essential: 'Полезное рядом', circuit: 'Инфраструктура этапа' };

export default async function AdminTravelPointPage({ params, searchParams }: {
  params: Promise<{ circuitId: string; pointId: string }>;
  searchParams: Promise<{ saved?: string; photoSaved?: string; syncError?: string; error?: string }>;
}) {
  if (!await getAdminSession()) redirect('/admin/login');
  if (!isAdminDatabaseConfigured()) redirect('/admin/overview');
  const [{ circuitId, pointId }, state] = await Promise.all([params, searchParams]);
  const detail = await getAdminTravelPoint(circuitId, pointId).catch(() => null);
  if (!detail) notFound();
  const { point, categories } = detail;
  return <main className="admin-shell"><section className="admin-edit-panel admin-travel-point-editor">
    <Link className="admin-back-link" href={`/admin/travel/${encodeURIComponent(circuitId)}`}>← Вернуться к точкам</Link>
    <header><div><span className="admin-kicker">Туристическая точка · {point.circuitName}</span><h1>{point.nameRu ?? point.name}</h1></div><code>{point.id}</code></header>
    {state.saved === '1' ? <div className="admin-alert is-success">{state.syncError === '1' ? 'Точка сохранена в базе' : 'Точка сохранена, публичные данные обновлены'}</div> : null}
    {state.photoSaved === '1' ? <div className="admin-alert is-success">{state.syncError === '1' ? 'Фотография сохранена в медиатеке' : 'Фотография сохранена, публичные данные обновлены'}</div> : null}
    {state.error === 'photo' ? <div className="admin-alert is-error">Не удалось загрузить фотографию. Проверьте файл, источник и сведения о правах</div> : state.error ? <div className="admin-alert is-error">Не удалось сохранить. Проверьте поля и координаты</div> : null}
    <form action={saveTravelPoint} className="admin-editor-form">
      <input type="hidden" name="circuitId" value={circuitId} /><input type="hidden" name="id" value={point.id} />
      <fieldset><legend>Карточка точки</legend><div className="admin-form-grid">
        <label><span>Исходное название</span><input name="name" defaultValue={point.name} required /></label>
        <label><span>Название на русском</span><input name="nameRu" defaultValue={point.nameRu ?? ''} /></label>
        <label><span>Категория</span><select name="categoryId" defaultValue={point.categoryId}>{categories.map((category) => <option key={category.id} value={category.id}>{groupLabels[category.groupId] ?? category.groupId} · {category.name}</option>)}</select></label>
        <label><span>Группа на карте</span><select name="role" defaultValue={point.role}>{Object.entries(groupLabels).map(([value,label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <label className="is-wide"><span>Краткое описание</span><textarea name="descriptionRu" rows={5} defaultValue={point.descriptionRu ?? ''} /></label>
        <label className="is-wide"><span>Редакторская заметка</span><textarea name="editorialNoteRu" rows={3} defaultValue={point.editorialNoteRu ?? ''} /></label>
      </div></fieldset>
      <fieldset><legend>Адрес и координаты</legend><div className="admin-form-grid">
        <label><span>Широта</span><input name="latitude" type="number" step="any" min="-90" max="90" defaultValue={point.latitude} required /></label>
        <label><span>Долгота</span><input name="longitude" type="number" step="any" min="-180" max="180" defaultValue={point.longitude} required /></label>
        <label className="is-wide"><span>Адрес</span><input name="address" defaultValue={point.address ?? ''} /></label>
        <label><span>Сайт</span><input name="websiteUrl" type="url" defaultValue={point.websiteUrl ?? ''} /></label>
        <label><span>Часы работы</span><input name="openingHours" defaultValue={point.openingHours ?? ''} /></label>
      </div><p className="admin-field-note"><a href={`https://www.openstreetmap.org/?mlat=${point.latitude}&mlon=${point.longitude}#map=17/${point.latitude}/${point.longitude}`} target="_blank" rel="noreferrer">Проверить точку на OpenStreetMap ↗</a></p></fieldset>
      <fieldset><legend>Отбор и публикация</legend><div className="admin-form-grid">
        <label><span>Важность</span><input name="importance" type="number" min="0" max="100" defaultValue={point.importance} required /></label>
        <label><span>Приоритет для трассы</span><input name="priority" type="number" min="0" max="100" defaultValue={point.priority} required /></label>
        <label><span>Статус</span><select name="reviewStatus" defaultValue={point.reviewStatus}><option value="candidate">Кандидат</option><option value="reviewed">Проверена</option><option value="published">Опубликована</option><option value="hidden">Скрыта</option></select></label>
        <label className="admin-rights-confirmation"><input type="checkbox" name="isFeatured" value="yes" defaultChecked={point.isFeatured} /><span><strong>Показывать на публичной странице</strong><small>На сайт попадут только проверенные или опубликованные точки с источником</small></span></label>
      </div></fieldset>
      <fieldset><legend>Фотография</legend>{point.photo ? <div className="admin-travel-point-photo"><img src={point.photo.url} alt={point.photo.altTextRu ?? ''} /><div><strong>{point.photo.altTextRu ?? 'Подпись не заполнена'}</strong><span>{point.photo.reviewStatus} · {point.photo.rightsStatus}</span><Link href={`/admin/media/${encodeURIComponent(point.photo.id)}`}>Открыть материал →</Link></div></div> : <p className="admin-directory-empty">Фотография не привязана. Пустое место на публичной карточке не появится</p>}</fieldset>
      <div className="admin-form-actions"><span>{point.sourceUrl ? <a href={point.sourceUrl} target="_blank" rel="noreferrer">Источник: {point.sourceName ?? 'открыть'} ↗</a> : 'Источник не привязан'}</span><button type="submit">Сохранить точку</button></div>
    </form>
    <form id="photo-upload" action={uploadTravelPointPhoto} className="admin-editor-form admin-travel-photo-upload">
      <input type="hidden" name="circuitId" value={circuitId} /><input type="hidden" name="pointId" value={point.id} />
      <fieldset><legend>{point.photo ? 'Заменить фотографию' : 'Добавить фотографию'}</legend><div className="admin-form-grid">
        <label className="is-wide"><span>Файл фотографии</span><input name="photo" type="file" accept="image/jpeg,image/png,image/webp" required /><small>JPG, PNG или WebP, не больше 8 МБ. Для сайта автоматически создаются WebP 1280×720, 640×360 и 320×180</small></label>
        <label className="is-wide"><span>Описание для доступности</span><input name="photoAltTextRu" defaultValue={point.photo?.altTextRu ?? `${point.nameRu ?? point.name} — туристическая точка рядом с трассой`} required /></label>
        <label><span>Автор или правообладатель</span><input name="photoAuthor" required /></label>
        <label><span>Лицензия или разрешение</span><input name="photoLicence" placeholder="Например: CC BY-SA 4.0" required /></label>
        <label className="is-wide"><span>Страница источника</span><input name="photoSourceUrl" type="url" placeholder="https://…" required /></label>
        <label className="admin-rights-confirmation is-wide"><input type="checkbox" name="rightsConfirmed" value="yes" required /><span><strong>Права и источник проверены</strong><small>Материал будет зарегистрирован как проверенный и доступный для карточки и окна на карте</small></span></label>
      </div></fieldset>
      <div className="admin-form-actions"><span>Исходник сохраняется отдельно от оптимизированных версий</span><button type="submit">{point.photo ? 'Заменить фотографию' : 'Загрузить фотографию'}</button></div>
    </form>
  </section></main>;
}
