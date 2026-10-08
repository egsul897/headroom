# Acceptance matrix — offline independent validation

Baseline: `origin/main` @ `9de4e5737166fcec84a35fdc9a3404870549211f`. Branch `claude/independent-product-validation`.
Runner: `npx tsx scripts/product-acceptance/run-all.ts` (≈4 s, zero provider calls, no network). The machine-readable
report for the committed run is under `docs/product-readiness/acceptance-runs/<sha>/report.json` with a human
`summary.md` beside it; this page is the reading guide.

## How to read a cell

`pass/checks (F failed) (NT not tested)`. A PASS is an independently authored expectation the production stage met.
A FAIL is a Finding in the report (severity + outcome class + repro); every FAIL is registered in
`03-defect-register.json` and pinned by `tests/product-acceptance/known-defects.test.ts`.

Stage modes in this run:

| stage | mode | meaning of a result |
|---|---|---|
| STRUCTURE, PACKAGE_GRAPH, DISCOVERY_PASS_A, AMENDMENT_DETERMINISTIC, OPERATIVE_STATE, CONTEXT_RETRIEVAL | PRODUCTION | production code over the pinned fixtures |
| DISCOVERY_PASS_B_PLUS | NOT_RUN | needs a provider; the semantic population is **manifest-declared** (capability gap, not coverage evidence) |
| AMENDMENT_INTERPRETER | NOT_RUN / MOCKED | never invoked on this corpus (no ambiguous operations); the mock would answer UNKNOWN_CHANGE |
| SEMANTIC_INVENTORY, SEMANTIC_COMPOSITION | MOCKED | scripted stand-ins feed the **production** normalizer, accountability, provenance binding and composition checks |
| SEMANTIC_VERIFICATION_LAYER1 | PRODUCTION | deterministic verification on the (mocked-input) artefacts |
| SEMANTIC_VERIFICATION_LAYER2 | MOCKED | reviewer and condition-suspicion classifier return **zero findings**; every refusal is a deterministic refusal |
| CERTIFICATION | PRODUCTION | `certifyCandidate`/`certifyPackage`; "CERTIFIED" here means *the deterministic gates did not object* |
| RUNTIME_CAPACITY / RUNTIME_SIMULATION | PRODUCTION | Phase-4 runtime over a **hand-built fixture IR** (package F only) |

Nothing in this run is certification evidence. No live evidence directory was touched.

## Matrix (committed run `acceptance-runs/83e6bf1d3ce0/`, repository SHA `83e6bf1d3ce0`, 444 checks: 388 pass · 42 fail · 14 not tested)

Earlier committed runs: `8f51e2981bd2` (8 packages, 360 checks: 318/30/12), `00977b674579` (10 packages, 431 checks:
376/41/14). The 13 checks added at `83e6bf1` are the cross-reference audits (`context:<id>:cross-references`), one of
which fails (IPV-17). Findings are 42, all registered (IPV-01…IPV-17).

| package | STRUCTURE | OPERATIVE_STATE | DISC_PASS_A | DISC_PASS_B_PLUS | CONTEXT_RETRIEVAL | SEM_COMPOSITION | CERTIFICATION | RUNTIME_CAPACITY | total |
|---|---|---|---|---|---|---|---|---|---|
| a-basic-credit-agreement | 16/16 | 2/2 | 1/1 | 0/1 (1 NT) | 7/7 | 7/7 | 4/6 (2 F) | – | 37/40 |
| b-multi-document | 13/13 | 2/2 | 1/1 | 0/1 (1 NT) | 12/12 | 13/13 | 5/6 (1 F) | – | 46/48 |
| c-amendment-supersession | 7/7 | 7/7 | 1/1 | 0/1 (1 NT) | 7/8 (1 F) | 8/10 (2 F) | 5/6 (1 F) | – | 35/40 |
| d-qualitative-restrictions | 11/11 | 1/1 | 1/1 | 0/1 (1 NT) | 7/8 (1 F) | 6/7 (1 F) | 4/5 (1 F) | – | 30/34 |
| e-structural-ambiguity | 13/14 (1 F) | – | 1/1 | 0/1 (1 NT) | 7/11 (1 F) (3 NT) | 10/11 (1 F) | 8/11 (3 F) | – | 39/49 |
| f-capacity-ledger-honesty | 11/11 | – | 1/1 | 0/1 (1 NT) | 12/14 (2 F) | 10/10 | 4/6 (2 F) | 14/14 | 52/57 |
| g-adversarial-evidence | 9/11 (2 F) | 2/2 | 2/3 (1 F) | 0/1 (1 NT) | 10/12 (1 F) (1 NT) | 10/10 | 8/9 (1 F) | – | 41/48 |
| h-unseen-composition | 18/20 (2 F) | 2/3 (1 F) | 1/1 | 0/1 (1 NT) | 8/9 (1 F) | 10/10 | 9/10 (1 F) | – | 48/54 |
| i-secured-debt-lien | 10/10 | – | 1/1 | 0/1 (1 NT) | 12/17 (5 F) | 12/12 | 0/4 (4 F) | – | 35/45 |
| j-restricted-payments-builder | 10/10 | – | 1/1 | 0/1 (1 NT) | 6/8 (2 F) | 7/7 | 1/2 (1 F) | – | 25/29 |

## Adversarial acceptance (prohibited claims submitted through the mocked model)

Each case submits a representation that asserts one of the manifest's prohibited claims and records whether the
deterministic layers refuse it. "lineage-on-rule" variants keep the dropped unit's inventory item cited on the parent
rule; "pure omission" variants strip it.

| package | refused / cases | accepted (= finding) |
|---|---|---|
| A | 1/3 | A-P1 lineage-on-rule (dropped no-Default proviso), A-P2 (scope widened to any Subsidiary) |
| B | 2/2 | — |
| C | 3/3 | — |
| D | 3/3 | — |
| E | 5/5 | — |
| F | 1/3 | F-P3 both variants (dropped "together with" shared cap) |
| G | 5/5 | — |
| H | 5/6 | H-P3 lineage-on-rule (dropped Payment Conditions gate) |
| I | 0 cases | prohibited claims declared in the manifest (I-P1…) but no scripted adversarial submission authored yet — backlog item, not evidence either way |
| J | 0 cases | as I (J-P1/J-P2 declared; J-P2 "two independent $20m pools" is the claim IPV-15/IPV-17 would let through) |

Refusals worth noting because they are the product doing the right thing: a non-operative recital/exhibit figure
(G-P1), a stale amendment's figure (G-P2), a superseded amount at a later date (C-P1), a figure invented for a
truncated clause (G-P5), an undefined term claimed COMPLETE (D-P4, G-P4), a EUR basket claimed in USD (F-P4), a
mislabelled family/action (G-P3), pure omissions of a material condition (A-P1, C-P4, D-P1, H-P3, H-P4, H-P5).

## Faithful acceptance (a correct representation submitted through the mocked model)

| package | package certification | per-candidate |
|---|---|---|
| A | REVIEW_REQUIRED | 7.01, 7.02, 7.03 CERTIFIED; 1.01 review (definitions candidate observed only) |
| B | FAILED | CA 7.01/7.02 and indenture 4.10 CERTIFIED; indenture 4.09 NOT_CERTIFIED (IPV-12 self-referential definition cycle) |
| C | REVIEW_REQUIRED | 7.02 and clause-level 7.01(b) ok; section-level 7.01 compiled from stale text (IPV-04) |
| D | REVIEW_REQUIRED | 7.05 review (expected: 7.05(l) undefined term, plus IPV-13 ontology gap); 2.05 review (IPV-14) |
| E | FAILED | 0/7 certifiable: TOC duplicates make every reference ambiguous (IPV-11) |
| F | REVIEW_REQUIRED | 7.06/7.08 CERTIFIED; 7.01 review (7.01(f) EUR / 7.01(g) reclassification units not COMPLETE - expected) |
| G | FAILED | 7.04 truncated and 7.01(c) undefined term fail closed (expected); duplicate 7.01 ambiguous (expected); 7.03 review (IPV-07 merged clause) |
| H | FAILED | 7.03 CERTIFIED; 7.11 springing covenant review (expected: undefined FCCR inputs); 7.02 review (undefined Eligible Receivables - expected) |
| I | FAILED | 7.01, 7.02, 7.04 NOT_CERTIFIED (CONTEXT_CONTRACT_UNACCEPTABLE: DEFINITION_CYCLE on "Subsidiary"/"Guarantor" — IPV-12 class); 9.15 Article IX secured cap REVIEW (UNACCOUNTED_MATERIAL_SOURCE — IPV-14) |
| J | FAILED | 7.06 review (MISSING_RULE material — mock did not represent one sibling unit); 7.08 review (IPV-15: dependsOn to 7.06(c) rejected as invented; deterministic root IPV-17) |

## Runtime (package F, production Phase-4 runtime over fixture IR): 14/14

Ledger subtraction, approved-only snapshot policy, exact as-of binding, shared-pool symmetry, EUR not converted,
insufficient-capacity simulation, explicit supersession, duplicate-usage quarantine, explanation traceability,
determinism — all as expected.

## What this matrix does not say

- Nothing about discovery coverage (Pass B–D not run).
- Nothing about model extraction quality (Pass A/B mocked).
- Nothing about Layer-2 reviewer effectiveness (mocked silent) — the deterministic-layer gaps listed as IPV-01/02/03
  may or may not be caught by the live reviewer; this run shows they are not caught without it.
