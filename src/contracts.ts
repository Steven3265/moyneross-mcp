import * as z from 'zod/v4';
import { CITATION_STYLES, COMPARE_SECTION_IDS, METHOD_IDS, PART_NUMBERS, PROPERTY_TYPES, ROLES, SAMPLE_PARTS, TECHNICAL_SECTION_IDS, USE_CLASSES } from './core.js';
import type { MatchStrength } from './types.js';
import { handOverEnabled } from './client-label.js';

// The machine contract for every tool: input and output schemas for the MCP
// registration (zod), and the same input as plain JSON Schema for the REST
// layer, OpenAPI and server cards. One definition, so they cannot drift.
//
// Descriptions state what each tool does, when to use it and its limits, in
// neutral terms: no tool asks the model to call another tool unprompted, and
// none promotes a service (Anthropic and OpenAI directory review rules).

export { CITATION_STYLES, COMPARE_SECTION_IDS, USE_CLASSES, METHOD_IDS, PART_NUMBERS, PROPERTY_TYPES, ROLES, SAMPLE_PARTS, TECHNICAL_SECTION_IDS };
export type { MatchStrength };
export const SCOPES = ['all', 'research', 'technical', 'methodology', 'sample'] as const;
export const MARKETS = ['AU', 'UK', 'US'] as const;
export const PAGE_TYPES = ['element', 'space'] as const;
export const RESPONSE_FORMATS = ['concise', 'detailed'] as const;

const paperRef = z.string().min(1).max(200).describe('The paper: its slug (after-rent), CMP number (CMP 024 or 24) or canonical URL.');
const technicalRef = z.string().min(1).max(200).describe('The Technical Library page: its slug (masonry-brickwork), element name (Roof Coverings) or canonical URL. Part of a title is enough when it fits only one page.');
const technicalSectionRef = z.string().max(120).optional().describe('One section, by the id or heading the page summary lists, e.g. severity (how serious), service-life, what-to-ask-for, jurisdiction-notes (standards by country), or thresholds. Case and accents are ignored; an exact id or heading wins, then part of one. Earlier addresses such as diagnosis or mechanisms still resolve to the section that holds them. An unmatched section returns an error listing the page\'s sections.');
const sectionRef = z.string().max(120).optional().describe('One section only, by its heading or anchor, e.g. "a second income line". Case is ignored and part of a heading is enough: the first section that contains it is used. An unmatched section returns an error listing the sections.');

// ─── Inputs ──────────────────────────────────────────────────────────────

export const searchResearchInputSchema = z.object({
  query: z.string().min(2).max(500).describe('The question or topic, in plain words. Practitioner shorthand (capex, dilaps, MEES, TDD) is understood.'),
  scope: z.enum(SCOPES).optional().default('all').describe('all, research (the papers), technical (the Technical Library: building elements and spaces), methodology, or sample.'),
  limit: z.number().int().min(1).max(10).optional().default(5).describe('How many results, 1 to 10 (default 5). Raise it to survey a topic.'),
  response_format: z.enum(RESPONSE_FORMATS).optional().default('concise').describe('concise (default): title, URL and short answer per result. detailed: adds the citation, part and dates.'),
});
export const listPapersInputSchema = z.object({
  part: z.enum(PART_NUMBERS).optional().describe('Only papers in this part of Capital Made Physical, I to VII.'),
  limit: z.number().int().min(1).max(25).optional().default(15).describe('Papers per page, 1 to 25 (default 15).'),
  cursor: z.string().max(20).optional().describe('Leave out for the first page; then the nextCursor the previous page returned, until it is null. Any other value returns an error.'),
});
export const getPaperInputSchema = z.object({
  paper: paperRef,
  format: z.enum(['summary', 'full']).optional().default('summary').describe('summary (default): question, answer, summary, limitations and section list. full: adds the complete text.'),
  section: sectionRef,
});
export const explainMethodInputSchema = z.object({
  method: z.enum(METHOD_IDS).describe('capital-register or mr-index.'),
  format: z.enum(['summary', 'full']).optional().default('summary').describe('summary (default): the definition and section list. full: the whole page.'),
  section: z.string().max(120).optional().describe('One section of the method page, by heading. Case is ignored and part of a heading is enough; the summary lists the headings.'),
});
export const getSampleStrategyInputSchema = z.object({
  part: z.enum(SAMPLE_PARTS).optional().default('summary').describe('summary (figures, executive summary, key considerations, where the capital sits, how sure) or register.'),
  section: z.string().max(80).optional().describe('With part register: register sections whose name contains this, ignoring case, e.g. roofs, fire, mechanical. Without it, register returns an overview by section. An unmatched name returns an error listing the sections.'),
});
export const citePaperInputSchema = z.object({
  paper: z.string().min(1).max(200).describe('A Capital Made Physical paper (slug, CMP number or URL) or a Technical Library page (slug, element name or URL).'),
  style: z.enum(CITATION_STYLES).optional().default('apa').describe('bibtex, ris, csl-json, apa or harvard.'),
  section: sectionRef,
});
export const listTechnicalPagesInputSchema = z.object({
  section: z.string().max(80).optional().describe('Only pages in one framework section, e.g. Façades, Roofs, Mechanical Services, Fire Services. Matches on part of the name, ignoring case and accents; an unmatched name returns an error listing the sections.'),
  page_type: z.enum(PAGE_TYPES).optional().describe('element (a building element, judged on condition) or space (a functional space, judged on whether it does its job).'),
  limit: z.number().int().min(1).max(50).optional().default(15).describe('Pages per call, 1 to 50 (default 15).'),
  cursor: z.string().max(20).optional().describe('Leave out for the first page; then the nextCursor the previous page returned, until it is null. Any other value returns an error.'),
});
export const getTechnicalPageInputSchema = z.object({
  page: technicalRef,
  format: z.enum(['summary', 'full']).optional().default('summary').describe('summary (default): the question, short answer, where it applies, limitations, sources and the anchored sections. full: adds the complete text, a part at a time on a long page.'),
  section: technicalSectionRef,
  cursor: z.string().max(120).optional().describe('With format full on a long page: the nextCursor from the previous part.'),
  market: z.enum(MARKETS).optional().describe('The market of the building the answer is for: AU (Australia), UK or US. Returns that market\'s measured thresholds only. Without it, thresholds come grouped by market, each labelled, with the rule for using them: a value applies only in its own market.'),
});
export const workingWithInputSchema = z.object({});
export const startStrategyLinkInputSchema = z.object({
  building: z.string().min(3).max(300).describe('The building: street address, suburb or city, and state.'),
  name: z.string().max(120).optional().describe('The person\'s name, only if they gave it.'),
  email: z.string().max(200).optional().describe('Their email address, only if they gave it. Kept only if it is one valid address; otherwise left off the form.'),
  organisation: z.string().max(160).optional().describe('Their company or organisation, only if they gave it.'),
  role: z.enum(ROLES).optional().describe('How they relate to the building, only if they said: owner (owner or occupier), investor (investor, fund or lender), manager (asset, property or facilities manager), adviser (adviser to an owner or investor), home (buying or owning a home, which Moyne Ross does not cover) or other.'),
  type: z.enum(PROPERTY_TYPES).optional().describe('The kind of building.'),
  note: z.string().max(400).optional().describe('Anything the person would like Moyne Ross to know, briefly.'),
});

export const traceConnectionsInputSchema = z.object({
  ref: z.string().min(1).max(200).describe('A paper (slug, CMP number or URL) or a Technical Library page (slug, element or space name, or URL).'),
});
export const buildingBriefInputSchema = z.object({
  use_class: z.enum(USE_CLASSES).describe('The kind of building: commercial, industrial, institutional or residential-multi (apartments, strata, mixed-use residential).'),
  spaces: z.array(z.string().min(1).max(120)).max(8).optional().describe('Only the elements serving these functional spaces, by slug or name, e.g. plant-rooms, loading-docks, bathrooms-and-wet-areas. Leave out for the whole building.'),
  market: z.enum(MARKETS).optional().describe('AU, UK or US: count that market\'s measured thresholds on each element. Without it, every market is counted.'),
  framework_section: z.string().max(80).optional().describe('Only elements in one framework section, e.g. Roofs, Mechanical Services, Fire Services. Matches on part of the name, ignoring case; a name that matches nothing returns no elements.'),
  limit: z.number().int().min(1).max(50).optional().default(20).describe('Elements per page, 1 to 50 (default 20).'),
  cursor: z.string().max(20).optional().describe('Leave out for the first page; then the nextCursor the previous page returned, until it is null. Any other value returns an error.'),
  response_format: z.enum(RESPONSE_FORMATS).optional().default('concise').describe('concise (default): each element\'s name, links, threshold counts and grounding papers. detailed: adds its short answer.'),
});
export const compareSectionsInputSchema = z.object({
  pages: z.array(z.string().min(1).max(200)).min(2).max(5).describe('Two to five Technical Library pages, by slug, element name or URL.'),
  section: z.enum(COMPARE_SECTION_IDS).describe('The section to set side by side: service-life, severity, what-to-ask-for, misreads, remedies, cost-shape, investigation, jurisdiction-notes and the rest, or thresholds for the measured values by market.'),
  market: z.enum(MARKETS).optional().describe('With section thresholds: that market\'s values only. Without it, every market\'s values, each labelled.'),
});
export const translateTermInputSchema = z.object({
  term: z.string().trim().min(2).max(120).describe('The term to look up, in any market\'s wording: "elevator", "dilapidations", "sarking", "certificate of occupancy".'),
  market: z.enum(MARKETS).optional().describe('The market the answer is for: AU, UK or US. Its term is listed first. All three are always returned.'),
});

// ─── Outputs ─────────────────────────────────────────────────────────────

const partSchema = z.object({ number: z.string(), title: z.string(), position: z.number().nullable() }).nullable();
const sectionSchema = z.object({ heading: z.string(), anchor: z.string(), url: z.string() });
const citationSchema = z.object({
  id: z.string(), title: z.string(), author: z.string(), publisher: z.string(), publication: z.string(),
  datePublished: z.string(), dateModified: z.string(), year: z.number().int(), url: z.string(),
  section: z.object({ heading: z.string(), url: z.string() }).nullable(), corpusVersion: z.string(), text: z.string(),
});
const paperSummarySchema = z.object({
  id: z.string(), slug: z.string(), title: z.string(), question: z.string(), answer: z.string(), summary: z.string(), limitations: z.string(),
  part: partSchema, publicationType: z.string(), evidenceType: z.string(), jurisdiction: z.array(z.string()), topics: z.array(z.string()),
  datePublished: z.string(), dateModified: z.string(), reviewedAt: z.string().nullable(), reviewDue: z.string().nullable(),
  wordCount: z.number().int().nullable(), canonicalUrl: z.string(), resourceUri: z.string(), sections: z.array(sectionSchema),
});
const paperListingSchema = z.object({ id: z.string(), slug: z.string(), title: z.string(), part: partSchema, question: z.string(), answer: z.string(), datePublished: z.string(), dateModified: z.string(), canonicalUrl: z.string(), resourceUri: z.string() });
const searchResultSchema = z.object({
  title: z.string(), url: z.string(), kind: z.string(), id: z.string().nullable(), slug: z.string().nullable(), answer: z.string(), score: z.number(),
  citation: citationSchema.optional(), part: partSchema.optional(), datePublished: z.string().optional(), dateModified: z.string().optional(),
  // For a Technical Library page: the section (or authored question) that best answers the query, with its anchored URL.
  section: z.object({ heading: z.string(), url: z.string() }).optional(),
});

export const searchResearchOutputSchema = z.object({
  query: z.string(), scope: z.enum(SCOPES), count: z.number().int().min(0),
  matchStrength: z.enum(['none', 'weak', 'strong']),
  match: z.object({ coverage: z.number(), headlineCoverage: z.number(), matchedTerms: z.array(z.string()), missingTerms: z.array(z.string()) }),
  results: z.array(searchResultSchema), suggestedQueries: z.array(z.string()), boundary: z.string(), corpusVersion: z.string(),
});
export const listPapersOutputSchema = z.object({ count: z.number().int().min(0), total: z.number().int(), nextCursor: z.string().nullable(), corpusVersion: z.string(), papers: z.array(paperListingSchema) });
export const getPaperOutputSchema = z.object({
  paper: paperSummarySchema.extend({ contentMarkdown: z.string().optional() }),
  section: z.object({ heading: z.string(), url: z.string(), text: z.string() }).nullable(),
  citation: citationSchema,
});
export const explainMethodOutputSchema = z.object({ method: z.object({ id: z.string(), title: z.string(), url: z.string(), summary: z.string(), format: z.enum(['summary', 'full']), sections: z.array(z.string()), text: z.string() }) });
export const getSampleStrategyOutputSchema = z.object({ sample: z.object({ title: z.string(), url: z.string(), interactiveUrl: z.string(), part: z.enum(SAMPLE_PARTS), text: z.string() }) });
export const citePaperOutputSchema = z.object({ style: z.enum(CITATION_STYLES), formatted: z.string(), citation: citationSchema });
export const workingWithOutputSchema = z.object({ url: z.string(), text: z.string() });
export const startStrategyLinkOutputSchema = z.object({ link: z.string(), next: z.string() });

const technicalSectionSchema = z.object({ id: z.string(), heading: z.string(), url: z.string() });
const technicalListingSchema = z.object({
  slug: z.string(), title: z.string(), pageType: z.string(), section: z.string(), subsection: z.string(), frameworkElement: z.string(),
  answer: z.string(), updatedAt: z.string().nullable(), canonicalUrl: z.string(), resourceUri: z.string(),
});
const technicalSummarySchema = technicalListingSchema.extend({
  question: z.string(), limitations: z.string(), frameworkDescription: z.string(), useClasses: z.array(z.string()), jurisdiction: z.array(z.string()), typologies: z.array(z.string()),
  spaces: z.array(z.string()), spaceElements: z.array(z.string()), subSpaces: z.array(z.string()), related: z.array(z.string()),
  publishedAt: z.string().nullable(), reviewedAt: z.string().nullable(), reviewDue: z.string().nullable(), wordCount: z.number().int().nullable(),
  sources: z.array(z.object({ title: z.string(), publisher: z.string(), url: z.string() })), sections: z.array(technicalSectionSchema),
});
const severitySchema = z.object({ note: z.string().optional(), situations: z.array(z.object({ id: z.string(), timingBasis: z.string().nullable(), meaning: z.string() })).optional() });
export const listTechnicalPagesOutputSchema = z.object({
  count: z.number().int().min(0), total: z.number().int(), nextCursor: z.string().nullable(), corpusVersion: z.string(),
  sections: z.array(z.string()), severityScale: severitySchema, pages: z.array(technicalListingSchema),
});
const thresholdSchema = z.object({
  id: z.string(), market: z.enum(MARKETS), measure: z.string(), rule: z.string(), clause: z.string().optional(), basis: z.string(), appliesTo: z.array(z.string()),
  // In the summary of a long page a threshold names its source by title only;
  // the page's own sources list carries the publisher and address.
  source: z.object({ title: z.string(), publisher: z.string().optional(), url: z.string().optional() }),
});
// Measured values, each for one market. market: the one asked for, or null for
// all markets grouped; missing: markets the page covers with no value recorded.
const thresholdViewSchema = z.object({ market: z.enum(MARKETS).nullable(), policy: z.string(), values: z.array(thresholdSchema), missing: z.array(z.enum(MARKETS)) });
export const getTechnicalPageOutputSchema = z.object({
  page: technicalSummarySchema.extend({ contentMarkdown: z.string().optional(), thresholds: thresholdViewSchema.optional() }),
  section: z.object({ id: z.string(), heading: z.string(), url: z.string(), text: z.string() }).nullable(),
  citation: citationSchema,
  // With format full: which part of the page this is, and the cursor for the next (null on the last part).
  part: z.object({ part: z.number().int(), parts: z.number().int(), firstSection: z.string(), nextCursor: z.string().nullable() }).optional(),
});

const graphPageSchema = z.object({ slug: z.string(), title: z.string(), pageType: z.string(), section: z.string(), url: z.string() });
const graphPaperSchema = z.object({ id: z.string(), slug: z.string(), title: z.string(), url: z.string() });
export const traceConnectionsOutputSchema = z.object({
  from: z.object({ kind: z.enum(['paper', 'technical']), slug: z.string(), title: z.string(), id: z.string().nullable(), url: z.string() }),
  restsOn: z.array(z.object({ slug: z.string(), title: z.string(), section: z.string().nullable(), url: z.string(), why: z.string() })),
  groundedPapers: z.array(graphPaperSchema.extend({ section: z.string().nullable(), why: z.string() })),
  sharesGroundWith: z.array(graphPaperSchema.extend({ sharedPages: z.array(z.string()) })),
  related: z.array(graphPageSchema), spaces: z.array(graphPageSchema), elements: z.array(graphPageSchema),
  corpusVersion: z.string(),
});
export const buildingBriefOutputSchema = z.object({
  useClass: z.enum(USE_CLASSES), market: z.enum(MARKETS).nullable(),
  spaces: z.array(graphPageSchema), unknownSpaces: z.array(z.string()), frameworkSections: z.array(z.string()),
  count: z.number().int().min(0), total: z.number().int(), nextCursor: z.string().nullable(),
  elements: z.array(z.object({
    slug: z.string(), title: z.string(), section: z.string(), url: z.string(), answer: z.string().optional(),
    serviceLife: z.string().nullable(),
    thresholds: z.record(z.string(), z.number().int()), papers: z.array(z.string()),
  })),
  boundary: z.string(), corpusVersion: z.string(),
});
export const translateTermOutputSchema = z.object({
  term: z.string(), market: z.enum(MARKETS).nullable(), match: z.enum(['exact', 'close', 'loose', 'none']), count: z.number().int(),
  matches: z.array(z.object({
    id: z.string(), group: z.string(), concept: z.string(),
    terms: z.object({ AU: z.string(), UK: z.string(), US: z.string() }),
    matchedIn: z.array(z.enum(MARKETS)), note: z.string().nullable(), url: z.string(),
    pages: z.array(z.object({ slug: z.string(), title: z.string(), url: z.string() })),
  })),
  glossaryUrl: z.string(), boundary: z.string(), corpusVersion: z.string(),
});
export const compareSectionsOutputSchema = z.object({
  section: z.string(), market: z.enum(MARKETS).nullable(),
  pages: z.array(z.object({ slug: z.string(), title: z.string(), url: z.string(), heading: z.string().nullable(), text: z.string(), truncated: z.boolean() })),
  unknown: z.array(z.string()), policy: z.string().optional(), corpusVersion: z.string(),
});

// ─── Contracts ───────────────────────────────────────────────────────────

const str = { type: 'string' } as const;
const PAPER_JSON = { type: 'string', minLength: 1, maxLength: 200 } as const;
const TECH_JSON = { type: 'string', minLength: 1, maxLength: 200 } as const;
const SECTION_JSON = { type: 'string', maxLength: 120 } as const;

export const TOOL_CONTRACTS = {
  search_research: {
    title: 'Search Moyne Ross research',
    description: 'Search the public Moyne Ross corpus: 49 Capital Made Physical papers on commercial property and capital, the Technical Library (103 pages, one per building element or functional space), the Capital Register and MR Index methodology, and a sample Capital Strategy. Use it first when you do not yet know which paper or page answers a question. For a question about one element or system (a roof, a façade, lifts, a chiller), set scope technical to search the library alone. Read matchStrength before relying on the results: strong means the top result carries the question\'s distinctive words; weak means background only, so say so; none means nothing in the corpus addresses it. Once a result is chosen, get_paper or get_technical_page reads it and cite_paper gives its reference. Topics: capital planning, lifecycle and condition, obsolescence, refurbish or redevelop, energy, leases and make good, and due diligence in Australia, the UK and the US. General research: it never assesses a particular building.',
    inputSchema: searchResearchInputSchema, outputSchema: searchResearchOutputSchema,
    outputFields: ['query', 'scope', 'count', 'matchStrength', 'match', 'results', 'suggestedQueries', 'boundary', 'corpusVersion'],
    jsonInputSchema: { type: 'object', properties: { query: { type: 'string', minLength: 2, maxLength: 500 }, scope: { type: 'string', enum: [...SCOPES], default: 'all' }, limit: { type: 'integer', minimum: 1, maximum: 10, default: 5 }, response_format: { type: 'string', enum: [...RESPONSE_FORMATS], default: 'concise' } }, required: ['query'], additionalProperties: false },
  },
  list_papers: {
    title: 'List Moyne Ross papers',
    description: 'List the Capital Made Physical papers in reading order, a page at a time: 49 papers in seven parts, I to VII. Use it to browse the series or one part; to find papers on a topic, search_research is better, and get_paper reads one. Returns each paper\'s CMP number, slug, title, part, question, short answer, dates and canonical URL. Leave cursor out for the first page and pass nextCursor back while it is not null; an unrecognised cursor returns an error.',
    inputSchema: listPapersInputSchema, outputSchema: listPapersOutputSchema,
    outputFields: ['count', 'total', 'nextCursor', 'corpusVersion', 'papers'],
    jsonInputSchema: { type: 'object', properties: { part: { type: 'string', enum: [...PART_NUMBERS] }, limit: { type: 'integer', minimum: 1, maximum: 25, default: 15 }, cursor: { type: 'string', maxLength: 20 } }, additionalProperties: false },
  },
  get_paper: {
    title: 'Get a Moyne Ross paper',
    description: 'Read one Capital Made Physical paper, by slug (after-rent), CMP number (CMP 024 or 24) or canonical URL. Use it when you know which paper you need; to find one, search_research or list_papers; for a reference alone, cite_paper. By default a summary: the question it answers, the short answer, summary, limitations and its sections with anchored URLs. format full adds the complete text; section returns one section, matched by heading or anchor, ignoring case, where part of a heading is enough. An unknown paper returns an error saying how to find one; an unmatched section returns an error listing the paper\'s sections. Always includes a ready citation. Carry the limitations through when relying on it.',
    inputSchema: getPaperInputSchema, outputSchema: getPaperOutputSchema,
    outputFields: ['paper', 'section', 'citation'],
    jsonInputSchema: { type: 'object', properties: { paper: PAPER_JSON, format: { type: 'string', enum: ['summary', 'full'], default: 'summary' }, section: SECTION_JSON }, required: ['paper'], additionalProperties: false },
  },
  explain_method: {
    title: 'Explain a Moyne Ross method',
    description: 'Explain one of the two Moyne Ross methods, from its public methodology page: the Capital Register (the line-by-line capital document behind every Capital Strategy) or the MR Index (MR 1 to MR 5: how much attention a building needs, and how soon). Use it when a question turns on what these are or how they are built; for the research behind them, search_research; to see them applied to a real building, get_sample_strategy. By default the definition and the section headings; format full returns the whole page; section returns one section, matched on part of its heading, ignoring case. If no heading matches, the reply says so and lists the headings rather than guessing.',
    inputSchema: explainMethodInputSchema, outputSchema: explainMethodOutputSchema,
    outputFields: ['method'],
    jsonInputSchema: { type: 'object', properties: { method: { type: 'string', enum: [...METHOD_IDS] }, format: { type: 'string', enum: ['summary', 'full'], default: 'summary' }, section: { type: 'string', maxLength: 120 } }, required: ['method'], additionalProperties: false },
  },
  get_sample_strategy: {
    title: 'Get the sample Capital Strategy',
    description: 'Read the sample Moyne Ross Capital Strategy, a real strategy for an industrial warehouse and office with identifying details changed. Use it to show what a Capital Strategy contains, or how the Capital Register and MR Index look in practice; it is one example, not evidence about any other building. part summary (default): the ten-year figures, MR Index, executive summary and where the capital sits. part register: an overview of the Capital Register by section, or, with section (e.g. roofs), the lines of every section whose name contains it, with condition, action, timing, cost and cost basis. An unmatched section returns an error listing the register\'s sections.',
    inputSchema: getSampleStrategyInputSchema, outputSchema: getSampleStrategyOutputSchema,
    outputFields: ['sample'],
    jsonInputSchema: { type: 'object', properties: { part: { type: 'string', enum: [...SAMPLE_PARTS], default: 'summary' }, section: { type: 'string', maxLength: 80 } }, additionalProperties: false },
  },
  cite_paper: {
    title: 'Cite Moyne Ross research',
    description: 'Return an exact citation for a Capital Made Physical paper or a Technical Library page, optionally to one section with its anchored URL, in APA (default), Harvard, BibTeX, RIS or CSL-JSON. Use it when the person needs a reference or bibliography entry: get_paper and get_technical_page already include a ready citation alongside their content, so this is for the reference alone or a set style. The reference is matched as a paper first, then as a library page. An unknown reference returns an error; an unmatched section returns an error listing the valid sections. Use the formatted text exactly as returned rather than retyping it.',
    inputSchema: citePaperInputSchema, outputSchema: citePaperOutputSchema,
    outputFields: ['style', 'formatted', 'citation'],
    jsonInputSchema: { type: 'object', properties: { paper: PAPER_JSON, style: { type: 'string', enum: [...CITATION_STYLES], default: 'apa' }, section: SECTION_JSON }, required: ['paper'], additionalProperties: false },
  },
  list_technical_pages: {
    title: 'List Technical Library pages',
    description: 'List the Moyne Ross Technical Library, a page at a time: one page for each building element and functional space a Capital Strategy assesses (103 pages), in Building Check Framework order, Substructure to Environmental. Use it to browse the library, one framework section or one page type; to find the page that answers a question, search_research with scope technical is better, and get_technical_page reads one. Returns each page\'s slug, title, section, page type, short answer and canonical URL, with the framework sections and the severity scale every page grades findings on. Leave cursor out for the first page and pass nextCursor back while it is not null. An unmatched section or an unrecognised cursor returns an error; the section error lists the framework sections.',
    inputSchema: listTechnicalPagesInputSchema, outputSchema: listTechnicalPagesOutputSchema,
    outputFields: ['count', 'total', 'nextCursor', 'corpusVersion', 'sections', 'severityScale', 'pages'],
    jsonInputSchema: { type: 'object', properties: { section: { type: 'string', maxLength: 80 }, page_type: { type: 'string', enum: [...PAGE_TYPES] }, limit: { type: 'integer', minimum: 1, maximum: 50, default: 15 }, cursor: { type: 'string', maxLength: 20 } }, additionalProperties: false },
  },
  get_technical_page: {
    title: 'Get a Technical Library page',
    description: 'Read one Technical Library page, by slug (masonry-brickwork), element name (Roof Coverings) or canonical URL: general guidance on how a building element or functional space is built, its service life, how it fails, what to look for, how to tell causes apart, how serious a finding is (graded safety, failure, condition, lifecycle, deadline, check or nil), investigation, remedies, the shape of the cost (never a price), standards in Australia, the UK and the US, measured thresholds, and what to ask the owner or agent for. Use it once you know the element; to find it, search_research with scope technical; to set one section side by side across pages, compare_technical_sections. By default a summary with every section\'s anchored URL; section returns one section; format full returns the whole page, a part at a time on a long page, with nextCursor. Thresholds apply only in their own market: pass market (AU, UK or US) for the building in question; section thresholds returns the values alone. An unmatched page returns an error naming the closest pages; an unmatched section, an error listing the page\'s sections. Always includes a ready citation. It describes how elements behave in general, never the condition of a particular building; carry its limitations through.',
    inputSchema: getTechnicalPageInputSchema, outputSchema: getTechnicalPageOutputSchema,
    outputFields: ['page', 'section', 'citation'],
    jsonInputSchema: { type: 'object', properties: { page: TECH_JSON, format: { type: 'string', enum: ['summary', 'full'], default: 'summary' }, section: SECTION_JSON, cursor: { type: 'string', maxLength: 120 }, market: { type: 'string', enum: [...MARKETS] } }, required: ['page'], additionalProperties: false },
  },
  trace_connections: {
    title: 'Trace connections in Moyne Ross research',
    description: 'Follow the exact links between the Capital Made Physical papers and the Technical Library; this is not a search. From a paper: the library pages it reasons from, each with the section and why, and the other papers resting on the same ground, most shared first. From a library page: the papers grounded in it and why, its related pages, and the spaces an element serves or the elements a space holds. Use it to see what an argument rests on, or everything that turns on one element; to find a paper or page by topic, search_research. ref is matched as a paper first (slug, CMP number or URL), then as a library page (slug, name or URL; part of a title is enough when it fits only one page). If neither matches, it returns an error rather than a guess.',
    inputSchema: traceConnectionsInputSchema, outputSchema: traceConnectionsOutputSchema,
    outputFields: ['from', 'restsOn', 'groundedPapers', 'sharesGroundWith', 'related', 'spaces', 'elements', 'corpusVersion'],
    jsonInputSchema: { type: 'object', properties: { ref: { type: 'string', minLength: 1, maxLength: 200 } }, required: ['ref'], additionalProperties: false },
  },
  building_brief: {
    title: 'Brief a kind of building',
    description: 'Map what a capital strategy looks at for one kind of building: commercial, industrial, institutional or residential-multi. Returns its functional spaces and the building elements that apply, a page at a time in framework order. Each element comes with a link to its service life, a count of measured thresholds per market, and the papers that reason from it; every element page grades findings on the same severity scale. Use it to scope a type of building before reading pages; to read one element, get_technical_page; for a worked example, get_sample_strategy. Narrow it with spaces (only the elements serving plant rooms, loading docks or wet areas, say), framework_section or market. Names in spaces that are not recognised come back in unknownSpaces rather than failing the call. Leave cursor out for the first page and pass nextCursor back while it is not null. General: it never describes the condition, cost or needs of a particular building.',
    inputSchema: buildingBriefInputSchema, outputSchema: buildingBriefOutputSchema,
    outputFields: ['useClass', 'market', 'spaces', 'unknownSpaces', 'frameworkSections', 'count', 'total', 'nextCursor', 'elements', 'boundary', 'corpusVersion'],
    jsonInputSchema: { type: 'object', properties: { use_class: { type: 'string', enum: [...USE_CLASSES] }, spaces: { type: 'array', items: { type: 'string', minLength: 1, maxLength: 120 }, maxItems: 8 }, market: { type: 'string', enum: [...MARKETS] }, framework_section: { type: 'string', maxLength: 80 }, limit: { type: 'integer', minimum: 1, maximum: 50, default: 20 }, cursor: { type: 'string', maxLength: 20 }, response_format: { type: 'string', enum: [...RESPONSE_FORMATS], default: 'concise' } }, required: ['use_class'], additionalProperties: false },
  },
  compare_technical_sections: {
    title: 'Compare Technical Library sections',
    description: 'Set one section side by side across two to five Technical Library pages: service life, severity, remedies, cost shape, what to ask for and the rest, or thresholds for the measured values by market. Use it to compare elements on one question; to read a whole page, get_technical_page. Pages come back in the order given, each with its section text and anchored URL; a section over about 3,000 characters is shortened and marked truncated, and the URL leads to the rest. A page without that section says so in its place. References that match no page are listed in unknown; if fewer than two pages are found, the call returns an error. For thresholds, market gives one market\'s values; without it every market is labelled, and a value applies only in its own market. General guidance on how elements behave, never evidence about a particular building.',
    inputSchema: compareSectionsInputSchema, outputSchema: compareSectionsOutputSchema,
    outputFields: ['section', 'market', 'pages', 'unknown', 'corpusVersion'],
    jsonInputSchema: { type: 'object', properties: { pages: { type: 'array', items: { type: 'string', minLength: 1, maxLength: 200 }, minItems: 2, maxItems: 5 }, section: { type: 'string', enum: [...COMPARE_SECTION_IDS] }, market: { type: 'string', enum: [...MARKETS] } }, required: ['pages', 'section'], additionalProperties: false },
  },
  translate_term: {
    title: 'Translate a building term between markets',
    description: 'What a building element, lease term, code or report is called in Australia, the United Kingdom and the United States, from the Moyne Ross glossary: lift and elevator, make good and dilapidations, downpipe and downspout, strata and condominium, NCC and IBC. Give the term in any market\'s wording. Use it to put a question into the right market\'s words before searching, or to answer "what is X called in Y". Returns each matching entry with all three markets\' terms, a note where the markets use different instruments rather than different words, and the Technical Library pages that cover it. match says how close the entry is: exact, close, loose or none; with none, the glossary has no entry, so say so rather than guessing. These are everyday professional equivalents, not legal definitions.',
    inputSchema: translateTermInputSchema, outputSchema: translateTermOutputSchema,
    outputFields: ['term', 'market', 'match', 'count', 'matches', 'glossaryUrl', 'boundary', 'corpusVersion'],
    jsonInputSchema: { type: 'object', properties: { term: { type: 'string', minLength: 2, maxLength: 120 }, market: { type: 'string', enum: [...MARKETS] } }, required: ['term'], additionalProperties: false },
  },
  working_with_moyne_ross: {
    title: 'How working with Moyne Ross works',
    description: 'Factual information on how Moyne Ross engagements work: who it works with and where (commercial and multi-unit property in Australia, the United Kingdom and the United States), the three stages, the published terms on which a Capital Strategy is released, and common questions. Use it when the person asks about engaging Moyne Ross; for research questions, search_research. Returns the published text and its page URL. It is fixed published information, not a quote or an offer, and it sends nothing.',
    inputSchema: workingWithInputSchema, outputSchema: workingWithOutputSchema,
    outputFields: ['url', 'text'],
    jsonInputSchema: { type: 'object', properties: {}, additionalProperties: false },
  },
  start_strategy_link: {
    title: 'Prepare a Capital Strategy request link',
    description: 'Returns a link to the Moyne Ross request form for one actual commercial or multi-unit building, with the details the person has given filled in. Use it only when the person asks to request a Capital Strategy, and only with details they have provided; leave out anything they have not said. Moyne Ross does not cover individual homes. Nothing is sent: the person opens the link, checks the form and sends it themselves. Line breaks are stripped from every field, and an email that is not one valid address is left off.',
    inputSchema: startStrategyLinkInputSchema, outputSchema: startStrategyLinkOutputSchema,
    outputFields: ['link', 'next'],
    jsonInputSchema: { type: 'object', properties: { building: { type: 'string', minLength: 3, maxLength: 300 }, name: { ...str, maxLength: 120 }, email: { ...str, maxLength: 200 }, organisation: { ...str, maxLength: 160 }, role: { type: 'string', enum: [...ROLES] }, type: { type: 'string', enum: [...PROPERTY_TYPES] }, note: { ...str, maxLength: 400 } }, required: ['building'], additionalProperties: false },
  },
} as const;

export type ToolName = keyof typeof TOOL_CONTRACTS;

// The engagement description and the request link concern a paid service, so
// they are not offered on the OpenAI endpoint or to ChatGPT traffic (OpenAI's
// directory does not allow apps to promote paid services): there, the
// connector is the research, methodology, sample and citations only.
export const PAID_SERVICE_TOOLS: ToolName[] = ['start_strategy_link', 'working_with_moyne_ross'];
export function toolNamesForRequest(): ToolName[] {
  const all = Object.keys(TOOL_CONTRACTS) as ToolName[];
  return handOverEnabled() ? all : all.filter((n) => !PAID_SERVICE_TOOLS.includes(n));
}

// Neutral on every surface: what the material is, and how far it goes.
export function searchBoundary(strength: MatchStrength): string {
  const general = 'Moyne Ross research and the Technical Library are general and do not establish the condition, cost or capital needs of a particular building.';
  if (strength === 'none') return 'Nothing in the Moyne Ross public corpus addresses that. Do not infer an answer from Moyne Ross material that was not returned.';
  if (strength === 'weak') return `Nothing in the corpus strongly matches this question. Treat the results as background only, and say so rather than presenting them as an answer. ${general}`;
  return general;
}
