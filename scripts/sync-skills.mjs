import { copyFile, mkdir, readFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// skills/ is canonical. Copies are served from the connector (public/skills,
// at mcp.moyneross.com/skills/...) and packaged for OpenAI. The OpenAI package
// carries only the research skill: the hand-over skill promotes a paid
// service, which OpenAI's directory does not allow.
//   node scripts/sync-skills.mjs          copy
//   node scripts/sync-skills.mjs --check  fail if any copy has drifted
export const COPIES = {
  'commercial-capital-research': ['public/skills', 'distribution/openai/moyneross/skills'],
  'capital-strategy-handover': ['public/skills'],
};

const check = process.argv.includes('--check');
let drift = 0;
for (const [name, targets] of Object.entries(COPIES)) {
  const source = new URL(`../skills/${name}/SKILL.md`, import.meta.url);
  const text = await readFile(source, 'utf8');
  for (const dir of targets) {
    const target = new URL(`../${dir}/${name}/SKILL.md`, import.meta.url);
    if (check) {
      const copy = await readFile(target, 'utf8').catch(() => null);
      if (copy !== text) { console.error(`${dir}/${name}/SKILL.md differs from skills/${name}/SKILL.md. Run: node scripts/sync-skills.mjs`); drift++; }
    } else {
      await mkdir(dirname(fileURLToPath(target)), { recursive: true });
      await copyFile(source, target);
    }
  }
}
if (drift) process.exit(1);
console.log(check ? 'Skill copies match the canonical skills.' : `Synced ${Object.keys(COPIES).length} canonical skills to their public and OpenAI copies.`);
