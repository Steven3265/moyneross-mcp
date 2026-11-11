import type { IncomingMessage, ServerResponse } from 'node:http';
import { corpusVersion, listPapers, cursorProblem, page, paperListing } from '../../src/core.js';
import { PART_NUMBERS } from '../../src/contracts.js';
import { addReferralUrls, enumParam, intParam, logApi, optionalParam, referralSource, requestUrl, requireGet, sendJson } from '../../src/http-json.js';

export default function handler(req: IncomingMessage, res: ServerResponse): void {
  if (!requireGet(req, res)) return;
  const url = requestUrl(req);
  const part = enumParam(url, res, 'part', PART_NUMBERS);
  if (part === null) return;
  const limit = intParam(url, res, 'limit', 15, 1, 25);
  if (limit === undefined) return;
  const cursor = optionalParam(url, 'cursor');
  if (cursor && !/^[0-9a-z]{1,20}$/.test(cursor)) return sendJson(res, 400, { error: 'cursor must be the nextCursor value from a previous response' }, 'no-store');
  const all = listPapers({ part: part ?? undefined, limit: 60 });
  const badCursor = cursorProblem(cursor, all.length);
  if (badCursor) return sendJson(res, 400, { error: badCursor }, 'no-store');
  const pg = page(all, limit, cursor);
  logApi('papers', { part, count: pg.items.length });
  sendJson(res, 200, addReferralUrls({ count: pg.items.length, total: all.length, nextCursor: pg.nextCursor, corpusVersion, papers: pg.items.map(paperListing) }, referralSource(req)), 'no-store');
}
