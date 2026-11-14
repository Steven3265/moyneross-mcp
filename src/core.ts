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
  Market,
  TechnicalPage,
  TechnicalThreshold,
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

// ─── Library passages ────────────────────────────────────────────────────
//
// A library page is long and covers many things, so most ordinary words occur
// on it somewhere. Scored as one document, a page wins on words scattered
// across unrelated sections (fire doors finding the lifts page), and a
// question looks answered when its words are merely present. So a library page
// is scored by its best passage: its headline (title, search title, the names
// people use for the element, question and answer), each section, and each
// authored question with its answer. A page answers a question when one
// passage does.
type Passage = { url: string; heading: string; anchor: string | null; tf: Map<string, number>; len: number; terms: Set<string> };
const passageCollection: Collection = { df: new Map(), N: 0, AVG: 0 };
const passagesByUrl = new Map<string, Passage[]>();
{
  const all: Passage[] = [];
  const make = (url: string, heading: string, anchor: string | null, text: string): Passage => {
    const toks = tokens(text);
    const tf = new Map<string, number>();
    for (const t of toks) tf.set(t, (tf.get(t) ?? 0) + 1);
    const ps = { url, heading, anchor, tf, len: toks.length, terms: new Set(tf.keys()) };
    all.push(ps);
    return ps;
  };
  for (const p of technicalPages) {
    const list: Passage[] = [];
    list.push(make(p.canonicalUrl, p.title, null, [p.title, p.title, p.searchTitle ?? '', p.frameworkElement, p.frameworkDescription, (p.alsoKnownAs ?? []).join(' '), (p.alsoKnownAs ?? []).join(' '), p.question, p.answer, p.typologies.join(' ')].join(' ')));
    for (const x of p.sections) list.push(make(p.canonicalUrl, x.heading, x.url, `${x.heading} ${x.heading} ${x.markdown}`));
    for (const f of p.questions ?? []) list.push(make(p.canonicalUrl, f.question, f.url, `${f.question} ${f.question} ${f.answer}`));
    passagesByUrl.set(p.canonicalUrl, list);
  }
  passageCollection.N = all.length;
  passageCollection.AVG = all.reduce((n, x) => n + x.len, 0) / Math.max(1, all.length);
  for (const x of all) for (const t of x.terms) passageCollection.df.set(t, (passageCollection.df.get(t) ?? 0) + 1);
}

// A shorthand's expansion is searched at reduced weight, so the exact wording
// still ranks first. But where the corpus does not contain the word typed at
// all (elevator, mold, aluminum), there is no exact wording to protect: the
// corpus's own word for it is the word, and counts in full.
function altWeight(qt: QueryTerm): number {
  vocabulary ??= new Set([...siteCollection.df.keys(), ...corpusCollection.df.keys(), ...passageCollection.df.keys()]);
  return vocabulary.has(qt.term) ? 0.6 : 1;
}
function bm25Passage(x: Passage, q: Map<string, number>): number {
  let s = 0;
  const { AVG } = passageCollection;
  for (const [term, qf] of q) {
    const f = x.tf.get(term); if (!f) continue;
    const idf = idfIn(passageCollection, term);
    s += ((idf * (f * 2.4)) / (f + 1.4 * (1 - 0.72 + (0.72 * x.len) / AVG))) * qf;
  }
  return s;
}

// A page's best passages for a query, best first. Strength is judged on the
// best two, so a question that needs two sections of the same page (the
// switchboard's capacity, and the supply upgrade) still counts as answered.
export const PASSAGE_SPAN = 2;
function topPassages(url: string, q: Map<string, number>, n: number): { passage: Passage; score: number }[] {
  return (passagesByUrl.get(url) ?? []).map((passage) => ({ passage, score: bm25Passage(passage, q) }))
    .filter((x) => x.score > 0).sort((a, b) => b.score - a.score).slice(0, n);
}

// The page's best passage for a query, and its score.
function bestPassage(url: string, q: Map<string, number>): { passage: Passage; score: number } | undefined {
  let best: { passage: Passage; score: number } | undefined;
  for (const x of passagesByUrl.get(url) ?? []) {
    const score = bm25Passage(x, q);
    if (!best || score > best.score) best = { passage: x, score };
  }
  return best;
}

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
    : t ? [t.title, t.question, t.answer, t.frameworkElement, t.frameworkDescription, t.typologies.join(' '), ...(t.alsoKnownAs ?? []), t.searchTitle ?? ''].join(' ')
    : `${d.title} ${d.blurb}`;
  headTerms.set(d.url, new Set(tokens(head)));
  // What the document is about, kept deliberately short and the same size for
  // every kind: its name and the one question it answers. The headline set
  // above is wider (it carries the whole abstract) and is reported to callers;
  // using it to rank would favour whichever kind of document happens to carry
  // the most headline text, which is not a measure of relevance.
  const about = p ? [p.title, p.question].join(' ')
    : t ? [t.title, t.frameworkElement, t.question, ...(t.alsoKnownAs ?? [])].join(' ')
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
  // One building, three vocabularies. The corpus is written in Australian and
  // British terms; American words reach the same pages.
  elevator: 'lift lifts', elevators: 'lift lifts', mold: 'mould', moldy: 'mould', mouldy: 'mould', aluminum: 'aluminium', stucco: 'render',
  drywall: 'plasterboard', sheetrock: 'plasterboard', faucet: 'tap', faucets: 'taps', restroom: 'toilet amenities', restrooms: 'toilets amenities',
  washroom: 'toilet amenities', sidewalk: 'footpath pavement', asphalt: 'bitumen pavement', blacktop: 'bitumen pavement', furnace: 'boiler heating',
  multifamily: 'residential apartments', rtu: 'packaged rooftop unit', gfci: 'residual current device rcd', breaker: 'circuit breaker', breakers: 'circuit breakers',
  panelboard: 'distribution board', standpipe: 'hydrant riser', story: 'storey', stories: 'storeys', fiber: 'fibre', gray: 'grey', color: 'colour',
  sewer: 'sanitary drainage', garbage: 'waste', trash: 'waste', dumpster: 'waste bin', eicr: 'electrical installation inspection testing',
  skirting: 'wall finishes', baseboard: 'wall finishes', colorbond: 'coated steel roof sheeting', zincalume: 'coated steel roof sheeting',
  generator: 'emergency power', genset: 'emergency power generator', aircon: 'air conditioning cooling', ac: 'air conditioning',
  // How long things last, in the words people use for it.
  lifespan: 'service life', longevity: 'service life', expectancy: 'service life', rul: 'remaining service life', eul: 'expected service life',
  // Institutional shorthand.
  pca: 'property condition assessment technical due diligence', pcr: 'property condition report technical due diligence', nnn: 'triple net lease',
  fri: 'full repairing insuring lease', fci: 'facility condition index deferred maintenance', backlog: 'deferred maintenance',
  ppm: 'planned preventive maintenance', afss: 'annual fire safety statement', esm: 'essential safety measures', ews1: 'external wall fire cladding',
  grenfell: 'combustible cladding', ncc: 'national construction code', bca: 'building code', nabers: 'energy rating', stranded: 'obsolescence',
  fines: 'penalties', fine: 'penalty', demolish: 'redevelopment', demolition: 'redevelopment', rebuild: 'redevelopment', reshoring: 'manufacturing industrial',
  // What an occupant says, and what the page calls it.
  stuffy: 'ventilation fresh air', musty: 'damp mould', bouncy: 'deflection', springy: 'deflection', flickering: 'lighting', noisy: 'noise vibration',
  rust: 'corrosion', rusting: 'corrosion', rusty: 'corrosion', rusted: 'corrosion', corroding: 'corrosion', backup: 'standby emergency', preventative: 'preventive',
  tripping: 'trip circuit breaker', leaking: 'leak water ingress', leaks: 'leak water ingress', stuck: 'entrapment breakdown',
};

// Shorthand that is more than one word. Each word of the phrase also searches
// the expansion, so the phrase counts as matched where the page uses its own
// term for the same thing.
export const PHRASES: [RegExp, string][] = [
  [/\bparking (garage|structure|deck)s?\b|\bparkade\b/, 'car park'],
  [/\bparking lots?\b/, 'car park pavement hardstand'],
  [/\broof ?top units?\b/, 'packaged unit'],
  [/\bconsumer units?\b/, 'distribution board'],
  [/\b(remaining |expected )?useful life\b|\blife expectancy\b/, 'service life'],
  [/\btriple net\b/, 'net lease'],
  [/\bfull repairing\b/, 'repairing lease'],
  [/\bbody corporate\b/, 'owners corporation strata'],
  [/\b(dry|wet) risers?\b/, 'hydrant'],
  [/\bair[- ]?conditioning\b/, 'cooling'],
  [/\bsection j\b/, 'energy efficiency'],
  [/\bproperty condition (report|assessment)s?\b/, 'technical due diligence'],
  [/\bknock(ed|ing)? (it )?down\b/, 'demolish redevelopment'],
  [/\bcap(italisation|italization)? rates?\b/, 'cap rate yield'],
  [/\bcapital works fund\b/, 'sinking fund reserve'],
  [/\bcurtain wall(ing)?\b/, 'glazing'],
  [/\bwater (intrusion|penetration)\b/, 'water ingress'],
  [/\btilt[- ]?up\b/, 'precast panel'],
  [/\bgrease (trap|interceptor)s?\b/, 'grease arrestor trade waste'],
  [/\bfire (door|damper)s?\b/, 'passive fire'],
  [/\bthermal imag(ing|e|es)\b/, 'thermography thermographic'],
];

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
  for (const t of queryTokens(query)) {
    if (seen.has(t)) continue;
    seen.add(t);
    const raw = String(query).toLowerCase().match(/[a-z0-9]+/g) ?? [];
    const key = raw.find((w) => tokens(w)[0] === t) ?? t;
    const alternatives = SYNONYMS[key] ? tokens(SYNONYMS[key]).filter((x) => x !== t) : [];
    for (const v of spelling(t)) if (!alternatives.includes(v)) alternatives.push(v);
    const fixed = correction(t);
    if (fixed && !alternatives.includes(fixed)) alternatives.push(fixed);
    out.push({ term: t, alternatives, idf: idfOf(t) });
  }
  const lower = String(query).toLowerCase();
  for (const [re, expansion] of PHRASES) {
    const m = lower.match(re);
    if (!m) continue;
    const words = new Set((m[0].match(/[a-z0-9]+/g) ?? []).map((w) => tokens(w)[0]).filter(Boolean));
    for (const qt of out) if (words.has(qt.term)) for (const x of tokens(expansion)) if (x !== qt.term && !qt.alternatives.includes(x)) qt.alternatives.push(x);
  }
  return out;
}

// ─── The question's own words ────────────────────────────────────────────
//
// Two things people type that the corpus should not be judged on. First, the
// conversational wrapper around a question ("Hi, I have a question ... any
// guidance appreciated, thanks"): those words are in no document, so they
// weighed most in the match and turned every wrapped question weak. They are
// dropped from the query only; the tokenizer itself stays the website's.
// Second, typing slips: a word the corpus does not contain, five letters or
// longer, that is one slip from a word it does contain is also searched as
// that word, at
// the reduced weight shorthand gets, so an exact match still ranks first.
// Only swapped, dropped or doubled letters inside a word of six or more.
// Third, the grammar of a spoken question ("my lifts keep breaking down", "we
// need to know whether ..."): pronouns, auxiliaries and the verbs that carry a
// sentence rather than its subject. None says what the question is about.
// Negations stay (hasn't, won't, no, not): "dripping when it hasn't rained"
// and "dripping with no rain" are different questions with different pages.
const GRAMMAR = 'my our ours we us me mine im ive weve am was been being have has had having will shall may might must ' +
  'keep keeps kept keeping need needs needed get gets got getting go goes going come comes coming seem seems want wants ' +
  'feel feels happen happens';
const FILLER = new Set(tokens(GRAMMAR + ' hi hello hey thanks thank cheers please kindly any appreciated appreciate appreciation wondering wonder question questions guidance help helpful anyone know tell explain quick quickly advise basically actually just'));
export function queryTokens(query: string): string[] {
  return tokens(query).filter((t) => !FILLER.has(t));
}

let vocabulary: Set<string> | undefined;
// American spellings of a word the corpus spells the British way
// (modernization, color, center, aluminum, mold): searched as the corpus
// spells it, where the corpus has that word and not the one typed.
const SPELLINGS: [RegExp, string][] = [[/iz/g, 'is'], [/yz/g, 'ys'], [/or$/, 'our'], [/or(s|ed|ing)?$/, 'our$1'], [/er$/, 're'], [/ters$/, 'tres'], [/og$/, 'ogue'], [/ense$/, 'ence'], [/l(ed|ing|er)$/, 'll$1'], [/^mold/, 'mould'], [/^aluminum/, 'aluminium'], [/gray/, 'grey'], [/^fiber/, 'fibre'], [/^story$/, 'storey'], [/^stories$/, 'storeys'], [/program$/, 'programme']];
function spelling(term: string): string[] {
  vocabulary ??= new Set([...siteCollection.df.keys(), ...corpusCollection.df.keys(), ...passageCollection.df.keys()]);
  if (term.length < 4 || vocabulary.has(term)) return [];
  const out = new Set<string>();
  for (const [re, to] of SPELLINGS) { const v = term.replace(re, to); if (v !== term) for (const t of tokens(v)) if (vocabulary.has(t)) out.add(t); }
  return [...out];
}
const corrections = new Map<string, string | undefined>();
function correction(term: string): string | undefined {
  if (term.length < 6 || /\d/.test(term)) return undefined;
  vocabulary ??= new Set([...siteCollection.df.keys(), ...corpusCollection.df.keys(), ...passageCollection.df.keys()]);
  if (vocabulary.has(term)) return undefined;
  if (corrections.has(term)) return corrections.get(term);
  // Only the slips fingers make inside a word: two letters swapped, a letter
  // dropped or doubled. Not a wrong letter (horse is not house, broker is not
  // broken) and nothing at either end (gains, negotiate: those are other words
  // or the tokenizer's stemming, not typing).
  const letters = 'abcdefghijklmnopqrstuvwxyz';
  const edits = new Set<string>();
  for (let i = 1; i < term.length - 1; i++) {
    edits.add(term.slice(0, i) + term.slice(i + 1));
    edits.add(term.slice(0, i) + term[i + 1] + term[i] + term.slice(i + 2));
    for (const c of letters) edits.add(term.slice(0, i) + c + term.slice(i));
  }
  let best: string | undefined, bestDf = 0;
  for (const e of edits) {
    if (e.length < 4 || !vocabulary.has(e)) continue;
    const df = (corpusCollection.df.get(e) ?? 0) + (passageCollection.df.get(e) ?? 0);
    if (df > bestDf || (df === bestDf && best !== undefined && e < best)) { best = e; bestDf = df; }
  }
  if (corrections.size > 5000) corrections.clear();
  corrections.set(term, best);
  return best;
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

// A library page's score is half its whole-page score and half its best
// passage's: the page keeps credit for covering a subject broadly, and the
// passage decides which page actually answers. Measured on the retrieval gate
// (docs/BENCHMARK.md); the two settings in src/ranking.ts are fitted on top.
export const PASSAGE_MIX = 0.5;
// Raw scores do not depend on the two ranking settings, so they are kept for
// recent queries: the calibrator re-ranks the same questions many times.
const rawCache = new Map<string, Map<string, number>>();
function rawScores(q: Map<string, number>): Map<string, number> {
  const key = [...q].map(([t, w]) => `${t}:${w}`).join(' ');
  let hit = rawCache.get(key);
  if (!hit) {
    hit = new Map(docs.map((d) => [d.url, rawScore(d, q)]));
    if (rawCache.size >= 2000) rawCache.clear();
    rawCache.set(key, hit);
  }
  return hit;
}
function rawScore(d: IndexedDoc, q: Map<string, number>): number {
  if (d.col !== corpusCollection) return bm25(d, q);
  const best = bestPassage(d.url, q)?.score ?? 0;
  return (1 - PASSAGE_MIX) * bm25(d, q) + PASSAGE_MIX * best;
}

// ─── Questions that name a method ───────────────────────────────────────
// A question that names a method ("what is a capital register line", "MR 4")
// is about that method, though the library mentions registers on every page
// and the words themselves are too common in the corpus to carry it.
const NAMED: [RegExp, string][] = [
  [/\bcapital registers?\b|\bregister lines?\b|\bcost basis\b/i, '/methodology/capital-register'],
  [/\bmr ?index\b|\bmr ?[1-5]\b/i, '/methodology/mr-index'],
  [/\bsample (capital )?strateg/i, '/samples/capital-strategy'],
];
export const NAMED_BOOST = 2.5;
function named(d: IndexedDoc, query: string): number {
  for (const [re, path] of NAMED) if (d.url.endsWith(path) && re.test(query)) return NAMED_BOOST;
  return 1;
}

export function searchResearch({ query, scope = 'all', limit = 5 }: SearchOptions): SearchResult[] {
  const q = new Map<string, number>();
  for (const t of queryTokens(query)) q.set(t, (q.get(t) ?? 0) + 1);
  if (!q.size) return [];
  const qts = queryTerms(query);
  for (const qt of qts) for (const alt of qt.alternatives) if (!q.has(alt)) q.set(alt, altWeight(qt));
  const raw = rawScores(q);
  return docs
    .filter((d) => scope === 'all' || scopeOf(d) === scope)
    .map((d) => ({ d, score: (raw.get(d.url) ?? 0) * d.weight * (1 + HEADLINE_BOOST * headlineFraction(d.url, qts)) * named(d, query) }))
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score || a.d.url.localeCompare(b.d.url))
    .slice(0, Math.max(1, Math.min(10, limit)))
    .map(({ d, score }) => {
      const paper = paperByUrl.get(d.url);
      const tech = paper ? undefined : technicalByUrl.get(d.url);
      // The section (or authored question) that best answers: the best passage
      // other than the page's headline.
      const best = tech ? topPassages(d.url, q, 3).find((x) => x.passage.anchor)?.passage : undefined;
      return {
        title: d.title,
        url: d.url,
        kind: d.kind,
        id: d.id || null,
        slug: paper?.slug ?? tech?.slug ?? null,
        answer: d.blurb,
        score: Math.round(score * 100) / 100,
        ...(best?.anchor ? { section: { heading: best.heading, url: best.anchor } } : {}),
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
// What a library page's best passage must carry of the question before the
// page stands on that passage alone. Set just below 1 so the bar is "the
// passage carries the question", not a tuned figure: on the benchmarks every
// library answer clears it at 1.00 and every off-topic coincidence sits at
// 0.90 or less, so nothing is near the line.
export const STRONG_LIBRARY_COVERAGE = 0.95;

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
  // For a library page, a word counts as matched only if the page's best
  // passage for the question carries it, or the page's own name does.
  let present: Set<string> = d.terms;
  if (d.col === corpusCollection) {
    const q = new Map<string, number>();
    for (const qt of qts) { q.set(qt.term, 1); for (const a of qt.alternatives) if (!q.has(a)) q.set(a, altWeight(qt)); }
    const top = topPassages(url, q, PASSAGE_SPAN);
    present = new Set([...top.flatMap((x) => [...x.passage.terms]), ...(aboutTerms.get(url) ?? [])]);
  }
  let total = 0, hit = 0, headHit = 0;
  const matchedTerms: string[] = [], missingTerms: string[] = [];
  for (const q of qts) {
    const idf = d.col === siteCollection ? q.idf : idfIn(d.col, q.term);
    total += idf;
    if (present.has(q.term) || q.alternatives.some((a) => present.has(a))) { hit += idf; matchedTerms.push(q.term); } else missingTerms.push(q.term);
    if (head.has(q.term) || q.alternatives.some((a) => head.has(a))) headHit += idf;
  }
  const r2 = (x: number) => (total ? Math.round((x / total) * 100) / 100 : 0);
  return { coverage: r2(hit), headlineCoverage: r2(headHit), matchedTerms, missingTerms };
}

export function coverage(query: string, url: string): number {
  return matchDetail(query, url).coverage;
}

// The results mix papers and library pages on one list, and which comes first
// is a matter of two scales being weighed against each other. So the answer is
// strong if the best result of either kind is: a library page that carries the
// whole question is an answer even when a paper that merely shares its words
// has edged ahead of it, and the reverse.
export function matchStrength(query: string, results: SearchResult[]): MatchStrength {
  return judged(query, results).strength;
}
// The strength, and the result it was judged on (the one whose matched and
// missing words are reported): the first, unless the best of the other kind
// is what made the answer strong.
export function judged(query: string, results: SearchResult[]): { strength: MatchStrength; on: SearchResult | undefined } {
  const top = results[0];
  if (!top) return { strength: 'none', on: undefined };
  const first = strengthOf(query, top);
  if (first === 'strong') return { strength: first, on: top };
  const isLibrary = (r: SearchResult) => r.kind === TECHNICAL_KIND;
  const other = results.slice(1, 5).find((r) => isLibrary(r) !== isLibrary(top));
  return other && strengthOf(query, other) === 'strong' ? { strength: 'strong', on: other } : { strength: first, on: top };
}
function strengthOf(query: string, top: SearchResult): MatchStrength {
  const m = matchDetail(query, top.url);
  if (top.score < STRONG_MIN_SCORE || m.coverage < STRONG_MIN_COVERAGE) return 'weak';
  // A paper or website page is judged on its whole text, where ordinary words
  // turn up in every sense: "deferred tax liability accounting" finds the
  // deferred-maintenance paper. So it is strong only if the question is about
  // buildings or property capital at all (domainEvidence), or names what the
  // paper is about (its title and question).
  //
  // A library page is judged on its own passages instead, so a page whose best
  // passage carries every distinctive word of the question has answered it,
  // in whatever words the question was asked: "why is my ceiling dripping on
  // cold mornings" is not weaker evidence than "condensation on soffit", and
  // the element words people actually use (wall, roof, lift, drain) are the
  // ones domainEvidence has to discount as everyday. Short of carrying the
  // whole question, a library page is held to the same test as a paper, which
  // is what keeps a question whose words merely happen to occur on a page
  // ("timing belt replacement on a car") from being served as an answer.
  if (top.kind === TECHNICAL_KIND && m.coverage >= STRONG_LIBRARY_COVERAGE) return 'strong';
  return domainEvidence(query) >= 1 || m.headlineCoverage >= STRONG_HEADLINE_COVERAGE ? 'strong' : 'weak';
}

// ─── Domain evidence ─────────────────────────────────────────────────────
//
// How clearly a question is about buildings or property capital, from its
// own words. A phrase such as "capital register", "MR Index" or "make good",
// or one unambiguous word (building, tenant, capex, chiller, spalling, and
// every element and alias the Technical Library names), is enough. Words
// with everyday senses (lift, lease, frame, core, capital, register, index,
// kitchen, energy) count for 0.4 each, so a question needs three of them, or
// one of them with a clear word, to count. Tested on off-topic and on-topic
// questions the rule was not tuned on: see docs/BENCHMARK.md.
export const STRONG_HEADLINE_COVERAGE = 0.7;
const termSet = (text: string) => new Set(tokens(text));
const GENERIC_TERMS = termSet(`200 action act area areas back base box boxes call cause check clean cold common control cover cross cycle data down effect end entry equipment file fill final finish fit fitting fixed flat flow free fund golden good grade green guide hammer head heads high holes hot impact key land lead less level light lines load locks log loop loose low main make matrix mobile network non off out outs outside panel path performance phase phon play plug point post power pre ready record re reverse safe safety screen self shell shut signs site smart soft solid special spray stack standard static step sub switch system test time transfer travel trip unit units universal up value warm work works zone code book delivery rate rated bays bear bank trend type types table tabl matt mov removal management survey clock spac`);
const AMBIGUOUS_TERMS = termSet(`lift lifts car cars gym gyms frame fram structure structur structural service servic capital register core foundation insulation heat pump pumps kitchen room rooms dock docks glass fire fires energy solar replacement carpet barbecue tree trees garden pool pools tenni sauna playground restaurant hotel house home guest office retail shop shops shopp food wine aquarium laboratori medical classroom clinical nurse bike sink toilet shower bathroom laundri dishwasher cooktop paint plaster lighting water gas oil cable cabl security wall walls door doors window floor floors ceiling ceil roof stair tank pipe pipes metal wood stone steel concrete timber brick tile tiles glaz coating coat seal seals lease leases asset assets portfolio condition cost costs rent plan plans strategy index reserve debt deferr timing tim obsolete obsolescence name drain drainage chain rope cradle cage cages bin bins theatre hall allowance budget forecast`);
const CLEAR_TERMS = termSet(`building buildings property properties tenant tenants tenancy landlord landlords leasehold freehold dilapidations dilaps makegood capex opex maintenance refurbishment refurbish redevelop redevelopment lifecycle strata condo hoa valuation valuer defect defects warehouse industrial commercial facade cladding chiller switchboard sprinkler mees epc nabers ll97 bps decarbonisation emissions carbon proptech fitout outgoings nla gla occupier occupiers owner owners contingency tdd vdd`);
const DOMAIN_PHRASES = [/\bmr ?index\b/i, /\bmr ?[1-5]\b/i, /\bcapital (register|strategy|strategies|plan|planning|expenditure|works)\b/i, /\bmoyne ross\b/i, /\bcapital made physical\b/i, /\bmake[- ]good\b/i, /\bnet zero\b/i, /\btechnical due diligence\b/i, /\bvendor (dd|due diligence)\b/i, /\bsinking fund\b/i, /\breserve stud/i, /\bowners corporation\b/i, /\benergy (rating|performance|efficiency)\b/i, /\bbuilding (code|condition|services)\b/i, /\bcost basis\b/i];
const DOMAIN_TERMS = new Set<string>(CLEAR_TERMS);
for (const p of technicalPages) for (const t of tokens([p.title, p.frameworkElement, ...(p.alsoKnownAs ?? [])].join(' '))) if (!GENERIC_TERMS.has(t)) DOMAIN_TERMS.add(t);
for (const t of AMBIGUOUS_TERMS) DOMAIN_TERMS.delete(t);

export function domainEvidence(query: string): number {
  if (DOMAIN_PHRASES.some((r) => r.test(query))) return 1;
  let e = 0;
  for (const raw of new Set(queryTokens(query))) {
    const t = DOMAIN_TERMS.has(raw) || AMBIGUOUS_TERMS.has(raw) ? raw : (correction(raw) ?? raw);
    if (DOMAIN_TERMS.has(t)) e += 1;
    else if (AMBIGUOUS_TERMS.has(t)) e += 0.4;
  }
  return Math.round(e * 10) / 10;
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
// The register's own sections: the ### headings between "The Capital Register"
// and "How to read this register", not the summary's or the reading notes'.
export function sampleSections(): string[] {
  const text = snapshot.sample.text;
  const reg = text.indexOf('\n## The Capital Register');
  const end = text.indexOf('\n## How to read this register');
  const body = reg > 0 ? text.slice(reg, end > reg ? end : text.length) : text;
  return [...body.matchAll(/^### (.+?)(?: · \$[\d,]+)?$/gm)].map((m) => m[1] ?? '').filter(Boolean);
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
      if (!picked.length) return { title: s.title, url: s.url, interactiveUrl: s.interactiveUrl, part, text: '', unknownSection: `The sample register has no section matching "${section}". Its sections: ${sampleSections().join(', ')}.` };
      body = `## The Capital Register\n\n${picked.map((b) => b.trim()).join('\n\n')}`;
    }
    out = body;
  }
  return { title: s.title, url: s.url, interactiveUrl: s.interactiveUrl, part, text: out.replace(new RegExp(`^# ${s.title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*`), '') };
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
  // Control characters (line breaks included) are removed, so nothing typed
  // can add a line or a header to the form; an email is kept only if it looks
  // like one address.
  const clean = (v?: string) => (v ?? '').replace(/[\u0000-\u001f\u007f-\u009f\u2028\u2029]+/g, ' ').replace(/\s+/g, ' ').trim();
  const put = (k: string, v?: string) => { const s = clean(v); if (s) params.push(`${k}=${encodeURIComponent(s.slice(0, 400))}`); };
  put('building', details.building);
  put('name', details.name);
  const email = clean(details.email);
  if (/^[^\s@<>()",;:]+@[^\s@<>()",;:]+\.[a-z]{2,}$/i.test(email)) put('email', email);
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
  return [head, ...results.map((r, i) => `${i + 1}. ${r.title}${r.id ? ` (${r.id})` : ''} · ${r.kind}\n${r.answer}\n${r.url}${r.section ? `\nClosest section: ${r.section.heading} ${r.section.url}` : ''}`)].join('\n\n');
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
// A cursor is only ever a nextCursor this server gave out: a position inside
// the list. Anything else is refused rather than quietly read as the start,
// or as an empty page that looks like the end of the list.
export function cursorProblem(cursor: string | undefined, total: number): string | undefined {
  if (cursor === undefined || cursor === '') return undefined;
  const n = /^[0-9a-z]{1,6}$/.test(cursor) ? parseInt(cursor, 36) : NaN;
  return Number.isSafeInteger(n) && n > 0 && n < total ? undefined : `"${cursor}" is not a cursor for this list. Leave cursor out for the first page, then pass the nextCursor each page returns.`;
}

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

// ─── Thresholds by market ────────────────────────────────────────────────
// moyneross.com keeps every market's measured values out of the text the
// markets share: each value sits in the page's thresholds, tagged with the one
// market it applies in. Asked for a market, the connector returns that
// market's values alone; asked for none, it returns every market's values
// grouped and labelled, with the rule for using them first. It never picks a
// market on the caller's behalf, so a missing value stays visible.
export const MARKETS = ['AU', 'UK', 'US'] as const;
export const MARKET_NAMES: Record<Market, string> = { AU: 'Australia', UK: 'United Kingdom', US: 'United States' };
const FALLBACK_POLICY = 'A threshold applies only to assets in its own market. Read an asset against its own market\'s values; cite another market\'s value only as a labelled comparison, never as the requirement. Where the asset\'s market has no value on a page, say so rather than borrow one.';
export function thresholdPolicy(): string { return snapshot.technical?.framework.thresholdPolicy?.rule || FALLBACK_POLICY; }
export type ThresholdView = { market: Market | null; policy: string; values: TechnicalThreshold[]; missing: Market[] };
// undefined when the snapshot predates thresholds, so nothing claims a gap
// that is only an old snapshot.
export function thresholdsFor(p: TechnicalPage, market?: Market): ThresholdView | undefined {
  if (!p.thresholds) return undefined;
  const all = p.thresholds;
  const covered = MARKETS.filter((m) => p.jurisdiction.includes(m));
  const asked: readonly Market[] = market ? [market] : covered;
  return {
    market: market ?? null,
    policy: thresholdPolicy(),
    values: market ? all.filter((x) => x.market === market) : all,
    missing: asked.filter((m) => !all.some((x) => x.market === m)),
  };
}
function thresholdLine(x: TechnicalThreshold): string {
  const where = [x.source.title, x.clause].filter(Boolean).join(', ');
  return `- ${x.measure}: ${x.rule}. Source: ${where}${x.basis === 'secondary' ? ' (quoted by a secondary source)' : ''}${x.source.url ? ` ${x.source.url}` : ''}`;
}
export function renderThresholds(p: TechnicalPage, view: ThresholdView | undefined): string {
  if (!view) return '';
  const head = view.market ? `## Thresholds: ${MARKET_NAMES[view.market]}` : '## Thresholds by market';
  const out = [head, `Rule: ${view.policy}`];
  const markets: readonly Market[] = view.market ? [view.market] : MARKETS.filter((m) => p.jurisdiction.includes(m));
  for (const m of markets) {
    const mine = view.values.filter((x) => x.market === m);
    if (!view.market) out.push(`### ${MARKET_NAMES[m]}`);
    out.push(mine.length ? mine.map(thresholdLine).join('\n') : `No ${MARKET_NAMES[m]} value is recorded on this page. Do not apply another market's value as the requirement.`);
  }
  return out.join('\n\n');
}
export function marketOf(ref?: string): Market | undefined {
  const r = String(ref ?? '').trim().toUpperCase();
  if (r === 'AU' || r === 'AUS' || r === 'AUSTRALIA') return 'AU';
  if (r === 'UK' || r === 'GB' || r === 'GBR' || r === 'UNITED KINGDOM' || r === 'ENGLAND' || r === 'BRITAIN') return 'UK';
  if (r === 'US' || r === 'USA' || r === 'UNITED STATES') return 'US';
  return undefined;
}
// A request for the thresholds as if they were a section.
export function isThresholdsRef(ref?: string): boolean {
  return /^(thresholds?|thresholds-by-market|values)$/.test(fold(String(ref ?? '').replace(/^.*#/, '')).replace(/\s+/g, '-'));
}

// Everything but the section text: what the page answers, where it applies,
// its limitations and sources, an anchored URL for every section, and its
// thresholds: one market's if asked, otherwise every market's, labelled.
export const SUMMARY_ANSWERS = 5;
export function technicalSummary(p: TechnicalPage, market?: Market) {
  const { sections, thresholds: _t, marketsWithoutThresholds: _m, questions, ...rest } = p;
  const view = thresholdsFor(p, market);
  // Every authored question is listed with the section that answers it; the
  // first five carry their short answers. A page can then gain questions in
  // people's own words (they are what search finds it by) without its summary
  // outgrowing the assistants' limits.
  const listed = questions?.map((q, i) => (i < SUMMARY_ANSWERS ? q : { question: q.question, url: q.url }));
  return { ...rest, ...(listed ? { questions: listed } : {}), sections: sections.map(({ markdown: _x, ...x }) => x), ...(view ? { thresholds: view } : {}) };
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

// The full text of a long page, a part at a time: whole sections, up to about
// FULL_PAGE_BUDGET characters, so no answer approaches a client's limit
// (Gemini CLI truncates at 40,000) however much a page is enriched. cursor is
// the id of the section to start from; nextCursor is null on the last part.
export const FULL_PAGE_BUDGET = 24_000;
export type TechnicalPart = { markdown: string; firstSection: string; nextCursor: string | null; part: number; parts: number };
function technicalParts(p: TechnicalPage): TechnicalPage['sections'][] {
  const parts: TechnicalPage['sections'][] = [];
  let cur: TechnicalPage['sections'] = [], size = 0;
  for (const x of p.sections) {
    const len = x.heading.length + x.markdown.length + 8;
    if (cur.length && size + len > FULL_PAGE_BUDGET) { parts.push(cur); cur = []; size = 0; }
    cur.push(x); size += len;
  }
  if (cur.length) parts.push(cur);
  return parts;
}
export function technicalMarkdownPart(p: TechnicalPage, cursor?: string): TechnicalPart | undefined {
  const parts = technicalParts(p);
  const i = cursor ? parts.findIndex((secs) => secs[0]?.id === cursor) : 0;
  const secs = parts[i];
  if (i < 0 || !secs) return undefined;
  return {
    markdown: secs.map((x) => `## ${x.heading}\n\n${x.markdown}`).join('\n\n'),
    firstSection: secs[0]?.id ?? '',
    nextCursor: parts[i + 1]?.[0]?.id ?? null,
    part: i + 1,
    parts: parts.length,
  };
}

const USE_CLASS_LABELS: Record<string, string> = {
  all: 'all building classes', 'residential-single': 'houses', 'residential-multi': 'apartments and multi-residential', commercial: 'offices and retail',
  industrial: 'industrial and logistics', institutional: 'healthcare, education and assembly',
};

export function renderTechnicalPage(p: TechnicalPage, format: 'summary' | 'full', part?: TechnicalPart, market?: Market): string {
  const applies = p.useClasses.map((c) => USE_CLASS_LABELS[c] ?? c).join(', ');
  const head = `# ${p.title}\nTechnical Library · ${p.section} · ${p.subsection} · ${p.pageType === 'space' ? 'functional space' : 'building element'} · updated ${p.updatedAt ?? p.publishedAt}\n${p.canonicalUrl}`;
  const qa = `Question: ${p.question}\n\nAnswer: ${p.answer}`;
  const scope = `Applies to: ${applies}. Jurisdictions: ${p.jurisdiction.join(', ')}.${p.typologies.length ? ` Typologies: ${p.typologies.join('; ')}.` : ''}`;
  const links = p.pageType === 'space' && p.spaceElements.length
    ? `Elements in this space: ${p.spaceElements.join(', ')}.`
    : p.spaces.length ? `Found in these spaces: ${p.spaces.join(', ')}.` : '';
  const limits = p.limitations ? `Limitations: ${p.limitations}` : '';
  const values = renderThresholds(p, thresholdsFor(p, market));
  if (format === 'summary') {
    const secs = `Sections (request one with section, or format full): ${p.sections.map((x) => `${x.heading} [${x.id}]`).join('; ')}${p.thresholds ? '; Thresholds by market [thresholds]' : ''}.`;
    return [head, qa, scope, links, secs, values, limits].filter(Boolean).join('\n\n');
  }
  if (part && part.parts > 1) {
    const more = part.nextCursor ? `Part ${part.part} of ${part.parts}. The page continues: call again with format full and cursor "${part.nextCursor}".` : `Part ${part.part} of ${part.parts}, the last.`;
    return [head, part.part === 1 ? qa : '', part.part === 1 ? scope : '', part.part === 1 ? links : '', part.part === 1 ? values : '', part.markdown, more, limits].filter(Boolean).join('\n\n');
  }
  return [head, qa, scope, links, values, technicalMarkdown(p), limits].filter(Boolean).join('\n\n');
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

// ─── Connections: the paper–library graph ───────────────────────────────
// The papers reason from the Technical Library, and each says which pages it
// rests on and why (technicalPages). Library pages name the pages related to
// them, the spaces an element serves and the elements a space holds. These
// functions walk those links rather than searching text, so they answer
// "what does this rest on", "what else turns on this element" and "what
// matters in this kind of building" exactly, with no ranking involved.

export const USE_CLASSES = ['commercial', 'industrial', 'institutional', 'residential-multi'] as const;
export type UseClass = (typeof USE_CLASSES)[number];
const LIBRARY_SECTION_IDS = ['notice', 'what-it-is', 'service-life', 'severity', 'investigation', 'remedies', 'cost-shape', 'what-to-ask-for', 'misreads', 'jurisdiction-notes', 'worked-example', 'thresholds'] as const;
export const COMPARE_SECTION_IDS = LIBRARY_SECTION_IDS;
const techBySlug = new Map(technicalPages.map((p) => [p.slug, p]));
const pageRef = (p: TechnicalPage) => ({ slug: p.slug, title: p.title, pageType: p.pageType, section: p.section, url: p.canonicalUrl });
const paperRef = (p: PaperRecord) => ({ id: p.id, slug: p.slug, title: p.title, url: p.canonicalUrl });
// Papers resting on each library page, with the section and the reason.
const groundedBy = new Map<string, { paper: PaperRecord; section: string | null; url: string; why: string }[]>();
for (const p of papers) for (const g of p.technicalPages ?? []) {
  const list = groundedBy.get(g.slug) ?? [];
  list.push({ paper: p, section: g.section, url: g.url, why: g.why });
  groundedBy.set(g.slug, list);
}
const pagesRef = (slugs: string[]) => slugs.map((s) => techBySlug.get(s)).filter((x): x is TechnicalPage => Boolean(x)).map(pageRef);

export type Connections = ReturnType<typeof traceConnections>;
// From a paper: the pages it rests on, and the other papers that rest on the
// same ground (most shared first). From a library page: the papers grounded
// in it, its related pages, and the spaces it serves or the elements it holds.
export function traceConnections(ref: string) {
  const paper = getPaper(ref);
  const tech = paper ? undefined : getTechnicalPage(ref);
  if (paper) {
    const ground = (paper.technicalPages ?? []).map((g) => {
      const t = techBySlug.get(g.slug);
      return { slug: g.slug, title: t?.title ?? g.slug, section: g.section, url: g.url, why: g.why };
    });
    const mine = new Set(ground.map((g) => g.slug));
    const shared = papers.filter((p) => p.slug !== paper.slug)
      .map((p) => ({ p, on: (p.technicalPages ?? []).map((g) => g.slug).filter((s) => mine.has(s)) }))
      .filter((x) => x.on.length).sort((a, b) => b.on.length - a.on.length || a.p.id.localeCompare(b.p.id, 'en', { numeric: true }))
      .slice(0, 8).map((x) => ({ ...paperRef(x.p), sharedPages: [...new Set(x.on)] }));
    return { from: { kind: 'paper' as const, ...paperRef(paper) }, restsOn: ground, groundedPapers: [], sharesGroundWith: shared, related: [], spaces: [], elements: [], corpusVersion };
  }
  if (tech) {
    const grounded = (groundedBy.get(tech.slug) ?? []).map((g) => ({ ...paperRef(g.paper), section: g.section, why: g.why }));
    // Spaces an element serves, both as the element lists them and as spaces list it.
    const spaceSlugs = tech.pageType === 'element'
      ? [...new Set([...tech.spaces, ...technicalPages.filter((s) => s.pageType === 'space' && s.spaceElements.includes(tech.slug)).map((s) => s.slug)])]
      : tech.subSpaces;
    const elementSlugs = tech.pageType === 'space' ? tech.spaceElements : [];
    return { from: { kind: 'technical' as const, slug: tech.slug, title: tech.title, id: null, url: tech.canonicalUrl }, restsOn: [], groundedPapers: grounded, sharesGroundWith: [], related: pagesRef(tech.related), spaces: pagesRef(spaceSlugs), elements: pagesRef(elementSlugs), corpusVersion };
  }
  return undefined;
}

// What a kind of building turns on, from the library: its spaces, and the
// elements in play (all of them, or those serving the spaces named), each with
// where its service life is set out, how many measured thresholds the market
// has on it, and the papers that reason from it. A map to read from, not an
// assessment: it says what a strategy for such a building looks at, never
// what any one building needs.
export function buildingBrief({ useClass, spaces = [], market, frameworkSection }: { useClass: UseClass; spaces?: string[]; market?: Market; frameworkSection?: string }) {
  const applies = (p: TechnicalPage) => p.useClasses.includes(useClass) || p.useClasses.includes('all');
  const spacePages = technicalPages.filter((p) => p.pageType === 'space' && applies(p));
  const named = spaces.map((s) => getTechnicalPage(s)).filter((p): p is TechnicalPage => Boolean(p) && p!.pageType === 'space');
  const unknownSpaces = spaces.filter((s) => { const p = getTechnicalPage(s); return !p || p.pageType !== 'space'; });
  const inNamed = new Set(named.flatMap((s) => [...s.spaceElements]));
  for (const s of named) for (const e of technicalPages) if (e.pageType === 'element' && e.spaces.includes(s.slug)) inNamed.add(e.slug);
  const want = frameworkSection ? fold(frameworkSection) : '';
  const elements = technicalPages.filter((p) => p.pageType === 'element' && applies(p)
    && (!named.length || inNamed.has(p.slug))
    && (!want || fold(p.section).includes(want)));
  // Framework order (Substructure to Environmental), as list_technical_pages gives it.
  const order = new Map(listTechnicalPages({}).map((p, i) => [p.slug, i]));
  elements.sort((a, b) => (order.get(a.slug) ?? 0) - (order.get(b.slug) ?? 0));
  const markets = market ? [market] : MARKETS.slice();
  const rows = elements.map((p) => {
    const life = p.sections.find((x) => x.id === 'service-life');
    const counts = Object.fromEntries(markets.map((m) => [m, (p.thresholds ?? []).filter((t) => t.market === m).length]));
    const grounded = groundedBy.get(p.slug) ?? [];
    return {
      slug: p.slug, title: p.title, section: p.section, answer: p.answer, url: p.canonicalUrl,
      serviceLife: life ? `${p.canonicalUrl}#${life.id}` : null,
      thresholds: counts,
      papers: grounded.map((g) => g.paper.slug),
    };
  });
  return {
    useClass, market: market ?? null,
    spaces: (named.length ? named : spacePages).map(pageRef),
    unknownSpaces, frameworkSections: [...new Set(rows.map((r) => r.section))],
    elements: rows,
    boundary: 'A map of what a strategy for this kind of building looks at, from the general Technical Library. It is not an assessment: it says nothing about the condition, cost or needs of any particular building.',
    corpusVersion,
  };
}

// One section side by side across several library pages: service lives,
// severity grading, what to ask for, misreads. Section thresholds compares the
// measured values, for one market or every market labelled. Each section text
// is capped so a comparison stays inside every assistant's limits; the URL
// leads to the whole of it.
export const COMPARE_TEXT_LIMIT = 3000;
export function compareSections({ pages: refs, section, market }: { pages: string[]; section: string; market?: Market }) {
  const found: TechnicalPage[] = [];
  const unknown: string[] = [];
  for (const r of refs) { const p = getTechnicalPage(r); if (p && !found.includes(p)) found.push(p); else if (!p) unknown.push(r); }
  const items = found.map((p) => {
    if (isThresholdsRef(section)) {
      const view = thresholdsFor(p, market);
      return { slug: p.slug, title: p.title, url: `${p.canonicalUrl}#thresholds`, heading: 'Thresholds by market', text: view ? renderThresholds(p, view) : 'No measured thresholds on this page.', truncated: false };
    }
    const sec = technicalSection(p, section);
    if (!sec) return { slug: p.slug, title: p.title, url: p.canonicalUrl, heading: null, text: `No ${section} section on this page.`, truncated: false };
    const text = sec.markdown.length > COMPARE_TEXT_LIMIT ? `${sec.markdown.slice(0, COMPARE_TEXT_LIMIT).replace(/\s+\S*$/, '')} …` : sec.markdown;
    return { slug: p.slug, title: p.title, url: sec.url, heading: sec.heading, text, truncated: text !== sec.markdown };
  });
  return { section, market: market ?? null, pages: items, unknown, ...(isThresholdsRef(section) ? { policy: thresholdPolicy() } : {}), corpusVersion };
}

// The brief a page at a time, lean by default, as MCP and REST both serve it.
export function buildingBriefPage(args: { useClass: UseClass; spaces?: string[]; market?: Market; frameworkSection?: string }, limit: number, cursor: string | undefined, format: 'concise' | 'detailed') {
  const full = buildingBrief(args);
  const bad = cursorProblem(cursor, full.elements.length);
  if (bad) return { error: bad as string } as const;
  const pg = page(full.elements, limit, cursor);
  const elements = pg.items.map(({ answer, ...rest }) => (format === 'detailed' ? { ...rest, answer } : rest));
  const { elements: _all, ...head } = full;
  return { ...head, count: elements.length, total: full.elements.length, nextCursor: pg.nextCursor, elements };
}

export function renderConnections(c: NonNullable<Connections>): string {
  const out = [`# ${c.from.title}`, c.from.url];
  if (c.restsOn.length) out.push('', '## Rests on (Technical Library)', ...c.restsOn.map((g) => `- ${g.title}${g.section ? ` (${g.section})` : ''}: ${g.why} — ${g.url}`));
  if (c.sharesGroundWith.length) out.push('', '## Papers on the same ground', ...c.sharesGroundWith.map((p) => `- ${p.id} ${p.title} — shares ${p.sharedPages.join(', ')} — ${p.url}`));
  if (c.groundedPapers.length) out.push('', '## Papers grounded in this page', ...c.groundedPapers.map((p) => `- ${p.id} ${p.title}: ${p.why} — ${p.url}`));
  if (c.related.length) out.push('', '## Related pages', ...c.related.map((p) => `- ${p.title} — ${p.url}`));
  if (c.spaces.length) out.push('', '## Spaces', ...c.spaces.map((p) => `- ${p.title} — ${p.url}`));
  if (c.elements.length) out.push('', '## Elements in this space', ...c.elements.map((p) => `- ${p.title} — ${p.url}`));
  if (out.length === 2) out.push('', 'No recorded connections.');
  return out.join('\n');
}

export function renderBrief(b: Exclude<ReturnType<typeof buildingBriefPage>, { readonly error: string }>): string {
  const head = `# Building brief: ${b.useClass}${b.market ? `, ${MARKET_NAMES[b.market]}` : ''}`;
  const lines = [head, `Elements ${b.count} of ${b.total}${b.nextCursor ? ` (more: cursor ${b.nextCursor})` : ''}. Spaces: ${b.spaces.map((s) => s.title).join(', ') || 'none'}.`];
  if (b.unknownSpaces.length) lines.push(`Not recognised as spaces: ${b.unknownSpaces.join(', ')}.`);
  let sec = '';
  for (const e of b.elements) {
    if (e.section !== sec) { sec = e.section; lines.push('', `## ${sec}`); }
    const t = Object.entries(e.thresholds).map(([m, n]) => `${m} ${n}`).join(', ');
    lines.push(`- ${e.title} — ${e.url}${e.serviceLife ? ` · service life ${e.serviceLife}` : ''} · thresholds ${t}${e.papers.length ? ` · papers: ${e.papers.join(', ')}` : ''}`);
  }
  lines.push('', b.boundary);
  return lines.join('\n');
}

export function renderCompare(c: ReturnType<typeof compareSections>): string {
  const out = [`# ${c.section}${c.market ? ` (${MARKET_NAMES[c.market]})` : ''}: side by side`];
  if (c.policy) out.push('', c.policy);
  for (const p of c.pages) out.push('', `## ${p.title}${p.heading ? `: ${p.heading}` : ''}`, p.url, '', p.text);
  if (c.unknown.length) out.push('', `Not found: ${c.unknown.join(', ')}.`);
  return out.join('\n');
}
