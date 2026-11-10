# Moyne Ross MCP

Moyne Ross research on commercial property and capital, served over the Model Context Protocol. A connected assistant can search and cite **Capital Made Physical** (49 papers on what commercial property is becoming) and the **Technical Library** (103 pages, one for each building element and functional space a Capital Strategy assesses: how it fails, what to look for, how serious a finding is, what fixes it), explain the **Capital Register** and the **MR Index**, read a **sample Capital Strategy**, and, for one actual building, hand the person to the Moyne Ross **Start your strategy** form already filled in.

Public, read-only, and separate from every client system. The server bundles a snapshot of public files from moyneross.com; it has no route to the Moyne Ross portal, client strategies, payments or any database.

**Version:** `1.1.0` · **Protocol:** MCP `2026-07-28`, with stateless 2025-era compatibility · **Endpoint:** `https://mcp.moyneross.com/mcp` · **Registry:** `io.github.Steven3265/moyneross` · **For assistants:** [moyneross.com/assistants](https://moyneross.com/assistants)

## Connect

| Client | How |
|---|---|
| Claude | Settings → Connectors → Add custom connector → `https://mcp.moyneross.com/mcp` |
| ChatGPT and the OpenAI directory | `https://mcp.moyneross.com/mcp/openai` (the eight research tools; no hand-over or engagement terms) |
| Claude Code | `claude mcp add --transport http moyneross https://mcp.moyneross.com/mcp`, or install this repository as a plugin |
| Any MCP client | Streamable HTTP at `https://mcp.moyneross.com/mcp`; no authentication |

## Tools

| Tool | What it does |
|---|---|
| `search_research` | Ranked search of the papers, the Technical Library, the methodology and the sample (`scope: technical` for the library alone). Every answer carries canonical URLs, a **match strength** with the evidence for it (distinctiveness-weighted coverage, matched and missing words), and, when the match is weak, questions the corpus does answer. Practitioner shorthand is understood (capex, dilaps, MEES, LL97, TDD). `response_format: detailed` adds a citation per result. |
| `list_papers` | The papers in reading order, a page at a time (`cursor`), optionally for one part (I to VII). |
| `get_paper` | One paper by slug, CMP number or URL. A summary by default (question, answer, summary, limitations, anchored sections); `section` for one section; `format: full` for the whole text. Always with a citation. |
| `explain_method` | The Capital Register or the MR Index: the definition and sections by default, `section` or `format: full` for more. |
| `get_sample_strategy` | A real Capital Strategy with identifying details changed: the summary, or the register as an overview by section or one section's lines with their cost basis. |
| `list_technical_pages` | The Technical Library in framework order (Substructure to Environmental), a page at a time, by section or page type, with the severity scale every page grades findings on. |
| `get_technical_page` | One library page by slug, element name or URL. A summary by default (question, answer, where it applies, limitations, sources, anchored sections); `section` for one section (`notice`, `severity`, `remedies`, `misreads` and the page's own topic sections); `format: full` for the whole page, a part at a time on a long page. Always with a citation. |
| `cite_paper` | An exact citation, to a paper or library page or one section, in BibTeX, RIS, CSL-JSON, APA or Harvard, generated rather than retyped by the model. |
| `working_with_moyne_ross` | How engagements work and the published terms. Not offered on `/mcp/openai` or to ChatGPT. |
| `start_strategy_link` | For a person who asks to request a Capital Strategy for one building: the request form link with the details they gave. Nothing is sent. Not offered on `/mcp/openai` or to ChatGPT. |

Every tool is read-only, with all four annotations set explicitly, input and output schemas, and icons. **Prompts:** `answer_from_research`, `compare_papers` (with paper autocompletion), `brief_on_topic` and `read_a_building_element` (with library autocompletion). **Resources:** `moyneross://catalogue`, the templates `moyneross://papers/{slug}` and `moyneross://technical/{slug}` (with autocompletion), `moyneross://methods/{capital-register|mr-index}` and `moyneross://sample`. Results link to them with `resource_link` blocks.

### Built for every assistant's limits

Default answers stay under 20,000 characters (GitHub Copilot keeps them inline), every answer's text under 40,000 (Gemini CLI's truncation point), and the tools that can return a full paper declare `anthropic/maxResultSizeChars` so Claude Code keeps them inline too. Summaries come first; sections, full text and the register's lines are one argument away.

### Citations that survive

The papers have 400 anchored sections between them and the library 1,491, matching the anchors on moyneross.com, so a claim can be cited to the exact section. Citations carry the corpus version (for example `2026-11-08.70433cca`: date and content fingerprint), so the cited text can always be identified.

## Other interfaces

- **REST:** `GET /v1/search`, `/v1/papers`, `/v1/paper`, `/v1/technical`, `/v1/method`, `/v1/sample`, `/v1/cite`, `/v1/engage` ([OpenAPI 3.1](https://mcp.moyneross.com/openapi.json)). Answers carry the clean canonical URL to cite and a separate attributed `referralUrl`.
- **Discovery:** server card at `/mcp/server-card` · AI Catalog at `/.well-known/ai-catalog.json` (`application/ai-catalog+json`) · `/llms.txt` · service metadata at `/server-card.json` · health and content fingerprint at `/health`. OpenAPI responses carry the same schemas as the MCP tools' outputs, and every REST answer is tested against them.
- **Distribution:** every channel and where it stands in [distribution/README.md](distribution/README.md), with submission packs for the Claude directory and the OpenAI app directory.
- **Packaging:** Claude plugin (`.claude-plugin/`, `.mcp.json`), GitHub Copilot (`.github/plugin/`), agent-plugins (`plugin.json`, `mcp.json`), Gemini (`gemini-extension.json`), the OpenAI submission package (`distribution/openai/`) and the GitHub Agent Finder pack (`distribution/github-agentfinder/`).
- **Skills:** `skills/commercial-capital-research` and `skills/capital-strategy-handover`, also served at `https://mcp.moyneross.com/skills/{name}/SKILL.md` (`npm run sync:skills` keeps the copies identical).
- **Docs:** [tool contract](docs/TOOL-CONTRACT.md) · [protocol support](docs/PROTOCOL-SUPPORT.md) · [security](docs/SECURITY.md) · [benchmark](docs/BENCHMARK.md) · [architecture](docs/ARCHITECTURE.md) · [deployment](docs/DEPLOYMENT.md) · [content terms](data/TERMS.md) · security contact at `/.well-known/security.txt`

## How it stays right

- **One corpus, three readers.** The snapshot is built from files the website's own publishing scripts produce (`/insights/export.json`, `/insights/search-index.json`, `/technical/export.json`, `/llms.txt`, the methodology and sample pages). The ranking of the papers, methodology and sample is a faithful port of the website's public retrieval benchmark, on the website's own statistics, so the benchmark, the site search and this server rank them alike; library pages are scored beside them (see [docs/BENCHMARK.md](docs/BENCHMARK.md)).
- **Deterministic snapshot.** `data/corpus.json` is dated from the content (the latest sitemap date), never the clock. A daily workflow rebuilds it and opens a pull request only when moyneross.com has actually changed.
- **Checked on every change** (`npm run check`): release metadata (including the Agent Skills and Agent Plugins rules); skill copies; snapshot validation (structure, no secrets, none of the sample's real identifiers); 25 core tests; the retrieval gate (one evaluation of 288 cases in `data/retrieval-cases.json` and the website's 56-question benchmark, also used by the calibrator: website questions, practitioners' shorthand, building elements scoped and unscoped, pinned rankings, weak, empty and 82 off-topic questions, and two reported sets of wrong-page and authored-FAQ questions; see docs/BENCHMARK.md); the protocol suite (2026-07-28 cache fields, ordering, result metadata and error codes; annotations, icons and size ceilings on every tool; prompts and completion; neutral answers on every surface; research only on the OpenAI surface); the REST suite; and per-client answer-size budgets, hostile input and speed. The official MCP conformance suite runs in its own workflow (25 live checks). Each release is a GitHub Release with a CycloneDX SBOM.

## Boundaries and privacy

The research and the Technical Library are general; the library describes how elements behave and carries no prices. A Capital Strategy is desk-based and reviewed by Moyne Ross before release; it is not an inspection, a valuation or a guarantee of cost. The server cannot assess a building, order anything, access client data or modify any system.

Telemetry is operational only: protocol method, tool name, query length, scope, counts, match strength, a coarse client family, outcome and duration. Questions, addresses, names, emails and IP addresses are not logged by the application. Privacy: [moyneross.com/privacy#connector](https://moyneross.com/privacy#connector).

## Develop

```bash
npm ci
npm run snapshot        # rebuild data/corpus.json from moyneross.com
# or, from a local build of the website (canonical URLs stay on moyneross.com):
# MOYNEROSS_FETCH_FROM=http://127.0.0.1:8765 npm run snapshot
npm run check           # everything
npm run start:stdio     # run over stdio
```

Licence: MIT for the server code. The content is not MIT licensed; see [data/TERMS.md](data/TERMS.md).
