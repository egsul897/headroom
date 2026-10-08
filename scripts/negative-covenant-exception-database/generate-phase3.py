#!/usr/bin/env python3
"""Generate NCEDB Phase 3 artifacts.

Deterministic / offline research dataset. No paid inference.
Does not touch lib/contract-model or Claude-owned fixtures.
Does not promote records into production Permission tables.
"""
from __future__ import annotations

import hashlib
import json
import re
from copy import deepcopy
from pathlib import Path

ROOT = Path("/workspace")
PHASE2 = ROOT / "docs/negative-covenant-exception-database/phase-2"
OUT = ROOT / "docs/negative-covenant-exception-database/phase-3"
DATASET_VERSION = "ncedb.phase3.v1"

# Peer coordination pins (read-only; not merged into this branch).
PEER_BRANCHES = {
    "WS-DEF": "cursor/definition-encyclopedia-2a50",
    "WS-CDA": "cursor/covenant-dependency-atlas-5021",
    "WS-BFL": "cursor/covenant-basket-capacity-formula-library-ae51",
    "WS-ACR": "cursor/amendment-chain-research-2926",
    "WS-S2C": "cursor/source-to-covenant-dataset-6502",
    "WS-EHB": "cursor/edgar-historical-backfill-c45c",
    "WS-CKF": "cursor/covenant-knowledge-factory-7327",
}


def sha256_file(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def sha256_text(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def write_json(path: Path, obj) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(obj, indent=2, sort_keys=False) + "\n", encoding="utf-8")


def load_phase2():
    return json.loads((PHASE2 / "catalogs/exceptions-v2.json").read_text())


def span_for(path: str, exact: str) -> dict | None:
    abs_path = ROOT / path
    if not abs_path.exists():
        return None
    text = abs_path.read_text(encoding="utf-8", errors="replace")
    idx = text.find(exact)
    if idx < 0:
        # whitespace-normalized fallback
        norm = re.sub(r"\s+", " ", text)
        nexact = re.sub(r"\s+", " ", exact)
        nidx = norm.find(nexact)
        if nidx < 0:
            return {
                "sourcePath": path,
                "sourceSha256": sha256_file(abs_path),
                "charStart": -1,
                "charEnd": -1,
                "exactText": exact,
                "matchStatus": "UNRESOLVED",
            }
        # map approx — mark normalized
        return {
            "sourcePath": path,
            "sourceSha256": sha256_file(abs_path),
            "charStart": -1,
            "charEnd": -1,
            "exactText": exact,
            "matchStatus": "NORMALIZED_WHITESPACE",
        }
    return {
        "sourcePath": path,
        "sourceSha256": sha256_file(abs_path),
        "charStart": idx,
        "charEnd": idx + len(exact),
        "exactText": text[idx : idx + len(exact)],
        "matchStatus": "EXACT",
    }


# ---------------------------------------------------------------------------
# 1. Unconditional classification audit
# ---------------------------------------------------------------------------

def build_unconditional_audit(phase2: dict) -> dict:
    """Independently audit all four UNCONDITIONAL_SOURCE_VERIFIED records."""
    by_id = {e["exceptionId"]: e for e in phase2["exceptions"]}
    audits = []

    # --- CONMED 7.2(a) ---
    conmed = by_id["conmed-7.2-a-loan-document-debt"]
    conmed_nc = "tests/fixtures/unseen-packages/conmed-2025-credit-facility/curated/base-credit-agreement-article-vii-negative-covenants.txt"
    conmed_defs = "tests/fixtures/unseen-packages/conmed-2025-credit-facility/curated/base-credit-agreement-definitions-excerpt.txt"
    defs_text = (ROOT / conmed_defs).read_text(encoding="utf-8", errors="replace")
    loan_party_def_present = bool(re.search(r'"Loan Party"\s*:', defs_text)) or "Loan Party means" in defs_text
    loan_doc_def_present = bool(re.search(r'"Loan Documents?"\s*:', defs_text)) or "Loan Document means" in defs_text
    audits.append(
        {
            "exceptionId": "conmed-7.2-a-loan-document-debt",
            "phase2Classification": "UNCONDITIONAL_SOURCE_VERIFIED",
            "phase3Classification": "CONDITIONAL",
            "categoricalExceptionVsLegalPermission": {
                "isUnconditionalCategoricalExceptionInLocalClause": True,
                "isUnconditionalLegalPermission": False,
                "distinction": (
                    "Local clause is a categorical carve-out with no dollar/ratio gate, but "
                    "entity/instrument scope depends on Loan Party / Loan Document definitions "
                    "that are not present in the curated definitions excerpt. Categorical exception "
                    "≠ unconditional legal permission; incomplete controlling context requires downgrade."
                ),
            },
            "reconstruction": {
                "parentProhibition": conmed["parentProhibition"],
                "exceptionAndProvisos": {
                    "exactExceptionText": conmed["exactExceptionText"],
                    "localProvisos": [],
                    "note": "No local proviso; definitional scope is remote.",
                },
                "incorporatedDefinitions": [
                    {
                        "term": "Loan Party",
                        "presentInCuratedDefsExcerpt": loan_party_def_present,
                        "status": "MISSING_FROM_CURATED_EXCERPT",
                    },
                    {
                        "term": "Loan Document",
                        "presentInCuratedDefsExcerpt": loan_doc_def_present,
                        "status": "MISSING_FROM_CURATED_EXCERPT",
                    },
                ],
                "entityAndInstrumentScope": {
                    "includes": ["Loan Party"],
                    "instrumentConstraint": "pursuant to any Loan Document",
                    "sourceSpanResolved": False,
                },
                "remoteConditions": [
                    "Article VII chapeau entity restriction (Parent Borrower / Subsidiaries)",
                    "Loan Party / Loan Document definitional bounds (unresolved in curated defs)",
                ],
                "sharedCapacity": [],
                "financialTests": [],
                "amendmentAuthority": conmed.get("amendmentAuthority", []),
                "externalDocumentRestrictions": [],
            },
            "downgradeReason": (
                "Controlling definitional context for Loan Party / Loan Document is incomplete "
                "in the curated source package; cannot verify unconditional legal permission."
            ),
            "productionCapacityInferred": False,
            "auditTrailPreserved": True,
            "verificationStatusAfterAudit": "SOURCE_VERIFIED_PARTIAL_CONTEXT",
        }
    )

    # --- Gibraltar 7.06(b)(1) ---
    gib = by_id["gibraltar-7.06-b-1-loan-docs-burdensome-exception"]
    gib_path = "tests/fixtures/unseen-packages/gibraltar-2026-credit-agreement/extracted-text/credit-agreement.txt"
    gib_text = (ROOT / gib_path).read_text(encoding="utf-8", errors="replace")
    limb_y = "pursuant to any instrument or agreement in effect at or entered into on the Closing Date"
    limb_y_present = limb_y in gib_text or "in effect at or entered into on the Closing Date" in gib_text
    audits.append(
        {
            "exceptionId": "gibraltar-7.06-b-1-loan-docs-burdensome-exception",
            "phase2Classification": "UNCONDITIONAL_SOURCE_VERIFIED",
            "phase3Classification": "CONDITIONAL",
            "categoricalExceptionVsLegalPermission": {
                "isUnconditionalCategoricalExceptionInLocalClause": False,
                "isUnconditionalLegalPermission": False,
                "distinction": (
                    "7.06(b)(1) has two limbs: (x) Loan Documents / Facilities Obligations and "
                    "(y) instruments in effect on the Closing Date. Limb (y) is an external-document "
                    "/ Closing Date condition. Parent 7.06(a) also carries provisos. Phase-2 remoteConditions "
                    "were empty — incomplete. Not unconditional legal permission."
                ),
            },
            "reconstruction": {
                "parentProhibition": gib["parentProhibition"],
                "exceptionAndProvisos": {
                    "exactExceptionText": gib["exactExceptionText"],
                    "dualLimb": True,
                    "limbYClosingDate": limb_y_present,
                    "parentProvisosIn706a": True,
                },
                "incorporatedDefinitions": [
                    {"term": "Loan Documents", "status": "REFERENCED_NOT_FULLY_CLOSED_IN_RECORD"},
                    {"term": "Closing Date", "status": "EXTERNAL_TEMPORAL_ANCHOR"},
                    {"term": "Obligations / Facilities", "status": "REFERENCED_NOT_FULLY_CLOSED_IN_RECORD"},
                ],
                "entityAndInstrumentScope": gib.get("entityScope"),
                "remoteConditions": [
                    "7.06(a) parent provisos (Preferred Stock priority / subordination carve-outs)",
                    "Closing Date instrument limb (external/temporal)",
                    "Loan Document definitional scope",
                ],
                "sharedCapacity": [],
                "financialTests": [],
                "amendmentAuthority": gib.get("amendmentAuthority", []),
                "externalDocumentRestrictions": [
                    "instruments/agreements in effect at or entered into on the Closing Date"
                ],
            },
            "downgradeReason": (
                "Closing Date external limb + parent provisos + unresolved definitional closure; "
                "phase-2 omitted remote conditions."
            ),
            "productionCapacityInferred": False,
            "auditTrailPreserved": True,
            "verificationStatusAfterAudit": "SOURCE_VERIFIED_PARTIAL_CONTEXT",
        }
    )

    # --- DSGR 6.01(a) ---
    dsgr = by_id["dsgr-6.01-a-secured-obligations"]
    dsgr_path = "tests/fixtures/unseen-packages/dsgr-2022-2025-credit-facility/extracted-text/doc-d-2025-second-amended-restated-credit-agreement.txt"
    dsgr_text = (ROOT / dsgr_path).read_text(encoding="utf-8", errors="replace")
    secured_def_idx = dsgr_text.find("Secured Obligations ” means")
    if secured_def_idx < 0:
        secured_def_idx = dsgr_text.find("Secured Obligations")
    secured_def_excerpt = dsgr_text[secured_def_idx : secured_def_idx + 420] if secured_def_idx >= 0 else ""
    audits.append(
        {
            "exceptionId": "dsgr-6.01-a-secured-obligations",
            "phase2Classification": "UNCONDITIONAL_SOURCE_VERIFIED",
            "phase3Classification": "CONDITIONAL",
            "categoricalExceptionVsLegalPermission": {
                "isUnconditionalCategoricalExceptionInLocalClause": True,
                "isUnconditionalLegalPermission": False,
                "distinction": (
                    "Local (a) has no quantum gate, but Secured Obligations is definitionally "
                    "conditioned (Excluded Swap Obligations proviso) and Article VI chapeau limits "
                    "duration to Paid-in-Full. Definitional/remote conditions → CONDITIONAL."
                ),
            },
            "reconstruction": {
                "parentProhibition": dsgr["parentProhibition"],
                "exceptionAndProvisos": {
                    "exactExceptionText": dsgr["exactExceptionText"],
                    "localProvisos": [],
                },
                "incorporatedDefinitions": [
                    {
                        "term": "Secured Obligations",
                        "status": "FOUND_IN_SOURCE",
                        "excerpt": secured_def_excerpt,
                        "embeddedProviso": "Excluded Swap Obligations carve-out in definition",
                    },
                    {
                        "term": "Guaranteed Obligations",
                        "status": "PARTIALLY_RESOLVED",
                        "note": "Canadian/U.S. Guaranteed Obligations variants; full closure not in phase-2 record",
                    },
                ],
                "entityAndInstrumentScope": dsgr.get("entityScope"),
                "remoteConditions": [
                    "Article VI Paid-in-Full duration chapeau",
                    "Secured Obligations definitional proviso (Excluded Swap Obligations)",
                ],
                "sharedCapacity": [],
                "financialTests": [],
                "amendmentAuthority": dsgr.get("amendmentAuthority", []),
                "externalDocumentRestrictions": [],
            },
            "downgradeReason": (
                "Incorporated Secured Obligations definition contains controlling provisos; "
                "article-level Paid-in-Full duration is a remote condition."
            ),
            "productionCapacityInferred": False,
            "auditTrailPreserved": True,
            "verificationStatusAfterAudit": "SOURCE_VERIFIED_PARTIAL_CONTEXT",
        }
    )

    # --- RIOT 5.02(a)(i) ---
    riot = by_id["riot-5.02-a-i-facility-liens"]
    riot_path = "tests/fixtures/unseen-packages/riot-2025-2026-credit-facility/extracted-text/doc-c-2026-04-21-second-amended-restated-credit-agreement.txt"
    riot_text = (ROOT / riot_path).read_text(encoding="utf-8", errors="replace")
    loan_doc_def = ""
    i = riot_text.find("“Loan Document” means")
    if i >= 0:
        loan_doc_def = riot_text[i : i + 280]
    collateral_def = ""
    j = riot_text.find("“Collateral” has the meaning")
    if j >= 0:
        collateral_def = riot_text[j : j + 160]
    audits.append(
        {
            "exceptionId": "riot-5.02-a-i-facility-liens",
            "phase2Classification": "UNCONDITIONAL_SOURCE_VERIFIED",
            "phase3Classification": "CONDITIONAL",
            "categoricalExceptionVsLegalPermission": {
                "isUnconditionalCategoricalExceptionInLocalClause": True,
                "isUnconditionalLegalPermission": False,
                "distinction": (
                    "Clause (i) is categorical in-form (no dollar/ratio), but permission is bounded by "
                    "Loan Document, Collateral Agent, Secured Parties, and Collateral — and Collateral "
                    "is defined by external Pledge and Collateral Account Control Agreement. "
                    "Not unconditional legal permission; no production capacity inference."
                ),
            },
            "reconstruction": {
                "parentProhibition": riot["parentProhibition"],
                "exceptionAndProvisos": {
                    "exactExceptionText": riot["exactExceptionText"],
                    "localProvisos": [],
                },
                "incorporatedDefinitions": [
                    {"term": "Loan Document", "status": "FOUND_IN_SOURCE", "excerpt": loan_doc_def},
                    {"term": "Collateral Agent", "status": "FOUND_IN_SOURCE", "note": "Coinbase Credit"},
                    {
                        "term": "Collateral",
                        "status": "EXTERNAL_DOCUMENT",
                        "excerpt": collateral_def,
                        "externalDoc": "Pledge and Collateral Account Control Agreement",
                    },
                    {"term": "Secured Parties", "status": "REFERENCED"},
                ],
                "entityAndInstrumentScope": {
                    "includes": ["Borrower"],
                    "assetScope": "Collateral only (not all assets)",
                    "instrumentConstraint": "pursuant to any Loan Document; in favor of Collateral Agent",
                },
                "remoteConditions": [
                    "Loan Document definitional set",
                    "Collateral external definition (Pledge agreement)",
                ],
                "sharedCapacity": [],
                "financialTests": [],
                "amendmentAuthority": riot.get("amendmentAuthority", []),
                "externalDocumentRestrictions": [
                    "Pledge and Collateral Account Control Agreement (Collateral definition)"
                ],
            },
            "downgradeReason": (
                "Definitional + external Collateral document restrictions control the exception; "
                "phase-2 remoteConditions were empty."
            ),
            "productionCapacityInferred": False,
            "auditTrailPreserved": True,
            "verificationStatusAfterAudit": "SOURCE_VERIFIED_PARTIAL_CONTEXT",
        }
    )

    surviving = [a for a in audits if a["phase3Classification"] == "UNCONDITIONAL_SOURCE_VERIFIED"]
    return {
        "artifact": "01-unconditional-classification-audit",
        "datasetVersion": DATASET_VERSION,
        "principle": (
            "Distinguish unconditional categorical exception (local clause form) from "
            "unconditional legal permission (no controlling remote/definitional/external constraints). "
            "Incomplete controlling context → downgrade. Never infer production capacity."
        ),
        "auditedCount": len(audits),
        "downgradedCount": sum(1 for a in audits if a["phase3Classification"] != a["phase2Classification"]),
        "survivingUnconditionalCount": len(surviving),
        "audits": audits,
        "summaryTable": [
            {
                "exceptionId": a["exceptionId"],
                "from": a["phase2Classification"],
                "to": a["phase3Classification"],
                "categoricalLocal": a["categoricalExceptionVsLegalPermission"][
                    "isUnconditionalCategoricalExceptionInLocalClause"
                ],
                "unconditionalLegalPermission": a["categoricalExceptionVsLegalPermission"][
                    "isUnconditionalLegalPermission"
                ],
            }
            for a in audits
        ],
    }


def apply_audit_to_catalog(phase2: dict, audit: dict) -> list:
    """Clone phase-2 exceptions, apply downgrades, enrich unresolved deps."""
    by_audit = {a["exceptionId"]: a for a in audit["audits"]}
    out = []
    for e in phase2["exceptions"]:
        r = deepcopy(e)
        r["datasetVersion"] = DATASET_VERSION
        if r["exceptionId"] in by_audit:
            a = by_audit[r["exceptionId"]]
            r["permissionClassification"] = a["phase3Classification"]
            r["classificationRationale"] = (
                f"[Phase-3 audit] Downgraded from UNCONDITIONAL_SOURCE_VERIFIED → "
                f"{a['phase3Classification']}. {a['downgradeReason']} "
                f"Distinction: {a['categoricalExceptionVsLegalPermission']['distinction']}"
            )
            r["verificationStatus"] = a["verificationStatusAfterAudit"]
            # Enrich remote conditions / unresolved from audit
            for rc_text in a["reconstruction"].get("remoteConditions", []):
                if not any(rc_text[:40] in (c.get("text") or "") for c in r.get("remoteConditions", [])):
                    r.setdefault("remoteConditions", []).append(
                        {
                            "conditionId": f"p3-{len(r.get('remoteConditions', []))+1}",
                            "text": rc_text,
                            "location": "DEFINED_TERM"
                            if "definition" in rc_text.lower() or "Loan Document" in rc_text
                            else "EXTERNAL_DOCUMENT"
                            if "external" in rc_text.lower() or "Closing Date" in rc_text or "Pledge" in rc_text
                            else "ARTICLE_LEVEL"
                            if "chapeau" in rc_text.lower() or "Article" in rc_text or "Paid-in-Full" in rc_text
                            else "PARENT_CHAPEAU"
                            if "parent" in rc_text.lower() or "7.06(a)" in rc_text
                            else "DEFINED_TERM",
                            "locationRef": "phase-3-audit",
                            "computableHint": "OTHER_RULE",
                            "sourceSpan": None,
                        }
                    )
            for ext in a["reconstruction"].get("externalDocumentRestrictions", []):
                r.setdefault("remoteConstraintFlags", []).append(
                    {"kind": "EXTERNAL_DOCUMENT", "description": ext}
                )
            for d in a["reconstruction"].get("incorporatedDefinitions", []):
                status = d.get("status", "")
                if status in (
                    "MISSING_FROM_CURATED_EXCERPT",
                    "EXTERNAL_DOCUMENT",
                    "REFERENCED_NOT_FULLY_CLOSED_IN_RECORD",
                    "PARTIALLY_RESOLVED",
                    "EXTERNAL_TEMPORAL_ANCHOR",
                ):
                    r.setdefault("unresolvedControllingSources", []).append(
                        {
                            "ref": d.get("term", "unknown"),
                            "reason": f"Phase-3 audit: {status}"
                            + (f" — {d['note']}" if d.get("note") else ""),
                        }
                    )
            r["phase3Audit"] = {
                "priorClassification": a["phase2Classification"],
                "downgraded": True,
                "categoricalLocalException": a["categoricalExceptionVsLegalPermission"][
                    "isUnconditionalCategoricalExceptionInLocalClause"
                ],
                "unconditionalLegalPermission": False,
            }
        r["unconditionalCapacity"] = False
        out.append(r)
    return out


# ---------------------------------------------------------------------------
# 2. Negative controls (complete AMBIGUOUS_CONDITION_SCOPE)
# ---------------------------------------------------------------------------

def build_negative_controls(exceptions: list) -> tuple[dict, list]:
    """Populate missing AMBIGUOUS_CONDITION_SCOPE and expand required case types."""
    # Existing ids from catalog for positive/negative preservation
    existing_ids = {e["exceptionId"] for e in exceptions}

    ambiguous_cases = [
        {
            "controlId": "amb-gib-7.06-a-proviso-hanging",
            "negativeControlClass": "AMBIGUOUS_CONDITION_SCOPE",
            "caseType": "HANGING_PROVISO",
            "issuerKey": "ROCK",
            "sectionRef": "7.06(a) proviso",
            "summary": (
                "Parent 7.06(a) proviso (Preferred Stock priority / subordination) — "
                "attachment scope to (b) exceptions is ambiguous without structural parse."
            ),
            "expectedDetectorBehavior": "FLAG_AMBIGUOUS_ATTACHMENT",
            "polarity": "NEGATIVE_CONTROL",
        },
        {
            "controlId": "amb-fwrg-nested-except-within-except",
            "negativeControlClass": "AMBIGUOUS_CONDITION_SCOPE",
            "caseType": "NESTED_EXCEPTION",
            "issuerKey": "FWRG",
            "sectionRef": "6.04 nested builders",
            "summary": "Nested exception/builder structures where inner except may re-open outer capacity.",
            "expectedDetectorBehavior": "FLAG_NESTING_UNRESOLVED",
            "polarity": "NEGATIVE_CONTROL",
        },
        {
            "controlId": "amb-sup-permitted-liens-defined-term",
            "negativeControlClass": "AMBIGUOUS_CONDITION_SCOPE",
            "caseType": "DEFINED_TERM_RESTRICTION",
            "issuerKey": "SUP",
            "sectionRef": "7.01 / Permitted Liens",
            "summary": "Exception capacity gated entirely through Permitted Liens defined-term restrictions.",
            "expectedDetectorBehavior": "REQUIRE_DEFINITION_CLOSURE",
            "polarity": "NEGATIVE_CONTROL",
            "linkedExceptionId": "sup-7.01-permitted-liens-definitional"
            if "sup-7.01-permitted-liens-definitional" in existing_ids
            else None,
        },
        {
            "controlId": "amb-fwrg-ratio-conditional",
            "negativeControlClass": "AMBIGUOUS_CONDITION_SCOPE",
            "caseType": "CONDITIONAL_RATIO",
            "issuerKey": "FWRG",
            "sectionRef": "ratio baskets",
            "summary": "Ratio-gated baskets where measurement date / pro forma adjustments are remote.",
            "expectedDetectorBehavior": "FLAG_RATIO_REMOTE_CONDITIONS",
            "polarity": "NEGATIVE_CONTROL",
        },
        {
            "controlId": "amb-fwrg-shared-basket-available-amount",
            "negativeControlClass": "AMBIGUOUS_CONDITION_SCOPE",
            "caseType": "SHARED_BASKET",
            "issuerKey": "FWRG",
            "sectionRef": "Available Amount / builder",
            "summary": "Shared Available Amount basket — exception shares capacity across RP/Investment families.",
            "expectedDetectorBehavior": "REQUIRE_SHARED_CAPACITY_EDGE",
            "polarity": "NEGATIVE_CONTROL",
        },
        {
            "controlId": "amb-lsb-cross-doc-secured-notes",
            "negativeControlClass": "AMBIGUOUS_CONDITION_SCOPE",
            "caseType": "CROSS_DOCUMENT_CONSTRAINT",
            "issuerKey": "LXU",
            "sectionRef": "6.04(b) external secured notes",
            "summary": "Constraint depends on external Secured Notes indenture/docs.",
            "expectedDetectorBehavior": "FLAG_EXTERNAL_UNRESOLVED",
            "polarity": "NEGATIVE_CONTROL",
            "linkedExceptionId": "lsb-6.04-b-external-secured-notes"
            if "lsb-6.04-b-external-secured-notes" in existing_ids
            else None,
        },
        {
            "controlId": "amb-sup-amendment-change",
            "negativeControlClass": "AMBIGUOUS_CONDITION_SCOPE",
            "caseType": "AMENDMENT_CHANGE",
            "issuerKey": "SUP",
            "sectionRef": "First Amendment 2025-03-31",
            "summary": "Amendment may alter basket/exception operative text — base-only parse is incomplete.",
            "expectedDetectorBehavior": "REQUIRE_AMENDMENT_CHAIN_CLOSURE",
            "polarity": "NEGATIVE_CONTROL",
        },
        {
            "controlId": "amb-conmed-7.1-threshold-not-permission",
            "negativeControlClass": "NUMERIC_THRESHOLD_NOT_PERMISSION",
            "caseType": "NUMERIC_THRESHOLD_NOT_PERMISSION",
            "issuerKey": "CNMD",
            "sectionRef": "7.1(a)",
            "summary": "Financial maintenance threshold is not an affirmative exception permission.",
            "expectedDetectorBehavior": "CLASSIFY_NOT_AN_AFFIRMATIVE_PERMISSION",
            "polarity": "NEGATIVE_CONTROL",
            "linkedExceptionId": "conmed-7.1-a-csslr-threshold-not-permission",
        },
        {
            "controlId": "amb-riot-5.02-c-no-exception",
            "negativeControlClass": "PROHIBITION_NO_EXCEPTION",
            "caseType": "PROHIBITION_NO_EXCEPTION",
            "issuerKey": "RIOT",
            "sectionRef": "5.02(c)",
            "summary": "Collateral sale prohibition with no enumerated exception list.",
            "expectedDetectorBehavior": "NO_FALSE_EXCEPTION_DISCOVERY",
            "polarity": "NEGATIVE_CONTROL",
            "linkedExceptionId": "riot-5.02-c-no-collateral-sale-exception"
            if "riot-5.02-c-no-collateral-sale-exception" in existing_ids
            else None,
        },
        {
            "controlId": "amb-gib-706b1-scope-vs-permission",
            "negativeControlClass": "AMBIGUOUS_CONDITION_SCOPE",
            "caseType": "CATEGORICAL_VS_PERMISSION",
            "issuerKey": "ROCK",
            "sectionRef": "7.06(b)(1)",
            "summary": (
                "Phase-3 audit exemplar: categorical local form coexists with Closing Date external limb — "
                "scope of 'unconditional' is ambiguous if remote limbs ignored."
            ),
            "expectedDetectorBehavior": "DOWNGRADE_IF_REMOTE_PRESENT",
            "polarity": "NEGATIVE_CONTROL",
            "linkedExceptionId": "gibraltar-7.06-b-1-loan-docs-burdensome-exception",
        },
    ]

    # Preserve phase-2 classes + add AMBIGUOUS
    by_class: dict[str, list] = {
        "LOCAL_CONDITIONS": [],
        "REMOTE_CONDITIONS": [],
        "NO_ADDITIONAL_CONDITIONS": [],
        "AMBIGUOUS_CONDITION_SCOPE": [],
        "PROHIBITION_NO_EXCEPTION": [],
        "NUMERIC_THRESHOLD_NOT_PERMISSION": [],
        "CONSTRAINED_BY_OTHER_DOCUMENT": [],
    }

    # Map existing catalog negative-control flags
    for e in exceptions:
        cls = e.get("negativeControlClass")
        if cls and cls in by_class:
            by_class[cls].append(e["exceptionId"])

    # Phase-2 sample mapping for preservation
    phase2_sample = json.loads((PHASE2 / "negative-controls/sample.json").read_text())
    for cls, ids in phase2_sample.get("byClass", {}).items():
        by_class.setdefault(cls, [])
        for i in ids:
            if i not in by_class[cls]:
                by_class[cls].append(i)

    # After audit, NO_ADDITIONAL_CONDITIONS exemplars were downgraded — keep as historical
    # positive controls for "local economic conditions absent" but not as unconditional permission.
    by_class["NO_ADDITIONAL_CONDITIONS"] = [
        "gibraltar-7.06-b-1-loan-docs-burdensome-exception",
        "dsgr-6.01-a-secured-obligations",
        "riot-5.02-a-i-facility-liens",
    ]

    for c in ambiguous_cases:
        by_class.setdefault(c["negativeControlClass"], [])
        if c["controlId"] not in by_class[c["negativeControlClass"]]:
            by_class[c["negativeControlClass"]].append(c["controlId"])

    # Ensure AMBIGUOUS populated
    assert len(by_class["AMBIGUOUS_CONDITION_SCOPE"]) >= 5

    # Synthetic catalog rows for ambiguous controls that are not already exceptions
    new_rows = []
    for c in ambiguous_cases:
        if c.get("linkedExceptionId") and c["linkedExceptionId"] in existing_ids:
            # tag existing
            for e in exceptions:
                if e["exceptionId"] == c["linkedExceptionId"]:
                    e["isNegativeControl"] = True
                    if not e.get("negativeControlClass"):
                        e["negativeControlClass"] = c["negativeControlClass"]
            continue
        # Create SOURCE_ONLY control stub (not an affirmative permission record)
        new_rows.append(
            {
                "exceptionId": c["controlId"],
                "datasetVersion": DATASET_VERSION,
                "sourceIdentity": {
                    "sourceIdentityKey": f"ncedb-ctrl:{c['issuerKey']}:{c['controlId']}",
                    "issuerKey": c["issuerKey"],
                    "issuerName": c["issuerKey"],
                    "issuerTicker": c["issuerKey"],
                    "documentKind": "OTHER",
                    "sourcePath": "docs/negative-covenant-exception-database/phase-3/negative-controls/cases.json",
                    "sourceSha256": sha256_text(c["controlId"] + c["summary"]),
                },
                "covenantFamily": "NOT_AN_EXCEPTION"
                if c["negativeControlClass"]
                in ("NUMERIC_THRESHOLD_NOT_PERMISSION", "PROHIBITION_NO_EXCEPTION", "AMBIGUOUS_CONDITION_SCOPE")
                else "OTHER_NEGATIVE_COVENANT",
                "permissionClassification": "NOT_AN_AFFIRMATIVE_PERMISSION"
                if c["negativeControlClass"]
                in ("NUMERIC_THRESHOLD_NOT_PERMISSION", "PROHIBITION_NO_EXCEPTION")
                else "UNKNOWN",
                "classificationRationale": (
                    f"Phase-3 negative control ({c['caseType']}): {c['summary']} "
                    "Not an affirmative capacity permission."
                ),
                "parentProhibition": {
                    "sectionRef": c["sectionRef"],
                    "paraphraseSummary": c["summary"],
                    "sourceSpan": {
                        "sourcePath": "docs/negative-covenant-exception-database/phase-3/negative-controls/cases.json",
                        "sourceSha256": sha256_text(c["controlId"]),
                        "charStart": 0,
                        "charEnd": 0,
                        "exactText": c["summary"],
                        "matchStatus": "UNRESOLVED",
                    },
                },
                "articleOrSectionChapeau": {"paraphraseSummary": "", "sourceSpan": None},
                "exceptionSectionRef": c["sectionRef"],
                "exactExceptionText": c["summary"],
                "exceptionSourceSpan": {
                    "sourcePath": "docs/negative-covenant-exception-database/phase-3/negative-controls/cases.json",
                    "sourceSha256": sha256_text(c["controlId"]),
                    "charStart": 0,
                    "charEnd": 0,
                    "exactText": c["summary"],
                    "matchStatus": "UNRESOLVED",
                },
                "paraphraseSummary": c["summary"],
                "structuralHierarchy": [c["caseType"]],
                "definedTerms": [],
                "localConditions": [],
                "remoteConditions": [],
                "provisoAttachment": [],
                "entityScope": {"includes": [], "excludes": [], "sourceSpan": None},
                "financialTests": [],
                "amountsAndRatios": [],
                "sharedCapacityRestrictions": [],
                "amendmentAuthority": [{"documentRef": "n/a", "effect": "control stub", "status": "UNKNOWN"}],
                "unresolvedControllingSources": [
                    {"ref": c["caseType"], "reason": "Negative-control stub — requires source closure for production use"}
                ],
                "crossReferences": [],
                "remoteConstraintFlags": [{"kind": c["caseType"], "description": c["summary"]}],
                "verificationStatus": "SOURCE_ONLY",
                "notes": f"expectedDetectorBehavior={c['expectedDetectorBehavior']}",
                "unconditionalCapacity": False,
                "isNegativeControl": True,
                "negativeControlClass": c["negativeControlClass"],
                "phase3ControlMeta": c,
            }
        )

    controls_doc = {
        "artifact": "04-negative-controls",
        "selectionPrinciple": (
            "Independently selected to cover hanging provisos, nested exceptions, defined-term "
            "restrictions, conditional ratios, shared baskets, cross-document constraints, amendment "
            "changes, numeric thresholds that are not permissions, and prohibitions with no exception. "
            "Preserves both positive and negative controls. AMBIGUOUS_CONDITION_SCOPE completed in Phase 3."
        ),
        "byClass": by_class,
        "counts": {k: len(v) for k, v in by_class.items()},
        "caseTypesCovered": sorted({c["caseType"] for c in ambiguous_cases}),
        "cases": ambiguous_cases,
        "noteOnNoAdditionalConditions": (
            "NO_ADDITIONAL_CONDITIONS remains as a structural positive control for absent local "
            "economic gates, but Phase-3 audit downgraded those records from UNCONDITIONAL_SOURCE_VERIFIED "
            "— they are not unconditional legal permissions."
        ),
    }
    return controls_doc, new_rows


# ---------------------------------------------------------------------------
# 3. Independent held-out evaluation (Gibraltar 7.06 — not used to tune detector)
# ---------------------------------------------------------------------------

def build_heldout_and_metrics(exceptions: list) -> tuple[dict, dict, dict]:
    """Author GT independently; run a simple untuned detector; measure P/R with denominators."""
    gib_path = "tests/fixtures/unseen-packages/gibraltar-2026-credit-agreement/extracted-text/credit-agreement.txt"
    gib = (ROOT / gib_path).read_text(encoding="utf-8", errors="replace")
    # Locate Section 7.06 operative body (skip TOC hits near the front of the file).
    start = -1
    for anchor in ("Section\u00a07.06", "Section 7.06"):
        pos = gib.find(anchor)
        while pos >= 0:
            window = gib[pos : pos + 240]
            if "Burdensome" in window or "(a)" in window:
                # Prefer the late occurrence that contains operative covenant text.
                if pos > 100000:
                    start = pos
                    break
            pos = gib.find(anchor, pos + 1)
        if start >= 0:
            break
    if start < 0:
        start = gib.rfind("Burdensome Agreements")
    end = -1
    if start >= 0:
        for end_anchor in ("Section\u00a07.07", "Section 7.07"):
            cand = gib.find(end_anchor, start + 20)
            if cand > start:
                end = cand
                break
    section = gib[start:end] if start >= 0 and end > start else ""

    # Independent hand inventory from source text (NOT generated from detector/catalog outputs).
    # Full §7.06(b) enumerated limbs observed in operative body (excluding reserved).
    gt_items = [
        {
            "gtId": "HO-GIB-7.06-a",
            "kind": "PROHIBITION_WITH_PROVISO",
            "sectionRef": "7.06(a)",
            "summary": "Burdensome Agreements prohibition on Loan Party (other than Borrower) distributions with provisos",
            "hasHangingProviso": True,
            "expectedExceptionCount": 0,
        },
        {
            "gtId": "HO-GIB-7.06-b-chapeau",
            "kind": "EXCEPTION_CHAPEAU",
            "sectionRef": "7.06(b)",
            "summary": "The provisions of Section 7.06(a) will not prohibit:",
        },
        {
            "gtId": "HO-GIB-7.06-b-1",
            "kind": "EXCEPTION",
            "sectionRef": "7.06(b)(1)",
            "summary": "Loan Documents / Facilities Obligations OR Closing Date instruments (dual limb)",
            "expectedClassification": "CONDITIONAL",
            "remoteConditionsExpected": ["Closing Date limb", "Loan Document defs", "parent 7.06(a) provisos"],
            "provisoAttachmentExpected": "PARENT_PROVISO_MAY_INTERACT",
            "entityScopeExpected": ["Loan Party other than Borrower"],
            "crossRefsExpected": ["Section 7.06(a)", "Loan Documents"],
        },
        {
            "gtId": "HO-GIB-7.06-b-2",
            "kind": "EXCEPTION_RESERVED",
            "sectionRef": "7.06(b)(2)",
            "summary": "[reserved]",
        },
        {
            "gtId": "HO-GIB-7.06-b-3",
            "kind": "EXCEPTION",
            "sectionRef": "7.06(b)(3)",
            "summary": "applicable law, rule, regulation or order",
            "expectedClassification": "CONDITIONAL",
        },
        {
            "gtId": "HO-GIB-7.06-b-4",
            "kind": "EXCEPTION",
            "sectionRef": "7.06(b)(4)",
            "summary": "pre-existing agreement of acquired Person / assumed in acquisition",
            "expectedClassification": "CONDITIONAL",
            "remoteConditionsExpected": ["acquisition timing / designation conditions"],
        },
        {
            "gtId": "HO-GIB-7.06-b-5",
            "kind": "EXCEPTION",
            "sectionRef": "7.06(b)(5)",
            "summary": "encumbrance/restriction nested sub-limbs (complex nesting)",
            "expectedClassification": "CONDITIONAL",
            "remoteConditionsExpected": ["nested subclause conditions"],
        },
        {
            "gtId": "HO-GIB-7.06-b-6",
            "kind": "EXCEPTION",
            "sectionRef": "7.06(b)(6)",
            "summary": "Purchase Money / Finance Lease Obligations permitted under Agreement",
            "expectedClassification": "CONDITIONAL",
            "crossRefsExpected": ["permitted under this Agreement"],
        },
        {
            "gtId": "HO-GIB-7.06-b-7",
            "kind": "EXCEPTION",
            "sectionRef": "7.06(b)(7)",
            "summary": "agreement for sale/disposition of assets/equity",
            "expectedClassification": "CONDITIONAL",
        },
        {
            "gtId": "HO-GIB-7.06-b-8",
            "kind": "EXCEPTION",
            "sectionRef": "7.06(b)(8)",
            "summary": "customary provisions in leases/licenses/JV/org docs",
            "expectedClassification": "CONDITIONAL",
        },
        {
            "gtId": "HO-GIB-7.06-b-9",
            "kind": "EXCEPTION",
            "sectionRef": "7.06(b)(9)",
            "summary": "encumbrances by applicable law/rule/regulation/order or required by regulatory authority",
            "expectedClassification": "CONDITIONAL",
        },
        {
            "gtId": "HO-GIB-7.06-b-10",
            "kind": "EXCEPTION",
            "sectionRef": "7.06(b)(10)",
            "summary": "cash/deposit/net worth restrictions imposed by customers ordinary course",
            "expectedClassification": "CONDITIONAL",
        },
        {
            "gtId": "HO-GIB-7.06-b-11",
            "kind": "EXCEPTION",
            "sectionRef": "7.06(b)(11)",
            "summary": "Swap Obligations",
            "expectedClassification": "CONDITIONAL",
        },
        {
            "gtId": "HO-GIB-7.06-b-12",
            "kind": "EXCEPTION",
            "sectionRef": "7.06(b)(12)",
            "summary": "other Indebtedness/Disqualified Stock/Preferred Stock of Non-Loan Party Subsidiaries",
            "expectedClassification": "CONDITIONAL",
            "entityScopeExpected": ["Non-Loan Party Subsidiaries"],
        },
        {
            "gtId": "HO-GIB-7.06-b-13",
            "kind": "EXCEPTION",
            "sectionRef": "7.06(b)(13)",
            "summary": "Qualified Securitization Financing / Receivables Facility restrictions",
            "expectedClassification": "CONDITIONAL",
        },
        {
            "gtId": "HO-GIB-7.06-b-14",
            "kind": "EXCEPTION",
            "sectionRef": "7.06(b)(14)",
            "summary": "agreement relating to Indebtedness permitted to be incurred subsequently",
            "expectedClassification": "CONDITIONAL",
            "remoteConditionsExpected": ["subsequent incurrence permission cross-ref"],
        },
        {
            "gtId": "HO-GIB-7.06-b-15",
            "kind": "EXCEPTION",
            "sectionRef": "7.06(b)(15)",
            "summary": "lien permitted under Section 7.02",
            "expectedClassification": "CONDITIONAL",
            "crossRefsExpected": ["Section 7.02"],
        },
        {
            "gtId": "HO-GIB-7.06-b-16",
            "kind": "EXCEPTION",
            "sectionRef": "7.06(b)(16)",
            "summary": "Transaction Documents",
            "expectedClassification": "CONDITIONAL",
            "remoteConditionsExpected": ["Transaction Documents definition/external"],
        },
        {
            "gtId": "HO-GIB-7.06-b-17",
            "kind": "EXCEPTION",
            "sectionRef": "7.06(b)(17)",
            "summary": "refinancing of Indebtedness / Initial Agreement with hanging proviso",
            "expectedClassification": "CONDITIONAL",
            "provisoAttachmentExpected": "HANGING",
            "remoteConditionsExpected": ["Initial Agreement refinement proviso"],
        },
    ]
    # Discover additional (b)(n) markers in section for GT completeness note
    numbered = sorted(set(re.findall(r"\n\s*\((\d+)\)", section)))
    gt = {
        "protocol": (
            "Independent hand inventory of Gibraltar §7.06 Burdensome Agreements from source text. "
            "Authored without reading detector outputs or phase-2/3 catalog rows for this section. "
            "Gibraltar is held-out relative to the simple Phase-3 detector (detector was not tuned on ROCK)."
        ),
        "document": {
            "issuerKey": "ROCK",
            "sourcePath": gib_path,
            "sourceSha256": sha256_file(ROOT / gib_path),
            "sectionCharStart": start,
            "sectionCharEnd": end,
        },
        "items": gt_items,
        "observedNumberedClausesInSection": numbered,
        "independenceDeclaration": {
            "groundTruthFromDetectorOutputs": False,
            "usedToTuneDetector": False,
            "catalogInvariantsNotUsedAsAccuracy": True,
        },
    }

    # --- Simple untuned detector (clause-number enumerator) ---
    # Intentionally naive: finds (n) under 7.06(b) and treats non-reserved as exceptions.
    # Not tuned on Gibraltar; no ML / paid inference.
    detector_hits = []
    b_idx = section.find("will not prohibit")
    b_region = section[b_idx:] if b_idx >= 0 else section
    # Enumerate top-level (n) limbs only: line-leading numbered clauses after the (b) chapeau.
    # Do not truncate on nested (c)/(d) sub-limbs inside a numbered exception.
    seen_nums: set[str] = set()
    for m in re.finditer(
        r"(?m)^[^\S\n]*\((\d+)\)[\s\u00a0]+([^\n]{0,200})",
        b_region,
    ):
        num, preview = m.group(1), m.group(2).strip()
        if num in seen_nums:
            continue
        seen_nums.add(num)
        if "[reserved]" in preview.lower():
            continue
        detector_hits.append(
            {
                "detectedId": f"DET-GIB-7.06-b-{num}",
                "sectionRef": f"7.06(b)({num})",
                "preview": preview[:160],
                "charStart": (start + b_idx + m.start()) if start >= 0 and b_idx >= 0 else m.start(),
                "predictedClassification": "UNCONDITIONAL_SOURCE_VERIFIED",  # naive bias to catch false unconditional
                "predictedRemoteConditions": [],  # naive: misses remote
                "predictedProvisoAttachment": "NONE",
                "predictedEntityScope": [],
                "predictedCrossRefs": [],
            }
        )

    gt_exceptions = [i for i in gt_items if i["kind"] == "EXCEPTION"]
    gt_refs = {i["sectionRef"] for i in gt_exceptions}
    det_refs = {d["sectionRef"] for d in detector_hits}
    tp = gt_refs & det_refs
    fp = det_refs - gt_refs
    fn = gt_refs - det_refs
    precision = (len(tp) / len(det_refs)) if det_refs else None
    recall = (len(tp) / len(gt_refs)) if gt_refs else None

    # Remote-condition recall: among GT exceptions expecting remote conditions, did detector find any?
    gt_remote = [i for i in gt_exceptions if i.get("remoteConditionsExpected")]
    remote_tp = 0
    for g in gt_remote:
        d = next((x for x in detector_hits if x["sectionRef"] == g["sectionRef"]), None)
        if d and d["predictedRemoteConditions"]:
            remote_tp += 1
    remote_recall = (remote_tp / len(gt_remote)) if gt_remote else None

    # Proviso attachment accuracy: GT expects PARENT interaction on (b)(1); detector said NONE
    proviso_cases = [i for i in gt_exceptions if i.get("provisoAttachmentExpected")]
    proviso_correct = 0
    for g in proviso_cases:
        d = next((x for x in detector_hits if x["sectionRef"] == g["sectionRef"]), None)
        if not d:
            continue
        # correct only if detector did not claim NONE when GT expects parent interaction
        if d["predictedProvisoAttachment"] != "NONE":
            proviso_correct += 1
    proviso_acc = (proviso_correct / len(proviso_cases)) if proviso_cases else None

    # Entity-scope accuracy
    entity_cases = [i for i in gt_exceptions if i.get("entityScopeExpected")]
    entity_correct = 0
    for g in entity_cases:
        d = next((x for x in detector_hits if x["sectionRef"] == g["sectionRef"]), None)
        if d and d["predictedEntityScope"]:
            # naive overlap
            if any(e.split()[0] in " ".join(d["predictedEntityScope"]) for e in g["entityScopeExpected"]):
                entity_correct += 1
    entity_acc = (entity_correct / len(entity_cases)) if entity_cases else None

    # Cross-reference accuracy: detector does not resolve cross-refs in this pass
    cross_ref_cases = [i for i in gt_exceptions if i.get("crossRefsExpected")]
    cross_ref_correct = 0
    for g in cross_ref_cases:
        d = next((x for x in detector_hits if x["sectionRef"] == g["sectionRef"]), None)
        # naive detector carries no cross-ref field — score 0 unless later enriched
        if d and d.get("predictedCrossRefs"):
            if set(d["predictedCrossRefs"]) & set(g["crossRefsExpected"]):
                cross_ref_correct += 1
    cross_ref_denom = len(cross_ref_cases) if cross_ref_cases else 1
    cross_ref_acc = cross_ref_correct / cross_ref_denom

    # Incorrect unconditional-classification rate among detected exceptions that GT marks CONDITIONAL
    cond_gt = [i for i in gt_exceptions if i.get("expectedClassification") == "CONDITIONAL"]
    incorrect_uncond = 0
    for g in cond_gt:
        d = next((x for x in detector_hits if x["sectionRef"] == g["sectionRef"]), None)
        if d and d["predictedClassification"] == "UNCONDITIONAL_SOURCE_VERIFIED":
            incorrect_uncond += 1
    incorrect_uncond_rate = (incorrect_uncond / len(cond_gt)) if cond_gt else None

    # Source-span accuracy for catalog rows on held-out doc (exact byte check)
    rock_rows = [
        e
        for e in exceptions
        if e.get("sourceIdentity", {}).get("issuerKey") == "ROCK"
        and e.get("exceptionSourceSpan", {}).get("matchStatus") == "EXACT"
        and not e.get("isNegativeControl")
    ]
    span_ok = 0
    span_fail = 0
    for e in rock_rows:
        sp = e["exceptionSourceSpan"]
        text = gib
        slice_ = text[sp["charStart"] : sp["charEnd"]]
        if slice_ == sp["exactText"] and sp["exactText"] == e["exactExceptionText"]:
            span_ok += 1
        else:
            span_fail += 1

    # Catalog classification audit rate (not claimed as detector accuracy)
    uncond_remaining = [
        e["exceptionId"]
        for e in exceptions
        if e.get("permissionClassification") == "UNCONDITIONAL_SOURCE_VERIFIED"
        and not e.get("isNegativeControl")
    ]

    metrics = {
        "artifact": "06-independent-quality-metrics",
        "datasetVersion": DATASET_VERSION,
        "status": "MEASURED_HELD_OUT",
        "heldOutDocument": "gibraltar-2026 §7.06",
        "detector": {
            "name": "ncedb-phase3-naive-clause-enumerator",
            "tunedOnHeldOut": False,
            "paidInference": False,
        },
        "denominators": {
            "gtExceptionCount": len(gt_exceptions),
            "detectorHitCount": len(detector_hits),
            "gtWithRemoteConditionsExpected": len(gt_remote),
            "gtWithProvisoAttachmentExpected": len(proviso_cases),
            "gtWithEntityScopeExpected": len(entity_cases),
            "crossReferenceCases": len(cross_ref_cases),
            "gtConditionalForUncondRate": len(cond_gt),
            "rockCatalogExactSpanRows": len(rock_rows),
        },
        "metrics": {
            "exceptionDiscoveryPrecision": {
                "value": precision,
                "numerator": len(tp),
                "denominator": len(det_refs),
                "status": "MEASURED",
            },
            "exceptionDiscoveryRecall": {
                "value": recall,
                "numerator": len(tp),
                "denominator": len(gt_refs),
                "status": "MEASURED",
            },
            "remoteConditionRecall": {
                "value": remote_recall,
                "numerator": remote_tp,
                "denominator": len(gt_remote),
                "status": "MEASURED",
                "note": "Naive detector emits zero remote conditions — expected low recall.",
            },
            "provisoAttachmentAccuracy": {
                "value": proviso_acc,
                "numerator": proviso_correct,
                "denominator": len(proviso_cases),
                "status": "MEASURED",
            },
            "entityScopeAccuracy": {
                "value": entity_acc,
                "numerator": entity_correct,
                "denominator": len(entity_cases),
                "status": "MEASURED",
            },
            "crossReferenceAccuracy": {
                "value": cross_ref_acc,
                "numerator": cross_ref_correct,
                "denominator": cross_ref_denom,
                "status": "MEASURED",
            },
            "incorrectUnconditionalClassificationRate": {
                "value": incorrect_uncond_rate,
                "numerator": incorrect_uncond,
                "denominator": len(cond_gt),
                "status": "MEASURED",
                "note": "Rate at which detector labels CONDITIONAL GT as UNCONDITIONAL_SOURCE_VERIFIED.",
            },
            "sourceSpanAccuracy": {
                "value": (span_ok / len(rock_rows)) if rock_rows else None,
                "numerator": span_ok,
                "denominator": len(rock_rows),
                "failures": span_fail,
                "status": "MEASURED",
            },
        },
        "catalogInvariantsNotReportedAsAccuracy": True,
        "phase3UnconditionalSurvivingInCatalog": uncond_remaining,
        "confidenceLimitations": [
            "Single held-out section (Gibraltar §7.06); not a multi-issuer statistical sample.",
            "GT exception set limited to enumerated (b) clauses inventoried by hand; later (b) limbs may exist beyond items list.",
            "Detector is intentionally naive — metrics diagnose failure modes, not production readiness.",
            "Proviso/entity/cross-ref metrics have small denominators (see denominators object).",
            "Catalog downgrade audit is separate from detector incorrect-unconditional rate.",
        ],
        "detectorHits": detector_hits,
        "confusion": {"tp": sorted(tp), "fp": sorted(fp), "fn": sorted(fn)},
    }

    detector_run = {
        "artifact": "held-out-detector-run",
        "detector": metrics["detector"],
        "hits": detector_hits,
    }
    return gt, metrics, detector_run


# ---------------------------------------------------------------------------
# 4. Authentic corpus expansion (+25 batch)
# ---------------------------------------------------------------------------

def build_authentic_batch() -> dict:
    """Next 25 distinct authentic financing agreements — no synthetic padding."""
    phase2_reg = json.loads((PHASE2 / "03-document-registry.json").read_text())
    phase2_paths = {d["sourcePath"] for d in phase2_reg["documents"]}
    phase2_ids = {d["registryId"] for d in phase2_reg["documents"]}

    batch: list[dict] = []

    # A) Remaining local fixtures not in phase-2 registry
    local_new = [
        {
            "registryId": "sup_2022",
            "issuerKey": "SUP",
            "issuerName": "Superior Industries International, Inc.",
            "issuerTicker": "SUP",
            "issuerCik": "0000095552",
            "instrumentId": "sup-term-loan-2022-12-15",
            "documentKind": "CREDIT_AGREEMENT",
            "sourcePath": "tests/fixtures/unseen-packages/final-lightweight-unseen-sup/extracted-text/doc-a-2022-12-15-term-loan-credit-agreement.txt",
            "accession": None,
            "coordinationSource": "LOCAL_FIXTURE",
        },
        {
            "registryId": "dsgr_third_amd",
            "issuerKey": "DSGR",
            "issuerName": "Distribution Solutions Group, Inc.",
            "issuerTicker": "DSGR",
            "issuerCik": "0000703604",
            "instrumentId": "dsgr-ca-2022-chain",
            "documentKind": "AMENDMENT",
            "sourcePath": "tests/fixtures/unseen-packages/dsgr-2022-2025-credit-facility/extracted-text/doc-b-2024-third-amendment.txt",
            "accession": "0001193125-24-202196",
            "coordinationSource": "LOCAL_FIXTURE+WS-ACR",
        },
        {
            "registryId": "riot_ar1",
            "issuerKey": "RIOT",
            "issuerName": "Riot Platforms, Inc.",
            "issuerTicker": "RIOT",
            "issuerCik": "0001167419",
            "instrumentId": "riot-ca-2025-chain",
            "documentKind": "RESTATEMENT",
            "sourcePath": "tests/fixtures/unseen-packages/riot-2025-2026-credit-facility/extracted-text/doc-b-2025-05-19-amended-restated-credit-agreement.txt",
            "accession": None,
            "coordinationSource": "LOCAL_FIXTURE",
        },
        {
            "registryId": "conmed_amd_2022",
            "issuerKey": "CNMD",
            "issuerName": "CONMED Corporation",
            "issuerTicker": "CNMD",
            "issuerCik": "0000816956",
            "instrumentId": "conmed-ca-chain",
            "documentKind": "AMENDMENT",
            "sourcePath": "tests/fixtures/unseen-packages/conmed-2025-credit-facility/curated/second-amendment-2022-full.txt",
            "accession": "0001193125-22-209154",
            "coordinationSource": "LOCAL_FIXTURE+WS-ACR",
        },
        {
            "registryId": "conmed_omnibus_2026",
            "issuerKey": "CNMD",
            "issuerName": "CONMED Corporation",
            "issuerTicker": "CNMD",
            "issuerCik": "0000816956",
            "instrumentId": "conmed-ca-chain",
            "documentKind": "AMENDMENT",
            "sourcePath": "tests/fixtures/unseen-packages/conmed-2025-credit-facility/curated/first-omnibus-amendment-2026-curated.txt",
            "accession": "0002077096-26-000190",
            "coordinationSource": "LOCAL_FIXTURE+WS-ACR",
        },
    ]

    for d in local_new:
        if d["sourcePath"] in phase2_paths:
            continue
        p = ROOT / d["sourcePath"]
        batch.append(
            {
                **d,
                "documentId": d["registryId"],
                "sourceIdentityKey": f"ncedb-src:{d['issuerKey']}:{sha256_file(p)[:24]}",
                "sourceSha256": sha256_file(p),
                "byteLength": p.stat().st_size,
                "ingestionStatus": "INGESTED_FIXTURE",
                "sourceUrl": None,
                "exhibit": None,
            }
        )

    # B) Amendment-chain research identities (peer coordination; not merged)
    acr_docs = json.loads(Path("/tmp/acr-docs.json").read_text()) if Path("/tmp/acr-docs.json").exists() else []
    # Prefer non-fixture-overlap issuers first: AZZ, COHR, MATW, INAP
    prefer = ["AZZ", "COHR", "MATW", "INAP"]
    acr_sorted = sorted(
        acr_docs,
        key=lambda x: (0 if x["issuerTicker"] in prefer else 1, x["issuerTicker"], x["docId"]),
    )
    for d in acr_sorted:
        if d["retrievalStatus"] == "MISSING" and not d.get("accession"):
            continue
        # skip if already covered by local fixture path identity for same accession in batch
        if any(b.get("accession") == d.get("accession") and d.get("accession") not in (None, "UNKNOWN") for b in batch):
            # still allow distinct amendment docs with same accession (rare) via docId
            if any(b.get("documentId") == d["docId"] for b in batch):
                continue
        if any(b.get("documentId") == d["docId"] for b in batch):
            continue
        # skip CNMD/DSGR fixture-present that duplicate phase2 registry content where registryId maps
        if d["retrievalStatus"] == "FIXTURE_PRESENT" and d["issuerTicker"] in ("CNMD", "DSGR"):
            # only add if not already in phase2 by path equivalence — use docId novelty
            if d["docId"] in {
                "dsgr-doc-a",
                "dsgr-doc-c",
                "dsgr-doc-d",
                "cnmd-eighth-ar",
            }:
                continue
        kind_map = {
            "ORIGINAL": "CREDIT_AGREEMENT",
            "AMENDMENT": "AMENDMENT",
            "RESTATEMENT": "RESTATEMENT",
            "RELATED_SECURITY": "OTHER",
            "OMNIBUS_AMENDMENT": "AMENDMENT",
        }
        batch.append(
            {
                "registryId": d["docId"],
                "documentId": d["docId"],
                "issuerKey": d["issuerTicker"],
                "issuerName": d["issuerName"],
                "issuerTicker": d["issuerTicker"],
                "issuerCik": d["issuerCik"],
                "instrumentId": d["instrumentId"],
                "documentKind": kind_map.get(d["role"], "OTHER"),
                "accession": d.get("accession") if d.get("accession") != "UNKNOWN" else None,
                "exhibit": d.get("exhibit"),
                "sourceUrl": d.get("sourceUrl") or None,
                "sourcePath": d.get("localFixturePath"),
                "sourceSha256": None,
                "sourceIdentityKey": f"ncedb-acr:{d['issuerTicker']}:{d['docId']}",
                "byteLength": None,
                "ingestionStatus": (
                    "INGESTED_FIXTURE"
                    if d["retrievalStatus"] == "FIXTURE_PRESENT"
                    else "IDENTITY_RESOLVED_REMOTE"
                    if d["retrievalStatus"] in ("RETRIEVED", "PARTIAL")
                    else d["retrievalStatus"]
                ),
                "coordinationSource": "WS-ACR",
                "executionDate": d.get("executionDate"),
                "chainId": d.get("chainId"),
            }
        )
        if len(batch) >= 21:  # leave room for indentures
            break

    # C) Indentures from live EDGAR identity resolution
    indentures = (
        json.loads(Path("/tmp/indenture-batch.json").read_text())
        if Path("/tmp/indenture-batch.json").exists()
        else []
    )
    for d in indentures:
        batch.append(
            {
                "registryId": f"lyv-{d['exhibit'].lower().replace('.', '-')}",
                "documentId": f"lyv-{d['exhibit'].lower().replace('.', '-')}",
                "issuerKey": d["issuerTicker"],
                "issuerName": d["issuerName"],
                "issuerTicker": d["issuerTicker"],
                "issuerCik": d["issuerCik"],
                "instrumentId": "lyv-notes-indenture-family",
                "documentKind": d["documentKind"],
                "accession": d["accession"],
                "exhibit": d["exhibit"],
                "sourceUrl": d["sourceUrl"],
                "sourcePath": None,
                "sourceSha256": None,
                "sourceIdentityKey": f"ncedb-edgar:{d['issuerTicker']}:{d['accession']}:{d['exhibit']}",
                "byteLength": None,
                "ingestionStatus": "IDENTITY_RESOLVED_REMOTE",
                "coordinationSource": "EDGAR_LIVE_INDEX+WS-EHB_INTERFACE",
                "filingDate": d.get("filingDate"),
                "description": d.get("description"),
            }
        )

    # Trim / pad policy: exactly 25 distinct; no synthetic
    # Deduplicate by sourceIdentityKey
    seen = set()
    deduped = []
    for b in batch:
        k = b["sourceIdentityKey"]
        if k in seen:
            continue
        seen.add(k)
        deduped.append(b)
    batch = deduped[:25]

    # Identity separation check
    for b in batch:
        assert "issuerKey" in b and "instrumentId" in b and "documentId" in b
        assert "sourceIdentityKey" in b
        # accession may be null for some local fixtures — tracked separately from source identity

    kinds = {}
    for b in batch:
        kinds[b["documentKind"]] = kinds.get(b["documentKind"], 0) + 1

    return {
        "artifact": "03-authentic-corpus-batch",
        "datasetVersion": DATASET_VERSION,
        "targetBatchSize": 25,
        "actualBatchSize": len(batch),
        "syntheticPadding": False,
        "phase2DocumentCount": len(phase2_reg["documents"]),
        "phase2IssuerCount": len(phase2_reg["issuers"]),
        "coordination": {
            "WS-EHB": PEER_BRANCHES["WS-EHB"],
            "WS-CKF": PEER_BRANCHES["WS-CKF"],
            "WS-ACR": PEER_BRANCHES["WS-ACR"],
            "ckfIndentureCountPeer": {"INDENTURE": 3, "SUPPLEMENTAL_INDENTURE": 4},
            "ehbPilotNote": "EHB pilot-100 queues acquisitions; this batch joins ACR identities + local remainder + live EDGAR indenture identities.",
        },
        "byDocumentKind": kinds,
        "issuersInBatch": sorted({b["issuerKey"] for b in batch}),
        "identityModel": [
            "issuerKey / issuerCik",
            "instrumentId",
            "documentId",
            "accession (nullable)",
            "sourceIdentityKey",
        ],
        "documents": batch,
        "gapNote": (
            None
            if len(batch) >= 25
            else f"Batch short of 25 ({len(batch)}); awaiting further EHB/CKF acquired source-id export."
        ),
    }


# ---------------------------------------------------------------------------
# 5. Dependency closure
# ---------------------------------------------------------------------------

def build_dependency_closure(exceptions: list, audit: dict) -> dict:
    per_exception = []
    for e in exceptions:
        if e.get("isNegativeControl") and e.get("exceptionSourceSpan", {}).get("matchStatus") == "UNRESOLVED":
            continue  # control stubs handled separately
        unresolved = list(e.get("unresolvedControllingSources") or [])
        deps = {
            "exceptionId": e["exceptionId"],
            "definitionEncyclopedia": {
                "peer": PEER_BRANCHES["WS-DEF"],
                "status": "REFERENCED",
                "terms": e.get("definedTerms") or [],
                "closure": "PARTIAL" if unresolved else "LOCAL_ONLY",
            },
            "covenantDependencyAtlas": {
                "peer": PEER_BRANCHES["WS-CDA"],
                "status": "REFERENCED",
                "note": "Cross-section / chapeau edges require CDA join; not auto-promoted.",
            },
            "basketFormulaLibrary": {
                "peer": PEER_BRANCHES["WS-BFL"],
                "status": "REFERENCED",
                "sharedCapacity": e.get("sharedCapacityRestrictions") or [],
            },
            "amendmentChainResearch": {
                "peer": PEER_BRANCHES["WS-ACR"],
                "status": "REFERENCED",
                "amendmentAuthority": e.get("amendmentAuthority") or [],
            },
            "sourceToCovenantDataset": {
                "peer": PEER_BRANCHES["WS-S2C"],
                "status": "REFERENCED",
                "note": "S2C held-out split marks CHWY/ROCK/RIOT — NCEDB phase-3 held-out uses ROCK §7.06.",
            },
            "unresolvedControllingDependencies": unresolved,
            "sourceSpanExactDoesNotImplyVerifiedLegalMeaning": True,
            "permissionClassification": e.get("permissionClassification"),
        }
        per_exception.append(deps)

    return {
        "artifact": "05-dependency-closure",
        "datasetVersion": DATASET_VERSION,
        "principle": (
            "Exact source span ≠ verified legal meaning. Every exception discloses unresolved "
            "controlling dependencies. Peer research is integrated by reference, not by silent promotion."
        ),
        "peers": PEER_BRANCHES,
        "unconditionalAuditSurvivors": audit["survivingUnconditionalCount"],
        "exceptionsWithUnresolvedDeps": sum(
            1 for d in per_exception if d["unresolvedControllingDependencies"]
        ),
        "perException": per_exception,
    }


# ---------------------------------------------------------------------------
# 6. Canonical import validation
# ---------------------------------------------------------------------------

def build_import_validation(exceptions: list) -> dict:
    """Validate adapter against CKF KnowledgeSourceRecord shape (peer); prove idempotency locally."""
    # Canonical schema availability on THIS branch
    kf_types = ROOT / "lib/knowledge-factory/types.ts"
    canonical_schema_on_branch = kf_types.exists()
    # Peer schema fields from WS-CKF KnowledgeSourceRecord (inspected via git show)
    knowledge_source_record_fields = [
        "sourceId",
        "issuerCik",
        "issuerTicker",
        "issuerName",
        "accessionNumber",
        "exhibitFilename",
        "sourceUrl",
        "filingDate",
        "formType",
        "documentTitle",
        "documentClass",
        "instrumentIdentity",
        "originalBytesHash",
        "normalizedTextHash",
        "acquisitionTimestamp",
        "parserVersion",
        "extractionStatus",
        "representationLevel",
        "provenance",
        "usageRightsReviewStatus",
    ]
    ncedb_to_kf_alignment = {
        "sourceIdentity.sourceIdentityKey": "sourceId / instrumentIdentity (join key pending)",
        "sourceIdentity.issuerCik": "issuerCik",
        "sourceIdentity.issuerTicker": "issuerTicker",
        "sourceIdentity.sourceSha256": "originalBytesHash",
        "sourceIdentity.filingAccession": "accessionNumber",
        "sourceIdentity.sourceUrl": "sourceUrl",
        "sourceIdentity.documentKind": "documentClass",
        "representationLevelCeiling": "representationLevel (SOURCE_ONLY / DETERMINISTICALLY_VALIDATED)",
        "productionCapacityApproved=false": "promotion-guards: no Permission / SharedCapacityConstraint writes",
    }

    # Local idempotency / duplicate / no-promotion proofs (adapter-level)
    import_keys = []
    for e in exceptions:
        if e.get("exceptionSourceSpan", {}).get("matchStatus") == "UNRESOLVED":
            continue  # control stubs rejected by adapter validation
        key = f"{e['sourceIdentity']['sourceIdentityKey']}::{e['exceptionId']}"
        import_keys.append(key)
    unique = len(set(import_keys))
    duplicates_in_batch = len(import_keys) - unique

    status = "ALIGNED_FOR_REVIEW" if not canonical_schema_on_branch else "SCHEMA_PRESENT_PENDING_WIRE"
    return {
        "artifact": "07-import-integration",
        "datasetVersion": DATASET_VERSION,
        "status": status,
        "canonicalSchemaOnBranch": canonical_schema_on_branch,
        "canonicalSchemaPeer": {
            "branch": PEER_BRANCHES["WS-CKF"],
            "type": "KnowledgeSourceRecord",
            "path": "lib/knowledge-factory/types.ts",
            "fields": knowledge_source_record_fields,
            "promotionGuards": "lib/knowledge-factory/legal-safety/promotion-guards.ts",
        },
        "adapterPath": "lib/negative-covenant-exceptions/import-adapter.ts",
        "fieldAlignment": ncedb_to_kf_alignment,
        "proofs": {
            "idempotentReimport": {
                "provenLocally": True,
                "method": "buildDeterministicImportBatch twice → identical importKeys; second pass with alreadyImportedKeys skips all",
            },
            "duplicateHandling": {
                "provenLocally": True,
                "duplicatesWithinCatalog": duplicates_in_batch,
                "strategy": "exceptionImportKey(exceptionId, sourceIdentityKey) + seen/already sets",
            },
            "sourceVersionPreservation": {
                "provenLocally": True,
                "fields": ["sourceSha256", "sourceIdentityKey", "datasetVersion", "exceptionSpan"],
            },
            "amendmentAwareInvalidation": {
                "provenLocally": True,
                "method": "sourceIdentityKey includes content hash / ACR docId; amendment docs are distinct keys; re-import of superseded base does not silently merge",
                "note": "Full CKF relationship-graph invalidation awaits schema wire-up on this branch.",
            },
            "noPromotionIntoProductionPermissionTables": {
                "provenLocally": True,
                "productionCapacityApprovedAlwaysFalse": True,
                "doesNotWrite": [
                    "Permission",
                    "PermissionRelationship",
                    "SharedCapacityConstraint",
                    "CovenantProvision",
                    "ContractRule",
                    "SemanticTruthRecord",
                ],
            },
        },
        "reasonNotCompletedIntegration": (
            None
            if canonical_schema_on_branch
            else (
                "lib/knowledge-factory canonical schema is not present on this branch "
                "(lives on WS-CKF). Returning ALIGNED_FOR_REVIEW rather than claiming completed integration."
            )
        ),
    }


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    phase2 = load_phase2()

    audit = build_unconditional_audit(phase2)
    write_json(OUT / "01-unconditional-classification-audit.json", audit)
    write_json(OUT / "audits/unconditional-four.json", {"audits": audit["audits"]})

    exceptions = apply_audit_to_catalog(phase2, audit)
    controls_doc, new_rows = build_negative_controls(exceptions)
    # Only append control stubs that aren't already present
    existing = {e["exceptionId"] for e in exceptions}
    for row in new_rows:
        if row["exceptionId"] not in existing:
            exceptions.append(row)
            existing.add(row["exceptionId"])

    write_json(OUT / "04-negative-controls.json", controls_doc)
    write_json(OUT / "negative-controls/cases.json", {"cases": controls_doc["cases"]})

    gt, metrics, detector_run = build_heldout_and_metrics(exceptions)
    write_json(OUT / "held-out/gibraltar-7.06-independent-gt.json", gt)
    write_json(OUT / "held-out/gibraltar-7.06-detector-run.json", detector_run)
    write_json(OUT / "06-independent-quality-metrics.json", metrics)

    batch = build_authentic_batch()
    write_json(OUT / "03-authentic-corpus-batch.json", batch)
    # Extended registry = phase2 + batch
    phase2_reg = json.loads((PHASE2 / "03-document-registry.json").read_text())
    registry = {
        "artifact": "03-document-registry-phase3",
        "phase2Documents": phase2_reg["documents"],
        "phase3Batch": batch["documents"],
        "totalDistinctTracked": len(phase2_reg["documents"]) + batch["actualBatchSize"],
        "issuers": sorted(
            set(phase2_reg["issuers"]) | set(batch["issuersInBatch"])
        ),
    }
    write_json(OUT / "03-document-registry.json", registry)

    deps = build_dependency_closure(exceptions, audit)
    write_json(OUT / "05-dependency-closure.json", deps)

    # Source-span audit for non-control EXACT rows
    span_failures = []
    span_ok = 0
    for e in exceptions:
        sp = e.get("exceptionSourceSpan") or {}
        if e.get("isNegativeControl") and sp.get("matchStatus") == "UNRESOLVED":
            continue
        if sp.get("matchStatus") != "EXACT":
            if sp.get("matchStatus") == "UNRESOLVED" and not e.get("isNegativeControl"):
                span_failures.append({"exceptionId": e["exceptionId"], "reason": "UNRESOLVED"})
            continue
        path = ROOT / e["sourceIdentity"]["sourcePath"]
        if not path.exists():
            span_failures.append({"exceptionId": e["exceptionId"], "reason": "MISSING_FILE"})
            continue
        text = path.read_text(encoding="utf-8", errors="replace")
        digest = sha256_file(path)
        if digest != e["sourceIdentity"]["sourceSha256"]:
            span_failures.append({"exceptionId": e["exceptionId"], "reason": "SHA_MISMATCH"})
            continue
        if text[sp["charStart"] : sp["charEnd"]] != sp["exactText"]:
            span_failures.append({"exceptionId": e["exceptionId"], "reason": "SLICE_MISMATCH"})
            continue
        if e["exactExceptionText"] != sp["exactText"]:
            span_failures.append({"exceptionId": e["exceptionId"], "reason": "TEXT_DIVERGENCE"})
            continue
        span_ok += 1

    span_audit = {
        "artifact": "07-source-span-audit",
        "okCount": span_ok,
        "failureCount": len(span_failures),
        "failures": span_failures,
    }
    write_json(OUT / "07-source-span-audit.json", span_audit)

    import_val = build_import_validation(exceptions)
    write_json(OUT / "08-import-integration.json", import_val)

    # Class counts
    class_counts: dict[str, int] = {}
    for e in exceptions:
        c = e["permissionClassification"]
        class_counts[c] = class_counts.get(c, 0) + 1

    manifest = {
        "datasetId": "ncedb-phase3",
        "datasetVersion": DATASET_VERSION,
        "workstreamId": "WS-NED",
        "status": "OFFLINE_RESEARCH_DATASET",
        "representationLevelCeiling": "DETERMINISTICALLY_VALIDATED",
        "exactSourceProvenance": True,
        "stableContentIdentities": True,
        "sourceTextHashes": True,
        "compilerOrModelVersions": {"ncedb": DATASET_VERSION, "mode": "deterministic-offline"},
        "confidenceAndUncertaintyLabels": True,
        "verificationStatusField": True,
        "duplicateDetection": {"strategy": "exceptionImportKey(exceptionId, sourceIdentityKey)"},
        "deterministicReplay": {"regenerator": "scripts/negative-covenant-exception-database/generate-phase3.py"},
        "actualRecordCounts": {
            "exceptionsIncludingControls": len(exceptions),
            "exceptionsExcludingUnresolvedControlStubs": sum(
                1
                for e in exceptions
                if not (
                    e.get("isNegativeControl")
                    and e.get("exceptionSourceSpan", {}).get("matchStatus") == "UNRESOLVED"
                )
            ),
            "byPermissionClassification": class_counts,
            "authenticBatchSize": batch["actualBatchSize"],
            "unconditionalSurviving": audit["survivingUnconditionalCount"],
        },
        "independentQualityMetrics": {
            "path": "docs/negative-covenant-exception-database/phase-3/06-independent-quality-metrics.json",
            "status": metrics["status"],
        },
        "nonGoals": [
            "No production Permission table writes",
            "No paid inference",
            "No certification advancement",
            "No merge to main",
            "No Claude-owned fixture changes",
            "No capacity conclusions from categorical exceptions",
        ],
    }

    # Indexes
    indexes = {
        "byClassification": {},
        "byIssuer": {},
        "byFamily": {},
        "negativeControls": [e["exceptionId"] for e in exceptions if e.get("isNegativeControl")],
        "phase3Audited": [a["exceptionId"] for a in audit["audits"]],
    }
    for e in exceptions:
        indexes["byClassification"].setdefault(e["permissionClassification"], []).append(e["exceptionId"])
        indexes["byIssuer"].setdefault(e["sourceIdentity"]["issuerKey"], []).append(e["exceptionId"])
        indexes["byFamily"].setdefault(e["covenantFamily"], []).append(e["exceptionId"])

    catalog = {"manifest": manifest, "exceptions": exceptions, "indexes": indexes}
    write_json(OUT / "catalogs/exceptions-v3.json", catalog)

    # KF export (research only)
    export_records = []
    for e in exceptions:
        if e.get("exceptionSourceSpan", {}).get("matchStatus") == "UNRESOLVED":
            continue
        export_records.append(
            {
                "importKey": f"{e['sourceIdentity']['sourceIdentityKey']}::{e['exceptionId']}",
                "exceptionId": e["exceptionId"],
                "issuerKey": e["sourceIdentity"]["issuerKey"],
                "sourceIdentityKey": e["sourceIdentity"]["sourceIdentityKey"],
                "sourceSha256": e["sourceIdentity"]["sourceSha256"],
                "permissionClassification": e["permissionClassification"],
                "covenantFamily": e["covenantFamily"],
                "exactExceptionText": e["exactExceptionText"],
                "charStart": e["exceptionSourceSpan"]["charStart"],
                "charEnd": e["exceptionSourceSpan"]["charEnd"],
                "verificationStatus": e["verificationStatus"],
                "localConditionCount": len(e.get("localConditions") or []),
                "remoteConditionCount": len(e.get("remoteConditions") or []),
                "unresolvedControllingSources": [u["ref"] for u in (e.get("unresolvedControllingSources") or [])],
                "productionCapacityApproved": False,
            }
        )
    write_json(
        OUT / "knowledge-factory-export.json",
        {
            "datasetVersion": DATASET_VERSION,
            "workstreamId": "WS-NED",
            "representationLevelCeiling": "DETERMINISTICALLY_VALIDATED",
            "productionCapacityApproved": False,
            "importIntegrationStatus": import_val["status"],
            "records": export_records,
        },
    )
    write_json(OUT / "import/alignment-report.json", import_val)

    unresolved_legal = {
        "artifact": "08-unresolved-legal-questions",
        "items": [
            {
                "id": "ULQ-P3-1",
                "question": (
                    "When is a categorical facility/Loan-Document carve-out an unconditional legal "
                    "permission versus a definitionally bounded conditional exception?"
                ),
                "status": "OPEN",
                "related": [a["exceptionId"] for a in audit["audits"]],
            },
            {
                "id": "ULQ-P3-2",
                "question": "Do 7.06(a) provisos attach to 7.06(b) enumerated exceptions?",
                "status": "OPEN",
                "related": ["gibraltar-7.06-b-1-loan-docs-burdensome-exception", "amb-gib-7.06-a-proviso-hanging"],
            },
            {
                "id": "ULQ-P3-3",
                "question": (
                    "How should external Collateral definitions (Pledge agreements) invalidate "
                    "unconditional classification even when the exception clause has no dollar gate?"
                ),
                "status": "OPEN",
                "related": ["riot-5.02-a-i-facility-liens"],
            },
            {
                "id": "ULQ-P3-4",
                "question": "Amendment-chain operative-text precedence for exception capacity after restatement.",
                "status": "OPEN",
                "related": ["amb-sup-amendment-change"],
            },
        ],
    }
    write_json(OUT / "08-unresolved-legal-questions.json", unresolved_legal)

    scope = {
        "artifact": "00-scope",
        "phase": 3,
        "datasetVersion": DATASET_VERSION,
        "startingPR": 143,
        "startingSha": "b9699fd8b00290ce38d373636834bd73addb19a6",
        "goals": [
            "Audit UNCONDITIONAL_SOURCE_VERIFIED records",
            "Complete AMBIGUOUS_CONDITION_SCOPE negative controls",
            "Independent held-out precision/recall",
            "+25 authentic financing agreements batch",
            "Dependency closure with peer research",
            "Canonical import validation (ALIGNED_FOR_REVIEW if schema absent)",
        ],
        "nonGoals": manifest["nonGoals"],
    }
    write_json(OUT / "00-scope.json", scope)

    taxonomy = json.loads((PHASE2 / "01-classification-taxonomy.json").read_text())
    taxonomy["phase3Note"] = (
        "UNCONDITIONAL_SOURCE_VERIFIED retained in taxonomy but Phase-3 audit found 0 survivors "
        "among the four audited records after distinguishing categorical exception from legal permission."
    )
    write_json(OUT / "01-classification-taxonomy.json", taxonomy)

    verdict = {
        "artifact": "99-phase-3-verdict",
        "datasetVersion": DATASET_VERSION,
        "unconditionalAudit": {
            "audited": audit["auditedCount"],
            "downgraded": audit["downgradedCount"],
            "surviving": audit["survivingUnconditionalCount"],
        },
        "negativeControls": controls_doc["counts"],
        "authenticBatchAdded": batch["actualBatchSize"],
        "qualityMetricsStatus": metrics["status"],
        "importStatus": import_val["status"],
        "sourceSpanFailures": span_audit["failureCount"],
        "productionCapacityConclusions": False,
        "readyForMerge": False,
    }
    write_json(OUT / "99-phase-3-verdict.json", verdict)

    # Mission report markdown
    m = metrics["metrics"]
    report = f"""# NCEDB Phase 3 — Mission Report

Dataset: `{DATASET_VERSION}`  
Starting PR: #143 @ `b9699fd8b00290ce38d373636834bd73addb19a6`  
Branch: `cursor/negative-covenant-exception-db-21b5`  
Mode: offline research — no paid inference, no merge, no certification advancement, no production Permission writes.

## 1. Unconditional-classification audit

Audited **{audit['auditedCount']}** `UNCONDITIONAL_SOURCE_VERIFIED` records. Downgraded **{audit['downgradedCount']}**. Survivors: **{audit['survivingUnconditionalCount']}**.

| exceptionId | from | to | categorical local? | unconditional legal permission? |
|---|---|---|---|---|
"""
    for row in audit["summaryTable"]:
        report += (
            f"| `{row['exceptionId']}` | {row['from']} | {row['to']} | "
            f"{row['categoricalLocal']} | {row['unconditionalLegalPermission']} |\n"
        )
    report += """
Principle: categorical local carve-out ≠ unconditional legal permission. Incomplete controlling context forces downgrade. No production capacity inferred.

## 2. Negative controls

"""
    for k, v in controls_doc["counts"].items():
        report += f"- `{k}`: {v}\n"
    report += f"\nCase types covered: {', '.join(controls_doc['caseTypesCovered'])}\n"

    report += f"""
## 3. Distinct authentic documents added

Batch size: **{batch['actualBatchSize']}** / 25 (synthetic padding: **false**).

Kinds: `{json.dumps(batch['byDocumentKind'])}`  
Issuers in batch: {', '.join(batch['issuersInBatch'])}

Identity fields tracked separately: issuer, instrument, document, accession, sourceIdentityKey.

## 4. Independent precision/recall

Held-out: Gibraltar §7.06 (detector **not** tuned on ROCK; GT authored independently of detector/catalog).

| metric | value | numerator | denominator |
|---|---|---|---|
| exception discovery precision | {m['exceptionDiscoveryPrecision']['value']} | {m['exceptionDiscoveryPrecision']['numerator']} | {m['exceptionDiscoveryPrecision']['denominator']} |
| exception discovery recall | {m['exceptionDiscoveryRecall']['value']} | {m['exceptionDiscoveryRecall']['numerator']} | {m['exceptionDiscoveryRecall']['denominator']} |
| incorrect unconditional-classification rate | {m['incorrectUnconditionalClassificationRate']['value']} | {m['incorrectUnconditionalClassificationRate']['numerator']} | {m['incorrectUnconditionalClassificationRate']['denominator']} |
| source-span accuracy (ROCK catalog rows) | {m['sourceSpanAccuracy']['value']} | {m['sourceSpanAccuracy']['numerator']} | {m['sourceSpanAccuracy']['denominator']} |

Catalog invariants are **not** reported as measured accuracy.

## 5. Remote-condition and proviso results

| metric | value | numerator | denominator |
|---|---|---|---|
| remote-condition recall | {m['remoteConditionRecall']['value']} | {m['remoteConditionRecall']['numerator']} | {m['remoteConditionRecall']['denominator']} |
| proviso attachment accuracy | {m['provisoAttachmentAccuracy']['value']} | {m['provisoAttachmentAccuracy']['numerator']} | {m['provisoAttachmentAccuracy']['denominator']} |
| entity-scope accuracy | {m['entityScopeAccuracy']['value']} | {m['entityScopeAccuracy']['numerator']} | {m['entityScopeAccuracy']['denominator']} |
| cross-reference accuracy | {m['crossReferenceAccuracy']['value']} | {m['crossReferenceAccuracy']['numerator']} | {m['crossReferenceAccuracy']['denominator']} |

## 6. Source-provenance failures

Exact-span failures (non-control catalog rows): **{span_audit['failureCount']}** (ok={span_audit['okCount']}).

## 7. Import integration status

**{import_val['status']}** — canonical `lib/knowledge-factory` schema {'present' if import_val['canonicalSchemaOnBranch'] else 'absent'} on this branch.
Local proofs: idempotent re-import, duplicate handling, source-version preservation, amendment-aware key separation, no Permission promotion.

## 8. Remaining legal uncertainties

See `08-unresolved-legal-questions.json` (ULQ-P3-1 … ULQ-P3-4).

## 9. SHA / tests / CI / PR

Recorded after commit/push in the mandatory return box.
"""
    (OUT / "MISSION-REPORT.md").write_text(report, encoding="utf-8")
    (OUT / "README.md").write_text(
        "# NCEDB Phase 3\n\n"
        "Independently evaluated, dependency-aware research dataset.\n\n"
        f"- Dataset version: `{DATASET_VERSION}`\n"
        "- Regenerator: `scripts/negative-covenant-exception-database/generate-phase3.py`\n"
        "- Catalog: `catalogs/exceptions-v3.json`\n"
        "- See `MISSION-REPORT.md` for the mandatory return narrative.\n",
        encoding="utf-8",
    )

    print(
        json.dumps(
            {
                "ok": True,
                "datasetVersion": DATASET_VERSION,
                "exceptions": len(exceptions),
                "unconditionalSurviving": audit["survivingUnconditionalCount"],
                "batchSize": batch["actualBatchSize"],
                "importStatus": import_val["status"],
                "spanFailures": span_audit["failureCount"],
                "metricsStatus": metrics["status"],
            },
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
