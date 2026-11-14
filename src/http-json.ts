import type { IncomingMessage, ServerResponse } from 'node:http';

// HEAD runs normal route validation and headers; only its body is suppressed.
const headResponses = new WeakSet<ServerResponse>();

const REFERRAL_SOURCES = {
  webmcp: 'moyneross-webmcp',
  rest: 'moyneross-rest',
} as const;

export function publicJsonHeaders(res: ServerResponse, cacheControl = 'public, max-age=300, s-maxage=3600', contentType = 'application/json; charset=utf-8'): void {
  res.setHeader('Content-Type', contentType);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept, If-None-Match, X-MoyneRoss-Source');
  // Browser clients can read the ETag and revalidate (server card, OpenAPI).
  res.setHeader('Access-Control-Expose-Headers', 'ETag');
  // Cache successful CORS preflights so browser-agent calls do not pay an
  // OPTIONS round-trip on every invocation. Browsers may apply a lower cap.
  res.setHeader('Access-Control-Max-Age', '86400');
  res.setHeader('Cache-Control', cacheControl);
  res.setHeader('X-Content-Type-Options', 'nosniff');
}

export function sendJson(res: ServerResponse, status: number, body: unknown, cacheControl?: string, contentType?: string): void {
  res.statusCode = status;
  publicJsonHeaders(res, cacheControl, contentType);
  res.end(headResponses.has(res) ? undefined : JSON.stringify(body));
}

export function handleOptions(req: IncomingMessage, res: ServerResponse): boolean {
  if (req.method !== 'OPTIONS') return false;
  res.statusCode = 204;
  publicJsonHeaders(res, 'no-store');
  res.end();
  return true;
}

export function handleHead(req: IncomingMessage, res: ServerResponse): boolean {
  if (req.method !== 'HEAD') return false;
  headResponses.add(res);
  return true;
}

export function requireGet(req: IncomingMessage, res: ServerResponse): boolean {
  if (handleOptions(req, res)) return false;
  if (handleHead(req, res)) return true;
  if (req.method === 'GET') return true;
  res.setHeader('Allow', 'GET, HEAD, OPTIONS');
  sendJson(res, 405, { error: 'Method not allowed', allowed: ['GET', 'HEAD', 'OPTIONS'] }, 'no-store');
  return false;
}

export function requestUrl(req: IncomingMessage): URL {
  const host = req.headers.host || 'mcp.moyneross.com';
  return new URL(req.url || '/', `https://${host}`);
}

export function optionalParam(url: URL, name: string): string | undefined {
  const value = url.searchParams.get(name)?.trim();
  return value || undefined;
}

export function enumParam(url: URL, res: ServerResponse, name: string, allowed: readonly string[]): string | undefined | null {
  const value = optionalParam(url, name);
  if (value === undefined) return undefined;
  if (!allowed.includes(value)) {
    sendJson(res, 400, { error: `${name} must be one of: ${allowed.join(', ')}` }, 'no-store');
    return null;
  }
  return value;
}

export function booleanParam(url: URL, res: ServerResponse, name: string, fallback: boolean): boolean | undefined {
  const value = url.searchParams.get(name);
  if (value === null || value.trim() === '') return fallback;
  const normalized = value.trim().toLowerCase();
  if (normalized === 'true') return true;
  if (normalized === 'false') return false;
  sendJson(res, 400, { error: `${name} must be true or false` }, 'no-store');
  return undefined;
}

export function repeatedStringParam(
  url: URL,
  res: ServerResponse,
  name: string,
  options: { maxItems: number; minLength: number; maxLength: number },
): string[] | undefined {
  const raw = url.searchParams.getAll(name);
  if (raw.length > options.maxItems) {
    sendJson(res, 400, { error: `${name} may be supplied at most ${options.maxItems} times` }, 'no-store');
    return undefined;
  }
  const values = raw.map((value) => value.trim()).filter(Boolean);
  for (const value of values) {
    if (value.length < options.minLength || value.length > options.maxLength) {
      sendJson(res, 400, { error: `${name} values must be between ${options.minLength} and ${options.maxLength} characters` }, 'no-store');
      return undefined;
    }
  }
  return values;
}

export function intParam(url: URL, res: ServerResponse, name: string, fallback: number, min: number, max: number): number | undefined {
  const value = url.searchParams.get(name);
  if (value === null || value.trim() === '') return fallback;

  const trimmed = value.trim();
  if (!/^-?\d+$/.test(trimmed)) {
    sendJson(res, 400, { error: `${name} must be an integer between ${min} and ${max}` }, 'no-store');
    return undefined;
  }

  const raw = Number(trimmed);
  if (!Number.isSafeInteger(raw) || raw < min || raw > max) {
    sendJson(res, 400, { error: `${name} must be an integer between ${min} and ${max}` }, 'no-store');
    return undefined;
  }

  return raw;
}

export function referralSource(req: IncomingMessage): string {
  const value = req.headers['x-moyneross-source'];
  const raw = Array.isArray(value) ? value[0] : value;
  return raw?.trim().toLowerCase() === 'webmcp' ? REFERRAL_SOURCES.webmcp : REFERRAL_SOURCES.rest;
}

export function referralUrl(url: string, source: string): string {
  try {
    const parsed = new URL(url);
    parsed.searchParams.set('utm_source', source);
    return parsed.toString();
  } catch {
    const separator = url.includes('?') ? '&' : '?';
    return `${url}${separator}utm_source=${encodeURIComponent(source)}`;
  }
}

export function addReferralUrls<T>(value: T, source: string): T {
  if (Array.isArray(value)) return value.map((item) => addReferralUrls(item, source)) as T;
  if (!value || typeof value !== 'object') return value;

  const input = value as Record<string, unknown>;
  const output: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(input)) {
    output[key] = addReferralUrls(item, source);
    // Beside each moyneross.com link (canonicalUrl on papers, url on search
    // results and methods), an attributed referralUrl; the canonical link an
    // assistant should cite is never altered.
    if ((key === 'canonicalUrl' || key === 'url') && typeof item === 'string' && /^https:\/\/moyneross\.com\//.test(item)) {
      output.referralUrl = referralUrl(item, source);
    }
  }
  return output as T;
}

export function logApi(route: string, detail: Record<string, unknown>): void {
  try {
    console.error(JSON.stringify({ evt: 'rest_call', route, ...detail, at: new Date().toISOString() }));
  } catch {
    // Telemetry must never interfere with a read-only response.
  }
}

// A list parameter, comma-separated or repeated (?pages=a,b or ?pages=a&pages=b).
// Returns the values, or an error message.
export function listParam(url: URL, name: string, max: number, maxLength: number): string[] | string {
  const values = url.searchParams.getAll(name).flatMap((v) => v.split(',')).map((v) => v.trim()).filter(Boolean);
  if (values.length > max) return `${name} takes at most ${max} values`;
  if (values.some((v) => v.length > maxLength)) return `each ${name} value must be at most ${maxLength} characters`;
  return values;
}
