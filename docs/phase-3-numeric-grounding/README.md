# Phase 3 — Numeric grounding (Fix B) + harness evidence preservation

The forensics mission established that case §7.2(f) asserted a "100%" that appears in no anchor,
no retrieved context, no prompt and no few-shot — and that the verifier said nothing, because its
numeric grounding only ever looked at STRUCTURED numeric nodes. A figure stated in prose was never
inventoried, so nothing ever compared it with the source.

This mission implements **Fix B only**: material numeric assertions carried in free-text IR fields
are now inventoried and grounded against the same authenticated evidence universe the structured
path already uses. It also closes the harness gap that made the forensics mission unable to name
the stage that first emitted the value.

| Artifact | What it holds |
|---|---|
| `01-starting-state.json` | SHA, branch, per-file hashes before/after, what stayed frozen |
| `02-red-baseline.json` | The **unfixed** verifier's own behavior on all seven cases — including that it blessed the §7.2(f) reproduction `VERIFIED_WITH_NON_MATERIAL_FINDINGS` |
| `03-field-audit-and-extractor.json` | The §4 field audit, the §5 grammar, the §6 equivalences (and the ones deliberately refused), the §7 evidence universe, the §8 outcomes |
| `04-test-evidence.json` | Red-before / green-after, the regression matrix, the full-suite diff |
| `05-existing-output-scan.json` | §15 offline scan of every preserved compiler output |
| `06-phase4-gating-handoff.json` | §16 documentation only — including a **correction** to the forensics mission's Phase-4 claim |
| `07-paid-validation-manifest.json` | §19 designed, not executed |
| `08-verdict.json` | §20 success gate, verdict, honest limits |
| `09-paid-validation-results.json` | The two-candidate paid validation — including what the preserved raw output revealed about the original "100%" |
| `paid-validation-evidence/` | The complete per-candidate evidence records from that run (raw model output, tool log, full IR, verifier result) |

The paid validation (2 candidates, $0.0122 of a $0.05 ceiling) then turned up something the
forensics could not reach: the preserved raw output shows the model quoting `(100%)` out of the
**real** "Subsidiary Guarantor" definition it had retrieved. That figure is genuine source text.
The original "unsourced 100%" was most likely a false alarm by a harness that never looked at tool
output — see `09-paid-validation-results.json`.

No Phase-4 change. No IR shape change. No benchmark expectation changed.
