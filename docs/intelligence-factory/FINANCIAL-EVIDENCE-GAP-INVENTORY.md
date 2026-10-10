# HEADROOM-2 — Financial evidence gap inventory

**Date:** 2026-10-10  
**Base:** `origin/main` (post-#268 merge)  
**PR #268:** MERGED — product/solver authenticity + trusted-issuer gate on main.  
**PR #273 (HEADROOM-2):** OPEN / CONFLICTING with post-#268 main — contract modules ported here for Agent #9 consumption; identity minting not altered.

## Existing surface (inspected)

| Area | Location | Finding |
|---|---|---|
| Solver utilization authority | `lib/capacity/utilization-authority.ts` | Production remaining already requires `AUTHENTIC` + `TrustedIssuerAuthorizationContext` |
| Product utilization resolver | `lib/capacity/utilization-resolver.ts` | **Gap:** `APPROVED` + matching kind still sets `supportsRemainingClaim` without authenticity / trusted issuer |
| Completeness issuer auth | `lib/capacity/completeness-issuer-auth.ts` | Contract present; builders for demo/session principals exist |
| Host → trusted issuer wiring | *(none)* | **No** session/service-account identity provider found under `lib/auth*`, `lib/session*`, or NextAuth/Clerk hosts |
| Phase 4B financial snapshot | `lib/contract-model/runtime/input/types.ts` | Snapshot + provenance fields exist; missing metric-level authenticity / consolidation / restatement / verification envelope |
| FCE authority labels | `lib/financial-certificate-engine/authority.ts` | Distinguishes test vs real reviewer; not a capacity handoff contract for HEADROOM-1 |
| Verified remaining | `lib/capacity/verified-remaining.ts` | Gross−usage publication; no financial evidence class vocabulary |
| Capacity handoff enums | *(absent)* | No `AUTHENTICATED_APPROVED_FINANCIAL_EVIDENCE` / `CALLER_STIPULATED_HYPOTHETICAL` contract |

## Gaps closed by this workstream

1. **Scope A** — Authenticated financial metric evidence schema + validation (entity, source location, period, currency, consolidation, accounting definition, restatement, verification, issuer, provenance). Extraction ≠ verification.
2. **Scope B** — Product-path completeness shares solver authenticity + trusted-issuer gate (`evaluateCompletenessForRemainingClaim`). Missing ledger remains UNKNOWN.
3. **Scope C** — Bounded host interface for verified identity → `TrustedIssuerAuthorizationContext`; fail-closed when host IdP unavailable. No fake IdP.
4. **Scope D** — Additive verified-input handoff for HEADROOM-1 / capacity engines (evidence trust classes). No second capacity engine; covenant compiler untouched.

## Explicit non-goals / activation

- Production authority remains **BLOCKED** until a real host identity provider wires `HostVerifiedIdentity`.
- Fully authenticated fixtures demonstrate the contract but cannot set `requireNonFixtureIdentity` production activation.
- PR #268 product UI labeling (Position MODELED / live-route) is out of scope here; library gate is hardened independently.
