import type { IncomingMessage, ServerResponse } from 'node:http';
import {
  corpusVersion, getTechnicalPage, listTechnicalPages, page, severityScale, technicalCandidates, technicalCitationFor, technicalFrameworkSections,
  technicalListing, technicalMarkdown, technicalSection, technicalSectionName, technicalSummary,
} from '../../src/core.js';
import { PAGE_TYPES } from '../../src/contracts.js';
import { addReferralUrls, enumParam, intParam, logApi, optionalParam, referralSource, requestUrl, requireGet, sendJson } from '../../src/http-json.js';

// The Technical Library over REST. With page: one page (summary, a section, or
// full). Without: the library in framework order, a page at a time.
export default function handler(req: IncomingMessage, res: ServerResponse): void {
  if (!requireGet(req, res)) return;
  const url = requestUrl(req);
  const ref = optionalParam(url, 'page') ?? optionalParam(url, 'slug');
  if (ref !== undefined) {
    if (ref.length > 200) return sendJson(res, 400, { error: 'page must be at most 200 characters: a slug (masonry-brickwork), an element name or a canonical URL' }, 'no-store');
    const format = enumParam(url, res, 'format', ['summary', 'full'] as const);
    if (format === null) return;
    const sectionRef = optionalParam(url, 'section');
    const found = getTechnicalPage(ref);
    logApi('technical', { found: Boolean(found), format: format ?? 'summary', section: Boolean(sectionRef) });
    if (!found) return sendJson(res, 404, { error: 'No Technical Library page matches that. Use /v1/technical to list them or /v1/search with scope=technical.', closest: technicalCandidates(ref).map((p) => p.slug) }, 'no-store');
    const sec = sectionRef ? technicalSection(found, sectionRef) : undefined;
    if (sectionRef && !sec) return sendJson(res, 404, { error: `No section matches "${sectionRef}".`, sections: found.sections.map((x) => x.id) }, 'no-store');
    const summary = technicalSummary(found);
    const body = format === 'full' ? { ...summary, contentMarkdown: technicalMarkdown(found) } : summary;
    return sendJson(res, 200, addReferralUrls({ page: body, section: sec ? { id: sec.id, heading: sec.heading, url: sec.url, text: sec.markdown } : null, citation: technicalCitationFor(found, sectionRef) }, referralSource(req)), 'no-store');
  }
  const sectionName = optionalParam(url, 'section');
  if (sectionName && !technicalSectionName(sectionName)) return sendJson(res, 400, { error: `section must name a framework section: ${technicalFrameworkSections.join('; ')}` }, 'no-store');
  const pageType = enumParam(url, res, 'page_type', PAGE_TYPES);
  if (pageType === null) return;
  const limit = intParam(url, res, 'limit', 15, 1, 50);
  if (limit === undefined) return;
  const cursor = optionalParam(url, 'cursor');
  if (cursor && !/^[0-9a-z]{1,20}$/.test(cursor)) return sendJson(res, 400, { error: 'cursor must be the nextCursor value from a previous response' }, 'no-store');
  const all = listTechnicalPages({ section: sectionName, pageType: pageType ?? undefined });
  const pg = page(all, limit, cursor);
  logApi('technical_list', { section: Boolean(sectionName), count: pg.items.length });
  sendJson(res, 200, addReferralUrls({ count: pg.items.length, total: all.length, nextCursor: pg.nextCursor, corpusVersion, sections: technicalFrameworkSections, severityScale: severityScale(), pages: pg.items.map(technicalListing) }, referralSource(req)), 'no-store');
}
