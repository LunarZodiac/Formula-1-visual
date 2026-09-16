import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { getAdminSession } from '../../../../../lib/admin-auth';
import { getAdminCircuit, isAdminDatabaseConfigured } from '../../../../../lib/admin-database';
import { saveTrackLayout } from '../../../../actions';
import { LayoutGeometryPreview } from './layout-geometry-preview';
import { TrackGeometryImporter } from './track-geometry-importer';

const provenanceLabels = { unknown: 'Не указано', official: 'Официальный источник', open_data: 'Открытые данные', user_digitized: 'Оцифровка проекта' } as const;
const statusLabels = { candidate: 'Кандидат', reviewed: 'Проверена', published: 'Опубликована', rejected: 'Отклонена' } as const;

export default async function AdminTrackLayoutPage({ params, searchParams }: {
  params: Promise<{ id: string; layoutId: string }>;
  searchParams: Promise<{ saved?: string; syncError?: string; error?: string; geometrySaved?: string; geometryError?: string }>;
}) {
  if (!await getAdminSession()) redirect('/admin/login');
  if (!isAdminDatabaseConfigured()) redirect('/admin/overview');
  const [{ id: circuitId, layoutId }, state] = await Promise.all([params, searchParams]);
  let circuit: Awaited<ReturnType<typeof getAdminCircuit>> = null;
  try { circuit = await getAdminCircuit(circuitId, true); }
  catch (error) {
    console.error('Не удалось открыть конфигурацию', error);
    return <main className="admin-shell"><div className="admin-alert is-error">Локальная база конфигураций недоступна</div></main>;
  }
  if (!circuit) notFound();
  const create = layoutId === 'new';
  const layout = create ? null : circuit.layouts.find((item) => item.id === layoutId);
  if (!create && !layout) notFound();
  const displayName = layout?.name ?? 'Новая конфигурация';
  return <main className="admin-shell"><section className="admin-edit-panel admin-layout-editor">
    <Link className="admin-back-link" href={`/admin/circuits/${encodeURIComponent(circuit.id)}`}>← Вернуться к трассе</Link>
    <header><div><span className="admin-kicker">Конфигурация трассы</span><h1>{displayName}</h1><p>{circuit.profile?.nameRu ?? circuit.officialName}</p></div>{layout ? <code>{layout.id}</code> : null}</header>
    {state.saved === '1' ? <div className="admin-alert is-success">Конфигурация сохранена в PostgreSQL</div> : null}
    {state.geometrySaved === '1' ? <div className="admin-alert is-success">Контур сохранён в PostGIS и синхронизирован с публичной картой. Статус сброшен до «Кандидат» для повторной проверки</div> : null}
    {state.geometryError === '1' ? <div className="admin-alert is-error">Импорт отклонён. Повторите проверку GeoJSON и убедитесь, что у конфигурации указан источник и происхождение</div> : null}
    {state.syncError === '1' ? <div className="admin-alert">Конфигурация сохранена, но поисковый индекс не обновился</div> : null}
    {state.error ? <div className="admin-alert is-error">Не удалось сохранить конфигурацию. Проверьте период, параметры, статус и источник</div> : null}
    <section className="admin-layout-geometry-section"><header><div><span className="admin-kicker">Геометрия</span><h2>Текущий контур</h2></div><span className={`admin-status ${layout?.hasGeometry ? 'is-published' : 'is-missing'}`}>{layout?.hasGeometry ? 'Контур загружен' : 'Нет контура'}</span></header><LayoutGeometryPreview geometry={layout?.centerlineGeoJson ?? null} /><p>Это фактическая линия из PostGIS. Новый импорт не публикуется автоматически: конфигурация возвращается в статус «Кандидат»{layout?.hasGeometry ? <> · <Link href={`/admin/circuits/${circuit.id}/layouts/${layout.id}/annotations`}>Открыть редактор секторов, поворотов и DRS →</Link></> : null}</p></section>
    {!create && layout ? <section className="admin-layout-geometry-section"><header><div><span className="admin-kicker">Проверяемый импорт</span><h2>{layout.hasGeometry ? 'Заменить GeoJSON' : 'Загрузить GeoJSON'}</h2></div></header><TrackGeometryImporter circuitId={circuit.id} layoutId={layout.id} longitude={circuit.longitude} latitude={circuit.latitude} existingGeometry={layout.centerlineGeoJson} /><p>При сохранении одна и та же нормализованная линия атомарно записывается в PostGIS и отдельный публичный реестр карт</p></section> : <div className="admin-alert">Сначала создайте конфигурацию-кандидат, затем откройте её карточку для загрузки GeoJSON</div>}
    <form action={saveTrackLayout} className="admin-editor-form">
      <input type="hidden" name="circuitId" value={circuit.id} />
      <input type="hidden" name="create" value={create ? '1' : '0'} />
      <fieldset><legend>Идентичность и период</legend><div className="admin-form-grid">
        <label><span>ID конфигурации</span>{create ? <input name="id" pattern="[A-Za-z0-9_-]+" placeholder={`${circuit.id}-historic-01`} required /> : <><input type="hidden" name="id" value={layout!.id} /><input value={layout!.id} disabled /></>}<small>После создания ID менять нельзя</small></label>
        <label><span>Название</span><input name="name" defaultValue={layout?.name ?? ''} required placeholder="Grand Prix Circuit" /></label>
        <label><span>Используется с года</span><input name="validFromYear" type="number" min="1950" max="2100" defaultValue={layout?.validFromYear ?? ''} /></label>
        <label><span>Используется до года</span><input name="validToYear" type="number" min="1950" max="2100" defaultValue={layout?.validToYear ?? ''} /><small>Оставьте пустым, если конфигурация актуальна</small></label>
      </div></fieldset>
      <fieldset><legend>Параметры</legend><div className="admin-form-grid">
        <label><span>Длина, м</span><input name="lengthM" type="number" min="1" max="100000" defaultValue={layout?.lengthM ?? ''} /></label>
        <label><span>Поворотов</span><input name="turns" type="number" min="1" max="200" defaultValue={layout?.turns ?? ''} /></label>
        <label><span>Направление</span><select name="direction" defaultValue={layout?.direction ?? ''}><option value="">Не указано</option><option value="clockwise">По часовой стрелке</option><option value="counterclockwise">Против часовой стрелки</option></select></label>
        <label><span>Минимальная высота, м</span><input name="elevationMinM" type="number" min="-500" max="6000" step="0.01" defaultValue={layout?.elevationMinM ?? ''} /></label>
        <label><span>Максимальная высота, м</span><input name="elevationMaxM" type="number" min="-500" max="6000" step="0.01" defaultValue={layout?.elevationMaxM ?? ''} /></label>
      </div></fieldset>
      <fieldset><legend>Проверка и происхождение</legend><div className="admin-form-grid">
        <label><span>Происхождение геометрии</span><select name="provenanceType" defaultValue={layout?.provenanceType ?? 'unknown'}>{Object.entries(provenanceLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <label><span>Статус</span><select name="reviewStatus" defaultValue={layout?.reviewStatus ?? 'candidate'}>{Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value} disabled={!layout?.hasGeometry && ['reviewed', 'published'].includes(value)}>{label}</option>)}</select><small>Без контура доступны только «Кандидат» и «Отклонена»</small></label>
        <label><span>Название источника</span><input name="sourceName" placeholder="Официальный сайт трассы" /></label>
        <label><span>URL источника</span><input name="sourceUrl" type="url" defaultValue={layout?.sourceUrl ?? ''} required placeholder="https://…" /></label>
        <label className="is-wide"><span>Редакторская заметка</span><textarea name="sourceNotes" rows={3} placeholder="Какие параметры или период подтверждает источник" /></label>
        <label className="admin-rights-confirmation"><input type="checkbox" name="sourceVerified" value="yes" /><span><strong>Источник проверен</strong><small>Обязательно для статусов «Проверена» и «Опубликована»</small></span></label>
      </div></fieldset>
      <div className="admin-form-actions"><span>Привязка к этапам здесь не меняется</span><button type="submit">{create ? 'Создать кандидата' : 'Сохранить конфигурацию'}</button></div>
    </form>
  </section></main>;
}
