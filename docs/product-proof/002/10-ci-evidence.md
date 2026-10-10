# CI and SHA evidence

## Local exact evidence (this continuation)

| Item | Value |
|---|---|
| Feature branch | `cursor/product-proof-002-compilation-d8e9` |
| Starting SHA (verified) | `e6f82aa9c719ab8975bd9296bd17cba3a7b78666` |
| Feature commit preserved | `334f2755f85bcb7351683b3672eb8bc0b7a7f689` |
| `origin/main` at continuation start | `c2dde8f1dd28832eb77ab6c9f50d4609a9efd52e` |
| PR | https://github.com/egsul897/headroom/pull/266 |
| PP001 doc-A text SHA-256 | `a7d281818d70c085076dd612bb1fe8b3965bd452f61ad3d413c57e3f2879a58e` |
| MHK raw HTML SHA-256 | `6ee4abf323f03c509df295d82601baaeb3d40956105f2c18fd94add7af5f9784` |
| MHK extracted text SHA-256 | `f0210a431fef015a008e8821e1655407d618ec5984cb9899ced83a8679ddb12c` |
| Unit tests | `tests/contract-model/fixed-dollar-basket/` + `offline-package-compile/` — **18/18 passed** (`logs/unit-test-full.txt`) |
| Structural heading regressions | 106/106 passed (heading adversarial suites) |
| MTN compile | `artifacts/mtn-regression/compile-summary.json` — 3 VERIFIED_EXECUTABLE; production refused |
| MHK compile | `artifacts/mhk-holdout/compile-summary.json` — 910 nodes; 2 VERIFIED_EXECUTABLE; production refused |

Ending SHA is the tip of this branch after the vertical-slice commit (record after push).

## Terminal CI

PR #266 checks at the **exact final tip** are the terminal CI attachment. Local vitest + compile console logs remain the reproducible offline-compile evidence.

## Constraints

- No auto-merge
- No production Neon writes
- No paid inference
- No certification advancement
- No sealed-reference rewrite
