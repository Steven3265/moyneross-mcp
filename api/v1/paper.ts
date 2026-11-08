import type { IncomingMessage, ServerResponse } from 'node:http';
import { citationFor, getPaper, paperSection, paperSummary } from '../../src/core.js';
import { addReferralUrls, enumParam, logApi, optionalParam, referralSource, requestUrl, requireGet, sendJson } from '../../src/http-json.js';

export default function handler(req: IncomingMessage, res: ServerResponse): void {
  if (!requireGet(req, res)) return;
  const url = requestUrl(req);
  const ref = optionalParam(url, 'paper') ?? optionalParam(url, 'slug');
  if (!ref || ref.length > 200) return sendJson(res, 400, { error: 'paper is required: a slug (after-rent), a CMP number (CMP 024) or a canonical URL' }, 'no-store');
  const format = enumParam(url, res, 'format', ['summary', 'full'] as const);
  if (format === null) return;
  const sectionRef = optionalParam(url, 'section');
  const found = getPaper(ref);
  logApi('paper', { found: Boolean(found), format: format ?? 'summary', section: Boolean(sectionRef) });
  if (!found) return sendJson(res, 404, { error: 'No Capital Made Physical paper matches that. Use /v1/search or /v1/papers to find one.' }, 'no-store');
  const section = sectionRef ? paperSection(found, sectionRef) : undefined;
  if (sectionRef && !section) return sendJson(res, 404, { error: `No section matches "${sectionRef}".`, sections: found.sections.map((s) => s.heading) }, 'no-store');
  const paper = format === 'full' ? { ...paperSummary(found), contentMarkdown: found.contentMarkdown } : paperSummary(found);
  sendJson(res, 200, addReferralUrls({ paper, section: section ?? null, citation: citationFor(found, sectionRef) }, referralSource(req)), 'no-store');
}
