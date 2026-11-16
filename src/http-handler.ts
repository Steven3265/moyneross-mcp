import { createMcpHandler, hostHeaderValidationResponse } from '@modelcontextprotocol/server';
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
// The browser surfaces this server is known to be reached from. By default
// this list no longer gates anything: it is the reference set reported by
// allowedOriginHostnames() for diagnostics, and a starting point for an
// operator composing an ALLOWED_ORIGINS restriction.
//
// It is kept as a list rather than deleted because naming the known surfaces
// is useful; it is no longer enforced because enumerating them cannot be kept
// current. The ecosystem adds directories, monitors and inspectors faster than
// any allowlist can follow, and each omission presents as an outage rather
// than a refusal: a monitor that is refused reports the server as down, and a
// directory that is refused records it as unreachable and stops retrying.
const DEFAULT_ALLOWED_ORIGIN_HOSTNAMES = [
  'moyneross.com',
  'www.moyneross.com',
  'mcp.moyneross.com',
  'claude.ai',
  'claude.com',
  'chatgpt.com',
  'chat.openai.com',
  'localhost',
  '127.0.0.1',
  '[::1]',
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

// Origin is validated only when an operator has configured an explicit
// allowlist. Without one, any Origin is admitted.
//
// Origin validation exists to blunt DNS rebinding, where a browser is steered
// into reaching a resource that is private to the victim's network or that
// trusts the browser's ambient credentials. Neither applies here. This
// endpoint is public, read-only, unauthenticated and carries no cookies, no
// session and no customer data; its whole corpus is already published as
// static files and mirrored in a public repository. A browser admitted by
// this function can reach nothing that `curl` could not already reach
// anonymously, so refusing it protects no secret.
//
// It also never protected one. Origin is set by browsers; any non-browser
// client can simply omit the header, and the request is then admitted
// unconditionally. An Origin allowlist is therefore a restriction only on
// callers honest enough to identify themselves, which inverts the intent: the
// well-behaved directory crawler and uptime monitor announce who they are and
// are refused, while an impolite client is waved through.
//
// Host validation is unchanged and still runs ahead of this, binding the
// endpoint to its own hostnames. That is the control that actually answers
// rebinding, and it does not depend on the caller's candour.
function exactOriginValidationResponse(request: Request): Response | undefined {
  const configured = configuredOriginOverride();
  if (configured === undefined) return undefined;

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
// between a listed connector and an unlisted one. The same applies to a client
// that names a revision this server does not know at all.
//
// tools/call is deliberately absent. There, a client that has misread its own
// revision may also misread the result, and a research answer about a real
// building is not worth serving into that uncertainty.
const LENIENT_METHODS = new Set([
  'initialize',
  // The notification that completes the handshake. Harmless, carries no id,
  // and a crawler whose initialize succeeded should not be refused here.
  'notifications/initialized',
  'server/discover',
  'tools/list',
  'resources/list',
  'resources/templates/list',
  'prompts/list',
]);

// Streamable HTTP requires a client to accept both media types. Simple HTTP
// clients and index crawlers frequently send neither, or only one.
const STREAMABLE_HTTP_ACCEPT = 'application/json, text/event-stream';

function acceptsStreamableHttp(request: Request): boolean {
  const accept = request.headers.get('Accept')?.toLowerCase() ?? '';
  return accept.includes('application/json') && accept.includes('text/event-stream');
}

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

// True when the SDK refused the request because the client named a protocol
// revision this server does not know at all (a draft, a future date, a typo),
// as opposed to a known revision whose body disagrees with it.
function isUnsupportedRevision(payload: unknown): boolean {
  if (!payload || typeof payload !== 'object') return false;
  const error = (payload as { error?: unknown }).error;
  if (!error || typeof error !== 'object') return false;

  const { code, message } = error as { code?: unknown; message?: unknown };
  if (code !== -32000 && code !== -32022) return false;
  return typeof message === 'string' && /unsupported protocol version/i.test(message);
}

// The 2026-07-28 revision carries its protocol details in the body, under
// `params._meta` keys prefixed `io.modelcontextprotocol/`. A client that sends
// that envelope while naming an earlier revision in it is refused by the SDK:
// any body carrying the envelope must name 2026-07-28. Removing a version
// header cannot help such a client, because the disputed revision is in the
// body. This returns the body with the envelope keys removed, so the request
// can be served on the stateless compatibility path, or undefined when the
// body carries no envelope to remove.
const REVISION_ENVELOPE_PREFIX = 'io.modelcontextprotocol/';

function withoutRevisionEnvelope(body: string): string | undefined {
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    return undefined;
  }

  let removed = false;
  for (const message of Array.isArray(parsed) ? parsed : [parsed]) {
    if (!message || typeof message !== 'object') continue;
    const params = (message as { params?: unknown }).params;
    if (!params || typeof params !== 'object') continue;
    const meta = (params as { _meta?: unknown })._meta;
    if (!meta || typeof meta !== 'object') continue;

    for (const key of Object.keys(meta)) {
      if (!key.startsWith(REVISION_ENVELOPE_PREFIX)) continue;
      delete (meta as Record<string, unknown>)[key];
      removed = true;
    }
    if (Object.keys(meta).length === 0) delete (params as { _meta?: unknown })._meta;
  }
  return removed ? JSON.stringify(parsed) : undefined;
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

type Refusal = { code?: number; reason?: string; declared?: string };

// Why a request was refused, for the log line. The JSON-RPC error code and a
// clipped message are enough to tell one cause from another, and the revision
// the client declared is the usual culprit. Nothing else from the request is
// recorded: no body, no other header, no identifier.
async function refusalDetail(response: Response, request: Request): Promise<Refusal | undefined> {
  if (response.status < 400) return undefined;
  const clean = (value: string, max: number) => value.replace(/[^\x20-\x7E]/g, ' ').slice(0, max);
  const detail: Refusal = {};
  const declared = request.headers.get('MCP-Protocol-Version')?.trim();
  if (declared) detail.declared = clean(declared, 40);
  try {
    const payload = (await response.clone().json()) as { error?: { code?: unknown; message?: unknown } };
    if (typeof payload?.error?.code === 'number') detail.code = payload.error.code;
    if (typeof payload?.error?.message === 'string') detail.reason = clean(payload.error.message, 160);
  } catch {
    // A refusal without a JSON body still gets logged with its status.
  }
  return detail;
}

// One line per request. The level follows the outcome, because hosted log
// viewers colour by level: a served request is routine (stdout), a request the
// server refused is a warning, and only a fault of the server's own is an
// error. This handler never runs under stdio, so stdout is free to use.
function logRequest(methods: string[], client: string, endpoint: string, status: number, durationMs: number, refusal?: Refusal): void {
  try {
    const line = JSON.stringify({ evt: 'mcp_request', methods, client, endpoint, status, durationMs, ...(refusal ? { refusal } : {}), at: new Date().toISOString() });
    if (status >= 500) console.error(line);
    else if (status >= 400) console.warn(line);
    else console.log(line);
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
  // Host validation defends the bare fetch endpoint against DNS-rebinding-style
  // requests and applies to every caller. Origin is additionally validated only
  // when ALLOWED_ORIGINS or a concrete legacy ALLOWED_ORIGIN is configured; by
  // default any Origin is admitted, because this endpoint is public, read-only
  // and unauthenticated. See exactOriginValidationResponse.
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

  // The body is buffered only when the request carries something that may need
  // correcting — a named protocol revision, or an Accept header that does not
  // meet streamable HTTP. A conformant client's request still goes straight to
  // the SDK without the handler touching its body.
  const declaresRevision = Boolean(request.headers.get('MCP-Protocol-Version')?.trim());
  const bufferedBody =
    declaresRevision || !acceptsStreamableHttp(request) ? await request.text() : undefined;
  const dispatch = (headers?: Headers, body?: string): Promise<Response> =>
    mcpHandler.fetch(
      bufferedBody === undefined
        ? request
        : new Request(request.url, {
            method: request.method,
            headers: headers ?? request.headers,
            body: body ?? bufferedBody,
          }),
    );

  try {
    let result = await runWithClient(client, () => dispatch(), handOver);

    // Corrections for read-only discovery calls, applied one at a time and
    // only after the request has actually been refused, so a client is never
    // adjusted for a fault it did not have. A request can carry more than one
    // fault, and fixing one reveals the next, so this re-reads the outcome
    // after each correction; three passes covers an incomplete Accept, a
    // disputed revision header and a disputed revision envelope together.
    if (bufferedBody !== undefined && lenientMethodNames(bufferedBody)) {
      const corrected = new Headers(request.headers);
      let correctedBody = bufferedBody;

      for (let pass = 0; pass < 3; pass += 1) {
        const accept = corrected.get('Accept')?.toLowerCase() ?? '';
        const acceptIncomplete =
          !accept.includes('application/json') || !accept.includes('text/event-stream');

        if (result.status === 406 && acceptIncomplete) {
          corrected.set('Accept', STREAMABLE_HTTP_ACCEPT);
        } else if (result.status === 400) {
          // The client named a revision that is disputed (header and body
          // disagree) or that this server will not serve the request under (an
          // unknown revision, or an earlier revision named in a 2026-07-28
          // body envelope). The answer to a discovery call is the same either
          // way, so serve it on the SDK's stateless compatibility path: first
          // without the revision header, then, if the body still names the
          // revision, without the body envelope. A monitor that declared
          // 2025-06-18 inside the envelope was refused on every check and
          // served only when it retried without it.
          const payload = await result.clone().json().catch(() => undefined);
          if (!isEnvelopeMismatch(payload) && !isUnsupportedRevision(payload)) break;

          if (corrected.has('MCP-Protocol-Version')) {
            corrected.delete('MCP-Protocol-Version');
          } else {
            const stripped = withoutRevisionEnvelope(correctedBody);
            if (stripped === undefined) break;
            correctedBody = stripped;
          }
        } else {
          break;
        }

        result = await runWithClient(client, () => dispatch(corrected, correctedBody), handOver);
      }
    }

    const refusal = await refusalDetail(result, request);
    const response = withCommonHeaders(result, request);
    logRequest(methods, client, endpoint, response.status, Date.now() - started, refusal);
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
