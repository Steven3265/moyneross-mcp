# OpenAI public plugin submission — Moyne Ross

**Submit this endpoint: `https://mcp.moyneross.com/mcp/openai`.** It is the same production server and corpus as `/mcp`, offering the eight research tools only: `search_research`, `list_papers`, `get_paper`, `list_technical_pages`, `get_technical_page`, `explain_method`, `get_sample_strategy` and `cite_paper`. The hand-over (`start_strategy_link`) and the engagement description (`working_with_moyne_ross`) are not offered there, and no answer links to the Start your strategy form or states a fee, in line with OpenAI's rule against promoting digital services. Do not submit `/mcp` here.

Use OpenAI's plugin submission portal and create a **With MCP** plugin. Submit the `/mcp/openai` endpoint, run **Scan Tools**, then add the bundled `commercial-capital-research` skill. Complete the listing, test cases, policy attestations, business verification and review fields in the portal. Do not invent a `plugin_asdk_app...` reference; the portal scans the production server itself.

## Listing copy

**Name:** Moyne Ross
**Short:** What buildings reveal about capital.
**Long:** Research on commercial property and capital from Moyne Ross: search and cite the Capital Made Physical papers, understand the Capital Register and the MR Index, and see what a ten-year Capital Strategy contains. General research only; it does not assess a particular building.

## Policy and review answers

- **Commerce:** The app does not sell, promote or link to any purchase. It returns published research and links only to free public pages on moyneross.com.
- **Authentication:** None. The server is public and read-only.
- **Tools:** Six read-only tools, each with `readOnlyHint: true`, `destructiveHint: false`, `idempotentHint: true` and `openWorldHint: false` set explicitly (the corpus is a bounded, published catalogue).
- **Response minimisation:** answers carry no session, trace or request identifiers and no timestamps beyond the papers' own publication dates; the corpus version identifies the cited text.
- **Data:** No personal data is collected or stored. See https://moyneross.com/privacy#connector.
- **Corpus:** 49 papers, the two methodology references and one sample Capital Strategy.
- **Supporting evidence:** The same server is published in the official MCP Registry (`io.github.Steven3265/moyneross`).

## Before submitting

1. Verify the organisation in the OpenAI Platform (business verification with the registered business name and ABN, so the listing shows "Moyne Ross").
2. Verify the domain: OpenAI issues a token to serve at a well-known path on `mcp.moyneross.com`. Add it as one file under `public/.well-known/` and redeploy.
3. In ChatGPT Developer Mode, connect `/mcp/openai` and run the cases below, confirming no answer contains `moyneross.com/contact`, a fee or "Start your strategy".

## Positive review cases

1. "What does it mean that deferred maintenance is debt?"
2. "Should an owner refurbish or redevelop an ageing 1970s office?"
3. "What is the MR Index and how are its bands read?"
4. "Show me what a capital strategy for a warehouse looks like."
5. "Who pays for make good at the end of a commercial lease?"

## Negative / boundary cases

1. "What will my building at 12 Example Street cost to maintain?" — must not invent a building-specific figure.
2. "Should I buy this office tower?" — must not give investment advice; the research is general.
3. "What are mortgage rates today?" — outside the corpus; the match is weak and must be said to be.
