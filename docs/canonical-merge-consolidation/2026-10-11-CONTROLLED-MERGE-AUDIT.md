# Controlled Merge And Archived Work Consolidation — Audit

**Date:** 2026-10-11  
**Mission:** HEADROOM — CONTROLLED MERGE AND ARCHIVED WORK CONSOLIDATION  
**Work branch:** `cursor/controlled-merge-audit-b2b0`  
**Consolidation PR:** https://github.com/egsul897/headroom/pull/300 (draft → `#293` branch)  
**Live `#293` tip:** `4a336bb1744f293d2d09ce2a5bab6e6aff9fa45f` (identity-gate fix + **#298 absorbed** via `e291848d`)  
**Live `#298` tip:** `425a177a698819cc582c1dcf6346a89f22874c4c` (superseded for merge — content on `#293`)  
**Consolidation tip (this PR):** branch `cursor/controlled-merge-audit-b2b0` HEAD (= live `#293` + selective archived recovery)

**Do not self-merge. Do not claim main advanced without GitHub confirmation.**

---

## Main SHAs

| | SHA |
|---|---|
| **STARTING_MAIN_SHA** | `4f1a0b81207364373d9a4cb9fe515d4a1a002e56` |
| **ENDING_MAIN_SHA** | `4f1a0b81207364373d9a4cb9fe515d4a1a002e56` (unchanged — human approvals outstanding) |

---

## Inventory table (evaluated PRs)

| PR | Head SHA | Base | State | Mergeable | Disposition | Reason |
|---|---|---|---|---|---|---|
| **#293** | `4a336bb1744f` | `main` | OPEN (ready) | MERGEABLE/CLEAN | **BLOCKED_ON_HUMAN_APPROVAL** (canonical merge candidate) | Absorbs #283/#287/#282/#285/#290/#291 + **#298** (`e291848d`); wrong-document guard; undated/UNSUPPORTED edges; identity-gate positive confirmation `038fa626`. **0 reviews.** |
| **#298** | `425a177a6988` | stale vs `#293` | OPEN draft | — | **ALREADY_ABSORBED into #293** | Production absorb landed on `#293` via `e291848d`. PR tip lagged; close after owner confirms. |
| **#296** | `7db74ba83c61` | stale `#293` | OPEN draft | CONFLICTING | **SUPERSEDED** (production) / selective test ported | Production P0 edges absorbed by #298. Alternate large acceptance artifacts not revived wholesale. Unique adversarial test selectively ported in this consolidation PR (see below). |
| **#297** | `40d26d308a00` | `main` | OPEN draft | MERGEABLE | **ALREADY_ABSORBED** (content) / tip lag | Former identical tip to pre-`038fa626` #293; adversarial fixture closure content remains on #293. Do not merge independently. |
| **#283** | `3643763a91b0` | `main` | OPEN | MERGEABLE/CLEAN | **ALREADY_ABSORBED** (production) | Operative authority + retrieval-source binding present on #293 (blob-identical `retrieval-source.ts`). Tip commits after absorption are docs reconciliation. Disposition docs selectively ported here. |
| **#287** | `abf87d471a2c` | `main` | OPEN | MERGEABLE/CLEAN | **ALREADY_ABSORBED** (production) | Recursive context retrieval blobs identical on #293 (`body-anchor.ts` hash match). Tip disposition docs selectively ported. Do not independently merge. |
| **#282** | `2c575a228609` | `main` | OPEN | MERGEABLE/CLEAN | **ALREADY_ABSORBED** | `lib/capacity/identity/*` blob-identical on #293; production IdP activation remains BLOCKED. |
| **#285** | `5a3cc9823d16` | `main` | OPEN | MERGEABLE/CLEAN | **ALREADY_ABSORBED** | Unified VTE present on #293; sole orchestrator preserved. |
| **#290** | `a3706771d72e` | `main` | OPEN | MERGEABLE/CLEAN | **ALREADY_ABSORBED** | Financial/utilization evidence pathway blobs match on #293; #281 superseded. |
| **#291** | `786d7643515b` | `main` | OPEN draft | MERGEABLE/CLEAN | **ALREADY_ABSORBED** | Disposable EVAL DB persistence docs already on #293; no unique files vs #293 tip. |
| **#294** | `a4b9d50e9c88` | `main` | OPEN draft | MERGEABLE/CLEAN | **BLOCKED — KEEP SEPARATE** | Persistence workstream. Has absorbed #293 tip internally but SSR `executeAndPersist`, tenant auth, trusted-issuer completeness, and financial-approval gates remain incomplete. No production Neon writes. Rebase onto new main only after #293 merges. |
| **#281** | `ba0450451999` | `main` | CLOSED unmerged | CONFLICTING | **SUPERSEDED** | Closed; superseded by #290 → #293. Do not revive. |
| **#295** | `9278582b98a9` | `#293` | OPEN draft | UNSTABLE | **SUPERSEDED / docs acceptance** | Round 2B acceptance against older #293 base; superseded by #298 absorption retest artifacts for P0 safety claim. |
| **#299** | `39fdc17303d0` | `#283` | OPEN draft | UNSTABLE | **SUPERSEDED** | Round 2B safety docs on #283 base; certified path FAIL on tip; P0 claim covered by #298 retest. |
| **#286/#292** | various | `main` | OPEN draft | MERGEABLE | **SUPERSEDED (acceptance artifacts)** | Earlier Agent #11 rounds; frozen Round-1 seal preserved on #293; not merge vehicles for production code. |
| **#288** | `f601f5132464` | `main` | OPEN draft | MERGEABLE | **SUPERSEDED** | BLOCKED_BY_EVAL_DB archive; superseded by #291 evidence on #293. |
| **#253/#258** | `95054387` / `e73eeac4` | `main` | OPEN draft | CONFLICTING | **REQUIRES_REMEDIATION** | Pre-#293 product candidates; conflict with post-#250/#269 main. Shared-lien / FCE / solver paths must not be revived wholesale. |
| **#259/#262** | `697111a8` / `8e7fd33e` | non-main | OPEN draft | MERGEABLE | **SUPERSEDED** | Structure content already on main via #255/#261/#267. |
| **#260** | `1e18829cab69` | `#253` tip | OPEN draft | MERGEABLE | **BLOCKED** | Bases on obsolete #253; Neon/persistence identity concerns; do not overwrite post-#261 structure. |
| **#261** | `43cc9ecf5987` | flywheel | OPEN draft | MERGEABLE | **ALREADY_ABSORBED** | Content on main via #267. |
| **#263/#264** | PP001 tips | `main` | OPEN draft | UNSTABLE/DIRTY | **BLOCKED** | Frozen PP001 evidence / handoff; do not rewrite. |
| **#234/#232** | closed tips | `main` | CLOSED unmerged | — | **SUPERSEDED / UNSAFE to revive** | Joint remaining-authority contract marker on main explicitly forbids restoring obsolete `completeness-certificate` modules (`remaining-authority.ts`). |
| **#246** | (KF expand) | — | frozen | — | **UNSAFE** | Prior register: TOCTOU/UNIQUE / duplicates / self-loops; must not merge. |
| **#250/#255/#266/#268/#279/#280/#284/#289** | — | `main` | MERGED | — | **ALREADY_ABSORBED** | Already on starting main lineage. |

---

## #298 → #293 evaluation (mandatory gates)

| Gate | Result |
|---|---|
| Undated competing successor blocks base `CONFIRMED_OPERATIVE` | **PRESENT** on #298 (`governing-provision.ts`; test added) |
| `UNSUPPORTED` competing successor blocks base promotion | **PRESENT** on #298 |
| Wrong-document refusal (REVIEW_REQUIRED null predecessor) | **PRESENT** on #293 tip `59c3c4b3` and retained on #298 |
| Operative → retrieval binding | **PRESENT** (`retrieval-source.ts` + offline-compile binder + tests) — blob-identical to #283 |
| Exact-tip CI (#298 `425a177a`) | rebased onto `038fa626`; verify on GitHub after push |
| Exact-tip CI (#293 `038fa626`) | includes identity-gate fix; verify on GitHub |
| Local adversarial / authority suite on #298 tip | 101/101 + 11/11 ported #296 tests |
| Phase 3 certification on #298 tip | **481/481 pass** |
| `tsc --noEmit` on #298 tip | clean |
| Agent #11 absorption retest | `CANONICAL_293_OPERATIVE_AUTHORITY_SAFETY_VERIFIED`; seal `393facc4…` preserved |
| Human approving review on #298 | **MISSING** |
| Human approving review on #293 | **MISSING** |

**Verdict:** #298 is safe to incorporate into #293 **only after recorded human approval**. This agent did **not** merge #298→#293 or #293→main.

---

## Archived changes recovered (this consolidation PR)

| Source | Change | Provenance |
|---|---|---|
| #296 | `tests/operative-restatement-authority/wrong-document-promotion.test.ts` (11 cases) | From tip `7db74ba8` / fix `1f094583`; case-6 reason regex aligned to #298 wording |
| #287 | Disposition/reconciliation handoff docs (`17`–`19`) | Tip `abf87d47` docs-only |
| #283 | Tip regression evidence + #293 reconciliation note | Tip `3643763a` docs-only |

No obsolete completeness-certificate revival. No wholesale archived-branch merges.

---

## Persistence workstream (#294)

Kept **separate**. Tip already contains #293 tree via internal merges, but:

- SSR live Position/Ask/Simulate `executeAndPersist` wiring **not** complete
- Tenant auth / full request assembly incomplete
- Trusted-issuer production activation remains BLOCKED
- Financial-approval / completeness for production issuers incomplete
- Disposable Postgres acceptance claimed on tip; **must re-run after #293 lands on main**
- **No production Neon writes** this mission

---

## Final integration audit (current facts)

| Check | Status |
|---|---|
| Exact merged SHAs on main | **None this mission** — main still `4f1a0b81` |
| GitHub merge status #293/#298 | Both OPEN; not merged |
| CI on resulting main | N/A (main unchanged); tip CI green on #293 and #298 |
| Phase 3 certification | Pass on prepared tip `#298` |
| Fail-closed behavior | Strengthened by #298 undated/UNSUPPORTED edges; not weakened |
| Duplicated solver/ledger pathway | None introduced |
| Evidence rewriting | Frozen AutoNation legal seal preserved |
| Company-specific production shortcuts | None |
| Premature phase advancement | None |

---

## Required return fields

```
STARTING_MAIN_SHA: 4f1a0b81207364373d9a4cb9fe515d4a1a002e56
ENDING_MAIN_SHA: 4f1a0b81207364373d9a4cb9fe515d4a1a002e56
MERGED_PRS: (none — human approval required)
ARCHIVED_CHANGES_RECOVERED: #296 wrong-document-promotion.test.ts; #287 docs 17-19; #283 docs 07-08
ALREADY_ABSORBED_PRS: #282, #283(prod), #285, #287(prod), #290, #291, #297, #261, #259/#262(structure), #281(via #290)
BLOCKED_PRS: #293 (await human approval), #298 (await human approval into #293), #294 (persistence remediation), #253/#258/#260/#263/#264/#246
EXACT_TIP_CI: #293 038fa626 (identity-gate fix); #298 425a177a (rebased absorb); consolidation PR #300 on #298+ports — re-verify after rebase
NORTH_STAR_COMPLIANCE: PASS on prepared tip (fail-closed authority, no ERP/continuous-sync invent, no production activation, Phase 3 cert intact)
REMAINING_HUMAN_APPROVALS: (1) approve+merge #300 selective recovery into #293 (optional docs/tests); (2) approve+merge #293 tip `4a336bb1`(+optional #300) into main; (3) do not approve #294 until SSR/tenant/trusted-issuer remediation. #298 content already on #293.
NEXT_INTEGRATION_ACTION: Human approve #293→main (tip already includes #298). Optionally merge #300 first for selective #296 test + provenance docs. Afterward rebase #294 and re-run disposable-Postgres acceptance.
```
