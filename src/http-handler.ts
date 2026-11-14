import {
  createMcpHandler,
  hostHeaderValidationResponse,
  originValidationResponse,
} from '@modelcontextprotocol/server';
import { createMcpServer } from './server.js';
import { clientLabel, runWithClient } from './client-label.js';

const mcpHandler = createMcpHandler(createMcpServer, {
  // Serve the 2026-07-28 stateless protocol while retaining the SDK's
  // stateless compatibility path for 2025-era clients during rollout.
  legacy: 'stateless',
});

const ALLOWED_HEADERS = [
  'Content-Type',
  'Accept',
  'Authorization',
  'MCP-Protocol-Version',
  'Mcp-Method',
  'Mcp-Name',
  'Mcp-Session-Id',
  'Last-Event-ID',
].join(', ');

const EXPOSED_HEADERS = [
  'MCP-Protocol-Version',
  'Mcp-Method',
  'Mcp-Name',
  'Mcp-Session-Id',
].join(', ');

const DEFAULT_ALLOWED_HOSTNAMES = ['mcp.moyneross.com'];
const DEFAULT_ALLOWED_ORIGIN_HOSTNAMES = [
  'moyneross.com',
  'www.moyneross.com',
  'mcp.moyneross.com',
  'claude.ai',
  'claude.com',
  'chatgpt.com',
  'chat.openai.com',
  // The official MCP Inspector web UI runs on loopback and may connect to a
  // deployed remote server from the browser. These origins carry no customer
  // credentials here; the MCP endpoint is public and read-only.
  'localhost',
  '127.0.0.1',
  '[::1]',
  // Public MCP directories run browser-based inspectors and playgrounds that
  // connect to a listed server from the visitor's own browser. A CORS
  // preflight from these origins is how a directory establishes that a server
  // is reachable and enumerable; rejecting it leaves the listing permanently
  // "not tested", with no try-it path for anyone evaluating the connector.
  //
  // Admitting them costs nothing here: this endpoint is public, read-only,
  // unauthenticated and carries no customer data, so a browser request from
  // these origins can reach nothing a plain fetch could not already reach.
  // Host validation above still binds the endpoint to its own hostnames, and
  // ALLOWED_ORIGINS continues to override this list exactly when set.
  'glama.ai',
  'www.glama.ai',
  'smithery.ai',
  'www.smithery.ai',
  'mcp.so',
  'www.mcp.so',
  'pulsemcp.com',
  'www.pulsemcp.com',
  'modelcontextprotocol.io',
  'inspector.modelcontextprotocol.io',
  'registry.modelcontextprotocol.io',
];
const LOCAL_HOSTNAMES = ['localhost', '127.0.0.1', '[::1]', 'test.local'];

function hostnameFromConfig(value: string): string | undefined {
  const trimmed = value.trim();
  if (!trimmed || trimmed === '*') return undefined;
  try {
    return new URL(trimmed.includes('://') ? trimmed : `https://${trimmed}`).hostname;
  } catch {
    return undefined;
  }
}

function configuredHostnames(...names: string[]): string[] {
  const values = names
    .flatMap((name) => (process.env[name] ?? '').split(','))
    .map(hostnameFromConfig)
    .filter((value): value is string => Boolean(value));
  return [...new Set(values)];
}

export function allowedHostnames(): string[] {
  const local = process.env.VERCEL ? [] : LOCAL_HOSTNAMES;
  return [...new Set([
    ...DEFAULT_ALLOWED_HOSTNAMES,
    ...configuredHostnames(
      'VERCEL_URL',
      'VERCEL_BRANCH_URL',
      'VERCEL_PROJECT_PRODUCTION_URL',
      'ALLOWED_HOSTS',
    ),
    ...local,
  ])];
}

function originFromConfig(value: string): string | undefined {
  const trimmed = value.trim();
  if (!trimmed || trimmed === '*') return undefined;
  try {
    const url = new URL(trimmed.includes('://') ? trimmed : `https://${trimmed}`);
    if (!/^https?:$/.test(url.protocol)) return undefined;
    return url.origin;
  } catch {
    return undefined;
  }
}

function configuredOrigins(...names: string[]): string[] {
  const values = names
    .flatMap((name) => (process.env[name] ?? '').split(','))
    .map(originFromConfig)
    .filter((value): value is string => Boolean(value));
  return [...new Set(values)];
}

function configuredOriginOverride(): string[] | undefined {
  // ALLOWED_ORIGINS is authoritative and exact. Scheme and effective port are
  // part of an Origin, so `https://trusted.example:8443` does not implicitly
  // permit http://trusted.example:8443 or https://trusted.example:443.
  // An invalid non-empty value fails closed with an empty allowlist.
  if ((process.env.ALLOWED_ORIGINS ?? '').trim()) {
    return configuredOrigins('ALLOWED_ORIGINS');
  }

  // Preserve the old singular ALLOWED_ORIGIN restriction when operators
  // already have it configured. The historical wildcard means "use the safe
  // defaults"; it never disables Origin validation.
  const legacy = (process.env.ALLOWED_ORIGIN ?? '').trim();
  if (legacy && legacy !== '*') {
    return configuredOrigins('ALLOWED_ORIGIN');
  }
  return undefined;
}

export function allowedOrigins(): string[] | undefined {
  const configured = configuredOriginOverride();
  return configured === undefined ? undefined : [...configured];
}

export function allowedOriginHostnames(): string[] {
  const configured = configuredOriginOverride();
  if (configured !== undefined) {
    return [...new Set(configured.map((origin) => new URL(origin).hostname))];
  }

  return [...new Set([
    ...DEFAULT_ALLOWED_ORIGIN_HOSTNAMES,
    ...(process.env.VERCEL ? [] : ['test.local']),
  ])];
}

function originForbiddenResponse(message: string): Response {
  return new Response(
    JSON.stringify({
      jsonrpc: '2.0',
      id: null,
      error: { code: -32000, message },
    }),
    {
      status: 403,
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
    },
  );
}

function exactOriginValidationResponse(request: Request): Response | undefined {
  const configured = configuredOriginOverride();
  if (configured === undefined) return originValidationResponse(request, allowedOriginHostnames());

  const rawOrigin = request.headers.get('Origin')?.trim();
  if (!rawOrigin) return undefined;

  let origin: string;
  try {
    const parsed = new URL(rawOrigin);
    if (!/^https?:$/.test(parsed.protocol)) throw new Error('unsupported origin scheme');
    origin = parsed.origin;
  } catch {
    return originForbiddenResponse('Forbidden: invalid Origin');
  }

  return configured.includes(origin)
    ? undefined
    : originForbiddenResponse('Forbidden: Origin not allowed');
}

function corsHeaders(request?: Request): Headers {
  const headers = new Headers();
  const origin = request?.headers.get('Origin')?.trim();
  headers.set('Access-Control-Allow-Origin', origin || '*');
  headers.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  headers.set('Access-Control-Allow-Headers', ALLOWED_HEADERS);
  headers.set('Access-Control-Expose-Headers', EXPOSED_HEADERS);
  headers.set('Vary', 'Origin');
  headers.set('Cache-Control', 'no-store');
  headers.set('X-Content-Type-Options', 'nosniff');
  return headers;
}

function withCommonHeaders(response: Response, request?: Request): Response {
  const headers = new Headers(response.headers);
  for (const [name, value] of corsHeaders(request)) headers.set(name, value);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function withSecurityHeaders(response: Response): Response {
  const headers = new Headers(response.headers);
  headers.set('Cache-Control', 'no-store');
  headers.set('X-Content-Type-Options', 'nosniff');
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function validateRequestBoundary(request: Request): Response | undefined {
  const rejected =
    hostHeaderValidationResponse(request, allowedHostnames()) ??
    exactOriginValidationResponse(request);

  // Do not reflect an untrusted Origin back in CORS headers on a rejected
  // request. The guard response remains deliberately minimal.
  return rejected ? withSecurityHeaders(rejected) : undefined;
}

function rpcMethods(request: Request): string[] {
  // Modern MCP clients advertise the routed JSON-RPC method in the
  // Mcp-Method header. Read telemetry from that header only so observability
  // never clones, parses or otherwise touches the protocol request body.
  // Legacy clients may therefore produce an empty methods array, which is
  // preferable to increasing the request path's blast radius for logging.
  const method = request.headers.get('Mcp-Method')?.trim();
  return method ? [method] : [];
}

// Discovery and handshake methods only. A client that names a protocol
// revision in MCP-Protocol-Version but sends a body shaped for an earlier one
// is rejected by the SDK's envelope check, which is correct: the two disagree.
// For these read-only methods the answer shape is stable across revisions, so
// the disagreement costs nothing and the request is retried on the legacy
// stateless path rather than refused. Public directories and index crawlers
// routinely mis-declare this way, and a refused tools/list is the difference
// between a listed connector and an unlisted one.
//
// tools/call is deliberately absent. There, a client that has misread its own
// revision may also misread the result, and a research answer about a real
// building is not worth serving into that uncertainty.
const LENIENT_METHODS = new Set([
  'initialize',
  'server/discover',
  'tools/list',
  'resources/list',
  'resources/templates/list',
  'prompts/list',
]);

// True when the SDK refused the request because the named revision and the
// body's envelope disagree, rather than for any other bad-request reason.
function isEnvelopeMismatch(payload: unknown): boolean {
  if (!payload || typeof payload !== 'object') return false;
  const error = (payload as { error?: unknown }).error;
  if (!error || typeof error !== 'object') return false;

  const { code, data, message } = error as { code?: unknown; data?: unknown; message?: unknown };
  if (code !== -32602 && code !== -32020) return false;
  if (data && typeof data === 'object' && 'envelope' in (data as object)) return true;
  return typeof message === 'string' && /envelope|headers and body disagree/i.test(message);
}

// The request's JSON-RPC method names, but only when every message in it is
// one of the lenient methods. A batch mixing a tool call into a discovery
// batch is not retried.
function lenientMethodNames(body: string): string[] | undefined {
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    return undefined;
  }

  const messages = Array.isArray(parsed) ? parsed : [parsed];
  if (messages.length === 0) return undefined;

  const names = messages.map((message) =>
    message && typeof message === 'object' ? (message as { method?: unknown }).method : undefined,
  );
  if (names.some((name) => typeof name !== 'string' || !LENIENT_METHODS.has(name))) return undefined;
  return names as string[];
}

function logRequest(methods: string[], client: string, endpoint: string, status: number, durationMs: number): void {
  try {
    console.error(JSON.stringify({ evt: 'mcp_request', methods, client, endpoint, status, durationMs, at: new Date().toISOString() }));
  } catch {
    // Never let telemetry interfere with protocol handling.
  }
}

export type McpEndpointOptions = {
  // 'openai' serves the OpenAI directory listing at /mcp/openai: the same
  // corpus and answers, without the Start your strategy hand-over.
  endpoint?: 'standard' | 'openai';
};

export async function handleMcpRequest(request: Request, options: McpEndpointOptions = {}): Promise<Response> {
  const endpoint = options.endpoint ?? 'standard';
  // MCP 2026-07-28 requires Origin validation when an Origin header is present.
  // Host validation is applied alongside it to defend the bare fetch endpoint
  // against DNS-rebinding-style requests. Non-browser clients normally omit
  // Origin and therefore continue to pass this boundary unchanged.
  const rejected = validateRequestBoundary(request);
  if (rejected) return rejected;

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders(request) });
  }

  if (request.method !== 'POST') {
    const headers = corsHeaders(request);
    headers.set('Allow', 'POST, OPTIONS');
    headers.set('Content-Type', 'application/json; charset=utf-8');
    return new Response(
      JSON.stringify({
        error: 'Method not allowed',
        message: 'This stateless MCP endpoint accepts POST requests. Use an MCP client rather than opening it as a webpage.',
      }),
      { status: 405, headers },
    );
  }

  const started = Date.now();
  const methods = rpcMethods(request);
  const client = clientLabel(request.headers.get('User-Agent'));
  // OpenAI's app directory does not allow promoting paid services, so the
  // hand-over is left out on the OpenAI endpoint and for ChatGPT on /mcp.
  const handOver = endpoint !== 'openai' && client !== 'chatgpt';

  // The body is buffered only when the client names a protocol revision, so
  // the ordinary request path still hands the original request straight to the
  // SDK without the handler touching its body.
  const declaresRevision = Boolean(request.headers.get('MCP-Protocol-Version')?.trim());
  const bufferedBody = declaresRevision ? await request.text() : undefined;
  const dispatch = (headers?: Headers): Promise<Response> =>
    mcpHandler.fetch(
      bufferedBody === undefined
        ? request
        : new Request(request.url, {
            method: request.method,
            headers: headers ?? request.headers,
            body: bufferedBody,
          }),
    );

  try {
    let result = await runWithClient(client, () => dispatch(), handOver);

    if (bufferedBody !== undefined && result.status === 400) {
      const lenient = lenientMethodNames(bufferedBody);
      if (lenient) {
        const refusal = await result
          .clone()
          .json()
          .catch(() => undefined);
        if (isEnvelopeMismatch(refusal)) {
          // Drop the disputed revision header and let the SDK's stateless
          // compatibility path serve the discovery call.
          const legacyHeaders = new Headers(request.headers);
          legacyHeaders.delete('MCP-Protocol-Version');
          result = await runWithClient(client, () => dispatch(legacyHeaders), handOver);
        }
      }
    }

    const response = withCommonHeaders(result, request);
    logRequest(methods, client, endpoint, response.status, Date.now() - started);
    return response;
  } catch (error) {
    logRequest(methods, client, endpoint, 500, Date.now() - started);
    console.error('[moyneross-mcp] request failed', error);
    const headers = corsHeaders(request);
    headers.set('Content-Type', 'application/json; charset=utf-8');
    return new Response(
      JSON.stringify({
        jsonrpc: '2.0',
        id: null,
        error: { code: -32603, message: 'Internal MCP server error.' },
      }),
      { status: 500, headers },
    );
  }
}
