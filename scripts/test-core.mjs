import { rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

// Compile the portable core on its own (no DOM or Node types) and test it.
rmSync('.core-dist', { recursive: true, force: true });
const compile = spawnSync('npx', ['tsc', '-p', 'tsconfig.core.json'], { stdio: 'inherit', shell: process.platform === 'win32' });
if (compile.status !== 0) process.exit(compile.status ?? 1);
const tests = spawnSync(process.execPath, ['--test', 'test/core.test.mjs'], { stdio: 'inherit' });
process.exit(tests.status ?? 1);
