import { createHash } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { requireGet, sendJson } from '../src/http-json.js';
import {
  LEGACY_PROTOCOL_VERSION,
  MODERN_PROTOCOL_VERSION,
  SERVER_DESCRIPTION,
  SERVER_ENDPOINT_URL,
  SERVER_ICONS,
  SERVER_REGISTRY_NAME,
  SERVER_TITLE,
  SERVER_VERSION,
  SERVER_WEBSITE_URL,
} from '../src/identity.js';

const SERVER_CARD_SCHEMA = 'https://static.modelcontextprotocol.io/schemas/v1/server-card.schema.json';

function card() {
  return {
    $schema: SERVER_CARD_SCHEMA,
    name: SERVER_REGISTRY_NAME,
    version: SERVER_VERSION,
    title: SERVER_TITLE,
    description: SERVER_DESCRIPTION,
    websiteUrl: SERVER_WEBSITE_URL,
    repository: { url: 'https://github.com/Steven3265/moyneross-mcp', source: 'github' },
    icons: SERVER_ICONS,
    remotes: [{ type: 'streamable-http', url: SERVER_ENDPOINT_URL, supportedProtocolVersions: [MODERN_PROTOCOL_VERSION, LEGACY_PROTOCOL_VERSION] }],
    _meta: {
      'com.moyneross/discovery': {
        serviceMetadata: 'https://mcp.moyneross.com/server-card.json',
        openapi: 'https://mcp.moyneross.com/openapi.json',
        llms: 'https://moyneross.com/llms.txt',
        ard: 'https://moyneross.com/.well-known/ard.json',
      },
    },
  };
}

const BODY = card();
const ETAG = `"${createHash('sha256').update(JSON.stringify(BODY)).digest('hex').slice(0, 16)}"`;

export default function handler(req: IncomingMessage, res: ServerResponse): void {
  if (!requireGet(req, res)) return;
  res.setHeader('ETag', ETAG);
  if (req.headers['if-none-match'] === ETAG) {
    res.statusCode = 304;
    res.setHeader('Cache-Control', 'public, max-age=300, s-maxage=3600');
    res.end();
    return;
  }
  sendJson(res, 200, BODY, 'public, max-age=300, s-maxage=3600', 'application/mcp-server-card+json; charset=utf-8');
}
