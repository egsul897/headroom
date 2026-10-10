# WOR 2023–2026 credit facility — HEADROOM-5 sealed unseen holdout

**Role:** `SEALED_UNSEEN_HOLDOUT` (independent quality evaluation).  
**Not** a development or tuning fixture.

## Issuer

Worthington Enterprises, Inc. (f/k/a Worthington Industries, Inc.) — ticker WOR, CIK 0000108516.

## Documents

| ID | Agreement | Filing |
|---|---|---|
| doc-a | Fourth Amended and Restated Credit Agreement (2023-09-27) | 8-K EX-4.1 accession 0000950170-23-050472 |
| doc-b | Fifth Amended and Restated Credit Agreement (2026-08-31) | 8-K EX-4.1 accession 0001193125-26-376705 |

Hashes, URLs, and acquisition timestamps: `extraction-manifest.json` and `docs/headroom-5-independent-holdout/03-holdout-seal.json`.

## Guardrails

- Do not alter frozen sources or legal-reference answers after compiler runs.
- Do not use this package to tune production compiler code in the same change set as evaluation.
- No paid inference in HEADROOM-5 evaluation scripts.
