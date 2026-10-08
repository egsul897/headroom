#!/usr/bin/env python3
"""WS-FDP Phase 5: fail-closed calculation safety + legal challenger readiness."""
from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
PACK = ROOT / "docs/financial-definitions-precedent"
STARTING_SHA = "b234d4688f65c484c595771d87fd1b49ba33d52c"
REPORTED_P4_SHA = "0e92747ba5fc018a2589aa93a6fdc9246a7611dc"


def load(name: str):
    return json.loads((PACK / name).read_text())


def dump(name: str, obj):
    (PACK / name).write_text(json.dumps(obj, indent=2) + "\n")


def case(**kwargs):
    kwargs.setdefault("phase", 5)
    kwargs.setdefault("legalReviewState", "ARITHMETICALLY_TESTED")
    kwargs.setdefault(
        "forbidInference",
        ["zero", "ignored_input", "available_capacity", "affirmative_permission"],
    )
    return kwargs


def build_safety_cases():
    cases = []

    # --- Missing-input refusals that Phase 4 legal-completeness marked FAIL ---
    cases.append(
        case(
            id="ARITH-P5-CONMED-PF-MISSING-GROSS",
            typedCalcId="TC-CONMED-EBITDA-PF-CAP-v1",
            modelId="CM-CONMED-EBITDA-PF-v1",
            title="missing pro_forma_adjustment_gross → MISSING_INPUT (not zero)",
            failureDisposition="P4 missingInputRefusal FAIL: no MISSING_INPUT case for PF model",
            inputs={
                "ebitda_before_pf_clause_i": 200.0,
                "benefits_realized": 5.0,
                # pro_forma_adjustment_gross intentionally absent
            },
            expectedOutput={
                "status": "MISSING_INPUT",
                "missingKeys": ["pro_forma_adjustment_gross"],
                "couldBeMistakenForValidCalc": False,
            },
            controlType="MISSING_INPUT",
            notes="Absent gross must not be treated as 0 (which would silently yield ebitda_after=200).",
        )
    )
    cases.append(
        case(
            id="ARITH-P5-CONMED-PF-MISSING-BEFORE",
            typedCalcId="TC-CONMED-EBITDA-PF-CAP-v1",
            modelId="CM-CONMED-EBITDA-PF-v1",
            title="missing ebitda_before_pf_clause_i → MISSING_INPUT",
            inputs={
                "pro_forma_adjustment_gross": 50.0,
                "benefits_realized": 5.0,
            },
            expectedOutput={
                "status": "MISSING_INPUT",
                "missingKeys": ["ebitda_before_pf_clause_i"],
                "couldBeMistakenForValidCalc": False,
            },
            controlType="MISSING_INPUT",
        )
    )
    cases.append(
        case(
            id="ARITH-P5-CONMED-PF-SILENT-ZERO-TRAP",
            typedCalcId="TC-CONMED-EBITDA-PF-CAP-v1",
            modelId="CM-CONMED-EBITDA-PF-v1",
            title="negative control: treating missing gross as zero is FORBIDDEN",
            inputs={
                "ebitda_before_pf_clause_i": 200.0,
                "benefits_realized": 0.0,
            },
            expectedOutput={
                "status": "MISSING_INPUT",
                "missingKeys": ["pro_forma_adjustment_gross"],
                "forbiddenSilentResult": {"ebitda_after": 200.0, "pf_allowed": 0.0},
            },
            controlType="MISSING_INPUT",
            forbidInference=["treat_missing_as_zero", "available_capacity"],
        )
    )

    cases.append(
        case(
            id="ARITH-P5-CHWY-TLR-MISSING-CTD",
            typedCalcId="TC-CHWY-TLR-v1",
            modelId="CM-CHWY-TLR-v1",
            title="missing consolidated_total_debt → MISSING_INPUT",
            failureDisposition="P4 missingInputRefusal FAIL: TLR lacked MISSING_INPUT cases",
            inputs={
                "excluded_revolving_loans_balance": 100.0,
                "consolidated_ebitda_covenant_defined": 200.0,
                "test_period_election": "FOUR_QUARTERS",
            },
            expectedOutput={
                "status": "MISSING_INPUT",
                "missingKeys": ["consolidated_total_debt"],
                "couldBeMistakenForValidCalc": False,
            },
            controlType="MISSING_INPUT",
            notes="Must not infer CTD=0 (ratio 0.0 looks like compliant leverage).",
        )
    )
    cases.append(
        case(
            id="ARITH-P5-CHWY-TLR-MISSING-EBITDA",
            typedCalcId="TC-CHWY-TLR-v1",
            modelId="CM-CHWY-TLR-v1",
            title="missing EBITDA → MISSING_INPUT (not invent denominator)",
            inputs={
                "consolidated_total_debt": 800.0,
                "excluded_revolving_loans_balance": 0.0,
                "test_period_election": "FOUR_QUARTERS",
            },
            expectedOutput={
                "status": "MISSING_INPUT",
                "missingKeys": ["consolidated_ebitda_covenant_defined"],
            },
            controlType="MISSING_INPUT",
        )
    )
    cases.append(
        case(
            id="ARITH-P5-CHWY-TLR-SILENT-ZERO-TRAP",
            typedCalcId="TC-CHWY-TLR-v1",
            modelId="CM-CHWY-TLR-v1",
            title="negative control: missing CTD as zero would look like 0.0x leverage — FORBIDDEN",
            inputs={
                "excluded_revolving_loans_balance": 0.0,
                "consolidated_ebitda_covenant_defined": 200.0,
                "test_period_election": "FOUR_QUARTERS",
            },
            expectedOutput={
                "status": "MISSING_INPUT",
                "missingKeys": ["consolidated_total_debt"],
                "forbiddenSilentResult": {"ratio": 0.0, "maintenance_compliant": True},
            },
            controlType="MISSING_INPUT",
            forbidInference=["treat_missing_as_zero", "available_capacity", "permission"],
        )
    )

    cases.append(
        case(
            id="ARITH-P5-CHWY-ANTIDUPE-MISSING-CLAUSE-D",
            typedCalcId="TC-CHWY-ANTIDUPE-v1",
            modelId="CM-CHWY-ANTIDUPE-v1",
            title="missing addback_amount_clause_d → MISSING_INPUT",
            failureDisposition="P4 missingInputRefusal FAIL: antidupe lacked MISSING_INPUT cases",
            inputs={"addback_amount_already_in_ebitda": 25.0},
            expectedOutput={
                "status": "MISSING_INPUT",
                "missingKeys": ["addback_amount_clause_d"],
            },
            controlType="MISSING_INPUT",
            notes="Must not treat missing clause (d) amount as 0 (silent OK).",
        )
    )
    cases.append(
        case(
            id="ARITH-P5-CHWY-ANTIDUPE-MISSING-ALREADY",
            typedCalcId="TC-CHWY-ANTIDUPE-v1",
            modelId="CM-CHWY-ANTIDUPE-v1",
            title="missing already-in-EBITDA amount → MISSING_INPUT (cannot clear double-count)",
            inputs={"addback_amount_clause_d": 25.0},
            expectedOutput={
                "status": "MISSING_INPUT",
                "missingKeys": ["addback_amount_already_in_ebitda"],
                "forbiddenSilentResult": {"status": "OK", "allowed_clause_d_add": 25.0},
            },
            controlType="MISSING_INPUT",
            forbidInference=[
                "assume_no_overlap",
                "treat_missing_as_zero",
                "available_capacity",
            ],
        )
    )

    # --- DSGR unsupported-case refusals (P4 FAIL) ---
    cases.append(
        case(
            id="ARITH-P5-DSGR-UNSUPPORTED-ADDBACK",
            typedCalcId="TC-DSGR-EBITDA-v1",
            modelId="CM-DSGR-EBITDA-v1",
            title="unsupported addback clause not in typed model → UNSUPPORTED_CASE",
            failureDisposition="P4 unsupportedCaseRefusal FAIL: all DSGR cases returned ebitda numbers",
            inputs={
                "net_income": 100.0,
                "interest_expense": 10.0,
                "income_tax_expense_net": 5.0,
                "depreciation_amortization": 15.0,
                "nonrecurring_unusual_expenses": 0.0,
                "cost_savings_projected": 0.0,
                "cost_savings_benefits_realized": 0.0,
                "clause_a_xviii_b": 0.0,
                "unsupported_addback_clause": "a(xii)_stock_based_comp_unmodeled",
                "unsupported_addback_amount": 12.0,
            },
            expectedOutput={
                "status": "UNSUPPORTED_CASE",
                "reason": "UNMODELED_ADDBACK_CLAUSE",
                "couldBeMistakenForValidCalc": False,
            },
            controlType="UNSUPPORTED_ADDBACK",
            forbidInference=["ignore_unmodeled_addback", "affirmative_ebitda", "available_capacity"],
        )
    )
    cases.append(
        case(
            id="ARITH-P5-DSGR-MISSING-SOURCE-AUTHORITY",
            typedCalcId="TC-DSGR-EBITDA-v1",
            modelId="CM-DSGR-EBITDA-v1",
            title="Doc B Combined Cap applied without restatement check → UNSUPPORTED_CASE",
            inputs={
                "net_income": 100.0,
                "interest_expense": 10.0,
                "income_tax_expense_net": 5.0,
                "depreciation_amortization": 15.0,
                "nonrecurring_unusual_expenses": 20.0,
                "cost_savings_projected": 20.0,
                "cost_savings_benefits_realized": 0.0,
                "clause_a_xviii_b": 0.0,
                "operative_source_claim": "DSGR-2024-AMD3",
                "restatement_authority_resolved": False,
            },
            expectedOutput={
                "status": "UNSUPPORTED_CASE",
                "reason": "MISSING_SOURCE_AUTHORITY_RESTATEMENT_CHECK",
            },
            controlType="MISSING_SOURCE_AUTHORITY",
            forbidInference=["use_superseded_doc_b", "affirmative_ebitda"],
        )
    )
    cases.append(
        case(
            id="ARITH-P5-DSGR-UNMODELED-PROVISO",
            typedCalcId="TC-DSGR-EBITDA-v1",
            modelId="CM-DSGR-EBITDA-v1",
            title="Cost Savings action-date proviso unattested → UNSUPPORTED_CASE",
            inputs={
                "net_income": 100.0,
                "interest_expense": 0.0,
                "income_tax_expense_net": 0.0,
                "depreciation_amortization": 0.0,
                "nonrecurring_unusual_expenses": 0.0,
                "cost_savings_projected": 40.0,
                "cost_savings_benefits_realized": 0.0,
                "clause_a_xviii_b": 0.0,
                "cost_savings_action_dates_attested": False,
            },
            expectedOutput={
                "status": "UNSUPPORTED_CASE",
                "reason": "UNMODELED_PROVISO_ACTION_DATES",
            },
            controlType="UNMODELED_PROVISO",
            forbidInference=["assume_within_24m", "affirmative_ebitda"],
        )
    )
    cases.append(
        case(
            id="ARITH-P5-DSGR-UNSUPPORTED-BRANCH",
            typedCalcId="TC-DSGR-EBITDA-v1",
            modelId="CM-DSGR-EBITDA-v1",
            title="request full multi-prong EBITDA when only capped subset modeled → UNSUPPORTED_CASE",
            inputs={
                "net_income": 100.0,
                "interest_expense": 10.0,
                "income_tax_expense_net": 5.0,
                "depreciation_amortization": 15.0,
                "request_full_ebitda_all_prongs": True,
                "full_addback_schedule_attested": False,
            },
            expectedOutput={
                "status": "UNSUPPORTED_CASE",
                "reason": "UNSUPPORTED_CALCULATION_BRANCH_FULL_EBITDA",
            },
            controlType="UNSUPPORTED_CALCULATION_BRANCH",
            forbidInference=["affirmative_ebitda", "available_capacity"],
        )
    )

    # --- Amendment as-of refusals / incorrect parent ---
    cases.append(
        case(
            id="ARITH-P5-CONMED-AMD-SURVIVAL-UNRESOLVED",
            typedCalcId="TC-CONMED-SSLR-v1",
            modelId="CM-CONMED-SSLR-v1",
            title="as-of Eighth text with Seventh-era Amd2 cap assumption without survival resolution → refuse",
            inputs={
                "consolidated_senior_secured_funded_debt": 500_000_000,
                "rtp_attributed_principal": 0,
                "unrestricted_cash_and_cash_equivalents": 90_000_000,
                "consolidated_ebitda_covenant_defined": 200_000_000,
                "as_of_date": "2025-06-15",
                "assumed_cash_netting_cap": 100_000_000,
                "amd2_survival_into_eighth_resolved": False,
                "operative_parent_claim": "EIGHTH_AR",
            },
            expectedOutput={
                "status": "REVIEW_REQUIRED",
                "reason": "AMENDMENT_SURVIVAL_UNRESOLVED_cnmd-ua-3",
            },
            controlType="AMENDMENT_AUTHORITY_REFUSAL",
            legalReviewState="REVIEW_REQUIRED",
            forbidInference=["assume_amd2_survives", "assume_100m_cap", "available_capacity"],
        )
    )
    cases.append(
        case(
            id="ARITH-P5-CONMED-WRONG-PARENT",
            typedCalcId="TC-CONMED-SSLR-v1",
            modelId="CM-CONMED-SSLR-v1",
            title="incorrect parent: apply Seventh A&R SSLR to Eighth determination date → refuse",
            inputs={
                "consolidated_senior_secured_funded_debt": 500_000_000,
                "rtp_attributed_principal": 0,
                "unrestricted_cash_and_cash_equivalents": 40_000_000,
                "consolidated_ebitda_covenant_defined": 200_000_000,
                "as_of_date": "2025-06-15",
                "operative_parent_claim": "SEVENTH_AR",
            },
            expectedOutput={
                "status": "UNSUPPORTED_CASE",
                "reason": "INCORRECT_PARENT_AGREEMENT",
            },
            controlType="INCORRECT_PARENT_AGREEMENT",
            forbidInference=["affirmative_ratio", "available_capacity"],
        )
    )
    cases.append(
        case(
            id="ARITH-P5-CONMED-OMNIBUS-EFFECTIVENESS",
            typedCalcId="TC-CONMED-SSLR-v1",
            modelId="CM-CONMED-SSLR-v1",
            title="Omnibus effectiveness conditions unproven → REVIEW_REQUIRED",
            inputs={
                "consolidated_senior_secured_funded_debt": 500_000_000,
                "rtp_attributed_principal": 0,
                "unrestricted_cash_and_cash_equivalents": 40_000_000,
                "consolidated_ebitda_covenant_defined": 200_000_000,
                "depends_on_omnibus_effective": True,
                "omnibus_conditions_proven": False,
            },
            expectedOutput={
                "status": "REVIEW_REQUIRED",
                "reason": "OMNIBUS_EFFECTIVE_DATE_CONDITIONAL_UNRESOLVED",
            },
            controlType="AMENDMENT_AUTHORITY_REFUSAL",
            legalReviewState="REVIEW_REQUIRED",
        )
    )
    cases.append(
        case(
            id="ARITH-P5-DSGR-MISSING-AM1-AM2",
            typedCalcId="TC-DSGR-EBITDA-v1",
            modelId="CM-DSGR-EBITDA-v1",
            title="as-of between Doc A and Doc B without Am1/Am2 → refuse",
            inputs={
                "net_income": 100.0,
                "interest_expense": 10.0,
                "income_tax_expense_net": 5.0,
                "depreciation_amortization": 15.0,
                "as_of_date": "2023-06-01",
                "missing_amendments_in_chain": ["First Amendment", "Second Amendment"],
            },
            expectedOutput={
                "status": "REVIEW_REQUIRED",
                "reason": "MISSING_AMENDMENT_AUTHORITY_DSGR_AM1_AM2",
            },
            controlType="AMENDMENT_AUTHORITY_REFUSAL",
            legalReviewState="REVIEW_REQUIRED",
            forbidInference=["skip_missing_amendments", "affirmative_ebitda"],
        )
    )
    cases.append(
        case(
            id="ARITH-P5-RIOT-SCHEDULE-UNRESOLVED",
            typedCalcId="TC-RIOT-LTV-MARGIN-v1",
            modelId="CM-RIOT-LTV-MARGIN-v1",
            title="Initial LTV schedule numeric unattested → MISSING_INPUT/REVIEW",
            inputs={
                "loan_principal": 10_000_000,
                "collateral_pmv": 12_000_000,
                "btc_price": 50_000,
                "initial_ltv_schedule_attested": False,
            },
            expectedOutput={
                "status": "MISSING_INPUT",
                "missingKeys": ["initial_ltv"],
                "reason": "SCHEDULE_NUMERIC_UNATTESTED",
            },
            controlType="MISSING_INPUT",
            forbidInference=["assume_0.7", "zero_cure", "available_capacity"],
        )
    )
    cases.append(
        case(
            id="ARITH-P5-CHWY-NO-AMENDMENT-HISTORY",
            typedCalcId="TC-CHWY-TLR-v1",
            modelId="CM-CHWY-TLR-v1",
            title="do not infer complete amendment history from single instrument",
            inputs={
                "consolidated_total_debt": 800.0,
                "excluded_revolving_loans_balance": 0.0,
                "consolidated_ebitda_covenant_defined": 200.0,
                "test_period_election": "FOUR_QUARTERS",
                "claim_complete_amendment_history": True,
                "amendment_chain_id": None,
            },
            expectedOutput={
                "status": "REVIEW_REQUIRED",
                "reason": "NO_AMENDMENT_CHAIN_DO_NOT_INFER_COMPLETE_HISTORY",
                "ratio_under_single_instrument_hypothesis": 4.0,
                "is_authoritative_operative_state": False,
            },
            controlType="AMENDMENT_AUTHORITY_REFUSAL",
            legalReviewState="REVIEW_REQUIRED",
            notes="May compute under single-doc hypothesis only when explicitly scoped; must not claim complete amendment history.",
        )
    )

    # --- More adversarial safety ---
    cases.append(
        case(
            id="ARITH-P5-GIB-NO-CAPACITY",
            typedCalcId="TC-GIB-AA-BUILDER-v1",
            modelId="CM-GIB-AA-BUILDER-v1",
            title="ambiguous builder basket cannot become affirmative capacity",
            inputs={
                "ltm_ebitda": 400_000_000,
                "consolidated_net_income_cumulative": 50_000_000,
                "request_available_capacity": True,
            },
            expectedOutput={
                "status": "REVIEW_REQUIRED",
                "reason": "UQ-GIB-705AY-CITATION",
                "available_capacity": None,
                "is_capacity_basket_certified": False,
            },
            controlType="BUILDER_BASKET_SOURCE_AMBIGUITY",
            legalReviewState="REVIEW_REQUIRED",
            forbidInference=[
                "zero",
                "unlimited",
                "available_capacity",
                "affirmative_permission",
                "sum_of_y_prongs",
            ],
        )
    )
    cases.append(
        case(
            id="ARITH-P5-GIB-MISSING-CITATION-SCOPE",
            typedCalcId="TC-GIB-AA-BUILDER-v1",
            modelId="CM-GIB-AA-BUILDER-v1",
            title="missing citation_scope_resolution → MISSING_INPUT (not invent builder scope)",
            inputs={
                "ltm_ebitda": 400_000_000,
                "consolidated_net_income_cumulative": 50_000_000,
            },
            expectedOutput={
                "status": "MISSING_INPUT",
                "missingKeys": ["citation_scope_resolution"],
                "reason": "UQ-GIB-705AY-CITATION_UNRESOLVED",
            },
            controlType="MISSING_INPUT",
            forbidInference=[
                "zero",
                "unlimited",
                "available_capacity",
                "assume_entire_y",
                "assume_vi_only",
            ],
        )
    )
    cases.append(
        case(
            id="ARITH-P5-CHWY-PARTIAL-OVERLAP",
            typedCalcId="TC-CHWY-ANTIDUPE-v1",
            modelId="CM-CHWY-ANTIDUPE-v1",
            title="partial-overlap identity unresolved → REVIEW_REQUIRED not split",
            inputs={
                "addback_amount_clause_d": 25.0,
                "addback_amount_already_in_ebitda": 10.0,
                "overlap_identity_resolved": False,
            },
            expectedOutput={
                "status": "REVIEW_REQUIRED",
                "reason": "PARTIAL_OVERLAP_IDENTITY_NOT_RESOLVED",
            },
            controlType="DOUBLE_COUNTING_TRAP",
            legalReviewState="REVIEW_REQUIRED",
            forbidInference=["split_15_10", "allow_full_25", "available_capacity"],
        )
    )
    cases.append(
        case(
            id="ARITH-P5-NEG-MAINTENANCE-NOT-PERMISSION",
            typedCalcId="TC-CONMED-SSLR-v1",
            modelId="CM-CONMED-SSLR-v1",
            title="maintenance headroom must not become RP/investment permission",
            inputs={
                "consolidated_senior_secured_funded_debt": 400_000_000,
                "rtp_attributed_principal": 0,
                "unrestricted_cash_and_cash_equivalents": 0,
                "consolidated_ebitda_covenant_defined": 200_000_000,
                "maintenance_max": 3.75,
                "request_permission_capacity": True,
            },
            expectedIntermediates={"ratio": 2.0, "ratio_headroom_vs_max": 1.75},
            expectedOutput={
                "maintenance_compliant": True,
                "is_capacity_basket": False,
                "capacity_amount": None,
                "permission_granted": False,
            },
            controlType="NEGATIVE_CONTROL_NOT_CAPACITY",
            forbidInference=["available_capacity", "affirmative_permission"],
        )
    )
    cases.append(
        case(
            id="ARITH-P5-CURRENCY-MISMATCH-CONMED",
            typedCalcId="TC-CONMED-SSLR-v1",
            modelId="CM-CONMED-SSLR-v1",
            title="debt USD vs EBITDA EUR → UNSUPPORTED_CASE",
            inputs={
                "consolidated_senior_secured_funded_debt": 500_000_000,
                "rtp_attributed_principal": 0,
                "unrestricted_cash_and_cash_equivalents": 40_000_000,
                "consolidated_ebitda_covenant_defined": 200_000_000,
                "debt_currency": "USD",
                "ebitda_currency": "EUR",
            },
            expectedOutput={
                "status": "UNSUPPORTED_CASE",
                "reason": "CURRENCY_UNIT_MISMATCH",
            },
            controlType="CURRENCY_UNIT_MISMATCH",
        )
    )

    return cases


def update_models_completeness(models_doc):
    for m in models_doc["models"]:
        if m["id"] == "CM-CONMED-EBITDA-PF-v1":
            m["completenessTaxonomy"] = {
                "fullyRepresented": [
                    "clause (i) PF net-of-benefits arithmetic under attested inputs",
                    "15% after-giving-effect cap math under stated assumptions",
                ],
                "partiallyRepresented": [
                    "Interaction of clause (i) with other Consolidated EBITDA add-backs",
                    "$30M Transaction/Material Acquisition cost cap (declared, not fully arith suite)",
                ],
                "unsupportedLegalSemantics": [
                    "Full multi-clause EBITDA reconstruction as a single certified figure",
                    "Material Acquisition qualification without attested election facts",
                ],
                "requiredExternalFinancialAttestations": [
                    "ebitda_before_pf_clause_i",
                    "pro_forma_adjustment_gross",
                    "benefits_realized",
                    "transaction_costs_material_acquisition",
                ],
                "representationClass": "PARTIAL_SEMANTIC_MODEL",
                "doNotUpgradeToLegallyCompleteFromArithmetic": True,
            }
            m["status"] = "PARTIAL_SEMANTIC_MODEL"
            m["simplifiedAway"] = [
                "Full multi-clause EBITDA add-back schedule beyond clause (i) PF model",
                "Cross-clause without-duplication identity across all EBITDA prongs",
                "Material Acquisition step-up interaction with PF cap (separate from §7.1)",
            ]
        elif m["id"] == "CM-DSGR-EBITDA-v1":
            m["completenessTaxonomy"] = {
                "fullyRepresented": [
                    "Combined Cap 20% before capped add-backs (simplified bucket)",
                    "Cost Savings net-of-benefits when action dates attested",
                ],
                "partiallyRepresented": [
                    "Uncapped EBITDA (a)/(b) prongs as attested aggregates"
                ],
                "unsupportedLegalSemantics": [
                    "Unmodeled addback clauses",
                    "Applying Doc B text without Doc D restatement authority",
                    "Cost Savings without attested action dates",
                ],
                "requiredExternalFinancialAttestations": m["financialInputRequirements"],
                "representationClass": "PARTIAL_SEMANTIC_MODEL",
                "doNotUpgradeToLegallyCompleteFromArithmetic": True,
            }
            m["status"] = "PARTIAL_SEMANTIC_MODEL"
        elif m["id"] == "CM-GIB-AA-BUILDER-v1":
            m["completenessTaxonomy"] = {
                "fullyRepresented": [],
                "partiallyRepresented": ["Component extraction as EXTRACTED_NOT_CERTIFIED"],
                "unsupportedLegalSemantics": [
                    "Any certified Available Amount / builder capacity figure"
                ],
                "requiredExternalFinancialAttestations": m["financialInputRequirements"],
                "representationClass": "BLOCKED_REVIEW_REQUIRED",
                "doNotUpgradeToLegallyCompleteFromArithmetic": True,
            }
        else:
            m.setdefault(
                "completenessTaxonomy",
                {
                    "fullyRepresented": ["Typed arithmetic under attested required inputs"],
                    "partiallyRepresented": [],
                    "unsupportedLegalSemantics": [],
                    "requiredExternalFinancialAttestations": m["financialInputRequirements"],
                    "representationClass": "SEMANTIC_HYPOTHESIS_ARITHMETICALLY_TESTED",
                    "doNotUpgradeToLegallyCompleteFromArithmetic": True,
                },
            )
    # recount
    models_doc["counts"] = {
        "total": len(models_doc["models"]),
        "completeSemanticHypothesis": sum(
            1
            for m in models_doc["models"]
            if m["status"] == "MODEL_COMPLETE_SEMANTIC_HYPOTHESIS"
        ),
        "partialSemanticModel": sum(
            1 for m in models_doc["models"] if m["status"] == "PARTIAL_SEMANTIC_MODEL"
        ),
        "blockedReviewRequired": sum(
            1 for m in models_doc["models"] if m["status"] == "BLOCKED_REVIEW_REQUIRED"
        ),
    }
    return models_doc


def recompute_legal(models, arith_cases, amend_records):
    amend_by = {r["modelId"]: r for r in amend_records}
    rows = []
    for m in models:
        aid = m["typedCalcId"]
        cases = [
            c
            for c in arith_cases
            if c.get("typedCalcId") == aid or c.get("modelId") == m["id"]
        ]
        ar = amend_by[m["id"]]
        missing_refuse = any(
            c.get("expectedOutput", {}).get("status") == "MISSING_INPUT" for c in cases
        )
        unsupported_refuse = any(
            c.get("expectedOutput", {}).get("status")
            in ("UNSUPPORTED_CASE", "REVIEW_REQUIRED")
            for c in cases
        )
        if m["id"] == "CM-GIB-AA-BUILDER-v1":
            arith_status = "BLOCKED"
        elif m.get("completenessTaxonomy", {}).get("representationClass") == "PARTIAL_SEMANTIC_MODEL":
            arith_status = "PARTIAL"
        else:
            arith_status = "PASS"
        def_closure = (
            "BLOCKED"
            if m["status"] == "BLOCKED_REVIEW_REQUIRED"
            else (
                "PARTIAL"
                if m.get("simplifiedAway")
                or m["status"] == "PARTIAL_SEMANTIC_MODEL"
                else "PASS"
            )
        )
        rows.append(
            {
                "modelId": m["id"],
                "typedCalcId": aid,
                "dimensions": {
                    "arithmeticCorrectness": {
                        "status": arith_status,
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
                        "status": def_closure,
                        "simplifiedAway": m.get("simplifiedAway", []),
                        "representationClass": m.get("completenessTaxonomy", {}).get(
                            "representationClass"
                        ),
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
                        "status": "PASS" if missing_refuse else "FAIL",
                        "demonstrated": missing_refuse,
                    },
                    "unsupportedCaseRefusal": {
                        "status": "PASS" if unsupported_refuse else "FAIL",
                        "demonstrated": unsupported_refuse,
                    },
                },
                "independentlyLegallyReviewed": False,
                "legalVerificationClaimedFromArithmetic": False,
            }
        )
    return {
        "artifact": "financial-definitions-precedent.legal-completeness",
        "version": "fdp.legal-complete.v1",
        "status": "DRAFT",
        "phase": 5,
        "disclaimer": "Legal-completeness dimensions are structural completeness checks on the draft model pack. They do NOT constitute independent legal review or production approval. Arithmetic PASS/PARTIAL must not upgrade models to legally complete.",
        "models": rows,
        "summary": {
            "modelCount": len(rows),
            "blockedModels": sum(
                1 for m in models if m["status"] == "BLOCKED_REVIEW_REQUIRED"
            ),
            "partialModels": sum(
                1 for m in models if m["status"] == "PARTIAL_SEMANTIC_MODEL"
            ),
            "independentlyLegallyReviewedCount": 0,
            "missingInputRefusalPassCount": sum(
                1
                for r in rows
                if r["dimensions"]["missingInputRefusal"]["status"] == "PASS"
            ),
            "unsupportedCaseRefusalPassCount": sum(
                1
                for r in rows
                if r["dimensions"]["unsupportedCaseRefusal"]["status"] == "PASS"
            ),
        },
    }


def build_challenger_package(models, atlas, arith, amend, legal):
    atlas_by = {e["id"]: e for e in atlas["entries"]}
    amend_by = {r["modelId"]: r for r in amend["records"]}
    legal_by = {r["modelId"]: r for r in legal["models"]}
    packages = []
    for m in models:
        spans = []
        for eid in m.get("extractionEntryIds", []):
            e = atlas_by.get(eid)
            if not e:
                continue
            spans.append(
                {
                    "entryId": eid,
                    "sourcePath": e["sourcePath"],
                    "charStart": e["charStart"],
                    "charEnd": e["charEnd"],
                    "excerptSha256": e["excerptSha256"],
                    "verificationStatus": e.get("verificationStatus"),
                    "excerptPreview": e["excerpt"][:240],
                }
            )
        cases = [
            c
            for c in arith["cases"]
            if c.get("typedCalcId") == m["typedCalcId"] or c.get("modelId") == m["id"]
        ]
        refusal_conditions = sorted(
            {
                c["expectedOutput"].get("reason")
                or c["expectedOutput"].get("status")
                for c in cases
                if c.get("expectedOutput", {}).get("status")
                in ("MISSING_INPUT", "UNSUPPORTED_CASE", "REVIEW_REQUIRED")
            }
        )
        packages.append(
            {
                "modelId": m["id"],
                "typedCalcId": m["typedCalcId"],
                "name": m["name"],
                "independentlyLegallyReviewed": False,
                "selectedForIndependentLegalChallenge": m["id"]
                in {
                    "CM-CONMED-EBITDA-PF-v1",
                    "CM-DSGR-EBITDA-v1",
                    "CM-CONMED-SSLR-v1",
                    "CM-GIB-AA-BUILDER-v1",
                },
                "controllingSourceSpans": spans,
                "completeDependencyList": {
                    "controllingDefinitions": m["controllingDefinitions"],
                    "crossReferences": m["crossReferences"],
                    "extractionEntryIds": m["extractionEntryIds"],
                    "financialInputRequirements": m["financialInputRequirements"],
                },
                "amendmentVersionAuthority": amend_by[m["id"]],
                "provisoAndEntityScope": {
                    "provisos": m["provisos"],
                    "entityRestrictions": m["entityRestrictions"],
                    "measurementDates": m["measurementDates"],
                },
                "calculationSpecification": {
                    "typedCalcId": m["typedCalcId"],
                    "modelStatus": m["status"],
                    "legalReviewState": m["legalReviewState"],
                    "completenessTaxonomy": m.get("completenessTaxonomy"),
                },
                "knownSimplifications": m.get("simplifiedAway", []),
                "missingInputRequirements": m["financialInputRequirements"],
                "refusalConditions": refusal_conditions,
                "arithmeticTestEvidence": {
                    "caseCount": len(cases),
                    "caseIds": [c["id"] for c in cases],
                    "note": "ARITHMETICALLY_TESTED ≠ legally verified",
                },
                "explicitUnresolvedQuestions": amend_by[m["id"]].get(
                    "unresolvedAuthority", []
                )
                + (
                    ["UQ-GIB-705AY-CITATION"]
                    if m["id"] == "CM-GIB-AA-BUILDER-v1"
                    else []
                ),
                "legalCompletenessSnapshot": legal_by[m["id"]]["dimensions"],
            }
        )
    selected = [p["modelId"] for p in packages if p["selectedForIndependentLegalChallenge"]]
    return {
        "artifact": "financial-definitions-precedent.independent-legal-challenger",
        "version": "fdp.legal-challenger.v1",
        "status": "READY_FOR_EXTERNAL_CHALLENGE",
        "disclaimer": "Package prepares models for independent legal challenge. NONE are marked INDEPENDENTLY_LEGALLY_REVIEWED by WS-FDP.",
        "independentlyLegallyReviewedCount": 0,
        "selectedForChallenge": selected,
        "selectionRationale": [
            "CM-CONMED-EBITDA-PF-v1 — partial PF scope / simplifiedAway (required)",
            "CM-DSGR-EBITDA-v1 — combined cap + amendment restatement issues (required)",
            "CM-CONMED-SSLR-v1 — amendment survival / cash-netting lineage (materially different)",
            "CM-GIB-AA-BUILDER-v1 — citation ambiguity blocker (materially different)",
        ],
        "models": packages,
        "generatedAt": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "startingShaPhase5": STARTING_SHA,
    }


def build_failure_dispositions():
    return {
        "artifact": "financial-definitions-precedent.phase5-failure-dispositions",
        "version": "fdp.phase5-disp.v1",
        "shaDrift": {
            "reportedPhase4Sha": REPORTED_P4_SHA,
            "observedGithubHeadAtPrompt": STARTING_SHA,
            "interveningCommits": [
                {
                    "sha": STARTING_SHA,
                    "subject": "WS-FDP Phase 4: peer join field aliases from inventory",
                    "remediation": "Added joinFieldAliases + ACR package coverage; no missing-input safety fixes yet",
                }
            ],
            "reconciledStartingSha": STARTING_SHA,
            "hold": False,
        },
        "missingInputFailureDispositions": [
            {
                "modelId": "CM-CONMED-EBITDA-PF-v1",
                "phase4Status": "FAIL",
                "exactFailingDimension": "missingInputRefusal",
                "rootCause": "No MISSING_INPUT arithmetic cases bound to TC-CONMED-EBITDA-PF-CAP-v1; evaluators only covered attested-input paths, so absent gross could be mistaken for zero.",
                "missingInput": "pro_forma_adjustment_gross (and ebitda_before_pf_clause_i)",
                "observedOutputBeforeFix": "Legal-completeness FAIL; no refusal case — silent zero would yield ebitda_after=base",
                "couldBeMistakenForValidCalc": True,
                "generalizableFix": "Require explicit MISSING_INPUT whenever any financialInputRequirements key is absent; add silent-zero negative controls",
                "regressionCaseIds": [
                    "ARITH-P5-CONMED-PF-MISSING-GROSS",
                    "ARITH-P5-CONMED-PF-MISSING-BEFORE",
                    "ARITH-P5-CONMED-PF-SILENT-ZERO-TRAP",
                ],
                "phase5Status": "PASS",
            },
            {
                "modelId": "CM-CHWY-TLR-v1",
                "phase4Status": "FAIL",
                "exactFailingDimension": "missingInputRefusal",
                "rootCause": "TLR suite had zero-denominator and currency refusals but no missing CTD/EBITDA cases; missing CTD as 0 yields 0.0x (looks compliant).",
                "missingInput": "consolidated_total_debt / consolidated_ebitda_covenant_defined",
                "observedOutputBeforeFix": "Legal-completeness FAIL",
                "couldBeMistakenForValidCalc": True,
                "generalizableFix": "MISSING_INPUT on any absent ratio input; forbid treat_missing_as_zero",
                "regressionCaseIds": [
                    "ARITH-P5-CHWY-TLR-MISSING-CTD",
                    "ARITH-P5-CHWY-TLR-MISSING-EBITDA",
                    "ARITH-P5-CHWY-TLR-SILENT-ZERO-TRAP",
                ],
                "phase5Status": "PASS",
            },
            {
                "modelId": "CM-CHWY-ANTIDUPE-v1",
                "phase4Status": "FAIL",
                "exactFailingDimension": "missingInputRefusal",
                "rootCause": "Antidupe cases assumed both amounts present; missing already-in-EBITDA could be treated as 0 → false OK/allow full clause (d).",
                "missingInput": "addback_amount_clause_d / addback_amount_already_in_ebitda",
                "observedOutputBeforeFix": "Legal-completeness FAIL",
                "couldBeMistakenForValidCalc": True,
                "generalizableFix": "MISSING_INPUT unless both overlap operands attested; forbid assume_no_overlap",
                "regressionCaseIds": [
                    "ARITH-P5-CHWY-ANTIDUPE-MISSING-CLAUSE-D",
                    "ARITH-P5-CHWY-ANTIDUPE-MISSING-ALREADY",
                ],
                "phase5Status": "PASS",
            },
        ],
        "dsgrUnsupportedCaseDisposition": {
            "modelId": "CM-DSGR-EBITDA-v1",
            "phase4Status": "FAIL",
            "rootCause": "All Phase-4 DSGR cases returned numeric ebitda under simplified capped-bucket model; no path returned UNSUPPORTED_CASE/REVIEW_REQUIRED for unmodeled clauses, missing source authority, or unattested provisos.",
            "testsAdded": [
                "ARITH-P5-DSGR-UNSUPPORTED-ADDBACK",
                "ARITH-P5-DSGR-MISSING-SOURCE-AUTHORITY",
                "ARITH-P5-DSGR-UNMODELED-PROVISO",
                "ARITH-P5-DSGR-UNSUPPORTED-BRANCH",
                "ARITH-P5-DSGR-MISSING-AM1-AM2",
            ],
            "rule": "Unsupported contractual semantics must not yield affirmative executable EBITDA",
            "phase5Status": "PASS",
        },
    }


def main():
    arith = load("15-arithmetic-evaluation.json")
    existing_ids = {c["id"] for c in arith["cases"]}
    new_cases = build_safety_cases()
    added = [c for c in new_cases if c["id"] not in existing_ids]
    arith["cases"].extend(added)
    arith["phase5NewCaseCount"] = sum(1 for c in arith["cases"] if c.get("phase") == 5)
    arith["totalCaseCount"] = len(arith["cases"])
    arith["phase5SafetyNote"] = (
        "Phase 5 adds fail-closed MISSING_INPUT / UNSUPPORTED_CASE / REVIEW_REQUIRED "
        "refusals so incomplete inputs and unsupported semantics cannot become affirmative "
        "capacity or permission."
    )
    dump("15-arithmetic-evaluation.json", arith)
    new_cases = [c for c in arith["cases"] if c.get("phase") == 5]

    models_doc = update_models_completeness(load("20-calculation-models.json"))
    dump("20-calculation-models.json", models_doc)

    amend = load("21-amendment-authority.json")
    # strengthen CHWY / RIOT / GIB notes
    for r in amend["records"]:
        if r["modelId"] in ("CM-CHWY-TLR-v1", "CM-CHWY-ANTIDUPE-v1"):
            r["asOfRefusalRule"] = (
                "Do not infer complete amendment history from single instrument; "
                "claim_complete_amendment_history → REVIEW_REQUIRED"
            )
        if r["modelId"] == "CM-RIOT-LTV-MARGIN-v1":
            r["asOfRefusalRule"] = (
                "Initial LTV schedule numeric must be attested; else MISSING_INPUT"
            )
        if r["modelId"] == "CM-CONMED-SSLR-v1":
            r["asOfRefusalRule"] = (
                "Amd2 survival unresolved or Seventh parent on Eighth date → refuse; "
                "Omnibus effectiveness unproven → REVIEW_REQUIRED"
            )
        if r["modelId"] == "CM-DSGR-EBITDA-v1":
            r["asOfRefusalRule"] = (
                "Missing Am1/Am2 authority or Doc B without restatement check → refuse"
            )
        if r["modelId"] == "CM-GIB-AA-BUILDER-v1":
            r["forcedResolutionForbidden"] = True
            r["asOfRefusalRule"] = "UQ-GIB-705AY-CITATION blocks any capacity figure"
    dump("21-amendment-authority.json", amend)

    legal = recompute_legal(models_doc["models"], arith["cases"], amend["records"])
    dump("23-legal-completeness.json", legal)

    atlas = load("02-precedent-atlas.json")
    challenger = build_challenger_package(
        models_doc["models"], atlas, arith, amend, legal
    )
    dump("24-independent-legal-challenger.json", challenger)

    dispositions = build_failure_dispositions()
    dump("25-phase5-failure-dispositions.json", dispositions)

    # CONMED PF completeness dedicated artifact
    pf = next(m for m in models_doc["models"] if m["id"] == "CM-CONMED-EBITDA-PF-v1")
    dump(
        "26-conmed-pro-forma-completeness.json",
        {
            "artifact": "financial-definitions-precedent.conmed-pf-completeness",
            "version": "fdp.conmed-pf.v1",
            "modelId": pf["id"],
            "representationClass": "PARTIAL_SEMANTIC_MODEL",
            "doNotUpgradeToLegallyCompleteFromArithmetic": True,
            "taxonomy": pf["completenessTaxonomy"],
            "simplifiedAway": pf["simplifiedAway"],
            "clauseIScope": (
                "Model covers only Consolidated EBITDA clause (i) pro forma adjustments "
                "net of benefits realized, subject to 15% after-giving-effect cap under "
                "attested inputs. Other EBITDA clauses are not silently zeroed."
            ),
        },
    )

    # Update canonical v3 counts / artifacts (preserve contract)
    canon = load("22-canonical-export-v3.json")
    canon["phase"] = 5
    canon["startingShaPhase5"] = STARTING_SHA
    canon["counts"]["arithmeticCases"] = arith["totalCaseCount"]
    canon["counts"]["arithmeticCasesPhase5New"] = len(new_cases)
    canon["counts"]["calculationModels"] = len(models_doc["models"])
    canon["gibraltarCitationStatus"] = {
        "id": "UQ-GIB-705AY-CITATION",
        "status": "OPEN_REVIEW_REQUIRED",
        "certifiedBuilderFormula": False,
        "capacityInferred": False,
        "forcedResolutionForbidden": True,
    }
    canon["independentlyLegallyReviewedCount"] = 0
    canon["artifacts"]["independentLegalChallenger"] = (
        "24-independent-legal-challenger.json"
    )
    canon["artifacts"]["phase5FailureDispositions"] = (
        "25-phase5-failure-dispositions.json"
    )
    canon["artifacts"]["conmedProFormaCompleteness"] = (
        "26-conmed-pro-forma-completeness.json"
    )
    canon["safetyPosture"] = {
        "missingInputRefusalPassCount": legal["summary"]["missingInputRefusalPassCount"],
        "unsupportedCaseRefusalPassCount": legal["summary"][
            "unsupportedCaseRefusalPassCount"
        ],
        "failClosed": True,
    }
    dump("22-canonical-export-v3.json", canon)

    # typed calc status sync for PF/DSGR
    typed = load("14-typed-calculations.json")
    status_by = {m["typedCalcId"]: m["status"] for m in models_doc["models"]}
    for c in typed["calculations"]:
        if c["id"] in status_by:
            c["modelStatus"] = status_by[c["id"]]
    dump("14-typed-calculations.json", typed)

    assert legal["summary"]["missingInputRefusalPassCount"] == 7
    assert legal["summary"]["unsupportedCaseRefusalPassCount"] == 7

    print(
        json.dumps(
            {
                "phase5New": len(new_cases),
                "totalArith": arith["totalCaseCount"],
                "missingPass": legal["summary"]["missingInputRefusalPassCount"],
                "unsupportedPass": legal["summary"]["unsupportedCaseRefusalPassCount"],
                "challengerSelected": challenger["selectedForChallenge"],
                "modelStatuses": {m["id"]: m["status"] for m in models_doc["models"]},
            },
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
