# Canonical utilization + Neon pathway — post-#237 harden

**Base main:** `7f1dd3a202b026b9a862ef727480a1a9f284523a` (PR #237 already landed #232+#234 reconcile)  
**Integration branch:** `cursor/utilization-neon-canonical-a9e4`  
**CI-verified content tip:** `da8cb7b544adf6c3612a4d5e7477ad25e58047dc`  
**Branch tip:** `d054b5eca37748ed8d1b84bb956b43bd4938bc4b` (docs-only CI pin)  
**Combined PR:** https://github.com/egsul897/headroom/pull/241 (draft — no auto-merge)  
**Auto-merge:** **no** · Neon writes: **none** · Certification bypass: **none**

## Context

PR **#237** merged a first combined #232/#234 utilization authority onto main.
This branch **hardens** that land with the #234 completeness authority gate
(issuer / method / binding fingerprints), adversarial false-permission tests,
and empty-ledger `VERIFIED_EMPTY` support on the solver observation path.

Do **not** merge standalone #232 or #234 — superseded by #237 + this harden.

## A8 close-out consolidation (#235 / #236)

| PR | Disposition |
|---|---|
| **#236** | Canonical A8 close-out docs (DEFECT-A8-01/02 CLOSED on `b99f934b`) |
| **#235** | Duplicate — do not land separately |

## Preserved #229 capacity status contract

`lib/contract-model/runtime/capacity/state.ts` + `types.ts` remain **byte-identical** to post-#229 main (unchanged through #237 and this harden).

## Canonical fail-closed contract

| Condition | Remaining claim |
|---|---|
| Empty ledger / no attribution | **refused** unless AUTHENTIC `VERIFIED_EMPTY` |
| Approved individual entries alone | **refused** |
| SYNTHETIC_LABELED completeness | **refused** (PRODUCTION + solver; test-only `allowSyntheticRemaining`) |
| Stale / mismatched / wrong-method full cert | **refused** (`validateCompletenessCertificate`) |
| AUTHENTIC validated completeness | **allowed** |

**Authority owner:** `lib/capacity/utilization-authority.ts` (`decideSolverUtilizationAuthority`)  
**Full cert gate:** `lib/capacity/completeness-certificate.ts`  
**Resolver:** `lib/capacity/utilization-resolver.ts`

## CI on content tip `da8cb7b5`

| Check | Result |
|---|---|
| P3-R0 carry-forward and supersession (soft gate) | **SUCCESS** |
| Vercel | **SUCCESS** |
| Vercel Preview Comments | **SUCCESS** |
| Aggregate | **all checks green** · mergeable **MERGEABLE** |

## Remaining blockers

1. Authentic Neon completeness certificates not populated (counsel/custodian + live bindings)
2. Human merge authorization — **no auto-merge** (CI green on content tip)
3. Close/supersede open #232 / #234 / #235 as docs/activation superseded by #237 + #241
