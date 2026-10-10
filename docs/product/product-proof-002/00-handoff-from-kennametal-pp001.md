# Product Proof 002 — handoff from Kennametal Product Proof 001

**Handoff location (canonical):** `docs/product/product-proof-002/`  
**Kennametal frozen evidence:** `tests/fixtures/product-proof-001/kennametal-2026-term-loan-credit-agreement/frozen-evidence/`  
**Kennametal PP001 docs:** `docs/product/product-proof-001/`  
**Baseline SHA:** `42e47d6785e6d73b4fb28ee7a63af22d00ff3d06`  
**PR #253 tip at handoff:** see `01-pr253-ci-and-mergeability.json`

## Coordination with MTN Product Proof 001 (avoid duplicate compiler work)

| Workstream | Package | Path | First hard stop |
|------------|---------|------|-----------------|
| **MTN PP001** | Vail Resorts (MTN) Tenth A&R + indentures + FY2026 10-K | `docs/product-proof/001/` (PRs [#263](https://github.com/egsul897/headroom/pull/263), [#264](https://github.com/egsul897/headroom/pull/264)) | **`GENERALIZED_RULE_REPRESENTATION`** (`compileCovenantToIR`) — demonstrated compiler / IR path break |
| **Kennametal PP001** (this branch) | Kennametal Inc. $500M Term Loan CA EX-10.2 | `docs/product/product-proof-001/` + fixture under `tests/fixtures/product-proof-001/` | **`PASS_B_SEMANTIC_UNSUPPORTED`** — provider/key gate; **not** a demonstrated compiler failure |

**PP002 owner instruction:** Do **not** re-run Kennametal through paid Pass B solely to rediscover that `compileCovenantToIR` is blocked — MTN already owns that proof. Kennametal’s next authentic step is obtaining real Pass B/IR substrate (or an authorized issuer-agnostic compile path) **without** hand-modeling permissions and **without** treating synthetic discovery as authentic.

## What is frozen for PP002 (Kennametal)

| Artifact | Location | Count / hash pin |
|----------|----------|------------------|
| Source HTML + extracted text + provenance | `tests/fixtures/product-proof-001/kennametal-2026-term-loan-credit-agreement/` | body sha256 `4827a5cf…4df7` |
| Structural nodes | `frozen-evidence/structural-nodes.json` | **426** |
| Structural index summary | `frozen-evidence/structural-index-summary.json` | — |
| Definitions | `frozen-evidence/definitions.json` | **230** |
| References | `frozen-evidence/references.json` | **333** |
| Pass A candidates | `frozen-evidence/pass-a-candidates.json` | **236** (exact baseline) |
| Evidence manifest | `frozen-evidence/manifest.json` | includes file hashes |

Reproduce offline: `npx tsx scripts/product-proof-001/export-frozen-evidence.ts` (must remain 236 Pass A).

## Exact missing dependencies (Pass B → IR → VEP)

| Dependency | Status on Kennametal | Notes |
|------------|----------------------|-------|
| **Pass B semantic discovery** (real provider) | **MISSING** — `PASS_B_SEMANTIC_UNSUPPORTED` | Baseline forbids paid inference; synthetic Pass B **must not** be substituted as authentic proof |
| Sealed discovery candidates / roles | MISSING | Blocked by Pass B |
| Generalized rule IR (`compileCovenantToIR`) | **NOT REACHED** on Kennametal | Demonstrated blocked on **MTN** at `GENERALIZED_RULE_REPRESENTATION` — do not duplicate that proof here |
| Verification / VEP | MISSING | OUT-VEP-01 class; empty VEP → REQUIRE refusal (see MTN evidence) |
| Modeled Permission / SharedConstraint graph | MISSING | Hand-modeling Kennametal permissions **forbidden** |
| NS-4 APPROVED financials / completeness certs | MISSING | OUT-NS4-01 |
| Customer Position / Simulate / Ask on Neon | UNSUPPORTED here | No production Neon writes |

## Distinction that must be preserved

- **`PASS_B_SEMANTIC_UNSUPPORTED`** = environmental / policy gate (no paid key; synthetic refused). Offline parse → structure → Pass A **succeeded**.
- **Demonstrated compiler failure** = MTN’s **`GENERALIZED_RULE_REPRESENTATION`** block at `compileCovenantToIR`. Kennametal has **not** demonstrated that failure because it never reached that stage with authentic sealed candidates.

## Unresolved tracked limitations (unchanged)

Keep open on `docs/product/unified-integration/14-tracked-merge-blockers-and-limitations.md`:

- FA-P1-01, FA-P2-01, FA-P2-02  
- FA-CONC-01, FA-CONC-02 (+ FA-ENV-\*)  
- OUT-VEP-01, OUT-NS4-01  

Green CI ≠ resolution.

## PR #253 disposition for human integration review

Solver↔simulation shared-lien remediation is a **candidate for human integration review**, subject to:

1. Independent code review  
2. Resolution of **non-mergeable** GitHub state (conflicts vs `main`)  

Do **not** auto-merge, certify, Neon-write, or broaden PR #253 from this workstream.
