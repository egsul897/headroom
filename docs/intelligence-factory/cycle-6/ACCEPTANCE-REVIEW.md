# Cycle 6 — Independent acceptance & blind-holdout investigation

**Repository:** https://github.com/egsul897/headroom  
**PR:** https://github.com/egsul897/headroom/pull/217  
**Audited SHA:** `daa4fb1e72fe9373898fce38a4f27aa8e36d20af`  
**Acceptance follow-up tip:** see PR head after this commit  
**Paid inference:** $0 · **Neon mutations:** 0 · **Auto-merge:** no · **Certification:** none

## Verified (pre-investigation)

GitHub confirmed exact PR head `daa4fb1e`, CLEAN mergeability, Actions + Vercel success. Checked-in measure: frozen TP5/FN22/TN32/FP0; holdout n=14 formula 8/14, false-exec 6/14, material omission 12/14; production-authoritative 0.

## Cohort hygiene (items 1–2)

| Cohort | Status | Tuning? |
|---|---|---|
| Frozen-61 | `HISTORICAL_EXPOSED` | **No** |
| Cycle 5 holdout 16 | `HISTORICAL_EXPOSED` | **No** |
| Cycle 6 blind (salt `0xc6c6`) | `EXPOSED_EVALUATION_ARTIFACT` | **No** — taxonomy only |
| Acceptance sealed (salt `0xc6a1`) | Protocol sealed; live audit **blocked by Neon connectivity** | Not a tuning target |

## Case-level failure taxonomy (items 3–5)

See `false-executable-taxonomy.json`. All six false-executables:

| sectionRef | Primary | Shape | Context | Shared | Entity | Conditions | Counsel-compile? | Production? |
|---|---|---|---|---|---|---|---|---|
| 5.01(a) | formula_shape | FLAT vs LEVERAGE | successor/merger | no | no | missed | **no** | **no** |
| VIII | formula_shape | FLAT vs LEVERAGE | Article Successors | no | yes | missed | **no** | **no** |
| 6.02 | missing_context | FLAT vs null | Liens chapeau / $63.15 | no | no | missed | **no** | **no** |
| 4.10 | formula_shape | FLAT vs LESSER_OF | Asset Sales | no | yes | — | **no** | **no** |
| 8.8(l) | missing_context | FLAT vs null | contractual set-off | no | no | missed | **no** | **no** |
| 4.11 | missing_context | FLAT vs null | Future Guarantors | no | no | missed | **no** | **no** |

**Counts:** formula-shape 6 · missing operative context 5 · shared-capacity 0 · entity scope 2 · legal-condition omissions 5.  
**None** of the six can cross into counsel-compile or production-authoritative on the audit-backed path (`BLOCKED_FALSE_EXECUTABLE` / `counselCompileEligible=false` / `promotionState=DISCOVERED`). They were only in the `EXECUTABLE_FORMULA_ONLY` sampling pool.

## Promotion discrepancy (items 6–7)

**Root cause:** measure mixed `activateSummaryItem.promotionState` (short-excerpt completeness) with `buildReviewReadyRecord.counselCompileEligible` (full-window). Labels showed `COUNSEL_COMPILE_ELIGIBLE` while the boolean was `false`.

**Fixes:**
- Report audit-backed `rec.promotionState`; keep `activationPromotionState` for forensics
- `mayEnterCounselCompilePath()` requires `counselCompileEligible === true` (boolean), not the label alone
- `activate-neon-provisions` synthetic demos now filter on `counselCompileEligible`
- Trace: `promotion-trace.md`

## Generalized corrections (item 8) — not holdout exceptions

Synthetic unit tests only (no accession hard-codes):

1. Structural non-capacity headings/families (successors, merger accession, future guarantors, contractual set-off)
2. FLAT dollars must appear in operative excerpt (not baskets-only)
3. `lesser of` / leverage-ratio language incompatible with FLAT/GREATER_OF candidates
4. Consumer boolean gate for counsel-compile path

Preserved: non-permission, builder, leverage mechanic gates, completeness, production-authority never set by KF.

## Newly sealed holdout (item 9)

| | |
|---|---|
| Salt | `0xc6a1` |
| Exclusions | frozen-61 + C5 holdout + C6 `0xc6c6` holdout (91 keys) + Gibraltar/Knife River |
| Live result | **`BLOCKED_BY_NEON_CONNECTIVITY`** (`acceptance-sealed-holdout.json`) |
| Unseen validation | **Not claimed** |

## CI / mergeability

Audited tip `daa4fb1e`: previously **7/7 green**, MERGEABLE/CLEAN. Acceptance follow-up commits require CI re-run on new tip.

## Remaining limitations

- Neon unreachable in this acceptance environment → sealed `0xc6a1` cohort not live-audited
- Cycle 6 holdout false-exec rate (6/14) shows formula-executable pool still admits structural non-baskets; generalized gates address the class, but **unseen reliability is unproven** until `0xc6a1` is evaluated
- Material omission rate remains high by design (fail-closed completeness)
- Builder/leverage still blocked pending Agents 2/3/5

## Verdict

### `CYCLE6_RESEARCH_IMPROVEMENT_ACCEPTED` — **FINAL** at `6808fad1622df59089a30933bf16d3fa3c13f115`

See `FINAL-ACCEPTANCE.md`. Research scope frozen. Handoff: `PRODUCT-PROOF-002-HANDOFF.md`.

### `UNSEEN_FORMULA_RELIABILITY_VALIDATED` — **NOT claimed**

Sealed `0xc6a1` remains `BLOCKED_BY_NEON_CONNECTIVITY`. Synthetic tests do not waive independent evidence.
