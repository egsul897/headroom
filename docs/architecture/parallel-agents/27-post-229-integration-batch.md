# Post-#229 dependency refresh and next safe integration batch

**Published:** 2026-10-09T23:18:00Z  
**Main SHA:** `b99f934b1d94b2631fb40ba3ca131a914bef2370` (Merge PR #229)  
**Verified by:** merge-authorization follow-up (probe + Agent 8 32/32 + integrated 413)  
**Auto-merge:** no · **Paid inference:** $0  

This document refreshes the integration graph after landing A8-01/A8-02. It does **not** authorize merges.

---

## Landed

| PR | Role | Main SHA |
|---|---|---|
| **#229** | Capacity status floor (`NOT_SATISFIED` + `statusForAmount`); A8-02 shared withhold | `b99f934b` |

A8-01 / A8-02 are **CLOSED** after post-merge verification (see `docs/agent8-independent-adversarial/07-post-merge-close.md`).

---

## Dependency graph (capacity / activation / utilization)

```
main @ b99f934b
 ├── #229 [LANDED] capacity state/types A8 floor
 │
 ├── #232 Neon activation + solver utilization fail-closed
 │     depends_on: #229 capacity contract (now on main)
 │     also carries: #225/#227 ancestry, Agent8 suite (already on main)
 │     action: REBASE onto main; drop duplicate capacity edits if identical
 │
 ├── #234 verified remaining / utilization resolver (lib/capacity/*)
 │     overlaps_conceptually: #232 solver shared-usage fail-closed
 │     action: RECONCILE utilization semantics with #232 before either lands
 │
 ├── #230 authentic Neon capacity execution
 │     overlaps: #234 / mathematics matrix; hold until CI green + utilization contract
 │
 ├── #215 SharedConstraint currentUsage wire
 │     superseded_by: #227/#232 path — close after #232 lands
 │
 └── Product façades #213 / #218 / #221
       consume corrected CapacityStatus from main; no second floor
```

---

## Next priority (founder directive)

1. **Silent-zero utilization** — empty ledger / `ZERO_NO_ATTRIBUTED_USAGE` must never become favorable remaining.
2. **Reconcile #232** into the canonical activation pipeline on top of `main` (post-#229).

---

## BATCH N+1 — recommended human sequence (not auto-merge)

### Step A — rebase #232 (activation + utilization fail-closed)

| Field | Value |
|---|---|
| PR | **#232** |
| Pre-rebase tip (snapshot) | `26632880fba637c9352942d996f0548c3b717848` |
| Relation to main | MERGEABLE / CLEAN at snapshot; still needs rebase onto post-#229 main for capacity identity |
| Capacity `state.ts`/`types.ts` | Must remain **byte-identical** to main (#229); no competing A8 edit |
| Unique value | Neon activation matrix/proof, solver fail-closed when usage not authoritative |
| Gate | Rebase → CI green on new tip → human authorize |

### Step B — reconcile utilization with #234

| Field | Value |
|---|---|
| PR | **#234** |
| Unique value | utilization resolver knowledge kinds; empty ledger ≠ zero |
| Risk | Second utilization model vs #232 `lib/solver` shared-usage |
| Gate | Single utilization contract agreed; then land one path (or stacked PR) |

### Hold (not this batch)

| PR | Reason |
|---|---|
| #217 | Legal extraction / promotion gate — not this batch |
| #230 / #214 | Authentic matrix — coordinate under utilization contract |
| #223 | Rebase after Stage D stack |
| #224 | CONFLICTING adversarial report branch — superseded by #229 land |
| Unrelated product PRs (#221, #213, #218, …) | No automatic merge |

### Optional docs-only (low risk)

| PR | Note |
|---|---|
| #208 | Docs-only capability audit — may land independently |
| #216 | Coordinator pack — rebase after this refresh if needed |
| #235 | Sibling A8 post-merge close docs — may close as duplicate of this verification |

---

## Explicit non-actions

- Do **not** auto-merge #232, #234, or any other open PR from this document.
- Do **not** land a second copy of the A8 capacity floor.
- Do **not** treat empty attributed usage as proven zero remaining.
