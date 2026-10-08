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
| `10-dataset-export.json` | Compact joinable export (`fdp.v1`) |
| `11-progress-ledger.md` | Append-only progress ledger |
| `12-mission-report.md` | Mission report |
| `13-data-production-checkpoint.json` | Honest live-vs-fixture acquisition checkpoint |
| `14-typed-calculations.json` | Typed calc components (`fdp.typed-calc.v1`); SEMANTIC_HYPOTHESIS |
| `15-arithmetic-evaluation.json` | Independent arithmetic cases (`fdp.arith.v1`) |
| `16-legal-review-states.json` | Legal-review state vocabulary + promotion rule |
| `17-source-document-registry.json` | Immutable source file hashes (no new SEC acquisition) |
| `18-canonical-export-v2.json` | Versioned canonical export for peer joins |
| `19-sha-reconciliation.json` | PR SHA reconciliation record |
| `examples/` | Human-readable source-backed vignettes |
| `source-normalize/` | Deterministic plaintext sidecars for HTML fixtures (citation offsets) |

## Research coverage (this draft)

| Target | Coverage |
| --- | --- |
| Consolidated EBITDA / Adjusted EBITDA | CHWY, CONMED, FWRG, GIB, DSGR (EBITDA) |
| Consolidated Net Income | CHWY, CONMED, GIB |
| Consolidated Total Debt / Funded Debt | CHWY, CONMED, GIB funded-indebtedness family |
| Consolidated Secured / First Lien Debt | CHWY; GIB Funded First Lien / Senior Secured Indebtedness |
| Net debt / cash netting | CHWY (inside CTD); CONMED (capped netting in ratios); GIB net leverage |
| First-lien / secured / total leverage | CHWY ratios; CONMED SSLR/TLR; GIB FL/Secured/Total Net Leverage; DSGR TNLR |
| Fixed charge coverage | FWRG, LSB (divergent formulas) |
| Interest coverage | CONMED, GIB, DSGR; CHWY definition locus unresolved |
| Excess Cash Flow / Retained ECF | CHWY; GIB ECF + Retained Excess Cash Flow Amount |
| Available Amount | CHWY §6.08(a)(3); FWRG; GIB Available Amount Builder Basket; DSGR AA |
| Pro forma / acquisition add-backs / synergies / run-rate | CHWY Expected Run Rate Benefit; CONMED PF Adjustments; GIB §1.10; DSGR Cost Savings / Combined Cap |
| Restructuring charges | CHWY CNI exclusions |
| Add-back caps / lookbacks | CONMED 15% / $30M; CHWY 36-month lookforward; DSGR 20% Combined Cap; GIB §1.10 aggregate |
| Cure rights | Riot BTC margin Cure Amount (≠ equity cure); ABL & FWRG §6.10 gaps queued |
| Step-up / step-down leverage tests | CONMED §7.1 step-up; GIB ECF prepay % step-down |
| DSGR doc-d EBITDA / Cost Savings | Second A&R EBITDA + Cost Savings + 20% Combined Cap (typed + arith) |
| Gibraltar builder-basket citation | §7.05(a)(y) def vs operative parenthetical — OPEN (`UQ-GIB-705AY-CITATION`) |

## Tests

```bash
npx vitest run tests/financial-definitions-precedent
```
