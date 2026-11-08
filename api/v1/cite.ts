import type { IncomingMessage, ServerResponse } from 'node:http';
import { CITATION_STYLES, citationFor, formatCitation, formatTechnicalCitation, getPaper, getTechnicalPage, paperSection, technicalCitationFor, technicalSection, type CitationStyle } from '../../src/core.js';
import { enumParam, logApi, optionalParam, requestUrl, requireGet, sendJson } from '../../src/http-json.js';

export default function handler(req: IncomingMessage, res: ServerResponse): void {
  if (!requireGet(req, res)) return;
  const url = requestUrl(req);
  const ref = optionalParam(url, 'paper');
  if (!ref || ref.length > 200) return sendJson(res, 400, { error: 'paper is required: a paper (slug, CMP number or URL) or a Technical Library page (slug, element name or URL)' }, 'no-store');
  const style = enumParam(url, res, 'style', CITATION_STYLES);
  if (style === null) return;
  const sectionRef = optionalParam(url, 'section');
  const found = getPaper(ref);
  const tech = found ? undefined : getTechnicalPage(ref);
  logApi('cite', { found: Boolean(found || tech), library: Boolean(tech), style: style ?? 'apa' });
  if (tech) {
    if (sectionRef && !technicalSection(tech, sectionRef)) return sendJson(res, 404, { error: `No section matches "${sectionRef}".`, sections: tech.sections.map((x) => x.id) }, 'no-store');
    const ts = (style ?? 'apa') as CitationStyle;
    return sendJson(res, 200, { style: ts, formatted: formatTechnicalCitation(tech, ts, sectionRef), citation: technicalCitationFor(tech, sectionRef) }, 'no-store');
  }
  if (!found) return sendJson(res, 404, { error: 'No Capital Made Physical paper or Technical Library page matches that.' }, 'no-store');
  if (sectionRef && !paperSection(found, sectionRef)) return sendJson(res, 404, { error: `No section matches "${sectionRef}".`, sections: found.sections.map((s) => s.heading) }, 'no-store');
  const s = (style ?? 'apa') as CitationStyle; /* validated above */
  sendJson(res, 200, { style: s, formatted: formatCitation(found, s, sectionRef), citation: citationFor(found, sectionRef) }, 'no-store');
}
