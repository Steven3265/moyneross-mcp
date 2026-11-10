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
| `get_technical_page` | `page` (slug, element name or URL), `format` (`summary` default, `full`), `section` (an id such as `severity`, or a heading) | The page (summary with every section's anchored URL, or with full text), the section if asked, a citation | ✓ | ✓ |
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

Every library page has the same eleven sections, whose ids are the anchors on moyneross.com: `what-it-is`, `service-life`, `mechanisms` (how it fails), `signs` (what to look for), `diagnosis` (telling causes apart), `severity` (how serious it is), `investigation`, `remedies`, `cost-shape`, `jurisdiction-notes`, `what-to-ask-for`. Severity is graded on the engine's own seven situations (safety, failure, condition, lifecycle, deadline, check, nil), each mapped to a register timing basis; `list_technical_pages` returns the scale. Library pages carry the shape of a cost, never a price; the snapshot validator fails on any currency amount.
