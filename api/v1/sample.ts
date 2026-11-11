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
  const s = sample((part ?? 'summary') as SamplePart /* validated above */, section);
  if ('unknownSection' in s && s.unknownSection) return sendJson(res, 404, { error: s.unknownSection }, 'no-store');
  sendJson(res, 200, addReferralUrls({ sample: s }, referralSource(req)), 'no-store');
}
