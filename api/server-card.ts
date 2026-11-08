import type { IncomingMessage, ServerResponse } from 'node:http';
import { snapshot } from '../src/core.js';
import { TOOL_CONTRACTS } from '../src/contracts.js';
import { requireGet, sendJson } from '../src/http-json.js';
import { MODERN_PROTOCOL_VERSION, SERVER_DESCRIPTION, SERVER_ENDPOINT_URL, SERVER_OPENAI_ENDPOINT_URL, SERVER_VERSION } from '../src/identity.js';

const tools = Object.entries(TOOL_CONTRACTS).map(([name, contract]) => ({
  name,
  description: contract.description,
  inputSchema: contract.jsonInputSchema,
  readOnly: true,
}));

export default function handler(req: IncomingMessage, res: ServerResponse): void {
  if (!requireGet(req, res)) return;
  sendJson(res, 200, {
    name: 'Moyne Ross',
    version: SERVER_VERSION,
    description: SERVER_DESCRIPTION,
    tools,
    protocol: { name: 'Model Context Protocol', version: MODERN_PROTOCOL_VERSION, transport: 'streamable-http', endpoint: SERVER_ENDPOINT_URL, openaiEndpoint: SERVER_OPENAI_ENDPOINT_URL, authentication: 'none' },
    publisher: { name: 'Moyne Ross', website: 'https://moyneross.com', aiDocumentation: 'https://moyneross.com/assistants', repository: 'https://github.com/Steven3265/moyneross-mcp' },
    capabilities: {
      tools: tools.map(({ name, description, readOnly }) => ({ name, description, readOnly })),
      resources: true,
      deterministicSnapshot: true,
      readOnly: true,
      openWorld: false,
      handOver: 'start_strategy_link returns a pre-filled moyneross.com request link; nothing is sent. It and working_with_moyne_ross are not offered on the OpenAI endpoint or to ChatGPT, where the eight research tools are served.',
      prompts: ['answer_from_research', 'compare_papers', 'brief_on_topic', 'read_a_building_element'],
      citations: 'Anchored to the section, for papers and Technical Library pages; BibTeX, RIS, CSL-JSON, APA and Harvard via cite_paper; corpus version on every answer.',
      privacyPolicy: 'https://moyneross.com/privacy#connector',
    },
    corpus: {
      papers: snapshot.papers.length,
      corpusVersion: snapshot.corpusVersion,
      sections: snapshot.papers.reduce((n, p) => n + p.sections.length, 0),
      technicalLibraryPages: snapshot.technical.pages.length,
      technicalLibrarySections: snapshot.technical.pages.reduce((n, p) => n + p.sections.length, 0),
      searchDocuments: snapshot.search.docs.length + snapshot.technical.pages.length,
      snapshotGeneratedAt: snapshot.generatedAt,
      export: 'https://moyneross.com/insights/export.json',
      searchIndex: 'https://moyneross.com/insights/search-index.json',
      technicalExport: 'https://moyneross.com/technical/export.json',
    },
    interfaces: { rest: 'https://mcp.moyneross.com/v1', openapi: 'https://mcp.moyneross.com/openapi.json', serverCard: 'https://mcp.moyneross.com/mcp/server-card' },
    privacy: {
      rawQuestionsLogged: false,
      addressesNamesOrEmailsLogged: false,
      ipAddressesLoggedByApplication: false,
      sessionIdentifiersLoggedByApplication: false,
      operationalTelemetry: 'Mcp-Method protocol method, tool name, query length, scope, counts, match strength, coarse client family, outcome and duration',
    },
    boundaries: 'General research, technical guidance on building elements and methodology. It does not assess a particular building, order anything, access client data or modify any system.',
  }, 'public, max-age=300, s-maxage=3600');
}
