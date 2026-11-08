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

The Streamable HTTP entry applies the MCP TypeScript SDK's `Host` and `Origin` validation before any protocol request is handled.

- Production Host is `mcp.moyneross.com`; Vercel's generated deployment, branch alias and production alias hosts are accepted when Vercel exposes them, plus optional comma-separated `ALLOWED_HOSTS`.
- Browser Origins for moyneross.com, current Claude surfaces, ChatGPT and loopback MCP Inspector use are allowed by default.
- `ALLOWED_ORIGINS` is an exact-origin override (scheme and port preserved, no defaults silently added). A malformed or unapproved Origin is rejected with `403` before MCP handling, without echoing it in CORS headers. Wildcard Origins are not supported.
- Requests without an Origin header (ordinary non-browser MCP clients) pass.

## Content pipeline

`scripts/snapshot.mjs` rebuilds `data/corpus.json` from public files on moyneross.com. The repository holds no credentials for the website, the portal or any private system. CI installs locked dependencies with `npm ci --ignore-scripts` and runs the full check before a refreshed snapshot can be merged. Snapshot validation rejects secret-like strings and the sample strategy's real identifiers.

## Telemetry

Each tool call writes one JSON line to stderr (`evt: "tool_call"`): tool name, query length, scope, counts, match strength, a coarse client family and a timestamp. Questions, addresses, names, emails and IP addresses are not logged by the application. Logging can never affect a response. See https://moyneross.com/privacy#connector.

## Input and contract controls

- Tool arguments are validated by Zod against `src/contracts.ts`; enumerated fields reject unknown values.
- Free text in the hand-over is truncated and URL-encoded.
- Every tool is annotated read-only, idempotent, non-destructive and closed-world.

## Reporting

Report a security issue to hello@moyneross.com (see `/.well-known/security.txt`).
