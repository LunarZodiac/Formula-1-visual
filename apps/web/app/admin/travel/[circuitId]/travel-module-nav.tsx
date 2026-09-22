import Link from 'next/link';

const sections = [
  { id: 'points', label: 'Точки', suffix: '' },
  { id: 'zones', label: 'Районы', suffix: '/zones' },
  { id: 'routes', label: 'Маршруты', suffix: '/routes' },
] as const;

export function TravelModuleNav({ circuitId, active }: {
  circuitId: string;
  active: (typeof sections)[number]['id'];
}) {
  const base = `/admin/travel/${encodeURIComponent(circuitId)}`;
  return <nav className="admin-module-nav admin-travel-module-nav" aria-label="Разделы туристических данных">
    {sections.map((section) => <Link key={section.id} href={`${base}${section.suffix}`} className={section.id === active ? 'is-active' : undefined} aria-current={section.id === active ? 'page' : undefined}>{section.label}</Link>)}
  </nav>;
}
