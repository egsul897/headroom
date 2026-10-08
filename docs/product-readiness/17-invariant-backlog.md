# Invariant backlog ledger (the directive's forty)

The all-day directive lists forty legal-intelligence invariants to keep building independent coverage for. This ledger
is the record: for each, the status at the current branch head, the artefact that carries the evidence, and the
verdict. Statuses: COVERED (an independently authored expectation exists and is pinned by a test), PARTIAL (some
expectation exists; a named gap remains), CHECKED (a dedicated invariant check in `scripts/product-acceptance/invariants.ts`),
NOT_STARTED. Verdicts come from the committed runs (`acceptance-runs/`, `benchmark-runs/`, `mutation-runs/`,
`invariant-runs/`); nothing here is inferred from compiler output. Runner: `npx tsx scripts/product-acceptance/run-invariants.ts`.

| # | invariant (directive wording) | status | artefact / expectation | verdict |
|---|---|---|---|---|
| 1 | Debt-incurrence covenants | COVERED | A/B/C/G/I/K manifests (7.01 families), BM-01/03/04/12/14 | deterministic layers correct on clean text; IPV-01 (scope), IPV-04 (stale section), IPV-16 (override) open |
| 2 | Lien covenants | COVERED | A 7.02, H 7.02, I 7.02/9.15, BM-01/13/14 | section-level retrieval sees the Article IX cap (INV-04); clause-level does not (observation) |
| 3 | Restricted payments | COVERED | E 7.06, F 7.06, G 7.04 (truncated), J/K 7.06 | truncated clause refused (G-P5); builder pool representation gap IPV-15 |
| 4 | Investments | COVERED | F 7.08, G 7.03 (mislabelled heading), H 7.03, J/K 7.08 | G-P3 family mislabel refused |
| 5 | Asset sales | COVERED | D 7.05 (gates, hanging proviso, sweep), BM-09/11 | hanging proviso reaches every clause (INV-01 ✅); IPV-13 ontology |
| 6 | Guarantees | PARTIAL | I 7.04 (non-guarantor subsidiary prohibition) | certification fails closed for an unrelated reason (Subsidiary definition cycle); no adversarial plan yet |
| 7 | Affiliate transactions | COVERED | package L (`pkg-l-affiliate-transactions`): arm's-length gate, Loan-Party carve-out, capped management-fee basket with no-Default proviso, board-approval threshold; L-P1/P2/P3 adversarial | structure, definitions, Pass A, retrieval all pass; faithful 7.07 REVIEW because of the false cycle IPV-21 ('Loan Parties → Subsidiary → Loan Parties'), plus one inventory item the mock did not represent; every adversarial case refused, but each refusal cites CONTEXT_CONTRACT_UNACCEPTABLE from that false cycle, so the refusals are not evidence that the gates caught the claim |
| 8 | Financial maintenance covenants | PARTIAL | H 7.11 (springing FCCR), B indenture 4.09 ratio test | H-P5 refused; runtime evaluation NOT_TESTED and not feasible offline: no springing / activation construct exists in `lib/contract-model/runtime` (grep: none), so a fixture IR cannot express 'active only while Availability < threshold' (capability gap, recorded) |
| 9 | Ratio-based baskets | CHECKED | A 7.01(c), B 4.09, F-R2/R2c/R3; INV-09 greater-of (✅); INV-09b comparator flipped / threshold raised | runtime honest ✅; IPV-01 scope widening certifies; **IPV-22**: A 7.01(c) with the comparator flipped ('at least 3.50' for 'does not exceed 3.50') is CERTIFIED; a raised threshold (4.50) is refused; B 4.09 flipped is masked by its genuine cycle |
| 10 | Fixed-dollar baskets | COVERED | every package; MUT-01/11 threshold changes killed | ✅ |
| 11 | Builder baskets | PARTIAL | H 7.03(b), J/K Available Amount | retrieval complete (K control); representation IPV-15; runtime builder NOT_TESTED |
| 12 | Available amount calculations | PARTIAL | J/K definitions with netting + Default kill-switch | definition-sourced conditions refused when dropped (J-P1 ✅); runtime calc NOT_TESTED |
| 13 | Shared capacity | PARTIAL | E 7.01 'together with', F 7.06/7.08 shared pool (runtime ✅), J/K definition-mediated | IPV-02 (dropped cap certifies), IPV-15 |
| 14 | Entity restrictions | COVERED | I 7.01(b)/(c) entity-limited baskets, A 7.01(c) 'of the Borrower', BM-06 | IPV-01 |
| 15 | Guarantor vs non-guarantor | COVERED | I 7.01(b) Guarantors / 7.01(c) Foreign Subsidiaries / 7.04 | MUT-07 scope change killed at STRUCTURE; semantic scope only at mocked stage |
| 16 | Restricted vs unrestricted subsidiaries | PARTIAL | B indenture (Restricted/Unrestricted Subsidiary definitions), B-P3; INV-16 (board resolution designating an Unrestricted Subsidiary, in memory); semantic-stage entity scope after a designation is not separable offline (the faithful plan carries no exclusion to omit, and B-P3 already covers widening) | B-P3 refused; INV-16 observations: the package graph models the resolution as a standalone instrument (`instrument:designation-resolution`) with a REVIEW_REQUIRED lead to the indenture and no effect — fail-safe but wrong shape; the hybrid closure does not pull it in (evaluation-model gap, no family cue for designations). Entity-scope effects remain semantic and untested |
| 17 | Cross-document restrictions | COVERED | B (indenture FCCR; First Supplemental Indenture restating 4.09(c) — T4), H (intercreditor, missing Term Loan Agreement), BM-03/13 | missing document fails closed ✅; IPV-05 unresolved amendment; T4: an amendment targeting the second instrument resolves and applies to the right instrument ✅ (4.09(c) SUPERSEDED at 2026-06-30, CURRENT at 2026-03-31, credit agreement untouched) while the section-level 4.09 candidate still compiles on stale text (IPV-04 breadth) |
| 18 | Defined-term dependencies | COVERED | all manifests dependsOnTerms; context audits | IPV-09 (plurals), IPV-10 (depth-2) |
| 19 | Circular definitions | CHECKED | INV-19: B indenture true cycle (positive control ✅); A-variation diamond, I 7.01, L 7.07 | **IPV-21**: a diamond dependency is reported as a cycle; I 7.01/7.02/7.04 and L 7.07 certification blocked by a false refusal (previously mis-attributed to IPV-12) |
| 20 | Missing definitions | COVERED | D 'Specified Strategic Transaction', G 'Permitted Refinancing Indebtedness', J EBITDA/Total Debt | D-P4/G-P4/J-P3 refused ✅ |
| 21 | Amendment precedence | CHECKED | C (two amendments), MUT-05/11/14, INV-06 (conditional effectiveness ✅), INV-05b (definition amendment layered on C), package I on-disk Amendment No. 1 ('Foreign Subsidiary') | ✅ for section restate/delete with dates and the layered case keeps prior section amendments intact; **IPV-19** definition amendment mis-targeted to the whole section in both directions, now on disk (I: 2 operative-state rows + the 1.01 definitions candidate loses every other definition) |
| 22 | Superseded language | COVERED | C-P1 refused; IPV-04 stale section text (C; now also B indenture 4.09 after T4); MUT-11 | IPV-04 open, two instruments |
| 23 | TOC contamination | COVERED | E, BM-07, PR136-F1 | fail-closed (IPV-11) on certified path; TOC modal authenticated by PR #136 gate (F1) |
| 24 | Nested clause numbering | COVERED | E 4-level nesting, G dropped letter, H inline (i)/(ii) in definitions | IPV-06/07 |
| 25 | Ambiguous qualitative gates | CHECKED | D 7.05(k) gates, H Payment Conditions; INV-25 (L 7.07(d) board-approval gate with an 'in excess of $5,000,000' threshold, run on an L variant without the IPV-21 diamond) | IPV-13 ontology misreads; H-P3 lineage-on-rule certifies (IPV-03); **IPV-22**: the gate's threshold is certified as a $5,000,000 cap; L-P1 (both variants) and L-P3 are refused once unmasked |
| 26 | Missing provisos | COVERED | A-P1, C-P4, D-P1, H-P3/4/5, MUT-02 (added proviso now killed by text hash) | IPV-03 |
| 27 | Independent restrictions | COVERED | D 7.05(k)(i)–(iii) independent conditions, BM-09 | ✅ in closure; semantic only mocked |
| 28 | Incorrect unlimited capacity | COVERED | E-P3, G-P5 (refused ✅); INV-25 L-P2 and INV-25b H-T2 (thresholds certified as capacity ❌ IPV-22); H-T1/H-T3 refused for accountability reasons | the deterministic gates verify figures and excerpts, not the comparator or the role of a figure: 2 of the 5 comparator-introduced dollar figures in the corpus certify as caps |
| 29 | Missing financial inputs | COVERED | F-R3, F-R2c, INV-09 (greater-of without the metric → NEEDS_INPUT, never the floor as a figure) | NEEDS_INPUT ✅ |
| 30 | FX mismatch | COVERED | F 7.01(f) EUR, F-P4 refused, runtime 'EUR not converted' | ✅ |
| 31 | Historical ledger usage | COVERED | F-R1 (ledger subtraction), duplicate-usage quarantine | ✅ |
| 32 | Reclassification authority | PARTIAL | F 7.01(g) reclassification unit (expected not COMPLETE), F-U2 | the IR has relationship types for it (RECLASSIFIABLE_TO, REDESIGNATES_TO in `ir/types.ts`); the wire/representation path and the runtime election are NOT_TESTED |
| 33 | Transaction simulation paths | COVERED | F-R simulation (insufficient capacity, explanation traceability) | ✅ |
| 34 | Unsupported transaction effects | CHECKED | INV-34: a transaction stating a reserved effect kind (CHANGE_BALANCE, CHANGE_ENTITY_STATE) alongside a supported CONSUME_CAPACITY | ✅ simulationStatus UNSUPPORTED, limitation UNSUPPORTED_TRANSACTION_EFFECT named, commitPlan not committable and blocked by that code; the supported effect is still evaluated and listed under wouldAppendLedgerRecords (observation: informational only, cannot be committed) |
| 35 | Source citation completeness | COVERED (mocked input) | `auditSemantic`: every compiled rule's provenance excerpt must be a verbatim substring of the operative source (or of the amendment that currently governs it), inventory lineage must cite real items, stale-text check | holds on every faithful submission in `acceptance-runs/`; evidence limited to mocked submissions — a live model's citations are untested |
| 36 | Evidence replayability | COVERED | determinism tests (acceptance, benchmark, mutation, invariant runs) | ✅ |
| 37 | Cache invalidation correctness | CHECKED | INV-37: semantic cache key stable under an upstream insertion, changed when the unit's text changes | ✅ (text-keyed); sourceContentVersion embeds the positional node id (observation, doc 09 §3) |
| 38 | Selective retrieval omissions | COVERED | benchmark B (5 FP, 13 dangerous omissions), BM-14 | ✅ measured |
| 39 | Broad-versus-selective economics | COVERED | benchmark cost estimates (DETERMINISTIC_ESTIMATE), doc 08 §7; T5 offline prompt-size measurement (doc 08 §Prompt-size measurement) | estimates low by ≈2–3× on input tokens (measured user content ≈8,400 tokens per unit median); ranking unaffected; E2 would measure live |
| 40 | Unknown-document generalization | PARTIAL | H (unseen composition), K (unseen family) | H exposed IPV-05/06/10; K exposed IPV-18 |

## Dedicated invariant checks (batch 1)

| id | invariant | package | result |
|---|---|---|---|
| INV-01 | hanging proviso qualifies every preceding clause | D | ✅ 4/4 (PROVISO item sourced from 7.05(l) reaches (a), (j), (k); in the section text) |
| INV-03 | same-document "notwithstanding Section X" governs X | A + 7.05 | ✅ 2/2 at section level and in the hybrid closure; clause-level bundle lacks it (observation) |
| INV-04 | Article IX cap governs Article VII baskets | I | ✅ 2/2 at section level; clause-level bundles lack it (observation) |
| INV-05 | definition amended later changes dependents only | A + Amendment No. 1 (three drafting forms) | ❌ F1/F3: effect targets the whole of Section 1.01 (IPV-19), compiler still receives the old definition (IPV-20); F2 fails closed (interpreter) ✅ |
| INV-06 | conditional effectiveness is never applied without evidence | C + Amendment No. 3 | ✅ 3/3 (CONDITIONAL_UNRESOLVED; provision not applied; instrument REVIEW_REQUIRED) |
| INV-37 | cache identity text-keyed | A | ✅ 2/2 |
| INV-19 | diamond dependency is not a cycle; a true cycle still is | A-variation, I, L, B | ❌ A/I/L report a false DEFINITION_CYCLE (**IPV-21**); B true cycle ✅ |
| INV-19b | breadth of IPV-21 across the corpus | all 12 | ❌ 4 of 33 section-level candidates carry a false cycle (I 7.01/7.02/7.04, L 7.07); 1 genuine (B) ✅ |
| INV-25 | a gate threshold is never a cap | L variant | ❌ L-P2 CERTIFIED (**IPV-22**); L-P1 ×2, L-P3 refused ✅ |
| INV-09b | ratio comparator / threshold are source facts | A, B | ❌ A-T1 flipped comparator CERTIFIED (**IPV-22**); A-T2 raised threshold refused ✅; B-T1 masked by the genuine cycle |
| INV-28b | posture flip / changed percentage | F, D | ✅ 2/2 refused (F 7.01(c) at 35%; D 7.05 as a permission) |
| INV-25b | IPV-22 breadth: every comparator-introduced figure submitted as a cap | H | ❌ intercreditor 4.01 Availability floor certified as a $15m payment basket; 7.11 trigger and 7.03(b) definition floor refused (accountability, not comparator) |
| INV-16 | designation resolution recognised as acting on the indenture | B variant | observations only (standalone instrument; not in the closure) |
| INV-09 | 'greater of $X and Y% of metric' | F fixture IR | ✅ 3/3 |
| INV-34 | reserved transaction effect refused explicitly | F fixture IR | ✅ 4/4 (2 observations) |
| INV-05b | definition amendment removing an add-back; definition amendment layered on two section amendments | A, C | ❌ A: mis-targeted (IPV-19) and the compiler keeps the larger definition (IPV-20, CRITICAL_FALSE_PERMISSION direction); C: prior section amendments intact ✅, definition amendment mis-targeted ❌ |

Batches 2–4 done: 5b, 7 (package L), 9, 16 (observations), 19 (IPV-21 + breadth), 25/28 (IPV-22), 34, 35.
Batches 5–6 done: IPV-22 breadth (INV-25b) and direction (INV-09b, SET_RATIO mutation kind); declarative adversarial
cases (`prohibitedClaims[].adversarial`). Next: a definition amendment by 'replacing the words' once a model run is
authorised; comparator cases on every ratio clause in the corpus once IPV-21/IPV-12 masking is removed by Cursor;
product backlog items 1–4 (CFO / treasury / legal / outside-counsel workflow analyses) as docs tied to the artefacts.
