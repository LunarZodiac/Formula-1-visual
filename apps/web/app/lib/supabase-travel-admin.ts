import type { AdminTravelPoint, AdminTravelPointInput, AdminTravelPointRegistry, AdminTravelRegistry } from './admin-database';
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

export function getDirectAdminTravelPoints(circuitId: string, filters: {
  page?: number; limit?: number; query?: string; status?: string; category?: string; role?: string;
  photo?: string; featured?: string; translation?: string; distanceMin?: string; distanceMax?: string;
  importanceMin?: string; importanceMax?: string;
}): Promise<AdminTravelPointRegistry | null> {
  const optionalNumber = (value: string | undefined, maximum = Number.POSITIVE_INFINITY) => {
    const parsed = Number(value?.trim().replace(',', '.'));
    return value?.trim() && Number.isFinite(parsed) && parsed >= 0 ? Math.min(parsed, maximum) : null;
  };
  return adminSupabaseRpc('admin_travel_points', {
    p_circuit_id: circuitId,
    p_page: filters.page ?? 1,
    p_limit: filters.limit ?? 30,
    p_filters: {
      query: filters.query ?? '',
      status: ['candidate', 'reviewed', 'published', 'hidden'].includes(filters.status ?? '') ? filters.status : '',
      category: filters.category ?? '',
      role: ['transport', 'stay', 'explore', 'essential', 'circuit'].includes(filters.role ?? '') ? filters.role : '',
      photo: ['yes', 'no'].includes(filters.photo ?? '') ? filters.photo : '',
      featured: ['yes', 'no'].includes(filters.featured ?? '') ? filters.featured : '',
      translation: ['ready', 'missing'].includes(filters.translation ?? '') ? filters.translation : '',
      distanceMin: optionalNumber(filters.distanceMin), distanceMax: optionalNumber(filters.distanceMax),
      importanceMin: optionalNumber(filters.importanceMin, 100), importanceMax: optionalNumber(filters.importanceMax, 100),
    },
  });
}

export function getDirectAdminTravelPoint(circuitId: string, pointId: string): Promise<{
  point: AdminTravelPoint; categories: Array<{ id: string; name: string; groupId: string }>;
} | null> {
  return adminSupabaseRpc('admin_travel_point', { p_circuit_id: circuitId, p_point_id: pointId });
}

export function updateDirectAdminTravelPoint(input: AdminTravelPointInput): Promise<{
  id: string; circuitId: string; publicDataSynced: boolean;
}> {
  return adminSupabaseRpc('admin_save_travel_point', {
    p_circuit_id: input.circuitId, p_point_id: input.id, p_input: input,
  });
}

export function updateDirectAdminTravelPointsBulk(input: {
  circuitId: string; pointIds: string[];
  reviewStatus?: 'candidate' | 'reviewed' | 'published' | 'hidden'; isFeatured?: boolean;
}): Promise<{ circuitId: string; updated: number; publicDataSynced: boolean }> {
  return adminSupabaseRpc('admin_save_travel_points_bulk', {
    p_circuit_id: input.circuitId, p_input: input,
  });
}

export function applyDirectAdminTravelPointOsmTranslations(circuitId: string): Promise<{
  circuitId: string; updated: number; publicDataSynced: boolean;
}> {
  return adminSupabaseRpc('admin_apply_travel_osm_names', { p_circuit_id: circuitId });
}
