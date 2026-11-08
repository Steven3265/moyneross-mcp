import { createHash } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { snapshot } from '../src/core.js';
import { requireGet, sendJson } from '../src/http-json.js';
import { SERVER_VERSION } from '../src/identity.js';

// The content fingerprint changes only when the corpus does, so it confirms
// which snapshot is live without exposing anything else.
const { generatedAt: _generatedAt, ...content } = snapshot;
const contentHash = createHash('sha256').update(JSON.stringify(content)).digest('hex');

export default function handler(req: IncomingMessage, res: ServerResponse): void {
  if (!requireGet(req, res)) return;
  sendJson(res, 200, {
    status: 'ok',
    version: SERVER_VERSION,
    papers: snapshot.papers.length,
    technicalLibraryPages: snapshot.technical.pages.length,
    searchDocuments: snapshot.search.docs.length + snapshot.technical.pages.length,
    corpusVersion: snapshot.corpusVersion,
    snapshotGeneratedAt: snapshot.generatedAt,
    contentHash,
  }, 'public, max-age=60, s-maxage=300');
}
