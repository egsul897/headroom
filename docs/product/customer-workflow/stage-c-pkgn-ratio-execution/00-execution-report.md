# Stage C execution — pkg-n-clean-ratio §7.01(c)

**Verdict:** ratio-dependent path **EXECUTED** (technical demonstration with labeled synthetic TNLR).

| Field | Value |
|---|---|
| Package | `pkg-n-clean-ratio` (synthetic Oakhurst; acceptance DERIVED VEP) |
| Transaction | Incur Indebtedness (INCUR_DEBT) |
| Contractual path | §7.01(c) unlimited capacity gated by Total Net Leverage Ratio ≤ 3.00× (pro forma) |
| Phase 4E | CERTIFIED_4E / CANDIDATE |
| Capacity (REQUIRE) | AVAILABLE / UNLIMITED gate=SATISFIED at TNLR 2.5 |
| Simulation (4D) | selectedPathResult=SATISFIED; consume $10,000,000 |
| Financial inputs | **SYNTHETIC_LABELED_TECHNICAL_DEMO** (not customer-certified) |

## Operative check

- Source: Indebtedness of the Borrower so long as, after giving pro forma effect thereto, Total Net Leverage Ratio does not exceed 3.00 to 1.00.
- Synthetic TNLR 2.5 ≤ 3.00 → gate SATISFIED → unlimited capacity.

## Correct refusals (not counted as executable successes)

- Missing TNLR → §7.01(c) **NEEDS_INPUT**.
- Synthetic TNLR 4.0 → remaining **GATE_NOT_SATISFIED** (path does not yield headroom).

## Defect closed this cycle

Expressionless `PRO_FORMA: after giving pro forma effect thereto` sibling conditions no longer force `selectedPathResult=INDETERMINATE` when a sibling ratio condition already carries `evaluationBasis.proForma` and evaluated SATISFIED.

## Safety

- Gates not weakened; CFP target 0; synthetic inputs labeled; no paid inference; no authentic EDGAR certification claimed.
