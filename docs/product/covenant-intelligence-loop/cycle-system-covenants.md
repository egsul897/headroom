# Cycle — system-level covenant intelligence

**Parent tip:** `f56652aa` (+ follow-up dual-regime ranking fix)  
**Paid inference:** 0 · **promotedToLegalTruth:** 0

## Agreements analyzed as systems
Gibraltar (fixture + EDGAR Neon), Chewy (fixture + EDGAR Neon), CONMED VII (curated), BrightView (Neon), Live Nation A&R (Neon).  
Also re-persisted Alkermes / AEO / DSGR / GoDaddy / McKesson / Peloton / Chefs Warehouse / Southwest Joinder.

## Mechanics improvements (this cycle)
- **Secured-debt dual-regime Ask:** force Liens + Indebtedness; label regimes; prefer `Limitations on Liens` / `Limitation on Indebtedness` over Art. 4/5 ownership reps and maintenance tests
- **Incremental paths:** Fixed/Cash-Capped, Ratio, Voluntary Prepayment/Prepayment-Based; multi-component sum; default utilization order; redesignation into ratio
- **Anti-stacking / reclassification:** without-duplication-for-purposes-of-Section; divide-and-classify; reallocation
- **Available Amount / NOA:** builder netting, NOA deduction/prior-application paths; definition attachment via meaning-specified pointers (no false first-Section binding)
- Longer Incremental capacity excerpts; Ask incremental intent + scoring

## Verified before → after (system challenge)

| Agreement | dualRegime secured-debt | Lead sections | Growers | Shared | Builders | NOA | Anti-stack | Incr paths | Gaps |
|---|---|---|---|---|---|---|---|---|---|
| Gibraltar | true | **7.02, 7.01** (was 5.08 / incremental) | 17 | 5 | 3 | 0* | 5 | 32 | none |
| Chewy | true | **6.02, 6.01** | 16 | 8 | 58 | 52 | 6 | 18 | none |
| CONMED VII | true | **7.3, 7.2** | 4 | 1 | 0* | 0* | 0* | 0* | none (curated Art. VII) |
| BrightView | true | **10.2, 10.1** (was 10.7 FC) | 14 | 4 | 3 | 0* | 2 | 0† | none flagged |
| Live Nation | true | **7.02, 7.01** | 14 | 11 | 7 | 0* | 2 | 28 | none |

\* Text does not use `Not Otherwise Applied` / AA builder phrasing (or curated excerpt lacks defs).  
† BrightView incremental drafting uses alternate naming not yet fully mapped to Fixed/Ratio/Prepayment signals.

## Material errors fixed
1. Secured-debt Ask returned only highest-ranked provision (often incremental) → dual-regime selection
2. Ownership-of-Property Liens representation ranked as liens covenant → demoted; operative Limitations preferred
3. Gibraltar/Chewy incremental facility paths under-extracted (Cash-Capped / Ratio-Based / Prepayment-Based and Fixed/Ratio/Voluntary) → signals + elections/redesignation
4. NOA prior-application sections not surfaced → deduction-path extraction + definition attachment

## Remaining gaps
- BrightView (and similar) incremental naming still thin vs Gibraltar/Chewy
- Anti-stacking / reclassification are signals, not structured IR
- Full Available Amount builder arithmetic (every plus/minus limb) still shallow vs operative defs
- CONMED curated VII lacks definitional bank (EBITDA Ask cannot definition-lead)
- Formula verification vs every operative basket remains incomplete on large A&Rs

## Neon persistence
`promotedToLegalTruth: 0` unchanged. Challenge scripts rewrite `covenantSummary` + analysis metadata only.
