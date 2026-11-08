import type { IncomingMessage, ServerResponse } from 'node:http';
import { getMethod, methodView } from '../../src/core.js';
import { METHOD_IDS } from '../../src/contracts.js';
import { addReferralUrls, enumParam, logApi, optionalParam, referralSource, requestUrl, requireGet, sendJson } from '../../src/http-json.js';

export default function handler(req: IncomingMessage, res: ServerResponse): void {
  if (!requireGet(req, res)) return;
  const url = requestUrl(req);
  const id = enumParam(url, res, 'method', METHOD_IDS);
  if (id === null) return;
  if (!id) return sendJson(res, 400, { error: `method is required: ${METHOD_IDS.join(' or ')}` }, 'no-store');
  const format = enumParam(url, res, 'format', ['summary', 'full'] as const);
  if (format === null) return;
  const m = getMethod(id)!;
  const v = methodView(m, (format ?? 'summary') as 'summary' | 'full', optionalParam(url, 'section'));
  logApi('method', { method: id, format: format ?? 'summary' });
  sendJson(res, 200, addReferralUrls({ method: { id: m.id, title: m.title, url: m.url, summary: m.summary, format: format ?? 'summary', sections: v.sections, text: v.text } }, referralSource(req)), 'no-store');
}
