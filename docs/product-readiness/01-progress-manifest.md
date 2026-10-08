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
| 13 | invariant batch 5: comparator-direction adversarial cases across packages (IPV-22 breadth); designation entity-scope at the semantic stage; milestone report | next |

Known limits of the evidence produced here: model stages are mocked (labelled MOCKED everywhere), discovery Pass B–D
not run, runtime over fixture IR. See `02-acceptance-matrix.md` "What this matrix does not say".
