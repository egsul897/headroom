# CI and SHA evidence

## Local exact evidence (this run)

| Item | Value |
|---|---|
| Feature branch | `cursor/product-proof-002-compilation-d8e9` |
| Base | `main` @ `7f1dd3a202b026b9a862ef727480a1a9f284523a` (pre-push; updated after commit) |
| PP001 doc-A text SHA-256 | `a7d281818d70c085076dd612bb1fe8b3965bd452f61ad3d413c57e3f2879a58e` |
| MHK raw HTML SHA-256 | `6ee4abf323f03c509df295d82601baaeb3d40956105f2c18fd94add7af5f9784` |
| MHK extracted text SHA-256 | `f0210a431fef015a008e8821e1655407d618ec5984cb9899ced83a8679ddb12c` |
| Unit tests | `tests/contract-model/offline-package-compile/` — **5/5 passed** (`logs/unit-test-full.txt`) |
| MTN compile wall | ~2242 ms (`logs/mtn-regression-console.txt`) |
| MHK compile wall | ~155 ms (`logs/mhk-holdout-console.txt`) |

## Terminal CI

CI run ID / URL for this PR will be recorded after push (see PR checks). Until green CI is attached, treat local vitest + compile console logs as the reproducible terminal evidence for the offline compile path.

## Constraints

- No auto-merge
- No production Neon writes
- No paid inference
- No certification advancement
