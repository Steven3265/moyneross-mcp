import type { IncomingMessage, ServerResponse } from 'node:http';
import { TOOL_CONTRACTS } from '../src/contracts.js';
import { requireGet, sendJson } from '../src/http-json.js';
import { SERVER_VERSION } from '../src/identity.js';

// Generated from the same contracts as the MCP tools, so the two cannot drift.
type Schema = Record<string, unknown>;
const q = (name: string, schema: Schema, required = false) => ({ name, in: 'query', required, schema });
const ok = (description: string) => ({
  200: { description, content: { 'application/json': { schema: { type: 'object' } } } },
  400: { description: 'Invalid parameter' },
});
const p = (tool: keyof typeof TOOL_CONTRACTS) => TOOL_CONTRACTS[tool].jsonInputSchema.properties as Record<string, Schema>;

export default function handler(req: IncomingMessage, res: ServerResponse): void {
  if (!requireGet(req, res)) return;
  sendJson(res, 200, {
    openapi: '3.1.0',
    info: {
      title: 'Moyne Ross Read API',
      version: SERVER_VERSION,
      description: 'Read-only HTTP access to the same public Moyne Ross corpus served by the Moyne Ross MCP server: the Capital Made Physical papers, the Technical Library, the methodology and the sample Capital Strategy. Every result carries the canonical moyneross.com URL to cite.',
      contact: { name: 'Moyne Ross', url: 'https://moyneross.com/assistants' },
      license: { name: 'MIT (server code); content subject to Moyne Ross terms', url: 'https://moyneross.com/terms' },
    },
    servers: [{ url: 'https://mcp.moyneross.com' }],
    paths: {
      '/v1/search': { get: { operationId: 'searchResearch', summary: TOOL_CONTRACTS.search_research.title, description: TOOL_CONTRACTS.search_research.description,
        parameters: [q('query', p('search_research').query as Schema, true), q('scope', p('search_research').scope as Schema), q('limit', p('search_research').limit as Schema), q('response_format', p('search_research').response_format as Schema)], responses: ok('Ranked results with match strength') } },
      '/v1/papers': { get: { operationId: 'listPapers', summary: TOOL_CONTRACTS.list_papers.title, description: TOOL_CONTRACTS.list_papers.description,
        parameters: [q('part', p('list_papers').part as Schema), q('limit', p('list_papers').limit as Schema), q('cursor', p('list_papers').cursor as Schema)], responses: ok('Papers in reading order') } },
      '/v1/paper': { get: { operationId: 'getPaper', summary: TOOL_CONTRACTS.get_paper.title, description: TOOL_CONTRACTS.get_paper.description,
        parameters: [q('paper', p('get_paper').paper as Schema, true), q('format', p('get_paper').format as Schema), q('section', p('get_paper').section as Schema)], responses: { ...ok('One paper'), 404: { description: 'No paper matches' } } } },
      '/v1/method': { get: { operationId: 'explainMethod', summary: TOOL_CONTRACTS.explain_method.title, description: TOOL_CONTRACTS.explain_method.description,
        parameters: [q('method', p('explain_method').method as Schema, true), q('format', p('explain_method').format as Schema), q('section', p('explain_method').section as Schema)], responses: ok('The method') } },
      '/v1/sample': { get: { operationId: 'getSampleStrategy', summary: TOOL_CONTRACTS.get_sample_strategy.title, description: TOOL_CONTRACTS.get_sample_strategy.description, parameters: [q('part', p('get_sample_strategy').part as Schema), q('section', p('get_sample_strategy').section as Schema)], responses: ok('The sample Capital Strategy') } },
      '/v1/cite': { get: { operationId: 'citePaper', summary: TOOL_CONTRACTS.cite_paper.title, description: TOOL_CONTRACTS.cite_paper.description,
        parameters: [q('paper', p('cite_paper').paper as Schema, true), q('style', p('cite_paper').style as Schema), q('section', p('cite_paper').section as Schema)], responses: { ...ok('An exact citation'), 404: { description: 'No paper or section matches' } } } },
      '/v1/technical': { get: { operationId: 'technicalLibrary', summary: `${TOOL_CONTRACTS.list_technical_pages.title}, or ${TOOL_CONTRACTS.get_technical_page.title.toLowerCase()}`,
        description: `Without page: ${TOOL_CONTRACTS.list_technical_pages.description} With page: ${TOOL_CONTRACTS.get_technical_page.description}`,
        parameters: [q('page', p('get_technical_page').page as Schema), q('format', p('get_technical_page').format as Schema), q('section', { type: 'string', maxLength: 120, description: 'With page: one section by id or heading. Without page: one framework section to list.' }),
          q('page_type', p('list_technical_pages').page_type as Schema), q('limit', p('list_technical_pages').limit as Schema), q('cursor', p('list_technical_pages').cursor as Schema)],
        responses: { ...ok('One Technical Library page, or the library a page at a time'), 404: { description: 'No page or section matches' } } } },
      '/v1/engage': { get: { operationId: 'workingWithMoyneRoss', summary: TOOL_CONTRACTS.working_with_moyne_ross.title, description: TOOL_CONTRACTS.working_with_moyne_ross.description, parameters: [], responses: ok('How engagements work') } },
    },
  }, 'public, max-age=300, s-maxage=3600');
}
