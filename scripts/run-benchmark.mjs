import { spawnSync } from 'node:child_process';
import { evaluate, report } from './retrieval-gate.mjs';

// Runs the retrieval gate (data/retrieval-cases.json plus the website's public
// benchmark in data/benchmark.json) against the connector's own snapshot and
// ranking, prints every category and exits non-zero if any gate fails. The same
// evaluation fits the ranking (npm run calibrate) and runs in the core tests.
const compile = spawnSync('npx', ['tsc', '-p', 'tsconfig.core.json'], { stdio: 'inherit', shell: process.platform === 'win32' });
if (compile.status !== 0) process.exit(compile.status ?? 1);
const core = await import('../.core-dist/src/core.js');

const result = evaluate(core);
console.log(report(result));
process.exit(result.ok ? 0 : 1);
