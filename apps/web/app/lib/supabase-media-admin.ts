import type { AdminMediaAssetDetail, AdminMediaRegistry } from './admin-database';
import { adminSupabaseRpc } from './supabase-admin';

export type AdminMediaFilters = {
  page?: number; limit?: number; query?: string; entityType?: string; usageRole?: string;
  season?: number | null; rights?: string; review?: string;
};

export function getDirectAdminMediaRegistry(filters: AdminMediaFilters): Promise<AdminMediaRegistry> {
  return adminSupabaseRpc('admin_media_registry', {
    p_query: filters.query ?? '', p_entity_type: filters.entityType ?? '',
    p_usage_role: filters.usageRole ?? '', p_season: filters.season ?? null,
    p_rights: filters.rights ?? '', p_review: filters.review ?? '',
    p_page: filters.page ?? 1, p_limit: filters.limit ?? 40,
  });
}

export function getDirectAdminMediaAsset(id: string): Promise<AdminMediaAssetDetail | null> {
  return adminSupabaseRpc('admin_media_asset', { p_id: id });
}

export function updateDirectAdminMediaAsset(input: {
  id: string; usageRole: string; altTextRu: string; author: string; licence: string;
  sourceUrl: string; rightsStatus: string; reviewStatus: string;
}): Promise<{ asset: AdminMediaAssetDetail; publicDataSynced: boolean }> {
  return adminSupabaseRpc('admin_save_media_asset', { p_id: input.id, p_input: input });
}
