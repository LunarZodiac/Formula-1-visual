import { redirect } from 'next/navigation';
import { getAdminSession } from '../../lib/admin-auth';
import { getDirectAdminDrivers } from '../../lib/supabase-admin';

export default async function SupabaseAdminTestPage() {
  if (!await getAdminSession()) redirect('/admin/login');

  const drivers = await getDirectAdminDrivers(10);

  return (
    <main className="admin-shell">
      <header className="admin-header">
        <div>
          <span className="admin-kicker">Проверка подключения</span>
          <h1>Supabase Data API</h1>
          <p>Прямое серверное чтение atlas.drivers без локального API</p>
        </div>
      </header>

      <section className="admin-directory">
        <h2>Первые 10 пилотов</h2>
        <pre>{JSON.stringify(drivers, null, 2)}</pre>
      </section>
    </main>
  );
}