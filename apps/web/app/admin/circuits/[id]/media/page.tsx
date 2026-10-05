import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { getAdminSession } from '../../../../lib/admin-auth';
import { getAdminCircuitMediaOrder, getAdminCircuits, isAdminDatabaseConfigured } from '../../../../lib/admin-database';
import { CircuitMediaOrderEditor } from './circuit-media-order-editor';
import { CircuitSelector } from './circuit-selector';

export default async function AdminCircuitMediaPage({ params, searchParams }: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ saved?: string; syncError?: string; error?: string }>;
}) {
  if (!await getAdminSession()) redirect('/admin/login');
  if (!isAdminDatabaseConfigured()) redirect('/admin/overview');
  const { id } = await params;
  const state = await searchParams;
  let data: Awaited<ReturnType<typeof getAdminCircuitMediaOrder>> = null;
  try { data = await getAdminCircuitMediaOrder(id); }
  catch (error) {
    console.error('Не удалось открыть материалы трассы', error);
    return <main className="admin-shell"><div className="admin-alert is-error">Не удалось загрузить материалы трассы из базы данных</div></main>;
  }
  if (!data) notFound();
  let circuits = [{ id: data.circuit.id, name: data.circuit.nameRu }];
  try {
    const registry = await getAdminCircuits({ limit: 100 });
    circuits = registry.rows
      .filter((circuit) => circuit.slug !== null && circuit.profileStatus !== null)
      .map((circuit) => ({ id: circuit.id, name: circuit.nameRu ?? circuit.officialName }))
      .sort((left, right) => left.name.localeCompare(right.name, 'ru'));
  } catch (error) {
    console.error('Не удалось загрузить список трасс для переключателя', error);
  }

  return <main className="admin-shell admin-circuit-media-page">
    <Link className="admin-back-link" href="/admin/circuits">← Все трассы</Link>
    <header className="admin-section-header"><div><span className="admin-kicker">Медиатека трассы</span><h1>{data.circuit.nameRu}</h1><p>Управление уже загруженными изображениями истории и галереи</p></div><div className="admin-circuit-header-actions"><Link href="/admin/media?entityType=circuit">Все материалы трасс</Link><Link href={`/circuits/${encodeURIComponent(data.circuit.slug)}`}>Открыть страницу ↗</Link></div></header>
    <CircuitSelector currentId={id} circuits={circuits} />
    {state.saved ? <div className="admin-alert is-success">Порядок раздела «{state.saved === 'history' ? 'История' : 'Галерея'}» сохранён</div> : null}
    {state.syncError === '1' ? <div className="admin-alert">Порядок сохранён в базе, но публичная страница ещё не обновлена</div> : null}
    {state.error ? <div className="admin-alert is-error">Не удалось сохранить порядок. Возможно, набор материалов изменился — обновите страницу и повторите</div> : null}
    <CircuitMediaOrderEditor circuitId={data.circuit.id} section="history" title="История трассы" note="Карточки хронологии: сейчас используются существующие четыре записи" initialItems={data.history} />
    <CircuitMediaOrderEditor circuitId={data.circuit.id} section="gallery" title="Галерея" note="Фотографии в том порядке, в котором посетитель увидит их на странице трассы" initialItems={data.gallery} />
  </main>;
}
