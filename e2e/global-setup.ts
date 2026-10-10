// Creates the e2e accounts on the LOCAL stack (fresh each run), seeds data, and
// writes a Playwright storageState per account with the supabase-js session under
// localStorage['fitora.auth'] — so specs start signed in without depending on the login UI.
import { createClient } from '@supabase/supabase-js';
import fs from 'node:fs';
import {
  AUTH_DIR, ORIGIN, PASSWORD, STORAGE_KEY, USERS, admin, apiUrl, seed, storageStatePath, type UserKey,
} from './support/env';

export default async function globalSetup() {
  const sb = admin();
  const { data, error } = await sb.auth.admin.listUsers({ perPage: 200 });
  if (error) throw new Error(`Local Supabase không phản hồi (${error.message}). Chạy: npm run backend:start`);

  fs.mkdirSync(AUTH_DIR, { recursive: true });
  for (const key of Object.keys(USERS) as UserKey[]) {
    const { email, name } = USERS[key];
    const existing = data.users.find((u) => u.email === email);
    if (existing) await sb.auth.admin.deleteUser(existing.id); // cascades to profiles + fit_*
    const created = await sb.auth.admin.createUser({
      email,
      password: PASSWORD,
      email_confirm: true,
      user_metadata: { display_name: name }, // read by handle_new_user → public.profiles
      app_metadata: { fitora_e2e: true },
    });
    if (created.error) throw created.error;

    if (key !== 'fresh') await seed(key);

    const anon = createClient(apiUrl(), process.env.FITORA_E2E_ANON_KEY!, { auth: { persistSession: false } });
    const { data: s, error: e } = await anon.auth.signInWithPassword({ email, password: PASSWORD });
    if (e || !s.session) throw e ?? new Error('no session');
    fs.writeFileSync(storageStatePath(key), JSON.stringify({
      cookies: [],
      origins: [{ origin: ORIGIN, localStorage: [{ name: STORAGE_KEY, value: JSON.stringify(s.session) }] }],
    }));
  }
}
