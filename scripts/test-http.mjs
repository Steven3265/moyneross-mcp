import assert from 'node:assert/strict';
import healthHandler from '../dist/api/health.js';
import indexHandler from '../dist/api/index.js';
import openapiHandler from '../dist/api/openapi.js';
import mcpServerCardHandler from '../dist/api/mcp-server-card.js';
import serverCardHandler from '../dist/api/server-card.js';
import searchHandler from '../dist/api/v1/search.js';
import citeHandler from '../dist/api/v1/cite.js';
import papersHandler from '../dist/api/v1/papers.js';
import paperHandler from '../dist/api/v1/paper.js';
import methodHandler from '../dist/api/v1/method.js';
import sampleHandler from '../dist/api/v1/sample.js';
import engageHandler from '../dist/api/v1/engage.js';
import technicalHandler from '../dist/api/v1/technical.js';
import aiCatalogHandler from '../dist/api/ai-catalog.js';
import { TOOL_CONTRACTS } from '../dist/src/contracts.js';
import { clientLabel } from '../dist/src/client-label.js';
import { SERVER_VERSION } from '../dist/src/identity.js';

class MockResponse {
  constructor() { this.headers = new Map(); this.statusCode = 0; this.body = ''; }
  setHeader(name, value) { this.headers.set(String(name).toLowerCase(), value); }
  end(body = '') { this.body = body ?? ''; }
}
const request = (method, url, headers = {}) => ({ method, url, headers: { host: 'mcp.moyneross.com', ...headers } });
const call = (handler, req) => { const res = new MockResponse(); handler(req, res); return res; };
const json = (res) => (res.body ? JSON.parse(res.body) : null);
const quiet = console.error; console.error = () => {}; // REST telemetry lines

try {
  // Search: canonical links stay clean; attribution sits in referralUrl.
  let res = call(searchHandler, request('GET', '/v1/search?query=deferred%20maintenance'));
  let body = json(res);
  assert.equal(res.statusCode, 200);
  assert.equal(body.matchStrength, 'strong');
  assert.equal(body.results[0].url, 'https://moyneross.com/insights/deferred-maintenance-is-debt');
  assert.doesNotMatch(body.results[0].url, /utm_source/);
  assert.match(body.results[0].referralUrl, /utm_source=moyneross-rest/);
  assert.match(String(res.headers.get('access-control-allow-headers')), /X-MoyneRoss-Source/);
  res = call(searchHandler, request('GET', '/v1/search?query=deferred%20maintenance', { 'x-moyneross-source': 'webmcp' }));
  assert.match(json(res).results[0].referralUrl, /utm_source=moyneross-webmcp/);
  assert.equal(call(searchHandler, request('GET', '/v1/search?query=a')).statusCode, 400);
  assert.equal(call(searchHandler, request('GET', '/v1/search?query=' + 'x'.repeat(501))).statusCode, 400);
  assert.equal(call(searchHandler, request('GET', '/v1/search?query=roof&scope=everything')).statusCode, 400);
  assert.equal(call(searchHandler, request('GET', '/v1/search?query=roof&limit=50')).statusCode, 400);
  assert.equal(call(searchHandler, request('POST', '/v1/search?query=roof')).statusCode, 405);
  body = json(call(searchHandler, request('GET', '/v1/search?query=how%20much%20is%20a%20house%20in%20sydney')));
  assert.notEqual(body.matchStrength, 'strong');
  assert.ok(body.suggestedQueries.length > 0);
  body = json(call(searchHandler, request('GET', '/v1/search?query=deferred%20maintenance&response_format=detailed')));
  assert.match(body.results[0].citation.text, /^Moyne Ross/);
  assert.match(body.corpusVersion, /^\d{4}-\d{2}-\d{2}\.[0-9a-f]{8}$/);
  assert.equal(call(searchHandler, request('GET', '/v1/search?query=roof&response_format=verbose')).statusCode, 400);

  // Papers, a paper, methods, sample, engagement.
  body = json(call(papersHandler, request('GET', '/v1/papers?part=III')));
  assert.ok(body.count > 0 && body.papers.every((p) => p.part.number === 'III' && !('contentMarkdown' in p)));
  body = json(call(papersHandler, request('GET', '/v1/papers')));
  assert.equal(body.count, 15); assert.equal(body.total, 49); assert.ok(body.nextCursor);
  assert.notEqual(json(call(papersHandler, request('GET', `/v1/papers?cursor=${body.nextCursor}`))).papers[0].slug, body.papers[0].slug);
  assert.equal(call(papersHandler, request('GET', '/v1/papers?cursor=../../etc')).statusCode, 400);
  assert.equal(call(papersHandler, request('GET', '/v1/papers?part=IX')).statusCode, 400);
  body = json(call(paperHandler, request('GET', '/v1/paper?paper=CMP%20024')));
  assert.equal(body.paper.slug, 'timing-is-not-risk');
  assert.equal(body.paper.contentMarkdown, undefined, 'summary by default');
  assert.ok(body.paper.sections.length > 0);
  assert.match(body.citation.text, /timing-is-not-risk/);
  body = json(call(paperHandler, request('GET', '/v1/paper?paper=CMP%20024&format=full')));
  assert.ok(body.paper.contentMarkdown.length > 2000);
  body = json(call(paperHandler, request('GET', '/v1/paper?paper=after-rent&section=second%20income')));
  assert.equal(body.section.url, 'https://moyneross.com/insights/after-rent#a-second-income-line');
  const noSec = call(paperHandler, request('GET', '/v1/paper?paper=after-rent&section=helipad'));
  assert.equal(noSec.statusCode, 404); assert.ok(json(noSec).sections.length > 0);
  assert.match(body.paper.referralUrl, /utm_source=moyneross-rest/);
  assert.equal('contentMarkdown' in json(call(paperHandler, request('GET', '/v1/paper?paper=after-rent&format=summary'))).paper, false);
  assert.equal(call(paperHandler, request('GET', '/v1/paper?paper=nope')).statusCode, 404);
  assert.equal(call(paperHandler, request('GET', '/v1/paper')).statusCode, 400);
  const mri = json(call(methodHandler, request('GET', '/v1/method?method=mr-index'))).method;
  assert.equal(mri.format, 'summary'); assert.match(mri.text, /MR 1/); assert.ok(mri.sections.length > 0);
  assert.ok(json(call(methodHandler, request('GET', '/v1/method?method=mr-index&format=full'))).method.text.length > mri.text.length);
  for (const style of ['bibtex', 'ris', 'csl-json', 'apa', 'harvard']) {
    const c = json(call(citeHandler, request('GET', `/v1/cite?paper=after-rent&style=${style}&section=second%20income`)));
    assert.match(c.formatted, /after-rent#a-second-income-line/, style);
  }
  assert.equal(call(citeHandler, request('GET', '/v1/cite?paper=after-rent&style=mla')).statusCode, 400);
  assert.equal(call(citeHandler, request('GET', '/v1/cite?paper=nope')).statusCode, 404);
  assert.equal(call(methodHandler, request('GET', '/v1/method?method=valuation')).statusCode, 400);
  assert.equal(call(methodHandler, request('GET', '/v1/method')).statusCode, 400);
  assert.match(json(call(sampleHandler, request('GET', '/v1/sample'))).sample.text, /\$331,225/);
  assert.match(json(call(engageHandler, request('GET', '/v1/engage'))).text, /950/);

  // The Technical Library: the list, one page, one section, full text, validation, citations.
  body = json(call(technicalHandler, request('GET', '/v1/technical')));
  assert.equal(body.total, 103);
  assert.equal(body.pages.length, 15);
  assert.equal(body.severityScale.situations.length, 7);
  assert.ok(body.pages[0].referralUrl.includes('utm_source=moyneross-rest') && !body.pages[0].canonicalUrl.includes('utm_'));
  assert.ok(json(call(technicalHandler, request('GET', '/v1/technical?section=Fire'))).pages.every((p) => p.section === 'Fire Services'));
  assert.equal(call(technicalHandler, request('GET', '/v1/technical?section=astrology')).statusCode, 400);
  assert.equal(call(technicalHandler, request('GET', '/v1/technical?page_type=room')).statusCode, 400);
  assert.equal(call(technicalHandler, request('GET', '/v1/technical?limit=99')).statusCode, 400);
  assert.equal(call(technicalHandler, request('GET', '/v1/technical?cursor=../x')).statusCode, 400);
  body = json(call(technicalHandler, request('GET', '/v1/technical?page=masonry-brickwork')));
  assert.equal(body.page.slug, 'masonry-brickwork');
  assert.equal(body.page.contentMarkdown, undefined);
  assert.equal(body.citation.publication, 'Moyne Ross Technical Library');
  body = json(call(technicalHandler, request('GET', '/v1/technical?page=Roof%20Coverings&section=severity')));
  assert.equal(body.section.url, 'https://moyneross.com/technical/roof-coverings#severity');
  assert.ok(json(call(technicalHandler, request('GET', '/v1/technical?page=roof-coverings&format=full'))).page.contentMarkdown.length > 5000);
  assert.equal(call(technicalHandler, request('GET', '/v1/technical?page=roof-coverings&section=astrology')).statusCode, 404);
  assert.equal(call(technicalHandler, request('GET', '/v1/technical?page=no-such-element')).statusCode, 404);
  assert.equal(call(technicalHandler, request('GET', '/v1/technical?page=roof-coverings&format=pdf')).statusCode, 400);
  assert.equal(call(technicalHandler, request('POST', '/v1/technical')).statusCode, 405);
  const tc = json(call(citeHandler, request('GET', '/v1/cite?paper=roof-coverings&style=harvard&section=diagnosis')));
  // An earlier address cites the section that now holds it, on either layout.
  const held = json(call(technicalHandler, request('GET', '/v1/technical?page=roof-coverings&section=diagnosis')));
  assert.ok(tc.formatted.includes(`Moyne Ross Technical Library. Available at: ${held.section.url}`));
  body = json(call(searchHandler, request('GET', '/v1/search?query=concrete%20spalling%20in%20a%20car%20park&scope=technical&response_format=detailed')));
  assert.ok(body.results.every((r) => r.kind === 'Technical Library' && r.citation.publication === 'Moyne Ross Technical Library'));

  // Discovery documents agree with the contracts and the identity.
  const openapi = json(call(openapiHandler, request('GET', '/openapi.json')));
  assert.equal(openapi.openapi, '3.1.0');
  assert.equal(openapi.info.version, SERVER_VERSION);
  assert.deepEqual(Object.keys(openapi.paths).sort(), ['/v1/cite', '/v1/engage', '/v1/method', '/v1/paper', '/v1/papers', '/v1/sample', '/v1/search', '/v1/technical']);
  const card = json(call(mcpServerCardHandler, request('GET', '/mcp/server-card')));
  assert.equal(card.name, 'io.github.Steven3265/moyneross');
  assert.equal(card.remotes[0].url, 'https://mcp.moyneross.com/mcp');
  assert.match(String(call(mcpServerCardHandler, request('GET', '/mcp/server-card')).headers.get('content-type')), /application\/mcp-server-card\+json/);
  const service = json(call(serverCardHandler, request('GET', '/server-card.json')));
  assert.deepEqual(service.tools.map((t) => t.name).sort(), Object.keys(TOOL_CONTRACTS).sort());
  assert.equal(service.privacy.rawQuestionsLogged, false);
  const health = json(call(healthHandler, request('GET', '/health')));
  assert.equal(health.status, 'ok');
  assert.equal(health.papers, 49);
  assert.equal(health.technicalLibraryPages, 103);
  assert.match(health.contentHash, /^[0-9a-f]{64}$/);
  assert.equal(json(call(indexHandler, request('GET', '/'))).endpoints.mcp, '/mcp');

  // Every REST answer matches its MCP tool's output schema, which is what the
  // OpenAPI publishes for it.
  for (const [handler, url, tool, ref] of [
    [searchHandler, '/v1/search?query=deferred%20maintenance', 'search_research', 'SearchResults'],
    [searchHandler, '/v1/search?query=tin%20roof%20leaking&scope=technical&response_format=detailed', 'search_research', 'SearchResults'],
    [papersHandler, '/v1/papers', 'list_papers', 'PaperList'],
    [paperHandler, '/v1/paper?paper=after-rent&format=full', 'get_paper', 'Paper'],
    [methodHandler, '/v1/method?method=mr-index', 'explain_method', 'Method'],
    [sampleHandler, '/v1/sample?part=register&section=roofs', 'get_sample_strategy', 'SampleStrategy'],
    [citeHandler, '/v1/cite?paper=roof-coverings&style=ris', 'cite_paper', 'Citation'],
    [technicalHandler, '/v1/technical', 'list_technical_pages', 'TechnicalLibraryList'],
    [technicalHandler, '/v1/technical?page=roof-coverings&format=full', 'get_technical_page', 'TechnicalLibraryPage'],
    [engageHandler, '/v1/engage', 'working_with_moyne_ross', 'Engagement'],
  ]) {
    const parsed = TOOL_CONTRACTS[tool].outputSchema.safeParse(json(call(handler, request('GET', url))));
    assert.ok(parsed.success, `${url} does not match the ${tool} output schema: ${JSON.stringify(parsed.error?.issues?.slice(0, 2))}`);
    assert.equal(openapi.components.schemas[ref]?.type, 'object', `OpenAPI has no ${ref} schema`);
  }
  assert.ok(JSON.stringify(openapi.paths).includes('#/components/schemas/TechnicalLibraryPage'), 'OpenAPI responses reference their schemas');

  // A long library page in full comes a part at a time over REST too.
  const fullPart = json(call(technicalHandler, request('GET', '/v1/technical?page=roof-coverings&format=full')));
  if (fullPart.part?.nextCursor) assert.equal(json(call(technicalHandler, request('GET', `/v1/technical?page=roof-coverings&format=full&cursor=${fullPart.part.nextCursor}`))).part.part, 2);
  assert.equal(call(technicalHandler, request('GET', '/v1/technical?page=roof-coverings&format=full&cursor=nonsense')).statusCode, 400);

  // The AI Catalog: its own media type, and entries that point at the server card and skills.
  const catRes = call(aiCatalogHandler, request('GET', '/.well-known/ai-catalog.json'));
  assert.match(String(catRes.headers.get('content-type')), /application\/ai-catalog\+json/);
  const cat = json(catRes);
  assert.equal(cat.entries.find((e) => e.type === 'application/mcp-server-card+json')?.url, 'https://mcp.moyneross.com/mcp/server-card');
  assert.ok(cat.entries.every((e) => /^urn:air:moyneross\.com:/.test(e.identifier) && e.url.startsWith('https://mcp.moyneross.com/')));
  assert.equal(call(aiCatalogHandler, request('GET', '/.well-known/ai-catalog.json', { 'if-none-match': catRes.headers.get('etag') })).statusCode, 304);
  // Browser clients can revalidate discovery documents.
  assert.match(String(call(mcpServerCardHandler, request('GET', '/mcp/server-card')).headers.get('access-control-expose-headers')), /ETag/);

  // Client families for telemetry: coarse labels only.
  assert.equal(clientLabel('Claude-User/1.0'), 'claude');
  assert.equal(clientLabel('openai-mcp/1.0 (ChatGPT)'), 'chatgpt');
  assert.equal(clientLabel(''), 'unknown');
  assert.equal(clientLabel('moyneross-portal-calibration/1.0'), 'moyneross-portal');
} finally {
  console.error = quiet;
}
console.log('PASS  http: REST search (concise, detailed, scoped), papers (paged), paper (summary, section, full), Technical Library (list, page, section, full), method, citations, sample and engagement, with validation and clean canonical links');
console.log('PASS  http: OpenAPI (response schemas from the tool contracts, every REST answer checked against them), AI Catalog, server card, service metadata and health agree with the contracts and identity');
