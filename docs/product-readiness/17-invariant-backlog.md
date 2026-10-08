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
| 7 | Affiliate transactions | NOT_STARTED | — | — |
| 8 | Financial maintenance covenants | PARTIAL | H 7.11 (springing FCCR), B indenture 4.09 ratio test | H-P5 refused; maintenance test evaluation at runtime NOT_TESTED |
| 9 | Ratio-based baskets | COVERED | A 7.01(c), B 4.09, F-R2/R2c/R3 (approved snapshot, exact as-of, NEEDS_INPUT) | runtime honest; IPV-01 scope widening certifies |
| 10 | Fixed-dollar baskets | COVERED | every package; MUT-01/11 threshold changes killed | ✅ |
| 11 | Builder baskets | PARTIAL | H 7.03(b), J/K Available Amount | retrieval complete (K control); representation IPV-15; runtime builder NOT_TESTED |
| 12 | Available amount calculations | PARTIAL | J/K definitions with netting + Default kill-switch | definition-sourced conditions refused when dropped (J-P1 ✅); runtime calc NOT_TESTED |
| 13 | Shared capacity | PARTIAL | E 7.01 'together with', F 7.06/7.08 shared pool (runtime ✅), J/K definition-mediated | IPV-02 (dropped cap certifies), IPV-15 |
| 14 | Entity restrictions | COVERED | I 7.01(b)/(c) entity-limited baskets, A 7.01(c) 'of the Borrower', BM-06 | IPV-01 |
| 15 | Guarantor vs non-guarantor | COVERED | I 7.01(b) Guarantors / 7.01(c) Foreign Subsidiaries / 7.04 | MUT-07 scope change killed at STRUCTURE; semantic scope only at mocked stage |
| 16 | Restricted vs unrestricted subsidiaries | PARTIAL | B indenture (Restricted/Unrestricted Subsidiary definitions), B-P3 | B-P3 refused; designation mechanics NOT_TESTED |
| 17 | Cross-document restrictions | COVERED | B (indenture FCCR), H (intercreditor, missing Term Loan Agreement), BM-03/13 | missing document fails closed ✅; IPV-05 unresolved amendment |
| 18 | Defined-term dependencies | COVERED | all manifests dependsOnTerms; context audits | IPV-09 (plurals), IPV-10 (depth-2) |
| 19 | Circular definitions | COVERED | B indenture self-reference (IPV-12), I 'Subsidiary' cycle | fail-closed (DEFINITION_CYCLE) |
| 20 | Missing definitions | COVERED | D 'Specified Strategic Transaction', G 'Permitted Refinancing Indebtedness', J EBITDA/Total Debt | D-P4/G-P4/J-P3 refused ✅ |
| 21 | Amendment precedence | CHECKED | C (two amendments), MUT-05/11/14, INV-06 (conditional effectiveness ✅) | ✅ for section restate/delete with dates; **IPV-19** definition amendment mis-targeted to the whole section |
| 22 | Superseded language | COVERED | C-P1 refused; IPV-04 stale section text; MUT-11 | IPV-04 open |
| 23 | TOC contamination | COVERED | E, BM-07, PR136-F1 | fail-closed (IPV-11) on certified path; TOC modal authenticated by PR #136 gate (F1) |
| 24 | Nested clause numbering | COVERED | E 4-level nesting, G dropped letter, H inline (i)/(ii) in definitions | IPV-06/07 |
| 25 | Ambiguous qualitative gates | COVERED | D 7.05(k) gates, H Payment Conditions | IPV-13 ontology misreads; H-P3 lineage-on-rule certifies (IPV-03) |
| 26 | Missing provisos | COVERED | A-P1, C-P4, D-P1, H-P3/4/5, MUT-02 (added proviso now killed by text hash) | IPV-03 |
| 27 | Independent restrictions | COVERED | D 7.05(k)(i)–(iii) independent conditions, BM-09 | ✅ in closure; semantic only mocked |
| 28 | Incorrect unlimited capacity | COVERED | E-P3, G-P5 | refused ✅ |
| 29 | Missing financial inputs | COVERED | F-R3, F-R2c | NEEDS_INPUT ✅ |
| 30 | FX mismatch | COVERED | F 7.01(f) EUR, F-P4 refused, runtime 'EUR not converted' | ✅ |
| 31 | Historical ledger usage | COVERED | F-R1 (ledger subtraction), duplicate-usage quarantine | ✅ |
| 32 | Reclassification authority | PARTIAL | F 7.01(g) reclassification unit (expected not COMPLETE) | representation NOT_TESTED beyond refusal |
| 33 | Transaction simulation paths | COVERED | F-R simulation (insufficient capacity, explanation traceability) | ✅ |
| 34 | Unsupported transaction effects | PARTIAL | F manifest `unsupported` constructs with acceptable outcomes | outcomes within the acceptable set; no simulation of unsupported effects |
| 35 | Source citation completeness | PARTIAL | semantic audit provenance checks (verbatim excerpts, inventory lineage), stale-text check | mocked submissions only |
| 36 | Evidence replayability | COVERED | determinism tests (acceptance, benchmark, mutation, invariant runs) | ✅ |
| 37 | Cache invalidation correctness | CHECKED | INV-37: semantic cache key stable under an upstream insertion, changed when the unit's text changes | ✅ (text-keyed); sourceContentVersion embeds the positional node id (observation, doc 09 §3) |
| 38 | Selective retrieval omissions | COVERED | benchmark B (5 FP, 13 dangerous omissions), BM-14 | ✅ measured |
| 39 | Broad-versus-selective economics | COVERED | benchmark cost estimates (DETERMINISTIC_ESTIMATE), doc 08 §7 | estimates only; E2 would measure |
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

Next batch (by priority-0 relevance): 7 affiliate transactions (fixture), 16 designation mechanics, 32 reclassification
representation, 34 unsupported-effect simulation, 8 maintenance test at runtime; and a definition amendment that
*removes* an add-back (the false-permission direction of IPV-19/20).
