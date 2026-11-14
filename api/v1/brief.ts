import type { IncomingMessage, ServerResponse } from 'node:http';
import { buildingBriefPage } from '../../src/core.js';
import { MARKETS, RESPONSE_FORMATS, USE_CLASSES } from '../../src/contracts.js';
import type { Market } from '../../src/types.js';
import { addReferralUrls, enumParam, intParam, listParam, logApi, optionalParam, referralSource, requestUrl, requireGet, sendJson } from '../../src/http-json.js';

// What a kind of building turns on, from the Technical Library, a page at a time.
export default function handler(req: IncomingMessage, res: ServerResponse): void {
  if (!requireGet(req, res)) return;
  const url = requestUrl(req);
  const useClass = enumParam(url, res, 'use_class', USE_CLASSES);
  if (useClass === null) return;
  if (!useClass) return sendJson(res, 400, { error: `use_class is required: ${USE_CLASSES.join(', ')}` }, 'no-store');
  const market = enumParam(url, res, 'market', MARKETS);
  if (market === null) return;
  const format = enumParam(url, res, 'response_format', RESPONSE_FORMATS);
  if (format === null) return;
  const spaces = listParam(url, 'spaces', 8, 120);
  if (typeof spaces === 'string') return sendJson(res, 400, { error: spaces }, 'no-store');
  const section = optionalParam(url, 'framework_section');
  if (section && section.length > 80) return sendJson(res, 400, { error: 'framework_section must be at most 80 characters' }, 'no-store');
  const limit = intParam(url, res, 'limit', 20, 1, 50);
  if (limit === undefined) return;
  const cursor = optionalParam(url, 'cursor');
  if (cursor && !/^[0-9a-z]{1,20}$/.test(cursor)) return sendJson(res, 400, { error: 'cursor must be the nextCursor value from a previous response' }, 'no-store');
  const b = buildingBriefPage({ useClass: useClass as (typeof USE_CLASSES)[number], spaces, market: market as Market | undefined, frameworkSection: section }, limit, cursor, (format ?? 'concise') as 'concise' | 'detailed');
  logApi('brief', { use_class: useClass, spaces: spaces.length, market: market ?? null });
  if ('error' in b) return sendJson(res, 400, { error: b.error }, 'no-store');
  sendJson(res, 200, addReferralUrls(b, referralSource(req)), 'no-store');
}
