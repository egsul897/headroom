# Build plan — covenant book to Headroom Answer

North Star v2 §§10–11 is the acceptance test: a real package, a real financial snapshot, source-backed tests, and truthful limitations. Computed is not certified. Missing section text or a missing input is `NEEDS_INPUT`. #356 owns `learning_*` persistence; this plan does not add a second ledger.

## M1 — Compute book (Matthews)

Status: this change.

- Package: Matthews International. Operative text is the pinned EDGAR indenture, Fifth Amendment (strikethrough removed), and Sixth Amendment (`tests/fixtures/edgar/matthews/`, source URL + sha256). As-of 2024-12-31; the 2026 Eighth Amendment is not operative.
- Spine: Phase-4A `evaluateLeverageOrCoverageRatio` / `evaluateExpression`. Not `lib/covenant-engine.ts`.
- Ratios: only from a bound “means / shall mean the ratio of … to …” sentence. FCCR uses Consolidated Fixed Charges. Secured net leverage, first lien, CA leverage, senior leverage, and interest coverage stay `NEEDS_INPUT` where Eligible Cash Equivalents, First Lien Debt, Net Indebtedness, Senior Indebtedness, or CA EBITDA is unbound. Total Net Leverage is not defined in those exhibits.
- Baskets: Permitted Debt (1)(a) and (2)–(22), §4.09(a) and its non-guarantor proviso, §4.10, §5.14, §6.01(j). Gross caps only from the clause. Remaining capacity stays `NEEDS_INPUT`.
- Omission: no filed compliance certificate. The in-repo certificate is a reconstruction, not an EDGAR exhibit.
- Golden test cites the exhibit lines. Emits a `CALCULATION` artifact and `CALCULATION_MISMATCH` errors for the #356 loop. No Neon write.

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
