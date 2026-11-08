import * as z from 'zod/v4';
import { CITATION_STYLES, METHOD_IDS, PART_NUMBERS, PROPERTY_TYPES, ROLES, SAMPLE_PARTS, TECHNICAL_SECTION_IDS } from './core.js';
import type { MatchStrength } from './types.js';
import { handOverEnabled } from './client-label.js';

// The machine contract for every tool: input and output schemas for the MCP
// registration (zod), and the same input as plain JSON Schema for the REST
// layer, OpenAPI and server cards. One definition, so they cannot drift.
//
// Descriptions state what each tool does, when to use it and its limits, in
// neutral terms: no tool asks the model to call another tool unprompted, and
// none promotes a service (Anthropic and OpenAI directory review rules).

export { CITATION_STYLES, METHOD_IDS, PART_NUMBERS, PROPERTY_TYPES, ROLES, SAMPLE_PARTS, TECHNICAL_SECTION_IDS };
export type { MatchStrength };
export const SCOPES = ['all', 'research', 'technical', 'methodology', 'sample'] as const;
export const PAGE_TYPES = ['element', 'space'] as const;
export const RESPONSE_FORMATS = ['concise', 'detailed'] as const;

const paperRef = z.string().min(1).max(200).describe('The paper: its slug (after-rent), CMP number (CMP 024 or 24) or canonical URL.');
const technicalRef = z.string().min(1).max(200).describe('The Technical Library page: its slug (masonry-brickwork), element name (Roof Coverings) or canonical URL.');
const technicalSectionRef = z.string().max(120).optional().describe('One section, by id or heading: what-it-is, service-life, mechanisms (how it fails), signs (what to look for), diagnosis (telling causes apart), severity (how serious), investigation, remedies, cost-shape, jurisdiction-notes, what-to-ask-for.');
const sectionRef = z.string().max(120).optional().describe('A section heading or its anchor, e.g. "a second income line".');

// ─── Inputs ──────────────────────────────────────────────────────────────

export const searchResearchInputSchema = z.object({
  query: z.string().min(2).max(500).describe('The question or topic, in plain words. Practitioner shorthand (capex, dilaps, MEES, TDD) is understood.'),
  scope: z.enum(SCOPES).optional().default('all').describe('all, research (the papers), technical (the Technical Library: building elements and spaces), methodology, or sample.'),
  limit: z.number().int().min(1).max(10).optional().default(5),
  response_format: z.enum(RESPONSE_FORMATS).optional().default('concise').describe('concise (default): title, URL and short answer per result. detailed: adds the citation, part and dates.'),
});
export const listPapersInputSchema = z.object({
  part: z.enum(PART_NUMBERS).optional().describe('Only papers in this part of Capital Made Physical, I to VII.'),
  limit: z.number().int().min(1).max(25).optional().default(15),
  cursor: z.string().max(20).optional().describe('nextCursor from a previous call, for the next page.'),
});
export const getPaperInputSchema = z.object({
  paper: paperRef,
  format: z.enum(['summary', 'full']).optional().default('summary').describe('summary (default): question, answer, summary, limitations and section list. full: adds the complete text.'),
  section: sectionRef,
});
export const explainMethodInputSchema = z.object({
  method: z.enum(METHOD_IDS).describe('capital-register or mr-index.'),
  format: z.enum(['summary', 'full']).optional().default('summary').describe('summary (default): the definition and section list. full: the whole page.'),
  section: z.string().max(120).optional().describe('One section of the method page, by heading.'),
});
export const getSampleStrategyInputSchema = z.object({
  part: z.enum(SAMPLE_PARTS).optional().default('summary').describe('summary (figures, executive summary, key considerations, where the capital sits, how sure) or register.'),
  section: z.string().max(80).optional().describe('With part register: one register section, e.g. roofs, fire, mechanical. Without it, register returns an overview by section.'),
});
export const citePaperInputSchema = z.object({
  paper: z.string().min(1).max(200).describe('A Capital Made Physical paper (slug, CMP number or URL) or a Technical Library page (slug, element name or URL).'),
  style: z.enum(CITATION_STYLES).optional().default('apa').describe('bibtex, ris, csl-json, apa or harvard.'),
  section: sectionRef,
});
export const listTechnicalPagesInputSchema = z.object({
  section: z.string().max(80).optional().describe('Only pages in one framework section, e.g. Façades, Roofs, Mechanical Services, Fire Services. Matches on part of the name.'),
  page_type: z.enum(PAGE_TYPES).optional().describe('element (a building element, judged on condition) or space (a functional space, judged on whether it does its job).'),
  limit: z.number().int().min(1).max(50).optional().default(15),
  cursor: z.string().max(20).optional().describe('nextCursor from a previous call, for the next page.'),
});
export const getTechnicalPageInputSchema = z.object({
  page: technicalRef,
  format: z.enum(['summary', 'full']).optional().default('summary').describe('summary (default): the question, short answer, where it applies, limitations, sources and the anchored sections. full: adds the complete text.'),
  section: technicalSectionRef,
});
export const workingWithInputSchema = z.object({});
export const startStrategyLinkInputSchema = z.object({
  building: z.string().min(3).max(300).describe('The building: street address, suburb or city, and state.'),
  name: z.string().max(120).optional(),
  email: z.string().max(200).optional(),
  organisation: z.string().max(160).optional(),
  role: z.enum(ROLES).optional(),
  type: z.enum(PROPERTY_TYPES).optional().describe('The kind of building.'),
  note: z.string().max(400).optional().describe('Anything the person would like Moyne Ross to know, briefly.'),
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
export const getTechnicalPageOutputSchema = z.object({
  page: technicalSummarySchema.extend({ contentMarkdown: z.string().optional() }),
  section: z.object({ id: z.string(), heading: z.string(), url: z.string(), text: z.string() }).nullable(),
  citation: citationSchema,
});

// ─── Contracts ───────────────────────────────────────────────────────────

const str = { type: 'string' } as const;
const PAPER_JSON = { type: 'string', minLength: 1, maxLength: 200 } as const;
const TECH_JSON = { type: 'string', minLength: 1, maxLength: 200 } as const;
const SECTION_JSON = { type: 'string', maxLength: 120 } as const;

export const TOOL_CONTRACTS = {
  search_research: {
    title: 'Search Moyne Ross research',
    description: 'Search the public Moyne Ross corpus on commercial property and capital: 49 Capital Made Physical papers, the Technical Library (103 pages on building elements and functional spaces: how each fails, what to look for, how serious a finding is, remedies), the Capital Register and MR Index methodology, and a sample Capital Strategy. Use for capital planning, lifecycle and condition, obsolescence, refurbish or redevelop, energy and solar, leases and make good, due diligence, the Australian, British and US markets, and for how a building element or system fails and is judged. For a question about one element or system (a roof, a façade, a chiller, lifts, fire services), scope technical searches the library alone. Returns ranked results with canonical URLs and a match strength with the matched and missing words; when the match is weak, the results are background only. General research: it does not assess a particular building.',
    inputSchema: searchResearchInputSchema, outputSchema: searchResearchOutputSchema,
    outputFields: ['query', 'scope', 'count', 'matchStrength', 'match', 'results', 'suggestedQueries', 'boundary', 'corpusVersion'],
    jsonInputSchema: { type: 'object', properties: { query: { type: 'string', minLength: 2, maxLength: 500 }, scope: { type: 'string', enum: [...SCOPES], default: 'all' }, limit: { type: 'integer', minimum: 1, maximum: 10, default: 5 }, response_format: { type: 'string', enum: [...RESPONSE_FORMATS], default: 'concise' } }, required: ['query'], additionalProperties: false },
  },
  list_papers: {
    title: 'List Moyne Ross papers',
    description: 'List the Capital Made Physical papers in reading order, a page at a time, optionally for one of the seven parts (I to VII). Returns each paper\'s number, title, part, question, short answer, dates and canonical URL, and nextCursor for the next page.',
    inputSchema: listPapersInputSchema, outputSchema: listPapersOutputSchema,
    outputFields: ['count', 'total', 'nextCursor', 'corpusVersion', 'papers'],
    jsonInputSchema: { type: 'object', properties: { part: { type: 'string', enum: [...PART_NUMBERS] }, limit: { type: 'integer', minimum: 1, maximum: 25, default: 15 }, cursor: { type: 'string', maxLength: 20 } }, additionalProperties: false },
  },
  get_paper: {
    title: 'Get a Moyne Ross paper',
    description: 'Retrieve one Capital Made Physical paper by slug, CMP number or canonical URL. By default a summary: the question it answers, its short answer, summary, limitations and its sections with anchored URLs. format full adds the complete text; section returns one section. Always includes a ready citation. Carry the limitations through when relying on it.',
    inputSchema: getPaperInputSchema, outputSchema: getPaperOutputSchema,
    outputFields: ['paper', 'section', 'citation'],
    jsonInputSchema: { type: 'object', properties: { paper: PAPER_JSON, format: { type: 'string', enum: ['summary', 'full'], default: 'summary' }, section: SECTION_JSON }, required: ['paper'], additionalProperties: false },
  },
  explain_method: {
    title: 'Explain a Moyne Ross method',
    description: 'Explain the Capital Register (the line-by-line capital document behind every Capital Strategy) or the MR Index (the MR 1 to MR 5 reading of how much attention a building needs, and how soon), from the public methodology pages. By default the definition and the list of sections; format full gives the whole page, section gives one part.',
    inputSchema: explainMethodInputSchema, outputSchema: explainMethodOutputSchema,
    outputFields: ['method'],
    jsonInputSchema: { type: 'object', properties: { method: { type: 'string', enum: [...METHOD_IDS] }, format: { type: 'string', enum: ['summary', 'full'], default: 'summary' }, section: { type: 'string', maxLength: 120 } }, required: ['method'], additionalProperties: false },
  },
  get_sample_strategy: {
    title: 'Get the sample Capital Strategy',
    description: 'Read the sample Moyne Ross Capital Strategy, a real strategy for an industrial warehouse and office with identifying details changed, to see what such a strategy contains. part summary (default): the ten-year figures, MR Index, executive summary and where the capital sits. part register: an overview of the Capital Register by section, or, with section (e.g. roofs), that section\'s lines with condition, action, timing, cost and cost basis.',
    inputSchema: getSampleStrategyInputSchema, outputSchema: getSampleStrategyOutputSchema,
    outputFields: ['sample'],
    jsonInputSchema: { type: 'object', properties: { part: { type: 'string', enum: [...SAMPLE_PARTS], default: 'summary' }, section: { type: 'string', maxLength: 80 } }, additionalProperties: false },
  },
  cite_paper: {
    title: 'Cite Moyne Ross research',
    description: 'Return an exact citation for a Capital Made Physical paper or a Technical Library page, optionally to one section, in BibTeX, RIS, CSL-JSON, APA or Harvard. Use the formatted text as given rather than retyping it.',
    inputSchema: citePaperInputSchema, outputSchema: citePaperOutputSchema,
    outputFields: ['style', 'formatted', 'citation'],
    jsonInputSchema: { type: 'object', properties: { paper: PAPER_JSON, style: { type: 'string', enum: [...CITATION_STYLES], default: 'apa' }, section: SECTION_JSON }, required: ['paper'], additionalProperties: false },
  },
  list_technical_pages: {
    title: 'List Technical Library pages',
    description: 'List the Moyne Ross Technical Library: one page for each building element and functional space a Capital Strategy assesses, in the order of the Building Check Framework (Substructure to Environmental), a page at a time, optionally for one section or page type. Returns each page\'s title, section, short answer and canonical URL, the framework sections, the severity scale every page grades findings on, and nextCursor for the next page.',
    inputSchema: listTechnicalPagesInputSchema, outputSchema: listTechnicalPagesOutputSchema,
    outputFields: ['count', 'total', 'nextCursor', 'corpusVersion', 'sections', 'severityScale', 'pages'],
    jsonInputSchema: { type: 'object', properties: { section: { type: 'string', maxLength: 80 }, page_type: { type: 'string', enum: [...PAGE_TYPES] }, limit: { type: 'integer', minimum: 1, maximum: 50, default: 15 }, cursor: { type: 'string', maxLength: 20 } }, additionalProperties: false },
  },
  get_technical_page: {
    title: 'Get a Technical Library page',
    description: 'Retrieve one Technical Library page by slug, element name or canonical URL: general technical guidance on how a building element or functional space is built, its service life, how it fails, what to look for, how to tell causes apart, how serious a finding is (graded safety, failure, condition, lifecycle, deadline, check or nil), investigation, remedies, the shape of the cost (never a price), standards in Australia, the UK and the US, and what to ask the owner or agent for. By default a summary with every section\'s anchored URL; section returns one section, format full the whole page. Always includes a ready citation. It describes how elements behave in general, never the condition of a particular building; carry its limitations through.',
    inputSchema: getTechnicalPageInputSchema, outputSchema: getTechnicalPageOutputSchema,
    outputFields: ['page', 'section', 'citation'],
    jsonInputSchema: { type: 'object', properties: { page: TECH_JSON, format: { type: 'string', enum: ['summary', 'full'], default: 'summary' }, section: SECTION_JSON }, required: ['page'], additionalProperties: false },
  },
  working_with_moyne_ross: {
    title: 'How working with Moyne Ross works',
    description: 'Factual information on how Moyne Ross engagements work: who it works with and where (commercial and multi-unit property in Australia, the United Kingdom and the United States), the three stages, the published terms on which a Capital Strategy is released, and common questions. Use when the person asks about engaging Moyne Ross.',
    inputSchema: workingWithInputSchema, outputSchema: workingWithOutputSchema,
    outputFields: ['url', 'text'],
    jsonInputSchema: { type: 'object', properties: {}, additionalProperties: false },
  },
  start_strategy_link: {
    title: 'Prepare a Capital Strategy request link',
    description: 'Returns a link to the Moyne Ross request form for one actual commercial or multi-unit building, with the details the person has given filled in. Use only when the person asks to request a Capital Strategy, and only with details they have provided. Nothing is sent: the person opens the link, checks the form and sends it themselves.',
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
