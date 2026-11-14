import type { IncomingMessage, ServerResponse } from 'node:http';
import { compareSections } from '../../src/core.js';
import { COMPARE_SECTION_IDS, MARKETS } from '../../src/contracts.js';
import type { Market } from '../../src/types.js';
import { addReferralUrls, enumParam, listParam, logApi, referralSource, requestUrl, requireGet, sendJson } from '../../src/http-json.js';

// One section side by side across two to five Technical Library pages.
export default function handler(req: IncomingMessage, res: ServerResponse): void {
  if (!requireGet(req, res)) return;
  const url = requestUrl(req);
  const pages = listParam(url, 'pages', 5, 200);
  if (typeof pages === 'string') return sendJson(res, 400, { error: pages }, 'no-store');
  if (pages.length < 2) return sendJson(res, 400, { error: 'pages needs two to five Technical Library pages, comma-separated or repeated' }, 'no-store');
  const section = enumParam(url, res, 'section', COMPARE_SECTION_IDS);
  if (section === null) return;
  if (!section) return sendJson(res, 400, { error: `section is required: ${COMPARE_SECTION_IDS.join(', ')}` }, 'no-store');
  const market = enumParam(url, res, 'market', MARKETS);
  if (market === null) return;
  const c = compareSections({ pages, section, market: market as Market | undefined });
  logApi('compare', { pages: c.pages.length, section, market: market ?? null });
  if (c.pages.length < 2) return sendJson(res, 404, { error: 'Fewer than two of those pages were found.', unknown: c.unknown }, 'no-store');
  sendJson(res, 200, addReferralUrls(c, referralSource(req)), 'no-store');
}
