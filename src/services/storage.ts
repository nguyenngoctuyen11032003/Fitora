import { SIGNED_URL_TTL, STORAGE_BUCKET } from '@/lib/config';
import { db } from '@/lib/supabase';
import { FitoraError, run } from './errors';
import { currentUserId, uuid } from './session';

const MAX_BYTES = 5 * 1024 * 1024;
const EXT: Record<string, string> = { 'image/webp': 'webp', 'image/jpeg': 'jpg', 'image/png': 'png' };

/**
 * Real format from the file's first bytes (JPEG FF D8 FF · PNG 89 50 4E 47 · RIFF…WEBP),
 * or null. blob.type can be empty or wrong (renamed files, some Android pickers).
 */
export async function sniffImageType(blob: Blob): Promise<'image/jpeg' | 'image/png' | 'image/webp' | null> {
  let b: Uint8Array;
  try {
    b = new Uint8Array(await blob.slice(0, 12).arrayBuffer());
  } catch {
    return null;
  }
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (b.length >= 4 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'image/png';
  const ascii = (from: number, to: number) => String.fromCharCode(...b.slice(from, to));
  if (b.length >= 12 && ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP') return 'image/webp';
  return null;
}

/** Upload an image to fitora/<uid>/<folder>/<uuid>.<ext>; returns the storage path. */
export async function uploadImage(blob: Blob, folder: 'meals' | 'progress'): Promise<string> {
  if (!blob || !blob.size) throw new FitoraError('Ảnh trống hoặc không hợp lệ.', 'invalid');
  if (blob.size > MAX_BYTES) throw new FitoraError('Ảnh quá lớn (tối đa 5 MB).', 'too_large');
  // Trust the bytes over blob.type: labelling a JPEG as webp (the old default) stores a
  // file browsers may refuse to render; HEIC/GIF would be rejected by the bucket anyway.
  const sniffed = await sniffImageType(blob);
  const type = sniffed ?? (EXT[blob.type] ? blob.type : null);
  if (!type) throw new FitoraError('Định dạng ảnh không được hỗ trợ (chỉ JPG, PNG, WebP).', 'invalid');
  const uid = await currentUserId();
  const path = `${uid}/${folder}/${uuid()}.${EXT[type]}`;
  await run(db().storage.from(STORAGE_BUCKET).upload(path, blob, { contentType: type, upsert: false, cacheControl: '3600' }), 'Không tải ảnh lên được.');
  return path;
}

export async function removeImages(paths: string[]): Promise<void> {
  const list = paths.filter(Boolean);
  if (!list.length) return;
  await run(db().storage.from(STORAGE_BUCKET).remove(list), 'Không xóa được ảnh.');
  forgetSignedUrls(list);
}

/**
 * Signed URLs are cached, but only for the first half of their lifetime: any link a caller
 * gets back (fresh or cached) still has at least ttl/2 to live (30 min by default), so a
 * screen holding on to it won't show a dead image. Callers that keep links longer can read
 * the real expiry with signedUrlExpiry().
 */
interface CachedUrl {
  url: string;
  /** When the link itself stops working (ms epoch). */
  expiresAt: number;
  /** Until when it is handed out from the cache (ms epoch). */
  reuseUntil: number;
}
const cache = new Map<string, CachedUrl>();

function remember(path: string, url: string, ttl: number) {
  const now = Date.now();
  cache.set(path, { url, expiresAt: now + ttl * 1000, reuseUntil: now + (ttl * 1000) / 2 });
}

function cached(path: string): string | undefined {
  const hit = cache.get(path);
  if (hit && hit.reuseUntil > Date.now()) return hit.url;
  if (hit) cache.delete(path);
  return undefined;
}

/** When (ms epoch) the link last returned for `path` stops working; undefined if none is cached. */
export function signedUrlExpiry(path: string): number | undefined {
  return cache.get(path)?.expiresAt;
}

/** Forget cached links (all of them, or only `paths`). */
export function forgetSignedUrls(paths?: string[]): void {
  if (!paths) cache.clear();
  else for (const p of paths) cache.delete(p);
}

export async function signedUrl(path: string, ttl = SIGNED_URL_TTL): Promise<string> {
  const hit = cached(path);
  if (hit) return hit;
  const data = await run(db().storage.from(STORAGE_BUCKET).createSignedUrl(path, ttl), 'Không tải được ảnh.');
  remember(path, data.signedUrl, ttl);
  return data.signedUrl;
}

export async function signedUrls(paths: string[], ttl = SIGNED_URL_TTL): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  const missing: string[] = [];
  for (const p of new Set(paths.filter(Boolean))) {
    const hit = cached(p);
    if (hit) out[p] = hit;
    else missing.push(p);
  }
  if (missing.length) {
    const data = await run(db().storage.from(STORAGE_BUCKET).createSignedUrls(missing, ttl), 'Không tải được ảnh.');
    for (const row of data ?? []) {
      if (row.path && row.signedUrl) {
        out[row.path] = row.signedUrl;
        remember(row.path, row.signedUrl, ttl);
      }
    }
  }
  return out;
}
