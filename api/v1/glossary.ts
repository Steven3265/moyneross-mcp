import type { IncomingMessage, ServerResponse } from 'node:http';
import { translateTerm } from '../../src/core.js';
import { MARKETS } from '../../src/contracts.js';
import type { Market } from '../../src/types.js';
import { addReferralUrls, enumParam, logApi, optionalParam, referralSource, requestUrl, requireGet, sendJson } from '../../src/http-json.js';

// One term under its three markets' names, from the published glossary.
export default function handler(req: IncomingMessage, res: ServerResponse): void {
  if (!requireGet(req, res)) return;
  const url = requestUrl(req);
  const term = (optionalParam(url, 'term') ?? '').trim();
  if (term.length < 2 || term.length > 120) return sendJson(res, 400, { error: 'term is required: 2 to 120 characters, in any market\'s wording' }, 'no-store');
  const market = enumParam(url, res, 'market', MARKETS);
  if (market === null) return;
  const t = translateTerm({ term, market: market as Market | undefined });
  logApi('glossary', { match: t.match, count: t.count, market: market ?? null });
  sendJson(res, 200, addReferralUrls(t, referralSource(req)), 'no-store');
}
