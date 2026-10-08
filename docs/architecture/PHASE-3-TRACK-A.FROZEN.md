# PHASE-3-TRACK-A — #120 safety / CI wire — invent-safe FROZEN

**Tip:** `62a40be22b9598d9732e9ce2574d86d2228d6270` (#122 MERGED; #120 honesty on main)
**Checked:** 2026-10-07T16:25:00Z
**Verdict:** invent-safe ALL Y — soft-gate CI wire + honesty locks only — ≠CERTIFIED

## Residual (tip-grounded)
- `lib/contract-model/compiler/semantic/unlimited-carveout-honesty.ts` + `tests/contract-model/semantic-compiler/unlimited-carveout-qualitative-gates.test.ts` already on tip.
- Module: folded qualitative blob is replaced by exact UNSUPPORTED gates (filter `isFoldedQualitative`); does not delete unrelated conditions. Ambiguous multi-pair / multi-sibling attribution → `selectPair` returns null → unchanged (fail closed). `bindExcerpt` null → unchanged. Sufficiency PARTIAL; not COMPLETE.
- `p3-r0-soft-gate.yml` path filters do **not** include `lib/contract-model/compiler/semantic/**` or the unlimited-carveout test. `stratified-cert.yml` is a separate soft gate and also does not name this suite.
- Residual: wire the existing unlimited-carveout vitest suite into a soft-gate CI job that runs on PRs touching the module/test (extend `p3-r0-soft-gate` paths+run **or** add path-filtered step on an existing soft-gate). Add/confirm tests: ambiguous attribution ≠ COMPLETE; no condition-delete of non-folded conditions on substring fold.

## Proposed chunk (CEO APPROVE → COO GRANT → Cursor)
1. CI: path-filter + `npx vitest run tests/contract-model/semantic-compiler/unlimited-carveout-qualitative-gates.test.ts` on soft-gate workflow(s). Soft gate only. IMPLEMENTED ≠ CERTIFIED.
2. Tests (if not already covering): ambiguous multi-match leaves capacity/conditions unchanged; folded blob rem does not drop unrelated conditions; PARTIAL ≠ COMPLETE.
3. Docs note optional: one line in checklist that ambiguous attribution is not COMPLETE sufficiency.
4. Forbidden: invent condition types; map property-character onto PURPOSE/ENTITY_TYPE/SECURITY_SCOPE; sealed CONMED packet rewrite; pin; CERTIFIED claim; % raise.

## Invent-safe 5-part
| Part | Y/N |
|---|---|
| Tip-bound residual named | Y — module on tip; CI path omission tip-visible |
| Generalized | Y — no agreement/section special-case |
| No invent | Y — wire existing suite; no new IR |
| File-disjoint / scoped | Y — workflow + test paths only |
| No CERTIFIED / eligible / pin | Y |

**ALL Y? YES.** Soft gate; invent-absence forever; ≠CERTIFIED.
