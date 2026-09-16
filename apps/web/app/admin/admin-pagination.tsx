import Link from 'next/link';

type ParameterValue = string | number | null | undefined;

export function AdminPagination({
  basePath,
  page,
  totalPages,
  parameters = {},
  label = 'Страницы',
}: {
  basePath: string;
  page: number;
  totalPages: number;
  parameters?: Record<string, ParameterValue>;
  label?: string;
}) {
  const currentPage = Math.min(Math.max(1, page), Math.max(1, totalPages));

  function href(targetPage: number) {
    const search = new URLSearchParams();
    for (const [key, value] of Object.entries(parameters)) {
      if (value !== null && value !== undefined && String(value) !== '') search.set(key, String(value));
    }
    search.set('page', String(targetPage));
    return `${basePath}?${search}`;
  }

  return <nav className="admin-pagination" aria-label={label}>
    {currentPage > 1 ? <Link href={href(currentPage - 1)}>← Предыдущая</Link> : <span className="admin-pagination-placeholder" />}
    <form className="admin-page-jump" method="get" action={basePath}>
      {Object.entries(parameters).map(([key, value]) => value !== null && value !== undefined && String(value) !== ''
        ? <input key={key} type="hidden" name={key} value={String(value)} />
        : null)}
      <label><span>Страница</span><input name="page" type="number" min="1" max={totalPages} defaultValue={currentPage} aria-label={`Номер страницы от 1 до ${totalPages}`} /></label>
      <span>из {totalPages}</span>
      <button type="submit">Перейти</button>
    </form>
    {currentPage < totalPages ? <Link href={href(currentPage + 1)}>Следующая →</Link> : <span className="admin-pagination-placeholder" />}
  </nav>;
}
