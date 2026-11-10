// The one retrieval evaluation. npm run benchmark prints it, npm run calibrate
// fits the ranking to it, and the core tests fail on it, so the three can never
// disagree about what the connector is held to.
//
// Cases live in data/retrieval-cases.json, each with a category; the gates
// block there says how each category is judged. The website's own public
// benchmark stays in data/benchmark.json and is read as the "website" category.
//
// Rules:
//   every    each case meets its own expectation (in the first `within`
//            results, and strong if the case or the gate says so; weak cases
//            must return something and not be strong; empty cases nothing)
//   count    at least minHit cases found within `within`, at least minStrong strong
//   ratchet  at most maxStrong cases judged strong (off-topic questions);
//            lower it as the ranking improves, never raise it
//   report   measured and printed, never fails the run
import { readFileSync } from 'node:fs';

const load = (f) => JSON.parse(readFileSync(new URL(`../data/${f}`, import.meta.url), 'utf8'));

export function loadCases() {
  const file = load('retrieval-cases.json');
  const website = load('benchmark.json').map((c, i) => ({ id: `website:${i + 1}`, category: 'website', query: c.query, expected: [].concat(c.expected) }));
  return { gates: file.gates, cases: [...website, ...file.cases] };
}

// core: the compiled core module (searchResearch, matchStrength).
export function evaluate(core, { gates, cases } = loadCases()) {
  const byCat = new Map();
  for (const c of cases) {
    const gate = gates[c.category];
    if (!gate) throw new Error(`retrieval case ${c.id}: no gate for category "${c.category}"`);
    const found = core.searchResearch({ query: c.query, limit: 10, ...(c.scope ? { scope: c.scope } : {}) });
    const strength = core.matchStrength(c.query, found.slice(0, 5));
    const rank = c.expected ? found.findIndex((r) => c.expected.includes(r.url)) : -1;
    const within = c.within ?? gate.within ?? 3;
    const hit = rank >= 0 && rank < within;
    const wantStrong = c.strong ?? gate.strong;

    let ok = true, why = '';
    if (c.category === 'outside') { ok = strength !== 'strong'; why = `judged strong on ${found[0]?.url.replace('https://moyneross.com', '')}`; }
    else if (c.category === 'weak') { ok = found.length > 0 && strength !== 'strong'; why = found.length ? 'judged strong' : 'returned nothing'; }
    else if (c.category === 'empty') { ok = found.length === 0; why = `returned ${found.length}`; }
    else if (c.expected) {
      if (!hit) { ok = false; why = `expected in the first ${within}, got ${found.slice(0, 3).map((r) => r.url.replace('https://moyneross.com', '')).join(' | ') || 'nothing'}`; }
      else if (wantStrong === true && strength !== 'strong') { ok = false; why = `found, but judged ${strength}`; }
    }

    const s = byCat.get(c.category) ?? { n: 0, hit: 0, first: 0, rr: 0, strong: 0, failures: [] };
    s.n++;
    if (hit) s.hit++;
    if (rank === 0) s.first++;
    if (rank >= 0) s.rr += 1 / (rank + 1);
    if (strength === 'strong') s.strong++;
    if (!ok) s.failures.push({ id: c.id, query: c.query, why });
    byCat.set(c.category, s);
  }

  const results = [];
  let ok = true, margin = 0, hits = 0;
  for (const [category, gate] of Object.entries(gates)) {
    const s = byCat.get(category);
    if (!s) continue;
    let pass = true, verdict = '';
    if (gate.rule === 'every') { pass = s.failures.length === 0; verdict = pass ? 'every case met' : `${s.failures.length} case(s) missed`; }
    else if (gate.rule === 'count') {
      pass = s.hit >= (gate.minHit ?? 0) && s.strong >= (gate.minStrong ?? 0);
      verdict = `needs ${gate.minHit ?? 0} found${gate.minStrong ? `, ${gate.minStrong} strong` : ''}`;
      margin += (s.hit - (gate.minHit ?? 0)) + (gate.minStrong ? s.strong - gate.minStrong : 0);
    } else if (gate.rule === 'ratchet') {
      pass = s.strong <= gate.maxStrong;
      verdict = `at most ${gate.maxStrong} strong (target ${gate.target ?? 0})`;
      margin += gate.maxStrong - s.strong;
    } else verdict = 'reported';
    if (category !== 'outside' && category !== 'weak' && category !== 'empty' && gate.rule !== 'report') hits += s.hit;
    if (!pass) ok = false;
    results.push({ category, rule: gate.rule, pass, verdict, n: s.n, hit: s.hit, first: s.first, mrr: s.n ? s.rr / s.n : 0, strong: s.strong, failures: s.failures });
  }
  return { ok, margin, hits, results };
}

export function report({ ok, results }) {
  const lines = [];
  for (const r of results) {
    const mark = r.rule === 'report' ? '  ··' : r.pass ? 'PASS' : 'FAIL';
    const neg = r.category === 'outside' || r.category === 'weak' || r.category === 'empty';
    const body = neg
      ? `${r.n} questions, ${r.strong} judged strong`
      : `${r.hit}/${r.n} found (${r.first} first, MRR ${r.mrr.toFixed(3)}), ${r.strong}/${r.n} strong`;
    lines.push(`${mark}  ${r.category.padEnd(13)} ${body}  [${r.verdict}]`);
    const show = r.rule === 'report' && r.n > 20 ? [] : r.failures;
    for (const f of show.slice(0, 20)) lines.push(`        ${f.query}\n          ${f.why}`);
  }
  lines.push(ok ? '\nRetrieval gate passed.' : '\nRetrieval gate failed.');
  return lines.join('\n');
}
