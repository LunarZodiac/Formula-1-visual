import { adminSupabaseRequest } from './supabase-admin';

export type AdminGameLogo = {
  url: string;
  altTextRu: string;
  author: string;
  licence: string;
  sourceUrl: string;
};

type GameLogoRow = {
  entity_id: string;
  url: string;
  alt_text_ru: string | null;
  author: string | null;
  licence: string | null;
  source_url: string | null;
};

export async function getDirectAdminGameLogos(): Promise<Record<string, AdminGameLogo>> {
  const query = new URLSearchParams({
    select: 'entity_id,url,alt_text_ru,author,licence,source_url',
    entity_type: 'eq.game',
    media_type: 'eq.image',
    usage_role: 'eq.game_logo',
    is_primary: 'eq.true',
  });
  const rows = await adminSupabaseRequest<GameLogoRow[]>('media_assets', `?${query}`);
  return Object.fromEntries(rows.map((row) => [row.entity_id, {
    url: row.url,
    altTextRu: row.alt_text_ru ?? '',
    author: row.author ?? '',
    licence: row.licence ?? '',
    sourceUrl: row.source_url ?? '',
  }]));
}
