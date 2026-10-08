# NCEDB Phase 2

Offline research milestone (not a certified legal interpretation dataset).

Continues PR #143 / SHA `e2d7d20768fe4842c1b5be03c540443dc29588cd`.

## What changed

1. **Diversity expansion** beyond CONMED/LSB/FWRG — ingested CHWY, ROCK (Gibraltar), DSGR (+ amendment), RIOT (+ prior CA), SUP (+ amendment). Acquisition plan coordinates with WS-EHB (#142) and WS-CKF for the remaining path to 100 agreements / 50 issuers (bulk EDGAR bytes stay out of Git).
2. **Negative controls** — independently selected sample covering local, remote, no-additional-conditions, ambiguous, prohibition-without-exception, numeric-threshold-not-permission, and other-document constraints.
3. **Semantic classification** — `CONDITIONAL` | `UNCONDITIONAL_SOURCE_VERIFIED` | `UNKNOWN` | `NOT_AN_AFFIRMATIVE_PERMISSION`, plus separate local/remote/proviso/entity/financial/shared-capacity/amendment/unresolved fields. **Not production capacity approvals.**
4. **Source completeness** — exact quotations + char offsets + source sha256; paraphrases separated; span audit.
5. **Held-out quality** — Riot §5.02 independent GT + mini-detector metrics; incomplete dimensions reported `UNVERIFIED`.
6. **Safe integration** — `lib/negative-covenant-exceptions` idempotent import adapter + `knowledge-factory-export.json`.

## Regenerate

```bash
python3 scripts/negative-covenant-exception-database/generate-phase2.py
npx vitest run tests/negative-covenant-exception-database
```

## Hard boundaries

- No `lib/contract-model/**` changes
- No Claude-owned acceptance fixture edits
- No paid inference / merges / certification / sealed-evidence mods
