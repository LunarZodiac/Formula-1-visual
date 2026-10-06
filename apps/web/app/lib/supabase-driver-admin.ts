import type { AdminDriver, AdminDriverInput } from './admin-database';
import { adminSupabaseRequest, adminSupabaseRpc } from './supabase-admin';

type EditorialNickname = AdminDriver['nicknames'][number];
type EditorialQuote = AdminDriver['quotes'][number];

type DriverRow = {
  id: string; given_name: string; family_name: string;
  abbreviation: string | null; permanent_number: number | null;
  nationality: string | null; driver_source_id: string | null;
  driver_updated_at: string; birth_date: string | null;
  name_ru: string | null; birth_place_ru: string | null; death_date: string | null;
  height_cm: string | number | null; weight_kg: string | number | null;
  biography_ru: string | null; review_status: string;
  profile_source_id: string | null; profile_updated_at: string | null;
  name_ru_review_status: string | null; name_ru_source_id: string | null;
  name_ru_source_url: string | null; name_ru_source_note: string | null;
  photo_url: string | null; photo_alt_text_ru: string | null;
  photo_author: string | null; photo_licence: string | null;
  photo_source_url: string | null; photo_rights_status: string | null;
  photo_review_status: string | null;
  nicknames: EditorialNickname[]; quotes: EditorialQuote[];
};

const safeId = /^[A-Za-z0-9_-]+$/;

export async function getDirectAdminDriver(id: string): Promise<AdminDriver | null> {
  if (!safeId.test(id)) return null;
  const query = new URLSearchParams({ select: '*', id: 'eq.' + id, limit: '1' });
  const rows = await adminSupabaseRequest<DriverRow[]>('admin_driver_detail', '?' + query);
  const row = rows[0];
  if (!row) return null;
  return {
    id: row.id, givenName: row.given_name, familyName: row.family_name,
    abbreviation: row.abbreviation, permanentNumber: row.permanent_number,
    nationality: row.nationality, driverSourceId: row.driver_source_id,
    driverUpdatedAt: row.driver_updated_at,
    nameRu: row.name_ru, birthDate: row.birth_date, birthPlaceRu: row.birth_place_ru,
    deathDate: row.death_date,
    heightCm: row.height_cm === null ? null : String(row.height_cm),
    weightKg: row.weight_kg === null ? null : String(row.weight_kg),
    biographyRu: row.biography_ru, reviewStatus: row.review_status,
    profileSourceId: row.profile_source_id, profileUpdatedAt: row.profile_updated_at,
    nameRuReviewStatus: row.name_ru_review_status,
    nameRuSourceId: row.name_ru_source_id, nameRuSourceUrl: row.name_ru_source_url,
    nameRuSourceNote: row.name_ru_source_note,
    nicknames: row.nicknames ?? [], quotes: row.quotes ?? [],
    photo: row.photo_url ? {
      url: row.photo_url, altTextRu: row.photo_alt_text_ru ?? '',
      author: row.photo_author ?? '', licence: row.photo_licence ?? '',
      sourceUrl: row.photo_source_url ?? '',
      rightsStatus: row.photo_rights_status ?? '',
      reviewStatus: row.photo_review_status ?? '',
    } : null,
  };
}

export async function saveDirectAdminDriver(input: AdminDriverInput) {
  if (!safeId.test(input.id)) throw new Error('Некорректный ID пилота');
  const source = new URL(input.sourceUrl);
  if (!['http:', 'https:'].includes(source.protocol) || source.username || source.password) {
    throw new Error('Некорректный источник');
  }
  return adminSupabaseRpc<{ fields: string[]; publicDataSynced: boolean }>(
    'admin_save_driver_profile', { p_input: { ...input, sourceUrl: source.href } },
  );
}

export async function saveDirectAdminDriverEditorial(input: {
  id: string;
  expectedRevision: string;
  nicknames: Array<{ nameRu: string; nameOriginal: string | null; contextRu: string | null; sourceUrl: string }>;
  quotes: Array<{ quoteRu: string; quoteOriginal: string | null; attributionRu: string; contextRu: string | null; quoteDate: string | null; sourceUrl: string }>;
}) {
  if (!safeId.test(input.id)) throw new Error('Некорректный ID пилота');
  const normalizeSourceUrl = (value: string) => {
    const source = new URL(value);
    if (!['http:', 'https:'].includes(source.protocol) || source.username || source.password) {
      throw new Error('Некорректная ссылка на источник');
    }
    return source.href;
  };
  return adminSupabaseRpc<{ nicknames: number; quotes: number; publicDataSynced: boolean }>(
    'admin_save_driver_editorial', { p_input: {
      ...input,
      nicknames: input.nicknames.map((row) => ({ ...row, sourceUrl: normalizeSourceUrl(row.sourceUrl) })),
      quotes: input.quotes.map((row) => ({ ...row, sourceUrl: normalizeSourceUrl(row.sourceUrl) })),
    } },
  );
}
