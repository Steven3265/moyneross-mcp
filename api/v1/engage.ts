import type { IncomingMessage, ServerResponse } from 'node:http';
import { engagement } from '../../src/core.js';
import { addReferralUrls, logApi, referralSource, requireGet, sendJson } from '../../src/http-json.js';

export default function handler(req: IncomingMessage, res: ServerResponse): void {
  if (!requireGet(req, res)) return;
  logApi('engage', {});
  sendJson(res, 200, addReferralUrls(engagement(), referralSource(req)), 'no-store');
}
