import { readFileSync, existsSync } from 'node:fs';

// Every place that states the identity or version must agree, so the
// registry, the plugin packages and the running server never disagree.
const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const json = (p) => JSON.parse(read(p));
const errors = [];
const eq = (label, actual, expected) => { if (actual !== expected) errors.push(`${label}: ${JSON.stringify(actual)} (expected ${JSON.stringify(expected)})`); };

const pkg = json('package.json');
const lock = json('package-lock.json');
const server = json('server.json');
const identity = read('src/identity.ts');
const id = (name) => identity.match(new RegExp(`export const ${name} = '([^']*)'`))?.[1];
const version = pkg.version;

eq('package-lock version', lock.version, version);
eq('package-lock root version', lock.packages?.['']?.version, version);
eq('server.json version', server.version, version);
eq('identity SERVER_VERSION', id('SERVER_VERSION'), version);
for (const p of ['plugin.json', '.claude-plugin/plugin.json', 'gemini-extension.json']) eq(`${p} version`, json(p).version, version);
eq('marketplace plugin version', json('.claude-plugin/marketplace.json').plugins?.[0]?.version, version);
eq('Copilot marketplace version', json('.github/plugin/marketplace.json').metadata?.version, version);
eq('Copilot plugin version', json('.github/plugin/marketplace.json').plugins?.[0]?.version, version);
eq('OpenAI package version', json('distribution/openai/moyneross/.codex-plugin/plugin.json').version, version);
eq('OpenAI package endpoint', json('distribution/openai/moyneross/.codex-plugin/plugin.json').mcpServers?.moyneross?.url, id('SERVER_OPENAI_ENDPOINT_URL'));
const sec = read('public/.well-known/security.txt');
const expires = Date.parse(sec.match(/^Expires: (.+)$/m)?.[1] ?? '');
if (!(expires > Date.now() + 30 * 86400000)) errors.push('public/.well-known/security.txt expires within 30 days; renew it');
if (!existsSync(new URL('../data/TERMS.md', import.meta.url))) errors.push('data/TERMS.md is missing');

eq('registry name', server.name, id('SERVER_REGISTRY_NAME'));
eq('registry title', server.title, id('SERVER_TITLE'));
eq('registry description', server.description, id('SERVER_DESCRIPTION'));
eq('package description', pkg.description, id('SERVER_DESCRIPTION'));
eq('registry website', server.websiteUrl, id('SERVER_WEBSITE_URL'));
eq('registry remote', server.remotes?.[0]?.url, id('SERVER_ENDPOINT_URL'));
eq('registry icon', server.icons?.[0]?.src, id('SERVER_ICON_URL'));
if ((server.description ?? '').length > 100) errors.push(`registry description is ${server.description.length} characters; the limit is 100`);
for (const p of ['mcp.json', '.mcp.json']) eq(`${p} url`, json(p).mcpServers?.moyneross?.url, id('SERVER_ENDPOINT_URL'));
eq('gemini url', json('gemini-extension.json').mcpServers?.moyneross?.httpUrl, id('SERVER_ENDPOINT_URL'));
const icon = id('SERVER_ICON_URL')?.split('/').pop();
if (!icon || !existsSync(new URL(`../public/${icon}`, import.meta.url))) errors.push(`public/${icon} is missing`);
// Agent Skills specification (agentskills.io): name 1-64 characters of
// lowercase letters, digits and hyphens, matching its folder; description
// 1-1024 characters saying what the skill does and when to use it; body
// under 500 lines.
for (const s of ['commercial-capital-research', 'capital-strategy-handover']) {
  const md = read(`skills/${s}/SKILL.md`);
  const fm = md.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!fm) { errors.push(`skills/${s}/SKILL.md must start with YAML front matter`); continue; }
  const name = fm[1].match(/^name: (.+)$/m)?.[1]?.trim();
  const description = fm[1].match(/^description: (.+)$/m)?.[1]?.trim() ?? '';
  if (name !== s) errors.push(`skills/${s}: name must be "${s}" (its folder)`);
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(name ?? '') || (name ?? '').length > 64) errors.push(`skills/${s}: name breaks the Agent Skills rules`);
  if (!description || description.length > 1024) errors.push(`skills/${s}: description must be 1-1024 characters`);
  if (fm[2].split('\n').length > 500) errors.push(`skills/${s}: body over 500 lines`);
  for (const k of fm[1].split('\n').map((l) => l.split(':')[0])) if (!['name', 'description', 'license', 'compatibility', 'metadata', 'allowed-tools'].includes(k)) errors.push(`skills/${s}: unknown front matter key "${k}"`);
}
// Agent Plugins 1.0.0: $schema and name required; mcp.json holds only $schema
// and mcpServers, with streamable-http transports.
const plugin = json('plugin.json');
if (plugin.$schema !== 'https://agent-plugins.org/schemas/1.0.0/plugin.schema.json' || plugin.name !== 'moyneross') errors.push('plugin.json: $schema and name are required (Agent Plugins 1.0.0)');
const mcpj = json('mcp.json');
if (Object.keys(mcpj).sort().join() !== '$schema,mcpServers' || mcpj.mcpServers?.moyneross?.type !== 'streamable-http') errors.push('mcp.json must hold only $schema and mcpServers, with a streamable-http server');
if (!read('CHANGELOG.md').includes(`## ${version}`)) errors.push(`CHANGELOG.md has no entry for ${version}`);

if (errors.length) { console.error(`Release metadata is inconsistent (${errors.length}):\n- ${errors.join('\n- ')}`); process.exit(1); }
console.log(`Release metadata consistent: ${server.name} ${version}.`);
