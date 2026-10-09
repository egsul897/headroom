# Utilization authority integration batch (#232 + #234)

**Branch:** `cursor/utilization-authority-integration-4f52`  
**Base main:** `b99f934b1d94b2631fb40ba3ca131a914bef2370`  
**Auto-merge:** **no** — do not merge #232 or #234 independently

## What this batch contains

1. #232 Neon activation + solver utilization fail-closed (rebased onto post-#229 main)
2. #234 `lib/capacity/*` completeness-certificate remaining model + debt-intelligence guard
3. **Reconciled** `lib/capacity/utilization-authority.ts` — single authority for remaining claims
4. A8 capacity `state.ts` / `types.ts` **byte-identical** to #229

## Merge recommendation

Hold until CI green on the integration tip. Then **authorize merge of this integration PR only** (not #232/#234 alone). Close #232/#234 as superseded after land.
