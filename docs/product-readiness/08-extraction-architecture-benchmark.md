# Extraction-architecture benchmark — broad vs naive selective vs hybrid

Independent challenge of the proposal to move from broad semantic compilation to selective, dependency-aware
extraction. Runner: `npx tsx scripts/product-acceptance/benchmark/run.ts` (offline, no model, ≈5 s); evidence test:
`tests/product-acceptance/benchmark.test.ts`; committed run: `docs/product-readiness/benchmark-runs/<sha>/`.

## What was measured, estimated, projected

| item | status |
|---|---|
| Scope quality per strategy (which units/definitions/documents reach interpretation) against 14 independently authored legal universes over 8 packages | **MEASURED offline** on the pinned corpus using production deterministic stages (structure, definitions, references, package graph, Pass A signals, amendment pipeline, operative state, context retrieval) |
| Strategy A (broad) | PRODUCTION_POPULATION: every SECTION of every document |
| Strategies B (naive selective) and C (hybrid) | **EVALUATION MODELS** built on production deterministic outputs; no such production path exists. Cursor's `compilation-scope.ts` / `question-plan.ts` (PR #136, unmerged) implement a dry-run closure of the C kind; they were read, not executed here |
| Model calls, tokens, USD | **DETERMINISTIC ESTIMATE**: 5 calls per unit (2× Pass A, Pass B, classifier, Layer-2), chars/4 tokens plus a fixed prompt overhead, production rate card for `deepseek/deepseek-v4-flash`. Not spend |
| Latency, cache reuse, incremental recompilation | **HYPOTHETICAL PROJECTION / ESTIMATE** from unit counts; never timed with a model |

Nothing here is evidence about model extraction quality; a strategy that puts the right units in scope can still be
compiled wrongly (see IPV-01…IPV-15).

## Results (corpus `f7c6…`, 14 cases)

| strategy | complete | plausible-but-incomplete | fail-closed (correct) | false permissions | dangerous omissions | restriction recall | condition recall | definition recall | est. USD (all cases) | est. model calls |
|---|---|---|---|---|---|---|---|---|---|---|
| A broad | 10 | 0 | 4/4 | **0** | 0 | 18/18 | 16/16 | 37/37 | 0.133 | 380 |
| B naive selective (top-3) | 5 | 8 | 1/4 | **5** | 13 | 9/18 | 12/16 | 7/37 | 0.070 | 210 |
| C hybrid closure | 10 | 0 | 4/4 | **0** | 0 | 18/18 | 16/16 | 36/37 | 0.084 | 240 |

Reading the cost column: C is ≈37 % below A on this corpus; B is ≈47 % below A but only ≈17 % below C — and it pays
for that with five false permissions. On real agreements (hundreds of sections) the A–C gap widens with document size
while the B–C gap stays a few units; that is a projection, not a measurement.

### The scenario where the cheapest strategy looks right and is wrong

**BM-14 / BM-01 (package I).** "What is the general debt basket and how much of it may be secured?" Naive retrieval
returns 7.01(b), 7.01(a), 7.01(d) — a clean, confident answer: *$50,000,000, no stated limit on securing it*. The
contract limits liens securing that basket to $20,000,000 (7.02(b)) and caps all secured debt at $25,000,000 in
Section 9.15 of Article IX ("Notwithstanding anything to the contrary in Article VII"). Broad and hybrid both reach
7.02(b) and 9.15; hybrid reaches 9.15 only because it scans every operative document for override clauses.

### Where naive selective fails (B, 13 dangerous omissions)

| case | what top-k missed |
|---|---|
| BM-01 secured debt | 7.02 lien prohibition; 9.15 out-of-article cap |
| BM-02 RP builder | 7.08(d) draws on the same Available Amount |
| BM-03 cross-document | indenture 4.09 FCCR test (the $150m cap row was retrieved by keyword, the test was not) |
| BM-04 amendment | both amendments: answers $25,000,000 unconditional and a live 7.01(e) |
| BM-07 TOC | compiled the contents line and 7.06(a); missed 7.06(c)'s no-Default gate |
| BM-09 proceeds | hanging section-wide carve-out |
| BM-11 facility sale | the hanging proviso after (l) |
| BM-13 missing document | answered from 7.02(b) without noticing the Term Loan Agreement is absent |

### Where hybrid still depends on other machinery

- **BM-07**: hybrid (and broad) put the table-of-contents occurrence of 7.06 into scope. Only an operative-source
  gate at dispatch (PR #136 `operativeModelDispatchBlock`) stops it; the structural index cannot.
- **BM-12**: the correct FAIL_CLOSED comes from retrieval reporting the undefined term and the duplicate 7.01; a
  closure that does not propagate LOW-severity unresolved terms would have answered.
- **BM-02**: the definition→section rule (sections named inside an in-scope definition join the scope) was needed to
  reach 7.08(d). Cursor's `compilation-scope.ts` walks definitions only term→term (from code reading).
- Definition recall 36/37: one indenture definition reached only through the cross-document instrument scan.

## The most important question: can Headroom cheaply establish the relevant legal universe before interpretation?

**On this evidence: yes, but only with a full-package deterministic pass first, and only as a disclosed scope, never
as a proof of completeness.** The hybrid closure never called a model and reached every material restriction and
condition that broad compilation reached, because every input it used is already computed deterministically for the
whole package:

1. parse every document (structure, definitions, references, health diagnostics);
2. package graph (document roles, relationships, cross-document leads, instrument grouping);
3. amendment pipeline + operative state (which clauses are current, superseded, deleted, unresolved);
4. Pass A deterministic signals on every section of every operative document;
5. context retrieval per candidate (definitions, unresolved terms, absent documents).

From those, the closure rules that mattered were: whole-section seeds (hanging provisos travel with their clause);
document-wide family-cue + normative-verb scan across **every operative document** (catches wrong headings and
sibling instruments); override-clause scan ("notwithstanding … Article") across the whole document; structural
cross-reference closure with AMBIGUOUS/NOT_FOUND surfaced; section↔definition closure in both directions; amendment
effects pulling the amending document in and unresolved effects hard-stopping; cross-document leads; external
agreements defined "dated as of …" but absent from the package reported as missing; and an omission audit listing
every signalled unit not examined.

**What does not establish the universe:** a top-k list. B retrieved the right basket in every case and was wrong in
eight; its scope contains no information about what it did not retrieve.

**Minimum broad processing to avoid dangerous omissions:** steps 1–5 above over the whole package (all deterministic,
no model), plus the operative-source gate at dispatch. Interpretation (Pass A/B/verification) can then be selective.
What cannot be made selective: parsing, definitions, amendments, package graph, and the document-wide normative scan —
skipping any of them re-creates one of the B failure classes above (BM-01/09 for the scan, BM-04 for amendments,
BM-03/13 for the package graph, BM-02/05 for definitions).

## Secondary economics (estimates)

| measure | A broad | C hybrid | note |
|---|---|---|---|
| incremental recompilation after Amendment No. 1 restates 7.01(b) (package C) | 4 units without content addressing / 2 with | 2 with content addressing | content-addressed evidence (PR #136 evidence-engine) is what makes either strategy incremental; without it broad recompiles the document |
| cache reuse across two questions on package I (BM-01 then BM-06) | 5 → 5 shared 5 | 5 → 5 shared 5 | the hybrid's two INDEBTEDNESS questions converge on the same closure; a question on another family would share the definitions section and the lead-in only |
| latency | 380 calls serial ≈ 76 min / 8-wide ≈ 10 min | 240 calls ≈ 48 / 6 min | hypothetical, 12 s per call |

## Evidence-based recommendation

1. **Do not ship question-scoped (naive selective) compilation.** It is not materially cheaper than a closure and it
   produced false permissions in 5 of 14 cases, including the one where its answer looks complete.
2. **Adopt the hybrid shape, with the deterministic package pass mandatory and non-skippable**, an omission audit on
   every answer, and a hard stop (no answer) on: unresolved amendment, absent referenced agreement, ambiguous section
   label on any in-scope unit, undefined governing term.
3. **Gate dispatch with operative-source authentication** (PR #136), after fixing PR136-F1/F2/F4 — otherwise the
   hybrid compiles contents lines (BM-07) and stale parent spans (IPV-04).
4. **Keep broad compilation as the reference oracle** in CI over the acceptance corpus: the hybrid is accepted only
   while its restriction/condition recall equals broad's on every case (this is what `benchmark.test.ts` pins).
5. **Do not use a vector/top-k retrieval result as evidence of completeness** anywhere in the product; it may rank
   candidates inside the closure, never define the closure.

## Exact failure cases for Cursor (reproducible: `npx tsx scripts/product-acceptance/benchmark/run.ts`)

| id | package | question | naive scope | material omission | consequence |
|---|---|---|---|---|---|
| BM-01 | I | $40m secured under 7.01(b) | 7.01(b), 7.01, 7.02(b) | 7.02 lien prohibition; 9.15 | PERMITTED instead of limited to $20m/$25m |
| BM-03 | B | $160m under CA 7.01 | CA 7.01, indenture 4.09(a), CA 7.02 | indenture 4.09 FCCR test | ratio test never applied |
| BM-04 | C | 7.01(b) size and 7.01(e) at 2026-06-30 | base 7.01(e), 7.01(b), 7.01 | both amendments | $25m unconditional; deleted basket live |
| BM-09 | D | sell warehouse under 7.05(k) | 7.05(k), 2.05(b), 7.05(c) | section-wide carve-out | facility carve-out lost |
| BM-11 | D | sell the facility under 7.05(k) | 7.05(k), 7.05(l), 2.05(b) | hanging proviso | PERMITTED |
| BM-13 | H | second lien for the Term Loan | 7.02(b), 7.02, 2.01 | Term Loan Agreement absent | answered without the governing document |
| BM-14 | I | basket and how much may be secured | 7.01(b), (a), (d) | 7.02(b), 9.15 | "$50m, all securable" |
| BM-07 | E | what 7.06 permits (A and C) | includes TOC 7.06 | — | contents line dispatched (needs PR #136 gate) |

## Proposed acceptance thresholds for a design-partner pilot (diagnostic targets, not certification)

| gate | diagnostic target (pilot) | formal certification (not proposed here) |
|---|---|---|
| False permissions on the acceptance corpus + benchmark cases | 0 (any one is stop-ship) | would additionally require live-model runs on reserved blind packages |
| Material restriction / condition recall of the selective closure vs broad | equal on every case | — |
| Fail-closed cases (missing document, unresolved amendment, undefined governing term, ambiguous label) | 100 % surfaced as no-answer with reason | — |
| Omission audit | present on every answer; every signalled-but-unexamined unit listed | — |
| Operative-source gate | PR136-F1/F2/F4 closed; contents lines never dispatched | — |
| Cost | report estimated vs measured per package; no target until measured on a live run | — |

Thresholds above are diagnostic: they say when the pilot may proceed with a human reviewer on every unit. They are not
accuracy claims and must not be marketed as such.
