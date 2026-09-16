import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getAdminSession } from '../../lib/admin-auth';
import { getAdminSchemaTables, isAdminDatabaseConfigured } from '../../lib/admin-database';

const groupLabels: Record<string, string> = {
  championship: 'Чемпионат и результаты',
  competitors: 'Пилоты и команды',
  circuits: 'Трассы и страницы',
  travel: 'Туристические данные',
  media: 'Медиа и источники',
};

function tableGroup(name: string) {
  if (/^(seasons|races|sessions|session_results|driver_standings|constructor_standings)$/.test(name)) return 'championship';
  if (/^(drivers|driver_|constructors|constructor_|external_identifiers)/.test(name)) return 'competitors';
  if (/^(circuits|track_|circuit_)/.test(name)) return 'circuits';
  if (/^(travel_|tourism_|poi_|buildings)/.test(name)) return 'travel';
  return 'media';
}

export default async function AdminDatabasePage() {
  if (!await getAdminSession()) redirect('/admin/login');
  if (!isAdminDatabaseConfigured()) {
    return <main className="admin-shell"><section className="admin-edit-panel">
      <Link className="admin-back-link" href="/admin">← Вернуться к пилотам</Link>
      <div className="admin-alert">Подключение к PostgreSQL не настроено</div>
    </section></main>;
  }

  let tables: Awaited<ReturnType<typeof getAdminSchemaTables>>['tables'] = [];
  try {
    tables = (await getAdminSchemaTables()).tables;
  } catch (error) {
    console.error('Не удалось получить список таблиц', error);
    return <main className="admin-shell"><section className="admin-edit-panel">
      <Link className="admin-back-link" href="/admin">← Вернуться к пилотам</Link>
      <div className="admin-alert is-error">Локальный сервер базы данных недоступен</div>
    </section></main>;
  }

  const groups = Object.entries(groupLabels).map(([id, label]) => ({
    id,
    label,
    tables: tables.filter((table) => tableGroup(table.name) === id),
  }));

  return <main className="admin-shell">
    <section className="admin-edit-panel admin-database-browser">
      <Link className="admin-back-link" href="/admin">← Вернуться к пилотам</Link>
      <header><div><span className="admin-kicker">PostgreSQL · схема atlas</span><h1>Таблицы базы данных</h1></div><strong>{tables.length} таблиц</strong></header>
      <div className="admin-alert">Редактор показывает все столбцы. Первичные ключи, геометрия и двоичные поля защищены от изменения; внешние ключи и ограничения проверяет PostgreSQL. Таблицы пилотов синхронизируются с публичным каталогом автоматически, для остальных разделов экспорт read-model будет подключаться по мере появления специализированных модулей</div>
      <div className="admin-schema-groups">
        {groups.map((group) => <section key={group.id}>
          <h2>{group.label}</h2>
          <div>{group.tables.map((table) => <Link href={`/admin/database/${table.name}`} key={table.name}>
            <code>{table.name}</code>
            <span>{table.columnCount} столбцов</span>
            <small>≈ {table.estimatedRows.toLocaleString('ru-RU')} строк</small>
          </Link>)}</div>
        </section>)}
      </div>
    </section>
  </main>;
}
