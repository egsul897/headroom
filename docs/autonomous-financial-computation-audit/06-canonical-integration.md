# Absorb #322 into post-#333 / post-#334 canonical main

**Integration target:** current `main` after #345 (`db0f2fd3…` post-#334 absorb of no-write metrics + NS-4 gates).  
**Do not integrate against pre-#333 / pre-#334 / pre-#345 main.**

## Ported from #322 (selective)
- `FIXED_POINT_ADDBACK_CAP` IR + exact closed-form runtime
- Manifest → fulfillment join (`information-request.ts`)
- Contractual leverage package + NS-4 bind + Dashboard panel
- Non-positive denominator leverage boundary
- Coherent FIXED_POINT + Matthews uncapped SUM

## PATH_IRRELEVANT authority (P0 corrected + brand gate)
A reproducible content hash is **not** authentication. At the fulfillment
boundary, `evaluateConditionalPathsAuthoritatively` **re-evaluates** IF
conditions against the current APPROVED snapshot set and operative expression
identity. Caller-supplied `selectedPathAuthority` / self-consistent SHA-256
seals / fabricated `{ authoritative: true }` are ignored for trust.
`proveConditionalClearance` requires `isLiveEvaluatedPathAuthority` (module-
private brand). JSON clones and direct forged calls fail closed.
Authority binds company, instrument, expression fingerprint, operative
contract version, snapshot id+version+approvalRef, and selected branch.
Stale, superseded, mismatched, or fabricated selections are refused.
`SAFE_BOUND` is a distinct `executionMode` and never `EXACT`.

## #338 selective alignment (no engine duplication)
Absorb shared `CAPACITY_DISCLAIMER` wording only. Do **not** port #338's
parallel `evidence.ts` / `reflow.ts` / alternate EBITDA engine — keep
#341's `ns4-bind` + `canonical-integration` + `client-reflow` as the
executable path. #338 remains free to land filing-reconstruction evidence
separately without a second calculation core.

## Simulate
`executeCanonicalPathWithVerifiedSimulate` calls `attemptVerifiedSimulate`
under the same financial identity. Simulate href is navigation only.
Supersession invalidates leverage **and** prior simulate artifacts /
previously cleared conditional branches (live re-eval against superseded set).

## Preserved from #333 / #334 / #345
PAI utilizationCompleteness / PRODUCTION_AUTHORITATIVE / gross≠verified remaining
untouched. NS-4 Dashboard Neon band (#334) and read-only contractual-metrics
panel (#345, `persist:false`) coexist with contractual leverage panel.
No production-authority activation. No self-merge.
