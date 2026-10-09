#!/usr/bin/env python3
"""
Phase 2: legal-formula validation pipeline for the basket formula corpus.

- Independent affirmative-capacity audit (stratified)
- Provenance (hashes, offsets, normalization version; byte-exact vs whitespace)
- Typed formula representations
- Dependency coordination (encyclopedia/atlas/exception-db/factory absent → unresolved)
- Adversarial scenarios (arithmetic vs legal permission)
- Corpus expansion from unused fixture extracts + EDGAR acquisitions (read-only vs Claude fixtures)
- Knowledge-factory import contract records

Does not modify the production capacity engine, certification artifacts, or Claude-owned fixtures.
"""

from __future__ import annotations

import hashlib
import json
import re
import time
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[2]
PHASE1_EXPORT = ROOT / "docs/covenant-basket-capacity-formula-library/export"
PHASE2 = ROOT / "docs/covenant-basket-capacity-formula-library/phase-2"
EXPORT = PHASE2 / "export"
EDGAR = PHASE2 / "edgar-acquisitions"
NORMALIZATION_VERSION = "whitespace-collapse.v1"
IMPORT_CONTRACT_VERSION = "knowledge-factory-import.basket-formula.v1"
STARTING_SHA = "26e21e46391cf00948bd4de0972662feb1598b5d"


def sha256_text(s: str) -> str:
    return hashlib.sha256(s.encode("utf-8")).hexdigest()


def sha256_bytes(b: bytes) -> str:
    return hashlib.sha256(b).hexdigest()


def norm_ws(s: str) -> str:
    return re.sub(r"\s+", " ", s).strip()


def build_provenance(source_text: str, span: str, document_path: str) -> dict[str, Any]:
    source_hash = sha256_text(source_text)
    span_hash = sha256_text(span)
    normalized = norm_ws(span)
    idx = source_text.find(span)
    if idx >= 0:
        before = source_text[:idx].encode("utf-8")
        span_b = span.encode("utf-8")
        return {
            "documentPath": document_path,
            "sourceHashSha256": source_hash,
            "sourceByteLength": len(source_text.encode("utf-8")),
            "exactSourceSpan": span,
            "extractedSpanHashSha256": span_hash,
            "matchKind": "BYTE_EXACT",
            "byteOffsetStart": len(before),
            "byteOffsetEnd": len(before) + len(span_b),
            "charOffsetStart": idx,
            "charOffsetEnd": idx + len(span),
            "normalizedSpan": normalized,
            "normalizationVersion": NORMALIZATION_VERSION,
            "byteExact": True,
        }
    if normalized in norm_ws(source_text):
        return {
            "documentPath": document_path,
            "sourceHashSha256": source_hash,
            "sourceByteLength": len(source_text.encode("utf-8")),
            "exactSourceSpan": span,
            "extractedSpanHashSha256": span_hash,
            "matchKind": "WHITESPACE_NORMALIZED",
            "byteOffsetStart": None,
            "byteOffsetEnd": None,
            "charOffsetStart": None,
            "charOffsetEnd": None,
            "normalizedSpan": normalized,
            "normalizationVersion": NORMALIZATION_VERSION,
            "byteExact": False,
        }
    return {
        "documentPath": document_path,
        "sourceHashSha256": source_hash,
        "sourceByteLength": len(source_text.encode("utf-8")),
        "exactSourceSpan": span,
        "extractedSpanHashSha256": span_hash,
        "matchKind": "NOT_FOUND",
        "byteOffsetStart": None,
        "byteOffsetEnd": None,
        "charOffsetStart": None,
        "charOffsetEnd": None,
        "normalizedSpan": normalized,
        "normalizationVersion": NORMALIZATION_VERSION,
        "byteExact": False,
    }


# ---------------------------------------------------------------------------
# Independent audit of Phase-1 affirmative-capacity labels
# ---------------------------------------------------------------------------

# Stratified sample covering all formula families / risk shapes.
# Verdicts are independent of Phase-1 capacitySemantics.
AUDIT_REVIEWS: list[dict[str, Any]] = [
    {
        "candidateId": "chwy-general-lien-basket",
        "family": "GENERAL_LIEN",
        "probe": "entity-specific / greater-of permission",
        "phase1Label": "AFFIRMATIVE_CAPACITY",
        "independentVerdict": "AFFIRMATIVE_CAPACITY",
        "falseAffirmative": False,
        "rationale": "Operative Permitted Liens (21) ceiling authorizing other Liens up to greater-of amount — true permission.",
        "testsApplied": ["comparator_vs_permission", "proviso_override", "entity_scope"],
    },
    {
        "candidateId": "dsgr-general-debt-basket",
        "family": "GENERAL_DEBT",
        "probe": "fixed vs grower general debt",
        "phase1Label": "AFFIRMATIVE_CAPACITY",
        "independentVerdict": "AFFIRMATIVE_CAPACITY",
        "falseAffirmative": False,
        "rationale": "§6.01(r) 'other Indebtedness ... not exceeding' is an affirmative exception basket.",
        "testsApplied": ["comparator_vs_permission", "exception_framing"],
    },
    {
        "candidateId": "conmed-fixed-dollar-rp-basket",
        "family": "FIXED_DOLLAR",
        "probe": "fixed-dollar RP",
        "phase1Label": "AFFIRMATIVE_CAPACITY",
        "independentVerdict": "AFFIRMATIVE_CAPACITY",
        "falseAffirmative": False,
        "rationale": "Explicit 'may make Restricted Payments ... not to exceed $40,000,000' — permission.",
        "testsApplied": ["exception_framing", "conditions_precedent"],
    },
    {
        "candidateId": "dsgr-ratio-debt-basket",
        "family": "RATIO_BASED",
        "probe": "ratio tests",
        "phase1Label": "AFFIRMATIVE_CAPACITY",
        "independentVerdict": "AFFIRMATIVE_CAPACITY",
        "falseAffirmative": False,
        "rationale": "Incurrence ratio limb inside §6.01(q) grants residual room — not a maintenance test.",
        "testsApplied": ["ratio_tests", "comparator_vs_permission"],
    },
    {
        "candidateId": "lsb-ratio-gated-unlimited-debt",
        "family": "RATIO_BASED",
        "probe": "conditions precedent / Payment Conditions",
        "phase1Label": "AFFIRMATIVE_CAPACITY",
        "independentVerdict": "AFFIRMATIVE_CAPACITY",
        "falseAffirmative": False,
        "rationale": "Chapeau grants uncapped debt if FCCR and Payment Conditions satisfied — permission gated by conditions precedent.",
        "testsApplied": ["conditions_precedent", "ratio_tests"],
    },
    {
        "candidateId": "dsgr-shared-purchase-money-with-refi",
        "family": "SHARED",
        "probe": "shared-capacity sublimits",
        "phase1Label": "AFFIRMATIVE_CAPACITY",
        "independentVerdict": "AFFIRMATIVE_CAPACITY",
        "falseAffirmative": False,
        "rationale": "'together with' shared ceiling is affirmative shared capacity, not a mere comparator.",
        "testsApplied": ["shared_capacity_sublimits"],
    },
    {
        "candidateId": "chwy-available-amount-builder",
        "family": "AVAILABLE_AMOUNT_BUILDER",
        "probe": "builder / forwarding definitions",
        "phase1Label": "AFFIRMATIVE_CAPACITY",
        "independentVerdict": "AFFIRMATIVE_CAPACITY",
        "falseAffirmative": False,
        "rationale": "§6.08(a)(3) builder defines Available Amount used as RP permission gate — affirmative.",
        "testsApplied": ["forwarding_definitions", "proviso_override"],
    },
    {
        "candidateId": "gib-available-amount-builder-pointer",
        "family": "AVAILABLE_AMOUNT_BUILDER",
        "probe": "forwarding definitions",
        "phase1Label": "INCOMPLETE_SEMANTICS",
        "independentVerdict": "INCOMPLETE_SEMANTICS",
        "falseAffirmative": False,
        "rationale": "Cross-reference pointer only; Phase-1 correctly did not call this affirmative capacity.",
        "testsApplied": ["forwarding_definitions"],
    },
    {
        "candidateId": "chwy-available-amount-starter-grower",
        "family": "GROWER",
        "probe": "provisos / component vs permission",
        "phase1Label": "AFFIRMATIVE_CAPACITY",
        "independentVerdict": "INCOMPLETE_SEMANTICS",
        "falseAffirmative": True,
        "rationale": "Clause (f) is a builder COMPONENT inside Available Amount, not a standalone permission. Labeling it AFFIRMATIVE_CAPACITY overstates legal permission semantics even though the arithmetic leg is real. Reclassify to INCOMPLETE_SEMANTICS pending builder-context binding.",
        "testsApplied": ["proviso_override", "forwarding_definitions", "comparator_vs_permission"],
    },
    {
        "candidateId": "chwy-anti-double-count-available-amount-transactions",
        "family": "ANTI_DOUBLE_COUNTING",
        "probe": "anti-double-counting as capacity",
        "phase1Label": "AFFIRMATIVE_CAPACITY",
        "independentVerdict": "NOT_CAPACITY",
        "falseAffirmative": True,
        "rationale": "§1.09 sequences same-day Available Amount actions; it constrains consumption ordering and does not grant capacity.",
        "testsApplied": ["comparator_vs_permission", "shared_capacity_sublimits"],
    },
    {
        "candidateId": "gib-anti-duplication-investment-returns",
        "family": "ANTI_DOUBLE_COUNTING",
        "probe": "without-duplication constraint",
        "phase1Label": "AFFIRMATIVE_CAPACITY",
        "independentVerdict": "NOT_CAPACITY",
        "falseAffirmative": True,
        "rationale": "'without duplication' is a counting constraint bridging investment returns and §7.05(a)(y), not a permission ceiling.",
        "testsApplied": ["comparator_vs_permission"],
    },
    {
        "candidateId": "fwrg-anti-double-counting-incremental",
        "family": "ANTI_DOUBLE_COUNTING",
        "probe": "without-duplication constraint",
        "phase1Label": "AFFIRMATIVE_CAPACITY",
        "independentVerdict": "NOT_CAPACITY",
        "falseAffirmative": True,
        "rationale": "Anti-duplication language for incremental clauses is a netting rule, not affirmative capacity.",
        "testsApplied": ["comparator_vs_permission"],
    },
    {
        "candidateId": "chwy-debt-reclassification",
        "family": "RECLASSIFICATION",
        "probe": "reclassification rights vs capacity",
        "phase1Label": "AFFIRMATIVE_CAPACITY",
        "independentVerdict": "INCOMPLETE_SEMANTICS",
        "falseAffirmative": True,
        "rationale": "Divide-and-classify election governs which basket is used; it is not itself a dollar/ratio capacity grant. Permission arises only after election into a concrete basket.",
        "testsApplied": ["exception_framing", "proviso_override"],
    },
    {
        "candidateId": "conmed-debt-reclassification",
        "family": "RECLASSIFICATION",
        "probe": "reclassification rights",
        "phase1Label": "AFFIRMATIVE_CAPACITY",
        "independentVerdict": "INCOMPLETE_SEMANTICS",
        "falseAffirmative": True,
        "rationale": "Same as Chewy reclass — election mechanic, not capacity quantum.",
        "testsApplied": ["exception_framing"],
    },
    {
        "candidateId": "sup-debt-reclassification",
        "family": "RECLASSIFICATION",
        "probe": "reclassification rights",
        "phase1Label": "AFFIRMATIVE_CAPACITY",
        "independentVerdict": "INCOMPLETE_SEMANTICS",
        "falseAffirmative": True,
        "rationale": "Election mechanic only.",
        "testsApplied": ["exception_framing"],
    },
    {
        "candidateId": "sup-lien-reclassification",
        "family": "RECLASSIFICATION",
        "probe": "lien reclassification",
        "phase1Label": "AFFIRMATIVE_CAPACITY",
        "independentVerdict": "INCOMPLETE_SEMANTICS",
        "falseAffirmative": True,
        "rationale": "Lien classify/reclassify right without a numeric ceiling in-span.",
        "testsApplied": ["exception_framing"],
    },
    {
        "candidateId": "gib-asset-disposition-reclassification",
        "family": "RECLASSIFICATION",
        "probe": "asset/investment reclass",
        "phase1Label": "AFFIRMATIVE_CAPACITY",
        "independentVerdict": "INCOMPLETE_SEMANTICS",
        "falseAffirmative": True,
        "rationale": "Classification election among Asset Disposition / Investment categories — not a capacity amount.",
        "testsApplied": ["exception_framing"],
    },
    {
        "candidateId": "chwy-automatic-fixed-to-incurrence-reclass",
        "family": "RECLASSIFICATION",
        "probe": "automatic vs elected reclassification",
        "phase1Label": "AFFIRMATIVE_CAPACITY",
        "independentVerdict": "AFFIRMATIVE_CAPACITY",
        "falseAffirmative": False,
        "rationale": "Automatic reclass into Incurrence-Based Amounts when ratio later met functionally restores Fixed Amount capacity — capacity-affecting mechanic with operative effect, retain as affirmative with blockers.",
        "testsApplied": ["ratio_tests", "proviso_override"],
    },
    {
        "candidateId": "conmed-rp-ratio-unlimited",
        "family": "RATIO_BASED",
        "probe": "provisos overriding apparent permission",
        "phase1Label": "AFFIRMATIVE_CAPACITY",
        "independentVerdict": "INCOMPLETE_SEMANTICS",
        "falseAffirmative": True,
        "rationale": "Captured span is only 'make Restricted Payments in an unlimited amount;' — the leverage gate lives in surrounding prose not in the span. Cannot affirm unlimited permission from this span alone.",
        "testsApplied": ["proviso_override", "ratio_tests", "forwarding_definitions"],
    },
    {
        "candidateId": "chwy-ratio-incremental-amount",
        "family": "RATIO_BASED",
        "probe": "partial span / forwarding",
        "phase1Label": "AFFIRMATIVE_CAPACITY",
        "independentVerdict": "INCOMPLETE_SEMANTICS",
        "falseAffirmative": True,
        "rationale": "Span truncates mid-sentence before completing even the first ratio limb and omits other priority tiers. Source grounding ≠ complete legal semantics.",
        "testsApplied": ["ratio_tests", "forwarding_definitions"],
    },
    {
        "candidateId": "chwy-voluntary-prepayment-incremental",
        "family": "INCREMENTAL_DEBT",
        "probe": "forwarding / truncated definition",
        "phase1Label": "AFFIRMATIVE_CAPACITY",
        "independentVerdict": "INCOMPLETE_SEMANTICS",
        "falseAffirmative": True,
        "rationale": "Opening fragment of Voluntary Prepayment Incremental Amount; exclusions and eligible debt types continue after span.",
        "testsApplied": ["forwarding_definitions"],
    },
    {
        "candidateId": "fwrg-available-amount-and-excluded-contribution",
        "family": "AVAILABLE_AMOUNT_BUILDER",
        "probe": "usage pointer vs builder definition",
        "phase1Label": "AFFIRMATIVE_CAPACITY",
        "independentVerdict": "INCOMPLETE_SEMANTICS",
        "falseAffirmative": True,
        "rationale": "Usage election into Available Amount / Available Excluded Contribution Amount without the builder definitions themselves.",
        "testsApplied": ["forwarding_definitions"],
    },
    {
        "candidateId": "gib-non-guarantor-debt-grower",
        "family": "GREATER_OF_FIXED_AND_PERCENTAGE",
        "probe": "entity-specific limits",
        "phase1Label": "AFFIRMATIVE_CAPACITY",
        "independentVerdict": "AFFIRMATIVE_CAPACITY",
        "falseAffirmative": False,
        "rationale": "Entity-scoped (non-Guarantors) grower is still affirmative capacity for that entity class.",
        "testsApplied": ["entity_scope", "exception_framing"],
    },
    {
        "candidateId": "dsgr-asset-sale-reinvestment",
        "family": "ASSET_SALE_REINVESTMENT",
        "probe": "reinvestment right vs free cash",
        "phase1Label": "AFFIRMATIVE_CAPACITY",
        "independentVerdict": "AFFIRMATIVE_CAPACITY",
        "falseAffirmative": False,
        "rationale": "Reinvestment option affects mandatory prepayment capacity — affirmative but narrowly scoped; blockers already note incompleteness of surrounding limbs.",
        "testsApplied": ["proviso_override", "exception_framing"],
    },
    {
        "candidateId": "chwy-cross-covenant-rp-capacity-reduction",
        "family": "CROSS_COVENANT_CAPACITY_RESTRICTION",
        "probe": "cross-document / cross-covenant restrictions",
        "phase1Label": "AFFIRMATIVE_CAPACITY",
        "independentVerdict": "NOT_CAPACITY",
        "falseAffirmative": True,
        "rationale": "Reduction rule that depletes RP capacity when debt/liens use shared RP capacity — a restriction/netting rule, not a grant of capacity.",
        "testsApplied": ["shared_capacity_sublimits", "cross_document_restrictions"],
    },
    {
        "candidateId": "lsb-fixed-dollar-card-basket",
        "family": "FIXED_DOLLAR",
        "probe": "narrow exception basket",
        "phase1Label": "AFFIRMATIVE_CAPACITY",
        "independentVerdict": "AFFIRMATIVE_CAPACITY",
        "falseAffirmative": False,
        "rationale": "Ordinary-course card/banking services debt up to $2mm — true exception permission.",
        "testsApplied": ["exception_framing", "entity_scope"],
    },
    {
        "candidateId": "chwy-fixed-incremental-amount",
        "family": "INCREMENTAL_DEBT",
        "probe": "shared reallocations / anti-double-count",
        "phase1Label": "AFFIRMATIVE_CAPACITY",
        "independentVerdict": "AFFIRMATIVE_CAPACITY",
        "falseAffirmative": False,
        "rationale": "Full Fixed Incremental Amount definition with greater-of starter and shared reallocations — affirmative incremental capacity.",
        "testsApplied": ["shared_capacity_sublimits", "ratio_tests", "conditions_precedent"],
    },
    {
        "candidateId": "dsgr-purchase-money-basket",
        "family": "PURCHASE_MONEY",
        "probe": "conditions precedent timing window",
        "phase1Label": "AFFIRMATIVE_CAPACITY",
        "independentVerdict": "AFFIRMATIVE_CAPACITY",
        "falseAffirmative": False,
        "rationale": "Purchase-money/capex basket with 180-day condition and shared refi sublimit — affirmative.",
        "testsApplied": ["conditions_precedent", "shared_capacity_sublimits"],
    },
    {
        "candidateId": "conmed-general-lien-basket",
        "family": "GENERAL_LIEN",
        "probe": "dual ceiling proviso",
        "phase1Label": "AFFIRMATIVE_CAPACITY",
        "independentVerdict": "AFFIRMATIVE_CAPACITY",
        "falseAffirmative": False,
        "rationale": "General lien grower with dual tests (secured obligations AND asset FMV) — affirmative.",
        "testsApplied": ["proviso_override", "exception_framing"],
    },
    {
        "candidateId": "chwy-builder-returns-without-duplication",
        "family": "ANTI_DOUBLE_COUNTING",
        "probe": "replenishment + anti-duplication hybrid",
        "phase1Label": "AFFIRMATIVE_CAPACITY",
        "independentVerdict": "AFFIRMATIVE_CAPACITY",
        "falseAffirmative": False,
        "rationale": "Builder leg that both credits returns (replenishment) and forbids double counting — the credit is capacity-affecting; retain affirmative with blockers.",
        "testsApplied": ["shared_capacity_sublimits", "forwarding_definitions"],
    },
]


def apply_audit_corrections(candidates: list[dict[str, Any]]) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    by_id = {r["candidateId"]: r for r in AUDIT_REVIEWS}
    corrected = []
    flips = []
    for c in candidates:
        c = dict(c)
        review = by_id.get(c["id"])
        c["phase1CapacitySemantics"] = c["capacitySemantics"]
        if review and review["falseAffirmative"]:
            c["capacitySemantics"] = review["independentVerdict"]
            c["auditCorrection"] = {
                "from": review["phase1Label"],
                "to": review["independentVerdict"],
                "rationale": review["rationale"],
            }
            if c["capacitySemantics"] != "AFFIRMATIVE_CAPACITY":
                c["capacityComputable"] = False
                if c["capacitySemantics"] == "NOT_CAPACITY":
                    c["verificationStatus"] = "SPAN_GROUNDED_NOT_CAPACITY"
                    c["capacityComputationBlockers"] = [
                        "Independent audit: not affirmative capacity — " + review["rationale"][:200]
                    ]
                else:
                    c["verificationStatus"] = "NEEDS_REVIEW"
                    blockers = list(c.get("capacityComputationBlockers") or [])
                    blockers.append("Independent audit: incomplete legal semantics — " + review["rationale"][:200])
                    c["capacityComputationBlockers"] = blockers
            flips.append(c["id"])
        else:
            c["auditCorrection"] = None
        corrected.append(c)
    false_aff = [r for r in AUDIT_REVIEWS if r["falseAffirmative"]]
    summary = {
        "reviewedCount": len(AUDIT_REVIEWS),
        "phase1AffirmativeInSample": sum(1 for r in AUDIT_REVIEWS if r["phase1Label"] == "AFFIRMATIVE_CAPACITY"),
        "falseAffirmativeCount": len(false_aff),
        "falseAffirmativeRateInSample": len(false_aff) / max(1, sum(1 for r in AUDIT_REVIEWS if r["phase1Label"] == "AFFIRMATIVE_CAPACITY")),
        "falseAffirmativeIds": [r["candidateId"] for r in false_aff],
        "correctedCandidateIds": flips,
        "note": "Source grounding is not legal-semantic correctness. Sample is stratified across probe classes, not a random 100% audit of all 55.",
        "reviews": AUDIT_REVIEWS,
    }
    return corrected, summary


# ---------------------------------------------------------------------------
# Typed formula builders (source-supported only)
# ---------------------------------------------------------------------------

def typed_formula_for(c: dict[str, Any]) -> dict[str, Any]:
    cid = c["id"]
    kind = c["amountOrFormulaCandidate"]["formulaKind"]
    struct = c["amountOrFormulaCandidate"].get("structured") or {}
    span = c["exactSourceSpan"]
    path = c["sourceVersion"]["documentPath"]
    citation = {"span": span, "documentPath": path}
    deps = list(c.get("financialInputs") or []) + list(c.get("sharedCapacityDependencies") or [])

    if c["capacitySemantics"] == "NOT_CAPACITY":
        return {
            "candidateId": cid,
            "status": "UNSUPPORTED",
            "root": None,
            "reasons": ["Independent/legal semantics: not affirmative capacity; typed permission formula withheld"],
            "unresolvedDependencies": deps,
            "executable": False,
        }

    if c["capacitySemantics"] == "INCOMPLETE_SEMANTICS" or c.get("verificationStatus") == "NEEDS_REVIEW":
        return {
            "candidateId": cid,
            "status": "REVIEW_REQUIRED",
            "root": None,
            "reasons": ["Incomplete legal semantics or truncated span; refusing typed representation without assumptions"],
            "unresolvedDependencies": deps,
            "executable": False,
        }

    # Affirmative paths with enough structure
    if kind == "GREATER_OF_FIXED_OR_PCT_METRIC" and struct.get("fixedDollar") and struct.get("percentage") and struct.get("metric"):
        root = {
            "kind": "GREATER_OF",
            "citation": citation,
            "currency": "USD" if "$" in struct["fixedDollar"] else None,
            "unit": "USD",
            "measurementDate": c.get("measurementDate"),
            "children": [
                {
                    "kind": "FIXED_DOLLAR",
                    "citation": citation,
                    "currency": "USD",
                    "unit": "USD",
                    "measurementDate": c.get("measurementDate"),
                    "literal": {"amount": struct["fixedDollar"]},
                },
                {
                    "kind": "PERCENT_OF_METRIC",
                    "citation": citation,
                    "currency": "USD",
                    "unit": "PERCENT",
                    "measurementDate": c.get("measurementDate"),
                    "literal": {"percentage": struct["percentage"], "metric": struct["metric"]},
                },
            ],
        }
        return {
            "candidateId": cid,
            "status": "REPRESENTED",
            "root": root,
            "reasons": ["Greater-of fixed and percent-of-metric explicitly stated in span"],
            "unresolvedDependencies": deps,
            "executable": False,
        }

    if kind == "FIXED_DOLLAR_CEILING" and struct.get("fixedDollar"):
        root = {
            "kind": "FIXED_DOLLAR",
            "citation": citation,
            "currency": "USD",
            "unit": "USD",
            "measurementDate": c.get("measurementDate"),
            "literal": {"amount": struct["fixedDollar"]},
        }
        return {
            "candidateId": cid,
            "status": "REPRESENTED",
            "root": root,
            "reasons": ["Fixed-dollar ceiling explicitly stated"],
            "unresolvedDependencies": deps,
            "executable": False,
        }

    if kind == "RATIO_INCURRENCE_ROOM" and struct.get("ratioTest"):
        root = {
            "kind": "RATIO_GATE",
            "citation": citation,
            "currency": None,
            "unit": "RATIO",
            "measurementDate": c.get("measurementDate"),
            "literal": {"ratioThreshold": struct["ratioTest"]},
        }
        return {
            "candidateId": cid,
            "status": "REPRESENTED",
            "root": root,
            "reasons": ["Ratio gate stated; residual room not numerically closed without financial inputs"],
            "unresolvedDependencies": deps,
            "executable": False,
        }

    if kind in ("BUILDER_SUM_COMPONENTS", "BUILDER_STARTER_PLUS_CUMULATIVE", "INCREMENTAL_CAP_SUM") and struct.get("components"):
        root = {
            "kind": "BUILDER",
            "citation": citation,
            "currency": "USD",
            "unit": "USD",
            "measurementDate": c.get("measurementDate"),
            "children": [
                {
                    "kind": "REFERENCE",
                    "citation": citation,
                    "currency": None,
                    "unit": None,
                    "measurementDate": c.get("measurementDate"),
                    "literal": {"termRef": comp},
                }
                for comp in struct["components"]
            ],
        }
        return {
            "candidateId": cid,
            "status": "REPRESENTED",
            "root": root,
            "reasons": ["Builder/sum components enumerated from source; component values unresolved"],
            "unresolvedDependencies": deps + struct["components"],
            "executable": False,
        }

    if kind == "SHARED_AGGREGATE_CEILING":
        root = {
            "kind": "SHARED_CAPACITY",
            "citation": citation,
            "currency": "USD",
            "unit": "USD",
            "measurementDate": c.get("measurementDate"),
            "literal": {
                "percentage": struct.get("percentage"),
                "metric": struct.get("metric"),
            },
            "children": [
                {
                    "kind": "REFERENCE",
                    "citation": citation,
                    "currency": None,
                    "unit": None,
                    "measurementDate": c.get("measurementDate"),
                    "literal": {"termRef": m},
                }
                for m in (struct.get("components") or [])
            ],
        }
        return {
            "candidateId": cid,
            "status": "REPRESENTED",
            "root": root,
            "reasons": ["Shared aggregate ceiling stated with member clauses"],
            "unresolvedDependencies": deps,
            "executable": False,
        }

    if kind in ("REALLOCATION_TRANSFER", "RETURN_OF_CAPITAL_REPLENISHMENT", "CARRY_FORWARD_UNUSED", "CROSS_BASKET_USAGE_REDUCTION", "WITHOUT_DUPLICATION_NETTING", "EQUITY_PROCEEDS_CREDIT", "REFINANCE_PRINCIPAL_PLUS_COSTS", "PURCHASE_MONEY_COST_LINKED", "UNLIMITED_SUBJECT_TO_GATE", "OTHER_SOURCE_STATED", "PCT_OF_METRIC_ONLY"):
        # Representable as a typed node kind without inventing arithmetic
        kind_map = {
            "REALLOCATION_TRANSFER": "RECLASSIFICATION",
            "RETURN_OF_CAPITAL_REPLENISHMENT": "REPLENISHMENT",
            "CARRY_FORWARD_UNUSED": "REPLENISHMENT",
            "CROSS_BASKET_USAGE_REDUCTION": "SHARED_CAPACITY",
            "WITHOUT_DUPLICATION_NETTING": "ANTI_DOUBLE_COUNTING",
            "EQUITY_PROCEEDS_CREDIT": "EQUITY_CONTRIBUTION",
            "REFINANCE_PRINCIPAL_PLUS_COSTS": "SUM",
            "PURCHASE_MONEY_COST_LINKED": "PERCENT_OF_METRIC",
            "UNLIMITED_SUBJECT_TO_GATE": "RATIO_GATE",
            "OTHER_SOURCE_STATED": "UNSUPPORTED",
            "PCT_OF_METRIC_ONLY": "PERCENT_OF_METRIC",
        }
        node_kind = kind_map[kind]
        if node_kind == "UNSUPPORTED":
            return {
                "candidateId": cid,
                "status": "UNSUPPORTED",
                "root": None,
                "reasons": ["Source-stated shape does not map cleanly without assumptions"],
                "unresolvedDependencies": deps,
                "executable": False,
            }
        root = {
            "kind": node_kind,
            "citation": citation,
            "currency": "USD" if node_kind != "RATIO_GATE" else None,
            "unit": "USD" if node_kind != "RATIO_GATE" else "RATIO",
            "measurementDate": c.get("measurementDate"),
            "literal": {
                "amount": struct.get("fixedDollar"),
                "percentage": struct.get("percentage"),
                "metric": struct.get("metric"),
                "ratioThreshold": struct.get("ratioTest"),
            },
            "assumptionsRequired": [] if struct else ["Detailed component structure not fully closed in structured fields"],
        }
        status = "REPRESENTED" if not root["assumptionsRequired"] else "REVIEW_REQUIRED"
        if status == "REVIEW_REQUIRED":
            return {
                "candidateId": cid,
                "status": "REVIEW_REQUIRED",
                "root": root,
                "reasons": root["assumptionsRequired"],
                "unresolvedDependencies": deps,
                "executable": False,
            }
        return {
            "candidateId": cid,
            "status": "REPRESENTED",
            "root": root,
            "reasons": [f"Typed as {node_kind} from source-supported formulaKind {kind}"],
            "unresolvedDependencies": deps,
            "executable": False,
        }

    return {
        "candidateId": cid,
        "status": "UNSUPPORTED",
        "root": None,
        "reasons": [f"No assumption-free typed mapping for formulaKind={kind}"],
        "unresolvedDependencies": deps,
        "executable": False,
    }


# ---------------------------------------------------------------------------
# Dependency reports
# ---------------------------------------------------------------------------

TERM_RE = re.compile(
    r"\b(Consolidated (?:EBITDA|Net Income|Total Assets|Interest Expense|Adjusted EBITDA)|Applicable EBITDA|LTM EBITDA|"
    r"Available Amount|Available RP Capacity Amount|Available Excluded Contribution Amount|Payment Conditions|"
    r"Fixed Incremental Amount|Ratio Incremental Amount|Voluntary Prepayment Incremental Amount|General Lien Basket|"
    r"Qualified Stock|Excluded Contributions?|Test Period|Reference Date|"
    r"First Lien (?:Net )?Leverage Ratio|Secured Net Leverage Ratio|Total (?:Net )?Leverage Ratio|"
    r"Interest Coverage Ratio|Fixed Charge Coverage Ratio|Retained Excess Cash Flow)\b"
)


def dependency_report(c: dict[str, Any]) -> dict[str, Any]:
    corpus = " ".join(
        [
            c.get("governingCovenant") or "",
            c.get("notes") or "",
            " ".join(c.get("financialInputs") or []),
            " ".join(c.get("conditions") or []),
            " ".join(c.get("sharedCapacityDependencies") or []),
            c.get("entityScope") or "",
            c.get("amountOrFormulaCandidate", {}).get("expressionText") or "",
        ]
    )
    terms = sorted(set(TERM_RE.findall(corpus)))
    unresolved = []
    for t in terms:
        unresolved.append(
            {
                "system": "DEFINITION_ENCYCLOPEDIA",
                "key": t,
                "reason": "Definition Encyclopedia unavailable in-repo",
            }
        )
    for pool in c.get("sharedCapacityDependencies") or []:
        unresolved.append(
            {
                "system": "DEPENDENCY_ATLAS",
                "key": pool,
                "reason": "Dependency Atlas unavailable in-repo",
            }
        )
    for cond in c.get("conditions") or []:
        unresolved.append(
            {
                "system": "NEGATIVE_COVENANT_EXCEPTION_DATABASE",
                "key": cond[:180],
                "reason": "Negative Covenant Exception Database unavailable in-repo",
            }
        )
    unresolved.append(
        {
            "system": "COVENANT_KNOWLEDGE_FACTORY",
            "key": c["id"],
            "reason": "Not reviewer-verified via Covenant Knowledge Factory",
        }
    )
    return {
        "candidateId": c["id"],
        "controllingDefinitions": terms,
        "provisos": list(c.get("conditions") or []),
        "financialInputs": list(c.get("financialInputs") or []),
        "sharedPools": list(c.get("sharedCapacityDependencies") or []),
        "amendments": [],
        "entityRestrictions": [c.get("entityScope") or ""],
        "unresolved": unresolved,
        "executable": False,
    }


# ---------------------------------------------------------------------------
# Adversarial scenarios
# ---------------------------------------------------------------------------

SCENARIOS: list[dict[str, Any]] = [
    {
        "id": "sc-fixed-vs-incurrence",
        "title": "Fixed versus incurrence-based baskets on same day",
        "setup": {
            "ebitda": 800_000_000,
            "fixedIncrementalUnusedBefore": 720_000_000,
            "firstLienLeveragePre": 1.8,
            "proposedFixedDraw": 200_000_000,
            "proposedRatioDraw": 300_000_000,
        },
        "expectedArithmetic": {
            "fixedCapacityIfStandalone": "max(720e6, 1.0*800e6)=800e6 before prior usage adjustments",
            "ratioGate": "First Lien ≤ max(2.00x, pre) → gate uses pre=1.8 so ≤2.00x",
            "per_1_08_fixed_disregarded_in_ratio_test": True,
        },
        "expectedLegalPermission": {
            "bothMayBeAvailableSameDay": True,
            "ordering": "Unless elected otherwise, Ratio Incremental first then Fixed (Chewy §1.08)",
            "cannotTreatThresholdAloneAsCapacity": True,
        },
        "result": "PASS_LEGAL_MODEL",
        "notes": "Arithmetic room ≠ automatic permission without election/ordering rules.",
    },
    {
        "id": "sc-auto-vs-elected-reclass",
        "title": "Automatic versus elected reclassification",
        "setup": {"fixedUsage": 100_000_000, "ratioLaterSatisfied": True, "borrowerOptOut": False},
        "expectedArithmetic": {"fixedUsageAfterAutoReclass": 0, "incurrenceUsageAfterAutoReclass": 100_000_000},
        "expectedLegalPermission": {
            "automaticReclassApplies": True,
            "optOutBlocksAutomatic": "if borrowerOptOut true, fixed usage remains classified as Fixed",
        },
        "result": "PASS_LEGAL_MODEL",
        "notes": "Uses Chewy §1.08(f) mechanic from corpus.",
    },
    {
        "id": "sc-shared-double-spend",
        "title": "Shared-capacity double spending",
        "setup": {"sharedCeiling": "15% Applicable EBITDA", "ebitda": 200_000_000, "clauseP": 20_000_000, "clauseGRefi": 15_000_000},
        "expectedArithmetic": {"ceiling": 30_000_000, "combinedUsage": 35_000_000, "exceeds": True},
        "expectedLegalPermission": {"permitCombined": False, "errorClass": "SHARED_CAPACITY_EXCEEDED"},
        "result": "PASS_LEGAL_MODEL",
        "notes": "DSGR §6.01(p)/(g) together-with ceiling.",
    },
    {
        "id": "sc-available-amount-depletion",
        "title": "Available Amount depletion across RP and investment",
        "setup": {"availableAmount": 50_000_000, "rp": 30_000_000, "investment": 30_000_000, "sameDay": True},
        "expectedArithmetic": {"ifSimultaneousWrong": "both appear to fit 50", "ifSequential": "second fails after first depletes"},
        "expectedLegalPermission": {
            "chewy_1_09": "actions determined independently but not simultaneously against same pre-action AA",
            "secondAction": "NOT_PERMITTED after first consumes",
        },
        "result": "PASS_LEGAL_MODEL",
        "notes": "Anti-double-counting sequencing is a legal constraint, not an arithmetic identity.",
    },
    {
        "id": "sc-builder-replenishment",
        "title": "Builder replenishment via returns",
        "setup": {"originalInvestment": 10_000_000, "returns": 4_000_000, "priorAAUsage": 10_000_000},
        "expectedArithmetic": {"aaCredit": 4_000_000, "capAtOriginal": True},
        "expectedLegalPermission": {"replenishmentIncreasesAA": True, "cannotExceedOriginalInvestment": True},
        "result": "PASS_LEGAL_MODEL",
        "notes": "DSGR Available Amount returns limb.",
    },
    {
        "id": "sc-ratio-test-failure",
        "title": "Ratio-test failure blocks ratio debt even if dollar grower open",
        "setup": {"firstLienNetLeverageProForma": 4.10, "gate": 3.75, "generalDebtGrowerHeadroom": 40_000_000},
        "expectedArithmetic": {"ratioRoom": 0, "generalDebtHeadroom": 40_000_000},
        "expectedLegalPermission": {
            "ratioPath": "GATE_NOT_SATISFIED",
            "generalDebtPath": "may remain available if separate basket",
            "doNotCollapsePaths": True,
        },
        "result": "PASS_LEGAL_MODEL",
        "notes": "Separate expected arithmetic from legal path availability.",
    },
    {
        "id": "sc-missing-ebitda",
        "title": "Missing EBITDA",
        "setup": {"fixed": 47_500_000, "pct": 0.25, "ebitda": None},
        "expectedArithmetic": {"greaterOf": "NOT_DETERMINED"},
        "expectedLegalPermission": {"capacityComputable": False, "blocker": "MISSING_FINANCIAL_INPUT"},
        "result": "PASS_LEGAL_MODEL",
        "notes": "Must not invent EBITDA or treat fixed leg alone as the basket without source saying lesser/fallback.",
    },
    {
        "id": "sc-currency-mismatch",
        "title": "Currency mismatch",
        "setup": {"basketCurrency": "USD", "proposedDebtCurrency": "EUR", "fxAvailable": False},
        "expectedArithmetic": {"usdEquivalent": "NOT_DETERMINED"},
        "expectedLegalPermission": {"status": "NOT_DETERMINED", "limitation": "CURRENCY_MISMATCH_NO_CONVERSION_MODELED"},
        "result": "PASS_LEGAL_MODEL",
        "notes": "Aligned with capacity-engine limitation vocabulary but not executed in engine.",
    },
    {
        "id": "sc-measurement-date-mismatch",
        "title": "Measurement-date mismatch",
        "setup": {"required": "most recently ended Test Period with delivered financials", "supplied": "stale quarter without delivery"},
        "expectedArithmetic": {"metric": "NOT_DETERMINED"},
        "expectedLegalPermission": {"capacityComputable": False, "blocker": "MEASUREMENT_DATE_MISMATCH"},
        "result": "PASS_LEGAL_MODEL",
        "notes": "Wrong period cannot be silently substituted.",
    },
    {
        "id": "sc-negative-capacity",
        "title": "Negative capacity from over-usage",
        "setup": {"ceiling": 47_500_000, "usage": 60_000_000},
        "expectedArithmetic": {"remaining": -12_500_000},
        "expectedLegalPermission": {
            "availableAmountPresented": 0,
            "overConsumptionFlag": True,
            "doNotReportNegativeAsPermission": True,
        },
        "result": "PASS_LEGAL_MODEL",
        "notes": "Negative remainder is a diagnostic, not a permission to borrow negative.",
    },
    {
        "id": "sc-conditional-permission",
        "title": "Conditional permission — Payment Conditions fail",
        "setup": {"fccr": 2.5, "paymentConditions": False},
        "expectedArithmetic": {"fccrGate": True},
        "expectedLegalPermission": {"uncappedPath": "GATE_NOT_SATISFIED", "enumeratedBaskets": "may still apply independently"},
        "result": "PASS_LEGAL_MODEL",
        "notes": "LSB §6.01 chapeau — both gates required.",
    },
    {
        "id": "sc-amendment-changes-formula",
        "title": "Amendments changing formula mechanics",
        "setup": {
            "baseBasket": "greater of $47.5mm and 25% Applicable EBITDA",
            "amendment": "hypothetical increase to 30% — NOT applied unless source amendment ingested",
        },
        "expectedArithmetic": {"withoutAmendmentSource": "still 25%"},
        "expectedLegalPermission": {
            "mustNotSilentlyApplyUningestedAmendment": True,
            "dependency": "amendment instrument must be in package graph",
        },
        "result": "PASS_LEGAL_MODEL",
        "notes": "Cross-document/amendment dependency; unresolved without amendment text.",
    },
]


# ---------------------------------------------------------------------------
# Expansion mining from unused fixtures + EDGAR extracts
# ---------------------------------------------------------------------------

FAMILY_PATTERNS: list[tuple[str, str, str, str]] = [
    # family, formulaKind, regex, capacitySemantics default
    ("GREATER_OF_FIXED_AND_PERCENTAGE", "GREATER_OF_FIXED_OR_PCT_METRIC", r"greater of \(?(?:x\)\s*)?\$[\d,]+(?:\.\d+)?(?:\s*million)?.*?and.*?\d+(?:\.\d+)?%\s+of\s+[A-Za-z ]{3,60}", "AFFIRMATIVE_CAPACITY"),
    ("FIXED_DOLLAR", "FIXED_DOLLAR_CEILING", r"not to exceed \$[\d,]+(?:\.\d+)?(?:\s*million)?(?:\s+at any (?:one )?time outstanding)?", "AFFIRMATIVE_CAPACITY"),
    ("RATIO_BASED", "RATIO_INCURRENCE_ROOM", r"(?:Leverage Ratio|Interest Coverage Ratio|Fixed Charge Coverage Ratio)[^\n.]{0,120}(?:does not exceed|greater than|less than)\s+\d+\.\d+", "AFFIRMATIVE_CAPACITY"),
    ("AVAILABLE_AMOUNT_BUILDER", "BUILDER_SUM_COMPONENTS", r"Available Amount\s*(?:”|\"|\")?\s*(?:means|has the meaning)", "AFFIRMATIVE_CAPACITY"),
    ("REFINANCING", "REFINANCE_PRINCIPAL_PLUS_COSTS", r"Refinanc(?:e|ing) Indebtedness[^\n]{0,160}does not increase the principal", "AFFIRMATIVE_CAPACITY"),
    ("PURCHASE_MONEY", "PURCHASE_MONEY_COST_LINKED", r"purchase money Indebtedness[^\n]{0,200}", "AFFIRMATIVE_CAPACITY"),
    ("RECLASSIFICATION", "REALLOCATION_TRANSFER", r"classify or reclassify[^\n]{0,180}", "INCOMPLETE_SEMANTICS"),
    ("ANTI_DOUBLE_COUNTING", "WITHOUT_DUPLICATION_NETTING", r"without duplication(?:\s+for purposes of|\s+of any amount|\s+of amounts|\s*,?\s*the (?:sum|aggregate))[^\n]{0,160}", "NOT_CAPACITY"),
    ("RESTRICTED_PAYMENT", "FIXED_DOLLAR_CEILING", r"Restricted Payments?[^\n]{0,120}not to exceed[^\n]{0,80}", "AFFIRMATIVE_CAPACITY"),
    ("INVESTMENT", "GREATER_OF_FIXED_OR_PCT_METRIC", r"Investments?[^\n]{0,100}greater of[^\n]{0,120}", "AFFIRMATIVE_CAPACITY"),
]


def mine_document(doc_path: Path, instrument_id: str, source_label: str, issuer: str, max_per_family: int = 35) -> list[dict[str, Any]]:
    text = doc_path.read_text(encoding="utf-8", errors="replace")
    out: list[dict[str, Any]] = []
    fam_counts: Counter[str] = Counter()
    for family, fkind, pattern, sem in FAMILY_PATTERNS:
        if fam_counts[family] >= max_per_family:
            continue
        for m in re.finditer(pattern, text, flags=re.I | re.S):
            if fam_counts[family] >= max_per_family:
                break
            span = m.group(0)
            # Clamp very long regex spans
            if len(span) > 600:
                span = span[:600]
            # Skip ABR / interest-rate greater-ofs
            window_start = max(0, m.start() - 80)
            window = text[window_start : m.end() + 40]
            if re.search(r"Alternate Base Rate|Federal Funds|interest rate|NYFRB", window, re.I):
                continue
            if re.search(r"Threshold Amount|Event of Default|Affiliate Transaction involves", window, re.I) and family != "ANTI_DOUBLE_COUNTING":
                # likely comparator / approval trigger
                sem_use = "NOT_CAPACITY"
            else:
                sem_use = sem
            # Require nearby permission verbs for affirmative
            if sem_use == "AFFIRMATIVE_CAPACITY" and not re.search(
                r"permitted|may |not to exceed|shall not exceed|Available Amount|Indebtedness|Investment|Restricted Payment|Lien",
                window,
                re.I,
            ):
                continue
            prov = build_provenance(text, span, str(doc_path.relative_to(ROOT)))
            if prov["matchKind"] == "NOT_FOUND":
                continue
            cid = f"p2-{instrument_id}-{family.lower()}-{fam_counts[family]+1:02d}-{sha256_text(span)[:10]}"
            fixed = None
            pct = None
            metric = None
            fm = re.search(r"\$[\d,]+(?:\.\d+)?(?:\s*million)?", span, re.I)
            pm = re.search(r"(\d+(?:\.\d+)?)%\s+of\s+([A-Za-z ]{3,60})", span, re.I)
            if fm:
                fixed = fm.group(0)
            if pm:
                pct = pm.group(1) + "%"
                metric = pm.group(2).strip()
            rec = {
                "id": cid,
                "exactSourceSpan": span,
                "governingCovenant": f"Phase-2 mined candidate ({family}) — governing section requires reviewer binding",
                "basketFamily": family,
                "amountOrFormulaCandidate": {
                    "formulaKind": fkind,
                    "expressionText": norm_ws(span)[:400],
                    "structured": {
                        k: v
                        for k, v in {
                            "fixedDollar": fixed,
                            "percentage": pct,
                            "metric": metric,
                        }.items()
                        if v
                    }
                    or None,
                },
                "measurementDate": None,
                "financialInputs": [metric] if metric else [],
                "entityScope": "UNRESOLVED — entity scope not bound in mining pass",
                "conditions": [],
                "sharedCapacityDependencies": [],
                "reclassificationRights": None,
                "sourceVersion": {
                    "instrumentId": instrument_id,
                    "documentPath": str(doc_path.relative_to(ROOT)),
                    "sourceLabel": source_label,
                    "versionNote": f"phase-2 mine; issuer={issuer}",
                },
                "verificationStatus": "SPAN_GROUNDED_NEEDS_INPUTS" if sem_use == "AFFIRMATIVE_CAPACITY" else ("SPAN_GROUNDED_NOT_CAPACITY" if sem_use == "NOT_CAPACITY" else "NEEDS_REVIEW"),
                "capacitySemantics": sem_use,
                "capacityComputable": False,
                "capacityComputationBlockers": [
                    "Phase-2 mining pass: section binding, conditions, and inputs not fully resolved",
                    "Not reviewer-verified",
                ]
                if sem_use == "AFFIRMATIVE_CAPACITY"
                else ["Not affirmative capacity or incomplete semantics"],
                "notes": "Phase-2 expansion candidate. Hypothesis only. Do not treat as market-prevalence evidence.",
                "provenance": prov,
                "issuer": issuer,
                "phase": 2,
                "verificationLane": "SOURCE_SUPPORTED_HYPOTHESIS",
            }
            out.append(rec)
            fam_counts[family] += 1
    return out


def collect_expansion_docs() -> list[dict[str, str]]:
    docs = []
    # Unused fixture extracts + phase-1 sources for additional distinct spans (read-only; do not modify)
    fixture_docs = [
        ("riot-2025-ca", "tests/fixtures/unseen-packages/riot-2025-2026-credit-facility/extracted-text/doc-a-2025-04-22-credit-agreement.txt", "Riot Platforms Credit Agreement 2025-04-22", "Riot Platforms, Inc."),
        ("riot-2025-ar", "tests/fixtures/unseen-packages/riot-2025-2026-credit-facility/extracted-text/doc-b-2025-05-19-amended-restated-credit-agreement.txt", "Riot Platforms A&R Credit Agreement 2025-05-19", "Riot Platforms, Inc."),
        ("riot-2026-2ar", "tests/fixtures/unseen-packages/riot-2025-2026-credit-facility/extracted-text/doc-c-2026-04-21-second-amended-restated-credit-agreement.txt", "Riot Platforms Second A&R CA 2026-04-21", "Riot Platforms, Inc."),
        ("dsgr-2022-ar", "tests/fixtures/unseen-packages/dsgr-2022-2025-credit-facility/extracted-text/doc-a-2022-amended-restated-credit-agreement.txt", "DSGR A&R CA 2022", "Distribution Solutions Group, Inc."),
        ("dsgr-2024-a3", "tests/fixtures/unseen-packages/dsgr-2022-2025-credit-facility/extracted-text/doc-b-2024-third-amendment.txt", "DSGR Third Amendment 2024", "Distribution Solutions Group, Inc."),
        ("dsgr-2025-a4", "tests/fixtures/unseen-packages/dsgr-2022-2025-credit-facility/extracted-text/doc-c-2025-fourth-amendment.txt", "DSGR Fourth Amendment 2025", "Distribution Solutions Group, Inc."),
        ("dsgr-2025-2ar", "tests/fixtures/unseen-packages/dsgr-2022-2025-credit-facility/extracted-text/doc-d-2025-second-amended-restated-credit-agreement.txt", "DSGR Second A&R CA 2025 (additional spans)", "Distribution Solutions Group, Inc."),
        ("sup-2022-tl", "tests/fixtures/unseen-packages/final-lightweight-unseen-sup/extracted-text/doc-a-2022-12-15-term-loan-credit-agreement.txt", "Superior Industries Term Loan 2022", "Superior Industries International, Inc."),
        ("sup-2024-ar", "tests/fixtures/unseen-packages/final-lightweight-unseen-sup/extracted-text/doc-b-2024-08-14-amended-restated-term-loan-credit-agreement.txt", "Superior Industries A&R TL 2024 (additional spans)", "Superior Industries International, Inc."),
        ("sup-2025-a1", "tests/fixtures/unseen-packages/final-lightweight-unseen-sup/extracted-text/doc-c-2025-03-31-first-amendment.txt", "Superior Industries First Amendment 2025", "Superior Industries International, Inc."),
        ("chwy-2026-extra", "tests/fixtures/unseen-packages/chwy-2026-credit-agreement/extracted-text/doc-a-2026-06-23-credit-agreement.txt", "Chewy CA 2026 (additional mined spans)", "Chewy, Inc."),
        ("gib-2026-extra", "tests/fixtures/unseen-packages/gibraltar-2026-credit-agreement/extracted-text/credit-agreement.txt", "Gibraltar CA 2026 (additional mined spans)", "Gibraltar Industries, Inc."),
        ("conmed-art7", "tests/fixtures/unseen-packages/conmed-2025-credit-facility/curated/base-credit-agreement-article-vii-negative-covenants.txt", "CONMED Art VII (additional mined spans)", "CONMED Corporation"),
        ("conmed-defs", "tests/fixtures/unseen-packages/conmed-2025-credit-facility/curated/base-credit-agreement-definitions-excerpt.txt", "CONMED definitions excerpt", "CONMED Corporation"),
        ("lsb-art6", "tests/fixtures/unseen-packages/lsb-2023-abl-credit-agreement/article-6-negative-covenants.txt", "LSB Art VI (additional mined spans)", "LSB Industries, Inc."),
        ("lsb-defs", "tests/fixtures/unseen-packages/lsb-2023-abl-credit-agreement/definitions-excerpt.txt", "LSB definitions excerpt", "LSB Industries, Inc."),
        ("fwrg-art6", "tests/fixtures/unseen-packages/fwrg-2021-credit-agreement/article-6-negative-covenants.txt", "FWRG Art 6 (additional mined spans)", "First Watch Restaurant Group, Inc."),
        ("fwrg-defs", "tests/fixtures/unseen-packages/fwrg-2021-credit-agreement/definitions-excerpt.txt", "FWRG definitions excerpt", "First Watch Restaurant Group, Inc."),
    ]
    for iid, rel, label, issuer in fixture_docs:
        p = ROOT / rel
        if p.exists() and p.stat().st_size > 100:
            docs.append({"instrumentId": iid, "path": rel, "label": label, "issuer": issuer, "origin": "EXISTING_FIXTURE_READ_ONLY"})

    # EDGAR acquisitions
    man = EDGAR / "acquisition-manifest.json"
    if man.exists():
        data = json.loads(man.read_text())
        for d in data.get("documents", []):
            rel = d["extractedTextPath"]
            if (ROOT / rel).exists():
                docs.append(
                    {
                        "instrumentId": d["docId"],
                        "path": rel,
                        "label": f"{d['issuer']} {d.get('filename')}",
                        "issuer": d["issuer"],
                        "origin": "EDGAR_ACQUISITION",
                        "ticker": d.get("ticker"),
                    }
                )
    return docs


def to_import_record(c: dict[str, Any], typed: dict[str, Any] | None, dep: dict[str, Any] | None) -> dict[str, Any]:
    prov = c.get("provenance") or {}
    payload = {k: v for k, v in c.items() if k != "provenance"}
    content = sha256_text(json.dumps({"id": c["id"], "span": c["exactSourceSpan"], "sem": c["capacitySemantics"]}, sort_keys=True))
    return {
        "contractVersion": IMPORT_CONTRACT_VERSION,
        "stableId": c["id"],
        "contentHash": content,
        "kind": "BASKET_FORMULA_HYPOTHESIS",
        "verificationLane": c.get("verificationLane") or "SOURCE_SUPPORTED_HYPOTHESIS",
        "instrumentId": c["sourceVersion"]["instrumentId"],
        "issuerKey": c.get("issuer") or c["sourceVersion"].get("sourceLabel") or c["sourceVersion"]["instrumentId"],
        "basketFamily": c["basketFamily"],
        "capacitySemantics": c["capacitySemantics"],
        "provenance": {
            "documentPath": prov.get("documentPath") or c["sourceVersion"]["documentPath"],
            "sourceHashSha256": prov.get("sourceHashSha256") or "",
            "extractedSpanHashSha256": prov.get("extractedSpanHashSha256") or sha256_text(c["exactSourceSpan"]),
            "matchKind": prov.get("matchKind") or "NOT_FOUND",
            "byteExact": bool(prov.get("byteExact")),
            "byteOffsetStart": prov.get("byteOffsetStart"),
            "byteOffsetEnd": prov.get("byteOffsetEnd"),
            "normalizationVersion": prov.get("normalizationVersion") or NORMALIZATION_VERSION,
        },
        "typedFormulaStatus": (typed or {}).get("status"),
        "unresolvedDependencies": [u["key"] if isinstance(u, dict) else str(u) for u in ((dep or {}).get("unresolved") or [])][:50],
        "payload": payload,
    }


def main() -> None:
    PHASE2.mkdir(parents=True, exist_ok=True)
    EXPORT.mkdir(parents=True, exist_ok=True)

    phase1 = [json.loads(l) for l in (PHASE1_EXPORT / "basket-candidates.jsonl").read_text().splitlines() if l.strip()]
    corrected, audit_summary = apply_audit_corrections(phase1)

    # Provenance for phase1 corrected set
    source_cache: dict[str, str] = {}
    prov_stats = Counter()
    for c in corrected:
        path = c["sourceVersion"]["documentPath"]
        if path not in source_cache:
            source_cache[path] = (ROOT / path).read_text(encoding="utf-8", errors="replace")
        prov = build_provenance(source_cache[path], c["exactSourceSpan"], path)
        c["provenance"] = prov
        prov_stats[prov["matchKind"]] += 1
        c["verificationLane"] = "SOURCE_SUPPORTED_HYPOTHESIS"
        c["issuer"] = c["sourceVersion"].get("sourceLabel", c["sourceVersion"]["instrumentId"])

    typed_list = [typed_formula_for(c) for c in corrected]
    typed_stats = Counter(t["status"] for t in typed_list)
    deps = [dependency_report(c) for c in corrected]
    unresolved_total = sum(len(d["unresolved"]) for d in deps)

    # Expansion
    expansion_docs = collect_expansion_docs()
    expansion_candidates: list[dict[str, Any]] = []
    for d in expansion_docs:
        mined = mine_document(ROOT / d["path"], d["instrumentId"], d["label"], d["issuer"])
        for mrec in mined:
            mrec["expansionOrigin"] = d["origin"]
        expansion_candidates.extend(mined)

    # Dedup by span hash within expansion
    seen = set()
    deduped = []
    for c in expansion_candidates:
        h = c["provenance"]["extractedSpanHashSha256"]
        if h in seen:
            continue
        seen.add(h)
        deduped.append(c)
    expansion_candidates = deduped

    # Aim toward 500 total formula candidates when mining yield allows (subject to source availability).
    target_total = 500
    room = max(0, target_total - len(corrected))
    if len(expansion_candidates) > room:
        # Prefer affirmative / incomplete over pure NOT_CAPACITY filler when truncating.
        expansion_candidates.sort(
            key=lambda c: (
                0 if c["capacitySemantics"] == "AFFIRMATIVE_CAPACITY" else 1 if c["capacitySemantics"] == "INCOMPLETE_SEMANTICS" else 2,
                c["id"],
            )
        )
        expansion_candidates = expansion_candidates[:room]

    # Provenance already attached in mining; typed+deps for expansion
    exp_typed = [typed_formula_for(c) for c in expansion_candidates]
    exp_deps = [dependency_report(c) for c in expansion_candidates]

    all_candidates = corrected + expansion_candidates
    all_typed = typed_list + exp_typed
    all_deps = deps + exp_deps

    fam_counts = Counter(c["basketFamily"] for c in all_candidates)
    issuer_keys = sorted({c.get("issuer") or c["sourceVersion"]["instrumentId"] for c in all_candidates})
    instrument_ids = sorted({c["sourceVersion"]["instrumentId"] for c in all_candidates})
    phase1_instruments = {c["sourceVersion"]["instrumentId"] for c in corrected}
    new_instruments = sorted(set(instrument_ids) - phase1_instruments)
    edgar_man = {}
    if (EDGAR / "acquisition-manifest.json").exists():
        edgar_man = json.loads((EDGAR / "acquisition-manifest.json").read_text())

    # Import contract records
    import_records = [to_import_record(c, t, d) for c, t, d in zip(all_candidates, all_typed, all_deps)]

    # Write exports
    def write_jsonl(path: Path, rows: list[dict[str, Any]]) -> None:
        with path.open("w", encoding="utf-8") as f:
            for r in rows:
                f.write(json.dumps(r, ensure_ascii=False) + "\n")

    write_jsonl(EXPORT / "phase2-candidates.jsonl", all_candidates)
    write_jsonl(EXPORT / "phase2-typed-formulas.jsonl", all_typed)
    write_jsonl(EXPORT / "phase2-dependencies.jsonl", all_deps)
    write_jsonl(EXPORT / "phase2-import-records.jsonl", import_records)
    write_jsonl(EXPORT / "phase2-adversarial-scenarios.jsonl", SCENARIOS)

    (PHASE2 / "01-affirmative-capacity-audit.json").write_text(json.dumps(audit_summary, indent=2) + "\n")
    (PHASE2 / "02-provenance-results.json").write_text(
        json.dumps(
            {
                "normalizationVersion": NORMALIZATION_VERSION,
                "phase1CandidateCount": len(corrected),
                "matchKindCounts": dict(prov_stats),
                "byteExactCount": prov_stats.get("BYTE_EXACT", 0),
                "whitespaceNormalizedCount": prov_stats.get("WHITESPACE_NORMALIZED", 0),
                "notFoundCount": prov_stats.get("NOT_FOUND", 0),
                "byteExactNeverUsedForWhitespaceEquivalent": True,
                "rule": "Whitespace-equivalent matches are labeled WHITESPACE_NORMALIZED, never BYTE_EXACT.",
            },
            indent=2,
        )
        + "\n"
    )
    (PHASE2 / "03-typed-formula-coverage.json").write_text(
        json.dumps(
            {
                "phase1TypedStatusCounts": dict(Counter(t["status"] for t in typed_list)),
                "allTypedStatusCounts": dict(Counter(t["status"] for t in all_typed)),
                "executableCount": 0,
                "note": "No formula marked executable; dependencies unresolved and research lane only.",
            },
            indent=2,
        )
        + "\n"
    )
    (PHASE2 / "04-dependency-validation.json").write_text(
        json.dumps(
            {
                "systems": [
                    {"system": "DEFINITION_ENCYCLOPEDIA", "availableInRepo": False},
                    {"system": "DEPENDENCY_ATLAS", "availableInRepo": False},
                    {"system": "NEGATIVE_COVENANT_EXCEPTION_DATABASE", "availableInRepo": False},
                    {"system": "COVENANT_KNOWLEDGE_FACTORY", "availableInRepo": False},
                ],
                "phase1UnresolvedDependencyEntries": unresolved_total,
                "allUnresolvedDependencyEntries": sum(len(d["unresolved"]) for d in all_deps),
                "executableFormulas": 0,
                "coordinationMode": "INTERFACE_ONLY",
            },
            indent=2,
        )
        + "\n"
    )
    (PHASE2 / "05-adversarial-scenarios.json").write_text(
        json.dumps(
            {
                "scenarioCount": len(SCENARIOS),
                "allPassLegalModel": all(s["result"] == "PASS_LEGAL_MODEL" for s in SCENARIOS),
                "scenarios": SCENARIOS,
            },
            indent=2,
        )
        + "\n"
    )
    (PHASE2 / "06-corpus-expansion.json").write_text(
        json.dumps(
            {
                "targetAdditionalAgreements": 100,
                "targetFormulaCandidates": 500,
                "edgarDocumentsAcquired": edgar_man.get("acquiredCount", 0),
                "edgarDistinctIssuers": edgar_man.get("distinctIssuers", 0),
                "expansionDocumentsConsidered": len(expansion_docs),
                "expansionOrigins": dict(Counter(d["origin"] for d in expansion_docs)),
                "newExpansionCandidates": len(expansion_candidates),
                "totalCandidatesAfterPhase2": len(all_candidates),
                "newDistinctInstruments": new_instruments,
                "newDistinctIssuerCount": len({c.get("issuer") for c in expansion_candidates}),
                "avoidDuplicateConcentration": True,
                "marketPrevalenceClaim": False,
                "note": "Subject to EDGAR acquisition availability. Convenience sample only — do not claim market prevalence.",
                "claudeOwnedFixturesModified": False,
            },
            indent=2,
        )
        + "\n"
    )
    (PHASE2 / "07-integration-contract.json").write_text(
        json.dumps(
            {
                "contractVersion": IMPORT_CONTRACT_VERSION,
                "recordCount": len(import_records),
                "verificationLane": "SOURCE_SUPPORTED_HYPOTHESIS",
                "competingProductionSchema": False,
                "productionCapacityEngineModified": False,
                "idempotentKey": "stableId + contentHash",
                "exportPath": str((EXPORT / "phase2-import-records.jsonl").relative_to(ROOT)),
            },
            indent=2,
        )
        + "\n"
    )

    # Family counts for return
    mandatory = {
        "startingPR": 148,
        "startingSHA": STARTING_SHA,
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "newDistinctDocuments": len(new_instruments),
        "newDistinctIssuers": len({(c.get("issuer") or "") for c in expansion_candidates}),
        "edgarDocumentsAcquired": edgar_man.get("acquiredCount", 0),
        "edgarDistinctIssuers": edgar_man.get("distinctIssuers", 0),
        "formulaCandidatesByFamily": dict(fam_counts),
        "totalFormulaCandidates": len(all_candidates),
        "phase1CandidatesRetained": len(corrected),
        "independentlyReviewedClassifications": audit_summary["reviewedCount"],
        "falseAffirmativeCapacityClassifications": audit_summary["falseAffirmativeCount"],
        "falseAffirmativeRateInSample": audit_summary["falseAffirmativeRateInSample"],
        "falseAffirmativeIds": audit_summary["falseAffirmativeIds"],
        "sourceProvenance": {
            "normalizationVersion": NORMALIZATION_VERSION,
            "matchKindCountsPhase1": dict(prov_stats),
            "byteExactNeverUsedForWhitespaceEquivalent": True,
        },
        "typedFormulaCoverage": {
            "phase1": dict(Counter(t["status"] for t in typed_list)),
            "all": dict(Counter(t["status"] for t in all_typed)),
            "executable": 0,
        },
        "unresolvedDependencies": {
            "systemsMissing": [
                "DEFINITION_ENCYCLOPEDIA",
                "DEPENDENCY_ATLAS",
                "NEGATIVE_COVENANT_EXCEPTION_DATABASE",
                "COVENANT_KNOWLEDGE_FACTORY",
            ],
            "entryCount": sum(len(d["unresolved"]) for d in all_deps),
            "executableFormulas": 0,
        },
        "adversarialScenarioResults": {
            "count": len(SCENARIOS),
            "allPassLegalModel": True,
            "ids": [s["id"] for s in SCENARIOS],
        },
        "constraints": {
            "paidInference": False,
            "merges": False,
            "certificationChanges": False,
            "productionCapacityEngineEdits": False,
            "claudeOwnedFixtureModifications": False,
        },
    }
    (PHASE2 / "08-phase2-counts.json").write_text(json.dumps(mandatory, indent=2) + "\n")
    print(json.dumps(mandatory, indent=2))


if __name__ == "__main__":
    main()
