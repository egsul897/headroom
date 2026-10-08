# Claude agent checkpoint — independent validation & product architecture

**Agent identity / ownership.** Claude Code: independent acceptance, adversarial validation, architecture benchmarking, product readiness and commercial MVP design. Owns `tests/product-acceptance/`, `tests/fixtures/product-acceptance/`, `scripts/product-acceptance/`, `docs/product-readiness/`, `docs/agent-operations/claude-progress.md`. Never edits `lib/`, Cursor-owned remediation files, sealed evidence, CI, shared config, `package.json`.

**Mission.** Determine what Headroom can be trusted to do (correctness, generality, efficiency, commercial usefulness) with independently authored fixtures and expectations; translate verified capability into a product; hand defects to the Cursor track. Provider spend authorized: $0.

**Branch.** `claude/independent-product-validation` (draft PR #137 → main). Baseline `origin/main` @ `9de4e5737166fcec84a35fdc9a3404870549211f`.

**Last verified SHA.** see "Checkpoint log" below (newest first).

## Checkpoint log

| when (UTC) | SHA | what | tests run |
|---|---|---|---|
| 2026-10-08 | `bd45b95` | corpus A–H, manifests, runner, auditor, mocked semantic stage, runtime F cases, defect register (14), matrix, scorecard, MVP spec, commercial plan, committed run `acceptance-runs/8f51e2981bd2` | `vitest run tests/product-acceptance` 110 pass; `tsx scripts/product-acceptance/run-all.ts` 360 checks |

## Current task

Extraction architecture benchmark (task 2 below). PR #136 challenge complete: `07-pr136-source-authority-challenge.md` (22/28 independent expectations hold on `982c3bc`; defects PR136-F1…F4, risks R1–R5).

Previous task — PR #136 source-authority challenge (head `982c3bc3a58425543f8a74e40830e5f1903c1500`, base `cursor/gibraltar-haiku-verify-7cc2`): integration worktree at `/home/user/headroom-pr136` (not committed), acceptance suite re-run against PR #136 lib, unit-level adversarial cases with independent expectations in `tests/product-acceptance/source-authority.test.ts` (skip-safe when the module is absent), write-up in `docs/product-readiness/07-pr136-source-authority-challenge.md`.

## Pending tasks (priority order)

1. P0 — PR #136 challenge (in progress).
2. P0/P3 — extraction architecture benchmark (broad vs naive selective vs hybrid) with new adversarial packages (secured debt + lien; RP builder + definition elsewhere; cross-doc ratio; missing document) and 13 completeness cases; cost metrics labelled measured / estimated / projected.
3. P1 — mutation suite + anti-overfitting audit.
4. P4 — evidence quality scorecard, pilot acceptance gates, executive assessment, design-partner package, capability inventory refresh.

## Blocked tasks

- Anything requiring a live model (discovery Pass B–D, reviewer effectiveness, real extraction quality): $0 authorization. Proposed paid experiment recorded in `docs/product-readiness/08-proposed-paid-experiments.md` when written.

## Known defects (independent register)

`docs/product-readiness/03-defect-register.json` — IPV-01…IPV-14; pinned by `tests/product-acceptance/known-defects.test.ts`.

## Architectural decisions (this track)

- Expectations are authored from source text, never from compiler output; manifests pin fixture hashes.
- Model stages are mocked and labelled; mocked acceptance is never certification evidence.
- Findings carry severity + outcome class + repro; register ↔ run synchronization is enforced by test.

## NEXT_TASK

- Objective: finish PR #136 challenge — unit adversarial cases, integration diff of findings main vs PR #136, write-up with handoffs.
- Files: `tests/product-acceptance/source-authority.test.ts`, `docs/product-readiness/07-pr136-source-authority-challenge.md`.
- First step: `git -C /home/user/headroom worktree add --detach /home/user/headroom-pr136 pr/136` (fetch `refs/pull/136/head`), copy harness dirs in, `npx tsx scripts/product-acceptance/run-all.ts --out <scratch>`.
- Expected output: list of findings that changed between main and PR #136; classification of the authority gate's refusals/acceptances per case.
- Acceptance: write-up lists tested SHA, cases, expected vs actual, confirmed defects, false positives, risks, commands; tests pass on main (skipped where module absent) and in the worktree.
- Dependencies: none (offline).
