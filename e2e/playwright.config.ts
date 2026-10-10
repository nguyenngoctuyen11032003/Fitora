import { defineConfig, devices } from '@playwright/test';
import { execSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));

// Local stack credentials (computed once in the main process; workers inherit process.env).
if (!process.env.FITORA_E2E_API_URL) {
  const env = JSON.parse(execSync('node scripts/backend.mjs env', { cwd: HERE, encoding: 'utf8' }));
  process.env.FITORA_E2E_API_URL = env.apiUrl;
  process.env.FITORA_E2E_ANON_KEY = env.anonKey;
  process.env.FITORA_E2E_SERVICE_KEY = env.serviceRoleKey;
  process.env.FITORA_E2E_DB_URL = env.dbUrl;
}

const PORT = 5180;
export const BASE_URL = `http://localhost:${PORT}/`;

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  workers: process.env.CI ? 2 : 4,
  retries: process.env.CI ? 1 : 0,
  timeout: 45_000,
  expect: { timeout: 8_000 },
  reporter: [['list'], ['html', { open: 'never' }]],
  globalSetup: './global-setup.ts',
  use: {
    baseURL: BASE_URL,
    locale: 'vi-VN',
    timezoneId: 'Asia/Ho_Chi_Minh',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'mobile', use: { ...devices['Pixel 7'], browserName: 'chromium' } },
    {
      name: 'desktop',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 860 } },
      testMatch: /layout\.spec\.ts|auth\.spec\.ts/,
    },
  ],
  // Fitora dev server pointed at the LOCAL Supabase. Shell env beats Fitora/.env (hosted) in Vite.
  webServer: {
    command: `npm run dev -- --port ${PORT} --strictPort`,
    cwd: path.resolve(HERE, '..'),
    url: BASE_URL,
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      VITE_SUPABASE_URL: process.env.FITORA_E2E_API_URL!,
      VITE_SUPABASE_ANON_KEY: process.env.FITORA_E2E_ANON_KEY!,
    },
  },
});
