import Link from 'next/link';

const sections = [
  { id: 'points', label: 'Точки', suffix: '' },
  { id: 'access', label: 'Доступ', suffix: '/access' },
  { id: 'zones', label: 'Районы', suffix: '/zones' },
  { id: 'routes', label: 'Маршруты', suffix: '/routes' },
] as const;

export function TravelModuleNav({ circuitId, active, availableSections }: {
  circuitId: string;
  active: (typeof sections)[number]['id'];
  availableSections?: readonly (typeof sections)[number]['id'][];
}) {
  const base = `/admin/travel/${encodeURIComponent(circuitId)}`;
  return <nav className="admin-module-nav admin-travel-module-nav" aria-label="Разделы туристических данных">
    {sections.filter((section) => !availableSections || availableSections.includes(section.id)).map((section) => <Link key={section.id} href={`${base}${section.suffix}`} className={section.id === active ? 'is-active' : undefined} aria-current={section.id === active ? 'page' : undefined}>{section.label}</Link>)}
  </nav>;
}
