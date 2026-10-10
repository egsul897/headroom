# Coherent correctness gate — solver $5,129M vs binding $4,041M

**Labels:** MODELED / EVALUATION_SEED_NOT_NS4_APPROVED — not verified remaining capacity.  
**No automatic merge. No certification bypass.**

## 1. Trace: why the solver reported secured $5,129M (SSNL omitted)

| Step | Selection | Amount |
|---|---|---|
| Indenture secured winning election (pre-fix) | `coh-ind-d-ratio-fccr` + `coh-ind-d-scf-flat` (CONCURRENT_DISREGARDED) | ≈ $11,933M = FCCR room + SCF flat |
| Lien path | SCF Permitted Liens cl.(6) auto-lien only — Ratio Debt had **no own** lien leg | false coverage |
| CA secured | `coh-ca-d-permitted-601p` §6.01(p) TNL ≤ 4.25x, **no** Permitted Lien path | $5,129M |
| Package min | min(CA $5,129, Indenture $11,933) | **$5,129M** |

Indenture `mila_secured` / SSNL ≤ 3.00x ($4,041M) never became binding because the contaminated indenture max looked looser than the CA.

## 2. Fixes (generalizable)

1. **`evaluateElection` (lib/solver/election.ts)**  
   - Secured: every `DEBT_INCURRENCE` leg needs its own `AUTOMATIC_LINKED_PERMISSION` lien or an independent `LIEN` election member.  
   - `CONCURRENT_COUNTED` fixed+ratio `maxCapacity` = `max(fixed-only, disregardedFixed + ratioRoom)` — not sum of standalones.

2. **`computeRemainingCapacityAfterDebtIncurrence` (lib/covenant-engine.ts)**  
   - Per document: if solver EXACT > capacityFormulas legacy ceiling → `SOLVER_CLAMPED_TO_LEGACY`.  
   - Package: `packageAuthoritative` = MODELED_CROSS_DOCUMENT; solver package min is `NON_AUTHORITATIVE_DIAGNOSTIC`; false-favorable package figures are quarantined.

3. **Customer headlines** (covenant overview + home overview) read `packageAuthoritative` / cross-document, not raw solver min.

## 3. Corrected authoritative result

| Side | Amount | Binding | Authority |
|---|---|---|---|
| Secured | **$4,041M** | 2029 Notes Indenture §3.3(b)(i)(C) `mila_secured` (SSNL ≤ 3.00x) | MODELED_CROSS_DOCUMENT |
| Unsecured | **$5,129M** | Credit Agreement §6.11 `ca_leverage_cap` (TNL ≤ 4.25x) | MODELED_CROSS_DOCUMENT |

Solver-native package min after lien fix is diagnostic only and must not exceed $4,041M secured.

## 4. Borrowing proceeds

| Treatment | Cash | Net debt Δ | TNL room | SSNL/mila room |
|---|---|---|---|---|
| Cash retained | +draw | 0 | $5,129M | $4,041M |
| Immediately spent (engine convention) | unchanged | +draw | $5,079M (+$50) | $3,991M (+$50) |

## 5. Equity builder (§3.4(a)(C))

- Starter max($330M, 25% EBITDA) + 50% CNI + 100% equity proceeds/contributions since Issue Date.  
- Seed: $425 + $260 + $2,150 = **$2,835M** headline; `includeEquityProceeds=true`.  
- Issue-date eligibility: post-Issue-Date only; Disqualified Stock / Otherwise Applied excluded.  
- Historical attribution: seed `equityProceedsSinceIssue` under evaluation financials.

## 6. Sequential RP / investment

S1 incur → S2 repay → S3 dividend → S4 equity → S5 investment share Available Amount; MODELED overlays; Neon ledger not written.

## 7. Regressions

- `tests/solver/election.test.ts` — lien free-ride blocked; COUNTED max not sum  
- `tests/solver/secured-debt-lien-binding.test.ts` — package $4,041; proceeds dual treatment  
- `tests/product/financial-capacity-independent-validation.test.ts` — false-favorable cleared  

## 8. Coordination blockers

| Issue | Role |
|---|---|
| #220 | Financial approval — still EVALUATION_SEED_NOT_NS4_APPROVED |
| #234 | Utilization completeness — unknown DEBT_INCUR / lien / investment draws |
| #218 | Cross-document restrictions — MODELED binding vs solver diagnostic |

## 9. Success criterion

Customer-facing analysis and package authoritative binding agree: secured = Indenture mila $4,041M, unsecured = CA TNL $5,129M. Incorrect solver outputs are not hidden behind presentation-only corrections — election + clamp + quarantine change the engine path.
