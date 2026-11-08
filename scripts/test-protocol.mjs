import assert from 'node:assert/strict';
import { allowedHostnames, allowedOriginHostnames, allowedOrigins, handleMcpRequest } from '../dist/src/http-handler.js';
import { TOOL_CONTRACTS } from '../dist/src/contracts.js';

const ENDPOINT = 'https://test.local/mcp';
const MODERN_VERSION = '2026-07-28';

function modernMeta() {
  return {
    'io.modelcontextprotocol/protocolVersion': MODERN_VERSION,
    'io.modelcontextprotocol/clientInfo': {
      name: 'moyneross-release-test',
      version: '1.0.1',
    },
    'io.modelcontextprotocol/clientCapabilities': {},
  };
}

async function parseJsonRpc(response) {
  const text = await response.text();
  assert.ok(text, `expected a response body for HTTP ${response.status}`);

  const contentType = response.headers.get('content-type') ?? '';
  if (contentType.includes('text/event-stream')) {
    const payloads = text
      .split(/\r?\n/)
      .filter((line) => line.startsWith('data:'))
      .map((line) => line.slice(5).trim())
      .filter(Boolean);
    assert.ok(payloads.length > 0, `expected an SSE data frame, received: ${text}`);
    return JSON.parse(payloads.at(-1));
  }

  return JSON.parse(text);
}

async function postModern({ id, method, params = {}, name, endpoint = 'standard', userAgent }) {
  const headers = new Headers({
    Accept: 'application/json, text/event-stream',
    'Content-Type': 'application/json',
    'MCP-Protocol-Version': MODERN_VERSION,
    'Mcp-Method': method,
    Host: 'test.local',
  });
  if (name) headers.set('Mcp-Name', name);
  if (userAgent) headers.set('User-Agent', userAgent);

  const request = new Request(endpoint === 'openai' ? `${ENDPOINT}/openai` : ENDPOINT, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      jsonrpc: '2.0',
      id,
      method,
      params: { ...params, _meta: modernMeta() },
    }),
  });
  const response = await handleMcpRequest(request, { endpoint });
  return { response, payload: await parseJsonRpc(response) };
}

async function main() {
  const envKeys = [
    'VERCEL',
    'VERCEL_URL',
    'VERCEL_BRANCH_URL',
    'VERCEL_PROJECT_PRODUCTION_URL',
    'ALLOWED_HOSTS',
    'ALLOWED_ORIGIN',
    'ALLOWED_ORIGINS',
  ];
  const envBefore = Object.fromEntries(envKeys.map((key) => [key, process.env[key]]));
  try {
    process.env.VERCEL = '1';
    process.env.VERCEL_URL = 'moyneross-mcp-9f2a1bc.vercel.app';
    process.env.VERCEL_BRANCH_URL = 'moyneross-mcp-git-main-steven3265.vercel.app';
    process.env.VERCEL_PROJECT_PRODUCTION_URL = 'moyneross-mcp.vercel.app';
    delete process.env.ALLOWED_HOSTS;
    delete process.env.ALLOWED_ORIGIN;
    delete process.env.ALLOWED_ORIGINS;

    const vercelHosts = allowedHostnames();
    for (const hostname of [
      'mcp.moyneross.com',
      'moyneross-mcp-9f2a1bc.vercel.app',
      'moyneross-mcp-git-main-steven3265.vercel.app',
      'moyneross-mcp.vercel.app',
    ]) {
      assert.ok(vercelHosts.includes(hostname), `production Host allowlist is missing ${hostname}`);
    }

    const defaultOrigins = allowedOriginHostnames();
    assert.ok(defaultOrigins.includes('claude.com'), 'Claude current web origin must be allowed');
    assert.ok(defaultOrigins.includes('localhost'), 'loopback MCP Inspector origin must be allowed against production');

    for (const hostname of [
      'moyneross-mcp-git-main-steven3265.vercel.app',
      'moyneross-mcp.vercel.app',
    ]) {
      const vercelPreflight = await handleMcpRequest(
        new Request(ENDPOINT, {
          method: 'OPTIONS',
          headers: {
            Host: hostname,
            Origin: 'https://claude.com',
            'Access-Control-Request-Method': 'POST',
          },
        }),
      );
      assert.equal(vercelPreflight.status, 204, `${hostname} must pass the production request boundary`);
    }

    process.env.ALLOWED_ORIGIN = 'https://legacy-only.example';
    assert.deepEqual(allowedOriginHostnames(), ['legacy-only.example'], 'legacy ALLOWED_ORIGIN must remain restrictive');
    assert.deepEqual(allowedOrigins(), ['https://legacy-only.example'], 'legacy ALLOWED_ORIGIN must preserve its exact origin');

    process.env.ALLOWED_ORIGINS = 'https://trusted.example:8443';
    assert.deepEqual(allowedOriginHostnames(), ['trusted.example'], 'ALLOWED_ORIGINS hostname view must remain available for diagnostics');
    assert.deepEqual(allowedOrigins(), ['https://trusted.example:8443'], 'ALLOWED_ORIGINS must preserve scheme and port');

    const exactOrigin = await handleMcpRequest(
      new Request(ENDPOINT, {
        method: 'OPTIONS',
        headers: {
          Host: 'mcp.moyneross.com',
          Origin: 'https://trusted.example:8443',
          'Access-Control-Request-Method': 'POST',
        },
      }),
    );
    assert.equal(exactOrigin.status, 204, 'configured exact Origin must pass');

    for (const origin of ['https://trusted.example', 'https://trusted.example:9443', 'http://trusted.example:8443']) {
      const widenedOrigin = await handleMcpRequest(
        new Request(ENDPOINT, {
          method: 'OPTIONS',
          headers: {
            Host: 'mcp.moyneross.com',
            Origin: origin,
            'Access-Control-Request-Method': 'POST',
          },
        }),
      );
      assert.equal(widenedOrigin.status, 403, `${origin} must not be admitted by https://trusted.example:8443`);
      assert.equal(widenedOrigin.headers.has('access-control-allow-origin'), false);
      assert.match(widenedOrigin.headers.get('content-type') ?? '', /^application\/json\b/i);
      const widenedPayload = await widenedOrigin.json();
      assert.equal(widenedPayload.jsonrpc, '2.0');
      assert.equal(widenedPayload.id, null);
      assert.equal(widenedPayload.error?.code, -32000);
    }
  } finally {
    for (const key of envKeys) {
      const value = envBefore[key];
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }

  const preflight = await handleMcpRequest(
    new Request(ENDPOINT, {
      method: 'OPTIONS',
      headers: {
        Host: 'test.local',
        Origin: 'https://claude.ai',
        'Access-Control-Request-Method': 'POST',
      },
    }),
  );
  assert.equal(preflight.status, 204);
  assert.match(preflight.headers.get('access-control-allow-methods') ?? '', /POST/);
  assert.equal(preflight.headers.get('access-control-allow-origin'), 'https://claude.ai');

  const rejectedOrigin = await handleMcpRequest(
    new Request(ENDPOINT, {
      method: 'OPTIONS',
      headers: {
        Host: 'test.local',
        Origin: 'https://attacker.example',
        'Access-Control-Request-Method': 'POST',
      },
    }),
  );
  assert.equal(rejectedOrigin.status, 403);
  assert.equal(rejectedOrigin.headers.has('access-control-allow-origin'), false);

  const rejectedHost = await handleMcpRequest(
    new Request(ENDPOINT, { method: 'POST', headers: { Host: 'attacker.example' } }),
  );
  assert.equal(rejectedHost.status, 403);
  assert.equal(rejectedHost.headers.has('access-control-allow-origin'), false);

  const getResponse = await handleMcpRequest(new Request(ENDPOINT, { headers: { Host: 'test.local' } }));
  assert.equal(getResponse.status, 405);
  assert.equal(getResponse.headers.get('allow'), 'POST, OPTIONS');

  const discover = await postModern({ id: 'discover', method: 'server/discover' });
  assert.equal(discover.response.status, 200);
  assert.ok(discover.payload.result.supportedVersions.includes(MODERN_VERSION));
  assert.ok(discover.payload.result.capabilities.tools);
  assert.ok(discover.payload.result.capabilities.resources);
  assert.equal(discover.payload.result.cacheScope, 'public');
  assert.ok(discover.payload.result.ttlMs > 0);

  const ALL_TOOLS = ['cite_paper', 'explain_method', 'get_paper', 'get_sample_strategy', 'get_technical_page', 'list_papers', 'list_technical_pages', 'search_research', 'start_strategy_link', 'working_with_moyne_ross'];
  const LARGE = ['explain_method', 'get_paper', 'get_sample_strategy', 'get_technical_page'];
  const call = (id, name, args, extra = {}) => postModern({ id, method: 'tools/call', name, params: { name, arguments: args }, ...extra });
  const out = (r) => r.payload.result.structuredContent;
  const cacheable = (r, label) => {
    assert.equal(r.payload.result.cacheScope, 'public', `${label}: cacheScope public`);
    assert.ok(Number.isInteger(r.payload.result.ttlMs) && r.payload.result.ttlMs > 0, `${label}: ttlMs`);
  };

  // ── 2026-07-28 core: discovery lists, caching, ordering, result metadata ──
  const tools = await postModern({ id: 'tools', method: 'tools/list' });
  assert.equal(tools.response.status, 200);
  cacheable(tools, 'tools/list');
  const names = tools.payload.result.tools.map((t) => t.name);
  assert.deepEqual([...names].sort(), ALL_TOOLS);
  const again = await postModern({ id: 'tools-2', method: 'tools/list' });
  assert.deepEqual(again.payload.result.tools.map((t) => t.name), names, 'tools/list order is stable');
  for (const t of tools.payload.result.tools) {
    const a = t.annotations ?? {};
    assert.ok(t.title && a.title, `${t.name}: title`);
    for (const [k, v] of [['readOnlyHint', true], ['destructiveHint', false], ['idempotentHint', true], ['openWorldHint', false]]) assert.equal(a[k], v, `${t.name}: ${k} must be explicitly ${v}`);
    assert.ok(Array.isArray(t.icons) && t.icons.length >= 2, `${t.name}: icons`);
    assert.ok(t.name.length <= 64, `${t.name}: name length`);
    if (LARGE.includes(t.name)) assert.equal(t._meta?.['anthropic/maxResultSizeChars'], 100000, `${t.name}: large-result ceiling`);
    const expected = TOOL_CONTRACTS[t.name]?.jsonInputSchema;
    assert.ok(expected, `missing shared contract for ${t.name}`);
    assert.deepEqual(Object.keys(t.inputSchema?.properties ?? {}).sort(), Object.keys(expected.properties ?? {}).sort(), `${t.name} input fields drifted`);
    assert.deepEqual([...(t.inputSchema?.required ?? [])].sort(), [...(expected.required ?? [])].sort(), `${t.name} required fields drifted`);
    for (const [field, es] of Object.entries(expected.properties ?? {})) {
      const as = t.inputSchema.properties[field];
      for (const key of ['type', 'minimum', 'maximum', 'minLength', 'maxLength']) if (key in es) assert.deepEqual(as?.[key], es[key], `${t.name}.${field} ${key} drifted`);
      if ('enum' in es) assert.deepEqual(as?.enum, es.enum, `${t.name}.${field} enum drifted`);
    }
    assert.equal(t.outputSchema?.type, 'object', `${t.name} outputSchema`);
    for (const f of TOOL_CONTRACTS[t.name].outputFields) assert.ok(Object.keys(t.outputSchema.properties ?? {}).includes(f), `${t.name} outputSchema missing ${f}`);
  }

  const first = await call('rt', 'list_papers', {});
  assert.equal(first.payload.result.resultType, 'complete', 'every result carries resultType complete');
  assert.equal(first.payload.result._meta?.['io.modelcontextprotocol/serverInfo']?.name, 'moyneross', 'every result carries serverInfo in _meta');
  const disc2026 = await postModern({ id: 'disc', method: 'server/discover' });
  cacheable(disc2026, 'server/discover');
  assert.ok(disc2026.payload.result.supportedVersions.includes('2026-07-28'));
  assert.deepEqual(Object.keys(disc2026.payload.result.capabilities).sort(), ['completions', 'prompts', 'resources', 'tools']);
  const { default: cardHandler } = await import('../dist/api/mcp-server-card.js');
  const cardRes = { headers: {}, statusCode: 0, body: '', setHeader(k, v) { this.headers[k.toLowerCase()] = v; }, end(b = '') { this.body = b; } };
  cardHandler({ method: 'GET', url: '/mcp/server-card', headers: { host: 'mcp.moyneross.com' } }, cardRes);
  const card = JSON.parse(cardRes.body);
  const info = disc2026.payload.result._meta['io.modelcontextprotocol/serverInfo'];
  assert.equal(card.version, info.version, 'server card and server/discover agree on version');
  assert.equal(card.title, info.title, 'server card and server/discover agree on title');
  assert.ok(card.remotes[0].supportedProtocolVersions.includes('2026-07-28'));
  assert.match(cardRes.headers.etag, /^"[0-9a-f]{16}"$/, 'the server card has an ETag');
  const notModified = { headers: {}, statusCode: 0, body: '', setHeader(k, v) { this.headers[k.toLowerCase()] = v; }, end(b = '') { this.body = b; } };
  cardHandler({ method: 'GET', url: '/mcp/server-card', headers: { host: 'mcp.moyneross.com', 'if-none-match': cardRes.headers.etag } }, notModified);
  assert.equal(notModified.statusCode, 304, 'a matching If-None-Match gets 304');

  for (const [method, label] of [['resources/list', 'resources/list'], ['resources/templates/list', 'resources/templates/list'], ['prompts/list', 'prompts/list']]) {
    cacheable(await postModern({ id: label, method }), label);
  }

  // ── Search: concise and detailed, match evidence, suggestions, neutrality ──
  const strong = await call('s1', 'search_research', { query: 'should we refurbish or redevelop an ageing 1970s office' });
  const so = out(strong);
  assert.equal(so.matchStrength, 'strong');
  assert.equal(so.results[0].url, 'https://moyneross.com/insights/the-1970s-office');
  assert.ok(so.match.coverage >= 0.6 && Array.isArray(so.match.matchedTerms) && Array.isArray(so.match.missingTerms));
  assert.deepEqual(so.suggestedQueries, []);
  assert.match(so.corpusVersion, /^\d{4}-\d{2}-\d{2}\.[0-9a-f]{8}$/);
  assert.equal(so.results[0].citation, undefined, 'concise results carry no citation');
  assert.ok(strong.payload.result.content.some((c) => c.type === 'resource_link' && c.uri === 'moyneross://papers/the-1970s-office'), 'search returns resource links');
  const det = out(await call('s2', 'search_research', { query: 'deferred maintenance', response_format: 'detailed' }));
  assert.match(det.results[0].citation.text, /^Moyne Ross \(\d{4}\)\. /);
  const short = out(await call('s3', 'search_research', { query: 'who is on the hook for dilaps when the tenant leaves' }));
  // Shorthand still reaches the paper; since 1.1.0 a library page can sit above it on literal words
  // ("hook", "leaves" occur on the canopies page), the known case in docs/BENCHMARK.md.
  assert.ok(short.results.slice(0, 2).some((r) => ['https://moyneross.com/insights/who-pays-make-good-dilapidations-and-net-leases', 'https://moyneross.com/insights/same-thing-different-name'].includes(r.url)), 'practitioner shorthand understood');
  assert.equal(out(await call('s3b', 'search_research', { query: 'who is on the hook for dilaps when the tenant leaves', scope: 'research' })).results[0].url, 'https://moyneross.com/insights/who-pays-make-good-dilapidations-and-net-leases');
  const weak = out(await call('s4', 'search_research', { query: 'how much is a house in sydney' }));
  assert.notEqual(weak.matchStrength, 'strong');
  assert.match(weak.boundary, /background only/);
  assert.ok(weak.suggestedQueries.length > 0, 'a weak match suggests questions the corpus answers');
  assert.ok(out(await call('s5', 'search_research', { query: 'MR Index bands', scope: 'methodology' })).results.every((r) => r.kind === 'Methodology'));

  // ── Papers: summary by default, sections, full text, citations ──
  const list = out(await call('l1', 'list_papers', {}));
  assert.equal(list.count, 15);
  assert.equal(list.total, 49);
  assert.ok(list.nextCursor);
  const next = out(await call('l2', 'list_papers', { cursor: list.nextCursor }));
  assert.notEqual(next.papers[0].slug, list.papers[0].slug, 'the cursor moves to the next page');
  assert.ok(out(await call('l3', 'list_papers', { part: 'II' })).papers.every((p) => p.part.number === 'II'));

  for (const ref of ['CMP 024', 'cmp24', 'timing-is-not-risk', 'https://moyneross.com/insights/timing-is-not-risk']) {
    assert.equal(out(await call(`p-${ref}`, 'get_paper', { paper: ref })).paper.slug, 'timing-is-not-risk', `get_paper ${ref}`);
  }
  const sum = await call('p1', 'get_paper', { paper: 'CMP 004' });
  assert.equal(out(sum).paper.contentMarkdown, undefined, 'summary by default');
  assert.ok(out(sum).paper.sections.length >= 4);
  assert.match(out(sum).citation.url, /^https:\/\/moyneross\.com\/insights\/after-rent$/);
  assert.ok(sum.payload.result.content.some((c) => c.type === 'resource_link'));
  const sec = out(await call('p2', 'get_paper', { paper: 'CMP 004', section: 'second income' }));
  assert.equal(sec.section.url, 'https://moyneross.com/insights/after-rent#a-second-income-line');
  assert.equal(sec.citation.section.heading, 'A second income line');
  assert.ok(out(await call('p3', 'get_paper', { paper: 'CMP 004', format: 'full' })).paper.contentMarkdown.length > 2000);
  const noSec = await call('p4', 'get_paper', { paper: 'CMP 004', section: 'helipad' });
  assert.equal(noSec.payload.result.isError, true);
  assert.match(noSec.payload.result.content[0].text, /Its sections are:/, 'a missing section lists the real ones');
  const noPaper = await call('p5', 'get_paper', { paper: 'no-such-paper' });
  assert.equal(noPaper.payload.result.isError, true);
  assert.match(noPaper.payload.result.content[0].text, /CMP 024/, 'errors give an example of valid input');

  for (const style of ['bibtex', 'ris', 'csl-json', 'apa', 'harvard']) {
    const c = out(await call(`c-${style}`, 'cite_paper', { paper: 'after-rent', style, section: 'a second income line' }));
    assert.match(c.formatted, /after-rent#a-second-income-line/, `${style} cites the section`);
  }
  JSON.parse(out(await call('c-json', 'cite_paper', { paper: 'after-rent', style: 'csl-json' })).formatted);

  // ── Methods and the sample ──
  const mriSum = out(await call('m1', 'explain_method', { method: 'mr-index' })).method;
  assert.equal(mriSum.format, 'summary');
  assert.match(mriSum.text, /One reading, on a scale from MR 1 to MR 5/);
  assert.ok(mriSum.text.length < 3000 && mriSum.sections.length > 0);
  assert.ok(out(await call('m2', 'explain_method', { method: 'mr-index', format: 'full' })).method.text.length > mriSum.text.length * 3);
  const badMethod = await call('m3', 'explain_method', { method: 'valuation' });
  assert.ok(badMethod.payload.error || badMethod.payload.result?.isError);

  const sumPart = out(await call('x1', 'get_sample_strategy', {})).sample;
  assert.match(sumPart.text, /\$331,225/);
  const overview = out(await call('x2', 'get_sample_strategy', { part: 'register' })).sample;
  assert.match(overview.text, /^\| Section \| Ten years \| Lines \|$/m, 'register without a section is an overview');
  assert.ok(overview.text.length < 3000);
  const roofs = out(await call('x3', 'get_sample_strategy', { part: 'register', section: 'roofs' })).sample;
  assert.match(roofs.text, /^\| Item \| Element \| Condition .*\| Cost basis \|$/m);
  assert.match(roofs.text, /^\| 4\.1 \| Roof Coverings/m);

  const engage = out(await call('e1', 'working_with_moyne_ross', {}));
  assert.match(engage.text, /950/);
  // ── The Technical Library ──
  const tl = out(await call('t1', 'list_technical_pages', {}));
  assert.equal(tl.total, 103);
  assert.equal(tl.pages.length, 15);
  assert.equal(tl.sections.length, 13);
  assert.deepEqual(tl.severityScale.situations.map((x) => x.id), ['safety', 'failure', 'condition', 'lifecycle', 'deadline', 'check', 'nil']);
  const tlNext = out(await call('t2', 'list_technical_pages', { cursor: tl.nextCursor }));
  assert.ok(tlNext.pages.every((p) => !tl.pages.some((q) => q.slug === p.slug)), 'library paging does not repeat');
  assert.ok(out(await call('t3', 'list_technical_pages', { section: 'facades' })).pages.every((p) => p.section === 'Façades'));
  assert.ok(out(await call('t4', 'list_technical_pages', { page_type: 'space', limit: 50 })).pages.every((p) => p.pageType === 'space'));
  const badSection = await call('t5', 'list_technical_pages', { section: 'astrology' });
  assert.ok(badSection.payload.result?.isError);
  const tp = await call('t6', 'get_technical_page', { page: 'Masonry/Brickwork' });
  assert.equal(out(tp).page.slug, 'masonry-brickwork');
  assert.equal(out(tp).page.sections.length, 11);
  assert.equal(out(tp).page.contentMarkdown, undefined, 'a summary carries no full text');
  assert.ok(tp.payload.result.content.some((c) => c.type === 'resource_link' && c.uri === 'moyneross://technical/masonry-brickwork'));
  const sev = out(await call('t7', 'get_technical_page', { page: 'masonry-brickwork', section: 'severity' }));
  assert.equal(sev.section.url, 'https://moyneross.com/technical/masonry-brickwork#severity');
  assert.equal(sev.citation.url, 'https://moyneross.com/technical/masonry-brickwork#severity');
  assert.ok(out(await call('t8', 'get_technical_page', { page: 'roof-coverings', format: 'full' })).page.contentMarkdown.length > 5000);
  const tMiss = await call('t9', 'get_technical_page', { page: 'lift' });
  assert.ok(tMiss.payload.result?.isError && /Closest:/.test(tMiss.payload.result.content[0].text), 'an ambiguous page offers candidates');
  const tCite = out(await call('t10', 'cite_paper', { paper: 'roof-coverings', style: 'bibtex', section: 'diagnosis' }));
  assert.match(tCite.formatted, /Moyne Ross Technical Library/);
  assert.equal(tCite.citation.url, 'https://moyneross.com/technical/roof-coverings#diagnosis');
  const tSearch = out(await call('t11', 'search_research', { query: 'horizontal cracks in a brick cavity wall', scope: 'technical', response_format: 'detailed' }));
  assert.equal(tSearch.results[0].url, 'https://moyneross.com/technical/masonry-brickwork');
  assert.equal(tSearch.results[0].citation.publication, 'Moyne Ross Technical Library');

  const start = out(await call('h1', 'start_strategy_link', { building: '12 Example St, Brunswick VIC 3056', organisation: 'Acme & Co', type: 'industrial' }));
  assert.equal(start.link, 'https://moyneross.com/contact?building=12%20Example%20St%2C%20Brunswick%20VIC%203056&organisation=Acme%20%26%20Co&type=industrial&utm_source=moyneross-mcp');
  const badRole = await call('h2', 'start_strategy_link', { building: '1 Poultry, London', role: 'astronaut' });
  assert.ok(badRole.payload.error || badRole.payload.result?.isError);

  // ── Prompts and completion ──
  const prompts = await postModern({ id: 'pl', method: 'prompts/list' });
  assert.deepEqual(prompts.payload.result.prompts.map((p) => p.name).sort(), ['answer_from_research', 'brief_on_topic', 'compare_papers', 'read_a_building_element']);
  const ec = await postModern({ id: 'ec', method: 'completion/complete', params: { ref: { type: 'ref/prompt', name: 'read_a_building_element' }, argument: { name: 'element', value: 'masonry' } } });
  assert.ok(ec.payload.result.completion.values.includes('masonry-brickwork'), 'the element prompt autocompletes library slugs');
  const pg = await postModern({ id: 'pg', method: 'prompts/get', name: 'answer_from_research', params: { name: 'answer_from_research', arguments: { question: 'Is deferred maintenance a liability?' } } });
  assert.match(pg.payload.result.messages[0].content.text, /Is deferred maintenance a liability\?/);
  const pc = await postModern({ id: 'pc', method: 'completion/complete', params: { ref: { type: 'ref/prompt', name: 'compare_papers' }, argument: { name: 'first', value: 'after' } } });
  assert.ok(pc.payload.result.completion.values.includes('after-rent'), 'prompt arguments autocomplete paper slugs');
  const rc = await postModern({ id: 'rc', method: 'completion/complete', params: { ref: { type: 'ref/resource', uri: 'moyneross://papers/{slug}' }, argument: { name: 'slug', value: 'deferred' } } });
  assert.ok(rc.payload.result.completion.values.includes('deferred-maintenance-is-debt'), 'the paper template autocompletes');

  // ── Resources ──
  const templates = await postModern({ id: 'rtl', method: 'resources/templates/list' });
  assert.ok(templates.payload.result.resourceTemplates.some((t) => t.uriTemplate === 'moyneross://papers/{slug}'));
  assert.ok(templates.payload.result.resourceTemplates.some((t) => t.uriTemplate === 'moyneross://technical/{slug}'));
  const resources = await postModern({ id: 'rl', method: 'resources/list' });
  const uris = resources.payload.result.resources.map((r) => r.uri);
  for (const u of ['moyneross://catalogue', 'moyneross://sample', 'moyneross://methods/capital-register', 'moyneross://methods/mr-index', 'moyneross://papers/after-rent']) assert.ok(uris.includes(u), `missing ${u}`);
  assert.equal(uris.filter((u) => u.startsWith('moyneross://papers/')).length, 49);
  assert.equal(uris.filter((u) => u.startsWith('moyneross://technical/')).length, 103);
  const tread = await postModern({ id: 'trd', method: 'resources/read', name: 'moyneross://technical/roof-coverings', params: { uri: 'moyneross://technical/roof-coverings' } });
  assert.match(tread.payload.result.contents[0].text, /# Roof Coverings/);
  assert.match(tread.payload.result.contents[0].text, /Cite: Moyne Ross \(2026\)\. Roof Coverings\. Moyne Ross Technical Library/);
  const read = await postModern({ id: 'rd', method: 'resources/read', name: 'moyneross://papers/after-rent', params: { uri: 'moyneross://papers/after-rent' } });
  cacheable(read, 'resources/read');
  assert.match(read.payload.result.contents[0].text, /# After Rent/);
  assert.match(read.payload.result.contents[0].text, /Cite: Moyne Ross \(2026\)/);
  const missing = await postModern({ id: 'rm', method: 'resources/read', name: 'moyneross://nothing-here', params: { uri: 'moyneross://nothing-here' } });
  assert.equal(missing.payload.error?.code, -32602, 'an unknown resource is -32602 under 2026-07-28');

  // ── Routing headers and 2025-era clients ──
  const mismatch = await handleMcpRequest(new Request(ENDPOINT, {
    method: 'POST',
    headers: { Accept: 'application/json, text/event-stream', 'Content-Type': 'application/json', 'MCP-Protocol-Version': MODERN_VERSION, 'Mcp-Method': 'tools/call', 'Mcp-Name': 'wrong_tool', Host: 'test.local' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 'mm', method: 'tools/call', params: { name: 'search_research', arguments: { query: 'MR Index' }, _meta: modernMeta() } }),
  }));
  assert.equal(mismatch.status, 400);
  assert.equal((await parseJsonRpc(mismatch)).error.code, -32020);

  async function legacyInit(id, options = {}) {
    const headers = new Headers({ Accept: 'application/json, text/event-stream', 'Content-Type': 'application/json', Host: 'test.local' });
    if (options.userAgent) headers.set('User-Agent', options.userAgent);
    const response = await handleMcpRequest(new Request(ENDPOINT, { method: 'POST', headers,
      body: JSON.stringify({ jsonrpc: '2.0', id, method: 'initialize', params: { protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 'moyneross-legacy-test', version: '1.0.0' } } }) }), { endpoint: options.endpoint });
    return { response, payload: await parseJsonRpc(response) };
  }
  const legacy = await legacyInit('legacy');
  assert.equal(legacy.payload.result.protocolVersion, '2025-11-25');
  assert.equal(legacy.payload.result.serverInfo.name, 'moyneross');
  assert.equal(legacy.payload.result.serverInfo.websiteUrl, 'https://moyneross.com/assistants');
  assert.equal(legacy.payload.result.serverInfo.icons?.length, 3);

  // ── Neutrality and the paid-service boundary ──
  // On every surface, research answers carry no price, no request link and no
  // prompting to use the request tool. On /mcp/openai and for ChatGPT, the two
  // paid-service tools are absent altogether.
  const PROMO = /\b950\b|start_strategy_link|moyneross\.com\/contact|Start your strategy/;
  const surfaces = [
    { label: 'standard', paid: true, options: {} },
    { label: 'openai endpoint', paid: false, options: { endpoint: 'openai' } },
    { label: 'chatgpt on /mcp', paid: false, options: { userAgent: 'openai-mcp/1.0 (ChatGPT)' } },
  ];
  for (const surface of surfaces) {
    const init = await legacyInit(`n-init-${surface.label}`, surface.options);
    assert.doesNotMatch(init.payload.result.instructions, /\b950\b|fixed fee/, `${surface.label}: no price in instructions`);
    const listed = (await postModern({ id: `n-list-${surface.label}`, method: 'tools/list', ...surface.options })).payload.result.tools.map((t) => t.name);
    const ask = (id, name, args) => call(id, name, args, surface.options);
    const answers = [
      await ask('n1', 'search_research', { query: 'deferred maintenance' }),
      await ask('n2', 'search_research', { query: 'cheap flights to london' }),
      await ask('n3', 'get_sample_strategy', {}),
      await ask('n4', 'get_sample_strategy', { part: 'register', section: 'roofs' }),
      await ask('n5', 'explain_method', { method: 'mr-index', format: 'full' }),
      await ask('n6', 'explain_method', { method: 'capital-register', format: 'full' }),
      await ask('n7', 'get_paper', { paper: 'CMP 024', format: 'full' }),
      await ask('n8', 'list_papers', {}),
      await ask('n9', 'cite_paper', { paper: 'CMP 024' }),
      await ask('n10', 'list_technical_pages', {}),
      await ask('n11', 'get_technical_page', { page: 'roof-coverings', format: 'full' }),
      await ask('n12', 'search_research', { query: 'concrete spalling in a car park', scope: 'technical' }),
    ];
    for (const a of answers) {
      assert.doesNotMatch(JSON.stringify(a.payload.result), PROMO, `${surface.label}: a research answer carries promotion`);
      assert.doesNotMatch(a.payload.result.content[0].text, /\n\n\s*$/, `${surface.label}: trailing gap`);
    }
    if (surface.paid) {
      assert.equal(listed.length, 10, `${surface.label}: all ten tools`);
      assert.match(init.payload.result.instructions, /start_strategy_link/);
    } else {
      assert.equal(listed.length, 8, `${surface.label}: the eight research tools`);
      for (const n of ['start_strategy_link', 'working_with_moyne_ross']) {
        assert.ok(!listed.includes(n), `${surface.label} must not offer ${n}`);
        const blocked = await ask(`b-${n}`, n, n === 'start_strategy_link' ? { building: '1 Poultry, London' } : {});
        assert.ok(blocked.payload.error || blocked.payload.result?.isError, `${surface.label} must refuse ${n}`);
      }
      assert.doesNotMatch(init.payload.result.instructions, /start_strategy_link|working_with_moyne_ross/);
    }
  }

  console.log('PASS  protocol: Host/Origin guards, CORS and method controls');
  console.log('PASS  protocol: 2026-07-28 core (cache fields, stable order, result metadata, -32602, routing headers) and 2025-era clients');
  console.log('PASS  protocol: 10 tools with full annotations, icons and size ceilings, against their shared contracts');
  console.log('PASS  protocol: search (concise, detailed, match evidence, shorthand, suggestions), papers (summary, sections, full, paging), citations in 5 styles');
  console.log('PASS  protocol: Technical Library (list, sections, page, section, full, candidates, citation, scoped search), methods, sample, prompts with completion, both templates and 156 resources');
  console.log('PASS  protocol: neutral research answers on every surface; on /mcp/openai and for ChatGPT, research tools only');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
