# Security model

## A deliberately small surface

The server is public and unauthenticated because every operation is read-only and the content is already published on moyneross.com. It has:

- no environment secrets required for normal operation;
- no database client and no mutable state;
- no outbound HTTP requests at runtime (the snapshot is taken from public moyneross.com files at build or CI time only);
- no filesystem path supplied by users;
- no client, account or portal identifiers, and no route to the Moyne Ross portal;
- no upload handling, no payment capability and no model call.

`start_strategy_link` builds a link from the details given and returns it. It stores nothing and sends nothing; the person opens the form and sends it themselves.

## HTTP request boundary

The Streamable HTTP entry applies the MCP TypeScript SDK's `Host` validation before any protocol request is handled. `Origin` is validated only when an operator configures an allowlist.

- Production Host is `mcp.moyneross.com`; Vercel's generated deployment, branch alias and production alias hosts are accepted when Vercel exposes them, plus optional comma-separated `ALLOWED_HOSTS`.
- By default any `Origin` is admitted. The endpoint is public, read-only and unauthenticated and carries no cookies, session or client data, so a browser request can reach nothing an anonymous request could not. An Origin allowlist also restricts only callers that declare an Origin: directories and uptime monitors do and were refused, while a client that omits the header always passed.
- Host validation is the control that answers DNS-rebinding-style requests. It applies to every request and does not depend on the Origin header.
- `ALLOWED_ORIGINS` is an exact-origin allowlist for an operator who wants one (scheme and port preserved, no defaults silently added). When it is set, a malformed or unlisted Origin is rejected with `403` before MCP handling, without echoing it in CORS headers. A concrete legacy `ALLOWED_ORIGIN` keeps its exact single-origin restriction.

## Content pipeline

`scripts/snapshot.mjs` rebuilds `data/corpus.json` from public files on moyneross.com. The repository holds no credentials for the website, the portal or any private system. CI installs locked dependencies with `npm ci --ignore-scripts` and runs the full check before a refreshed snapshot can be merged. Snapshot validation rejects secret-like strings and the sample strategy's real identifiers.

## Telemetry

Each tool call writes one JSON line (`evt: "tool_call"`): tool name, query length, scope, counts, match strength, a coarse client family and a timestamp. Questions, addresses, names, emails and IP addresses are not logged by the application. Logging can never affect a response.

Each HTTP request to the MCP endpoint also writes one line (`evt: "mcp_request"`) with the method named in the routing header, the client family, the status and the duration. When a request is refused, the line adds the JSON-RPC error code, a clipped error message and the protocol revision the client declared, so the cause of a refusal can be identified; no request body or other header is recorded.

The log level follows the outcome. Over HTTP, served requests and tool calls are written to stdout, refused requests (4xx) as warnings and server faults (5xx) as errors, so a hosted log viewer shows an error only when something is wrong. Under the local stdio transport all telemetry stays on stderr, because stdout is the protocol channel. See https://moyneross.com/privacy#connector.

## Input and contract controls

- Tool arguments are validated by Zod against `src/contracts.ts`; enumerated fields reject unknown values.
- Free text in the hand-over is truncated and URL-encoded.
- Every tool is annotated read-only, idempotent, non-destructive and closed-world.

## Reporting

Report a security issue through https://moyneross.com/contact (see `/.well-known/security.txt`).
