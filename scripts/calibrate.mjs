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
// Exits non-zero, with the grid printed, if no setting clears the retrieval
// gate. That means the corpus has moved further than tuning can absorb and
// wants a look.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const core = await import(join(root, '.core-dist/src/core.js'));
const { evaluate, loadCases } = await import(join(root, 'scripts/retrieval-gate.mjs'));

// The same gate npm run benchmark and the core tests apply (data/retrieval-
// cases.json), so a setting chosen here is one the checks will accept.
const CASES = loadCases();

// Margin above the bars, so a setting sitting on a plateau is preferred to one
// perched on a peak: the plateau survives the next enrichment batch.
function score(weight, boost) {
  core.__setWeight(weight);
  core.__setBoost(boost);
  const r = evaluate(core, CASES);
  if (!r.ok) return { ok: false, name: r.results.find((x) => !x.pass)?.category ?? 'gate' };
  return { ok: true, margin: r.margin, total: r.hits };
}

const weights = [];
for (let w = 0.3; w <= 1.2001; w += 0.025) weights.push(Math.round(w * 1000) / 1000);
const boosts = [];
for (let b = 0; b <= 1.2001; b += 0.1) boosts.push(Math.round(b * 100) / 100);

const passing = [];
for (const b of boosts) for (const w of weights) {
  const r = score(w, b);
  if (r.ok) passing.push({ w, b, margin: r.margin, total: r.total });
}

if (!passing.length) {
  console.error('calibrate: no setting clears the retrieval gate.\n');
  for (const b of boosts) {
    const row = weights.filter((_, i) => i % 4 === 0).map((w) => {
      const r = score(w, b);
      return (r.ok ? 'pass' : `${r.name.slice(0, 5)}`).padStart(7);
    }).join('');
    console.error(`  boost ${b.toFixed(1)} ${row}`);
  }
  console.error('\nThe corpus has moved further than tuning can absorb. Look at the');
  console.error('failures (npm run benchmark) before changing a gate.');
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

console.log(`calibrate: ${passing.length} of ${weights.length * boosts.length} settings clear the retrieval gate.`);
console.log(`  chosen  libraryWeight ${best.w}  headlineBoost ${best.b}`);
console.log(`  it sits ${neighbours(best)} of 8 neighbours inside the passing region, with ${best.total} gated hits.`);
if (next !== current) console.log('  src/ranking.ts updated — commit it.');
else console.log('  src/ranking.ts already correct.');
