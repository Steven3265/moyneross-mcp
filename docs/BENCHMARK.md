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
| `outside`: off-topic questions that share the corpus's words (capital, register, index, lift, lease, frame, core, service, foundation, insulation) | 122 | **ratchet**: at most 6 strong, target 0 | 6 strong |
| `target`: the right page exists and a different one used to win | 11 | at least 9 in the top three (a floor that may only rise) | 9 found |
| `faq`: one authored FAQ per library page, as moyneross.com publishes it | 103 | at least 101 in the top three | 103 found, 96 first, 102 strong |
| `typo`: authored FAQs with two letters of one long word swapped | 42 | at least 39 found, 26 strong | 40 found, 39 first, 29 strong |
| `verbose`: authored FAQs wrapped in conversation ("Hi, I have a question … thanks") | 44 | at least 37 found, 23 strong | 43 found, 25 first, 25 strong |

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

## Domain evidence (1.1.0)

Papers and website pages are judged on their whole text, where ordinary words turn up in every sense: "deferred tax liability accounting" found the deferred-maintenance paper and was judged strong. A paper or website page is now strong only if the question is about buildings or property capital at all, or names what the paper is about (at least 70% of the question's weight in its title and question).

`domainEvidence` in `src/core.ts` reads the question's own words. A phrase such as *capital register*, *MR Index*, *make good* or *technical due diligence*, or one clear word, is enough: *building*, *tenant*, *capex*, *chiller*, *spalling*, and every element name and alias the Technical Library publishes (so it grows with the library). Words with everyday senses (*lift*, *lease*, *frame*, *core*, *capital*, *register*, *index*, *kitchen*, *energy*) count for 0.4 each. Library pages are exempt, because their strength is already judged on their own passages.

It was checked on 40 off-topic and 25 on-topic questions written after the rule and not used to tune it: off-topic strongs fell from 5 to 3, and none of the 25 on-topic questions lost its strength. Those 40 off-topic questions then joined the `outside` category, and the three on-topic questions the ranking got wrong joined `target`.

| | Before | After |
|---|---|---|
| Off-topic questions judged strong | 12 of 82 | 4 of 82 (6 of 122 with the new questions) |
| Website, shorthand, element, pinned, FAQ strength | | unchanged |

## Robustness (1.1.0)

A live tyre-kicking of the deployed server (about 6,000 requests: hostile and malformed protocol traffic, every paper, page, section, part, citation and resource, perturbed questions, parity and load) found the protocol shell sound and four things worth fixing, all fixed:

- **Conversational wrapping.** "Hi, I manage a building and have a question … any guidance appreciated, thanks" made every wrapped question weak (0 of 174 strong), because the wrapper's words are in no document and weighed most. The wrapper is now dropped from the query (`queryTokens`); the tokenizer itself stays the website's. 97 of 174 wrapped questions are now strong and 165 find their page in the top three (was 145).
- **Typing slips.** One swapped letter ("spirnklers", "chlilers") cut strength to 47 of 174. A word the corpus lacks, six letters or more, that is one slip inside the word from a word it has (swapped, dropped or doubled letter, not a wrong letter, nothing at the ends) is also searched as that word at reduced weight: 128 strong, 170 in the top three (was 160). Real words are not "corrected": *horse* stays *horse*.
- **Paging and errors.** A list cursor the server never gave out is refused rather than read as the start or as an empty last page; an unknown page or paper resource is "not found" (-32602), not an internal error; an unknown sample register section is an error listing the register's sections only.
- **The hand-over link** strips control characters from every field and keeps an email only if it looks like one address.

`npm run live-check` repeats the tyre-kicking against production (or any URL) in about two minutes; it is not part of `npm run check` because it goes over the network.

## Where the gaps are

- **Six off-topic questions still judged strong**, all on library pages: "lease a new phone plan" on the lifts page (lift phones), "how to clean a kitchen oven" on the kitchen page, "timing belt replacement on a car" on air-handling units. Library pages are exempt from the domain check; a passage-level version of it is the next refinement.
- **"how do you read a capital register"** finds the hazardous-materials page (asbestos register) ahead of the Capital Register method, and **"switchboard thermal imaging"** finds insulation and solar PV ahead of the switchboard pages.

## Method

BM25 (k1 1.4, b 0.72) over the index the website builds with the public benchmark's own field weights (title ×4, question ×4, answer ×3, summary ×2, topics ×2, retrieval terms ×3, then the text), with the benchmark's tokenizer ported exactly; `test/core.test.mjs` pins it to the Python output. Library pages are scored on the whole corpus's statistics, blended with their best passage as above, weighted onto the papers' scale (`libraryWeight`) and boosted where the question matches their headline (`headlineBoost`); both settings are fitted by `npm run calibrate`. A curated map of practitioner shorthand adds each expansion to the query at 0.6 weight, so exact wording still ranks first.

Match strength: coverage weighted by each word's distinctiveness (IDF), counting a word as matched if it or its shorthand expansion appears (for a library page, in its best two passages or its name), with a floor on the score (coverage 0.6, score 3).

## Known cases, stated plainly

- **"capex forecast for an old office block"** is not answered in the top three: three papers each answer part of it, and the ranking prefers neighbours. The `shorthand` gate allows this one miss.
- **"cheap flights to london"** is judged strong. Its words genuinely occur in one paper's headline material (*cheap* money, *flight* to quality, London in *The 10% Office*). It is counted in the `outside` ratchet.
- **"who is on the hook for dilaps when the tenant leaves"** can put library pages ahead of the make-good paper on literal words (*hook*, *leaves*); the `pinned` case holds the paper in the first two, and first when scoped to research.

## Adding cases

Add to `data/retrieval-cases.json` with a category, the `query`, and `expected` canonical URLs where there is a right answer. A new off-topic case that is judged strong today needs `maxStrong` raised in the same change, with a note why; otherwise the gate fails. Run `npm run benchmark` to see the effect, and `npm run calibrate` if the ranking needs refitting.
