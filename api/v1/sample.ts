import type { IncomingMessage, ServerResponse } from 'node:http';
import { sample, SAMPLE_PARTS, type SamplePart } from '../../src/core.js';
import { addReferralUrls, enumParam, logApi, optionalParam, referralSource, requestUrl, requireGet, sendJson } from '../../src/http-json.js';

export default function handler(req: IncomingMessage, res: ServerResponse): void {
  if (!requireGet(req, res)) return;
  const part = enumParam(requestUrl(req), res, 'part', SAMPLE_PARTS);
  if (part === null) return;
  const section = optionalParam(requestUrl(req), 'section');
  if (section && section.length > 80) return sendJson(res, 400, { error: 'section must be 80 characters or fewer' }, 'no-store');
  logApi('sample', { part: part ?? 'summary', section: Boolean(section) });
  sendJson(res, 200, addReferralUrls({ sample: sample((part ?? 'summary') as SamplePart /* validated above */, section) }, referralSource(req)), 'no-store');
}
