# Claude directory submission — Moyne Ross

Submit from the developer portal at https://claude.ai/directory/manage (any paid plan; on Pro or Max from your own account). Choose **MCP connector**, then work through Anthropic's connector pre-submission checklist (https://claude.com/docs/connectors/building/review-criteria.md). Submissions are scanned automatically and listed as Community connectors; Anthropic may escalate one to Verified review, in which a reviewer tests each tool.

Make two submissions, as Anthropic recommends for a product with its own server: this server as an **MCP connector**, then this repository as a **plugin bundle** (`.claude-plugin/plugin.json`: the two skills, pointed at the same URL). Submit from the same organisation and pair them in the portal, so people with both see one set of tools.

## Connector

| Field | Value |
|---|---|
| Name | Moyne Ross |
| Tagline | What buildings reveal about capital. |
| Server URL | `https://mcp.moyneross.com/mcp` (Streamable HTTP) |
| Type | Remote MCP server |
| Authentication | None. Public and read-only; no test credentials are needed. |
| Documentation | https://moyneross.com/assistants |
| Privacy policy | https://moyneross.com/privacy#connector |
| Logo | https://mcp.moyneross.com/moyneross-icon-512.png (also 256 and 32) |
| Support | https://moyneross.com/contact |

**Use cases (2–3 sentences):** Research on planning capital for commercial and multi-unit buildings: lifecycle and condition, obsolescence, refurbishment or redevelopment, energy and performance rules, leases and make good, and due diligence across Australia, Britain and the United States. A Technical Library with one page for each building element and functional space, on how it fails, what you will notice, how serious a finding is and what fixes it. Every answer is cited to the section on moyneross.com.

## Against the checklist

- **Read and write separated:** all ten tools are read-only; none writes anywhere. `start_strategy_link` returns a pre-filled form link and sends nothing.
- **Annotations:** every tool sets `title` and all four hints explicitly (`readOnlyHint: true`, `destructiveHint: false`, `idempotentHint: true`, `openWorldHint: false`), tested in `scripts/test-protocol.mjs`.
- **Names:** all under 64 characters.
- **Descriptions:** each says what the tool does and when; no tool asks the model to call another tool unprompted, and no research answer carries a price, a request link or a call to action (tested on every surface).
- **Errors:** invalid input returns an actionable message with an example of valid input; unknown papers and pages return the closest candidates.
- **Response size:** summaries by default; sections, full text (a part at a time on long pages) and register lines on request; every default answer under 20,000 characters and every answer's text under 40,000 (`scripts/test-edge.mjs`).
- **Data:** no conversation data is collected; telemetry is operational only (method, tool, query length, counts, match strength, coarse client family, outcome, duration). The server cannot read memory, chat history or files.
- **API ownership:** the server serves a bundled snapshot of moyneross.com's own published files, on moyneross.com's own subdomain.
- **Unsupported uses:** none: no payments, no generated media.

## Test before submitting

Connect `https://mcp.moyneross.com/mcp` as a custom connector in Claude and exercise every tool (the portal's **Test & launch** step asks you to confirm this), and once through the MCP Inspector.

**Questions that should answer well:**

1. "Is deferred maintenance a form of debt?"
2. "Should an owner refurbish or redevelop an ageing 1970s office?"
3. "What causes horizontal cracking at regular courses in a brick cavity wall, and how serious is it?"
4. "Why is a metal roof dripping on cold mornings when it hasn't rained?"
5. "Who pays for make good at the end of a commercial lease in Australia, the UK and the US?"
6. "Give me a Harvard citation for the Technical Library's roof coverings severity section."
7. "Show me the roofs section of the sample Capital Strategy register."

**Boundary questions:**

1. "What will my building at 12 Example Street cost to maintain?" — no building-specific figure; the research is general.
2. "What are mortgage rates today?" — judged weak; the answer must say the corpus does not cover it.
3. "I'd like a capital strategy for our warehouse in Geelong." — `start_strategy_link` returns a form link with only the details given; nothing is sent.
