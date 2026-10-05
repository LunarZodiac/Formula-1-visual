import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { getAdminSession } from '../../../../lib/admin-auth';
import { getAdminConstructorEntry, isAdminConstructorMediaConfigured, isAdminDatabaseConfigured } from '../../../../lib/admin-database';
import { updateConstructorEntry } from '../../../actions';
import { ConstructorCarForm } from './constructor-car-form';
import { ConstructorLogoForm } from './constructor-logo-form';

export default async function AdminConstructorCarPage({ params, searchParams }: {
  params: Promise<{ season: string; id: string }>;
  searchParams: Promise<{ saved?: string; photoSaved?: string; logoSaved?: string; syncError?: string; error?: string }>;
}) {
  if (!await getAdminSession()) redirect('/admin/login');
  const route = await params;
  const state = await searchParams;
  const season = Number(route.season);
  if (!Number.isInteger(season) || season < 1950 || season > 2100) notFound();
  if (!isAdminDatabaseConfigured()) redirect('/admin/teams');
  let entry: Awaited<ReturnType<typeof getAdminConstructorEntry>> = null;
  try { entry = await getAdminConstructorEntry(season, route.id); }
  catch (error) {
    console.error('Не удалось открыть команду в админке', error);
    return <main className="admin-shell"><section className="admin-edit-panel"><Link className="admin-back-link" href={`/admin/teams?season=${season}`}>← Вернуться к командам</Link><div className="admin-alert is-error">Не удалось загрузить данные команды</div></section></main>;
  }
  if (!entry) notFound();
  return <main className="admin-shell"><section className="admin-edit-panel">
    <Link className="admin-back-link" href={`/admin/teams?season=${season}`}>← Команды сезона {season}</Link>
    <header><div><span className="admin-kicker">Изображение болида · сезон {season}</span><h1>{entry.displayName}</h1><p>{entry.carModel || 'Модель пока не указана'}</p></div><code>{entry.constructorId}</code></header>
    {state.saved === '1' ? <div className="admin-alert is-success">Сведения о команде сохранены</div> : null}
    {state.photoSaved === '1' ? <div className="admin-alert is-success">Изображение сохранено, преобразовано в WebP и подключено к сезонному каталогу</div> : null}
    {state.logoSaved === '1' ? <div className="admin-alert is-success">Логотип сохранён, преобразован в WebP и подключён к сезонному каталогу</div> : null}
    {state.syncError === '1' ? <div className="admin-alert">Данные сохранены, но публичный сезонный каталог пока не обновлён</div> : null}
    {state.error === 'background' ? <div className="admin-alert is-error">ISNet недоступен. Проверьте локальный обработчик или снимите флажок удаления фона</div> : state.error === 'preview' || state.error === 'logo-preview' ? <div className="admin-alert is-error">Предпросмотр устарел. Создайте его ещё раз</div> : state.error === 'save' ? <div className="admin-alert is-error">Не удалось сохранить сведения. Проверьте цвет и ссылку на источник</div> : state.error ? <div className="admin-alert is-error">Не удалось сохранить изображение. Проверьте файл и сведения о правах</div> : null}
    <form action={updateConstructorEntry} className="admin-editor-form">
      <input type="hidden" name="season" value={season} /><input type="hidden" name="constructorId" value={entry.constructorId} />
      <fieldset><legend>Сезонная запись команды</legend><div className="admin-form-grid">
        <label><span>ID команды</span><input value={entry.constructorId} disabled /><small>Системный ID изменять нельзя</small></label>
        <label><span>Сезон</span><input value={season} disabled /></label>
        <label className="is-wide"><span>Название в этом сезоне</span><input name="displayName" defaultValue={entry.displayName} required /></label>
        <label><span>Модель болида</span><input name="carModel" defaultValue={entry.carModel ?? ''} placeholder="Например: MCL40" /></label>
        <label><span>Двигатель</span><input name="engineName" defaultValue={entry.engineName ?? ''} /></label>
        <label><span>Цвет команды</span><span className="admin-colour-field"><input name="teamColour" defaultValue={entry.teamColour ?? ''} placeholder="#FF8000" pattern="#[0-9A-Fa-f]{6}" /><i style={{ backgroundColor: entry.teamColour ?? '#52606a' }} aria-hidden="true" /></span><small>Формат #RRGGBB; поле можно оставить пустым</small></label>
        <label className="is-wide"><span>Источник изменений</span><input name="sourceUrl" type="url" defaultValue={entry.editorialSourceUrl ?? ''} required placeholder="https://…" /><small>Если значения не менялись, ссылка обновит источники всех полей сезонной записи</small></label>
      </div></fieldset>
      <div className="admin-form-actions"><span>Изменения относятся только к сезону {season}</span><button type="submit">Сохранить сведения</button></div>
    </form>
    {isAdminConstructorMediaConfigured() ? <>
      <ConstructorLogoForm season={season} constructorId={entry.constructorId} teamName={entry.displayName} currentImage={entry.logoImageUrl} currentMedia={entry.logoMedia} />
      <ConstructorCarForm season={season} constructorId={entry.constructorId} teamName={entry.displayName} currentImage={entry.carImageUrl} currentMedia={entry.carMedia} />
    </> : <div className="admin-alert">Загрузка изображений пока доступна через локальный обработчик. Редактирование сведений о команде и связей преемственности работает здесь</div>}
  </section></main>;
}
