import { AsyncLocalStorage } from 'node:async_hooks';

// Coarse, privacy-minimised client family for usage telemetry. Only a short
// label is ever logged, never the raw User-Agent string, which can carry
// version and platform detail useful for fingerprinting.
const CLIENT_PATTERNS: Array<[RegExp, string]> = [
  // The Moyne Ross portal's Technical Library calibration, counted apart from
  // assistants' use of the connector.
  [/moyneross-portal/, 'moyneross-portal'],
  [/claude|anthropic/, 'claude'],
  [/openai|chatgpt/, 'chatgpt'],
  [/cursor/, 'cursor'],
  [/windsurf|codeium/, 'windsurf'],
  [/vscode|visual studio code|copilot/, 'vscode'],
  [/gemini|google/, 'google'],
  [/perplexity/, 'perplexity'],
  [/mistral|le chat/, 'mistral'],
  [/inspector/, 'mcp-inspector'],
  [/python|httpx|aiohttp/, 'python'],
  [/curl/, 'curl'],
  [/node|undici|axios/, 'node'],
  [/mozilla/, 'browser'],
];

export function clientLabel(userAgent?: string | null): string {
  const ua = (userAgent ?? '').trim().toLowerCase();
  if (!ua) return 'unknown';
  for (const [pattern, label] of CLIENT_PATTERNS) {
    if (pattern.test(ua)) return label;
  }
  return 'other';
}

// Carries the label from the HTTP boundary to tool-level telemetry without
// passing request objects into the MCP server. Absent under stdio.
//
// handOver says whether the Start your strategy hand-over (the
// start_strategy_link tool and its note) is offered. It is false on the
// OpenAI endpoint (/mcp/openai) and for ChatGPT traffic on /mcp, because
// OpenAI's app directory does not allow apps to promote paid services.
// Everywhere else, including stdio and the REST layer, it defaults to true.
const requestContext = new AsyncLocalStorage<{ client: string; handOver: boolean }>();

export function runWithClient<T>(client: string, fn: () => T, handOver = true): T {
  return requestContext.run({ client, handOver }, fn);
}

export function currentClient(): string | undefined {
  return requestContext.getStore()?.client;
}

export function handOverEnabled(): boolean {
  return requestContext.getStore()?.handOver ?? true;
}
