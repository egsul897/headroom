# Basket inventory

Every numeric covenant term read from the pinned documents: debt, liens, restricted payments, investments, asset sales, affiliate thresholds, mergers, change of control, reporting deadlines, events of default, and mandatory prepayments. A computed value is the closed form in the clause. A deadline is the stated day count; whether it has been met is not computed. Remaining capacity is not computed. Nothing here is certified.

Packages other than Matthews have no bound Total Assets or EBITDA line, so a grower or a percent of an unbound base stays NEEDS_INPUT. The section inventory is in covenant-coverage.md.

## Counts

| package | clauses | COMPUTED | UNLIMITED_BY_PURPOSE | NEEDS_INPUT | UNKNOWN | computed amounts |
| --- | --- | --- | --- | --- | --- | --- |
| matthews-international-q1-fy2025 | 245 | 69 | 145 | 31 | 0 | 30 |
| chwy-2026-credit-agreement | 133 | 22 | 54 | 57 | 0 | 0 |
| gibraltar-2026-credit-agreement | 155 | 14 | 101 | 40 | 0 | 3 |
| mtn-2026-tenth-ar | 151 | 71 | 27 | 53 | 0 | 12 |
| wor-2026-fifth-ar-credit-agreement | 19 | 10 | 4 | 5 | 0 | 3 |
| mhk-2026-credit-agreement | 43 | 9 | 17 | 17 | 0 | 2 |

## matthews-international-q1-fy2025

| basket | section | type | cap formula | computed value | status |
| --- | --- | --- | --- | --- | --- |
| matw-409a | §4.09(a) | DEBT_INCURRENCE / RATIO_BASED / GENERAL | Consolidated Fixed Charge Coverage Ratio at least 2.00 to 1.00 | gate open | COMPUTED |
| matw-409a-proviso | §4.09(a) non-guarantor proviso | DEBT_INCURRENCE / GROWER_GREATER_OF / PURPOSE_SPECIFIC | greater of (i) $125.0 million and (ii) 7.0% of the Total Assets | 125.42033 USD_MILLIONS | COMPUTED |
| matw-410 | §4.10 | LIENS / UNLIMITED_BY_PURPOSE / PURPOSE_SPECIFIC |  |  | UNLIMITED_BY_PURPOSE |
| matw-514a | Credit Agreement §5.14(a) Leverage Ratio | FINANCIAL_COVENANT / RATIO_BASED / PURPOSE_SPECIFIC | Leverage Ratio less than or equal to 4.50 to 1.00 |  | NEEDS_INPUT |
| matw-514a-temporary | Credit Agreement §5.14(a) Temporary Leverage Increase Period | FINANCIAL_COVENANT / RATIO_BASED / PURPOSE_SPECIFIC | Leverage Ratio less than or equal to 5.00 to 1.00 |  | NEEDS_INPUT |
| matw-514a-temporary-senior | Credit Agreement §5.14(a) Temporary Senior Leverage Test Period | FINANCIAL_COVENANT / RATIO_BASED / PURPOSE_SPECIFIC | Senior Leverage Ratio less than or equal to 4.00 to 1.00 |  | NEEDS_INPUT |
| matw-514b | Credit Agreement §5.14(b) Interest Coverage Ratio | FINANCIAL_COVENANT / RATIO_BASED / PURPOSE_SPECIFIC | Interest Coverage Ratio greater than or equal to 3.00 to 1.0 |  | NEEDS_INPUT |
| matw-ca-601j | §6.01(j) | LIENS / UNLIMITED_BY_PURPOSE / PURPOSE_SPECIFIC |  |  | UNLIMITED_BY_PURPOSE |
| matw-ca-fifth-amendment-2-20-mandatory-prepayments-for-currency-fluctuations-1-business-day | §2.20 Mandatory Prepayments for Currency Fluctuations | PREPAYMENT / STATED_PERIOD / PURPOSE_SPECIFIC | 1 Business Day | 1 BUSINESS_DAYS | COMPUTED |
| matw-ca-fifth-amendment-2-20-mandatory-prepayments-for-currency-fluctuations-105 | §2.20 Mandatory Prepayments for Currency Fluctuations | PREPAYMENT / PCT_OF_METRIC / PURPOSE_SPECIFIC | 105% of Optional Currency Sublimit |  | NEEDS_INPUT |
| matw-ca-fifth-amendment-2-20-mandatory-prepayments-for-currency-fluctuations-105-2 | §2.20 Mandatory Prepayments for Currency Fluctuations | PREPAYMENT / PCT_OF_METRIC / PURPOSE_SPECIFIC | 105% of Foreign Borrower Sublimit |  | NEEDS_INPUT |
| matw-ca-fifth-amendment-5-01-reporting-and-information-requirements-10-days | §5.01 Reporting and Information Requirements | REPORTING / STATED_PERIOD / PURPOSE_SPECIFIC | 10 days | 10 DAYS | COMPUTED |
| matw-ca-fifth-amendment-5-01-reporting-and-information-requirements-45-days | §5.01 Reporting and Information Requirements | REPORTING / STATED_PERIOD / PURPOSE_SPECIFIC | 45 days | 45 DAYS | COMPUTED |
| matw-ca-fifth-amendment-5-01-reporting-and-information-requirements-60-days | §5.01 Reporting and Information Requirements | REPORTING / STATED_PERIOD / PURPOSE_SPECIFIC | 60 days | 60 DAYS | COMPUTED |
| matw-ca-fifth-amendment-5-01-reporting-and-information-requirements-90-days | §5.01 Reporting and Information Requirements | REPORTING / STATED_PERIOD / PURPOSE_SPECIFIC | 90 days | 90 DAYS | COMPUTED |
| matw-ca-fifth-amendment-6-06-partnerships-mergers-or-consolidation-acquisitio-5-business-days | §6.06 Partnerships; Mergers or Consolidation; Acquisitions | MERGER / STATED_PERIOD / PURPOSE_SPECIFIC | 5 Business Days | 5 BUSINESS_DAYS | COMPUTED |
| matw-ca-fifth-amendment-7-01-events-of-default-10-000-000-00 | §7.01 Events of Default | EVENTS_OF_DEFAULT / FIXED_DOLLAR / PURPOSE_SPECIFIC | $10,000,000.00 | 10000000 USD | COMPUTED |
| matw-ca-fifth-amendment-7-01-events-of-default-10-days | §7.01 Events of Default | EVENTS_OF_DEFAULT / STATED_PERIOD / PURPOSE_SPECIFIC | 10 days | 10 DAYS | COMPUTED |
| matw-ca-fifth-amendment-7-01-events-of-default-30-000-000-00 | §7.01 Events of Default | EVENTS_OF_DEFAULT / FIXED_DOLLAR / PURPOSE_SPECIFIC | $30,000,000.00 | 30000000 USD | COMPUTED |
| matw-ca-fifth-amendment-7-01-events-of-default-30-consecutive-days | §7.01 Events of Default | EVENTS_OF_DEFAULT / STATED_PERIOD / PURPOSE_SPECIFIC | 30 days | 30 DAYS | COMPUTED |
| matw-ca-fifth-amendment-7-01-events-of-default-30-days | §7.01 Events of Default | EVENTS_OF_DEFAULT / STATED_PERIOD / PURPOSE_SPECIFIC | 30 days | 30 DAYS | COMPUTED |
| matw-ca-fifth-amendment-7-01-events-of-default-5-000-000-00 | §7.01 Events of Default | EVENTS_OF_DEFAULT / FIXED_DOLLAR / PURPOSE_SPECIFIC | $5,000,000.00 | 5000000 USD | COMPUTED |
| matw-ca-fifth-amendment-7-01-events-of-default-5-business-days | §7.01 Events of Default | EVENTS_OF_DEFAULT / STATED_PERIOD / PURPOSE_SPECIFIC | 5 Business Days | 5 BUSINESS_DAYS | COMPUTED |
| matw-ca-fifth-amendment-7-02-consequences-of-an-event-of-default-105 | §7.02 Consequences of an Event of Default | EVENTS_OF_DEFAULT / PCT_OF_METRIC / PURPOSE_SPECIFIC | 105% of Letter of Credit Reserve |  | NEEDS_INPUT |
| matw-ca-fifth-amendment-7-06-application-of-proceeds-10-000-000-00 | §7.06 Application of Proceeds | EVENTS_OF_DEFAULT / FIXED_DOLLAR / PURPOSE_SPECIFIC | $10,000,000.00 | 10000000 USD | COMPUTED |
| matw-ca-fifth-amendment-definition-change-of-control-35 | §definition Change of Control | CHANGE_OF_CONTROL / PCT_OF_METRIC / PURPOSE_SPECIFIC | 35% of aggregate ordinary voting power represented by the issued and outstanding capital stock of the US Borrower |  | NEEDS_INPUT |
| matw-ca-fifth-amendment-s3-16-margin-stock | §3.16 Margin Stock | OTHER / UNLIMITED_BY_PURPOSE / PURPOSE_SPECIFIC |  |  | UNLIMITED_BY_PURPOSE |
| matw-ca-fifth-amendment-s6-03-self-dealing-a | §6.03 Self-Dealing (a) | OTHER / UNLIMITED_BY_PURPOSE / PURPOSE_SPECIFIC |  |  | UNLIMITED_BY_PURPOSE |
| matw-ca-fifth-amendment-s6-03-self-dealing-b | §6.03 Self-Dealing (b) | OTHER / UNLIMITED_BY_PURPOSE / PURPOSE_SPECIFIC |  |  | UNLIMITED_BY_PURPOSE |
| matw-ca-fifth-amendment-s6-03-self-dealing-c | §6.03 Self-Dealing (c) | OTHER / UNLIMITED_BY_PURPOSE / PURPOSE_SPECIFIC |  |  | UNLIMITED_BY_PURPOSE |
| matw-ca-fifth-amendment-s6-03-self-dealing-d | §6.03 Self-Dealing (d) | OTHER / UNLIMITED_BY_PURPOSE / PURPOSE_SPECIFIC |  |  | UNLIMITED_BY_PURPOSE |
| matw-ca-fifth-amendment-s6-05-margin-stock | §6.05 Margin Stock | OTHER / UNLIMITED_BY_PURPOSE / PURPOSE_SPECIFIC |  |  | UNLIMITED_BY_PURPOSE |
| matw-ca-fifth-amendment-s6-06-partnerships-mergers-or-consolidation-acquisitions-i | §6.06 Partnerships; Mergers or Consolidation; Acquisitions(i) | OTHER / FIXED_DOLLAR / PURPOSE_SPECIFIC | $75,000,000.00 | 75000000 USD | COMPUTED |
| matw-ca-fifth-amendment-s6-06-partnerships-mergers-or-consolidation-acquisitions-ii | §6.06 Partnerships; Mergers or Consolidation; Acquisitions(ii) | OTHER / FIXED_DOLLAR / PURPOSE_SPECIFIC | $200,000,000.00 | 200000000 USD | COMPUTED |
| matw-ca-fifth-amendment-s6-08-dividends-and-distributions | §6.08 Dividends and Distributions | RESTRICTED_PAYMENTS / FIXED_DOLLAR / PURPOSE_SPECIFIC | $10,000,000.00 | 10000000 USD | COMPUTED |
| matw-ca-sixth-amendment-5-03-insurance-10-days | §5.03 Insurance | AFFIRMATIVE / STATED_PERIOD / PURPOSE_SPECIFIC | 10 days | 10 DAYS | COMPUTED |
| matw-ca-sixth-amendment-5-03-insurance-30-consecutive-days | §5.03 Insurance | AFFIRMATIVE / STATED_PERIOD / PURPOSE_SPECIFIC | 30 days | 30 DAYS | COMPUTED |
| matw-ca-sixth-amendment-5-03-insurance-30-days | §5.03 Insurance | AFFIRMATIVE / STATED_PERIOD / PURPOSE_SPECIFIC | 30 days | 30 DAYS | COMPUTED |
| matw-ca-sixth-amendment-5-15-subsidiary-guaranty-agreements-and-security-agre-200-000-000-00 | §5.15 Subsidiary Guaranty Agreements and Security Agreements | AFFIRMATIVE / FIXED_DOLLAR / PURPOSE_SPECIFIC | $200,000,000.00 | 200000000 USD | COMPUTED |
| matw-ca-sixth-amendment-5-15-subsidiary-guaranty-agreements-and-security-agre-50-000-000-00 | §5.15 Subsidiary Guaranty Agreements and Security Agreements | AFFIRMATIVE / FIXED_DOLLAR / PURPOSE_SPECIFIC | $50,000,000.00 | 50000000 USD | COMPUTED |
| matw-ca-sixth-amendment-5-15-subsidiary-guaranty-agreements-and-security-agre-66 | §5.15 Subsidiary Guaranty Agreements and Security Agreements | AFFIRMATIVE / PCT_OF_METRIC / PURPOSE_SPECIFIC | 66% of equity interests of such Foreign Subsidiary and/or Foreign Subsidiary Holding Company owned by the US Borrower or such applicable Loan Party |  | NEEDS_INPUT |
| matw-ca-sixth-amendment-6-02-restrictions-on-non-loan-party-subsidiaries-30-days | §6.02 Restrictions on Non-Loan Party Subsidiaries | OTHER / STATED_PERIOD / PURPOSE_SPECIFIC | 30 days | 30 DAYS | COMPUTED |
| matw-ca-sixth-amendment-7-01-h-clause-h-inserted-10-000-000-00 | §7.01(h) clause (h) inserted | OTHER / FIXED_DOLLAR / PURPOSE_SPECIFIC | $10,000,000.00 | 10000000 USD | COMPUTED |
| matw-ca-sixth-amendment-7-07-collateral-sharing-10-days | §7.07 Collateral Sharing | OTHER / STATED_PERIOD / PURPOSE_SPECIFIC | 10 days | 10 DAYS | COMPUTED |
| matw-ca-sixth-amendment-7-08-notice-of-sale-10-days | §7.08 Notice of Sale | OTHER / STATED_PERIOD / PURPOSE_SPECIFIC | 10 days | 10 DAYS | COMPUTED |
| matw-ca-sixth-amendment-s6-01-liens-a | §6.01 Liens (a) | LIENS / UNLIMITED_BY_PURPOSE / PURPOSE_SPECIFIC |  |  | UNLIMITED_BY_PURPOSE |
| matw-ca-sixth-amendment-s6-01-liens-b | §6.01 Liens (b) | LIENS / UNLIMITED_BY_PURPOSE / PURPOSE_SPECIFIC |  |  | UNLIMITED_BY_PURPOSE |
| matw-ca-sixth-amendment-s6-01-liens-c | §6.01 Liens (c) | LIENS / UNLIMITED_BY_PURPOSE / PURPOSE_SPECIFIC |  |  | UNLIMITED_BY_PURPOSE |
| matw-ca-sixth-amendment-s6-01-liens-d | §6.01 Liens (d) | LIENS / UNLIMITED_BY_PURPOSE / PURPOSE_SPECIFIC |  |  | UNLIMITED_BY_PURPOSE |
| matw-ca-sixth-amendment-s6-01-liens-e | §6.01 Liens (e) | LIENS / UNLIMITED_BY_PURPOSE / PURPOSE_SPECIFIC |  |  | UNLIMITED_BY_PURPOSE |
| matw-ca-sixth-amendment-s6-01-liens-f | §6.01 Liens (f) | LIENS / UNLIMITED_BY_PURPOSE / PURPOSE_SPECIFIC |  |  | UNLIMITED_BY_PURPOSE |
| matw-ca-sixth-amendment-s6-01-liens-g | §6.01 Liens (g) | LIENS / UNLIMITED_BY_PURPOSE / PURPOSE_SPECIFIC |  |  | UNLIMITED_BY_PURPOSE |
| matw-ca-sixth-amendment-s6-01-liens-h | §6.01 Liens (h) | LIENS / UNLIMITED_BY_PURPOSE / PURPOSE_SPECIFIC |  |  | UNLIMITED_BY_PURPOSE |
| matw-ca-sixth-amendment-s6-01-liens-i | §6.01 Liens (i) | LIENS / UNLIMITED_BY_PURPOSE / PURPOSE_SPECIFIC |  |  | UNLIMITED_BY_PURPOSE |
| matw-ca-sixth-amendment-s6-01-liens-k | §6.01 Liens (k) | LIENS / UNLIMITED_BY_PURPOSE / PURPOSE_SPECIFIC |  |  | UNLIMITED_BY_PURPOSE |
| matw-ca-sixth-amendment-s6-01-liens-l | §6.01 Liens (l) | LIENS / UNLIMITED_BY_PURPOSE / PURPOSE_SPECIFIC |  |  | UNLIMITED_BY_PURPOSE |
| matw-ca-sixth-amendment-s6-01-liens-m | §6.01 Liens (m) | LIENS / UNLIMITED_BY_PURPOSE / PURPOSE_SPECIFIC |  |  | UNLIMITED_BY_PURPOSE |
| matw-ca-sixth-amendment-s6-01-liens-n | §6.01 Liens (n) | LIENS / UNLIMITED_BY_PURPOSE / PURPOSE_SPECIFIC |  |  | UNLIMITED_BY_PURPOSE |
| matw-ca-sixth-amendment-s6-01-liens-o | §6.01 Liens (o) | LIENS / UNLIMITED_BY_PURPOSE / PURPOSE_SPECIFIC |  |  | UNLIMITED_BY_PURPOSE |
| matw-ca-sixth-amendment-s6-01-liens-p | §6.01 Liens (p) | LIENS / UNLIMITED_BY_PURPOSE / PURPOSE_SPECIFIC |  |  | UNLIMITED_BY_PURPOSE |
| matw-ca-sixth-amendment-s6-01-liens-q | §6.01 Liens (q) | LIENS / UNLIMITED_BY_PURPOSE / PURPOSE_SPECIFIC |  |  | UNLIMITED_BY_PURPOSE |
| matw-ca-sixth-amendment-s6-04-disposition-of-assets | §6.04 Disposition of Assets | ASSET_SALE / PCT_OF_METRIC / PURPOSE_SPECIFIC | 15% of fair market value of all of the Loan Parties’ assets immediately prior to such sale or disposition |  | NEEDS_INPUT |
| matw-ca-sixth-amendment-s6-07-double-negative-pledge | §6.07 Double Negative Pledge | LIENS / UNLIMITED_BY_PURPOSE / PURPOSE_SPECIFIC |  |  | UNLIMITED_BY_PURPOSE |
| matw-indenture-2024-ex4-1-4-06-reports-and-other-information-10-0 | §4.06 Reports and Other Information | REPORTING / PCT_OF_METRIC / PURPOSE_SPECIFIC | 10.0% of Total Assets of the Company on a consolidated basis | 179.1719 USD_MILLIONS | COMPUTED |
| matw-indenture-2024-ex4-1-4-06-reports-and-other-information-five-business-days | §4.06 Reports and Other Information | REPORTING / STATED_PERIOD / PURPOSE_SPECIFIC | 5 Business Days | 5 BUSINESS_DAYS | COMPUTED |
| matw-indenture-2024-ex4-1-4-06-reports-and-other-information-ten-business-days | §4.06 Reports and Other Information | REPORTING / STATED_PERIOD / PURPOSE_SPECIFIC | 10 Business Days | 10 BUSINESS_DAYS | COMPUTED |
| matw-indenture-2024-ex4-1-4-07-compliance-certificate-120-days | §4.07 Compliance Certificate | REPORTING / STATED_PERIOD / PURPOSE_SPECIFIC | 120 days | 120 DAYS | COMPUTED |
| matw-indenture-2024-ex4-1-4-07-compliance-certificate-30-days | §4.07 Compliance Certificate | REPORTING / STATED_PERIOD / PURPOSE_SPECIFIC | 30 days | 30 DAYS | COMPUTED |
| matw-indenture-2024-ex4-1-4-11-future-guarantors-30-days | §4.11 Future Guarantors | AFFIRMATIVE / STATED_PERIOD / PURPOSE_SPECIFIC | 30 days | 30 DAYS | COMPUTED |
| matw-indenture-2024-ex4-1-4-14-transactions-with-affiliates-15-0-million | §4.14 Transactions with Affiliates | AFFILIATE / FIXED_DOLLAR / PURPOSE_SPECIFIC | $15.0 million | 15000000 USD | COMPUTED |
| matw-indenture-2024-ex4-1-4-14-transactions-with-affiliates-35-0-million | §4.14 Transactions with Affiliates | AFFILIATE / FIXED_DOLLAR / PURPOSE_SPECIFIC | $35.0 million | 35000000 USD | COMPUTED |
| matw-indenture-2024-ex4-1-4-15-offer-to-repurchase-upon-change-of-control-101 | §4.15 Offer to Repurchase Upon Change of Control | CHANGE_OF_CONTROL / PCT_OF_METRIC / PURPOSE_SPECIFIC | 101% of principal amount of the Notes tendered |  | NEEDS_INPUT |
| matw-indenture-2024-ex4-1-4-15-offer-to-repurchase-upon-change-of-control-30-days | §4.15 Offer to Repurchase Upon Change of Control | CHANGE_OF_CONTROL / STATED_PERIOD / PURPOSE_SPECIFIC | 30 days | 30 DAYS | COMPUTED |
| matw-indenture-2024-ex4-1-4-16-limitation-on-asset-sales-30-days | §4.16 Limitation on Asset Sales | ASSET_SALE / STATED_PERIOD / PURPOSE_SPECIFIC | 30 days | 30 DAYS | COMPUTED |
| matw-indenture-2024-ex4-1-4-16-limitation-on-asset-sales-365-days | §4.16 Limitation on Asset Sales | ASSET_SALE / STATED_PERIOD / PURPOSE_SPECIFIC | 365 days | 365 DAYS | COMPUTED |
| matw-indenture-2024-ex4-1-4-21-post-closing-matters-30-days | §4.21 Post-Closing Matters | OTHER / STATED_PERIOD / PURPOSE_SPECIFIC | 30 days | 30 DAYS | COMPUTED |
| matw-indenture-2024-ex4-1-4-21-post-closing-matters-60-days | §4.21 Post-Closing Matters | OTHER / STATED_PERIOD / PURPOSE_SPECIFIC | 60 days | 60 DAYS | COMPUTED |
| matw-indenture-2024-ex4-1-5-01-consolidation-merger-conveyance-transfer-or-leas-consolidated-fixed-charg | §5.01 Consolidation, Merger, Conveyance, Transfer or Lease | MERGER / RATIO_BASED / PURPOSE_SPECIFIC | Consolidated Fixed Charge Coverage Ratio |  | NEEDS_INPUT |
| matw-indenture-2024-ex4-1-6-01-events-of-default-120-days | §6.01 Events of Default | EVENTS_OF_DEFAULT / STATED_PERIOD / PURPOSE_SPECIFIC | 120 days | 120 DAYS | COMPUTED |
| matw-indenture-2024-ex4-1-6-01-events-of-default-30 | §6.01 Events of Default | EVENTS_OF_DEFAULT / STATED_PERCENT / PURPOSE_SPECIFIC | 30% | 30 PERCENT | COMPUTED |
| matw-indenture-2024-ex4-1-6-01-events-of-default-30-0-million | §6.01 Events of Default | EVENTS_OF_DEFAULT / FIXED_DOLLAR / PURPOSE_SPECIFIC | $30.0 million | 30000000 USD | COMPUTED |
| matw-indenture-2024-ex4-1-6-01-events-of-default-30-days | §6.01 Events of Default | EVENTS_OF_DEFAULT / STATED_PERIOD / PURPOSE_SPECIFIC | 30 days | 30 DAYS | COMPUTED |
| matw-indenture-2024-ex4-1-6-01-events-of-default-60-consecutive-days | §6.01 Events of Default | EVENTS_OF_DEFAULT / STATED_PERIOD / PURPOSE_SPECIFIC | 60 days | 60 DAYS | COMPUTED |
| matw-indenture-2024-ex4-1-6-01-events-of-default-60-days | §6.01 Events of Default | EVENTS_OF_DEFAULT / STATED_PERIOD / PURPOSE_SPECIFIC | 60 days | 60 DAYS | COMPUTED |
| matw-indenture-2024-ex4-1-6-01-events-of-default-60-days-2 | §6.01 Events of Default | EVENTS_OF_DEFAULT / STATED_PERIOD / PURPOSE_SPECIFIC | 60 days | 60 DAYS | COMPUTED |
| matw-indenture-2024-ex4-1-6-01-events-of-default-75-0-million | §6.01 Events of Default | EVENTS_OF_DEFAULT / FIXED_DOLLAR / PURPOSE_SPECIFIC | $75.0 million | 75000000 USD | COMPUTED |
| matw-indenture-2024-ex4-1-6-02-acceleration-20-business-days | §6.02 Acceleration | EVENTS_OF_DEFAULT / STATED_PERIOD / PURPOSE_SPECIFIC | 20 Business Days | 20 BUSINESS_DAYS | COMPUTED |
| matw-indenture-2024-ex4-1-6-02-acceleration-30 | §6.02 Acceleration | EVENTS_OF_DEFAULT / STATED_PERCENT / PURPOSE_SPECIFIC | 30% | 30 PERCENT | COMPUTED |
| matw-indenture-2024-ex4-1-6-06-limitation-on-suits-30 | §6.06 Limitation on Suits | EVENTS_OF_DEFAULT / STATED_PERCENT / PURPOSE_SPECIFIC | 30% | 30 PERCENT | COMPUTED |
| matw-indenture-2024-ex4-1-6-06-limitation-on-suits-60-days | §6.06 Limitation on Suits | EVENTS_OF_DEFAULT / STATED_PERIOD / PURPOSE_SPECIFIC | 60 days | 60 DAYS | COMPUTED |
| matw-indenture-2024-ex4-1-6-14-undertaking-for-costs-10 | §6.14 Undertaking for Costs | EVENTS_OF_DEFAULT / STATED_PERCENT / PURPOSE_SPECIFIC | 10% | 10 PERCENT | COMPUTED |
| matw-indenture-2024-ex4-1-asset-sale-1 | Asset Sale (1) | ASSET_SALE / UNLIMITED_BY_PURPOSE / PURPOSE_SPECIFIC |  |  | UNLIMITED_BY_PURPOSE |
| matw-indenture-2024-ex4-1-asset-sale-a | Asset Sale (a) | ASSET_SALE / UNLIMITED_BY_PURPOSE / PURPOSE_SPECIFIC |  |  | UNLIMITED_BY_PURPOSE |
| matw-indenture-2024-ex4-1-asset-sale-b | Asset Sale (b) | ASSET_SALE / GROWER_GREATER_OF / PURPOSE_SPECIFIC | greater of (x) $35.0 million and (y) 2.0% of the Total Assets | 35.83438 USD_MILLIONS | COMPUTED |
| matw-indenture-2024-ex4-1-asset-sale-c | Asset Sale (c) | ASSET_SALE / UNLIMITED_BY_PURPOSE / PURPOSE_SPECIFIC |  |  | UNLIMITED_BY_PURPOSE |
| matw-indenture-2024-ex4-1-asset-sale-d | Asset Sale (d) | ASSET_SALE / UNLIMITED_BY_PURPOSE / PURPOSE_SPECIFIC |  |  | UNLIMITED_BY_PURPOSE |
| matw-indenture-2024-ex4-1-asset-sale-e | Asset Sale (e) | ASSET_SALE / STATED_PERIOD / PURPOSE_SPECIFIC | 180 days | 180 DAYS | COMPUTED |
| matw-indenture-2024-ex4-1-asset-sale-f | Asset Sale (f) | ASSET_SALE / UNLIMITED_BY_PURPOSE / PURPOSE_SPECIFIC |  |  | UNLIMITED_BY_PURPOSE |
| matw-indenture-2024-ex4-1-asset-sale-g | Asset Sale (g) | ASSET_SALE / UNLIMITED_BY_PURPOSE / PURPOSE_SPECIFIC |  |  | UNLIMITED_BY_PURPOSE |
| matw-indenture-2024-ex4-1-asset-sale-h | Asset Sale (h) | ASSET_SALE / UNLIMITED_BY_PURPOSE / PURPOSE_SPECIFIC |  |  | UNLIMITED_BY_PURPOSE |
| matw-indenture-2024-ex4-1-asset-sale-i | Asset Sale (i) | ASSET_SALE / UNLIMITED_BY_PURPOSE / PURPOSE_SPECIFIC |  |  | UNLIMITED_BY_PURPOSE |
| matw-indenture-2024-ex4-1-asset-sale-j | Asset Sale (j) | ASSET_SALE / UNLIMITED_BY_PURPOSE / PURPOSE_SPECIFIC |  |  | UNLIMITED_BY_PURPOSE |
| matw-indenture-2024-ex4-1-asset-sale-k | Asset Sale (k) | ASSET_SALE / UNLIMITED_BY_PURPOSE / PURPOSE_SPECIFIC |  |  | UNLIMITED_BY_PURPOSE |
| matw-indenture-2024-ex4-1-asset-sale-l | Asset Sale (l) | ASSET_SALE / UNLIMITED_BY_PURPOSE / PURPOSE_SPECIFIC |  |  | UNLIMITED_BY_PURPOSE |
| matw-indenture-2024-ex4-1-asset-sale-m | Asset Sale (m) | ASSET_SALE / UNLIMITED_BY_PURPOSE / PURPOSE_SPECIFIC |  |  | UNLIMITED_BY_PURPOSE |
| matw-indenture-2024-ex4-1-asset-sale-n | Asset Sale (n) | ASSET_SALE / UNLIMITED_BY_PURPOSE / PURPOSE_SPECIFIC |  |  | UNLIMITED_BY_PURPOSE |
| matw-indenture-2024-ex4-1-asset-sale-o | Asset Sale (o) | ASSET_SALE / UNLIMITED_BY_PURPOSE / PURPOSE_SPECIFIC |  |  | UNLIMITED_BY_PURPOSE |
| matw-indenture-2024-ex4-1-asset-sale-p | Asset Sale (p) | ASSET_SALE / UNLIMITED_BY_PURPOSE / PURPOSE_SPECIFIC |  |  | UNLIMITED_BY_PURPOSE |
| matw-indenture-2024-ex4-1-asset-sale-q | Asset Sale (q) | ASSET_SALE / UNLIMITED_BY_PURPOSE / PURPOSE_SPECIFIC |  |  | UNLIMITED_BY_PURPOSE |
| matw-indenture-2024-ex4-1-asset-sale-r | Asset Sale (r) | ASSET_SALE / UNLIMITED_BY_PURPOSE / PURPOSE_SPECIFIC |  |  | UNLIMITED_BY_PURPOSE |
| matw-indenture-2024-ex4-1-asset-sale-s | Asset Sale (s) | ASSET_SALE / UNLIMITED_BY_PURPOSE / PURPOSE_SPECIFIC |  |  | UNLIMITED_BY_PURPOSE |
| matw-indenture-2024-ex4-1-asset-sale-t | Asset Sale (t) | ASSET_SALE / UNLIMITED_BY_PURPOSE / PURPOSE_SPECIFIC |  |  | UNLIMITED_BY_PURPOSE |
| matw-indenture-2024-ex4-1-asset-sale-u | Asset Sale (u) | ASSET_SALE / UNLIMITED_BY_PURPOSE / PURPOSE_SPECIFIC |  |  | UNLIMITED_BY_PURPOSE |
| matw-indenture-2024-ex4-1-asset-sale-v | Asset Sale (v) | ASSET_SALE / UNLIMITED_BY_PURPOSE / PURPOSE_SPECIFIC |  |  | UNLIMITED_BY_PURPOSE |
| matw-indenture-2024-ex4-1-asset-sale-w | Asset Sale (w) | ASSET_SALE / UNLIMITED_BY_PURPOSE / PURPOSE_SPECIFIC |  |  | UNLIMITED_BY_PURPOSE |
| matw-indenture-2024-ex4-1-definition-change-of-control-50 | §definition Change of Control | CHANGE_OF_CONTROL / PCT_OF_METRIC / PURPOSE_SPECIFIC | 50% of total voting power of the Voting Stock of the Company or any of its direct or indirect parent entities (or their successors by merger |  | NEEDS_INPUT |
| matw-indenture-2024-ex4-1-permitted-debt-reclassification | Permitted Debt reclassification | DEBT_INCURRENCE / RECLASS / PURPOSE_SPECIFIC |  |  | NEEDS_INPUT |
| matw-indenture-2024-ex4-1-permitted-investment-1 | Permitted Investment (1) | INVESTMENT / UNLIMITED_BY_PURPOSE / PURPOSE_SPECIFIC |  |  | UNLIMITED_BY_PURPOSE |
| matw-indenture-2024-ex4-1-permitted-investment-10 | Permitted Investment (10) | INVESTMENT / UNLIMITED_BY_PURPOSE / PURPOSE_SPECIFIC |  |  | UNLIMITED_BY_PURPOSE |
| matw-indenture-2024-ex4-1-permitted-investment-11 | Permitted Investment (11) | INVESTMENT / UNLIMITED_BY_PURPOSE / PURPOSE_SPECIFIC |  |  | UNLIMITED_BY_PURPOSE |
| matw-indenture-2024-ex4-1-permitted-investment-12 | Permitted Investment (12) | INVESTMENT / UNLIMITED_BY_PURPOSE / PURPOSE_SPECIFIC |  |  | UNLIMITED_BY_PURPOSE |
| matw-indenture-2024-ex4-1-permitted-investment-13 | Permitted Investment (13) | INVESTMENT / UNLIMITED_BY_PURPOSE / PURPOSE_SPECIFIC |  |  | UNLIMITED_BY_PURPOSE |
| matw-indenture-2024-ex4-1-permitted-investment-14 | Permitted Investment (14) | INVESTMENT / GROWER_GREATER_OF / PURPOSE_SPECIFIC | greater of (x) $225.0 million and (y) 12.0% of the Total Assets | 225 USD_MILLIONS | COMPUTED |
| matw-indenture-2024-ex4-1-permitted-investment-15 | Permitted Investment (15) | INVESTMENT / UNLIMITED_BY_PURPOSE / PURPOSE_SPECIFIC |  |  | UNLIMITED_BY_PURPOSE |
| matw-indenture-2024-ex4-1-permitted-investment-16 | Permitted Investment (16) | INVESTMENT / UNLIMITED_BY_PURPOSE / PURPOSE_SPECIFIC |  |  | UNLIMITED_BY_PURPOSE |
| matw-indenture-2024-ex4-1-permitted-investment-17 | Permitted Investment (17) | INVESTMENT / GROWER_GREATER_OF / GENERAL | greater of (x) $125.0 million and (y) 7.0% of the Total Assets | 125.42033 USD_MILLIONS | COMPUTED |
| matw-indenture-2024-ex4-1-permitted-investment-18 | Permitted Investment (18) | INVESTMENT / RATIO_BASED / PURPOSE_SPECIFIC | Net Leverage Ratio exceeded 3.90 to 1.00 |  | NEEDS_INPUT |
| matw-indenture-2024-ex4-1-permitted-investment-19 | Permitted Investment (19) | INVESTMENT / RECLASS / PURPOSE_SPECIFIC |  |  | NEEDS_INPUT |
| matw-indenture-2024-ex4-1-permitted-investment-2 | Permitted Investment (2) | INVESTMENT / UNLIMITED_BY_PURPOSE / PURPOSE_SPECIFIC |  |  | UNLIMITED_BY_PURPOSE |
| matw-indenture-2024-ex4-1-permitted-investment-3 | Permitted Investment (3) | INVESTMENT / UNLIMITED_BY_PURPOSE / PURPOSE_SPECIFIC |  |  | UNLIMITED_BY_PURPOSE |
| matw-indenture-2024-ex4-1-permitted-investment-4 | Permitted Investment (4) | INVESTMENT / UNLIMITED_BY_PURPOSE / PURPOSE_SPECIFIC |  |  | UNLIMITED_BY_PURPOSE |
| matw-indenture-2024-ex4-1-permitted-investment-5 | Permitted Investment (5) | INVESTMENT / UNLIMITED_BY_PURPOSE / PURPOSE_SPECIFIC |  |  | UNLIMITED_BY_PURPOSE |
| matw-indenture-2024-ex4-1-permitted-investment-6 | Permitted Investment (6) | INVESTMENT / GROWER_GREATER_OF / PURPOSE_SPECIFIC | greater of (a) $10.0 million and (b) 0.50% of the Total Assets | 10 USD_MILLIONS | COMPUTED |
| matw-indenture-2024-ex4-1-permitted-investment-7 | Permitted Investment (7) | INVESTMENT / UNLIMITED_BY_PURPOSE / PURPOSE_SPECIFIC |  |  | UNLIMITED_BY_PURPOSE |
| matw-indenture-2024-ex4-1-permitted-investment-8 | Permitted Investment (8) | INVESTMENT / UNLIMITED_BY_PURPOSE / PURPOSE_SPECIFIC |  |  | UNLIMITED_BY_PURPOSE |
| matw-indenture-2024-ex4-1-permitted-investment-9 | Permitted Investment (9) | INVESTMENT / UNLIMITED_BY_PURPOSE / PURPOSE_SPECIFIC |  |  | UNLIMITED_BY_PURPOSE |
| matw-indenture-2024-ex4-1-permitted-liens-1 | Permitted Liens (1) | LIENS / UNLIMITED_BY_PURPOSE / PURPOSE_SPECIFIC |  |  | UNLIMITED_BY_PURPOSE |
| matw-indenture-2024-ex4-1-permitted-liens-10 | Permitted Liens (10) | LIENS / UNLIMITED_BY_PURPOSE / PURPOSE_SPECIFIC |  |  | UNLIMITED_BY_PURPOSE |
| matw-indenture-2024-ex4-1-permitted-liens-11 | Permitted Liens (11) | LIENS / UNLIMITED_BY_PURPOSE / PURPOSE_SPECIFIC |  |  | UNLIMITED_BY_PURPOSE |
| matw-indenture-2024-ex4-1-permitted-liens-12 | Permitted Liens (12) | LIENS / UNLIMITED_BY_PURPOSE / PURPOSE_SPECIFIC |  |  | UNLIMITED_BY_PURPOSE |
| matw-indenture-2024-ex4-1-permitted-liens-13 | Permitted Liens (13) | LIENS / UNLIMITED_BY_PURPOSE / PURPOSE_SPECIFIC |  |  | UNLIMITED_BY_PURPOSE |
| matw-indenture-2024-ex4-1-permitted-liens-14 | Permitted Liens (14) | LIENS / UNLIMITED_BY_PURPOSE / PURPOSE_SPECIFIC |  |  | UNLIMITED_BY_PURPOSE |
| matw-indenture-2024-ex4-1-permitted-liens-15 | Permitted Liens (15) | LIENS / UNLIMITED_BY_PURPOSE / PURPOSE_SPECIFIC |  |  | UNLIMITED_BY_PURPOSE |
| matw-indenture-2024-ex4-1-permitted-liens-16 | Permitted Liens (16) | LIENS / UNLIMITED_BY_PURPOSE / PURPOSE_SPECIFIC |  |  | UNLIMITED_BY_PURPOSE |
| matw-indenture-2024-ex4-1-permitted-liens-17 | Permitted Liens (17) | LIENS / UNLIMITED_BY_PURPOSE / PURPOSE_SPECIFIC |  |  | UNLIMITED_BY_PURPOSE |
| matw-indenture-2024-ex4-1-permitted-liens-18 | Permitted Liens (18) | LIENS / UNLIMITED_BY_PURPOSE / PURPOSE_SPECIFIC |  |  | UNLIMITED_BY_PURPOSE |
| matw-indenture-2024-ex4-1-permitted-liens-19 | Permitted Liens (19) | LIENS / UNLIMITED_BY_PURPOSE / PURPOSE_SPECIFIC |  |  | UNLIMITED_BY_PURPOSE |
| matw-indenture-2024-ex4-1-permitted-liens-2 | Permitted Liens (2) | LIENS / UNLIMITED_BY_PURPOSE / PURPOSE_SPECIFIC |  |  | UNLIMITED_BY_PURPOSE |
| matw-indenture-2024-ex4-1-permitted-liens-20 | Permitted Liens (20) | LIENS / UNLIMITED_BY_PURPOSE / PURPOSE_SPECIFIC |  |  | UNLIMITED_BY_PURPOSE |
| matw-indenture-2024-ex4-1-permitted-liens-21 | Permitted Liens (21) | LIENS / UNLIMITED_BY_PURPOSE / PURPOSE_SPECIFIC |  |  | UNLIMITED_BY_PURPOSE |
| matw-indenture-2024-ex4-1-permitted-liens-22 | Permitted Liens (22) | LIENS / UNLIMITED_BY_PURPOSE / PURPOSE_SPECIFIC |  |  | UNLIMITED_BY_PURPOSE |
| matw-indenture-2024-ex4-1-permitted-liens-23 | Permitted Liens (23) | LIENS / GROWER_GREATER_OF / GENERAL | greater of (a) $100.0 million and (b) 5.5% of the Total Assets | 100 USD_MILLIONS | COMPUTED |
| matw-indenture-2024-ex4-1-permitted-liens-24 | Permitted Liens (24) | LIENS / UNLIMITED_BY_PURPOSE / PURPOSE_SPECIFIC |  |  | UNLIMITED_BY_PURPOSE |
| matw-indenture-2024-ex4-1-permitted-liens-25 | Permitted Liens (25) | LIENS / UNLIMITED_BY_PURPOSE / PURPOSE_SPECIFIC |  |  | UNLIMITED_BY_PURPOSE |
| matw-indenture-2024-ex4-1-permitted-liens-26 | Permitted Liens (26) | LIENS / UNLIMITED_BY_PURPOSE / PURPOSE_SPECIFIC |  |  | UNLIMITED_BY_PURPOSE |
| matw-indenture-2024-ex4-1-permitted-liens-27 | Permitted Liens (27) | LIENS / UNLIMITED_BY_PURPOSE / PURPOSE_SPECIFIC |  |  | UNLIMITED_BY_PURPOSE |
| matw-indenture-2024-ex4-1-permitted-liens-28 | Permitted Liens (28) | LIENS / UNLIMITED_BY_PURPOSE / PURPOSE_SPECIFIC |  |  | UNLIMITED_BY_PURPOSE |
| matw-indenture-2024-ex4-1-permitted-liens-29 | Permitted Liens (29) | LIENS / UNLIMITED_BY_PURPOSE / PURPOSE_SPECIFIC |  |  | UNLIMITED_BY_PURPOSE |
| matw-indenture-2024-ex4-1-permitted-liens-3 | Permitted Liens (3) | LIENS / UNLIMITED_BY_PURPOSE / PURPOSE_SPECIFIC |  |  | UNLIMITED_BY_PURPOSE |
| matw-indenture-2024-ex4-1-permitted-liens-30 | Permitted Liens (30) | LIENS / UNLIMITED_BY_PURPOSE / PURPOSE_SPECIFIC |  |  | UNLIMITED_BY_PURPOSE |
| matw-indenture-2024-ex4-1-permitted-liens-31 | Permitted Liens (31) | LIENS / RATIO_BASED / PURPOSE_SPECIFIC | First Lien Net Leverage Ratio to exceed 2.50 to 1.00 |  | NEEDS_INPUT |
| matw-indenture-2024-ex4-1-permitted-liens-31-a | Permitted Liens (31)(a) | LIENS / RATIO_BASED / PURPOSE_SPECIFIC | Secured Net Leverage Ratio to exceed 3.50 to 1.00 |  | NEEDS_INPUT |
| matw-indenture-2024-ex4-1-permitted-liens-4 | Permitted Liens (4) | LIENS / UNLIMITED_BY_PURPOSE / PURPOSE_SPECIFIC |  |  | UNLIMITED_BY_PURPOSE |
| matw-indenture-2024-ex4-1-permitted-liens-5 | Permitted Liens (5) | LIENS / UNLIMITED_BY_PURPOSE / PURPOSE_SPECIFIC |  |  | UNLIMITED_BY_PURPOSE |
| matw-indenture-2024-ex4-1-permitted-liens-6 | Permitted Liens (6) | LIENS / UNLIMITED_BY_PURPOSE / PURPOSE_SPECIFIC |  |  | UNLIMITED_BY_PURPOSE |
| matw-indenture-2024-ex4-1-permitted-liens-7 | Permitted Liens (7) | LIENS / UNLIMITED_BY_PURPOSE / PURPOSE_SPECIFIC |  |  | UNLIMITED_BY_PURPOSE |
| matw-indenture-2024-ex4-1-permitted-liens-8 | Permitted Liens (8) | LIENS / UNLIMITED_BY_PURPOSE / PURPOSE_SPECIFIC |  |  | UNLIMITED_BY_PURPOSE |
| matw-indenture-2024-ex4-1-permitted-liens-9 | Permitted Liens (9) | LIENS / UNLIMITED_BY_PURPOSE / PURPOSE_SPECIFIC |  |  | UNLIMITED_BY_PURPOSE |
| matw-indenture-2024-ex4-1-s4-08-limitation-on-restricted-payments-1 | §4.08 Limitation on Restricted Payments (1) | RESTRICTED_PAYMENTS / UNLIMITED_BY_PURPOSE / PURPOSE_SPECIFIC |  |  | UNLIMITED_BY_PURPOSE |
| matw-indenture-2024-ex4-1-s4-08-limitation-on-restricted-payments-10 | §4.08 Limitation on Restricted Payments (10) | RESTRICTED_PAYMENTS / GROWER_GREATER_OF / GENERAL | greater of (i) $100 million and (ii) 5.5% of the Total Assets | 100 USD_MILLIONS | COMPUTED |
| matw-indenture-2024-ex4-1-s4-08-limitation-on-restricted-payments-11 | §4.08 Limitation on Restricted Payments (11) | RESTRICTED_PAYMENTS / RATIO_BASED / PURPOSE_SPECIFIC | Net Leverage Ratio exceeded 3.25 to 1.00 |  | NEEDS_INPUT |
| matw-indenture-2024-ex4-1-s4-08-limitation-on-restricted-payments-12 | §4.08 Limitation on Restricted Payments (12) | RESTRICTED_PAYMENTS / RECLASS / PURPOSE_SPECIFIC |  |  | NEEDS_INPUT |
| matw-indenture-2024-ex4-1-s4-08-limitation-on-restricted-payments-2 | §4.08 Limitation on Restricted Payments (2) | RESTRICTED_PAYMENTS / UNLIMITED_BY_PURPOSE / PURPOSE_SPECIFIC |  |  | UNLIMITED_BY_PURPOSE |
| matw-indenture-2024-ex4-1-s4-08-limitation-on-restricted-payments-3 | §4.08 Limitation on Restricted Payments (3) | RESTRICTED_PAYMENTS / UNLIMITED_BY_PURPOSE / PURPOSE_SPECIFIC |  |  | UNLIMITED_BY_PURPOSE |
| matw-indenture-2024-ex4-1-s4-08-limitation-on-restricted-payments-4 | §4.08 Limitation on Restricted Payments (4) | RESTRICTED_PAYMENTS / BUILDER_AVAILABLE_AMOUNT / PURPOSE_SPECIFIC | sum of stated builder components |  | NEEDS_INPUT |
| matw-indenture-2024-ex4-1-s4-08-limitation-on-restricted-payments-5 | §4.08 Limitation on Restricted Payments (5) | RESTRICTED_PAYMENTS / UNLIMITED_BY_PURPOSE / PURPOSE_SPECIFIC |  |  | UNLIMITED_BY_PURPOSE |
| matw-indenture-2024-ex4-1-s4-08-limitation-on-restricted-payments-6 | §4.08 Limitation on Restricted Payments (6) | RESTRICTED_PAYMENTS / UNLIMITED_BY_PURPOSE / PURPOSE_SPECIFIC |  |  | UNLIMITED_BY_PURPOSE |
| matw-indenture-2024-ex4-1-s4-08-limitation-on-restricted-payments-7 | §4.08 Limitation on Restricted Payments (7) | RESTRICTED_PAYMENTS / UNLIMITED_BY_PURPOSE / PURPOSE_SPECIFIC |  |  | UNLIMITED_BY_PURPOSE |
| matw-indenture-2024-ex4-1-s4-08-limitation-on-restricted-payments-8 | §4.08 Limitation on Restricted Payments (8) | RESTRICTED_PAYMENTS / PCT_OF_METRIC / PURPOSE_SPECIFIC | 101% of principal amount of such Subordinated Obligation in the event of a Change of Control pursuant to provisions substantially similar to those described under Section 4 |  | NEEDS_INPUT |
| matw-indenture-2024-ex4-1-s4-08-limitation-on-restricted-payments-9 | §4.08 Limitation on Restricted Payments (9) | RESTRICTED_PAYMENTS / FIXED_DOLLAR / PURPOSE_SPECIFIC | $65.0 million | 65000000 USD | COMPUTED |
| matw-indenture-2024-ex4-1-s4-08-limitation-on-restricted-payments-a | §4.08 Limitation on Restricted Payments (a) | RESTRICTED_PAYMENTS / BUILDER_AVAILABLE_AMOUNT / GENERAL | sum of stated builder components |  | NEEDS_INPUT |
| matw-indenture-2024-ex4-1-s4-08-limitation-on-restricted-payments-b | §4.08 Limitation on Restricted Payments (b) | RESTRICTED_PAYMENTS / UNLIMITED_BY_PURPOSE / PURPOSE_SPECIFIC |  |  | UNLIMITED_BY_PURPOSE |
| matw-indenture-2024-ex4-1-s4-09-limitation-on-incurrence-of-debt-b | §4.09 Limitation on Incurrence of Debt (b) | DEBT_INCURRENCE / UNLIMITED_BY_PURPOSE / PURPOSE_SPECIFIC |  |  | UNLIMITED_BY_PURPOSE |
| matw-indenture-2024-ex4-1-s4-09-limitation-on-incurrence-of-debt-c | §4.09 Limitation on Incurrence of Debt (c) | DEBT_INCURRENCE / RECLASS / PURPOSE_SPECIFIC |  |  | NEEDS_INPUT |
| matw-indenture-2024-ex4-1-s4-09-limitation-on-incurrence-of-debt-d | §4.09 Limitation on Incurrence of Debt (d) | DEBT_INCURRENCE / UNLIMITED_BY_PURPOSE / PURPOSE_SPECIFIC |  |  | UNLIMITED_BY_PURPOSE |
| matw-indenture-2024-ex4-1-s4-09-limitation-on-incurrence-of-debt-e | §4.09 Limitation on Incurrence of Debt (e) | DEBT_INCURRENCE / UNLIMITED_BY_PURPOSE / PURPOSE_SPECIFIC |  |  | UNLIMITED_BY_PURPOSE |
| matw-indenture-2024-ex4-1-s4-09-limitation-on-incurrence-of-debt-f | §4.09 Limitation on Incurrence of Debt (f) | DEBT_INCURRENCE / UNLIMITED_BY_PURPOSE / PURPOSE_SPECIFIC |  |  | UNLIMITED_BY_PURPOSE |
| matw-indenture-2024-ex4-1-s4-09-limitation-on-incurrence-of-debt-g | §4.09 Limitation on Incurrence of Debt (g) | DEBT_INCURRENCE / UNLIMITED_BY_PURPOSE / PURPOSE_SPECIFIC |  |  | UNLIMITED_BY_PURPOSE |
| matw-indenture-2024-ex4-1-s4-09-limitation-on-incurrence-of-debt-h | §4.09 Limitation on Incurrence of Debt (h) | DEBT_INCURRENCE / UNLIMITED_BY_PURPOSE / PURPOSE_SPECIFIC |  |  | UNLIMITED_BY_PURPOSE |
| matw-indenture-2024-ex4-1-s4-09-limitation-on-incurrence-of-debt-i | §4.09 Limitation on Incurrence of Debt (i) | DEBT_INCURRENCE / UNLIMITED_BY_PURPOSE / PURPOSE_SPECIFIC |  |  | UNLIMITED_BY_PURPOSE |
| matw-indenture-2024-ex4-1-s4-10-limitation-on-liens-1 | §4.10 Limitation on Liens (1) | LIENS / RECLASS / PURPOSE_SPECIFIC |  |  | NEEDS_INPUT |
| matw-indenture-2024-ex4-1-s4-12-limitation-on-dividend-and-other-payment-restrictions-affecting-re | §4.12 Limitation on Dividend and Other Payment Restrictions Affecting Restricted Subsidiaries (a) | RESTRICTED_PAYMENTS / UNLIMITED_BY_PURPOSE / PURPOSE_SPECIFIC |  |  | UNLIMITED_BY_PURPOSE |
| matw-indenture-2024-ex4-1-s4-12-limitation-on-dividend-and-other-payment-restrictions-affecting-re-10 | §4.12 Limitation on Dividend and Other Payment Restrictions Affecting Restricted Subsidiaries (8) | RESTRICTED_PAYMENTS / UNLIMITED_BY_PURPOSE / PURPOSE_SPECIFIC |  |  | UNLIMITED_BY_PURPOSE |
| matw-indenture-2024-ex4-1-s4-12-limitation-on-dividend-and-other-payment-restrictions-affecting-re-11 | §4.12 Limitation on Dividend and Other Payment Restrictions Affecting Restricted Subsidiaries (9) | RESTRICTED_PAYMENTS / UNLIMITED_BY_PURPOSE / PURPOSE_SPECIFIC |  |  | UNLIMITED_BY_PURPOSE |
| matw-indenture-2024-ex4-1-s4-12-limitation-on-dividend-and-other-payment-restrictions-affecting-re-12 | §4.12 Limitation on Dividend and Other Payment Restrictions Affecting Restricted Subsidiaries (10) | RESTRICTED_PAYMENTS / UNLIMITED_BY_PURPOSE / PURPOSE_SPECIFIC |  |  | UNLIMITED_BY_PURPOSE |
| matw-indenture-2024-ex4-1-s4-12-limitation-on-dividend-and-other-payment-restrictions-affecting-re-13 | §4.12 Limitation on Dividend and Other Payment Restrictions Affecting Restricted Subsidiaries (11) | RESTRICTED_PAYMENTS / UNLIMITED_BY_PURPOSE / PURPOSE_SPECIFIC |  |  | UNLIMITED_BY_PURPOSE |
| matw-indenture-2024-ex4-1-s4-12-limitation-on-dividend-and-other-payment-restrictions-affecting-re-14 | §4.12 Limitation on Dividend and Other Payment Restrictions Affecting Restricted Subsidiaries (12) | RESTRICTED_PAYMENTS / UNLIMITED_BY_PURPOSE / PURPOSE_SPECIFIC |  |  | UNLIMITED_BY_PURPOSE |
| matw-indenture-2024-ex4-1-s4-12-limitation-on-dividend-and-other-payment-restrictions-affecting-re-15 | §4.12 Limitation on Dividend and Other Payment Restrictions Affecting Restricted Subsidiaries (13) | RESTRICTED_PAYMENTS / UNLIMITED_BY_PURPOSE / PURPOSE_SPECIFIC |  |  | UNLIMITED_BY_PURPOSE |
| matw-indenture-2024-ex4-1-s4-12-limitation-on-dividend-and-other-payment-restrictions-affecting-re-16 | §4.12 Limitation on Dividend and Other Payment Restrictions Affecting Restricted Subsidiaries (14) | RESTRICTED_PAYMENTS / UNLIMITED_BY_PURPOSE / PURPOSE_SPECIFIC |  |  | UNLIMITED_BY_PURPOSE |
| matw-indenture-2024-ex4-1-s4-12-limitation-on-dividend-and-other-payment-restrictions-affecting-re-17 | §4.12 Limitation on Dividend and Other Payment Restrictions Affecting Restricted Subsidiaries (15) | RESTRICTED_PAYMENTS / UNLIMITED_BY_PURPOSE / PURPOSE_SPECIFIC |  |  | UNLIMITED_BY_PURPOSE |
| matw-indenture-2024-ex4-1-s4-12-limitation-on-dividend-and-other-payment-restrictions-affecting-re-18 | §4.12 Limitation on Dividend and Other Payment Restrictions Affecting Restricted Subsidiaries (16) | RESTRICTED_PAYMENTS / UNLIMITED_BY_PURPOSE / PURPOSE_SPECIFIC |  |  | UNLIMITED_BY_PURPOSE |
| matw-indenture-2024-ex4-1-s4-12-limitation-on-dividend-and-other-payment-restrictions-affecting-re-19 | §4.12 Limitation on Dividend and Other Payment Restrictions Affecting Restricted Subsidiaries (17) | RESTRICTED_PAYMENTS / UNLIMITED_BY_PURPOSE / PURPOSE_SPECIFIC |  |  | UNLIMITED_BY_PURPOSE |
| matw-indenture-2024-ex4-1-s4-12-limitation-on-dividend-and-other-payment-restrictions-affecting-re-2 | §4.12 Limitation on Dividend and Other Payment Restrictions Affecting Restricted Subsidiaries (b) | RESTRICTED_PAYMENTS / UNLIMITED_BY_PURPOSE / PURPOSE_SPECIFIC |  |  | UNLIMITED_BY_PURPOSE |
| matw-indenture-2024-ex4-1-s4-12-limitation-on-dividend-and-other-payment-restrictions-affecting-re-3 | §4.12 Limitation on Dividend and Other Payment Restrictions Affecting Restricted Subsidiaries (1) | RESTRICTED_PAYMENTS / UNLIMITED_BY_PURPOSE / PURPOSE_SPECIFIC |  |  | UNLIMITED_BY_PURPOSE |
| matw-indenture-2024-ex4-1-s4-12-limitation-on-dividend-and-other-payment-restrictions-affecting-re-4 | §4.12 Limitation on Dividend and Other Payment Restrictions Affecting Restricted Subsidiaries (2) | RESTRICTED_PAYMENTS / UNLIMITED_BY_PURPOSE / PURPOSE_SPECIFIC |  |  | UNLIMITED_BY_PURPOSE |
| matw-indenture-2024-ex4-1-s4-12-limitation-on-dividend-and-other-payment-restrictions-affecting-re-5 | §4.12 Limitation on Dividend and Other Payment Restrictions Affecting Restricted Subsidiaries (3) | RESTRICTED_PAYMENTS / UNLIMITED_BY_PURPOSE / PURPOSE_SPECIFIC |  |  | UNLIMITED_BY_PURPOSE |
| matw-indenture-2024-ex4-1-s4-12-limitation-on-dividend-and-other-payment-restrictions-affecting-re-6 | §4.12 Limitation on Dividend and Other Payment Restrictions Affecting Restricted Subsidiaries (4) | RESTRICTED_PAYMENTS / UNLIMITED_BY_PURPOSE / PURPOSE_SPECIFIC |  |  | UNLIMITED_BY_PURPOSE |
| matw-indenture-2024-ex4-1-s4-12-limitation-on-dividend-and-other-payment-restrictions-affecting-re-7 | §4.12 Limitation on Dividend and Other Payment Restrictions Affecting Restricted Subsidiaries (5) | RESTRICTED_PAYMENTS / UNLIMITED_BY_PURPOSE / PURPOSE_SPECIFIC |  |  | UNLIMITED_BY_PURPOSE |
| matw-indenture-2024-ex4-1-s4-12-limitation-on-dividend-and-other-payment-restrictions-affecting-re-8 | §4.12 Limitation on Dividend and Other Payment Restrictions Affecting Restricted Subsidiaries (6) | RESTRICTED_PAYMENTS / UNLIMITED_BY_PURPOSE / PURPOSE_SPECIFIC |  |  | UNLIMITED_BY_PURPOSE |
| matw-indenture-2024-ex4-1-s4-12-limitation-on-dividend-and-other-payment-restrictions-affecting-re-9 | §4.12 Limitation on Dividend and Other Payment Restrictions Affecting Restricted Subsidiaries (7) | RESTRICTED_PAYMENTS / UNLIMITED_BY_PURPOSE / PURPOSE_SPECIFIC |  |  | UNLIMITED_BY_PURPOSE |
| matw-indenture-2024-ex4-1-s4-13-limitation-on-creation-of-unrestricted-subsidiaries-a | §4.13 Limitation on Creation of Unrestricted Subsidiaries (a) | OTHER / GROWER_GREATER_OF / PURPOSE_SPECIFIC | greater of fixed dollar and percent of metric |  | NEEDS_INPUT |
| matw-indenture-2024-ex4-1-s4-13-limitation-on-creation-of-unrestricted-subsidiaries-b | §4.13 Limitation on Creation of Unrestricted Subsidiaries (b) | OTHER / UNLIMITED_BY_PURPOSE / PURPOSE_SPECIFIC |  |  | UNLIMITED_BY_PURPOSE |
| matw-indenture-2024-ex4-1-s4-13-limitation-on-creation-of-unrestricted-subsidiaries-c | §4.13 Limitation on Creation of Unrestricted Subsidiaries (c) | OTHER / UNLIMITED_BY_PURPOSE / PURPOSE_SPECIFIC |  |  | UNLIMITED_BY_PURPOSE |
| matw-indenture-2024-ex4-1-s4-13-limitation-on-creation-of-unrestricted-subsidiaries-d | §4.13 Limitation on Creation of Unrestricted Subsidiaries (d) | OTHER / UNLIMITED_BY_PURPOSE / PURPOSE_SPECIFIC |  |  | UNLIMITED_BY_PURPOSE |
| matw-indenture-2024-ex4-1-s4-13-limitation-on-creation-of-unrestricted-subsidiaries-e | §4.13 Limitation on Creation of Unrestricted Subsidiaries (e) | OTHER / UNLIMITED_BY_PURPOSE / PURPOSE_SPECIFIC |  |  | UNLIMITED_BY_PURPOSE |
| matw-indenture-2024-ex4-1-s4-16-limitation-on-asset-sales-1 | §4.16 Limitation on Asset Sales (1) | ASSET_SALE / PCT_OF_METRIC / PURPOSE_SPECIFIC | 100% of principal amount thereof) or by making an Offer (in accordance with the procedures set forth below for an Offer to Purchase) to all Holders of the Notes to purchase some or all of |  | NEEDS_INPUT |
| matw-indenture-2024-ex4-1-s4-16-limitation-on-asset-sales-2 | §4.16 Limitation on Asset Sales (2) | ASSET_SALE / FIXED_DOLLAR / PURPOSE_SPECIFIC | $75.0 million | 75000000 USD | COMPUTED |
| matw-indenture-2024-ex4-1-s4-16-limitation-on-asset-sales-2-2 | §4.16 Limitation on Asset Sales (2) | ASSET_SALE / FIXED_DOLLAR / PURPOSE_SPECIFIC | $75.0 million | 75000000 USD | COMPUTED |
| matw-indenture-2024-ex4-1-s4-16-limitation-on-asset-sales-a | §4.16 Limitation on Asset Sales (a) | ASSET_SALE / PCT_OF_METRIC / PURPOSE_SPECIFIC | 75% of consideration received in the Asset Sale by the Company or such Restricted Subsidiary |  | NEEDS_INPUT |
| matw-indenture-2024-ex4-1-s4-16-limitation-on-asset-sales-a-2 | §4.16 Limitation on Asset Sales (a) | ASSET_SALE / GROWER_GREATER_OF / PURPOSE_SPECIFIC | greater of (x) $190.0 million and (y) 10.0% of the Total Assets | 190 USD_MILLIONS | COMPUTED |
| matw-indenture-2024-ex4-1-s4-16-limitation-on-asset-sales-b | §4.16 Limitation on Asset Sales (b) | ASSET_SALE / UNLIMITED_BY_PURPOSE / PURPOSE_SPECIFIC |  |  | UNLIMITED_BY_PURPOSE |
| matw-pd-10 | Permitted Debt (10) | DEBT_INCURRENCE / UNLIMITED_BY_PURPOSE / PURPOSE_SPECIFIC |  |  | UNLIMITED_BY_PURPOSE |
| matw-pd-11 | Permitted Debt (11) | DEBT_INCURRENCE / UNLIMITED_BY_PURPOSE / PURPOSE_SPECIFIC |  |  | UNLIMITED_BY_PURPOSE |
| matw-pd-12 | Permitted Debt (12) | DEBT_INCURRENCE / UNLIMITED_BY_PURPOSE / PURPOSE_SPECIFIC |  |  | UNLIMITED_BY_PURPOSE |
| matw-pd-13 | Permitted Debt (13) | DEBT_INCURRENCE / GROWER_GREATER_OF / PURPOSE_SPECIFIC | greater of (a) $100.0 million and (b) 5.5% of the Total Assets | 100 USD_MILLIONS | COMPUTED |
| matw-pd-14 | Permitted Debt (14) | DEBT_INCURRENCE / UNLIMITED_BY_PURPOSE / PURPOSE_SPECIFIC |  |  | UNLIMITED_BY_PURPOSE |
| matw-pd-15 | Permitted Debt (15) | DEBT_INCURRENCE / RATIO_BASED / PURPOSE_SPECIFIC | Consolidated Fixed Charge Coverage Ratio |  | NEEDS_INPUT |
| matw-pd-16 | Permitted Debt (16) | DEBT_INCURRENCE / GROWER_GREATER_OF / GENERAL | greater of (a) $125.0 million and (b) 7.0% of the Total Assets | 125.42033 USD_MILLIONS | COMPUTED |
| matw-pd-17 | Permitted Debt (17) | DEBT_INCURRENCE / UNLIMITED_BY_PURPOSE / PURPOSE_SPECIFIC |  |  | UNLIMITED_BY_PURPOSE |
| matw-pd-18 | Permitted Debt (18) | DEBT_INCURRENCE / UNLIMITED_BY_PURPOSE / PURPOSE_SPECIFIC |  |  | UNLIMITED_BY_PURPOSE |
| matw-pd-19 | Permitted Debt (19) | DEBT_INCURRENCE / UNLIMITED_BY_PURPOSE / PURPOSE_SPECIFIC |  |  | UNLIMITED_BY_PURPOSE |
| matw-pd-1a | Permitted Debt (1)(a) | DEBT_INCURRENCE / FIXED_DOLLAR / PURPOSE_SPECIFIC | $1,300.0 million | 1300000000 USD | COMPUTED |
| matw-pd-1bx | Permitted Debt (1)(b)(x) | DEBT_INCURRENCE / RATIO_BASED / PURPOSE_SPECIFIC | Secured Net Leverage Ratio to exceed 3.50 to 1.00 |  | NEEDS_INPUT |
| matw-pd-1by | Permitted Debt (1)(b)(y) | DEBT_INCURRENCE / RATIO_BASED / PURPOSE_SPECIFIC | First Lien Net Leverage Ratio to exceed 2.50 to 1.00 |  | NEEDS_INPUT |
| matw-pd-2 | Permitted Debt (2) | DEBT_INCURRENCE / UNLIMITED_BY_PURPOSE / PURPOSE_SPECIFIC |  |  | UNLIMITED_BY_PURPOSE |
| matw-pd-20 | Permitted Debt (20) | DEBT_INCURRENCE / UNLIMITED_BY_PURPOSE / PURPOSE_SPECIFIC |  |  | UNLIMITED_BY_PURPOSE |
| matw-pd-21 | Permitted Debt (21) | DEBT_INCURRENCE / UNLIMITED_BY_PURPOSE / PURPOSE_SPECIFIC |  |  | UNLIMITED_BY_PURPOSE |
| matw-pd-22 | Permitted Debt (22) | DEBT_INCURRENCE / UNLIMITED_BY_PURPOSE / PURPOSE_SPECIFIC |  |  | UNLIMITED_BY_PURPOSE |
| matw-pd-3 | Permitted Debt (3) | DEBT_INCURRENCE / UNLIMITED_BY_PURPOSE / PURPOSE_SPECIFIC |  |  | UNLIMITED_BY_PURPOSE |
| matw-pd-4 | Permitted Debt (4) | DEBT_INCURRENCE / UNLIMITED_BY_PURPOSE / PURPOSE_SPECIFIC |  |  | UNLIMITED_BY_PURPOSE |
| matw-pd-5 | Permitted Debt (5) | DEBT_INCURRENCE / UNLIMITED_BY_PURPOSE / PURPOSE_SPECIFIC |  |  | UNLIMITED_BY_PURPOSE |
| matw-pd-6 | Permitted Debt (6) | DEBT_INCURRENCE / UNLIMITED_BY_PURPOSE / PURPOSE_SPECIFIC |  |  | UNLIMITED_BY_PURPOSE |
| matw-pd-7 | Permitted Debt (7) | DEBT_INCURRENCE / UNLIMITED_BY_PURPOSE / PURPOSE_SPECIFIC |  |  | UNLIMITED_BY_PURPOSE |
| matw-pd-8 | Permitted Debt (8) | DEBT_INCURRENCE / UNLIMITED_BY_PURPOSE / PURPOSE_SPECIFIC |  |  | UNLIMITED_BY_PURPOSE |
| matw-pd-9 | Permitted Debt (9) | DEBT_INCURRENCE / GROWER_GREATER_OF / PURPOSE_SPECIFIC | greater of (a) $125.0 million and (b) 7.0% of the Total Assets | 125.42033 USD_MILLIONS | COMPUTED |

## chwy-2026-credit-agreement

| basket | section | type | cap formula | computed value | status |
| --- | --- | --- | --- | --- | --- |
| chwy-2026-credit-agreement-5-01-financial-statements-and-other-information-10 | §5.01 Financial Statements and Other Information | REPORTING / PCT_OF_METRIC / PURPOSE_SPECIFIC | 10% of Consolidated EBITDA for the most recently ended Test Period or with the consent of the Administrative Agent (such consent not to be unreasonably withheld |  | NEEDS_INPUT |
| chwy-2026-credit-agreement-5-01-financial-statements-and-other-information-150-days | §5.01 Financial Statements and Other Information | REPORTING / STATED_PERIOD / PURPOSE_SPECIFIC | 150 days | 150 DAYS | COMPUTED |
| chwy-2026-credit-agreement-5-01-financial-statements-and-other-information-5-business-days | §5.01 Financial Statements and Other Information | REPORTING / STATED_PERIOD / PURPOSE_SPECIFIC | 5 Business Days | 5 BUSINESS_DAYS | COMPUTED |
| chwy-2026-credit-agreement-5-01-financial-statements-and-other-information-75-days | §5.01 Financial Statements and Other Information | REPORTING / STATED_PERIOD / PURPOSE_SPECIFIC | 75 days | 75 DAYS | COMPUTED |
| chwy-2026-credit-agreement-5-03-information-regarding-collateral-5-days | §5.03 Information Regarding Collateral | REPORTING / STATED_PERIOD / PURPOSE_SPECIFIC | 5 days | 5 DAYS | COMPUTED |
| chwy-2026-credit-agreement-5-03-information-regarding-collateral-60-days | §5.03 Information Regarding Collateral | REPORTING / STATED_PERIOD / PURPOSE_SPECIFIC | 60 days | 60 DAYS | COMPUTED |
| chwy-2026-credit-agreement-5-07-insurance-90-days | §5.07 Insurance | AFFIRMATIVE / STATED_PERIOD / PURPOSE_SPECIFIC | 90 days | 90 DAYS | COMPUTED |
| chwy-2026-credit-agreement-5-11-additional-subsidiaries-90-days | §5.11 Additional Subsidiaries | OTHER / STATED_PERIOD / PURPOSE_SPECIFIC | 90 days | 90 DAYS | COMPUTED |
| chwy-2026-credit-agreement-5-18-limitation-on-transactions-with-affiliates-144-0-million | §5.18 Limitation on Transactions with Affiliates | AFFILIATE / GROWER_GREATER_OF / PURPOSE_SPECIFIC | greater of (x) $144.0 million and (y) 20% of Consolidated EBITDA |  | NEEDS_INPUT |
| chwy-2026-credit-agreement-5-18-limitation-on-transactions-with-affiliates-20 | §5.18 Limitation on Transactions with Affiliates | AFFILIATE / PCT_OF_METRIC / PURPOSE_SPECIFIC | 20% of Consolidated EBITDA for the most recently ended Test Period |  | NEEDS_INPUT |
| chwy-2026-credit-agreement-6-01-limitation-on-incurrence-of-indebtedness-and-iss-100 | §6.01 Limitation on Incurrence of Indebtedness and Issuance of Disqualified Stock and Preferred Stoc k | DEBT_INCURRENCE / PCT_OF_METRIC / PURPOSE_SPECIFIC | 100% of Consolidated EBITDA for the most recently ended Test Period |  | NEEDS_INPUT |
| chwy-2026-credit-agreement-6-01-limitation-on-incurrence-of-indebtedness-and-iss-100-0 | §6.01 Limitation on Incurrence of Indebtedness and Issuance of Disqualified Stock and Preferred Stoc k | DEBT_INCURRENCE / PCT_OF_METRIC / PURPOSE_SPECIFIC | 100.0% of Consolidated EBITDA for the most recently ended Test Period |  | NEEDS_INPUT |
| chwy-2026-credit-agreement-6-01-limitation-on-incurrence-of-indebtedness-and-iss-100-2 | §6.01 Limitation on Incurrence of Indebtedness and Issuance of Disqualified Stock and Preferred Stoc k | DEBT_INCURRENCE / PCT_OF_METRIC / PURPOSE_SPECIFIC | 100% of Consolidated EBITDA for the most recently ended Test Period |  | NEEDS_INPUT |
| chwy-2026-credit-agreement-6-01-limitation-on-incurrence-of-indebtedness-and-iss-100-3 | §6.01 Limitation on Incurrence of Indebtedness and Issuance of Disqualified Stock and Preferred Stoc k | DEBT_INCURRENCE / PCT_OF_METRIC / PURPOSE_SPECIFIC | 100% of Consolidated EBITDA for the most recently ended Test Period |  | NEEDS_INPUT |
| chwy-2026-credit-agreement-6-01-limitation-on-incurrence-of-indebtedness-and-iss-200 | §6.01 Limitation on Incurrence of Indebtedness and Issuance of Disqualified Stock and Preferred Stoc k | DEBT_INCURRENCE / PCT_OF_METRIC / PURPOSE_SPECIFIC | 200% of gross unutilized cash and Cash Equivalents and other in-kind equity contributions received by any Restricted Party on or following the Effective Date from the i |  | NEEDS_INPUT |
| chwy-2026-credit-agreement-6-01-limitation-on-incurrence-of-indebtedness-and-iss-30-days | §6.01 Limitation on Incurrence of Indebtedness and Issuance of Disqualified Stock and Preferred Stoc k | DEBT_INCURRENCE / STATED_PERIOD / PURPOSE_SPECIFIC | 30 days | 30 DAYS | COMPUTED |
| chwy-2026-credit-agreement-6-01-limitation-on-incurrence-of-indebtedness-and-iss-360-0-million | §6.01 Limitation on Incurrence of Indebtedness and Issuance of Disqualified Stock and Preferred Stoc k | DEBT_INCURRENCE / GROWER_GREATER_OF / PURPOSE_SPECIFIC | greater of (x) $360.0 million and (y) 50% of Consolidated EBITDA |  | NEEDS_INPUT |
| chwy-2026-credit-agreement-6-01-limitation-on-incurrence-of-indebtedness-and-iss-5-business-days | §6.01 Limitation on Incurrence of Indebtedness and Issuance of Disqualified Stock and Preferred Stoc k | DEBT_INCURRENCE / STATED_PERIOD / PURPOSE_SPECIFIC | 5 Business Days | 5 BUSINESS_DAYS | COMPUTED |
| chwy-2026-credit-agreement-6-01-limitation-on-incurrence-of-indebtedness-and-iss-50 | §6.01 Limitation on Incurrence of Indebtedness and Issuance of Disqualified Stock and Preferred Stoc k | DEBT_INCURRENCE / PCT_OF_METRIC / PURPOSE_SPECIFIC | 50% of Consolidated EBITDA for the most recently ended Test Period |  | NEEDS_INPUT |
| chwy-2026-credit-agreement-6-01-limitation-on-incurrence-of-indebtedness-and-iss-720-0-million | §6.01 Limitation on Incurrence of Indebtedness and Issuance of Disqualified Stock and Preferred Stoc k | DEBT_INCURRENCE / GROWER_GREATER_OF / PURPOSE_SPECIFIC | greater of (x) $720.0 million and (y) 100% of Consolidated EBITDA |  | NEEDS_INPUT |
| chwy-2026-credit-agreement-6-01-limitation-on-incurrence-of-indebtedness-and-iss-720-0-million-2 | §6.01 Limitation on Incurrence of Indebtedness and Issuance of Disqualified Stock and Preferred Stoc k | DEBT_INCURRENCE / GROWER_GREATER_OF / PURPOSE_SPECIFIC | greater of fixed dollar and percent of metric |  | NEEDS_INPUT |
| chwy-2026-credit-agreement-6-01-limitation-on-incurrence-of-indebtedness-and-iss-720-0-million-3 | §6.01 Limitation on Incurrence of Indebtedness and Issuance of Disqualified Stock and Preferred Stoc k | DEBT_INCURRENCE / GROWER_GREATER_OF / PURPOSE_SPECIFIC | greater of (x) $720.0 million and (y) 100.0% of Consolidated EBITDA |  | NEEDS_INPUT |
| chwy-2026-credit-agreement-6-01-limitation-on-incurrence-of-indebtedness-and-iss-91-days | §6.01 Limitation on Incurrence of Indebtedness and Issuance of Disqualified Stock and Preferred Stoc k | DEBT_INCURRENCE / STATED_PERIOD / PURPOSE_SPECIFIC | 91 days | 91 DAYS | COMPUTED |
| chwy-2026-credit-agreement-6-01-limitation-on-incurrence-of-indebtedness-and-iss-first-lien-leverage-rati | §6.01 Limitation on Incurrence of Indebtedness and Issuance of Disqualified Stock and Preferred Stoc k | DEBT_INCURRENCE / RATIO_BASED / PURPOSE_SPECIFIC | First Lien Leverage Ratio |  | NEEDS_INPUT |
| chwy-2026-credit-agreement-6-01-limitation-on-incurrence-of-indebtedness-and-iss-interest-coverage-ratio | §6.01 Limitation on Incurrence of Indebtedness and Issuance of Disqualified Stock and Preferred Stoc k | DEBT_INCURRENCE / RATIO_BASED / PURPOSE_SPECIFIC | Interest Coverage Ratio |  | NEEDS_INPUT |
| chwy-2026-credit-agreement-6-05-limitation-on-asset-sales-120-days | §6.05 Limitation on Asset Sales | ASSET_SALE / STATED_PERIOD / PURPOSE_SPECIFIC | 120 days | 120 DAYS | COMPUTED |
| chwy-2026-credit-agreement-6-05-limitation-on-asset-sales-144-0-million | §6.05 Limitation on Asset Sales | ASSET_SALE / GROWER_GREATER_OF / PURPOSE_SPECIFIC | greater of (x) $144.0 million and (y) 20% of Consolidated EBITDA |  | NEEDS_INPUT |
| chwy-2026-credit-agreement-6-05-limitation-on-asset-sales-180-days | §6.05 Limitation on Asset Sales | ASSET_SALE / STATED_PERIOD / PURPOSE_SPECIFIC | 180 days | 180 DAYS | COMPUTED |
| chwy-2026-credit-agreement-6-05-limitation-on-asset-sales-20 | §6.05 Limitation on Asset Sales | ASSET_SALE / PCT_OF_METRIC / PURPOSE_SPECIFIC | 20% of Consolidated EBITDA for the most recently ended Test Period at the time of contractually agreeing to such Asset Sale |  | NEEDS_INPUT |
| chwy-2026-credit-agreement-6-05-limitation-on-asset-sales-216-0-million | §6.05 Limitation on Asset Sales | ASSET_SALE / GROWER_GREATER_OF / PURPOSE_SPECIFIC | greater of (x) $216.0 million and (y) 30% of Consolidated EBITDA |  | NEEDS_INPUT |
| chwy-2026-credit-agreement-6-05-limitation-on-asset-sales-24-months | §6.05 Limitation on Asset Sales | ASSET_SALE / STATED_PERIOD / PURPOSE_SPECIFIC | 24 months | 24 MONTHS | COMPUTED |
| chwy-2026-credit-agreement-6-05-limitation-on-asset-sales-24-months-2 | §6.05 Limitation on Asset Sales | ASSET_SALE / STATED_PERIOD / PURPOSE_SPECIFIC | 24 months | 24 MONTHS | COMPUTED |
| chwy-2026-credit-agreement-6-05-limitation-on-asset-sales-30 | §6.05 Limitation on Asset Sales | ASSET_SALE / PCT_OF_METRIC / PURPOSE_SPECIFIC | 30% of Consolidated EBITDA for the most recently ended Test Period at the time of contractually agreeing to such Asset Sale |  | NEEDS_INPUT |
| chwy-2026-credit-agreement-6-05-limitation-on-asset-sales-360-0-million | §6.05 Limitation on Asset Sales | ASSET_SALE / GROWER_GREATER_OF / PURPOSE_SPECIFIC | greater of (x) $360.0 million and (y) 50% of Consolidated EBITDA |  | NEEDS_INPUT |
| chwy-2026-credit-agreement-6-05-limitation-on-asset-sales-50 | §6.05 Limitation on Asset Sales | ASSET_SALE / PCT_OF_METRIC / PURPOSE_SPECIFIC | 50% of Consolidated EBITDA for the most recently ended Test Period |  | NEEDS_INPUT |
| chwy-2026-credit-agreement-6-08-limitation-on-restricted-payments-100 | §6.08 Limitation on Restricted Payments | RESTRICTED_PAYMENTS / PCT_OF_METRIC / PURPOSE_SPECIFIC | 100% of Retained Excess Cash Flow (which amount shall be deemed to be zero for any fiscal quarter in which such amount for such fiscal quarter is less than zero) and (z |  | NEEDS_INPUT |
| chwy-2026-credit-agreement-6-08-limitation-on-restricted-payments-100-2 | §6.08 Limitation on Restricted Payments | RESTRICTED_PAYMENTS / PCT_OF_METRIC / PURPOSE_SPECIFIC | 100% of aggregate net cash proceeds |  | NEEDS_INPUT |
| chwy-2026-credit-agreement-6-08-limitation-on-restricted-payments-100-3 | §6.08 Limitation on Restricted Payments | RESTRICTED_PAYMENTS / PCT_OF_METRIC / PURPOSE_SPECIFIC | 100% of aggregate amount of cash |  | NEEDS_INPUT |
| chwy-2026-credit-agreement-6-08-limitation-on-restricted-payments-100-4 | §6.08 Limitation on Restricted Payments | RESTRICTED_PAYMENTS / PCT_OF_METRIC / PURPOSE_SPECIFIC | 100% of aggregate amount received in cash |  | NEEDS_INPUT |
| chwy-2026-credit-agreement-6-08-limitation-on-restricted-payments-100-5 | §6.08 Limitation on Restricted Payments | RESTRICTED_PAYMENTS / PCT_OF_METRIC / PURPOSE_SPECIFIC | 100% of aggregate amount received in cash |  | NEEDS_INPUT |
| chwy-2026-credit-agreement-6-08-limitation-on-restricted-payments-100-6 | §6.08 Limitation on Restricted Payments | RESTRICTED_PAYMENTS / PCT_OF_METRIC / PURPOSE_SPECIFIC | 100% of Consolidated EBITDA for the most recently ended Test Period |  | NEEDS_INPUT |
| chwy-2026-credit-agreement-6-08-limitation-on-restricted-payments-100-7 | §6.08 Limitation on Restricted Payments | RESTRICTED_PAYMENTS / PCT_OF_METRIC / PURPOSE_SPECIFIC | 100% of Consolidated EBITDA of the Initial Borrower for the most recently ended Test Period |  | NEEDS_INPUT |
| chwy-2026-credit-agreement-6-08-limitation-on-restricted-payments-140 | §6.08 Limitation on Restricted Payments | RESTRICTED_PAYMENTS / PCT_OF_METRIC / PURPOSE_SPECIFIC | 140% of cumulative Consolidated Interest Expense for such applicable fiscal quarter (which amount shall be deemed to be zero for any fiscal quarter in which such amount |  | NEEDS_INPUT |
| chwy-2026-credit-agreement-6-08-limitation-on-restricted-payments-252-0-million | §6.08 Limitation on Restricted Payments | RESTRICTED_PAYMENTS / GROWER_GREATER_OF / PURPOSE_SPECIFIC | greater of (x) $252.0 million and (y) 35% of Consolidated EBITDA |  | NEEDS_INPUT |
| chwy-2026-credit-agreement-6-08-limitation-on-restricted-payments-35 | §6.08 Limitation on Restricted Payments | RESTRICTED_PAYMENTS / PCT_OF_METRIC / PURPOSE_SPECIFIC | 35% of Consolidated EBITDA for the most recently ended Test Period |  | NEEDS_INPUT |
| chwy-2026-credit-agreement-6-08-limitation-on-restricted-payments-50 | §6.08 Limitation on Restricted Payments | RESTRICTED_PAYMENTS / PCT_OF_METRIC / PURPOSE_SPECIFIC | 50% of Consolidated Net Income of the Restricted Parties (including any predecessor of the Borrowers) for the period (taken |  | NEEDS_INPUT |
| chwy-2026-credit-agreement-6-08-limitation-on-restricted-payments-504-0-million | §6.08 Limitation on Restricted Payments | RESTRICTED_PAYMENTS / GROWER_GREATER_OF / PURPOSE_SPECIFIC | greater of (x) $504.0 million and (y) 70.0% of Consolidated EBITDA |  | NEEDS_INPUT |
| chwy-2026-credit-agreement-6-08-limitation-on-restricted-payments-540-0-million | §6.08 Limitation on Restricted Payments | RESTRICTED_PAYMENTS / GROWER_GREATER_OF / PURPOSE_SPECIFIC | greater of (x) $540.0 million and (y) 75% of Consolidated EBITDA |  | NEEDS_INPUT |
| chwy-2026-credit-agreement-6-08-limitation-on-restricted-payments-60-days | §6.08 Limitation on Restricted Payments | RESTRICTED_PAYMENTS / STATED_PERIOD / PURPOSE_SPECIFIC | 60 days | 60 DAYS | COMPUTED |
| chwy-2026-credit-agreement-6-08-limitation-on-restricted-payments-7-0 | §6.08 Limitation on Restricted Payments | RESTRICTED_PAYMENTS / PCT_OF_METRIC / PURPOSE_SPECIFIC | 7.0% of Market Capitalization |  | NEEDS_INPUT |
| chwy-2026-credit-agreement-6-08-limitation-on-restricted-payments-70-0 | §6.08 Limitation on Restricted Payments | RESTRICTED_PAYMENTS / PCT_OF_METRIC / PURPOSE_SPECIFIC | 70.0% of Consolidated EBITDA for the most recently ended Test Period |  | NEEDS_INPUT |
| chwy-2026-credit-agreement-6-08-limitation-on-restricted-payments-720-0-million | §6.08 Limitation on Restricted Payments | RESTRICTED_PAYMENTS / GROWER_GREATER_OF / PURPOSE_SPECIFIC | greater of (x) $720.0 million and (y) 100% of Consolidated EBITDA |  | NEEDS_INPUT |
| chwy-2026-credit-agreement-6-08-limitation-on-restricted-payments-720-0-million-2 | §6.08 Limitation on Restricted Payments | RESTRICTED_PAYMENTS / GROWER_GREATER_OF / PURPOSE_SPECIFIC | greater of (x) $720.0 million and (y) 100% of Consolidated EBITDA |  | NEEDS_INPUT |
| chwy-2026-credit-agreement-6-08-limitation-on-restricted-payments-75 | §6.08 Limitation on Restricted Payments | RESTRICTED_PAYMENTS / PCT_OF_METRIC / PURPOSE_SPECIFIC | 75% of Consolidated EBITDA for the most recently ended Test Period |  | NEEDS_INPUT |
| chwy-2026-credit-agreement-6-08-limitation-on-restricted-payments-90-days | §6.08 Limitation on Restricted Payments | RESTRICTED_PAYMENTS / STATED_PERIOD / PURPOSE_SPECIFIC | 90 days | 90 DAYS | COMPUTED |
| chwy-2026-credit-agreement-6-08-limitation-on-restricted-payments-90-days-2 | §6.08 Limitation on Restricted Payments | RESTRICTED_PAYMENTS / STATED_PERIOD / PURPOSE_SPECIFIC | 90 days | 90 DAYS | COMPUTED |
| chwy-2026-credit-agreement-6-08-limitation-on-restricted-payments-first-lien-leverage-rati | §6.08 Limitation on Restricted Payments | RESTRICTED_PAYMENTS / RATIO_BASED / PURPOSE_SPECIFIC | First Lien Leverage Ratio |  | NEEDS_INPUT |
| chwy-2026-credit-agreement-7-01-events-of-default-10-business-days | §7.01 Events of Default | OTHER / STATED_PERIOD / PURPOSE_SPECIFIC | 10 Business Days | 10 BUSINESS_DAYS | COMPUTED |
| chwy-2026-credit-agreement-7-01-events-of-default-2-business-days | §7.01 Events of Default | OTHER / STATED_PERIOD / PURPOSE_SPECIFIC | 2 Business Days | 2 BUSINESS_DAYS | COMPUTED |
| chwy-2026-credit-agreement-7-01-events-of-default-30-days | §7.01 Events of Default | OTHER / STATED_PERIOD / PURPOSE_SPECIFIC | 30 days | 30 DAYS | COMPUTED |
| chwy-2026-credit-agreement-7-01-events-of-default-60-consecutive-days | §7.01 Events of Default | OTHER / STATED_PERIOD / PURPOSE_SPECIFIC | 60 days | 60 DAYS | COMPUTED |
| chwy-2026-credit-agreement-7-02-application-of-proceeds-5-days | §7.02 Application of Proceeds | OTHER / STATED_PERIOD / PURPOSE_SPECIFIC | 5 days | 5 DAYS | COMPUTED |
| chwy-2026-credit-agreement-asset-sale-1 | Asset Sale (1) | ASSET_SALE / GROWER_GREATER_OF / PURPOSE_SPECIFIC | greater of (i) $108.0 million and (ii) 15% of Consolidated EBITDA |  | NEEDS_INPUT |
| chwy-2026-credit-agreement-asset-sale-1-2 | Asset Sale (1) | ASSET_SALE / GROWER_GREATER_OF / PURPOSE_SPECIFIC | greater of (i) $360.0 million and (ii) 50% of Consolidated EBITDA |  | NEEDS_INPUT |
| chwy-2026-credit-agreement-asset-sale-1-3 | Asset Sale (1) | ASSET_SALE / GROWER_GREATER_OF / PURPOSE_SPECIFIC | greater of (x) $540.0 million and (y) 75% of Consolidated EBITDA |  | NEEDS_INPUT |
| chwy-2026-credit-agreement-asset-sale-1-4 | Asset Sale (1) | ASSET_SALE / GROWER_GREATER_OF / PURPOSE_SPECIFIC | greater of (x) $36.0 million and (y) 5.0% of Consolidated EBITDA |  | NEEDS_INPUT |
| chwy-2026-credit-agreement-asset-sale-1-x | Asset Sale (1)(x) | ASSET_SALE / GROWER_GREATER_OF / PURPOSE_SPECIFIC | greater of fixed dollar and percent of metric |  | NEEDS_INPUT |
| chwy-2026-credit-agreement-definition-change-of-control-50 | §definition Change of Control | CHANGE_OF_CONTROL / PCT_OF_METRIC / PURPOSE_SPECIFIC | 50% of aggregate ordinary voting power entitled to vote for the election of the directors of the Initial Borrower (or any Successor Borrower) and represented by the th |  | NEEDS_INPUT |
| chwy-2026-credit-agreement-permitted-investments-1 | Permitted Investments (1) | INVESTMENT / UNLIMITED_BY_PURPOSE / PURPOSE_SPECIFIC |  |  | UNLIMITED_BY_PURPOSE |
| chwy-2026-credit-agreement-permitted-investments-10 | Permitted Investments (10) | INVESTMENT / BUILDER_AVAILABLE_AMOUNT / PURPOSE_SPECIFIC | sum of stated builder components |  | NEEDS_INPUT |
| chwy-2026-credit-agreement-permitted-investments-11 | Permitted Investments (11) | INVESTMENT / UNLIMITED_BY_PURPOSE / PURPOSE_SPECIFIC |  |  | UNLIMITED_BY_PURPOSE |
| chwy-2026-credit-agreement-permitted-investments-12 | Permitted Investments (12) | INVESTMENT / UNLIMITED_BY_PURPOSE / PURPOSE_SPECIFIC |  |  | UNLIMITED_BY_PURPOSE |
| chwy-2026-credit-agreement-permitted-investments-13 | Permitted Investments (13) | INVESTMENT / GROWER_GREATER_OF / PURPOSE_SPECIFIC | greater of (x) $720.0 million and (y) 100% of Consolidated EBITDA |  | NEEDS_INPUT |
| chwy-2026-credit-agreement-permitted-investments-14 | Permitted Investments (14) | INVESTMENT / UNLIMITED_BY_PURPOSE / PURPOSE_SPECIFIC |  |  | UNLIMITED_BY_PURPOSE |
| chwy-2026-credit-agreement-permitted-investments-15 | Permitted Investments (15) | INVESTMENT / GROWER_GREATER_OF / PURPOSE_SPECIFIC | greater of (x) $108.0 million and (y) 15% of Consolidated EBITDA |  | NEEDS_INPUT |
| chwy-2026-credit-agreement-permitted-investments-16 | Permitted Investments (16) | INVESTMENT / UNLIMITED_BY_PURPOSE / PURPOSE_SPECIFIC |  |  | UNLIMITED_BY_PURPOSE |
| chwy-2026-credit-agreement-permitted-investments-17 | Permitted Investments (17) | INVESTMENT / UNLIMITED_BY_PURPOSE / PURPOSE_SPECIFIC |  |  | UNLIMITED_BY_PURPOSE |
| chwy-2026-credit-agreement-permitted-investments-18 | Permitted Investments (18) | INVESTMENT / UNLIMITED_BY_PURPOSE / PURPOSE_SPECIFIC |  |  | UNLIMITED_BY_PURPOSE |
| chwy-2026-credit-agreement-permitted-investments-19 | Permitted Investments (19) | INVESTMENT / UNLIMITED_BY_PURPOSE / PURPOSE_SPECIFIC |  |  | UNLIMITED_BY_PURPOSE |
| chwy-2026-credit-agreement-permitted-investments-2 | Permitted Investments (2) | INVESTMENT / UNLIMITED_BY_PURPOSE / PURPOSE_SPECIFIC |  |  | UNLIMITED_BY_PURPOSE |
| chwy-2026-credit-agreement-permitted-investments-20 | Permitted Investments (20) | INVESTMENT / UNLIMITED_BY_PURPOSE / PURPOSE_SPECIFIC |  |  | UNLIMITED_BY_PURPOSE |
| chwy-2026-credit-agreement-permitted-investments-21 | Permitted Investments (21) | INVESTMENT / UNLIMITED_BY_PURPOSE / PURPOSE_SPECIFIC |  |  | UNLIMITED_BY_PURPOSE |
| chwy-2026-credit-agreement-permitted-investments-22 | Permitted Investments (22) | INVESTMENT / BUILDER_AVAILABLE_AMOUNT / PURPOSE_SPECIFIC | sum of stated builder components |  | NEEDS_INPUT |
| chwy-2026-credit-agreement-permitted-investments-23 | Permitted Investments (23) | INVESTMENT / UNLIMITED_BY_PURPOSE / PURPOSE_SPECIFIC |  |  | UNLIMITED_BY_PURPOSE |
| chwy-2026-credit-agreement-permitted-investments-24 | Permitted Investments (24) | INVESTMENT / UNLIMITED_BY_PURPOSE / PURPOSE_SPECIFIC |  |  | UNLIMITED_BY_PURPOSE |
| chwy-2026-credit-agreement-permitted-investments-25 | Permitted Investments (25) | INVESTMENT / UNLIMITED_BY_PURPOSE / PURPOSE_SPECIFIC |  |  | UNLIMITED_BY_PURPOSE |
| chwy-2026-credit-agreement-permitted-investments-26 | Permitted Investments (26) | INVESTMENT / UNLIMITED_BY_PURPOSE / PURPOSE_SPECIFIC |  |  | UNLIMITED_BY_PURPOSE |
| chwy-2026-credit-agreement-permitted-investments-27 | Permitted Investments (27) | INVESTMENT / RATIO_BASED / PURPOSE_SPECIFIC | First Lien Leverage Ratio |  | NEEDS_INPUT |
| chwy-2026-credit-agreement-permitted-investments-29 | Permitted Investments (29) | INVESTMENT / UNLIMITED_BY_PURPOSE / PURPOSE_SPECIFIC |  |  | UNLIMITED_BY_PURPOSE |
| chwy-2026-credit-agreement-permitted-investments-3 | Permitted Investments (3) | INVESTMENT / UNKNOWN / PURPOSE_SPECIFIC |  |  | NEEDS_INPUT |
| chwy-2026-credit-agreement-permitted-investments-30 | Permitted Investments (30) | INVESTMENT / BUILDER_AVAILABLE_AMOUNT / PURPOSE_SPECIFIC | sum of stated builder components |  | NEEDS_INPUT |
| chwy-2026-credit-agreement-permitted-investments-4 | Permitted Investments (4) | INVESTMENT / UNLIMITED_BY_PURPOSE / PURPOSE_SPECIFIC |  |  | UNLIMITED_BY_PURPOSE |
| chwy-2026-credit-agreement-permitted-investments-5 | Permitted Investments (5) | INVESTMENT / UNLIMITED_BY_PURPOSE / PURPOSE_SPECIFIC |  |  | UNLIMITED_BY_PURPOSE |
| chwy-2026-credit-agreement-permitted-investments-6 | Permitted Investments (6) | INVESTMENT / UNLIMITED_BY_PURPOSE / PURPOSE_SPECIFIC |  |  | UNLIMITED_BY_PURPOSE |
| chwy-2026-credit-agreement-permitted-investments-7 | Permitted Investments (7) | INVESTMENT / UNLIMITED_BY_PURPOSE / PURPOSE_SPECIFIC |  |  | UNLIMITED_BY_PURPOSE |
| chwy-2026-credit-agreement-permitted-liens-1 | Permitted Liens (1) | LIENS / UNLIMITED_BY_PURPOSE / PURPOSE_SPECIFIC |  |  | UNLIMITED_BY_PURPOSE |
| chwy-2026-credit-agreement-permitted-liens-18 | Permitted Liens (18) | LIENS / UNLIMITED_BY_PURPOSE / PURPOSE_SPECIFIC |  |  | UNLIMITED_BY_PURPOSE |
| chwy-2026-credit-agreement-permitted-liens-19 | Permitted Liens (19) | LIENS / UNLIMITED_BY_PURPOSE / PURPOSE_SPECIFIC |  |  | UNLIMITED_BY_PURPOSE |
| chwy-2026-credit-agreement-permitted-liens-2 | Permitted Liens (2) | LIENS / UNLIMITED_BY_PURPOSE / PURPOSE_SPECIFIC |  |  | UNLIMITED_BY_PURPOSE |
| chwy-2026-credit-agreement-permitted-liens-20 | Permitted Liens (20) | LIENS / GROWER_GREATER_OF / PURPOSE_SPECIFIC | greater of fixed dollar and percent of metric |  | NEEDS_INPUT |
| chwy-2026-credit-agreement-permitted-liens-21 | Permitted Liens (21) | LIENS / GROWER_GREATER_OF / PURPOSE_SPECIFIC | greater of (x) $720.0 million and (y) 100% of Consolidated EBITDA |  | NEEDS_INPUT |
| chwy-2026-credit-agreement-permitted-liens-22 | Permitted Liens (22) | LIENS / UNLIMITED_BY_PURPOSE / PURPOSE_SPECIFIC |  |  | UNLIMITED_BY_PURPOSE |
| chwy-2026-credit-agreement-permitted-liens-23 | Permitted Liens (23) | LIENS / UNLIMITED_BY_PURPOSE / PURPOSE_SPECIFIC |  |  | UNLIMITED_BY_PURPOSE |
| chwy-2026-credit-agreement-permitted-liens-24 | Permitted Liens (24) | LIENS / UNLIMITED_BY_PURPOSE / PURPOSE_SPECIFIC |  |  | UNLIMITED_BY_PURPOSE |
| chwy-2026-credit-agreement-permitted-liens-25 | Permitted Liens (25) | LIENS / UNLIMITED_BY_PURPOSE / PURPOSE_SPECIFIC |  |  | UNLIMITED_BY_PURPOSE |
| chwy-2026-credit-agreement-permitted-liens-26 | Permitted Liens (26) | LIENS / UNLIMITED_BY_PURPOSE / PURPOSE_SPECIFIC |  |  | UNLIMITED_BY_PURPOSE |
| chwy-2026-credit-agreement-permitted-liens-27 | Permitted Liens (27) | LIENS / UNLIMITED_BY_PURPOSE / PURPOSE_SPECIFIC |  |  | UNLIMITED_BY_PURPOSE |
| chwy-2026-credit-agreement-permitted-liens-28 | Permitted Liens (28) | LIENS / UNLIMITED_BY_PURPOSE / PURPOSE_SPECIFIC |  |  | UNLIMITED_BY_PURPOSE |
| chwy-2026-credit-agreement-permitted-liens-29 | Permitted Liens (29) | LIENS / UNLIMITED_BY_PURPOSE / PURPOSE_SPECIFIC |  |  | UNLIMITED_BY_PURPOSE |
| chwy-2026-credit-agreement-permitted-liens-3 | Permitted Liens (3) | LIENS / UNLIMITED_BY_PURPOSE / PURPOSE_SPECIFIC |  |  | UNLIMITED_BY_PURPOSE |
| chwy-2026-credit-agreement-permitted-liens-30 | Permitted Liens (30) | LIENS / UNLIMITED_BY_PURPOSE / PURPOSE_SPECIFIC |  |  | UNLIMITED_BY_PURPOSE |
| chwy-2026-credit-agreement-permitted-liens-31 | Permitted Liens (31) | LIENS / UNLIMITED_BY_PURPOSE / PURPOSE_SPECIFIC |  |  | UNLIMITED_BY_PURPOSE |
| chwy-2026-credit-agreement-permitted-liens-32 | Permitted Liens (32) | LIENS / UNLIMITED_BY_PURPOSE / PURPOSE_SPECIFIC |  |  | UNLIMITED_BY_PURPOSE |
| chwy-2026-credit-agreement-permitted-liens-33 | Permitted Liens (33) | LIENS / UNLIMITED_BY_PURPOSE / PURPOSE_SPECIFIC |  |  | UNLIMITED_BY_PURPOSE |
| chwy-2026-credit-agreement-permitted-liens-34 | Permitted Liens (34) | LIENS / UNLIMITED_BY_PURPOSE / PURPOSE_SPECIFIC |  |  | UNLIMITED_BY_PURPOSE |
| chwy-2026-credit-agreement-permitted-liens-35 | Permitted Liens (35) | LIENS / UNLIMITED_BY_PURPOSE / PURPOSE_SPECIFIC |  |  | UNLIMITED_BY_PURPOSE |
| chwy-2026-credit-agreement-permitted-liens-36 | Permitted Liens (36) | LIENS / UNLIMITED_BY_PURPOSE / PURPOSE_SPECIFIC |  |  | UNLIMITED_BY_PURPOSE |
| chwy-2026-credit-agreement-permitted-liens-37 | Permitted Liens (37) | LIENS / UNLIMITED_BY_PURPOSE / PURPOSE_SPECIFIC |  |  | UNLIMITED_BY_PURPOSE |
| chwy-2026-credit-agreement-permitted-liens-38 | Permitted Liens (38) | LIENS / UNLIMITED_BY_PURPOSE / PURPOSE_SPECIFIC |  |  | UNLIMITED_BY_PURPOSE |
| chwy-2026-credit-agreement-permitted-liens-39 | Permitted Liens (39) | LIENS / UNLIMITED_BY_PURPOSE / PURPOSE_SPECIFIC |  |  | UNLIMITED_BY_PURPOSE |
| chwy-2026-credit-agreement-permitted-liens-4 | Permitted Liens (4) | LIENS / UNLIMITED_BY_PURPOSE / PURPOSE_SPECIFIC |  |  | UNLIMITED_BY_PURPOSE |
| chwy-2026-credit-agreement-permitted-liens-40 | Permitted Liens (40) | LIENS / UNLIMITED_BY_PURPOSE / PURPOSE_SPECIFIC |  |  | UNLIMITED_BY_PURPOSE |
| chwy-2026-credit-agreement-permitted-liens-41 | Permitted Liens (41) | LIENS / UNLIMITED_BY_PURPOSE / PURPOSE_SPECIFIC |  |  | UNLIMITED_BY_PURPOSE |
| chwy-2026-credit-agreement-permitted-liens-42 | Permitted Liens (42) | LIENS / UNLIMITED_BY_PURPOSE / PURPOSE_SPECIFIC |  |  | UNLIMITED_BY_PURPOSE |
| chwy-2026-credit-agreement-permitted-liens-43 | Permitted Liens (43) | LIENS / UNLIMITED_BY_PURPOSE / PURPOSE_SPECIFIC |  |  | UNLIMITED_BY_PURPOSE |
| chwy-2026-credit-agreement-permitted-liens-44 | Permitted Liens (44) | LIENS / UNLIMITED_BY_PURPOSE / PURPOSE_SPECIFIC |  |  | UNLIMITED_BY_PURPOSE |
| chwy-2026-credit-agreement-permitted-liens-45 | Permitted Liens (45) | LIENS / UNLIMITED_BY_PURPOSE / PURPOSE_SPECIFIC |  |  | UNLIMITED_BY_PURPOSE |
| chwy-2026-credit-agreement-permitted-liens-46 | Permitted Liens (46) | LIENS / BUILDER_AVAILABLE_AMOUNT / PURPOSE_SPECIFIC | sum of stated builder components |  | NEEDS_INPUT |
| chwy-2026-credit-agreement-permitted-liens-48 | Permitted Liens (48) | LIENS / UNLIMITED_BY_PURPOSE / PURPOSE_SPECIFIC |  |  | UNLIMITED_BY_PURPOSE |
| chwy-2026-credit-agreement-permitted-liens-49 | Permitted Liens (49) | LIENS / UNLIMITED_BY_PURPOSE / PURPOSE_SPECIFIC |  |  | UNLIMITED_BY_PURPOSE |
| chwy-2026-credit-agreement-permitted-liens-5 | Permitted Liens (5) | LIENS / UNLIMITED_BY_PURPOSE / PURPOSE_SPECIFIC |  |  | UNLIMITED_BY_PURPOSE |
| chwy-2026-credit-agreement-permitted-liens-51 | Permitted Liens (51) | LIENS / RECLASS / PURPOSE_SPECIFIC |  |  | NEEDS_INPUT |
| chwy-2026-credit-agreement-permitted-liens-6 | Permitted Liens (6) | LIENS / UNLIMITED_BY_PURPOSE / PURPOSE_SPECIFIC |  |  | UNLIMITED_BY_PURPOSE |

## gibraltar-2026-credit-agreement

| basket | section | type | cap formula | computed value | status |
| --- | --- | --- | --- | --- | --- |
| gibraltar-2026-credit-agreement-6-01-financial-statements-45-days | §6.01 Financial Statements | OTHER / STATED_PERIOD / PURPOSE_SPECIFIC | 45 days | 45 DAYS | COMPUTED |
| gibraltar-2026-credit-agreement-6-01-financial-statements-90-days | §6.01 Financial Statements | OTHER / STATED_PERIOD / PURPOSE_SPECIFIC | 90 days | 90 DAYS | COMPUTED |
| gibraltar-2026-credit-agreement-6-02-certificates-other-information-5-business-days | §6.02 Certificates; Other Information | REPORTING / STATED_PERIOD / PURPOSE_SPECIFIC | 5 Business Days | 5 BUSINESS_DAYS | COMPUTED |
| gibraltar-2026-credit-agreement-6-12-covenant-to-guarantee-obligations-and-give-secur-90-days | §6.12 Covenant to Guarantee Obligations and Give Security | AFFIRMATIVE / STATED_PERIOD / PURPOSE_SPECIFIC | 90 days | 90 DAYS | COMPUTED |
| gibraltar-2026-credit-agreement-6-18-transactions-with-affiliates-15-0 | §6.18 Transactions with Affiliates | AFFILIATE / PCT_OF_METRIC / PURPOSE_SPECIFIC | 15.0% of LTM EBITDA |  | NEEDS_INPUT |
| gibraltar-2026-credit-agreement-6-18-transactions-with-affiliates-17-200-000 | §6.18 Transactions with Affiliates | AFFILIATE / GROWER_GREATER_OF / PURPOSE_SPECIFIC | greater of fixed dollar and percent of metric |  | NEEDS_INPUT |
| gibraltar-2026-credit-agreement-6-18-transactions-with-affiliates-5-0 | §6.18 Transactions with Affiliates | AFFILIATE / PCT_OF_METRIC / PURPOSE_SPECIFIC | 5.0% of LTM EBITDA unless: (1) the terms of such Affiliate Transaction |  | NEEDS_INPUT |
| gibraltar-2026-credit-agreement-6-18-transactions-with-affiliates-51-600-000 | §6.18 Transactions with Affiliates | AFFILIATE / GROWER_GREATER_OF / PURPOSE_SPECIFIC | greater of fixed dollar and percent of metric |  | NEEDS_INPUT |
| gibraltar-2026-credit-agreement-7-01-indebtedness-35-0 | §7.01 Indebtedness | DEBT_INCURRENCE / PCT_OF_METRIC / PURPOSE_SPECIFIC | 35.0% of LTM EBITDA plus (y) the Incremental Amount available |  | NEEDS_INPUT |
| gibraltar-2026-credit-agreement-7-01-indebtedness-35-0-2 | §7.01 Indebtedness | DEBT_INCURRENCE / PCT_OF_METRIC / PURPOSE_SPECIFIC | 35.0% of LTM EBITDA plus (y) an unlimited amount so long |  | NEEDS_INPUT |
| gibraltar-2026-credit-agreement-7-01-indebtedness-35-0-3 | §7.01 Indebtedness | DEBT_INCURRENCE / PCT_OF_METRIC / PURPOSE_SPECIFIC | 35.0% of LTM EBITDA at the time of incurrence |  | NEEDS_INPUT |
| gibraltar-2026-credit-agreement-7-04-asset-dispositions-180-days | §7.04 Asset Dispositions | ASSET_SALE / STATED_PERIOD / PURPOSE_SPECIFIC | 180 days | 180 DAYS | COMPUTED |
| gibraltar-2026-credit-agreement-7-04-asset-dispositions-20-0 | §7.04 Asset Dispositions | ASSET_SALE / PCT_OF_METRIC / PURPOSE_SPECIFIC | 20.0% of LTM EBITDA |  | NEEDS_INPUT |
| gibraltar-2026-credit-agreement-7-04-asset-dispositions-25-0 | §7.04 Asset Dispositions | ASSET_SALE / PCT_OF_METRIC / PURPOSE_SPECIFIC | 25.0% of LTM EBITDA |  | NEEDS_INPUT |
| gibraltar-2026-credit-agreement-7-04-asset-dispositions-365-days | §7.04 Asset Dispositions | ASSET_SALE / STATED_PERIOD / PURPOSE_SPECIFIC | 365 days | 365 DAYS | COMPUTED |
| gibraltar-2026-credit-agreement-7-04-asset-dispositions-540-days | §7.04 Asset Dispositions | ASSET_SALE / STATED_PERIOD / PURPOSE_SPECIFIC | 540 days | 540 DAYS | COMPUTED |
| gibraltar-2026-credit-agreement-7-04-asset-dispositions-68-800-000 | §7.04 Asset Dispositions | ASSET_SALE / GROWER_GREATER_OF / PURPOSE_SPECIFIC | greater of fixed dollar and percent of metric |  | NEEDS_INPUT |
| gibraltar-2026-credit-agreement-7-04-asset-dispositions-86-000-000 | §7.04 Asset Dispositions | ASSET_SALE / GROWER_GREATER_OF / PURPOSE_SPECIFIC | greater of fixed dollar and percent of metric |  | NEEDS_INPUT |
| gibraltar-2026-credit-agreement-7-05-restricted-payments-35-0 | §7.05 Restricted Payments | RESTRICTED_PAYMENTS / PCT_OF_METRIC / PURPOSE_SPECIFIC | 35.0% of LTM EBITDA at such time |  | NEEDS_INPUT |
| gibraltar-2026-credit-agreement-8-01-events-of-default-30-days | §8.01 Events of Default | OTHER / STATED_PERIOD / PURPOSE_SPECIFIC | 30 days | 30 DAYS | COMPUTED |
| gibraltar-2026-credit-agreement-8-01-events-of-default-5-business-days | §8.01 Events of Default | OTHER / STATED_PERIOD / PURPOSE_SPECIFIC | 5 Business Days | 5 BUSINESS_DAYS | COMPUTED |
| gibraltar-2026-credit-agreement-8-01-events-of-default-60-days | §8.01 Events of Default | OTHER / STATED_PERIOD / PURPOSE_SPECIFIC | 60 days | 60 DAYS | COMPUTED |
| gibraltar-2026-credit-agreement-8-01-events-of-default-fifteen-days | §8.01 Events of Default | OTHER / STATED_PERIOD / PURPOSE_SPECIFIC | 15 days | 15 DAYS | COMPUTED |
| gibraltar-2026-credit-agreement-permitted-investments-1 | Permitted Investments (1) | INVESTMENT / GROWER_GREATER_OF / PURPOSE_SPECIFIC | greater of fixed dollar and percent of metric |  | NEEDS_INPUT |
| gibraltar-2026-credit-agreement-permitted-investments-10 | Permitted Investments (10) | INVESTMENT / UNLIMITED_BY_PURPOSE / PURPOSE_SPECIFIC |  |  | UNLIMITED_BY_PURPOSE |
| gibraltar-2026-credit-agreement-permitted-investments-11 | Permitted Investments (11) | INVESTMENT / UNLIMITED_BY_PURPOSE / PURPOSE_SPECIFIC |  |  | UNLIMITED_BY_PURPOSE |
| gibraltar-2026-credit-agreement-permitted-investments-12 | Permitted Investments (12) | INVESTMENT / UNLIMITED_BY_PURPOSE / PURPOSE_SPECIFIC |  |  | UNLIMITED_BY_PURPOSE |
| gibraltar-2026-credit-agreement-permitted-investments-13 | Permitted Investments (13) | INVESTMENT / UNLIMITED_BY_PURPOSE / PURPOSE_SPECIFIC |  |  | UNLIMITED_BY_PURPOSE |
| gibraltar-2026-credit-agreement-permitted-investments-14 | Permitted Investments (14) | INVESTMENT / UNLIMITED_BY_PURPOSE / PURPOSE_SPECIFIC |  |  | UNLIMITED_BY_PURPOSE |
| gibraltar-2026-credit-agreement-permitted-investments-15 | Permitted Investments (15) | INVESTMENT / UNLIMITED_BY_PURPOSE / PURPOSE_SPECIFIC |  |  | UNLIMITED_BY_PURPOSE |
| gibraltar-2026-credit-agreement-permitted-investments-16 | Permitted Investments (16) | INVESTMENT / UNLIMITED_BY_PURPOSE / PURPOSE_SPECIFIC |  |  | UNLIMITED_BY_PURPOSE |
| gibraltar-2026-credit-agreement-permitted-investments-17 | Permitted Investments (17) | INVESTMENT / UNLIMITED_BY_PURPOSE / PURPOSE_SPECIFIC |  |  | UNLIMITED_BY_PURPOSE |
| gibraltar-2026-credit-agreement-permitted-investments-18 | Permitted Investments (18) | INVESTMENT / UNLIMITED_BY_PURPOSE / PURPOSE_SPECIFIC |  |  | UNLIMITED_BY_PURPOSE |
| gibraltar-2026-credit-agreement-permitted-investments-19 | Permitted Investments (19) | INVESTMENT / UNLIMITED_BY_PURPOSE / PURPOSE_SPECIFIC |  |  | UNLIMITED_BY_PURPOSE |
| gibraltar-2026-credit-agreement-permitted-investments-2 | Permitted Investments (2) | INVESTMENT / GROWER_GREATER_OF / PURPOSE_SPECIFIC | greater of fixed dollar and percent of metric |  | NEEDS_INPUT |
| gibraltar-2026-credit-agreement-permitted-investments-20 | Permitted Investments (20) | INVESTMENT / GROWER_GREATER_OF / PURPOSE_SPECIFIC | greater of fixed dollar and percent of metric |  | NEEDS_INPUT |
| gibraltar-2026-credit-agreement-permitted-investments-21 | Permitted Investments (21) | INVESTMENT / BUILDER_AVAILABLE_AMOUNT / PURPOSE_SPECIFIC | sum of stated builder components |  | NEEDS_INPUT |
| gibraltar-2026-credit-agreement-permitted-investments-22 | Permitted Investments (22) | INVESTMENT / GROWER_GREATER_OF / PURPOSE_SPECIFIC | greater of fixed dollar and percent of metric |  | NEEDS_INPUT |
| gibraltar-2026-credit-agreement-permitted-investments-23 | Permitted Investments (23) | INVESTMENT / UNLIMITED_BY_PURPOSE / PURPOSE_SPECIFIC |  |  | UNLIMITED_BY_PURPOSE |
| gibraltar-2026-credit-agreement-permitted-investments-24 | Permitted Investments (24) | INVESTMENT / UNLIMITED_BY_PURPOSE / PURPOSE_SPECIFIC |  |  | UNLIMITED_BY_PURPOSE |
| gibraltar-2026-credit-agreement-permitted-investments-26 | Permitted Investments (26) | INVESTMENT / UNLIMITED_BY_PURPOSE / PURPOSE_SPECIFIC |  |  | UNLIMITED_BY_PURPOSE |
| gibraltar-2026-credit-agreement-permitted-investments-27 | Permitted Investments (27) | INVESTMENT / UNLIMITED_BY_PURPOSE / PURPOSE_SPECIFIC |  |  | UNLIMITED_BY_PURPOSE |
| gibraltar-2026-credit-agreement-permitted-investments-28 | Permitted Investments (28) | INVESTMENT / UNLIMITED_BY_PURPOSE / PURPOSE_SPECIFIC |  |  | UNLIMITED_BY_PURPOSE |
| gibraltar-2026-credit-agreement-permitted-investments-29 | Permitted Investments (29) | INVESTMENT / UNLIMITED_BY_PURPOSE / PURPOSE_SPECIFIC |  |  | UNLIMITED_BY_PURPOSE |
| gibraltar-2026-credit-agreement-permitted-investments-3 | Permitted Investments (3) | INVESTMENT / UNLIMITED_BY_PURPOSE / PURPOSE_SPECIFIC |  |  | UNLIMITED_BY_PURPOSE |
| gibraltar-2026-credit-agreement-permitted-investments-30 | Permitted Investments (30) | INVESTMENT / UNLIMITED_BY_PURPOSE / PURPOSE_SPECIFIC |  |  | UNLIMITED_BY_PURPOSE |
| gibraltar-2026-credit-agreement-permitted-investments-31 | Permitted Investments (31) | INVESTMENT / UNLIMITED_BY_PURPOSE / PURPOSE_SPECIFIC |  |  | UNLIMITED_BY_PURPOSE |
| gibraltar-2026-credit-agreement-permitted-investments-32 | Permitted Investments (32) | INVESTMENT / UNLIMITED_BY_PURPOSE / PURPOSE_SPECIFIC |  |  | UNLIMITED_BY_PURPOSE |
| gibraltar-2026-credit-agreement-permitted-investments-33 | Permitted Investments (33) | INVESTMENT / UNLIMITED_BY_PURPOSE / PURPOSE_SPECIFIC |  |  | UNLIMITED_BY_PURPOSE |
| gibraltar-2026-credit-agreement-permitted-investments-34 | Permitted Investments (34) | INVESTMENT / RATIO_BASED / PURPOSE_SPECIFIC | Consolidated Total Net Leverage Ratio |  | NEEDS_INPUT |
| gibraltar-2026-credit-agreement-permitted-investments-4 | Permitted Investments (4) | INVESTMENT / UNLIMITED_BY_PURPOSE / PURPOSE_SPECIFIC |  |  | UNLIMITED_BY_PURPOSE |
| gibraltar-2026-credit-agreement-permitted-investments-5 | Permitted Investments (5) | INVESTMENT / UNLIMITED_BY_PURPOSE / PURPOSE_SPECIFIC |  |  | UNLIMITED_BY_PURPOSE |
| gibraltar-2026-credit-agreement-permitted-investments-6 | Permitted Investments (6) | INVESTMENT / UNLIMITED_BY_PURPOSE / PURPOSE_SPECIFIC |  |  | UNLIMITED_BY_PURPOSE |
| gibraltar-2026-credit-agreement-permitted-investments-7 | Permitted Investments (7) | INVESTMENT / UNLIMITED_BY_PURPOSE / PURPOSE_SPECIFIC |  |  | UNLIMITED_BY_PURPOSE |
| gibraltar-2026-credit-agreement-permitted-investments-8 | Permitted Investments (8) | INVESTMENT / UNLIMITED_BY_PURPOSE / PURPOSE_SPECIFIC |  |  | UNLIMITED_BY_PURPOSE |
| gibraltar-2026-credit-agreement-permitted-investments-9 | Permitted Investments (9) | INVESTMENT / FIXED_DOLLAR / PURPOSE_SPECIFIC | $10,000,000, | 10000000 USD | COMPUTED |
| gibraltar-2026-credit-agreement-permitted-liens-1 | Permitted Liens (1) | LIENS / UNLIMITED_BY_PURPOSE / PURPOSE_SPECIFIC |  |  | UNLIMITED_BY_PURPOSE |
| gibraltar-2026-credit-agreement-permitted-liens-10 | Permitted Liens (10) | LIENS / UNLIMITED_BY_PURPOSE / PURPOSE_SPECIFIC |  |  | UNLIMITED_BY_PURPOSE |
| gibraltar-2026-credit-agreement-permitted-liens-11 | Permitted Liens (11) | LIENS / FIXED_DOLLAR / PURPOSE_SPECIFIC | $10,000,000, | 10000000 USD | COMPUTED |
| gibraltar-2026-credit-agreement-permitted-liens-12 | Permitted Liens (12) | LIENS / UNLIMITED_BY_PURPOSE / PURPOSE_SPECIFIC |  |  | UNLIMITED_BY_PURPOSE |
| gibraltar-2026-credit-agreement-permitted-liens-13 | Permitted Liens (13) | LIENS / UNLIMITED_BY_PURPOSE / PURPOSE_SPECIFIC |  |  | UNLIMITED_BY_PURPOSE |
| gibraltar-2026-credit-agreement-permitted-liens-14 | Permitted Liens (14) | LIENS / UNLIMITED_BY_PURPOSE / PURPOSE_SPECIFIC |  |  | UNLIMITED_BY_PURPOSE |
| gibraltar-2026-credit-agreement-permitted-liens-15 | Permitted Liens (15) | LIENS / UNLIMITED_BY_PURPOSE / PURPOSE_SPECIFIC |  |  | UNLIMITED_BY_PURPOSE |
| gibraltar-2026-credit-agreement-permitted-liens-16 | Permitted Liens (16) | LIENS / UNLIMITED_BY_PURPOSE / PURPOSE_SPECIFIC |  |  | UNLIMITED_BY_PURPOSE |
| gibraltar-2026-credit-agreement-permitted-liens-17 | Permitted Liens (17) | LIENS / UNLIMITED_BY_PURPOSE / PURPOSE_SPECIFIC |  |  | UNLIMITED_BY_PURPOSE |
| gibraltar-2026-credit-agreement-permitted-liens-18 | Permitted Liens (18) | LIENS / UNLIMITED_BY_PURPOSE / PURPOSE_SPECIFIC |  |  | UNLIMITED_BY_PURPOSE |
| gibraltar-2026-credit-agreement-permitted-liens-19 | Permitted Liens (19) | LIENS / UNLIMITED_BY_PURPOSE / PURPOSE_SPECIFIC |  |  | UNLIMITED_BY_PURPOSE |
| gibraltar-2026-credit-agreement-permitted-liens-2 | Permitted Liens (2) | LIENS / UNLIMITED_BY_PURPOSE / PURPOSE_SPECIFIC |  |  | UNLIMITED_BY_PURPOSE |
| gibraltar-2026-credit-agreement-permitted-liens-20 | Permitted Liens (20) | LIENS / UNLIMITED_BY_PURPOSE / PURPOSE_SPECIFIC |  |  | UNLIMITED_BY_PURPOSE |
| gibraltar-2026-credit-agreement-permitted-liens-21 | Permitted Liens (21) | LIENS / UNLIMITED_BY_PURPOSE / PURPOSE_SPECIFIC |  |  | UNLIMITED_BY_PURPOSE |
| gibraltar-2026-credit-agreement-permitted-liens-22 | Permitted Liens (22) | LIENS / UNLIMITED_BY_PURPOSE / PURPOSE_SPECIFIC |  |  | UNLIMITED_BY_PURPOSE |
| gibraltar-2026-credit-agreement-permitted-liens-23 | Permitted Liens (23) | LIENS / UNLIMITED_BY_PURPOSE / PURPOSE_SPECIFIC |  |  | UNLIMITED_BY_PURPOSE |
| gibraltar-2026-credit-agreement-permitted-liens-24 | Permitted Liens (24) | LIENS / UNLIMITED_BY_PURPOSE / PURPOSE_SPECIFIC |  |  | UNLIMITED_BY_PURPOSE |
| gibraltar-2026-credit-agreement-permitted-liens-25 | Permitted Liens (25) | LIENS / UNLIMITED_BY_PURPOSE / PURPOSE_SPECIFIC |  |  | UNLIMITED_BY_PURPOSE |
| gibraltar-2026-credit-agreement-permitted-liens-26 | Permitted Liens (26) | LIENS / UNLIMITED_BY_PURPOSE / PURPOSE_SPECIFIC |  |  | UNLIMITED_BY_PURPOSE |
| gibraltar-2026-credit-agreement-permitted-liens-27 | Permitted Liens (27) | LIENS / UNLIMITED_BY_PURPOSE / PURPOSE_SPECIFIC |  |  | UNLIMITED_BY_PURPOSE |
| gibraltar-2026-credit-agreement-permitted-liens-28 | Permitted Liens (28) | LIENS / UNLIMITED_BY_PURPOSE / PURPOSE_SPECIFIC |  |  | UNLIMITED_BY_PURPOSE |
| gibraltar-2026-credit-agreement-permitted-liens-29 | Permitted Liens (29) | LIENS / UNLIMITED_BY_PURPOSE / PURPOSE_SPECIFIC |  |  | UNLIMITED_BY_PURPOSE |
| gibraltar-2026-credit-agreement-permitted-liens-3 | Permitted Liens (3) | LIENS / UNLIMITED_BY_PURPOSE / PURPOSE_SPECIFIC |  |  | UNLIMITED_BY_PURPOSE |
| gibraltar-2026-credit-agreement-permitted-liens-30 | Permitted Liens (30) | LIENS / UNLIMITED_BY_PURPOSE / PURPOSE_SPECIFIC |  |  | UNLIMITED_BY_PURPOSE |
| gibraltar-2026-credit-agreement-permitted-liens-31 | Permitted Liens (31) | LIENS / BUILDER_AVAILABLE_AMOUNT / PURPOSE_SPECIFIC | sum of stated builder components |  | NEEDS_INPUT |
| gibraltar-2026-credit-agreement-permitted-liens-32 | Permitted Liens (32) | LIENS / UNLIMITED_BY_PURPOSE / PURPOSE_SPECIFIC |  |  | UNLIMITED_BY_PURPOSE |
| gibraltar-2026-credit-agreement-permitted-liens-33 | Permitted Liens (33) | LIENS / UNLIMITED_BY_PURPOSE / PURPOSE_SPECIFIC |  |  | UNLIMITED_BY_PURPOSE |
| gibraltar-2026-credit-agreement-permitted-liens-34 | Permitted Liens (34) | LIENS / UNLIMITED_BY_PURPOSE / PURPOSE_SPECIFIC |  |  | UNLIMITED_BY_PURPOSE |
| gibraltar-2026-credit-agreement-permitted-liens-35 | Permitted Liens (35) | LIENS / UNLIMITED_BY_PURPOSE / PURPOSE_SPECIFIC |  |  | UNLIMITED_BY_PURPOSE |
| gibraltar-2026-credit-agreement-permitted-liens-37 | Permitted Liens (37) | LIENS / UNLIMITED_BY_PURPOSE / PURPOSE_SPECIFIC |  |  | UNLIMITED_BY_PURPOSE |
| gibraltar-2026-credit-agreement-permitted-liens-38 | Permitted Liens (38) | LIENS / UNLIMITED_BY_PURPOSE / PURPOSE_SPECIFIC |  |  | UNLIMITED_BY_PURPOSE |
| gibraltar-2026-credit-agreement-permitted-liens-39 | Permitted Liens (39) | LIENS / UNLIMITED_BY_PURPOSE / PURPOSE_SPECIFIC |  |  | UNLIMITED_BY_PURPOSE |
| gibraltar-2026-credit-agreement-permitted-liens-4 | Permitted Liens (4) | LIENS / UNLIMITED_BY_PURPOSE / PURPOSE_SPECIFIC |  |  | UNLIMITED_BY_PURPOSE |
| gibraltar-2026-credit-agreement-permitted-liens-40 | Permitted Liens (40) | LIENS / UNLIMITED_BY_PURPOSE / PURPOSE_SPECIFIC |  |  | UNLIMITED_BY_PURPOSE |
| gibraltar-2026-credit-agreement-permitted-liens-41 | Permitted Liens (41) | LIENS / UNLIMITED_BY_PURPOSE / PURPOSE_SPECIFIC |  |  | UNLIMITED_BY_PURPOSE |
| gibraltar-2026-credit-agreement-permitted-liens-43 | Permitted Liens (43) | LIENS / UNLIMITED_BY_PURPOSE / PURPOSE_SPECIFIC |  |  | UNLIMITED_BY_PURPOSE |
| gibraltar-2026-credit-agreement-permitted-liens-44 | Permitted Liens (44) | LIENS / UNLIMITED_BY_PURPOSE / PURPOSE_SPECIFIC |  |  | UNLIMITED_BY_PURPOSE |
| gibraltar-2026-credit-agreement-permitted-liens-45 | Permitted Liens (45) | LIENS / UNLIMITED_BY_PURPOSE / PURPOSE_SPECIFIC |  |  | UNLIMITED_BY_PURPOSE |
| gibraltar-2026-credit-agreement-permitted-liens-46 | Permitted Liens (46) | LIENS / RECLASS / PURPOSE_SPECIFIC |  |  | NEEDS_INPUT |
| gibraltar-2026-credit-agreement-permitted-liens-5 | Permitted Liens (5) | LIENS / UNLIMITED_BY_PURPOSE / PURPOSE_SPECIFIC |  |  | UNLIMITED_BY_PURPOSE |
| gibraltar-2026-credit-agreement-permitted-liens-6 | Permitted Liens (6) | LIENS / UNLIMITED_BY_PURPOSE / PURPOSE_SPECIFIC |  |  | UNLIMITED_BY_PURPOSE |
| gibraltar-2026-credit-agreement-permitted-liens-7 | Permitted Liens (7) | LIENS / UNLIMITED_BY_PURPOSE / PURPOSE_SPECIFIC |  |  | UNLIMITED_BY_PURPOSE |
| gibraltar-2026-credit-agreement-permitted-liens-8 | Permitted Liens (8) | LIENS / UNLIMITED_BY_PURPOSE / PURPOSE_SPECIFIC |  |  | UNLIMITED_BY_PURPOSE |
| gibraltar-2026-credit-agreement-permitted-liens-9 | Permitted Liens (9) | LIENS / UNLIMITED_BY_PURPOSE / PURPOSE_SPECIFIC |  |  | UNLIMITED_BY_PURPOSE |
| gibraltar-2026-credit-agreement-s7-01-indebtedness-1 | §7.01 Indebtedness (1) | DEBT_INCURRENCE / UNLIMITED_BY_PURPOSE / PURPOSE_SPECIFIC |  |  | UNLIMITED_BY_PURPOSE |
| gibraltar-2026-credit-agreement-s7-01-indebtedness-11 | §7.01 Indebtedness (11) | DEBT_INCURRENCE / GROWER_GREATER_OF / PURPOSE_SPECIFIC | greater of fixed dollar and percent of metric |  | NEEDS_INPUT |
| gibraltar-2026-credit-agreement-s7-01-indebtedness-12 | §7.01 Indebtedness (12) | DEBT_INCURRENCE / UNLIMITED_BY_PURPOSE / PURPOSE_SPECIFIC |  |  | UNLIMITED_BY_PURPOSE |
| gibraltar-2026-credit-agreement-s7-01-indebtedness-13 | §7.01 Indebtedness (13) | DEBT_INCURRENCE / UNLIMITED_BY_PURPOSE / PURPOSE_SPECIFIC |  |  | UNLIMITED_BY_PURPOSE |
| gibraltar-2026-credit-agreement-s7-01-indebtedness-14 | §7.01 Indebtedness (14) | DEBT_INCURRENCE / BUILDER_AVAILABLE_AMOUNT / PURPOSE_SPECIFIC | sum of stated builder components |  | NEEDS_INPUT |
| gibraltar-2026-credit-agreement-s7-01-indebtedness-15 | §7.01 Indebtedness (15) | DEBT_INCURRENCE / GROWER_GREATER_OF / PURPOSE_SPECIFIC | greater of fixed dollar and percent of metric |  | NEEDS_INPUT |
| gibraltar-2026-credit-agreement-s7-01-indebtedness-16 | §7.01 Indebtedness (16) | DEBT_INCURRENCE / UNLIMITED_BY_PURPOSE / PURPOSE_SPECIFIC |  |  | UNLIMITED_BY_PURPOSE |
| gibraltar-2026-credit-agreement-s7-01-indebtedness-17 | §7.01 Indebtedness (17) | DEBT_INCURRENCE / UNLIMITED_BY_PURPOSE / PURPOSE_SPECIFIC |  |  | UNLIMITED_BY_PURPOSE |
| gibraltar-2026-credit-agreement-s7-01-indebtedness-18 | §7.01 Indebtedness (18) | DEBT_INCURRENCE / UNLIMITED_BY_PURPOSE / PURPOSE_SPECIFIC |  |  | UNLIMITED_BY_PURPOSE |
| gibraltar-2026-credit-agreement-s7-01-indebtedness-19 | §7.01 Indebtedness (19) | DEBT_INCURRENCE / UNLIMITED_BY_PURPOSE / PURPOSE_SPECIFIC |  |  | UNLIMITED_BY_PURPOSE |
| gibraltar-2026-credit-agreement-s7-01-indebtedness-2 | §7.01 Indebtedness (2) | DEBT_INCURRENCE / UNLIMITED_BY_PURPOSE / PURPOSE_SPECIFIC |  |  | UNLIMITED_BY_PURPOSE |
| gibraltar-2026-credit-agreement-s7-01-indebtedness-22 | §7.01 Indebtedness (22) | DEBT_INCURRENCE / GROWER_GREATER_OF / PURPOSE_SPECIFIC | greater of fixed dollar and percent of metric |  | NEEDS_INPUT |
| gibraltar-2026-credit-agreement-s7-01-indebtedness-23 | §7.01 Indebtedness (23) | DEBT_INCURRENCE / GROWER_GREATER_OF / PURPOSE_SPECIFIC | greater of fixed dollar and percent of metric |  | NEEDS_INPUT |
| gibraltar-2026-credit-agreement-s7-01-indebtedness-25 | §7.01 Indebtedness (25) | DEBT_INCURRENCE / GROWER_GREATER_OF / PURPOSE_SPECIFIC | greater of fixed dollar and percent of metric |  | NEEDS_INPUT |
| gibraltar-2026-credit-agreement-s7-01-indebtedness-3 | §7.01 Indebtedness (3) | DEBT_INCURRENCE / UNLIMITED_BY_PURPOSE / PURPOSE_SPECIFIC |  |  | UNLIMITED_BY_PURPOSE |
| gibraltar-2026-credit-agreement-s7-01-indebtedness-4 | §7.01 Indebtedness (4) | DEBT_INCURRENCE / FIXED_DOLLAR / PURPOSE_SPECIFIC | $10,000,000, | 10000000 USD | COMPUTED |
| gibraltar-2026-credit-agreement-s7-01-indebtedness-5-x | §7.01 Indebtedness (5)(x) | DEBT_INCURRENCE / GROWER_GREATER_OF / PURPOSE_SPECIFIC | greater of fixed dollar and percent of metric |  | NEEDS_INPUT |
| gibraltar-2026-credit-agreement-s7-01-indebtedness-5-x-2 | §7.01 Indebtedness (5)(x) | DEBT_INCURRENCE / GROWER_GREATER_OF / PURPOSE_SPECIFIC | greater of fixed dollar and percent of metric |  | NEEDS_INPUT |
| gibraltar-2026-credit-agreement-s7-01-indebtedness-6 | §7.01 Indebtedness (6) | DEBT_INCURRENCE / UNLIMITED_BY_PURPOSE / PURPOSE_SPECIFIC |  |  | UNLIMITED_BY_PURPOSE |
| gibraltar-2026-credit-agreement-s7-01-indebtedness-7-i | §7.01 Indebtedness (7)(i) | DEBT_INCURRENCE / GROWER_GREATER_OF / PURPOSE_SPECIFIC | greater of fixed dollar and percent of metric |  | NEEDS_INPUT |
| gibraltar-2026-credit-agreement-s7-01-indebtedness-7-ii | §7.01 Indebtedness (7)(ii) | DEBT_INCURRENCE / GROWER_GREATER_OF / PURPOSE_SPECIFIC | greater of fixed dollar and percent of metric |  | NEEDS_INPUT |
| gibraltar-2026-credit-agreement-s7-01-indebtedness-8 | §7.01 Indebtedness (8) | DEBT_INCURRENCE / UNLIMITED_BY_PURPOSE / PURPOSE_SPECIFIC |  |  | UNLIMITED_BY_PURPOSE |
| gibraltar-2026-credit-agreement-s7-01-indebtedness-9 | §7.01 Indebtedness (9) | DEBT_INCURRENCE / UNLIMITED_BY_PURPOSE / PURPOSE_SPECIFIC |  |  | UNLIMITED_BY_PURPOSE |
| gibraltar-2026-credit-agreement-s7-01-indebtedness-a | §7.01 Indebtedness (a) | DEBT_INCURRENCE / UNLIMITED_BY_PURPOSE / PURPOSE_SPECIFIC |  |  | UNLIMITED_BY_PURPOSE |
| gibraltar-2026-credit-agreement-s7-01-indebtedness-b | §7.01 Indebtedness (b) | DEBT_INCURRENCE / UNLIMITED_BY_PURPOSE / PURPOSE_SPECIFIC |  |  | UNLIMITED_BY_PURPOSE |
| gibraltar-2026-credit-agreement-s7-03-fundamental-changes-a | §7.03 Fundamental Changes (a) | OTHER / UNLIMITED_BY_PURPOSE / PURPOSE_SPECIFIC |  |  | UNLIMITED_BY_PURPOSE |
| gibraltar-2026-credit-agreement-s7-03-fundamental-changes-c | §7.03 Fundamental Changes (c) | OTHER / UNLIMITED_BY_PURPOSE / PURPOSE_SPECIFIC |  |  | UNLIMITED_BY_PURPOSE |
| gibraltar-2026-credit-agreement-s7-03-fundamental-changes-d | §7.03 Fundamental Changes (d) | OTHER / UNLIMITED_BY_PURPOSE / PURPOSE_SPECIFIC |  |  | UNLIMITED_BY_PURPOSE |
| gibraltar-2026-credit-agreement-s7-03-fundamental-changes-e | §7.03 Fundamental Changes (e) | OTHER / UNLIMITED_BY_PURPOSE / PURPOSE_SPECIFIC |  |  | UNLIMITED_BY_PURPOSE |
| gibraltar-2026-credit-agreement-s7-03-fundamental-changes-f | §7.03 Fundamental Changes (f) | OTHER / UNLIMITED_BY_PURPOSE / PURPOSE_SPECIFIC |  |  | UNLIMITED_BY_PURPOSE |
| gibraltar-2026-credit-agreement-s7-03-fundamental-changes-g | §7.03 Fundamental Changes (g) | OTHER / UNLIMITED_BY_PURPOSE / PURPOSE_SPECIFIC |  |  | UNLIMITED_BY_PURPOSE |
| gibraltar-2026-credit-agreement-s7-03-fundamental-changes-h | §7.03 Fundamental Changes (h) | OTHER / UNLIMITED_BY_PURPOSE / PURPOSE_SPECIFIC |  |  | UNLIMITED_BY_PURPOSE |
| gibraltar-2026-credit-agreement-s7-03-fundamental-changes-i | §7.03 Fundamental Changes (i) | OTHER / UNLIMITED_BY_PURPOSE / PURPOSE_SPECIFIC |  |  | UNLIMITED_BY_PURPOSE |
| gibraltar-2026-credit-agreement-s7-05-restricted-payments-1 | §7.05 Restricted Payments (1) | RESTRICTED_PAYMENTS / UNLIMITED_BY_PURPOSE / PURPOSE_SPECIFIC |  |  | UNLIMITED_BY_PURPOSE |
| gibraltar-2026-credit-agreement-s7-05-restricted-payments-2 | §7.05 Restricted Payments (2) | RESTRICTED_PAYMENTS / UNLIMITED_BY_PURPOSE / PURPOSE_SPECIFIC |  |  | UNLIMITED_BY_PURPOSE |
| gibraltar-2026-credit-agreement-s7-05-restricted-payments-3 | §7.05 Restricted Payments (3) | RESTRICTED_PAYMENTS / UNLIMITED_BY_PURPOSE / PURPOSE_SPECIFIC |  |  | UNLIMITED_BY_PURPOSE |
| gibraltar-2026-credit-agreement-s7-05-restricted-payments-4 | §7.05 Restricted Payments (4) | RESTRICTED_PAYMENTS / UNLIMITED_BY_PURPOSE / PURPOSE_SPECIFIC |  |  | UNLIMITED_BY_PURPOSE |
| gibraltar-2026-credit-agreement-s7-05-restricted-payments-5 | §7.05 Restricted Payments (5) | RESTRICTED_PAYMENTS / UNLIMITED_BY_PURPOSE / PURPOSE_SPECIFIC |  |  | UNLIMITED_BY_PURPOSE |
| gibraltar-2026-credit-agreement-s7-05-restricted-payments-6 | §7.05 Restricted Payments (6) | RESTRICTED_PAYMENTS / BUILDER_AVAILABLE_AMOUNT / PURPOSE_SPECIFIC | sum of stated builder components |  | NEEDS_INPUT |
| gibraltar-2026-credit-agreement-s7-05-restricted-payments-7 | §7.05 Restricted Payments (7) | RESTRICTED_PAYMENTS / UNLIMITED_BY_PURPOSE / PURPOSE_SPECIFIC |  |  | UNLIMITED_BY_PURPOSE |
| gibraltar-2026-credit-agreement-s7-05-restricted-payments-8 | §7.05 Restricted Payments (8) | RESTRICTED_PAYMENTS / UNLIMITED_BY_PURPOSE / PURPOSE_SPECIFIC |  |  | UNLIMITED_BY_PURPOSE |
| gibraltar-2026-credit-agreement-s7-05-restricted-payments-9 | §7.05 Restricted Payments (9) | RESTRICTED_PAYMENTS / UNLIMITED_BY_PURPOSE / PURPOSE_SPECIFIC |  |  | UNLIMITED_BY_PURPOSE |
| gibraltar-2026-credit-agreement-s7-05-restricted-payments-a | §7.05 Restricted Payments (a) | RESTRICTED_PAYMENTS / UNLIMITED_BY_PURPOSE / PURPOSE_SPECIFIC |  |  | UNLIMITED_BY_PURPOSE |
| gibraltar-2026-credit-agreement-s7-05-restricted-payments-a-2 | §7.05 Restricted Payments (a) | RESTRICTED_PAYMENTS / UNLIMITED_BY_PURPOSE / PURPOSE_SPECIFIC |  |  | UNLIMITED_BY_PURPOSE |
| gibraltar-2026-credit-agreement-s7-05-restricted-payments-a-3 | §7.05 Restricted Payments (a) | RESTRICTED_PAYMENTS / UNLIMITED_BY_PURPOSE / PURPOSE_SPECIFIC |  |  | UNLIMITED_BY_PURPOSE |
| gibraltar-2026-credit-agreement-s7-05-restricted-payments-b | §7.05 Restricted Payments (b) | RESTRICTED_PAYMENTS / UNLIMITED_BY_PURPOSE / PURPOSE_SPECIFIC |  |  | UNLIMITED_BY_PURPOSE |
| gibraltar-2026-credit-agreement-s7-05-restricted-payments-b-17 | §7.05 Restricted Payments (b)(17) | RESTRICTED_PAYMENTS / GROWER_GREATER_OF / PURPOSE_SPECIFIC | greater of fixed dollar and percent of metric |  | NEEDS_INPUT |
| gibraltar-2026-credit-agreement-s7-05-restricted-payments-b-2 | §7.05 Restricted Payments (b) | RESTRICTED_PAYMENTS / PCT_OF_METRIC / PURPOSE_SPECIFIC | 5.0% of Market Capitalization |  | NEEDS_INPUT |
| gibraltar-2026-credit-agreement-s7-05-restricted-payments-b-3 | §7.05 Restricted Payments (b) | RESTRICTED_PAYMENTS / RATIO_BASED / PURPOSE_SPECIFIC | Consolidated Total Net Leverage Ratio no greater than 3.35 to 1.00 |  | NEEDS_INPUT |
| gibraltar-2026-credit-agreement-s7-05-restricted-payments-b-4 | §7.05 Restricted Payments (b) | RESTRICTED_PAYMENTS / RATIO_BASED / PURPOSE_SPECIFIC | Consolidated Total Net Leverage Ratio no greater than 3.60 to 1.00 |  | NEEDS_INPUT |
| gibraltar-2026-credit-agreement-s7-05-restricted-payments-b-i | §7.05 Restricted Payments (b)(i) | RESTRICTED_PAYMENTS / GROWER_GREATER_OF / PURPOSE_SPECIFIC | greater of fixed dollar and percent of metric |  | NEEDS_INPUT |
| gibraltar-2026-credit-agreement-s7-05-restricted-payments-c | §7.05 Restricted Payments (c) | RESTRICTED_PAYMENTS / BUILDER_AVAILABLE_AMOUNT / GENERAL | sum of stated builder components |  | NEEDS_INPUT |
| gibraltar-2026-credit-agreement-s7-05-restricted-payments-c-2 | §7.05 Restricted Payments (c) | RESTRICTED_PAYMENTS / RECLASS / PURPOSE_SPECIFIC |  |  | NEEDS_INPUT |
| gibraltar-2026-credit-agreement-s7-08-financial-covenants-a | §7.08 Financial Covenants (a) | FINANCIAL_COVENANT / RATIO_BASED / PURPOSE_SPECIFIC | Consolidated Total Net Leverage Ratio |  | NEEDS_INPUT |
| gibraltar-2026-credit-agreement-s7-08-financial-covenants-b | §7.08 Financial Covenants (b) | FINANCIAL_COVENANT / RATIO_BASED / PURPOSE_SPECIFIC | Consolidated Interest Coverage Ratio less than 3.00 to 1.00 |  | NEEDS_INPUT |

## mtn-2026-tenth-ar

| basket | section | type | cap formula | computed value | status |
| --- | --- | --- | --- | --- | --- |
| mtn-ca-tenth-ar-10-10-sale-of-assets-10 | §10.10 Sale of Assets | OTHER / PCT_OF_METRIC / PURPOSE_SPECIFIC | 10% of Total Assets (measured prior to giving effect to such sale |  | NEEDS_INPUT |
| mtn-ca-tenth-ar-10-11-acquisitions-mergers-and-dissolutions-15-days | §10.11 Acquisitions, Mergers, and Dissolutions | MERGER / STATED_PERIOD / PURPOSE_SPECIFIC | 15 days | 15 DAYS | COMPUTED |
| mtn-ca-tenth-ar-10-11-acquisitions-mergers-and-dissolutions-4-00-to-1-00 | §10.11 Acquisitions, Mergers, and Dissolutions | MERGER / UNKNOWN / PURPOSE_SPECIFIC |  |  | NEEDS_INPUT |
| mtn-ca-tenth-ar-10-11-acquisitions-mergers-and-dissolutions-5-days | §10.11 Acquisitions, Mergers, and Dissolutions | MERGER / STATED_PERIOD / PURPOSE_SPECIFIC | 5 days | 5 DAYS | COMPUTED |
| mtn-ca-tenth-ar-10-11-acquisitions-mergers-and-dissolutions-50-000-000 | §10.11 Acquisitions, Mergers, and Dissolutions | MERGER / UNKNOWN / PURPOSE_SPECIFIC |  |  | NEEDS_INPUT |
| mtn-ca-tenth-ar-10-11-acquisitions-mergers-and-dissolutions-6-25-to-1-00 | §10.11 Acquisitions, Mergers, and Dissolutions | MERGER / UNKNOWN / PURPOSE_SPECIFIC |  |  | NEEDS_INPUT |
| mtn-ca-tenth-ar-10-2-payment-of-obligations-150-000-000 | §10.2 Payment of Obligations | OTHER / UNKNOWN / PURPOSE_SPECIFIC |  |  | NEEDS_INPUT |
| mtn-ca-tenth-ar-10-8-loans-advances-and-investments-10-000-000 | §10.8 Loans, Advances and Investments | INVESTMENT / FIXED_DOLLAR / PURPOSE_SPECIFIC | $10,000,000 | 10000000 USD | COMPUTED |
| mtn-ca-tenth-ar-10-8-loans-advances-and-investments-100 | §10.8 Loans, Advances and Investments | INVESTMENT / PCT_OF_METRIC / PURPOSE_SPECIFIC | 100% of market value by marketable obligations issued or unconditionally guaranteed by an Approved Jurisdiction or issued by any agency of an Approved Jurisdiction and |  | NEEDS_INPUT |
| mtn-ca-tenth-ar-10-8-loans-advances-and-investments-100-000-000 | §10.8 Loans, Advances and Investments | INVESTMENT / UNKNOWN / PURPOSE_SPECIFIC |  |  | NEEDS_INPUT |
| mtn-ca-tenth-ar-10-8-loans-advances-and-investments-15-000-000 | §10.8 Loans, Advances and Investments | INVESTMENT / FIXED_DOLLAR / PURPOSE_SPECIFIC | $15,000,000 | 15000000 USD | COMPUTED |
| mtn-ca-tenth-ar-10-8-loans-advances-and-investments-150-000-000 | §10.8 Loans, Advances and Investments | INVESTMENT / UNKNOWN / PURPOSE_SPECIFIC |  |  | NEEDS_INPUT |
| mtn-ca-tenth-ar-10-8-loans-advances-and-investments-3-75-to-1-00 | §10.8 Loans, Advances and Investments | INVESTMENT / UNKNOWN / PURPOSE_SPECIFIC |  |  | NEEDS_INPUT |
| mtn-ca-tenth-ar-10-8-loans-advances-and-investments-650-000 | §10.8 Loans, Advances and Investments | INVESTMENT / FIXED_DOLLAR / PURPOSE_SPECIFIC | $650,000, | 650000 USD | COMPUTED |
| mtn-ca-tenth-ar-10-9-distributions-100 | §10.9 Distributions | RESTRICTED_PAYMENTS / PCT_OF_METRIC / PURPOSE_SPECIFIC | 100% of such deficit |  | NEEDS_INPUT |
| mtn-ca-tenth-ar-10-9-distributions-100-000 | §10.9 Distributions | RESTRICTED_PAYMENTS / UNKNOWN / PURPOSE_SPECIFIC |  |  | NEEDS_INPUT |
| mtn-ca-tenth-ar-10-9-distributions-150-000-000 | §10.9 Distributions | RESTRICTED_PAYMENTS / UNKNOWN / PURPOSE_SPECIFIC |  |  | NEEDS_INPUT |
| mtn-ca-tenth-ar-10-9-distributions-160-000-000 | §10.9 Distributions | RESTRICTED_PAYMENTS / GROWER_GREATER_OF / PURPOSE_SPECIFIC | greater of fixed dollar and percent of metric |  | NEEDS_INPUT |
| mtn-ca-tenth-ar-10-9-distributions-2-000-000 | §10.9 Distributions | RESTRICTED_PAYMENTS / UNKNOWN / PURPOSE_SPECIFIC |  |  | NEEDS_INPUT |
| mtn-ca-tenth-ar-10-9-distributions-20 | §10.9 Distributions | RESTRICTED_PAYMENTS / PCT_OF_METRIC / PURPOSE_SPECIFIC | 20% of Adjusted EBITDA for the trailing twelve month period ended on the last day of the most-recently ended fiscal quarter (as calculated in the Compliance Certificat |  | NEEDS_INPUT |
| mtn-ca-tenth-ar-10-9-distributions-200-000-000 | §10.9 Distributions | RESTRICTED_PAYMENTS / FIXED_DOLLAR / PURPOSE_SPECIFIC | $200,000,000, | 200000000 USD | COMPUTED |
| mtn-ca-tenth-ar-10-9-distributions-3-75-to-1-00 | §10.9 Distributions | RESTRICTED_PAYMENTS / UNKNOWN / PURPOSE_SPECIFIC |  |  | NEEDS_INPUT |
| mtn-ca-tenth-ar-10-9-distributions-3-75-to-1-00-2 | §10.9 Distributions | RESTRICTED_PAYMENTS / UNKNOWN / PURPOSE_SPECIFIC |  |  | NEEDS_INPUT |
| mtn-ca-tenth-ar-10-9-distributions-50 | §10.9 Distributions | RESTRICTED_PAYMENTS / PCT_OF_METRIC / PURPOSE_SPECIFIC | 50% of Consolidated Net Income from and after February 1 |  | NEEDS_INPUT |
| mtn-ca-tenth-ar-10-9-distributions-75-000-000 | §10.9 Distributions | RESTRICTED_PAYMENTS / UNKNOWN / PURPOSE_SPECIFIC |  |  | NEEDS_INPUT |
| mtn-ca-tenth-ar-11-1-maximum-leverage-ratio-6-25-to-1-00 | §11.1 Maximum Leverage Ratio | FINANCIAL_COVENANT / UNKNOWN / PURPOSE_SPECIFIC |  |  | NEEDS_INPUT |
| mtn-ca-tenth-ar-11-2-interest-coverage-ratio-2-00-to-1-00 | §11.2 Interest Coverage Ratio | FINANCIAL_COVENANT / UNKNOWN / PURPOSE_SPECIFIC |  |  | NEEDS_INPUT |
| mtn-ca-tenth-ar-11-3-senior-secured-leverage-ratio-4-00-to-1-00 | §11.3 Senior Secured Leverage Ratio | FINANCIAL_COVENANT / UNKNOWN / PURPOSE_SPECIFIC |  |  | NEEDS_INPUT |
| mtn-ca-tenth-ar-12-1-payment-of-obligation-10-business-days | §12.1 Payment of Obligation | OTHER / STATED_PERIOD / PURPOSE_SPECIFIC | 10 Business Days | 10 BUSINESS_DAYS | COMPUTED |
| mtn-ca-tenth-ar-12-1-payment-of-obligation-3-business-days | §12.1 Payment of Obligation | OTHER / STATED_PERIOD / PURPOSE_SPECIFIC | 3 Business Days | 3 BUSINESS_DAYS | COMPUTED |
| mtn-ca-tenth-ar-12-3-debtor-relief-60-days | §12.3 Debtor Relief | DEBT_INCURRENCE / STATED_PERIOD / PURPOSE_SPECIFIC | 60 days | 60 DAYS | COMPUTED |
| mtn-ca-tenth-ar-12-4-judgments-and-attachments-15-000-000 | §12.4 Judgments and Attachments | OTHER / FIXED_DOLLAR / PURPOSE_SPECIFIC | $15,000,000 | 15000000 USD | COMPUTED |
| mtn-ca-tenth-ar-12-4-judgments-and-attachments-15-000-000-2 | §12.4 Judgments and Attachments | OTHER / UNKNOWN / PURPOSE_SPECIFIC |  |  | NEEDS_INPUT |
| mtn-ca-tenth-ar-12-4-judgments-and-attachments-60-days | §12.4 Judgments and Attachments | OTHER / STATED_PERIOD / PURPOSE_SPECIFIC | 60 days | 60 DAYS | COMPUTED |
| mtn-ca-tenth-ar-12-8-default-under-other-agreements-15-000-000 | §12.8 Default Under Other Agreements | OTHER / UNKNOWN / PURPOSE_SPECIFIC |  |  | NEEDS_INPUT |
| mtn-ca-tenth-ar-12-8-default-under-other-agreements-15-000-000-2 | §12.8 Default Under Other Agreements | OTHER / UNKNOWN / PURPOSE_SPECIFIC |  |  | NEEDS_INPUT |
| mtn-ca-tenth-ar-9-1-items-to-be-furnished-15-days | §9.1 Items to be Furnished | OTHER / STATED_PERIOD / PURPOSE_SPECIFIC | 15 days | 15 DAYS | COMPUTED |
| mtn-ca-tenth-ar-9-1-items-to-be-furnished-5-business-days | §9.1 Items to be Furnished | OTHER / STATED_PERIOD / PURPOSE_SPECIFIC | 5 Business Days | 5 BUSINESS_DAYS | COMPUTED |
| mtn-ca-tenth-ar-9-10-subsidiaries-30-days | §9.10 Subsidiaries | OTHER / STATED_PERIOD / PURPOSE_SPECIFIC | 30 days | 30 DAYS | COMPUTED |
| mtn-ca-tenth-ar-9-11-designation-and-re-designation-of-subsidiaries-30-days | §9.11 Designation and Re-designation of Subsidiaries | OTHER / STATED_PERIOD / PURPOSE_SPECIFIC | 30 days | 30 DAYS | COMPUTED |
| mtn-ca-tenth-ar-9-7-maintenance-of-existence-assets-and-business-25 | §9.7 Maintenance of Existence, Assets, and Business | AFFIRMATIVE / PCT_OF_METRIC / PURPOSE_SPECIFIC | 25% of Total Assets |  | NEEDS_INPUT |
| mtn-ca-tenth-ar-9-9-environmental-laws-30-days | §9.9 Environmental Laws | OTHER / STATED_PERIOD / PURPOSE_SPECIFIC | 30 days | 30 DAYS | COMPUTED |
| mtn-ca-tenth-ar-permitted-debt-b | Permitted Debt (b) | DEBT_INCURRENCE / UNLIMITED_BY_PURPOSE / PURPOSE_SPECIFIC |  |  | UNLIMITED_BY_PURPOSE |
| mtn-ca-tenth-ar-permitted-debt-c | Permitted Debt (c) | DEBT_INCURRENCE / UNLIMITED_BY_PURPOSE / PURPOSE_SPECIFIC |  |  | UNLIMITED_BY_PURPOSE |
| mtn-ca-tenth-ar-permitted-debt-d | Permitted Debt (d) | DEBT_INCURRENCE / UNLIMITED_BY_PURPOSE / PURPOSE_SPECIFIC |  |  | UNLIMITED_BY_PURPOSE |
| mtn-ca-tenth-ar-permitted-debt-e | Permitted Debt (e) | DEBT_INCURRENCE / UNLIMITED_BY_PURPOSE / PURPOSE_SPECIFIC |  |  | UNLIMITED_BY_PURPOSE |
| mtn-ca-tenth-ar-permitted-debt-f | Permitted Debt (f) | DEBT_INCURRENCE / UNLIMITED_BY_PURPOSE / PURPOSE_SPECIFIC |  |  | UNLIMITED_BY_PURPOSE |
| mtn-ca-tenth-ar-permitted-debt-h | Permitted Debt (h) | DEBT_INCURRENCE / UNLIMITED_BY_PURPOSE / PURPOSE_SPECIFIC |  |  | UNLIMITED_BY_PURPOSE |
| mtn-ca-tenth-ar-permitted-debt-i | Permitted Debt (i) | DEBT_INCURRENCE / UNLIMITED_BY_PURPOSE / PURPOSE_SPECIFIC |  |  | UNLIMITED_BY_PURPOSE |
| mtn-ca-tenth-ar-permitted-debt-j | Permitted Debt (j) | DEBT_INCURRENCE / UNLIMITED_BY_PURPOSE / PURPOSE_SPECIFIC |  |  | UNLIMITED_BY_PURPOSE |
| mtn-ca-tenth-ar-permitted-debt-k | Permitted Debt (k) | DEBT_INCURRENCE / PCT_OF_METRIC / PURPOSE_SPECIFIC | 5% of Total Assets at any time for (i) Capital Lease obligations (excluding |  | NEEDS_INPUT |
| mtn-ca-tenth-ar-permitted-debt-l | Permitted Debt (l) | DEBT_INCURRENCE / UNLIMITED_BY_PURPOSE / PURPOSE_SPECIFIC |  |  | UNLIMITED_BY_PURPOSE |
| mtn-ca-tenth-ar-permitted-debt-m | Permitted Debt (m) | DEBT_INCURRENCE / UNLIMITED_BY_PURPOSE / PURPOSE_SPECIFIC |  |  | UNLIMITED_BY_PURPOSE |
| mtn-ca-tenth-ar-permitted-debt-n | Permitted Debt (n) | DEBT_INCURRENCE / FIXED_DOLLAR / PURPOSE_SPECIFIC | $100,000,000 | 100000000 USD | COMPUTED |
| mtn-ca-tenth-ar-permitted-debt-o | Permitted Debt (o) | DEBT_INCURRENCE / FIXED_DOLLAR / PURPOSE_SPECIFIC | $50,000,000 | 50000000 USD | COMPUTED |
| mtn-ca-tenth-ar-permitted-debt-p | Permitted Debt (p) | DEBT_INCURRENCE / FIXED_DOLLAR / PURPOSE_SPECIFIC | $600,000,000 | 600000000 USD | COMPUTED |
| mtn-ca-tenth-ar-permitted-debt-p-2 | Permitted Debt (p) | DEBT_INCURRENCE / FIXED_DOLLAR / PURPOSE_SPECIFIC | $50,000,000 | 50000000 USD | COMPUTED |
| mtn-ca-tenth-ar-permitted-liens-a | Permitted Liens (a) | LIENS / UNLIMITED_BY_PURPOSE / PURPOSE_SPECIFIC |  |  | UNLIMITED_BY_PURPOSE |
| mtn-ca-tenth-ar-permitted-liens-b | Permitted Liens (b) | LIENS / UNLIMITED_BY_PURPOSE / PURPOSE_SPECIFIC |  |  | UNLIMITED_BY_PURPOSE |
| mtn-ca-tenth-ar-permitted-liens-d | Permitted Liens (d) | LIENS / UNLIMITED_BY_PURPOSE / PURPOSE_SPECIFIC |  |  | UNLIMITED_BY_PURPOSE |
| mtn-ca-tenth-ar-permitted-liens-e | Permitted Liens (e) | LIENS / UNLIMITED_BY_PURPOSE / PURPOSE_SPECIFIC |  |  | UNLIMITED_BY_PURPOSE |
| mtn-ca-tenth-ar-permitted-liens-f | Permitted Liens (f) | LIENS / UNLIMITED_BY_PURPOSE / PURPOSE_SPECIFIC |  |  | UNLIMITED_BY_PURPOSE |
| mtn-ca-tenth-ar-permitted-liens-g | Permitted Liens (g) | LIENS / UNLIMITED_BY_PURPOSE / PURPOSE_SPECIFIC |  |  | UNLIMITED_BY_PURPOSE |
| mtn-ca-tenth-ar-permitted-liens-h | Permitted Liens (h) | LIENS / UNLIMITED_BY_PURPOSE / PURPOSE_SPECIFIC |  |  | UNLIMITED_BY_PURPOSE |
| mtn-ca-tenth-ar-permitted-liens-i | Permitted Liens (i) | LIENS / UNLIMITED_BY_PURPOSE / PURPOSE_SPECIFIC |  |  | UNLIMITED_BY_PURPOSE |
| mtn-ca-tenth-ar-permitted-liens-j | Permitted Liens (j) | LIENS / UNLIMITED_BY_PURPOSE / PURPOSE_SPECIFIC |  |  | UNLIMITED_BY_PURPOSE |
| mtn-ca-tenth-ar-permitted-liens-k | Permitted Liens (k) | LIENS / UNLIMITED_BY_PURPOSE / PURPOSE_SPECIFIC |  |  | UNLIMITED_BY_PURPOSE |
| mtn-ca-tenth-ar-permitted-liens-l | Permitted Liens (l) | LIENS / UNLIMITED_BY_PURPOSE / PURPOSE_SPECIFIC |  |  | UNLIMITED_BY_PURPOSE |
| mtn-ca-tenth-ar-permitted-liens-m | Permitted Liens (m) | LIENS / UNLIMITED_BY_PURPOSE / PURPOSE_SPECIFIC |  |  | UNLIMITED_BY_PURPOSE |
| mtn-ca-tenth-ar-permitted-liens-n | Permitted Liens (n) | LIENS / UNLIMITED_BY_PURPOSE / PURPOSE_SPECIFIC |  |  | UNLIMITED_BY_PURPOSE |
| mtn-ca-tenth-ar-permitted-liens-o | Permitted Liens (o) | LIENS / UNLIMITED_BY_PURPOSE / PURPOSE_SPECIFIC |  |  | UNLIMITED_BY_PURPOSE |
| mtn-ca-tenth-ar-permitted-liens-p | Permitted Liens (p) | LIENS / FIXED_DOLLAR / PURPOSE_SPECIFIC | $250,000 | 250000 USD | COMPUTED |
| mtn-ca-tenth-ar-permitted-liens-q | Permitted Liens (q) | LIENS / UNLIMITED_BY_PURPOSE / PURPOSE_SPECIFIC |  |  | UNLIMITED_BY_PURPOSE |
| mtn-indenture-2024-4-06-compliance-certificate-120-days | §4.06 Compliance Certificate | REPORTING / STATED_PERIOD / PURPOSE_SPECIFIC | 120 days | 120 DAYS | COMPUTED |
| mtn-indenture-2024-4-06-compliance-certificate-30-business-days | §4.06 Compliance Certificate | REPORTING / STATED_PERIOD / PURPOSE_SPECIFIC | 30 Business Days | 30 BUSINESS_DAYS | COMPUTED |
| mtn-indenture-2024-4-08-repurchase-at-the-option-of-holders-upon-change--101 | §4.08 Repurchase at the Option of Holders upon Change of Control Repurchase Event | CHANGE_OF_CONTROL / PCT_OF_METRIC / PURPOSE_SPECIFIC | 101% of aggregate principal amount thereof plus accrued and unpaid interest |  | NEEDS_INPUT |
| mtn-indenture-2024-4-08-repurchase-at-the-option-of-holders-upon-change--15-days | §4.08 Repurchase at the Option of Holders upon Change of Control Repurchase Event | CHANGE_OF_CONTROL / STATED_PERIOD / PURPOSE_SPECIFIC | 15 days | 15 DAYS | COMPUTED |
| mtn-indenture-2024-4-08-repurchase-at-the-option-of-holders-upon-change--30-days | §4.08 Repurchase at the Option of Holders upon Change of Control Repurchase Event | CHANGE_OF_CONTROL / STATED_PERIOD / PURPOSE_SPECIFIC | 30 days | 30 DAYS | COMPUTED |
| mtn-indenture-2024-4-08-repurchase-at-the-option-of-holders-upon-change--60-days | §4.08 Repurchase at the Option of Holders upon Change of Control Repurchase Event | CHANGE_OF_CONTROL / STATED_PERIOD / PURPOSE_SPECIFIC | 60 days | 60 DAYS | COMPUTED |
| mtn-indenture-2024-4-08-repurchase-at-the-option-of-holders-upon-change--90 | §4.08 Repurchase at the Option of Holders upon Change of Control Repurchase Event | CHANGE_OF_CONTROL / STATED_PERCENT / PURPOSE_SPECIFIC | 90% | 90 PERCENT | COMPUTED |
| mtn-indenture-2024-4-09-limitation-on-asset-disposition-100 | §4.09 Limitation on Asset Disposition | ASSET_SALE / PCT_OF_METRIC / PURPOSE_SPECIFIC | 100% of Net Available Cash from such Asset Disposition is applied by the Issuer (or such Subsidiary |  | NEEDS_INPUT |
| mtn-indenture-2024-4-09-limitation-on-asset-disposition-100-2 | §4.09 Limitation on Asset Disposition | ASSET_SALE / PCT_OF_METRIC / PURPOSE_SPECIFIC | 100% of their principal amount without premium |  | NEEDS_INPUT |
| mtn-indenture-2024-4-09-limitation-on-asset-disposition-125-0-million | §4.09 Limitation on Asset Disposition | ASSET_SALE / FIXED_DOLLAR / PURPOSE_SPECIFIC | $125.0 million | 125000000 USD | COMPUTED |
| mtn-indenture-2024-4-09-limitation-on-asset-disposition-175-0 | §4.09 Limitation on Asset Disposition | ASSET_SALE / GROWER_GREATER_OF / PURPOSE_SPECIFIC | greater of fixed dollar and percent of metric |  | NEEDS_INPUT |
| mtn-indenture-2024-4-09-limitation-on-asset-disposition-180-days | §4.09 Limitation on Asset Disposition | ASSET_SALE / STATED_PERIOD / PURPOSE_SPECIFIC | 180 days | 180 DAYS | COMPUTED |
| mtn-indenture-2024-4-09-limitation-on-asset-disposition-180-days-2 | §4.09 Limitation on Asset Disposition | ASSET_SALE / STATED_PERIOD / PURPOSE_SPECIFIC | 180 days | 180 DAYS | COMPUTED |
| mtn-indenture-2024-4-09-limitation-on-asset-disposition-3-0 | §4.09 Limitation on Asset Disposition | ASSET_SALE / PCT_OF_METRIC / PURPOSE_SPECIFIC | 3.0% of Consolidated Total Assets (with the fair market value of each item of Designated Non-cash Consideration being measured at the time received and without giving e |  | NEEDS_INPUT |
| mtn-indenture-2024-4-09-limitation-on-asset-disposition-450-days | §4.09 Limitation on Asset Disposition | ASSET_SALE / STATED_PERIOD / PURPOSE_SPECIFIC | 450 days | 450 DAYS | COMPUTED |
| mtn-indenture-2024-4-09-limitation-on-asset-disposition-75 | §4.09 Limitation on Asset Disposition | ASSET_SALE / PCT_OF_METRIC / PURPOSE_SPECIFIC | 75% of consideration received by the Issuer or such Subsidiary is in the form of cash or cash equivalents |  | NEEDS_INPUT |
| mtn-indenture-2024-4-09-limitation-on-asset-disposition-ten-business-days | §4.09 Limitation on Asset Disposition | ASSET_SALE / STATED_PERIOD / PURPOSE_SPECIFIC | 10 Business Days | 10 BUSINESS_DAYS | COMPUTED |
| mtn-indenture-2024-4-11-limitation-on-liens-180-days | §4.11 Limitation on Liens | LIENS / STATED_PERIOD / PURPOSE_SPECIFIC | 180 days | 180 DAYS | COMPUTED |
| mtn-indenture-2024-4-11-limitation-on-liens-180-days-2 | §4.11 Limitation on Liens | LIENS / STATED_PERIOD / PURPOSE_SPECIFIC | 180 days | 180 DAYS | COMPUTED |
| mtn-indenture-2024-4-11-limitation-on-liens-425-0-million | §4.11 Limitation on Liens | LIENS / GROWER_GREATER_OF / PURPOSE_SPECIFIC | greater of fixed dollar and percent of metric |  | NEEDS_INPUT |
| mtn-indenture-2024-4-11-limitation-on-liens-90-days | §4.11 Limitation on Liens | LIENS / STATED_PERIOD / PURPOSE_SPECIFIC | 90 days | 90 DAYS | COMPUTED |
| mtn-indenture-2024-4-14-additional-note-guarantees-100-0-million | §4.14 Additional Note Guarantees | AFFIRMATIVE / UNKNOWN / PURPOSE_SPECIFIC |  |  | NEEDS_INPUT |
| mtn-indenture-2024-4-14-additional-note-guarantees-100-0-million-2 | §4.14 Additional Note Guarantees | AFFIRMATIVE / UNKNOWN / PURPOSE_SPECIFIC |  |  | NEEDS_INPUT |
| mtn-indenture-2024-4-14-additional-note-guarantees-30-business-days | §4.14 Additional Note Guarantees | AFFIRMATIVE / STATED_PERIOD / PURPOSE_SPECIFIC | 30 Business Days | 30 BUSINESS_DAYS | COMPUTED |
| mtn-indenture-2024-6-01-events-of-default-100-0-million | §6.01 Events of Default | EVENTS_OF_DEFAULT / UNKNOWN / PURPOSE_SPECIFIC |  |  | NEEDS_INPUT |
| mtn-indenture-2024-6-01-events-of-default-100-0-million-2 | §6.01 Events of Default | EVENTS_OF_DEFAULT / UNKNOWN / PURPOSE_SPECIFIC |  |  | NEEDS_INPUT |
| mtn-indenture-2024-6-01-events-of-default-30 | §6.01 Events of Default | EVENTS_OF_DEFAULT / STATED_PERCENT / PURPOSE_SPECIFIC | 30% | 30 PERCENT | COMPUTED |
| mtn-indenture-2024-6-01-events-of-default-30-consecutive-days | §6.01 Events of Default | EVENTS_OF_DEFAULT / UNLIMITED_BY_PURPOSE / PURPOSE_SPECIFIC |  |  | UNLIMITED_BY_PURPOSE |
| mtn-indenture-2024-6-01-events-of-default-30-days | §6.01 Events of Default | EVENTS_OF_DEFAULT / STATED_PERIOD / PURPOSE_SPECIFIC | 30 days | 30 DAYS | COMPUTED |
| mtn-indenture-2024-6-01-events-of-default-60-consecutive-days | §6.01 Events of Default | EVENTS_OF_DEFAULT / STATED_PERIOD / PURPOSE_SPECIFIC | 60 days | 60 DAYS | COMPUTED |
| mtn-indenture-2024-6-01-events-of-default-60-days | §6.01 Events of Default | EVENTS_OF_DEFAULT / STATED_PERIOD / PURPOSE_SPECIFIC | 60 days | 60 DAYS | COMPUTED |
| mtn-indenture-2024-6-02-acceleration-of-maturity-rescission-30 | §6.02 Acceleration of Maturity; Rescission | EVENTS_OF_DEFAULT / STATED_PERCENT / PURPOSE_SPECIFIC | 30% | 30 PERCENT | COMPUTED |
| mtn-indenture-2024-6-06-limitation-on-suits-25 | §6.06 Limitation on Suits | EVENTS_OF_DEFAULT / STATED_PERCENT / PURPOSE_SPECIFIC | 25% | 25 PERCENT | COMPUTED |
| mtn-indenture-2024-6-06-limitation-on-suits-60-days | §6.06 Limitation on Suits | EVENTS_OF_DEFAULT / STATED_PERIOD / PURPOSE_SPECIFIC | 60 days | 60 DAYS | COMPUTED |
| mtn-indenture-2024-6-12-undertaking-for-costs-10 | §6.12 Undertaking for Costs | EVENTS_OF_DEFAULT / STATED_PERCENT / PURPOSE_SPECIFIC | 10% | 10 PERCENT | COMPUTED |
| mtn-indenture-2024-definition-change-of-control-50 | §definition Change of Control | CHANGE_OF_CONTROL / PCT_OF_METRIC / PURPOSE_SPECIFIC | 50% of voting power of the Voting Stock of the Issuer |  | NEEDS_INPUT |
| mtn-indenture-2024-definition-change-of-control-50-2 | §definition Change of Control | CHANGE_OF_CONTROL / PCT_OF_METRIC / PURPOSE_SPECIFIC | 50% of voting power of the Voting Stock of such Permitted Person |  | NEEDS_INPUT |
| mtn-indenture-2024-definition-sale-and-leaseback-transaction-180-days | §definition Sale and Leaseback Transaction | ASSET_SALE / STATED_PERIOD / PURPOSE_SPECIFIC | 180 days | 180 DAYS | COMPUTED |
| mtn-indenture-2024-definition-sale-and-leaseback-transaction-36-months | §definition Sale and Leaseback Transaction | ASSET_SALE / STATED_PERIOD / PURPOSE_SPECIFIC | 36 months | 36 MONTHS | COMPUTED |
| mtn-indenture-2025-4-06-compliance-certificate-120-days | §4.06 Compliance Certificate | REPORTING / STATED_PERIOD / PURPOSE_SPECIFIC | 120 days | 120 DAYS | COMPUTED |
| mtn-indenture-2025-4-06-compliance-certificate-30-business-days | §4.06 Compliance Certificate | REPORTING / STATED_PERIOD / PURPOSE_SPECIFIC | 30 Business Days | 30 BUSINESS_DAYS | COMPUTED |
| mtn-indenture-2025-4-08-repurchase-at-the-option-of-holders-upon-change--101 | §4.08 Repurchase at the Option of Holders upon Change of Control Repurchase Event | CHANGE_OF_CONTROL / PCT_OF_METRIC / PURPOSE_SPECIFIC | 101% of aggregate principal amount thereof plus accrued and unpaid interest |  | NEEDS_INPUT |
| mtn-indenture-2025-4-08-repurchase-at-the-option-of-holders-upon-change--15-days | §4.08 Repurchase at the Option of Holders upon Change of Control Repurchase Event | CHANGE_OF_CONTROL / STATED_PERIOD / PURPOSE_SPECIFIC | 15 days | 15 DAYS | COMPUTED |
| mtn-indenture-2025-4-08-repurchase-at-the-option-of-holders-upon-change--30-days | §4.08 Repurchase at the Option of Holders upon Change of Control Repurchase Event | CHANGE_OF_CONTROL / STATED_PERIOD / PURPOSE_SPECIFIC | 30 days | 30 DAYS | COMPUTED |
| mtn-indenture-2025-4-08-repurchase-at-the-option-of-holders-upon-change--60-days | §4.08 Repurchase at the Option of Holders upon Change of Control Repurchase Event | CHANGE_OF_CONTROL / STATED_PERIOD / PURPOSE_SPECIFIC | 60 days | 60 DAYS | COMPUTED |
| mtn-indenture-2025-4-08-repurchase-at-the-option-of-holders-upon-change--90 | §4.08 Repurchase at the Option of Holders upon Change of Control Repurchase Event | CHANGE_OF_CONTROL / STATED_PERCENT / PURPOSE_SPECIFIC | 90% | 90 PERCENT | COMPUTED |
| mtn-indenture-2025-4-09-limitation-on-asset-disposition-100 | §4.09 Limitation on Asset Disposition | ASSET_SALE / PCT_OF_METRIC / PURPOSE_SPECIFIC | 100% of Net Available Cash from such Asset Disposition is applied by the Issuer (or such Subsidiary |  | NEEDS_INPUT |
| mtn-indenture-2025-4-09-limitation-on-asset-disposition-100-2 | §4.09 Limitation on Asset Disposition | ASSET_SALE / PCT_OF_METRIC / PURPOSE_SPECIFIC | 100% of their principal amount without premium |  | NEEDS_INPUT |
| mtn-indenture-2025-4-09-limitation-on-asset-disposition-125-0-million | §4.09 Limitation on Asset Disposition | ASSET_SALE / FIXED_DOLLAR / PURPOSE_SPECIFIC | $125.0 million | 125000000 USD | COMPUTED |
| mtn-indenture-2025-4-09-limitation-on-asset-disposition-175-0 | §4.09 Limitation on Asset Disposition | ASSET_SALE / GROWER_GREATER_OF / PURPOSE_SPECIFIC | greater of fixed dollar and percent of metric |  | NEEDS_INPUT |
| mtn-indenture-2025-4-09-limitation-on-asset-disposition-180-days | §4.09 Limitation on Asset Disposition | ASSET_SALE / STATED_PERIOD / PURPOSE_SPECIFIC | 180 days | 180 DAYS | COMPUTED |
| mtn-indenture-2025-4-09-limitation-on-asset-disposition-180-days-2 | §4.09 Limitation on Asset Disposition | ASSET_SALE / STATED_PERIOD / PURPOSE_SPECIFIC | 180 days | 180 DAYS | COMPUTED |
| mtn-indenture-2025-4-09-limitation-on-asset-disposition-3-0 | §4.09 Limitation on Asset Disposition | ASSET_SALE / PCT_OF_METRIC / PURPOSE_SPECIFIC | 3.0% of Consolidated Total Assets (with the fair market value of each item of Designated Non-cash Consideration being measured at the time received and without giving e |  | NEEDS_INPUT |
| mtn-indenture-2025-4-09-limitation-on-asset-disposition-450-days | §4.09 Limitation on Asset Disposition | ASSET_SALE / STATED_PERIOD / PURPOSE_SPECIFIC | 450 days | 450 DAYS | COMPUTED |
| mtn-indenture-2025-4-09-limitation-on-asset-disposition-75 | §4.09 Limitation on Asset Disposition | ASSET_SALE / PCT_OF_METRIC / PURPOSE_SPECIFIC | 75% of consideration received by the Issuer or such Subsidiary is in the form of cash or cash equivalents |  | NEEDS_INPUT |
| mtn-indenture-2025-4-09-limitation-on-asset-disposition-ten-business-days | §4.09 Limitation on Asset Disposition | ASSET_SALE / STATED_PERIOD / PURPOSE_SPECIFIC | 10 Business Days | 10 BUSINESS_DAYS | COMPUTED |
| mtn-indenture-2025-4-11-limitation-on-liens-180-days | §4.11 Limitation on Liens | LIENS / STATED_PERIOD / PURPOSE_SPECIFIC | 180 days | 180 DAYS | COMPUTED |
| mtn-indenture-2025-4-11-limitation-on-liens-180-days-2 | §4.11 Limitation on Liens | LIENS / STATED_PERIOD / PURPOSE_SPECIFIC | 180 days | 180 DAYS | COMPUTED |
| mtn-indenture-2025-4-11-limitation-on-liens-425-0-million | §4.11 Limitation on Liens | LIENS / GROWER_GREATER_OF / PURPOSE_SPECIFIC | greater of fixed dollar and percent of metric |  | NEEDS_INPUT |
| mtn-indenture-2025-4-11-limitation-on-liens-90-days | §4.11 Limitation on Liens | LIENS / STATED_PERIOD / PURPOSE_SPECIFIC | 90 days | 90 DAYS | COMPUTED |
| mtn-indenture-2025-4-14-additional-note-guarantees-100-0-million | §4.14 Additional Note Guarantees | AFFIRMATIVE / UNKNOWN / PURPOSE_SPECIFIC |  |  | NEEDS_INPUT |
| mtn-indenture-2025-4-14-additional-note-guarantees-100-0-million-2 | §4.14 Additional Note Guarantees | AFFIRMATIVE / UNKNOWN / PURPOSE_SPECIFIC |  |  | NEEDS_INPUT |
| mtn-indenture-2025-4-14-additional-note-guarantees-30-business-days | §4.14 Additional Note Guarantees | AFFIRMATIVE / STATED_PERIOD / PURPOSE_SPECIFIC | 30 Business Days | 30 BUSINESS_DAYS | COMPUTED |
| mtn-indenture-2025-6-01-events-of-default-100-0-million | §6.01 Events of Default | EVENTS_OF_DEFAULT / UNKNOWN / PURPOSE_SPECIFIC |  |  | NEEDS_INPUT |
| mtn-indenture-2025-6-01-events-of-default-100-0-million-2 | §6.01 Events of Default | EVENTS_OF_DEFAULT / UNKNOWN / PURPOSE_SPECIFIC |  |  | NEEDS_INPUT |
| mtn-indenture-2025-6-01-events-of-default-30 | §6.01 Events of Default | EVENTS_OF_DEFAULT / STATED_PERCENT / PURPOSE_SPECIFIC | 30% | 30 PERCENT | COMPUTED |
| mtn-indenture-2025-6-01-events-of-default-30-consecutive-days | §6.01 Events of Default | EVENTS_OF_DEFAULT / UNLIMITED_BY_PURPOSE / PURPOSE_SPECIFIC |  |  | UNLIMITED_BY_PURPOSE |
| mtn-indenture-2025-6-01-events-of-default-30-days | §6.01 Events of Default | EVENTS_OF_DEFAULT / STATED_PERIOD / PURPOSE_SPECIFIC | 30 days | 30 DAYS | COMPUTED |
| mtn-indenture-2025-6-01-events-of-default-60-consecutive-days | §6.01 Events of Default | EVENTS_OF_DEFAULT / STATED_PERIOD / PURPOSE_SPECIFIC | 60 days | 60 DAYS | COMPUTED |
| mtn-indenture-2025-6-01-events-of-default-60-days | §6.01 Events of Default | EVENTS_OF_DEFAULT / STATED_PERIOD / PURPOSE_SPECIFIC | 60 days | 60 DAYS | COMPUTED |
| mtn-indenture-2025-6-02-acceleration-of-maturity-rescission-30 | §6.02 Acceleration of Maturity; Rescission | EVENTS_OF_DEFAULT / STATED_PERCENT / PURPOSE_SPECIFIC | 30% | 30 PERCENT | COMPUTED |
| mtn-indenture-2025-6-06-limitation-on-suits-25 | §6.06 Limitation on Suits | EVENTS_OF_DEFAULT / STATED_PERCENT / PURPOSE_SPECIFIC | 25% | 25 PERCENT | COMPUTED |
| mtn-indenture-2025-6-06-limitation-on-suits-60-days | §6.06 Limitation on Suits | EVENTS_OF_DEFAULT / STATED_PERIOD / PURPOSE_SPECIFIC | 60 days | 60 DAYS | COMPUTED |
| mtn-indenture-2025-6-12-undertaking-for-costs-10 | §6.12 Undertaking for Costs | EVENTS_OF_DEFAULT / STATED_PERCENT / PURPOSE_SPECIFIC | 10% | 10 PERCENT | COMPUTED |
| mtn-indenture-2025-definition-change-of-control-50 | §definition Change of Control | CHANGE_OF_CONTROL / PCT_OF_METRIC / PURPOSE_SPECIFIC | 50% of voting power of the Voting Stock of the Issuer |  | NEEDS_INPUT |
| mtn-indenture-2025-definition-change-of-control-50-2 | §definition Change of Control | CHANGE_OF_CONTROL / PCT_OF_METRIC / PURPOSE_SPECIFIC | 50% of voting power of the Voting Stock of such Permitted Person |  | NEEDS_INPUT |
| mtn-indenture-2025-definition-sale-and-leaseback-transaction-180-days | §definition Sale and Leaseback Transaction | ASSET_SALE / STATED_PERIOD / PURPOSE_SPECIFIC | 180 days | 180 DAYS | COMPUTED |
| mtn-indenture-2025-definition-sale-and-leaseback-transaction-36-months | §definition Sale and Leaseback Transaction | ASSET_SALE / STATED_PERIOD / PURPOSE_SPECIFIC | 36 months | 36 MONTHS | COMPUTED |

## wor-2026-fifth-ar-credit-agreement

| basket | section | type | cap formula | computed value | status |
| --- | --- | --- | --- | --- | --- |
| wor-2026-fifth-ar-5-01-information-14-days | §5.01 Information | REPORTING / STATED_PERIOD / PURPOSE_SPECIFIC | 14 days | 14 DAYS | COMPUTED |
| wor-2026-fifth-ar-5-01-information-45-days | §5.01 Information | REPORTING / STATED_PERIOD / PURPOSE_SPECIFIC | 45 days | 45 DAYS | COMPUTED |
| wor-2026-fifth-ar-5-01-information-90-days | §5.01 Information | REPORTING / STATED_PERIOD / PURPOSE_SPECIFIC | 90 days | 90 DAYS | COMPUTED |
| wor-2026-fifth-ar-6-01-limitation-on-indebtedness-of-restricted-subsidi-10 | §6.01 Limitation on Indebtedness of Restricted Subsidiaries | DEBT_INCURRENCE / PCT_OF_METRIC / PURPOSE_SPECIFIC | 10% of Consolidated Net Tangible Assets |  | NEEDS_INPUT |
| wor-2026-fifth-ar-6-01-limitation-on-indebtedness-of-restricted-subsidi-30-000-000 | §6.01 Limitation on Indebtedness of Restricted Subsidiaries | DEBT_INCURRENCE / FIXED_DOLLAR / PURPOSE_SPECIFIC | $30,000,000 | 30000000 USD | COMPUTED |
| wor-2026-fifth-ar-6-03-investments-150-000-000 | §6.03 Investments | INVESTMENT / FIXED_DOLLAR / PURPOSE_SPECIFIC | $150,000,000 | 150000000 USD | COMPUTED |
| wor-2026-fifth-ar-6-03-investments-150-000-000-2 | §6.03 Investments | INVESTMENT / UNKNOWN / PURPOSE_SPECIFIC |  |  | NEEDS_INPUT |
| wor-2026-fifth-ar-6-07-designation-of-restricted-and-unrestricted-subsi-30 | §6.07 Designation of Restricted and Unrestricted Subsidiaries | OTHER / PCT_OF_METRIC / PURPOSE_SPECIFIC | 30% of consolidated operating income of the Company and its Consolidated Subsidiaries for the most recently completed four fiscal quarters |  | NEEDS_INPUT |
| wor-2026-fifth-ar-6-13-financial-covenants-55 | §6.13 Financial Covenants | FINANCIAL_COVENANT / STATED_PERCENT / PURPOSE_SPECIFIC | 55% | 55 PERCENT | COMPUTED |
| wor-2026-fifth-ar-permitted-liens | Permitted Liens | LIENS / UNKNOWN / PURPOSE_SPECIFIC |  |  | NEEDS_INPUT |
| wor-2026-fifth-ar-permitted-liens-a | Permitted Liens (a) | LIENS / UNLIMITED_BY_PURPOSE / PURPOSE_SPECIFIC |  |  | UNLIMITED_BY_PURPOSE |
| wor-2026-fifth-ar-permitted-liens-b | Permitted Liens (b) | LIENS / UNLIMITED_BY_PURPOSE / PURPOSE_SPECIFIC |  |  | UNLIMITED_BY_PURPOSE |
| wor-2026-fifth-ar-permitted-liens-c | Permitted Liens (c) | LIENS / UNLIMITED_BY_PURPOSE / PURPOSE_SPECIFIC |  |  | UNLIMITED_BY_PURPOSE |
| wor-2026-fifth-ar-permitted-liens-d | Permitted Liens (d) | LIENS / UNLIMITED_BY_PURPOSE / PURPOSE_SPECIFIC |  |  | UNLIMITED_BY_PURPOSE |
| wor-2026-fifth-ar-vii-events-of-default-30-days | §VII Events of Default | OTHER / STATED_PERIOD / PURPOSE_SPECIFIC | 30 days | 30 DAYS | COMPUTED |
| wor-2026-fifth-ar-vii-events-of-default-30-days-2 | §VII Events of Default | OTHER / STATED_PERIOD / PURPOSE_SPECIFIC | 30 days | 30 DAYS | COMPUTED |
| wor-2026-fifth-ar-vii-events-of-default-5-days | §VII Events of Default | OTHER / STATED_PERIOD / PURPOSE_SPECIFIC | 5 days | 5 DAYS | COMPUTED |
| wor-2026-fifth-ar-vii-events-of-default-50-000-000 | §VII Events of Default | OTHER / FIXED_DOLLAR / PURPOSE_SPECIFIC | $50,000,000 | 50000000 USD | COMPUTED |
| wor-2026-fifth-ar-vii-events-of-default-50-000-000-2 | §VII Events of Default | OTHER / UNKNOWN / PURPOSE_SPECIFIC |  |  | NEEDS_INPUT |

## mhk-2026-credit-agreement

| basket | section | type | cap formula | computed value | status |
| --- | --- | --- | --- | --- | --- |
| mhk-2026-credit-agreement-6-01-financial-statements-45-days | §6.01 Financial Statements | OTHER / STATED_PERIOD / PURPOSE_SPECIFIC | 45 days | 45 DAYS | COMPUTED |
| mhk-2026-credit-agreement-6-01-financial-statements-90-days | §6.01 Financial Statements | OTHER / STATED_PERIOD / PURPOSE_SPECIFIC | 90 days | 90 DAYS | COMPUTED |
| mhk-2026-credit-agreement-6-11-use-of-proceeds-25 | §6.11 Use of Proceeds | OTHER / PCT_OF_METRIC / PURPOSE_SPECIFIC | 25% of value of the assets (either of the applicable Borrower only or of the Company and its Restricted Subsidiaries on a consolidated basis) subject to the provisions |  | NEEDS_INPUT |
| mhk-2026-credit-agreement-6-14-covenant-to-guarantee-30-days | §6.14 Covenant to Guarantee | AFFIRMATIVE / STATED_PERIOD / PURPOSE_SPECIFIC | 30 days | 30 DAYS | COMPUTED |
| mhk-2026-credit-agreement-6-16-extended-letters-of-credit-105 | §6.16 Extended Letters of Credit | OTHER / PCT_OF_METRIC / PURPOSE_SPECIFIC | 105% of maximum face amount of each Extended Letter of Credit |  | NEEDS_INPUT |
| mhk-2026-credit-agreement-6-16-extended-letters-of-credit-105-2 | §6.16 Extended Letters of Credit | OTHER / PCT_OF_METRIC / PURPOSE_SPECIFIC | 105% of maximum face amount of each such Letter of Credit |  | NEEDS_INPUT |
| mhk-2026-credit-agreement-6-16-extended-letters-of-credit-5-business-days | §6.16 Extended Letters of Credit | OTHER / STATED_PERIOD / PURPOSE_SPECIFIC | 5 Business Days | 5 BUSINESS_DAYS | COMPUTED |
| mhk-2026-credit-agreement-7-01-liens-1-500-000-000 | §7.01 Liens | LIENS / UNKNOWN / PURPOSE_SPECIFIC |  |  | NEEDS_INPUT |
| mhk-2026-credit-agreement-7-01-liens-10 | §7.01 Liens | LIENS / PCT_OF_METRIC / PURPOSE_SPECIFIC | 10% of Total Consolidated Assets of the Company and its Restricted Subsidiaries |  | NEEDS_INPUT |
| mhk-2026-credit-agreement-7-01-liens-10-2 | §7.01 Liens | LIENS / PCT_OF_METRIC / PURPOSE_SPECIFIC | 10% of Total Consolidated Assets of the Company and its Restricted Subsidiaries so long |  | NEEDS_INPUT |
| mhk-2026-credit-agreement-7-03-indebtedness-1-500-000-000 | §7.03 Indebtedness | DEBT_INCURRENCE / UNKNOWN / PURPOSE_SPECIFIC |  |  | NEEDS_INPUT |
| mhk-2026-credit-agreement-7-03-indebtedness-10 | §7.03 Indebtedness | DEBT_INCURRENCE / PCT_OF_METRIC / PURPOSE_SPECIFIC | 10% of Total Consolidated Assets of the Company and its Restricted Subsidiaries |  | NEEDS_INPUT |
| mhk-2026-credit-agreement-7-03-indebtedness-10-2 | §7.03 Indebtedness | DEBT_INCURRENCE / PCT_OF_METRIC / PURPOSE_SPECIFIC | 10% of Total Consolidated Assets of the Company and its Restricted Subsidiaries so long |  | NEEDS_INPUT |
| mhk-2026-credit-agreement-7-12-financial-covenant-3-50-to-1-00 | §7.12 Financial Covenant | FINANCIAL_COVENANT / UNKNOWN / PURPOSE_SPECIFIC |  |  | NEEDS_INPUT |
| mhk-2026-credit-agreement-8-01-events-of-default-102 | §8.01 Events of Default | OTHER / PCT_OF_METRIC / PURPOSE_SPECIFIC | 102% of initial principal amount of such Indebtedness being repurchased |  | NEEDS_INPUT |
| mhk-2026-credit-agreement-8-01-events-of-default-30-days | §8.01 Events of Default | OTHER / STATED_PERIOD / PURPOSE_SPECIFIC | 30 days | 30 DAYS | COMPUTED |
| mhk-2026-credit-agreement-8-01-events-of-default-5-days | §8.01 Events of Default | OTHER / STATED_PERIOD / PURPOSE_SPECIFIC | 5 days | 5 DAYS | COMPUTED |
| mhk-2026-credit-agreement-definition-change-of-control-100 | §definition Change of Control | CHANGE_OF_CONTROL / PCT_OF_METRIC / PURPOSE_SPECIFIC | 100% of Equity Interests of each Borrower (other than the Company) |  | NEEDS_INPUT |
| mhk-2026-credit-agreement-s7-01-liens-a | §7.01 Liens (a) | LIENS / UNLIMITED_BY_PURPOSE / PURPOSE_SPECIFIC |  |  | UNLIMITED_BY_PURPOSE |
| mhk-2026-credit-agreement-s7-01-liens-b | §7.01 Liens (b) | LIENS / UNLIMITED_BY_PURPOSE / PURPOSE_SPECIFIC |  |  | UNLIMITED_BY_PURPOSE |
| mhk-2026-credit-agreement-s7-01-liens-c | §7.01 Liens (c) | LIENS / STATED_PERIOD / PURPOSE_SPECIFIC | 30 days | 30 DAYS | COMPUTED |
| mhk-2026-credit-agreement-s7-01-liens-d | §7.01 Liens (d) | LIENS / UNLIMITED_BY_PURPOSE / PURPOSE_SPECIFIC |  |  | UNLIMITED_BY_PURPOSE |
| mhk-2026-credit-agreement-s7-01-liens-e | §7.01 Liens (e) | LIENS / UNLIMITED_BY_PURPOSE / PURPOSE_SPECIFIC |  |  | UNLIMITED_BY_PURPOSE |
| mhk-2026-credit-agreement-s7-01-liens-f-2 | §7.01 Liens (f)(2) | LIENS / UNKNOWN / PURPOSE_SPECIFIC |  |  | NEEDS_INPUT |
| mhk-2026-credit-agreement-s7-01-liens-f-i | §7.01 Liens (f)(i) | LIENS / FIXED_DOLLAR / PURPOSE_SPECIFIC | $100,000,000, | 100000000 USD | COMPUTED |
| mhk-2026-credit-agreement-s7-03-indebtedness-a | §7.03 Indebtedness (a) | DEBT_INCURRENCE / UNLIMITED_BY_PURPOSE / PURPOSE_SPECIFIC |  |  | UNLIMITED_BY_PURPOSE |
| mhk-2026-credit-agreement-s7-03-indebtedness-b | §7.03 Indebtedness (b) | DEBT_INCURRENCE / UNLIMITED_BY_PURPOSE / PURPOSE_SPECIFIC |  |  | UNLIMITED_BY_PURPOSE |
| mhk-2026-credit-agreement-s7-03-indebtedness-c | §7.03 Indebtedness (c) | DEBT_INCURRENCE / UNLIMITED_BY_PURPOSE / PURPOSE_SPECIFIC |  |  | UNLIMITED_BY_PURPOSE |
| mhk-2026-credit-agreement-s7-03-indebtedness-d | §7.03 Indebtedness (d) | DEBT_INCURRENCE / UNLIMITED_BY_PURPOSE / PURPOSE_SPECIFIC |  |  | UNLIMITED_BY_PURPOSE |
| mhk-2026-credit-agreement-s7-03-indebtedness-e | §7.03 Indebtedness (e) | DEBT_INCURRENCE / UNLIMITED_BY_PURPOSE / PURPOSE_SPECIFIC |  |  | UNLIMITED_BY_PURPOSE |
| mhk-2026-credit-agreement-s7-03-indebtedness-f | §7.03 Indebtedness (f) | DEBT_INCURRENCE / FIXED_DOLLAR / PURPOSE_SPECIFIC | $700,000,000 | 700000000 USD | COMPUTED |
| mhk-2026-credit-agreement-s7-04-fundamental-changes-a | §7.04 Fundamental Changes (a) | OTHER / UNLIMITED_BY_PURPOSE / PURPOSE_SPECIFIC |  |  | UNLIMITED_BY_PURPOSE |
| mhk-2026-credit-agreement-s7-04-fundamental-changes-a-2 | §7.04 Fundamental Changes (a) | OTHER / PCT_OF_METRIC / PURPOSE_SPECIFIC | 102% of initial principal amount of such Indebtedness being repurchased |  | NEEDS_INPUT |
| mhk-2026-credit-agreement-s7-04-fundamental-changes-a-3 | §7.04 Fundamental Changes (a) | OTHER / UNLIMITED_BY_PURPOSE / PURPOSE_SPECIFIC |  |  | UNLIMITED_BY_PURPOSE |
| mhk-2026-credit-agreement-s7-04-fundamental-changes-b | §7.04 Fundamental Changes (b) | OTHER / RATIO_BASED / PURPOSE_SPECIFIC | Consolidated Interest Coverage Ratio less than 3.50 to 1.00 |  | NEEDS_INPUT |
| mhk-2026-credit-agreement-s7-04-fundamental-changes-b-2 | §7.04 Fundamental Changes (b) | OTHER / UNLIMITED_BY_PURPOSE / PURPOSE_SPECIFIC |  |  | UNLIMITED_BY_PURPOSE |
| mhk-2026-credit-agreement-s7-04-fundamental-changes-c | §7.04 Fundamental Changes (c) | OTHER / UNLIMITED_BY_PURPOSE / PURPOSE_SPECIFIC |  |  | UNLIMITED_BY_PURPOSE |
| mhk-2026-credit-agreement-s7-04-fundamental-changes-d | §7.04 Fundamental Changes (d) | OTHER / RATIO_BASED / PURPOSE_SPECIFIC | Consolidated Net Leverage Ratio |  | NEEDS_INPUT |
| mhk-2026-credit-agreement-s7-04-fundamental-changes-e | §7.04 Fundamental Changes (e) | OTHER / UNLIMITED_BY_PURPOSE / PURPOSE_SPECIFIC |  |  | UNLIMITED_BY_PURPOSE |
| mhk-2026-credit-agreement-s7-04-fundamental-changes-f | §7.04 Fundamental Changes (f) | OTHER / UNLIMITED_BY_PURPOSE / PURPOSE_SPECIFIC |  |  | UNLIMITED_BY_PURPOSE |
| mhk-2026-credit-agreement-s7-04-fundamental-changes-g | §7.04 Fundamental Changes (g) | OTHER / UNLIMITED_BY_PURPOSE / PURPOSE_SPECIFIC |  |  | UNLIMITED_BY_PURPOSE |
| mhk-2026-credit-agreement-s7-04-fundamental-changes-h | §7.04 Fundamental Changes (h) | OTHER / UNLIMITED_BY_PURPOSE / PURPOSE_SPECIFIC |  |  | UNLIMITED_BY_PURPOSE |
| mhk-2026-credit-agreement-s7-04-fundamental-changes-i | §7.04 Fundamental Changes (i) | OTHER / UNKNOWN / PURPOSE_SPECIFIC |  |  | NEEDS_INPUT |
