import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  citationFor, corpusVersion, coverage, formatCitation, getMethod, getPaper, listPapers, matchDetail, matchStrength, methodView, page,
  paperSection, papers, paperSummary, queryTerms, renderPaper, sample, searchResearch, snapshot, startStrategyLink, suggestedQueries,
  tokens, STRONG_MIN_COVERAGE, TECHNICAL_KIND, formatTechnicalCitation, getTechnicalPage, listTechnicalPages, renderTechnicalPage,
  severityScale, technicalCandidates, technicalCitationFor, technicalLibrary, technicalMarkdown, technicalPages, technicalSection, technicalSectionName, technicalSummary,
} from '../.core-dist/src/core.js';
import * as core from '../.core-dist/src/core.js';
import { evaluate, report } from '../scripts/retrieval-gate.mjs';

const bench = JSON.parse(readFileSync(new URL('../data/benchmark.json', import.meta.url), 'utf8'));

test('tokenizer matches the website benchmark: stop words, short words, stemming, 10-year', () => {
  assert.deepEqual(tokens('What is the 10-year plan for buildings?'), ['ten', 'year', 'plan', 'building']);
  // The stemmer only trims words longer than five letters, exactly as the
  // Python benchmark does (verified against it, quirks included).
  assert.deepEqual(tokens('roofing roofs'), ['roof', 'roofs']);
  assert.deepEqual(tokens('Deferred maintenance, leases and make-good'), ['deferr', 'maintenance', 'leas', 'make', 'good']);
  assert.deepEqual(tokens('a I x'), []);
});

test('retrieval gate: every category in data/retrieval-cases.json meets its gate', () => {
  // The website's benchmark, practitioner shorthand, building elements (scoped
  // and unscoped), the rankings other tests pin, weak, empty and off-topic
  // questions: one evaluation, shared with npm run benchmark and npm run calibrate.
  const result = evaluate(core);
  assert.ok(result.ok, report(result));
});

test('practitioner shorthand expands, at reduced weight, without displacing exact wording', () => {
  const t = queryTerms('dilaps and capex');
  assert.ok(t.find((x) => x.term === 'dilap')?.alternatives.includes('dilapidation'));
  assert.ok(t.find((x) => x.term === 'capex')?.alternatives.includes('expenditure'));
  assert.equal(searchResearch({ query: 'deferred maintenance', limit: 1 })[0].url, 'https://moyneross.com/insights/deferred-maintenance-is-debt');
});

test('match detail reports weighted coverage and the matched and missing words', () => {
  const d = matchDetail('cheap pizza near the deferred maintenance', 'https://moyneross.com/insights/deferred-maintenance-is-debt');
  assert.ok(d.matchedTerms.includes('deferr') && d.missingTerms.includes('pizza'));
  assert.ok(d.coverage > 0 && d.coverage < 1 && d.headlineCoverage <= 1);
});

test('a weak match suggests questions the corpus does answer', () => {
  const s = suggestedQueries(searchResearch({ query: 'how much is a house in sydney', limit: 3 }));
  assert.ok(s.length > 0 && s.every((q) => q.endsWith('?')));
});

test('scope narrows results to research, methodology or the sample', () => {
  assert.ok(searchResearch({ query: 'capital register cost basis', scope: 'methodology' }).every((r) => r.kind === 'Methodology'));
  assert.ok(searchResearch({ query: 'warehouse roof register', scope: 'sample' }).every((r) => r.kind === 'Sample'));
  assert.ok(searchResearch({ query: 'roof', scope: 'research' }).every((r) => r.slug && r.url.includes('/insights/')));
  assert.ok(searchResearch({ query: 'roof membrane leaks', scope: 'technical' }).every((r) => r.kind === TECHNICAL_KIND && r.url.includes('/technical/')));
});

test('ranking is deterministic and limited', () => {
  const a = searchResearch({ query: 'energy and leases', limit: 10 });
  const b = searchResearch({ query: 'energy and leases', limit: 10 });
  assert.deepEqual(a, b);
  assert.equal(searchResearch({ query: 'building', limit: 50 }).length, 10);
  assert.deepEqual(searchResearch({ query: 'the of and' }), []);
});

test('a paper resolves by slug, CMP number in any form, or canonical URL', () => {
  for (const ref of ['timing-is-not-risk', 'CMP 024', 'cmp024', 'cmp 24', '24', 'https://moyneross.com/insights/timing-is-not-risk', 'https://moyneross.com/insights/timing-is-not-risk/', 'https://moyneross.com/insights/timing-is-not-risk?utm_source=x']) {
    assert.equal(getPaper(ref)?.slug, 'timing-is-not-risk', ref);
  }
  assert.equal(getPaper('no-such-paper'), undefined);
  assert.equal(getPaper(''), undefined);
});

test('papers list in reading order and filter by part', () => {
  const all = listPapers();
  assert.equal(all.length, papers.length);
  const parts = all.map((p) => p.part?.number).filter(Boolean);
  const order = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII'];
  assert.deepEqual([...parts].sort((x, y) => order.indexOf(x) - order.indexOf(y)), parts);
  assert.ok(listPapers({ part: 'vi' }).every((p) => p.part.number === 'VI'));
  assert.equal(listPapers({ limit: 3 }).length, 3);
});

test('a paper summary omits the full text; renderings carry the canonical URL and limitations', () => {
  const p = getPaper('CMP 024');
  assert.equal('contentMarkdown' in paperSummary(p), false);
  const full = renderPaper(p, 'full');
  assert.match(full, /https:\/\/moyneross\.com\/insights\/timing-is-not-risk/);
  assert.match(full, /Limitations:/);
  assert.ok(renderPaper(p, 'summary').length < full.length);
});

test('methods are the Capital Register and the MR Index', () => {
  assert.equal(getMethod('capital-register')?.url, 'https://moyneross.com/methodology/capital-register');
  assert.match(getMethod('mr-index')?.text ?? '', /MR 1/);
  assert.equal(getMethod('valuation'), undefined);
});

test('the hand-over link encodes safely, keeps only valid choices and attributes the source', () => {
  const link = startStrategyLink({ building: '1 Poultry, London EC2R 8EJ', organisation: 'Smith & Co <b>', role: 'astronaut', type: 'office', note: '' }, 'https://moyneross.com/contact', 'moyneross-mcp');
  assert.equal(link, 'https://moyneross.com/contact?building=1%20Poultry%2C%20London%20EC2R%208EJ&organisation=Smith%20%26%20Co%20%3Cb%3E&type=office&utm_source=moyneross-mcp');
  const long = startStrategyLink({ building: 'x'.repeat(900) }, 'https://moyneross.com/contact', 's');
  assert.ok(long.includes('building=' + 'x'.repeat(400) + '&'));
});

test('the snapshot is dated from its content, not the clock', () => {
  assert.match(snapshot.generatedAt, /^\d{4}-\d{2}-\d{2}$/);
});

test('papers carry anchored sections, and a section can be fetched alone', () => {
  const p = getPaper('after-rent');
  assert.ok(p.sections.length >= 4);
  assert.ok(p.sections.every((s) => s.url === `${p.canonicalUrl}#${s.anchor}` && /^[a-z0-9-]+$/.test(s.anchor)));
  const sec = paperSection(p, 'second income');
  assert.equal(sec.url, 'https://moyneross.com/insights/after-rent#a-second-income-line');
  assert.ok(sec.text.startsWith('## A second income line') && !sec.text.includes('\n## ', 5));
  assert.equal(paperSection(p, 'helipad'), undefined);
});

test('citations are exact and consistent across styles, to the paper or a section', () => {
  const p = getPaper('CMP 004');
  const c = citationFor(p);
  assert.equal(c.url, p.canonicalUrl);
  assert.equal(c.corpusVersion, corpusVersion);
  assert.match(corpusVersion, /^\d{4}-\d{2}-\d{2}\.[0-9a-f]{8}$/);
  const s = citationFor(p, 'a-second-income-line');
  assert.equal(s.section.heading, 'A second income line');
  for (const style of ['bibtex', 'ris', 'apa', 'harvard']) assert.ok(formatCitation(p, style, 'second income').includes(s.url), style);
  const csl = JSON.parse(formatCitation(p, 'csl-json'));
  assert.equal(csl.URL, p.canonicalUrl);
  assert.deepEqual(csl.issued['date-parts'][0], p.datePublished.split('-').map(Number));
  assert.match(formatCitation(p, 'bibtex'), /^@misc\{moyneross2026afterrent,/);
});

test('method views: a short summary by default, the full page, or one section', () => {
  const m = getMethod('mr-index');
  const sum = methodView(m, 'summary');
  assert.ok(sum.text.length < 3000 && sum.sections.length > 0);
  assert.equal(methodView(m, 'full').text, m.text);
  const one = methodView(m, 'summary', sum.sections[0]);
  assert.ok(one.text.startsWith(`## ${sum.sections[0]}`));
  assert.match(methodView(m, 'summary', 'helipad').text, /No section/);
});

test('the sample register: an overview by default, one section on request', () => {
  const o = sample('register');
  assert.match(o.text, /\| Section \| Ten years \| Lines \|/);
  assert.ok(o.text.length < 3000);
  assert.match(sample('register', 'roofs').text, /^### Roofs/m);
});

test('paging walks the whole list without overlap', () => {
  const all = listPapers();
  const seen = [];
  let cursor;
  do { const pg = page(all, 15, cursor); seen.push(...pg.items.map((p) => p.slug)); cursor = pg.nextCursor ?? undefined; } while (cursor);
  assert.deepEqual(seen, all.map((p) => p.slug));
});


// ─── Technical Library ───────────────────────────────────────────────────

test('the website ranking is untouched: a paper, method or sample scores the same with or without the library', () => {
  // Website documents are scored on the website's own statistics, so adding the
  // library cannot change their scores, and so cannot reorder them.
  for (const c of bench) {
    for (const scope of ['research', 'methodology', 'sample']) {
      const scoped = searchResearch({ query: c.query, scope, limit: 10 });
      const open = new Map(searchResearch({ query: c.query, limit: 10 }).map((r) => [r.url, r.score]));
      for (const r of scoped) if (open.has(r.url)) assert.equal(open.get(r.url), r.score, `${c.query}: ${r.url}`);
    }
  }
});

test('a library result names the section that answers, and the page\'s own names and questions find it', () => {
  // "tin roof" is one of the names people use for roof coverings (alsoKnownAs).
  const tin = searchResearch({ query: 'tin roof leaking', scope: 'technical', limit: 3 });
  assert.equal(tin[0].url, 'https://moyneross.com/technical/roof-coverings');
  assert.match(tin[0].section?.url ?? '', /^https:\/\/moyneross\.com\/technical\/roof-coverings#[a-z0-9-]+$/);
  // An authored question finds its own page, and its section.
  const faq = technicalPages.find((p) => p.slug === 'roof-coverings')?.questions?.[0];
  assert.ok(faq, 'roof coverings carries authored questions');
  assert.equal(searchResearch({ query: faq.question, limit: 1 })[0].url, 'https://moyneross.com/technical/roof-coverings');
  // Papers carry no section field: they are ranked exactly as the website ranks them.
  assert.equal(searchResearch({ query: 'deferred maintenance', limit: 1 })[0].section, undefined);
});

test('a leaking tap at home is a Technical Library question', () => {
  // Off-topic until 1.1.0; the library now covers wet areas and water supply.
  assert.equal(searchResearch({ query: 'how to fix a leaking tap at home' })[0].kind, TECHNICAL_KIND);
});

test('a library page resolves by slug, element name, title or URL, and near misses offer candidates', () => {
  assert.equal(getTechnicalPage('masonry-brickwork')?.slug, 'masonry-brickwork');
  assert.equal(getTechnicalPage('Masonry/Brickwork')?.slug, 'masonry-brickwork');
  assert.equal(getTechnicalPage('roof coverings')?.slug, 'roof-coverings');
  assert.equal(getTechnicalPage('https://moyneross.com/technical/roof-coverings#severity')?.slug, 'roof-coverings');
  assert.equal(getTechnicalPage('Façades'), undefined);
  assert.equal(getTechnicalPage(''), undefined);
  assert.ok(technicalCandidates('lift').length > 1);
});

test('the library lists in framework order and filters by section and page type', () => {
  const all = listTechnicalPages();
  assert.equal(all.length, technicalPages.length);
  assert.equal(all[0].section, 'Substructure');
  assert.equal(all[all.length - 1].section, 'Environmental');
  assert.equal(technicalSectionName('facades'), 'Façades');
  assert.equal(technicalSectionName('fire'), 'Fire Services');
  assert.ok(listTechnicalPages({ section: 'roofs' }).every((p) => p.section === 'Roofs & Rainwater Goods'));
  assert.ok(listTechnicalPages({ pageType: 'space' }).every((p) => p.pageType === 'space'));
  assert.deepEqual(listTechnicalPages({ section: 'no such section' }), []);
});

// These hold on either layout, so converting a page to the topic layout needs
// no change here.
test('a library page: summary without text, sections by id or heading, full text, severity scale', () => {
  const p = getTechnicalPage('masonry-brickwork');
  const sum = technicalSummary(p);
  assert.ok(sum.sections.every((x) => !('markdown' in x)));
  if (p.layout === 'topic') {
    const fixed = technicalLibrary.framework.topicLayout.fixed.map((f) => f.id);
    assert.ok(fixed.every((id) => p.sections.some((x) => x.id === id)));
  } else assert.equal(sum.sections.length, 11);
  assert.equal(technicalSection(p, 'severity')?.url, 'https://moyneross.com/technical/masonry-brickwork#severity');
  assert.equal(technicalSection(p, 'How serious it is')?.id, 'severity');
  assert.equal(technicalSection(p, 'no such section'), undefined);
  assert.ok(technicalMarkdown(p).startsWith(`## ${p.sections[0].heading}`));
  assert.ok(renderTechnicalPage(p, 'summary').includes(p.canonicalUrl) && renderTechnicalPage(p, 'summary').includes('Limitations:'));
  assert.deepEqual(severityScale().situations.map((x) => x.id), ['safety', 'failure', 'condition', 'lifecycle', 'deadline', 'check', 'nil']);
});

test('library citations are exact in every style, to the page or a section', () => {
  const p = getTechnicalPage('roof-coverings');
  const sec = technicalSection(p, 'diagnosis');
  assert.ok(sec, 'an earlier address still resolves');
  const c = technicalCitationFor(p, 'diagnosis');
  assert.equal(c.url, sec.url);
  assert.ok(c.url.startsWith('https://moyneross.com/technical/roof-coverings#'));
  assert.equal(c.publication, 'Moyne Ross Technical Library');
  assert.equal(c.corpusVersion, corpusVersion);
  for (const style of ['bibtex', 'ris', 'csl-json', 'apa', 'harvard']) {
    const f = formatTechnicalCitation(p, style, 'diagnosis');
    assert.ok(f.includes(sec.url.replace('https://moyneross.com/technical/', '')) && f.includes('Technical Library') && !f.includes('Capital Made Physical'), style);
  }
  assert.ok(formatCitation(papers[0], 'harvard').includes('Capital Made Physical'));
});

test('on a topic-layout page, every address inside a section resolves to that section', () => {
  const topic = technicalPages.filter((p) => p.layout === 'topic');
  for (const p of topic) {
    for (const x of p.sections) for (const a of x.anchors ?? []) assert.equal(technicalSection(p, a)?.id, x.id, `${p.slug}#${a}`);
    assert.equal(technicalSection(p, `${p.canonicalUrl}#severity`)?.id, 'severity');
  }
  if (topic.length) assert.ok(technicalLibrary.framework.topicLayout.fixed.length >= 5);
});
