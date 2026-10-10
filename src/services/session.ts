import { db } from '@/lib/supabase';
import { FitoraError } from './errors';

/** Current user id from the local session (no network round-trip). */
export async function currentUserId(): Promise<string> {
  const { data } = await db().auth.getSession();
  const id = data.session?.user?.id;
  if (!id) throw new FitoraError('Phiên đăng nhập đã hết hạn. Hãy đăng nhập lại.', 'session_expired');
  return id;
}

export function uuid(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  // RFC4122 v4 fallback
  const b = new Uint8Array(16);
  crypto.getRandomValues(b);
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

/** Postgres numeric may come back as string in some RPC payloads — coerce. */
export function num(v: unknown): number {
  const n = typeof v === 'string' ? Number(v) : (v as number);
  return Number.isFinite(n) ? n : 0;
}
export function numOrNull(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'string' ? Number(v) : (v as number);
  return Number.isFinite(n) ? n : null;
}
