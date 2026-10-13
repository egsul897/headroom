# Absorb #322 into post-#333 canonical main

**Canonical base:** `1fb258d257c883b6d88389c0581058cea8e1f660` (merge of #333)  
**Do not integrate against pre-#333 main.**

## Ported from #322 (selective)
- `FIXED_POINT_ADDBACK_CAP` IR + exact closed-form runtime
- Manifest → fulfillment join (`information-request.ts`)
- Contractual leverage package + NS-4 bind + Dashboard panel
- Non-positive denominator leverage boundary
- Coherent FIXED_POINT + Matthews uncapped SUM

## PATH_IRRELEVANT authority (corrected)
`selectConditionalPaths` evaluates IF conditions against APPROVED snapshots and
seals a `SelectedPathAuthority`. Clearance requires a verified seal showing the
leaf’s branch is inactive. Fabricated `branchLabel` + proof alone are refused.
`SAFE_BOUND` is a distinct `executionMode` and never `EXACT`. REQUIRED missing
without safe-bound policy always blocks.

## Simulate
`executeCanonicalPathWithVerifiedSimulate` calls `attemptVerifiedSimulate`
under the same financial identity. Simulate href is navigation only.
Supersession invalidates leverage **and** prior simulate artifacts.

## Preserved from #333
PAI utilizationCompleteness / PRODUCTION_AUTHORITATIVE / gross≠verified remaining
untouched. No production-authority activation. No self-merge.
