import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { getAdminSession } from '../../../lib/admin-auth';
import { getAdminDriver, isAdminDatabaseConfigured, isAdminLocalMediaConfigured } from '../../../lib/admin-database';
import { isAdminSupabaseConfigured } from '../../../lib/supabase-admin';
import { updateDriver } from '../../actions';
import { DriverPhotoForm } from './driver-photo-form';
import { DriverEditorialForm } from './driver-editorial-form';

const reviewLabels: Record<string, string> = {
  candidate: 'Требует проверки',
  reviewed: 'Проверено редактором',
  verified: 'Подтверждено источником',
  published: 'Опубликовано',
  rejected: 'Отклонено',
};

function formatTimestamp(value: string | null) {
  return value ? new Intl.DateTimeFormat('ru-RU', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)) : '—';
}

export default async function AdminDriverPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ saved?: string; editorialSaved?: string; photoSaved?: string; syncError?: string; error?: string }>;
}) {
  if (!await getAdminSession()) redirect('/admin/login');
  const { id } = await params;
  const state = await searchParams;
  const isCloud = isAdminSupabaseConfigured();
  const canUploadPhoto = await isAdminLocalMediaConfigured();
  if (!isAdminDatabaseConfigured()) {
    return <main className="admin-shell"><section className="admin-edit-panel">
      <Link className="admin-back-link" href="/admin">← Вернуться к пилотам</Link>
      <div className="admin-alert">Подключение к базе данных не настроено. Проверьте параметры Supabase или локального API</div>
    </section></main>;
  }

  let driver: Awaited<ReturnType<typeof getAdminDriver>> = null;
  try {
    driver = await getAdminDriver(id);
  } catch (error) {
    console.error('Не удалось открыть пилота в админке', error);
    return <main className="admin-shell"><section className="admin-edit-panel">
      <Link className="admin-back-link" href="/admin">← Вернуться к пилотам</Link>
      <div className="admin-alert is-error">Не удалось получить профиль пилота из базы данных. Проверьте подключение и журнал сервера</div>
    </section></main>;
  }
  if (!driver) notFound();

  return <main className="admin-shell">
    <section className="admin-edit-panel">
      <Link className="admin-back-link" href="/admin">← Вернуться к пилотам</Link>
      <header><div><span className="admin-kicker">Редактирование пилота</span><h1>{driver.nameRu || `${driver.givenName} ${driver.familyName}`}</h1></div><code>{driver.id}</code></header>
      {state.saved === '1' ? <div className="admin-alert is-success">Изменения сохранены в базе данных</div> : null}
      {state.editorialSaved === '1' ? <div className="admin-alert is-success">Прозвища и цитаты сохранены в базе данных</div> : null}
      {state.photoSaved === '1' ? <div className="admin-alert is-success">Фотография загружена в Supabase Storage, обработана в WebP и зарегистрирована в Supabase PostgreSQL</div> : null}
      {state.syncError === '1' ? <div className="admin-alert">Данные сохранены, но опубликованные JSON-файлы ещё не обновлены{isCloud ? ' — облачная синхронизация находится в разработке' : '. Запустите ручную синхронизацию для этого пилота'}</div> : null}
      {state.error === 'conflict' ? <div className="admin-alert is-error">Данные пилота изменились после открытия страницы. Обновите страницу, проверьте новые значения и повторите сохранение</div> : state.error === 'background' ? <div className="admin-alert is-error">ISNet пока недоступен на этом компьютере. Установите локальное окружение rembg или снимите флажок «Удалить фон» и загрузите фотографию без этой обработки</div> : state.error === 'preview' ? <div className="admin-alert is-error">Предпросмотр устарел или файл был изменён. Создайте предпросмотр ещё раз и затем сохраните фотографию</div> : state.error === 'photo' ? <div className="admin-alert is-error">Не удалось загрузить фотографию. Проверьте формат, размер файла и сведения о правах</div> : state.error === 'editorial' ? <div className="admin-alert is-error">Не удалось сохранить прозвища и цитаты. Проверьте обязательные поля и ссылки на источники</div> : state.error ? <div className="admin-alert is-error">Не удалось сохранить изменения. Проверьте значения и адрес источника</div> : null}
      <form action={updateDriver} className="admin-editor-form">
        <input type="hidden" name="id" value={driver.id} />
        <input type="hidden" name="expectedRevision" value={driver.driverUpdatedAt} />
        <fieldset>
          <legend>Основные сведения</legend>
          <div className="admin-form-grid">
            <label><span>ID пилота</span><input value={driver.id} disabled /><small>Системный ID нельзя менять после импорта</small></label>
            <label><span>Имя в источнике</span><input value={`${driver.givenName} ${driver.familyName}`} disabled /></label>
            <label className="is-wide"><span>Имя на русском</span><input name="nameRu" defaultValue={driver.nameRu ?? ''} required /><small>{reviewLabels[driver.nameRuReviewStatus ?? 'candidate'] ?? driver.nameRuReviewStatus}{driver.nameRuSourceNote ? ` · ${driver.nameRuSourceNote}` : ''}</small></label>
            <label><span>Дата рождения</span><input name="birthDate" type="date" defaultValue={driver.birthDate ?? ''} /></label>
            <label><span>Место рождения</span><input name="birthPlaceRu" defaultValue={driver.birthPlaceRu ?? ''} placeholder="Город, страна" /></label>
            <label><span>Дата смерти</span><input name="deathDate" type="date" defaultValue={driver.deathDate ?? ''} /><small>Оставьте пустым для живущего пилота</small></label>
            <label><span>Рост, см</span><input name="heightCm" type="number" min="120" max="230" step="0.1" defaultValue={driver.heightCm ?? ''} /></label>
            <label><span>Вес, кг</span><input name="weightKg" type="number" min="35" max="200" step="0.1" defaultValue={driver.weightKg ?? ''} /></label>
            <label className="is-wide"><span>Биография</span><textarea name="biographyRu" rows={8} defaultValue={driver.biographyRu ?? ''} placeholder="Краткий редакционный текст на русском языке" /></label>
          </div>
        </fieldset>
        <fieldset>
          <legend>Системные поля и происхождение данных</legend>
          <div className="admin-form-grid">
            <label><span>Код пилота</span><input value={driver.abbreviation ?? '—'} disabled /></label>
            <label><span>Постоянный номер</span><input value={driver.permanentNumber ?? '—'} disabled /></label>
            <label><span>Национальность в источнике</span><input value={driver.nationality ?? '—'} disabled /></label>
            <label><span>Источник основной записи</span><input value={driver.driverSourceId ?? '—'} disabled /></label>
            <label><span>Источник профиля</span><input value={driver.profileSourceId ?? '—'} disabled /></label>
            <label><span>Статус профиля</span><input value={reviewLabels[driver.reviewStatus] ?? driver.reviewStatus} disabled /></label>
            <label><span>Источник русского имени</span><input value={driver.nameRuSourceId ?? '—'} disabled />{driver.nameRuSourceUrl ? <small><a href={driver.nameRuSourceUrl} target="_blank" rel="noreferrer">Открыть источник</a></small> : null}</label>
            <label><span>Основная запись обновлена</span><input value={formatTimestamp(driver.driverUpdatedAt)} disabled /></label>
            <label><span>Профиль обновлён</span><input value={formatTimestamp(driver.profileUpdatedAt)} disabled /></label>
          </div>
          <p className="admin-field-note">Эти значения доступны для просмотра, но защищены от случайного изменения. Результаты гонок, сезоны, команды и номера будут редактироваться в отдельных связанных модулях</p>
        </fieldset>
        <fieldset>
          <legend>Источник изменений</legend>
          <label><span>URL источника</span><input name="sourceUrl" type="url" required placeholder="https://…" /><small>Обязателен для сохранения. Ссылка будет записана для каждого изменённого поля</small></label>
        </fieldset>
        <div className="admin-form-actions"><span>Статус после сохранения: «Проверено редактором»</span><button type="submit">Сохранить изменения</button></div>
      </form>
      <DriverEditorialForm
        driverId={driver.id}
        expectedRevision={driver.driverUpdatedAt}
        initialNicknames={driver.nicknames.map((row) => ({ nameRu: row.nameRu, nameOriginal: row.nameOriginal ?? '', contextRu: row.contextRu ?? '', sourceUrl: row.sourceUrl }))}
        initialQuotes={driver.quotes.map((row) => ({ quoteRu: row.quoteRu, quoteOriginal: row.quoteOriginal ?? '', attributionRu: row.attributionRu, contextRu: row.contextRu ?? '', quoteDate: row.quoteDate ?? '', sourceUrl: row.sourceUrl }))}
      />
      {canUploadPhoto ? <DriverPhotoForm driverId={driver.id} driverName={driver.nameRu || `${driver.givenName} ${driver.familyName}`} currentPhoto={driver.photo} />
        : <div className="admin-alert">Загрузка фотографии доступна через локально запущенный обработчик. В облачной админке можно редактировать сведения о пилоте</div>}
    </section>
  </main>;
}
