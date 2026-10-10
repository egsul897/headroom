# Priority 1 — Scenario authenticity audit

**Scope:** the eight scenarios shipped in PR #218 (`AUTHENTIC_CROSS_DOCUMENT_SCENARIOS`).  
**Rule:** do not describe synthetic scenarios as authentic.

| Scenario | Documents | Contractual text | Expected result timing | Production path reachable? | Citations → operative source? | Classification |
|---|---|---|---|---|---|---|
| xd-01 | Synthetic Northfield CA + Indenture (`pkg-b`) | **Verbatim** from synthetic fixture files (hand-authored for product-acceptance; not EDGAR) | Declared in scenario object **before** evaluator run; test asserts match | Partial — evaluator API yes; Ask wiring added in this mission | Yes — fixture §7.01 / §4.09 text | **SYNTHETIC** |
| xd-02 | Same `pkg-b` | Verbatim synthetic | Pre-declared | Partial → Ask (this mission) | Yes | **SYNTHETIC** |
| xd-03 | Synthetic Granite Peak CA (`pkg-i`) | Verbatim synthetic | Pre-declared | Partial → Ask | Yes — §7.01(b)/7.02(b)/9.15 | **SYNTHETIC** |
| xd-04 | `pkg-b` | Verbatim synthetic | Pre-declared | Partial → Ask | Yes — §4.09 → §1.01 FCCR | **SYNTHETIC** |
| xd-05 | `pkg-b` + supplemental | Verbatim synthetic | Pre-declared | Partial → Ask | Yes — pre/post §4.09(c) | **SYNTHETIC** |
| xd-06 | Synthetic Copperline ABL (`pkg-h`); ICA absent | Verbatim synthetic ABL; ICA intentionally omitted | Pre-declared | Partial → Ask | Yes — §7.02(b) | **SYNTHETIC** |
| xd-07 | `pkg-b` | Verbatim synthetic definitions | Pre-declared | Partial → Ask | Yes — §1.01 Indebtedness divergence | **SYNTHETIC** |
| xd-08 | `pkg-h` ABL + ICA | Verbatim synthetic | Pre-declared | Partial → Ask | Yes — §7.03(b)/(c) | **SYNTHETIC** |

## Counts (PR #218 baseline)

| Class | Count |
|---|---|
| **SYNTHETIC** scenarios | **8** |
| **AUTHENTIC** (EDGAR / real issuer) scenarios | **0** |

## Fixture provenance notes

Product-acceptance manifests label issuers as synthetic, e.g.:

- `pkg-b-multi-document/expectations.json` — “Northfield Components Corp. **(synthetic)**”
- `pkg-i-secured-debt-lien` — “Granite Peak Fabrication, Inc. **(synthetic)**”
- `pkg-h-unseen-composition` — “Copperline Energy Services, Inc. **(synthetic)**”

The prior mission report’s phrase “Authentic fixtures used” was **incorrect** for these eight scenarios. Corrected terminology: **synthetic product-acceptance fixtures with verbatim fixture text**.

## Production interface (this mission)

`analyzeContemplatedTransaction` now exposes `crossDocumentVerdict` alongside `legacySimulation` / `simulateHref` / `pathEnumeration` so the same draft fields (companyId, amount, kind, secured, asOf) drive Ask + Simulate + cross-document reasoning.
