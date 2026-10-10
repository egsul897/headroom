# Product Proof 002 — Unseen-Package Covenant Compilation

**Baseline:** Product Proof 001 (PR #263) remains frozen under `docs/product-proof/001/`.

**Mission:** Convert authentic covenant discoveries into generalized, source-backed, independently reviewable rule representations without issuer-specific hardcoding.

## Entry point

```bash
npx tsx scripts/product-proof/run-002-compile-package.ts \
  --manifest=docs/product-proof/002/manifests/mtn-regression.json \
  --out=docs/product-proof/002/artifacts/mtn-regression

npx tsx scripts/product-proof/run-002-compile-package.ts \
  --manifest=docs/product-proof/002/manifests/mhk-holdout.json \
  --out=docs/product-proof/002/artifacts/mhk-holdout
```

Library: `lib/contract-model/analysis/offline-package-compile.ts` → `compileFrozenDebtPackage`.

## Document index

| Doc | Contents |
|---|---|
| `00-bridge-map.md` | Phase 1 interface map + minimal integration design |
| `01-source-manifest.json` | Frozen packages + SHAs |
| `02-frozen-challenge.md` | Holdout freeze protocol |
| `03-pipeline-execution.md` | Runnable compile chain evidence |
| `04-independent-legal-reference.md` | MHK legal reference (post-freeze) |
| `05-results-comparison.md` | MTN regression + MHK holdout scoring |
| `06-capacity-handoff.md` | Verified-only capacity refuse path |
| `07-human-interventions.md` | Explicit intervention ledger |
| `08-failure-register.md` | Remaining gaps |
| `09-remediation-roadmap.md` | Next levers |
| `10-ci-evidence.md` | SHA + CI |
| `11-final-verdict.md` | One verdict |
| `12-vertical-slice-phases.md` | Phases 1–7 vertical-slice evidence |

## Constraints honored

- No Neon / production writes
- No paid inference without authorization (synthetic Pass B)
- No MTN / MHK provision IDs or thresholds in production logic
- No auto-merge / certification advancement
- PP001 freeze untouched as baseline
