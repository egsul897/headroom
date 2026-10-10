# Headroom Product Proof 001

Authentic unseen debt-package end-to-end challenge (Vail Resorts / MTN).

## Verdict

**PARTIAL_PRODUCT_CAPABILITY_PROVEN** — see `11-final-verdict.md`.

## Reproduce

```bash
# From repo root on main @ 7f1dd3a2 (or this branch with frozen sources committed)
npm ci
npx prisma generate   # client only; do not write production Neon
npx tsx scripts/product-proof/run-001-mtn-pipeline.ts
```

Sources are already frozen under `sources/mtn-2026-tenth-ar-credit-agreement/`.

## Deliverables

| File | Contents |
|---|---|
| `00-baseline.md` | SHA, PRs, capability inventory |
| `01-source-manifest.json` | Package, URLs, hashes, gaps |
| `02-frozen-challenge.md` | Questions A–I |
| `03-pipeline-execution.md` | Stage-by-stage run log |
| `04-independent-legal-reference.md` | Lawyer-style truth set |
| `05-results-comparison.md` | Engine vs truth |
| `06-financial-utilization-evidence.md` | Evidence classes |
| `07-transaction-results.md` | Sims + labeled hypotheticals |
| `08-customer-output.md` | Customer-facing posture |
| `09-failure-register.md` | Failures |
| `10-remediation-roadmap.md` | Ranked blockers |
| `11-final-verdict.md` | Single verdict |
| `artifacts/` | Machine-readable stage outputs |
| `logs/` | Console / JSONL |
