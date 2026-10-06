# Pass-A gap-call `localRef` reliability

**Gate:** Phase 3 reliability (gap-call localRef item after composition-contract remediation).
**Branch base:** `phase3-reliability-composition-gaps` @ `345060c` (A/B seal at `semantic-accountability.v8` not reopened; related-series IR still deferred).
**Scope:** Pass A wire schema + inventory prompt + certified `localRefChars` bound. Zero provider calls. No IR shape change. No NS-4.

## Defect (documented live residual)

On CONMED §7.5(j) end-to-end certification, both gap re-inventory calls failed structured-output parse because the model returned `localRef` / `parentRef` strings longer than the certified **6-character** wire bound (`too_big`). The entire gap payload was rejected (`schemaOk: false`, `itemsAdded: 0`), so coverage residue that the gap call was meant to remediate stayed `UNACCOUNTED_SOURCE`.

Root cause (not model malice):

1. Anthropic `zodOutputFormat` folds `maxLength` into the JSON-schema **description**; it does **not** constrain decoding. The 6-char ceiling was parser-only.
2. The Pass A prompt never stated `localRef` or its length bound (first-pass happened to use `r7_5j` = exactly 6; gap calls used longer section/gap-shaped handles).
3. `localRef` is only a within-call cross-reference handle — never durable item identity — so a 6-char hard fail was disproportionate reliability risk.

Evidence: `docs/phase-3-live-validation/7.5j-end-to-end-certification/04-pass-a-calls.json`, `15-report.md`, residual `gapReinventoryLocalRef` in `08-residual-genuine-blockers.json` (`OBSERVED_BUT_NOT_REMEDIATED`).

## Remediation

| change | detail |
|---|---|
| Certified bound | `CERTIFIED_INVENTORY_WIRE_BOUNDS.localRefChars`: **6 → 24** |
| Soft coerce | Over-long `localRef` / `parentRef` / `relatedRefs` are hashed to a stable hex digest of length `localRefChars` before Zod max enforcement, so one long handle cannot kill the whole call; within-call cross-refs that repeat the same over-long string still resolve |
| Prompt (v7) | System prompt names `localRef` and states the `localRef`/`parentRef`/`relatedRefs` char bound alongside other field bounds |
| Wire schema version | `semantic-inventory-wire.v3` |
| Algorithm | **unchanged** `semantic-accountability.v8` (A/B seal intact; item ids not re-keyed) |

## Out of scope

- Related-series aggregation IR (`02-related-series-aggregation-decision.md` — still blocked).
- Paid / live §7.5(j) re-run.
- Reopening enumerator handoff / quantitative authority (A/B).
- NS-4.

## Closure status

`gapReinventoryLocalRef` → **CLOSED_OFFLINE** with this artifact. Stratified live certification remains a later reliability-gate step.
