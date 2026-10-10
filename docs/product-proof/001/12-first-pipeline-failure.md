# Product Proof 001 — First actual pipeline failure

**Not an architecture closeout.** This pin is the first hard product break on the authentic MTN package.

| Field | Value |
|---|---|
| Package | Vail Resorts (MTN) Tenth A&R CA + 2024/2025 indentures + FY2026 10-K |
| Tested tip (prior run) | `7f1dd3a202b026b9a862ef727480a1a9f284523a` (main as-is) |
| Independent re-run | `npx tsx scripts/product-proof/run-001-mtn-pipeline.ts` on `8eb66e18104b52cfefb53276cd0f2ead01a7fdb7` |
| Paid inference | none |
| Neon writes | none |
| Hand-authored MTN IR | none |

## First successful stage

`SOURCE_DOCUMENTS` — frozen authentic SEC HTML → extracted text under `sources/`.

## First hard failure

**Stage:** `GENERALIZED_RULE_REPRESENTATION`  
**Status:** `BLOCKED`  
**Entry point:** `lib/contract-model/compiler/semantic/compile.ts#compileCovenantToIR`

### Why this is the break (not earlier PARTIAL stages)

| Prior stage | Status | Why not the hard product break |
|---|---|---|
| SOURCE_DOCUMENTS | SUCCESS | Authentic package ingested |
| STRUCTURAL_INDEX | SUCCESS | 1595 nodes / 252 defs on Doc A path |
| COVENANT_DISCOVERY | PARTIAL | Pass A + KF families run; Pass B empty without paid keys — discovery substrate exists, not executable rules |
| MULTI_DOCUMENT_GRAPH | SUCCESS | CA/indentures classified |
| DEFINITION_RESOLUTION | SUCCESS | 9/9 key term anchors |
| AMENDMENT_PRECEDENCE | PARTIAL | Empty effects expected for restatement-only package |
| **GENERALIZED_RULE_REPRESENTATION** | **BLOCKED** | **No issuer-agnostic path from authentic discovery → CERTIFIED / executable IR without paid compile or sealed units** |

Everything after this (verification, capacity, $50M/$100M simulation, customer Position/Simulate/Ask) is blocked or unsupported as a **consequence**.

### Concrete refusal chain after the break

1. No compiled MTN candidate → `VERIFICATION` BLOCKED  
2. Empty VEP under REQUIRE → `evaluateVerifiedCapacity` / `simulateVerifiedTransaction` REFUSED (`VERIFICATION_ARTIFACT_INCOMPLETE`)  
3. Empty ledger → utilization `UNKNOWN` (not silent zero) — safety success, not capacity proof  
4. Customer UI UNSUPPORTED here (Neon write ban; no local Postgres)

### Failure register id

`F01` in `09-failure-register.md` — P0.

## What this does **not** authorize

- Hand-authoring MTN IR / capacityFormulas to force an affirmative $50M/$100M answer  
- Paid inference without explicit authorization  
- Production Neon writes  
- Claiming END_TO_END_PRODUCT_PROVEN  

## Closest next engineering target (single)

Issuer-agnostic compile path from authentic discovery candidates → proposed IR units that can enter verification — without fixture-specific modeling and without treating synthetic Pass B as competitive discovery.
