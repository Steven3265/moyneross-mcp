# Architecture

```text
moyneross.com (public files built by the website's publishing script)
      │  export.json · search-index.json · llms.txt · methodology · sample · sitemap
      ▼
scripts/snapshot.mjs  (build time only; dated from content)
      ▼
data/corpus.json
      ▼
src/core.ts  deterministic ranking, match strength, papers, methods, sample, hand-over link
      ▼
src/server.ts  tools and resources (contracts in src/contracts.ts)
   ╱          │            ╲
/mcp      /mcp/openai     stdio          REST /v1/*, OpenAPI, server cards, health
```

The website is a build-time content source only. The deployed server has no route back to it, nor to the portal or any client system.

## Request path

`POST /mcp` → Host and Origin validation (DNS-rebinding defence; exact-origin override fails closed) → a new stateless MCP server for the request → a read-only handler → `data/corpus.json`. No session store, database or cross-request state.

## Ranking

`src/core.ts` ports `scripts/benchmark_public_corpus.py` from the website repository exactly: the same stop words, tokenizer and stemmer, and BM25 with k1 1.4 and b 0.72, over the documents in `/insights/search-index.json`, which the website builds with the benchmark's own field weights. `test/core.test.mjs` pins the tokenizer to the Python output, and `scripts/run-benchmark.mjs` runs the benchmark's 56 questions.

## Match strength

A result is `strong` when the top document carries at least 60% of the question's meaning weighted by distinctiveness (practitioner shorthand counted through its expansion) and scores at least 3. See docs/BENCHMARK.md for the calibration and its one known false positive. `weak` results are returned as background only, with suggested questions the corpus does answer; `none` means nothing matched.

## The hand-over

`start_strategy_link` builds a moyneross.com/contact link from the details given (enumerated fields validated, text truncated, everything URL-encoded, `utm_source=moyneross-mcp` added). It is registered per request: absent on `/mcp/openai` and for ChatGPT traffic on `/mcp`, along with the instruction and the notes that mention it, because OpenAI's directory does not allow apps to promote paid services.
