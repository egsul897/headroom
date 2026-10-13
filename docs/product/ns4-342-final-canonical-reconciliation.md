# #342 Final Canonical Reconciliation — post-#340 landing

## Lineage (dependency-ordered)

| Ref | SHA | State |
| --- | --- | --- |
| **#340 merge on main** | `8706be412ad2b3ba44dc7bc060b1f606b2fa5215` | **MERGED** 2026-10-13T13:03:36Z |
| #340 head (pre-merge) | `442251b9aea3800ca6496cdd1bf0fb27ab4eb555` | absorbed via merge |
| Subsequent main (#341) | `14c805c6412ca36bfe753112abac78fa6c3736fa` | Merge #341 after #340 |
| `origin/main` (landing base) | `14c805c6412ca36bfe753112abac78fa6c3736fa` | includes #340 merge |
| Reconciled #342 tip | branch `cursor/ns4-canonical-reconcile-44cd` HEAD | OPEN on current main |
| Historical #342 tip | `9d34bf63d78286f4c575b747af7d7e67c378c35a` | **do not merge** |

Ancestry: `#340 merge` ⊂ current `main` ⊂ reconciled `#342`. Historical tip `9d34bf63` is not an ancestor.

## Unique delta vs post-#340 main (exactly 8 files)

1. `lib/product/ns4-shared-financial-identity.ts` (new)
2. `tests/product/cross-domain-acquisition-and-invalidation.test.ts` (new)
3. `lib/customer-workflow/assemble-cfo-workflow.ts`
4. `app/[companyId]/position/page.tsx`
5. `app/[companyId]/simulate/page.tsx`
6. `lib/product/north-star-workflow/index.ts`
7. `tests/product/cfo-workflow-access-integration.test.ts`
8. `docs/product/ns4-342-final-canonical-reconciliation.md`

No competing financial resolver, no v1 cross-domain engine, no duplicate Simulate UI.

## Absorption / preserve matrix

| Capability | Disposition |
| --- | --- |
| #340 PRODUCTION sanitizer | **Preserved** (untouched on main) |
| #340 EBITDA identity binding | **Preserved** |
| #332 persisted-delivery cutoff semantics | **Preserved** (`MOST_RECENTLY_DELIVERED_COMPLIANCE_CERTIFICATE`) |
| Canonical financial-metric-resolver | **Preserved** (shared identity is thin projection) |
| Single CrossDomainSimulatePanel | **Preserved** |
| CFO authoritativeCapacity / shared NS-4 identity / acquisition tests | **Absorbed** (unique #342) |
| Historical `9d34bf63` / v1 remainingAllowed | **Rejected** |

## Authority honesty

NS-4 `APPROVED_BOUND` evidence alone cannot publish verified remaining / AVAILABLE / PERMITTED.
Required separately: utilization completeness, trusted issuer auth (host), VEP, and certified execution path.
Shared-identity loader never upgrades remaining authority.

## Safety

- No self-merge
- No production-authority activation
- No synthetic remaining authorization on PRODUCTION
- No competing financial resolver
- REQUIRE gates unchanged
