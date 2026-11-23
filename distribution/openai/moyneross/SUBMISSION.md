# OpenAI public plugin submission — Moyne Ross

Submitted for review on 23 November 2026 from the Moyne Ross Portal organisation in the OpenAI Platform (platform.openai.com/plugins). This folder is the plugin as uploaded.

**Submit this endpoint: `https://mcp.moyneross.com/mcp/openai`.** It is the same production server and corpus as `/mcp`, offering the twelve research tools only: `search_research`, `list_papers`, `get_paper`, `list_technical_pages`, `get_technical_page`, `compare_technical_sections`, `building_brief`, `trace_connections`, `translate_term`, `explain_method`, `get_sample_strategy` and `cite_paper`. The hand-over (`start_strategy_link`) and the engagement description (`working_with_moyne_ross`) are not offered there, and no answer links to the Start your strategy form or states a fee, in line with OpenAI's rule against promoting digital services. Do not submit `/mcp` here.

## What is in this folder

| Path | What it is |
| --- | --- |
| `.codex-plugin/plugin.json` | The manifest: identity, author, the listing (`interface`) and the review block (`extensions.com.openai.review`) with the test cases |
| `.mcp.json` | The MCP server the plugin connects to: `/mcp/openai`, streamable HTTP, no authentication |
| `skills/commercial-capital-research/` | The bundled skill |
| `assets/logo.png`, `assets/icon.png` | The MR mark for the listing and the composer |

The two dot-files are hidden by default on Windows and macOS; show hidden files before zipping.

## Uploading a new version

1. Raise `version` in `.codex-plugin/plugin.json` when anything changes.
2. Zip the contents of this folder (`.codex-plugin`, `.mcp.json`, `skills`, `assets`) with those items at the root of the zip, not inside a parent folder. Leave this file out.
3. In the portal, open the Moyne Ross plugin and choose **Upload new version**. The validator checks the manifest straight away.
4. On the MCPs tab, choose **Rescan** so the tool list is current.
5. Check **Review information**: countries, test cases (read from the manifest), the video walkthrough and release notes.
6. Submit for review.

## Manifest rules the validator enforces

Learnt on the first upload, when the earlier manifest was rejected:

- `skills` and `mcpServers` are relative paths inside the plugin root, starting with `./` (`"./skills/"`, `"./.mcp.json"`). `mcpServers` is a path to the config file, not an inline object.
- `author` is required.
- `interface` is required, with `displayName`, `shortDescription`, `longDescription`, `developerName`, `category` and `capabilities`, plus `supportURL`.
- `shortDescription` (the subtitle) is 30 characters or fewer.
- `category` must be one of the portal's values; `Education & Research` is accepted, as for Homechecker.
- Review test cases live in `extensions.com.openai.review.test_cases`: exactly five `positive` (`description`, `prompt`, `tools_triggered`, `expected_behavior`) and three `negative` (`description`, `prompt`).

## Domain verification

Done. OpenAI's token is served from `public/.well-known/openai-apps-challenge` in this repository at `https://mcp.moyneross.com/.well-known/openai-apps-challenge`. Do not remove that file; the listing depends on it.

## Listing

**Name:** Moyne Ross
**Subtitle:** Building capital research
**Category:** Education & Research
**Description:** as `interface.longDescription` in the manifest.
**Links:** website moyneross.com/assistants, support moyneross.com/contact, privacy moyneross.com/privacy, terms moyneross.com/terms.

## Review materials

- **Test cases:** in the manifest. The positive cases cover a paper (deferred maintenance), a Technical Library severity grading (car park reinforcement), the MR Index, the sample Capital Strategy and a market translation (make good). The negative cases are a building-specific cost, investment advice and an out-of-corpus question.
- **Video walkthrough:** https://www.youtube.com/watch?v=k2NhO0L7jAc (unlisted; shown to reviewers only).
- **Commerce:** none. The plugin returns published research and links only to free public pages on moyneross.com.
- **Authentication:** none. The server is public and read-only; no reviewer credentials are needed.
- **Tools:** all twelve set `readOnlyHint: true`, `destructiveHint: false`, `idempotentHint: true` and `openWorldHint: false`.
- **Data:** no personal data is collected or stored. Telemetry logs only the tool name, a coarse client family and counts. See https://moyneross.com/privacy.
- **Supporting evidence:** the same server is in the official MCP Registry (`io.github.Steven3265/moyneross`) and the Claude directory; Homechecker, from the same organisation, is already published in the ChatGPT directory.
