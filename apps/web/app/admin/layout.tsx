import type { ReactNode } from 'react';
import { getAdminSession } from '../lib/admin-auth';
import { AdminNavigation } from './admin-navigation';

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const session = await getAdminSession();
  return session ? <AdminNavigation email={session.email}>{children}</AdminNavigation> : children;
}
