// Frontend-safe configuration. Only the project URL and the public anon key are
// bundled (Vite exposes VITE_* only). Same Supabase project as Note_mytasks.

export const SUPABASE_URL: string = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim() || '';
export const SUPABASE_ANON_KEY: string = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined)?.trim() || '';

export const isConfigured = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

export const APP_NAME = 'Fitora';
export const STORAGE_BUCKET = 'fitora';
export const AUTH_STORAGE_KEY = 'fitora.auth';
export const SIGNED_URL_TTL = 60 * 60; // 1 hour
export const AI_FUNCTION = 'fitora-food-ai';
export const MIN_PASSWORD = 8;

/**
 * Base URL of the deployed app, keeping a GitHub Pages sub-path (/<repo>/).
 * Used for auth e-mail redirects — location.origin would drop the sub-path.
 */
export function appBaseUrl(): string {
  const u = new URL('./', window.location.href);
  u.search = '';
  u.hash = '';
  return u.href;
}
