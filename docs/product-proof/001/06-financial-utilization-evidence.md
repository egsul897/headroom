# Product Proof 001 — Financial & Utilization Evidence

## Separation of evidence classes

### 1. Publicly supported financial figures (FY2026 10-K)

Source: `mtn-doc-d-10k-fy2026` (accession `0000812011-26-000049`), period ended **2026-07-31**.

| Figure | Value (as disclosed) | Use in this proof |
|---|---|---|
| VHI revolver commitment | $600.0M | Public context for Facility Amount components |
| VHI revolver outstanding | $180.0M | Public instrument balance — **not** basket attribution |
| Revolver availability (narrative) | ~$337.4M | Liquidity disclosure |
| Term loan outstanding | ~$1,243.1M | Public instrument balance |
| Tenth A&R new term loan size (narrative) | $1,275.0M | Public description of restatement |
| 6.50% Notes carrying value | ~$595.0M | Indenture instrument |
| 5.625% Notes carrying value | ~$495.1M | Indenture instrument |

### 2. Explicit hypothetical financial assumptions (labeled)

Used only for arithmetic / authority API probes — **not** as issuer truth:

| Assumption | Value | Label |
|---|---|---|
| Hypothetical modeled gross for util probe | $50,000,000 | `HYPOTHETICAL_GROSS_FOR_UTILIZATION_PROBE_ONLY` |
| Illustrative Facility Amount | $1,875,000,000 (= $600M + $1,275M) | LEGAL_REFERENCE_ILLUSTRATIVE — not engine output |
| Illustrative MFA floor gross (l) | $2,750,000,000 − $1,875,000,000 = **$875,000,000** | LEGAL_REFERENCE_ILLUSTRATIVE |

### 3. Authenticated utilization records

**None.** No APPROVED completeness certificate; no attributed `UtilizationEvidenceRecord` for Permitted Debt (l) or any other basket.

### 4. Missing / unverified utilization

| Item | Status |
|---|---|
| Permitted Debt (l) outstanding Secured Debt | UNKNOWN |
| Schedule 2.3 Part B Debt | NOT STRUCTURED |
| Completeness certificate | MISSING |
| NS-4 APPROVED financial snapshot | MISSING on this path |
| Intercreditor executed status | UNKNOWN |

---

## Integrity rules exercised

Command path: `artifacts/stage-09-utilization-binding.json`

| Rule | Result |
|---|---|
| Empty ledger ≠ zero usage | **PASS** — authority `kind=UNKNOWN`, `supportsRemainingClaim=false` |
| Remaining without completeness | **PASS** — unmodeled gross `publicationLabel=REFUSED` |
| Hypothetical gross without util authority | **PASS** — `GROSS_ONLY` / not AVAILABLE |

---

## Capacity claims permitted by evidence discipline

| Claim | Status |
|---|---|
| Verified gross capacity (product) | **NOT ESTABLISHED** |
| Illustrative legal-reference gross (l) | ~$875M under stated assumptions — **not product-verified** |
| Verified remaining capacity | **NOT DETERMINED** |

Never claim verified remaining from public 10-K instrument totals alone.
