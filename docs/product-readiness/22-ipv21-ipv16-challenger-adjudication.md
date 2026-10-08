# IPV-21 / IPV-16 — independent challenger adjudication

Production: PR #136 @ `8f87a0633ac31cb7b5f6282cc0787231d365f27c` (read-only detached worktree, harness overlaid, $0, no
production file modified). Original challenger: `46ebf2ee0b0da20358755cbc70f851420ade20ee`. Challenger branch at the time of
adjudication: `claude/independent-product-validation` (this commit; SHA in the checkpoint log). Baseline product: `origin/main`
@ `9de4e57`. No paid inference, no merge, no certification, no frozen-evidence change, no Knife River BLIND access.

Original results are preserved verbatim in `docs/product-readiness/invariant-runs/514f39617677/` (INV-19 / INV-19b) and
`mutation-runs/291855ce3f9b/` (MUT-08…16); the historical verdict refs are kept in the harness as OBSERVATION rows and are no
longer asserted.

## 1. IPV-21 — is Restricted Subsidiary ↔ Unrestricted Subsidiary a genuine directed cycle?

Source, `tests/fixtures/product-acceptance/packages/pkg-b-multi-document/documents/indenture.txt`, full spans (each definition is
one paragraph, lines 17 and 19):

```
"Restricted Subsidiary" means any Subsidiary of the Issuer that is not an Unrestricted Subsidiary.

"Unrestricted Subsidiary" means any Subsidiary of the Issuer designated as an Unrestricted Subsidiary by the board of directors of the Issuer.
```

Edges by exact defined-term boundaries (case-sensitive `\bTerm\b` over the paragraph, the term's own name excluded):

| from | to | basis |
|---|---|---|
| Restricted Subsidiary | Unrestricted Subsidiary | `not an Unrestricted Subsidiary` |
| Unrestricted Subsidiary | — | the only mention is its own name (`designated as an Unrestricted Subsidiary`); `\bRestricted Subsidiary\b` does **not** match inside `Unrestricted Subsidiary` (no boundary between `Un` and `restricted`, and the case differs) |

**Verdict: NOT a cycle** — one directed edge plus a self-mention. (`Subsidiary` is undefined in the indenture; it is a sink,
not a return edge.) Substring containment (`"unrestricted subsidiary".includes("restricted subsidiary")`) would have said
otherwise; that is exactly the test the brief forbids, and it is what the challenger's INV-19b genuineness check used.

Why main reports a cycle: on `9de4e57` the last definition's span (`getDefinitionFullText`) runs to the end of the document and
therefore contains §4.09's `shall not permit any Restricted Subsidiary to` — the retrieval graph then closes
`restricted subsidiary -> unrestricted subsidiary -> restricted subsidiary`. That is the IPV-21 over-extension on a different
pair, not a self-reference. Production @8f87a06 bounds the span at the next SECTION/ARTICLE heading (`structural-index.ts`
`spanEnd = min(nextDefinition, nextHeading)`), its edge scanner uses `\b`-bounded exact terms and skips the current term
(`definition-graph.ts` `findKnownTermMentions`), and its own test
(`definition-cycle-graph.test.ts` "does not turn a one-way subsidiary pair plus a later covenant mention into a cycle") pins
this case. The production behaviour is correct; legitimate cycle detection was not weakened (see the corrected control below).

### Adjudication of the two challenger verdicts

| verdict | original (main `514f396`) | production `8f87a06` | ruling |
|---|---|---|---|
| `invariant:INV-19:true-cycle-still-reported` | OK — `restricted subsidiary -> unrestricted subsidiary -> restricted subsidiary` | FAIL — `none` | **Invalid positive control.** Its "pass" on main was the IPV-21 defect itself. Kept as an OBSERVATION labelled HISTORICAL; no longer asserted. |
| `invariant:INV-19b:genuine-cycles-reported` | OK — the same pair listed as genuine (substring containment) | FAIL — `none` | **Invalid positive control and invalid genuineness test.** Re-implemented with exact-term boundaries over the *source paragraph* (not the product's own span, which on main would again make every false cycle look genuine). By that test the corpus has **no** genuine cycle; kept as an OBSERVATION labelled HISTORICAL. |

### Corrected, source-supported controls (on the challenger branch)

- `invariant:INV-19:one-way-pair-is-not-a-cycle` (PRODUCT, UNSUPPORTED_AS_COMPLETE): B indenture 4.09 must report **no**
  DEFINITION_CYCLE. main **FAIL** (`restricted subsidiary -> unrestricted subsidiary -> restricted subsidiary`, registered under
  IPV-21); production **OK** (`no cycle`).
- `invariant:INV-19:genuine-cycle-reported` and `invariant:INV-19b:genuine-cycle-control` (PRODUCT, UNSUPPORTED_AS_COMPLETE):
  an in-memory variation of package A replaces `"Consolidated Total Debt" means … Indebtedness … outstanding on such date.` with
  `"Consolidated Net Debt" means, as of any date, Consolidated Total Debt on such date minus unrestricted cash …` and
  `"Consolidated Total Debt" means, as of any date, Consolidated Net Debt on such date plus unrestricted cash …` — a genuine
  two-way dependency reached by 7.01(c) through Consolidated Total Leverage Ratio. Both main and production report
  `consolidated total leverage ratio -> consolidated total debt -> consolidated net debt -> consolidated total debt`. **OK on both.**
- IPV-12 re-rated in the register: the mechanism is the IPV-21 over-extension, not a self-reference; fixed on production.

Full INV-19 / INV-19b on production: 7/7 PRODUCT verdicts pass (the two HISTORICAL observations read `none`, which is correct).

## 2. IPV-16 — MUT-08, MUT-12, MUT-13, MUT-14, MUT-15 (and MUT-16 for completeness)

| mutant | shape | main `291855c` | production `8f87a06` | kill mechanism | ruling |
|---|---|---|---|---|---|
| MUT-08 | B + side letter lifting 7.01(b) to $60m | SURVIVED (GAP) | KILLED | `context:B-CA-7.01(b):definitions` — "not in bundle (retrieved: none)" | **Incidental.** The clause bundle is withheld (correct), so the manifest's definitions row for 7.01(b) sees nothing. The intended detection — instrument not RESOLVED, side-letter effect surfaced — now passes as PRODUCT verdicts. |
| MUT-12 | B + side letter tightening to $10m | SURVIVED (GAP) | KILLED | same | **Incidental** (same reasoning). |
| MUT-13 | A + side letter tightening to $10m | SURVIVED (GAP) | KILLED | `context:A-7.01(b):definitions` (Indebtedness, Default) | **Incidental.** |
| MUT-14 | C (two amendments) + side letter tightening to $30m | SURVIVED (GAP) | KILLED | `context:C-7.01(b)-amended:definitions` (Default) | **Incidental**, but the override attaches to the amended clause (SUPERSEDED, applied 1, source amendment-1, $40m text preserved), the withhold reason names `UNCLASSIFIED_OVERRIDE`, and the bundle carries `AMENDMENT_LEAD:7.01(b)` — the best-behaved case. |
| MUT-15 | H (ABL) + side letter tightening 7.02(d) to $2.5m | SURVIVED (GAP) | KILLED | `context:H-7.02(d)` — undefined terms Eligible Receivables / Eligible Inventory "not reported" | **Incidental** (the withheld clause yields no definition items, so the unresolved-term check is blind). |
| MUT-16 | I + lender consent on 7.02(b)/7.01(b) | SURVIVED (GAP) | SURVIVED (GAP, prediction held) | two UNKNOWN_CHANGE/REVIEW_REQUIRED effects; no manifest check fails | **Surviving at the deterministic layer** — the consent is represented only as a review state; I's manifest has no clause-level row that the withheld bundle would break. |

Classification summary: **no legitimate deterministic-layer kill** among the five (each kill is a side-effect of the withheld
clause text on an unrelated manifest row); **no harness expectation defect in the PRODUCT verdicts** (the `status: CURRENT` +
`instrumentStatusNot: RESOLVED` + `effectsExpectedFrom` design was written for exactly this fail-closed outcome and now passes on
all six); **one harness severity defect** fixed on the challenger branch: the acceptance auditor rated package M's 7.01(b) at
2026-06-30 as CRITICAL_FALSE_PERMISSION on production although the provision is REVIEW_REQUIRED with the override attached — it
now rates that case EVIDENCE_INCOMPLETE / CORRECT_FAIL_CLOSED (production acceptance run: 0 CRITICAL, 1 EVIDENCE_INCOMPLETE).
Revised expectations are recorded as `expect.afterFix` on each mutant (documentation only; the asserted `survival` stays the
main-based value, so the suite's survivor list is unchanged).

## 3. Additional review — unresolved side letters and consents on production `8f87a06`

Checked on package M (on disk: side letter after Amendment No. 1), MUT-12/13/14/15/16, with the new invariant INV-16b and a
certification probe of the mutants. Items marked ✓ hold on production and fail on main (registered under IPV-16).

| requirement | production `8f87a06` | main | evidence |
|---|---|---|---|
| Remains attached to the relevant provision | ✓ `UNKNOWN_CHANGE/REVIEW_REQUIRED → credit-agreement#7.01(b)`, 0 unattached; MUT-16's consent yields two effects (7.02(b), 7.01(b)); a target present in two agreements stays unattached and still blocks (production's own test) | ✗ 0 effects | `INV-16b:override-attached-to-named-provision` |
| Preserves the last authoritative text | ✓ 7.01(b) `OPERATIVE_STATE_REVIEW_REQUIRED`, appliedChain 0, currentText = base $40,000,000 (M) / Amendment-1 $40,000,000 (MUT-14, applied 1); not DELETED, not CONFLICTED (`operative-state.ts` filters the override out of the textual chain) | ✗ RESOLVED on the base text, no provision view | `INV-16b:provision-not-resolved-last-text-preserved` |
| Prevents affirmative conclusions — clause level | ✓ clause bundle `OPERATIVE_SOURCE` `OPERATIVE_STATE_UNRESOLVED`, `isCurrentTruth: false`, text withheld; M-P1 ("7.01(b) permits $40,000,000") refused `OPERATIVE_STATE_UNACCEPTABLE`; candidates that cross-reference the clause (7.02 on MUT-13/12) drop to REVIEW | ✗ served as CURRENT | `INV-16b:clause-retrieval-withheld-or-flagged`; acceptance `adversarial:M-P1` |
| Does not silently disappear — clause level | partial: withheld, but the reason is the generic "An amendment to a clause inside this text could not be applied without guessing" and no bundle item names the side letter (only MUT-14, where the clause was already amended, carries `UNCLASSIFIED_OVERRIDE` and `AMENDMENT_LEAD:7.01(b)`) | ✗ | `INV-16b:clause-withhold-reason-names-override` (observation) |
| Does not silently disappear — section level | **✗ OPEN.** The section-level 7.01 bundle serves the whole section, including clause (b) with its overridden cap, as `OPERATIVE_SOURCE [CURRENT] isCurrentTruth: true`, **drops (b) from CHILD_RULE without saying why**, carries no retrieval stop, unresolved item or lead naming the side letter, and `operativeProvision` is null | ✗ (same text, but (b) at least stays a CHILD_RULE) | `INV-16b:section-retrieval-does-not-serve-overridden-clause-as-current`, `…section-child-rule-not-silently-dropped` |
| Prevents affirmative conclusions — compilation / certification | **✗ OPEN (surviving legal-safety blocker).** MUT-13 (A + tightening side letter) and MUT-12 (B + side letter): the faithful section-level `credit-agreement::7.01` unit is **CERTIFIED** with `7.01(b)` compiled as the superseded **$30,000,000** basket (`certification CERTIFIED []; compilation COMPLETED`). Package M is blocked only because its EBITDA definition amendment adds `hasUnresolvedOperativeEvidence` to the same bundle — i.e. by the IPV-19/20 path, not by the side letter | ✗ (also CERTIFIED) | `INV-16b:section-with-overridden-clause-not-certified`; `certify.ts:64` blocks only when the bundle has unresolved-evidence items, and the section bundle has none |
| Simulation | not reachable by construction without a certified/verified unit (`verified-execution.ts` refuses units without a bound verification artifact; the runtime consumes `PersistedVerifiedUnitPackage` only). But because the section unit above **does** certify, nothing downstream of certification would stop a $30,000,000 basket from entering a verified-unit package. Not exercised end-to-end here (no runtime IR is produced by the offline harness) | — | code reading |

INV-16b on production: 4 / 5 PRODUCT verdicts pass; on main 0 / 5 (all five registered under IPV-16 with per-signature
severities). Production invariant totals with the corrected harness: 55 / 60 PRODUCT verdicts pass; the five failures are
INV-04 ×2 (back-reference gap, open on every tree — doc 21 §8), INV-16b ×2 above, and INV-25-class comparator rows unchanged.

## 4. Verdicts and exact assertions

| id | verdict |
|---|---|
| IPV-21 / Restricted–Unrestricted Subsidiary | **Not a cycle.** Challenger's positive controls were invalid (span over-extension on main; substring containment in the genuineness test). Production correct. Corrected controls: `INV-19:one-way-pair-is-not-a-cycle` (main FAIL → IPV-21; production OK), `INV-19:genuine-cycle-reported` and `INV-19b:genuine-cycle-control` (OK on both). IPV-12 re-rated as an IPV-21 manifestation. |
| IPV-16 / MUT-08, 12, 13, 14, 15 | Kills on production are **incidental** (withheld clause text starves unrelated manifest rows); the intended PRODUCT detections pass; original results preserved; revised expectations recorded as `afterFix`. MUT-16 survives (review state only). |
| IPV-16 / remaining blocker | **Open on `8f87a06`:** a section-level unit whose clause is under an unresolved side letter certifies with the overridden cap (MUT-12, MUT-13); the section bundle serves the clause as current truth and silently drops it from CHILD_RULE. Acceptance criterion: a section bundle containing a REVIEW_REQUIRED provision must carry that provision's unresolved evidence (so `certify.ts` blocks), list the clause with its state, and name the override; the withhold reason at clause level must name the override document. |
| Harness | INV-19 / INV-19b corrected; INV-16b added; auditor severity for attached-unresolved overrides corrected; mutants annotated. Suite on main: 208 passed / 28 skipped. |

## 5. Repro

```
git worktree add --detach <dir> 8f87a0633ac31cb7b5f6282cc0787231d365f27c   # + symlink node_modules, copy scripts/product-acceptance, tests/product-acceptance, tests/fixtures/product-acceptance
npx tsx scripts/product-acceptance/run-invariants.ts        # INV-19, INV-19b, INV-16b verdicts (production and main)
npx tsx scripts/product-acceptance/run-mutations.ts         # MUT-08…16 verdicts
npx tsx scripts/product-acceptance/run-all.ts --out <dir>   # M-P1 refusal; 0 CRITICAL on production with the corrected auditor
# certification probe of MUT-12/13/15: runSemanticStage over applyMutation(loadPackage(...), MUTATIONS[...]) — results[].certification per candidate
```
