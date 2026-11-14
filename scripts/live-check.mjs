#!/usr/bin/env node
// A robustness check against a running server (production by default):
//   npm run live-check                       https://mcp.moyneross.com
//   npm run live-check -- http://localhost:3000
// Not part of npm run check: it makes about 2,500 requests over the network.
// It throws malformed and hostile protocol traffic at /mcp, fetches every paper,
// library page, section, full-page part, citation and resource, checks
// determinism and that /mcp, /mcp/openai and REST agree, and puts it under a
// short burst of load. Exits non-zero on any finding.
const BASE = (process.argv[2] || 'https://mcp.moyneross.com').replace(/\/$/, '');
const findings = [];
const fail = (area, msg) => findings.push(`${area}: ${msg}`);
const ms = [];
const LEAK = /(node_modules|\.ts:\d+|\bat [A-Za-z_.]+ \(|TypeError|ReferenceError)/;
async function raw(path, init = {}) {
  const t0 = performance.now();
  try {
    const r = await fetch(BASE + path, { ...init, signal: AbortSignal.timeout(15000) });
    const text = await r.text(); ms.push(performance.now() - t0);
    if (r.status >= 500) fail('5xx', `${init.method ?? 'GET'} ${path} ${r.status}`);
    if (r.status >= 400 && LEAK.test(text)) fail('leak', `${path}: ${text.slice(0, 120)}`);
    return { status: r.status, text, headers: r.headers };
  } catch (e) { fail('network', `${path}: ${e}`); return { status: 0, text: '', headers: new Headers() }; }
}
const parse = (t) => { try { return t.trim().startsWith('{') ? JSON.parse(t) : JSON.parse((t.split('\n').find((l) => l.startsWith('data:')) ?? 'data:null').slice(5)); } catch { return undefined; } };
let seq = 0;
async function rpc(method, params = {}, { path = '/mcp', headers = {} } = {}) {
  const h = { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream', 'User-Agent': 'moyneross-live-check/1.0', 'MCP-Protocol-Version': '2026-07-28', 'Mcp-Method': method, ...headers };
  const name = params.name ?? params.uri; if (name && !('Mcp-Name' in headers)) h['Mcp-Name'] = name;
  const body = JSON.stringify({ jsonrpc: '2.0', id: ++seq, method, params: { ...params, _meta: { 'io.modelcontextprotocol/protocolVersion': '2026-07-28', 'io.modelcontextprotocol/clientInfo': { name: 'live-check', version: '1' }, 'io.modelcontextprotocol/clientCapabilities': {} } } });
  const r = await raw(path, { method: 'POST', headers: h, body });
  return { ...r, json: parse(r.text) };
}
const tool = (name, args, opts) => rpc('tools/call', { name, arguments: args }, opts);
const sc = (r) => r.json?.result?.structuredContent;
const isErr = (r) => Boolean(r.json?.error || r.json?.result?.isError);
async function pool(items, n, fn) { let i = 0; await Promise.all(Array.from({ length: n }, async () => { while (i < items.length) { const k = i++; await fn(items[k]); } })); }

// 1. Hostile and malformed traffic: refused cleanly, never a 5xx or a leak.
const H = { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream', 'MCP-Protocol-Version': '2026-07-28', 'Mcp-Method': 'tools/list' };
for (const body of ['{"jsonrpc":', '', '42', '[{"jsonrpc":"2.0","id":1,"method":"tools/list"}]', '{"id":1,"method":"tools/list"}']) { const r = await raw('/mcp', { method: 'POST', headers: H, body }); if (r.status !== 400) fail('protocol', `malformed body ${JSON.stringify(body)} -> ${r.status}`); }
for (const origin of ['https://evil.example', 'null', 'https://claude.ai.evil.example']) { const r = await raw('/mcp', { method: 'POST', headers: { ...H, Origin: origin }, body: '{}' }); if (r.status !== 403) fail('boundary', `Origin ${origin} -> ${r.status}`); }
if ((await rpc('tools/list', {}, { headers: { Origin: 'https://claude.ai' } })).status !== 200) fail('boundary', 'claude.ai origin refused');
for (const [args, label] of [[{ query: 12345 }, 'wrong type'], [{ query: 'x'.repeat(5000) }, 'too long'], [{ query: 'roof', limit: 0 }, 'limit 0'], [{ query: 'roof', scope: '../x' }, 'bad scope']]) if (!isErr(await tool('search_research', args))) fail('validation', `search_research ${label} accepted`);
for (const uri of ['moyneross://papers/../../etc/passwd', 'file:///etc/passwd', 'moyneross://technical/no-such-page', 'moyneross://papers/no-such-paper']) { const r = await rpc('resources/read', { uri }); if (r.json?.error?.code !== -32602) fail('resources', `${uri} -> ${JSON.stringify(r.json?.error ?? 'contents')}`); }
for (const cursor of ['-999', '0', 'zz', 'NaN']) if (!isErr(await tool('list_papers', { cursor }))) fail('paging', `list_papers accepted cursor ${cursor}`);
if (!isErr(await tool('get_sample_strategy', { part: 'register', section: 'zzzz' }))) fail('sample', 'unknown register section not reported');
const link = sc(await tool('start_strategy_link', { building: '1 Main St\r\nX: y', email: 'a@b.c\r\nBcc: z@z.z' }))?.link ?? '';
if (/%0D|%0A/i.test(link) || link.includes('email=')) fail('hand-over', `control characters or a bad email carried: ${link}`);
if ((await tool('search_research', { query: 'x' })).json?.result?.isError !== true) fail('validation', 'a one-character query was accepted');
const cg = await rpc('tools/list', {}, { headers: { 'User-Agent': 'openai-mcp/1.0 (ChatGPT)' } });
if (cg.json?.result?.tools?.some((t) => t.name === 'start_strategy_link')) fail('openai', 'hand-over offered to ChatGPT on /mcp');
if ((await rpc('tools/list', {}, { path: '/mcp/openai' })).json?.result?.tools?.length !== 12) fail('openai', '/mcp/openai does not offer exactly the twelve research tools');

// 2. Every paper, library page, section, full-page part, citation and resource.
const papers = [], pages = [];
for (let cursor; ;) { const s = sc(await tool('list_papers', { limit: 25, ...(cursor ? { cursor } : {}) })); papers.push(...(s?.papers ?? [])); if (!s?.nextCursor) break; cursor = s.nextCursor; }
for (let cursor; ;) { const s = sc(await tool('list_technical_pages', { limit: 50, ...(cursor ? { cursor } : {}) })); pages.push(...(s?.pages ?? [])); if (!s?.nextCursor) break; cursor = s.nextCursor; }
const textOf = (r) => (r.json?.result?.content ?? []).filter((c) => c.type === 'text').reduce((n, c) => n + c.text.length, 0);
const jobs = [];
for (const p of papers) {
  jobs.push(['paper', p.slug, () => tool('get_paper', { paper: p.slug }), 20000]);
  jobs.push(['paper full', p.slug, () => tool('get_paper', { paper: p.slug, format: 'full' })]);
  jobs.push(['paper by number', p.slug, () => tool('get_paper', { paper: p.id }), 20000, (r) => sc(r)?.paper?.slug === p.slug]);
  for (const style of ['bibtex', 'ris', 'csl-json', 'apa', 'harvard']) jobs.push(['cite ' + style, p.slug, () => tool('cite_paper', { paper: p.slug, style })]);
  jobs.push(['paper resource', p.slug, () => rpc('resources/read', { uri: `moyneross://papers/${p.slug}` })]);
}
const pageSummaries = new Map();
for (const p of pages) {
  jobs.push(['page', p.slug, async () => { const r = await tool('get_technical_page', { page: p.slug }); pageSummaries.set(p.slug, sc(r)?.page); return r; }, 20000]);
  jobs.push(['page by title', p.slug, () => tool('get_technical_page', { page: p.title }), 20000, (r) => sc(r)?.page?.slug === p.slug]);
  jobs.push(['page resource', p.slug, () => rpc('resources/read', { uri: `moyneross://technical/${p.slug}` })]);
}
await pool(jobs, 12, async ([kind, slug, fn, budget, check]) => {
  const r = await fn();
  if (r.status !== 200 || isErr(r)) return fail('content', `${kind} ${slug}: ${JSON.stringify(r.json?.error ?? r.json?.result?.content?.[0]?.text ?? r.status).slice(0, 120)}`);
  if (budget && r.text.length > budget) fail('size', `${kind} ${slug}: default answer ${r.text.length} > ${budget}`);
  if (textOf(r) > 40000) fail('size', `${kind} ${slug}: text ${textOf(r)} > 40000`);
  if (check && !check(r)) fail('resolution', `${kind} ${slug} resolved elsewhere`);
});
const sections = [...pageSummaries].flatMap(([slug, pg]) => (pg?.sections ?? []).map((s) => [slug, s.id]));
await pool(sections, 12, async ([slug, id]) => { const r = await tool('get_technical_page', { page: slug, section: id }); const got = sc(r)?.section; if (!got?.text?.trim() || got.id !== id) fail('sections', `${slug}#${id}`); if (textOf(r) > 40000) fail('size', `${slug}#${id}`); });
await pool(pages, 8, async (p) => {
  let cursor, n = 0, heads = 0;
  do { const r = await tool('get_technical_page', { page: p.slug, format: 'full', ...(cursor ? { cursor } : {}) }); const s = sc(r); if (!s) return fail('paging', `${p.slug} part ${n + 1}`); if (textOf(r) > 40000) fail('size', `${p.slug} full part ${n + 1}`); heads += (s.page.contentMarkdown?.match(/^## /gm) ?? []).length; cursor = s.part?.nextCursor; n++; } while (cursor && n < 10);
  if (heads !== (pageSummaries.get(p.slug)?.sections.length ?? -1)) fail('paging', `${p.slug}: parts carry ${heads} sections`);
});

// 3. Deterministic, and the same over /mcp, /mcp/openai and REST.
const queries = ['deferred maintenance', 'dilaps at lease end', 'MR Index bands', 'concrete cancer', 'tin roof leaking', 'why is my ceiling dripping when it has not rained', 'lift modernisation when parts are obsolete', 'EPC C by 2030 for an office'];
for (const q of queries) {
  const key = (s) => JSON.stringify([s?.matchStrength, s?.results?.map((x) => [x.url, x.score, x.section?.url])]);
  const a = sc(await tool('search_research', { query: q })), b = sc(await tool('search_research', { query: q })), o = sc(await tool('search_research', { query: q }, { path: '/mcp/openai' }));
  const rest = parse((await raw(`/v1/search?query=${encodeURIComponent(q)}`)).text);
  if (key(a) !== key(b)) fail('determinism', q);
  if (key(a) !== key(o)) fail('parity', `/mcp/openai: ${q}`);
  if (key(a) !== key(rest)) fail('parity', `REST: ${q}`);
}

// 4. A short burst: every request answered.
const burst = await Promise.all(Array.from({ length: 60 }, (_, i) => (i % 2 ? tool('search_research', { query: 'chiller end of life' }) : raw('/v1/search?query=roof%20leak'))));
const notOk = burst.filter((r) => r.status !== 200).length; if (notOk) fail('load', `${notOk} of 60 burst requests failed`);

const sorted = [...ms].sort((x, y) => x - y);
console.log(`${BASE}: ${ms.length} requests; ${papers.length} papers, ${pages.length} pages, ${sections.length} sections; p50 ${Math.round(sorted[Math.floor(sorted.length / 2)])}ms, p95 ${Math.round(sorted[Math.floor(sorted.length * 0.95)])}ms`);
if (papers.length !== 49 || pages.length !== 103) fail('paging', `listed ${papers.length} papers and ${pages.length} pages`);
if (findings.length) { console.error(`\n${findings.length} finding(s):\n- ${findings.join('\n- ')}`); process.exit(1); }
console.log('Live check passed.');
