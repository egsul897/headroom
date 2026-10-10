# PRODUCT PROOF 001 — baseline report

**Workstream:** read-only product proof (separate from PR merge)  
**Package:** Kennametal Inc. $500M Term Loan Credit Agreement (EX-10.2, dated 2026-05-28)  
**Source:** SEC EDGAR accession `0001193125-26-253476`  
**Freeze:** `docs/product/product-proof-001/00-freeze-manifest.json`  
**First execution:** `docs/product/product-proof-001/01-first-execution.json`

## Guardrails held

- No auto-merge
- No paid inference
- No certification promotion
- No production Neon writes
- No manually modeled covenants
- Knife River BLIND body not opened

## Source-backed legal findings (from frozen extracted text)

| ID | Finding |
|----|---------|
| PP001-Q1 | §6.1 Consolidated Leverage Ratio covenant: **3.75 to 1.00**, with Qualified Acquisition step-up to **4.25 to 1.00** under stated Leverage Increase Period provisos |
| PP001-Q2 | §6.2(e) CapLease / purchase-money Indebtedness aggregate cap: **$150,000,000** |
| PP001-Q3 | §6.2(i) additional Indebtedness (+ Attributable Debt in Qualified Receivables Transactions): **$350,000,000** |
| PP001-Q4/Q5 | Product cannot yet produce a defensible capacity or secured dual-path EXECUTABLE answer without modeled permissions, VEP, and NS-4 financials |

## First unsupported stage

**PASS_B_SEMANTIC** — provider key absent / paid inference forbidden for this baseline; synthetic Pass B not used.

Downstream product stages (modeled permissions, VEP, NS-4) are also unsupported; recorded after the first break.

## Customer-usable answer?

**No.** Baseline establishes the honest stop point. See top blockers in `01-first-execution.json`.

**Baseline SHA:** `42e47d6785e6d73b4fb28ee7a63af22d00ff3d06`
