# Package-wide covenant execution — mission report

**Base tip:** `8374fa2a` (`main` — #334 NS-4 merged; #333 PAI absorb ancestor)  
**Branch:** `cursor/package-wide-covenant-execution-b8f6`  
**Priority honored:** Package-wide correctness > isolated EBITDA refinement. Fail closed. No parallel engine.

---

## 1. Current main SHA and canonical PR plan

| Item | Value |
|---|---|
| Reconciled `origin/main` | `8374fa2a8697ce39b8ff6d63f6703ea2612b8545` |
| Preserved | #333 PAI-01–12 (`1fb258d2` absorb) + #334 NS-4 product binder |
| Selective absorb | #340 authority path (`resolveCanonicalVerifiedRemaining` → `resolveUtilization` + `computeVerifiedRemaining`) onto tip main |
| **Do not merge separately** | #336 (superseded), competing #342/#343 dual-landings without this tip, wholesale #322/#325/#327 EBITDA PRs |
| Safe follow-ons (after this lands) | #308 capacity boundary only if still unique; #310 compiler bridge as separate PR |

**Human merge recommendation:** APPROVE AND MERGE this PR into `main` as the package-wide covenant execution tip. Do **not** self-merge. Do **not** activate production authority / trusted issuer.

---

## 2. Package-wide covenant coverage matrix

Full A–I FILE:LINE audit: [`02-coverage-matrix.md`](./02-coverage-matrix.md).

| # | Domain | Classification |
|---|---|---|
| 1 | Debt incurrence and refinancing | **PARTIAL** |
| 2 | Liens and secured debt | **PARTIAL** |
| 3 | Restricted payments and available amount | **PARTIAL** |
| 4 | Investments and acquisitions | **PARTIAL** |
| 5 | Asset sales and proceeds application | **PARTIAL** |
| 6 | Affiliate transactions | **UNSUPPORTED** |
| 7 | Guarantees | **PARTIAL** |
| 8 | Financial maintenance covenants | **PARTIAL** |
| 9 | Subsidiary designation and structural restrictions | **UNSUPPORTED** |
| 10 | Cross-document shared capacity | **PARTIAL** |
| 11 | Amendments and operative versions | **PARTIAL** |
| 12 | Utilization, reclassification and historical transactions | **PARTIAL** |

**Counts:** EXECUTABLE **0** · PARTIAL **10** · EVIDENCE_BLOCKED **0** · UNSUPPORTED **2** · NOT_IMPLEMENTED **0**

Code inventory: `covenantDomainCoverage()` in `lib/product/cross-domain-transaction.ts` (aligned with audit — no false EXECUTABLE).

---

## 3. Existing capabilities proven by production code and tests

| Capability | Evidence |
|---|---|
| Multi-family composition (debt + RP + asset sale + ratios) | `evaluateCrossDomainTransaction` v2 |
| Canonical verified remaining (never from caller flags) | `resolveCanonicalVerifiedRemaining` + adversarial suite |
| Shared-pool anti-double-count | `claimedSharedPools` in remaining resolver |
| Financial identity fingerprint invalidation | adversarial + Simulate expected identity |
| PAI-01–12 fail-closed | preserved on tip; home/adversarial tests |
| NS-4 APPROVED binder on Dashboard / Position / Simulate | #334 on main; kept in this PR |
| 10-step package workflow | `executePackageTransaction` |
| Generalization (no company-id engine branches) | `package-wide-generalization.test.ts` |
| Simulate panel | `CrossDomainSimulatePanel` + `evaluateSimulateCrossDomainAcquisition` |

---

## 4. P0 / P1 gaps (customer impact)

### P0
1. **No package-wide PERMITTED** — `packagePermitted` requires all applicable domains EXECUTABLE+clear; today always false (honest).
2. **Affiliate + subsidiary designation UNSUPPORTED** — acquisition/intercompany paths cannot clear package-wide.
3. **Verified remaining production activation blocked** — trusted issuer / IdP not activated; empty ledger ≠ zero.
4. **Guarantees only PARTIAL** — standalone guarantee covenants not transaction-executable.

### P1
5. Refinancing maturity / permitted-refinancing continuity not first-class.
6. Permitted Acquisition basket engine absent (investment = RP waterfall only).
7. Asset-sale proceeds restore requires explicit `contractualAuthorityRef`.
8. Amendment auto-recompile of IR not on product path.
9. Unseen authentic packages not wired as live `CompanyCovenantData` for Simulate (compiler fixtures only).

---

## 5. Minimal integration and implementation sequence

1. Land this PR (coverage honesty + v2 authority + package workflow + Simulate panel).  
2. Keep NS-4 binder as sole approved financial identity.  
3. Wire `executePackageTransaction` into Intelligence / Ask handoff (additive).  
4. Entity/guarantee/designation facts → IR/Permission eligibility (no new engine).  
5. Production issuer activation only behind host IdP (separate gated PR).  
6. Unseen package → VEP → verified path (compiler #310 follow-on).

---

## 6–8. E2E demonstration, citations, blockers

Artifact: [`06-e2e-demo.json`](./06-e2e-demo.json)  
Script: `npx tsx scripts/mission-proof-package-transaction.ts`

**Scenario:** Coherent secured debt-funded acquisition $150M  
**Package identity:** `coherent` · asOf `2026-06-30` · CA + 2029 Indenture  
**Financial inputs:** Contractual EBITDA $1,700M (`SUPPORTING_RECONSTRUCTION`) · TNL ≈ 1.23x · SSNL ≈ 0.62x · IC ≈ 8.95x  
**Utilization:** authority absent → verified remaining withheld  
**Overall:** `not_tested` · `packagePermitted=false` (subsidiary designation UNSUPPORTED applicable)  
**Citations (sample):** §6.11 TNL; §3.3(b)(i)(C) SSNL; §3.4(a)(C) Builder Basket; §6.11 IC; §3.3(a) FCCR  

**Unresolved blockers (explicit):**
- SUBSIDIARY_DESIGNATION_STRUCTURAL UNSUPPORTED
- AFFILIATE_TRANSACTIONS UNSUPPORTED (irrelevant for this scenario but inventory gap)
- PARTIAL on debt/liens/investments/guarantees/ratios/shared capacity
- No canonical utilization authority → remaining unpublished
- Production trusted-issuer activation blocked on host

---

## 9. Tests and exact-tip CI

**Local (this tip):**

```
tests/product/cross-domain-transaction.test.ts          9 passed
tests/product/cross-domain-authority-adversarial.test.ts 22 passed
tests/product/package-transaction-execution.test.ts      6 passed
tests/product/package-wide-generalization.test.ts        8 passed
tests/product/contractual-computation.test.ts            8 passed
tests/product/contractual-ebitda-derivation.test.ts      6 passed
tests/product/debt-intelligence-dashboard.test.ts        2 passed
tsc --noEmit                                             clean for changed surface
```

Exact-tip GitHub CI recorded after push on the PR checks.

---

## 10. Human merge recommendation

**APPROVE AND MERGE** `cursor/package-wide-covenant-execution-b8f6` into `main`.

- Preserves #333 PAI + #334 NS-4  
- Absorbs #340 remaining-authority path without dual engines  
- Honest 0-EXECUTABLE coverage; fail-closed package permission  
- No self-merge · no manufactured approval · no production writes · no trusted-issuer activation
