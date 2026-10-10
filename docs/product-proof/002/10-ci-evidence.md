# CI and SHA evidence

## Local exact evidence (this continuation)

| Item | Value |
|---|---|
| Feature branch | `cursor/product-proof-002-compilation-d8e9` |
| Starting SHA (verified) | `e6f82aa9c719ab8975bd9296bd17cba3a7b78666` |
| Feature slice SHA | `64e39ab50af98dcb5884f21f169b785f171d0a37` |
| Ending tip SHA (CI-verified) | `b4d45628054a8d532f1a0c12583cd1e731deff1c` |
| Feature commit preserved | `334f2755f85bcb7351683b3672eb8bc0b7a7f689` |
| `origin/main` at continuation start | `c2dde8f1dd28832eb77ab6c9f50d4609a9efd52e` |
| PR | https://github.com/egsul897/headroom/pull/266 |
| PP001 doc-A text SHA-256 | `a7d281818d70c085076dd612bb1fe8b3965bd452f61ad3d413c57e3f2879a58e` |
| MHK raw HTML SHA-256 | `6ee4abf323f03c509df295d82601baaeb3d40956105f2c18fd94add7af5f9784` |
| MHK extracted text SHA-256 | `f0210a431fef015a008e8821e1655407d618ec5984cb9899ced83a8679ddb12c` |
| Unit tests | `tests/contract-model/fixed-dollar-basket/` + `offline-package-compile/` — **18/18 passed** (`logs/unit-test-full.txt`) |
| Phase 3 certification | **481/481 passed** (`npm run test:phase3-certification`) |
| Structural heading regressions | 106/106 passed (heading adversarial suites) |
| MTN compile | `artifacts/mtn-regression/compile-summary.json` — 3 VERIFIED_EXECUTABLE; production refused |
| MHK compile | `artifacts/mhk-holdout/compile-summary.json` — 910 nodes; 2 VERIFIED_EXECUTABLE; production refused |

## Terminal CI (exact tip `b4d45628`)

| Check | Result | Run |
|---|---|---|
| certified path (provider-free) | **pass** | https://github.com/egsul897/headroom/actions/runs/38053291184 |
| Vercel | **pass** | deployment completed |
| Vercel Preview Comments | **pass** | |

All 4 checks completed without failures on tip `b4d45628054a8d532f1a0c12583cd1e731deff1c`.

## Constraints

- No auto-merge
- No production Neon writes
- No paid inference
- No certification advancement
- No sealed-reference rewrite
