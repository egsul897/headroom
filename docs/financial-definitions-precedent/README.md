# Financial Definitions Precedent (WS-FDP)

**Workstream:** `WS-FDP` — Financial covenant & EBITDA intelligence  
**Agent:** Financial definitions precedent (`bc-01a11d8b-e431-7a57-b700-f0b5e1d143af`)  
**Branch:** `cursor/financial-definitions-precedent-43af`  
**Status:** `DRAFT_DATASET` — source-backed, not certified

Deep, source-backed precedent dataset focused on **financial definitions**, **leverage/coverage tests**, and **covenant calculation mechanics**.

## Soft gates

- No invented financial results.
- No claim of legal equivalence between same-labeled terms across instruments.
- No paid provider calls.
- No certification status changes.
- Do not modify Definition Encyclopedia or Basket Formula Library owned production files.

## Pack contents

| Path | Role |
| --- | --- |
| `00-ownership-and-coordination.md` | Exclusive ownership + peer coordination contracts |
| `01-schema.json` | Entry schema, missing-input rule, peer boundaries |
| `02-precedent-atlas.json` | Financial-definition precedent atlas |
| `03-calculation-dependency-graph.json` | Calculation dependency graph (+ non-equivalence edges) |
| `04-addback-taxonomy.json` | EBITDA add-back / exclusion taxonomy |
| `05-negative-examples-conditions-not-capacity.json` | Numerical conditions that are not capacity |
| `06-missing-financial-inputs.json` | Explicit `MISSING_INPUT:<key>` catalog |
| `07-unresolved-interpretation-queue.json` | Open interpretation / evidence gaps |
| `08-regression-candidates.json` | Regression candidates (not certified goldens) |
| `09-mechanic-divergences.json` | Same label, different calculation mechanics |
| `10-dataset-export.json` | Compact joinable export |
| `11-progress-ledger.md` | Append-only progress ledger |
| `12-mission-report.md` | Mission report |
| `examples/` | Human-readable source-backed vignettes |
| `source-normalize/` | Deterministic plaintext sidecars for HTML fixtures (citation offsets) |

## Research coverage (this draft)

| Target | Coverage |
| --- | --- |
| Consolidated EBITDA / Adjusted EBITDA | CHWY, CONMED, FWRG |
| Consolidated Net Income | CHWY, CONMED |
| Consolidated Total Debt / Funded Debt | CHWY, CONMED |
| Consolidated Secured / First Lien Debt | CHWY |
| Net debt / cash netting | CHWY (inside CTD); CONMED (capped netting in ratios) |
| First-lien / secured / total leverage | CHWY ratios; CONMED SSLR/TLR |
| Fixed charge coverage | FWRG, LSB (divergent formulas) |
| Interest coverage | CONMED; CHWY definition locus unresolved |
| Excess Cash Flow / Retained ECF | CHWY |
| Available Amount | CHWY §6.08(a)(3); FWRG Article I builder |
| Pro forma / acquisition add-backs / synergies / run-rate | CHWY Expected Run Rate Benefit; CONMED Pro Forma Adjustments |
| Restructuring charges | CHWY CNI exclusions |
| Add-back caps / lookbacks | CONMED 15% / $30M; CHWY 36-month lookforward |
| Cure rights | Cross-ref / partial (ABL & FWRG §6.10 gaps queued) |
| Step-up / step-down leverage tests | CONMED §7.1 + Second Amendment history |

## Tests

```bash
npx vitest run tests/financial-definitions-precedent
```
