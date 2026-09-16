import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { getAdminSession } from '../../../lib/admin-auth';
import { getAdminTableData, isAdminDatabaseConfigured } from '../../../lib/admin-database';
import { AdminPagination } from '../../admin-pagination';
import { AdminTableRowEditor } from './admin-table-row-editor';

const pageSize = 25;
const filterOperators = [
  ['contains', 'Содержит'],
  ['equal', 'Равно'],
  ['is-null', 'Равно NULL'],
  ['is-not-null', 'Не NULL'],
] as const;

function displayValue(value: unknown) {
  if (value === null || value === undefined) return 'NULL';
  const content = typeof value === 'object' ? JSON.stringify(value) : String(value);
  return content.length > 140 ? `${content.slice(0, 137)}…` : content;
}

export default async function AdminTablePage({
  params,
  searchParams,
}: {
  params: Promise<{ table: string }>;
  searchParams: Promise<{
    page?: string; saved?: string; error?: string;
    filterColumn?: string; filterOperator?: string; filterValue?: string;
    sortColumn?: string; sortDirection?: string;
  }>;
}) {
  if (!await getAdminSession()) redirect('/admin/login');
  const { table } = await params;
  if (!/^[a-z][a-z0-9_]*$/.test(table)) notFound();
  const state = await searchParams;
  const parsedPage = Number.parseInt(state.page ?? '1', 10);
  const page = Number.isFinite(parsedPage) && parsedPage > 0 ? parsedPage : 1;
  if (!isAdminDatabaseConfigured()) redirect('/admin/database');
  let data: Awaited<ReturnType<typeof getAdminTableData>>;
  try {
    data = await getAdminTableData(table, page, pageSize, state);
  } catch (error) {
    console.error(`Не удалось открыть atlas.${table}`, error);
    notFound();
  }
  const totalPages = Math.max(1, Math.ceil(data.totalRows / pageSize));
  if (page > totalPages) {
    const corrected = new URLSearchParams();
    if (data.filterColumn) corrected.set('filterColumn', data.filterColumn);
    if (data.filterOperator) corrected.set('filterOperator', data.filterOperator);
    if (data.filterValue) corrected.set('filterValue', data.filterValue);
    if (data.sortColumn) corrected.set('sortColumn', data.sortColumn);
    if (data.sortColumn) corrected.set('sortDirection', data.sortDirection);
    corrected.set('page', String(totalPages));
    redirect(`/admin/database/${table}?${corrected}`);
  }

  return <main className="admin-shell">
    <section className="admin-edit-panel admin-table-browser">
      <Link className="admin-back-link" href="/admin/database">← Все таблицы</Link>
      <header><div><span className="admin-kicker">Схема atlas</span><h1>{data.name}</h1><p>{data.totalRows.toLocaleString('ru-RU')} строк · {data.columns.length} столбцов</p></div><code>{data.primaryKey.length ? `PK: ${data.primaryKey.join(', ')}` : 'Без первичного ключа'}</code></header>
      {state.saved === '1' ? <div className="admin-alert is-success">Строка сохранена в PostgreSQL</div> : null}
      {state.error === 'save' ? <div className="admin-alert is-error">Не удалось сохранить строку. Проверьте типы данных, обязательные поля и внешние ключи</div> : null}
      {!data.primaryKey.length ? <div className="admin-alert">Таблица доступна только для просмотра: у неё нет первичного ключа для безопасного выбора строки</div> : null}
      <form className="admin-circuit-filters" method="get" action={`/admin/database/${table}`}>
        <label>Фильтр по столбцу<select name="filterColumn" defaultValue={data.filterColumn ?? ''}>
          <option value="">Без фильтра</option>
          {data.columns.filter((column) => column.filterable).map((column) => <option key={column.name} value={column.name}>{column.name}</option>)}
        </select></label>
        <label>Условие<select name="filterOperator" defaultValue={data.filterOperator ?? 'contains'}>
          {filterOperators.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select></label>
        <label>Значение<input name="filterValue" defaultValue={data.filterValue} placeholder="Для NULL не требуется" /></label>
        <label>Сортировка<select name="sortColumn" defaultValue={data.sortColumn ?? ''}>
          <option value="">По первичному ключу</option>
          {data.columns.filter((column) => column.sortable).map((column) => <option key={column.name} value={column.name}>{column.name}</option>)}
        </select></label>
        <label>Направление<select name="sortDirection" defaultValue={data.sortDirection}>
          <option value="asc">По возрастанию</option><option value="desc">По убыванию</option>
        </select></label>
        <button type="submit">Применить</button><Link href={`/admin/database/${table}`}>Сбросить</Link>
      </form>
      {data.primaryKey.length
        ? <AdminTableRowEditor table={table} page={page} columns={data.columns} primaryKey={data.primaryKey} rows={data.rows} />
        : <div className="admin-table-wrap"><table><thead><tr>{data.columns.map((column) => <th key={column.name}>{column.name}<small>{column.dataType}</small></th>)}</tr></thead><tbody>{data.rows.map((row, index) => <tr key={index}>{data.columns.map((column) => <td key={column.name}><span className={row[column.name] == null ? 'is-null' : undefined}>{displayValue(row[column.name])}</span></td>)}</tr>)}</tbody></table></div>}
      {!data.rows.length ? <p className="admin-directory-empty">По заданным условиям записей нет</p> : null}
      <AdminPagination basePath={`/admin/database/${table}`} page={page} totalPages={totalPages} label="Страницы таблицы" parameters={{
        filterColumn: data.filterColumn, filterOperator: data.filterOperator, filterValue: data.filterValue,
        sortColumn: data.sortColumn, sortDirection: data.sortDirection,
      }} />
    </section>
  </main>;
}
