// Invite links: `uroki://join?code=K7QMZP` (deep link) and the server's web page `…/app/i/K7QMZP` (QR / share).
export const CODE_LEN = 6;

/** Upper-case letters and digits only, at most 6 (what the join boxes show). */
export const normalizeCode = (v: string) =>
  v
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, CODE_LEN);

/**
 * The invite code inside a deep link, an invite web link or a shared message; null when there is none.
 * A bare 6-character code is returned as is.
 */
export function codeFromLink(input: string | null | undefined): string | null {
  if (!input) return null;
  const s = String(input).trim();
  const q = s.match(/[?&]code=([A-Za-z0-9]{6})(?![A-Za-z0-9])/);
  if (q) return q[1].toUpperCase();
  const path = s.match(/\/i\/([A-Za-z0-9]{6})(?![A-Za-z0-9])/);
  if (path) return path[1].toUpperCase();
  if (/^[A-Za-z0-9]{6}$/.test(s)) return s.toUpperCase();
  return null;
}

/** `code` from expo-router params (may arrive as an array when repeated). */
export function codeFromParam(v: string | string[] | undefined): string | null {
  const raw = Array.isArray(v) ? v[0] : v;
  if (!raw) return null;
  const c = normalizeCode(raw);
  return c.length === CODE_LEN ? c : null;
}

/** The deep link for a code (scheme from app.json). */
export const joinLink = (code: string, scheme = 'uroki') => `${scheme}://join?code=${encodeURIComponent(code)}`;
