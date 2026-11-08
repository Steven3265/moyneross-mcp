import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';

// Edge cases, answer sizes and speed: the launch-day checks the main suites
// do not cover. Runs against the built server (dist/).
const t0 = performance.now();
const { handleMcpRequest } = await import('../dist/src/http-handler.js');
const coldMs = performance.now() - t0;
const quiet = console.error; console.error = () => {};

const ENDPOINT = 'https://test.local/mcp';
const meta = { 'io.modelcontextprotocol/protocolVersion': '2026-07-28', 'io.modelcontextprotocol/clientInfo': { name: 'edge-test', version: '1.0.0' }, 'io.modelcontextprotocol/clientCapabilities': {} };
async function rpc(method, params = {}, name) {
  const headers = new Headers({ Accept: 'application/json, text/event-stream', 'Content-Type': 'application/json', 'MCP-Protocol-Version': '2026-07-28', 'Mcp-Method': method, Host: 'test.local' });
  if (name) headers.set('Mcp-Name', name);
  const res = await handleMcpRequest(new Request(ENDPOINT, { method: 'POST', headers, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params: { ...params, _meta: meta } }) }));
  const text = await res.text();
  const body = (res.headers.get('content-type') ?? '').includes('event-stream') ? JSON.parse(text.split('\n').filter((l) => l.startsWith('data:')).at(-1).slice(5)) : JSON.parse(text);
  return { status: res.status, body };
}
const call = (name, args) => rpc('tools/call', { name, arguments: args }, name);
const rejected = (r) => Boolean(r.body.error || r.body.result?.isError);

try {
  // Odd and hostile input
  let r = await call('search_research', { query: '🏢 rénovation of an ägeing building — façade?' });
  assert.equal(r.status, 200);
  assert.ok(r.body.result.structuredContent.results.length > 0, 'accented and emoji questions still search');
  r = await call('search_research', { query: 'the of and is it' });
  assert.equal(r.body.result.structuredContent.matchStrength, 'none', 'stop words only: none');
  r = await call('search_research', { query: 'roof '.repeat(100).slice(0, 500) });
  assert.equal(r.status, 200, 'a 500-character question is accepted');
  assert.ok(rejected(await call('search_research', { query: 'x'.repeat(501) })), 'over 500 characters is rejected');
  assert.ok(rejected(await call('search_research', { query: 'a' })), 'under 2 characters is rejected');
  assert.ok(rejected(await call('search_research', { query: 'roof', scope: 'everything' })), 'an unknown scope is rejected');
  assert.ok(rejected(await call('list_papers', { part: 'IX' })), 'an unknown part is rejected');
  assert.ok(rejected(await call('get_paper', { paper: 'CMP 999' })), 'a paper that does not exist is an error');
  r = await call('start_strategy_link', { building: '1 Main St & role=admin#top?x="y"', note: '<script>alert(1)</script>' });
  const link = new URL(r.body.result.structuredContent.link);
  assert.equal(link.origin + link.pathname, 'https://moyneross.com/contact');
  assert.equal(link.searchParams.get('building'), '1 Main St & role=admin#top?x="y"', 'injection characters stay inside the building value');
  assert.equal(link.searchParams.get('role'), null, 'no parameter can be injected');
  assert.equal(link.hash, '', 'no fragment can be injected');
  assert.ok(rejected(await call('start_strategy_link', { building: 'ab' })), 'a building under 3 characters is rejected');
  r = await rpc('resources/read', { uri: 'moyneross://papers/not-a-paper' }, 'moyneross://papers/not-a-paper');
  assert.ok(r.body.error, 'an unknown resource is an error');
  r = await rpc('tools/call', { name: 'no_such_tool', arguments: {} }, 'no_such_tool');
  assert.ok(rejected(r), 'an unknown tool is an error');

  // Answer sizes, per client. Every answer is sent twice by design
  // (structuredContent and text). Budgets, from each client's limits:
  //   every default answer (no format or part asked for), whole JSON: <= 20,000
  //     characters, so it stays inline even in GitHub Copilot (20 KB offload);
  //   every answer's model-visible text, in any mode: <= 40,000 characters,
  //     Gemini CLI's truncation threshold; Claude Code's 25,000 tokens is wider.
  const { papers } = await import('../dist/src/core.js');
  const sizes = [];
  const measure = async (label, name, args, isDefault) => {
    const x = await call(name, args);
    const json = JSON.stringify(x.body.result).length;
    const text = x.body.result.content.filter((c) => c.type === 'text').reduce((n, c) => n + c.text.length, 0);
    sizes.push({ label, json, text, isDefault });
  };
  await measure('search_research', 'search_research', { query: 'deferred maintenance and capital planning' }, true);
  await measure('search_research detailed x10', 'search_research', { query: 'office building', limit: 10, response_format: 'detailed' }, false);
  await measure('list_papers', 'list_papers', {}, true);
  await measure('list_papers 25', 'list_papers', { limit: 25 }, false);
  await measure('get_sample_strategy', 'get_sample_strategy', {}, true);
  await measure('get_sample_strategy register', 'get_sample_strategy', { part: 'register' }, true);
  for (const m of ['capital-register', 'mr-index']) {
    await measure(`explain_method ${m}`, 'explain_method', { method: m }, true);
    await measure(`explain_method ${m} full`, 'explain_method', { method: m, format: 'full' }, false);
  }
  const { sampleSections } = await import('../dist/src/core.js');
  let bigSection = { json: 0 };
  for (const sec of sampleSections()) { await measure(`register: ${sec}`, 'get_sample_strategy', { part: 'register', section: sec }, false); const last = sizes.pop(); if (last.json > bigSection.json) bigSection = last; }
  sizes.push({ ...bigSection, label: `largest register section (${bigSection.label.replace('register: ', '')})` });
  let bigSum = { json: 0 }, bigFull = { json: 0 };
  for (const p of papers) {
    await measure(`paper ${p.slug}`, 'get_paper', { paper: p.slug }, true); const a = sizes.pop(); if (a.json > bigSum.json) bigSum = a;
    await measure(`paper ${p.slug} full`, 'get_paper', { paper: p.slug, format: 'full' }, false); const b = sizes.pop(); if (b.json > bigFull.json) bigFull = b;
  }
  sizes.push({ ...bigSum, label: `largest paper summary (${bigSum.label.replace('paper ', '')})` }, { ...bigFull, label: `largest full paper (${bigFull.label.replace('paper ', '').replace(' full', '')})` });
  // The Technical Library: the default list, every page's summary, largest section and full text.
  const { technicalPages } = await import('../dist/src/core.js');
  await measure('list_technical_pages', 'list_technical_pages', {}, true);
  await measure('list_technical_pages 50', 'list_technical_pages', { limit: 50 }, false);
  await measure('search_research technical detailed x10', 'search_research', { query: 'roof leaks', scope: 'technical', limit: 10, response_format: 'detailed' }, false);
  let tSum = { json: 0 }, tFull = { json: 0 }, tSec = { json: 0 };
  for (const p of technicalPages) {
    await measure(`library ${p.slug}`, 'get_technical_page', { page: p.slug }, true); const a = sizes.pop(); if (a.json > tSum.json) tSum = a;
    await measure(`library ${p.slug}`, 'get_technical_page', { page: p.slug, format: 'full' }, false); const b = sizes.pop(); if (b.json > tFull.json) tFull = b;
    for (const x of p.sections) { await measure(`library ${p.slug} ${x.id}`, 'get_technical_page', { page: p.slug, section: x.id }, false); const c = sizes.pop(); if (c.json > tSec.json) tSec = c; }
  }
  sizes.push({ ...tSum, label: `largest library summary (${tSum.label.replace('library ', '')})` }, { ...tSec, label: `largest library section (${tSec.label.replace('library ', '')})` }, { ...tFull, label: `largest full library page (${tFull.label.replace('library ', '')})` });
  for (const x of sizes) {
    if (x.isDefault) assert.ok(x.json <= 20_000, `${x.label}: default answer ${x.json} characters (budget 20,000)`);
    assert.ok(x.text <= 40_000, `${x.label}: model-visible text ${x.text} characters (budget 40,000)`);
  }

  // Speed
  const times = [];
  for (let i = 0; i < 40; i++) { const s = performance.now(); await call('search_research', { query: 'deferred maintenance and capital planning' }); times.push(performance.now() - s); }
  times.sort((a, b) => a - b);
  const p50 = times[20], p95 = times[38];
  assert.ok(p95 < 250, `search p95 ${p95.toFixed(1)} ms`);

  console.error = quiet;
  console.log('PASS  edge: accented and emoji input, length limits, unknown values, missing papers, resources and tools');
  console.log('PASS  edge: the hand-over link cannot be injected into (parameters, fragment, script)');
  console.log(`PASS  edge: every default answer within 20k characters (Copilot), all model-visible text within 40k (Gemini CLI)`);
  for (const x of sizes) console.log(`        ${x.label.padEnd(58)} ${(x.json / 1000).toFixed(1).padStart(5)}k answer, ${(x.text / 1000).toFixed(1).padStart(5)}k text${x.isDefault ? '  (default)' : ''}`);
  console.log(`PASS  edge: cold start ${coldMs.toFixed(0)} ms; search p50 ${p50.toFixed(1)} ms, p95 ${p95.toFixed(1)} ms`);
} catch (e) {
  console.error = quiet;
  console.error(e);
  process.exitCode = 1;
}
