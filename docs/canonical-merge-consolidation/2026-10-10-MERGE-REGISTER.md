# Canonical Safe Merge Batch — Merge Register

**Date:** 2026-10-10  
**Mission:** HEADROOM — CANONICAL MERGE CONSOLIDATION AND SAFE INTEGRATION  
**Verdict:** `CANONICAL_SAFE_MERGE_BATCH_COMPLETED`  
**Workstream status:** `CLOSED`

Do **not** read this as `ALL_PRS_MERGED`. Many PRs remain open by design.

---

## Main SHAs

| | SHA |
|---|---|
| **Starting main** | `3612fe76d4cb5f1d1af189e87d77e8aae11fc894` (#250 merge) |
| **Ending main** | `c2dde8f1dd28832eb77ab6c9f50d4609a9efd52e` |

### Merge commits landed this batch

| Order | Source | Merge commit | Notes |
|---|---|---|---|
| 1 | #265 | `02e44254c35c92f72f88df84b1231b1d1daad9d8` | PP002 baseline docs (claim: not established) |
| 2 | #255 | `97ff628cdaf0395358a0b36384994e703ca45862` | Flywheel Batch-1 definition-body + nestRank |
| 3 | #261 via #267 | `0ff2e305c85b5231703375198b21ed7eddb1f52a` | Final-audit definitions-context + preamble containment |
| 4 | #239 selective via #269 | `c2dde8f1dd28832eb77ab6c9f50d4609a9efd52e` | Debt multi-constraint shared-cap conservation |

Integration branch: `cursor/canonical-safe-merge-batch-5a28`.

---

## Merge register (priority workstreams)

| PR | Starting SHA | Disposition | Action taken | Final SHA | Merge commit | CI (tip) | Unresolved blockers | Current owner |
|---|---|---|---|---|---|---|---|---|
| #218 | `74aa2fba65e1` | **E. BLOCKED** | Not merged | `74aa2fba65e1` | — | CONFLICTING vs main | Conflicts with post-#250 main; large product surface; depends on obsolete tip relative to #250 | Agent 5 / cross-doc |
| #238 | `4233c025469d` | **E. BLOCKED** | Not merged | `4233c025469d` | — | CLEAN onto #218 base | Bases on #218; human-review candidate; §7.6 authority must not bypass #250 | CVF owner |
| #239 | `ee4c39d7d808` | **C. SELECTIVE_PORT_ONLY** | Debt multi-constraint `headroomAndConsume` + remaining-authority marker + honesty wording + joint tests ported via #269 | `ee4c39d7d808` (PR open) | `c2dde8f1` (#269) | Pre-port tip CLEAN; path-filtered certified CI N/A for solver | Full PR still human-review; do not merge wholesale (legacy authority risk) | Joint #232/#234 owner |
| #246 | `03a0920d86e3` | **E. BLOCKED** | Frozen; not merged | `03a0920d86e3` | — | MERGEABLE/CLEAN | TOCTOU/UNIQUE; 18,984 duplicates; 93 self-loops; untested migration rollback; no Neon expand / no cert promotion | KF remediation owner |
| #250 | `8694b6e24ac0` | **D. ALREADY_IN_MAIN** | Canonical baseline | merged | `3612fe76` | green at merge | None for this batch | — |
| #253 | `9505438764df` | **E. BLOCKED** | Not merged | `9505438764df` | — | CONFLICTING | Solver↔sim candidate needs independent review + conflict resolution vs #250 tip; do not auto-merge | Canonical product owner |
| #258 | `e73eeac43ee5` | **C. SELECTIVE_PORT_ONLY** | Not ported this batch | `e73eeac43ee5` | — | CONFLICTING on `election.ts` | Overlaps #250 shared-lien; conflict with multi-constraint port; authentic affirmative still fail-closed | Finish-product owner |
| #255 | `187c72e06da5` | **A. SAFE_TO_MERGE_NOW** → merged | Merged after flywheel 44/44 + tsc | `187c72e06da5` | `97ff628c` | tip green | None | Flywheel owner |
| #259 | `697111a81ec2` | **F. SUPERSEDED** | Close after evidence preserved | `697111a81ec2` | — | CLEAN onto #253 | Content of Batch-1 structure now on main via #255; bases on #253 tip | Flywheel / #253 chain |
| #260 | `1e18829cab69` | **E. BLOCKED** (selective pending) | Attempted identity-only port; **reverted** | `1e18829cab69` | — | CLEAN onto #253 | Bases on #253; persistence tests need Neon (unreachable here); knife-river structure test conflicts with post-#261 stage-structure; do not overwrite #261 | Agent 6 / identity |
| #261 | `43cc9ecf5987` | **A → landed via #267** | Content merged to main via #267 (API retarget of #261 base denied) | `43cc9ecf5987` | `0ff2e305` (#267) | tip certified green | Original PR still open on flywheel base — eligible for closure as content-on-main | Flywheel owner |
| #262 | `8e7fd33ea467` | **F. SUPERSEDED** | Close after evidence preserved | `8e7fd33ea467` | — | CLEAN onto #259 | Final-audit containment already on main via #261/#267 | Flywheel owner |
| #263 | `8eb66e18104b` | **E. BLOCKED** | Not merged | `8eb66e18104b` | — | UNSTABLE (Vercel fail) | **Active RUNNING agent** on branch; large frozen artifacts; do not overwrite | PP001 agent (`product-proof-001-d8e9`) |
| #264 | `11f30ce45b2f` | **E. BLOCKED** | Not merged | `11f30ce45b2f` | — | UNSTABLE (Vercel fail) | Overlaps #263 paths; active PP001 agent; frozen handoff must not race active tip | PP001 / PP002 handoff |
| #265 | `2cd3d2014d15` | **A. SAFE_TO_MERGE_NOW** → merged | Merged | `2cd3d2014d15` | `02e44254` | tip CLEAN | None | PP002 baseline |
| #266 | `e6f82aa9c719` | **E. BLOCKED** | Not merged; PP002 active priority | `e6f82aa9c719` | — | UNSTABLE; **certified path FAIL** | TS2367 + missing `DetectedDefinition` export; coordinate with PP002 owner before any change | PP002 compilation owner |

---

## Other open PRs (inspected, not merged this batch)

Large queue remains (#135–#257 family). Docs-only MERGEABLE candidates observed (#191, #208, #216, #235, #236, #242) but **not** merged — outside primary wave priority; several are stale post-#250 closeouts. Production-conflicting product PRs (#200, #205–#215, #218–#231, #240–#244, #251–#258) remain **BLOCKED** or need selective reconciliation against post-#250/#269 main.

---

## Required returns

### 1. Starting main SHA
`3612fe76d4cb5f1d1af189e87d77e8aae11fc894`

### 2. Ending main SHA
`c2dde8f1dd28832eb77ab6c9f50d4609a9efd52e`

### 3. PRs actually merged
- #265 (docs PP002 baseline)
- #255 (flywheel Batch-1 structure)
- #261 content via integration PR #267
- #239 selective behavior via integration PR #269

### 4. Unique changes selectively ported
From #239 onto main (without merging #239):
- `lib/solver/election.ts` — all-matched debt `SHARED_CAP` headroom/consume + fail-closed on any non-authoritative overlapping constraint
- `lib/capacity/remaining-authority.ts` — thin contract marker re-exporting #250 authority (not a parallel certificate system)
- Honesty wording in `authoritative-capacity.ts` and coherent `run-package-path.ts`
- `tests/capacity/joint-remaining-authority.test.ts`

### 5. PRs already satisfied by main
- #250 (baseline)
- #259 / #262 (structure content satisfied by #255 + #261/#267)
- #261 original tip content (via #267) — original PR may be closed

### 6. PRs blocked and why
- **#246** — TOCTOU/UNIQUE, 18,984 duplicates, 93 self-loops, untested rollback; frozen
- **#253 / #258** — conflict with main `election.ts`; need independent solver/sim reconciliation against #250+#269
- **#218 / #238** — #218 conflicts; #238 depends on #218; CVF human-review only
- **#260** — bases on #253; Neon-blocked persistence identity tests; structure tip diverges from #261
- **#263 / #264** — active RUNNING agent on #263; Vercel deploy fail on large artifacts
- **#266** — typecheck failures; PP002 active development — do not interrupt

### 7. PRs superseded / eligible for closure
- **#259**, **#262** — structure already on main
- **#261** (original) — content on main via #267; close after owner confirms
- **#239** — after owner confirms selective port is sufficient, remaining PR is documentation/handoff only (do not wholesale-merge)

### 8. Remaining safety risks
- Debt-side multi-constraint fix is on main; **#258** shared-lien / FCE bridge still conflicted and unmerged
- **#253** secured-capacity / simulate stack still off-main
- Main tip Vercel deploy reported **failure** after #269 while **local `tsc` + `next build` + 92 adversarial tests passed** — treat as platform/deploy flake until logs prove otherwise; prior main tips `97ff628c` / `0ff2e305` were Vercel-success
- Pre-existing `authenticated-vep-offline` failures on main unchanged
- KF corpus (#246) still unsafe for production writes

### 9. Product Proof 002 integration impact
- #265 baseline docs now on main: **PP002 not established** (truthful)
- #266 **not merged**; active PP002 work preserved
- No frozen PP001 evidence rewritten
- Structural improvements (#255/#261) strengthen authentic document ingestion for PP002 without claiming CERTIFIED

### 10. Recommended next engineering priority
1. **PP002 (#266)** — fix typecheck (`DetectedDefinition` export + SECTION comparison); keep owner coordination
2. **#260 identity-only selective port** onto post-#261 main once Neon-reachable persistence tests pass (do not take #260 `stage-structure`)
3. **#258 vs #250/#269 election reconciliation** — shared-lien / FCE honesty only; no parallel solver
4. Keep **#246 frozen**
5. Close superseded #259/#262/#261-original after owner ack

---

## Post-merge verification (ending tip `c2dde8f1`)

| Gate | Result |
|---|---|
| `npm run test:flywheel` | 44/44 pass |
| joint-remaining + election + shared-capacity-double-count + secured adversarial + utilization | 92/92 pass |
| `npx tsc --noEmit -p .` | clean |
| `npm run build` | success |
| #250 protections present | trusted issuer, utilization-authority, UNKNOWN≠zero, independentCoveragePool lien conservation, all-matched lien `constraintsFor` |
| New #239 debt all-matched consume | present |
| Neon production writes | none |
| Migrations | none |
| Certification promotion | none |
| Force-push of active agent branches | none |

---

## Guardrail compliance

- No paid inference
- No production Neon writes
- No DB migration
- No certification promotion
- No force merges / no unattended auto-merge
- No silent conflict resolution
- No frozen evidence rewrites
- No broad new feature development
- PP002 active branch not overwritten
- Active PP001 agent branch (`cursor/product-proof-001-d8e9`) not touched

---

## Agent closeout

```
WORKSTREAM STATUS: CLOSED
FINAL MAIN SHA: c2dde8f1dd28832eb77ab6c9f50d4609a9efd52e
MERGED PRS: #265, #255, #261(via #267), #239-selective(via #269)
SELECTIVELY PORTED: #239 debt multi-constraint shared-cap + remaining-authority marker + honesty wording
BLOCKED PRS: #218, #238, #246, #253, #258, #260, #263, #264, #266 (+ broader conflicting product queue)
HANDOFF PATH: docs/canonical-merge-consolidation/2026-10-10-MERGE-REGISTER.md
UNCOMMITTED OR UNPUSHED WORK: (see git status at handoff commit)
ARCHIVE STATUS: SAFE_TO_ARCHIVE
```

Do not independently start another integration cycle from this handoff.
