import { createHash } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { requireGet, sendJson } from '../src/http-json.js';

// The AI Catalog for this host (the MCP server-card working group's discovery
// draft): where a client that knows only mcp.moyneross.com finds the server
// card and the agent skills. moyneross.com publishes the same entries at its
// own /.well-known/ai-catalog.json; the identifiers match, so the two read as
// one set. Entries carry identifier, type and url; titles and descriptions
// live in the documents themselves, so nothing here can drift from them.
const BODY = {
  specVersion: '1.0',
  host: { displayName: 'Moyne Ross', identifier: 'moyneross.com', documentationUrl: 'https://moyneross.com/assistants' },
  entries: [
    { identifier: 'urn:air:moyneross.com:server:moyneross', type: 'application/mcp-server-card+json', url: 'https://mcp.moyneross.com/mcp/server-card' },
    { identifier: 'urn:air:moyneross.com:skill:commercial-capital-research', type: 'application/ai-skill+md', url: 'https://mcp.moyneross.com/skills/commercial-capital-research/SKILL.md' },
    { identifier: 'urn:air:moyneross.com:skill:capital-strategy-handover', type: 'application/ai-skill+md', url: 'https://mcp.moyneross.com/skills/capital-strategy-handover/SKILL.md' },
  ],
};
const ETAG = `"${createHash('sha256').update(JSON.stringify(BODY)).digest('hex').slice(0, 16)}"`;

export default function handler(req: IncomingMessage, res: ServerResponse): void {
  if (!requireGet(req, res)) return;
  res.setHeader('ETag', ETAG);
  if (req.headers['if-none-match'] === ETAG) {
    res.statusCode = 304;
    res.setHeader('Cache-Control', 'public, max-age=3600, s-maxage=3600');
    res.end();
    return;
  }
  sendJson(res, 200, BODY, 'public, max-age=3600, s-maxage=3600', 'application/ai-catalog+json; charset=utf-8');
}
