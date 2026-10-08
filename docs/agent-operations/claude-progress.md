# Claude agent checkpoint — independent validation & product architecture

**Agent identity / ownership.** Claude Code: independent acceptance, adversarial validation, architecture benchmarking, product readiness and commercial MVP design. Owns `tests/product-acceptance/`, `tests/fixtures/product-acceptance/`, `scripts/product-acceptance/`, `docs/product-readiness/`, `docs/agent-operations/claude-progress.md`. Never edits `lib/`, Cursor-owned remediation files, sealed evidence, CI, shared config, `package.json`.

**Mission.** Determine what Headroom can be trusted to do (correctness, generality, efficiency, commercial usefulness) with independently authored fixtures and expectations; translate verified capability into a product; hand defects to the Cursor track. Provider spend authorized: $0.

**Branch.** `claude/independent-product-validation` (draft PR #137 → main). Baseline `origin/main` @ `9de4e5737166fcec84a35fdc9a3404870549211f`.

**Last verified SHA.** see "Checkpoint log" below (newest first).

## Checkpoint log

| when (UTC) | SHA | what | tests run |
|---|---|---|---|
| 2026-10-08 | this commit | invariant ledger (doc 17: forty invariants mapped, 24 COVERED / 11 PARTIAL / 2 CHECKED / 1 NOT_STARTED + 6 dedicated checks), `invariants.ts` + `run-invariants.ts` + `invariants.test.ts`; IPV-19 (definition amendment applied to the whole of Section 1.01) and IPV-20 (definition retrieval ignores the operative state); INV-01/03/04/06/37 hold; `invariant-runs/<sha>/` | `npx vitest run tests/product-acceptance` → 177 pass / 28 skipped; tsc clean for owned files |
| 2026-10-08 | `2b018f8` + this commit | harness strengthening: covenant `textSha256` pinning + STRUCTURE audit (MUT-02 now killed), side-letter/consent mutants MUT-13…16 (IPV-16 breadth: A, C, H, I), hybrid closure cross-document back-reference, package K (three-way builder; IPV-17 control), I/J/K adversarial plans, IPV-17 CLOSED (harness false positive), IPV-18 (no family for junior-debt prepayments); artefacts `acceptance-runs/2b018f8a6719` (571 checks: 508/48/15), `mutation-runs/2b018f8a6719` (16 mutants, 9 killed, 16/16 predictions), `benchmark-runs/2b018f8a6719` (unchanged results) | `npx vitest run tests/product-acceptance` → 171 pass / 28 skipped; tsc clean for owned files; `pin-corpus --check` clean |
| 2026-10-08 | `99255ab` + this commit | mutation/acceptance run artefacts, doc 09, matrix refresh; then docs 10–16 (evidence quality scorecard, pilot acceptance criteria, executive assessment, design-partner package, positioning by maturity, proposed paid experiments, recommended next queue), scorecard 04 refreshed, PR #137 description updated | `npx vitest run tests/product-acceptance` → 160 pass / 28 skipped (unchanged; docs only) |
| 2026-10-08 | `83e6bf1` | mutation suite (12 operators, `mutations.ts`, `run-mutations.ts`, `mutations.test.ts`), cross-reference audit in `auditContextRetrieval`, severities MISSING_DEPENDENCY / INCORRECT_AMENDMENT_PRECEDENCE, register IPV-16/IPV-17; follow-up commit: `mutation-runs/83e6bf1d3ce0`, `acceptance-runs/83e6bf1d3ce0` (444 checks: 388/42/14), doc 09, matrix refresh | `npx vitest run tests/product-acceptance` → 160 pass / 28 skipped; `tsc --noEmit` clean for owned files |
| 2026-10-08 | `00977b6` + `0edfd95` | extraction architecture benchmark (`benchmark/`, 14 cases, doc 08), packages I/J, register IPV-15, committed runs `acceptance-runs/00977b674579` (431 checks) and `benchmark-runs/00977b674579` | `npx vitest run tests/product-acceptance` → 136 pass / 28 skipped |
| 2026-10-08 | `3a4925d` | PR #136 challenge (`07-pr136-…`), checkpoint file | `vitest run tests/product-acceptance/source-authority.test.ts` in PR #136 worktree: 22 pass / 6 unmet |
| 2026-10-08 | `bd45b95` | corpus A–H, manifests, runner, auditor, mocked semantic stage, runtime F cases, defect register (14), matrix, scorecard, MVP spec, commercial plan, committed run `acceptance-runs/8f51e2981bd2` | `vitest run tests/product-acceptance` 110 pass; `tsx scripts/product-acceptance/run-all.ts` 360 checks |

## Current task

Invariant batch 2 (task 6 below). Batch 1 complete: ledger doc 17, six dedicated checks, IPV-19/IPV-20 registered.

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

- Objective: invariant batch 2 — (a) INV-05b: a definition amendment that REMOVES an add-back (false-permission direction of IPV-19/20) and one that amends a definition in a package with two amendments (C), to see whether mis-targeting compounds; (b) INV-07 affiliate-transactions covenant fixture (new family in the corpus; ledger #7 NOT_STARTED); (c) INV-16 unrestricted-subsidiary designation mechanics (B indenture: a designation resolution document and its effect on entity scope); (d) INV-32 reclassification representation (F 7.01(g)): faithful submission with an explicit reclassification election and the refusal/representation outcome; (e) INV-08 maintenance covenant at runtime: H 7.11 springing FCCR evaluated with and without the availability trigger (fixture IR like runtime-f.ts, labelled hand-built).
- Files: `scripts/product-acceptance/invariants.ts` (INV-05b, INV-16, INV-32), `tests/fixtures/product-acceptance/packages/pkg-l-affiliate-transactions/` (new, with manifest + pins), `scripts/product-acceptance/runtime-h.ts` (if (e) is feasible with the Phase-4 runtime), `docs/product-readiness/17-invariant-backlog.md`, register.
- First step: INV-05b in `invariants.ts` (copy INV-05 with NEW_EBITDA lacking "income tax expense"); run; register the direction-specific signature under IPV-19/20 or a new entry if the behaviour differs.
- Expected output: ledger rows 5, 7, 8, 16, 21, 32 updated with artefacts; any new finding registered; runs re-recorded.
- Acceptance: `npx vitest run tests/product-acceptance` green; `pin-corpus --check` clean; commit + push; checkpoint updated.
- Dependencies: none (offline).

Then (P2): harness strengthening (text-hash pinning per covenant, three-section definition fixture, waiver/side-letter fixture family), then the continuous-loop invariant backlog.

Historical — PR #136 challenge — unit adversarial cases, integration diff of findings main vs PR #136, write-up with handoffs.
- Files: `tests/product-acceptance/source-authority.test.ts`, `docs/product-readiness/07-pr136-source-authority-challenge.md`.
- First step: `git -C /home/user/headroom worktree add --detach /home/user/headroom-pr136 pr/136` (fetch `refs/pull/136/head`), copy harness dirs in, `npx tsx scripts/product-acceptance/run-all.ts --out <scratch>`.
- Expected output: list of findings that changed between main and PR #136; classification of the authority gate's refusals/acceptances per case.
- Acceptance: write-up lists tested SHA, cases, expected vs actual, confirmed defects, false positives, risks, commands; tests pass on main (skipped where module absent) and in the worktree.
- Dependencies: none (offline).
