import type { AdminTravelRegistry } from './admin-database';
import { adminSupabaseRpc } from './supabase-admin';

export function getDirectAdminTravelRegistry(filters: {
  page?: number; limit?: number; query?: string;
}): Promise<AdminTravelRegistry> {
  return adminSupabaseRpc('admin_travel_directory', {
    p_query: filters.query ?? '', p_page: filters.page ?? 1, p_limit: filters.limit ?? 30,
  });
}

export function updateDirectAdminTravelCategoryIcon(id: string, icon: string): Promise<{
  id: string; name: string; icon: string;
}> {
  return adminSupabaseRpc('admin_save_travel_category_icon', { p_id: id, p_icon: icon });
}
