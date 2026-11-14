# Tool contract

`src/contracts.ts` is the single definition of every tool: its Zod input and output schemas for MCP, and the same input as plain JSON Schema for the REST layer, OpenAPI and the service metadata. The protocol test fails if any of them drift.

| Tool | Input | Returns | `/mcp` | `/mcp/openai`, ChatGPT |
|---|---|---|---|---|
| `search_research` | `query` (2–500), `scope` (`all`, `research`, `technical`, `methodology`, `sample`), `limit` (1–10), `response_format` (`concise`, `detailed`) | `results` (a library result adds `section`: the section that best answers, with its anchored URL), `matchStrength`, `match` (coverage, headlineCoverage, matchedTerms, missingTerms), `suggestedQueries`, `boundary`, `corpusVersion` | ✓ | ✓ |
| `list_papers` | `part` (I–VII), `limit` (1–25, default 15), `cursor` | A page of papers: number, title, part, question, short answer, dates, URL; `total`, `nextCursor` | ✓ | ✓ |
| `get_paper` | `paper`, `format` (`summary` default, `full`), `section` | The paper (summary, or with full text), the section if asked, a citation | ✓ | ✓ |
| `explain_method` | `method`, `format` (`summary` default, `full`), `section` | The method page: definition and sections, one section, or all | ✓ | ✓ |
| `get_sample_strategy` | `part` (`summary`, `register`), `section` | The summary; the register as an overview, or one section's lines with cost basis | ✓ | ✓ |
| `list_technical_pages` | `section` (a framework section, matched on part of its name), `page_type` (`element`, `space`), `limit` (1–50, default 15), `cursor` | A page of the Technical Library in framework order: title, section, short answer, URL; the 13 framework sections; the severity scale; `total`, `nextCursor` | ✓ | ✓ |
| `get_technical_page` | `page` (slug, element name or URL), `format` (`summary` default, `full`), `section` (an id such as `severity`, a heading, or `thresholds`), `market` (`AU`, `UK`, `US`) | The page (summary with every section's anchored URL, or with full text), the section if asked, a citation, and `thresholds`: the asked market's measured values, or every market's grouped and labelled, with the rule for using them and the markets with no value | ✓ | ✓ |
| `trace_connections` | `ref` (a paper or a library page) | `from`, `restsOn` (pages with section and why), `groundedPapers`, `sharesGroundWith` (most shared first), `related`, `spaces`, `elements` | ✓ | ✓ |
| `building_brief` | `use_class` (required), `spaces` (up to 8), `market`, `framework_section`, `limit` (1–50, default 20), `cursor`, `response_format` | Spaces, then elements in framework order with service-life link, threshold counts by market and grounding papers; `boundary` | ✓ | ✓ |
| `compare_technical_sections` | `pages` (2–5, required), `section` (a library section id or `thresholds`, required), `market` | Each page's section with its anchored URL (capped at 3,000 characters, `truncated` marked); with `thresholds`, the policy and one market or all labelled | ✓ | ✓ |
| `cite_paper` | `paper` (a paper or a Technical Library page), `style` (`bibtex`, `ris`, `csl-json`, `apa`, `harvard`), `section` | The formatted citation and the citation object | ✓ | ✓ |
| `working_with_moyne_ross` | none | Who, where, the three stages, the published terms, FAQs | ✓ | withheld |
| `start_strategy_link` | `building` (required), `name`, `email`, `organisation`, `role`, `type`, `note` | A pre-filled request link; nothing is sent | ✓ | withheld |

Every tool sets `title` and all four annotations explicitly (`readOnlyHint: true`, `destructiveHint: false`, `idempotentHint: true`, `openWorldHint: false`), carries the icon set, and validates its input with an actionable error that gives an example of valid input. `get_paper`, `get_technical_page`, `explain_method` and `get_sample_strategy` declare `anthropic/maxResultSizeChars: 100000`.

Descriptions and instructions are neutral: no tool asks the model to call another tool unprompted, and no research answer carries a price, a request link or a call to action, on any surface (tested).

Model-facing text always uses the clean canonical URL. REST answers add a separate attributed `referralUrl` beside each moyneross.com link.

## Answer sizes

Every answer is sent twice by design (structured content and text). `scripts/test-edge.mjs` holds every default answer under 20,000 characters (GitHub Copilot's inline limit) and every answer's text under 40,000 (Gemini CLI's truncation point), well inside Claude Code's 25,000 tokens. Summaries are the default; sections, full text and register lines are one argument away.

## Match strength

`strong` when the top result carries at least 60% of the question's meaning, weighted by how distinctive each word is (IDF; a word absent from the corpus weighs most), with practitioner shorthand counted through its expansion, and scores at least 3. `weak` otherwise; `none` when nothing matched. A weak answer says the results are background only and suggests the closest questions the corpus does answer.

## Technical Library sections

Every library page follows the topic layout: a fixed opening (`notice`, what you'll notice), short sections on the page's own topics (how a roof leaks, metal sheet, tiles and slates…), and fixed sections that every page carries: `service-life`, `severity` (how serious it is), `investigation`, `remedies`, `cost-shape`, `what-to-ask-for`, `misreads` (what is commonly mistaken), `jurisdiction-notes` (standards by country) and a closing worked example. Section ids are the anchors on moyneross.com; earlier addresses such as `#diagnosis` and `#mechanisms` still resolve to the section that now holds them. A long page in `format: full` comes a part at a time (about 24,000 characters of sections each), with `part.nextCursor` for the next. Severity is graded on the engine's own seven situations (safety, failure, condition, lifecycle, deadline, check, nil), each mapped to a register timing basis; `list_technical_pages` returns the scale. Library pages carry the shape of a cost, never a price; the snapshot validator fails on any currency amount.

## Thresholds by market

moyneross.com keeps every market's measured values out of the text the markets share. Each value sits in the page's `thresholds`, tagged with the one market it applies in (`AU`, `UK` or `US`), its measure, the rule as published, the clause, its source, whether the source is primary or secondary, and the sections it is read in. The library's rule for using them, published in `export.json` as `framework.thresholdPolicy`, travels with every answer that carries values: a threshold applies only to assets in its own market; another market's value is a labelled comparison at most, never the requirement; where the asset's market has no value, say so rather than borrow one.

`get_technical_page` with `market` returns that market's values alone, and names the market as `missing` when the page records none. Without `market` it returns every market's values grouped under their market, never one market chosen on the caller's behalf, so a missing value stays visible. `section: thresholds` returns the values on their own. A snapshot taken before moyneross.com published thresholds carries none, and answers omit the field rather than report a gap. The snapshot validator fails a value outside the page's jurisdiction, without a source, or with a price.
