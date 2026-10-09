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

## Matrix (committed run `acceptance-runs/514f39617677/`, repository SHA `514f39617677`, 756 checks: 666 pass · 71 fail · 19 not tested)

Earlier committed runs: `8f51e2981bd2` (8 packages, 360: 318/30/12), `00977b674579` (10, 431: 376/41/14),
`83e6bf1d3ce0` (10 + cross-reference audit, 444: 388/42/14), `2b018f8a6719` (11 + clause-text pins, 571: 508/48/15),
`f182a679394b` (12, 604: 539/49/16), `440069481941` (I definition amendment, 609: 539/53/17), `dcfd931004c6` (B
supplemental indenture, 614: 543/54/17), `731f34e2f9ae` (13 + package M, 657: 577/62/18), `291855ce3f9b` (14 + package N, 754: 664/71/19). At `291855c` and after: package N
(a clean ratio path), four manifest-independent structural cards (enumeration-count / enumeration-gap /
embedded-heading / malformed-label), the DROP_GATE control and the A/M/N evaluation-basis cases. Findings are 71, all
registered (IPV-01…IPV-24; IPV-17 closed).

| package | STRUCTURE | OPERATIVE_STATE | DISC_PASS_A | DISC_PASS_B_PLUS | CONTEXT_RETRIEVAL | SEM_COMPOSITION | CERTIFICATION | RUNTIME_CAPACITY | total |
|---|---|---|---|---|---|---|---|---|---|
| a-basic-credit-agreement | 24/24 | 2/2 | 1/1 | 0/1 (1 NT) | 7/7 | 7/7 | 6/10 (4 F) | – | 47/52 |
| b-multi-document | 30/30 | 5/5 | 1/1 | 0/1 (1 NT) | 12/12 | 13/14 (1 F) | 5/6 (1 F) | – | 66/69 |
| c-amendment-supersession | 19/19 | 7/7 | 1/1 | 0/1 (1 NT) | 7/8 (1 F) | 8/10 (2 F) | 5/6 (1 F) | – | 47/52 |
| d-qualitative-restrictions | 19/19 | 1/1 | 1/1 | 0/1 (1 NT) | 7/8 (1 F) | 6/7 (1 F) | 4/5 (1 F) | – | 38/42 |
| e-structural-ambiguity | 24/25 (1 F) | – | 1/1 | 0/1 (1 NT) | 7/11 (1 F) (3 NT) | 10/11 (1 F) | 8/11 (3 F) | – | 50/60 |
| f-capacity-ledger-honesty | 24/24 | – | 1/1 | 0/1 (1 NT) | 12/14 (2 F) | 10/10 | 4/6 (2 F) | 14/14 | 65/70 |
| g-adversarial-evidence | 20/24 (4 F) | 2/2 | 2/3 (1 F) | 0/1 (1 NT) | 10/12 (1 F) (1 NT) | 10/10 | 8/9 (1 F) | – | 52/61 |
| h-unseen-composition | 33/36 (3 F) | 2/3 (1 F) | 1/1 | 0/1 (1 NT) | 8/10 (2 F) | 10/10 | 9/10 (1 F) | – | 63/71 |
| i-secured-debt-lien | 26/26 | 0/2 (2 F) | 1/1 | 0/1 (1 NT) | 12/18 (5 F) (1 NT) | 11/12 (1 F) | 1/5 (4 F) | – | 51/65 |
| j-restricted-payments-builder | 19/19 | – | 1/1 | 0/1 (1 NT) | 7/8 (1 F) | 7/7 | 4/5 (1 F) | – | 38/41 |
| k-three-way-builder | 22/22 | – | 1/1 | 0/1 (1 NT) | 9/11 (2 F) | 5/7 (2 F) | 2/5 (3 F) | – | 39/47 |
| l-affiliate-transactions | 17/17 | – | 1/1 | 0/1 (1 NT) | 5/5 | 6/6 | 4/5 (1 F) | – | 33/35 |
| m-composed-p0 | 21/21 | 3/6 (3 F) | 1/1 | 0/1 (1 NT) | 6/8 (2 F) | 6/7 (1 F) | 5/7 (2 F) | – | 42/51 |
| n-clean-ratio | 16/16 | – | 1/1 | 0/1 (1 NT) | 5/5 | 6/6 | 5/9 (4 F) | – | 33/38 |
Invariant checks (`invariant-runs/514f39617677/`): 19 invariants, 40 PRODUCT verdicts pass / 18 fail — every
failure is IPV-19/20/21/22. Mutation suite: 22 mutants, 15 killed, 22/22 predictions held. Benchmark: quality unchanged.

## Adversarial acceptance (prohibited claims submitted through the mocked model)

Each case submits a representation that asserts one of the manifest's prohibited claims and records whether the
deterministic layers refuse it. "lineage-on-rule" variants keep the dropped unit's inventory item cited on the parent
rule; "pure omission" variants strip it.

| package | refused / cases | accepted (= finding) |
|---|---|---|
| A | 2/5 | A-P1 lineage-on-rule (dropped no-Default proviso), A-P2 (scope widened to any Subsidiary), A-P5 both variants (7.01(c) condition nodes dropped while the capacity keeps its ratio gate: the pro forma basis vanishes — IPV-24); A-P4 (gate and conditions dropped: 'unconditional unlimited') refused ✅ |
| B | 3/3 | — (B-P4, the indenture FCCR test with its pro forma condition dropped, refused only because 4.09 is NOT_CERTIFIED on the faithful submission too: IPV-12/IPV-04 masking IPV-24) |
| C | 3/3 | — |
| D | 3/3 | — |
| E | 5/5 | — |
| F | 1/3 | F-P3 both variants (dropped "together with" shared cap) |
| G | 5/5 | — |
| H | 5/6 | H-P3 lineage-on-rule (dropped Payment Conditions gate) |
| I | 1/1 | — (I-P2 scope widening refused, but by CONTEXT_CONTRACT_UNACCEPTABLE from the Subsidiary definition cycle, not by the scope guard; I-P1/I-P3 are question-level claims covered by BM-01/BM-14) |
| J | 3/3 | — (J-P1 both variants refused with MATERIAL_DISCREPANCY: the definition-sourced Default kill-switch is accounted for; J-P2 is the IPV-15 representation gap, not expressible) |
| K | 2/2 | — (K-P2 both variants refused; K-P1 as J-P2) |
| L | 4/4 | — (L-P1 both variants, L-P2, L-P3 refused; every refusal cites CONTEXT_CONTRACT_UNACCEPTABLE from the false cycle IPV-21, so these are not evidence the gates caught the claims) |
| M | 3/3 | — (M-P1 '$40,000,000 after the side letter', M-P4 and M-P5 all refused only because IPV-19's Section 1.01 replacement makes the unit's operative evidence unresolved: a fail-closed defect masking a false permission and the IPV-24 omission) |
| N | 2/5 | N-P1 (comparator flipped on 7.01(c): IPV-22 on a second clean path), N-P3 (scope widened to any Subsidiary: IPV-01 on a second clean path), N-P5 both variants (IPV-24); N-P2 (threshold raised to 3.50) and N-P4 (gate dropped) refused ✅ |

Refusals worth noting because they are the product doing the right thing: a non-operative recital/exhibit figure
(G-P1), a stale amendment's figure (G-P2), a superseded amount at a later date (C-P1), a figure invented for a
truncated clause (G-P5), an undefined term claimed COMPLETE (D-P4, G-P4), a EUR basket claimed in USD (F-P4), a
mislabelled family/action (G-P3), pure omissions of a material condition (A-P1, C-P4, D-P1, H-P3, H-P4, H-P5), a
ratio basket presented with no test at all (A-P4, M-P4, N-P4: UNACCOUNTED_MATERIAL_SOURCE), a raised ratio threshold
(A-T2, N-P2).

## Faithful acceptance (a correct representation submitted through the mocked model)

| package | package certification | per-candidate |
|---|---|---|
| A | REVIEW_REQUIRED | 7.01, 7.02, 7.03 CERTIFIED; 1.01 review (definitions candidate observed only) |
| B | FAILED | CA 7.01/7.02 and indenture 4.10 CERTIFIED; indenture 4.09 NOT_CERTIFIED (IPV-12 self-referential definition cycle) and, after the First Supplemental Indenture, compiled on text still carrying the superseded $50,000,000 (IPV-04 on the second instrument) |
| C | REVIEW_REQUIRED | 7.02 and clause-level 7.01(b) ok; section-level 7.01 compiled from stale text (IPV-04) |
| D | REVIEW_REQUIRED | 7.05 review (expected: 7.05(l) undefined term, plus IPV-13 ontology gap); 2.05 review (IPV-14) |
| E | FAILED | 0/7 certifiable: TOC duplicates make every reference ambiguous (IPV-11) |
| F | REVIEW_REQUIRED | 7.06/7.08 CERTIFIED; 7.01 review (7.01(f) EUR / 7.01(g) reclassification units not COMPLETE - expected) |
| G | FAILED | 7.04 truncated and 7.01(c) undefined term fail closed (expected); duplicate 7.01 ambiguous (expected); 7.03 review (IPV-07 merged clause) |
| H | FAILED | 7.03 CERTIFIED; 7.11 springing covenant review (expected: undefined FCCR inputs); 7.02 review (undefined Eligible Receivables - expected) |
| I | FAILED | 7.01, 7.02, 7.04 NOT_CERTIFIED (CONTEXT_CONTRACT_UNACCEPTABLE: a FALSE DEFINITION_CYCLE on "Subsidiary"/"Guarantor" — IPV-21); 9.15 REVIEW (IPV-14); 1.01 definitions candidate compiled from the operative text of the replaced section reports every other definition missing (IPV-19 on disk, after Amendment No. 1 restates "Foreign Subsidiary") |
| J | FAILED | 7.06 review (MISSING_RULE material — mock did not represent one sibling unit); 7.08 review (IPV-15: dependsOn to 7.06(c) rejected as invented) |
| K | FAILED | 7.06 and 7.08 review (IPV-14 class: mock did not represent one sibling unit each); 7.09 review (IPV-18: family unrecognised, relabelled) |
| L | REVIEW_REQUIRED | 7.07 review: context contract unacceptable because of a FALSE DEFINITION_CYCLE 'Loan Parties → Subsidiary → Loan Parties' (IPV-21), plus one inventory item the mock did not represent |
| M | FAILED | 7.01 and 7.02 REVIEW (OPERATIVE_STATE_UNACCEPTABLE: the mis-targeted definition amendment leaves every dependent unit with 'partial amendment state' — IPV-19); 1.01 definitions candidate loses every definition (IPV-19); the side letter never reaches the operative state (IPV-16 on disk); 7.01(c) compiled on the pre-amendment EBITDA (IPV-20 on disk) |
| N | REVIEW_REQUIRED | 7.01 and 7.03 CERTIFIED on the faithful submission (the first package whose every covenant certifies); 1.01 definitions candidate observed only — the clean path on which N-P1/N-P3/N-P5 then certify |

## Runtime (package F, production Phase-4 runtime over fixture IR): 14/14

Ledger subtraction, approved-only snapshot policy, exact as-of binding, shared-pool symmetry, EUR not converted,
insufficient-capacity simulation, explicit supersession, duplicate-usage quarantine, explanation traceability,
determinism — all as expected.

## What this matrix does not say

- Nothing about discovery coverage (Pass B–D not run).
- Nothing about model extraction quality (Pass A/B mocked).
- Nothing about Layer-2 reviewer effectiveness (mocked silent) — the deterministic-layer gaps listed as IPV-01/02/03
  may or may not be caught by the live reviewer; this run shows they are not caught without it.
