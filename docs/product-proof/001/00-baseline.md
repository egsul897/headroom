# Product Proof 001 — Baseline & Capability Inventory

**Mission:** Authentic Unseen Debt-Package End-to-End Challenge  
**Tested SHA (main):** `7f1dd3a202b026b9a862ef727480a1a9f284523a`  
**Branch for this proof:** `cursor/product-proof-001-d8e9`  
**Date:** 2026-10-10  
**Constraint adherence:** no PR merges, no production Neon writes, no paid inference, no hand-authored IR/rulebook for MTN

---

## Repository state inspected

| Item | Finding |
|---|---|
| `origin/main` tip | `7f1dd3a2` — Merge PR #237 utilization-authority integration |
| Working tree at start | Clean on `main` |
| Open product integration PRs | #250 Stages 2–5, #253 canonical integrated product, #258 finish-product authentic workflow — **not merged; not cherry-picked** |
| Related open PRs | #251 sequential certified, #254/#256 secured capacity, #257 FCE reconcile, #239/#244 capacity authority — **documented only** |

## Most complete coherent runnable stack on main

**Winner for customer UI numerics:** Coherent EVALUATION legacy engine (`prisma:seed` → `capacityFormulas` + financial snapshots → Position/Simulate). This is **fixture/seeded**, not authentic document→capacity automation.

**Winner for authentic-document substrate (what this proof exercises):** Phase 2A–2C libraries + KF family discovery + utilization authority + verified-execution REQUIRE boundary — runnable offline without Neon writes or paid LLM.

**Not complete on main as one E2E certified stack:** SOURCE → CERTIFIED IR → VEP → affirmative Position/Ask for a new authentic issuer.

## Capability inventory (main @ 7f1dd3a2)

| Stage | On main? | Operational character | Notes |
|---|---|---|---|
| SOURCE DOCUMENTS | Yes | Operational (upload/KF/fixtures) | Neon/Blob for product path; offline freeze used here |
| STRUCTURAL INDEX | Yes | Genuinely operational, deterministic | Proven on MTN in this run |
| COVENANT DISCOVERY | Yes | Pass A operational; Pass B needs paid LLM | Synthetic Pass B empty defaults used (labeled) |
| MULTI-DOCUMENT GRAPH | Yes | Deterministic operational | Proven on MTN; 0 cross-doc relationships resolved |
| DEFINITION RESOLUTION | Yes | Structural defs + probe operational | Recursive 2D context bundle not wired as issuer CLI |
| AMENDMENT PRECEDENCE | Yes | Library operational | 0 effects — package is restatement + separate indentures |
| GENERALIZED RULE REPRESENTATION | Yes (lib) | **Not product-complete for new issuer** | Needs paid compile or sealed units — **BLOCKED here** |
| VERIFICATION | Yes (lib) | REQUIRE boundary operational | No candidate to verify — **BLOCKED** |
| FINANCIAL / UTILIZATION BINDING | Partial | Utilization authority **operational** | FCE primary engine on PRs #250/#253/#258 only |
| CAPACITY ENGINE | Dual | Legacy Coherent yes; authentic VEP path blocked for MTN | Empty VEP → REFUSED |
| TRANSACTION SIMULATION | Yes | Same gate as capacity | REFUSED without VEP |
| CUSTOMER Position/Simulate/Ask | Partial | Shells exist | Unified Stage-5 stack on open PRs; Neon write forbidden here |

## Dependencies / environment for this run

| Dependency | Status |
|---|---|
| Node 22 + `npm ci` | Installed in agent VM |
| `npx prisma generate` | Done (client only; no migrate/seed against Neon) |
| `DATABASE_URL` | Present — **Neon production host** (`*.neon.tech`) — **reads unused; writes forbidden** |
| Local Postgres | Not provisioned |
| `ANTHROPIC_API_KEY` / `AI_GATEWAY_API_KEY` | Absent — synthetic StageCaller |
| Paid inference authorization | **Not granted** |
| SEC EDGAR fetch | Performed with identifying User-Agent for freeze only |

## Feature availability distinction

| Class | Examples in this proof |
|---|---|
| **Genuinely operational** | Structural index, Pass A signals, KF family candidates, package-graph classification, definition-anchor probe, utilization UNKNOWN-on-empty, VEP REQUIRE refusal |
| **Fixture-only / seeded product path** | Coherent `capacityFormulas`, CONMED GT catalog demo (not used as primary package) |
| **Mocked / synthetic** | Pass B semantic classification (empty schema defaults) |
| **Implemented but unreachable for MTN** | Semantic compile→verify→VEP→capacity without hand-modeling or paid inference |
| **Unmerged only** | FCE, sequential execution, `VerifiedSimulatePanel`, unified Position bridges (#250/#253/#258) |

## Decision for this mission

Proceed on **main as-is** with an offline authentic-package probe. Do not merge integration PRs to manufacture a pass. Record where the pipeline breaks.
