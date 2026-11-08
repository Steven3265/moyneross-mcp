# Retrieval benchmarks

Three benchmarks, run on every change (`npm run benchmark`) against the connector's own snapshot and ranking.

| Set | Questions | Top 3 | First | MRR | Strong |
|---|---|---|---|---|---|
| `data/benchmark.json`: the website's public benchmark, allocator questions | 56 | 56 | 54 | 0.979 | 56 |
| `data/benchmark-paraphrase.json`: practitioners' shorthand (capex, dilaps, MEES, LL97, PV, ACP, TDD, HOA) | 24 | 23 | 19 | 0.861 | 22 |
| `data/benchmark-technical.json`: building-element questions, `scope: technical` | 26 | 26 | 24 | 0.962 | 25 |
| `data/benchmark-technical.json`: the same, unscoped | 26 | 24 | 14 | 0.731 | 26 |

A release requires all 56 main questions in the top three and strong; at least 23 and 21 of the paraphrased ones; and, for the building-element set, all 26 in the top three with `scope: technical`, at least 24 unscoped, and at least 25 strong.

## The Technical Library in the ranking (1.1.0)

The website's documents (papers, methodology, sample, practice pages) are scored on the website's own statistics: their document frequencies, count and average length. Adding 103 library pages therefore cannot change a paper's score or its order against other papers; a test holds every website score equal with and without the library, and the main benchmark is identical to 1.0.

Library pages are scored on the statistics of the whole corpus, so words that are common in the papers (capital, register, lease, tenant) count for little on a library page, then weighted 0.7 onto the papers' scale before the lists merge. The weight was measured across four designs and six weights:

| Design | Main top 3 | Paraphrase top 3 | Library top 3 (unscoped) | Off-topic strong |
|---|---|---|---|---|
| One shared index | 56 | 22 | 26 | 4 |
| Separate statistics for each collection | 53 | 19 | 26 | 3 |
| Website on its own statistics, library on the corpus's, weight 1.0 | 56 | 19 | 26 | 2 |
| The same, weight 0.7 (adopted) | 56 | 23 | 24 | 1 (+ the tap question, now on topic) |
| The same, weight 0.6 | 56 | 23 | 22 | 1 |

A shared index reorders the papers (the website's own ranking would no longer be the connector's) and turns off-topic questions such as "mortgage interest rates today" strong. Higher weights let library pages displace papers on capital questions; lower ones bury them on element questions. Paraphrase MRR falls from 0.910 to 0.861 because library pages now sit beside the papers in the top ten, often legitimately ("chiller and BMS end of life" finds the BMS page).

## Method

BM25 (k1 1.4, b 0.72) over the index the website builds with the public benchmark's own field weights (title ×4, question ×4, answer ×3, summary ×2, topics ×2, retrieval terms ×3, then the text), with the benchmark's tokenizer ported exactly; `test/core.test.mjs` pins it to the Python output. On top, a curated map of practitioner shorthand adds each expansion to the query at 0.6 weight, so exact wording still ranks first. Semantic (embedding) retrieval was not adopted: on a 49-paper corpus this lexical method reaches 98% MRR on the main set, and it stays deterministic and inspectable.

## Match strength

Coverage weighted by each word's distinctiveness (IDF), counting a word as matched if it or its shorthand expansion appears in the top document, with a floor on the score. Threshold 0.6, calibrated against both sets and fourteen off-topic questions.

## Known limits, stated plainly

- **"obsolete building management system controllers and proprietary lock-in"** and **"main switchboard at capacity and the electricity supply upgrade"** return the services and energy papers ahead of their library pages when unscoped; with `scope: technical` both are first. The search tool's description tells assistants to scope element questions.
- **"who is on the hook for dilaps when the tenant leaves"** puts the canopies page first on literal words (*hook*, *leaves*), with the make-good paper second; scoped to research, the paper is first.
- **Off-topic questions** now usually match weakly rather than not at all ("symptoms" occurs in the library's signs of failure). A weak answer tells the assistant the results are background only. "How to fix a leaking tap at home" is now a library question and finds the wet areas page.

- **"capex forecast for an old office block"** is not answered in the top three: three papers each answer part of it, and the ranking prefers neighbours. It stays in the set.
- **"cheap flights to london"** is judged strong. Its words genuinely occur in one paper's headline material (*cheap* money, *flight* to quality, London in *The 10% Office*); neither word statistics nor proximity separates it without demoting real questions. The tests allow this one case and no other off-topic question. The answer still shows the matched words, so an assistant can see the mismatch.
