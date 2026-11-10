# Retrieval gate

Every retrieval expectation the connector is held to lives in one place, `data/retrieval-cases.json`, with the website's own public benchmark kept in `data/benchmark.json`. `scripts/retrieval-gate.mjs` evaluates them, and the same evaluation is used three ways:

- `npm run benchmark` prints every category and fails if any gate fails;
- the core tests (`npm test`) fail on it;
- `npm run calibrate` (run by the daily refresh) only chooses ranking settings that pass it.

Because there is one evaluation, the calibrator can no longer pick a setting that the tests then reject.

## Categories and gates

| Category | Cases | Gate | Measured (10 Nov 2026 corpus) |
|---|---|---|---|
| `website`: the website's public benchmark, allocator questions | 56 | every question in the top three and strong | 56 found, 53 first, MRR 0.970, 56 strong |
| `shorthand`: practitioners' shorthand (capex, dilaps, MEES, LL97, PV, ACP, TDD, HOA) | 24 | at least 23 in the top three, 21 strong | 23 found, 19 first, 21 strong |
| `element`: building-element questions, `scope: technical` | 26 | all 26 in the top three, 25 strong | 26 found, 26 first, 25 strong |
| `element-open`: the same questions, unscoped | 26 | at least 24 in the top three | 26 found, 20 first |
| `pinned`: rankings the protocol and HTTP tests assert outright | 5 | every case, at its stated position | 5 met |
| `weak`: property questions the corpus does not answer | 10 | every one returns background and is never strong | 0 strong |
| `empty`: words absent from the corpus | 4 | every one returns nothing | met |
| `outside`: off-topic questions that share the corpus's words (capital, register, index, lift, lease, frame, core, service, foundation, insulation) | 82 | **ratchet**: at most 12 strong, target 0 | 12 strong |
| `target`: the right page exists and a different one used to win | 8 | at least 7 in the top three (a floor that may only rise) | 7 found |
| `faq`: one authored FAQ per library page, as moyneross.com publishes it | 103 | at least 101 in the top three | 103 found, 95 first |

Rules: **every** means each case meets its own expectation; **count** means a minimum number found and strong; **ratchet** means a maximum that may be lowered as the ranking improves and never raised; **report** means measured and printed but never failing a run. A case can set its own `within` (how far down it may sit) and `strong`.

## Passage scoring (1.1.0)

A library page is long and covers many things, so most ordinary words occur on it somewhere. Scored as one document, a page won on words scattered across unrelated sections, and a question looked answered when its words were merely present. Each library page is now also read as passages: its headline (title, search title, the names people use for the element from `alsoKnownAs`, question and answer), each section, and each authored question with its answer, all published in `technical/export.json`.

- **Ranking:** a library page scores half its whole-page BM25 and half its best passage's (`PASSAGE_MIX`, fixed in `src/core.ts`). The two settings in `src/ranking.ts` are fitted on top by the calibrator, whose library-weight range now runs from 0.3.
- **Strength:** a word counts as matched on a library page only if one of the page's two best passages for the question carries it, or the page's own name does (`PASSAGE_SPAN`).
- **Results:** each library result names the section (or authored question) that best answers the query, with its anchored URL.
- **Papers** are untouched: ranked exactly as the website ranks them and judged on the whole paper. Judging papers on their sections was measured and not adopted: it moved off-topic strongs from 12 to 10 but cost a website question and a shorthand question their strength.

| | Before | After |
|---|---|---|
| Wrong-page probes in the top three | 2 of 8 | 7 of 8 |
| Authored FAQs finding their page | 98 of 103 (73 first) | 103 of 103 (95 first) |
| Element questions, scoped, first | 24 of 26 | 26 of 26 |
| Element questions, unscoped, first | 16 of 26 | 20 of 26 |
| Off-topic questions judged strong | 15 of 82 | 12 of 82 |
| Shorthand questions strong | 22 of 24 | 21 of 24 |
| Ranking settings that pass every gate | 4 of 481 | 13 of 481 |

The one loss: "chiller and BMS end of life in a 90s office" is now judged weak. The BMS page answers half of it and no one page carries both, which is the honest reading; the `shorthand` gate moved from 22 to 21 strong accordingly.

## Where the gaps are

- **Off-topic questions on the papers.** Seven of the twelve off-topic strongs land on papers or website pages ("deferred tax liability accounting" on the deferred-maintenance paper, "how to frame a picture" on the home page). Papers are judged on the whole paper; the next step is a domain-evidence check of the kind Homechecker uses, so that a question with no building or capital meaning cannot be judged strong however its words fall.
- **"switchboard thermal imaging"** still finds insulation and solar PV ahead of the switchboard pages.

## Method

BM25 (k1 1.4, b 0.72) over the index the website builds with the public benchmark's own field weights (title ×4, question ×4, answer ×3, summary ×2, topics ×2, retrieval terms ×3, then the text), with the benchmark's tokenizer ported exactly; `test/core.test.mjs` pins it to the Python output. Library pages are scored on the whole corpus's statistics, blended with their best passage as above, weighted onto the papers' scale (`libraryWeight`) and boosted where the question matches their headline (`headlineBoost`); both settings are fitted by `npm run calibrate`. A curated map of practitioner shorthand adds each expansion to the query at 0.6 weight, so exact wording still ranks first.

Match strength: coverage weighted by each word's distinctiveness (IDF), counting a word as matched if it or its shorthand expansion appears (for a library page, in its best two passages or its name), with a floor on the score (coverage 0.6, score 3).

## Known cases, stated plainly

- **"capex forecast for an old office block"** is not answered in the top three: three papers each answer part of it, and the ranking prefers neighbours. The `shorthand` gate allows this one miss.
- **"cheap flights to london"** is judged strong. Its words genuinely occur in one paper's headline material (*cheap* money, *flight* to quality, London in *The 10% Office*). It is counted in the `outside` ratchet.
- **"who is on the hook for dilaps when the tenant leaves"** can put library pages ahead of the make-good paper on literal words (*hook*, *leaves*); the `pinned` case holds the paper in the first two, and first when scoped to research.

## Adding cases

Add to `data/retrieval-cases.json` with a category, the `query`, and `expected` canonical URLs where there is a right answer. A new off-topic case that is judged strong today needs `maxStrong` raised in the same change, with a note why; otherwise the gate fails. Run `npm run benchmark` to see the effect, and `npm run calibrate` if the ranking needs refitting.
