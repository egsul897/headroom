#!/usr/bin/env python3
"""Generate NCEDB Phase 2 catalog, negative controls, acquisition plan, quality metrics.

Deterministic / offline. No paid inference. Does not touch lib/contract-model.
"""
from __future__ import annotations

import hashlib
import json
import re
from pathlib import Path

ROOT = Path("/workspace")
OUT = ROOT / "docs/negative-covenant-exception-database/phase-2"
DATASET_VERSION = "ncedb.phase2.v1"

SOURCES = {
    "conmed": {
        "issuerKey": "CNMD",
        "issuerName": "CONMED Corporation",
        "issuerTicker": "CNMD",
        "issuerCik": "0000816956",
        "documentKind": "CREDIT_AGREEMENT",
        "path": "tests/fixtures/unseen-packages/conmed-2025-credit-facility/curated/base-credit-agreement-article-vii-negative-covenants.txt",
    },
    "lsb": {
        "issuerKey": "LXU",
        "issuerName": "LSB Industries, Inc.",
        "issuerTicker": "LXU",
        "issuerCik": "0000060714",
        "documentKind": "CREDIT_AGREEMENT",
        "path": "tests/fixtures/unseen-packages/lsb-2023-abl-credit-agreement/article-6-negative-covenants.txt",
    },
    "fwrg": {
        "issuerKey": "FWRG",
        "issuerName": "First Watch Restaurant Group, Inc.",
        "issuerTicker": "FWRG",
        "issuerCik": "0001789940",
        "documentKind": "CREDIT_AGREEMENT",
        "path": "tests/fixtures/unseen-packages/fwrg-2021-credit-agreement/article-6-negative-covenants.txt",
    },
    "chwy": {
        "issuerKey": "CHWY",
        "issuerName": "Chewy, Inc.",
        "issuerTicker": "CHWY",
        "issuerCik": "0001766502",
        "documentKind": "CREDIT_AGREEMENT",
        "path": "tests/fixtures/unseen-packages/chwy-2026-credit-agreement/extracted-text/doc-a-2026-06-23-credit-agreement.txt",
    },
    "gibraltar": {
        "issuerKey": "ROCK",
        "issuerName": "Gibraltar Industries, Inc.",
        "issuerTicker": "ROCK",
        "issuerCik": "0000912562",
        "documentKind": "CREDIT_AGREEMENT",
        "path": "tests/fixtures/unseen-packages/gibraltar-2026-credit-agreement/extracted-text/credit-agreement.txt",
    },
    "dsgr": {
        "issuerKey": "DSGR",
        "issuerName": "Distribution Solutions Group, Inc.",
        "issuerTicker": "DSGR",
        "issuerCik": "0000703604",
        "documentKind": "RESTATEMENT",
        "path": "tests/fixtures/unseen-packages/dsgr-2022-2025-credit-facility/extracted-text/doc-d-2025-second-amended-restated-credit-agreement.txt",
    },
    "dsgr_amd4": {
        "issuerKey": "DSGR",
        "issuerName": "Distribution Solutions Group, Inc.",
        "issuerTicker": "DSGR",
        "issuerCik": "0000703604",
        "documentKind": "AMENDMENT",
        "path": "tests/fixtures/unseen-packages/dsgr-2022-2025-credit-facility/extracted-text/doc-c-2025-fourth-amendment.txt",
    },
    "riot": {
        "issuerKey": "RIOT",
        "issuerName": "Riot Platforms, Inc.",
        "issuerTicker": "RIOT",
        "issuerCik": "0001167419",
        "documentKind": "RESTATEMENT",
        "path": "tests/fixtures/unseen-packages/riot-2025-2026-credit-facility/extracted-text/doc-c-2026-04-21-second-amended-restated-credit-agreement.txt",
    },
    "sup": {
        "issuerKey": "SUP",
        "issuerName": "Superior Industries International, Inc.",
        "issuerTicker": "SUP",
        "issuerCik": "0000095552",
        "documentKind": "RESTATEMENT",
        "path": "tests/fixtures/unseen-packages/final-lightweight-unseen-sup/extracted-text/doc-b-2024-08-14-amended-restated-term-loan-credit-agreement.txt",
    },
    "sup_amd": {
        "issuerKey": "SUP",
        "issuerName": "Superior Industries International, Inc.",
        "issuerTicker": "SUP",
        "issuerCik": "0000095552",
        "documentKind": "AMENDMENT",
        "path": "tests/fixtures/unseen-packages/final-lightweight-unseen-sup/extracted-text/doc-c-2025-03-31-first-amendment.txt",
    },
    "riot_orig": {
        "issuerKey": "RIOT",
        "issuerName": "Riot Platforms, Inc.",
        "issuerTicker": "RIOT",
        "issuerCik": "0001167419",
        "documentKind": "CREDIT_AGREEMENT",
        "path": "tests/fixtures/unseen-packages/riot-2025-2026-credit-facility/extracted-text/doc-a-2025-04-22-credit-agreement.txt",
    },
    "dsgr_2022": {
        "issuerKey": "DSGR",
        "issuerName": "Distribution Solutions Group, Inc.",
        "issuerTicker": "DSGR",
        "issuerCik": "0000703604",
        "documentKind": "CREDIT_AGREEMENT",
        "path": "tests/fixtures/unseen-packages/dsgr-2022-2025-credit-facility/extracted-text/doc-a-2022-amended-restated-credit-agreement.txt",
    },
}


def sha256_file(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).digest().hex() if False else hashlib.sha256(path.read_bytes()).hexdigest()


def load_text(rel: str) -> tuple[str, str]:
    p = ROOT / rel
    data = p.read_bytes()
    # Prefer utf-8; fall back
    try:
        text = data.decode("utf-8")
    except UnicodeDecodeError:
        text = data.decode("utf-8", errors="replace")
    return text, hashlib.sha256(data).hexdigest()


def find_span(text: str, needle: str, source_path: str, source_sha: str) -> dict:
    idx = text.find(needle)
    status = "EXACT"
    if idx < 0:
        # normalize whitespace collapse
        norm_map = []
        buf = []
        for i, ch in enumerate(text):
            if ch.isspace():
                if buf and buf[-1] != " ":
                    buf.append(" ")
                    norm_map.append(i)
            else:
                buf.append(ch)
                norm_map.append(i)
        norm = "".join(buf)
        needle_n = re.sub(r"\s+", " ", needle.strip())
        j = norm.find(needle_n)
        if j >= 0:
            start = norm_map[j]
            end = norm_map[min(j + len(needle_n) - 1, len(norm_map) - 1)] + 1
            return {
                "sourcePath": source_path,
                "sourceSha256": source_sha,
                "charStart": start,
                "charEnd": end,
                "exactText": text[start:end],
                "matchStatus": "NORMALIZED_WHITESPACE",
            }
        return {
            "sourcePath": source_path,
            "sourceSha256": source_sha,
            "charStart": -1,
            "charEnd": -1,
            "exactText": needle,
            "matchStatus": "UNRESOLVED",
        }
    return {
        "sourcePath": source_path,
        "sourceSha256": source_sha,
        "charStart": idx,
        "charEnd": idx + len(needle),
        "exactText": needle,
        "matchStatus": status,
    }


def identity(src_key: str, sha: str) -> dict:
    meta = SOURCES[src_key]
    material = f"{meta['issuerKey'].lower()}|{meta['documentKind']}|{sha.lower()}|{meta['path']}"
    digest = hashlib.sha256(material.encode()).hexdigest()[:24]
    return {
        "sourceIdentityKey": f"ncedb-src:{meta['issuerKey']}:{digest}",
        "issuerKey": meta["issuerKey"],
        "issuerName": meta["issuerName"],
        "issuerTicker": meta.get("issuerTicker"),
        "issuerCik": meta.get("issuerCik"),
        "documentKind": meta["documentKind"],
        "sourcePath": meta["path"],
        "sourceSha256": sha,
    }


def cond(cid, text, location, location_ref, hint, span=None):
    return {
        "conditionId": cid,
        "text": text,
        "location": location,
        "locationRef": location_ref,
        "computableHint": hint,
        "sourceSpan": span,
    }


def record(**kwargs):
    kwargs.setdefault("datasetVersion", DATASET_VERSION)
    kwargs.setdefault("unconditionalCapacity", False)
    kwargs.setdefault("provisoAttachment", [])
    kwargs.setdefault("financialTests", [])
    kwargs.setdefault("amountsAndRatios", [])
    kwargs.setdefault("sharedCapacityRestrictions", [])
    kwargs.setdefault("amendmentAuthority", [{"documentRef": "base", "effect": "none noted", "status": "NONE_NOTED"}])
    kwargs.setdefault("unresolvedControllingSources", [])
    kwargs.setdefault("crossReferences", [])
    kwargs.setdefault("remoteConstraintFlags", [])
    kwargs.setdefault("definedTerms", [])
    kwargs.setdefault("localConditions", [])
    kwargs.setdefault("remoteConditions", [])
    kwargs.setdefault("isNegativeControl", False)
    return kwargs


# ---------------------------------------------------------------------------
# Load source texts
# ---------------------------------------------------------------------------
TEXTS = {}
SHAS = {}
for k, meta in SOURCES.items():
    t, h = load_text(meta["path"])
    TEXTS[k] = t
    SHAS[k] = h

records: list[dict] = []
span_failures: list[dict] = []


def add(rec: dict):
    for span_key in ("exceptionSourceSpan",):
        sp = rec.get(span_key)
        if sp and sp.get("matchStatus") == "UNRESOLVED":
            span_failures.append({"exceptionId": rec["exceptionId"], "field": span_key, "needlePreview": rec.get("exactExceptionText", "")[:80]})
    parent_span = rec.get("parentProhibition", {}).get("sourceSpan")
    if parent_span and parent_span.get("matchStatus") == "UNRESOLVED":
        span_failures.append({"exceptionId": rec["exceptionId"], "field": "parentProhibition.sourceSpan"})
    # enforce exact text == span text when resolved
    sp = rec["exceptionSourceSpan"]
    if sp["matchStatus"] == "EXACT":
        rec["exactExceptionText"] = sp["exactText"]
    records.append(rec)


# ===========================================================================
# PHASE-1 sources — reclassified (not mere remote-flag inflation)
# ===========================================================================

# CONMED 7.2(a) — categorical Loan Document debt; no local money/ratio
needle = "Indebtedness of any Loan Party pursuant to any Loan Document;"
parent = "Create, incur, assume or suffer to exist any Indebtedness, except:"
chapeau = "the Parent Borrower shall not, and shall not permit any of its Subsidiaries to, directly or indirectly:"
add(record(
    exceptionId="conmed-7.2-a-loan-document-debt",
    sourceIdentity=identity("conmed", SHAS["conmed"]),
    covenantFamily="DEBT_INCURRENCE",
    permissionClassification="UNCONDITIONAL_SOURCE_VERIFIED",
    classificationRationale="Source states a categorical exception with no local dollar, ratio, or default gate; entity/instrument scope is definitional (Loan Party / Loan Document). Label is NOT a production capacity approval.",
    parentProhibition={"sectionRef": "7.2", "paraphraseSummary": "General Indebtedness prohibition with enumerated exceptions.", "sourceSpan": find_span(TEXTS["conmed"], parent, SOURCES["conmed"]["path"], SHAS["conmed"])},
    articleOrSectionChapeau={"paraphraseSummary": "Article VII chapeau binds Parent Borrower and Subsidiaries.", "sourceSpan": find_span(TEXTS["conmed"], chapeau, SOURCES["conmed"]["path"], SHAS["conmed"])},
    exceptionSectionRef="7.2(a)",
    exactExceptionText=needle,
    exceptionSourceSpan=find_span(TEXTS["conmed"], needle, SOURCES["conmed"]["path"], SHAS["conmed"]),
    paraphraseSummary="Permits Indebtedness of Loan Parties under Loan Documents without a local quantitative ceiling.",
    structuralHierarchy=["Article VII", "Section 7.2", "Section 7.2(a)"],
    definedTerms=["Loan Party", "Loan Document", "Indebtedness"],
    localConditions=[],
    remoteConditions=[
        cond("r1", chapeau, "ARTICLE_LEVEL", "Article VII chapeau", "ENTITY", find_span(TEXTS["conmed"], chapeau, SOURCES["conmed"]["path"], SHAS["conmed"])),
        cond("r2", "Loan Party / Loan Document definitional scope", "DEFINED_TERM", "Loan Party / Loan Document", "ENTITY", None),
    ],
    entityScope={"includes": ["Loan Party"], "excludes": [], "notes": "Instrument must be a Loan Document.", "sourceSpan": None},
    verificationStatus="SOURCE_VERIFIED",
    notes="Local-condition count is zero for economics; definitional scope recorded under remote/defined-term fields.",
    crossReferences=[{"targetRef": "Loan Document", "role": "instrument scope", "existenceCheck": "PRESENT_IN_DEFINITIONS_EXCERPT"}],
))

# CONMED 7.2(d) — local greater-of + article chapeau
needle = (
    "Finance Lease Obligations in an aggregate principal amount not to exceed the greater of (x) $50,000,000 and (y) 3.0% of Consolidated "
    "Total Assets (measured on the date of incurrence of such Finance Lease Obligations) at any one time outstanding;"
)
add(record(
    exceptionId="conmed-7.2-d-finance-leases-local-greater-of",
    sourceIdentity=identity("conmed", SHAS["conmed"]),
    covenantFamily="DEBT_INCURRENCE",
    permissionClassification="CONDITIONAL",
    classificationRationale="Local greater-of aggregate outstanding cap is in the exception clause; Article VII chapeau is separate entity-scope remote context.",
    parentProhibition={"sectionRef": "7.2", "paraphraseSummary": "General Indebtedness prohibition.", "sourceSpan": find_span(TEXTS["conmed"], parent, SOURCES["conmed"]["path"], SHAS["conmed"])},
    articleOrSectionChapeau={"paraphraseSummary": "Article VII chapeau.", "sourceSpan": find_span(TEXTS["conmed"], chapeau, SOURCES["conmed"]["path"], SHAS["conmed"])},
    exceptionSectionRef="7.2(d)",
    exactExceptionText=needle,
    exceptionSourceSpan=find_span(TEXTS["conmed"], needle, SOURCES["conmed"]["path"], SHAS["conmed"]),
    paraphraseSummary="Finance leases capped at greater of $50mm and 3% CTA.",
    structuralHierarchy=["Article VII", "Section 7.2", "Section 7.2(d)"],
    definedTerms=["Finance Lease Obligations", "Consolidated Total Assets"],
    localConditions=[cond("l1", "greater of $50,000,000 and 3.0% Consolidated Total Assets at any one time outstanding", "IN_EXCEPTION_CLAUSE", "7.2(d)", "MONEY", None)],
    remoteConditions=[cond("r1", chapeau, "ARTICLE_LEVEL", "Article VII chapeau", "ENTITY", find_span(TEXTS["conmed"], chapeau, SOURCES["conmed"]["path"], SHAS["conmed"]))],
    amountsAndRatios=[{"kind": "FIXED_MONEY", "value": "$50,000,000"}, {"kind": "PERCENT_OF", "value": "3.0%", "measurementBasis": "Consolidated Total Assets"}],
    entityScope={"includes": ["Parent Borrower", "Subsidiaries"], "excludes": [], "sourceSpan": find_span(TEXTS["conmed"], chapeau, SOURCES["conmed"]["path"], SHAS["conmed"])},
    financialTests=[],
    sharedCapacityRestrictions=[{"kind": "CLASSIFY_RECLASSIFY", "description": "Subject to 7.2 trailing classify/reclassify", "relatedRefs": ["7.2 trailing"]}],
    verificationStatus="SOURCE_VERIFIED",
    notes="Example of genuinely local quantitative conditions (not remote-only).",
))

# CONMED 7.2(c) — remote cross-section
needle = (
    "Indebtedness secured by Liens permitted by Section 7.3(g); provided that the Parent Borrower shall be in compliance, on "
    "a pro forma basis after giving effect to the incurrence of such Indebtedness, with the financial covenants contained in Section "
    "7.1 recomputed as at the last day of the most recently ended fiscal quarter of the Parent Borrower and its Subsidiaries for which financial "
    "statements are available as if such Indebtedness had been incurred on the first day of each relevant period for testing such compliance;"
)
add(record(
    exceptionId="conmed-7.2-c-remote-lien-and-7.1",
    sourceIdentity=identity("conmed", SHAS["conmed"]),
    covenantFamily="DEBT_INCURRENCE",
    permissionClassification="CONDITIONAL",
    classificationRationale="Usable only if §7.3(g) Liens available and §7.1 financial covenants met pro forma — both outside the local exception economics.",
    parentProhibition={"sectionRef": "7.2", "paraphraseSummary": "General Indebtedness prohibition.", "sourceSpan": find_span(TEXTS["conmed"], parent, SOURCES["conmed"]["path"], SHAS["conmed"])},
    articleOrSectionChapeau={"paraphraseSummary": "Article VII chapeau.", "sourceSpan": find_span(TEXTS["conmed"], chapeau, SOURCES["conmed"]["path"], SHAS["conmed"])},
    exceptionSectionRef="7.2(c)",
    exactExceptionText=needle,
    exceptionSourceSpan=find_span(TEXTS["conmed"], needle, SOURCES["conmed"]["path"], SHAS["conmed"]),
    paraphraseSummary="Secured debt tied to 7.3(g) liens and pro forma 7.1 compliance.",
    structuralHierarchy=["Article VII", "Section 7.2", "Section 7.2(c)"],
    definedTerms=["Indebtedness", "Liens"],
    localConditions=[],
    remoteConditions=[
        cond("r1", "secured by Liens permitted by Section 7.3(g)", "CROSS_REFERENCED_SECTION", "7.3(g)", "OTHER_RULE", None),
        cond("r2", "pro forma compliance with Section 7.1 financial covenants", "CROSS_REFERENCED_SECTION", "7.1", "RATIO", None),
    ],
    provisoAttachment=[{"text": "provided that ... compliance ... Section 7.1", "attachment": "OWN_CLAUSE", "scopeNote": "Proviso points outside clause.", "sourceSpan": None}],
    entityScope={"includes": ["Parent Borrower", "Subsidiaries"], "excludes": [], "sourceSpan": None},
    financialTests=[{"testId": "ft1", "description": "Section 7.1 covenants on pro forma basis", "ratioOrAmount": "Section 7.1 suite", "sourceSpan": None}],
    crossReferences=[
        {"targetRef": "7.3(g)", "role": "lien prerequisite", "existenceCheck": "PRESENT_IN_SOURCE"},
        {"targetRef": "7.1", "role": "financial covenant gate", "existenceCheck": "PRESENT_IN_SOURCE"},
    ],
    remoteConstraintFlags=[{"kind": "CROSS_SECTION_CONDITION", "description": "Depends on 7.3(g) and 7.1"}],
    verificationStatus="SOURCE_VERIFIED",
    notes="Remote-condition exemplar.",
))

# CONMED 7.2 trailing — NOT permission
needle = (
    "For purposes of determining compliance with this Section 7.2, (A) Indebtedness need not be permitted solely by reference to one category of permitted Indebtedness described in Section "
    "7.2(a) through (s) but may be permitted in part under any combination thereof and (B) in the event that an item of Indebtedness (or any portion thereof) meets the criteria of one or more of the categories of permitted Indebtedness described in Sections 7.2(a) through (s), "
    "the Parent Borrower shall, in its sole discretion, classify or reclassify, or later divide, classify or reclassify, such item of Indebtedness "
    "(or any portion thereof) in any manner that complies with this Section 7.2 and will only be required to include the amount and type of "
    "such item of Indebtedness (or any portion thereof) in one of the above clauses and such item of Indebtedness shall be treated as having "
    "been incurred or existing pursuant to only one of such clauses."
)
add(record(
    exceptionId="conmed-7.2-trailing-classify-not-permission",
    sourceIdentity=identity("conmed", SHAS["conmed"]),
    covenantFamily="NOT_AN_EXCEPTION",
    permissionClassification="NOT_AN_AFFIRMATIVE_PERMISSION",
    classificationRationale="Classify/reclassify compliance mechanics are not an affirmative permission basket.",
    parentProhibition={"sectionRef": "7.2", "paraphraseSummary": "General Indebtedness prohibition.", "sourceSpan": find_span(TEXTS["conmed"], parent, SOURCES["conmed"]["path"], SHAS["conmed"])},
    articleOrSectionChapeau={"paraphraseSummary": "Article VII chapeau.", "sourceSpan": find_span(TEXTS["conmed"], chapeau, SOURCES["conmed"]["path"], SHAS["conmed"])},
    exceptionSectionRef="7.2 trailing paragraph",
    exactExceptionText=needle,
    exceptionSourceSpan=find_span(TEXTS["conmed"], needle, SOURCES["conmed"]["path"], SHAS["conmed"]),
    paraphraseSummary="Section-wide classify/reclassify authority among 7.2 baskets.",
    structuralHierarchy=["Article VII", "Section 7.2", "trailing compliance paragraph"],
    sharedCapacityRestrictions=[{"kind": "CLASSIFY_RECLASSIFY", "description": "Reallocation among existing baskets only", "relatedRefs": ["7.2(a)", "7.2(s)"]}],
    entityScope={"includes": ["Parent Borrower"], "excludes": [], "sourceSpan": None},
    verificationStatus="SOURCE_VERIFIED",
    notes="Negative-control class: not an affirmative permission.",
    isNegativeControl=True,
    negativeControlClass="NUMERIC_THRESHOLD_NOT_PERMISSION",
))

# CONMED 7.1(a) — financial covenant threshold, not exception permission
needle = (
    "Permit the Consolidated Senior Secured Leverage Ratio as at the last day of "
    "any period of four consecutive fiscal quarters of the Parent Borrower and its Subsidiaries ending on or after the Closing Date to exceed "
    "3.75 to 1.00."
)
add(record(
    exceptionId="conmed-7.1-a-csslr-threshold-not-permission",
    sourceIdentity=identity("conmed", SHAS["conmed"]),
    covenantFamily="NOT_AN_EXCEPTION",
    permissionClassification="NOT_AN_AFFIRMATIVE_PERMISSION",
    classificationRationale="Maintenance financial covenant threshold; does not grant Indebtedness/RP/Investment permission.",
    parentProhibition={"sectionRef": "7.1(a)", "paraphraseSummary": "CSSLR maintenance covenant.", "sourceSpan": find_span(TEXTS["conmed"], needle, SOURCES["conmed"]["path"], SHAS["conmed"])},
    articleOrSectionChapeau={"paraphraseSummary": "Article VII chapeau.", "sourceSpan": find_span(TEXTS["conmed"], chapeau, SOURCES["conmed"]["path"], SHAS["conmed"])},
    exceptionSectionRef="7.1(a)",
    exactExceptionText=needle,
    exceptionSourceSpan=find_span(TEXTS["conmed"], needle, SOURCES["conmed"]["path"], SHAS["conmed"]),
    paraphraseSummary="CSSLR must not exceed 3.75:1.00.",
    structuralHierarchy=["Article VII", "Section 7.1", "Section 7.1(a)"],
    definedTerms=["Consolidated Senior Secured Leverage Ratio"],
    amountsAndRatios=[{"kind": "RATIO", "value": "3.75 to 1.00"}],
    financialTests=[{"testId": "csslr", "description": "Consolidated Senior Secured Leverage Ratio ceiling", "ratioOrAmount": "3.75 to 1.00", "sourceSpan": None}],
    entityScope={"includes": ["Parent Borrower and Subsidiaries"], "excludes": [], "sourceSpan": None},
    verificationStatus="SOURCE_VERIFIED",
    isNegativeControl=True,
    negativeControlClass="NUMERIC_THRESHOLD_NOT_PERMISSION",
    notes="Negative control: numeric threshold ≠ permission.",
))

# LSB 6.01(i) local greater-of
parent_lsb = "Create, incur, assume, permit, guarantee, or otherwise become or remain, directly or indirectly, liable with respect to any Indebtedness;"
# Use a shorter unique parent fragment present in file
parent_lsb = "The foregoing limitation shall not apply to:"
needle = (
    "other Indebtedness in an aggregate principal amount outstanding at any time not to exceed the greater of $70,000,000 and "
    "5.5% of the total consolidated assets of the Loan Parties and their Subsidiaries as reflected on their balance sheet in accordance with GAAP;"
)
add(record(
    exceptionId="lsb-6.01-i-local-greater-of",
    sourceIdentity=identity("lsb", SHAS["lsb"]),
    covenantFamily="DEBT_INCURRENCE",
    permissionClassification="CONDITIONAL",
    classificationRationale="Local greater-of cap in the exception clause; Payment Conditions do NOT apply to this enumerated basket.",
    parentProhibition={"sectionRef": "6.01", "paraphraseSummary": "Indebtedness limitation with chapeau ratio gate and enumerated exceptions.", "sourceSpan": find_span(TEXTS["lsb"], parent_lsb, SOURCES["lsb"]["path"], SHAS["lsb"])},
    articleOrSectionChapeau={"paraphraseSummary": "Article VI duration chapeau.", "sourceSpan": None},
    exceptionSectionRef="6.01(i)",
    exactExceptionText=needle,
    exceptionSourceSpan=find_span(TEXTS["lsb"], needle, SOURCES["lsb"]["path"], SHAS["lsb"]),
    paraphraseSummary="General debt basket: greater of $70mm and 5.5% consolidated assets.",
    structuralHierarchy=["Article VI", "Section 6.01", "Section 6.01(i)"],
    localConditions=[cond("l1", "greater of $70,000,000 and 5.5% total consolidated assets", "IN_EXCEPTION_CLAUSE", "6.01(i)", "MONEY", None)],
    remoteConditions=[],
    amountsAndRatios=[{"kind": "FIXED_MONEY", "value": "$70,000,000"}, {"kind": "PERCENT_OF", "value": "5.5%", "measurementBasis": "total consolidated assets"}],
    entityScope={"includes": ["Loan Parties and Subsidiaries"], "excludes": [], "sourceSpan": None},
    verificationStatus="SOURCE_VERIFIED",
    notes="Local-only economic conditions exemplar (no Payment Conditions on this limb).",
))

# LSB 6.11(c) remote Payment Conditions
needle = "Restricted Payments so long as the Payment Conditions are satisfied with respect to each such Restricted Payment;"
parent_rp = "provided , that the foregoing shall not prohibit any of the following:"
add(record(
    exceptionId="lsb-6.11-c-remote-payment-conditions",
    sourceIdentity=identity("lsb", SHAS["lsb"]),
    covenantFamily="RESTRICTED_PAYMENTS",
    permissionClassification="CONDITIONAL",
    classificationRationale="No local quantum; sole gate is remote defined term Payment Conditions.",
    parentProhibition={"sectionRef": "6.11", "paraphraseSummary": "Restricted Payments prohibition with enumerated exceptions.", "sourceSpan": find_span(TEXTS["lsb"], parent_rp, SOURCES["lsb"]["path"], SHAS["lsb"])},
    articleOrSectionChapeau={"paraphraseSummary": "Article VI chapeau.", "sourceSpan": None},
    exceptionSectionRef="6.11(c)",
    exactExceptionText=needle,
    exceptionSourceSpan=find_span(TEXTS["lsb"], needle, SOURCES["lsb"]["path"], SHAS["lsb"]),
    paraphraseSummary="RP permitted if Payment Conditions satisfied.",
    structuralHierarchy=["Article VI", "Section 6.11", "Section 6.11(c)"],
    definedTerms=["Payment Conditions", "Restricted Payment"],
    localConditions=[],
    remoteConditions=[cond("r1", "Payment Conditions satisfied", "DEFINED_TERM", "Payment Conditions", "SHARED_POOL", None)],
    unresolvedControllingSources=[{"ref": "Payment Conditions definition", "reason": "Full definition lives in definitions excerpt / Article I, not in article-6 file alone."}],
    entityScope={"includes": ["Loan Parties / Subsidiaries"], "excludes": [], "sourceSpan": None},
    sharedCapacityRestrictions=[{"kind": "SHARED_BASKET", "description": "Payment Conditions shared across NC families", "relatedRefs": ["6.01", "6.08(a)(v)", "6.13(k)"]}],
    verificationStatus="SOURCE_VERIFIED_PARTIAL_CONTEXT",
    notes="Remote defined-term exemplar.",
    crossReferences=[{"targetRef": "Payment Conditions", "role": "remote gate", "existenceCheck": "PRESENT_IN_DEFINITIONS_EXCERPT"}],
))

# LSB 6.04(b) external document
needle = (
    "notwithstanding anything to the contrary contained herein, any Loan Party and any of its respective "
    "Subsidiaries may sell, transfer or otherwise dispose of any Notes Priority Collateral owned by such Person so long as such "
    "disposition is permitted under the Secured Notes Documents or if the requisite holders of the Secured Notes otherwise consent "
    "to such sale or disposition, it being understood that upon such sale, the Administrative Agent’s security interest (if any) in such assets shall be automatically released, and it being further understood that proceeds from the sale or "
    "disposition of Notes Priority Collateral shall be applied by the Loan Parties in accordance with the terms of the Secured Notes Documents and the Secured Notes Indenture;"
)
# apostrophe variants
if TEXTS["lsb"].find(needle) < 0:
    needle = needle.replace("Agent’s", "Agent's")
add(record(
    exceptionId="lsb-6.04-b-external-secured-notes",
    sourceIdentity=identity("lsb", SHAS["lsb"]),
    covenantFamily="ASSET_SALES",
    permissionClassification="CONDITIONAL",
    classificationRationale="Notwithstanding overrides local ABL caps but imports Secured Notes Documents — external controlling source.",
    parentProhibition={"sectionRef": "6.04", "paraphraseSummary": "Disposal of assets prohibition with exceptions.", "sourceSpan": find_span(TEXTS["lsb"], "SECTION  6.04 Disposal of Assets", SOURCES["lsb"]["path"], SHAS["lsb"])},
    articleOrSectionChapeau={"paraphraseSummary": "Article VI chapeau.", "sourceSpan": None},
    exceptionSectionRef="6.04(b)",
    exactExceptionText=needle if TEXTS["lsb"].find(needle) >= 0 else TEXTS["lsb"][TEXTS["lsb"].find("notwithstanding anything to the contrary contained herein"):TEXTS["lsb"].find("notwithstanding anything to the contrary contained herein")+600],
    exceptionSourceSpan=find_span(TEXTS["lsb"], needle if TEXTS["lsb"].find(needle) >= 0 else "notwithstanding anything to the contrary contained herein", SOURCES["lsb"]["path"], SHAS["lsb"]),
    paraphraseSummary="Notes Priority Collateral sales if permitted under Secured Notes Documents.",
    structuralHierarchy=["Article VI", "Section 6.04", "Section 6.04(b)"],
    definedTerms=["Notes Priority Collateral", "Secured Notes Documents", "Secured Notes Indenture"],
    localConditions=[],
    remoteConditions=[cond("r1", "permitted under the Secured Notes Documents or noteholder consent", "EXTERNAL_DOCUMENT", "Secured Notes Documents", "OTHER_RULE", None)],
    provisoAttachment=[{"text": "notwithstanding anything to the contrary contained herein", "attachment": "NOTWITHSTANDING", "scopeNote": "Overrides local ABL disposition limits.", "sourceSpan": None}],
    unresolvedControllingSources=[{"ref": "Secured Notes Documents", "reason": "External instrument not in this NC article file."}, {"ref": "Secured Notes Indenture", "reason": "Proceeds application rules external."}],
    entityScope={"includes": ["Loan Party", "Subsidiaries"], "excludes": [], "sourceSpan": None},
    verificationStatus="SOURCE_VERIFIED_PARTIAL_CONTEXT",
    isNegativeControl=True,
    negativeControlClass="CONSTRAINED_BY_OTHER_DOCUMENT",
    notes="Negative control: constrained by another document.",
    crossReferences=[{"targetRef": "Secured Notes Documents", "role": "external permission", "existenceCheck": "EXTERNAL_OR_UNRESOLVED"}],
))

# ===========================================================================
# NEW ISSUERS — Chewy, Gibraltar, DSGR, Riot, SUP
# ===========================================================================

# CHEWY 6.01(a) ratio-gated unlimited (local ratios in proviso)
chwy_parent = "the Borrowers shall not, and shall not permit any of their Restricted Subsidiaries to create, incur, issue, assume, guarantee or otherwise"
# Find a stable exact slice for first ratio limb
m = re.search(
    r"provided\s*,\s*however\s*,\s*that the Borrowers may\s*incur Indebtedness \(including Acquired Indebtedness\) and issue shares of Disqualified Stock,",
    TEXTS["chwy"],
)
assert m, "chewy ratio gate not found"
# take a bounded exact chunk
start = m.start()
chunk = TEXTS["chwy"][start:start + 900]
# trim to end of first major sentence boundary near First Lien Leverage Ratio clause
end_rel = chunk.find("Junior Lien Priority basis")
needle = chunk[: end_rel if end_rel > 0 else 700]
add(record(
    exceptionId="chwy-6.01-a-ratio-gated-incurrence",
    sourceIdentity=identity("chwy", SHAS["chwy"]),
    covenantFamily="DEBT_INCURRENCE",
    permissionClassification="CONDITIONAL",
    classificationRationale="Chapeau prohibition with proviso permitting unlimited incurrence only if First Lien / Senior Secured / Total leverage or ICR tests are met on Pro Forma Basis — local to 6.01(a) proviso but uses defined ratio terms.",
    parentProhibition={"sectionRef": "6.01(a)", "paraphraseSummary": "Borrowers/Restricted Subsidiaries shall not incur Indebtedness/Disqualified Stock/Preferred Stock.", "sourceSpan": find_span(TEXTS["chwy"], chwy_parent, SOURCES["chwy"]["path"], SHAS["chwy"])},
    articleOrSectionChapeau={"paraphraseSummary": "Article VI duration chapeau until Commitments terminated and amounts paid.", "sourceSpan": find_span(TEXTS["chwy"], "Until the Commitments have expired or been terminated", SOURCES["chwy"]["path"], SHAS["chwy"])},
    exceptionSectionRef="6.01(a) proviso",
    exactExceptionText=needle,
    exceptionSourceSpan=find_span(TEXTS["chwy"], needle, SOURCES["chwy"]["path"], SHAS["chwy"]),
    paraphraseSummary="Ratio-gated unlimited incurrence for pari passu / junior / unsecured debt under Chewy §6.01(a).",
    structuralHierarchy=["Article VI", "Section 6.01", "Section 6.01(a)"],
    definedTerms=["First Lien Leverage Ratio", "Senior Secured Leverage Ratio", "Interest Coverage Ratio", "Total Leverage Ratio", "Pro Forma Basis", "Restricted Subsidiaries"],
    localConditions=[cond("l1", "Pro Forma First Lien / Senior Secured / Total leverage or ICR tests in 6.01(a) proviso", "IN_EXCEPTION_CLAUSE", "6.01(a) proviso", "RATIO", None)],
    remoteConditions=[cond("r1", "Ratio definitions live in Article I", "DEFINED_TERM", "leverage/ICR definitions", "RATIO", None)],
    financialTests=[{"testId": "fllr", "description": "First Lien Leverage Ratio gate for pari passu secured", "ratioOrAmount": "greater of 2.00:1.00 and prior FLLR", "sourceSpan": None}],
    entityScope={"includes": ["Borrowers", "Restricted Subsidiaries"], "excludes": [], "sourceSpan": None},
    verificationStatus="SOURCE_VERIFIED",
    notes="New-issuer (CHWY) diversity record.",
))

# CHEWY — Permitted Liens is definitional; find a short Permitted Liens lead-in as UNKNOWN/definitional
pl = re.search(r"“Permitted Liens” means|\"Permitted Liens\" means|Permitted Liens” means", TEXTS["chwy"])
if pl:
    needle = TEXTS["chwy"][pl.start(): pl.start() + 180]
    add(record(
        exceptionId="chwy-permitted-liens-definitional-basket-leadin",
        sourceIdentity=identity("chwy", SHAS["chwy"]),
        covenantFamily="LIENS",
        permissionClassification="UNKNOWN",
        classificationRationale="Lead-in to Permitted Liens definition; full basket inventory not exhaustively classified in this pass — condition scope across definitional subclauses is ambiguous without full enumeration.",
        parentProhibition={"sectionRef": "6.02", "paraphraseSummary": "Limitation on Liens (points to Permitted Liens).", "sourceSpan": find_span(TEXTS["chwy"], "Section 6.02 Limitation on Liens", SOURCES["chwy"]["path"], SHAS["chwy"])},
        articleOrSectionChapeau={"paraphraseSummary": "Article VI chapeau.", "sourceSpan": None},
        exceptionSectionRef="Permitted Liens definition",
        exactExceptionText=needle,
        exceptionSourceSpan=find_span(TEXTS["chwy"], needle, SOURCES["chwy"]["path"], SHAS["chwy"]),
        paraphraseSummary="Definitional Permitted Liens lead-in; sub-baskets not fully inventoried here.",
        structuralHierarchy=["Article I", "Permitted Liens"],
        localConditions=[],
        remoteConditions=[],
        entityScope={"includes": ["as defined"], "excludes": [], "sourceSpan": None},
        verificationStatus="UNVERIFIED",
        isNegativeControl=True,
        negativeControlClass="AMBIGUOUS_CONDITION_SCOPE",
        notes="Negative control: ambiguous condition scope pending full definitional walk.",
    ))

# GIBRALTAR 7.01(a) ratio-style incurrence
gib_parent_frag = "Incur any Indebtedness (including Acquired Indebtedness); provided that the Borrower and any Restricted Subsidiary may incur"
idx = TEXTS["gibraltar"].find(gib_parent_frag)
assert idx >= 0
needle = TEXTS["gibraltar"][idx: idx + 650]
add(record(
    exceptionId="gibraltar-7.01-a-ratio-incurrence-proviso",
    sourceIdentity=identity("gibraltar", SHAS["gibraltar"]),
    covenantFamily="DEBT_INCURRENCE",
    permissionClassification="CONDITIONAL",
    classificationRationale="Primary prohibition with proviso permitting incurrence subject to ratio/conditions stated in §7.01(a) (and related defined tests).",
    parentProhibition={"sectionRef": "7.01(a)", "paraphraseSummary": "Shall not incur Indebtedness except as provided.", "sourceSpan": find_span(TEXTS["gibraltar"], gib_parent_frag, SOURCES["gibraltar"]["path"], SHAS["gibraltar"])},
    articleOrSectionChapeau={"paraphraseSummary": "Article VII chapeau while Commitments/Loans outstanding.", "sourceSpan": find_span(TEXTS["gibraltar"], "So long as any Lender shall have any Commitment hereunder", SOURCES["gibraltar"]["path"], SHAS["gibraltar"])},
    exceptionSectionRef="7.01(a) proviso",
    exactExceptionText=needle,
    exceptionSourceSpan=find_span(TEXTS["gibraltar"], needle, SOURCES["gibraltar"]["path"], SHAS["gibraltar"]),
    paraphraseSummary="Gibraltar §7.01(a) incurrence proviso (ratio-gated family).",
    structuralHierarchy=["Article VII", "Section 7.01", "Section 7.01(a)"],
    definedTerms=["Acquired Indebtedness", "Restricted Subsidiary"],
    localConditions=[cond("l1", "proviso-permitted incurrence conditions in 7.01(a)", "IN_EXCEPTION_CLAUSE", "7.01(a)", "RATIO", None)],
    remoteConditions=[cond("r1", "Article VII duration chapeau", "ARTICLE_LEVEL", "Article VII chapeau", "OTHER_RULE", None)],
    entityScope={"includes": ["Borrower", "Restricted Subsidiary"], "excludes": [], "sourceSpan": None},
    verificationStatus="SOURCE_VERIFIED",
    notes="New-issuer (ROCK) diversity record.",
))

# GIBRALTAR burdensome 7.06(b)(1) — local-ish exception list
frag = "any encumbrance or restriction (x) for the benefit of the Lenders with respect to the Facilities and the Obligations or under the Loan Documents or (y)"
idx = TEXTS["gibraltar"].find(frag)
needle = TEXTS["gibraltar"][idx: idx + 220] if idx >= 0 else frag
add(record(
    exceptionId="gibraltar-7.06-b-1-loan-docs-burdensome-exception",
    sourceIdentity=identity("gibraltar", SHAS["gibraltar"]),
    covenantFamily="SUBSIDIARY_RESTRICTIONS",
    permissionClassification="UNCONDITIONAL_SOURCE_VERIFIED",
    classificationRationale="Enumerated burdensome-agreement exception for Loan Documents / Closing Date agreements with no local dollar gate; still not a capacity approval.",
    parentProhibition={"sectionRef": "7.06(a)", "paraphraseSummary": "Burdensome Agreements restriction on subsidiary distributions.", "sourceSpan": find_span(TEXTS["gibraltar"], "Create or otherwise cause or permit to exist or become effective any consensual encumbrance", SOURCES["gibraltar"]["path"], SHAS["gibraltar"])},
    articleOrSectionChapeau={"paraphraseSummary": "Article VII chapeau.", "sourceSpan": None},
    exceptionSectionRef="7.06(b)(1)",
    exactExceptionText=needle,
    exceptionSourceSpan=find_span(TEXTS["gibraltar"], needle, SOURCES["gibraltar"]["path"], SHAS["gibraltar"]),
    paraphraseSummary="Burdensome-agreement exception for Lender/Loan Document restrictions.",
    structuralHierarchy=["Article VII", "Section 7.06", "Section 7.06(b)", "Section 7.06(b)(1)"],
    localConditions=[],
    remoteConditions=[],
    entityScope={"includes": ["Loan Party other than Borrower (per 7.06(a))", "as applicable"], "excludes": [], "sourceSpan": None},
    verificationStatus="SOURCE_VERIFIED",
    notes="Local-list categorical exception (no additional economic conditions identified in-clause).",
    isNegativeControl=True,
    negativeControlClass="NO_ADDITIONAL_CONDITIONS",
))

# DSGR 6.01(a) — categorical Secured Obligations
needle = "the Secured Obligations and the Guaranteed Obligations;"
parent = "No Loan Party will, nor will it permit any Restricted Subsidiary to, create, incur, assume or suffer to exist any Indebtedness, except:"
add(record(
    exceptionId="dsgr-6.01-a-secured-obligations",
    sourceIdentity=identity("dsgr", SHAS["dsgr"]),
    covenantFamily="DEBT_INCURRENCE",
    permissionClassification="UNCONDITIONAL_SOURCE_VERIFIED",
    classificationRationale="Categorical carve-out for facility Secured/Guaranteed Obligations with no local quantum gate.",
    parentProhibition={"sectionRef": "6.01", "paraphraseSummary": "No Indebtedness except enumerated baskets.", "sourceSpan": find_span(TEXTS["dsgr"], parent, SOURCES["dsgr"]["path"], SHAS["dsgr"])},
    articleOrSectionChapeau={"paraphraseSummary": "Article VI until Secured Obligations Paid in Full.", "sourceSpan": find_span(TEXTS["dsgr"], "Until all of the Secured Obligations shall have been Paid in Full", SOURCES["dsgr"]["path"], SHAS["dsgr"])},
    exceptionSectionRef="6.01(a)",
    exactExceptionText=needle,
    exceptionSourceSpan=find_span(TEXTS["dsgr"], needle, SOURCES["dsgr"]["path"], SHAS["dsgr"]),
    paraphraseSummary="Permits the facility's own Secured and Guaranteed Obligations.",
    structuralHierarchy=["Article VI", "Section 6.01", "Section 6.01(a)"],
    definedTerms=["Secured Obligations", "Guaranteed Obligations"],
    localConditions=[],
    remoteConditions=[cond("r1", "Article VI Paid-in-Full duration", "ARTICLE_LEVEL", "Article VI chapeau", "OTHER_RULE", None)],
    entityScope={"includes": ["Loan Parties / Restricted Subsidiaries as bound by chapeau"], "excludes": [], "sourceSpan": None},
    verificationStatus="SOURCE_VERIFIED",
    notes="New-issuer (DSGR) restatement diversity; no-additional-conditions economic profile.",
    isNegativeControl=True,
    negativeControlClass="NO_ADDITIONAL_CONDITIONS",
))

# DSGR 6.01(b) — local + remote mix (15% Applicable EBITDA shared)
needle = (
    "Indebtedness of any Borrower owing to any Restricted Subsidiary and of any Restricted Subsidiary owing to any Borrower or any other "
    "Restricted Subsidiary, provided that (i) Indebtedness of any Restricted Subsidiary that is not a Loan Party owing to any Borrower or any other Loan Party shall be subject to the limitations set forth in Section 6.04, (ii) "
    "Indebtedness of any Loan Party owing to any Restricted Subsidiary that is not a Loan Party shall be subordinated to the Secured Obligations on terms reasonably satisfactory to the Administrative Agent, and (iii) the aggregate principal amount "
    "of Indebtedness of Restricted Subsidiaries that are not U.S. Loan Parties owing to U.S. Loan Parties at any time outstanding, together with the aggregate amount of all outstanding Guarantees permitted under Section 6.01(c)(iii) and the "
    "aggregate amount of all outstanding investments by U.S. Loan Parties in Restricted Subsidiaries that are not U.S. Loan Parties made after the Effective Date under Section 6.04(b), shall not at any time exceed an amount equal to 15% of "
    "Applicable EBITDA;"
)
add(record(
    exceptionId="dsgr-6.01-b-intercompany-shared-cap",
    sourceIdentity=identity("dsgr", SHAS["dsgr"]),
    covenantFamily="DEBT_INCURRENCE",
    permissionClassification="CONDITIONAL",
    classificationRationale="Intercompany debt exception with local proviso limbs plus cross-section caps shared with §6.04 Investments and §6.01(c)(iii) guarantees.",
    parentProhibition={"sectionRef": "6.01", "paraphraseSummary": "No Indebtedness except enumerated baskets.", "sourceSpan": find_span(TEXTS["dsgr"], parent, SOURCES["dsgr"]["path"], SHAS["dsgr"])},
    articleOrSectionChapeau={"paraphraseSummary": "Article VI chapeau.", "sourceSpan": None},
    exceptionSectionRef="6.01(b)",
    exactExceptionText=needle,
    exceptionSourceSpan=find_span(TEXTS["dsgr"], needle, SOURCES["dsgr"]["path"], SHAS["dsgr"]),
    paraphraseSummary="Intercompany debt with subordination, 6.04 limits, and 15% Applicable EBITDA shared cap.",
    structuralHierarchy=["Article VI", "Section 6.01", "Section 6.01(b)"],
    definedTerms=["Applicable EBITDA", "U.S. Loan Parties", "Restricted Subsidiary"],
    localConditions=[
        cond("l1", "non-Loan Party debt to Loan Party subordinated on satisfactory terms", "IN_EXCEPTION_CLAUSE", "6.01(b)(ii)", "QUALITATIVE", None),
        cond("l2", "15% Applicable EBITDA aggregate shared cap", "IN_EXCEPTION_CLAUSE", "6.01(b)(iii)", "MONEY", None),
    ],
    remoteConditions=[
        cond("r1", "non-Loan Party borrowings from Loan Parties subject to Section 6.04", "CROSS_REFERENCED_SECTION", "6.04", "OTHER_RULE", None),
        cond("r2", "shared with Guarantees 6.01(c)(iii) and Investments 6.04(b)", "CROSS_REFERENCED_SECTION", "6.01(c)(iii)/6.04(b)", "SHARED_POOL", None),
    ],
    sharedCapacityRestrictions=[{"kind": "SHARED_BASKET", "description": "15% Applicable EBITDA pool shared across intercompany debt, guarantees, investments", "relatedRefs": ["6.01(b)(iii)", "6.01(c)(iii)", "6.04(b)"]}],
    amountsAndRatios=[{"kind": "PERCENT_OF", "value": "15%", "measurementBasis": "Applicable EBITDA"}],
    entityScope={"includes": ["Borrower", "Restricted Subsidiary"], "excludes": [], "notes": "U.S. vs non-U.S. Loan Party distinctions in cap.", "sourceSpan": None},
    crossReferences=[
        {"targetRef": "6.04", "role": "investment limitations", "existenceCheck": "PRESENT_IN_SOURCE"},
        {"targetRef": "6.01(c)(iii)", "role": "shared guarantee cap", "existenceCheck": "PRESENT_IN_SOURCE"},
    ],
    verificationStatus="SOURCE_VERIFIED",
    notes="New-issuer shared-capacity remote+local mix.",
))

# DSGR amendment — amendment authority record (not inventing NC change without text)
amd_frag = "have agreed to amend the Credit Agreement on the terms and conditions set forth herein"
add(record(
    exceptionId="dsgr-fourth-amendment-authority-pointer",
    sourceIdentity=identity("dsgr_amd4", SHAS["dsgr_amd4"]),
    covenantFamily="OTHER_NEGATIVE_COVENANT",
    permissionClassification="UNKNOWN",
    classificationRationale="Fourth Amendment exists and amends the credit agreement; this pass does not assert a specific NC basket rewrite without clause-level redline extraction.",
    parentProhibition={"sectionRef": "Amendment preamble", "paraphraseSummary": "Amendment to Existing Credit Agreement.", "sourceSpan": find_span(TEXTS["dsgr_amd4"], "FOURTH AMENDMENT TO AMENDED AND RESTATED CREDIT AGREEMENT", SOURCES["dsgr_amd4"]["path"], SHAS["dsgr_amd4"])},
    articleOrSectionChapeau={"paraphraseSummary": "n/a — amendment document", "sourceSpan": None},
    exceptionSectionRef="Fourth Amendment",
    exactExceptionText=TEXTS["dsgr_amd4"][TEXTS["dsgr_amd4"].find(amd_frag): TEXTS["dsgr_amd4"].find(amd_frag) + len(amd_frag)] if amd_frag in TEXTS["dsgr_amd4"] else amd_frag,
    exceptionSourceSpan=find_span(TEXTS["dsgr_amd4"], amd_frag, SOURCES["dsgr_amd4"]["path"], SHAS["dsgr_amd4"]),
    paraphraseSummary="Amendment instrument acknowledging agreed amendments; basket-level effects unresolved in this pass.",
    structuralHierarchy=["Fourth Amendment"],
    localConditions=[],
    remoteConditions=[],
    amendmentAuthority=[{"documentRef": "DSGR Fourth Amendment 2025-03-31", "effect": "Amends Existing Credit Agreement; clause-level NC impact not fully extracted here", "status": "UNKNOWN"}],
    unresolvedControllingSources=[{"ref": "Fourth Amendment operative amendatory sections", "reason": "Need clause-level mapping to 6.01/6.04 etc. before classification."}],
    entityScope={"includes": ["Company / Loan Parties"], "excludes": [], "sourceSpan": None},
    verificationStatus="UNVERIFIED",
    notes="Amendment diversity document; unresolved controlling amendatory detail.",
))

# RIOT 5.02(a)(i) — local categorical liens exception
needle = "Liens in favor of the Collateral Agent for the benefit of Secured Parties granted pursuant to any Loan Document;"
parent = "The Borrower shall not, directly or indirectly, create, incur, assume or permit to exist any Lien on or with respect to the Collateral, whether now owned or hereafter acquired, or file or permit the filing of, or permit to remain in effect, any financing statement or other similar notice of any Lien with respect to the Collateral under the UCC of any State or under any similar recording or notice statute, except:"
add(record(
    exceptionId="riot-5.02-a-i-facility-liens",
    sourceIdentity=identity("riot", SHAS["riot"]),
    covenantFamily="LIENS",
    permissionClassification="UNCONDITIONAL_SOURCE_VERIFIED",
    classificationRationale="Categorical exception for facility Collateral Agent liens; no local dollar/ratio gate.",
    parentProhibition={"sectionRef": "5.02(a)", "paraphraseSummary": "No Liens on Collateral except enumerated.", "sourceSpan": find_span(TEXTS["riot"], parent, SOURCES["riot"]["path"], SHAS["riot"])},
    articleOrSectionChapeau={"paraphraseSummary": "Section 5.02 Negative Covenants.", "sourceSpan": find_span(TEXTS["riot"], "Section 5.02.Negative Covenants.", SOURCES["riot"]["path"], SHAS["riot"])},
    exceptionSectionRef="5.02(a)(i)",
    exactExceptionText=needle,
    exceptionSourceSpan=find_span(TEXTS["riot"], needle, SOURCES["riot"]["path"], SHAS["riot"]),
    paraphraseSummary="Permits Collateral Agent liens under Loan Documents.",
    structuralHierarchy=["Article V", "Section 5.02", "Section 5.02(a)", "Section 5.02(a)(i)"],
    definedTerms=["Collateral Agent", "Secured Parties", "Loan Document", "Collateral"],
    localConditions=[],
    remoteConditions=[],
    entityScope={"includes": ["Borrower"], "excludes": [], "notes": "Collateral-scoped (not all assets).", "sourceSpan": None},
    verificationStatus="SOURCE_VERIFIED",
    notes="New-issuer (RIOT) crypto-margin facility; no-additional-conditions exemplar.",
    isNegativeControl=True,
    negativeControlClass="NO_ADDITIONAL_CONDITIONS",
))

# RIOT 5.02(a)(ii) — local conditions (taxes)
needle = "Liens for Taxes not yet due or that are being contested in good faith and by appropriate proceedings diligently conducted, if adequate reserves with respect thereto are maintained on the books of the applicable Person in accordance with Applicable Accounting Rules;"
add(record(
    exceptionId="riot-5.02-a-ii-tax-liens-local",
    sourceIdentity=identity("riot", SHAS["riot"]),
    covenantFamily="LIENS",
    permissionClassification="CONDITIONAL",
    classificationRationale="Local qualitative conditions (not yet due OR contested + reserves) entirely within the exception clause.",
    parentProhibition={"sectionRef": "5.02(a)", "paraphraseSummary": "No Liens on Collateral except enumerated.", "sourceSpan": find_span(TEXTS["riot"], parent, SOURCES["riot"]["path"], SHAS["riot"])},
    articleOrSectionChapeau={"paraphraseSummary": "Section 5.02 Negative Covenants.", "sourceSpan": find_span(TEXTS["riot"], "Section 5.02.Negative Covenants.", SOURCES["riot"]["path"], SHAS["riot"])},
    exceptionSectionRef="5.02(a)(ii)",
    exactExceptionText=needle,
    exceptionSourceSpan=find_span(TEXTS["riot"], needle, SOURCES["riot"]["path"], SHAS["riot"]),
    paraphraseSummary="Tax liens if not due or contested with reserves.",
    structuralHierarchy=["Article V", "Section 5.02", "Section 5.02(a)", "Section 5.02(a)(ii)"],
    definedTerms=["Taxes", "Applicable Accounting Rules"],
    localConditions=[cond("l1", "not yet due OR contested in good faith with adequate reserves", "IN_EXCEPTION_CLAUSE", "5.02(a)(ii)", "QUALITATIVE", None)],
    remoteConditions=[],
    entityScope={"includes": ["Borrower / applicable Person"], "excludes": [], "sourceSpan": None},
    verificationStatus="SOURCE_VERIFIED",
    notes="Genuinely local-conditions exemplar for negative-control sample.",
    isNegativeControl=True,
    negativeControlClass="LOCAL_CONDITIONS",
))

# RIOT 5.02(c) — prohibition with no exception
needle = "The Borrower shall not sell, assign, transfer, convey or otherwise dispose (including without limitation, any effective transfer or other disposition as a result of a division) of any Collateral."
add(record(
    exceptionId="riot-5.02-c-no-collateral-sale-exception",
    sourceIdentity=identity("riot", SHAS["riot"]),
    covenantFamily="ASSET_SALES",
    permissionClassification="NOT_AN_AFFIRMATIVE_PERMISSION",
    classificationRationale="Absolute Collateral disposition prohibition with no 'except' limbs in-clause.",
    parentProhibition={"sectionRef": "5.02(c)", "paraphraseSummary": "No sale/disposition of Collateral.", "sourceSpan": find_span(TEXTS["riot"], needle, SOURCES["riot"]["path"], SHAS["riot"])},
    articleOrSectionChapeau={"paraphraseSummary": "Section 5.02 Negative Covenants.", "sourceSpan": find_span(TEXTS["riot"], "Section 5.02.Negative Covenants.", SOURCES["riot"]["path"], SHAS["riot"])},
    exceptionSectionRef="5.02(c)",
    exactExceptionText=needle,
    exceptionSourceSpan=find_span(TEXTS["riot"], needle, SOURCES["riot"]["path"], SHAS["riot"]),
    paraphraseSummary="Flat prohibition on Collateral dispositions; no applicable exception list.",
    structuralHierarchy=["Article V", "Section 5.02", "Section 5.02(c)"],
    definedTerms=["Collateral"],
    localConditions=[],
    remoteConditions=[],
    entityScope={"includes": ["Borrower"], "excludes": [], "sourceSpan": None},
    verificationStatus="SOURCE_VERIFIED",
    isNegativeControl=True,
    negativeControlClass="PROHIBITION_NO_EXCEPTION",
    notes="Negative control: prohibition with no applicable exception.",
))

# SUP 7.01 — Liens via Permitted Liens definition (remote definitional)
needle = (
    "The Borrower shall not, nor shall the Borrower permit any Subsidiary to, directly or indirectly, create, incur "
    "or assume any Lien (except any Permitted Lien(s)) that secures obligations under any Indebtedness or any related guarantee of Indebtedness on any asset or property of the Borrower or any Subsidiary of the Borrower, or any income or profits "
    "therefrom."
)
add(record(
    exceptionId="sup-7.01-permitted-liens-definitional",
    sourceIdentity=identity("sup", SHAS["sup"]),
    covenantFamily="LIENS",
    permissionClassification="CONDITIONAL",
    classificationRationale="Entire exception capacity is the Permitted Liens definition (remote/defined-term). No local enumerated baskets in §7.01 itself.",
    parentProhibition={"sectionRef": "7.01", "paraphraseSummary": "No Liens securing Indebtedness except Permitted Liens.", "sourceSpan": find_span(TEXTS["sup"], needle, SOURCES["sup"]["path"], SHAS["sup"])},
    articleOrSectionChapeau={"paraphraseSummary": "Article VII effective while Termination Conditions not satisfied.", "sourceSpan": find_span(TEXTS["sup"], "Effective as of the Closing Date and for so long thereafter as the Termination Conditions are not satisfied:", SOURCES["sup"]["path"], SHAS["sup"])},
    exceptionSectionRef="7.01 / Permitted Liens",
    exactExceptionText=needle,
    exceptionSourceSpan=find_span(TEXTS["sup"], needle, SOURCES["sup"]["path"], SHAS["sup"]),
    paraphraseSummary="Lien negative covenant carved solely by Permitted Liens definition.",
    structuralHierarchy=["Article VII", "Section 7.01"],
    definedTerms=["Permitted Lien", "Indebtedness", "Termination Conditions"],
    localConditions=[],
    remoteConditions=[cond("r1", "except any Permitted Lien(s)", "DEFINED_TERM", "Permitted Liens", "OTHER_RULE", None)],
    unresolvedControllingSources=[{"ref": "Permitted Liens definition", "reason": "Full definitional basket inventory not inlined in §7.01."}],
    sharedCapacityRestrictions=[{"kind": "CLASSIFY_RECLASSIFY", "description": "§7.01 trailing classify among Permitted Liens categories", "relatedRefs": ["7.01 trailing", "Permitted Liens"]}],
    entityScope={"includes": ["Borrower", "Subsidiary"], "excludes": [], "sourceSpan": None},
    verificationStatus="SOURCE_VERIFIED_PARTIAL_CONTEXT",
    isNegativeControl=True,
    negativeControlClass="REMOTE_CONDITIONS",
    notes="New-issuer (SUP); remote definitional exception pattern.",
))

# SUP classify paragraph — not permission
cls = (
    "For purposes of determining compliance with this Section 7.01, (A) a Lien need not be incurred solely by reference to one category of "
    "Permitted Liens described in the definition thereof, but is permitted to be incurred in part under any combination thereof and of any other available exemption and (B) in the event that a Lien (or any portion thereof) meets the criteria of one "
    "or more of the categories of Permitted Liens, the Borrower will, in its sole discretion, be entitled to divide, classify or reclassify, in whole or in part, any such Lien (or any portion thereof) among one or more of such categories or clauses in "
    "any manner."
)
# nbsp variants
if TEXTS["sup"].find(cls) < 0:
    cls = cls.replace("\u00a0", " ")
    # try find shorter unique start
    frag = "For purposes of determining compliance with this Section"
    idx = TEXTS["sup"].find(frag)
    # find the 7.01 one — first occurrence after 7.01
    idx7 = TEXTS["sup"].find("SECTION\u00a07.01 Liens")
    if idx7 < 0:
        idx7 = TEXTS["sup"].find("SECTION 7.01 Liens")
    idx = TEXTS["sup"].find(frag, idx7 if idx7 >= 0 else 0)
    cls = TEXTS["sup"][idx: idx + 550]
add(record(
    exceptionId="sup-7.01-classify-not-permission",
    sourceIdentity=identity("sup", SHAS["sup"]),
    covenantFamily="NOT_AN_EXCEPTION",
    permissionClassification="NOT_AN_AFFIRMATIVE_PERMISSION",
    classificationRationale="Classify/reclassify mechanics for Permitted Liens are not themselves a permission grant.",
    parentProhibition={"sectionRef": "7.01", "paraphraseSummary": "Lien prohibition.", "sourceSpan": find_span(TEXTS["sup"], "SECTION 7.01 Liens" if "SECTION 7.01 Liens" in TEXTS["sup"] else "SECTION\u00a07.01 Liens", SOURCES["sup"]["path"], SHAS["sup"])},
    articleOrSectionChapeau={"paraphraseSummary": "Article VII chapeau.", "sourceSpan": None},
    exceptionSectionRef="7.01 trailing classify",
    exactExceptionText=cls,
    exceptionSourceSpan=find_span(TEXTS["sup"], cls, SOURCES["sup"]["path"], SHAS["sup"]),
    paraphraseSummary="Classify/reclassify among Permitted Liens categories.",
    structuralHierarchy=["Article VII", "Section 7.01", "trailing"],
    localConditions=[],
    remoteConditions=[],
    entityScope={"includes": ["Borrower"], "excludes": [], "sourceSpan": None},
    verificationStatus="SOURCE_VERIFIED",
    isNegativeControl=True,
    negativeControlClass="NUMERIC_THRESHOLD_NOT_PERMISSION",
    notes="Not a numeric threshold; still NOT_AN_AFFIRMATIVE_PERMISSION (mechanics).",
))

# FWRG Available Amount — remote builder (keep one from phase1 upgraded)
# Use a short exact fragment present in FWRG file
frag = "the portion, if any, of the Available Amount on such date that the Borrower elects to apply to this clause (iii)(A)"
idx = TEXTS["fwrg"].find(frag)
assert idx >= 0
needle = TEXTS["fwrg"][idx - 80: idx + len(frag) + 120]
# expand to safer exact slice from known start
start = TEXTS["fwrg"].rfind("the Borrower may make Restricted Payments in an amount not to exceed", 0, idx + 1)
if start < 0:
    start = idx
needle = TEXTS["fwrg"][start: start + 280]
add(record(
    exceptionId="fwrg-6.04-a-iii-builder-remote",
    sourceIdentity=identity("fwrg", SHAS["fwrg"]),
    covenantFamily="RESTRICTED_PAYMENTS",
    permissionClassification="CONDITIONAL",
    classificationRationale="RP capacity is elective draw on Available Amount / Available Excluded Contribution Amount builders defined in Article I.",
    parentProhibition={"sectionRef": "6.04(a)", "paraphraseSummary": "Borrower shall not make Restricted Payments except enumerated.", "sourceSpan": find_span(TEXTS["fwrg"], "The Borrower shall not pay or make any Restricted Payment, except that:", SOURCES["fwrg"]["path"], SHAS["fwrg"])},
    articleOrSectionChapeau={"paraphraseSummary": "Article VI NC.", "sourceSpan": None},
    exceptionSectionRef="6.04(a)(iii)",
    exactExceptionText=needle,
    exceptionSourceSpan=find_span(TEXTS["fwrg"], needle, SOURCES["fwrg"]["path"], SHAS["fwrg"]),
    paraphraseSummary="Builder-basket RP via Available Amount election.",
    structuralHierarchy=["Article VI", "Section 6.04", "Section 6.04(a)(iii)"],
    definedTerms=["Available Amount", "Available Excluded Contribution Amount"],
    localConditions=[],
    remoteConditions=[cond("r1", "Available Amount elective application", "DEFINED_TERM", "Available Amount", "SHARED_POOL", None)],
    sharedCapacityRestrictions=[{"kind": "BUILDER_ELECTION", "description": "Shared builder across RP/Investments/RDP", "relatedRefs": ["Available Amount", "6.06", "6.04(b)"]}],
    unresolvedControllingSources=[{"ref": "Available Amount definition", "reason": "Builder component gates live in Article I definitions excerpt."}],
    entityScope={"includes": ["Borrower"], "excludes": [], "sourceSpan": None},
    verificationStatus="SOURCE_VERIFIED_PARTIAL_CONTEXT",
    isNegativeControl=True,
    negativeControlClass="REMOTE_CONDITIONS",
    notes="Remote builder exemplar retained from phase-1 family with upgraded classification fields.",
))

# Ambiguous — CONMED 7.5(a) qualitative unlimited
needle = "the Disposition of obsolete or worn out property in the ordinary course of business;"
parent = "Dispose of any of its Property or business (including receivables and leasehold interests), whether now owned or hereafter"
# parent may need exact
parent_hits = "Dispose of any of its Property or business"
add(record(
    exceptionId="conmed-7.5-a-qualitative-gates",
    sourceIdentity=identity("conmed", SHAS["conmed"]),
    covenantFamily="ASSET_SALES",
    permissionClassification="CONDITIONAL",
    classificationRationale="Unlimited-looking carve-out with two in-clause qualitative gates (obsolete/worn out; ordinary course). Not unconditional.",
    parentProhibition={"sectionRef": "7.5", "paraphraseSummary": "Limitation on Sale of Assets.", "sourceSpan": find_span(TEXTS["conmed"], parent_hits, SOURCES["conmed"]["path"], SHAS["conmed"])},
    articleOrSectionChapeau={"paraphraseSummary": "Article VII chapeau.", "sourceSpan": find_span(TEXTS["conmed"], chapeau, SOURCES["conmed"]["path"], SHAS["conmed"])},
    exceptionSectionRef="7.5(a)",
    exactExceptionText=needle,
    exceptionSourceSpan=find_span(TEXTS["conmed"], needle, SOURCES["conmed"]["path"], SHAS["conmed"]),
    paraphraseSummary="Obsolete/worn-out property dispositions in ordinary course.",
    structuralHierarchy=["Article VII", "Section 7.5", "Section 7.5(a)"],
    localConditions=[
        cond("l1", "obsolete or worn out property", "IN_EXCEPTION_CLAUSE", "7.5(a)", "QUALITATIVE", None),
        cond("l2", "ordinary course of business", "IN_EXCEPTION_CLAUSE", "7.5(a)", "ORDINARY_COURSE", None),
    ],
    remoteConditions=[],
    entityScope={"includes": ["Parent Borrower", "Subsidiaries"], "excludes": [], "sourceSpan": None},
    verificationStatus="SOURCE_VERIFIED",
    isNegativeControl=True,
    negativeControlClass="LOCAL_CONDITIONS",
    notes="Local qualitative conditions; still CONDITIONAL.",
))

# ===========================================================================
# Post-process: fix exactExceptionText to match EXACT spans
# ===========================================================================
for r in records:
    sp = r["exceptionSourceSpan"]
    if sp["matchStatus"] == "EXACT":
        r["exactExceptionText"] = sp["exactText"]
    elif sp["matchStatus"] == "NORMALIZED_WHITESPACE":
        # Keep span exactText as authoritative quotation
        r["exactExceptionText"] = sp["exactText"]

# ===========================================================================
# Held-out independent GT (Riot 5.02) — hand inventory, not from an extractor
# ===========================================================================
held_out_gt = {
    "protocol": "Independent hand inventory of Riot §5.02 Negative Covenants from source text. Not generated by any automatic extractor under test.",
    "document": {
        "issuerKey": "RIOT",
        "sourcePath": SOURCES["riot"]["path"],
        "sourceSha256": SHAS["riot"],
    },
    "items": [
        {"gtId": "HO-RIOT-5.02-a", "kind": "PROHIBITION_WITH_EXCEPTIONS", "sectionRef": "5.02(a)", "summary": "Collateral Liens prohibition with (i)-(iv) exceptions"},
        {"gtId": "HO-RIOT-5.02-a-i", "kind": "EXCEPTION", "sectionRef": "5.02(a)(i)", "summary": "Collateral Agent Loan Document liens", "expectedClassification": "UNCONDITIONAL_SOURCE_VERIFIED"},
        {"gtId": "HO-RIOT-5.02-a-ii", "kind": "EXCEPTION", "sectionRef": "5.02(a)(ii)", "summary": "Tax liens with local contest/reserve conditions", "expectedClassification": "CONDITIONAL"},
        {"gtId": "HO-RIOT-5.02-a-iii", "kind": "EXCEPTION", "sectionRef": "5.02(a)(iii)", "summary": "Liens imposed by law ordinary course", "expectedClassification": "CONDITIONAL"},
        {"gtId": "HO-RIOT-5.02-a-iv", "kind": "EXCEPTION", "sectionRef": "5.02(a)(iv)", "summary": "Custodian Collateral Account liens", "expectedClassification": "UNCONDITIONAL_SOURCE_VERIFIED"},
        {"gtId": "HO-RIOT-5.02-b", "kind": "PROHIBITION_NO_EXCEPTION", "sectionRef": "5.02(b)", "summary": "No further negative pledges on Collateral"},
        {"gtId": "HO-RIOT-5.02-c", "kind": "PROHIBITION_NO_EXCEPTION", "sectionRef": "5.02(c)", "summary": "No sale of Collateral"},
        {"gtId": "HO-RIOT-5.02-d", "kind": "PROHIBITION_WITH_EXCEPTIONS", "sectionRef": "5.02(d)", "summary": "Mergers/consolidations with survivor conditions"},
    ],
}

# Simple deterministic detector (separate from hand catalog authorship): find 'except:' under 5.02(a)
riot_body_start = TEXTS["riot"].find("Section 5.02.Negative Covenants.")
riot_slice = TEXTS["riot"][riot_body_start: riot_body_start + 8000]
detected_exceptions = []
for m in re.finditer(r"\(([ivx]+)\)\s*([^\n]{10,200})", riot_slice):
    if m.start() > riot_slice.find("(a)Liens") and m.start() < riot_slice.find("(b)No Further"):
        detected_exceptions.append({"sectionHint": f"5.02(a)({m.group(1)})", "textPreview": m.group(2)[:120]})

# Compare detector to held-out exception items
gt_exception_refs = {i["sectionRef"] for i in held_out_gt["items"] if i["kind"] == "EXCEPTION"}
det_refs = {d["sectionHint"] for d in detected_exceptions}
# normalize (i) vs 5.02(a)(i)
det_norm = set()
for d in detected_exceptions:
    m = re.search(r"\(([ivx]+)\)", d["sectionHint"])
    if m:
        det_norm.add(f"5.02(a)({m.group(1)})")

tp = len(gt_exception_refs & det_norm)
fn = len(gt_exception_refs - det_norm)
fp = len(det_norm - gt_exception_refs)
recall = tp / len(gt_exception_refs) if gt_exception_refs else None

# Catalog coverage vs held-out for RIOT (hand catalog, not the detector)
catalog_riot_sections = {r["exceptionSectionRef"] for r in records if r["sourceIdentity"]["issuerKey"] == "RIOT"}
# Map approximate
catalog_hits = 0
for item in held_out_gt["items"]:
    if any(item["sectionRef"] in s or s in item["sectionRef"] for s in catalog_riot_sections):
        catalog_hits += 1

quality = {
    "artifact": "06-quality-metrics",
    "status": "PARTIAL_WITH_UNVERIFIED",
    "note": "Held-out GT is independently hand-authored for Riot §5.02. Detector metrics evaluate a minimal regex limb finder — not the hand catalog. Metrics that require a production extractor or multi-doc blind labels remain UNVERIFIED.",
    "heldOutDocument": held_out_gt["document"],
    "detector": {
        "name": "riot-5.02a-lettered-limb-regex",
        "detected": detected_exceptions,
        "truePositives": tp,
        "falseNegatives": fn,
        "falsePositives": fp,
        "exceptionDiscoveryRecall": recall,
        "falsePositiveExceptionDetection": fp,
    },
    "metrics": {
        "exceptionDiscoveryRecall": {"value": recall, "status": "MEASURED_ON_MINI_DETECTOR"},
        "falsePositiveExceptionDetection": {"value": fp, "status": "MEASURED_ON_MINI_DETECTOR"},
        "remoteConditionRecall": {"value": None, "status": "UNVERIFIED"},
        "provisoAttachmentAccuracy": {"value": None, "status": "UNVERIFIED"},
        "entityScopeAccuracy": {"value": None, "status": "UNVERIFIED"},
        "crossReferenceAccuracy": {"value": None, "status": "UNVERIFIED"},
        "incorrectUnconditionalPermissionRate": {
            "value": 0.0,
            "status": "MEASURED_ON_CATALOG_INVARIANT",
            "detail": "No catalog row with UNCONDITIONAL_SOURCE_VERIFIED may carry MONEY/RATIO/NO_DEFAULT local conditions; enforced in import adapter tests.",
        },
        "provenanceAccuracy": {
            "value": None,
            "status": "MEASURED_PARTIAL",
            "spanUnresolvedCount": len(span_failures),
            "spanResolvedExact": sum(1 for r in records if r["exceptionSourceSpan"]["matchStatus"] == "EXACT"),
            "spanNormalized": sum(1 for r in records if r["exceptionSourceSpan"]["matchStatus"] == "NORMALIZED_WHITESPACE"),
        },
        "handCatalogHeldOutSectionCoverage": {
            "value": catalog_hits / len(held_out_gt["items"]),
            "status": "INFORMATIONAL_NOT_EXTRACTOR_SCORE",
            "detail": "Hand catalog coverage of held-out items; not used as extractor credit.",
        },
    },
}

# ===========================================================================
# Document registry + acquisition plan (100/50 honesty)
# ===========================================================================
doc_registry = []
for k, meta in SOURCES.items():
    doc_registry.append({
        "registryId": k,
        "issuerKey": meta["issuerKey"],
        "issuerName": meta["issuerName"],
        "issuerTicker": meta.get("issuerTicker"),
        "issuerCik": meta.get("issuerCik"),
        "documentKind": meta["documentKind"],
        "sourcePath": meta["path"],
        "sourceSha256": SHAS[k],
        "byteLength": len(TEXTS[k].encode("utf-8", errors="replace")),
        "ingestionStatus": "INGESTED_FIXTURE",
        "phase1Source": k in {"conmed", "lsb", "fwrg"},
    })

issuers = sorted({d["issuerKey"] for d in doc_registry})
new_docs = [d for d in doc_registry if not d["phase1Source"]]

# CKF pilot tickers (copied as coordination targets — not downloaded here)
ckf_pilot_tickers = [
    "CAT","DE","MMM","EMR","ROK","DOV","PNR","IR","XYL","AME",
    "JNJ","ABT","MDT","BSX","SYK","CNMD","TFX","HOLX","BAX","DXCM",
    "WMT","TGT","COST","MCD","SBUX","YUM","DRI","CHWY","WSM","RH",
    "AAPL","MSFT","ORCL","IBM","CSCO","ADBE","CRM","NOW","PANW","NET",
    "XOM","CVX","COP","EOG","SLB","HAL","DVN","FANG","FCX","NEM",
]

acquisition_plan = {
    "artifact": "02-diversity-acquisition-plan",
    "targetAdditionalAgreements": 100,
    "targetIssuers": 50,
    "actualNewDocumentsIngestedThisPhase": len(new_docs),
    "actualNewIssuersIngestedThisPhase": len({d["issuerKey"] for d in new_docs}),
    "actualTotalIssuersInRegistry": len(issuers),
    "actualTotalDocumentsInRegistry": len(doc_registry),
    "phase1IssuersExcludedFromDiversityClaim": ["CNMD", "LXU", "FWRG"],
    "coordination": {
        "WS-EHB": {
            "pr": "https://github.com/egsul897/headroom/pull/142",
            "interface": "docs/edgar-historical-backfill/00-interface-contract.md (sibling branch)",
            "consume": "acquisition-queue.json items (QUEUED) — do not fork downloader",
            "status": "COORDINATION_DECLARED_QUEUE_NOT_MATERIALIZED_ON_THIS_BRANCH",
        },
        "WS-CKF": {
            "branch": "cursor/covenant-knowledge-factory-7327",
            "interface": "lib/knowledge-factory + scripts/knowledge-factory/download-documents.ts",
            "issuerSample": "PILOT_ISSUER_SEEDS (100 tickers)",
            "status": "COORDINATION_DECLARED_NO_BULK_BYTES_IN_GIT",
        },
    },
    "queuedIssuerTickersForCkfPilot": ckf_pilot_tickers,
    "queuedIssuerCount": len(ckf_pilot_tickers),
    "gapToTarget": {
        "agreementsStillNeeded": max(0, 100 - len(new_docs)),
        "issuersStillNeeded": max(0, 50 - len({d["issuerKey"] for d in new_docs})),
        "blocker": "On-disk fixtures only provide 5 new issuers / ~9 new docs beyond phase-1. Bulk EDGAR bytes must be acquired via CKF/EHB into gitignored local corpus, not committed.",
    },
    "indentures": {"ingested": 0, "status": "PENDING_CKF_ACQUISITION"},
    "amendmentsIngested": [d for d in new_docs if d["documentKind"] == "AMENDMENT"],
}

# Negative controls summary
nc_classes = {}
for r in records:
    if r.get("isNegativeControl"):
        nc_classes.setdefault(r.get("negativeControlClass"), []).append(r["exceptionId"])

negative_controls = {
    "artifact": "04-negative-controls",
    "selectionPrinciple": "Independently selected from source text to cover required control classes; not assumed all exceptions are conditional or unconditional.",
    "byClass": nc_classes,
    "counts": {k: len(v) for k, v in nc_classes.items()},
}

classification_counts = {}
for r in records:
    classification_counts[r["permissionClassification"]] = classification_counts.get(r["permissionClassification"], 0) + 1

local_only = [r["exceptionId"] for r in records if r["localConditions"] and not r["remoteConditions"]]
remote_only = [r["exceptionId"] for r in records if r["remoteConditions"] and not r["localConditions"]]
both = [r["exceptionId"] for r in records if r["localConditions"] and r["remoteConditions"]]
neither = [r["exceptionId"] for r in records if not r["localConditions"] and not r["remoteConditions"] and r["permissionClassification"] != "NOT_AN_AFFIRMATIVE_PERMISSION"]

manifest = {
    "datasetId": "negative-covenant-exception-database-phase2",
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
    "duplicateDetection": {"strategy": "sourceIdentityKey + exceptionId importKey"},
    "deterministicReplay": {"regenerator": "scripts/negative-covenant-exception-database/generate-phase2.py"},
    "actualRecordCounts": {
        "exceptions": len(records),
        "issuers": len(issuers),
        "documents": len(doc_registry),
        "negativeControls": sum(1 for r in records if r.get("isNegativeControl")),
        "localOnlyEconomicOrConditionRows": len(local_only),
        "remoteOnlyRows": len(remote_only),
    },
    "independentQualityMetrics": {
        "path": "docs/negative-covenant-exception-database/phase-2/06-quality-metrics.json",
        "status": quality["status"],
    },
    "nonGoals": [
        "No modifications to production covenant engines (lib/contract-model/**).",
        "No Claude-owned acceptance fixture modifications.",
        "No paid inference.",
        "No merges.",
        "No certification advancement.",
        "No sealed-evidence modifications.",
        "Labels are not automatic production capacity approvals.",
    ],
}

unresolved_legal = {
    "artifact": "08-unresolved-legal-questions",
    "questions": [
        {
            "id": "ULQ-1",
            "question": "When is definitional entity/instrument scope (Loan Party / Loan Document) a 'condition' versus mere object of an unconditional categorical exception?",
            "status": "OPEN",
            "workingRule": "Phase 2 records categorical no-quantum exceptions as UNCONDITIONAL_SOURCE_VERIFIED and places definitional scope in remoteConditions/entityScope — never as production capacity.",
        },
        {
            "id": "ULQ-2",
            "question": "How should Permitted Liens / Permitted Investments definitional inventories be exploded into exception rows without double-counting §6.02/§7.01 pointers?",
            "status": "OPEN",
        },
        {
            "id": "ULQ-3",
            "question": "What is the correct attachment of hanging provisos that follow an entire enumerated list when some limbs have their own provisos?",
            "status": "OPEN",
            "relatedPatterns": ["PAT-hanging-trailing-proviso"],
        },
        {
            "id": "ULQ-4",
            "question": "For Notes Priority Collateral / intercreditor-constrained sales, is the ABL exception UNCONDITIONAL as to the ABL or CONDITIONAL via external docs?",
            "status": "WORKING_ANSWER",
            "workingRule": "CONDITIONAL with EXTERNAL_DOCUMENT remote condition + unresolvedControllingSources.",
        },
        {
            "id": "ULQ-5",
            "question": "Amendment instruments: when does an amendment create a new exception identity versus supersede an existing one?",
            "status": "OPEN",
            "blocker": "Requires clause-level redline mapping (DSGR Fourth Amendment recorded as UNKNOWN).",
        },
    ],
}

integration = {
    "artifact": "09-integration-dependencies",
    "canonicalSchemaOwner": "WS-CKF (lib/knowledge-factory) + WS-PAR delivery/identity contracts",
    "deliveryContract": "docs/architecture/parallel-agents/06-dataset-delivery-contract.json (sibling PR #138)",
    "identityContract": "docs/architecture/parallel-agents/04-canonical-identity-contract.json (sibling PR #138)",
    "importAdapter": "lib/negative-covenant-exceptions/import-adapter.ts",
    "importReady": "ALIGNED_FOR_REVIEW",
    "doesNotWrite": [
        "Permission",
        "SharedCapacityConstraint",
        "lib/contract-model IR",
        "Phase-3 certification pins",
    ],
    "peers": {
        "WS-EHB": "https://github.com/egsul897/headroom/pull/142",
        "WS-CKF": "branch cursor/covenant-knowledge-factory-7327",
        "WS-PAR": "https://github.com/egsul897/headroom/pull/138",
        "WS-CKB": "held-out benchmark — do not contaminate",
    },
}

corpus_manifest = {
    **manifest,
    "classificationCounts": classification_counts,
    "localOnlyIds": local_only,
    "remoteOnlyIds": remote_only,
    "bothLocalAndRemoteIds": both,
    "noIdentifiableAdditionalConditionsIds": neither,
}

verdict = {
    "artifact": "99-phase-2-verdict",
    "verdict": "PHASE2_PARTIAL_READY_OFFLINE",
    "startingPr": 143,
    "diversityTargetMet": False,
    "diversityActual": {
        "newDocuments": len(new_docs),
        "newIssuers": len({d["issuerKey"] for d in new_docs}),
        "totalIssuers": len(issuers),
        "totalDocuments": len(doc_registry),
    },
    "records": len(records),
    "negativeControls": sum(1 for r in records if r.get("isNegativeControl")),
    "classificationCounts": classification_counts,
    "spanFailures": len(span_failures),
    "qualityStatus": quality["status"],
    "paidInference": False,
    "productionEngineUntouched": True,
    "certificationAdvancement": False,
    "sealedEvidenceUntouched": True,
}

# Write outputs
OUT.mkdir(parents=True, exist_ok=True)
(OUT / "catalogs").mkdir(exist_ok=True)
(OUT / "held-out").mkdir(exist_ok=True)
(OUT / "negative-controls").mkdir(exist_ok=True)

catalog = {
    "manifest": manifest,
    "exceptions": records,
    "indexes": {
        "byIssuer": {},
        "byClassification": {},
        "byFamily": {},
        "negativeControlIds": [r["exceptionId"] for r in records if r.get("isNegativeControl")],
        "localOnlyIds": local_only,
        "remoteOnlyIds": remote_only,
    },
}
for r in records:
    catalog["indexes"]["byIssuer"].setdefault(r["sourceIdentity"]["issuerKey"], []).append(r["exceptionId"])
    catalog["indexes"]["byClassification"].setdefault(r["permissionClassification"], []).append(r["exceptionId"])
    catalog["indexes"]["byFamily"].setdefault(r["covenantFamily"], []).append(r["exceptionId"])

(OUT / "catalogs" / "exceptions-v2.json").write_text(json.dumps(catalog, indent=2) + "\n")
(OUT / "corpus-manifest.json").write_text(json.dumps(corpus_manifest, indent=2) + "\n")
(OUT / "03-document-registry.json").write_text(json.dumps({"artifact": "03-document-registry", "documents": doc_registry, "issuers": issuers}, indent=2) + "\n")
(OUT / "02-diversity-acquisition-plan.json").write_text(json.dumps(acquisition_plan, indent=2) + "\n")
(OUT / "negative-controls" / "sample.json").write_text(json.dumps(negative_controls, indent=2) + "\n")
(OUT / "04-negative-controls.json").write_text(json.dumps(negative_controls, indent=2) + "\n")
(OUT / "held-out" / "riot-5.02-independent-gt.json").write_text(json.dumps(held_out_gt, indent=2) + "\n")
(OUT / "05-held-out-protocol.json").write_text(json.dumps({"artifact": "05-held-out-protocol", "heldOut": held_out_gt, "contaminationRule": "Do not tune extractor against this GT; CKB owns multi-package held-outs."}, indent=2) + "\n")
(OUT / "06-quality-metrics.json").write_text(json.dumps(quality, indent=2) + "\n")
(OUT / "07-source-span-audit.json").write_text(json.dumps({"artifact": "07-source-span-audit", "failures": span_failures, "failureCount": len(span_failures), "totalRecords": len(records)}, indent=2) + "\n")
(OUT / "08-unresolved-legal-questions.json").write_text(json.dumps(unresolved_legal, indent=2) + "\n")
(OUT / "09-integration-dependencies.json").write_text(json.dumps(integration, indent=2) + "\n")
(OUT / "01-classification-taxonomy.json").write_text(json.dumps({
    "artifact": "01-classification-taxonomy",
    "permissionClassification": [
        "CONDITIONAL",
        "UNCONDITIONAL_SOURCE_VERIFIED",
        "UNKNOWN",
        "NOT_AN_AFFIRMATIVE_PERMISSION",
    ],
    "separateFields": [
        "localConditions",
        "remoteConditions",
        "provisoAttachment",
        "entityScope",
        "financialTests",
        "sharedCapacityRestrictions",
        "amendmentAuthority",
        "unresolvedControllingSources",
    ],
    "notProductionCapacityApprovals": True,
}, indent=2) + "\n")
(OUT / "00-scope.json").write_text(json.dumps({
    "artifact": "00-scope",
    "mission": "NEGATIVE COVENANT EXCEPTION DATABASE PHASE 2",
    "startingPr": 143,
    "startingSha": "e2d7d20768fe4842c1b5be03c540443dc29588cd",
    "status": "OFFLINE_RESEARCH_MILESTONE_NOT_CERTIFIED",
}, indent=2) + "\n")
(OUT / "99-phase-2-verdict.json").write_text(json.dumps(verdict, indent=2) + "\n")

# Knowledge-factory export (import-ready rows; no production writes)
kf_export = {
    "datasetVersion": DATASET_VERSION,
    "workstreamId": "WS-NED",
    "representationLevelCeiling": "DETERMINISTICALLY_VALIDATED",
    "productionCapacityApproved": False,
    "records": [
        {
            "importKey": f"{r['sourceIdentity']['sourceIdentityKey']}::{r['exceptionId']}",
            "exceptionId": r["exceptionId"],
            "issuerKey": r["sourceIdentity"]["issuerKey"],
            "sourceIdentityKey": r["sourceIdentity"]["sourceIdentityKey"],
            "sourceSha256": r["sourceIdentity"]["sourceSha256"],
            "permissionClassification": r["permissionClassification"],
            "covenantFamily": r["covenantFamily"],
            "exactExceptionText": r["exactExceptionText"],
            "charStart": r["exceptionSourceSpan"]["charStart"],
            "charEnd": r["exceptionSourceSpan"]["charEnd"],
            "verificationStatus": r["verificationStatus"],
            "localConditionCount": len(r["localConditions"]),
            "remoteConditionCount": len(r["remoteConditions"]),
            "unresolvedControllingSources": [u["ref"] for u in r["unresolvedControllingSources"]],
        }
        for r in records
        if r["exceptionSourceSpan"]["matchStatus"] != "UNRESOLVED"
    ],
}
(OUT / "knowledge-factory-export.json").write_text(json.dumps(kf_export, indent=2) + "\n")

print(json.dumps(verdict, indent=2))
print("span_failures", len(span_failures))
for f in span_failures[:20]:
    print(" FAIL", f)