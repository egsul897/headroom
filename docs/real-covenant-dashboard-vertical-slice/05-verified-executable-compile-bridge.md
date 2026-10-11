# Verified executable compile → Position (PR #304 advance)

**Branch:** `cursor/real-covenant-dashboard-slice-2ca3`  
**Base:** `origin/main` @ `440dd65d`  
**Paid inference:** $0 · **Production Neon writes:** none · **Trusted-issuer:** BLOCKED

## Capability demonstrated

Operative clause candidates from authentic Matthews EDGAR-reconstructed excerpts →
`classifyFixedDollarBasket` / `compileFixedDollarBasket` → fidelity PASS →
`evaluateFixedDollarCapacity` (`evaluateVerifiedCapacity` under the hood) →
Position metrics labeled **SOURCE_BACKED_COMPILED_GROSS**.

Fail-closed when the clause is not a fixed-dollar cap (Notes grandfather dollar
without "not to exceed"; CA §6.01(j) structural lien language).

Production capacity remains **REFUSED** on every VE unit.

## Milestone impact

| Milestone | Verdict | Note |
|---|---|---|
| FIXTURE_MODELED_DASHBOARD_PROVEN | PROVEN_WITH_DEFECTS | Unchanged |
| GENERALIZED_CALCULATION_PIPELINE_PROVEN | NOT_PROVEN | Matthews-only |
| AUTONOMOUS_COVENANT_COMPILATION_PROVEN | **NOT_PROVEN** | Five leaf `CovenantProvisionInput` rows still hand-encoded for modeled capacity |
| PRODUCTION_AUTHORITY_PROVEN | NOT_PROVEN | Preserved |

This advance wires **verified executable fixed-dollar compilation into Position** for
supporting clauses. It does **not** replace leaf capacity for the full permission set.

## Numerical honesty (do not conflate)

### Source-backed compiled gross (VE path)

| Unit | Section | Amount ($M) | Label |
|---|---|---:|---|
| `matw-permitted-debt-1a-fixed-dollar` | `def:Permitted Debt(1)(a)` | **1300** | SOURCE_BACKED_COMPILED_GROSS · GROSS_CONTRACTUAL · production refused |

### Modeled leaf capacity (evaluateProvision path)

| Code | Modeled ($M) | Remaining claim | Authority |
|---|---:|---:|---|
| `ind_permitted_debt_1a_flat` | **521.118** | null | GROSS_ONLY_UTILIZATION_INCOMPLETE |
| `ind_ratio_debt_fccr` | **110.336** | 110.336 modeled | MODELED_AUTHENTIC_EVIDENCE |
| `ind_permitted_debt_1b_ratio_secured` | **0** | 0 | MODELED_AUTHENTIC_EVIDENCE |
| `ind_permitted_debt_2_notes` | 300 gross | **0 NEW** | MODELED_AUTHENTIC_EVIDENCE |
| `ca_lien_601j_2024notes` | **0** | 0 | STRUCTURAL_ZERO |

### Hypothetical / unverified

| Figure | Amount ($M) | Label |
|---|---:|---|
| Indenture secured composition (1a room + FCCR) | **631.454** | HYPOTHETICAL_UNVERIFIED_SECURED_COMPOSITION |

**$1300 ≠ $521.118 ≠ $631.454.** Reports must keep these partitions separate.

## Fail-closed refusals (VE bridge)

| Candidate | Result |
|---|---|
| Permitted Debt (1)(a) sole-cap | Feeds Position as SOURCE_BACKED_COMPILED_GROSS $1300M |
| Permitted Debt (2) Notes $300M (no cap-role) | REFUSED_NOT_FIXED_DOLLAR |
| CA §6.01(j) | REFUSED_NOT_FIXED_DOLLAR |
| Any PRODUCTION authorityMode | PRODUCTION_CAPACITY_REFUSED |

## Multi-package fixed-dollar VE (bounded)

Shared core: `verified-executable-compile-core.ts` → `compileVerifiedFixedDollarBridge`.

| Package | Candidate | Gross ($M) | Same compile core? |
|---|---|---:|---|
| Matthews | Permitted Debt (1)(a) | **1300** | yes |
| MHK (authentic holdout CA) | §7.03(f) receivables | **700** | yes |

Candidate discovery remains package-specific. Full leaf dashboard / financial
fixture path is still Matthews-only → `GENERALIZED_CALCULATION_PIPELINE_PROVEN`
stays **NOT_PROVEN**.

## Remaining blockers

1. Replace leaf `matthewsCovenantProvisions()` capacity path with compiled IR for ratio/structural rows (FCCR, leverage) — fixed-dollar VE does not cover them.
2. Generalize full Position leaf dashboard (financials + utilization + OA) beyond Matthews — VE-only multi-package is not enough.
3. Utilization completeness certificate + trusted-issuer activation before any AVAILABLE remaining.
4. Full-exhibit / package CERTIFIED IR (excerpts are reconstructed).
