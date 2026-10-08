#!/usr/bin/env python3
"""Phase 3 challenger-defect remediation for amendment-chain research corpus."""
from __future__ import annotations

import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path("docs/amendment-chain-research")
now = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
ledger = json.loads((ROOT / "phase2/acquisition-ledger.json").read_text())
by_id = {d["docId"]: d for d in ledger["documents"]}


def layers(**kwargs):
    out = {
        "SOURCE_ACQUIRED": False,
        "TEXT_EXTRACTED": False,
        "AMENDMENT_EFFECT_MODELED": False,
        "OPERATIVE_STATE_RESOLVED": False,
        "INDEPENDENTLY_LEGALLY_VERIFIED": False,
    }
    out.update(kwargs)
    out["INDEPENDENTLY_LEGALLY_VERIFIED"] = False
    return out


INAP_DOCS = [
    ("inap-ca-orig", "ORIGINAL", "Credit Agreement", "2017-04-06"),
    ("inap-am1", "AMENDMENT", "First Amendment to Credit Agreement", None),
    ("inap-am2", "AMENDMENT", "Second Amendment to Credit Agreement", None),
    ("inap-am3", "AMENDMENT", "Third Amendment to Credit Agreement", None),
    ("inap-am4", "AMENDMENT", "Fourth Amendment to Credit Agreement", None),
    ("inap-am5", "AMENDMENT", "Fifth Amendment to Credit Agreement", None),
    ("inap-am6", "AMENDMENT", "Sixth Amendment to Credit Agreement", None),
    ("inap-am7", "AMENDMENT", "Seventh Amendment to Credit Agreement", "2019-10-29"),
]


def write(path: Path, obj) -> None:
    path.write_text(json.dumps(obj, indent=2) + "\n")


def main() -> None:
    # Internap before-after
    inap_ba = {
        "recordId": "ba-inap-am7-baskets-ratios",
        "chainId": "inap-2017-04-06-credit-agreement",
        "amendingDocId": "inap-am7",
        "generatedAt": now,
        "comparisons": [
            {
                "changeClass": "BASKET_AMOUNT",
                "target": {
                    "kind": "SECTION",
                    "sectionRef": "6.04(m)",
                    "covenantFamily": "INVESTMENTS",
                },
                "label": "General Investments basket narrowed",
                "beforeText": "(m) other Investments in an aggregate amount not to exceed on the date such Investments are made the greater of (x) $25,000,000 and (y) 30% of Consolidated EBITDA for the most recently ended Test Period as of such date;",
                "afterText": "(m) other Investments in an aggregate amount not to exceed on the date such Investments are made the greater of (x) $12,500,000 and (y) 15% of Consolidated EBITDA for the most recently ended Test Period as of such date;",
                "authority": {
                    "status": "SOURCE_BACKED_WITH_INTERVENING_GAP",
                    "before": {
                        "status": "SOURCE_BACKED",
                        "accession": "0001571049-17-003250",
                        "exhibit": "EX-10.1",
                        "docId": "inap-ca-orig",
                        "quote": "(m) other Investments in an aggregate amount not to exceed on the date such Investments are made the greater of (x) $25,000,000 and (y) 30% of Consolidated EBITDA for the most recently ended Test Period as of such date;",
                        "note": "Orig-era before-text. Am1–Am6 intervening changes to §6.04(m) not exhaustively verified — Am6-era certainty remains UNRESOLVED_DEPENDENCY.",
                    },
                    "after": {
                        "status": "SOURCE_BACKED",
                        "accession": "0001140361-19-019513",
                        "exhibit": "EX-10.1",
                        "docId": "inap-am7",
                        "quote": "Section 6.04(m) of the Credit Agreement is hereby amended and restated in its entirety as follows: [afterText]",
                    },
                },
                "adversarialTags": [
                    "PERMISSION_NARROWING",
                    "BASKET_AMOUNT_CHANGE",
                    "ACQUIRED_BUT_UNAPPLIED_INTERVENING",
                ],
            },
            {
                "changeClass": "BASKET_AMOUNT",
                "target": {
                    "kind": "SECTION",
                    "sectionRef": "6.01(k)",
                    "covenantFamily": "INDEBTEDNESS",
                },
                "label": "Foreign Subsidiary debt basket narrowed",
                "beforeText": "(k) Indebtedness of any Foreign Subsidiary in an aggregate outstanding principal amount for all such Foreign Subsidiaries in an amount not to exceed, at any time outstanding, the greater of (x) $15,000,000 and (y) 18% of Consolidated EBITDA for the most recently ended Test Period as of such time;",
                "afterText": "(k) Indebtedness of any Foreign Subsidiary in an aggregate outstanding principal amount for all such Foreign Subsidiaries in an amount not to exceed, at any time outstanding, the greater of (x) $5,000,000 and (y) 6% of Consolidated EBITDA for the most recently ended Test Period as of such time;",
                "authority": {
                    "status": "SOURCE_BACKED_WITH_INTERVENING_GAP",
                    "before": {
                        "status": "SOURCE_BACKED",
                        "accession": "0001571049-17-003250",
                        "exhibit": "EX-10.1",
                        "docId": "inap-ca-orig",
                        "quote": "(k) Indebtedness of any Foreign Subsidiary ... greater of (x) $15,000,000 and (y) 18% of Consolidated EBITDA ...",
                    },
                    "after": {
                        "status": "SOURCE_BACKED",
                        "accession": "0001140361-19-019513",
                        "exhibit": "EX-10.1",
                        "docId": "inap-am7",
                        "quote": "Section 6.01(k)... hereby amended and restated... greater of (x) $5,000,000 and (y) 6% of Consolidated EBITDA...",
                    },
                },
                "adversarialTags": [
                    "PERMISSION_NARROWING",
                    "BASKET_AMOUNT_CHANGE",
                    "ACQUIRED_BUT_UNAPPLIED_INTERVENING",
                ],
            },
            {
                "changeClass": "FINANCIAL_RATIO",
                "target": {
                    "kind": "SECTION",
                    "sectionRef": "6.10(a)",
                    "covenantFamily": "FINANCIAL_COVENANTS",
                },
                "label": "Total Net Leverage Ratio table reset",
                "beforeText": None,
                "afterText": "Test Period End Date Total Net Leverage Ratio: 12/31/19–12/31/20 7.25:1.00; 3/31/21 5.50:1.00; 6/30/21 5.00:1.00; 9/30/21 4.50:1.00; 12/31/21 and thereafter 4.50:1.00",
                "authority": {
                    "status": "SOURCE_BACKED",
                    "accession": "0001140361-19-019513",
                    "exhibit": "EX-10.1",
                    "gapReason": "Orig/Am1–Am6 §6.10(a) before-table not re-extracted this remediation; after-text SOURCE_BACKED from Am7.",
                },
                "adversarialTags": ["RATIO_CHANGE", "MULTI_COVENANT_FAMILY"],
            },
            {
                "changeClass": "FINANCIAL_RATIO",
                "target": {
                    "kind": "SECTION",
                    "sectionRef": "6.10(b)",
                    "covenantFamily": "FINANCIAL_COVENANTS",
                },
                "label": "Consolidated Interest Coverage Ratio table reset",
                "beforeText": None,
                "afterText": "Table restated beginning 12/31/19 at 1.60:1.00 stepping to 2.00:1.00 by 9/30/21 and thereafter (full rows in EX-10.1).",
                "authority": {
                    "status": "SOURCE_BACKED",
                    "accession": "0001140361-19-019513",
                    "exhibit": "EX-10.1",
                },
            },
        ],
        "multiFamilyNote": "Single amendment simultaneously touches Investments, Indebtedness, Asset Sales mechanics, and Financial Covenants — MULTI_COVENANT_FAMILY adversarial specimen.",
        "propagationDiscipline": {
            "documentAcquisition": "COMPLETE_ORIG_AM1_AM7",
            "amendmentOrdering": "RECITAL_SUPPORTED",
            "specificTextualAmendmentApplication": "AM7_BASKETS_AND_RATIOS_MODELED",
            "completeOperativeStateReconstruction": False,
            "unresolvedDependencies": [
                "Am1–Am6 intervening basket/definition diffs not exhaustively applied",
                "Am7 Effective Date condition satisfaction calendar",
            ],
        },
    }
    write(ROOT / "before-after/inap-am7-baskets-and-ratios.json", inap_ba)

    # DSGR $10M before-text
    dsgr_ba = json.loads((ROOT / "before-after/dsgr-am4-restricted-payments.json").read_text())
    dsgr_ba["comparisons"][0]["label"] = "General Restricted Payments basket restated ($10M → $25M)"
    dsgr_ba["comparisons"][0]["beforeText"] = (
        "otherwise permitted to be made by this Section 6.08 in an aggregate amount not to exceed "
        "$10,000,000 during any fiscal year of the Company so long as, in each case, all of the "
        "following conditions are satisfied: (x) no Default shall exist immediately prior to or "
        "immediately after giving effect to..."
    )
    dsgr_ba["comparisons"][0]["authority"] = {
        "status": "SOURCE_BACKED",
        "after": {
            "accession": "0001193125-25-070858",
            "exhibit": "EX-10.1",
            "docId": "dsgr-doc-c",
            "quote": "Section 6.08(a)(v) is hereby amended and restated in its entirety as follows: [afterText $25,000,000]",
        },
        "before": {
            "status": "SOURCE_BACKED",
            "docId": "dsgr-doc-b",
            "localFixturePath": "tests/fixtures/unseen-packages/dsgr-2022-2025-credit-facility/extracted-text/doc-b-2024-third-amendment.txt",
            "quote": "otherwise permitted to be made by this Section 6.08 in an aggregate amount not to exceed $10,000,000 during any fiscal year of the Company so long as, in each case, all of the following conditions are satisfied: (x) no Default shall exist",
        },
    }
    write(ROOT / "before-after/dsgr-am4-restricted-payments.json", dsgr_ba)

    dsgr_ua = json.loads((ROOT / "chains/dsgr-2022-credit/unresolved-authority.json").read_text())
    for c in dsgr_ua["cases"]:
        if c["id"] == "dsgr-ua-3":
            c["status"] = "SOURCE_BACKED_FROM_DOC_B"
            c["detail"] = (
                "Doc B supplies §6.08(a)(v) before-text at $10,000,000. Am2 wrapper remains MISSING_DOCUMENT."
            )
    write(ROOT / "chains/dsgr-2022-credit/unresolved-authority.json", dsgr_ua)

    dsgr_al = json.loads((ROOT / "authority-layers/dsgr-2022-04-01-ar-credit.json").read_text())
    dsgr_al["generatedAt"] = now
    for e in dsgr_al.get("events", []):
        if e.get("beforeText") == "MISSING_PRIOR_EXTRACTION" or e.get("docId") in (
            "dsgr-doc-c",
            "dsgr-am4",
        ):
            e["beforeText"] = "SOURCE_BACKED_DOC_B_$10M"
            e["beforeAuthority"] = (
                "tests/fixtures/unseen-packages/dsgr-2022-2025-credit-facility/extracted-text/doc-b-2024-third-amendment.txt"
            )
    write(ROOT / "authority-layers/dsgr-2022-04-01-ar-credit.json", dsgr_al)

    # AZZ terminology + before-after
    azz_ba = json.loads((ROOT / "before-after/azz-am4-applicable-margin.json").read_text())
    azz_ba["recordId"] = "ba-azz-am4-applicable-rate"
    azz_ba["comparisons"][0]["target"]["definedTerm"] = "Applicable Rate"
    azz_ba["comparisons"][0]["label"] = (
        "Initial Term Loan Applicable Rate multi-era grid (same definition amended across Am1/Am3/Am4)"
    )
    azz_ba["comparisons"][0]["authority"]["quote"] = (
        'Clause (a)(ii) of the definition of "Applicable Rate" is hereby amended and restated in its '
        "entirety to read as follows: [afterText]. Recital colloquial \"Applicable Margin\" is NOT the "
        "defined term amended."
    )
    azz_ba["notes"] = [
        'Operative defined term is Applicable Rate (Am4 §(b)). Recital uses colloquial Applicable Margin once — non-controlling.',
        "This is a single definition carrying the entire amendment-chain pricing history — query-date sensitive.",
        "Second Amendment is in the chain but does not appear as a pricing breakpoint in this Applicable Rate clause.",
        "Fourth Amendment Effective Date CONDITIONAL_UNRESOLVED — do not invent era subclause from execution/filing date.",
    ]
    write(ROOT / "before-after/azz-am4-applicable-margin.json", azz_ba)
    write(ROOT / "before-after/azz-am4-applicable-rate.json", azz_ba)

    vc005 = json.loads(
        (ROOT / "verification-candidates/VC-005-multi-era-definition-azz-margin.json").read_text()
    )
    vc005["purpose"] = (
        "Single Applicable Rate definition encodes four pricing eras keyed to First/Third/Fourth "
        'Amendment Effective Dates — multi-amendment same definition with query-date sensitivity. '
        'Recital colloquial "Applicable Margin" is non-controlling.'
    )
    vc005["expectedFailClosedBehavior"] = (
        "Operative Applicable Rate for a query date must select the correct era subclause (A)/(B)/(C)/(D). "
        "If a referenced Amendment Effective Date is CONDITIONAL_UNRESOLVED, the engine must not invent "
        "which subclause applies. Do not substitute the recital term Applicable Margin for the defined "
        "term Applicable Rate."
    )
    vc005["relatedBeforeAfter"] = (
        "docs/amendment-chain-research/before-after/azz-am4-applicable-rate.json"
    )
    vc005["definedTerm"] = "Applicable Rate"
    vc005["definedTermNote"] = (
        "Signed amend targets definition of Applicable Rate; recital Applicable Margin is colloquial only."
    )
    write(ROOT / "verification-candidates/VC-005-multi-era-definition-azz-margin.json", vc005)

    vc005spec = json.loads((ROOT / "test-specs/VC-005-spec.json").read_text())
    vc005spec = json.loads(json.dumps(vc005spec).replace("Applicable Margin", "Applicable Rate"))
    vc005spec["purpose"] = vc005["purpose"]
    vc005spec["expectedFailClosedBehavior"] = vc005["expectedFailClosedBehavior"]
    vc005spec["independentlyReviewedLegalGroundTruth"]["status"] = "PENDING_INDEPENDENT_REVIEW"
    vc005spec["sourceAuthorExpectation"]["notLegalGroundTruth"] = True
    write(ROOT / "test-specs/VC-005-spec.json", vc005spec)

    vc008 = json.loads(
        (ROOT / "verification-candidates/VC-008-basket-narrowing-inap-am7.json").read_text()
    )
    vc008["expectedFailClosedBehavior"] = (
        "Orig CA before-text for §6.04(m)/§6.01(k) is SOURCE_BACKED. Do not invent Am6-era levels from "
        "8-K narrative. Am1–Am6 intervening effects remain UNRESOLVED_DEPENDENCY — complete "
        "operative-state reconstruction must REVIEW_REQUIRED until verified. Am7 ED CONDITIONAL_UNRESOLVED."
    )
    write(ROOT / "verification-candidates/VC-008-basket-narrowing-inap-am7.json", vc008)
    vc008spec = json.loads((ROOT / "test-specs/VC-008-spec.json").read_text())
    vc008spec["expectedFailClosedBehavior"] = vc008["expectedFailClosedBehavior"]
    vc008spec["independentlyReviewedLegalGroundTruth"]["status"] = "PENDING_INDEPENDENT_REVIEW"
    write(ROOT / "test-specs/VC-008-spec.json", vc008spec)

    azz_al = json.loads(
        (ROOT / "authority-layers/azz-2022-05-13-credit-agreement.json").read_text()
    )
    azz_al["generatedAt"] = now
    for e in azz_al["events"]:
        if e.get("docId") == "azz-am4":
            e["targetsVerified"] = ["Applicable Rate"]
            e["definedTermNote"] = (
                "Operative term Applicable Rate; recital Applicable Margin non-controlling"
            )
            e["acquiredBody"] = "ACQUIRED"
            e["accession"] = "0000008947-24-000205"
            e["sha256"] = by_id["azz-am4"]["sha256"]
    write(ROOT / "authority-layers/azz-2022-05-13-credit-agreement.json", azz_al)

    azz_man = json.loads((ROOT / "chains/azz-2022-credit/manifest.json").read_text())
    azz_man = json.loads(json.dumps(azz_man).replace("Applicable Margin", "Applicable Rate"))
    azz_man["instrument"]["identityNotes"] = [
        "Fourth Amendment preamble enumerates First (Aug 17, 2023), Second (Dec 20, 2023), and Third (Mar 20, 2024) Amendments.",
        "Applicable Rate definition in Fourth Amendment encodes the multi-amendment pricing history in a single definition.",
        "Recital colloquial Applicable Margin is non-controlling; signed amend targets Applicable Rate.",
    ]
    for doc in azz_man["documents"]:
        if doc["docId"] == "azz-am4":
            doc["notes"] = [
                "Primary research value: multi-era Applicable Rate definition.",
                f"Phase-3 ACQUIRED sha256 {by_id['azz-am4']['sha256'][:12]}…",
            ]
            doc["authorityLayerStates"] = layers(
                SOURCE_ACQUIRED=True,
                TEXT_EXTRACTED=True,
                AMENDMENT_EFFECT_MODELED=True,
                OPERATIVE_STATE_RESOLVED=False,
            )
        else:
            doc["authorityLayerStates"] = layers(
                SOURCE_ACQUIRED=doc["retrievalStatus"] == "RETRIEVED",
                TEXT_EXTRACTED=False,
                AMENDMENT_EFFECT_MODELED=False,
                OPERATIVE_STATE_RESOLVED=False,
            )
    azz_man["authorityPolicy"]["notes"] = [
        "Applicable Rate after-text is SOURCE_BACKED from Fourth Amendment.",
        "Per-amendment intermediate before-text for Am1/Am3 pricing relies on the Fourth Amendment's own historical recounting in the restated definition.",
        "First/Third/Fourth Amendment Effective Dates CONDITIONAL_UNRESOLVED.",
    ]
    write(ROOT / "chains/azz-2022-credit/manifest.json", azz_man)

    for rel in [
        "chains/azz-2022-credit/chronology-graph.json",
        "chains/azz-2022-credit/unresolved-authority.json",
        "as-of-scenarios/all-chains.json",
        "adversarial-index.json",
    ]:
        p = ROOT / rel
        obj = json.loads(p.read_text())
        s = json.dumps(obj).replace("Applicable Margin", "Applicable Rate")
        if "adversarial-index" in rel:
            s = s.replace("ba-azz-am4-applicable-margin", "ba-azz-am4-applicable-rate")
        write(p, json.loads(s))

    # CONMED parent instrument correction
    cnmd_al = json.loads(
        (ROOT / "authority-layers/cnmd-seventh-ar-to-eighth-ar.json").read_text()
    )
    cnmd_al["generatedAt"] = now
    for e in cnmd_al.get("events", []):
        if e.get("docId") in ("cnmd-second-am-2022", "cnmd-am2"):
            e["parentInstrument"] = "cnmd-seventh-ar"
            e["intermediateState"] = "cnmd-am1-2022"
            e["parent"] = "cnmd-seventh-ar"
            e["parentNote"] = (
                "Parent instrument is Seventh A&R; Am1 is intermediate state (post-Am1 $75M), not the amended instrument identity."
            )
        if e.get("docId") == "cnmd-seventh-ar":
            e["acquiredBody"] = "ACQUIRED"
            e["authorityLayerStates"] = layers(
                SOURCE_ACQUIRED=True,
                TEXT_EXTRACTED=True,
                AMENDMENT_EFFECT_MODELED=False,
                OPERATIVE_STATE_RESOLVED=False,
            )
    write(ROOT / "authority-layers/cnmd-seventh-ar-to-eighth-ar.json", cnmd_al)

    # Internap authority layer
    inap_al = {
        "chainId": "inap-2017-04-06-credit-agreement",
        "generatedAt": now,
        "discipline": {
            "recitalIsNotOperativeText": True,
            "eightKSummaryIsNotOperativeText": True,
            "levels": [
                "DISCOVERED_AMENDMENT_EVENT",
                "ACQUIRED_AMENDMENT_BODY",
                "ACQUIRED_INCORPORATED_EXHIBITS",
                "VERIFIED_PARENT_INSTRUMENT",
                "VERIFIED_AMENDMENT_TARGET",
                "VERIFIED_EFFECTIVE_DATE_CONDITIONS",
                "VERIFIED_BEFORE_TEXT",
                "VERIFIED_AFTER_TEXT",
                "INDEPENDENTLY_REVIEWED_LEGAL_EFFECT",
            ],
        },
        "events": [],
    }
    prev = None
    for doc_id, *_ in INAP_DOCS:
        e = {
            "docId": doc_id,
            "discoveredEvent": doc_id != "inap-ca-orig",
            "acquiredBody": "ACQUIRED",
            "parent": prev,
            "parentInstrument": "inap-ca-orig" if doc_id != "inap-ca-orig" else None,
            "authorityLayerStates": layers(
                SOURCE_ACQUIRED=True,
                TEXT_EXTRACTED=doc_id in ("inap-ca-orig", "inap-am7"),
                AMENDMENT_EFFECT_MODELED=doc_id == "inap-am7",
                OPERATIVE_STATE_RESOLVED=False,
            ),
            "independentReview": "PENDING_INDEPENDENT_REVIEW",
        }
        if doc_id == "inap-ca-orig":
            e["beforeText"] = "SOURCE_BACKED_FOR_604m_601k"
        if doc_id == "inap-am7":
            e["targetsVerified"] = ["6.04(m)", "6.01(k)", "6.10"]
            e["afterText"] = "SOURCE_BACKED"
            e["beforeText"] = "SOURCE_BACKED_ORIG_ERA_WITH_INTERVENING_GAP"
            e["effectiveDate"] = {
                "status": "CONDITIONAL_UNRESOLVED",
                "conditionsVerified": False,
            }
        inap_al["events"].append(e)
        prev = doc_id
    write(ROOT / "authority-layers/inap-2017-04-06-credit-agreement.json", inap_al)

    # KF export
    exp = json.loads(
        (ROOT / "knowledge-factory-export/amendment-chains-export.json").read_text()
    )
    exp["generatedAt"] = now
    if "azz-2022-05-13-credit-agreement" not in exp["chainIdentities"]:
        exp["chainIdentities"].append("azz-2022-05-13-credit-agreement")
    exp["chainIdentities"] = sorted(set(exp["chainIdentities"]))

    azz4 = by_id["azz-am4"]
    azz_entry = {
        "sourceId": f"edgar:{azz4['accession']}:{azz4['filename']}",
        "cik": azz4["cik"],
        "accessionNumber": azz4["accession"],
        "filename": azz4["filename"],
        "sourceUri": azz4["sourceUri"],
        "documentClass": "AMENDMENT",
        "instrumentIdentity": "azz-2022-05-13-credit-agreement",
        "researchDocId": "azz-am4",
        "originalBytesHash": azz4["sha256"],
        "byteLength": azz4["byteLength"],
        "acquisitionStatus": "ACQUIRED",
        "title": azz4["title"],
        "definedTermAmended": "Applicable Rate",
        "definedTermRecitalColloquial": "Applicable Margin",
        "effectiveDateStatus": "CONDITIONAL_UNRESOLVED",
        "independentReview": "PENDING_INDEPENDENT_REVIEW",
    }
    found = False
    for i, d in enumerate(exp["documents"]):
        if d.get("researchDocId") == "azz-am4":
            exp["documents"][i] = azz_entry
            found = True
    if not found:
        exp["documents"].append(azz_entry)

    for doc in azz_man["documents"]:
        if doc["docId"] == "azz-am4":
            continue
        if any(d.get("researchDocId") == doc["docId"] for d in exp["documents"]):
            continue
        exp["documents"].append(
            {
                "sourceId": f"edgar:{doc['accession']}:{Path(doc['sourceUrl']).name}",
                "cik": "0000008947",
                "accessionNumber": doc["accession"],
                "filename": Path(doc["sourceUrl"]).name,
                "sourceUri": doc["sourceUrl"],
                "documentClass": doc["role"],
                "instrumentIdentity": "azz-2022-05-13-credit-agreement",
                "researchDocId": doc["docId"],
                "originalBytesHash": None,
                "byteLength": None,
                "acquisitionStatus": "PHASE1_RETRIEVED_HASH_PENDING",
                "title": doc["title"],
                "effectiveDateStatus": doc["effectiveDateProvision"]["status"],
                "notes": "Phase-1 retrieval claimed; Am4 hashed in Phase 3. Hash pending re-fetch — do not invent.",
                "independentReview": "PENDING_INDEPENDENT_REVIEW",
            }
        )

    links = exp.get("parentChildAuthorityLinks", [])
    have = {(l.get("child"), l.get("parent")) for l in links}
    for child, parent in [
        ("azz-am1", "azz-ca-orig"),
        ("azz-am2", "azz-am1"),
        ("azz-am3", "azz-am2"),
        ("azz-am4", "azz-am3"),
    ]:
        if (child, parent) not in have:
            links.append(
                {
                    "chainId": "azz-2022-05-13-credit-agreement",
                    "child": child,
                    "parent": parent,
                    "parentInstrument": "azz-ca-2022-05-13",
                    "kind": "AMENDS",
                    "authorityStatus": "SOURCE_BACKED_SEQUENCE",
                    "effectiveDateStatus": "CONDITIONAL_UNRESOLVED",
                    "note": "Prior-amendment doc encodes sequence; parent instrument identity remains azz-ca-2022-05-13",
                }
            )

    for l in links:
        if l.get("child") in ("cnmd-second-am-2022", "cnmd-am2") and l.get("parent") in (
            "cnmd-am1-2022",
        ):
            l["parentInstrument"] = "cnmd-seventh-ar"
            l["intermediateState"] = "cnmd-am1-2022"
            l["parent"] = "cnmd-seventh-ar"
            l["note"] = (
                "Parent instrument = Seventh A&R; Am1 is intermediate state, not amended-instrument identity"
            )
            l["authorityStatus"] = "SOURCE_BACKED_PARENT_INSTRUMENT"

    if not any(
        l.get("child") in ("cnmd-second-am-2022", "cnmd-am2")
        and l.get("parent") == "cnmd-seventh-ar"
        for l in links
    ):
        links.append(
            {
                "chainId": "cnmd-seventh-ar-to-eighth-ar",
                "child": "cnmd-second-am-2022",
                "parent": "cnmd-seventh-ar",
                "intermediateState": "cnmd-am1-2022",
                "kind": "AMENDS",
                "authorityStatus": "SOURCE_BACKED_PARENT_INSTRUMENT",
                "note": "Requires post-Am1 $75M state; wrong-parent if applied to unamended $25M Seventh text",
            }
        )

    prev = None
    have = {(l.get("child"), l.get("parent")) for l in links}
    for doc_id, *_ in INAP_DOCS:
        if prev and (doc_id, prev) not in have:
            links.append(
                {
                    "chainId": "inap-2017-04-06-credit-agreement",
                    "child": doc_id,
                    "parent": prev,
                    "parentInstrument": "inap-ca-orig",
                    "kind": "AMENDS",
                    "authorityStatus": "RECITAL_SUPPORTED_SEQUENCE",
                    "note": "Sequence ≠ complete operative application of intervening amendments",
                }
            )
        prev = doc_id

    exp["parentChildAuthorityLinks"] = links
    exp["provisionLevelOperations"] = [
        {
            "chainId": "azz-2022-05-13-credit-agreement",
            "docId": "azz-am4",
            "target": "Applicable Rate",
            "op": "RESTATE_DEFINITION_CLAUSE",
            "beforeStatus": "HISTORICAL_RECOUNT_IN_AM4",
            "afterStatus": "SOURCE_BACKED",
            "effectiveDateStatus": "CONDITIONAL_UNRESOLVED",
            "independentReview": "PENDING_INDEPENDENT_REVIEW",
        },
        {
            "chainId": "inap-2017-04-06-credit-agreement",
            "docId": "inap-am7",
            "target": "6.04(m)",
            "op": "RESTATE_SECTION",
            "beforeStatus": "SOURCE_BACKED_ORIG_ERA",
            "afterStatus": "SOURCE_BACKED",
            "interveningAm1Am6": "UNRESOLVED_DEPENDENCY",
            "effectiveDateStatus": "CONDITIONAL_UNRESOLVED",
            "independentReview": "PENDING_INDEPENDENT_REVIEW",
        },
        {
            "chainId": "inap-2017-04-06-credit-agreement",
            "docId": "inap-am7",
            "target": "6.01(k)",
            "op": "RESTATE_SECTION",
            "beforeStatus": "SOURCE_BACKED_ORIG_ERA",
            "afterStatus": "SOURCE_BACKED",
            "interveningAm1Am6": "UNRESOLVED_DEPENDENCY",
            "effectiveDateStatus": "CONDITIONAL_UNRESOLVED",
            "independentReview": "PENDING_INDEPENDENT_REVIEW",
        },
        {
            "chainId": "dsgr-2022-04-01-ar-credit",
            "docId": "dsgr-doc-c",
            "target": "6.08(a)(v)",
            "op": "RESTATE_SECTION",
            "beforeStatus": "SOURCE_BACKED_$10M_DOC_B",
            "afterStatus": "SOURCE_BACKED_$25M",
            "deemedEffectDate": "2025-01-01",
            "effectiveDateStatus": "CONDITIONAL_UNRESOLVED",
            "independentReview": "PENDING_INDEPENDENT_REVIEW",
        },
    ]
    exp["missingAuthority"] = [
        {
            "chainId": "dsgr-2022-04-01-ar-credit",
            "item": "dsgr-am2-wrapper-text",
            "status": "MISSING_DOCUMENT",
        },
        {
            "chainId": "matw-2020-03-27-third-ar-loan",
            "item": "am1-am6-effective-date-calendars",
            "status": "CONDITIONAL_UNRESOLVED",
        },
        {
            "chainId": "cohr-2022-07-01-credit-agreement",
            "item": "am4-am5-effective-date-calendars",
            "status": "CONDITIONAL_UNRESOLVED",
        },
        {
            "chainId": "azz-2022-05-13-credit-agreement",
            "item": "am1-am3-am4-effective-date-calendars",
            "status": "CONDITIONAL_UNRESOLVED",
        },
        {
            "chainId": "inap-2017-04-06-credit-agreement",
            "item": "am1-am6-basket-propagation",
            "status": "UNRESOLVED_DEPENDENCY",
        },
        {
            "chainId": "inap-2017-04-06-credit-agreement",
            "item": "am7-effective-date-calendar",
            "status": "CONDITIONAL_UNRESOLVED",
        },
        {
            "chainId": "azz-2022-05-13-credit-agreement",
            "item": "azz-orig-am1-am2-am3-byte-hashes",
            "status": "HASH_PENDING",
        },
    ]
    exp["verificationStatus"] = "PENDING_INDEPENDENT_REVIEW"
    blob = "".join(
        sorted(f"{d['researchDocId']}:{d.get('originalBytesHash') or ''}" for d in exp["documents"])
    )
    exp["idempotencyKey"] = (
        "amendment-chain-research-phase3-" + hashlib.sha256(blob.encode()).hexdigest()[:16]
    )
    write(ROOT / "knowledge-factory-export/amendment-chains-export.json", exp)

    sc = json.loads((ROOT / "phase2/source-completeness.json").read_text())
    sc["generatedAt"] = now
    for c in sc["chains"]:
        if c["chainId"] == "inap-2017-04-06-credit-agreement":
            c["status"] = "BODIES_ACQUIRED_PROPAGATION_INCOMPLETE"
            c["acquired"] = "orig+Am1-Am7"
            c["gaps"] = [
                "Am1–Am6 basket/definition propagation not exhaustively modeled",
                "Am7 Effective Date calendar unresolved",
                "§6.10 before-tables not re-extracted",
            ]
        if c["chainId"] == "azz-2022-05-13-credit-agreement":
            c["status"] = "PARTIAL_AM4_HASHED_EXPORT_INCLUDED"
            c["acquired"] = (
                "Am4 hashed Phase3; orig+Am1-3 Phase1 retrieval claimed (hashes pending)"
            )
            c["gaps"] = [
                "ED calendars unresolved",
                "Am2 non-pricing targets not fully logged",
                "orig/Am1-3 content hashes pending",
            ]
        if c["chainId"] == "cnmd-seventh-ar-to-eighth-ar":
            c["gaps"] = [
                g for g in c.get("gaps", []) if "Seventh" not in g and "MISSING" not in g
            ]
            if "Am1/Am2/Omnibus ED calendars unresolved" not in c["gaps"]:
                c["gaps"].append("Am1/Am2/Omnibus ED calendars unresolved")
        if c["chainId"] == "dsgr-2022-04-01-ar-credit":
            c["gaps"] = [
                "Am2 text wrapper MISSING (image EX-10.1; 10-Q narrative not operative)",
                "Am4 ED condition calendar unresolved (deemed Jan 1 attaches only once ED occurs)",
            ]
    write(ROOT / "phase2/source-completeness.json", sc)

    print("phase3 remediation complete")


if __name__ == "__main__":
    main()
