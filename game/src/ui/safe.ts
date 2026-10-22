// Safe access to engine code that may still be a stub ("not implemented") or may throw on odd state.
// Rule for every screen: derived reads go through safe(), actions go through store.act().

const seen = new Set<string>();

/** Run a derived read; on any throw return the fallback. Logs each distinct message once in dev. */
export function safe<T>(fn: () => T, fallback: T): T {
  try {
    const v = fn();
    return v === undefined ? fallback : v;
  } catch (e) {
    const m = errText(e);
    if (!seen.has(m)) {
      seen.add(m);
      if (import.meta.env?.DEV) console.debug('[safe] fallback:', m);
    }
    return fallback;
  }
}

/** Like safe(), but tells you whether the engine answered (for "not available yet" labels). */
export function tryRead<T>(fn: () => T): { ok: true; value: T } | { ok: false; error: string } {
  try {
    return { ok: true, value: fn() };
  } catch (e) {
    return { ok: false, error: errText(e) };
  }
}

export function errText(e: unknown): string {
  if (e instanceof Error) return e.message || String(e);
  if (typeof e === 'string') return e;
  try {
    return JSON.stringify(e);
  } catch {
    return 'Unknown error';
  }
}

export function isStubError(e: unknown): boolean {
  return /not implemented/i.test(errText(e));
}

/** Player-facing text for an exception thrown by an engine action. */
export function friendlyError(e: unknown): string {
  const m = errText(e);
  if (/not implemented/i.test(m)) {
    const what = m.replace(/not implemented/i, '').replace(/[.:]/g, '').trim();
    return what ? `Not available yet: ${what} is still being built.` : 'Not available yet: this part of the game is still being built.';
  }
  return m;
}
