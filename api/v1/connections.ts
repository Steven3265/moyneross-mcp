import type { IncomingMessage, ServerResponse } from 'node:http';
import { traceConnections } from '../../src/core.js';
import { addReferralUrls, logApi, optionalParam, referralSource, requestUrl, requireGet, sendJson } from '../../src/http-json.js';

// The paper–library graph over REST: what a paper rests on, or what rests on a page.
export default function handler(req: IncomingMessage, res: ServerResponse): void {
  if (!requireGet(req, res)) return;
  const ref = optionalParam(requestUrl(req), 'ref');
  if (!ref) return sendJson(res, 400, { error: 'ref is required: a paper (slug, CMP number or URL) or a Technical Library page (slug, name or URL)' }, 'no-store');
  if (ref.length > 200) return sendJson(res, 400, { error: 'ref must be at most 200 characters' }, 'no-store');
  const c = traceConnections(ref);
  logApi('connections', { found: Boolean(c), kind: c?.from.kind ?? null });
  if (!c) return sendJson(res, 404, { error: 'No paper or Technical Library page matches that. Use /v1/search to find one by topic.' }, 'no-store');
  sendJson(res, 200, addReferralUrls(c, referralSource(req)), 'no-store');
}
