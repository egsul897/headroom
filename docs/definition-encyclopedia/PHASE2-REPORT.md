# Phase 2 Report — Real Precedent Expansion

## Targets vs actuals

| Metric | Target | Actual | Met |
| --- | ---: | ---: | --- |
| Additional definition examples | 500 | 5371 | true |
| New financing documents | 100 | 67 | false |
| Previously unseen issuers | 50 | 67 | true |

## Quality

- Extraction audit (n=6): mean precision=1.0000, mean recall=0.9906
- Dependency edges: 3476 reported; direct=1654; lexical-risk=182; cycles=50; diamonds=40
- Forwarding: resolved=589, unresolved=1135 (capacity calc forbidden on forwarding alone)
- Amendment authority unresolved / observation-only: 496
- New definition families present: Incremental Cap, Free and Clear Incremental Amount, Permitted Acquisition, Permitted Ratio Debt, Designated Non-Cash Consideration, Consolidated First Lien Debt, Consolidated Net Leverage Ratio, Pro Forma Basis, Pro Forma Effect, Consolidated Interest Expense, Capital Expenditures, Net Proceeds, Indebtedness, Lien, Subsidiary, Wholly Owned Subsidiary, Change of Control, Material Adverse Effect, Cash Equivalents, Disqualified Equity Interests, Excluded Subsidiary

## Coordination

- EHB queue consumed: true
- KF adapter emitted: true
- Foreign schema modified: false
- Paid inference: false
