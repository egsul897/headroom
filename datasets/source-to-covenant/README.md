# Source-to-Covenant Compilation Dataset (Phase 2)

Reusable dataset connecting **authentic SEC financing-document language** to
**structured covenant representation candidates**, with explicit ground-truth
integrity controls.

This is a **data and evaluation workstream**, not a replacement compiler.

## Phase 2 integrity rules

- Verification status ≠ training eligibility.
- `HUMAN_SOURCE_VERIFIED` / delivery `VERIFIED` requires an independent
  reviewer + `verification_record_id`. Catalog-author source checks are
  **hypotheses**.
- `SOURCE_WINDOW_PRESENT` ≠ `CONTROLLING_CONTEXT_COMPLETE`.
- SFT export is **blocked** until independent verification + usage-rights review.
- No synthetic examples in the real-source training subset.
- Held-out issuers: Chewy, Gibraltar, Riot Platforms.

## Layout

| Path | Purpose |
|---|---|
| `records/{train,dev,eval-heldout}/` | Per-example JSON (schema v2) |
| `provenance/` | Corpus manifest, version pins, usage-rights |
| `exports/importable-records.json` | Full package |
| `exports/knowledge-factory-import.json` | WS-PAR delivery-contract adapter |
| `exports/sft-ready.jsonl` | Intentionally empty while blocked |
| `exports/sft-export-block.json` | Block notice |
| `benchmark/evaluation-benchmark.json` | Independent eval scaffold (no metrics yet) |
| `reports/phase2-integrity-report.json` | Integrity audit |
| `peer-inputs/` | Read-only copies of peer corpus exports used for expansion |

## Rebuild

```bash
npm run dataset:source-to-covenant
npx vitest run tests/source-to-covenant-dataset/
```

Library: `lib/source-to-covenant-dataset/` (Phase-2 entry: `phase2-build.ts`).
