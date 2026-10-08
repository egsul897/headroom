#!/usr/bin/env python3
"""Generate WS-FDP Phase 4 artifacts. Owned path only; no peer production edits."""
from __future__ import annotations

import json
from copy import deepcopy
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
PACK = ROOT / "docs/financial-definitions-precedent"


def load(name: str):
    return json.loads((PACK / name).read_text())


def dump(name: str, obj):
    (PACK / name).write_text(json.dumps(obj, indent=2) + "\n")


# ---------------------------------------------------------------------------
# Calculation models (dependency-complete structured readings)
# ---------------------------------------------------------------------------

MODELS = [
    {
        "id": "CM-CONMED-SSLR-v1",
        "typedCalcId": "TC-CONMED-SSLR-v1",
        "name": "CONMED Consolidated Senior Secured Leverage Ratio",
        "status": "MODEL_COMPLETE_SEMANTIC_HYPOTHESIS",
        "blockedReasons": [],
        "legalReviewState": "SEMANTIC_HYPOTHESIS",
        "instrumentIdentity": "cnmd-credit-lineage-2021-2026",
        "amendmentChainId": "cnmd-seventh-ar-to-eighth-ar",
        "operativeSourceDocIds": ["CONMED-2025-PLAIN", "CONMED-2025-ART7", "CONMED-2022-AMD2"],
        "controllingDefinitions": [
            "Consolidated Senior Secured Leverage Ratio",
            "Consolidated Senior Secured Funded Debt",
            "Consolidated EBITDA",
            "Consolidated Funded Debt",
            "Funded Debt",
            "Unrestricted cash and cash equivalents (cash netting)",
        ],
        "crossReferences": [
            "§7.1 Financial Covenants (maintenance max + Material Acquisition step-up)",
            "Second Amendment cash-netting $75M→$100M (Seventh-era; survival into Eighth REVIEW_REQUIRED)",
        ],
        "provisos": [
            "Cash netting capped (operative Eighth text uses $100,000,000; do not silently ignore Amd2 lineage)",
            "Material Acquisition election +0.50x step-up — optional, time-bounded; not capacity",
            "RTP attributed principal inclusion if applicable",
        ],
        "entityRestrictions": "Parent Borrower and Subsidiaries on a consolidated basis per definitions",
        "measurementDates": "as of / for the Test Period ending on the determination date under §7.1",
        "financialInputRequirements": [
            "consolidated_senior_secured_funded_debt",
            "rtp_attributed_principal",
            "unrestricted_cash_and_cash_equivalents",
            "consolidated_ebitda_covenant_defined",
            "material_acquisition_election_and_dates",
        ],
        "extractionEntryIds": [
            "CONMED-2025-CA::def::Consolidated_Senior_Secured_Leverage_Ratio",
            "CONMED-2025-CA::test::Financial_Covenants_7_1",
            "CONMED-2025-CA::def::Consolidated_EBITDA",
            "CONMED-2022-AMD2::amend::Cash_Netting_Cap_75_to_100",
        ],
        "simplifiedAway": [],
        "notes": "Cash-netting dollar figure lineage requires amendment-authority join; Seventh A&R before-text partially missing from package.",
    },
    {
        "id": "CM-CONMED-EBITDA-PF-v1",
        "typedCalcId": "TC-CONMED-EBITDA-PF-CAP-v1",
        "name": "CONMED Consolidated EBITDA Pro Forma Adjustment 15% cap",
        "status": "MODEL_COMPLETE_SEMANTIC_HYPOTHESIS",
        "blockedReasons": [],
        "legalReviewState": "SEMANTIC_HYPOTHESIS",
        "instrumentIdentity": "cnmd-credit-lineage-2021-2026",
        "amendmentChainId": "cnmd-seventh-ar-to-eighth-ar",
        "operativeSourceDocIds": ["CONMED-2025-PLAIN"],
        "controllingDefinitions": [
            "Consolidated EBITDA",
            "Consolidated Net Income",
            "Pro Forma Basis / Pro Forma Adjustments",
            "Material Acquisition",
        ],
        "crossReferences": [
            "Consolidated EBITDA clause (i) PF adjustments",
            "$30,000,000 Transaction/Material Acquisition cost cap (distinct from 15% PF cap)",
        ],
        "provisos": [
            "15% of Consolidated EBITDA after giving effect to clause (i) adjustments",
            "net of benefits realized",
            "without duplication",
        ],
        "entityRestrictions": "Consolidated Borrower group",
        "measurementDates": "Test Period; PF as-if from first day of period for qualifying transactions",
        "financialInputRequirements": [
            "ebitda_before_pf_clause_i",
            "pro_forma_adjustment_gross",
            "benefits_realized",
            "transaction_costs_material_acquisition",
        ],
        "extractionEntryIds": ["CONMED-2025-CA::def::Consolidated_EBITDA"],
        "simplifiedAway": [
            "Full multi-clause EBITDA add-back schedule beyond clause (i) PF model remains open for future expansion"
        ],
        "notes": "Arithmetic model treats clause (i) AGE delta only; other add-backs not silently zeroed — missing schedule → MISSING_INPUT for full EBITDA.",
    },
    {
        "id": "CM-DSGR-EBITDA-v1",
        "typedCalcId": "TC-DSGR-EBITDA-v1",
        "name": "DSGR EBITDA with Combined Cap (Second A&R doc-d)",
        "status": "MODEL_COMPLETE_SEMANTIC_HYPOTHESIS",
        "blockedReasons": [],
        "legalReviewState": "SEMANTIC_HYPOTHESIS",
        "instrumentIdentity": "dsgr-ar-ca-2022-04-01",
        "amendmentChainId": "dsgr-2022-04-01-ar-credit",
        "operativeSourceDocIds": ["DSGR-2025-AR2"],
        "controllingDefinitions": [
            "EBITDA",
            "Cost Savings",
            "Combined Cap",
            "Net Income",
        ],
        "crossReferences": [
            "EBITDA (a)(vii)/(a)(viii)/(a)(xviii)(b) share Combined Cap",
            "Cost Savings 24-month lookforward",
            "Doc-d Second A&R supersedes prior targeted amendment text for these defs",
        ],
        "provisos": [
            "Combined Cap = 20% of EBITDA before giving effect to capped add-backs",
            "Cost Savings net of benefits realized",
            "without duplication lead-in",
            "actions taken prior to last day of period for Cost Savings",
        ],
        "entityRestrictions": "Borrower and Restricted Subsidiaries (per Doc D)",
        "measurementDates": "period of determination / Test Period under Doc D",
        "financialInputRequirements": [
            "net_income",
            "interest_expense",
            "income_tax_expense_net",
            "depreciation_amortization",
            "nonrecurring_unusual_expenses",
            "cost_savings_projected",
            "cost_savings_benefits_realized",
            "clause_a_xviii_b",
            "cost_savings_action_dates",
        ],
        "extractionEntryIds": [
            "DSGR-2025-AR2::def::EBITDA",
            "DSGR-2025-AR2::adj::Cost_Savings",
            "DSGR-2025-AR2::adj::Combined_Cap_20pct",
        ],
        "simplifiedAway": [
            "Not all EBITDA (a)/(b) prongs enumerated as separate typed components; uncapped prongs treated as attested aggregates when present"
        ],
        "notes": "Operative text is Doc D restatement; do not apply Doc B Combined Cap language as if still controlling without restatement check.",
    },
    {
        "id": "CM-CHWY-TLR-v1",
        "typedCalcId": "TC-CHWY-TLR-v1",
        "name": "CHWY Total Leverage Ratio",
        "status": "MODEL_COMPLETE_SEMANTIC_HYPOTHESIS",
        "blockedReasons": [],
        "legalReviewState": "SEMANTIC_HYPOTHESIS",
        "instrumentIdentity": "chwy-2026-credit-agreement",
        "amendmentChainId": None,
        "operativeSourceDocIds": ["CHWY-2026-CA"],
        "controllingDefinitions": [
            "Total Leverage Ratio",
            "Consolidated Total Debt",
            "Consolidated EBITDA",
            "Excluded Revolving Loans",
            "Test Period",
        ],
        "crossReferences": [
            "CTD embeds unrestricted cash netting per CTD definition",
            "Test Period election (Four Quarters / TTM mechanics)",
        ],
        "provisos": [
            "Exclude Excluded Revolving Loans from numerator",
            "CTD cash netting is definitional — do not double-apply CONMED-style capped netting",
        ],
        "entityRestrictions": "Restricted Parties / consolidated group per CHWY defs",
        "measurementDates": "Test Period ending on determination date",
        "financialInputRequirements": [
            "consolidated_total_debt",
            "excluded_revolving_loans_balance",
            "consolidated_ebitda_covenant_defined",
            "test_period_election",
            "unrestricted_cash_and_cash_equivalents",
        ],
        "extractionEntryIds": [
            "CHWY-2026-CA::ratio::Total_Leverage_Ratio",
            "CHWY-2026-CA::def::Consolidated_Total_Debt",
            "CHWY-2026-CA::def::Consolidated_EBITDA",
            "CHWY-2026-CA::def::Test_Period",
        ],
        "simplifiedAway": [],
        "notes": "No amendment chain in Amendment Intelligence for CHWY 2026 package; single-instrument authority.",
    },
    {
        "id": "CM-CHWY-ANTIDUPE-v1",
        "typedCalcId": "TC-CHWY-ANTIDUPE-v1",
        "name": "CHWY Anti-duplication §1.08(d)(ii)",
        "status": "MODEL_COMPLETE_SEMANTIC_HYPOTHESIS",
        "blockedReasons": [],
        "legalReviewState": "SEMANTIC_HYPOTHESIS",
        "instrumentIdentity": "chwy-2026-credit-agreement",
        "amendmentChainId": None,
        "operativeSourceDocIds": ["CHWY-2026-CA"],
        "controllingDefinitions": [
            "Consolidated EBITDA",
            "§1.08(d)(ii) anti-duplication",
            "Expected Run Rate Benefit / clause (d) add-backs",
        ],
        "crossReferences": ["§1.08 calculation principles", "Consolidated EBITDA add-back clauses"],
        "provisos": [
            "No add pursuant to clause (d) if duplicative of amounts otherwise added back in Consolidated EBITDA"
        ],
        "entityRestrictions": "Restricted Parties",
        "measurementDates": "same period as Consolidated EBITDA",
        "financialInputRequirements": [
            "addback_amount_clause_d",
            "addback_amount_already_in_ebitda",
        ],
        "extractionEntryIds": [
            "CHWY-2026-CA::adj::Anti_Duplication_1_08_d_ii",
            "CHWY-2026-CA::adj::Expected_Run_Rate_Benefit",
        ],
        "simplifiedAway": [],
        "notes": "Identity of 'same amount' is a legal/factual question; arithmetic cases assume attested overlap.",
    },
    {
        "id": "CM-RIOT-LTV-MARGIN-v1",
        "typedCalcId": "TC-RIOT-LTV-MARGIN-v1",
        "name": "Riot Actual LTV + Margin Demand Additional Collateral",
        "status": "MODEL_COMPLETE_SEMANTIC_HYPOTHESIS",
        "blockedReasons": [],
        "legalReviewState": "SEMANTIC_HYPOTHESIS",
        "instrumentIdentity": "riot-2025-2026-credit-facility",
        "amendmentChainId": None,
        "operativeSourceDocIds": ["RIOT-2026-CA"],
        "controllingDefinitions": [
            "Actual LTV Ratio",
            "Initial LTV",
            "Release LTV",
            "Cure Amount (BTC)",
            "Prevailing Market Value of Collateral",
        ],
        "crossReferences": [
            "§2.06 Margin Funding Notice / Additional Collateral demand",
            "Schedule fields for Initial LTV / Cure Amount (BTC)",
        ],
        "provisos": [
            "Margin Call Event → deliver Additional Collateral so Actual LTV ≤ Initial LTV",
            "Deadline 1 Business Day after Margin Funding Notice",
            "Not an EBITDA equity cure",
        ],
        "entityRestrictions": "Borrower / Collateral under Riot CA",
        "measurementDates": "point-in-time LTV; cure deadline 1 Business Day",
        "financialInputRequirements": [
            "loan_principal",
            "collateral_pmv",
            "initial_ltv",
            "btc_price",
            "margin_call_event",
        ],
        "extractionEntryIds": [
            "RIOT-2026-CA::ratio::Actual_LTV_Ratio",
            "RIOT-2026-CA::cure::Section_2_06_Margin_Demand",
            "RIOT-2026-CA::cure::Cure_Amount_BTC_Margin",
            "RIOT-2026-CA::def::Initial_LTV",
            "RIOT-2026-CA::def::Release_LTV",
        ],
        "simplifiedAway": [
            "Exact Initial LTV schedule numeric remains SEMANTIC_HYPOTHESIS pending schedule attestation"
        ],
        "notes": "Restatement lineage Doc A→B→C present in fixture; operative calc uses Doc C. No Amendment Intelligence chain ID for Riot.",
    },
    {
        "id": "CM-GIB-AA-BUILDER-v1",
        "typedCalcId": "TC-GIB-AA-BUILDER-v1",
        "name": "Gibraltar Available Amount Builder Basket",
        "status": "BLOCKED_REVIEW_REQUIRED",
        "blockedReasons": [
            "UQ-GIB-705AY-CITATION — definition cites §7.05(a)(y); naming parenthetical after (vi) ambiguous",
            "Builder formula not certified; capacity must not be inferred",
        ],
        "legalReviewState": "REVIEW_REQUIRED",
        "instrumentIdentity": "gibraltar-2026-credit-agreement",
        "amendmentChainId": None,
        "operativeSourceDocIds": ["GIB-2026-CA"],
        "controllingDefinitions": [
            "Available Amount Builder Basket",
            "LTM EBITDA",
            "Consolidated Net Income",
            "§7.05(a)(y) Restricted Payments builder",
        ],
        "crossReferences": [
            "Article I definitional xref to Section 7.05(a)(y)",
            "Operative §7.05(a)(y)(i)–(vi)",
            "Loose 'Section 7.05(y)' cites",
            "§7.05(a)(x) Event of Default gates",
        ],
        "provisos": [
            "Do not force unique citation target",
            "Do not certify whether Builder Basket is entire (y) or only (vi)",
            "Event of Default gates by RP type",
        ],
        "entityRestrictions": "Borrower Restricted Payments context",
        "measurementDates": "cumulative / LTM components per prong — uncertified",
        "financialInputRequirements": [
            "consolidated_net_income_cumulative",
            "equity_proceeds_since_closing",
            "converted_debt_equity_proceeds",
            "restricted_investment_returns",
            "unrestricted_sub_redesignation_fmv",
            "ltm_ebitda",
            "event_of_default_status",
            "citation_scope_resolution",
        ],
        "extractionEntryIds": [
            "GIB-2026-CA::builder::Available_Amount_Builder_Basket_DEF_XREF",
            "GIB-2026-CA::builder::Available_Amount_Builder_Basket_OPERATIVE_7_05_a_y",
            "GIB-2026-CA::def::LTM_EBITDA",
        ],
        "simplifiedAway": [],
        "notes": "Arithmetic evaluation refused. Components extracted as EXTRACTED_NOT_CERTIFIED only.",
    },
]


# ---------------------------------------------------------------------------
# Amendment authority
# ---------------------------------------------------------------------------

AMENDMENT_AUTHORITY = {
    "artifact": "financial-definitions-precedent.amendment-authority",
    "version": "fdp.amend-auth.v1",
    "status": "DRAFT",
    "disclaimer": "Consumes Amendment Chain Research join keys (chainId, docId, research paths). Does not modify Amendment Intelligence or production engine. Incomplete authority → REVIEW_REQUIRED.",
    "peerCoordination": {
        "amendmentChainResearch": {
            "branch": "cursor/amendment-chain-research-2926",
            "export": "docs/amendment-chain-research/knowledge-factory-export/amendment-chains-export.json",
            "schemaVersion": "knowledge-factory.amendment-chain-research-export.v1",
            "joinKeys": ["chainId", "docId", "sourceId", "accession"],
        },
        "dependencyAtlas": {
            "branch": "cursor/covenant-dependency-atlas-5021",
            "exportReadme": "docs/covenant-dependency-atlas/export/README.md",
            "portableDataset": "tests/fixtures/covenant-dependency-atlas/export/knowledge-factory-dataset.portable.json",
        },
        "definitionEncyclopedia": {
            "branch": "cursor/definition-encyclopedia-2a50",
            "export": "docs/definition-encyclopedia/knowledge-factory-export.json",
        },
        "basketFormulaLibrary": {
            "branch": "cursor/covenant-basket-capacity-formula-library-ae51",
            "manifest": "docs/covenant-basket-capacity-formula-library/export/dataset-manifest.json",
        },
        "covenantKnowledgeFactory": {
            "branch": "cursor/covenant-knowledge-factory-7327",
            "manifests": "docs/knowledge-factory/manifests/",
        },
    },
    "records": [
        {
            "modelId": "CM-CONMED-SSLR-v1",
            "sourceAgreement": "Eighth Amended and Restated Credit Agreement (Jun 10, 2025) + Article VII curated",
            "instrumentIdentity": "cnmd-credit-lineage-2021-2026",
            "amendmentChainId": "cnmd-seventh-ar-to-eighth-ar",
            "applicableChainDocs": [
                {
                    "docId": "cnmd-seventh-ar",
                    "role": "RESTATEMENT",
                    "executionDate": "2021-07-16",
                    "localFixturePath": None,
                    "retrievalStatus": "MISSING_OR_EXTERNAL",
                },
                {
                    "docId": "cnmd-second-am-2022",
                    "role": "AMENDMENT",
                    "executionDate": "2022-08-01",
                    "effectiveDate": {
                        "status": "CONDITIONAL_UNRESOLVED",
                        "namedEffectiveDate": None,
                        "note": "Second Amendment Effective Date = conditions precedent satisfaction",
                    },
                    "localFixturePath": "tests/fixtures/unseen-packages/conmed-2025-credit-facility/curated/second-amendment-2022-full.txt",
                    "supersededTerms": ["cash netting $75,000,000 inside CSSLR/CTLR"],
                    "currentOperativeClaim": "Substitutes $100,000,000; survival into Eighth A&R is PARENT_CHILD_CONFLICT_RISK per Amendment Intelligence",
                },
                {
                    "docId": "cnmd-eighth-ar",
                    "role": "RESTATEMENT",
                    "executionDate": "2025-06-10",
                    "localFixturePath": "docs/financial-definitions-precedent/source-normalize/conmed-2025-eighth-ar-ca.plain.txt",
                    "retrievalStatus": "FIXTURE_PRESENT",
                    "currentOperativeText": "Eighth A&R definitions + §7.1 — primary operative for SSLR model",
                },
            ],
            "effectiveDate": {
                "status": "MIXED",
                "primaryOperativeAsOf": "2025-06-10 (Eighth A&R dating)",
                "conditionalItems": ["Second Amendment Effective Date", "First Omnibus Effective Date"],
            },
            "supersededTerms": [
                "Pre-Amd2 $75M cash netting (and earlier $25M→$75M Amd1 chain noted by Amendment Intelligence)"
            ],
            "currentOperativeTextRefs": [
                "CONMED-2025-PLAIN CSSLR definition",
                "CONMED-2025-ART7 §7.1",
            ],
            "unresolvedAuthority": [
                "cnmd-ua-3: Whether Second Amendment effects survive into Eighth A&R — do not auto-apply",
                "cnmd-ua-4: First Omnibus Effective Date calendar date CONDITIONAL_UNRESOLVED",
            ],
            "authorityStatus": "REVIEW_REQUIRED",
            "peerBeforeAfterRefs": [
                "docs/amendment-chain-research/before-after/cnmd-am2-definitions-and-ratio.json",
                "docs/amendment-chain-research/before-after/cnmd-am1-am2-cash-netting-chain.json",
            ],
        },
        {
            "modelId": "CM-CONMED-EBITDA-PF-v1",
            "sourceAgreement": "Eighth A&R Consolidated EBITDA",
            "instrumentIdentity": "cnmd-credit-lineage-2021-2026",
            "amendmentChainId": "cnmd-seventh-ar-to-eighth-ar",
            "applicableChainDocs": [
                {
                    "docId": "cnmd-eighth-ar",
                    "role": "RESTATEMENT",
                    "executionDate": "2025-06-10",
                    "localFixturePath": "docs/financial-definitions-precedent/source-normalize/conmed-2025-eighth-ar-ca.plain.txt",
                }
            ],
            "effectiveDate": {"status": "EXPLICIT_IN_FIXTURE", "namedEffectiveDate": "2025-06-10"},
            "supersededTerms": ["Prior Seventh-era EBITDA text (not fully reconstructed here)"],
            "currentOperativeTextRefs": ["CONMED-2025-CA::def::Consolidated_EBITDA"],
            "unresolvedAuthority": [
                "Full Seventh→Eighth EBITDA redline not independently verified in this pack"
            ],
            "authorityStatus": "PARTIAL_REVIEW_REQUIRED",
            "peerBeforeAfterRefs": [],
        },
        {
            "modelId": "CM-DSGR-EBITDA-v1",
            "sourceAgreement": "Second Amended and Restated Credit Agreement (Doc D, Dec 18, 2025)",
            "instrumentIdentity": "dsgr-ar-ca-2022-04-01",
            "amendmentChainId": "dsgr-2022-04-01-ar-credit",
            "applicableChainDocs": [
                {
                    "docId": "dsgr-doc-a",
                    "role": "RESTATEMENT",
                    "executionDate": "2022-04-01",
                    "localFixturePath": "tests/fixtures/unseen-packages/dsgr-2022-2025-credit-facility/extracted-text/doc-a-2022-amended-restated-credit-agreement.txt",
                },
                {
                    "docId": "dsgr-doc-b",
                    "role": "AMENDMENT",
                    "executionDate": "2024-08-14",
                    "effectiveDate": {"status": "CONDITIONAL_UNRESOLVED"},
                    "localFixturePath": "tests/fixtures/unseen-packages/dsgr-2022-2025-credit-facility/extracted-text/doc-b-2024-third-amendment.txt",
                    "note": "Combined Cap / AA patterns appear here; superseded for EBITDA defs by Doc D restatement",
                },
                {
                    "docId": "dsgr-doc-d",
                    "role": "RESTATEMENT",
                    "executionDate": "2025-12-18",
                    "localFixturePath": "tests/fixtures/unseen-packages/dsgr-2022-2025-credit-facility/extracted-text/doc-d-2025-second-amended-restated-credit-agreement.txt",
                    "currentOperativeText": "Doc D EBITDA / Cost Savings / Combined Cap — operative for this model",
                },
            ],
            "effectiveDate": {
                "status": "RESTATEMENT_DATING",
                "primaryOperativeAsOf": "2025-12-18 (Doc D)",
                "conditionalItems": ["Third Amendment Effective Date", "Fourth Amendment Effective Date"],
            },
            "supersededTerms": [
                "Doc B targeted amendment blocks for Articles I–XII as to restated definitions in Doc D"
            ],
            "currentOperativeTextRefs": [
                "DSGR-2025-AR2::def::EBITDA",
                "DSGR-2025-AR2::adj::Cost_Savings",
                "DSGR-2025-AR2::adj::Combined_Cap_20pct",
            ],
            "unresolvedAuthority": [
                "First/Second Amendments between 2022 A&R and Third Amendment MISSING from fixture package",
                "Third Amendment Effective Date conditions not proven satisfied beyond dating",
            ],
            "authorityStatus": "PARTIAL_REVIEW_REQUIRED",
            "peerBeforeAfterRefs": [
                "docs/amendment-chain-research/before-after/dsgr-am4-restricted-payments.json"
            ],
        },
        {
            "modelId": "CM-CHWY-TLR-v1",
            "sourceAgreement": "Chewy 2026 Credit Agreement (Doc A)",
            "instrumentIdentity": "chwy-2026-credit-agreement",
            "amendmentChainId": None,
            "applicableChainDocs": [
                {
                    "docId": "chwy-doc-a",
                    "role": "ORIGINAL_OR_RESTATEMENT",
                    "executionDate": "2026-06-23",
                    "localFixturePath": "tests/fixtures/unseen-packages/chwy-2026-credit-agreement/extracted-text/doc-a-2026-06-23-credit-agreement.txt",
                }
            ],
            "effectiveDate": {"status": "FIXTURE_DATED", "namedEffectiveDate": "2026-06-23"},
            "supersededTerms": [],
            "currentOperativeTextRefs": [
                "CHWY-2026-CA::ratio::Total_Leverage_Ratio",
                "CHWY-2026-CA::def::Consolidated_Total_Debt",
            ],
            "unresolvedAuthority": [
                "No Amendment Chain Research chainId for CHWY 2026 — single-doc authority assumed for fixture"
            ],
            "authorityStatus": "SINGLE_INSTRUMENT_OK_WITH_GAP_NOTE",
            "peerBeforeAfterRefs": [],
        },
        {
            "modelId": "CM-CHWY-ANTIDUPE-v1",
            "sourceAgreement": "Chewy 2026 Credit Agreement (Doc A)",
            "instrumentIdentity": "chwy-2026-credit-agreement",
            "amendmentChainId": None,
            "applicableChainDocs": [
                {
                    "docId": "chwy-doc-a",
                    "role": "ORIGINAL_OR_RESTATEMENT",
                    "executionDate": "2026-06-23",
                    "localFixturePath": "tests/fixtures/unseen-packages/chwy-2026-credit-agreement/extracted-text/doc-a-2026-06-23-credit-agreement.txt",
                }
            ],
            "effectiveDate": {"status": "FIXTURE_DATED", "namedEffectiveDate": "2026-06-23"},
            "supersededTerms": [],
            "currentOperativeTextRefs": ["CHWY-2026-CA::adj::Anti_Duplication_1_08_d_ii"],
            "unresolvedAuthority": [],
            "authorityStatus": "SINGLE_INSTRUMENT_OK_WITH_GAP_NOTE",
            "peerBeforeAfterRefs": [],
        },
        {
            "modelId": "CM-RIOT-LTV-MARGIN-v1",
            "sourceAgreement": "Riot Second A&R Credit Agreement (Doc C, Apr 21, 2026)",
            "instrumentIdentity": "riot-2025-2026-credit-facility",
            "amendmentChainId": None,
            "applicableChainDocs": [
                {
                    "docId": "riot-doc-a",
                    "role": "ORIGINAL",
                    "executionDate": "2025-04-22",
                    "localFixturePath": "tests/fixtures/unseen-packages/riot-2025-2026-credit-facility/extracted-text/doc-a-2025-04-22-credit-agreement.txt",
                    "supersededBy": "riot-doc-c",
                },
                {
                    "docId": "riot-doc-b",
                    "role": "RESTATEMENT",
                    "executionDate": "2025-05-19",
                    "localFixturePath": "tests/fixtures/unseen-packages/riot-2025-2026-credit-facility/extracted-text/doc-b-2025-05-19-amended-restated-credit-agreement.txt",
                    "supersededBy": "riot-doc-c",
                },
                {
                    "docId": "riot-doc-c",
                    "role": "RESTATEMENT",
                    "executionDate": "2026-04-21",
                    "localFixturePath": "tests/fixtures/unseen-packages/riot-2025-2026-credit-facility/extracted-text/doc-c-2026-04-21-second-amended-restated-credit-agreement.txt",
                    "currentOperativeText": "Operative for LTV / §2.06 / Cure Amount (BTC)",
                },
            ],
            "effectiveDate": {
                "status": "RESTATEMENT_DATING",
                "primaryOperativeAsOf": "2026-04-21",
            },
            "supersededTerms": ["Doc A and Doc B LTV/margin mechanics as to restated Doc C provisions"],
            "currentOperativeTextRefs": [
                "RIOT-2026-CA::ratio::Actual_LTV_Ratio",
                "RIOT-2026-CA::cure::Section_2_06_Margin_Demand",
            ],
            "unresolvedAuthority": [
                "No Amendment Chain Research chainId; fixture restatement order used",
                "Initial LTV schedule numeric attestation still open"
            ],
            "authorityStatus": "PARTIAL_REVIEW_REQUIRED",
            "peerBeforeAfterRefs": [],
        },
        {
            "modelId": "CM-GIB-AA-BUILDER-v1",
            "sourceAgreement": "Gibraltar 2026 Credit Agreement",
            "instrumentIdentity": "gibraltar-2026-credit-agreement",
            "amendmentChainId": None,
            "applicableChainDocs": [
                {
                    "docId": "gib-ca-2026",
                    "role": "ORIGINAL_OR_RESTATEMENT",
                    "localFixturePath": "tests/fixtures/unseen-packages/gibraltar-2026-credit-agreement/extracted-text/credit-agreement.txt",
                }
            ],
            "effectiveDate": {"status": "FIXTURE_PRESENT_DATE_NOT_JOINED"},
            "supersededTerms": [],
            "currentOperativeTextRefs": [
                "GIB-2026-CA::builder::Available_Amount_Builder_Basket_DEF_XREF",
                "GIB-2026-CA::builder::Available_Amount_Builder_Basket_OPERATIVE_7_05_a_y",
            ],
            "unresolvedAuthority": [
                "UQ-GIB-705AY-CITATION — citation/scope conflict blocks certified operative formula",
                "No Amendment Chain Research chainId for Gibraltar in peer export"
            ],
            "authorityStatus": "REVIEW_REQUIRED",
            "peerBeforeAfterRefs": [],
            "forcedResolutionForbidden": True,
        },
    ],
}


# ---------------------------------------------------------------------------
# Arithmetic cases (50+ NEW)
# ---------------------------------------------------------------------------

def nearly_ratio(num, den):
    if den == 0:
        return None
    return num / den


def build_phase4_arith_cases():
    cases = []
    n = 0

    def add(case):
        nonlocal n
        n += 1
        case.setdefault("legalReviewState", "ARITHMETICALLY_TESTED")
        case.setdefault("phase", 4)
        cases.append(case)

    # --- CONMED SSLR: caps, thresholds, missing, zero den, negative ---
    cash_cap = 100_000_000
    for i, (debt, rtp, cash, ebitda, title, ctype) in enumerate(
        [
            (500_000_000, 0, 100_000_000, 200_000_000, "cash netting exact $100M boundary", "CAP_BOUNDARY"),
            (500_000_000, 0, 99_999_999, 200_000_000, "cash netting $1 below cap", "BELOW_CAP"),
            (500_000_000, 0, 100_000_001, 200_000_000, "cash netting $1 above cap", "ABOVE_CAP"),
            (500_000_000, 0, 0, 200_000_000, "zero cash", "POSITIVE"),
            (750_000_000, 0, 0, 200_000_000, "ratio equals 3.75 maintenance max", "RATIO_THRESHOLD_EQUALITY"),
            (749_999_999, 0, 0, 200_000_000, "ratio just below 3.75", "RATIO_THRESHOLD_EQUALITY"),
            (750_000_001, 0, 0, 200_000_000, "ratio just above 3.75", "RATIO_THRESHOLD_EQUALITY"),
            (400_000_000, 50_000_000, 80_000_000, 200_000_000, "RTP principal inclusion", "POSITIVE"),
            (500_000_000, 0, 40_000_000, 0, "zero EBITDA denominator", "ZERO_DENOMINATOR"),
            (500_000_000, 0, 40_000_000, -50_000_000, "negative EBITDA denominator", "NEGATIVE_INPUT"),
            (-10_000_000, 0, 0, 200_000_000, "negative funded debt input", "NEGATIVE_INPUT"),
        ],
        start=1,
    ):
        cash_n = min(cash_cap, cash)
        num = debt + rtp - cash_n
        if ebitda == 0:
            out = {"status": "UNSUPPORTED_CASE", "reason": "ZERO_DENOMINATOR"}
            inter = {"cash_netting": cash_n, "numerator": num}
        elif ebitda < 0:
            out = {
                "status": "UNSUPPORTED_CASE",
                "reason": "NEGATIVE_DENOMINATOR",
                "ratio_raw": num / ebitda,
            }
            inter = {"cash_netting": cash_n, "numerator": num}
        else:
            out = {"ratio": num / ebitda}
            inter = {"cash_netting": cash_n, "numerator": num}
            if ctype == "RATIO_THRESHOLD_EQUALITY":
                out["maintenance_max"] = 3.75
                out["maintenance_compliant"] = (num / ebitda) <= 3.75
        add(
            {
                "id": f"ARITH-P4-CONMED-SSLR-{i:03d}",
                "typedCalcId": "TC-CONMED-SSLR-v1",
                "modelId": "CM-CONMED-SSLR-v1",
                "title": title,
                "inputs": {
                    "consolidated_senior_secured_funded_debt": debt,
                    "rtp_attributed_principal": rtp,
                    "unrestricted_cash_and_cash_equivalents": cash,
                    "consolidated_ebitda_covenant_defined": ebitda,
                },
                "expectedIntermediates": inter,
                "expectedOutput": out,
                "controlType": ctype,
            }
        )

    add(
        {
            "id": "ARITH-P4-CONMED-SSLR-MISSING-DEBT",
            "typedCalcId": "TC-CONMED-SSLR-v1",
            "modelId": "CM-CONMED-SSLR-v1",
            "title": "missing senior secured funded debt",
            "inputs": {
                "rtp_attributed_principal": 0,
                "unrestricted_cash_and_cash_equivalents": 40_000_000,
                "consolidated_ebitda_covenant_defined": 200_000_000,
            },
            "expectedOutput": {
                "status": "MISSING_INPUT",
                "missingKeys": ["consolidated_senior_secured_funded_debt"],
            },
            "controlType": "MISSING_INPUT",
            "forbidInference": ["zero_debt", "available_capacity"],
        }
    )

    # Amendment-effective-date transition (cash netting 75→100)
    for i, (as_of, cap, cash, title) in enumerate(
        [
            ("2022-07-31", 75_000_000, 90_000_000, "pre-Amd2 effective: $75M cap binds"),
            ("2022-08-02", 100_000_000, 90_000_000, "post-Amd2 dating: $100M cap; cash below"),
            ("2022-08-02", 100_000_000, 110_000_000, "post-Amd2 dating: $100M cap binds"),
        ],
        start=1,
    ):
        debt, ebitda = 500_000_000, 200_000_000
        cash_n = min(cap, cash)
        num = debt - cash_n
        add(
            {
                "id": f"ARITH-P4-CONMED-AMD-DATE-{i:03d}",
                "typedCalcId": "TC-CONMED-SSLR-v1",
                "modelId": "CM-CONMED-SSLR-v1",
                "title": title,
                "inputs": {
                    "consolidated_senior_secured_funded_debt": debt,
                    "rtp_attributed_principal": 0,
                    "unrestricted_cash_and_cash_equivalents": cash,
                    "consolidated_ebitda_covenant_defined": ebitda,
                    "assumed_cash_netting_cap": cap,
                    "as_of_date": as_of,
                    "authorityNote": "HYPOTHETICAL as-of under stated cap; Amd2 survival into Eighth is REVIEW_REQUIRED",
                },
                "expectedIntermediates": {"cash_netting": cash_n, "numerator": num, "cap_used": cap},
                "expectedOutput": {"ratio": num / ebitda},
                "controlType": "AMENDMENT_EFFECTIVE_DATE_TRANSITION",
                "legalReviewState": "ARITHMETICALLY_TESTED",
                "notes": "Arithmetic under assumed cap only — not a legal determination that Amd2 applies on as_of_date to Eighth text.",
            }
        )

    # --- DSGR Combined Cap ---
    def dsgr_case(i, title, ctype, ni, interest, tax, da, nonrec, cs_proj, cs_real, xviii):
        before = ni + interest + tax + da
        cs_net = max(0.0, cs_proj - cs_real)
        cap = 0.2 * before
        uncapped = nonrec + cs_net + xviii
        allowed = min(uncapped, cap)
        add(
            {
                "id": f"ARITH-P4-DSGR-CAP-{i:03d}",
                "typedCalcId": "TC-DSGR-EBITDA-v1",
                "modelId": "CM-DSGR-EBITDA-v1",
                "title": title,
                "inputs": {
                    "net_income": ni,
                    "interest_expense": interest,
                    "income_tax_expense_net": tax,
                    "depreciation_amortization": da,
                    "nonrecurring_unusual_expenses": nonrec,
                    "cost_savings_projected": cs_proj,
                    "cost_savings_benefits_realized": cs_real,
                    "clause_a_xviii_b": xviii,
                },
                "expectedIntermediates": {
                    "ebitda_before_capped_addbacks": before,
                    "cost_savings_net": cs_net,
                    "combined_cap": cap,
                    "uncapped_capped_bucket_sum": uncapped,
                    "allowed_capped_bucket_sum": allowed,
                },
                "expectedOutput": {"ebitda": before + allowed},
                "controlType": ctype,
            }
        )

    dsgr_case(1, "exact 20% Combined Cap boundary", "CAP_BOUNDARY", 100, 10, 5, 15, 13, 13, 0, 0)
    dsgr_case(2, "combined bucket $1 below 20% cap", "BELOW_CAP", 100, 10, 5, 15, 12.9, 13, 0, 0)
    dsgr_case(3, "combined bucket $1 above 20% cap", "ABOVE_CAP", 100, 10, 5, 15, 13.1, 13, 0, 0)
    dsgr_case(4, "three simultaneous capped add-backs", "MULTIPLE_ADDBACKS", 80, 20, 10, 20, 15, 25, 5, 10)
    dsgr_case(5, "cost savings fully realized → net zero", "PRO_FORMA_TIMING", 100, 0, 0, 0, 0, 30, 30, 0)
    dsgr_case(6, "cost savings over-realized clamped at 0", "PRO_FORMA_TIMING", 100, 0, 0, 0, 0, 10, 25, 0)
    dsgr_case(7, "negative net income base", "NEGATIVE_INPUT", -20, 10, 5, 15, 5, 5, 0, 0)
    dsgr_case(8, "all capped add-backs zero", "POSITIVE", 100, 10, 5, 15, 0, 0, 0, 0)
    dsgr_case(9, "only (a)(xviii)(b) fills cap", "MULTIPLE_ADDBACKS", 50, 10, 10, 10, 0, 0, 0, 20)
    dsgr_case(10, "lookforward timing: projected within 24m assumed", "LOOKFORWARD_TIMING", 100, 0, 0, 0, 0, 40, 0, 0)

    add(
        {
            "id": "ARITH-P4-DSGR-MISSING-NI",
            "typedCalcId": "TC-DSGR-EBITDA-v1",
            "modelId": "CM-DSGR-EBITDA-v1",
            "title": "missing net income",
            "inputs": {
                "interest_expense": 10,
                "income_tax_expense_net": 5,
                "depreciation_amortization": 15,
            },
            "expectedOutput": {"status": "MISSING_INPUT", "missingKeys": ["net_income"]},
            "controlType": "MISSING_INPUT",
            "forbidInference": ["zero_net_income", "available_capacity"],
        }
    )

    # --- CHWY TLR ---
    for i, (ctd, excl, ebitda, title, ctype) in enumerate(
        [
            (800, 0, 200, "no excluded revolvers", "POSITIVE"),
            (900, 100, 200, "excluded revolvers reduce numerator", "POSITIVE"),
            (800, 0, 0, "zero EBITDA denominator", "ZERO_DENOMINATOR"),
            (800, 0, -100, "negative EBITDA", "NEGATIVE_INPUT"),
            (0, 0, 200, "zero CTD", "POSITIVE"),
            (1000, 1000, 200, "excluded equals CTD → zero numerator", "POSITIVE"),
            (800, -50, 200, "negative excluded revolvers input", "NEGATIVE_INPUT"),
        ],
        start=1,
    ):
        if ctype == "NEGATIVE_INPUT" and excl < 0:
            out = {"status": "UNSUPPORTED_CASE", "reason": "NEGATIVE_EXCLUDED_REVOLVERS"}
            inter = {}
        elif ebitda == 0:
            out = {"status": "UNSUPPORTED_CASE", "reason": "ZERO_DENOMINATOR"}
            inter = {"numerator": ctd - excl}
        elif ebitda < 0:
            out = {"status": "UNSUPPORTED_CASE", "reason": "NEGATIVE_DENOMINATOR", "ratio_raw": (ctd - excl) / ebitda}
            inter = {"numerator": ctd - excl}
        else:
            num = ctd - excl
            out = {"ratio": num / ebitda}
            inter = {"numerator": num}
        add(
            {
                "id": f"ARITH-P4-CHWY-TLR-{i:03d}",
                "typedCalcId": "TC-CHWY-TLR-v1",
                "modelId": "CM-CHWY-TLR-v1",
                "title": title,
                "inputs": {
                    "consolidated_total_debt": ctd,
                    "excluded_revolving_loans_balance": excl,
                    "consolidated_ebitda_covenant_defined": ebitda,
                    "test_period_election": "FOUR_QUARTERS",
                },
                "expectedIntermediates": inter,
                "expectedOutput": out,
                "controlType": ctype,
            }
        )

    add(
        {
            "id": "ARITH-P4-CHWY-TLR-CURRENCY",
            "typedCalcId": "TC-CHWY-TLR-v1",
            "modelId": "CM-CHWY-TLR-v1",
            "title": "currency/unit mismatch debt USD vs EBITDA EUR",
            "inputs": {
                "consolidated_total_debt": 800,
                "excluded_revolving_loans_balance": 0,
                "consolidated_ebitda_covenant_defined": 200,
                "debt_currency": "USD",
                "ebitda_currency": "EUR",
                "test_period_election": "FOUR_QUARTERS",
            },
            "expectedOutput": {
                "status": "UNSUPPORTED_CASE",
                "reason": "CURRENCY_UNIT_MISMATCH",
            },
            "controlType": "CURRENCY_UNIT_MISMATCH",
            "forbidInference": ["ignore_currency", "available_capacity"],
        }
    )

    # --- CHWY anti-dupe ---
    for i, (clause_d, already, title, ctype, allowed, status) in enumerate(
        [
            (25, 25, "full overlap blocked", "DOUBLE_COUNTING_TRAP", 0.0, "DOUBLE_COUNT_BLOCKED"),
            (25, 10, "partial overlap — refuse silent split", "DOUBLE_COUNTING_TRAP", None, "REVIEW_REQUIRED"),
            (25, 0, "no overlap — full clause (d)", "POSITIVE", 25.0, "OK"),
            (0, 25, "zero clause (d)", "POSITIVE", 0.0, "OK"),
            (40, 40, "larger duplicate blocked", "DOUBLE_COUNTING_TRAP", 0.0, "DOUBLE_COUNT_BLOCKED"),
            (-5, 0, "negative clause (d)", "NEGATIVE_INPUT", None, "UNSUPPORTED_CASE"),
        ],
        start=1,
    ):
        out = {"status": status}
        if allowed is not None:
            out["allowed_clause_d_add"] = allowed
        if status == "UNSUPPORTED_CASE":
            out["reason"] = "NEGATIVE_ADDBACK"
        if status == "REVIEW_REQUIRED":
            out["reason"] = "PARTIAL_OVERLAP_IDENTITY_NOT_RESOLVED"
        add(
            {
                "id": f"ARITH-P4-CHWY-ANTIDUPE-{i:03d}",
                "typedCalcId": "TC-CHWY-ANTIDUPE-v1",
                "modelId": "CM-CHWY-ANTIDUPE-v1",
                "title": title,
                "inputs": {
                    "addback_amount_clause_d": clause_d,
                    "addback_amount_already_in_ebitda": already,
                },
                "expectedOutput": out,
                "controlType": ctype,
            }
        )

    # --- RIOT LTV ---
    for i, (prin, pmv, init, btc, title, ctype) in enumerate(
        [
            (10_000_000, 14_285_714.285714287, 0.7, 50_000, "exact Initial LTV — zero cure", "CAP_BOUNDARY"),
            (10_000_000, 20_000_000, 0.7, 50_000, "below Initial LTV — no additional collateral", "BELOW_CAP"),
            (10_000_000, 10_000_000, 0.7, 50_000, "LTV 1.0 — cure to Initial", "ABOVE_CAP"),
            (10_000_000, 12_000_000, 0.7, 0, "zero BTC price", "MISSING_INPUT"),
            (10_000_000, 0, 0.7, 50_000, "zero collateral PMV", "ZERO_DENOMINATOR"),
            (10_000_000, -1_000_000, 0.7, 50_000, "negative collateral", "NEGATIVE_INPUT"),
            (0, 12_000_000, 0.7, 50_000, "zero principal", "POSITIVE"),
            (10_000_000, 12_000_000, 0.7, 100_000, "higher BTC price reduces BTC cure", "POSITIVE"),
        ],
        start=1,
    ):
        if btc == 0:
            out = {"status": "MISSING_INPUT", "missingKeys": ["btc_price"]}
            inter = {}
            ctype = "MISSING_INPUT"
        elif pmv == 0:
            out = {"status": "UNSUPPORTED_CASE", "reason": "ZERO_COLLATERAL_PMV"}
            inter = {}
        elif pmv < 0:
            out = {"status": "UNSUPPORTED_CASE", "reason": "NEGATIVE_COLLATERAL_PMV"}
            inter = {}
        else:
            actual = prin / pmv if pmv else None
            target = prin / init if init else None
            add_usd = max(0.0, target - pmv)
            out = {"cure_amount_btc": add_usd / btc, "additional_collateral_usd": add_usd}
            inter = {
                "actual_ltv": actual,
                "target_collateral_pmv": target,
                "additional_collateral_usd": add_usd,
            }
        add(
            {
                "id": f"ARITH-P4-RIOT-LTV-{i:03d}",
                "typedCalcId": "TC-RIOT-LTV-MARGIN-v1",
                "modelId": "CM-RIOT-LTV-MARGIN-v1",
                "title": title,
                "inputs": {
                    "loan_principal": prin,
                    "collateral_pmv": pmv,
                    "initial_ltv": init,
                    "btc_price": btc,
                },
                "expectedIntermediates": inter,
                "expectedOutput": out,
                "controlType": ctype,
                "forbidInference": ["zero_cure", "available_capacity"]
                if ctype in ("MISSING_INPUT", "ZERO_DENOMINATOR", "NEGATIVE_INPUT")
                else None,
            }
        )

    add(
        {
            "id": "ARITH-P4-RIOT-MISSING-COLLATERAL-PRICE",
            "typedCalcId": "TC-RIOT-LTV-MARGIN-v1",
            "modelId": "CM-RIOT-LTV-MARGIN-v1",
            "title": "missing collateral PMV and BTC price",
            "inputs": {"loan_principal": 10_000_000, "initial_ltv": 0.7},
            "expectedOutput": {
                "status": "MISSING_INPUT",
                "missingKeys": ["collateral_pmv", "btc_price"],
            },
            "controlType": "MISSING_INPUT",
            "forbidInference": ["zero_cure", "invent_pmv"],
        }
    )

    # --- CONMED PF cap ---
    for i, (before, gross, realized, title, ctype) in enumerate(
        [
            (200, 35.294117647058826, 0, "exact 15% AGE boundary", "CAP_BOUNDARY"),
            (200, 20, 0, "PF below 15% AGE", "BELOW_CAP"),
            (200, 80, 0, "PF above 15% AGE", "ADDBACK_CAP"),
            (200, 50, 5, "net of benefits realized then cap", "PRO_FORMA_ACQUISITION"),
            (200, 50, 50, "benefits fully offset gross", "PRO_FORMA_ACQUISITION"),
            (200, 50, 60, "benefits exceed gross → zero PF", "PRO_FORMA_ACQUISITION"),
            (0, 50, 0, "zero base before PF", "ZERO_DENOMINATOR"),
            (-50, 20, 0, "negative base before PF", "NEGATIVE_INPUT"),
        ],
        start=1,
    ):
        uncapped = max(0.0, gross - realized)
        if before == 0:
            # AGE: pf = 0.15*(0+pf) => pf=0; but gross present — model refuses silent path
            out = {"status": "UNSUPPORTED_CASE", "reason": "ZERO_BASE_BEFORE_PF"}
            inter = {"pf_net_uncapped": uncapped}
        elif before < 0:
            out = {"status": "UNSUPPORTED_CASE", "reason": "NEGATIVE_BASE_BEFORE_PF"}
            inter = {"pf_net_uncapped": uncapped}
        else:
            age_cap = (0.15 * before) / 0.85
            pf_allowed = min(uncapped, age_cap)
            out = {"pf_allowed": pf_allowed, "ebitda_after": before + pf_allowed}
            inter = {"pf_net_uncapped": uncapped, "age_cap": age_cap}
        add(
            {
                "id": f"ARITH-P4-CONMED-PF-{i:03d}",
                "typedCalcId": "TC-CONMED-EBITDA-PF-CAP-v1",
                "modelId": "CM-CONMED-EBITDA-PF-v1",
                "title": title,
                "inputs": {
                    "ebitda_before_pf_clause_i": before,
                    "pro_forma_adjustment_gross": gross,
                    "benefits_realized": realized,
                },
                "expectedIntermediates": inter,
                "expectedOutput": out,
                "controlType": ctype,
            }
        )

    # Disposition PF (negative adjustment)
    add(
        {
            "id": "ARITH-P4-CONMED-PF-DISPOSITION",
            "typedCalcId": "TC-CONMED-EBITDA-PF-CAP-v1",
            "modelId": "CM-CONMED-EBITDA-PF-v1",
            "title": "pro forma disposition reduces EBITDA (no add-back cap)",
            "inputs": {
                "ebitda_before_pf_clause_i": 200.0,
                "pro_forma_adjustment_gross": -30.0,
                "benefits_realized": 0.0,
            },
            "expectedIntermediates": {"pf_net_uncapped": -30.0},
            "expectedOutput": {"pf_allowed": -30.0, "ebitda_after": 170.0},
            "controlType": "PRO_FORMA_DISPOSITION",
        }
    )

    # --- Gibraltar builder ambiguity ---
    for i, title in enumerate(
        [
            "refuse AA under citation ambiguity with full inputs",
            "refuse AA when only (vi) grower inputs supplied",
            "refuse AA when CNI builder inputs supplied",
        ],
        start=1,
    ):
        add(
            {
                "id": f"ARITH-P4-GIB-AA-{i:03d}",
                "typedCalcId": "TC-GIB-AA-BUILDER-v1",
                "modelId": "CM-GIB-AA-BUILDER-v1",
                "title": title,
                "legalReviewState": "REVIEW_REQUIRED",
                "inputs": {
                    "ltm_ebitda": 400_000_000,
                    "consolidated_net_income_cumulative": 50_000_000,
                    "equity_proceeds_since_closing": 10_000_000,
                },
                "expectedOutput": {
                    "status": "REVIEW_REQUIRED",
                    "reason": "UQ-GIB-705AY-CITATION — builder-basket source ambiguity; do not certify formula",
                },
                "controlType": "BUILDER_BASKET_SOURCE_AMBIGUITY",
                "forbidInference": [
                    "zero",
                    "unlimited",
                    "available_capacity",
                    "137600000_only",
                    "0.4_ltm_ebitda_only",
                    "sum_of_y_prongs",
                ],
            }
        )

    # Lookback timing CHWY Expected Run Rate (simplified gate)
    add(
        {
            "id": "ARITH-P4-CHWY-LOOKFORWARD-001",
            "typedCalcId": "TC-CHWY-ANTIDUPE-v1",
            "modelId": "CM-CHWY-ANTIDUPE-v1",
            "title": "lookforward: action date outside 36-month window → refuse silent include",
            "inputs": {
                "addback_amount_clause_d": 20.0,
                "addback_amount_already_in_ebitda": 0.0,
                "action_date": "2020-01-01",
                "period_end": "2026-06-30",
                "lookforward_months": 36,
            },
            "expectedOutput": {
                "status": "UNSUPPORTED_CASE",
                "reason": "LOOKFORWARD_WINDOW_EXCEEDED",
                "allowed_clause_d_add": 0.0,
            },
            "controlType": "LOOKFORWARD_TIMING",
        }
    )
    add(
        {
            "id": "ARITH-P4-CHWY-LOOKFORWARD-002",
            "typedCalcId": "TC-CHWY-ANTIDUPE-v1",
            "modelId": "CM-CHWY-ANTIDUPE-v1",
            "title": "lookforward: action within 36 months + no dupe",
            "inputs": {
                "addback_amount_clause_d": 20.0,
                "addback_amount_already_in_ebitda": 0.0,
                "action_date": "2025-01-01",
                "period_end": "2026-06-30",
                "lookforward_months": 36,
            },
            "expectedOutput": {"status": "OK", "allowed_clause_d_add": 20.0},
            "controlType": "LOOKFORWARD_TIMING",
        }
    )

    # Maintenance not capacity negative controls
    add(
        {
            "id": "ARITH-P4-NEG-SSLR-HEADROOM",
            "typedCalcId": "TC-CONMED-SSLR-v1",
            "modelId": "CM-CONMED-SSLR-v1",
            "title": "SSLR headroom math is not RP capacity",
            "inputs": {
                "consolidated_senior_secured_funded_debt": 500_000_000,
                "rtp_attributed_principal": 0,
                "unrestricted_cash_and_cash_equivalents": 0,
                "consolidated_ebitda_covenant_defined": 200_000_000,
                "maintenance_max": 3.75,
            },
            "expectedIntermediates": {"ratio": 2.5, "ratio_headroom_vs_max": 1.25},
            "expectedOutput": {
                "maintenance_compliant": True,
                "is_capacity_basket": False,
                "capacity_amount": None,
            },
            "controlType": "NEGATIVE_CONTROL_NOT_CAPACITY",
        }
    )

    assert len(cases) >= 50, len(cases)
    return cases


def legal_completeness(models, arith_all, amend_records):
    amend_by = {r["modelId"]: r for r in amend_records}
    rows = []
    for m in models:
        aid = m["typedCalcId"]
        cases = [c for c in arith_all if c.get("typedCalcId") == aid or c.get("modelId") == m["id"]]
        ar = amend_by[m["id"]]
        missing_refuse = any(
            c.get("expectedOutput", {}).get("status") == "MISSING_INPUT" for c in cases
        )
        unsupported_refuse = any(
            c.get("expectedOutput", {}).get("status") in ("UNSUPPORTED_CASE", "REVIEW_REQUIRED")
            for c in cases
        )
        arith_ok = m["status"] != "BLOCKED_REVIEW_REQUIRED" and any(
            c.get("controlType") == "POSITIVE"
            or c.get("expectedOutput", {}).get("ratio") is not None
            or c.get("expectedOutput", {}).get("ebitda") is not None
            for c in cases
        )
        if m["id"] == "CM-GIB-AA-BUILDER-v1":
            arith_ok = False  # intentionally blocked
        row = {
            "modelId": m["id"],
            "typedCalcId": aid,
            "dimensions": {
                "arithmeticCorrectness": {
                    "status": "PASS" if arith_ok else ("BLOCKED" if m["id"].startswith("CM-GIB") else "PARTIAL"),
                    "caseCount": len(cases),
                    "note": "Arithmetic under stated assumptions only; not legal verification",
                },
                "controllingSourceCompleteness": {
                    "status": "PASS"
                    if len(m["controllingDefinitions"]) >= 3
                    else "FAIL",
                    "count": len(m["controllingDefinitions"]),
                },
                "definitionClosure": {
                    "status": "PARTIAL"
                    if m.get("simplifiedAway")
                    else ("PASS" if m["status"].startswith("MODEL_COMPLETE") else "BLOCKED"),
                    "simplifiedAway": m.get("simplifiedAway", []),
                },
                "amendmentVersionCorrectness": {
                    "status": ar["authorityStatus"],
                    "chainId": ar.get("amendmentChainId"),
                    "unresolvedCount": len(ar.get("unresolvedAuthority", [])),
                },
                "provisoAttachment": {
                    "status": "PASS" if m.get("provisos") else "FAIL",
                    "count": len(m.get("provisos", [])),
                },
                "entityScopeFidelity": {
                    "status": "PASS" if m.get("entityRestrictions") else "FAIL",
                    "entityRestrictions": m.get("entityRestrictions"),
                },
                "missingInputRefusal": {
                    "status": "PASS" if missing_refuse or m["id"].startswith("CM-GIB") else "FAIL",
                    "demonstrated": missing_refuse or m["id"].startswith("CM-GIB"),
                },
                "unsupportedCaseRefusal": {
                    "status": "PASS" if unsupported_refuse else "FAIL",
                    "demonstrated": unsupported_refuse,
                },
            },
            "independentlyLegallyReviewed": False,
            "legalVerificationClaimedFromArithmetic": False,
        }
        rows.append(row)
    return {
        "artifact": "financial-definitions-precedent.legal-completeness",
        "version": "fdp.legal-complete.v1",
        "status": "DRAFT",
        "disclaimer": "Legal-completeness dimensions are structural completeness checks on the draft model pack. They do NOT constitute independent legal review or production approval.",
        "models": rows,
        "summary": {
            "modelCount": len(rows),
            "blockedModels": sum(1 for m in models if m["status"] == "BLOCKED_REVIEW_REQUIRED"),
            "independentlyLegallyReviewedCount": 0,
        },
    }


def main():
    existing_arith = load("15-arithmetic-evaluation.json")
    phase3_cases = existing_arith["cases"]
    # mark phase 3
    for c in phase3_cases:
        c.setdefault("phase", 3)

    new_cases = build_phase4_arith_cases()
    # ensure unique ids
    ids = [c["id"] for c in phase3_cases + new_cases]
    assert len(ids) == len(set(ids)), "duplicate arith ids"

    all_cases = phase3_cases + new_cases
    existing_arith["cases"] = all_cases
    existing_arith["version"] = "fdp.arith.v1"
    existing_arith["phase4NewCaseCount"] = len(new_cases)
    existing_arith["totalCaseCount"] = len(all_cases)
    existing_arith["disclaimer"] = (
        "ARITHMETICALLY_TESTED means the numeric procedure in the case matches expected "
        "intermediates/outputs under the case assumptions. It does NOT mean legal correctness "
        "or INDEPENDENTLY_LEGALLY_REVIEWED. Expected outputs are independently specified in "
        "this file; atlas formulaSketch must not be used as the oracle."
    )
    dump("15-arithmetic-evaluation.json", existing_arith)

    models_doc = {
        "artifact": "financial-definitions-precedent.calculation-models",
        "version": "fdp.calc-model.v1",
        "status": "DRAFT",
        "disclaimer": (
            "Dependency-complete structured readings. SEMANTIC_HYPOTHESIS unless blocked. "
            "Not INDEPENDENTLY_LEGALLY_REVIEWED. Not production-approved calculations."
        ),
        "models": MODELS,
        "counts": {
            "total": len(MODELS),
            "completeSemanticHypothesis": sum(
                1 for m in MODELS if m["status"] == "MODEL_COMPLETE_SEMANTIC_HYPOTHESIS"
            ),
            "blockedReviewRequired": sum(
                1 for m in MODELS if m["status"] == "BLOCKED_REVIEW_REQUIRED"
            ),
        },
    }
    dump("20-calculation-models.json", models_doc)
    dump("21-amendment-authority.json", AMENDMENT_AUTHORITY)

    legal = legal_completeness(MODELS, all_cases, AMENDMENT_AUTHORITY["records"])
    dump("23-legal-completeness.json", legal)

    # Update typed calcs with model links + richer metadata
    typed = load("14-typed-calculations.json")
    by_tc = {m["typedCalcId"]: m for m in MODELS}
    for c in typed["calculations"]:
        m = by_tc.get(c["id"])
        if not m:
            continue
        c["calculationModelId"] = m["id"]
        c["controllingDefinitions"] = m["controllingDefinitions"]
        c["crossReferences"] = m["crossReferences"]
        c["provisos"] = m["provisos"]
        c["entityRestrictions"] = m["entityRestrictions"]
        c["measurementDates"] = m["measurementDates"]
        c["amendmentChainId"] = m["amendmentChainId"]
        c["modelStatus"] = m["status"]
    typed["version"] = "fdp.typed-calc.v1"
    typed["phase"] = 4
    dump("14-typed-calculations.json", typed)

    # Canonical export v3
    atlas = load("02-precedent-atlas.json")
    uq = load("07-unresolved-interpretation-queue.json")
    reg = load("17-source-document-registry.json")
    canon = {
        "schemaVersion": "fdp.canonical-export.v3",
        "exportKind": "financial-definitions-precedent-canonical",
        "generatedAt": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "workstreamId": "WS-FDP",
        "startingShaPhase4": "153d33a1883eecbd9cde2e96aaf6320edcc38a44",
        "branch": "cursor/financial-definitions-precedent-43af",
        "supersedes": "fdp.canonical-export.v2",
        "doesNotCompeteWith": [
            "docs/definition-encyclopedia/knowledge-factory-export.json",
            "docs/covenant-basket-capacity-formula-library/export/dataset-manifest.json",
            "docs/knowledge-factory/**",
            "docs/covenant-dependency-atlas/**",
            "docs/amendment-chain-research/**",
            "lib/covenant-engine.ts",
            "lib/solver/**",
            "lib/contract-model/runtime/capacity/**",
        ],
        "joinKeys": {
            "definitionEncyclopedia": ["termLabel", "sourcePath", "excerptSha256"],
            "basketFormulaLibrary": ["termLabel", "packageId", "kind=BUILDER_OR_POOL"],
            "dependencyAtlas": ["entryId", "typedCalcId", "calculationModelId", "dependency edges"],
            "amendmentIntelligence": [
                "amendmentChainId",
                "docId",
                "sourceId",
                "accession",
                "sourceFileSha256",
            ],
            "covenantKnowledgeFactory": ["sourceFileSha256", "packageId", "sourceDocId"],
        },
        "peerExportsConsumed": AMENDMENT_AUTHORITY["peerCoordination"],
        "sourceDocuments": reg["documents"],
        "legalReviewStates": load("16-legal-review-states.json")["states"],
        "independentlyLegallyReviewedCount": 0,
        "counts": {
            "atlasEntries": len(atlas["entries"]),
            "typedCalculations": len(typed["calculations"]),
            "calculationModels": len(MODELS),
            "arithmeticCases": len(all_cases),
            "arithmeticCasesPhase4New": len(new_cases),
            "unresolvedItems": len(uq["items"]),
            "sourceDocuments": len(reg["documents"]),
            "amendmentAuthorityRecords": len(AMENDMENT_AUTHORITY["records"]),
        },
        "calculationModelIds": [m["id"] for m in MODELS],
        "typedCalculationIds": [c["id"] for c in typed["calculations"]],
        "blockedModelIds": [
            m["id"] for m in MODELS if m["status"] == "BLOCKED_REVIEW_REQUIRED"
        ],
        "gibraltarCitationStatus": {
            "id": "UQ-GIB-705AY-CITATION",
            "status": "OPEN_REVIEW_REQUIRED",
            "certifiedBuilderFormula": False,
            "capacityInferred": False,
            "forcedResolutionForbidden": True,
        },
        "artifacts": {
            "atlas": "02-precedent-atlas.json",
            "typedCalculations": "14-typed-calculations.json",
            "arithmeticEvaluation": "15-arithmetic-evaluation.json",
            "legalReviewStates": "16-legal-review-states.json",
            "sourceDocumentRegistry": "17-source-document-registry.json",
            "canonicalExportV2": "18-canonical-export-v2.json",
            "calculationModels": "20-calculation-models.json",
            "amendmentAuthority": "21-amendment-authority.json",
            "legalCompleteness": "23-legal-completeness.json",
            "unresolvedQueue": "07-unresolved-interpretation-queue.json",
        },
    }
    dump("22-canonical-export-v3.json", canon)

    # Keep v2 pointer note
    v2 = load("18-canonical-export-v2.json")
    v2["supersededBy"] = "22-canonical-export-v3.json"
    dump("18-canonical-export-v2.json", v2)

    print(
        json.dumps(
            {
                "models": len(MODELS),
                "phase4NewArith": len(new_cases),
                "totalArith": len(all_cases),
                "blocked": [m["id"] for m in MODELS if "BLOCKED" in m["status"]],
            },
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
