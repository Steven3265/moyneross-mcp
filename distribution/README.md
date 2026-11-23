# Distribution

One server, one corpus, several ways in. Each channel below points at the same endpoint and identity; `scripts/validate-release-metadata.mjs` keeps the versions, names and URLs in step.

| Channel | What to submit | Where it stands |
|---|---|---|
| Official MCP Registry | `server.json` (Actions → Publish to MCP Registry) | `io.github.Steven3265/moyneross` 1.1.0, active since 8 Nov 2026. Changes behind the live endpoint need no new registry version. |
| Claude directory: connector | `https://mcp.moyneross.com/mcp` | Listed (Community) since 23 Nov 2026 as **Moyne Ross**, slug `moyne-ross`. Pack in `anthropic/SUBMISSION.md` |
| Claude directory: plugin bundle | This repository (`.claude-plugin/`, `skills/`) | Not yet submitted. Submit from the same account and pair it with the listed connector |
| OpenAI app directory | `https://mcp.moyneross.com/mcp/openai`, as the plugin in `openai/moyneross/` | Submitted for review 23 Nov 2026; domain verified. Pack and upload steps in `openai/moyneross/SUBMISSION.md` |
| GitHub Copilot | `.github/plugin/marketplace.json` | In the repository |
| GitHub Agent Finder | `github-agentfinder/` | Pull request to `github/agentfinder-catalog` |
| Gemini CLI | `gemini-extension.json`, `GEMINI.md` | `gemini extensions install https://github.com/Steven3265/moyneross-mcp` |
| Agent Plugins 1.0.0 | `plugin.json`, `mcp.json`, `skills/` | In the repository |
| Glama | `glama.json` | Indexed from the registry (server and connector pages). Claim the listing and run its test; the connector page shows "Not tested" |
| Microsoft 365 Copilot | Federated connector via Partner Center | Not started: confirm whether a no-sign-in server is accepted, then enrol and submit |
| Smithery, LobeHub, M8ven | Nothing to file | They index from the registry and GitHub without a submission |
| Domain discovery | `/.well-known/ai-catalog.json` here and on moyneross.com; `/mcp/server-card`; `/llms.txt`; `/openapi.json` | Live with this release |

## On moyneross.com (the website repository, not this one)

- Serve `/.well-known/ai-catalog.json` (and `ard.json`) as `application/ai-catalog+json`; it is `application/json` today.
- Set `reviewedAt` on Technical Library pages in `technical/export.json`; every page has `reviewDue` but none has `reviewedAt`.
- Fix one dead source on the Fencing, Gates & Signage page: HSE's powered gates page (`https://www.hse.gov.uk/work-equipment-machinery/powered-gates.htm`) returns 404. The other cited sources that refused the checker (OSHA, ICC, ASHRAE, Safe Work Australia and others) block automated requests but open in a browser.
- `https://moyneross.com/samples/strategy`, the interactive sample the connector links to, redirects to a portal share link. Share links expire after 90 days by default, so renew it or make it permanent, or the link in every sample answer will break.
- Optionally publish a markdown alternate of each library page (`/technical/<slug>.md`, linked with `rel="alternate" type="text/markdown"`), for crawlers that prefer it over HTML.
