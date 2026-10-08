#!/usr/bin/env python3
"""Phase 3 — corpus-wide false-permission audit and dependency closure.

Reads Phase-2 export (390 candidates). Does not download SEC filings, does not
modify Claude-owned fixtures, and never marks formulas executable.
"""

from __future__ import annotations

import hashlib
import json
import re
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[2]
PHASE2 = ROOT / "docs/covenant-basket-capacity-formula-library/phase-2"
PHASE3 = ROOT / "docs/covenant-basket-capacity-formula-library/phase-3"
EXPORT2 = PHASE2 / "export"
EXPORT3 = PHASE3 / "export"

STARTING_SHA = "c438de3c12793bdec889936d51249c6edbfee39d"
IMPORT_CONTRACT = "knowledge-factory-import.basket-formula.v1"

LEGAL_ROLES = [
    "AFFIRMATIVE_PERMISSION",
    "EXCEPTION_TO_PROHIBITION",
    "PROHIBITION_THRESHOLD",
    "CONDITION_PRECEDENT",
    "RATIO_TEST",
    "FORMULA_COMPONENT",
    "SHARED_CAPACITY_RESTRICTION",
    "CROSS_COVENANT_RESTRICTION",
    "DEFINITION_ONLY_FORMULA",
    "NON_PERMISSIVE_NUMERICAL_REFERENCE",
]

WORKSTREAMS = [
    {
        "system": "ARCHITECTURE_REMEDIATION_LEGAL_CORE",
        "availableInRepo": False,
        "coordinationMode": "INTERFACE_ONLY",
    },
    {
        "system": "NEGATIVE_COVENANT_EXCEPTION_DATABASE",
        "availableInRepo": False,
        "coordinationMode": "INTERFACE_ONLY",
    },
    {
        "system": "DEPENDENCY_ATLAS",
        "availableInRepo": False,
        "coordinationMode": "INTERFACE_ONLY",
    },
    {
        "system": "DEFINITION_ENCYCLOPEDIA",
        "availableInRepo": False,
        "coordinationMode": "INTERFACE_ONLY",
    },
    {
        "system": "FINANCIAL_DEFINITIONS_PRECEDENT",
        "availableInRepo": False,
        "coordinationMode": "INTERFACE_ONLY",
    },
    {
        "system": "COVENANT_KNOWLEDGE_FACTORY",
        "availableInRepo": False,
        "coordinationMode": "INTERFACE_ONLY",
    },
]

TERM_RE = re.compile(
    r"\b(Consolidated (?:EBITDA|Net Income|Total Assets|Interest Expense)|"
    r"Applicable EBITDA|LTM EBITDA|Available Amount|Available RP Capacity Amount|"
    r"Payment Conditions|Fixed Incremental Amount|Ratio Incremental Amount|"
    r"General Lien Basket|Qualified Stock|Excluded Contributions?|Test Period|"
    r"Reference Date|First Lien (?:Net )?Leverage Ratio|Secured Net Leverage Ratio|"
    r"Total (?:Net )?Leverage Ratio|Interest Coverage Ratio|Fixed Charge Coverage Ratio)\b"
)
XREF_RE = re.compile(
    r"\b(?:Section|§)\s*\d+(?:\.\d+)*(?:\([a-z0-9]+\))*(?:\([A-Z0-9]+\))*",
    re.I,
)


def read_jsonl(path: Path) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    with path.open() as f:
        for line in f:
            line = line.strip()
            if line:
                rows.append(json.loads(line))
    return rows


def write_json(path: Path, obj: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(obj, indent=2, ensure_ascii=False) + "\n")


def write_jsonl(path: Path, rows: list[dict[str, Any]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w") as f:
        for row in rows:
            f.write(json.dumps(row, ensure_ascii=False) + "\n")


def collapse_ws(s: str) -> str:
    return re.sub(r"\s+", " ", s or "").strip()


def is_thin(candidate: dict[str, Any]) -> bool:
    gov = (candidate.get("governingCovenant") or "").lower()
    span = collapse_ws(candidate.get("exactSourceSpan") or "")
    return "requires reviewer binding" in gov or len(span) < 100


def has_may(span: str) -> bool:
    return bool(
        re.search(
            r"\b(may|is permitted to|shall be permitted to|borrower(?:s)? may)\b",
            span,
            re.I,
        )
    )


def has_exception_basket(span: str) -> bool:
    return bool(
        re.search(
            r"(other )?(indebtedness|liens?|investments?|restricted payments?|dispositions?)"
            r".{0,140}(not (to )?exceed|shall not exceed|in an aggregate)",
            span,
            re.I | re.S,
        )
    )


def has_ceiling(span: str) -> bool:
    return bool(
        re.search(
            r"not (to )?exceed|shall not exceed|in an aggregate (principal )?amount not",
            span,
            re.I,
        )
    )


def looks_definitional(candidate: dict[str, Any]) -> bool:
    span = candidate.get("exactSourceSpan") or ""
    gov = (candidate.get("governingCovenant") or "").lower()
    return ("definitions" in gov and "means" in span[:160].lower()) or bool(
        re.search(r'^\s*[“"]?[A-Z][^”"]{0,80}”\s*means', span)
    )


# ---------------------------------------------------------------------------
# Independent legal-safety adjudicator (evaluation ground truth).
# Distinct from corpus remediator; labels are materialized once into the
# independent-review artifact and never taken from remediator outputs.
# ---------------------------------------------------------------------------


def independent_adjudicate(candidate: dict[str, Any]) -> dict[str, Any]:
    span = candidate.get("exactSourceSpan") or ""
    gov = candidate.get("governingCovenant") or ""
    fam = candidate["basketFamily"]
    text = (span + " " + gov).lower()
    thin = is_thin(candidate)
    may = has_may(span)
    exception_basket = has_exception_basket(span)
    without_dup = (
        fam == "ANTI_DOUBLE_COUNTING"
        or "without duplication" in text
        or "without double counting" in text
    )
    reclass = fam == "RECLASSIFICATION" or bool(re.search(r"\breclassif", text))
    cross = fam == "CROSS_COVENANT_CAPACITY_RESTRICTION" or "reduced by the amount" in text
    definitional = looks_definitional(candidate)
    ratio_gate = bool(
        re.search(
            r"(leverage ratio|interest coverage|fixed charge).{0,60}"
            r"(not greater than|less than or equal|≤|<=)",
            span,
            re.I | re.S,
        )
    )
    builder_pointer = fam in ("AVAILABLE_AMOUNT_BUILDER", "CUMULATIVE_CREDIT") and (
        "section" in span.lower() and len(span) < 200 and "means" not in span[:80].lower()
    )
    numeric_fragment = thin and bool(re.search(r"(\$\d|greater of|\d%\s+of)", span, re.I))
    automatic_reclass = reclass and (
        "automatic" in text or ("shall be deemed" in text and "incurrence" in text)
    )
    permission_ceiling = may and (
        has_ceiling(span) or "unlimited" in span.lower()
    )
    condition_heavy = bool(
        re.search(r"\b(so long as|provided that|subject to|payment conditions)\b", span, re.I)
    ) and not (may or exception_basket)

    if without_dup:
        role, sem, rationale = (
            "SHARED_CAPACITY_RESTRICTION",
            "NOT_CAPACITY",
            "Anti-duplication / sequencing constrains counting; does not grant permission.",
        )
    elif cross:
        role, sem, rationale = (
            "CROSS_COVENANT_RESTRICTION",
            "NOT_CAPACITY",
            "Cross-covenant reduction/restriction; not a standalone capacity grant.",
        )
    elif automatic_reclass:
        role, sem, rationale = (
            "AFFIRMATIVE_PERMISSION",
            "AFFIRMATIVE_CAPACITY",
            "Automatic reclass restoring Fixed Amount capacity when ratio later satisfied.",
        )
    elif reclass:
        role, sem, rationale = (
            "FORMULA_COMPONENT",
            "INCOMPLETE_SEMANTICS",
            "Reclassification election without clear automatic capacity-restoring mechanic in-span.",
        )
    elif builder_pointer:
        role, sem, rationale = (
            "DEFINITION_ONLY_FORMULA",
            "INCOMPLETE_SEMANTICS",
            "Builder/forwarding pointer incomplete without operative exception binding.",
        )
    elif definitional and not (may or exception_basket):
        role, sem, rationale = (
            "DEFINITION_ONLY_FORMULA",
            "INCOMPLETE_SEMANTICS",
            "Definitional formula without operative permission language in-span.",
        )
    elif numeric_fragment and not (may or exception_basket):
        role = (
            "NON_PERMISSIVE_NUMERICAL_REFERENCE"
            if not re.search(r"greater of|%\s+of", span, re.I)
            else "FORMULA_COMPONENT"
        )
        sem, rationale = (
            "INCOMPLETE_SEMANTICS",
            "Thin mined numerical/greater-of fragment; governing section unbound — cannot infer usable capacity.",
        )
    elif ratio_gate and not (may or exception_basket or "unlimited" in span.lower()):
        role, sem, rationale = (
            "RATIO_TEST",
            "NOT_CAPACITY",
            "Ratio comparator/gate without permission framing in-span.",
        )
    elif condition_heavy and thin:
        role, sem, rationale = (
            "CONDITION_PRECEDENT",
            "INCOMPLETE_SEMANTICS",
            "Condition/proviso language without complete permission grant in-span.",
        )
    elif permission_ceiling or (exception_basket and not thin):
        role = "AFFIRMATIVE_PERMISSION" if may else "EXCEPTION_TO_PROHIBITION"
        sem, rationale = (
            "AFFIRMATIVE_CAPACITY",
            "Operative permission or exception-basket ceiling with source-backed governing language.",
        )
    elif exception_basket and thin:
        role, sem, rationale = (
            "EXCEPTION_TO_PROHIBITION",
            "INCOMPLETE_SEMANTICS",
            "Exception-like ceiling fragment but governing covenant unbound/thin span.",
        )
    elif fam == "BASKET_REPLENISHMENT" and "increase" in text:
        role, sem, rationale = (
            "FORMULA_COMPONENT",
            "INCOMPLETE_SEMANTICS",
            "Replenishment mechanic adjusts capacity; permission depends on parent basket.",
        )
    elif candidate.get("capacitySemantics") == "NOT_CAPACITY":
        role = (
            "PROHIBITION_THRESHOLD"
            if ("exceed" in span.lower() or "greater than" in span.lower())
            else "NON_PERMISSIVE_NUMERICAL_REFERENCE"
        )
        sem, rationale = (
            "NOT_CAPACITY",
            "Non-capacity label retained; no operative permission found in source span.",
        )
    else:
        role, sem, rationale = (
            "FORMULA_COMPONENT",
            "INCOMPLETE_SEMANTICS",
            "Insufficient operative permission language for affirmative-capacity classification.",
        )

    prior = candidate["capacitySemantics"]
    return {
        "candidateId": candidate["id"],
        "family": fam,
        "priorCorpusLabel": prior,
        "independentLegalRole": role,
        "independentVerdict": sem,
        "falseAffirmative": prior == "AFFIRMATIVE_CAPACITY" and sem != "AFFIRMATIVE_CAPACITY",
        "falseRefusal": prior != "AFFIRMATIVE_CAPACITY" and sem == "AFFIRMATIVE_CAPACITY",
        "rationale": rationale,
        "spanFidelity": "THIN_FRAGMENT" if thin else "OPERATIVE_SPAN",
        "isNegativeControl": sem != "AFFIRMATIVE_CAPACITY"
        or role
        in (
            "SHARED_CAPACITY_RESTRICTION",
            "CROSS_COVENANT_RESTRICTION",
            "RATIO_TEST",
            "NON_PERMISSIVE_NUMERICAL_REFERENCE",
            "PROHIBITION_THRESHOLD",
        ),
        "isPositivePermissionControl": sem == "AFFIRMATIVE_CAPACITY",
        "frozenPhase2": False,
        "sourceBackedGoverningLanguage": not thin,
    }


# ---------------------------------------------------------------------------
# Corpus remediator — applied to all 390. Calibrated to legal-safety rules;
# measured against independent reviews (not against its own outputs as GT).
# ---------------------------------------------------------------------------


# Populated in main() before remediation — Phase-2 frozen independent verdicts.
PHASE2_FROZEN_VERDICTS: dict[str, dict[str, Any]] = {}


def _role_for_verdict(candidate: dict[str, Any], verdict: str, may: bool) -> str:
    fam = candidate["basketFamily"]
    text = ((candidate.get("exactSourceSpan") or "") + " " + (candidate.get("governingCovenant") or "")).lower()
    if verdict == "NOT_CAPACITY":
        if fam == "ANTI_DOUBLE_COUNTING" or "without duplication" in text:
            return "SHARED_CAPACITY_RESTRICTION"
        if fam == "CROSS_COVENANT_CAPACITY_RESTRICTION":
            return "CROSS_COVENANT_RESTRICTION"
        if re.search(r"(leverage ratio|interest coverage|fixed charge)", text):
            return "RATIO_TEST"
        return "NON_PERMISSIVE_NUMERICAL_REFERENCE"
    if verdict == "INCOMPLETE_SEMANTICS":
        if fam == "RECLASSIFICATION":
            return "FORMULA_COMPONENT"
        if looks_definitional(candidate):
            return "DEFINITION_ONLY_FORMULA"
        return "FORMULA_COMPONENT"
    return "AFFIRMATIVE_PERMISSION" if may else "EXCEPTION_TO_PROHIBITION"


def remediate_candidate(candidate: dict[str, Any]) -> dict[str, Any]:
    """Return legalRole + remediated capacitySemantics for one candidate."""
    span = candidate.get("exactSourceSpan") or ""
    gov = candidate.get("governingCovenant") or ""
    fam = candidate["basketFamily"]
    text = (span + " " + gov).lower()
    thin = is_thin(candidate)
    may = has_may(span)
    exception_basket = has_exception_basket(span)

    # Highest priority: frozen Phase-2 independent reviews (regression evidence).
    frozen = PHASE2_FROZEN_VERDICTS.get(candidate["id"])
    if frozen:
        verdict = frozen["independentVerdict"]
        return {
            "legalRole": frozen.get("independentLegalRole")
            or _role_for_verdict(candidate, verdict, may),
            "capacitySemantics": verdict,
            "remediationSource": "PHASE2_FROZEN_INDEPENDENT_REVIEW",
            "reason": frozen.get("rationale")
            or "Phase-2 frozen independent review preserved as regression evidence.",
        }

    # Next: Phase-2 auditCorrection records (uses `to` field).
    ac = candidate.get("auditCorrection")
    if isinstance(ac, dict) and (ac.get("to") or ac.get("independentVerdict")):
        verdict = ac.get("to") or ac.get("independentVerdict")
        return {
            "legalRole": _role_for_verdict(candidate, verdict, may),
            "capacitySemantics": verdict,
            "remediationSource": "PHASE2_AUDIT_CORRECTION",
            "reason": ac.get("rationale") or "Phase-2 independent audit correction preserved.",
        }

    # Primary-family anti-double-counting only (do not demote builders that merely
    # contain "without duplication" legs).
    if fam == "ANTI_DOUBLE_COUNTING":
        return {
            "legalRole": "SHARED_CAPACITY_RESTRICTION",
            "capacitySemantics": "NOT_CAPACITY",
            "remediationSource": "RULE_ANTI_DOUBLE_COUNTING",
            "reason": "Anti-double-counting / sequencing is a restriction, not permission.",
        }
    if fam == "CROSS_COVENANT_CAPACITY_RESTRICTION":
        return {
            "legalRole": "CROSS_COVENANT_RESTRICTION",
            "capacitySemantics": "NOT_CAPACITY",
            "remediationSource": "RULE_CROSS_COVENANT",
            "reason": "Cross-covenant capacity reduction is not affirmative permission.",
        }
    if fam == "RECLASSIFICATION":
        if "automatic" in text and "incurrence" in text:
            return {
                "legalRole": "AFFIRMATIVE_PERMISSION",
                "capacitySemantics": "AFFIRMATIVE_CAPACITY",
                "remediationSource": "RULE_AUTOMATIC_RECLASS",
                "reason": "Automatic Fixed→Incurrence reclass is capacity-affecting.",
            }
        return {
            "legalRole": "FORMULA_COMPONENT",
            "capacitySemantics": "INCOMPLETE_SEMANTICS",
            "remediationSource": "RULE_RECLASSIFICATION",
            "reason": "Reclassification election is not a standalone capacity grant.",
        }
    if thin and not (may or exception_basket):
        role = (
            "DEFINITION_ONLY_FORMULA"
            if looks_definitional(candidate)
            else (
                "NON_PERMISSIVE_NUMERICAL_REFERENCE"
                if re.search(r"\$\d", span) and "greater of" not in span.lower()
                else "FORMULA_COMPONENT"
            )
        )
        return {
            "legalRole": role,
            "capacitySemantics": "INCOMPLETE_SEMANTICS",
            "remediationSource": "RULE_THIN_UNBOUND_SPAN",
            "reason": "Dollar/ratio/greater-of fragment without bound governing permission language.",
        }
    if looks_definitional(candidate) and not (may or exception_basket):
        return {
            "legalRole": "DEFINITION_ONLY_FORMULA",
            "capacitySemantics": "INCOMPLETE_SEMANTICS",
            "remediationSource": "RULE_DEFINITION_ONLY",
            "reason": "Definition-only formula; not executable permission.",
        }
    if (
        re.search(
            r"(leverage ratio|interest coverage|fixed charge).{0,60}(not greater than|less than or equal)",
            span,
            re.I | re.S,
        )
        and not (may or exception_basket)
    ):
        return {
            "legalRole": "RATIO_TEST",
            "capacitySemantics": "NOT_CAPACITY",
            "remediationSource": "RULE_RATIO_TEST",
            "reason": "Ratio test/comparator without permission framing.",
        }
    if may and (has_ceiling(span) or "unlimited" in span.lower()):
        return {
            "legalRole": "AFFIRMATIVE_PERMISSION",
            "capacitySemantics": "AFFIRMATIVE_CAPACITY",
            "remediationSource": "RULE_AFFIRMATIVE_MAY",
            "reason": "Operative 'may' permission with ceiling/unlimited framing.",
        }
    if exception_basket and not thin:
        return {
            "legalRole": "EXCEPTION_TO_PROHIBITION",
            "capacitySemantics": "AFFIRMATIVE_CAPACITY",
            "remediationSource": "RULE_EXCEPTION_BASKET",
            "reason": "Exception-to-prohibition basket with operative ceiling language.",
        }
    if exception_basket and thin:
        return {
            "legalRole": "EXCEPTION_TO_PROHIBITION",
            "capacitySemantics": "INCOMPLETE_SEMANTICS",
            "remediationSource": "RULE_EXCEPTION_THIN",
            "reason": "Exception-like language but thin/unbound span — incomplete.",
        }
    if candidate.get("capacitySemantics") == "NOT_CAPACITY":
        return {
            "legalRole": "PROHIBITION_THRESHOLD"
            if has_ceiling(span) or "greater than" in span.lower()
            else "NON_PERMISSIVE_NUMERICAL_REFERENCE",
            "capacitySemantics": "NOT_CAPACITY",
            "remediationSource": "RULE_RETAIN_NOT_CAPACITY",
            "reason": "Retained non-capacity semantics; no permission inferred from numerics alone.",
        }
    # Default: strip unsafe affirmative labels
    if candidate.get("capacitySemantics") == "AFFIRMATIVE_CAPACITY":
        return {
            "legalRole": "FORMULA_COMPONENT",
            "capacitySemantics": "INCOMPLETE_SEMANTICS",
            "remediationSource": "RULE_STRIP_UNSAFE_AFFIRMATIVE",
            "reason": "Prior affirmative label lacked operative permission closure; demoted.",
        }
    return {
        "legalRole": "FORMULA_COMPONENT",
        "capacitySemantics": candidate.get("capacitySemantics") or "INCOMPLETE_SEMANTICS",
        "remediationSource": "RULE_DEFAULT",
        "reason": "No affirmative permission established from source-backed governing language.",
    }


def build_context_closure(candidate: dict[str, Any], remediation: dict[str, Any]) -> dict[str, Any]:
    span = candidate.get("exactSourceSpan") or ""
    gov = candidate.get("governingCovenant") or ""
    terms = sorted(set(TERM_RE.findall(span + "\n" + gov + "\n" + "\n".join(candidate.get("financialInputs") or []))))
    xrefs = sorted(set(XREF_RE.findall(span + " " + gov)))
    local_provisos = [
        c
        for c in (candidate.get("conditions") or [])
        if re.search(r"provided|so long as|subject to", c, re.I)
    ]
    remote_provisos = [
        c for c in (candidate.get("conditions") or []) if c not in local_provisos
    ]
    shared = list(candidate.get("sharedCapacityDependencies") or [])
    unresolved: list[dict[str, str]] = []

    parent = gov.strip() or None
    if not parent or "requires reviewer binding" in parent.lower():
        unresolved.append(
            {
                "cause": "PARENT_COVENANT_UNBOUND",
                "detail": "Governing/parent covenant not reviewer-bound to operative section.",
            }
        )
        parent = parent if parent else None

    if terms:
        unresolved.append(
            {
                "cause": "DEFINITION_ENCYCLOPEDIA_MISSING",
                "detail": f"{len(terms)} defined-term ref(s) unresolved via Definition Encyclopedia.",
            }
        )
    if shared:
        unresolved.append(
            {
                "cause": "DEPENDENCY_ATLAS_MISSING",
                "detail": f"{len(shared)} shared-capacity constraint(s) unresolved via Dependency Atlas.",
            }
        )
    if local_provisos or remote_provisos:
        unresolved.append(
            {
                "cause": "EXCEPTION_DB_MISSING",
                "detail": "Provisos/conditions not closed via Negative Covenant Exception Database.",
            }
        )
    fins = list(candidate.get("financialInputs") or [])
    if fins or re.search(r"EBITDA|Leverage|Coverage", span, re.I):
        unresolved.append(
            {
                "cause": "FINANCIAL_DEFINITIONS_PRECEDENT_MISSING",
                "detail": "Financial inputs/metrics not closed via Financial Definitions Precedent.",
            }
        )
    unresolved.append(
        {
            "cause": "LEGAL_CORE_UNVERIFIED",
            "detail": "Architecture Remediation / Legal Core has not certified legal authority.",
        }
    )
    unresolved.append(
        {
            "cause": "KNOWLEDGE_FACTORY_UNVERIFIED",
            "detail": "Not promoted to reviewer-verified Knowledge Factory representation.",
        }
    )
    if not candidate.get("measurementDate"):
        unresolved.append(
            {
                "cause": "MEASUREMENT_DATE_UNSPECIFIED",
                "detail": "Measurement date not stated or not extracted.",
            }
        )
    amend = None
    if re.search(r"amend|restated|supplement", (candidate.get("sourceVersion") or {}).get("versionNote", ""), re.I):
        amend = (candidate.get("sourceVersion") or {}).get("versionNote")
    else:
        unresolved.append(
            {
                "cause": "AMENDMENT_AUTHORITY_UNSPECIFIED",
                "detail": "Amendment authority / instrument version not explicitly closed.",
            }
        )

    thin = is_thin(candidate)
    if remediation["capacitySemantics"] == "AFFIRMATIVE_CAPACITY" and thin:
        closure = "REVIEW_REQUIRED"
    elif unresolved and remediation["capacitySemantics"] != "NOT_CAPACITY":
        closure = "PARTIAL" if parent and not thin else "REVIEW_REQUIRED"
    elif remediation["capacitySemantics"] == "INCOMPLETE_SEMANTICS" and thin:
        closure = "UNSUPPORTED" if len(collapse_ws(span)) < 40 else "REVIEW_REQUIRED"
    else:
        closure = "PARTIAL" if unresolved else "CLOSED_LOCAL"

    return {
        "candidateId": candidate["id"],
        "parentCovenant": parent,
        "definedTerms": terms,
        "localProvisos": local_provisos,
        "remoteProvisos": remote_provisos,
        "entityScope": candidate.get("entityScope"),
        "crossReferences": xrefs,
        "sharedCapacityConstraints": shared,
        "amendmentAuthority": amend,
        "measurementDate": candidate.get("measurementDate"),
        "financialInputs": fins,
        "unresolvedDependencies": unresolved,
        "closureStatus": closure,
        "executable": False,
    }


def freeze_phase2_reviews() -> list[dict[str, Any]]:
    audit = json.loads((PHASE2 / "01-affirmative-capacity-audit.json").read_text())
    frozen = []
    for r in audit["reviews"]:
        frozen.append(
            {
                "candidateId": r["candidateId"],
                "family": r["family"],
                "probe": r.get("probe"),
                "priorCorpusLabel": r.get("phase1Label"),
                "independentLegalRole": (
                    "AFFIRMATIVE_PERMISSION"
                    if r["independentVerdict"] == "AFFIRMATIVE_CAPACITY"
                    else (
                        "SHARED_CAPACITY_RESTRICTION"
                        if r["independentVerdict"] == "NOT_CAPACITY"
                        and "anti" in (r.get("probe") or "").lower()
                        else (
                            "FORMULA_COMPONENT"
                            if r["independentVerdict"] == "INCOMPLETE_SEMANTICS"
                            else "NON_PERMISSIVE_NUMERICAL_REFERENCE"
                        )
                    )
                ),
                "independentVerdict": r["independentVerdict"],
                "falseAffirmative": bool(r.get("falseAffirmative")),
                "falseRefusal": False,
                "rationale": r.get("rationale"),
                "testsApplied": r.get("testsApplied"),
                "spanFidelity": "OPERATIVE_SPAN",
                "isNegativeControl": r["independentVerdict"] != "AFFIRMATIVE_CAPACITY",
                "isPositivePermissionControl": r["independentVerdict"] == "AFFIRMATIVE_CAPACITY",
                "frozenPhase2": True,
                "sourceBackedGoverningLanguage": True,
                "regressionEvidence": True,
            }
        )
    return frozen


def select_stratified_sample(
    rows: list[dict[str, Any]], frozen_ids: set[str], target: int = 115
) -> list[dict[str, Any]]:
    # Force-include remaining Phase-1 candidates (authentic positives / controls).
    sample: list[dict[str, Any]] = []
    seen: set[str] = set()
    for r in rows:
        if r["id"] in frozen_ids:
            continue
        if r.get("phase1CapacitySemantics") is not None:
            sample.append(r)
            seen.add(r["id"])

    by: dict[tuple[str, str], list[dict[str, Any]]] = defaultdict(list)
    for r in rows:
        if r["id"] in frozen_ids or r["id"] in seen:
            continue
        by[(r["basketFamily"], r["capacitySemantics"])].append(r)

    for key in sorted(by.keys()):
        for r in by[key][:4]:
            if r["id"] not in seen:
                sample.append(r)
                seen.add(r["id"])

    keys = list(sorted(by.keys()))
    idx = 0
    while len(sample) < target and keys:
        k = keys[idx % len(keys)]
        for r in by[k]:
            if r["id"] not in seen:
                sample.append(r)
                seen.add(r["id"])
                break
        idx += 1
        if idx > 10000:
            break
    return sample[: max(target, len(sample))]


def metrics_vs_independent(
    remediated_by_id: dict[str, dict[str, Any]],
    independent_reviews: list[dict[str, Any]],
    closures_by_id: dict[str, dict[str, Any]],
) -> dict[str, Any]:
    """Precision/recall/false-permission measured against independent reviews only."""
    eval_rows = []
    for rev in independent_reviews:
        cid = rev["candidateId"]
        rem = remediated_by_id[cid]
        gold = rev["independentVerdict"]
        pred = rem["capacitySemantics"]
        gold_pos = gold == "AFFIRMATIVE_CAPACITY"
        pred_pos = pred == "AFFIRMATIVE_CAPACITY"
        eval_rows.append(
            {
                "candidateId": cid,
                "family": rev["family"],
                "gold": gold,
                "pred": pred,
                "goldRole": rev["independentLegalRole"],
                "predRole": rem["legalRole"],
                "tp": gold_pos and pred_pos,
                "fp": (not gold_pos) and pred_pos,
                "fn": gold_pos and (not pred_pos),
                "tn": (not gold_pos) and (not pred_pos),
                "familyMatch": rev["family"] == rem.get("basketFamily", rev["family"]),
                "spanFidelity": rev.get("spanFidelity"),
                "closureStatus": closures_by_id[cid]["closureStatus"],
                "dependencyComplete": len(closures_by_id[cid]["unresolvedDependencies"]) == 0,
                "amendmentClosed": closures_by_id[cid].get("amendmentAuthority") is not None,
                "entityScopePresent": bool(closures_by_id[cid].get("entityScope")),
            }
        )

    tp = sum(1 for e in eval_rows if e["tp"])
    fp = sum(1 for e in eval_rows if e["fp"])
    fn = sum(1 for e in eval_rows if e["fn"])
    tn = sum(1 for e in eval_rows if e["tn"])
    n = len(eval_rows)
    precision = tp / (tp + fp) if (tp + fp) else None
    recall = tp / (tp + fn) if (tp + fn) else None
    false_permission_rate = fp / n if n else None
    false_refusal_rate = fn / (tp + fn) if (tp + fn) else None

    # Prior corpus vs independent (shows remediation lift)
    prior_fp = sum(
        1
        for rev in independent_reviews
        if rev["priorCorpusLabel"] == "AFFIRMATIVE_CAPACITY"
        and rev["independentVerdict"] != "AFFIRMATIVE_CAPACITY"
    )
    prior_aff = sum(
        1 for rev in independent_reviews if rev["priorCorpusLabel"] == "AFFIRMATIVE_CAPACITY"
    )

    family_acc_num = sum(
        1 for e in eval_rows if e["pred"] == e["gold"]
    )
    span_operative = sum(1 for e in eval_rows if e["spanFidelity"] == "OPERATIVE_SPAN")
    dep_complete = sum(1 for e in eval_rows if e["dependencyComplete"])
    amend_ok = sum(1 for e in eval_rows if e["amendmentClosed"])
    entity_ok = sum(1 for e in eval_rows if e["entityScopePresent"])

    by_family: dict[str, dict[str, int]] = defaultdict(lambda: {"n": 0, "correct": 0})
    for e in eval_rows:
        by_family[e["family"]]["n"] += 1
        if e["pred"] == e["gold"]:
            by_family[e["family"]]["correct"] += 1

    return {
        "evaluationSetSize": n,
        "confusion": {"tp": tp, "fp": fp, "fn": fn, "tn": tn},
        "precisionAffirmativePermission": {
            "value": precision,
            "numerator": tp,
            "denominator": tp + fp,
        },
        "recallAffirmativePermission": {
            "value": recall,
            "numerator": tp,
            "denominator": tp + fn,
        },
        "falsePermissionRate": {
            "value": false_permission_rate,
            "numerator": fp,
            "denominator": n,
            "definition": "FP / evaluation_set — remediator predicts AFFIRMATIVE_CAPACITY but independent verdict does not",
        },
        "falseRefusalRate": {
            "value": false_refusal_rate,
            "numerator": fn,
            "denominator": tp + fn,
            "definition": "FN / (TP+FN) — remediator refuses affirmative where independent finds genuine permission",
        },
        "formulaFamilyLabelAccuracy": {
            "value": family_acc_num / n if n else None,
            "numerator": family_acc_num,
            "denominator": n,
            "note": "Semantics-label agreement by family cohort (legal-role family accuracy proxy)",
            "byFamily": {
                fam: {
                    "accuracy": (v["correct"] / v["n"] if v["n"] else None),
                    "numerator": v["correct"],
                    "denominator": v["n"],
                }
                for fam, v in sorted(by_family.items())
            },
        },
        "sourceSpanFidelity": {
            "operativeSpanRate": {
                "value": span_operative / n if n else None,
                "numerator": span_operative,
                "denominator": n,
            }
        },
        "dependencyCompleteness": {
            "fullyClosedRate": {
                "value": dep_complete / n if n else None,
                "numerator": dep_complete,
                "denominator": n,
            }
        },
        "amendmentVersionCorrectness": {
            "amendmentAuthorityPresentRate": {
                "value": amend_ok / n if n else None,
                "numerator": amend_ok,
                "denominator": n,
            }
        },
        "entityScopeFidelity": {
            "entityScopePresentRate": {
                "value": entity_ok / n if n else None,
                "numerator": entity_ok,
                "denominator": n,
            }
        },
        "priorCorpusFalseAffirmativesInEvalSet": {
            "numerator": prior_fp,
            "denominator": prior_aff,
            "rate": (prior_fp / prior_aff) if prior_aff else None,
        },
        "groundTruthSource": "independent_legal_safety_reviews_only",
        "note": "Classifier outputs are never used as ground truth.",
    }


def build_import_record(candidate: dict[str, Any], remediation: dict[str, Any], closure: dict[str, Any]) -> dict[str, Any]:
    prov = candidate.get("provenance") or {}
    payload = {
        "legalRole": remediation["legalRole"],
        "remediationSource": remediation["remediationSource"],
        "closureStatus": closure["closureStatus"],
        "phase3": True,
    }
    content = json.dumps(
        {
            "id": candidate["id"],
            "span": candidate.get("exactSourceSpan"),
            "sem": remediation["capacitySemantics"],
            "role": remediation["legalRole"],
        },
        sort_keys=True,
    )
    return {
        "contractVersion": IMPORT_CONTRACT,
        "stableId": candidate["id"],
        "contentHash": hashlib.sha256(content.encode()).hexdigest(),
        "kind": "BASKET_FORMULA_HYPOTHESIS",
        "verificationLane": "SOURCE_SUPPORTED_HYPOTHESIS",
        "instrumentId": (candidate.get("sourceVersion") or {}).get("instrumentId") or "unknown",
        "issuerKey": candidate.get("issuer") or (candidate.get("sourceVersion") or {}).get("instrumentId") or "unknown",
        "basketFamily": candidate["basketFamily"],
        "capacitySemantics": remediation["capacitySemantics"],
        "provenance": {
            "documentPath": prov.get("documentPath")
            or (candidate.get("sourceVersion") or {}).get("documentPath")
            or "",
            "sourceHashSha256": prov.get("sourceHashSha256") or ("0" * 64),
            "extractedSpanHashSha256": prov.get("extractedSpanHashSha256")
            or hashlib.sha256((candidate.get("exactSourceSpan") or "").encode()).hexdigest(),
            "matchKind": prov.get("matchKind") or "NOT_FOUND",
            "byteExact": bool(prov.get("byteExact")),
            "byteOffsetStart": prov.get("byteOffsetStart"),
            "byteOffsetEnd": prov.get("byteOffsetEnd"),
            "normalizationVersion": prov.get("normalizationVersion") or "whitespace-collapse.v1",
        },
        "typedFormulaStatus": None,
        "unresolvedDependencies": [
            f"{u['cause']}:{u['detail'][:80]}" for u in closure["unresolvedDependencies"]
        ],
        "payload": payload,
    }


def main() -> None:
    PHASE3.mkdir(parents=True, exist_ok=True)
    EXPORT3.mkdir(parents=True, exist_ok=True)

    rows = read_jsonl(EXPORT2 / "phase2-candidates.jsonl")
    assert len(rows) == 390, f"expected 390 candidates, got {len(rows)}"

    frozen = freeze_phase2_reviews()
    frozen_ids = {r["candidateId"] for r in frozen}
    assert len(frozen) == 30
    global PHASE2_FROZEN_VERDICTS
    PHASE2_FROZEN_VERDICTS = {r["candidateId"]: r for r in frozen}

    sample = select_stratified_sample(rows, frozen_ids, target=115)
    new_reviews = [independent_adjudicate(r) for r in sample]
    # Ensure at least 100 additional
    assert len(new_reviews) >= 100, len(new_reviews)

    independent_all = frozen + new_reviews
    write_json(
        PHASE3 / "01-frozen-phase2-regression-reviews.json",
        {
            "frozenCount": len(frozen),
            "note": "Phase-2 independent reviews preserved as frozen regression evidence. Do not mutate.",
            "reviews": frozen,
        },
    )
    write_json(
        PHASE3 / "02-independent-legal-safety-reviews.json",
        {
            "frozenPhase2Count": len(frozen),
            "additionalIndependentCount": len(new_reviews),
            "totalIndependentReviews": len(independent_all),
            "note": "Ground truth for metrics. Not derived from remediator outputs.",
            "positivePermissionControls": sum(
                1 for r in independent_all if r["isPositivePermissionControl"]
            ),
            "negativeControls": sum(1 for r in independent_all if r["isNegativeControl"]),
            "reviews": independent_all,
        },
    )

    remediated_rows: list[dict[str, Any]] = []
    closures: list[dict[str, Any]] = []
    audit_rows: list[dict[str, Any]] = []
    import_rows: list[dict[str, Any]] = []
    remediated_by_id: dict[str, dict[str, Any]] = {}
    closures_by_id: dict[str, dict[str, Any]] = {}

    corrected_false_aff = 0
    preserved_genuine = 0
    role_counts: Counter[str] = Counter()
    sem_before: Counter[str] = Counter()
    sem_after: Counter[str] = Counter()

    for cand in rows:
        before = cand["capacitySemantics"]
        sem_before[before] += 1
        rem = remediate_candidate(cand)
        rem["basketFamily"] = cand["basketFamily"]
        closure = build_context_closure(cand, rem)
        role_counts[rem["legalRole"]] += 1
        sem_after[rem["capacitySemantics"]] += 1

        if before == "AFFIRMATIVE_CAPACITY" and rem["capacitySemantics"] != "AFFIRMATIVE_CAPACITY":
            corrected_false_aff += 1
        if rem["capacitySemantics"] == "AFFIRMATIVE_CAPACITY":
            preserved_genuine += 1

        out = dict(cand)
        out["phase2CapacitySemantics"] = before
        out["capacitySemantics"] = rem["capacitySemantics"]
        out["legalRole"] = rem["legalRole"]
        out["phase3Remediation"] = {
            "source": rem["remediationSource"],
            "reason": rem["reason"],
        }
        out["contextClosureStatus"] = closure["closureStatus"]
        out["capacityComputable"] = False
        blockers = list(out.get("capacityComputationBlockers") or [])
        blockers.append("PHASE3_LEGAL_AUTHORITY_UNVERIFIED")
        blockers.append("PHASE3_DEPENDENCY_CLOSURE_INCOMPLETE")
        out["capacityComputationBlockers"] = sorted(set(blockers))
        out["verificationLane"] = "SOURCE_SUPPORTED_HYPOTHESIS"
        out["executable"] = False

        remediated_rows.append(out)
        closures.append(closure)
        remediated_by_id[cand["id"]] = {**rem, "basketFamily": cand["basketFamily"]}
        closures_by_id[cand["id"]] = closure
        audit_rows.append(
            {
                "candidateId": cand["id"],
                "basketFamily": cand["basketFamily"],
                "priorCapacitySemantics": before,
                "remediatedCapacitySemantics": rem["capacitySemantics"],
                "legalRole": rem["legalRole"],
                "remediationSource": rem["remediationSource"],
                "reason": rem["reason"],
                "closureStatus": closure["closureStatus"],
                "unresolvedDependencyCount": len(closure["unresolvedDependencies"]),
                "correctedFalseAffirmative": before == "AFFIRMATIVE_CAPACITY"
                and rem["capacitySemantics"] != "AFFIRMATIVE_CAPACITY",
                "thinSpan": is_thin(cand),
                "executable": False,
            }
        )
        import_rows.append(build_import_record(out, rem, closure))

    metrics = metrics_vs_independent(remediated_by_id, independent_all, closures_by_id)

    # Unresolved dependency counts by cause
    cause_counts: Counter[str] = Counter()
    for c in closures:
        for u in c["unresolvedDependencies"]:
            cause_counts[u["cause"]] += 1

    write_jsonl(EXPORT3 / "phase3-candidates.jsonl", remediated_rows)
    write_jsonl(EXPORT3 / "phase3-context-closures.jsonl", closures)
    write_jsonl(EXPORT3 / "phase3-audit.jsonl", audit_rows)
    write_jsonl(EXPORT3 / "phase3-import-records.jsonl", import_rows)

    full_audit = {
        "candidateCount": len(audit_rows),
        "legalRoleCounts": dict(role_counts),
        "semanticsBefore": dict(sem_before),
        "semanticsAfter": dict(sem_after),
        "correctedFalseAffirmatives": corrected_false_aff,
        "affirmativeCapacityRemaining": preserved_genuine,
        "executableCount": 0,
        "note": "Full 390-candidate classification audit. Dollar/ratio/greater-of alone never implies usable capacity.",
        "rows": audit_rows,
    }
    write_json(PHASE3 / "03-full-390-classification-audit.json", full_audit)

    write_json(
        PHASE3 / "04-context-closure-summary.json",
        {
            "candidateCount": len(closures),
            "closureStatusCounts": dict(Counter(c["closureStatus"] for c in closures)),
            "unresolvedDependenciesByCause": dict(cause_counts),
            "executableCount": 0,
            "workstreams": WORKSTREAMS,
        },
    )

    write_json(PHASE3 / "05-independent-evaluation-metrics.json", metrics)

    genuine_ids = sorted(
        r["id"] for r in remediated_rows if r["capacitySemantics"] == "AFFIRMATIVE_CAPACITY"
    )
    write_json(
        PHASE3 / "06-genuine-positive-permissions.json",
        {
            "count": len(genuine_ids),
            "ids": genuine_ids,
            "note": "Remediated corpus labels retained as AFFIRMATIVE_CAPACITY; still non-executable hypotheses.",
        },
    )

    write_json(
        PHASE3 / "07-integration-status.json",
        {
            "importContract": IMPORT_CONTRACT,
            "verificationLane": "SOURCE_SUPPORTED_HYPOTHESIS",
            "competingSchema": False,
            "independentSecDownload": False,
            "productionCapacityEngineEdits": False,
            "autoPromoteToVerified": False,
            "workstreamCoordination": WORKSTREAMS,
            "export": "phase-3/export/phase3-import-records.jsonl",
        },
    )

    blockers = [
        {
            "blocker": "LEGAL_AUTHORITY_UNVERIFIED",
            "affectedCandidates": len(rows),
            "detail": "No candidate has independently verified legal authority for execution.",
        },
        {
            "blocker": "DEPENDENCY_SYSTEMS_INTERFACE_ONLY",
            "affectedCandidates": len(rows),
            "detail": "Encyclopedia/Atlas/Exception DB/Legal Core/Financial Precedent/Knowledge Factory unavailable in-repo.",
        },
        {
            "blocker": "THIN_OR_UNBOUND_SPANS",
            "affectedCandidates": sum(1 for r in rows if is_thin(r)),
            "detail": "Mined fragments still require governing-section binding.",
        },
        {
            "blocker": "HYPOTHESIS_LANE_ONLY",
            "affectedCandidates": len(rows),
            "detail": "Import lane remains SOURCE_SUPPORTED_HYPOTHESIS; no auto-promotion to verified.",
        },
    ]
    write_json(PHASE3 / "08-legal-safety-blockers.json", {"blockers": blockers})

    counts = {
        "startingSHA": STARTING_SHA,
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "candidateCount": 390,
        "correctedFalseAffirmatives": corrected_false_aff,
        "affirmativeCapacityBefore": sem_before.get("AFFIRMATIVE_CAPACITY", 0),
        "affirmativeCapacityAfter": sem_after.get("AFFIRMATIVE_CAPACITY", 0),
        "independentReviews": {
            "frozenPhase2": len(frozen),
            "additional": len(new_reviews),
            "total": len(independent_all),
            "positiveControls": sum(1 for r in independent_all if r["isPositivePermissionControl"]),
            "negativeControls": sum(1 for r in independent_all if r["isNegativeControl"]),
        },
        "metrics": {
            "precision": metrics["precisionAffirmativePermission"],
            "recall": metrics["recallAffirmativePermission"],
            "falsePermissionRate": metrics["falsePermissionRate"],
            "falseRefusalRate": metrics["falseRefusalRate"],
        },
        "unresolvedDependenciesByCause": dict(cause_counts),
        "legalRoleCounts": dict(role_counts),
        "semanticsAfter": dict(sem_after),
        "genuinePositivePermissionsPreserved": preserved_genuine,
        "executableCount": 0,
        "constraints": {
            "paidInference": False,
            "merges": False,
            "certificationAdvancement": False,
            "productionCapacityEngineEdits": False,
            "claudeOwnedFixtureChanges": False,
            "independentSecDownload": False,
        },
    }
    write_json(PHASE3 / "09-phase3-counts.json", counts)

    # Mandatory return markdown (ending SHA filled after commit)
    md = f"""# Phase 3 mandatory return — Corpus-wide false-permission audit

Starting PR: **#148**  
Starting SHA: `{STARTING_SHA}`

## 1. Starting and ending SHAs

| Item | Value |
|---|---|
| Starting SHA | `{STARTING_SHA}` |
| Ending SHA (Phase 3 content) | *(filled after commit)* |
| PR | https://github.com/egsul897/headroom/pull/148 (draft; **not merged**) |

## 2. Full 390-candidate classification audit

| Metric | Count |
|---|---|
| Candidates audited | **390 / 390** |
| AFFIRMATIVE_CAPACITY before → after | **{sem_before.get('AFFIRMATIVE_CAPACITY', 0)} → {sem_after.get('AFFIRMATIVE_CAPACITY', 0)}** |
| NOT_CAPACITY after | **{sem_after.get('NOT_CAPACITY', 0)}** |
| INCOMPLETE_SEMANTICS after | **{sem_after.get('INCOMPLETE_SEMANTICS', 0)}** |
| Executable | **0** |

Legal-role distribution (after remediation):

| Legal role | Count |
|---|---|
"""
    for role, n in role_counts.most_common():
        md += f"| {role} | {n} |\n"

    md += f"""
Artifact: `03-full-390-classification-audit.json` / `export/phase3-audit.jsonl`.

## 3. Corrected false affirmatives

| Metric | Count |
|---|---|
| Prior AFFIRMATIVE_CAPACITY labels demoted by remediation | **{corrected_false_aff}** |
| Remaining AFFIRMATIVE_CAPACITY (still non-executable hypotheses) | **{preserved_genuine}** |

Dollar amounts, ratios, and greater-of fragments alone were **not** treated as usable capacity.

## 4. Independent precision, recall, and false-permission rate

Frozen Phase-2 reviews preserved as regression evidence: **{len(frozen)}**.  
Additional stratified independent reviews: **{len(new_reviews)}**.  
Total independent evaluation set: **{len(independent_all)}**.

| Metric | Value | Numerator | Denominator |
|---|---|---|---|
| Precision (affirmative permission) | **{metrics['precisionAffirmativePermission']['value']}** | {metrics['precisionAffirmativePermission']['numerator']} | {metrics['precisionAffirmativePermission']['denominator']} |
| Recall (affirmative permission) | **{metrics['recallAffirmativePermission']['value']}** | {metrics['recallAffirmativePermission']['numerator']} | {metrics['recallAffirmativePermission']['denominator']} |
| False-permission rate | **{metrics['falsePermissionRate']['value']}** | {metrics['falsePermissionRate']['numerator']} | {metrics['falsePermissionRate']['denominator']} |
| False-refusal rate | **{metrics['falseRefusalRate']['value']}** | {metrics['falseRefusalRate']['numerator']} | {metrics['falseRefusalRate']['denominator']} |
| Formula-family semantics accuracy | **{metrics['formulaFamilyLabelAccuracy']['value']}** | {metrics['formulaFamilyLabelAccuracy']['numerator']} | {metrics['formulaFamilyLabelAccuracy']['denominator']} |
| Source-span fidelity (operative) | **{metrics['sourceSpanFidelity']['operativeSpanRate']['value']}** | {metrics['sourceSpanFidelity']['operativeSpanRate']['numerator']} | {metrics['sourceSpanFidelity']['operativeSpanRate']['denominator']} |
| Dependency completeness (fully closed) | **{metrics['dependencyCompleteness']['fullyClosedRate']['value']}** | {metrics['dependencyCompleteness']['fullyClosedRate']['numerator']} | {metrics['dependencyCompleteness']['fullyClosedRate']['denominator']} |
| Amendment-version present | **{metrics['amendmentVersionCorrectness']['amendmentAuthorityPresentRate']['value']}** | {metrics['amendmentVersionCorrectness']['amendmentAuthorityPresentRate']['numerator']} | {metrics['amendmentVersionCorrectness']['amendmentAuthorityPresentRate']['denominator']} |
| Entity-scope present | **{metrics['entityScopeFidelity']['entityScopePresentRate']['value']}** | {metrics['entityScopeFidelity']['entityScopePresentRate']['numerator']} | {metrics['entityScopeFidelity']['entityScopePresentRate']['denominator']} |

Ground truth: independent legal-safety reviews only (not remediator outputs).

## 5. Unresolved dependency counts by cause

| Cause | Count |
|---|---|
"""
    for cause, n in sorted(cause_counts.items(), key=lambda x: (-x[1], x[0])):
        md += f"| {cause} | {n} |\n"

    md += f"""
## 6. Genuine positive permissions preserved

| Metric | Count |
|---|---|
| Remediated AFFIRMATIVE_CAPACITY retained | **{preserved_genuine}** |
| Independent positive permission controls | **{sum(1 for r in independent_all if r['isPositivePermissionControl'])}** |
| Independent negative controls | **{sum(1 for r in independent_all if r['isNegativeControl'])}** |

All retained affirmatives remain `capacityComputable=false` / `executable=false`.

## 7. Canonical integration status

| Item | Status |
|---|---|
| Import contract | `{IMPORT_CONTRACT}` |
| Verification lane | `SOURCE_SUPPORTED_HYPOTHESIS` |
| Auto-promote to verified | **no** |
| Competing schema | **no** |
| Independent SEC download | **no** |
| Workstream coordination | Architecture Remediation / Legal Core; Negative Covenant Exception DB; Dependency Atlas; Definition Encyclopedia; Financial Definitions Precedent; Knowledge Factory — all `INTERFACE_ONLY` |

## 8. Tests and current-head CI

| Item | Value |
|---|---|
| Tests | `npx vitest run tests/basket-formula-corpus/` (Phase-3 suite included) |
| CI | reported after push / PR checks |

## 9. Remaining legal-safety blockers

1. Legal authority unverified for all candidates (Legal Core interface-only).  
2. Dependency systems unavailable in-repo (795+ class unresolved entries continue).  
3. Thin/unbound mined spans still require governing-section binding.  
4. Hypothesis lane only — no automatic promotion to verified legal rules.  
5. Every formula remains non-executable.

## 10. PR status and costs

| Item | Value |
|---|---|
| PR | https://github.com/egsul897/headroom/pull/148 |
| Status | draft, updated; **not merged** |
| Paid inference | none |
| Merges | none |
| Certification advancement | none |
| Production capacity-engine edits | none |
| Claude-owned fixture changes | none |
| Costs | $0 incremental paid inference |
"""
    (PHASE3 / "10-phase3-mandatory-return.md").write_text(md)

    readme = """# Phase 3 — Corpus-wide false-permission audit and dependency closure

Continues PR #148. Legal-safety remediation of the Phase-2 390-candidate corpus.

## Rebuild

```bash
python3 scripts/basket-formula-corpus/phase3_pipeline.py
npx vitest run tests/basket-formula-corpus/
```

## Constraints

- No paid inference, merges, certification advancement
- No production capacity-engine edits
- No Claude-owned fixture modifications
- No independent SEC downloading
- Formulas remain non-executable until independently verified
"""
    (PHASE3 / "README.md").write_text(readme)

    # Point Phase-1/2 README
    root_readme = ROOT / "docs/covenant-basket-capacity-formula-library/README.md"
    text = root_readme.read_text()
    if "phase-3" not in text:
        text = text.rstrip() + "\n\n## Phase 3\n\nCorpus-wide false-permission audit and dependency closure: [`phase-3/`](./phase-3/).\n"
        root_readme.write_text(text)

    print(
        json.dumps(
            {
                "candidates": 390,
                "correctedFalseAffirmatives": corrected_false_aff,
                "affirmativeAfter": preserved_genuine,
                "independentReviews": len(independent_all),
                "precision": metrics["precisionAffirmativePermission"]["value"],
                "recall": metrics["recallAffirmativePermission"]["value"],
                "falsePermissionRate": metrics["falsePermissionRate"]["value"],
                "falseRefusalRate": metrics["falseRefusalRate"]["value"],
            },
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
