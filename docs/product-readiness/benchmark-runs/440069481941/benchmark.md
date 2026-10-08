# Extraction-architecture benchmark — 440069481941

Generated 2026-10-08T21:38:15.168Z. Corpus `02151cdbb8f0c8a6…`. Cost model `deepseek/deepseek-v4-flash`.

Evidence labels: quality = measured offline over fixtures (deterministic production stages); strategies B and C are EVALUATION MODELS (no such production path); cost = deterministic estimate from the rate card; latency = hypothetical projection. No model was called.

## Aggregate

| strategy | complete | plausible-but-incomplete | fail-closed | false permissions | dangerous omissions | restriction recall | condition recall | definition recall | fail-closed correct | est. USD | model calls | input tokens |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| A_BROAD | 10 | 0 | 4 | 0 | 0 | 18/18 | 16/16 | 37/37 | 4/4 | 0.144 | 410 | 632715 |
| B_NAIVE_SELECTIVE | 5 | 8 | 1 | 5 | 13 | 9/18 | 12/16 | 7/37 | 1/4 | 0.070 | 210 | 295504 |
| C_HYBRID | 10 | 0 | 4 | 0 | 0 | 18/18 | 16/16 | 36/37 | 4/4 | 0.094 | 270 | 411458 |

## Per case

| case | class | A outcome | B outcome | C outcome | B dangerous omissions | C dangerous omissions | A/B/C units | A/B/C est. USD |
|---|---|---|---|---|---|---|---|---|
| BM-01 | DEBT_BASKET_SUBJECT_TO_SEPARATE_LIEN_COVENANT | COMPLETE | PLAUSIBLE_BUT_INCOMPLETE ⚠FP | COMPLETE | 2 | 0 | 7/3/7 | 0.012/0.005/0.012 |
| BM-02 | RP_EXCEPTION_CONSTRAINED_BY_DEFINITION_ELSEWHERE | FAIL_CLOSED | FAIL_CLOSED | FAIL_CLOSED | 1 | 0 | 3/3/3 | 0.005/0.005/0.005 |
| BM-03 | RATIO_BASKET_AFFECTED_BY_ANOTHER_DOCUMENT | COMPLETE | PLAUSIBLE_BUT_INCOMPLETE ⚠FP | COMPLETE | 2 | 0 | 6/3/3 | 0.011/0.005/0.005 |
| BM-04 | AMENDMENT_SILENTLY_REPLACES_THRESHOLD | COMPLETE | PLAUSIBLE_BUT_INCOMPLETE ⚠FP | COMPLETE | 3 | 0 | 7/3/6 | 0.012/0.005/0.010 |
| BM-05 | DEFINITION_WITH_NESTED_DEPENDENCIES | FAIL_CLOSED | COMPLETE | FAIL_CLOSED | 0 | 0 | 5/3/3 | 0.009/0.005/0.005 |
| BM-06 | EXCEPTION_LIMITED_TO_CERTAIN_SUBSIDIARIES | COMPLETE | COMPLETE | COMPLETE | 0 | 0 | 7/3/7 | 0.012/0.005/0.012 |
| BM-07 | TOC_ENTRY_RESEMBLING_OPERATIVE_LANGUAGE | COMPLETE | COMPLETE | COMPLETE | 0 | 0 | 8/3/5 | 0.014/0.005/0.009 |
| BM-08 | COVENANT_FAMILY_WITH_UNEXPECTED_HEADING | COMPLETE | COMPLETE | COMPLETE | 0 | 0 | 7/3/1 | 0.012/0.005/0.002 |
| BM-09 | RESTRICTION_OUTSIDE_EXPECTED_ARTICLE | COMPLETE | PLAUSIBLE_BUT_INCOMPLETE ⚠FP | COMPLETE | 1 | 0 | 3/3/2 | 0.005/0.005/0.004 |
| BM-10 | SHARED_CAPACITY_ACROSS_BASKETS | COMPLETE | COMPLETE | COMPLETE | 0 | 0 | 4/3/2 | 0.007/0.005/0.003 |
| BM-11 | PERMITTED_TRANSACTION_WITH_MULTIPLE_INDEPENDENT_CONDITIONS | COMPLETE | PLAUSIBLE_BUT_INCOMPLETE ⚠FP | COMPLETE | 2 | 0 | 3/3/2 | 0.005/0.005/0.004 |
| BM-12 | CROSS_REFERENCE_THAT_CANNOT_BE_RESOLVED | FAIL_CLOSED | PLAUSIBLE_BUT_INCOMPLETE | FAIL_CLOSED | 0 | 0 | 7/3/4 | 0.012/0.005/0.007 |
| BM-13 | MISSING_DOCUMENT_PREVENTS_COMPLETE_ANSWER | FAIL_CLOSED | PLAUSIBLE_BUT_INCOMPLETE | FAIL_CLOSED | 0 | 0 | 8/3/2 | 0.014/0.005/0.004 |
| BM-14 | CHEAPEST_STRATEGY_APPEARS_SUCCESSFUL | COMPLETE | PLAUSIBLE_BUT_INCOMPLETE | COMPLETE | 2 | 0 | 7/3/7 | 0.012/0.005/0.012 |

## Incremental recompilation (estimate)

| package | mutation | strategy | units with content addressing | units without |
|---|---|---|---|---|
| pkg-c-amendment-supersession | restate 7.01(b) (Amendment No. 1) | A_BROAD | 1 | 7 |
| pkg-c-amendment-supersession | restate 7.01(b) (Amendment No. 1) | C_HYBRID | 1 | 6 |

## Cache reuse across two questions (estimate)

| package | questions | strategy | units Q1 | units Q2 | shared |
|---|---|---|---|---|---|
| pkg-i-secured-debt-lien | BM-01+BM-06 | B_NAIVE_SELECTIVE | 3 | 3 | 2 |
| pkg-i-secured-debt-lien | BM-01+BM-06 | C_HYBRID | 7 | 7 | 7 |
| pkg-i-secured-debt-lien | BM-01+BM-06 | A_BROAD | 7 | 7 | 7 |

## Dangerous omissions by case (B naive selective)

- **BM-01** (DEBT_BASKET_SUBJECT_TO_SEPARATE_LIEN_COVENANT): credit-agreement#7.02: lien prohibition governs secured debt; credit-agreement#9.15: $25,000,000 cap on all secured debt, outside Article VII — scope was [credit-agreement#7.01(b), credit-agreement#7.01, credit-agreement#7.02(b)]
- **BM-02** (RP_EXCEPTION_CONSTRAINED_BY_DEFINITION_ELSEWHERE): credit-agreement#7.08(d): shares the Available Amount — scope was [credit-agreement#7.06(c), credit-agreement#1.01, credit-agreement#7.06]
- **BM-03** (RATIO_BASKET_AFFECTED_BY_ANOTHER_DOCUMENT): indenture#4.09: indenture restricts the Issuer's debt incl. a FCCR test; condition RATIO_TEST in indenture#4.09 — scope was [credit-agreement#7.01, indenture#4.09(a), credit-agreement#7.02]
- **BM-04** (AMENDMENT_SILENTLY_REPLACES_THRESHOLD): amendment-1#1: restates 7.01(b) to $40,000,000 with a no-Default proviso; amendment-2#1: deletes 7.01(e); condition NO_DEFAULT in amendment-1#1 — scope was [credit-agreement#7.01(e), credit-agreement#7.01(b), credit-agreement#7.01]
- **BM-09** (RESTRICTION_OUTSIDE_EXPECTED_ARTICLE): condition SCOPE_CARVEOUT in credit-agreement#7.05 — scope was [credit-agreement#7.05(k), credit-agreement#2.05(b), credit-agreement#7.05(c)]
- **BM-11** (PERMITTED_TRANSACTION_WITH_MULTIPLE_INDEPENDENT_CONDITIONS): credit-agreement#7.05: the hanging proviso after (l) removes the facility from every permission; condition SCOPE_CARVEOUT in credit-agreement#7.05 — scope was [credit-agreement#7.05(k), credit-agreement#7.05(l), credit-agreement#2.05(b)]
- **BM-14** (CHEAPEST_STRATEGY_APPEARS_SUCCESSFUL): credit-agreement#7.02(b): $20,000,000 of it may be secured; credit-agreement#9.15: and never more than $25,000,000 of secured debt in total — scope was [credit-agreement#7.01(b), credit-agreement#7.01(a), credit-agreement#7.01(d)]

## Residual gaps (C hybrid)

