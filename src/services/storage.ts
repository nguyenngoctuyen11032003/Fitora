import { SIGNED_URL_TTL, STORAGE_BUCKET } from '@/lib/config';
import { db } from '@/lib/supabase';
import { FitoraError, run } from './errors';
import { currentUserId, uuid } from './session';

const MAX_BYTES = 5 * 1024 * 1024;
const EXT: Record<string, string> = { 'image/webp': 'webp', 'image/jpeg': 'jpg', 'image/png': 'png' };

/** Upload an image to fitora/<uid>/<folder>/<uuid>.<ext>; returns the storage path. */
export async function uploadImage(blob: Blob, folder: 'meals' | 'progress'): Promise<string> {
  if (!blob || !blob.size) throw new FitoraError('Ảnh trống hoặc không hợp lệ.', 'invalid');
  if (blob.size > MAX_BYTES) throw new FitoraError('Ảnh quá lớn (tối đa 5 MB).', 'too_large');
  const type = EXT[blob.type] ? blob.type : 'image/webp';
  const uid = await currentUserId();
  const path = `${uid}/${folder}/${uuid()}.${EXT[type]}`;
  await run(db().storage.from(STORAGE_BUCKET).upload(path, blob, { contentType: type, upsert: false, cacheControl: '3600' }), 'Không tải ảnh lên được.');
  return path;
}

export async function removeImages(paths: string[]): Promise<void> {
  const list = paths.filter(Boolean);
  if (!list.length) return;
  await run(db().storage.from(STORAGE_BUCKET).remove(list), 'Không xóa được ảnh.');
}

// Signed URLs are cached for most of their lifetime so lists don't re-sign on every render.
const cache = new Map<string, { url: string; exp: number }>();

export async function signedUrl(path: string, ttl = SIGNED_URL_TTL): Promise<string> {
  const hit = cache.get(path);
  if (hit && hit.exp > Date.now()) return hit.url;
  const data = await run(db().storage.from(STORAGE_BUCKET).createSignedUrl(path, ttl), 'Không tải được ảnh.');
  cache.set(path, { url: data.signedUrl, exp: Date.now() + (ttl - 120) * 1000 });
  return data.signedUrl;
}

export async function signedUrls(paths: string[], ttl = SIGNED_URL_TTL): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  const missing: string[] = [];
  for (const p of paths.filter(Boolean)) {
    const hit = cache.get(p);
    if (hit && hit.exp > Date.now()) out[p] = hit.url;
    else missing.push(p);
  }
  if (missing.length) {
    const data = await run(db().storage.from(STORAGE_BUCKET).createSignedUrls(missing, ttl), 'Không tải được ảnh.');
    for (const row of data ?? []) {
      if (row.path && row.signedUrl) {
        out[row.path] = row.signedUrl;
        cache.set(row.path, { url: row.signedUrl, exp: Date.now() + (ttl - 120) * 1000 });
      }
    }
  }
  return out;
}
