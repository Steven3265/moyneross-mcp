import type { IncomingMessage, ServerResponse } from 'node:http';
import { citationFor, corpusVersion, matchDetail, judged, paperForUrl, searchResearch, suggestedQueries, technicalCitationFor, technicalForUrl } from '../../src/core.js';
import { RESPONSE_FORMATS, SCOPES, searchBoundary } from '../../src/contracts.js';
import { addReferralUrls, enumParam, intParam, logApi, optionalParam, referralSource, requestUrl, requireGet, sendJson } from '../../src/http-json.js';

export default function handler(req: IncomingMessage, res: ServerResponse): void {
  if (!requireGet(req, res)) return;
  const url = requestUrl(req);
  const query = optionalParam(url, 'query');
  if (!query || query.length < 2) return sendJson(res, 400, { error: 'query is required and must be at least 2 characters, e.g. ?query=deferred maintenance' }, 'no-store');
  if (query.length > 500) return sendJson(res, 400, { error: 'query must be 500 characters or fewer' }, 'no-store');
  const limit = intParam(url, res, 'limit', 5, 1, 10);
  if (limit === undefined) return;
  const scope = enumParam(url, res, 'scope', SCOPES);
  if (scope === null) return;
  const format = enumParam(url, res, 'response_format', RESPONSE_FORMATS);
  if (format === null) return;
  const s = (scope ?? 'all') as (typeof SCOPES)[number];
  const found = searchResearch({ query, scope: s, limit });
  const { strength, on: judgedOn } = judged(query, found);
  const results = format === 'detailed'
    ? found.map((r) => {
      const p = paperForUrl(r.url);
      if (p) return { ...r, citation: citationFor(p), part: p.part, datePublished: p.datePublished, dateModified: p.dateModified };
      const t = technicalForUrl(r.url);
      return t ? { ...r, citation: technicalCitationFor(t), datePublished: t.publishedAt ?? undefined, dateModified: t.updatedAt ?? undefined } : r;
    })
    : found;
  const match = judgedOn ? matchDetail(query, judgedOn.url) : { coverage: 0, headlineCoverage: 0, matchedTerms: [], missingTerms: [] };
  logApi('search', { queryLength: query.length, scope: s, count: found.length, matchStrength: strength });
  sendJson(res, 200, addReferralUrls({ query, scope: s, count: found.length, matchStrength: strength, match, results, suggestedQueries: strength === 'strong' ? [] : suggestedQueries(found), boundary: searchBoundary(strength), corpusVersion }, referralSource(req)), 'no-store');
}
