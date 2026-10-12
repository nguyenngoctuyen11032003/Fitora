import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { createAuthStorage } from './authPersistence';
import { AUTH_STORAGE_KEY, SUPABASE_ANON_KEY, SUPABASE_URL, isConfigured } from './config';

/**
 * Shared Supabase client (same project + same auth.users as Note_mytasks).
 *
 * PKCE: auth redirects come back as ?code=… (query string) and never collide
 * with the HashRouter (#/diary). storageKey differs from Note_mytasks ('nm.auth')
 * because both apps live on the same *.github.io origin — signing out here must
 * not sign the user out there.
 *
 * `supabase` is null when VITE_SUPABASE_* are missing; App renders a
 * "chưa cấu hình" screen in that case, so pages behind the auth guard can rely
 * on `db()` (throws a Vietnamese error instead of a null deref).
 */
export const supabase: SupabaseClient | null = isConfigured
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        flowType: 'pkce',
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: true,
        storageKey: AUTH_STORAGE_KEY,
        // "Duy trì đăng nhập 7 ngày" — localStorage with a deadline, or sessionStorage.
        storage: createAuthStorage(AUTH_STORAGE_KEY),
      },
    })
  : null;

/** Non-null client or a friendly error. */
export function db(): SupabaseClient {
  if (!supabase) throw new Error('Ứng dụng chưa được cấu hình kết nối máy chủ (Supabase).');
  return supabase;
}
