import type { IncomingMessage, ServerResponse } from 'node:http';
import * as z from 'zod/v4';
import { TOOL_CONTRACTS } from '../src/contracts.js';
import { requireGet, sendJson } from '../src/http-json.js';
import { SERVER_VERSION } from '../src/identity.js';

// Generated from the same contracts as the MCP tools, so the two cannot drift.
type Schema = Record<string, unknown>;
const q = (name: string, schema: Schema, required = false) => ({ name, in: 'query', required, schema });
// Each response is described by the same output schema as its MCP tool
// (scripts/test-http.mjs parses every REST answer with it). REST answers add a
// referralUrl beside each moyneross.com link, so objects stay open to extra keys.
type ToolName = keyof typeof TOOL_CONTRACTS;
function open(schema: unknown): unknown {
  if (Array.isArray(schema)) return schema.map(open);
  if (!schema || typeof schema !== 'object') return schema;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(schema)) if (k !== '$schema' && !(k === 'additionalProperties' && v === false)) out[k] = open(v);
  return out;
}
const SCHEMA_NAMES: Record<string, ToolName> = {
  SearchResults: 'search_research', PaperList: 'list_papers', Paper: 'get_paper', Method: 'explain_method', SampleStrategy: 'get_sample_strategy',
  Citation: 'cite_paper', TechnicalLibraryList: 'list_technical_pages', TechnicalLibraryPage: 'get_technical_page', Connections: 'trace_connections', BuildingBrief: 'building_brief', SectionComparison: 'compare_technical_sections', TermTranslation: 'translate_term', Engagement: 'working_with_moyne_ross',
};
const schemas = Object.fromEntries(Object.entries(SCHEMA_NAMES).map(([name, tool]) => [name, open(z.toJSONSchema(TOOL_CONTRACTS[tool].outputSchema, { io: 'output', unrepresentable: 'any' }))]));
const ref = (name: string) => ({ $ref: `#/components/schemas/${name}` });
const ok = (description: string, schema: Schema = { type: 'object' }) => ({
  200: { description, content: { 'application/json': { schema } } },
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
        parameters: [q('query', p('search_research').query as Schema, true), q('scope', p('search_research').scope as Schema), q('limit', p('search_research').limit as Schema), q('response_format', p('search_research').response_format as Schema)], responses: ok('Ranked results with match strength', ref('SearchResults')) } },
      '/v1/papers': { get: { operationId: 'listPapers', summary: TOOL_CONTRACTS.list_papers.title, description: TOOL_CONTRACTS.list_papers.description,
        parameters: [q('part', p('list_papers').part as Schema), q('limit', p('list_papers').limit as Schema), q('cursor', p('list_papers').cursor as Schema)], responses: ok('Papers in reading order', ref('PaperList')) } },
      '/v1/paper': { get: { operationId: 'getPaper', summary: TOOL_CONTRACTS.get_paper.title, description: TOOL_CONTRACTS.get_paper.description,
        parameters: [q('paper', p('get_paper').paper as Schema, true), q('format', p('get_paper').format as Schema), q('section', p('get_paper').section as Schema)], responses: { ...ok('One paper', ref('Paper')), 404: { description: 'No paper matches' } } } },
      '/v1/method': { get: { operationId: 'explainMethod', summary: TOOL_CONTRACTS.explain_method.title, description: TOOL_CONTRACTS.explain_method.description,
        parameters: [q('method', p('explain_method').method as Schema, true), q('format', p('explain_method').format as Schema), q('section', p('explain_method').section as Schema)], responses: ok('The method', ref('Method')) } },
      '/v1/sample': { get: { operationId: 'getSampleStrategy', summary: TOOL_CONTRACTS.get_sample_strategy.title, description: TOOL_CONTRACTS.get_sample_strategy.description, parameters: [q('part', p('get_sample_strategy').part as Schema), q('section', p('get_sample_strategy').section as Schema)], responses: ok('The sample Capital Strategy', ref('SampleStrategy')) } },
      '/v1/cite': { get: { operationId: 'citePaper', summary: TOOL_CONTRACTS.cite_paper.title, description: TOOL_CONTRACTS.cite_paper.description,
        parameters: [q('paper', p('cite_paper').paper as Schema, true), q('style', p('cite_paper').style as Schema), q('section', p('cite_paper').section as Schema)], responses: { ...ok('An exact citation', ref('Citation')), 404: { description: 'No paper or section matches' } } } },
      '/v1/connections': { get: { operationId: 'traceConnections', summary: TOOL_CONTRACTS.trace_connections.title, description: TOOL_CONTRACTS.trace_connections.description,
        parameters: [q('ref', p('trace_connections').ref as Schema, true)], responses: { ...ok('The connections', ref('Connections')), 404: { description: 'No paper or page matches' } } } },
      '/v1/brief': { get: { operationId: 'buildingBrief', summary: TOOL_CONTRACTS.building_brief.title, description: TOOL_CONTRACTS.building_brief.description,
        parameters: [q('use_class', p('building_brief').use_class as Schema, true), { ...q('spaces', p('building_brief').spaces as Schema), style: 'form', explode: false }, q('market', p('building_brief').market as Schema), q('framework_section', p('building_brief').framework_section as Schema), q('limit', p('building_brief').limit as Schema), q('cursor', p('building_brief').cursor as Schema), q('response_format', p('building_brief').response_format as Schema)], responses: ok('The brief', ref('BuildingBrief')) } },
      '/v1/compare': { get: { operationId: 'compareTechnicalSections', summary: TOOL_CONTRACTS.compare_technical_sections.title, description: TOOL_CONTRACTS.compare_technical_sections.description,
        parameters: [{ ...q('pages', p('compare_technical_sections').pages as Schema, true), style: 'form', explode: false }, q('section', p('compare_technical_sections').section as Schema, true), q('market', p('compare_technical_sections').market as Schema)], responses: { ...ok('The sections side by side', ref('SectionComparison')), 404: { description: 'Fewer than two pages found' } } } },
      '/v1/glossary': { get: { operationId: 'translateTerm', summary: TOOL_CONTRACTS.translate_term.title, description: TOOL_CONTRACTS.translate_term.description,
        parameters: [q('term', p('translate_term').term as Schema, true), q('market', p('translate_term').market as Schema)], responses: ok('The matching glossary entries', ref('TermTranslation')) } },
      '/v1/technical': { get: { operationId: 'technicalLibrary', summary: `${TOOL_CONTRACTS.list_technical_pages.title}, or ${TOOL_CONTRACTS.get_technical_page.title.toLowerCase()}`,
        description: `Without page: ${TOOL_CONTRACTS.list_technical_pages.description} With page: ${TOOL_CONTRACTS.get_technical_page.description}`,
        parameters: [q('page', p('get_technical_page').page as Schema), q('format', p('get_technical_page').format as Schema), q('section', { type: 'string', maxLength: 120, description: 'With page: one section by id or heading. Without page: one framework section to list.' }),
          q('page_type', p('list_technical_pages').page_type as Schema), q('limit', p('list_technical_pages').limit as Schema), q('cursor', { type: 'string', maxLength: 120, description: 'Without page: the nextCursor of the previous list page. With page and format full: the nextCursor of the previous part of a long page.' })],
        responses: { ...ok('One Technical Library page (with page), or the library a page at a time (without)', { oneOf: [ref('TechnicalLibraryPage'), ref('TechnicalLibraryList')] }), 404: { description: 'No page or section matches' } } } },
      '/v1/engage': { get: { operationId: 'workingWithMoyneRoss', summary: TOOL_CONTRACTS.working_with_moyne_ross.title, description: TOOL_CONTRACTS.working_with_moyne_ross.description, parameters: [], responses: ok('How engagements work', ref('Engagement')) } },
    },
    components: { schemas },
  }, 'public, max-age=300, s-maxage=3600');
}
