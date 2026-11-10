# Distribution

One server, one corpus, several ways in. Each channel below points at the same endpoint and identity; `scripts/validate-release-metadata.mjs` keeps the versions, names and URLs in step.

| Channel | What to submit | Where it stands |
|---|---|---|
| Official MCP Registry | `server.json` (Actions → Publish to MCP Registry) | `io.github.Steven3265/moyneross` 1.1.0, active since 8 Nov 2026. Changes behind the live endpoint need no new registry version. |
| Claude directory: connector | `https://mcp.moyneross.com/mcp` | Pack in `anthropic/SUBMISSION.md` |
| Claude directory: plugin bundle | This repository (`.claude-plugin/`, `skills/`) | Submit after the connector and pair the two |
| OpenAI app directory | `https://mcp.moyneross.com/mcp/openai` | Pack in `openai/moyneross/SUBMISSION.md` |
| GitHub Copilot | `.github/plugin/marketplace.json` | In the repository |
| GitHub Agent Finder | `github-agentfinder/` | Pull request to `github/agentfinder-catalog` |
| Gemini CLI | `gemini-extension.json`, `GEMINI.md` | `gemini extensions install https://github.com/Steven3265/moyneross-mcp` |
| Agent Plugins 1.0.0 | `plugin.json`, `mcp.json`, `skills/` | In the repository |
| Glama | `glama.json` | Claim the listing at glama.ai once it is indexed from the registry |
| Smithery, LobeHub, M8ven | Nothing to file | They index from the registry and GitHub without a submission |
| Domain discovery | `/.well-known/ai-catalog.json` here and on moyneross.com; `/mcp/server-card`; `/llms.txt`; `/openapi.json` | Live with this release |

## On moyneross.com (the website repository, not this one)

- Serve `/.well-known/ai-catalog.json` (and `ard.json`) as `application/ai-catalog+json`; it is `application/json` today.
- Set `reviewedAt` on Technical Library pages in `technical/export.json`; every page has `reviewDue` but none has `reviewedAt`.
- Optionally publish a markdown alternate of each library page (`/technical/<slug>.md`, linked with `rel="alternate" type="text/markdown"`), for crawlers that prefer it over HTML.
