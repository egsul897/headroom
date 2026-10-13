# Build plan — covenant book to Headroom Answer

North Star v2 §§10–11 is the acceptance test: a real package, a real financial snapshot, source-backed tests, and truthful limitations. Computed is not certified. Missing section text or a missing input is `NEEDS_INPUT`. #356 owns `learning_*` persistence; this plan does not add a second ledger.

## M1 — Compute book (Matthews)

Status: this change.

- Package: Matthews International, the authentic excerpt and Q1 FY2025 figures already used by the secured-debt workflow.
- Spine: Phase-4A `evaluateLeverageOrCoverageRatio` / `evaluateExpression`. Not `lib/covenant-engine.ts`.
- Ratios: only from a bound “means the ratio of … to …” sentence. FCCR uses Consolidated Fixed Charges, never Interest Expense. First-lien, secured net leverage, and interest coverage stay `NEEDS_INPUT` or `UNKNOWN` until their definitions are in the excerpt.
- Baskets in the excerpt: typed (fixed-dollar, ratio, or unknown) with gross cap only when the cap role is in the text. Remaining capacity stays `NEEDS_INPUT` (no usage ledger).
- Omissions, with no numbers: CA §5.14(a)/(b), §4.09(a) non-guarantor proviso, Permitted Debt (3)–(22).
- Golden test cites the excerpt lines. Emits a `CALCULATION` artifact and `CALCULATION_MISMATCH` errors for the #356 loop. No Neon write.

## M2 — Neon flywheel persist (#356)

- Insert M1 `CALCULATION` artifacts into `learning_artifacts` and mistakes into `learning_error_ledger_entries`.
- Replay prior corrections only when the citation is still in the source.
- Do not mark rows `VERIFIED`. Do not open a second schema.

## M3 — Headroom Answer on the dashboard

- For a debt, lien, or restricted-payment question, render North Star §10 from the M1 book: path, section, gross cap, tests, headroom, `NEEDS_INPUT` limitations.
- The dashboard stops reading legacy `fixedChargeCoverage` (interest coverage aliased as FCCR).
- No path is selected for the user. Remaining capacity stays unpublished until utilization is verified.

## M4 — Second company (CONMED), unseen

- Run the same book builder on CONMED with no Matthews thresholds copied in.
- Log `CALCULATION_MISMATCH` rows, fix one bounded cause, rerun.
- Held-out expectations come from CONMED’s own section text, not from this Matthews golden file.
