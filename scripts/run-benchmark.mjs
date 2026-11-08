import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

// Two retrieval benchmarks against the connector's own snapshot and ranking:
//   data/benchmark.json             the website's public benchmark (56 allocator
//                                   questions): every one in the top three and strong
//   data/benchmark-paraphrase.json  24 questions in practitioners' shorthand
//                                   (capex, dilaps, MEES, LL97, TDD): at least 23 in
//                                   the top three and 21 strong
//   data/benchmark-technical.json   26 building-element questions: every one in the
//                                   top three with scope technical, at least 24
//                                   unscoped, and at least 25 strong
const compile = spawnSync('npx', ['tsc', '-p', 'tsconfig.core.json'], { stdio: 'inherit', shell: process.platform === 'win32' });
if (compile.status !== 0) process.exit(compile.status ?? 1);
const { searchResearch, matchStrength } = await import('../.core-dist/src/core.js');

function run(file, scope) {
  const set = JSON.parse(readFileSync(new URL(`../data/${file}`, import.meta.url), 'utf8'));
  let top3 = 0, top1 = 0, strong = 0, rr = 0;
  const misses = [];
  for (const c of set) {
    const want = Array.isArray(c.expected) ? c.expected : [c.expected];
    const r = searchResearch({ query: c.query, limit: 10, ...(scope ? { scope } : {}) });
    const rank = r.findIndex((x) => want.includes(x.url));
    if (rank === 0) top1++;
    if (rank >= 0) rr += 1 / (rank + 1);
    if (rank >= 0 && rank < 3) top3++; else misses.push(`${c.query}\n    expected ${want.join(' or ')}\n    got ${r.slice(0, 3).map((x) => x.url).join(' | ')}`);
    if (matchStrength(c.query, r.slice(0, 5)) === 'strong') strong++;
  }
  return { n: set.length, top3, top1, strong, mrr: rr / set.length, misses };
}

const main = run('benchmark.json');
const para = run('benchmark-paraphrase.json');
const techOpen = run('benchmark-technical.json');
const techScoped = run('benchmark-technical.json', 'technical');
for (const [label, x] of [['Benchmark', main], ['Paraphrase', para], ['Technical Library, unscoped', techOpen], ['Technical Library, scope technical', techScoped]]) {
  console.log(`${label}: ${x.top3}/${x.n} in the top 3 (${x.top1} first, MRR ${x.mrr.toFixed(3)}), ${x.strong}/${x.n} judged strong.`);
  if (x.misses.length) console.log('  Misses:\n  ' + x.misses.join('\n  '));
}
const ok = main.top3 === main.n && main.strong === main.n && para.top3 >= 23 && para.strong >= 21 && techScoped.top3 === techScoped.n && techOpen.top3 >= 24 && techScoped.strong >= 25;
process.exit(ok ? 0 : 1);
