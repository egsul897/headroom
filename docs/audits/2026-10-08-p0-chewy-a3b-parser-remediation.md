# P0 — Chewy §6.08(a)(3)(b) parser remediation (#132)

Soft gate. **DEVELOPMENT ≠ CERTIFIED.** No paid inference. No certification advancement. Frozen evidence untouched.

## SHAs

| Role | SHA |
|---|---|
| Starting (defect) | `348bfedb33725d9a00adbf331131c038aa7d5a22` |
| Ending | `32e364e444e8f3d3540ced7fa50ed3398e556a52` |

## Root cause

`restartedLetterCandidate` opened a nested letter list at line-start `(x)` then `(y)` whenever the next line-start was the following letter. Inside Chewy’s Available Amount builder limb `(b)`, glued `(i)(A)` is invisible to `MARKER_OCCURRENCE` (`(?!\()`), so those interior exclusion markers were treated as a restarted letter run under the open builder letter `(b)`. Emitting `(b)(x)` / `(b)(y)` truncated `(b)`’s owned span from `[664123, 666205)` to `[664123, 664780)`.

## Fix (generalizable)

`openLetterResumesNearby`: refuse a restarted letter run when an already-open letter list of the same kind resumes its next letter within a short line-start window. Interior `(x)/(y)` under an open letter item stay unparsed; a genuine Gibraltar-shaped restart after a numbered list (outer letter resumes only after a longer nested run) still opens.

No Chewy-specific node IDs or offsets in production code. Exact spans appear only in regression tests.

## Chewy before / after

| Metric | Before `348bfed` | After fix |
|---|---|---|
| `6.08(a)(3)(b)` | `[664123, 664780)` owned 657 | `[664123, 666205)` owned **2082** |
| `6.08(a)(3)(b)(x)/(y)` | fabricated | **absent** |
| Internal limbs in owned text | truncated out of `(b)` | `(i)(A)`, `(x)`, `(y)`, `(B)`, `(ii)` inside `(b)` |
| `6.08(a)(3)(a)–(i)` | present | preserved |
| `6.08(b)(1)–(27)` | present | preserved |
| Chewy total nodes | 1576 | **1572** (Δ −4 fabricated) |

Pre-existing limitation unchanged: glued `(i)(A)` still does not mint its own nodes (`(?!\()` / no `)`-preceded lookbehind). Owned-span integrity no longer depends on inventing false `(x)/(y)` children.

## Gibraltar parser-tree drift (for Gibraltar owner / #128)

| Metric | main `9de4e573` | #132 `@348bfed` (before & after this fix) |
|---|---:|---:|
| totalNodes | 2087 | **2064** (unchanged by this Chewy fix) |
| passACandidates | 946 | **938** (unchanged) |
| `7.05(a)(y)` | absent / NOT_FOUND | UNIQUE |
| `7.04` | AMBIGUOUS (without resolver path) | UNIQUE_AFTER_DEGENERATE_EXCLUSION |

**Tree identity vs defective tip:** Gibraltar structural counts and `7.05(a)(x)/(y)…` refs are **unchanged** by this remediation. No new Pass B / provider candidates. Historical Haiku `execution.json` on #128 (2087 / NOT_FOUND) remains **wrong-tree** relative to the letter/roman parser and must not be silently reused — coordinate quarantine/refresh on #128; do not remint discoveryIds from that artifact.

treeIdentitySha256 (Gibraltar nodes after fix): `8152ff739ab5e7ed5f57184b154d0b00eb5c34ee7145ebf52773d8c78d7df988`

## Tests added

- Synthetic: interior `(x)/(y)` when outer letter resumes nearby — no nest.
- Synthetic: Gibraltar-shaped restart after long roman run — still nests under `(a)`.
- Chewy exact span `664123–666205`, no fabricated `(b)(x)/(y)`, internal limb bytes retained.
- TOC/body, builder `(a)–(i)`, true `(b)(1)–(27)`, inline proviso exclusion.

## Independent review handoff

Please replay on the ending SHA:

```bash
git checkout <ending-sha>
npx vitest run tests/contract-model/clause-hierarchy.test.ts \
  tests/contract-model/clause-hierarchy-f2-nesting.test.ts --reporter=verbose
# Expect: 6.08(a)(3)(b) charStart 664123 charEnd 666205; no 6.08(a)(3)(b)(x)/(y)
```

Keep #132 **draft** until that replay passes.
