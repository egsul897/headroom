# Covenant basket and capacity formula library

Source-backed corpus of basket structures and capacity formulas mined from public financing-agreement fixtures already in this repository.

## Constraints honored

- Does **not** modify `lib/contract-model/runtime/capacity` or any production capacity evaluator.
- No paid model/API calls, merges, or certification-artifact changes.
- Numerical amounts are never treated as permissions without source-supported semantics.
- Capacity is never calculated when required inputs or conditions are missing (`capacityComputable` stays false and blockers are recorded).

## Layout

| Path | Purpose |
|---|---|
| `00-mission-scope.json` | Mission constraints and required coverage |
| `01-formula-taxonomy.json` | Reusable formula taxonomy |
| `02-record-schema.json` | Record field contract |
| `03-source-inventory.json` | Fixture instruments used |
| `04-corpus-summary.json` | Counts / coverage manifest |
| `05-adversarial-examples.json` | Capacity vs threshold/trigger/test contrasts |
| `06-mission-report.md` | Mission report |
| `export/` | Dataset export (JSONL + manifest) |
| `lib/basket-formula-corpus/` | Types, Zod schema, validators, taxonomy |
| `scripts/basket-formula-corpus/build-corpus.py` | Deterministic corpus builder |
| `tests/basket-formula-corpus/` | Span grounding + invariant tests |

## Rebuild

```bash
python3 scripts/basket-formula-corpus/build-corpus.py
npx vitest run tests/basket-formula-corpus/corpus-validation.test.ts
```

## Record fields

Every basket candidate records: exact source span, governing covenant, basket family, amount/formula candidate, measurement date, financial inputs, entity scope, conditions, shared-capacity dependencies, reclassification rights, source version, and verification status.

## Phase 2

Legal-formula validation, provenance hardening, typed IR, dependency coordination, adversarial scenarios, EDGAR expansion, and knowledge-factory import contract live under [`phase-2/`](./phase-2/).

## Phase 3

Corpus-wide false-permission audit and dependency closure: [`phase-3/`](./phase-3/).
