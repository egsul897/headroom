# CI and SHA evidence

## Local exact evidence (this continuation)

| Item | Value |
|---|---|
| Feature branch | `cursor/product-proof-002-compilation-d8e9` |
| Starting SHA (greater-of slice) | `b12ef7d15ff7703b71884e9c1e2772cf26de87ee` |
| Prior CI-green tip (fixed-dollar) | `b4d45628054a8d532f1a0c12583cd1e731deff1c` |
| Prior reported tip (docs pin) | `2011da01df3a1eeedc0d929f908109cb975c46c0` |
| Feature slice SHA (fixed-dollar) | `64e39ab50af98dcb5884f21f169b785f171d0a37` |
| PR | https://github.com/egsul897/headroom/pull/266 |
| PP001 doc-A text SHA-256 | `a7d281818d70c085076dd612bb1fe8b3965bd452f61ad3d413c57e3f2879a58e` |
| MHK raw HTML SHA-256 | `6ee4abf323f03c509df295d82601baaeb3d40956105f2c18fd94add7af5f9784` |
| MHK extracted text SHA-256 | `f0210a431fef015a008e8821e1655407d618ec5984cb9899ced83a8679ddb12c` |
| Unit tests (greater-of + fixed-dollar + offline + arch) | **51/51 passed** (`logs/unit-test-greater-of.txt`) |
| MTN compile | `artifacts/mtn-regression/compile-summary.json` — 3 VE fixed-dollar; 0 greater-of; production refused |
| MHK compile | `artifacts/mhk-holdout/compile-summary.json` — 910 nodes; 2 VE fixed-dollar + 2 VE greater-of; 1 shared pair; production refused |

Tip drift explanation: `2011da01` docs-pinned the first fixed-dollar ending SHA; live tip advanced through `32701ecc` / `b4d45628` (test/input fixes) then `b12ef7d1` (CI evidence). Fixed-dollar five authentic clauses remain valid.

## Terminal CI (exact tip `b4d45628` — pre greater-of)

| Check | Result | Run |
|---|---|---|
| certified path (provider-free) | **pass** | https://github.com/egsul897/headroom/actions/runs/38053291184 |
| Vercel | **pass** | deployment completed |
| Vercel Preview Comments | **pass** | |

All checks completed without failures on tip `b4d45628054a8d532f1a0c12583cd1e731deff1c`. Greater-of tip CI recorded after push (see below / PR checks).

## Constraints

- No auto-merge
- No production Neon writes
- No paid inference
- No certification advancement
- No sealed-reference rewrite
