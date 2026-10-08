# Phase 3 — Corpus-wide false-permission audit and dependency closure

Continues PR #148. Legal-safety remediation of the Phase-2 390-candidate corpus.

## Rebuild

```bash
python3 scripts/basket-formula-corpus/phase3_pipeline.py
npx vitest run tests/basket-formula-corpus/
```

## Constraints

- No paid inference, merges, certification advancement
- No production capacity-engine edits
- No Claude-owned fixture modifications
- No independent SEC downloading
- Formulas remain non-executable until independently verified
