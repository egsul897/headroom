# PR #258 shared-lien closeout — handoff

**Workstream status:** **FROZEN** after this handoff  
**Shared-lien verdict (accepted, pending independent code review):** `SHARED_LIEN_CONSERVATION_REMEDIATED`  
**Authentic affirmative (unchanged):** `AUTHENTIC_AFFIRMATIVE_BLOCKED_WITH_FAIL_CLOSED_BEHAVIOR_PRESERVED`  
**Auto-merge:** **no** · certification **not** promoted · production readiness **not** inferred from offline tests

## Accepted on #258 tip (evidence preserved)

| Item | Location |
|---|---|
| Functional remediation | `11452d74` (`lib/solver/election.ts`) |
| R1–R11 matrix | `tests/solver/shared-lien-double-count-repro.test.ts` |
| Evidence | `docs/product/finish-product/04-shared-lien-conservation.md` |
| Tip at closeout start | `f706dd77` |

**Preserve:** automatic-linked-lien reservation, independent-pool exclusion, election-wide shared-capacity conservation, utilization UNKNOWN handling, EXACT maximum constraints (R1–R11).

## Why GitHub reports #258 non-mergeable

| Field | Value |
|---|---|
| `mergeable` | `CONFLICTING` |
| `mergeStateStatus` | `DIRTY` |
| PR base OID (stale) | `7f1dd3a2` (main at PR open) |
| Current `origin/main` | `3612fe76` — **Merge pull request #250** |
| Sole conflict file | **`lib/solver/election.ts`** |

**Cause:** `main` advanced by merging #250, which already lands shared-lien conservation in `election.ts` (`556a2c6e` stop double-counting; related docs/tests `c58cbd46` / `8694b6e2`). #258 tip carries a parallel conservation lineage including auto-lien Phase A (`11452d74`). Git content-conflicts on the same file.

CI on #258 tip remains green; non-mergeability is **rebase/conflict against moved main**, not a failing required check.

## Handoff — canonical integration owner

**Owner action (not performed by this workstream):**

1. Rebase or merge `cursor/finish-product-canonical-a9e4` onto current `main` (`3612fe76`).
2. Resolve **only** `lib/solver/election.ts` by selecting the correct conservation semantics — **do not** re-implement a third parallel engine.
3. Prefer the post-#250 main baseline (`556a2c6e` lineage) and **port any #258-only additive coverage** (auto-lien shared reservation / independent-pool exclusion / R8–R11) if not already present on main — without duplicating work already reconciled elsewhere (including #253).
4. Re-run R1–R11 + secured adversarial suites; refresh CI on the reconciled tip.
5. Keep authentic-affirmative refusal evidence intact; do not reopen that milestone.

**Explicitly out of scope for this frozen agent:**

- Merging #258
- Opening another integration PR
- Duplicating the shared-lien fix already on main / #253
- Certification advancement
- Product Proof 002 / generalized authentic-document covenant compiler (next priority for the integration owner / next workstream)

## Next priorities (owner, not this freeze)

1. Product Proof 002  
2. Generalized authentic-document covenant compiler  

## Freeze commitment

No further feature or conflict-resolution work on this workstream after this handoff document.
