# Phase 3F.1.6.RX-FINAL — Eight-Defect Terminal Remediation +
Targeted Frozen Recertification

**Verdict: `PHASE_3F_1_6_RX_FINAL_TERMINAL_CLOSURE_FAILED`**

This phase existed to fix exactly the 8 findings the prior phase
(3F.1.6.RX) left open and independently recertify exactly them. Part A
fixed all 8. Part B's 7 independent auditors found 6 still genuinely open.
Production is frozen; per this phase's own charter, this is a **STOP for
human decision**, not a trigger for another automatic remediation phase.

## Mid-phase incident (fully resolved, separate from the product findings)

During Part A, 7 concurrent workstream agents sharing one physical Postgres
database triggered a Company-table wipe via concurrent `prisma migrate dev`
invocations — a hazard this repository's own `docs/CODEX-HANDOFF.md` had
already documented and banned, violated under concurrency pressure. Full
forensics, hardening (a real per-worktree ephemeral-database architecture,
adversarially proven; a static destructive-pattern guard), and recovery
($1.48 in real, user-authorized LLM cost to restore two fixture companies)
are in `docs/test-infrastructure-incident-2026-08-30/` — verdict
`HEADROOM_TEST_INFRASTRUCTURE_RECOVERY_AND_ISOLATION_PASSED`. This is a
**separate dimension** from the product findings below: test infrastructure
trust and product trust are not conflated.

## Part A: production fixes (all 8, all untouched since)

Seven parallel workstreams fixed FINDING-1 (structural heading), FINDING-2/3
(getDefinition operative safety), FINDING-4 (N-way fused claims), FINDING-5
(condition-suspicion architecture), FINDING-6 (AnalysisRun fencing),
FINDING-7 (product-flow gating), FINDING-8 (failure observability). Part A
closed `READY_FOR_RECERTIFICATION` — known-package regression unchanged,
14/14 false-credit controls NO_CREDIT, full quality gates green (240 files,
2515 tests). Production frozen at `f1d1400`.

## Part B: independent recertification — 6 of 8 genuinely still open

Each of 7 auditors was pinned to the frozen commit, forbidden from touching
production code, and required to write fresh adversarial tests (never
rerun Part A's own tests). Explicit new infrastructure-safety rules applied
(no `prisma migrate dev`/`reset`, exact-scoped test cleanup only) given the
mid-phase incident.

| Finding | Disposition | What broke |
|---|---|---|
| 1 — structural heading | **STILL_OPEN** | A footnote digit glued directly onto a bare closing paren/quote (no separate terminal punctuation) is invisible to the noise-stripping regex — reproduces "child re-parented to null" verbatim. |
| 2/3 — getDefinition safety | **STILL_OPEN** | Term-lookup never collapses *internal* whitespace, unlike its own sibling two lines away — a doubled-space term variant returns stale text labeled RESOLVED when the real state is CONFLICTED. |
| 4 — fused claims | **STILL_OPEN** | Oxford-comma lists always collapse to 2 segments; restated-modal chains collapse to 1 (the *original* defect, verbatim). The fix's own O(n) proof is empirically false (quadratic). |
| 5 — condition verification | **STILL_OPEN** | Still a closed word list at finer grain — 7 fresh, realistic phrasings all bypass it, including a direct doc/code mismatch (a claimed-covered word literally absent from the live regex). Fourth consecutive recurrence of this exact architecture mistake. |
| 6 — AnalysisRun fencing | **STILL_OPEN** (partial) | Core AnalysisRun mutators are genuinely fenced. `persistSemanticTruthForInstrument` uses check-then-act, not a CAS — a superseded writer's stale content was reproduced clobbering a new owner's fresh content. |
| 7 — product-flow gating | **CERTIFIED_CLOSED** | 8 fresh adversarial routes could not falsify the gate. |
| 8 — failure observability | **STILL_OPEN** (partial) | The core write-throwing defect is fixed. The fallback's own unwrapped `console.error` can itself throw uncaught (e.g. instrumented console), recreating the log-only failure mode one tier deeper. |

Full evidence for each: `docs/phase-3f1-6-rx-final-terminal-closure/14`–`20`.

## Production-freeze-proof

`git diff f1d1400 HEAD -- 'lib/**' 'app/**' 'prisma/schema.prisma'
'prisma/migrations/**'` is empty — confirmed no production file was touched
across any of the 8 Part B auditor commits.

## Verdict

```
PHASE_3F_1_6_RX_FINAL_TERMINAL_CLOSURE_FAILED
```

## Next step

Per this phase's own charter: **STOP here for human decision.** Do not
repair after this freeze. Do not automatically create another remediation
phase, do not proceed to Phase 3F.2, do not touch
financial/dashboard/simulation/evaluator work. A future, narrowly-scoped
phase should fix exactly the 6 still-open findings and re-certify only what
changed. FINDING-5 in particular — now failed identically across four
consecutive phases despite architecturally different attempts each time —
warrants a human decision on whether the whole family of
"generalize-the-word-list" approaches is the wrong tool for this problem,
rather than a fifth iteration.

## Artifact index

`docs/phase-3f1-6-rx-final-terminal-closure/`: 00–02 (baseline, frozen
findings, plan), 03–09 (Part A per-finding fixes), 10–13 (Part A
regression/gates/verdict), 14–20 (Part B per-finding independent
recertification), 21 (crosscutting + freeze proof), 22–23 (final
disposition table, final verdict). Infrastructure incident:
`docs/test-infrastructure-incident-2026-08-30/` (00–20) and
`docs/test-infrastructure-incident-2026-08-30.md`.
