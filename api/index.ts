import type { IncomingMessage, ServerResponse } from 'node:http';
import { snapshot } from '../src/core.js';
import { requireGet, sendJson } from '../src/http-json.js';
import { MODERN_PROTOCOL_VERSION, SERVER_DESCRIPTION, SERVER_VERSION } from '../src/identity.js';

export default function handler(req: IncomingMessage, res: ServerResponse): void {
  if (!requireGet(req, res)) return;
  sendJson(res, 200, {
    name: 'Moyne Ross MCP',
    version: SERVER_VERSION,
    protocol: MODERN_PROTOCOL_VERSION,
    description: SERVER_DESCRIPTION,
    endpoints: {
      mcp: '/mcp',
      mcpOpenAI: '/mcp/openai',
      health: '/health',
      serverCard: '/mcp/server-card',
      serviceMetadata: '/server-card.json',
      openapi: '/openapi.json',
      rest: { search: '/v1/search', papers: '/v1/papers', paper: '/v1/paper', method: '/v1/method', sample: '/v1/sample', cite: '/v1/cite', technical: '/v1/technical', engage: '/v1/engage' },
    },
    discovery: {
      llms: 'https://moyneross.com/llms.txt',
      aiDocumentation: 'https://moyneross.com/assistants',
      repository: 'https://github.com/Steven3265/moyneross-mcp',
    },
    papers: snapshot.papers.length,
    technicalLibraryPages: snapshot.technical.pages.length,
    corpusVersion: snapshot.corpusVersion,
    snapshotGeneratedAt: snapshot.generatedAt,
    canonicalSite: snapshot.source,
  });
}
