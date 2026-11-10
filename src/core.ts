import { RANKING } from './ranking.js';
import snapshotJson from '../data/corpus.json' with { type: 'json' };
import type {
  CorpusSnapshot,
  MatchStrength,
  MethodRecord,
  PaperRecord,
  PaperSummary,
  SearchDoc,
  SearchResult,
  SearchScope,
  TechnicalPage,
} from './types.js';

// The snapshot is read-only, deterministic and local: no network, no model,
// no database. It is taken from moyneross.com by scripts/snapshot.mjs.
export const snapshot = snapshotJson as unknown as CorpusSnapshot;
export const papers: PaperRecord[] = snapshot.papers;
export const technicalPages: TechnicalPage[] = snapshot.technical?.pages ?? [];

// ─── Ranking ─────────────────────────────────────────────────────────────
// A faithful port of scripts/benchmark_public_corpus.py in the website
// repository (and of js/mr-search.js on the site): the same stop words,
// tokenizer, stemmer and BM25 (k1 1.4, b 0.72) over the same documents.
// The benchmark, the website search and this connector therefore rank alike.

const STOP = new Set(('a an and are as at be by can does for from how i in is it its of on or the this to what when where which who why ' +
  'with without your you into than that their they them do should could would about across after before one single really').split(' '));

export function tokens(text: string): string[] {
  const raw = String(text ?? '').toLowerCase().replace(/10-year/g, 'ten year').match(/[a-z0-9]+/g) ?? [];
  const out: string[] = [];
  for (let w of raw) {
    if (STOP.has(w) || w.length < 2) continue;
    for (const suf of ['ing', 'ed', 'es', 's']) {
      if (w.length > 5 && w.endsWith(suf)) { w = w.slice(0, -suf.length); break; }
    }
    out.push(w);
  }
  return out;
}

// The Technical Library is ranked beside the website's search index.
//
// The website's documents are scored on the website's own statistics (its
// document frequencies, size and average length), so papers, methodology and
// sample rank against each other exactly as the website benchmark and the
// site search rank them: adding 103 building-element pages cannot reorder the
// papers. Library pages are scored on the statistics of the whole corpus, so a
// word common in the papers (capital, register, lease) counts for little when
// it appears on a library page, then scaled by TECHNICAL_WEIGHT onto the
// papers' scale before the two lists are merged.
//
// TECHNICAL_WEIGHT was measured, not guessed (see docs/BENCHMARK.md): at 0.7
// the website benchmark keeps 56 of 56 in the top three, the practitioner
// paraphrases keep 23 of 24, and 24 of 26 building-element questions find
// their library page in the top three of an unscoped search (26 of 26 with
// scope technical). Higher weights let library pages displace papers on
// capital questions; lower ones bury them on element questions.
//
// Library pages are weighted the way the benchmark weights a paper: title and
// question four times, answer three, framework element and typologies twice,
// then the full text.
export const TECHNICAL_KIND = 'Technical Library';


function technicalSearchText(p: TechnicalPage): string {
  const rep = (t: string, n: number) => Array(n).fill(t).join(' ');
  return [
    rep(p.title, 4), rep(p.question, 4), rep(p.answer, 3),
    rep(`${p.frameworkElement} ${p.frameworkDescription}`, 2), rep(p.typologies.join(' '), 2),
    p.sections.map((x) => `${x.heading} ${x.markdown}`).join(' '),
  ].join(' ');
}
const technicalDocs: SearchDoc[] = technicalPages.map((p) => ({ url: p.canonicalUrl, id: '', title: p.title, kind: TECHNICAL_KIND, blurb: p.answer, text: technicalSearchText(p) }));
const searchDocs: SearchDoc[] = [...snapshot.search.docs, ...technicalDocs];

type Collection = { df: Map<string, number>; N: number; AVG: number };

function idfIn(col: Collection, term: string): number {
  const n = col.df.get(term) ?? 0;
  return Math.log(1 + (col.N - n + 0.5) / (n + 0.5));
}
type IndexedDoc = SearchDoc & { tf: Map<string, number>; len: number; terms: Set<string>; col: Collection; weight: number };

function indexed(d: SearchDoc, col: Collection, weight: number): IndexedDoc {
  const toks = tokens(d.text);
  const tf = new Map<string, number>();
  for (const t of toks) tf.set(t, (tf.get(t) ?? 0) + 1);
  return { ...d, tf, len: toks.length, terms: new Set(tf.keys()), col, weight };
}
function statsOf(source: IndexedDoc[]): Collection {
  const col: Collection = { df: new Map(), N: source.length, AVG: source.reduce((n, d) => n + d.len, 0) / Math.max(1, source.length) };
  for (const d of source) for (const t of d.terms) col.df.set(t, (col.df.get(t) ?? 0) + 1);
  return col;
}
const siteCollection: Collection = { df: new Map(), N: 0, AVG: 0 };
const corpusCollection: Collection = { df: new Map(), N: 0, AVG: 0 };
const siteDocs = snapshot.search.docs.map((d) => indexed(d, siteCollection, 1));
const libraryDocs = technicalDocs.map((d) => indexed(d, corpusCollection, 1));
Object.assign(siteCollection, statsOf(siteDocs));
Object.assign(corpusCollection, statsOf([...siteDocs, ...libraryDocs]));
// Length is normalised against the library's own average: library pages are
// enriched over time and grow longer than the website's documents, and
// measuring them against the mixed average would penalise every page for
// being thorough. Word distinctiveness still comes from the whole corpus.
corpusCollection.AVG = statsOf(libraryDocs).AVG;

// ─── Putting the two collections on one scale ────────────────────────────
//
// Website documents are scored on the website's own statistics so that adding
// or enriching the library can never reorder the research results. That makes
// the two sets of BM25 scores incomparable: they are computed from different
// vocabularies, so the same word is worth a different amount in each.
//
// The factor between them used to be a hand-set constant, and it had to be
// re-tuned after every enrichment batch. The reason is that enriching a page
// adds words it did not have before, which raises how many pages contain each
// word, which lowers how distinctive that word is inside the library, which
// lowers every library score against an unchanged website. The constant was
// chasing a moving target.
//
// So derive it. A word that is equally distinctive in each collection should
// be worth the same in each, which makes the factor the ratio of the two
// collections' typical word weights, measured over the words they share. As
// the library grows, its typical weight falls and the factor rises to match,
// with nothing to re-tune.
export const TECHNICAL_WEIGHT = RANKING.libraryWeight;
for (const d of libraryDocs) d.weight = TECHNICAL_WEIGHT;

const docs: IndexedDoc[] = [...siteDocs, ...libraryDocs];

// scripts/calibrate.mjs sweeps these two settings against the benchmarks
// without rebuilding the index for each trial. Nothing else should call them:
// the shipped values live in src/ranking.ts.
export function __setWeight(w: number): void { for (const d of libraryDocs) d.weight = w; }
export function __setBoost(b: number): void { HEADLINE_BOOST = b; }

// Each document's headline terms: for a paper, its title, question, short
// answer, summary and topics; for a library page, its title, question,
// answer, framework element and typologies; otherwise its title and blurb.
const headTerms = new Map<string, Set<string>>();
const aboutTerms = new Map<string, Set<string>>();
for (const d of searchDocs) {
  const p = snapshot.papers.find((x) => x.canonicalUrl === d.url);
  const t = p ? undefined : technicalPages.find((x) => x.canonicalUrl === d.url);
  const head = p ? [p.title, p.question, p.answer, p.summary, p.topics.join(' ')].join(' ')
    : t ? [t.title, t.question, t.answer, t.frameworkElement, t.frameworkDescription, t.typologies.join(' ')].join(' ')
    : `${d.title} ${d.blurb}`;
  headTerms.set(d.url, new Set(tokens(head)));
  // What the document is about, kept deliberately short and the same size for
  // every kind: its name and the one question it answers. The headline set
  // above is wider (it carries the whole abstract) and is reported to callers;
  // using it to rank would favour whichever kind of document happens to carry
  // the most headline text, which is not a measure of relevance.
  const about = p ? [p.title, p.question].join(' ')
    : t ? [t.title, t.frameworkElement, t.question].join(' ')
    : `${d.title} ${d.blurb}`;
  aboutTerms.set(d.url, new Set(tokens(about)));
}



function bm25(d: IndexedDoc, q: Map<string, number>): number {
  let s = 0;
  const { df, AVG } = d.col;
  for (const [term, qf] of q) {
    if (!df.get(term)) continue;
    const f = d.tf.get(term); if (!f) continue;
    const idf = idfIn(d.col, term);
    s += ((idf * (f * 2.4)) / (f + 1.4 * (1 - 0.72 + (0.72 * d.len) / AVG))) * qf;
  }
  return s;
}

const paperByUrl = new Map(papers.map((p) => [p.canonicalUrl, p]));
const technicalByUrl = new Map(technicalPages.map((p) => [p.canonicalUrl, p]));
export function paperForUrl(url: string): PaperRecord | undefined { return paperByUrl.get(url); }
export function technicalForUrl(url: string): TechnicalPage | undefined { return technicalByUrl.get(url); }

function scopeOf(d: SearchDoc): Exclude<SearchScope, 'all'> | 'practice' {
  if (paperByUrl.has(d.url)) return 'research';
  if (technicalByUrl.has(d.url)) return 'technical';
  if (d.kind === 'Methodology') return 'methodology';
  if (d.kind === 'Sample') return 'sample';
  return 'practice';
}

// ─── Practitioner shorthand ──────────────────────────────────────────────
// The papers spell terms out; people asking questions often do not. Each
// shorthand also searches its expansion, at reduced weight, so exact wording
// still ranks first. Connector-side only: measured on data/benchmark-
// paraphrase.json, without changing the website benchmark's results.
export const SYNONYMS: Record<string, string> = {
  capex: 'capital expenditure', opex: 'operating expenditure', dilaps: 'dilapidations make good', dilapidation: 'make good',
  makegood: 'make good', mees: 'minimum energy efficiency standards epc', epc: 'energy performance certificate',
  ll97: 'local law 97 building performance standards', bps: 'building performance standards', pv: 'solar photovoltaic',
  photovoltaic: 'solar', acp: 'aluminium composite panel combustible cladding', flammable: 'combustible',
  hoa: 'owners corporation strata reserve study', condo: 'strata owners corporation', sinking: 'reserve',
  tdd: 'technical due diligence', vdd: 'vendor due diligence', dd: 'due diligence', bms: 'building management system',
  hvac: 'mechanical services chiller', refurb: 'refurbishment', refit: 'refurbishment', retrofit: 'refurbishment upgrade',
  reposition: 'repositioning', postpone: 'defer deferred', postponing: 'deferred', valuer: 'valuation', valuers: 'valuation',
  yield: 'cap rate', nla: 'lettable area', raac: 'reinforced autoclaved aerated concrete', ev: 'electric vehicle charging',
  satellite: 'aerial imagery', desktop: 'desktop public records', contingency: 'provisional sums investigation allowance',
  tower: 'office building', apartments: 'residential', flats: 'residential', condition: 'condition rating',
  live: 'living', record: 'records register', mr: 'mr index',
  ahu: 'air handling unit', ahus: 'air handling units', fcu: 'fan coil terminal units', vrf: 'variable refrigerant flow localised',
  bmu: 'building maintenance unit', dpc: 'damp proof course', ups: 'emergency power', ats: 'transfer switch emergency power',
  rcd: 'residual current device', msb: 'main switchboard', db: 'distribution board', eifs: 'cladding render insulation',
  lintel: 'lintels', brickwork: 'masonry', brick: 'masonry', subsidence: 'foundations movement', spalling: 'concrete reinforcement corrosion',
};

export type QueryTerm = { term: string; alternatives: string[]; idf: number };

// A word's distinctiveness in the website's collection: what queryTerms
// reports. matchDetail re-weights by the collection the document is in.
function idfOf(term: string): number {
  return idfIn(siteCollection, term);
}

// The question's meaningful words, each with its shorthand expansions.
export function queryTerms(query: string): QueryTerm[] {
  const seen = new Set<string>();
  const out: QueryTerm[] = [];
  for (const t of tokens(query)) {
    if (seen.has(t)) continue;
    seen.add(t);
    const raw = String(query).toLowerCase().match(/[a-z0-9]+/g) ?? [];
    const key = raw.find((w) => tokens(w)[0] === t) ?? t;
    const alternatives = SYNONYMS[key] ? tokens(SYNONYMS[key]).filter((x) => x !== t) : [];
    out.push({ term: t, alternatives, idf: idfOf(t) });
  }
  return out;
}

// ─── What a document is about ────────────────────────────────────────────
//
// BM25 alone cannot tell a document that is about the question from one that
// merely mentions it: a paper discussing roofs in passing and the library page
// on roof coverings both match "roof". The difference is in the headline — the
// title, question and, for a library page, the element it covers — so a match
// there is worth more than a match in the body.
//
// This matters beyond ranking quality. Without it, the only thing deciding
// between a paper and a library page is the scale factor between the two
// collections, so that one number has to serve two opposing jobs at once:
// keep papers on top for capital questions and let library pages through for
// element questions. That leaves a narrow band where both hold, which is why
// it needed re-tuning after every enrichment batch. Judging aboutness
// directly separates the two jobs, and the scale factor stops being load
// bearing.
export let HEADLINE_BOOST = RANKING.headlineBoost;
function headlineFraction(url: string, qts: QueryTerm[]): number {
  let total = 0, hit = 0;
  const head = aboutTerms.get(url);
  if (!head) return 0;
  for (const qt of qts) {
    total += qt.idf;
    if (head.has(qt.term) || qt.alternatives.some((a) => head.has(a))) hit += qt.idf;
  }
  return total > 0 ? hit / total : 0;
}

export type SearchOptions = { query: string; scope?: SearchScope; limit?: number };

export function searchResearch({ query, scope = 'all', limit = 5 }: SearchOptions): SearchResult[] {
  const q = new Map<string, number>();
  for (const t of tokens(query)) q.set(t, (q.get(t) ?? 0) + 1);
  if (!q.size) return [];
  const qts = queryTerms(query);
  for (const qt of qts) for (const alt of qt.alternatives) if (!q.has(alt)) q.set(alt, 0.6);
  return docs
    .filter((d) => scope === 'all' || scopeOf(d) === scope)
    .map((d) => ({ d, score: bm25(d, q) * d.weight * (1 + HEADLINE_BOOST * headlineFraction(d.url, qts)) }))
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score || a.d.url.localeCompare(b.d.url))
    .slice(0, Math.max(1, Math.min(10, limit)))
    .map(({ d, score }) => {
      const paper = paperByUrl.get(d.url);
      const tech = paper ? undefined : technicalByUrl.get(d.url);
      return {
        title: d.title,
        url: d.url,
        kind: d.kind,
        id: d.id || null,
        slug: paper?.slug ?? tech?.slug ?? null,
        answer: d.blurb,
        score: Math.round(score * 100) / 100,
      };
    });
}

// ─── Match strength ──────────────────────────────────────────────────────
// Tells the assistant whether the top result answers the question or is only
// the closest thing in the corpus, so a weak match is not cited as an answer.
// Strong: the top document carries at least 60% of the question's meaning,
// weighted by how distinctive each word is, and scores clearly. Calibrated in
// test/core.test.mjs: all 56 benchmark questions strong, 21 of 24 paraphrased
// questions strong, and at most one of fourteen off-topic questions (the
// known case is "cheap flights to london", whose words genuinely occur in one
// paper's headline material; see docs/BENCHMARK.md).
export const STRONG_MIN_SCORE = 3;
export const STRONG_MIN_COVERAGE = 0.6;

export type MatchDetail = { coverage: number; headlineCoverage: number; matchedTerms: string[]; missingTerms: string[] };

// Coverage weighted by how distinctive each word is (its IDF; a word absent
// from the whole corpus carries the most weight). A word counts as matched
// if it, or one of its shorthand expansions, is in the document. So missing
// "the" or "leaves" barely matters; missing "flights" or "mortgage" does.
export function matchDetail(query: string, url: string): MatchDetail {
  const qts = queryTerms(query);
  const d = docs.find((x) => x.url === url);
  if (!qts.length || !d) return { coverage: 0, headlineCoverage: 0, matchedTerms: [], missingTerms: qts.map((q) => q.term) };
  const head = headTerms.get(url) ?? new Set<string>();
  let total = 0, hit = 0, headHit = 0;
  const matchedTerms: string[] = [], missingTerms: string[] = [];
  for (const q of qts) {
    const idf = d.col === siteCollection ? q.idf : idfIn(d.col, q.term);
    total += idf;
    if (d.terms.has(q.term) || q.alternatives.some((a) => d.terms.has(a))) { hit += idf; matchedTerms.push(q.term); } else missingTerms.push(q.term);
    if (head.has(q.term) || q.alternatives.some((a) => head.has(a))) headHit += idf;
  }
  const r2 = (x: number) => (total ? Math.round((x / total) * 100) / 100 : 0);
  return { coverage: r2(hit), headlineCoverage: r2(headHit), matchedTerms, missingTerms };
}

export function coverage(query: string, url: string): number {
  return matchDetail(query, url).coverage;
}

export function matchStrength(query: string, results: SearchResult[]): MatchStrength {
  const top = results[0];
  if (!top) return 'none';
  return top.score >= STRONG_MIN_SCORE && coverage(query, top.url) >= STRONG_MIN_COVERAGE ? 'strong' : 'weak';
}

// ─── Papers ──────────────────────────────────────────────────────────────

// A lean entry for lists: enough to choose a paper; get_paper has the rest.
export function paperListing(p: PaperRecord) {
  return { id: p.id, slug: p.slug, title: p.title, part: p.part, question: p.question, answer: p.answer, datePublished: p.datePublished, dateModified: p.dateModified, canonicalUrl: p.canonicalUrl, resourceUri: p.resourceUri };
}

export function paperSummary(p: PaperRecord): PaperSummary {
  const { contentMarkdown: _omit, ...rest } = p;
  return rest;
}

export const PART_NUMBERS = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII'] as const;

export function listPapers({ part, limit = 60 }: { part?: string | undefined; limit?: number } = {}): PaperRecord[] {
  const wanted = part?.trim().toUpperCase();
  return papers
    .filter((p) => !wanted || p.part?.number === wanted)
    .slice()
    .sort((a, b) =>
      (PART_NUMBERS.indexOf((a.part?.number ?? 'VIII') as never) - PART_NUMBERS.indexOf((b.part?.number ?? 'VIII') as never)) ||
      ((a.part?.position ?? 99) - (b.part?.position ?? 99)) || a.id.localeCompare(b.id, 'en', { numeric: true }))
    .slice(0, Math.max(1, Math.min(60, limit)));
}

// A paper by slug, CMP number ("CMP 024", "cmp24", "24") or canonical URL.
export function getPaper(ref: string): PaperRecord | undefined {
  const key = String(ref ?? '').trim();
  if (!key) return undefined;
  const lower = key.toLowerCase().replace(/[?#].*$/, '').replace(/\/+$/, '');
  const bySlug = papers.find((p) => p.slug === lower || p.slug === lower.replace(/^.*\/insights\//, ''));
  if (bySlug) return bySlug;
  const num = lower.match(/^(?:cmp\s*)?0*(\d{1,3})$/);
  if (num) return papers.find((p) => Number(p.id.replace(/\D/g, '')) === Number(num[1]));
  return undefined;
}

// ─── Methods, sample, engagement ─────────────────────────────────────────

export const METHOD_IDS = ['capital-register', 'mr-index'] as const;
export function getMethod(id: string): MethodRecord | undefined {
  return snapshot.methods.find((m) => m.id === id);
}

export const SAMPLE_PARTS = ['summary', 'register'] as const;
export type SamplePart = (typeof SAMPLE_PARTS)[number];

// The sample in two parts, so no answer risks an assistant's size limit: the
// summary (figures, executive summary, key considerations, where the capital
// sits, how sure) and the register (every line as tables, with how to read
// it). The register can be narrowed to sections, e.g. "roofs" or "fire".
export function sampleSections(): string[] {
  return [...snapshot.sample.text.matchAll(/^### (.+?)(?: · \$[\d,]+)?$/gm)].map((m) => m[1] ?? '').filter(Boolean);
}

export function sample(part: SamplePart = 'summary', section?: string) {
  const s = snapshot.sample;
  const text = s.text;
  const reg = text.indexOf('\n## The Capital Register');
  const howTo = text.indexOf('\n## How to read this register');
  let out = text;
  if (part === 'summary' && reg > 0) {
    out = `${text.slice(0, reg).trim()}\n\nThe Capital Register is available with part "register": an overview by section, or one section's lines with their cost basis (sections: ${sampleSections().join(', ')}).`;
  }
  if (part === 'register' && reg > 0) {
    let body = text.slice(reg).trim();
    const want = (section ?? '').trim().toLowerCase();
    if (!want) {
      // Without a section, an overview that fits every assistant's limits:
      // each register section with its ten-year subtotal and line count.
      const regEnd = howTo > reg ? howTo : text.length;
      const blocks = text.slice(reg, regEnd).split(/\n(?=### )/).slice(1);
      const rows = blocks.map((b) => {
        const head = (b.split('\n')[0] ?? '').replace(/^### /, '');
        const m = head.match(/^(.*?)(?: · (\$[\d,]+))?$/);
        const lines = (b.match(/^\| \d+\.\d+ \|/gm) ?? []).length;
        return `| ${m?.[1] ?? head} | ${m?.[2] ?? '$0'} | ${lines} |`;
      });
      body = `## The Capital Register: overview\n\n| Section | Ten years | Lines |\n| --- | --- | --- |\n${rows.join('\n')}\n\nRequest any section's lines, with their condition, action, timing, cost and cost basis, with part "register" and that section, e.g. section "roofs".`;
    } else if (want) {
      const regEnd = howTo > reg ? howTo : text.length;
      const blocks = text.slice(reg, regEnd).split(/\n(?=### )/).slice(1);
      const picked = blocks.filter((b) => (b.split('\n')[0] ?? '').toLowerCase().includes(want));
      body = picked.length
        ? `## The Capital Register\n\n${picked.map((b) => b.trim()).join('\n\n')}`
        : `No register section matches "${section}". Sections: ${sampleSections().join(', ')}.`;
    }
    out = `# ${s.title}\n\n${body}`;
  }
  return { title: s.title, url: s.url, interactiveUrl: s.interactiveUrl, part, text: out };
}
export function engagement() { return snapshot.engagement; }

// ─── Hand-over link ──────────────────────────────────────────────────────

export const ROLES = ['owner', 'investor', 'manager', 'adviser', 'home', 'other'] as const;
export const PROPERTY_TYPES = ['office', 'industrial', 'retail', 'mixed-use', 'residential-multi', 'portfolio', 'other'] as const;

export type StartDetails = {
  building: string;
  name?: string | undefined;
  email?: string | undefined;
  organisation?: string | undefined;
  role?: string | undefined;
  type?: string | undefined;
  note?: string | undefined;
};

export function startStrategyLink(details: StartDetails, base: string, source: string): string {
  const params: string[] = [];
  const put = (k: string, v?: string) => { const s = (v ?? '').trim(); if (s) params.push(`${k}=${encodeURIComponent(s.slice(0, 400))}`); };
  put('building', details.building);
  put('name', details.name);
  put('email', details.email);
  put('organisation', details.organisation);
  if (details.role && (ROLES as readonly string[]).includes(details.role)) put('role', details.role);
  if (details.type && (PROPERTY_TYPES as readonly string[]).includes(details.type)) put('type', details.type);
  put('note', details.note);
  put('utm_source', source);
  return `${base}?${params.join('&')}`;
}

// ─── Text renderings (model-facing; always the clean canonical URL) ──────

export function renderSearchResults(results: SearchResult[], query: string, strength: MatchStrength): string {
  if (!results.length) return `Nothing in the Moyne Ross public corpus matches "${query}".`;
  const head = strength === 'weak'
    ? `Nothing in the Moyne Ross corpus strongly matches "${query}". The closest material, as background only:`
    : `Moyne Ross material on "${query}":`;
  return [head, ...results.map((r, i) => `${i + 1}. ${r.title}${r.id ? ` (${r.id})` : ''} · ${r.kind}\n${r.answer}\n${r.url}`)].join('\n\n');
}

export function renderPaper(p: PaperRecord, format: 'summary' | 'full'): string {
  const head = `# ${p.title}\n${p.id}${p.part ? ` · Part ${p.part.number}: ${p.part.title}` : ''} · ${p.publicationType} · published ${p.datePublished}, updated ${p.dateModified}\n${p.canonicalUrl}`;
  const qa = `Question: ${p.question}\n\nAnswer: ${p.answer}`;
  const limits = p.limitations ? `Limitations: ${p.limitations}` : '';
  if (format === 'summary') return [head, qa, p.summary, limits].filter(Boolean).join('\n\n');
  return [head, qa, p.contentMarkdown, limits].filter(Boolean).join('\n\n');
}

// ─── Corpus version ──────────────────────────────────────────────────────
export const corpusVersion: string = snapshot.corpusVersion;

// ─── Citations ───────────────────────────────────────────────────────────
// Structured and pre-formatted, generated here rather than left to the model,
// so a citation is reproduced exactly. Moyne Ross papers have no DOIs; the
// canonical URL and the corpus version identify the cited text.
export const CITATION_STYLES = ['bibtex', 'ris', 'csl-json', 'apa', 'harvard'] as const;
export type CitationStyle = (typeof CITATION_STYLES)[number];

export type Citation = {
  id: string; title: string; author: string; publisher: string; publication: string;
  datePublished: string; dateModified: string; year: number; url: string; section: { heading: string; url: string } | null;
  corpusVersion: string; text: string;
};

function sectionByRef(p: PaperRecord, ref?: string) {
  const want = (ref ?? '').trim().toLowerCase();
  if (!want) return undefined;
  return p.sections.find((s) => s.anchor === want || s.heading.toLowerCase() === want) ?? p.sections.find((s) => s.heading.toLowerCase().includes(want) || s.anchor.includes(want));
}

export function citationFor(p: PaperRecord, sectionRef?: string): Citation {
  const sec = sectionByRef(p, sectionRef);
  const year = Number(p.datePublished.slice(0, 4));
  const url = sec?.url ?? p.canonicalUrl;
  return {
    id: p.id, title: p.title, author: 'Moyne Ross', publisher: 'Moyne Ross', publication: 'Capital Made Physical',
    datePublished: p.datePublished, dateModified: p.dateModified, year, url,
    section: sec ? { heading: sec.heading, url: sec.url } : null, corpusVersion,
    text: `Moyne Ross (${year}). ${p.title}${sec ? `, "${sec.heading}"` : ''}. Capital Made Physical, ${p.id}. Updated ${p.dateModified}. ${url}`,
  };
}

export function formatCitation(p: PaperRecord, style: CitationStyle, sectionRef?: string): string {
  return formatCitationOf(citationFor(p, sectionRef), p.slug, style);
}

// One formatter for every citable record. A Technical Library page has no CMP
// number: its "id" is the library's name, and the series fields name the library.
export function formatCitationOf(c: Citation, slug: string, style: CitationStyle): string {
  const key = `moyneross${c.year}${slug.replace(/[^a-z0-9]/g, '').slice(0, 24)}`;
  const accessed = c.dateModified;
  const isPaper = c.publication === 'Capital Made Physical';
  const series = isPaper ? `Capital Made Physical, ${c.id}` : c.publication;
  switch (style) {
    case 'bibtex':
      return [`@misc{${key},`, `  author = {{Moyne Ross}},`, `  title = {${c.title}${c.section ? `: ${c.section.heading}` : ''}},`,
        `  howpublished = {${series}},`, `  year = {${c.year}},`, `  url = {${c.url}},`,
        `  note = {Updated ${c.dateModified}. Corpus version ${c.corpusVersion}},`, `}`].join('\n');
    case 'ris':
      return ['TY  - ELEC', 'AU  - Moyne Ross', `TI  - ${c.title}${c.section ? `: ${c.section.heading}` : ''}`, `T2  - ${c.publication}`, `PY  - ${c.year}`, `DA  - ${c.datePublished.replace(/-/g, '/')}`,
        `UR  - ${c.url}`, `PB  - Moyne Ross`, `N1  - ${isPaper ? `${c.id}. ` : ''}Updated ${c.dateModified}. Corpus version ${c.corpusVersion}.`, 'ER  - '].join('\n');
    case 'csl-json':
      return JSON.stringify({ id: key, type: isPaper ? 'report' : 'webpage', title: c.title, author: [{ literal: 'Moyne Ross' }], publisher: 'Moyne Ross',
        'container-title': c.publication, ...(isPaper ? { number: c.id } : {}), issued: { 'date-parts': [c.datePublished.split('-').map(Number)] },
        URL: c.url, note: `Updated ${c.dateModified}. Corpus version ${c.corpusVersion}.` }, null, 2);
    case 'apa':
      return isPaper
        ? `Moyne Ross. (${c.year}). *${c.title}* (Capital Made Physical ${c.id.replace('CMP ', 'No. ')}). ${c.url}`
        : `Moyne Ross. (${c.year}). *${c.title}${c.section ? `: ${c.section.heading}` : ''}*. ${c.publication}. ${c.url}`;
    case 'harvard':
      return `Moyne Ross (${c.year}) ${c.title}${!isPaper && c.section ? `: ${c.section.heading}` : ''}. ${series}. Available at: ${c.url} (Updated: ${accessed}).`;
  }
}

// ─── Paper sections ──────────────────────────────────────────────────────
export function paperSection(p: PaperRecord, ref: string): { heading: string; url: string; text: string } | undefined {
  const sec = sectionByRef(p, ref);
  if (!sec) return undefined;
  const md = p.contentMarkdown;
  const start = md.indexOf(`## ${sec.heading}`);
  if (start < 0) return undefined;
  const next = md.indexOf('\n## ', start + 3);
  return { heading: sec.heading, url: sec.url, text: md.slice(start, next > start ? next : undefined).trim() };
}

// ─── Methods: outline, sections, summary ─────────────────────────────────
export function methodOutline(m: MethodRecord): string[] {
  return [...m.text.matchAll(/^## (.+)$/gm)].map((x) => (x[1] ?? '').trim());
}

export function methodView(m: MethodRecord, format: 'summary' | 'full', section?: string): { text: string; sections: string[] } {
  const sections = methodOutline(m);
  const want = (section ?? '').trim().toLowerCase();
  if (want) {
    const h = sections.find((x) => x.toLowerCase().includes(want));
    if (!h) return { text: `No section of ${m.title} matches "${section}". Sections: ${sections.join('; ')}.`, sections };
    const start = m.text.indexOf(`## ${h}`);
    const next = m.text.indexOf('\n## ', start + 3);
    return { text: m.text.slice(start, next > start ? next : undefined).trim(), sections };
  }
  if (format === 'full') return { text: m.text, sections };
  const firstSection = m.text.indexOf('\n## ');
  const opening = (firstSection > 0 ? m.text.slice(0, firstSection) : m.text.slice(0, 2500)).trim();
  return { text: `${opening}\n\nSections (request one with section, or format full): ${sections.join('; ')}.`, sections };
}

// ─── Suggestions when a match is weak ────────────────────────────────────
// The closest papers' own questions: natural follow-ups the corpus can answer.
export function suggestedQueries(results: SearchResult[]): string[] {
  return results.map((r) => paperByUrl.get(r.url)?.question ?? technicalByUrl.get(r.url)?.question).filter((q): q is string => Boolean(q)).slice(0, 3);
}

// ─── Paging ──────────────────────────────────────────────────────────────
// Cursors are opaque to clients; here they are a base-36 offset.
export function page<T>(items: T[], limit: number, cursor?: string): { items: T[]; nextCursor: string | null } {
  const start = cursor ? Math.max(0, parseInt(cursor, 36) || 0) : 0;
  const end = start + limit;
  return { items: items.slice(start, end), nextCursor: end < items.length ? end.toString(36) : null };
}

// ─── Technical Library ───────────────────────────────────────────────────
// One page per element and functional space of the Building Check Framework.
// General technical guidance: how an element is built, fails and is judged,
// never evidence about a particular building and never a price.

// The earlier eleven fixed sections. Pages move from these to the topic
// layout, whose sections each page lists for itself; every earlier address
// still resolves (technicalSection below).
export const TECHNICAL_SECTION_IDS = ['what-it-is', 'service-life', 'mechanisms', 'signs', 'diagnosis', 'severity', 'investigation', 'remedies', 'cost-shape', 'jurisdiction-notes', 'what-to-ask-for'] as const;
export const technicalLibrary = snapshot.technical;
export const technicalFrameworkSections: string[] = snapshot.technical?.framework.sections ?? [];

const fold = (v: string) => String(v ?? '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, ' ').trim();

// A page by slug, canonical URL, framework element name or title; failing an
// exact match, the one page whose title or slug contains the words given.
export function getTechnicalPage(ref: string): TechnicalPage | undefined {
  const raw = String(ref ?? '').trim();
  if (!raw) return undefined;
  const key = fold(raw.replace(/^https?:\/\/(www\.)?moyneross\.com\/technical\//i, '').replace(/[?#].*$/, '').replace(/\/+$/, ''));
  if (!key) return undefined;
  const exact = technicalPages.find((p) => fold(p.slug) === key || fold(p.title) === key || fold(p.frameworkElement) === key);
  if (exact) return exact;
  const partial = technicalPages.filter((p) => fold(p.title).includes(key) || fold(p.slug).includes(key));
  return partial.length === 1 ? partial[0] : undefined;
}

// Close candidates when a reference does not resolve to one page.
export function technicalCandidates(ref: string, limit = 5): TechnicalPage[] {
  const key = fold(ref);
  if (!key) return [];
  const words = key.split(' ').filter((w) => w.length > 2);
  return technicalPages
    .map((p) => ({ p, n: words.filter((w) => fold(`${p.title} ${p.slug} ${p.frameworkElement}`).includes(w)).length }))
    .filter((x) => x.n > 0)
    .sort((a, b) => b.n - a.n || a.p.title.localeCompare(b.p.title))
    .slice(0, limit)
    .map((x) => x.p);
}

// Framework sections in the library's order, so "fire" finds Fire Services.
export function technicalSectionName(ref?: string): string | undefined {
  const key = fold(ref ?? '');
  if (!key) return undefined;
  return technicalFrameworkSections.find((s) => fold(s) === key) ?? technicalFrameworkSections.find((s) => fold(s).includes(key));
}

export function listTechnicalPages({ section, pageType }: { section?: string | undefined; pageType?: string | undefined } = {}): TechnicalPage[] {
  const wanted = section ? technicalSectionName(section) : undefined;
  if (section && !wanted) return [];
  const order = (s: string) => { const i = technicalFrameworkSections.indexOf(s); return i < 0 ? 99 : i; };
  return technicalPages
    .filter((p) => (!wanted || p.section === wanted) && (!pageType || p.pageType === pageType))
    .slice()
    .sort((a, b) => order(a.section) - order(b.section) || a.title.localeCompare(b.title));
}

export function technicalListing(p: TechnicalPage) {
  // Lean, so a default page of the list stays inside every assistant's limits; get_technical_page has the rest.
  return { slug: p.slug, title: p.title, pageType: p.pageType, section: p.section, subsection: p.subsection, frameworkElement: p.frameworkElement, answer: p.answer, updatedAt: p.updatedAt, canonicalUrl: p.canonicalUrl, resourceUri: p.resourceUri };
}

// Everything but the section text: what the page answers, where it applies,
// its limitations and sources, and an anchored URL for every section.
export function technicalSummary(p: TechnicalPage) {
  const { sections, ...rest } = p;
  return { ...rest, sections: sections.map(({ markdown: _m, ...x }) => x) };
}

// A section by its id or heading, or by an address inside it: on a page on the
// topic layout, #diagnosis lives inside Common misreads and #remedies is a
// section of its own, so an earlier citation still reaches the right part.
export function technicalSection(p: TechnicalPage, ref?: string) {
  const want = fold(String(ref ?? '').replace(/^.*#/, ''));
  if (!want) return undefined;
  return p.sections.find((x) => fold(x.id) === want || fold(x.heading) === want)
    ?? p.sections.find((x) => (x.anchors ?? []).some((a) => fold(a) === want))
    ?? p.sections.find((x) => fold(x.heading).includes(want) || fold(x.id).includes(want));
}

export function technicalMarkdown(p: TechnicalPage): string {
  return p.sections.map((x) => `## ${x.heading}\n\n${x.markdown}`).join('\n\n');
}

const USE_CLASS_LABELS: Record<string, string> = {
  all: 'all building classes', 'residential-single': 'houses', 'residential-multi': 'apartments and multi-residential', commercial: 'offices and retail',
  industrial: 'industrial and logistics', institutional: 'healthcare, education and assembly',
};

export function renderTechnicalPage(p: TechnicalPage, format: 'summary' | 'full'): string {
  const applies = p.useClasses.map((c) => USE_CLASS_LABELS[c] ?? c).join(', ');
  const head = `# ${p.title}\nTechnical Library · ${p.section} · ${p.subsection} · ${p.pageType === 'space' ? 'functional space' : 'building element'} · updated ${p.updatedAt ?? p.publishedAt}\n${p.canonicalUrl}`;
  const qa = `Question: ${p.question}\n\nAnswer: ${p.answer}`;
  const scope = `Applies to: ${applies}. Jurisdictions: ${p.jurisdiction.join(', ')}.${p.typologies.length ? ` Typologies: ${p.typologies.join('; ')}.` : ''}`;
  const links = p.pageType === 'space' && p.spaceElements.length
    ? `Elements in this space: ${p.spaceElements.join(', ')}.`
    : p.spaces.length ? `Found in these spaces: ${p.spaces.join(', ')}.` : '';
  const limits = p.limitations ? `Limitations: ${p.limitations}` : '';
  if (format === 'summary') {
    const secs = `Sections (request one with section, or format full): ${p.sections.map((x) => `${x.heading} [${x.id}]`).join('; ')}.`;
    return [head, qa, scope, links, secs, limits].filter(Boolean).join('\n\n');
  }
  return [head, qa, scope, links, technicalMarkdown(p), limits].filter(Boolean).join('\n\n');
}

export function technicalCitationFor(p: TechnicalPage, sectionRef?: string): Citation {
  const sec = technicalSection(p, sectionRef);
  const published = p.publishedAt ?? snapshot.generatedAt ?? '';
  const modified = p.updatedAt ?? published;
  const year = Number(published.slice(0, 4));
  const url = sec?.url ?? p.canonicalUrl;
  return {
    id: 'Technical Library', title: p.title, author: 'Moyne Ross', publisher: 'Moyne Ross', publication: 'Moyne Ross Technical Library',
    datePublished: published, dateModified: modified, year, url,
    section: sec ? { heading: sec.heading, url: sec.url } : null, corpusVersion,
    text: `Moyne Ross (${year}). ${p.title}${sec ? `, "${sec.heading}"` : ''}. Moyne Ross Technical Library. Updated ${modified}. ${url}`,
  };
}

export function formatTechnicalCitation(p: TechnicalPage, style: CitationStyle, sectionRef?: string): string {
  return formatCitationOf(technicalCitationFor(p, sectionRef), p.slug, style);
}

// The severity scale every page grades its findings on: the engine's own
// situations, each read onto a register line's timing basis.
export function severityScale() {
  return snapshot.technical?.framework.severityScale ?? {};
}
