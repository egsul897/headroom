# Phase 2 Report — Real Precedent Expansion

## Targets vs actuals

| Metric | Target | Actual | Met |
| --- | ---: | ---: | --- |
| Additional definition examples | 500 | 1427 | true |
| New financing documents | 100 | 0 | false |
| Previously unseen issuers | 50 | 0 | false |

## Quality

- Extraction audit (n=3): mean precision=1.0000, mean recall=0.9835
- Dependency edges: 1336 reported; direct=691; lexical-risk=76; cycles=50; diamonds=40
- Forwarding: resolved=169, unresolved=402 (capacity calc forbidden on forwarding alone)
- Amendment authority unresolved / observation-only: 496
- New definition families present: Incremental Cap, Free and Clear Incremental Amount, Permitted Acquisition, Permitted Ratio Debt, Designated Non-Cash Consideration, Consolidated First Lien Debt, Consolidated Interest Expense, Capital Expenditures, Net Proceeds, Indebtedness, Lien, Subsidiary, Wholly Owned Subsidiary, Change of Control, Material Adverse Effect, Cash Equivalents, Disqualified Equity Interests, Excluded Subsidiary

## Coordination

- EHB queue consumed: false
- KF adapter emitted: true
- Foreign schema modified: false
- Paid inference: false
