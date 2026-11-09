#!/usr/bin/env node
// Fit the ranking settings to the benchmarks and write src/ranking.ts.
//
// Two numbers decide how library pages rank against the website's documents,
// and both depend on the shape of the corpus. Enriching the library changes
// that shape: longer pages carry more words, so each word is less distinctive
// inside the library, so every library score drifts against an unchanged
// website. Hand-set numbers go stale after every batch, which is what this
// replaces.
//
// Run after the corpus changes: `npm run calibrate`. The snapshot refresh
// workflow runs it, so an enrichment batch recalibrates itself.
//
// Exits non-zero, with the grid printed, if no setting clears every bar. That
// means the corpus has moved further than tuning can absorb and wants a look.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const core = await import(join(root, '.core-dist/src/core.js'));
const load = (f) => JSON.parse(readFileSync(join(root, 'data', f), 'utf8'));

const SETS = {
  website: { set: load('benchmark.json'), top: 56, strong: 56 },
  paraphrase: { set: load('benchmark-paraphrase.json'), top: 23, strong: 22 },
  elements: { set: load('benchmark-technical.json'), top: 24, strong: 0 },
  elementsScoped: { set: load('benchmark-technical.json'), scope: 'technical', top: 26, strong: 25 },
};

function measure({ set, scope }) {
  let top = 0, strong = 0;
  for (const q of set) {
    const want = [].concat(q.expected);
    const opts = scope ? { scope } : {};
    if (core.searchResearch({ query: q.query, limit: 3, ...opts }).some((r) => want.includes(r.url))) top++;
    if (core.matchStrength(q.query, core.searchResearch({ query: q.query, limit: 5, ...opts })) === 'strong') strong++;
  }
  return { top, strong };
}

// Margin above the bars, so a setting sitting on a plateau is preferred to one
// perched on a peak: the plateau survives the next enrichment batch.
function score(weight, boost) {
  core.__setWeight(weight);
  core.__setBoost(boost);
  let margin = 0, total = 0;
  for (const [name, spec] of Object.entries(SETS)) {
    const got = measure(spec);
    if (got.top < spec.top || got.strong < spec.strong) return { ok: false, name, got, spec };
    margin += (got.top - spec.top) + (got.strong - spec.strong);
    total += got.top;
  }
  return { ok: true, margin, total };
}

const weights = [];
for (let w = 0.5; w <= 1.4001; w += 0.025) weights.push(Math.round(w * 1000) / 1000);
const boosts = [];
for (let b = 0; b <= 1.2001; b += 0.1) boosts.push(Math.round(b * 100) / 100);

const passing = [];
for (const b of boosts) for (const w of weights) {
  const r = score(w, b);
  if (r.ok) passing.push({ w, b, margin: r.margin, total: r.total });
}

if (!passing.length) {
  console.error('calibrate: no setting clears every benchmark bar.\n');
  for (const b of boosts) {
    const row = weights.filter((_, i) => i % 4 === 0).map((w) => {
      const r = score(w, b);
      return (r.ok ? 'pass' : `${r.name.slice(0, 4)}`).padStart(6);
    }).join('');
    console.error(`  boost ${b.toFixed(1)} ${row}`);
  }
  console.error('\nThe corpus has moved further than tuning can absorb. Look at the');
  console.error('benchmark misses before changing the bars.');
  process.exit(1);
}

// Choose on quality first, but never perch on an isolated peak: a setting
// with no neighbours inside the passing region is one the next enrichment
// batch will knock off. Prefer the best-scoring setting that has company.
const key = (p) => `${p.b.toFixed(2)}|${p.w.toFixed(3)}`;
const set = new Set(passing.map(key));
const wStep = 0.025, bStep = 0.1;
const neighbours = (p) => [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [1, 1], [-1, 1], [1, -1]]
  .filter(([dw, db]) => set.has(`${(p.b + db * bStep).toFixed(2)}|${(p.w + dw * wStep).toFixed(3)}`)).length;
const MIN_NEIGHBOURS = 3;
const steady = passing.filter((p) => neighbours(p) >= MIN_NEIGHBOURS);
const pool = steady.length ? steady : passing;
pool.sort((a, b) => b.total - a.total || neighbours(b) - neighbours(a) || b.margin - a.margin || a.w - b.w);
const best = pool[0];
if (!steady.length) console.warn('calibrate: every passing setting is isolated; the fit may not survive the next batch.');

const current = readFileSync(join(root, 'src/ranking.ts'), 'utf8');
const next = current
  .replace(/libraryWeight: [0-9.]+,/, `libraryWeight: ${best.w},`)
  .replace(/headlineBoost: [0-9.]+,/, `headlineBoost: ${best.b},`);
writeFileSync(join(root, 'src/ranking.ts'), next);

console.log(`calibrate: ${passing.length} of ${weights.length * boosts.length} settings clear every bar.`);
console.log(`  chosen  libraryWeight ${best.w}  headlineBoost ${best.b}`);
console.log(`  it sits ${neighbours(best)} of 8 neighbours inside the passing region, with ${best.total} top-three hits.`);
if (next !== current) console.log('  src/ranking.ts updated — commit it.');
else console.log('  src/ranking.ts already correct.');
