import type {
  AdminHistoryEraBlock, AdminHistoryEraBlockContentInput, AdminHistoryEraBlockInput,
  AdminHistoryEraDetail, AdminHistoryEraInput, AdminHistoryEraSummary,
} from './admin-database';
import { adminSupabaseRequest, adminSupabaseRpc } from './supabase-admin';

type EraRow = {
  slug: string; start_year: number; end_year: number | null; years_label: string;
  title_ru: string; summary_ru: string; editorial_status: AdminHistoryEraSummary['editorialStatus'];
  hero_media_asset_id: string | null; updated_at: string;
};

type BlockRow = {
  id: number; era_slug: string; sort_order: number;
  block_type: AdminHistoryEraBlock['blockType']; eyebrow_ru: string | null;
  title_ru: string | null; body_ru: string | null; media_asset_id: string | null;
  media_position: AdminHistoryEraBlock['mediaPosition'] | null;
  source_url: string | null; editorial_status: AdminHistoryEraBlock['editorialStatus'];
  updated_at: string;
};

function mapEra(row: EraRow, blocks: Pick<BlockRow, 'era_slug' | 'editorial_status'>[]): AdminHistoryEraSummary {
  const ownBlocks = blocks.filter((block) => block.era_slug === row.slug);
  return {
    slug: row.slug, startYear: row.start_year, endYear: row.end_year,
    yearsLabel: row.years_label, titleRu: row.title_ru, summaryRu: row.summary_ru,
    editorialStatus: row.editorial_status, heroMediaAssetId: row.hero_media_asset_id,
    blockCount: ownBlocks.length,
    publishedBlockCount: ownBlocks.filter((block) => block.editorial_status === 'published').length,
    updatedAt: row.updated_at,
  };
}

function mapBlock(row: BlockRow): AdminHistoryEraBlock {
  return {
    id: row.id, eraSlug: row.era_slug, sortOrder: row.sort_order,
    blockType: row.block_type, eyebrowRu: row.eyebrow_ru, titleRu: row.title_ru,
    bodyRu: row.body_ru, mediaAssetId: row.media_asset_id,
    mediaPosition: row.media_position ?? 'wide', sourceUrl: row.source_url,
    editorialStatus: row.editorial_status, updatedAt: row.updated_at,
  };
}

export async function getDirectAdminHistoryEras() {
  const [eras, blocks] = await Promise.all([
    adminSupabaseRequest<EraRow[]>('history_eras', '?select=*&order=start_year.asc,slug.asc'),
    adminSupabaseRequest<Pick<BlockRow, 'era_slug' | 'editorial_status'>[]>(
      'history_era_blocks', '?select=era_slug,editorial_status',
    ),
  ]);
  return { rows: eras.map((era) => mapEra(era, blocks)) };
}

export async function getDirectAdminHistoryEra(slug: string): Promise<AdminHistoryEraDetail | null> {
  const filter = new URLSearchParams({ slug: `eq.${slug}`, select: '*' });
  const blockFilter = new URLSearchParams({ era_slug: `eq.${slug}`, select: '*', order: 'sort_order.asc,id.asc' });
  const [eras, blocks] = await Promise.all([
    adminSupabaseRequest<EraRow[]>('history_eras', `?${filter}`),
    adminSupabaseRequest<BlockRow[]>('history_era_blocks', `?${blockFilter}`),
  ]);
  if (!eras[0]) return null;
  return { era: mapEra(eras[0], blocks), blocks: blocks.map(mapBlock) };
}

export function updateDirectAdminHistoryEra(slug: string, input: AdminHistoryEraInput) {
  return adminSupabaseRpc<{ slug: string; publicDataSynced: boolean }>(
    'admin_save_history_era', { p_slug: slug, p_input: input },
  );
}

export function saveDirectAdminHistoryBlock(
  eraSlug: string, blockId: number | null,
  input: AdminHistoryEraBlockInput | AdminHistoryEraBlockContentInput,
) {
  return adminSupabaseRpc<{ id: number; publicDataSynced: boolean }>(
    'admin_save_history_block', { p_era_slug: eraSlug, p_block_id: blockId, p_input: input },
  );
}

export function deleteDirectAdminHistoryBlock(eraSlug: string, blockId: number) {
  return adminSupabaseRpc<{ id: number; publicDataSynced: boolean }>(
    'admin_delete_history_block', { p_era_slug: eraSlug, p_block_id: blockId },
  );
}

export function reorderDirectAdminHistoryBlocks(eraSlug: string, orderedIds: number[], expectedOrderedIds: number[]) {
  return adminSupabaseRpc<{ eraSlug: string; orderedIds: number[]; publicDataSynced: boolean }>(
    'admin_reorder_history_blocks',
    { p_era_slug: eraSlug, p_ordered_ids: orderedIds, p_expected_ids: expectedOrderedIds },
  );
}

export async function getDirectAdminHistoryMedia(id: string) {
  const query = new URLSearchParams({ id: `eq.${id}`, select: 'url,alt_text_ru', limit: '1' });
  const rows = await adminSupabaseRequest<Array<{ url: string; alt_text_ru: string | null }>>(
    'media_assets', `?${query}`,
  );
  return rows[0] ? { url: rows[0].url, altTextRu: rows[0].alt_text_ru } : null;
}
