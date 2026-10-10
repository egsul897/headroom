# CONMED Corporation — Transaction Answer Report

**Audience:** CFO / Treasurer / financing counsel
**Package:** Eighth A&R Credit Agreement (June 10, 2025) + Guarantee & Collateral + amendments
**Authority:** Source-backed structure and certified-path enumeration where available. **Numeric capacity is not certified** without APPROVED financials, ledger, and executable cross-rule gates.
**promotedToLegalTruth:** 0

## Financing documents in scope
- **Eighth Amended and Restated Credit Agreement (June 10, 2025)** (`BASE_CREDIT_AGREEMENT`) — curated:yes raw:yes — https://www.sec.gov/Archives/edgar/data/816956/000117494725000941/ex10-1.htm
- **Amended and Restated Guarantee and Collateral Agreement (June 10, 2025)** (`GUARANTEE_AND_COLLATERAL`) — curated:yes raw:yes — https://www.sec.gov/Archives/edgar/data/816956/000117494725000941/ex10-2.htm
- **Second Amendment to Seventh A&R Credit Agreement (August 1, 2022)** (`OUT_OF_PACKAGE_AMENDMENT`) — curated:yes raw:yes — https://www.sec.gov/Archives/edgar/data/816956/000119312522209154/d220699dex102.htm
  - ⚠️ Amends the Seventh A&R (July 16, 2021), which is not in this package. Do not attach to Document A.
- **First Omnibus Amendment and Increased Facility Activation Notice (May 27, 2026)** (`IN_PACKAGE_OMNIBUS_AMENDMENT`) — curated:yes raw:yes — https://www.sec.gov/Archives/edgar/data/816956/000207709626000190/ea029246401ex10-1.htm

## Missing information (explicit)
- Seventh Amended and Restated Credit Agreement dated July 16, 2021 (target of Document C)
- Document D Exhibit A blackline (excluded as duplicate reprint)
- Document D Exhibit B blackline (excluded)
- Fee Letter dated May 1, 2026 (referenced by Doc D §2)
- APPROVED North Star financial snapshots for CONMED
- Attributed basket utilization ledger for CONMED
- Independently CERTIFIED companion units for §7.1 and §7.3(g) (cross-rule gate)

## Pipeline status
- Structural / covenant intelligence: 15 summary items; 48 explorer rows; 8 package facts (49 ground-truth units).
- Authenticated VEP: present; evaluateVerifiedCapacity(REQUIRE) → **REFUSED**.
- Phase 4E: unsecured CERTIFIED_4E; secured CERTIFIED_4E.
- Legal-intelligence surviving executable conclusions: **0** (fail-closed expected without full IR + financials).

## Contemplated transactions
### S1-unsecured-debt — Unsecured debt incurrence
- **Requested:** Parent Borrower incurs $25,000,000 of unsecured Indebtedness on 2026-08-01.
- **Independent pathway:** §7.2(o) general unsecured basket and/or §7.2(l) Permitted Unsecured Indebtedness
- **Governing document / section:** Eighth A&R Credit Agreement (Document A) §7.2(o) / 7.2(l)
- **Source:** human-ground-truth a-7.2-o / a-7.2-l; Article VII curated text
- **Headroom status:** **NEEDS_INPUT** (assessment: CORRECT_REFUSAL)
- **Available capacity:** Not independently supportable — withheld
- **Conditions / limitations:** CROSS_RULE_GATE_NOT_EXECUTABLE:ir-rule:29309c463e06b77b4b243eda; CROSS_RULE_GATE_NOT_EXECUTABLE:PHASE4_CROSS_RULE_GATE_NOT_YET_EXECUTABLE: rule(s) are gated on another rule's satisfaction; the runtime has no certified cross-rule satisfaction evaluator, so the gate is never treated as satisfied and the package fails closed; Cutoff: NEEDS_INPUT · Missing: APPROVED_NorthStar_snapshot · Missing: contractual_cutoff · Certified blocker: NO_APPROVED_SNAPSHOT · Certified blocker: CUTOFF_UNRESOLVED
- **Independent rationale:** §7.2(o) is greater of $60,000,000 and 3.25% of Consolidated Total Assets — dollar ceiling structure is clear, but remaining capacity requires CTA and utilization. §7.2(l) additionally requires no-default and pro forma §7.1(b) compliance. No APPROVED financial snapshot or ledger in package → capacity not executable.

### S2-secured-debt — Secured debt requiring debt + lien authority
- **Requested:** Parent Borrower incurs $40,000,000 of Indebtedness secured by Liens on 2026-08-01.
- **Independent pathway:** Debt basket (§7.2, e.g. 7.2(c)/(o)/(s)) PLUS Lien basket (§7.3, e.g. 7.3(m) or 7.3(g))
- **Governing document / section:** Eighth A&R Credit Agreement (Document A) §7.2 + 7.3
- **Source:** human-ground-truth a-7.2 / a-7.3-m / a-7.2-c
- **Headroom status:** **UNSUPPORTED** (assessment: CORRECT_REFUSAL)
- **Available capacity:** Not independently supportable — withheld
- **Conditions / limitations:** CROSS_RULE_GATE_NOT_EXECUTABLE:ir-rule:29309c463e06b77b4b243eda; CROSS_RULE_GATE_NOT_EXECUTABLE:PHASE4_CROSS_RULE_GATE_NOT_YET_EXECUTABLE: rule(s) are gated on another rule's satisfaction; the runtime has no certified cross-rule satisfaction evaluator, so the gate is never treated as satisfied and the package fails closed; Cutoff: NEEDS_INPUT · Missing: APPROVED_NorthStar_snapshot · Missing: contractual_cutoff · Certified blocker: NO_APPROVED_SNAPSHOT · Certified blocker: CUTOFF_UNRESOLVED
- **Independent rationale:** Secured debt requires simultaneous Indebtedness and Liens permission. Authentic VEP covers §7.2(c) (debt secured by Liens under 7.3(g), pro forma 7.1) but cross-rule satisfaction is not executable (PHASE4_CROSS_RULE_GATE_NOT_YET_EXECUTABLE). Companion §7.1 / §7.3 CERTIFIED units and APPROVED financials missing. Correct product outcome is fail-closed UNSUPPORTED / REFUSED — not a green permission.

### S3-restricted-payment — Restricted payment / investment
- **Requested:** Parent Borrower makes a $30,000,000 dividend on 2026-08-01.
- **Independent pathway:** §7.6(d) $40,000,000 per fiscal year general RP basket (and/or §7.6(e) ratio-gated unlimited)
- **Governing document / section:** Eighth A&R Credit Agreement (Document A) §7.6(d)
- **Source:** human-ground-truth a-7.6-d
- **Headroom status:** **NEEDS_INPUT** (assessment: CORRECT_REFUSAL)
- **Available capacity:** Not independently supportable — withheld
- **Conditions / limitations:** NO_MATCHING_PRIMARY_RULES_FOR_RESTRICTED_PAYMENT; CROSS_RULE_GATE_NOT_EXECUTABLE:PHASE4_CROSS_RULE_GATE_NOT_YET_EXECUTABLE: rule(s) are gated on another rule's satisfaction; the runtime has no certified cross-rule satisfaction evaluator, so the gate is never treated as satisfied and the package fails closed; Cutoff: NEEDS_INPUT · Missing: APPROVED_NorthStar_snapshot · Missing: contractual_cutoff · Certified blocker: NO_APPROVED_SNAPSHOT · Certified blocker: CUTOFF_UNRESOLVED
- **Independent rationale:** §7.6(d) is a flat $40M/fiscal-year basket with no ratio gate — structure supports a $30M dividend if YTD utilization leaves ≥$30M. Utilization ledger and fiscal-year YTD usage are not in the package. Capacity must be NEEDS_INPUT, not invented as $40M remaining.

### S4-ratio-gated — Transaction requiring a financial ratio
- **Requested:** Unlimited Restricted Payment under §7.6(e) requiring pro forma Consolidated Senior Secured Leverage Ratio ≤ 3.50x on 2026-08-01.
- **Independent pathway:** §7.6(e) ratio-gated unlimited RP (CSSLR ≤ 3.50x Pro Forma; no Event of Default)
- **Governing document / section:** Eighth A&R Credit Agreement (Document A) §7.6(e)
- **Source:** human-ground-truth a-7.6-e
- **Headroom status:** **NEEDS_INPUT** (assessment: CORRECT_REFUSAL)
- **Available capacity:** Not independently supportable — withheld
- **Conditions / limitations:** NO_MATCHING_PRIMARY_RULES_FOR_RESTRICTED_PAYMENT; CROSS_RULE_GATE_NOT_EXECUTABLE:PHASE4_CROSS_RULE_GATE_NOT_YET_EXECUTABLE: rule(s) are gated on another rule's satisfaction; the runtime has no certified cross-rule satisfaction evaluator, so the gate is never treated as satisfied and the package fails closed; Cutoff: NEEDS_INPUT · Missing: APPROVED_NorthStar_snapshot · Missing: contractual_cutoff · Certified blocker: NO_APPROVED_SNAPSHOT · Certified blocker: CUTOFF_UNRESOLVED
- **Independent rationale:** Pathway is clear from source. Execution requires APPROVED financial snapshot with Consolidated Senior Secured Leverage Ratio (or components) and pro forma treatment. Absent that, refuse numeric clearance.

### S5-amendment — Transaction affected by an amendment
- **Requested:** Rely on Document D ($450M Term A-2 activation) and Document C (2022 Second Amendment leverage schedule) for current debt capacity on 2026-08-01.
- **Independent pathway:** Doc D amends Documents A+B in-package (§2 Increased Facility Activation $450M Term A-2). Doc C amends the Seventh A&R (OUT OF PACKAGE) — must not be treated as amending Document A.
- **Governing document / section:** Document D (in-package) + Document C (target missing) §Doc D §2; Doc C §2(b) → Seventh A&R §7.1(b) [absent]
- **Source:** PACKAGE_FACTS pkg-3, pkg-4, pkg-5; DOCUMENT_C_UNITS c-2b; DOCUMENT_D_UNITS d-2
- **Headroom status:** **REVIEW_REQUIRED** (assessment: CORRECT_REFUSAL)
- **Available capacity:** Not independently supportable — withheld
- **Conditions / limitations:** CROSS_RULE_GATE_NOT_EXECUTABLE:ir-rule:29309c463e06b77b4b243eda; CROSS_RULE_GATE_NOT_EXECUTABLE:PHASE4_CROSS_RULE_GATE_NOT_YET_EXECUTABLE: rule(s) are gated on another rule's satisfaction; the runtime has no certified cross-rule satisfaction evaluator, so the gate is never treated as satisfied and the package fails closed; Cutoff: NEEDS_INPUT · Missing: APPROVED_NorthStar_snapshot · Missing: contractual_cutoff · Certified blocker: NO_APPROVED_SNAPSHOT · Certified blocker: CUTOFF_UNRESOLVED
- **Independent rationale:** In-package Omnibus effect is identifiable. Second Amendment's stepped leverage schedule targets a document not in the package — operative precedence for that schedule cannot be fully determined. Correct outcome: record Doc D; leave Doc C UNRESOLVED; do not attach Doc C to Eighth A&R.

### S6-insufficient-evidence — Insufficient evidence must be refused
- **Requested:** Execute verified capacity REQUIRE and commit a $10M secured draw with no financial snapshot, no ledger, and no complete cross-rule companions.
- **Independent pathway:** None executable under REQUIRE
- **Governing document / section:** N/A — missing APPROVED snapshot + cross-rule evaluator + companion CERTIFIED units §n/a
- **Source:** authenticated-vep blocker report; North Star fail-closed
- **Headroom status:** **INSUFFICIENT_EVIDENCE** (assessment: CORRECT_REFUSAL)
- **Available capacity:** Not independently supportable — withheld
- **Conditions / limitations:** CROSS_RULE_GATE_NOT_EXECUTABLE:ir-rule:29309c463e06b77b4b243eda; CROSS_RULE_GATE_NOT_EXECUTABLE:PHASE4_CROSS_RULE_GATE_NOT_YET_EXECUTABLE: rule(s) are gated on another rule's satisfaction; the runtime has no certified cross-rule satisfaction evaluator, so the gate is never treated as satisfied and the package fails closed; Cutoff: NEEDS_INPUT · Missing: evaluationDate · Missing: APPROVED_NorthStar_snapshot · Missing: contractual_cutoff · Certified blocker: MISSING_EVALUATION_DATE
- **Independent rationale:** evaluateVerifiedCapacity(REQUIRE) must REFUSE. Inventing $0 utilization or assuming latest quarter would be a false permission. Refusal is the successful outcome.

## Remaining blockers to executable clearance
- CROSS_RULE_GATE_NOT_EXECUTABLE:PHASE4_CROSS_RULE_GATE_NOT_YET_EXECUTABLE: rule(s) are gated on another rule's satisfaction; the runtime has no certified cross-rule satisfaction evaluator, so the gate is never treated as satisfied and the package fails closed
- Amendment/target outside governing package: Doc C Second Amendment amends Seventh A&R (not in package). Operative precedence cannot be fully determined.
- No Phase-3 verified IR package is loaded for CONMED — evaluateVerifiedCapacity cannot execute under REQUIRE.
- PHASE4_CROSS_RULE_GATE_NOT_YET_EXECUTABLE — companion rule satisfaction not certified
- No APPROVED NS-4 financial snapshot for conmed-demo
- No attributed utilization ledger for conmed-demo
- Package-level certifyPackage remains PARTIAL (not full-package CERTIFIED)

## Bottom line
Headroom correctly identifies CONMED’s debt, lien, RP, and amendment pathways from authentic documents and fails closed where financial snapshots, utilization ledger, or cross-rule certification are missing. A refusal under REQUIRE is a successful control — not a product defect.
