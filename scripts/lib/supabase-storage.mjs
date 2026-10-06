function requiredEnv(name) {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`Не задана переменная окружения ${name}`);
  }

  return value;
}

function encodeStoragePath(storagePath) {
  return storagePath
    .split('/')
    .map(encodeURIComponent)
    .join('/');
}

export function storageConfig() {
  return {
    supabaseUrl: requiredEnv('SUPABASE_URL').replace(/\/$/, ''),
    serviceKey: requiredEnv('SUPABASE_SERVICE_ROLE_KEY'),
    publicBucket:
      process.env.SUPABASE_MEDIA_BUCKET?.trim()
      || 'geography-speed-media',
    sourceBucket:
      process.env.SUPABASE_MEDIA_SOURCE_BUCKET?.trim()
      || 'geography-speed-source',
  };
}

export function storagePublicUrl(bucket, storagePath) {
  const { supabaseUrl } = storageConfig();

  return (
    `${supabaseUrl}/storage/v1/object/public/`
    + `${encodeURIComponent(bucket)}/`
    + encodeStoragePath(storagePath)
  );
}

export async function uploadStorageObject({
  bucket,
  storagePath,
  bytes,
  contentType,
  cacheControl = '31536000',
  upsert = true,
}) {
  const { supabaseUrl, serviceKey } = storageConfig();

  const endpoint =
    `${supabaseUrl}/storage/v1/object/`
    + `${encodeURIComponent(bucket)}/`
    + encodeStoragePath(storagePath);

  const response = await fetch(endpoint, {
    method: 'POST',

    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      'Content-Type': contentType,
      'Cache-Control': cacheControl,
      'x-upsert': upsert ? 'true' : 'false',
    },

    body: bytes,
  });

  if (!response.ok) {
    const responseText = await response.text();

    throw new Error(
      `Ошибка Supabase Storage для ${storagePath}: `
      + `${response.status} ${responseText}`,
    );
  }

  return {
    bucket,
    storagePath,
  };

}
export function storageObjectUrl(bucket, storagePath) {
  const { supabaseUrl } = storageConfig();

  return (
    `${supabaseUrl}/storage/v1/object/`
    + `${encodeURIComponent(bucket)}/`
    + encodeStoragePath(storagePath)
  );
}

export async function deleteStorageObject({
  bucket,
  storagePath,
}) {
  const { supabaseUrl, serviceKey } = storageConfig();

  const endpoint =
    `${supabaseUrl}/storage/v1/object/`
    + `${encodeURIComponent(bucket)}/`
    + encodeStoragePath(storagePath);

  const response = await fetch(endpoint, {
    method: 'DELETE',
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
    },
  });

  if (!response.ok && response.status !== 404) {
    const responseText = await response.text();

    throw new Error(
      `Не удалось удалить ${storagePath} из Supabase Storage: `
      + `${response.status} ${responseText}`,
    );
  }
}
