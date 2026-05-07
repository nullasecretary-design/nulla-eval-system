import 'server-only';
import { createHmac, timingSafeEqual } from 'crypto';
import { cookies } from 'next/headers';

const SECRET = process.env.SESSION_SECRET;
if (!SECRET) {
  throw new Error('Missing SESSION_SECRET');
}

const SESSION_COOKIE = 'session';
const PENDING_BIND_COOKIE = 'pending_bind';

export type Session = {
  employee_number: string;
  line_user_id: string;
};

export type PendingBind = {
  line_user_id: string;
  line_display_name: string;
};

// ---------------------------------------------------------------------------
// HMAC sign / verify
// ---------------------------------------------------------------------------

function sign(data: string): string {
  return createHmac('sha256', SECRET!).update(data).digest('base64url');
}

function verify(data: string, sig: string): boolean {
  const expected = sign(data);
  if (expected.length !== sig.length) return false;
  return timingSafeEqual(Buffer.from(expected), Buffer.from(sig));
}

function encode<T>(payload: T): string {
  const data = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${data}.${sign(data)}`;
}

function decode<T>(value: string): T | null {
  const dot = value.lastIndexOf('.');
  if (dot < 0) return null;
  const data = value.slice(0, dot);
  const sig = value.slice(dot + 1);
  if (!data || !sig) return null;
  if (!verify(data, sig)) return null;
  try {
    return JSON.parse(Buffer.from(data, 'base64url').toString()) as T;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Long-term session (after binding)
// ---------------------------------------------------------------------------

export async function setSession(session: Session): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, encode(session), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 30, // 30 days
    path: '/',
  });
}

export async function getSession(): Promise<Session | null> {
  const cookieStore = await cookies();
  const value = cookieStore.get(SESSION_COOKIE)?.value;
  if (!value) return null;
  return decode<Session>(value);
}

export async function clearSession(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE);
}

// ---------------------------------------------------------------------------
// Short-lived "pending bind" cookie
// (set after LINE OAuth, cleared once binding succeeds or expires)
// ---------------------------------------------------------------------------

export async function setPendingBind(pending: PendingBind): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(PENDING_BIND_COOKIE, encode(pending), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 15, // 15 minutes
    path: '/',
  });
}

export async function getPendingBind(): Promise<PendingBind | null> {
  const cookieStore = await cookies();
  const value = cookieStore.get(PENDING_BIND_COOKIE)?.value;
  if (!value) return null;
  return decode<PendingBind>(value);
}

export async function clearPendingBind(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(PENDING_BIND_COOKIE);
}
