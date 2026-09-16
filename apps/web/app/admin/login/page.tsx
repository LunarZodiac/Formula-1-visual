import { redirect } from 'next/navigation';
import { getAdminSession, isAdminConfigured } from '../../lib/admin-auth';
import { loginAdmin } from '../actions';

export default async function AdminLoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  if (await getAdminSession()) redirect('/admin');
  const { error } = await searchParams;
  const configured = isAdminConfigured();

  return <main className="admin-shell admin-login-shell">
      <section className="admin-login-panel">
        <span className="admin-kicker">Закрытый раздел</span>
        <h1>Вход в редакцию</h1>
        <p>Управление данными пилотов, источниками и медиаматериалами</p>
        {!configured ? <div className="admin-alert">Локальная учётная запись ещё не настроена. Добавьте ADMIN_EMAIL, ADMIN_PASSWORD и ADMIN_SESSION_SECRET в apps/web/.dev.vars</div> : null}
        {error === 'invalid' ? <div className="admin-alert is-error">Неверный логин или пароль</div> : null}
        <form action={loginAdmin} className="admin-login-form">
          <label><span>E-mail</span><input name="email" type="email" autoComplete="username" required disabled={!configured} /></label>
          <label><span>Пароль</span><input name="password" type="password" autoComplete="current-password" required disabled={!configured} /></label>
          <button type="submit" disabled={!configured}>Войти</button>
        </form>
      </section>
    </main>;
}
