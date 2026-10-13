# Absorb #322 into post-#333 canonical main

**Canonical base:** `1fb258d257c883b6d88389c0581058cea8e1f660` (merge of #333)  
**Do not integrate against pre-#333 main.**

## Ported from #322 (selective)
- `FIXED_POINT_ADDBACK_CAP` IR + exact closed-form runtime
- Manifest → fulfillment join (`information-request.ts`)
- Contractual leverage package + NS-4 bind + Dashboard panel
- Non-positive denominator leverage boundary
- Coherent FIXED_POINT + Matthews uncapped SUM

## PATH_IRRELEVANT authority (P0 corrected)
A reproducible content hash is **not** authentication. At the fulfillment
boundary, `evaluateConditionalPathsAuthoritatively` **re-evaluates** IF
conditions against the current APPROVED snapshot set and operative expression
identity. Caller-supplied `selectedPathAuthority` / self-consistent SHA-256
seals are ignored for trust. Authority binds company, instrument, expression
fingerprint, snapshot id+version+approval, and selected branch. Stale,
superseded, mismatched, or fabricated selections are refused.
`SAFE_BOUND` is a distinct `executionMode` and never `EXACT`.

## Simulate
`executeCanonicalPathWithVerifiedSimulate` calls `attemptVerifiedSimulate`
under the same financial identity. Simulate href is navigation only.
Supersession invalidates leverage **and** prior simulate artifacts.

## Preserved from #333
PAI utilizationCompleteness / PRODUCTION_AUTHORITATIVE / gross≠verified remaining
untouched. No production-authority activation. No self-merge.
