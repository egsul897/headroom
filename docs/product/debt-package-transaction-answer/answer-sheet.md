# Independent answer sheet — CONMED debt package

Expectations are authored from `human-ground-truth.ts` and curated Article VII source **before** comparing Headroom output. Engine predictions were not used to write expected answers.

| Scenario | Independent status | Headroom status | Assessment |
|---|---|---|---|
| S1-unsecured-debt | NEEDS_INPUT | NEEDS_INPUT | **CORRECT_REFUSAL** |
| S2-secured-debt | UNSUPPORTED | UNSUPPORTED | **CORRECT_REFUSAL** |
| S3-restricted-payment | NEEDS_INPUT | NEEDS_INPUT | **CORRECT_REFUSAL** |
| S4-ratio-gated | NEEDS_INPUT | NEEDS_INPUT | **CORRECT_REFUSAL** |
| S5-amendment | REVIEW_REQUIRED | REVIEW_REQUIRED | **CORRECT_REFUSAL** |
| S6-insufficient-evidence | INSUFFICIENT_EVIDENCE | INSUFFICIENT_EVIDENCE | **CORRECT_REFUSAL** |

## Independent pathways (source-backed)
### S1-unsecured-debt
- Pathway: §7.2(o) general unsecured basket and/or §7.2(l) Permitted Unsecured Indebtedness
- Document / section: Eighth A&R Credit Agreement (Document A) §7.2(o) / 7.2(l)
- Citation: human-ground-truth a-7.2-o / a-7.2-l; Article VII curated text
- Rationale: §7.2(o) is greater of $60,000,000 and 3.25% of Consolidated Total Assets — dollar ceiling structure is clear, but remaining capacity requires CTA and utilization. §7.2(l) additionally requires no-default and pro forma §7.1(b) compliance. No APPROVED financial snapshot or ledger in package → capacity not executable.
- Headroom citations: 7.2; 7.3; 7.13; 7.9; 7.14; 4E:path:ir-rule:29309c463e06b77b4b243eda; blocker:NO_APPROVED_SNAPSHOT; blocker:CUTOFF_UNRESOLVED

### S2-secured-debt
- Pathway: Debt basket (§7.2, e.g. 7.2(c)/(o)/(s)) PLUS Lien basket (§7.3, e.g. 7.3(m) or 7.3(g))
- Document / section: Eighth A&R Credit Agreement (Document A) §7.2 + 7.3
- Citation: human-ground-truth a-7.2 / a-7.3-m / a-7.2-c
- Rationale: Secured debt requires simultaneous Indebtedness and Liens permission. Authentic VEP covers §7.2(c) (debt secured by Liens under 7.3(g), pro forma 7.1) but cross-rule satisfaction is not executable (PHASE4_CROSS_RULE_GATE_NOT_YET_EXECUTABLE). Companion §7.1 / §7.3 CERTIFIED units and APPROVED financials missing. Correct product outcome is fail-closed UNSUPPORTED / REFUSED — not a green permission.
- Headroom citations: 7.2; 7.3; 7.13; 7.9; 7.14; 4E:path:ir-rule:29309c463e06b77b4b243eda; blocker:NO_APPROVED_SNAPSHOT; blocker:CUTOFF_UNRESOLVED

### S3-restricted-payment
- Pathway: §7.6(d) $40,000,000 per fiscal year general RP basket (and/or §7.6(e) ratio-gated unlimited)
- Document / section: Eighth A&R Credit Agreement (Document A) §7.6(d)
- Citation: human-ground-truth a-7.6-d
- Rationale: §7.6(d) is a flat $40M/fiscal-year basket with no ratio gate — structure supports a $30M dividend if YTD utilization leaves ≥$30M. Utilization ledger and fiscal-year YTD usage are not in the package. Capacity must be NEEDS_INPUT, not invented as $40M remaining.
- Headroom citations: 7.6; 7.8; 7.17; 7.14; 7.9; blocker:NO_APPROVED_SNAPSHOT; blocker:CUTOFF_UNRESOLVED

### S4-ratio-gated
- Pathway: §7.6(e) ratio-gated unlimited RP (CSSLR ≤ 3.50x Pro Forma; no Event of Default)
- Document / section: Eighth A&R Credit Agreement (Document A) §7.6(e)
- Citation: human-ground-truth a-7.6-e
- Rationale: Pathway is clear from source. Execution requires APPROVED financial snapshot with Consolidated Senior Secured Leverage Ratio (or components) and pro forma treatment. Absent that, refuse numeric clearance.
- Headroom citations: 7.6; 7.8; 7.17; 7.10; 7.14; blocker:NO_APPROVED_SNAPSHOT; blocker:CUTOFF_UNRESOLVED

### S5-amendment
- Pathway: Doc D amends Documents A+B in-package (§2 Increased Facility Activation $450M Term A-2). Doc C amends the Seventh A&R (OUT OF PACKAGE) — must not be treated as amending Document A.
- Document / section: Document D (in-package) + Document C (target missing) §Doc D §2; Doc C §2(b) → Seventh A&R §7.1(b) [absent]
- Citation: PACKAGE_FACTS pkg-3, pkg-4, pkg-5; DOCUMENT_C_UNITS c-2b; DOCUMENT_D_UNITS d-2
- Rationale: In-package Omnibus effect is identifiable. Second Amendment's stepped leverage schedule targets a document not in the package — operative precedence for that schedule cannot be fully determined. Correct outcome: record Doc D; leave Doc C UNRESOLVED; do not attach Doc C to Eighth A&R.
- Headroom citations: 7.2; 7.8; 7.14; 7.3; 7.6; 4E:path:ir-rule:29309c463e06b77b4b243eda; blocker:NO_APPROVED_SNAPSHOT; blocker:CUTOFF_UNRESOLVED

### S6-insufficient-evidence
- Pathway: None executable under REQUIRE
- Document / section: N/A — missing APPROVED snapshot + cross-rule evaluator + companion CERTIFIED units §n/a
- Citation: authenticated-vep blocker report; North Star fail-closed
- Rationale: evaluateVerifiedCapacity(REQUIRE) must REFUSE. Inventing $0 utilization or assuming latest quarter would be a false permission. Refusal is the successful outcome.
- Headroom citations: 7.2; 7.9; 7.1; 7.3; 7.6; 4E:path:ir-rule:29309c463e06b77b4b243eda; blocker:NO_APPROVED_SNAPSHOT; blocker:CUTOFF_UNRESOLVED

## Correctness totals
```
{
  "CORRECT_EXECUTABLE": 0,
  "CORRECT_REFUSAL": 6,
  "INCORRECT": 0,
  "MISSING_CAPABILITY": 0,
  "UNVERIFIED": 0
}
```
