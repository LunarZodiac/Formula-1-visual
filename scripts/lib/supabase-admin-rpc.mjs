import { storageConfig } from './supabase-storage.mjs';

export async function saveSupabaseDriverPhoto(input) {
  const { supabaseUrl, serviceKey } = storageConfig();
  const response = await fetch(`${supabaseUrl}/rest/v1/rpc/admin_save_driver_photo`, {
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
    throw new Error(`Не удалось зарегистрировать фотографию в Supabase: ${response.status} ${detail}`);
  }
  return response.json();
}

export async function isSupabaseDriverPhotoRegistered(assetId) {
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
