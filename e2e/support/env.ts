// Test accounts and local-stack helpers shared by global setup and the specs.
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Page } from '@playwright/test';
import pg from 'pg';

export const E2E_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const AUTH_DIR = path.join(E2E_DIR, '.auth');
export const SEED_FILE = path.resolve(E2E_DIR, '../../Note_mytasks/supabase/seed_fitora_local.sql');
export const ORIGIN = 'http://localhost:5180';
export const STORAGE_KEY = 'fitora.auth'; // Note_mytasks uses 'nm.auth'
export const PASSWORD = 'Fitora-e2e-2026!';

export const USERS = {
  /** Fully onboarded, 14 days of data (seed_fitora_local.sql). */
  coach: { email: 'coach@fitora.test', name: 'Huấn Luyện Viên' },
  /** Account with no fit_profiles row → must be sent to /onboarding. */
  fresh: { email: 'fresh@fitora.test', name: 'Người Mới' },
  /** Second onboarded account, for isolation (RLS) checks. */
  other: { email: 'other@fitora.test', name: 'Người Khác' },
  /** Seeded account used ONLY by smart.spec (scan → saved food → re-log, meal templates). */
  smart: { email: 'smart@fitora.test', name: 'Người Dùng Thông Minh' },
  /** Seeded account used ONLY by smart-edge.spec (AI errors, offline, double taps, input limits). */
  edge: { email: 'edge@fitora.test', name: 'Người Thử Giới Hạn' },
  /** Onboarded account whose food data smart-edge.spec wipes (empty states of the smart features). */
  empty: { email: 'empty@fitora.test', name: 'Người Chưa Lưu Món' },
} as const;
export type UserKey = keyof typeof USERS;

function env(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name} missing — run tests through playwright.config.ts`);
  return v;
}
export const apiUrl = () => {
  const u = env('FITORA_E2E_API_URL');
  if (!/^http:\/\/(127\.0\.0\.1|localhost)/.test(u)) throw new Error('Refusing to test a non-local backend');
  return u;
};

/** Service-role client for the LOCAL stack (bypasses RLS) — test assertions & setup only. */
export function admin(): SupabaseClient {
  return createClient(apiUrl(), env('FITORA_E2E_SERVICE_KEY'), { auth: { persistSession: false, autoRefreshToken: false } });
}

/** Signed-in anon client as a test user (RLS applies) — like the browser. */
export async function userClient(key: UserKey): Promise<SupabaseClient> {
  const c = createClient(apiUrl(), env('FITORA_E2E_ANON_KEY'), { auth: { persistSession: false, autoRefreshToken: false } });
  const { error } = await c.auth.signInWithPassword({ email: USERS[key].email, password: PASSWORD });
  if (error) throw error;
  return c;
}

export async function userId(key: UserKey): Promise<string> {
  const { data, error } = await admin().auth.admin.listUsers({ perPage: 200 });
  if (error) throw error;
  const u = data.users.find((x) => x.email === USERS[key].email);
  if (!u) throw new Error(`user ${key} not found`);
  return u.id;
}

export async function withDb<T>(fn: (c: pg.Client) => Promise<T>): Promise<T> {
  const c = new pg.Client({ connectionString: env('FITORA_E2E_DB_URL') });
  await c.connect();
  try {
    return await fn(c);
  } finally {
    await c.end();
  }
}

/** Rebuild the seeded data of an e2e account (only works for fitora_e2e accounts). */
export async function seed(key: UserKey): Promise<void> {
  const sql = fs.readFileSync(SEED_FILE, 'utf8');
  await withDb(async (c) => {
    await c.query('begin');
    await c.query(`select set_config('app.fit_email', $1, true)`, [USERS[key].email]);
    await c.query(sql);
    await c.query('commit');
  });
}

/** Removes every fit_* row of an account (fresh onboarding state). */
export async function wipeFit(key: UserKey): Promise<void> {
  const id = await userId(key);
  await withDb(async (c) => {
    for (const t of ['fit_meal_entries', 'fit_meal_templates', 'fit_workouts', 'fit_workout_templates', 'fit_custom_foods', 'fit_daily_logs',
      'fit_body_measurements', 'fit_progress_photos', 'fit_ai_usage', 'fit_profiles']) {
      await c.query(`delete from public.${t} where user_id = $1`, [id]);
    }
  });
}

/** Removes the food data (diary, saved foods, meal templates) but keeps the profile: an onboarded, empty account. */
export async function wipeFood(key: UserKey): Promise<void> {
  const id = await userId(key);
  await withDb(async (c) => {
    for (const t of ['fit_meal_entries', 'fit_meal_templates', 'fit_custom_foods']) {
      await c.query(`delete from public.${t} where user_id = $1`, [id]);
    }
  });
}

/** Today in Asia/Ho_Chi_Minh as YYYY-MM-DD (matches the browser timezone in the config). */
export function todayVN(offsetDays = 0): string {
  const d = new Date(Date.now() + 7 * 3600_000 + offsetDays * 86_400_000);
  return d.toISOString().slice(0, 10);
}

export const storageStatePath = (key: UserKey) => path.join(AUTH_DIR, `${key}.json`);

/* ------------------------------------------------------------------ */
/* AI scan mocks (the edge function cannot run on the local stack)    */
/* ------------------------------------------------------------------ */

export interface MockDish {
  name: string;
  ingredients?: string[];
  quantity: number;
  unit: string;
  grams: number;
  kcal: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  fiber_g: number;
  confidence?: number;
}

/** A realistic fitora-food-ai 200 body (see docs/PLAN.md §3). */
export function aiResponse(dishes: MockDish[], notes = 'Ước tính theo khẩu phần trung bình.') {
  return { dishes: dishes.map((d) => ({ ingredients: [], confidence: 0.86, ...d })), is_food: true, notes };
}

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization, x-client-info, apikey, content-type',
  'access-control-allow-methods': 'POST, OPTIONS',
};

type AiReply = { status?: number; body: unknown };

/**
 * Intercepts POST /functions/v1/fitora-food-ai. `reply` is the 200 body, or a function of
 * the call number returning {status, body}. Returns a counter so a spec can assert that a
 * re-log did NOT need the AI.
 */
export async function mockFoodAi(page: Page, reply: unknown | ((n: number) => AiReply)): Promise<{ calls: () => number }> {
  let n = 0;
  await page.route('**/functions/v1/fitora-food-ai', async (route) => {
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
    n += 1;
    const r: AiReply = typeof reply === 'function' ? (reply as (n: number) => AiReply)(n) : { status: 200, body: reply };
    await route.fulfill({ status: r.status ?? 200, contentType: 'application/json', headers: CORS, body: JSON.stringify(r.body) });
  });
  return { calls: () => n };
}

/** A real 480x360 JPEG of a "bowl" drawn on a canvas in the page (decodable by compressImage). */
export async function foodPhoto(page: Page): Promise<{ name: string; mimeType: string; buffer: Buffer }> {
  const b64 = await page.evaluate(() => {
    const c = document.createElement('canvas');
    c.width = 480;
    c.height = 360;
    const g = c.getContext('2d')!;
    g.fillStyle = '#6b3b1f';
    g.fillRect(0, 0, 480, 360);
    g.fillStyle = '#f3e3c3';
    g.beginPath();
    g.arc(240, 180, 140, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#c0542b';
    g.beginPath();
    g.arc(240, 180, 100, 0, Math.PI * 2);
    g.fill();
    return c.toDataURL('image/jpeg', 0.85).split(',')[1];
  });
  return { name: 'bua-trua.jpg', mimeType: 'image/jpeg', buffer: Buffer.from(b64, 'base64') };
}

/** Horizontal overflow of the document and of the app's scroll area (both must be ≤ 0). */
export async function overflowX(page: Page): Promise<{ doc: number; main: number }> {
  return page.evaluate(() => {
    const main = document.querySelector('#fitora-app main') as HTMLElement | null;
    return {
      doc: document.documentElement.scrollWidth - window.innerWidth,
      main: main ? main.scrollWidth - main.clientWidth : 0,
    };
  });
}
