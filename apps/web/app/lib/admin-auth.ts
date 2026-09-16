import { createHmac, timingSafeEqual } from 'node:crypto';
import { env } from 'cloudflare:workers';
import { cookies } from 'next/headers';

const sessionCookieName = 'f1_atlas_admin_session';
const sessionLifetimeSeconds = 60 * 60 * 8;

type AdminSession = {
  email: string;
  expiresAt: number;
};

function encode(value: string) {
  return Buffer.from(value, 'utf8').toString('base64url');
}

function decode(value: string) {
  return Buffer.from(value, 'base64url').toString('utf8');
}

function signature(payload: string, secret: string) {
  return createHmac('sha256', secret).update(payload).digest('base64url');
}

function safeEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

function configuration() {
  const bindings = env as unknown as Record<string, unknown>;
  const value = (name: string) => typeof bindings[name] === 'string' ? bindings[name] : process.env[name];
  const email = value('ADMIN_EMAIL')?.trim().toLocaleLowerCase('en-US');
  const password = value('ADMIN_PASSWORD')?.trim();
  const secret = value('ADMIN_SESSION_SECRET')?.trim();
  return email && password && secret ? { email, password, secret } : null;
}

export function isAdminConfigured() {
  return configuration() !== null;
}

export function verifyAdminCredentials(email: string, password: string) {
  const config = configuration();
  if (!config) return false;
  return safeEqual(email.trim().toLocaleLowerCase('en-US'), config.email) && safeEqual(password, config.password);
}

export async function createAdminSession(email: string) {
  const config = configuration();
  if (!config) throw new Error('Локальная авторизация администратора не настроена');
  const session: AdminSession = { email, expiresAt: Math.floor(Date.now() / 1000) + sessionLifetimeSeconds };
  const payload = encode(JSON.stringify(session));
  const value = `${payload}.${signature(payload, config.secret)}`;
  const cookieStore = await cookies();
  cookieStore.set(sessionCookieName, value, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: sessionLifetimeSeconds,
    path: '/',
  });
}

export async function clearAdminSession() {
  const cookieStore = await cookies();
  cookieStore.delete(sessionCookieName);
}

export async function getAdminSession(): Promise<AdminSession | null> {
  const config = configuration();
  if (!config) return null;
  const value = (await cookies()).get(sessionCookieName)?.value;
  if (!value) return null;
  const separator = value.lastIndexOf('.');
  if (separator < 1) return null;
  const payload = value.slice(0, separator);
  const suppliedSignature = value.slice(separator + 1);
  if (!safeEqual(suppliedSignature, signature(payload, config.secret))) return null;
  try {
    const session = JSON.parse(decode(payload)) as Partial<AdminSession>;
    if (session.email !== config.email || typeof session.expiresAt !== 'number' || session.expiresAt <= Date.now() / 1000) return null;
    return session as AdminSession;
  } catch {
    return null;
  }
}
