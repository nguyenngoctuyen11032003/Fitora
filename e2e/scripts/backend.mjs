// Local Supabase stack for the Fitora e2e tests.
//
//   node scripts/backend.mjs start | stop | status | env
//
// The backend lives in ../../Note_mytasks/supabase (shared by Fitora and Note_mytasks).
// We copy ONLY supabase/{config.toml,migrations,templates,functions} into e2e/.backend/
// and run the CLI there: the CLI would otherwise parse Note_mytasks/.env (secrets,
// not needed locally). Same project_id ⇒ same Docker containers as `supabase start`
// in Note_mytasks, so both ways of starting the stack are interchangeable.
//
// `env` prints JSON {apiUrl, anonKey, serviceRoleKey, dbUrl} of the LOCAL stack only.
import { execSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const E2E = path.resolve(HERE, '..');
const BACKEND_SRC = path.resolve(E2E, '../../Note_mytasks/supabase');
const WORKDIR = path.join(E2E, '.backend');
const CLI = 'npx --yes supabase@2.120.0';

function sync() {
  if (!fs.existsSync(BACKEND_SRC)) throw new Error(`Không thấy backend: ${BACKEND_SRC}`);
  const dst = path.join(WORKDIR, 'supabase');
  fs.rmSync(dst, { recursive: true, force: true });
  fs.mkdirSync(dst, { recursive: true });
  for (const item of ['config.toml', 'migrations', 'templates', 'functions', 'certs']) {
    const from = path.join(BACKEND_SRC, item);
    if (fs.existsSync(from)) fs.cpSync(from, path.join(dst, item), { recursive: true });
  }
}

function cli(args, opts = {}) {
  return execSync(`${CLI} ${args} --workdir "${WORKDIR}"`, { stdio: 'pipe', encoding: 'utf8', ...opts });
}

export function localEnv() {
  const raw = cli('status -o json');
  const s = JSON.parse(raw.slice(raw.indexOf('{')));
  const apiUrl = s.API_URL;
  if (!/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(apiUrl)) {
    throw new Error(`Từ chối: API_URL không phải localhost (${apiUrl}).`);
  }
  return { apiUrl, anonKey: s.ANON_KEY, serviceRoleKey: s.SERVICE_ROLE_KEY, dbUrl: s.DB_URL };
}

const cmd = process.argv[2];
if (cmd === 'start') {
  sync();
  // Fresh schema every start = all migrations applied in order (like CI).
  const r = spawnSync(`${CLI} start --workdir "${WORKDIR}" -x vector,logflare,imgproxy,studio`, {
    shell: true, stdio: 'inherit',
  });
  if (r.status !== 0) process.exit(r.status ?? 1);
  const reset = spawnSync(`${CLI} db reset --local --workdir "${WORKDIR}" --yes`, { shell: true, stdio: 'inherit' });
  if (reset.status !== 0) process.exit(reset.status ?? 1); // migration lỗi ⇒ dừng sớm (CI)
  const { apiUrl } = localEnv();
  console.log(`Local Supabase sẵn sàng: ${apiUrl}`);
} else if (cmd === 'stop') {
  spawnSync(`${CLI} stop --workdir "${WORKDIR}"`, { shell: true, stdio: 'inherit' });
} else if (cmd === 'status') {
  spawnSync(`${CLI} status --workdir "${WORKDIR}"`, { shell: true, stdio: 'inherit' });
} else if (cmd === 'env') {
  process.stdout.write(JSON.stringify(localEnv()));
} else if (cmd) {
  console.error('Dùng: node scripts/backend.mjs start|stop|status|env');
  process.exit(2);
}
