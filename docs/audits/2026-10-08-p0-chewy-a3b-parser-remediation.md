# P0 — Chewy §6.08(a)(3)(b) parser remediation (follow-up to merged #132)

Soft gate. **DEVELOPMENT ≠ CERTIFIED.** No paid inference. No certification advancement. Frozen evidence untouched.

**Note:** PR #132 merged at defective tip `348bfedb33725d9a00adbf331131c038aa7d5a22`. This branch is the P0 fix against current `main`. Follow-up PR: keep **draft** until independent replay.

## SHAs

| Role | SHA |
|---|---|
| Defective #132 merge tip | `348bfedb33725d9a00adbf331131c038aa7d5a22` |
| Code remediation commit | `6760e31f1735f14416efa05bfc59683153e4be10` |
| Review branch | `cursor/chewy-a3b-span-remediation-aa25` (use tip / `FETCH_HEAD`) |

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

| Metric | main without letter/roman | #132 tip & this fix |
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

```bash
git fetch origin cursor/chewy-a3b-span-remediation-aa25
git checkout FETCH_HEAD
npx vitest run tests/contract-model/clause-hierarchy.test.ts \
  tests/contract-model/clause-hierarchy-f2-nesting.test.ts --reporter=verbose
# Expect: 6.08(a)(3)(b) charStart 664123 charEnd 666205; no 6.08(a)(3)(b)(x)/(y)
```

Keep the follow-up PR **draft** until that replay passes. Do not advance certification.

## Disclosed additional node removals (independent replay, 2026-10-08)

The `openLetterResumesNearby` guard is not Chewy-specific: it suppresses every line-start `(x)/(y)[/(z)]` run opened under an
open letter item whose next letter resumes within the next four line-starts. Across the ten committed fixture documents this
removes fourteen nodes beyond the fabricated `6.08(a)(3)(b)(x)/(y)` pair and changes no other span. In every case the limbs
are proviso or exclusion text interior to the owning clause; the owning clause's span now runs to the next genuine sibling and
no structural child is minted for the limbs. Nothing is truncated and nothing is fabricated (fail-safe direction). CONMED, FWRG
and RIOT are unchanged. Gibraltar is unchanged (2064 nodes / 938 Pass A candidates, identical tree identity to `main`).

| document | owning clause (after) | former children (charStart on `main`) | limb text, now interior |
|---|---|---|---|
| Chewy doc-a | `6.08(b)(16)(g)` `[689219, 690271)`; `(h)` starts 690271 | `6.08(b)(16)(g)(x)` 689561, `(y)` 689793 | `provided that the amount … shall (x) reduce Consolidated Net Income … and (y) increase … Consolidated EBITDA` |
| DSGR doc-a (2022 A&R) | `8.06(c)(ii)`; `(iii)` starts at `(ii).charEnd` | `8.06(c)(ii)(x)` 531278, `(y)` | erroneous-payment enumeration `(x) that is in a different amount … or (y) that was not preceded or accompanied by a Payment Notice …` |
| DSGR doc-d (2025 second A&R) | `8.06(c)(ii)` | `8.06(c)(ii)(x)` 557961, `(y)` | same enumeration |
| term-loan doc-a (2022) | `2.05(2)(e)`; `(f)` starts at `(e).charEnd` | `2.05(2)(e)(x)` 355347, `(y)`, `(z)` | `provided that (x) such prepayments may not be directed … (y) in the event that there are … (z) each prepayment of Term Loans required by …` |
| term-loan doc-b (2024 A&R) | `2.05(2)(e)` | `2.05(2)(e)(x)` 358943, `(y)`, `(z)` | same proviso |

Net structural deltas: Chewy 1576 → 1572, DSGR doc-a −2, DSGR doc-d −2, term-loan doc-a −3, term-loan doc-b −3.

Trade-off accepted for this P0: these limbs lose their own node id and become addressable only through the owning clause.
Retrieval of the owning clause returns the full limb text. A later, separately reviewed parser change (not this PR) may restore
addressability for genuine short `(x)/(y)` sub-lists; the window size 4 is shared with `innerResumesBeforeOuter`.

Regression pins for these structures: `tests/contract-model/clause-hierarchy-nearby-resume-disclosure.test.ts` (real fixtures,
structure stage only, no provider): the owning span contains every limb, no `(x)/(y)/(z)` child exists, the owning clause has no
children at all, the next sibling starts exactly at the owning clause's `charEnd`, and a genuine nested alphabetic list still parses.

## CI correction

The earlier "GitHub CI on `f0dd076`: all 3 checks SUCCESS" line counted Vercel twice. On `f0dd076` the only workflow that ran was
`canonical-compiler` / "certified path (provider-free)" (SUCCESS), plus the Vercel deployment check. `stratified-cert.yml` was
**not** triggered: its path filter covers only `tests/stratified-cert/**`, `docs/phase-3-reliability-stratified-certification/**`
and `scripts/stratified-cert/**`, so a parser change never runs it. The stratified-cert figures in this note are local runs.

## Integration-candidate note (main `e5b8a212` + this PR)

`tests/stratified-cert/gibraltar-evidence-integrity.test.ts` (added to `main` in `9f8de947`, after this branch forked) pins
`evidenceIdentity.parserCodeSha256` of the current provider-free Gibraltar record
(`tests/fixtures/unseen-packages/gibraltar-2026-credit-agreement/development-pipeline/execution.json`) to the sha256 of
`lib/contract-model/compiler/clause-hierarchy.ts`. Any parser change, including this one, changes that hash
(`8ddef006…` on `main` → `0f04548f…` with this PR) while `structuralTreeSha256` stays identical.

**Resolved on this PR:** refreshed the provider-free record with no key set
(`npx tsx scripts/p3-development-pipeline/execute-gibraltar.ts`). Diff is exactly one field —
`parserCodeSha256` → `0f04548f499e50c2e1691193a523af3e4c3c1ba3b08b0b94838f7a40bbbc023d`. Counts stay
2064 / 938; `PROVIDER_EXECUTION_REQUIRED`; `certified: false`; no discovered candidates. Historical Haiku
rows remain non-promotable and are not current-tree evidence.
