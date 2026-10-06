import { storageConfig } from './supabase-storage.mjs';

export class SupabaseRpcRejectedError extends Error {
  constructor(status, detail) {
    super(`Supabase отклонил запись изображения: ${status} ${detail}`);
    this.status = status;
  }
}

async function saveSupabaseMedia(name, input) {
  const { supabaseUrl, serviceKey } = storageConfig();
  const response = await fetch(`${supabaseUrl}/rest/v1/rpc/${name}`, {
    method: 'POST',
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      'Content-Profile': 'atlas',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ p_input: input }),
  });
  if (!response.ok) {
    const detail = await response.text();
    if (response.status >= 400 && response.status < 500) {
      throw new SupabaseRpcRejectedError(response.status, detail);
    }
    throw new Error(`Не удалось зарегистрировать изображение в Supabase: ${response.status} ${detail}`);
  }
  return response.json();
}

export const saveSupabaseDriverPhoto = (input) => saveSupabaseMedia('admin_save_driver_photo', input);
export const saveSupabaseGameLogo = (input) => saveSupabaseMedia('admin_save_game_logo', input);

export async function isSupabaseMediaRegistered(assetId) {
  const { supabaseUrl, serviceKey } = storageConfig();
  const query = new URLSearchParams({ select: 'id', id: `eq.${assetId}`, limit: '1' });
  const response = await fetch(`${supabaseUrl}/rest/v1/media_assets?${query}`, {
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      'Accept-Profile': 'atlas',
    },
  });
  if (!response.ok) throw new Error(`Не удалось проверить фотографию в Supabase: ${response.status}`);
  const rows = await response.json();
  return Array.isArray(rows) && rows.length > 0;
}

export const isSupabaseDriverPhotoRegistered = isSupabaseMediaRegistered;
