# Changelog

## 1.1.0

The Moyne Ross Technical Library joins the corpus: one page for each element and functional space of the Building Check Framework (103 pages, 1,133 anchored sections), snapshotted from `moyneross.com/technical/export.json`.

- Two tools: `list_technical_pages` (framework order, a page at a time, by section or page type, with the framework sections and the severity scale) and `get_technical_page` (by slug, element name or URL; a summary by default, one section such as `severity` or `diagnosis`, or the full page; candidates when a name is ambiguous). Both are research tools, so they are offered on `/mcp/openai` and to ChatGPT too.
- `search_research` gains `scope: technical`. Unscoped searches include the library.
- `cite_paper` cites library pages as well as papers, to the section, in all five styles; detailed search results carry library citations.
- A `moyneross://technical/{slug}` resource template with completion, the library in the catalogue resource, and a `read_a_building_element` prompt.
- REST: `/v1/technical` (the list, or one page with `page`), library citations on `/v1/cite`, and `scope=technical` on `/v1/search`; OpenAPI, service metadata, health and the index report the library.
- Ranking: the website's documents keep the website's own statistics, so the papers, methodology and sample score and rank exactly as in 1.0 (56 of 56 in the top three, 54 first, MRR 0.979). Library pages are scored on the whole corpus's statistics and weighted 0.7 onto the papers' scale; a new set of 26 building-element questions finds every expected page in the top three with `scope: technical` and 24 of 26 unscoped. See docs/BENCHMARK.md.
- Shorthand for building services and fabric (AHU, FCU, VRF, BMU, DPC, UPS, ATS, RCD, MSB, EIFS, spalling, subsidence).
- Snapshot schema 3, validated for the library: canonical URLs, eleven fixed sections, the seven-situation severity scale, and no currency amount anywhere in the library text. `MOYNEROSS_FETCH_FROM` builds a snapshot from a local build of the website for a release candidate, with canonical URLs unchanged.
- Off-topic questions: with 103 more pages, ordinary words usually find something, so most off-topic questions now return a weak match (background only) rather than none; none is still judged strong except the documented flights case.
- The Moyne Ross portal's Technical Library calibration identifies itself (`moyneross-portal-calibration`), so its calls are counted as `moyneross-portal` in telemetry, apart from assistants.
- One retrieval gate (`data/retrieval-cases.json`, evaluated by `scripts/retrieval-gate.mjs`) replaces the separate paraphrase and building-element benchmark files and the counts repeated in the tests, the calibrator and the docs. The benchmark, the core tests and the calibrator all use it, so the calibrator can no longer choose a ranking the tests reject. It adds weak, empty and 82 off-topic questions (a ratchet: at most 15 judged strong, target 0), the rankings the protocol tests pin, and two reported sets: wrong-page probes and one authored FAQ per library page.
- Library pages are read as passages: the headline (with the search title and the names people use for the element), each section and each authored question. A page scores half on the whole page and half on its best passage, and is judged strong only when its best two passages carry the question. Each library search result names the section that best answers, with its anchored URL. The snapshot now carries each page's `searchTitle`, `alsoKnownAs` and authored `questions`. Wrong-page probes found rise from 2 to 7 of 8, authored FAQs from 98 to 103 of 103, off-topic strongs fall from 15 to 12; see docs/BENCHMARK.md.
- Domain evidence: a paper or website page is judged strong only if the question is about buildings or property capital, or names what the paper is about, so everyday senses of the corpus's words no longer read as answers. Off-topic strongs fall from 12 to 4 of 82 with no loss on any gated question; 40 further off-topic questions and three wrong-page probes join the gate.
- `get_technical_page` with `format: full` returns a long page a part at a time (about 24,000 characters of whole sections), with `part.nextCursor` and a `cursor` argument to continue; `/v1/technical` likewise. The largest full answer falls from 37,100 to 24,300 characters of text, back inside every client's limit as the library is enriched.
- Docs, the `read_a_building_element` prompt and the research skill describe the topic layout (notice, topic sections, misreads, severity, remedies) instead of the earlier eleven fixed sections.
- Discovery: an AI Catalog at `/.well-known/ai-catalog.json` (`application/ai-catalog+json`, with an ETag) pointing to the server card and both skills; `/llms.txt` on the MCP host; `robots.txt` keeps crawlers to the discovery documents and off `/mcp` and `/v1/`; the server card is cached for an hour and, with the other JSON documents, lets browsers revalidate (`If-None-Match` allowed, `ETag` exposed).
- OpenAPI responses now carry real schemas, generated from the MCP tools' output schemas; the HTTP tests check every REST answer against them.
- The connector's own instructions and the hand-over skill no longer name another product; out-of-scope requests (a single home) are simply said to be out of scope.
- Robustness, from a live tyre-kicking of the deployed server: conversational wrapping is dropped from queries (wrapped questions strong rises from 0 to 97 of 174); one typing slip inside a long word is searched as the word it nearly is (strong 47 to 128 of 174); invalid list cursors are refused; unknown resources return -32602; an unknown sample register section is an error; the hand-over link strips control characters and drops an implausible email. Typo and conversational cases join the retrieval gate. `npm run live-check` repeats the tyre-kicking against a running server.
- The release check pins the conformance workflow (runner commit, active suite, protocol revision, baseline) and the exact 15 reviewed exclusions.
- Distribution: a Claude directory submission pack (`distribution/anthropic/`), the OpenAI pack brought up to the Technical Library, and `distribution/README.md` listing every channel.
- The snapshot refresh rebuilds its branch from the current main whenever main has moved, so a refresh pull request can no longer sit in conflict.
- Answer sizes stay inside every budget: the default library list is 15.7k characters, the largest library summary 8.7k, the largest full page 25.9k of text.

## 1.0.0

First release of the Moyne Ross MCP server, forked from the Homechecker Guides MCP (same protocol shell, request boundary and release discipline; a different corpus and tools).

- Eight tools: `search_research`, `list_papers`, `get_paper`, `explain_method`, `get_sample_strategy`, `cite_paper`, `working_with_moyne_ross` and `start_strategy_link`; three prompts with completion; a paper resource template with completion.
- Citations to the section: 400 anchored sections, exact citations in five styles (`cite_paper`), and a citable corpus version on every answer.
- Concise by default for every client: summaries first; `response_format`, `section`, `format: full` and paging for more; default answers under 20,000 characters, all text under 40,000; `anthropic/maxResultSizeChars` on the large tools.
- Retrieval: practitioner shorthand understood (a curated expansion map); match strength weighted by distinctiveness, with the matched and missing words and suggested questions; a second, paraphrased benchmark.
- 2026-07-28 core tested: cache fields on every list and read, stable tool order, result metadata, `-32602`; server card with `ETag` and well-known redirects, consistent with `server/discover`.
- Directory-ready wording: neutral descriptions and instructions, no price or call to action in any research answer on any surface; all four annotations explicit; icons on every tool and prompt.
- Resources for the catalogue, every Capital Made Physical paper, both methods and the sample strategy.
- Ranking ported exactly from the website's public retrieval benchmark: 56 of 56 questions find their expected resource in the top three (MRR 0.979), all judged strong.
- On `/mcp/openai` and for ChatGPT, the five research tools only: the hand-over and the engagement description are withheld, and no answer links to the Start your strategy form.
- Answer-size budget for Claude Code's 25,000-token limit: the sample in two parts (`summary`, `register`, with an optional `section`) and a lean `list_papers`.
- Methodology and sample served as structured markdown: headings, lists, full links and real tables (the sample register keeps every figure with its line, cost basis as a column). Calls to action are left out of the corpus.
- Read-only REST API (including `/v1/cite`), OpenAPI 3.1, MCP server card, service metadata and health with the corpus version.
- Each release published as a GitHub Release with a CycloneDX SBOM.
- Claude plugin, GitHub Copilot, agent-plugins, Gemini and Glama packaging; OpenAI submission package; GitHub Agent Finder pack; two agent skills, also served from the connector.
- Security policy and `security.txt`, content terms, tool contract, protocol support and benchmark documentation; Dependabot for dependencies and workflows.
