import type { Response, Request } from 'express';

export const JWT_COOKIE_NAME = 'dreampulse_jwt';
export const SESSION_COOKIE_NAME = 'dreampulse_session';

// Parse Cookie header without external deps (avoid cookie-parser for minimal footprint)
export function parseCookies(req: Request): Record<string, string> {
  const header = (req.headers.cookie as string | undefined) || '';
  if (!header) return {};
  const out: Record<string, string> = {};
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq === -1) continue;
    const k = part.slice(0, eq).trim();
    const v = part.slice(eq + 1).trim();
    if (!k) continue;
    try {
      out[k] = decodeURIComponent(v);
    } catch {
      out[k] = v;
    }
  }
  return out;
}

export function getCookie(req: Request, name: string): string | undefined {
  return parseCookies(req)[name];
}

/**
 * Appends a Set-Cookie header. Uses manual header append to avoid overwriting
 * existing Set-Cookie values (Express res.cookie would require cookie-parser).
 */
function appendSetCookie(res: Response, cookieStr: string): void {
  const prev = res.getHeader('Set-Cookie');
  if (!prev) {
    res.setHeader('Set-Cookie', cookieStr);
  } else if (Array.isArray(prev)) {
    res.setHeader('Set-Cookie', [...prev, cookieStr]);
  } else {
    res.setHeader('Set-Cookie', [String(prev), cookieStr]);
  }
}

/**
 * Builds a hardened cookie string.
 * Production: Secure + HttpOnly + SameSite=Lax (CSRF hardened).
 * SameSite=Lax prevents cross-site request forgery attacks by ensuring the cookie is not sent
 * on cross-site subrequests (fetch, XHR, images, frames) initiated from third-party origins.
 * In local dev (http) we keep SameSite=Lax without Secure so cookies work over http://localhost.
 */
function buildCookieString(
  name: string,
  value: string,
  opts: { maxAgeSec?: number; expires?: Date; path?: string; httpOnly?: boolean },
): string {
  const isHttps = process.env.NODE_ENV === 'production' || process.env.FRONTEND_ORIGIN?.startsWith('https');
  // SameSite=Lax prevents CSRF attacks by disallowing cookie transmission on cross-origin subrequests
  const sameSite = 'Lax';
  const secure = isHttps ? '; Secure' : '';
  const parts = [
    `${name}=${encodeURIComponent(value)}`,
    `Path=${opts.path || '/'}`,
    opts.httpOnly !== false ? 'HttpOnly' : '',
    `SameSite=${sameSite}`,
    secure,
    opts.maxAgeSec !== undefined ? `Max-Age=${Math.max(0, Math.floor(opts.maxAgeSec))}` : '',
    opts.expires ? `Expires=${opts.expires.toUTCString()}` : '',
  ].filter(Boolean);
  return parts.join('; ');
}

export function setAuthCookie(res: Response, token: string, expiresAtSec: number): void {
  const nowSec = Math.floor(Date.now() / 1000);
  const maxAge = Math.max(60, expiresAtSec - nowSec);
  const cookie = buildCookieString(JWT_COOKIE_NAME, token, {
    maxAgeSec: maxAge,
    httpOnly: true,
    path: '/',
  });
  appendSetCookie(res, cookie);
}

export function clearAuthCookie(res: Response): void {
  const cookie = buildCookieString(JWT_COOKIE_NAME, '', {
    maxAgeSec: 0,
    expires: new Date(0),
    httpOnly: true,
    path: '/',
  });
  appendSetCookie(res, cookie);
}

export function setSessionCookie(res: Response, sessionId: string, expiresAtIso: string | undefined): void {
  let maxAge: number | undefined;
  if (expiresAtIso) {
    const expMs = new Date(expiresAtIso).getTime();
    if (Number.isFinite(expMs)) {
      maxAge = Math.max(60, Math.floor((expMs - Date.now()) / 1000));
    }
  }
  if (maxAge === undefined) maxAge = 24 * 3600;
  const cookie = buildCookieString(SESSION_COOKIE_NAME, sessionId, {
    maxAgeSec: maxAge,
    httpOnly: true,
    path: '/',
  });
  appendSetCookie(res, cookie);
}

export function clearSessionCookie(res: Response): void {
  const cookie = buildCookieString(SESSION_COOKIE_NAME, '', {
    maxAgeSec: 0,
    expires: new Date(0),
    httpOnly: true,
    path: '/',
  });
  appendSetCookie(res, cookie);
}
