// Remembers the e-mail of the last successful sign-in / sign-up on this device so the
// login and forgot-password forms are prefilled ("don't make me type it again").
// Only the address is stored — never the password.

const KEY = 'fitora.lastEmail';

/** Trimmed, lower-cased address if it looks like an e-mail, else null. */
export function normalizeEmail(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const v = value.trim().toLowerCase();
  return v.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) ? v : null;
}

export function readLastEmail(storage: Pick<Storage, 'getItem'> | undefined = safeStorage()): string {
  try {
    return normalizeEmail(storage?.getItem(KEY)) ?? '';
  } catch {
    return '';
  }
}

export function rememberEmail(value: string, storage: Pick<Storage, 'setItem'> | undefined = safeStorage()): void {
  const v = normalizeEmail(value);
  if (!v) return;
  try {
    storage?.setItem(KEY, v);
  } catch {
    /* private mode / quota */
  }
}

function safeStorage(): Storage | undefined {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : undefined;
  } catch {
    return undefined;
  }
}
