import { env } from 'cloudflare:workers';

function binding(name: string) {
  const bindings = env as unknown as Record<string, unknown>;
  const value = bindings[name];
  return typeof value === 'string' ? value : process.env[name];
}

function configuration() {
  const url = binding('SUPABASE_URL')?.trim();
  const secret = binding('SUPABASE_SERVICE_ROLE_KEY')?.trim();

  if (!url || !secret) {
    throw new Error('Supabase admin configuration is missing');
  }

  return {
    url: url.replace(/\/$/, ''),
    secret,
  };
}

export async function adminSupabaseRequest<T>(
  table: string,
  query = '',
): Promise<T> {
  const { url, secret } = configuration();

  const response = await fetch(
    `${url}/rest/v1/${table}${query}`,
    {
      headers: {
        apikey: secret,
        'Accept-Profile': 'atlas',
      },
      cache: 'no-store',
    },
  );

  if (!response.ok) {
    const details = await response.text();

    throw new Error(
      `Supabase Data API ${response.status}: ${details}`,
    );
  }

  return response.json() as Promise<T>;
}

export type DirectAdminDriver = {
  id: string;
  given_name: string;
  family_name: string;
  date_of_birth: string | null;
  nationality: string | null;
};

export function getDirectAdminDrivers(limit = 10) {
  return adminSupabaseRequest<DirectAdminDriver[]>(
    'drivers',
    `?select=id,given_name,family_name,date_of_birth,nationality&order=family_name.asc&limit=${limit}`,
  );
}