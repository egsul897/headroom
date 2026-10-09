# Authentic packages (Agent 6)

Public SEC EDGAR financing packages acquired for company-agnostic end-to-end validation.

| Package | Issuer | CIK |
|---|---|---|
| `knife-river-2023-2026` | Knife River Corporation | 0001955520 |
| `insulet-2021-2026` | Insulet Corporation | 0001145197 |
| `benchmark-2025` | Benchmark Electronics, Inc. | 0000863436 |

Each directory contains:

- `package-manifest.json` — document identities / EDGAR accessions
- `provenance.json` — content hashes
- `raw-html/` — as-filed exhibits
- `extracted-text/` — `stripHtmlPreserveStructure` output

Harness: `npm run agent6:authentic-e2e`  
Report: `docs/agent-6-authentic-company-e2e/MISSION-REPORT.md`
