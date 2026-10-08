# Claude agent checkpoint — independent validation & product architecture

**Agent identity / ownership.** Claude Code: independent acceptance, adversarial validation, architecture benchmarking, product readiness and commercial MVP design. Owns `tests/product-acceptance/`, `tests/fixtures/product-acceptance/`, `scripts/product-acceptance/`, `docs/product-readiness/`, `docs/agent-operations/claude-progress.md`. Never edits `lib/`, Cursor-owned remediation files, sealed evidence, CI, shared config, `package.json`.

**Mission.** Determine what Headroom can be trusted to do (correctness, generality, efficiency, commercial usefulness) with independently authored fixtures and expectations; translate verified capability into a product; hand defects to the Cursor track. Provider spend authorized: $0.

**Branch.** `claude/independent-product-validation` (draft PR #137 → main). Baseline `origin/main` @ `9de4e5737166fcec84a35fdc9a3404870549211f`.

**Last verified SHA.** see "Checkpoint log" below (newest first).

## Checkpoint log

| when (UTC) | SHA | what | tests run |
|---|---|---|---|
| 2026-10-08 | batch 9 (this commit + artefacts) | INV-05c scan noise on an amended heading (C): fail-closed, holds (no diagnostic); V2 IPV-24 breadth: B-P4 and H-P5 masked, clean paths 2/2; D13 structural-card criterion in doc 11; self-replenishing pass 5 (W1–W4) | `vitest run tests/product-acceptance` 208 pass / 28 skipped; tsc clean on owned files; pin-check 0 drift; secret scan clean |
| 2026-10-08 | `291855c` + this commit | package N (clean ratio path: N-P1 flip and N-P3 widening certify — IPV-22/IPV-01 2/2 clean paths; N-P2 refused); four manifest-independent structural cards in `auditStructure` (IPV-07 signatures on G 7.03, IPV-06 on H 1.01; kill MUT-17/18/19/21/22); DROP_GATE control refused on A/M/N; **IPV-24** (pro forma evaluation basis dropped with the gate kept certifies on A and N); MUT-21/22 scan noise on H (IPV-07/IPV-23 breadth); runs at `291855ce3f9b` (754: 664/71/19; 22 mutants 15 killed 22/22 held; 18 invariants 39/18) | `vitest run tests/product-acceptance` 208 pass / 28 skipped; tsc clean on owned files; pin-check 0 drift; secret scan clean |
| 2026-10-08 | `091a105` + this commit | milestone report 3 delivered; INV-32 reclassification without a contract edge holds (4/4); INV-09b comparator breadth: A certifies the flip, B/H/M masked; self-replenishing pass 3 → U1–U4; `invariant-runs/091a105` (18 invariants) | `npx vitest run tests/product-acceptance` green; tsc clean; pin-check clean |
| 2026-10-08 | `ade5386` + this commit | INV-18 inflected-term breadth (IPV-09 93% miss, MATERIAL), scan-noise mutants MUT-17…20 (silent merges IPV-07; bogus '7.0' node IPV-23), doc 20 inventory/citation spec; `invariant-runs/ade5386` (17 invariants), `mutation-runs/ade5386` (20 mutants) | `npx vitest run tests/product-acceptance` green (see run); tsc clean; pin-check clean |
| 2026-10-08 | `731f34e` + this commit | T3 package M (definition amendment + side letter + Guarantor/Subsidiary): IPV-19's fail-closed REVIEW masks IPV-16 and IPV-20 false permissions; IPV-21 does not fire (plural 'Guarantors', IPV-09); first acceptance-run signatures for IPV-16 and IPV-20; artefacts `acceptance-runs/731f34e2f9ae` (657: 577/62/18), invariant/mutation/benchmark runs | `npx vitest run tests/product-acceptance` → 193 pass / 28 skipped; tsc clean; pin-check clean |
| 2026-10-08 | `dcfd931` + this commit | T4 First Supplemental Indenture on B (second-instrument amendment resolves ✅; indenture::4.09 stale text → IPV-04 breadth), T5 prompt-size measurement (≈8,400 user-content tokens per unit median; doc 08 estimates low ≈2–3× on input), T6 onboarding doc 19; artefacts `acceptance-runs/dcfd931004c6` (614: 543/54/17), invariant/mutation/benchmark runs | `npx vitest run tests/product-acceptance` → 186 pass / 28 skipped; tsc clean; pin-check clean |
| 2026-10-08 | `4400694` + this commit | T1: package I on-disk definition amendment (IPV-19 now in the acceptance run incl. the 1.01 definitions candidate losing every other definition); F amendment tried and reverted (masked IPV-02); definition-currency audit (IPV-05 consequence on H); T2: SET_POSTURE / SET_PERCENT, INV-28b refused ×2; artefacts `acceptance-runs/440069481941` (609: 539/53/17), `invariant-runs/…` (16 invariants, 33/16), `mutation-runs/…`, `benchmark-runs/…` (410/270 calls) | `npx vitest run tests/product-acceptance` → 186 pass / 28 skipped; tsc clean; pin-check clean |
| 2026-10-08 | this commit | doc 18 workflow analyses (four workflows, assumptions labelled, every Headroom claim cites an artefact or register id); self-replenishing backlog pass in doc 16 → T1–T6 | docs only; suite unchanged (186 pass / 28 skipped) |
| 2026-10-08 | `66b868e` + this commit | milestone report 2 delivered; batch 6: SET_RATIO mutation kind, INV-09b — flipped ratio comparator CERTIFIED on A 7.01(c) (IPV-22 extended to direction), raised threshold refused; `invariant-runs/66b868e` (15 invariants) | `npx vitest run tests/product-acceptance` → 186 pass / 28 skipped; tsc clean; pin-check clean |
| 2026-10-08 | `f45317f` + this commit | invariant batch 5: IPV-22 breadth (H intercreditor 4.01 Availability floor certified as a $15m payment basket; 2 of 5 comparator figures certify), declarative adversarial cases in manifests; `invariant-runs/f45317f` (14 invariants) | `npx vitest run tests/product-acceptance` → 186 pass / 28 skipped; tsc clean; pin-check clean |
| 2026-10-08 | `0285d7b` + this commit | invariant batch 4: IPV-21 breadth 4/33 (INV-19b), IPV-22 gate threshold certified as a $5m cap (INV-25 on the unmasked L variant; L-P1/P3 refused), INV-16 designation observations, MVP §6 criteria 7–9 and W1–W9; `invariant-runs/0285d7b` (13 invariants) | `npx vitest run tests/product-acceptance` → 185 pass / 28 skipped; tsc clean; pin-check clean |
| 2026-10-08 | `31893c6` + this commit | invariant batch 3: IPV-21 false DEFINITION_CYCLE on diamond dependencies (minimal repro on A; I 7.01/7.02/7.04 and L 7.07 re-attributed from IPV-12/14), INV-09 greater-of runtime holds, INV-34 reserved effects refused and not committable; `invariant-runs/31893c6` (10 invariants, 23 PRODUCT verdicts pass / 13 fail, all IPV-19/20/21) | `npx vitest run tests/product-acceptance` → 185 pass / 28 skipped; tsc clean; pin-check clean |
| 2026-10-08 | `f182a67` + this commit | invariant batch 2: INV-05b (definition amendment removing an add-back → IPV-20 now CRITICAL_FALSE_PERMISSION direction; layered on C keeps section amendments intact), package L affiliate transactions (L-P1/P2/P3; refusals masked by CONTEXT_CONTRACT_UNACCEPTABLE), ledger rows 8/16/32 (runtime has no springing construct); artefacts `acceptance-runs/f182a679394b` (604 checks: 539/49/16), `invariant-runs/f182a679394b` (15 pass / 10 fail all IPV-19/20), `mutation-runs/f182a679394b` (unchanged) | `npx vitest run tests/product-acceptance` → 184 pass / 28 skipped; tsc clean; pin-check clean |
| 2026-10-08 | this commit | invariant ledger (doc 17: forty invariants mapped, 24 COVERED / 11 PARTIAL / 2 CHECKED / 1 NOT_STARTED + 6 dedicated checks), `invariants.ts` + `run-invariants.ts` + `invariants.test.ts`; IPV-19 (definition amendment applied to the whole of Section 1.01) and IPV-20 (definition retrieval ignores the operative state); INV-01/03/04/06/37 hold; `invariant-runs/<sha>/` | `npx vitest run tests/product-acceptance` → 177 pass / 28 skipped; tsc clean for owned files |
| 2026-10-08 | `2b018f8` + this commit | harness strengthening: covenant `textSha256` pinning + STRUCTURE audit (MUT-02 now killed), side-letter/consent mutants MUT-13…16 (IPV-16 breadth: A, C, H, I), hybrid closure cross-document back-reference, package K (three-way builder; IPV-17 control), I/J/K adversarial plans, IPV-17 CLOSED (harness false positive), IPV-18 (no family for junior-debt prepayments); artefacts `acceptance-runs/2b018f8a6719` (571 checks: 508/48/15), `mutation-runs/2b018f8a6719` (16 mutants, 9 killed, 16/16 predictions), `benchmark-runs/2b018f8a6719` (unchanged results) | `npx vitest run tests/product-acceptance` → 171 pass / 28 skipped; tsc clean for owned files; `pin-corpus --check` clean |
| 2026-10-08 | `99255ab` + this commit | mutation/acceptance run artefacts, doc 09, matrix refresh; then docs 10–16 (evidence quality scorecard, pilot acceptance criteria, executive assessment, design-partner package, positioning by maturity, proposed paid experiments, recommended next queue), scorecard 04 refreshed, PR #137 description updated | `npx vitest run tests/product-acceptance` → 160 pass / 28 skipped (unchanged; docs only) |
| 2026-10-08 | `83e6bf1` | mutation suite (12 operators, `mutations.ts`, `run-mutations.ts`, `mutations.test.ts`), cross-reference audit in `auditContextRetrieval`, severities MISSING_DEPENDENCY / INCORRECT_AMENDMENT_PRECEDENCE, register IPV-16/IPV-17; follow-up commit: `mutation-runs/83e6bf1d3ce0`, `acceptance-runs/83e6bf1d3ce0` (444 checks: 388/42/14), doc 09, matrix refresh | `npx vitest run tests/product-acceptance` → 160 pass / 28 skipped; `tsc --noEmit` clean for owned files |
| 2026-10-08 | `00977b6` + `0edfd95` | extraction architecture benchmark (`benchmark/`, 14 cases, doc 08), packages I/J, register IPV-15, committed runs `acceptance-runs/00977b674579` (431 checks) and `benchmark-runs/00977b674579` | `npx vitest run tests/product-acceptance` → 136 pass / 28 skipped |
| 2026-10-08 | `3a4925d` | PR #136 challenge (`07-pr136-…`), checkpoint file | `vitest run tests/product-acceptance/source-authority.test.ts` in PR #136 worktree: 22 pass / 6 unmet |
| 2026-10-08 | `bd45b95` | corpus A–H, manifests, runner, auditor, mocked semantic stage, runtime F cases, defect register (14), matrix, scorecard, MVP spec, commercial plan, committed run `acceptance-runs/8f51e2981bd2` | `vitest run tests/product-acceptance` 110 pass; `tsx scripts/product-acceptance/run-all.ts` 360 checks |

## Current task

W1 cross-instrument definition amendment (IPV-20 across instruments), W2 IPV-24 inverse, W3 card precision on real-world layouts, W4 IPV-19 × IPV-06 composition (doc 16 pass 5). Batch 9 (V1–V3) complete. Batch 8 (U1/U2/U4) complete at `291855c`.

Previous — harness strengthening (text-hash pinning, side-letter family, package K, I/J/K adversarial plans).

Previous — queue 8+ docs (10–16), scorecard refresh, PR description. Mutation suite + anti-overfitting audit complete: `09-mutation-and-overfitting.md`, 8/12 mutants killed, IPV-16 (side-letter override invisible to operative state — P0 class) and IPV-17 (asymmetric definition-mediated cross-reference closure) registered; node ids shown positional.

Previous — mutation suite + anti-overfitting audit. Benchmark complete: `08-extraction-architecture-benchmark.md`, `scripts/product-acceptance/benchmark/`, `tests/product-acceptance/benchmark.test.ts`; packages I and J added (register now IPV-01…IPV-15).

Previous — extraction architecture benchmark. PR #136 challenge complete: `07-pr136-source-authority-challenge.md` (22/28 independent expectations hold on `982c3bc`; defects PR136-F1…F4, risks R1–R5).

Previous task — PR #136 source-authority challenge (head `982c3bc3a58425543f8a74e40830e5f1903c1500`, base `cursor/gibraltar-haiku-verify-7cc2`): integration worktree at `/home/user/headroom-pr136` (not committed), acceptance suite re-run against PR #136 lib, unit-level adversarial cases with independent expectations in `tests/product-acceptance/source-authority.test.ts` (skip-safe when the module is absent), write-up in `docs/product-readiness/07-pr136-source-authority-challenge.md`.

## Pending tasks (priority order)

1. P0 — PR #136 challenge (done, doc 07).
2. P0/P3 — extraction architecture benchmark (done, doc 08) (broad vs naive selective vs hybrid) with new adversarial packages (secured debt + lien; RP builder + definition elsewhere; cross-doc ratio; missing document) and 13 completeness cases; cost metrics labelled measured / estimated / projected.
3. P1 — mutation suite + anti-overfitting audit (done, doc 09).
4. P4 — evidence quality scorecard, pilot acceptance gates, executive assessment, design-partner package, positioning by maturity, proposed paid experiments, recommended next queue (done, docs 10–16).
5. P2 — harness strengthening (done at `2b018f8`): textSha256 pinning, side-letter/consent mutants, package K, I/J/K adversarial plans. Follow-ups: an on-disk side-letter package so the acceptance run carries IPV-16; a ratio-bearing-sibling package to pin the bundle-item-type observation.
6. P2 — continuous loop backlog: 40 legal invariants × systematic variation (see directive), CFO/treasury/legal workflow product backlog.

## Blocked tasks

- Anything requiring a live model (discovery Pass B–D, reviewer effectiveness, real extraction quality): $0 authorization. Proposed paid experiment recorded in `docs/product-readiness/08-proposed-paid-experiments.md` when written.

## Known defects (independent register)

`docs/product-readiness/03-defect-register.json` — IPV-01…IPV-18 (IPV-17 CLOSED as a harness false positive); run signatures pinned by `tests/product-acceptance/known-defects.test.ts`, MUTATION-evidence signatures by `tests/product-acceptance/mutations.test.ts`.

## Architectural decisions (this track)

- Expectations are authored from source text, never from compiler output; manifests pin fixture hashes.
- Model stages are mocked and labelled; mocked acceptance is never certification evidence.
- Findings carry severity + outcome class + repro; register ↔ run synchronization is enforced by test.

## NEXT_TASK

- Objective: W1 — cross-instrument definition amendment: package O (`pkg-o-cross-instrument-definition`) or an in-memory variation of H: the intercreditor caps payments by reference to the ABL agreement's 'Availability' definition; an ABL amendment restates 'Availability'. Check (a) the amendment attaches to the ABL definition (IPV-19 shape expected), (b) the intercreditor unit's definition bundle carries the amended text (IPV-20 across instruments), (c) the operative state of the intercreditor is unaffected (it was not amended). Then W3 — card precision: two in-memory variations (page numbers between clauses; numbered '(1) (2)' clauses) run through `auditStructure` — the four cards must stay silent (OBSERVATION verdicts, kind HARNESS if they fire). Then W2 — IPV-24 inverse on a variation of N without 'pro forma'.
- Files: `tests/fixtures/product-acceptance/packages/pkg-o-*/` (or `scripts/product-acceptance/invariants.ts` INV-20b / INV-24b / INV-23c), tests package count if a package is added, `03-defect-register.json`, `02`, `17`, `16`, `01`, this file.
- First step: read H's intercreditor 4.01 and ABL 'Availability' definition; author `abl-amendment-1.txt` as an in-memory `variation()` first (cheaper than a package); run `runDeterministicStages` + `bundleFor` on the intercreditor unit; classify.
- Expected output: an IPV-20 cross-instrument signature (or a hold), card-precision verdicts (silent or a harness fix), IPV-24 inverse verdict.
- Acceptance: suite green; pin-check clean; commit with trailers; push; checkpoint updated; PR #137 description refreshed.
- Dependencies: none (offline).

Then (P2): harness strengthening (text-hash pinning per covenant, three-section definition fixture, waiver/side-letter fixture family), then the continuous-loop invariant backlog.

Historical — PR #136 challenge — unit adversarial cases, integration diff of findings main vs PR #136, write-up with handoffs.
- Files: `tests/product-acceptance/source-authority.test.ts`, `docs/product-readiness/07-pr136-source-authority-challenge.md`.
- First step: `git -C /home/user/headroom worktree add --detach /home/user/headroom-pr136 pr/136` (fetch `refs/pull/136/head`), copy harness dirs in, `npx tsx scripts/product-acceptance/run-all.ts --out <scratch>`.
- Expected output: list of findings that changed between main and PR #136; classification of the authority gate's refusals/acceptances per case.
- Acceptance: write-up lists tested SHA, cases, expected vs actual, confirmed defects, false positives, risks, commands; tests pass on main (skipped where module absent) and in the worktree.
- Dependencies: none (offline).
