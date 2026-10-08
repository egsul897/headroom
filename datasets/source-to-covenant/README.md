# Source-to-Covenant Compilation Dataset

Reusable dataset connecting **authentic SEC financing-document language** to
**structured covenant representation candidates**.

This is a **data and evaluation workstream**, not a replacement compiler.

## What each record preserves

**INPUT**

- Exact legal text (controlling context window)
- Document identity (issuer, instrument, fixture path, filing metadata)
- Operative version / amendment identity
- Structural identity (section / article / role)
- Governing prohibition
- Definitions, exceptions, conditions, cross-references
- Entity-scope notes
- Source text SHA-256 and window SHA-256

**OUTPUT**

- Candidate covenant family
- Candidate permission / prohibition classification
- Proposed formula or capacity structure
- Proposed conditions
- Proposed dependency edges
- Missing inputs
- Uncertainty
- Verification status (`HUMAN_SOURCE_VERIFIED` | `HUMAN_HYPOTHESIS` |
  `MODEL_HYPOTHESIS` | `UNRESOLVED` | `UNSUPPORTED` | `NOT_APPLICABLE`)

## Safety invariants

1. Ground truth is **not** created by copying the current compiler’s answers.
2. Semantic representations are **not** automatically approved.
3. Records are **excluded** from Claude’s independent acceptance corpus and
   from verifier / compiler few-shot prompts.
4. No paid inference is used to build this dataset.
5. SFT / distillation export requires provenance and usage-rights review
   (`provenance/usage-rights.json`).

## Layout

| Path | Purpose |
|---|---|
| `records/{train,dev,eval-heldout}/` | Per-example JSON records |
| `provenance/` | Corpus manifest, version pins, usage-rights |
| `exports/importable-records.json` | Single importable package |
| `exports/sft-ready.jsonl` | Future SFT/distillation rows (review-gated) |
| `reports/` | Quality, duplicate, and split reports |

## Splits

- **train / dev** issuers: LSB Industries, First Watch (FWRG), CONMED,
  Distribution Solutions Group (DSGR)
- **eval-heldout** issuers (reserved): Chewy, Gibraltar Industries, Riot Platforms

## Rebuild

```bash
npx tsx scripts/source-to-covenant/build-dataset.ts
npx vitest run tests/source-to-covenant-dataset/dataset.test.ts
```

Library entrypoint: `lib/source-to-covenant-dataset/`.
Catalog of human-authored labels: `lib/source-to-covenant-dataset/catalog.ts`.
