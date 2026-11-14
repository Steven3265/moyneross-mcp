// Snapshot the public Moyne Ross corpus from moyneross.com into data/corpus.json.
//
// moyneross.com is a build-time content source only: the deployed connector
// never calls back to the website, the portal or any client system. Every
// file read here is public and is produced by the website's own publishing
// script (scripts/build_publication.py in the website repository):
//
//   /insights/export.json        the 49 Capital Made Physical papers, full text
//   /insights/search-index.json  the ranking corpus, built exactly as the public
//                                retrieval benchmark builds it
//   /llms.txt                    "Working with Moyne Ross" and the FAQs
//   /methodology/*, /samples/*   the methodology pages and the sample strategy
//   /technical/export.json       the Technical Library: one page per element and
//                                functional space of the Building Check
//                                Framework, built by scripts/build_technical.py
//   /sitemap.xml, /technical/sitemap.xml   last-changed dates (the snapshot's date)
//
// Deterministic: the snapshot's date comes from the content (the latest
// sitemap lastmod), never from the clock, so re-running without content
// changes writes an identical file.
//
//   node scripts/snapshot.mjs            write data/corpus.json
//   node scripts/snapshot.mjs --check    exit 1 if the live corpus differs

import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { contentArea, htmlToMarkdown } from './html-to-markdown.mjs';

const SITE = process.env.MOYNEROSS_SITE || 'https://moyneross.com';
// Where the files are read from, when that is not the live site: a local
// build of the website repository served for a release candidate, e.g.
//   MOYNEROSS_FETCH_FROM=http://127.0.0.1:8765 node scripts/snapshot.mjs
// Canonical URLs in the snapshot stay on SITE either way.
const FETCH_FROM = process.env.MOYNEROSS_FETCH_FROM || SITE;
const OUT = new URL('../data/corpus.json', import.meta.url);

async function get(path, kind = 'text') {
  const res = await fetch(FETCH_FROM + path, { headers: { 'User-Agent': 'moyneross-mcp-snapshot/1.0 (+https://github.com/Steven3265/moyneross-mcp)' } });
  if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`);
  return kind === 'json' ? res.json() : res.text();
}

// The readable content of a page as markdown: headings, lists, links and real
// tables (see html-to-markdown.mjs), from after the navigation to the footer,
// so a page's opening header is kept along with its <main> content.
function pageMarkdown(html, url) {
  return htmlToMarkdown(contentArea(html), url, { dropLinks: [/^https:\/\/moyneross\.com\/contact(?:[?#].*)?$/] });
}

// The anchor a heading gets on moyneross.com: the website assigns heading ids
// with this same rule (see the website's scripts), so a citation can point to
// the exact section, e.g. https://moyneross.com/insights/after-rent#where-the-value-goes
export function anchorFor(text) {
  return String(text).normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/&/g, ' and ').replace(/['’]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

function sectionsOf(markdown, url) {
  const used = new Map();
  return [...String(markdown).matchAll(/^## (.+)$/gm)].map((m) => {
    const heading = m[1].trim();
    let anchor = anchorFor(heading) || 'section';
    const n = (used.get(anchor) ?? 0) + 1; used.set(anchor, n);
    if (n > 1) anchor = `${anchor}-${n}`;
    return { heading, anchor, url: `${url}#${anchor}` };
  });
}

function section(text, start, end) {
  const i = text.indexOf(start);
  if (i < 0) throw new Error(`llms.txt: "${start}" not found`);
  const j = end ? text.indexOf(end, i + start.length) : -1;
  return text.slice(i, j > i ? j : undefined).trim();
}

export async function buildSnapshot() {
  const [exp, index, llms, sitemap, register, mrIndex, sample, tech, techSitemap] = await Promise.all([
    get('/insights/export.json', 'json'),
    get('/insights/search-index.json', 'json'),
    get('/llms.txt'),
    get('/sitemap.xml'),
    get('/methodology/capital-register'),
    get('/methodology/mr-index'),
    get('/samples/capital-strategy'),
    get('/technical/export.json', 'json'),
    get('/technical/sitemap.xml'),
  ]);

  const lastmods = [...`${sitemap}${techSitemap}`.matchAll(/<lastmod>([^<]+)<\/lastmod>/g)].map((m) => m[1].trim()).sort();

  // The Technical Library. Section anchors on moyneross.com are section ids
  // (#severity, #misreads), so a citation reaches the exact part. A page on the
  // topic layout lists the other addresses inside each section, including the
  // earlier ones it keeps alive (#diagnosis), so those still resolve.
  const technical = (tech.pages || []).map((t) => ({
    slug: t.slug,
    pageType: t.pageType || 'element',
    title: t.title,
    question: t.question,
    answer: t.answer,
    limitations: t.limitations || '',
    frameworkElement: t.frameworkElement,
    frameworkDescription: t.frameworkDescription || '',
    section: t.section,
    subsection: t.subsection,
    useClasses: t.useClasses || [],
    jurisdiction: t.jurisdiction || [],
    typologies: t.typologies || [],
    spaces: t.spaces || [],
    spaceElements: t.spaceElements || [],
    subSpaces: t.subSpaces || [],
    related: t.related || [],
    publishedAt: t.publishedAt || null,
    updatedAt: t.updatedAt || t.publishedAt || null,
    reviewedAt: t.reviewedAt || null,
    reviewDue: t.reviewDue || null,
    wordCount: Number(t.wordCount) || null,
    sources: (t.sources || []).map((x) => ({ title: x.title, publisher: x.publisher || '', url: x.url })),
    canonicalUrl: t.canonicalUrl,
    resourceUri: `moyneross://technical/${t.slug}`,
    layout: t.layout || 'eleven',
    // How people name the element, the page's search title and its authored
    // questions (each answered on the page, to the section): retrieval reads
    // them, so a question asked in the reader's own words finds the page.
    searchTitle: t.searchTitle || '',
    alsoKnownAs: t.alsoKnownAs || [],
    questions: (t.questions || []).map((x) => ({ question: x.question, answer: x.answer || '', url: x.url || t.canonicalUrl })),
    sections: (t.sections || []).map((x) => ({ id: x.id, heading: x.heading, url: `${t.canonicalUrl}#${x.id}`, markdown: x.markdown, ...(x.anchors?.length ? { anchors: x.anchors } : {}) })),
    // Values by market: each applies only in its own market. The shared
    // sections above carry no market's numbers.
    thresholds: (t.thresholds || []).map((x) => ({
      id: x.id, market: x.market, measure: x.measure, rule: x.rule, ...(x.clause ? { clause: x.clause } : {}),
      basis: x.basis || 'primary', appliesTo: x.appliesTo || [],
      source: { title: x.sourceRef?.title || '', publisher: x.sourceRef?.publisher || '', url: x.sourceRef?.url || '' },
    })),
    marketsWithoutThresholds: t.marketsWithoutThresholds || [],
  }));
  const fw = tech.framework || {};
  const papers = (exp.articles || []).map((a) => ({
    id: a.id,
    slug: a.slug,
    title: a.title,
    question: a.question,
    answer: a.answer,
    summary: a.summary,
    limitations: a.limitations || '',
    part: a.part ? { number: String(a.part.number), title: String(a.part.title), position: Number(a.part.position) || null } : null,
    publicationType: a.publicationType || '',
    evidenceType: a.evidenceType || '',
    jurisdiction: a.jurisdiction || [],
    topics: a.topics || [],
    datePublished: a.datePublished,
    dateModified: a.dateModified,
    reviewedAt: a.reviewedAt || null,
    reviewDue: a.reviewDue || null,
    wordCount: Number(a.wordCount) || null,
    canonicalUrl: a.canonicalUrl,
    resourceUri: `moyneross://papers/${a.slug}`,
    sections: sectionsOf(a.contentMarkdown, a.canonicalUrl),
    // The library pages the paper rests on (the website builds these from
    // insights/articles.json, the same list the papers' own "technical ground"
    // panels and the library's back-links come from).
    technicalPages: (a.technicalPages || []).map((g) => ({ slug: g.slug, section: g.section || null, url: g.url, why: g.why || '' })),
    contentMarkdown: a.contentMarkdown,
  })).sort((x, y) => x.id.localeCompare(y.id, 'en', { numeric: true }));

  const generatedAt = lastmods[lastmods.length - 1] || null;
  const fingerprint = createHash('sha256').update(JSON.stringify({ exp: exp.articles, index: index.docs, llms, register, mrIndex, sample, tech: tech.pages, fw })).digest('hex').slice(0, 8);

  return {
    schemaVersion: 3,
    // A citable version of the corpus: its date and a fingerprint of its content.
    corpusVersion: `${generatedAt}.${fingerprint}`,
    generatedAt,
    source: SITE,
    publication: { name: 'Capital Made Physical', url: `${SITE}/insights`, thesis: exp.publication?.thesis || exp.publication?.description || '' },
    papers,
    methods: [
      { id: 'capital-register', title: 'The Capital Register', url: `${SITE}/methodology/capital-register`, summary: 'The line-by-line capital document behind every Capital Strategy: condition, action, timing, cost, impact and confidence on every row, with the cost basis behind every figure.', text: pageMarkdown(register, `${SITE}/methodology/capital-register`) },
      { id: 'mr-index', title: 'The MR Index', url: `${SITE}/methodology/mr-index`, summary: 'The decision layer: how much attention a building needs and how soon, read element by element and placed on a band from MR 1 to MR 5. No costs take part; it is calculated from the register, not guessed by a model.', text: pageMarkdown(mrIndex, `${SITE}/methodology/mr-index`) },
    ],
    sample: { title: 'Sample Capital Strategy: industrial warehouse and office', url: `${SITE}/samples/capital-strategy`, interactiveUrl: `${SITE}/samples/strategy`, text: pageMarkdown(sample, `${SITE}/samples/capital-strategy`) },
    engagement: { url: `${SITE}/assistants`, text: section(llms, '## Working with Moyne Ross', '## Homechecker') },
    technical: {
      name: 'Moyne Ross Technical Library',
      url: `${SITE}/technical`,
      framework: { name: fw.name || 'Moyne Ross Building Check Framework', sections: fw.sections || [], pageTypes: fw.pageTypes || {}, severityScale: fw.severityScale || {}, ...(fw.topicLayout ? { topicLayout: fw.topicLayout } : {}), ...(fw.thresholdPolicy ? { thresholdPolicy: fw.thresholdPolicy } : {}) },
      pages: technical,
    },
    // The website's search index as published. The Technical Library pages
    // join it at load time (src/core.ts), weighted as the benchmark weights a
    // paper, so their text is not stored twice.
    search: { note: index.note || '', docs: index.docs.map((d) => ({ url: d.url, id: d.id || '', title: d.title, kind: d.kind, blurb: d.blurb, text: d.text })) },
  };
}

async function main() {
  const snap = await buildSnapshot();
  const next = JSON.stringify(snap, null, 1) + '\n';
  if (process.argv.includes('--check')) {
    const current = await readFile(OUT, 'utf8').catch(() => '');
    if (current !== next) { console.error('data/corpus.json differs from the live corpus. Run: node scripts/snapshot.mjs'); process.exit(1); }
    console.log('data/corpus.json matches the live corpus.');
    return;
  }
  await writeFile(OUT, next);
  console.log(`Wrote data/corpus.json: ${snap.papers.length} papers, ${snap.technical.pages.length} Technical Library pages, ${snap.search.docs.length} search documents, ${snap.methods.length} methods, generated ${snap.generatedAt}.`);
}

if (import.meta.url === `file://${process.argv[1]}`) main().catch((e) => { console.error(e); process.exit(1); });
