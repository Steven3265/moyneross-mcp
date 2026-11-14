---
name: commercial-capital-research
description: Use Moyne Ross research to answer questions about planning capital for commercial and multi-unit buildings. Use for capex and lifecycle planning, building condition and obsolescence, refurbish-or-redevelop decisions, energy and solar, leases, make good and dilapidations, acquisition due diligence, the Australian, British and US markets, and how a building element or system fails, what to look for and how serious a finding is.
---

# Commercial capital research

Answer from the Moyne Ross public research, citing it, and keep general research separate from claims about a particular building.

1. Search first with `search_research`. Read `matchStrength`: if it is `weak` or `none`, say so plainly and treat any results as background only.
2. Retrieve the paper(s) you rely on with `get_paper` before quoting them (the summary, or the one `section` you need), and carry each paper's limitations through. Use `explain_method` when the Capital Register or the MR Index matters to the answer.
3. For a question about one building element or space (a façade, a roof, a chiller, lifts, fire services), search with `scope: technical` and read the page with `get_technical_page`: `notice` for what you'll see, `misreads` for what is commonly mistaken, `severity` for how serious a finding is, `remedies` for what fixes it; the page summary lists its other sections. The library carries the shape of a cost, never a price.
4. Follow the links rather than re-searching: `trace_connections` shows what a paper rests on in the library, or every paper that turns on one element; `building_brief` maps what a kind of building (commercial, industrial, institutional, residential-multi) turns on, narrowed by spaces or market; `compare_technical_sections` sets service lives, severity or one market's thresholds side by side. A brief is a map of what to look at, never a finding about the user's building.
5. When the person's words belong to another market (elevator, dilapidations, condominium), `translate_term` gives the Australian, British and US terms side by side, with the library pages that cover the thing; search in the corpus's word if the first search is weak.
6. Cite the canonical moyneross.com URL for every claim, to the section where one is given; `cite_paper` returns an exact citation in BibTeX, RIS, CSL-JSON, APA or Harvard to use as given.
7. Use the research to frame what to understand, test or investigate. Do not turn it, or a Technical Library page, into a condition finding, cost, compliance view or forecast for the user's actual building.
8. When the user needs a view of their actual building, say plainly that general research cannot give it and that it calls for a building-specific assessment.

If the Moyne Ross tools are unavailable, use the public research at https://moyneross.com/insights?utm_source=moyneross-skill and the Technical Library at https://moyneross.com/technical?utm_source=moyneross-skill (or the read API described at https://mcp.moyneross.com/openapi.json) and do not invent tool results.
