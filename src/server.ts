import { McpServer, ResourceTemplate, completable } from '@modelcontextprotocol/server';
import * as z from 'zod/v4';
import {
  SERVER_DESCRIPTION,
  SERVER_ICONS,
  SERVER_NAME,
  SERVER_TITLE,
  SERVER_VERSION,
  SERVER_WEBSITE_URL,
  START_LINK_BASE,
  START_LINK_SOURCE,
} from './identity.js';
import { TOOL_CONTRACTS, searchBoundary, toolNamesForRequest } from './contracts.js';
import {
  citationFor,
  corpusVersion,
  engagement,
  formatCitation,
  getMethod,
  getPaper,
  listPapers,
  matchDetail,
  matchStrength,
  methodView,
  paperForUrl,
  paperListing,
  paperSection,
  paperSummary,
  page,
  papers,
  renderPaper,
  renderSearchResults,
  sample,
  searchResearch,
  snapshot,
  startStrategyLink,
  suggestedQueries,
  formatTechnicalCitation,
  getTechnicalPage,
  listTechnicalPages,
  renderTechnicalPage,
  severityScale,
  technicalCandidates,
  technicalCitationFor,
  technicalForUrl,
  technicalFrameworkSections,
  technicalListing,
  technicalMarkdown,
  technicalPages,
  technicalSection,
  technicalSectionName,
  technicalSummary,
} from './core.js';
import type { PaperRecord, TechnicalPage } from './types.js';
import { currentClient, handOverEnabled } from './client-label.js';

const readOnlyAnnotations = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };
const PUBLIC_CACHE = { ttlMs: 3_600_000, cacheScope: 'public' as const };
// Claude Code saves text results over 50,000 characters to a file unless the
// tool declares a higher ceiling; these tools can return a full paper, page
// or register section, so they keep their answers inline.
const LARGE_RESULT_META = { 'anthropic/maxResultSizeChars': 100_000 };

type Content =
  | { type: 'text'; text: string }
  | { type: 'resource_link'; uri: string; name: string; title?: string; description?: string; mimeType?: string };

function result(structuredContent: Record<string, unknown>, text: string, links: Content[] = []) {
  return { content: [{ type: 'text' as const, text }, ...links], structuredContent };
}

function paperLink(p: PaperRecord): Content {
  return { type: 'resource_link', uri: p.resourceUri, name: p.slug, title: `${p.id} · ${p.title}`, description: p.answer, mimeType: 'text/markdown' };
}

function technicalLink(p: TechnicalPage): Content {
  return { type: 'resource_link', uri: p.resourceUri, name: p.slug, title: `Technical Library · ${p.title}`, description: p.answer, mimeType: 'text/markdown' };
}

function errorResult(text: string) {
  return { content: [{ type: 'text' as const, text }], isError: true };
}

// Privacy-minimised operational telemetry, written to stderr so hosted logs
// capture it without corrupting the stdio protocol channel. Questions,
// addresses, names, emails and client identifiers are never logged; only a
// coarse client family derived from User-Agent, and counts.
function logUse(tool: string, detail: Record<string, unknown>): void {
  try {
    const client = currentClient();
    console.error(JSON.stringify({ evt: 'tool_call', tool, ...(client ? { client } : {}), ...detail, at: new Date().toISOString() }));
  } catch {
    // Never let telemetry interfere with serving the request.
  }
}

export function createMcpServer(): McpServer {
  const server = new McpServer(
    { name: SERVER_NAME, version: SERVER_VERSION, title: SERVER_TITLE, description: SERVER_DESCRIPTION, websiteUrl: SERVER_WEBSITE_URL, icons: SERVER_ICONS },
    {
      cacheHints: {
        'server/discover': PUBLIC_CACHE,
        'tools/list': { ttlMs: 86_400_000, cacheScope: 'public' },
        'prompts/list': { ttlMs: 86_400_000, cacheScope: 'public' },
        'resources/list': PUBLIC_CACHE,
        'resources/templates/list': PUBLIC_CACHE,
        'resources/read': PUBLIC_CACHE,
      },
      instructions: [
        'Moyne Ross publishes research on planning capital for commercial and multi-unit buildings: lifecycle and condition, obsolescence, refurbishment or redevelopment, energy, leases and make good, due diligence, and the Australian, British and US markets.',
        'Moyne Ross also publishes the Technical Library: one page for each building element and functional space a Capital Strategy assesses, on how it fails, what to look for, how serious a finding is and what fixes it.',
        'Workflow: search_research first (scope technical for a question about one element or system); then get_paper or get_technical_page (a summary by default, a section, or the full text) for anything you rely on, and explain_method for the Capital Register or the MR Index. Prefer several small, targeted searches to one broad one.',
        'Cite the canonical moyneross.com URL returned, to the section where one is given; cite_paper returns an exact citation, for a paper or a library page, to use as given. Carry limitations through rather than overstating a finding. Technical Library pages describe how elements behave in general and carry no prices; they are never evidence about the condition of a particular building.',
        'Read matchStrength: strong means the top result carries the question\'s distinctive words; weak means the results are background only, and you should say so. Read the answer before relying on any result.',
        'The research is general. A Capital Strategy is desk-based and reviewed by Moyne Ross before release; it is not an inspection, a valuation or a guarantee of cost.',
        ...(handOverEnabled() ? ['If the person asks how to engage Moyne Ross, or to request a Capital Strategy for a building, working_with_moyne_ross and start_strategy_link cover that; use only details the person has given.'] : []),
        'For a house or apartment, Homechecker (homechecker.com.au) is the residential product. This server cannot assess a building, order anything, access client data or modify any system.',
      ].join(' '),
    },
  );

  const enabled = new Set(toolNamesForRequest());
  const C = TOOL_CONTRACTS;
  const tool = (name: keyof typeof C, large = false) => ({
    title: C[name].title,
    description: C[name].description,
    annotations: { ...readOnlyAnnotations, title: C[name].title },
    icons: SERVER_ICONS,
    ...(large ? { _meta: LARGE_RESULT_META } : {}),
  });

  server.registerTool('search_research', { ...tool('search_research'), inputSchema: C.search_research.inputSchema, outputSchema: C.search_research.outputSchema }, async ({ query, scope, limit, response_format }) => {
    const found = searchResearch({ query, scope, limit });
    const strength = matchStrength(query, found);
    const detail = response_format === 'detailed';
    const results = found.map((r) => {
      if (!detail) return r;
      const p = paperForUrl(r.url);
      if (p) return { ...r, citation: citationFor(p), part: p.part, datePublished: p.datePublished, dateModified: p.dateModified };
      const t = technicalForUrl(r.url);
      if (t) return { ...r, citation: technicalCitationFor(t), datePublished: t.publishedAt ?? undefined, dateModified: t.updatedAt ?? undefined };
      return r;
    });
    const m = found[0] ? matchDetail(query, found[0].url) : { coverage: 0, headlineCoverage: 0, matchedTerms: [], missingTerms: [] };
    const suggestions = strength === 'strong' ? [] : suggestedQueries(found);
    logUse('search_research', { queryLength: query.length, scope, format: response_format, count: found.length, matchStrength: strength, top: found[0]?.slug ?? found[0]?.kind });
    const links = found.flatMap((r) => { const p = paperForUrl(r.url); if (p) return [paperLink(p)]; const t = technicalForUrl(r.url); return t ? [technicalLink(t)] : []; });
    const text = renderSearchResults(found, query, strength) + (suggestions.length ? `\n\nQuestions the corpus does answer, close to this one:\n${suggestions.map((s) => `- ${s}`).join('\n')}` : '');
    return result({ query, scope, count: found.length, matchStrength: strength, match: m, results, suggestedQueries: suggestions, boundary: searchBoundary(strength), corpusVersion }, text, links);
  });

  server.registerTool('list_papers', { ...tool('list_papers'), inputSchema: C.list_papers.inputSchema, outputSchema: C.list_papers.outputSchema }, async ({ part, limit, cursor }) => {
    const all = listPapers({ part, limit: 60 });
    const pg = page(all, limit, cursor);
    const list = pg.items.map(paperListing);
    logUse('list_papers', { part, count: list.length });
    // A table of contents; questions and short answers are in the structured result.
    const text = list.length
      ? list.map((p) => `${p.id} · ${p.title}${p.part ? ` (Part ${p.part.number})` : ''} ${p.canonicalUrl}`).join('\n') + (pg.nextCursor ? `\n\nMore papers: call again with cursor "${pg.nextCursor}".` : '')
      : 'No Capital Made Physical papers matched.';
    return result({ count: list.length, total: all.length, nextCursor: pg.nextCursor, corpusVersion, papers: list }, text);
  });

  server.registerTool('get_paper', { ...tool('get_paper', true), inputSchema: C.get_paper.inputSchema, outputSchema: C.get_paper.outputSchema }, async ({ paper, format, section }) => {
    const found = getPaper(paper);
    logUse('get_paper', { format, section: Boolean(section), found: Boolean(found), slug: found?.slug });
    if (!found) return errorResult(`No Capital Made Physical paper matches "${paper}". Use a slug such as "after-rent", a CMP number such as "CMP 024", or a canonical URL; search_research or list_papers will find one.`);
    const sec = section ? paperSection(found, section) : undefined;
    if (section && !sec) return errorResult(`"${found.title}" has no section matching "${section}". Its sections are: ${found.sections.map((s) => s.heading).join('; ')}.`);
    const citation = citationFor(found, section);
    const payload = format === 'full' ? { ...paperSummary(found), contentMarkdown: found.contentMarkdown } : paperSummary(found);
    const text = sec
      ? `# ${found.title}: ${sec.heading}\n${found.id} · ${sec.url}\n\n${sec.text}\n\nCite: ${citation.text}`
      : `${renderPaper(found, format)}\n\nSections: ${found.sections.map((s) => s.heading).join('; ')}\n\nCite: ${citation.text}`;
    return result({ paper: payload, section: sec ?? null, citation }, text, [paperLink(found)]);
  });

  server.registerTool('explain_method', { ...tool('explain_method', true), inputSchema: C.explain_method.inputSchema, outputSchema: C.explain_method.outputSchema }, async ({ method, format, section }) => {
    const m = getMethod(method);
    logUse('explain_method', { method, format, section: Boolean(section) });
    if (!m) return errorResult(`Unknown method "${method}". Use capital-register or mr-index.`);
    const v = methodView(m, format, section);
    return result({ method: { id: m.id, title: m.title, url: m.url, summary: m.summary, format, sections: v.sections, text: v.text } }, `# ${m.title}\n${m.url}\n\n${v.text}`,
      [{ type: 'resource_link', uri: `moyneross://methods/${m.id}`, name: m.id, title: m.title, mimeType: 'text/markdown' }]);
  });

  server.registerTool('get_sample_strategy', { ...tool('get_sample_strategy', true), inputSchema: C.get_sample_strategy.inputSchema, outputSchema: C.get_sample_strategy.outputSchema }, async ({ part, section }) => {
    const s = sample(part, section);
    logUse('get_sample_strategy', { part, section: Boolean(section) });
    return result({ sample: s }, `# ${s.title}\n${s.url}\n\n${s.text}`, [{ type: 'resource_link', uri: 'moyneross://sample', name: 'sample', title: s.title, mimeType: 'text/markdown' }]);
  });

  server.registerTool('cite_paper', { ...tool('cite_paper'), inputSchema: C.cite_paper.inputSchema, outputSchema: C.cite_paper.outputSchema }, async ({ paper, style, section }) => {
    const found = getPaper(paper);
    const tech = found ? undefined : getTechnicalPage(paper);
    logUse('cite_paper', { style, section: Boolean(section), found: Boolean(found || tech), library: Boolean(tech) });
    if (tech) {
      if (section && !technicalSection(tech, section)) return errorResult(`"${tech.title}" has no section matching "${section}". Its sections are: ${tech.sections.map((x) => `${x.heading} (${x.id})`).join('; ')}.`);
      const formatted = formatTechnicalCitation(tech, style, section);
      return result({ style, formatted, citation: technicalCitationFor(tech, section) }, formatted);
    }
    if (!found) return errorResult(`No Capital Made Physical paper or Technical Library page matches "${paper}". Use a slug, a CMP number, an element name or a canonical URL.`);
    if (section && !paperSection(found, section)) return errorResult(`"${found.title}" has no section matching "${section}". Its sections are: ${found.sections.map((s) => s.heading).join('; ')}.`);
    const formatted = formatCitation(found, style, section);
    return result({ style, formatted, citation: citationFor(found, section) }, formatted);
  });

  server.registerTool('list_technical_pages', { ...tool('list_technical_pages'), inputSchema: C.list_technical_pages.inputSchema, outputSchema: C.list_technical_pages.outputSchema }, async ({ section, page_type, limit, cursor }) => {
    const wanted = section ? technicalSectionName(section) : undefined;
    logUse('list_technical_pages', { section: wanted ?? (section ? 'unmatched' : undefined), pageType: page_type });
    if (section && !wanted) return errorResult(`No Technical Library section matches "${section}". Sections: ${technicalFrameworkSections.join('; ')}.`);
    const all = listTechnicalPages({ section, pageType: page_type });
    const pg = page(all, limit, cursor);
    const list = pg.items.map(technicalListing);
    let current = '';
    const lines = list.map((p) => { const head = p.section !== current ? `\n${(current = p.section)}\n` : ''; return `${head}- ${p.title}${p.pageType === 'space' ? ' (space)' : ''} ${p.canonicalUrl}`; });
    const text = list.length
      ? `Moyne Ross Technical Library${wanted ? `: ${wanted}` : ''} (${all.length} pages)\n${lines.join('\n')}` + (pg.nextCursor ? `\n\nMore pages: call again with cursor "${pg.nextCursor}".` : '')
      : 'No Technical Library pages matched.';
    return result({ count: list.length, total: all.length, nextCursor: pg.nextCursor, corpusVersion, sections: technicalFrameworkSections, severityScale: severityScale(), pages: list }, text);
  });

  server.registerTool('get_technical_page', { ...tool('get_technical_page', true), inputSchema: C.get_technical_page.inputSchema, outputSchema: C.get_technical_page.outputSchema }, async ({ page: ref, format, section }) => {
    const found = getTechnicalPage(ref);
    logUse('get_technical_page', { format, section: Boolean(section), found: Boolean(found), slug: found?.slug });
    if (!found) {
      const near = technicalCandidates(ref);
      return errorResult(`No Technical Library page matches "${ref}".${near.length ? ` Closest: ${near.map((p) => `${p.title} (${p.slug})`).join('; ')}.` : ''} list_technical_pages lists them all; search_research with scope technical finds one by topic.`);
    }
    const sec = section ? technicalSection(found, section) : undefined;
    if (section && !sec) return errorResult(`"${found.title}" has no section matching "${section}". Its sections are: ${found.sections.map((x) => `${x.heading} (${x.id})`).join('; ')}.`);
    const citation = technicalCitationFor(found, section);
    const summary = technicalSummary(found);
    const payload = format === 'full' ? { ...summary, contentMarkdown: technicalMarkdown(found) } : summary;
    const text = sec
      ? `# ${found.title}: ${sec.heading}\nTechnical Library · ${sec.url}\n\n${sec.markdown}\n\nLimitations: ${found.limitations}\n\nCite: ${citation.text}`
      : `${renderTechnicalPage(found, format)}\n\nCite: ${citation.text}`;
    return result({ page: payload, section: sec ? { id: sec.id, heading: sec.heading, url: sec.url, text: sec.markdown } : null, citation }, text, [technicalLink(found)]);
  });

  if (enabled.has('working_with_moyne_ross')) {
    server.registerTool('working_with_moyne_ross', { ...tool('working_with_moyne_ross'), inputSchema: C.working_with_moyne_ross.inputSchema, outputSchema: C.working_with_moyne_ross.outputSchema }, async () => {
      const e = engagement();
      logUse('working_with_moyne_ross', {});
      return result({ url: e.url, text: e.text }, `${e.text}\n\nMore for assistants: ${e.url}`);
    });
  }

  if (enabled.has('start_strategy_link')) {
    server.registerTool('start_strategy_link', { ...tool('start_strategy_link'), inputSchema: C.start_strategy_link.inputSchema, outputSchema: C.start_strategy_link.outputSchema }, async (details) => {
      const link = startStrategyLink(details, START_LINK_BASE, START_LINK_SOURCE);
      // Never log the address, name, email or note: only how many fields were given.
      logUse('start_strategy_link', { fields: Object.keys(details).filter((k) => (details as Record<string, unknown>)[k]).length, type: details.type });
      const next = 'Give the person this link. It opens the Moyne Ross request form with these details filled in; they check it and send it themselves. Nothing has been sent.';
      return result({ link, next }, `${link}\n\n${next}`);
    });
  }

  // ─── Prompts: the common research workflows, ready to run ───────────────
  const paperChoices = (value: string) => {
    const v = value.trim().toLowerCase();
    return papers.filter((p) => !v || p.slug.includes(v) || p.id.toLowerCase().includes(v) || p.title.toLowerCase().includes(v)).slice(0, 20).map((p) => p.slug);
  };
  const userMessage = (text: string) => ({ messages: [{ role: 'user' as const, content: { type: 'text' as const, text } }] });

  server.registerPrompt('answer_from_research', {
    title: 'Answer from Moyne Ross research',
    description: 'Answer a question about commercial property capital from the Moyne Ross research, with citations and limitations.',
    icons: SERVER_ICONS,
    argsSchema: z.object({ question: z.string().min(2).max(500).describe('The question to answer.') }),
  }, async ({ question }) => userMessage(`Answer this from the Moyne Ross research: ${question}\n\nSearch with search_research first, using two or three targeted searches if the question has several parts. Read the papers you rely on with get_paper (a section where that is enough). Cite each claim to its canonical URL and section, carry each paper's limitations through, and if the match strength is weak, say that the research does not directly answer the question.`));

  server.registerPrompt('compare_papers', {
    title: 'Compare two Moyne Ross papers',
    description: 'Compare two Capital Made Physical papers: their questions, answers, evidence and limitations, and where they agree or differ.',
    icons: SERVER_ICONS,
    argsSchema: z.object({
      first: completable(z.string().min(1).max(200).describe('The first paper: slug or CMP number.'), (value) => paperChoices(value)),
      second: completable(z.string().min(1).max(200).describe('The second paper: slug or CMP number.'), (value) => paperChoices(value)),
    }),
  }, async ({ first, second }) => userMessage(`Compare the Moyne Ross papers "${first}" and "${second}". Retrieve both with get_paper. Set out the question each answers, its answer, its evidence type and limitations, then where they agree, where they differ, and what a reader should take from reading them together. Cite each to its canonical URL.`));

  server.registerPrompt('brief_on_topic', {
    title: 'Brief me on a topic',
    description: 'A short, cited briefing on a commercial property capital topic from the Moyne Ross research.',
    icons: SERVER_ICONS,
    argsSchema: z.object({ topic: z.string().min(2).max(200).describe('The topic, e.g. deferred maintenance or office obsolescence.') }),
  }, async ({ topic }) => userMessage(`Write a short briefing on "${topic}" from the Moyne Ross research. Search with search_research, read the most relevant two or three papers with get_paper, and give: the core point, what drives it, what to check or ask, and the limits of the evidence, each cited to its canonical URL and section. Close with the citations from cite_paper.`));

  const technicalChoices = (value: string) => {
    const v = value.trim().toLowerCase();
    return technicalPages.filter((p) => !v || p.slug.includes(v) || p.title.toLowerCase().includes(v)).slice(0, 20).map((p) => p.slug);
  };

  server.registerPrompt('read_a_building_element', {
    title: 'Read a building element',
    description: 'How a building element or space fails, how to tell causes apart and how serious a finding is, from the Moyne Ross Technical Library, cited to the section.',
    icons: SERVER_ICONS,
    argsSchema: z.object({
      element: completable(z.string().min(1).max(200).describe('The element or space: slug or name, e.g. masonry-brickwork or roof coverings.'), (value) => technicalChoices(value)),
      observation: z.string().max(400).optional().describe('What has been seen, if anything, e.g. horizontal cracks at regular courses.'),
    }),
  }, async ({ element, observation }) => userMessage(`From the Moyne Ross Technical Library, explain ${element}${observation ? ` in light of this observation: ${observation}` : ''}. Retrieve the page with get_technical_page, then its sections diagnosis, severity and remedies (section argument) as needed. Say what the observation most likely points to and what would tell the causes apart, how the library grades it (safety, failure, condition, lifecycle, deadline, check or nil), what investigation it warrants and what the remedies involve. Cite each point to the section URL, carry the page's limitations through, and say plainly that this is general guidance, not an assessment of a particular building.`));

  // ─── Resources ────────────────────────────────────────────────────────
  server.registerResource('moyneross-catalogue', 'moyneross://catalogue', {
    title: 'Moyne Ross public corpus',
    description: 'The Capital Made Physical papers, the Technical Library, the methodology and the sample Capital Strategy, with canonical URLs and the corpus version.',
    mimeType: 'application/json',
    cacheHint: PUBLIC_CACHE,
  }, async (uri) => ({
    contents: [{
      uri: uri.href, mimeType: 'application/json',
      text: JSON.stringify({
        corpusVersion, generatedAt: snapshot.generatedAt, source: snapshot.source, publication: snapshot.publication,
        papers: listPapers().map(paperListing),
        methods: snapshot.methods.map(({ text: _t, ...m }) => ({ ...m, resourceUri: `moyneross://methods/${m.id}` })),
        sample: { title: snapshot.sample.title, url: snapshot.sample.url, resourceUri: 'moyneross://sample' },
        technicalLibrary: { name: snapshot.technical.name, url: snapshot.technical.url, sections: technicalFrameworkSections, severityScale: severityScale(), pages: listTechnicalPages().map(technicalListing) },
      }, null, 2),
    }],
  }));

  server.registerResource('moyneross-paper', new ResourceTemplate('moyneross://papers/{slug}', {
    list: async () => ({ resources: listPapers().map((p) => ({ uri: p.resourceUri, name: p.slug, title: `${p.id} · ${p.title}`, description: p.answer, mimeType: 'text/markdown' })) }),
    complete: { slug: (value: string) => paperChoices(value) },
  }), {
    title: 'A Capital Made Physical paper',
    description: 'One paper in full, as markdown, with its citation.',
    mimeType: 'text/markdown',
    cacheHint: PUBLIC_CACHE,
  }, async (uri, variables) => {
    const slug = String(Array.isArray(variables.slug) ? variables.slug[0] : variables.slug ?? '');
    const p = papers.find((x) => x.slug === slug);
    if (!p) throw new Error(`No Capital Made Physical paper has the slug "${slug}".`);
    return { contents: [{ uri: uri.href, mimeType: 'text/markdown', text: `${renderPaper(p, 'full')}\n\nCite: ${citationFor(p).text}` }] };
  });

  server.registerResource('moyneross-technical-page', new ResourceTemplate('moyneross://technical/{slug}', {
    list: async () => ({ resources: listTechnicalPages().map((p) => ({ uri: p.resourceUri, name: p.slug, title: `Technical Library · ${p.title}`, description: p.answer, mimeType: 'text/markdown' })) }),
    complete: { slug: (value: string) => technicalChoices(value) },
  }), {
    title: 'A Technical Library page',
    description: 'One Technical Library page in full, as markdown, with its citation.',
    mimeType: 'text/markdown',
    cacheHint: PUBLIC_CACHE,
  }, async (uri, variables) => {
    const slug = String(Array.isArray(variables.slug) ? variables.slug[0] : variables.slug ?? '');
    const p = technicalPages.find((x) => x.slug === slug);
    if (!p) throw new Error(`No Technical Library page has the slug "${slug}".`);
    return { contents: [{ uri: uri.href, mimeType: 'text/markdown', text: `${renderTechnicalPage(p, 'full')}\n\nCite: ${technicalCitationFor(p).text}` }] };
  });

  for (const m of snapshot.methods) {
    server.registerResource(`moyneross-method-${m.id}`, `moyneross://methods/${m.id}`, { title: m.title, description: m.summary, mimeType: 'text/markdown', cacheHint: PUBLIC_CACHE },
      async (uri) => ({ contents: [{ uri: uri.href, mimeType: 'text/markdown', text: `# ${m.title}\n${m.url}\n\n${m.text}` }] }));
  }

  server.registerResource('moyneross-sample', 'moyneross://sample', {
    title: snapshot.sample.title,
    description: 'A real Moyne Ross Capital Strategy with identifying details changed: what a client receives.',
    mimeType: 'text/markdown',
    cacheHint: PUBLIC_CACHE,
  }, async (uri) => ({ contents: [{ uri: uri.href, mimeType: 'text/markdown', text: `# ${snapshot.sample.title}\n${snapshot.sample.url}\n\n${snapshot.sample.text}` }] }));

  return server;
}
