# Retrieval gate

Every retrieval expectation the connector is held to lives in one place, `data/retrieval-cases.json`, with the website's own public benchmark kept in `data/benchmark.json`. `scripts/retrieval-gate.mjs` evaluates them, and the same evaluation is used three ways:

- `npm run benchmark` prints every category and fails if any gate fails;
- the core tests (`npm test`) fail on it;
- `npm run calibrate` (run by the daily refresh) only chooses ranking settings that pass it.

Because there is one evaluation, the calibrator can no longer pick a setting that the tests then reject.

## Categories and gates

| Category | Cases | Gate | Measured (10 Nov 2026 corpus) |
|---|---|---|---|
| `website`: the website's public benchmark, allocator questions | 56 | every question in the top three and strong | 56 found, 54 first, MRR 0.979, 56 strong |
| `shorthand`: practitioners' shorthand (capex, dilaps, MEES, LL97, PV, ACP, TDD, HOA) | 24 | at least 23 in the top three, 22 strong | 23 found, 22 strong |
| `element`: building-element questions, `scope: technical` | 26 | all 26 in the top three, 25 strong | 26 found, 24 first, 25 strong |
| `element-open`: the same questions, unscoped | 26 | at least 24 in the top three | 26 found, 16 first |
| `pinned`: rankings the protocol and HTTP tests assert outright | 5 | every case, at its stated position | 5 met |
| `weak`: property questions the corpus does not answer | 10 | every one returns background and is never strong | 0 strong |
| `empty`: words absent from the corpus | 4 | every one returns nothing | met |
| `outside`: off-topic questions that share the corpus's words (capital, register, index, lift, lease, frame, core, service, foundation, insulation) | 82 | **ratchet**: at most 15 strong, target 0 | 15 strong |
| `target`: the right page exists and another wins today | 8 | reported | 2 found |
| `faq`: one authored FAQ per library page, as moyneross.com publishes it | 103 | reported | 98 found, 73 first, 91 strong |

Rules: **every** means each case meets its own expectation; **count** means a minimum number found and strong; **ratchet** means a maximum that may be lowered as the ranking improves and never raised; **report** means measured and printed but never failing a run. A case can set its own `within` (how far down it may sit) and `strong`.

## Where the gaps are

The gate is deliberately honest about two weaknesses, both in how strength and ranking are judged on whole pages:

- **Off-topic false strongs.** 15 of 82 off-topic questions are judged strong, against Homechecker's 0 of 109. A long library page contains most ordinary words somewhere, so "lease a new phone plan" is strong on the communications page. Strength is judged on the whole page rather than on a passage that actually answers the question.
- **Wrong page.** Six of the eight `target` cases find a different page: fire doors land on lifts, switchboard thermal imaging on solar PV, "concrete cancer" on two papers, "tin roof leaking" on a paper.

The planned work answers both. Search will index the aliases (`alsoKnownAs`), search titles and authored FAQs that the website export already publishes, and score and judge strength by section rather than by page. When a `target` case passes it moves to a gated category; when the `outside` count falls, `maxStrong` comes down with it.

## Method

BM25 (k1 1.4, b 0.72) over the index the website builds with the public benchmark's own field weights (title ×4, question ×4, answer ×3, summary ×2, topics ×2, retrieval terms ×3, then the text), with the benchmark's tokenizer ported exactly; `test/core.test.mjs` pins it to the Python output. Library pages are scored on the whole corpus's statistics, weighted onto the papers' scale (`libraryWeight`) and boosted where the question matches their headline (`headlineBoost`); both settings are fitted by `npm run calibrate`. A curated map of practitioner shorthand adds each expansion to the query at 0.6 weight, so exact wording still ranks first.

Match strength: coverage weighted by each word's distinctiveness (IDF), counting a word as matched if it or its shorthand expansion appears in the top document, with a floor on the score (coverage 0.6, score 3).

## Known cases, stated plainly

- **"capex forecast for an old office block"** is not answered in the top three: three papers each answer part of it, and the ranking prefers neighbours. The `shorthand` gate allows this one miss.
- **"cheap flights to london"** is judged strong. Its words genuinely occur in one paper's headline material (*cheap* money, *flight* to quality, London in *The 10% Office*). It is counted in the `outside` ratchet.
- **"who is on the hook for dilaps when the tenant leaves"** can put library pages ahead of the make-good paper on literal words (*hook*, *leaves*); the `pinned` case holds the paper in the first two, and first when scoped to research.

## Adding cases

Add to `data/retrieval-cases.json` with a category, the `query`, and `expected` canonical URLs where there is a right answer. A new off-topic case that is judged strong today needs `maxStrong` raised in the same change, with a note why; otherwise the gate fails. Run `npm run benchmark` to see the effect, and `npm run calibrate` if the ranking needs refitting.
