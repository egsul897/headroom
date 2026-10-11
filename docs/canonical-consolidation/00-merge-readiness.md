# Canonical consolidation — merge readiness

**Generated:** 2026-10-11 (consolidation agent)  
**Does not authorize self-merge.** Human merge only.

## SHAs

| Ref | SHA |
|---|---|
| `origin/main` | `4f1a0b81207364373d9a4cb9fe515d4a1a002e56` |
| Prior #293 tip (acceptance) | `40d26d308a00b18f8d01d8f020df6cca92a4d0ac` |
| #293 tip before this consolidation | `038fa626ab5f32b4e0c7481c69fa98f52841e822` |
| #298 tip (P0 absorption) | `0f589f833d7350b9dd194987b2f8dee5a43c27ef` |
| **Consolidation tip (#293 + #298)** | `66b0f769360d63b43c06d22682f059e0212517d8` |
| Production safety code (adversarial fixture) | `60dbdeeeb1e067e1823972f2ea79ea5f3ba19f72` |

## #298 status

- **Merged into #293 via GitHub merge button:** NO (was OPEN / MERGEABLE / CLEAN).
- **Incorporated onto #293 tip by consolidation merge commit:** YES (local `integrate: absorb #298` onto `038fa626`).
- Unique production delta absorbed: undated / `UNSUPPORTED` competitor fail-closed in `governing-provision.ts` + regression test + Agent #11 absorption retest artifacts.

## #293 status

- OPEN → `main`, MERGEABLE (checks may be pending after tip push).
- Safety acceptance prior art: wrong-document + adversarial fixture + binding preserve.
- Missing Fourth A&R / financial package are **capability** blockers, not safety merge blockers.

## Human actions required

1. Confirm CI green on consolidation tip of #293.
2. Close or supersede #298 as absorbed (do not re-merge wholesale).
3. **Human-merge #293 → main** when approvals/branch protection allow.
4. Keep #294 separate (persistence / SSR) until tenant auth + request assembly remediated — do not self-merge; no Neon writes.
