# Progress manifest — independent product validation

Branch `claude/independent-product-validation` from `origin/main` @ `9de4e5737166fcec84a35fdc9a3404870549211f`.
Collaboration contract: no edits under `lib/contract-model/`, no Gibraltar runners, no sealed evidence, no frozen
architecture docs, no shared test configuration, no package.json changes, no merge into main, no rebase onto unmerged
Cursor work. Provider calls: none in this workstream.

| checkpoint | content | status |
|---|---|---|
| 0 | branch, baseline SHA, open-PR inventory, interface map (`00-repository-map.md`) | done |
| 1 | synthetic corpus A–H, expectation manifests, hash pinning, corpus-integrity test | done (`84c3ef8`) |
| 2 | offline acceptance runner (deterministic stages, mocked semantic stage, runtime F), auditor, tests, defect register, matrix, scorecard, MVP spec, commercial plan | done (this commit) |
| 3 | committed acceptance-run artefacts (`acceptance-runs/<sha>/`), progress manifest, draft PR | done (`bd45b95`) |
| 4 | PR #136 source-authority challenge (`07-pr136-source-authority-challenge.md`, `source-authority.test.ts`) | done (`3a4925d`) |
| 5 | extraction architecture benchmark (`08-extraction-architecture-benchmark.md`, `benchmark/`, packages I/J, `benchmark-runs/00977b674579`) | done (`00977b6`, `0edfd95`) |
| 6 | mutation suite + anti-overfitting audit (`09-mutation-and-overfitting.md`, `mutations.ts`, `mutations.test.ts`, `mutation-runs/83e6bf1d3ce0`), cross-reference audit, IPV-16/IPV-17, acceptance run `acceptance-runs/83e6bf1d3ce0` (444 checks) | done (`83e6bf1` + this commit) |
| 7 | evidence quality scorecard, pilot acceptance criteria, executive assessment, design-partner package, positioning by maturity, proposed paid experiments, next queue (docs 10–16), scorecard 04 refresh | done (this commit) |
| 8 | harness strengthening: text-hash pinning, side-letter/consent mutants, package K, I/J/K adversarial plans, IPV-17 closed, IPV-18; runs at `2b018f8a6719` | done (`2b018f8` + this commit) |
| 9 | invariant ledger (`17-invariant-backlog.md`, forty mapped), invariant checks INV-01/03/04/05/06/37 (`invariants.ts`, `invariants.test.ts`), IPV-19/IPV-20 | done (this commit) |
| 10 | invariant batch 2: INV-05b (both directions of the definition-amendment defect), package L (affiliate transactions), ledger rows 8/16/32 assessed; runs at `f182a679394b` | done (`f182a67` + this commit) |
| 11 | invariant batch 3: INV-19 false definition cycle (IPV-21; I/L certification signatures re-attributed), INV-09 greater-of runtime (holds), INV-34 reserved transaction effects (holds); ledger rows 9/19/29/34/35; `invariant-runs/` at `31893c6` | done (`31893c6` + this commit) |
| 12 | invariant batch 4: INV-19b breadth (4/33 blocked by IPV-21), INV-25 unmasked L adversarial (IPV-22: gate threshold certified as a cap), INV-16 designation observations, MVP §6 criteria 7-9 + W1-W9; `invariant-runs/` at `0285d7b` | done (`0285d7b` + this commit) |
| 13 | invariant batch 5: IPV-22 breadth (INV-25b: 2 of 5 comparator figures certify as caps), declarative adversarial cases; `invariant-runs/` at `f45317f` | done (`f45317f` + this commit) |
| 14 | milestone report 2; batch 6: SET_RATIO adversarial kind, INV-09b (flipped comparator certified → IPV-22 direction); `invariant-runs/` at `66b868e` | done (`66b868e` + this commit) |
| 15 | `18-workflow-analyses.md` (CFO / treasury / in-house legal / outside counsel, tied to artefacts and register ids); self-replenishing backlog pass appended to doc 16 (T1–T6) | done (this commit) |
| 16 | T1: on-disk definition amendment on I (IPV-19 on disk; F tried and reverted because it masked IPV-02; A kept as the in-memory lab), definition-currency audit (IPV-05 consequence on H); T2: SET_POSTURE / SET_PERCENT kinds, INV-28b (both refused); runs at `440069481941` | done (`4400694` + this commit) |
| 17 | T4 supplemental indenture on B (resolves on the second instrument; IPV-04 breadth), T5 offline prompt-size measurement (doc 08), T6 `19-onboarding-and-ingestion-assumptions.md`; runs at `dcfd931004c6` | done (`dcfd931` + this commit) |
| 18 | T3 package M: IPV-19's REVIEW masks IPV-16/IPV-20; IPV-21 suppressed by IPV-09; IPV-16/20 on disk; runs at `731f34e2f9ae` (657: 577/62/18) | done (`731f34e` + this commit) |
| 19 | INV-18 inflected-term breadth (IPV-09: 26/28 misses, re-rated MATERIAL), scan-noise mutants MUT-17…20 (IPV-07 breadth, IPV-23), doc 20 inventory + citation spec; runs at `ade5386` | done (`ade5386` + this commit) |
| 20 | milestone report 3; INV-32 reclassification (holds), INV-09b comparator breadth (1 clean path certifies, 3 masked), self-replenishing pass 3 (U1–U4); `invariant-runs/` at `091a105` | done (`091a105` + this commit) |
| 21 | U1 package N (IPV-22/IPV-01 on a second clean path, IPV-24 new); U4 four manifest-independent structural cards (G/H signatures, kill MUT-17/18/19/21/22); U2 MUT-21/22 on H; DROP_GATE control; runs at `291855ce3f9b` (754: 664/71/19; 22 mutants 15 killed; 18 invariants) | done (`291855c` + this commit) |
| 22 | V1 INV-05c scan noise × amendment targeting (fail-closed, holds); V2 IPV-24 breadth (B 4.09 / H 7.11 masked, 2/2 clean paths); V3 criterion D13 | done (`514f396` + this commit) |
| 23 | Cross-branch parser audit of PR #132 / #128 / #136 (doc 21): trees reconciled, Chewy/CONMED/Gibraltar verified, hybrid experiment, integration sequence and gates | done (this commit) |
| 24 | IPV-21 / IPV-16 challenger adjudication against PR #136 @8f87a06 (doc 22): INV-19/19b controls corrected, INV-16b added, auditor severity fix, mutants annotated; IPV-12 re-rated | done (this commit) |
| 25 | PR #161 independent Chewy P0 replay (doc 23) — INDEPENDENT_PARSER_REMEDIATION_PASSED with disclosed limitations | done (this commit) |
| 26 | PR #168 IPV-16 remediation acceptance (doc 24) — IPV16_INDEPENDENT_REMEDIATION_PASSED (section-level path only) | done (this commit) |
| 27 | PR #163 independent parser acceptance (doc 25) — PR163_PARSER_REMEDIATION_REQUIRED; #161 stays the selected correction; #169 blocked. PR #161 merge preparation: disclosure + regression pins pushed to its branch (`4736ea4a`; tip `2c8383fa` after merging main `c51d96c3`), PR body corrected, Gibraltar record pin refresh handed to the Integration Lead | done (this commit) |
| 28 | Doc 21 §11 remainder (INV-04 back-reference path, shared-cap plan, real-fixture IPV rows); then W1–W4 | next |

Known limits of the evidence produced here: model stages are mocked (labelled MOCKED everywhere), discovery Pass B–D
not run, runtime over fixture IR. See `02-acceptance-matrix.md` "What this matrix does not say".
