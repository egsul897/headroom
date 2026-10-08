# Phase 2 — Legal formula validation

Continues PR #148 on `cursor/covenant-basket-capacity-formula-library-ae51`.

## Rebuild

```bash
# optional EDGAR expansion (no paid APIs; does not touch fixtures)
PYTHONUNBUFFERED=1 python3 scripts/basket-formula-corpus/edgar_acquire_curated.py

# audit + provenance + typed IR + deps + scenarios + expansion + import contract
python3 scripts/basket-formula-corpus/phase2_pipeline.py

npx vitest run tests/basket-formula-corpus/
```

## Outputs

| File | Contents |
|---|---|
| `01-affirmative-capacity-audit.json` | Stratified independent review + false affirmatives |
| `02-provenance-results.json` | Hash/offset/normalization stats |
| `03-typed-formula-coverage.json` | REPRESENTED / REVIEW_REQUIRED / UNSUPPORTED |
| `04-dependency-validation.json` | Encyclopedia/Atlas/Exception DB/Factory coordination |
| `05-adversarial-scenarios.json` | Arithmetic vs legal permission scenarios |
| `06-corpus-expansion.json` | EDGAR + fixture mining stats |
| `07-integration-contract.json` | knowledge-factory import contract metadata |
| `08-phase2-counts.json` / `08-phase2-mandatory-return.md` | Mandatory return |
| `export/` | JSONL research dataset |
| `edgar-acquisitions/` | Newly fetched SEC exhibits (not fixture edits) |
