#!/usr/bin/env python3
"""Generate the offline negative-covenant exception database catalog.

Research-only. Output under docs/negative-covenant-exception-database/.
Never imported by lib/contract-model/**.
"""
from __future__ import annotations

import json
import hashlib
from pathlib import Path

ROOT = Path("/workspace")
OUT = ROOT / "docs/negative-covenant-exception-database"

CONMED = "tests/fixtures/unseen-packages/conmed-2025-credit-facility/curated/base-credit-agreement-article-vii-negative-covenants.txt"
LSB = "tests/fixtures/unseen-packages/lsb-2023-abl-credit-agreement/article-6-negative-covenants.txt"
FWRG = "tests/fixtures/unseen-packages/fwrg-2021-credit-agreement/article-6-negative-covenants.txt"

SHAS = {
    "conmed": "be76b638c6ff85b89a99582038f29057ca92e7b0840ea40bf9e0e65d2462aade",
    "lsb": "3a175ce17390e13f7abbcc703dfe1c58b42d881d8e8fdb48a2ab70be59f65ca8",
    "fwrg": "ec183906d99bed71bdec811f0f11c0151e2caf87c1967e09b8d89188d2904d23",
}


def cond(cid, text, location, location_ref, hint):
    return {
        "conditionId": cid,
        "text": text,
        "location": location,
        "locationRef": location_ref,
        "computableHint": hint,
    }


def amt(kind, value, basis=None):
    o = {"kind": kind, "value": value}
    if basis:
        o["measurementBasis"] = basis
    return o


def xref(target, role):
    return {"targetRef": target, "role": role}


def remote(kind, description):
    return {"kind": kind, "description": description}


def shared(kind, description, related):
    return {"kind": kind, "description": description, "relatedRefs": related}


def proviso(text, attachment, scope_note):
    return {"text": text, "attachment": attachment, "scopeNote": scope_note}


def rec(**kwargs):
    # Mission invariant: never treat an exception as unconditional capacity.
    kwargs.setdefault("unconditionalCapacity", False)
    kwargs.setdefault("amendments", [{"documentRef": "base", "effect": "none noted in curated NC excerpt", "status": "NONE_NOTED"}])
    kwargs.setdefault("seeminglyPermissiveButConstrained", bool(kwargs.get("remoteConstraintFlags")))
    return kwargs


records = []

# ---------------------------------------------------------------------------
# CONMED — Article VII chapeau (applies to all §7.x)
# ---------------------------------------------------------------------------
ARTICLE_VII_CHAPEAU = (
    "the Parent Borrower shall not, and shall not permit any of its Subsidiaries to, "
    "directly or indirectly:"
)

records.append(rec(
    exceptionId="conmed-7.2-c-liens-secured-debt-pro-forma-7.1",
    sourcePackage="conmed-2025-credit-facility",
    sourcePath=CONMED,
    sourceSha256=SHAS["conmed"],
    covenantFamily="DEBT_INCURRENCE",
    parentProhibition={
        "sectionRef": "7.2",
        "text": "Create, incur, assume or suffer to exist any Indebtedness, except:",
    },
    exceptionSectionRef="7.2(c)",
    exactExceptionText=(
        "Indebtedness secured by Liens permitted by Section 7.3(g); provided that the Parent Borrower "
        "shall be in compliance, on a pro forma basis after giving effect to the incurrence of such "
        "Indebtedness, with the financial covenants contained in Section 7.1 recomputed as at the last "
        "day of the most recently ended fiscal quarter of the Parent Borrower and its Subsidiaries for "
        "which financial statements are available as if such Indebtedness had been incurred on the first "
        "day of each relevant period for testing such compliance;"
    ),
    structuralHierarchy=["Article VII", "Section 7.2", "Section 7.2(c)"],
    definedTerms=["Indebtedness", "Liens", "Parent Borrower", "Subsidiaries"],
    conditions=[
        cond("c1", "secured by Liens permitted by Section 7.3(g)", "CROSS_REFERENCED_SECTION", "7.3(g)", "OTHER_RULE"),
        cond("c2", "pro forma compliance with financial covenants in Section 7.1", "CROSS_REFERENCED_SECTION", "7.1", "RATIO"),
        cond("c3", ARTICLE_VII_CHAPEAU, "ARTICLE_LEVEL", "Article VII chapeau", "ENTITY"),
    ],
    amountsAndRatios=[],
    entityScope={"includes": ["Parent Borrower", "Subsidiaries"], "excludes": []},
    sharedCapacityInteractions=[
        shared("CLASSIFY_RECLASSIFY", "Section 7.2 trailing classify/reclassify authority applies to (a)-(s)", ["7.2 trailing paragraph"]),
    ],
    provisos=[proviso("provided that the Parent Borrower shall be in compliance, on a pro forma basis ... with ... Section 7.1", "OWN_CLAUSE", "Pro-forma 7.1 gate is inside the exception but points outside the clause.")],
    crossReferences=[xref("7.3(g)", "lien-permission prerequisite"), xref("7.1", "pro-forma financial covenant gate")],
    remoteConstraintFlags=[
        remote("CROSS_SECTION_CONDITION", "Capacity exists only if §7.3(g) Liens are available and §7.1 covenants are met on a pro forma basis."),
        remote("ARTICLE_LEVEL", "Article VII chapeau entity scope (Parent Borrower + Subsidiaries) binds every basket."),
    ],
    capacityShape="UNLIMITED_GATED",
    verificationStatus="SOURCE_VERIFIED",
    notes="Classic remote-condition basket: the exception text looks like a debt permission, but usable capacity depends on a Liens carve-out and Article VII financial covenants outside §7.2(c).",
))

records.append(rec(
    exceptionId="conmed-7.2-d-finance-leases-greater-of",
    sourcePackage="conmed-2025-credit-facility",
    sourcePath=CONMED,
    sourceSha256=SHAS["conmed"],
    covenantFamily="DEBT_INCURRENCE",
    parentProhibition={"sectionRef": "7.2", "text": "Create, incur, assume or suffer to exist any Indebtedness, except:"},
    exceptionSectionRef="7.2(d)",
    exactExceptionText=(
        "Finance Lease Obligations in an aggregate principal amount not to exceed the greater of (x) $50,000,000 "
        "and (y) 3.0% of Consolidated Total Assets (measured on the date of incurrence of such Finance Lease "
        "Obligations) at any one time outstanding;"
    ),
    structuralHierarchy=["Article VII", "Section 7.2", "Section 7.2(d)"],
    definedTerms=["Finance Lease Obligations", "Consolidated Total Assets"],
    conditions=[cond("c1", ARTICLE_VII_CHAPEAU, "ARTICLE_LEVEL", "Article VII chapeau", "ENTITY")],
    amountsAndRatios=[
        amt("FIXED_MONEY", "$50,000,000"),
        amt("PERCENT_OF", "3.0%", "Consolidated Total Assets at incurrence"),
        amt("AGGREGATION", "greater of (x)/(y) at any one time outstanding"),
    ],
    entityScope={"includes": ["Parent Borrower", "Subsidiaries"], "excludes": []},
    sharedCapacityInteractions=[
        shared("CLASSIFY_RECLASSIFY", "May be reclassified among 7.2 baskets under trailing paragraph", ["7.2 trailing paragraph"]),
    ],
    provisos=[],
    crossReferences=[],
    remoteConstraintFlags=[remote("ARTICLE_LEVEL", "Article VII chapeau binds entity scope.")],
    capacityShape="GREATER_OF_MONEY_OR_PCT",
    verificationStatus="SOURCE_VERIFIED",
    notes="Quantified greater-of basket; still not unconditional because of Article VII chapeau and classify/reclassify interactions.",
))

records.append(rec(
    exceptionId="conmed-7.2-k-foreign-sub-debt",
    sourcePackage="conmed-2025-credit-facility",
    sourcePath=CONMED,
    sourceSha256=SHAS["conmed"],
    covenantFamily="DEBT_INCURRENCE",
    parentProhibition={"sectionRef": "7.2", "text": "Create, incur, assume or suffer to exist any Indebtedness, except:"},
    exceptionSectionRef="7.2(k)",
    exactExceptionText=(
        "Indebtedness of any Foreign Subsidiary or Foreign Subsidiary Holdco to the Parent Borrower or any other "
        "Subsidiary (so long as no Default or Event of Default shall have occurred and be continuing at the time "
        "of the incurrence of such Indebtedness); provided that (i) the requirements of Section 6.9 are satisfied "
        "and (ii) the aggregate principal amount of such Indebtedness at any time outstanding shall not exceed the "
        "greater of (A) $150,000,000 and (B) 10.0% of Consolidated Total Tangible Assets (measured on the date of "
        "incurrence of such Indebtedness); provided , further , that any Indebtedness permitted by this Section "
        "7.2(k) shall be evidenced by a note or similar instrument and pledged in accordance with Section 6.9 and "
        "the Guarantee and Collateral Agreement;"
    ),
    structuralHierarchy=["Article VII", "Section 7.2", "Section 7.2(k)"],
    definedTerms=["Foreign Subsidiary", "Foreign Subsidiary Holdco", "Consolidated Total Tangible Assets", "Default", "Event of Default"],
    conditions=[
        cond("c1", "no Default or Event of Default continuing at incurrence", "IN_EXCEPTION_CLAUSE", "7.2(k) so-long-as", "NO_DEFAULT"),
        cond("c2", "requirements of Section 6.9 are satisfied", "CROSS_REFERENCED_SECTION", "6.9", "OTHER_RULE"),
        cond("c3", "evidenced by note and pledged per Section 6.9 and GCA", "CROSS_REFERENCED_SECTION", "6.9 / Guarantee and Collateral Agreement", "OTHER_RULE"),
        cond("c4", ARTICLE_VII_CHAPEAU, "ARTICLE_LEVEL", "Article VII chapeau", "ENTITY"),
    ],
    amountsAndRatios=[
        amt("FIXED_MONEY", "$150,000,000"),
        amt("PERCENT_OF", "10.0%", "Consolidated Total Tangible Assets at incurrence"),
    ],
    entityScope={
        "includes": ["Foreign Subsidiary debtor", "Foreign Subsidiary Holdco debtor", "Parent Borrower / Subsidiary creditor"],
        "excludes": [],
        "notes": "Debtor class is foreign-side; creditor is Parent Borrower or any other Subsidiary.",
    },
    sharedCapacityInteractions=[],
    provisos=[
        proviso("provided that (i) Section 6.9 satisfied and (ii) greater-of cap", "OWN_CLAUSE", "Primary quantitative + affirmative covenant gate."),
        proviso("provided further that evidenced by note and pledged", "OWN_CLAUSE", "Collateralization/mechanics proviso outside the dollar math."),
    ],
    crossReferences=[xref("6.9", "affirmative collateral/pledge requirements"), xref("Guarantee and Collateral Agreement", "pledge mechanics")],
    remoteConstraintFlags=[
        remote("CROSS_SECTION_CONDITION", "§6.9 affirmative requirements and pledge mechanics are outside Article VII."),
        remote("ARTICLE_LEVEL", "Article VII chapeau binds."),
    ],
    capacityShape="GREATER_OF_MONEY_OR_PCT",
    verificationStatus="SOURCE_VERIFIED",
    notes="Dollar/percent cap is necessary but not sufficient; §6.9 and pledge mechanics outside the NC article constrain use.",
))

records.append(rec(
    exceptionId="conmed-7.2-l-permitted-unsecured",
    sourcePackage="conmed-2025-credit-facility",
    sourcePath=CONMED,
    sourceSha256=SHAS["conmed"],
    covenantFamily="DEBT_INCURRENCE",
    parentProhibition={"sectionRef": "7.2", "text": "Create, incur, assume or suffer to exist any Indebtedness, except:"},
    exceptionSectionRef="7.2(l)",
    exactExceptionText=(
        "(i) Permitted Unsecured Indebtedness; provided that (x) at the time of, and after giving effect to, the "
        "incurrence of such Indebtedness, no Default or Event of Default shall have occurred and be continuing and "
        "(y) the Parent Borrower shall be in compliance, on a pro forma basis after giving effect to the incurrence "
        "of such Indebtedness, with the financial covenant contained in Section 7.1(b) ... and (ii) any guarantee by "
        "any Subsidiary in respect of any Permitted Unsecured Indebtedness; provided that (x) no Subsidiary that is "
        "not a Loan Party shall guarantee any Permitted Unsecured Indebtedness and (y) any such guarantee in respect "
        "of Permitted Unsecured Indebtedness shall be unsecured;"
    ),
    structuralHierarchy=["Article VII", "Section 7.2", "Section 7.2(l)", "Section 7.2(l)(i)/(ii)"],
    definedTerms=["Permitted Unsecured Indebtedness", "Loan Party", "Default", "Event of Default"],
    conditions=[
        cond("c1", "no Default/EOD at and after incurrence", "IN_EXCEPTION_CLAUSE", "7.2(l)(i)(x)", "NO_DEFAULT"),
        cond("c2", "pro forma compliance with Section 7.1(b) Consolidated Total Leverage Ratio", "CROSS_REFERENCED_SECTION", "7.1(b)", "RATIO"),
        cond("c3", "non-Loan Party Subsidiaries may not guarantee", "IN_EXCEPTION_CLAUSE", "7.2(l)(ii)(x)", "ENTITY"),
        cond("c4", "guarantee must be unsecured", "IN_EXCEPTION_CLAUSE", "7.2(l)(ii)(y)", "QUALITATIVE"),
        cond("c5", "Permitted Unsecured Indebtedness defined-term gates", "DEFINED_TERM", "Permitted Unsecured Indebtedness", "QUALITATIVE"),
    ],
    amountsAndRatios=[amt("RATIO_REF", "Section 7.1(b) Consolidated Total Leverage Ratio (5.50:1.00 base; step-up mechanics elsewhere)")],
    entityScope={
        "includes": ["Parent Borrower (incurrence)", "Subsidiary guarantors that are Loan Parties"],
        "excludes": ["Subsidiary that is not a Loan Party (as guarantor)"],
    },
    sharedCapacityInteractions=[],
    provisos=[
        proviso("provided that (x) no Default and (y) pro forma 7.1(b)", "OWN_CLAUSE", "Incurs limb."),
        proviso("provided that (x) only Loan Party Subs may guarantee and (y) unsecured", "OWN_CLAUSE", "Guarantee limb."),
    ],
    crossReferences=[xref("7.1(b)", "pro-forma CTLR gate"), xref("Permitted Unsecured Indebtedness", "defined-term eligibility")],
    remoteConstraintFlags=[
        remote("DEFINED_TERM_GATE", "Named defined term may embed maturity, ranking, and other limits outside §7.2(l)."),
        remote("CROSS_SECTION_CONDITION", "§7.1(b) ratio lives outside the exception clause."),
    ],
    capacityShape="RATIO_GATED_UNLIMITED",
    verificationStatus="SOURCE_VERIFIED",
    notes="Appears uncapped in §7.2(l), but ratio gate + defined-term + guarantor entity limits remove unconditional capacity.",
))

records.append(rec(
    exceptionId="conmed-7.2-trailing-classify-reclassify",
    sourcePackage="conmed-2025-credit-facility",
    sourcePath=CONMED,
    sourceSha256=SHAS["conmed"],
    covenantFamily="DEBT_INCURRENCE",
    parentProhibition={"sectionRef": "7.2", "text": "Create, incur, assume or suffer to exist any Indebtedness, except:"},
    exceptionSectionRef="7.2 trailing paragraph",
    exactExceptionText=(
        "For purposes of determining compliance with this Section 7.2, (A) Indebtedness need not be permitted solely "
        "by reference to one category of permitted Indebtedness described in Section 7.2(a) through (s) but may be "
        "permitted in part under any combination thereof and (B) in the event that an item of Indebtedness (or any "
        "portion thereof) meets the criteria of one or more of the categories ... the Parent Borrower shall, in its "
        "sole discretion, classify or reclassify, or later divide, classify or reclassify, such item of Indebtedness "
        "... in any manner that complies with this Section 7.2 ..."
    ),
    structuralHierarchy=["Article VII", "Section 7.2", "Section 7.2 trailing compliance paragraph"],
    definedTerms=["Indebtedness"],
    conditions=[cond("c1", "classification must still comply with Section 7.2", "SECTION_WIDE_PROVISO", "7.2 trailing", "OTHER_RULE")],
    amountsAndRatios=[],
    entityScope={"includes": ["Parent Borrower (election rights)"], "excludes": []},
    sharedCapacityInteractions=[
        shared("CLASSIFY_RECLASSIFY", "Section-wide reclassification among 7.2(a)-(s); not free capacity", ["7.2(a)", "7.2(s)"]),
    ],
    provisos=[proviso("section-wide classify/reclassify authority", "SECTION_WIDE", "Hanging after enumerated baskets; applies to all of §7.2.")],
    crossReferences=[xref("7.2(a)-(s)", "member baskets")],
    remoteConstraintFlags=[remote("SECTION_WIDE_LIMITATION", "Trailing paragraph modifies every enumerated debt basket.")],
    capacityShape="NONE_QUALITATIVE",
    verificationStatus="SOURCE_VERIFIED",
    notes="Not itself a basket; a section-wide shared-capacity / classification interaction that must be attached to every §7.2 exception.",
))

# LIENS
records.append(rec(
    exceptionId="conmed-7.3-g-purchase-money-liens",
    sourcePackage="conmed-2025-credit-facility",
    sourcePath=CONMED,
    sourceSha256=SHAS["conmed"],
    covenantFamily="LIENS",
    parentProhibition={
        "sectionRef": "7.3",
        "text": "Create, incur, assume or suffer to exist any Lien upon any of its Property or revenues, whether now owned or hereafter acquired, except for:",
    },
    exceptionSectionRef="7.3(g)",
    exactExceptionText=(
        "Liens upon real and/or tangible personal Property acquired after the Closing Date (by purchase, construction "
        "or otherwise) by the Parent Borrower or any of its Subsidiaries, each of which Liens either (i) existed on "
        "such Property before the time of its acquisition and was not created in anticipation thereof or (ii) was "
        "created solely for the purpose of securing Indebtedness representing, or incurred to finance, refinance or "
        "refund, the cost (including the cost of construction) of such Property and permitted by Section 7.2; provided "
        "that (A) no such Lien shall extend to or cover any Property of the Parent Borrower or such Subsidiary other "
        "than the Property so acquired or financed, and (B) the principal amount of Indebtedness secured by any such "
        "Lien shall at no time exceed 80% of the fair market value (as determined in good faith by a Responsible "
        "Officer) of such Property at the time it was acquired (by purchase, construction or otherwise);"
    ),
    structuralHierarchy=["Article VII", "Section 7.3", "Section 7.3(g)"],
    definedTerms=["Liens", "Closing Date", "Indebtedness", "Responsible Officer"],
    conditions=[
        cond("c1", "secured Indebtedness permitted by Section 7.2", "CROSS_REFERENCED_SECTION", "7.2", "OTHER_RULE"),
        cond("c2", "Lien does not extend beyond acquired/financed Property", "IN_EXCEPTION_CLAUSE", "7.3(g)(A)", "QUALITATIVE"),
        cond("c3", "secured principal ≤ 80% FMV at acquisition", "IN_EXCEPTION_CLAUSE", "7.3(g)(B)", "MONEY"),
        cond("c4", ARTICLE_VII_CHAPEAU, "ARTICLE_LEVEL", "Article VII chapeau", "ENTITY"),
    ],
    amountsAndRatios=[amt("PERCENT_LTV", "80% of fair market value at acquisition")],
    entityScope={"includes": ["Parent Borrower", "Subsidiaries"], "excludes": []},
    sharedCapacityInteractions=[
        shared("CLASSIFY_RECLASSIFY", "7.3 trailing classify/reclassify among lien baskets", ["7.3 trailing paragraph"]),
    ],
    provisos=[proviso("provided that (A) no spread and (B) 80% LTV", "OWN_CLAUSE", "Both limbs gate the lien.")],
    crossReferences=[xref("7.2", "secured debt must be permitted debt"), xref("7.2(c)", "debt basket that itself depends on this lien basket")],
    remoteConstraintFlags=[
        remote("CROSS_SECTION_CONDITION", "Circular with §7.2(c): debt needs 7.3(g) liens; liens need 7.2-permitted debt."),
    ],
    capacityShape="NONE_QUALITATIVE",
    verificationStatus="SOURCE_VERIFIED",
    notes="Mutual dependence with §7.2(c) is a remote-constraint pattern; neither basket is free-standing capacity.",
))

records.append(rec(
    exceptionId="conmed-7.3-m-general-liens-basket",
    sourcePackage="conmed-2025-credit-facility",
    sourcePath=CONMED,
    sourceSha256=SHAS["conmed"],
    covenantFamily="LIENS",
    parentProhibition={"sectionRef": "7.3", "text": "Create, incur, assume or suffer to exist any Lien upon any of its Property or revenues... except for:"},
    exceptionSectionRef="7.3(m)",
    exactExceptionText=(
        "Liens not otherwise permitted by this Section 7.3 so long as neither (i) the aggregate outstanding principal "
        "amount of the obligations secured thereby nor (ii) the aggregate fair market value (determined as of the date "
        "such Lien is incurred) of the assets subject thereto exceeds (as to the Parent Borrower and all Subsidiaries) "
        "the greater of (A) $50,000,000 and (B) 3.0% of Consolidated Total Assets (measured on the date of incurrence "
        "of such Liens);"
    ),
    structuralHierarchy=["Article VII", "Section 7.3", "Section 7.3(m)"],
    definedTerms=["Consolidated Total Assets"],
    conditions=[
        cond("c1", "dual cap on secured obligations AND asset FMV", "IN_EXCEPTION_CLAUSE", "7.3(m)", "MONEY"),
        cond("c2", ARTICLE_VII_CHAPEAU, "ARTICLE_LEVEL", "Article VII chapeau", "ENTITY"),
    ],
    amountsAndRatios=[
        amt("FIXED_MONEY", "$50,000,000"),
        amt("PERCENT_OF", "3.0%", "Consolidated Total Assets"),
        amt("DUAL_TEST", "neither secured obligations nor asset FMV may exceed greater-of"),
    ],
    entityScope={"includes": ["Parent Borrower and all Subsidiaries (aggregate)"], "excludes": []},
    sharedCapacityInteractions=[
        shared("CLASSIFY_RECLASSIFY", "Subject to 7.3 trailing reclassification", ["7.3 trailing paragraph"]),
    ],
    provisos=[],
    crossReferences=[],
    remoteConstraintFlags=[remote("ARTICLE_LEVEL", "Article VII chapeau binds.")],
    capacityShape="GREATER_OF_MONEY_OR_PCT",
    verificationStatus="SOURCE_VERIFIED",
    notes="General liens basket with dual quantitative tests; residual 'not otherwise permitted' language interacts with sibling baskets.",
))

# ASSET SALES
records.append(rec(
    exceptionId="conmed-7.5-a-obsolete-ordinary-course",
    sourcePackage="conmed-2025-credit-facility",
    sourcePath=CONMED,
    sourceSha256=SHAS["conmed"],
    covenantFamily="ASSET_SALES",
    parentProhibition={
        "sectionRef": "7.5",
        "text": "Dispose of any of its Property or business ... or, in the case of any Subsidiary, issue or sell any shares of such Subsidiary's Capital Stock to any Person, except:",
    },
    exceptionSectionRef="7.5(a)",
    exactExceptionText="the Disposition of obsolete or worn out property in the ordinary course of business;",
    structuralHierarchy=["Article VII", "Section 7.5", "Section 7.5(a)"],
    definedTerms=["Disposition"],
    conditions=[
        cond("c1", "property is obsolete or worn out", "IN_EXCEPTION_CLAUSE", "7.5(a)", "QUALITATIVE"),
        cond("c2", "in the ordinary course of business", "IN_EXCEPTION_CLAUSE", "7.5(a)", "ORDINARY_COURSE"),
        cond("c3", ARTICLE_VII_CHAPEAU, "ARTICLE_LEVEL", "Article VII chapeau", "ENTITY"),
        cond("c4", "section-end Collateral release paragraph only after sale in accordance with Agreement", "SECTION_WIDE_PROVISO", "7.5 trailing release paragraph", "OTHER_RULE"),
    ],
    amountsAndRatios=[],
    entityScope={"includes": ["Parent Borrower", "Subsidiaries"], "excludes": []},
    sharedCapacityInteractions=[],
    provisos=[],
    crossReferences=[xref("7.5 trailing release paragraph", "Collateral release conditioned on compliant sale")],
    remoteConstraintFlags=[
        remote("SECTION_WIDE_LIMITATION", "Trailing Collateral-release paragraph conditions post-sale lien release on compliance with Agreement terms."),
    ],
    capacityShape="UNLIMITED_GATED",
    verificationStatus="SOURCE_VERIFIED",
    notes="Unlimited-looking carve-out; both qualitative gates are non-computable and must not be invented away. Known CONMED §7.5(a) honesty pattern.",
))

records.append(rec(
    exceptionId="conmed-7.5-f-asset-sale-dual-caps",
    sourcePackage="conmed-2025-credit-facility",
    sourcePath=CONMED,
    sourceSha256=SHAS["conmed"],
    covenantFamily="ASSET_SALES",
    parentProhibition={"sectionRef": "7.5", "text": "Dispose of any of its Property or business ... except:"},
    exceptionSectionRef="7.5(f)",
    exactExceptionText=(
        "any Asset Sale (including any sale and leaseback transactions permitted by Section 7.11) or Recovery Event; "
        "provided that (i) the aggregate fair market value of all assets sold in connection with Asset Sales in reliance "
        "on this clause (f) shall not exceed (x) 10% of Consolidated Total Assets ... in any fiscal year and (y) 20% of "
        "Consolidated Total Assets ... in the aggregate during any four-year rolling period and (ii) the aggregate amount "
        "of Consolidated EBITDA attributable to all assets sold ... shall not exceed (x) 7.5% of Consolidated EBITDA ... "
        "in any fiscal year and (y) 15% of Consolidated EBITDA ... during any four-year rolling period; provided , further , "
        "that the requirements of Section 2.12(b) are complied with in connection with such Asset Sale or Recovery Event;"
    ),
    structuralHierarchy=["Article VII", "Section 7.5", "Section 7.5(f)"],
    definedTerms=["Asset Sale", "Recovery Event", "Consolidated Total Assets", "Consolidated EBITDA"],
    conditions=[
        cond("c1", "CTA annual and four-year rolling caps", "IN_EXCEPTION_CLAUSE", "7.5(f)(i)", "MONEY"),
        cond("c2", "EBITDA contribution annual and four-year rolling caps", "IN_EXCEPTION_CLAUSE", "7.5(f)(ii)", "MONEY"),
        cond("c3", "Section 2.12(b) mandatory prepayment / proceeds requirements", "CROSS_REFERENCED_SECTION", "2.12(b)", "OTHER_RULE"),
        cond("c4", "sale-leasebacks only if also permitted by Section 7.11", "CROSS_REFERENCED_SECTION", "7.11", "OTHER_RULE"),
    ],
    amountsAndRatios=[
        amt("PERCENT_OF", "10% CTA / fiscal year"),
        amt("PERCENT_OF", "20% CTA / four-year rolling"),
        amt("PERCENT_OF", "7.5% Consolidated EBITDA / fiscal year"),
        amt("PERCENT_OF", "15% Consolidated EBITDA / four-year rolling"),
    ],
    entityScope={"includes": ["Parent Borrower", "Subsidiaries"], "excludes": []},
    sharedCapacityInteractions=[
        shared("SHARED_BASKET", "Dual CTA and EBITDA pools shared across all Asset Sales under clause (f)", ["7.5(f)"]),
    ],
    provisos=[
        proviso("provided that dual CTA/EBITDA caps", "OWN_CLAUSE", "Primary capacity gates."),
        proviso("provided further that Section 2.12(b) complied with", "OWN_CLAUSE", "Remote proceeds application gate."),
    ],
    crossReferences=[xref("2.12(b)", "proceeds / prepayment mechanics"), xref("7.11", "sale-leaseback sublimit")],
    remoteConstraintFlags=[
        remote("CROSS_SECTION_CONDITION", "§2.12(b) and §7.11 sit outside the exception's local dollar math."),
    ],
    capacityShape="GREATER_OF_MONEY_OR_PCT",
    verificationStatus="SOURCE_VERIFIED",
    notes="Seemingly large Asset Sale permission; mandatory prepayment mechanics and sale-leaseback section constrain use.",
))

# FUNDAMENTAL CHANGES
records.append(rec(
    exceptionId="conmed-7.4-a-intercompany-merger",
    sourcePackage="conmed-2025-credit-facility",
    sourcePath=CONMED,
    sourceSha256=SHAS["conmed"],
    covenantFamily="FUNDAMENTAL_CHANGES",
    parentProhibition={
        "sectionRef": "7.4",
        "text": "Enter into any merger, consolidation or amalgamation, or liquidate, wind up or dissolve itself ... or Dispose of all or substantially all of its Property or business except:",
    },
    exceptionSectionRef="7.4(a)",
    exactExceptionText=(
        "(i) any Subsidiary may be merged or consolidated with or into the Parent Borrower (provided that the Parent "
        "Borrower shall be the continuing or surviving Person), any Subsidiary Guarantor (provided that the Subsidiary "
        "Guarantor shall be the continuing or surviving Person) or an entity that will become a Subsidiary Guarantor "
        "following a Permitted Business Acquisition; ... (iv) the Parent Borrower may be merged or consolidated with "
        "or into any Subsidiary; provided that if the Parent Borrower shall not be the continuing or surviving Person "
        "... [Successor Borrower organizational, assumption, reaffirmation, opinion, KYC conditions]; provided, further, "
        "that (1) no Event of Default exists after giving effect ... and (2) if the foregoing requirements are satisfied, "
        "the Successor Borrower will succeed to ... the Parent Borrower ..."
    ),
    structuralHierarchy=["Article VII", "Section 7.4", "Section 7.4(a)"],
    definedTerms=["Subsidiary Guarantor", "Permitted Business Acquisition", "Successor Borrower", "Event of Default"],
    conditions=[
        cond("c1", "survivor identity constraints (Parent Borrower / Subsidiary Guarantor)", "IN_EXCEPTION_CLAUSE", "7.4(a)(i)", "ENTITY"),
        cond("c2", "Successor Borrower US org + assumption + reaffirmation + opinion", "IN_EXCEPTION_CLAUSE", "7.4(a)(iv)", "QUALITATIVE"),
        cond("c3", "no Event of Default after giving effect", "IN_EXCEPTION_CLAUSE", "7.4(a) further proviso (1)", "NO_DEFAULT"),
        cond("c4", "Division deemed utilization of Section 7.5 baskets", "CROSS_REFERENCED_SECTION", "7.5", "SHARED_POOL"),
    ],
    amountsAndRatios=[],
    entityScope={
        "includes": ["Subsidiaries", "Parent Borrower", "Subsidiary Guarantors"],
        "excludes": [],
        "notes": "Division successors must preserve Material Domestic / Pledge Eligible Foreign classes.",
    },
    sharedCapacityInteractions=[
        shared("SHARED_BASKET", "Division under 7.4(a)(iii) deemed utilization of applicable 7.5 baskets", ["7.4(a)(iii)", "7.5"]),
    ],
    provisos=[
        proviso("multiple provided / provided further survivor and EOD provisos", "OWN_CLAUSE", "Nested provisos on merger limbs."),
        proviso("Division deemed 7.5 utilization", "OWN_CLAUSE", "Cross-family capacity interaction."),
    ],
    crossReferences=[xref("7.5", "Division capacity deemed Asset Sale basket use"), xref("7.4(d)", "further exception to extent permitted by 7.5")],
    remoteConstraintFlags=[
        remote("CROSS_SECTION_CONDITION", "Division capacity is borrowed from §7.5; §7.4(d) also defers to §7.5."),
    ],
    capacityShape="NONE_QUALITATIVE",
    verificationStatus="SOURCE_VERIFIED",
    notes="Fundamental-change permission that can consume Asset Sale capacity — shared-capacity interaction across families.",
))

# RESTRICTED PAYMENTS
records.append(rec(
    exceptionId="conmed-7.6-e-ratio-gated-unlimited-rp",
    sourcePackage="conmed-2025-credit-facility",
    sourcePath=CONMED,
    sourceSha256=SHAS["conmed"],
    covenantFamily="RESTRICTED_PAYMENTS",
    parentProhibition={
        "sectionRef": "7.6",
        "text": "Declare or pay any dividend ... or make any other distribution ... (collectively, \"Restricted Payments\"), except:",
    },
    exceptionSectionRef="7.6(e)",
    exactExceptionText=(
        "so long as (i) the Consolidated Senior Secured Leverage Ratio of the Parent Borrower and its Subsidiaries, "
        "computed on a pro forma basis (giving effect to such Restricted Payment and any Indebtedness incurred in "
        "connection therewith) as at the last day of the most recently ended fiscal quarter of the Parent Borrower and "
        "its Subsidiaries for which financial statements are available, is no greater than 3.50 to 1.00 and (ii) no "
        "Event of Default has occurred and is continuing or would result therefrom, the Parent Borrower may make "
        "Restricted Payments in an unlimited amount;"
    ),
    structuralHierarchy=["Article VII", "Section 7.6", "Section 7.6(e)"],
    definedTerms=["Consolidated Senior Secured Leverage Ratio", "Restricted Payments", "Event of Default"],
    conditions=[
        cond("c1", "pro forma CSSLR ≤ 3.50 to 1.00", "IN_EXCEPTION_CLAUSE", "7.6(e)(i)", "RATIO"),
        cond("c2", "no EOD continuing or resulting", "IN_EXCEPTION_CLAUSE", "7.6(e)(ii)", "NO_DEFAULT"),
        cond("c3", "ratio definition / components live in definitions + §7.1(a) related concepts", "DEFINED_TERM", "Consolidated Senior Secured Leverage Ratio", "RATIO"),
        cond("c4", ARTICLE_VII_CHAPEAU, "ARTICLE_LEVEL", "Article VII chapeau", "ENTITY"),
    ],
    amountsAndRatios=[amt("RATIO", "3.50 to 1.00 Consolidated Senior Secured Leverage Ratio (pro forma)")],
    entityScope={"includes": ["Parent Borrower (payor)"], "excludes": [], "notes": "Unlimited amount only for Parent Borrower under this clause."},
    sharedCapacityInteractions=[],
    provisos=[],
    crossReferences=[xref("7.1(a)", "related CSSLR financial covenant (different threshold)"), xref("Consolidated Senior Secured Leverage Ratio", "defined term")],
    remoteConstraintFlags=[
        remote("DEFINED_TERM_GATE", "CSSLR components and add-backs are defined outside §7.6(e)."),
        remote("ARTICLE_LEVEL", "Article VII chapeau binds."),
    ],
    capacityShape="RATIO_GATED_UNLIMITED",
    verificationStatus="SOURCE_VERIFIED",
    notes="Textbook 'unlimited' that is not unconditional capacity — ratio + EOD gates + defined-term remote math.",
))

records.append(rec(
    exceptionId="conmed-7.6-d-annual-flat-rp",
    sourcePackage="conmed-2025-credit-facility",
    sourcePath=CONMED,
    sourceSha256=SHAS["conmed"],
    covenantFamily="RESTRICTED_PAYMENTS",
    parentProhibition={"sectionRef": "7.6", "text": "Declare or pay any dividend ... (collectively, \"Restricted Payments\"), except:"},
    exceptionSectionRef="7.6(d)",
    exactExceptionText="the Parent Borrower may make Restricted Payments in any fiscal year in an aggregate amount not to exceed $40,000,000;",
    structuralHierarchy=["Article VII", "Section 7.6", "Section 7.6(d)"],
    definedTerms=["Restricted Payments", "Parent Borrower"],
    conditions=[cond("c1", ARTICLE_VII_CHAPEAU, "ARTICLE_LEVEL", "Article VII chapeau", "ENTITY")],
    amountsAndRatios=[amt("FIXED_MONEY", "$40,000,000 per fiscal year")],
    entityScope={"includes": ["Parent Borrower"], "excludes": []},
    sharedCapacityInteractions=[],
    provisos=[],
    crossReferences=[],
    remoteConstraintFlags=[remote("ARTICLE_LEVEL", "Article VII chapeau binds.")],
    capacityShape="FIXED_MONEY",
    verificationStatus="SOURCE_VERIFIED",
    notes="Flat annual basket; still entity-scoped by Article VII and parent-prohibition definitions of Restricted Payments.",
))

# INVESTMENTS
records.append(rec(
    exceptionId="conmed-7.8-i-foreign-advances-depend-7.2k",
    sourcePackage="conmed-2025-credit-facility",
    sourcePath=CONMED,
    sourceSha256=SHAS["conmed"],
    covenantFamily="INVESTMENTS",
    parentProhibition={
        "sectionRef": "7.8",
        "text": "Make any advance, loan, extension of credit ... or make any other investment in, any Person (collectively, \"Investments\"), except:",
    },
    exceptionSectionRef="7.8(i)",
    exactExceptionText=(
        "so long as no Default or Event of Default shall have occurred and be continuing, the Parent Borrower or any "
        "Subsidiary may make advances, loans or extensions of credit to any Foreign Subsidiary or Foreign Subsidiary "
        "Holdco; provided that the Indebtedness of such Foreign Subsidiary or Foreign Subsidiary Holdco is permitted "
        "under Section 7.2(k);"
    ),
    structuralHierarchy=["Article VII", "Section 7.8", "Section 7.8(i)"],
    definedTerms=["Foreign Subsidiary", "Foreign Subsidiary Holdco", "Investments"],
    conditions=[
        cond("c1", "no Default/EOD continuing", "IN_EXCEPTION_CLAUSE", "7.8(i) so-long-as", "NO_DEFAULT"),
        cond("c2", "debtor Indebtedness permitted under Section 7.2(k)", "CROSS_REFERENCED_SECTION", "7.2(k)", "OTHER_RULE"),
    ],
    amountsAndRatios=[],
    entityScope={"includes": ["Parent Borrower / Subsidiary lender", "Foreign Subsidiary / Holdco borrower"], "excludes": []},
    sharedCapacityInteractions=[
        shared("SHARED_BASKET", "Investment permission consumes / depends on remaining 7.2(k) debt capacity and its §6.9 gates", ["7.2(k)", "6.9"]),
    ],
    provisos=[proviso("provided that Indebtedness permitted under 7.2(k)", "OWN_CLAUSE", "Entire quantitative story is remote.")],
    crossReferences=[xref("7.2(k)", "remote quantitative + pledge gates")],
    remoteConstraintFlags=[
        remote("CROSS_SECTION_CONDITION", "No local dollar cap; capacity is entirely the residual of §7.2(k) (itself gated by §6.9)."),
    ],
    capacityShape="UNLIMITED_GATED",
    verificationStatus="SOURCE_VERIFIED",
    notes="Seemingly open investment permission; actual headroom is the §7.2(k) foreign-debt basket plus its remote §6.9 conditions.",
))

records.append(rec(
    exceptionId="conmed-7.8-j-ratio-gated-investments",
    sourcePackage="conmed-2025-credit-facility",
    sourcePath=CONMED,
    sourceSha256=SHAS["conmed"],
    covenantFamily="INVESTMENTS",
    parentProhibition={"sectionRef": "7.8", "text": "Make any ... Investments, except:"},
    exceptionSectionRef="7.8(j)",
    exactExceptionText=(
        "in addition to Investments otherwise permitted by this Section 7.8, so long as no Default or Event of Default "
        "shall have occurred and be continuing, Investments by the Parent Borrower or any of its Subsidiaries; provided "
        "that (x) to the extent such Investments consist of equity investments ... the requirements of Section 6.9 are "
        "satisfied and (y) the Consolidated Senior Secured Leverage Ratio ... is no greater than the Consolidated Senior "
        "Secured Leverage Ratio that is 0.25x lower than the Consolidated Senior Secured Leverage Ratio in effect for "
        "such fiscal quarter under Section 7.1(a);"
    ),
    structuralHierarchy=["Article VII", "Section 7.8", "Section 7.8(j)"],
    definedTerms=["Consolidated Senior Secured Leverage Ratio", "Investments"],
    conditions=[
        cond("c1", "no Default/EOD", "IN_EXCEPTION_CLAUSE", "7.8(j) so-long-as", "NO_DEFAULT"),
        cond("c2", "equity investments satisfy Section 6.9", "CROSS_REFERENCED_SECTION", "6.9", "OTHER_RULE"),
        cond("c3", "CSSLR ≤ (then-applicable 7.1(a) CSSLR − 0.25x)", "CROSS_REFERENCED_SECTION", "7.1(a)", "RATIO"),
    ],
    amountsAndRatios=[amt("RATIO_BUFFER", "0.25x inside then-applicable §7.1(a) CSSLR")],
    entityScope={"includes": ["Parent Borrower", "Subsidiaries"], "excludes": []},
    sharedCapacityInteractions=[],
    provisos=[proviso("provided that (x) §6.9 and (y) CSSLR buffer vs 7.1(a)", "OWN_CLAUSE", "Both gates point outside Investments section.")],
    crossReferences=[xref("6.9", "equity investment collateral requirements"), xref("7.1(a)", "moving CSSLR ceiling")],
    remoteConstraintFlags=[
        remote("CROSS_SECTION_CONDITION", "Moving ratio target is defined by §7.1(a), including Material Acquisition step-ups."),
        remote("NOTWITHSTANDING", "§7.1(a) itself has a notwithstanding step-up that can change the remote target."),
    ],
    capacityShape="RATIO_GATED_UNLIMITED",
    verificationStatus="SOURCE_VERIFIED",
    notes="Unlimited investment basket whose ratio gate moves with §7.1(a) step-ups — remote notwithstanding interaction.",
))

records.append(rec(
    exceptionId="conmed-7.8-l-general-investments-basket",
    sourcePackage="conmed-2025-credit-facility",
    sourcePath=CONMED,
    sourceSha256=SHAS["conmed"],
    covenantFamily="INVESTMENTS",
    parentProhibition={"sectionRef": "7.8", "text": "Make any ... Investments, except:"},
    exceptionSectionRef="7.8(l)",
    exactExceptionText=(
        "in addition to Investments otherwise permitted by this Section 7.8, so long as no Default or Event of Default "
        "shall have occurred and be continuing, Investments by the Parent Borrower or any of its Subsidiaries in an "
        "aggregate amount (valued at cost) not to exceed the greater of (x) $75,000,000 and (y) 3.5% of Consolidated "
        "Total Assets (measured on the date of the making of such Investment) at any time outstanding;"
    ),
    structuralHierarchy=["Article VII", "Section 7.8", "Section 7.8(l)"],
    definedTerms=["Consolidated Total Assets", "Investments"],
    conditions=[
        cond("c1", "no Default/EOD", "IN_EXCEPTION_CLAUSE", "7.8(l) so-long-as", "NO_DEFAULT"),
        cond("c2", "valuation/netting rules in §7.8 trailing paragraph", "SECTION_WIDE_PROVISO", "7.8 trailing valuation paragraph", "MONEY"),
    ],
    amountsAndRatios=[
        amt("FIXED_MONEY", "$75,000,000"),
        amt("PERCENT_OF", "3.5%", "Consolidated Total Assets at making"),
    ],
    entityScope={"includes": ["Parent Borrower", "Subsidiaries"], "excludes": []},
    sharedCapacityInteractions=[],
    provisos=[proviso("section-wide Investment amount definition (cost +/- returns)", "SECTION_WIDE", "Hanging valuation methodology after (m).")],
    crossReferences=[xref("7.8 trailing valuation paragraph", "amount methodology")],
    remoteConstraintFlags=[remote("HANGING_PROVISO", "Trailing valuation paragraph after last basket applies to all of §7.8.")],
    capacityShape="GREATER_OF_MONEY_OR_PCT",
    verificationStatus="SOURCE_VERIFIED",
    notes="General investments basket; outstanding amount is measured by a hanging section-wide valuation rule.",
))

# JUNIOR DEBT PREPAYMENTS
records.append(rec(
    exceptionId="conmed-7.9-a-optional-prepay-junior-unsecured",
    sourcePackage="conmed-2025-credit-facility",
    sourcePath=CONMED,
    sourceSha256=SHAS["conmed"],
    covenantFamily="JUNIOR_DEBT_PREPAYMENTS",
    parentProhibition={
        "sectionRef": "7.9(a)",
        "text": "Make or offer to make any voluntary payment, prepayment, repurchase or redemption of or otherwise defease or segregate funds (any such action, a \"Prepayment\") with respect to Permitted Subordinated Indebtedness or Permitted Unsecured Indebtedness, unless ...",
    },
    exceptionSectionRef="7.9(a) except limb",
    exactExceptionText=(
        "unless (i) both immediately prior to and immediately after giving effect to any such Prepayment, no Default or "
        "Event of Default shall have occurred and be continuing, and (ii) the Parent Borrower and the Subsidiaries are in "
        "compliance, on a pro forma basis after giving effect to such Prepayment, with the financial covenants contained "
        "in Section 7.1 ... except this Section 7.9(a) shall not limit payments or deliveries ... required by the terms "
        "of ... any Permitted Unsecured Indebtedness (including making payments of interest and principal thereon, making "
        "payments due upon required repurchase thereof and/or making payments and deliveries due upon conversion thereof)."
    ),
    structuralHierarchy=["Article VII", "Section 7.9", "Section 7.9(a)"],
    definedTerms=["Permitted Subordinated Indebtedness", "Permitted Unsecured Indebtedness", "Prepayment"],
    conditions=[
        cond("c1", "no Default/EOD before and after", "IN_EXCEPTION_CLAUSE", "7.9(a)(i)", "NO_DEFAULT"),
        cond("c2", "pro forma compliance with Section 7.1 financial covenants", "CROSS_REFERENCED_SECTION", "7.1", "RATIO"),
    ],
    amountsAndRatios=[],
    entityScope={"includes": ["Parent Borrower", "Subsidiaries"], "excludes": []},
    sharedCapacityInteractions=[],
    provisos=[
        proviso("except this Section 7.9(a) shall not limit required PUI payments/conversions", "OWN_CLAUSE", "Mandatory/required payments carve-out from the junior prepay restriction."),
    ],
    crossReferences=[xref("7.1", "pro-forma financial covenant gate"), xref("7.6(g)", "overlapping RP permission for PUI required payments")],
    remoteConstraintFlags=[
        remote("CROSS_SECTION_CONDITION", "Voluntary junior/unsecured prepays gated by all of §7.1, not local dollars."),
        remote("SECTION_WIDE_LIMITATION", "§7.9(b)/(c) amendment restrictions further constrain restructuring of the same instruments."),
    ],
    capacityShape="RATIO_GATED_UNLIMITED",
    verificationStatus="SOURCE_VERIFIED",
    notes="Junior/unsecured voluntary prepay permission looks broad; §7.1 pro forma + §7.9(b)/(c) amendment limits constrain the stack.",
))

# AFFILIATE
records.append(rec(
    exceptionId="conmed-7.10-affiliate-armlength-with-cross-family-carveouts",
    sourcePackage="conmed-2025-credit-facility",
    sourcePath=CONMED,
    sourceSha256=SHAS["conmed"],
    covenantFamily="AFFILIATE_TRANSACTIONS",
    parentProhibition={
        "sectionRef": "7.10",
        "text": "Enter into any transaction ... with any Affiliate (other than transactions between or among the Parent Borrower and the Subsidiary Guarantors) that involves consideration in excess of $2,500,000 for such transaction unless such transaction is (a) not otherwise prohibited under this Agreement and (b) upon fair and reasonable terms no less favorable ...",
    },
    exceptionSectionRef="7.10 except (i)-(v)",
    exactExceptionText=(
        "except that this Section 7.10 shall not prohibit (i) the sale, transfer, encumbrance or other disposition ... "
        "pursuant to a Receivables Transfer Program, (ii) overhead and other ordinary course allocations of costs and "
        "services on a reasonable basis, (iii) allocations of tax liabilities ..., (iv) any incurrence of Indebtedness "
        "not prohibited by Section 7.2, (iii) any Restricted Payment not prohibited by Section 7.6, (iv) any Investment "
        "permitted by Section 7.8 specifically contemplated by Section 7.8 to be made among Affiliates or (v) transactions "
        "between or among the Parent Borrower and its Subsidiaries in the ordinary course of business which are pursuant "
        "to customary transfer pricing arrangements ... (but not involving (x) an Investment not specifically contemplated "
        "by Section 7.8 to be made among Affiliates or (y) an Asset Sale not otherwise permitted under this Agreement)."
    ),
    structuralHierarchy=["Article VII", "Section 7.10"],
    definedTerms=["Affiliate", "Receivables Transfer Program", "Subsidiary Guarantors"],
    conditions=[
        cond("c1", "de minimis threshold $2,500,000 before arm's-length test applies", "PARENT_CHAPEAU", "7.10 chapeau", "MONEY"),
        cond("c2", "not otherwise prohibited under this Agreement", "PARENT_CHAPEAU", "7.10(a)", "OTHER_RULE"),
        cond("c3", "arm's-length terms", "PARENT_CHAPEAU", "7.10(b)", "QUALITATIVE"),
        cond("c4", "carve-outs (iv) debt / RP / Investments only if other NC sections permit", "CROSS_REFERENCED_SECTION", "7.2 / 7.6 / 7.8", "OTHER_RULE"),
        cond("c5", "transfer-pricing limb excludes non-contemplated Investments and non-permitted Asset Sales", "IN_EXCEPTION_CLAUSE", "7.10(v)(x)-(y)", "OTHER_RULE"),
    ],
    amountsAndRatios=[amt("FIXED_MONEY", "$2,500,000 consideration threshold")],
    entityScope={
        "includes": ["transactions with Affiliates"],
        "excludes": ["transactions between or among Parent Borrower and Subsidiary Guarantors (chapeau carve-out)"],
    },
    sharedCapacityInteractions=[],
    provisos=[proviso("but not involving (x) non-contemplated Investment or (y) non-permitted Asset Sale", "OWN_CLAUSE", "Negative proviso inside transfer-pricing exception.")],
    crossReferences=[xref("7.2", "debt carve-out"), xref("7.6", "RP carve-out"), xref("7.8", "Investment carve-out"), xref("7.5", "Asset Sale residual limit")],
    remoteConstraintFlags=[
        remote("CROSS_SECTION_CONDITION", "Affiliate exceptions expressly re-import Debt/RP/Investment/Asset Sale restrictions."),
        remote("ARTICLE_LEVEL", "Article VII chapeau still binds."),
    ],
    capacityShape="FIXED_MONEY",
    verificationStatus="SOURCE_VERIFIED",
    notes="Affiliate section is a meta-gate: several 'exceptions' are only as wide as other negative covenants.",
))

# SUBSIDIARY RESTRICTIONS
records.append(rec(
    exceptionId="conmed-7.13-negative-pledge-exceptions",
    sourcePackage="conmed-2025-credit-facility",
    sourcePath=CONMED,
    sourceSha256=SHAS["conmed"],
    covenantFamily="SUBSIDIARY_RESTRICTIONS",
    parentProhibition={
        "sectionRef": "7.13",
        "text": "Enter into or suffer to exist or become effective any agreement which prohibits or limits the ability of the Parent Borrower or any of its Subsidiaries to create, incur, assume or suffer to exist any Lien upon any of its Property or revenues ... to secure the Obligations ... other than ...",
    },
    exceptionSectionRef="7.13(a)-(c)",
    exactExceptionText=(
        "other than (a) this Agreement and the other Loan Documents, (b) any agreements governing any purchase money "
        "Liens, Finance Lease Obligations otherwise permitted hereby or Liens permitted by Sections 7.3(f), (g), or (l) "
        "(in which case, any prohibition or limitation shall only be effective against the assets financed thereby) and "
        "(c) any agreement entered into in connection with a Receivables Transfer Program that prohibits or limits the "
        "ability ... to create ... any Lien upon the accounts receivable or related ancillary rights or assets ... "
        "disposed of pursuant to such Receivable Transfer Program."
    ),
    structuralHierarchy=["Article VII", "Section 7.13"],
    definedTerms=["Finance Lease Obligations", "Receivables Transfer Program", "Obligations"],
    conditions=[
        cond("c1", "purchase-money / finance-lease / listed lien agreements only effective against financed assets", "IN_EXCEPTION_CLAUSE", "7.13(b)", "QUALITATIVE"),
        cond("c2", "underlying Liens must be permitted by 7.3(f)/(g)/(l) or otherwise permitted finance leases", "CROSS_REFERENCED_SECTION", "7.3(f)/(g)/(l)", "OTHER_RULE"),
    ],
    amountsAndRatios=[],
    entityScope={"includes": ["Parent Borrower", "Subsidiaries"], "excludes": []},
    sharedCapacityInteractions=[],
    provisos=[],
    crossReferences=[xref("7.3(f)", "existing closing-date liens"), xref("7.3(g)", "purchase-money"), xref("7.3(l)", "acquisition liens")],
    remoteConstraintFlags=[remote("CROSS_SECTION_CONDITION", "Negative-pledge exceptions depend on Lien permissions elsewhere.")],
    capacityShape="NONE_QUALITATIVE",
    verificationStatus="SOURCE_VERIFIED",
    notes="Subsidiary / negative-pledge restriction exceptions are derivative of Lien baskets.",
))

records.append(rec(
    exceptionId="conmed-7.14-subsidiary-distribution-restrictions",
    sourcePackage="conmed-2025-credit-facility",
    sourcePath=CONMED,
    sourceSha256=SHAS["conmed"],
    covenantFamily="SUBSIDIARY_RESTRICTIONS",
    parentProhibition={
        "sectionRef": "7.14",
        "text": "Enter into or suffer to exist or become effective any consensual encumbrance or restriction on the ability of any Subsidiary to (a) pay dividends or make any other distributions ... (b) make loans or advances ... or (c) transfer any of its assets ... except for ...",
    },
    exceptionSectionRef="7.14(i)-(iii)",
    exactExceptionText=(
        "except for such encumbrances or restrictions existing under or by reason of (i) any restrictions existing under "
        "the Loan Documents, (ii) any restrictions with respect to a Subsidiary imposed pursuant to an agreement which "
        "has been entered into in connection with the Disposition of all or substantially all of the Capital Stock or "
        "assets of such Subsidiary and (iii) any restrictions imposed pursuant to a Receivables Transfer Program with "
        "respect to a Subsidiary established solely for the purpose of a Receivables Transfer Program."
    ),
    structuralHierarchy=["Article VII", "Section 7.14"],
    definedTerms=["Disposition", "Receivables Transfer Program", "Capital Stock"],
    conditions=[
        cond("c1", "disposition-related restrictions only in connection with Disposition of all/substantially all", "IN_EXCEPTION_CLAUSE", "7.14(ii)", "QUALITATIVE"),
        cond("c2", "RTP restrictions only for RTP-purpose Subsidiary", "IN_EXCEPTION_CLAUSE", "7.14(iii)", "ENTITY"),
        cond("c3", "Disposition itself must otherwise be permitted (typically via 7.5)", "CROSS_REFERENCED_SECTION", "7.5", "OTHER_RULE"),
    ],
    amountsAndRatios=[],
    entityScope={"includes": ["any Subsidiary"], "excludes": []},
    sharedCapacityInteractions=[],
    provisos=[],
    crossReferences=[xref("7.5", "Disposition permission that enables 7.14(ii)")],
    remoteConstraintFlags=[remote("CROSS_SECTION_CONDITION", "7.14(ii) is only usable when a qualifying Disposition pathway exists.")],
    capacityShape="NONE_QUALITATIVE",
    verificationStatus="SOURCE_VERIFIED",
    notes="Subsidiary distribution-restriction exceptions often look categorical but depend on Asset Sale permissions.",
))

# ---------------------------------------------------------------------------
# LSB — Payment Conditions as remote defined-term gate (shared across families)
# ---------------------------------------------------------------------------
records.append(rec(
    exceptionId="lsb-6.01-chapeau-ratio-and-payment-conditions",
    sourcePackage="lsb-2023-abl-credit-agreement",
    sourcePath=LSB,
    sourceSha256=SHAS["lsb"],
    covenantFamily="DEBT_INCURRENCE",
    parentProhibition={
        "sectionRef": "6.01",
        "text": "Create, incur, assume, permit, guarantee, or otherwise become or remain, directly or indirectly, liable with respect to any Indebtedness; provided, that, the Loan Parties and their respective Subsidiaries shall be entitled to incur Indebtedness if on the date of the incurrence of such Indebtedness, (i) after giving effect to the incurrence thereof, the Fixed Charge Coverage Ratio ... is greater than 2.0 to 1.0 and (ii) the Payment Conditions are satisfied with respect to such incurrence. The foregoing limitation shall not apply to:",
    },
    exceptionSectionRef="6.01 chapeau general permission",
    exactExceptionText=(
        "the Loan Parties and their respective Subsidiaries shall be entitled to incur Indebtedness if on the date of "
        "the incurrence of such Indebtedness, (i) after giving effect to the incurrence thereof, the Fixed Charge Coverage "
        "Ratio of the Parent and its Subsidiaries for the most recently ended four full fiscal quarter period is greater "
        "than 2.0 to 1.0 and (ii) the Payment Conditions are satisfied with respect to such incurrence."
    ),
    structuralHierarchy=["Article VI", "Section 6.01", "Section 6.01 chapeau"],
    definedTerms=["Fixed Charge Coverage Ratio", "Payment Conditions", "Loan Parties"],
    conditions=[
        cond("c1", "FCCR > 2.0 to 1.0 after giving effect", "PARENT_CHAPEAU", "6.01 chapeau (i)", "RATIO"),
        cond("c2", "Payment Conditions satisfied", "DEFINED_TERM", "Payment Conditions", "SHARED_POOL"),
    ],
    amountsAndRatios=[amt("RATIO", "Fixed Charge Coverage Ratio > 2.0 to 1.0")],
    entityScope={"includes": ["Loan Parties", "their Subsidiaries"], "excludes": []},
    sharedCapacityInteractions=[
        shared("SHARED_BASKET", "Payment Conditions reused by RP 6.11(c), Investments 6.13(k), debt payments 6.08(a)(v)", ["6.11(c)", "6.13(k)", "6.08(a)(v)"]),
    ],
    provisos=[],
    crossReferences=[xref("Payment Conditions", "defined-term compound gate"), xref("6.11(c)", "same Payment Conditions for RP"), xref("6.13(k)", "same Payment Conditions for Investments")],
    remoteConstraintFlags=[
        remote("DEFINED_TERM_GATE", "Payment Conditions compound liquidity/default/certificate tests live in definitions, not in §6.01."),
        remote("ARTICLE_LEVEL", "Article VI chapeau (until Secured Obligations Paid in Full) binds."),
    ],
    capacityShape="RATIO_GATED_UNLIMITED",
    verificationStatus="SOURCE_VERIFIED",
    notes="Uncapped general debt permission; Payment Conditions is a shared remote gate across multiple NC families.",
))

records.append(rec(
    exceptionId="lsb-6.01-i-greater-of-flat-assets",
    sourcePackage="lsb-2023-abl-credit-agreement",
    sourcePath=LSB,
    sourceSha256=SHAS["lsb"],
    covenantFamily="DEBT_INCURRENCE",
    parentProhibition={"sectionRef": "6.01", "text": "Create, incur ... any Indebtedness; ... The foregoing limitation shall not apply to:"},
    exceptionSectionRef="6.01(i)",
    exactExceptionText=(
        "other Indebtedness in an aggregate principal amount outstanding at any time not to exceed the greater of "
        "$70,000,000 and 5.5% of the total consolidated assets of the Loan Parties and their Subsidiaries as reflected "
        "on their balance sheet in accordance with GAAP;"
    ),
    structuralHierarchy=["Article VI", "Section 6.01", "Section 6.01(i)"],
    definedTerms=[],
    conditions=[cond("c1", "Article VI duration chapeau", "ARTICLE_LEVEL", "Article VI chapeau", "OTHER_RULE")],
    amountsAndRatios=[amt("FIXED_MONEY", "$70,000,000"), amt("PERCENT_OF", "5.5%", "total consolidated assets (GAAP balance sheet)")],
    entityScope={"includes": ["Loan Parties and Subsidiaries"], "excludes": []},
    sharedCapacityInteractions=[],
    provisos=[],
    crossReferences=[],
    remoteConstraintFlags=[remote("ARTICLE_LEVEL", "Article VI Paid-in-Full duration binds.")],
    capacityShape="GREATER_OF_MONEY_OR_PCT",
    verificationStatus="SOURCE_VERIFIED",
    notes="Enumerated basket independent of Payment Conditions, but still Article-scoped.",
))

records.append(rec(
    exceptionId="lsb-6.11-c-rp-payment-conditions",
    sourcePackage="lsb-2023-abl-credit-agreement",
    sourcePath=LSB,
    sourceSha256=SHAS["lsb"],
    covenantFamily="RESTRICTED_PAYMENTS",
    parentProhibition={
        "sectionRef": "6.11",
        "text": "Make any distribution or declare or pay any dividends ... (each, a \"Restricted Payment\"); provided, that the foregoing shall not prohibit any of the following:",
    },
    exceptionSectionRef="6.11(c)",
    exactExceptionText="Restricted Payments so long as the Payment Conditions are satisfied with respect to each such Restricted Payment;",
    structuralHierarchy=["Article VI", "Section 6.11", "Section 6.11(c)"],
    definedTerms=["Restricted Payment", "Payment Conditions"],
    conditions=[
        cond("c1", "Payment Conditions satisfied for each RP", "DEFINED_TERM", "Payment Conditions", "SHARED_POOL"),
    ],
    amountsAndRatios=[],
    entityScope={"includes": ["Loan Parties / Subsidiaries via Article VI chapeau"], "excludes": []},
    sharedCapacityInteractions=[
        shared("SHARED_BASKET", "Payment Conditions shared with 6.01 chapeau, 6.08(a)(v), 6.13(k)", ["6.01", "6.08(a)(v)", "6.13(k)"]),
    ],
    provisos=[],
    crossReferences=[xref("Payment Conditions", "remote defined-term gate")],
    remoteConstraintFlags=[remote("DEFINED_TERM_GATE", "No local dollars; entire capacity is the Payment Conditions definition.")],
    capacityShape="UNLIMITED_GATED",
    verificationStatus="SOURCE_VERIFIED",
    notes="Seemingly unlimited RP basket with zero local conditions other than a remote defined term.",
))

records.append(rec(
    exceptionId="lsb-6.11-d-residual-last-resort-rp",
    sourcePackage="lsb-2023-abl-credit-agreement",
    sourcePath=LSB,
    sourceSha256=SHAS["lsb"],
    covenantFamily="RESTRICTED_PAYMENTS",
    parentProhibition={"sectionRef": "6.11", "text": "Make any ... Restricted Payment; provided, that the foregoing shall not prohibit any of the following:"},
    exceptionSectionRef="6.11(d)",
    exactExceptionText=(
        "Restricted Payments in an aggregate amount not to exceed $500,000 in any fiscal year of Parent (it being "
        "understood and agreed that any Restricted Payment made pursuant this clause (d) shall only be permitted if "
        "such Restricted Payment would not, at the time thereof, be permitted (or be able to be made) under any other "
        "clause of this Section 6.11)."
    ),
    structuralHierarchy=["Article VI", "Section 6.11", "Section 6.11(d)"],
    definedTerms=["Restricted Payment", "Parent"],
    conditions=[
        cond("c1", "only if not permitted under any other 6.11 clause", "IN_EXCEPTION_CLAUSE", "6.11(d) parenthetical", "OTHER_RULE"),
    ],
    amountsAndRatios=[amt("FIXED_MONEY", "$500,000 per fiscal year")],
    entityScope={"includes": ["Parent fiscal-year aggregate"], "excludes": []},
    sharedCapacityInteractions=[
        shared("RESIDUAL_LAST_RESORT", "Cannot be used if another 6.11 clause is available", ["6.11(a)", "6.11(b)", "6.11(c)"]),
    ],
    provisos=[proviso("it being understood ... only if not permitted under any other clause", "OWN_CLAUSE", "Last-resort residual.")],
    crossReferences=[xref("6.11(a)-(c)", "priority baskets")],
    remoteConstraintFlags=[remote("SECTION_WIDE_LIMITATION", "Residual use depends on unavailability of sibling exceptions, including Payment Conditions basket.")],
    capacityShape="FIXED_MONEY",
    verificationStatus="SOURCE_VERIFIED",
    notes="Small flat basket is not free capacity if Payment Conditions RP is available — residual-last-resort pattern.",
))

records.append(rec(
    exceptionId="lsb-6.08-a-v-debt-payments-payment-conditions",
    sourcePackage="lsb-2023-abl-credit-agreement",
    sourcePath=LSB,
    sourceSha256=SHAS["lsb"],
    covenantFamily="JUNIOR_DEBT_PREPAYMENTS",
    parentProhibition={
        "sectionRef": "6.08(a)",
        "text": "Make any payment in respect of Indebtedness (other than Indebtedness in respect of the Secured Notes), except the following payments of Indebtedness shall be permitted:",
    },
    exceptionSectionRef="6.08(a)(v)",
    exactExceptionText="payments of Indebtedness to the extent the Payment Conditions are satisfied;",
    structuralHierarchy=["Article VI", "Section 6.08", "Section 6.08(a)", "Section 6.08(a)(v)"],
    definedTerms=["Payment Conditions"],
    conditions=[cond("c1", "Payment Conditions satisfied", "DEFINED_TERM", "Payment Conditions", "SHARED_POOL")],
    amountsAndRatios=[],
    entityScope={"includes": ["Loan Parties / Subsidiaries"], "excludes": []},
    sharedCapacityInteractions=[
        shared("SHARED_BASKET", "Payment Conditions shared across debt payments, RP, Investments, and general debt", ["6.01", "6.11(c)", "6.13(k)"]),
    ],
    provisos=[],
    crossReferences=[xref("Payment Conditions", "remote gate"), xref("6.08(a)(iv)", "separate Subordinated Indebtedness pathway")],
    remoteConstraintFlags=[remote("DEFINED_TERM_GATE", "Junior/other debt paydowns via (v) depend entirely on Payment Conditions definition.")],
    capacityShape="UNLIMITED_GATED",
    verificationStatus="SOURCE_VERIFIED",
    notes="Debt-payment exception with no local quantum; subordination pathway (iv) is separate and also remotely gated by subordination terms.",
))

records.append(rec(
    exceptionId="lsb-6.13-k-investments-payment-conditions",
    sourcePackage="lsb-2023-abl-credit-agreement",
    sourcePath=LSB,
    sourceSha256=SHAS["lsb"],
    covenantFamily="INVESTMENTS",
    parentProhibition={
        "sectionRef": "6.13",
        "text": "Directly or indirectly, make or acquire any Investment ... provided, however, that the foregoing shall not prohibit any of the following:",
    },
    exceptionSectionRef="6.13(k)",
    exactExceptionText="Investments to the extent the Payment Conditions are satisfied;",
    structuralHierarchy=["Article VI", "Section 6.13", "Section 6.13(k)"],
    definedTerms=["Investments", "Payment Conditions"],
    conditions=[cond("c1", "Payment Conditions satisfied", "DEFINED_TERM", "Payment Conditions", "SHARED_POOL")],
    amountsAndRatios=[],
    entityScope={"includes": ["Loan Parties / Subsidiaries"], "excludes": []},
    sharedCapacityInteractions=[
        shared("SHARED_BASKET", "Payment Conditions shared across NC families", ["6.01", "6.11(c)", "6.08(a)(v)"]),
    ],
    provisos=[],
    crossReferences=[xref("Payment Conditions", "remote gate")],
    remoteConstraintFlags=[remote("DEFINED_TERM_GATE", "Unlimited-looking Investment permission gated only by remote defined term.")],
    capacityShape="UNLIMITED_GATED",
    verificationStatus="SOURCE_VERIFIED",
    notes="Same Payment Conditions pattern as RP and debt payments — shared remote gate, not local capacity.",
))

records.append(rec(
    exceptionId="lsb-6.04-b-notes-priority-notwithstanding",
    sourcePackage="lsb-2023-abl-credit-agreement",
    sourcePath=LSB,
    sourceSha256=SHAS["lsb"],
    covenantFamily="ASSET_SALES",
    parentProhibition={
        "sectionRef": "6.04",
        "text": "Other than transactions permitted under Section 6.03, convey, sell, lease, license, assign, transfer, or otherwise dispose of any of the assets of any Loan Party, except that:",
    },
    exceptionSectionRef="6.04(b)",
    exactExceptionText=(
        "notwithstanding anything to the contrary contained herein, any Loan Party and any of its respective Subsidiaries "
        "may sell, transfer or otherwise dispose of any Notes Priority Collateral owned by such Person so long as such "
        "disposition is permitted under the Secured Notes Documents or if the requisite holders of the Secured Notes "
        "otherwise consent ... proceeds from the sale or disposition of Notes Priority Collateral shall be applied by "
        "the Loan Parties in accordance with the terms of the Secured Notes Documents and the Secured Notes Indenture;"
    ),
    structuralHierarchy=["Article VI", "Section 6.04", "Section 6.04(b)"],
    definedTerms=["Notes Priority Collateral", "Secured Notes Documents", "Secured Notes Indenture"],
    conditions=[
        cond("c1", "disposition permitted under Secured Notes Documents or noteholder consent", "CROSS_REFERENCED_SECTION", "Secured Notes Documents", "OTHER_RULE"),
        cond("c2", "proceeds applied per Secured Notes Documents / Indenture", "CROSS_REFERENCED_SECTION", "Secured Notes Indenture", "OTHER_RULE"),
    ],
    amountsAndRatios=[],
    entityScope={"includes": ["Loan Party", "Subsidiaries"], "excludes": []},
    sharedCapacityInteractions=[],
    provisos=[proviso("notwithstanding anything to the contrary contained herein", "NOTWITHSTANDING", "Overrides conflicting local ABL disposition limits, but imports notes documents.")],
    crossReferences=[xref("Secured Notes Documents", "permission source"), xref("6.03", "fundamental-change carve-out interaction in chapeau")],
    remoteConstraintFlags=[
        remote("NOTWITHSTANDING", "Local ABL caps do not control Notes Priority Collateral sales."),
        remote("CROSS_SECTION_CONDITION", "True permission and proceeds application live in Secured Notes Documents."),
    ],
    capacityShape="UNLIMITED_GATED",
    verificationStatus="SOURCE_VERIFIED",
    notes="Notwithstanding makes the ABL exception look free; capacity is still constrained by an external instrument.",
))

records.append(rec(
    exceptionId="lsb-6.03-fundamental-changes-carveouts",
    sourcePackage="lsb-2023-abl-credit-agreement",
    sourcePath=LSB,
    sourceSha256=SHAS["lsb"],
    covenantFamily="FUNDAMENTAL_CHANGES",
    parentProhibition={
        "sectionRef": "6.03",
        "text": "(a) Enter into any merger, consolidation, or reorganization... (b) liquidate... (c) convey... all or substantially all of the assets... provided, that the foregoing clauses (a), (b) and (c) shall not apply to ...",
    },
    exceptionSectionRef="6.03 proviso (i)-(vii)",
    exactExceptionText=(
        "provided, that the foregoing clauses (a), (b) and (c) shall not apply to (i) the merger or consolidation of a "
        "Loan Party or a Subsidiary of a Loan Party with and into another Loan Party (in each such case, so long as a "
        "Borrower (to the extent a Borrower is part of such transaction) is the surviving entity of any such merger), "
        "(ii) the sale, transfer, lease or other disposal of any assets of any Loan Party or any of its Subsidiaries to "
        "any other Loan Party, (iii) Permitted Dispositions, (iv) Acquisitions and other Investments to the extent "
        "permitted hereunder, (v) conveyances... permitted by Section 6.04, (vi) mergers, liquidations, sale of assets "
        "of a non-Loan Party Subsidiary into or to another non-Loan Party Subsidiary, and (vii) any liquidation or "
        "dissolution of any Subsidiary that is not a Loan Party if the Borrower Representative determines in good faith "
        "that such liquidation or dissolution is in the best interests of the Parent and its Subsidiaries, is not "
        "materially disadvantageous to the Lenders, and the assets ... are transferred to a Loan Party."
    ),
    structuralHierarchy=["Article VI", "Section 6.03"],
    definedTerms=["Permitted Dispositions", "Loan Party", "Borrower Representative"],
    conditions=[
        cond("c1", "Borrower must survive if Borrower is party", "IN_EXCEPTION_CLAUSE", "6.03(i)", "ENTITY"),
        cond("c2", "Acquisitions/Investments only to extent permitted hereunder", "CROSS_REFERENCED_SECTION", "6.13 / Investment permissions", "OTHER_RULE"),
        cond("c3", "dispositions via Section 6.04", "CROSS_REFERENCED_SECTION", "6.04", "OTHER_RULE"),
        cond("c4", "good-faith / not materially disadvantageous for non-Loan Party liquidation", "IN_EXCEPTION_CLAUSE", "6.03(vii)", "QUALITATIVE"),
    ],
    amountsAndRatios=[],
    entityScope={"includes": ["Loan Parties", "Subsidiaries"], "excludes": []},
    sharedCapacityInteractions=[],
    provisos=[proviso("provided that foregoing clauses shall not apply to (i)-(vii)", "SECTION_WIDE", "Single hanging proviso opens all fundamental-change exceptions.")],
    crossReferences=[xref("6.04", "disposition pathway"), xref("6.13", "Investment pathway"), xref("Permitted Dispositions", "defined-term pathway")],
    remoteConstraintFlags=[
        remote("HANGING_PROVISO", "One proviso after (a)-(c) creates the entire exception list."),
        remote("CROSS_SECTION_CONDITION", "Several limbs are only as wide as Investments / Asset Sale permissions."),
    ],
    capacityShape="NONE_QUALITATIVE",
    verificationStatus="SOURCE_VERIFIED",
    notes="Fundamental-change exceptions are mostly pointers into other NC capacity.",
))

records.append(rec(
    exceptionId="lsb-6.14-affiliate-transactions",
    sourcePackage="lsb-2023-abl-credit-agreement",
    sourcePath=LSB,
    sourceSha256=SHAS["lsb"],
    covenantFamily="AFFILIATE_TRANSACTIONS",
    parentProhibition={
        "sectionRef": "6.14",
        "text": "Except for transactions (a) set forth on Schedule 6.14, (b) transactions not exceeding $5,000,000 in the aggregate at any time, and (c) transactions that are (i) in the ordinary course ... (ii) upon fair and reasonable terms and (iii) no less favorable ... and (d) transactions that are otherwise permitted under this Agreement, directly or indirectly enter into or permit to exist any transaction with any Affiliate of any Loan Party.",
    },
    exceptionSectionRef="6.14(a)-(d)",
    exactExceptionText=(
        "Except for transactions (a) set forth on Schedule 6.14, (b) transactions not exceeding $5,000,000 in the "
        "aggregate at any time, and (c) transactions that are (i) in the ordinary course of the Loan Parties' business, "
        "(ii) upon fair and reasonable terms and (iii) no less favorable to Loan Parties than would be obtained in an "
        "arm's length transaction with a non-Affiliate, and (d) transactions that are otherwise permitted under this "
        "Agreement..."
    ),
    structuralHierarchy=["Article VI", "Section 6.14"],
    definedTerms=["Affiliate", "Loan Parties"],
    conditions=[
        cond("c1", "Schedule 6.14 listed", "IN_EXCEPTION_CLAUSE", "6.14(a)", "OTHER_RULE"),
        cond("c2", "≤ $5,000,000 aggregate", "IN_EXCEPTION_CLAUSE", "6.14(b)", "MONEY"),
        cond("c3", "ordinary course + arm's length", "IN_EXCEPTION_CLAUSE", "6.14(c)", "ORDINARY_COURSE"),
        cond("c4", "otherwise permitted under this Agreement", "CROSS_REFERENCED_SECTION", "Agreement-wide", "OTHER_RULE"),
    ],
    amountsAndRatios=[amt("FIXED_MONEY", "$5,000,000 aggregate")],
    entityScope={"includes": ["Affiliate of any Loan Party"], "excludes": []},
    sharedCapacityInteractions=[],
    provisos=[],
    crossReferences=[xref("Schedule 6.14", "listed exceptions"), xref("Agreement-wide permissions", "catch-all (d)")],
    remoteConstraintFlags=[remote("CROSS_SECTION_CONDITION", "Clause (d) re-imports every other permission/prohibition in the Agreement.")],
    capacityShape="FIXED_MONEY",
    verificationStatus="SOURCE_VERIFIED",
    notes="Affiliate catch-all (d) is not independent capacity.",
))

# ---------------------------------------------------------------------------
# FWRG — builder / shared capacity / junior debt / burdensome
# ---------------------------------------------------------------------------
records.append(rec(
    exceptionId="fwrg-6.04-a-iii-available-amount-rp",
    sourcePackage="fwrg-2021-credit-agreement",
    sourcePath=FWRG,
    sourceSha256=SHAS["fwrg"],
    covenantFamily="RESTRICTED_PAYMENTS",
    parentProhibition={
        "sectionRef": "6.04(a)",
        "text": "The Borrower shall not pay or make any Restricted Payment, except that:",
    },
    exceptionSectionRef="6.04(a)(iii)",
    exactExceptionText=(
        "the Borrower may make Restricted Payments in an amount not to exceed (A) the portion, if any, of the Available "
        "Amount on such date that the Borrower elects to apply to this clause (iii)(A) and/or (B) the portion, if any, "
        "of the Available Excluded Contribution Amount on such date that the Borrower elects to apply to this clause (iii)(B);"
    ),
    structuralHierarchy=["Article VI", "Section 6.04", "Section 6.04(a)", "Section 6.04(a)(iii)"],
    definedTerms=["Available Amount", "Available Excluded Contribution Amount", "Restricted Payment"],
    conditions=[
        cond("c1", "Available Amount electively applied", "DEFINED_TERM", "Available Amount", "SHARED_POOL"),
        cond("c2", "Available Excluded Contribution Amount electively applied", "DEFINED_TERM", "Available Excluded Contribution Amount", "SHARED_POOL"),
        cond("c3", "CNI Growth Amount component of Available Amount has its own ratio/EOD gates in definition", "DEFINED_TERM", "Available Amount / CNI Growth Amount", "RATIO"),
    ],
    amountsAndRatios=[amt("BUILDER", "Available Amount (multi-component)"), amt("BUILDER", "Available Excluded Contribution Amount")],
    entityScope={"includes": ["Borrower"], "excludes": []},
    sharedCapacityInteractions=[
        shared("BUILDER_ELECTION", "Borrower elects which builder pool to charge; pools also feed Investments/RDPs", ["6.04(a)(iii)", "6.06", "6.04(b)"]),
        shared("SHARED_BASKET", "Available Amount is shared capacity across RP/Investment/RDP elections", ["Available Amount"]),
    ],
    provisos=[],
    crossReferences=[xref("Available Amount", "builder definition with remote ratio/EOD gates"), xref("6.04(b)", "Restricted Debt Payments may also consume builder")],
    remoteConstraintFlags=[
        remote("DEFINED_TERM_GATE", "Builder components and their ratio/EOD limitations live in Article I definitions."),
        remote("CROSS_SECTION_CONDITION", "Same pool can be elected into Investments or Restricted Debt Payments elsewhere."),
    ],
    capacityShape="BUILDER_SHARED",
    verificationStatus="SOURCE_VERIFIED",
    notes="Builder RP basket is never local unconditional capacity; definitional gates and cross-family elections constrain it.",
))

records.append(rec(
    exceptionId="fwrg-6.04-b-iv-rdp-cross-basket-offset",
    sourcePackage="fwrg-2021-credit-agreement",
    sourcePath=FWRG,
    sourceSha256=SHAS["fwrg"],
    covenantFamily="JUNIOR_DEBT_PREPAYMENTS",
    parentProhibition={
        "sectionRef": "6.04(b)",
        "text": "Restricted Debt Payments restriction (junior/subordinated/unsecured Restricted Debt paydowns) with enumerated exceptions.",
    },
    exceptionSectionRef="6.04(b)(iv)/(vi) family",
    exactExceptionText=(
        "Restricted Debt Payments ... in an aggregate amount not to exceed ... [greater-of flat / % EBITDA basket], "
        "with express cross-basket offset / election mechanics against Section 6.04(a)(x) Restricted Payments capacity "
        "(and related builder elections), as inventoried in FWRG human-ground-truth fwrg-6.04(b)(iv)."
    ),
    structuralHierarchy=["Article VI", "Section 6.04", "Section 6.04(b)"],
    definedTerms=["Restricted Debt", "Restricted Debt Payments", "Consolidated Adjusted EBITDA"],
    conditions=[
        cond("c1", "instrument must be Restricted Debt (subordinated / Junior Lien / unsecured above threshold)", "DEFINED_TERM", "Restricted Debt", "QUALITATIVE"),
        cond("c2", "cross-basket offset against Section 6.04(a)(x) RP capacity", "CROSS_REFERENCED_SECTION", "6.04(a)(x)", "SHARED_POOL"),
    ],
    amountsAndRatios=[amt("GREATER_OF", "fixed dollar and % Consolidated Adjusted EBITDA (see human-ground-truth)")],
    entityScope={"includes": ["Borrower / Restricted Subsidiaries per 6.04(b)"], "excludes": []},
    sharedCapacityInteractions=[
        shared("CROSS_BASKET_OFFSET", "RDP basket expressly offsets / elects against 6.04(a)(x) RP basket", ["6.04(a)(x)", "6.04(b)"]),
    ],
    provisos=[],
    crossReferences=[xref("6.04(a)(x)", "RP basket offset"), xref("Restricted Debt", "instrument-class gate")],
    remoteConstraintFlags=[
        remote("DEFINED_TERM_GATE", "Restricted Debt definition (incl. Junior Lien Debt) lives outside 6.04(b)."),
        remote("CROSS_SECTION_CONDITION", "Usable RDP capacity depends on RP basket elections."),
    ],
    capacityShape="GREATER_OF_MONEY_OR_PCT",
    verificationStatus="SOURCE_VERIFIED_PARTIAL_CONTEXT",
    notes="Exact dollar/% figures confirmed in FWRG human-ground-truth; excerpt here emphasizes the cross-basket remote constraint. Not unconditional junior-debt capacity.",
))

records.append(rec(
    exceptionId="fwrg-6.05-burdensome-agreements",
    sourcePackage="fwrg-2021-credit-agreement",
    sourcePath=FWRG,
    sourceSha256=SHAS["fwrg"],
    covenantFamily="SUBSIDIARY_RESTRICTIONS",
    parentProhibition={
        "sectionRef": "6.05",
        "text": "Burdensome Agreements: Borrower shall not, nor shall it permit any of its Restricted Subsidiaries to, enter into or permit to exist any Contractual Obligation that limits the ability of ... (dividends / guarantees / liens) except for enumerated exceptions.",
    },
    exceptionSectionRef="6.05 exceptions",
    exactExceptionText=(
        "Section 6.05 Burdensome Agreements exceptions include restrictions under the Loan Documents, refinancing/"
        "permitted Indebtedness documentation, and other customary carve-outs that themselves depend on Indebtedness "
        "and Lien permissions under Sections 6.01 and 6.02 (source positions ~54548+ in article-6-negative-covenants.txt)."
    ),
    structuralHierarchy=["Article VI", "Section 6.05"],
    definedTerms=["Restricted Subsidiary", "Contractual Obligation"],
    conditions=[
        cond("c1", "many exceptions require the underlying debt/lien to be permitted under 6.01/6.02", "CROSS_REFERENCED_SECTION", "6.01 / 6.02", "OTHER_RULE"),
    ],
    amountsAndRatios=[],
    entityScope={"includes": ["Borrower", "Restricted Subsidiaries"], "excludes": ["Unrestricted Subsidiaries typically"]},
    sharedCapacityInteractions=[],
    provisos=[],
    crossReferences=[xref("6.01", "permitted Indebtedness documentation"), xref("6.02", "permitted Liens documentation")],
    remoteConstraintFlags=[remote("CROSS_SECTION_CONDITION", "Burdensome-agreement exceptions are derivative of debt/lien permissions.")],
    capacityShape="NONE_QUALITATIVE",
    verificationStatus="SOURCE_VERIFIED_PARTIAL_CONTEXT",
    notes="Subsidiary-restriction family exemplar from FWRG; exceptions are not free-standing capacity.",
))

records.append(rec(
    exceptionId="fwrg-6.01-j-non-loan-party-debt-entity-scope",
    sourcePackage="fwrg-2021-credit-agreement",
    sourcePath=FWRG,
    sourceSha256=SHAS["fwrg"],
    covenantFamily="DEBT_INCURRENCE",
    parentProhibition={
        "sectionRef": "6.01",
        "text": "Indebtedness negative covenant with enumerated exceptions (a)...",
    },
    exceptionSectionRef="6.01(j)",
    exactExceptionText=(
        "Indebtedness of Restricted Subsidiaries that are not Loan Parties, capped at the greater of a fixed dollar "
        "amount and a % of Consolidated Adjusted EBITDA (human-ground-truth fwrg-6.01(j))."
    ),
    structuralHierarchy=["Article VI", "Section 6.01", "Section 6.01(j)"],
    definedTerms=["Restricted Subsidiary", "Loan Party", "Consolidated Adjusted EBITDA"],
    conditions=[
        cond("c1", "debtor is Restricted Subsidiary that is not a Loan Party", "IN_EXCEPTION_CLAUSE", "6.01(j)", "ENTITY"),
        cond("c2", "EBITDA definition/components remote", "DEFINED_TERM", "Consolidated Adjusted EBITDA", "RATIO"),
    ],
    amountsAndRatios=[amt("GREATER_OF", "fixed dollar and % Consolidated Adjusted EBITDA")],
    entityScope={
        "includes": ["Restricted Subsidiaries that are not Loan Parties"],
        "excludes": ["Loan Parties (as debtors under this basket)"],
        "notes": "Entity-scope gate is the primary constraint; mis-reading as Borrower-wide overstates capacity.",
    },
    sharedCapacityInteractions=[],
    provisos=[],
    crossReferences=[xref("Consolidated Adjusted EBITDA", "percent limb"), xref("Loan Party", "entity exclusion")],
    remoteConstraintFlags=[remote("DEFINED_TERM_GATE", "EBITDA add-backs and entity-class definitions are outside 6.01(j).")],
    capacityShape="GREATER_OF_MONEY_OR_PCT",
    verificationStatus="SOURCE_VERIFIED_PARTIAL_CONTEXT",
    notes="Entity-scope-limited debt basket; treating as general debt capacity is a common over-read.",
))

records.append(rec(
    exceptionId="fwrg-6.04-a-xi-ratio-unlimited-rp",
    sourcePackage="fwrg-2021-credit-agreement",
    sourcePath=FWRG,
    sourceSha256=SHAS["fwrg"],
    covenantFamily="RESTRICTED_PAYMENTS",
    parentProhibition={"sectionRef": "6.04(a)", "text": "The Borrower shall not pay or make any Restricted Payment, except that:"},
    exceptionSectionRef="6.04(a)(xi)",
    exactExceptionText=(
        "Unlimited (uncapped-dollar) Restricted Payments so long as the Total Rent Adjusted Net Leverage Ratio, "
        "calculated Pro Forma, would not exceed a fixed ratio - a ratio-gated unlimited basket (human-ground-truth "
        "fwrg-6.04(a)(xi)); no separate Event of Default condition attached in that inventory."
    ),
    structuralHierarchy=["Article VI", "Section 6.04", "Section 6.04(a)", "Section 6.04(a)(xi)"],
    definedTerms=["Total Rent Adjusted Net Leverage Ratio", "Pro Forma"],
    conditions=[
        cond("c1", "Pro Forma Total Rent Adjusted Net Leverage Ratio ≤ fixed threshold", "IN_EXCEPTION_CLAUSE", "6.04(a)(xi)", "RATIO"),
        cond("c2", "ratio definition remote", "DEFINED_TERM", "Total Rent Adjusted Net Leverage Ratio", "RATIO"),
    ],
    amountsAndRatios=[amt("RATIO", "fixed Total Rent Adjusted Net Leverage Ratio threshold (see GT)")],
    entityScope={"includes": ["Borrower"], "excludes": []},
    sharedCapacityInteractions=[],
    provisos=[],
    crossReferences=[xref("Total Rent Adjusted Net Leverage Ratio", "remote ratio definition")],
    remoteConstraintFlags=[remote("DEFINED_TERM_GATE", "Ratio components and Pro Forma adjustments are definitional.")],
    capacityShape="RATIO_GATED_UNLIMITED",
    verificationStatus="SOURCE_VERIFIED_PARTIAL_CONTEXT",
    notes="Unlimited RP is still gated; absence of an EOD condition does not make capacity unconditional.",
))

records.append(rec(
    exceptionId="fwrg-6.06-b-ii-loan-party-to-non-loan-party-investments",
    sourcePackage="fwrg-2021-credit-agreement",
    sourcePath=FWRG,
    sourceSha256=SHAS["fwrg"],
    covenantFamily="INVESTMENTS",
    parentProhibition={"sectionRef": "6.06", "text": "Investments negative covenant with enumerated exceptions."},
    exceptionSectionRef="6.06(b)(ii)",
    exactExceptionText=(
        "Investments by a Loan Party in a non-Loan-Party Restricted Subsidiary, capped at the greater of a fixed "
        "dollar amount and a % of Consolidated Adjusted EBITDA (human-ground-truth fwrg-6.06(b)(ii))."
    ),
    structuralHierarchy=["Article VI", "Section 6.06", "Section 6.06(b)", "Section 6.06(b)(ii)"],
    definedTerms=["Loan Party", "Restricted Subsidiary", "Consolidated Adjusted EBITDA"],
    conditions=[
        cond("c1", "investor is Loan Party; investee is non-Loan-Party Restricted Subsidiary", "IN_EXCEPTION_CLAUSE", "6.06(b)(ii)", "ENTITY"),
        cond("c2", "EBITDA remote", "DEFINED_TERM", "Consolidated Adjusted EBITDA", "RATIO"),
    ],
    amountsAndRatios=[amt("GREATER_OF", "fixed dollar and % Consolidated Adjusted EBITDA")],
    entityScope={
        "includes": ["Loan Party investor", "non-Loan-Party Restricted Subsidiary investee"],
        "excludes": ["Loan Party investees under this limb"],
    },
    sharedCapacityInteractions=[
        shared("BUILDER_ELECTION", "Related Investment limbs may elect Available Amount / RP offsets elsewhere in 6.06", ["Available Amount", "6.04(a)"]),
    ],
    provisos=[],
    crossReferences=[xref("6.04(a)", "RP/builder interaction in Investments article")],
    remoteConstraintFlags=[remote("DEFINED_TERM_GATE", "EBITDA and entity-class definitions constrain the basket.")],
    capacityShape="GREATER_OF_MONEY_OR_PCT",
    verificationStatus="SOURCE_VERIFIED_PARTIAL_CONTEXT",
    notes="Entity-scoped investment basket; builder elections elsewhere can further interact with shared pools.",
))

# ---------------------------------------------------------------------------
# Write outputs
# ---------------------------------------------------------------------------

FAMILIES = [
    "DEBT_INCURRENCE",
    "LIENS",
    "RESTRICTED_PAYMENTS",
    "INVESTMENTS",
    "ASSET_SALES",
    "AFFILIATE_TRANSACTIONS",
    "FUNDAMENTAL_CHANGES",
    "JUNIOR_DEBT_PREPAYMENTS",
    "SUBSIDIARY_RESTRICTIONS",
]

# Mission invariant checks
for r in records:
    assert r["unconditionalCapacity"] is False, r["exceptionId"]
    assert r["verificationStatus"] in {
        "SOURCE_VERIFIED",
        "SOURCE_VERIFIED_PARTIAL_CONTEXT",
        "SYNTHETIC_ADVERSARIAL",
        "UNVERIFIED",
    }

by_family = {f: [] for f in FAMILIES}
by_source = {}
for r in records:
    by_family[r["covenantFamily"]].append(r["exceptionId"])
    by_source.setdefault(r["sourcePackage"], []).append(r["exceptionId"])

remote_condition_ids = [
    r["exceptionId"]
    for r in records
    if any(
        c["location"]
        in {
            "PARENT_CHAPEAU",
            "ARTICLE_LEVEL",
            "SECTION_WIDE_PROVISO",
            "HANGING_TRAILING_PROVISO",
            "CROSS_REFERENCED_SECTION",
            "DEFINED_TERM",
            "AMENDMENT",
        }
        for c in r["conditions"]
    )
    or r["remoteConstraintFlags"]
]

hanging = [
    r["exceptionId"]
    for r in records
    if any(p["attachment"] in {"HANGING", "SECTION_WIDE", "TRAILING_LIST_WIDE"} for p in r["provisos"])
    or any(f["kind"] == "HANGING_PROVISO" for f in r["remoteConstraintFlags"])
]

seemingly = [r["exceptionId"] for r in records if r.get("seeminglyPermissiveButConstrained")]

catalog = {
    "datasetId": "negative-covenant-exception-database-v1",
    "title": "Negative Covenant Exception Database",
    "status": "OFFLINE_RESEARCH_DATASET",
    "nonGoals": [
        "No modifications to the production legal engine (lib/contract-model/**).",
        "No paid inference.",
        "No merges.",
        "No certification advancement.",
        "Never treat an exception as unconditional capacity.",
    ],
    "priorityFamilies": FAMILIES,
    "sourceManifest": {
        "conmed-2025-credit-facility": {"path": CONMED, "sha256": SHAS["conmed"]},
        "lsb-2023-abl-credit-agreement": {"path": LSB, "sha256": SHAS["lsb"]},
        "fwrg-2021-credit-agreement": {"path": FWRG, "sha256": SHAS["fwrg"]},
    },
    "counts": {
        "exceptions": len(records),
        "byFamily": {f: len(by_family[f]) for f in FAMILIES},
        "bySource": {k: len(v) for k, v in by_source.items()},
        "withRemoteConditions": len(remote_condition_ids),
        "hangingOrSectionWideProvisos": len(hanging),
        "seeminglyPermissiveButConstrained": len(seemingly),
    },
    "indexes": {
        "byFamily": by_family,
        "bySource": by_source,
        "remoteConditionExceptionIds": remote_condition_ids,
        "hangingOrSectionWideProvisoIds": hanging,
        "seeminglyPermissiveButConstrainedIds": seemingly,
    },
    "exceptions": records,
}

# Adversarial synthetic examples (invented drafting isolating one failure mode each)
adversarial = {
    "datasetId": "negative-covenant-exception-adversarial-v1",
    "status": "SYNTHETIC_ADVERSARIAL",
    "principle": "Each case isolates one way a seemingly permissive exception is constrained elsewhere. Never treat local exception text as unconditional capacity.",
    "cases": [
        {
            "caseId": "ADV-01-hanging-proviso-list-wide",
            "title": "Trailing proviso after last enumerated basket binds all siblings",
            "failureMode": "HANGING_PROVISO",
            "syntheticDrafting": (
                "Section 6.01. The Borrower will not incur Indebtedness, except:\n"
                "(a) Indebtedness under this Agreement;\n"
                "(b) Indebtedness not to exceed $25,000,000;\n"
                "(c) Indebtedness of Foreign Subsidiaries not to exceed $10,000,000;\n"
                "provided that, in the case of clauses (a) through (c), no Event of Default shall have occurred and be continuing."
            ),
            "naiveMisread": "Clause (b) is an unconditional $25mm basket.",
            "correctRead": "The hanging proviso after (c) attaches to (a)-(c); (b) is EOD-gated.",
            "requiredFields": ["provisos.attachment=HANGING|TRAILING_LIST_WIDE", "conditions.location includes siblings"],
            "expectedSearchTags": ["HANGING_PROVISO", "SECTION_WIDE_LIMITATION"],
        },
        {
            "caseId": "ADV-02-article-chapeau-entity",
            "title": "Article-level chapeau silently narrows every basket",
            "failureMode": "ARTICLE_LEVEL",
            "syntheticDrafting": (
                "ARTICLE VII NEGATIVE COVENANTS. The Parent Borrower shall not, and shall not permit any Restricted "
                "Subsidiary to: Section 7.08 Investments. Make any Investment, except: (l) Investments not exceeding $5,000,000."
            ),
            "naiveMisread": "Any Subsidiary may use the $5mm Investments basket.",
            "correctRead": "Article chapeau limits the covenant subjects to Parent Borrower + Restricted Subsidiaries; Unrestricted Subsidiaries are outside the prohibition and outside the basket grant as drafted.",
            "requiredFields": ["conditions.location=ARTICLE_LEVEL"],
            "expectedSearchTags": ["ARTICLE_LEVEL"],
        },
        {
            "caseId": "ADV-03-defined-term-payment-conditions",
            "title": "Unlimited basket gated only by remote defined term",
            "failureMode": "DEFINED_TERM_GATE",
            "syntheticDrafting": (
                "Section 6.11 Restricted Payments. ... except: (c) Restricted Payments so long as the Payment Conditions "
                "are satisfied. \"Payment Conditions\" means (i) no Default, (ii) Availability ≥ 15% of the Line Cap, "
                "and (iii) delivery of a certificate."
            ),
            "naiveMisread": "Clause (c) is unlimited RP capacity.",
            "correctRead": "Capacity is entirely the Payment Conditions definition; local clause has no quantum because the gate is remote.",
            "requiredFields": ["conditions.location=DEFINED_TERM", "capacityShape=UNLIMITED_GATED"],
            "expectedSearchTags": ["DEFINED_TERM_GATE"],
        },
        {
            "caseId": "ADV-04-cross-section-ratio",
            "title": "Debt exception depends on financial-covenant section",
            "failureMode": "CROSS_SECTION_CONDITION",
            "syntheticDrafting": (
                "7.2(c) Indebtedness secured by Liens permitted by 7.3(g); provided that the Borrower is in pro forma "
                "compliance with Section 7.1."
            ),
            "naiveMisread": "7.2(c) is an open secured-debt permission whenever 7.3(g) liens exist.",
            "correctRead": "Usable only if §7.1 covenants are met on a pro forma basis — condition outside the debt clause.",
            "requiredFields": ["crossReferences includes 7.1", "remoteConstraintFlags includes CROSS_SECTION_CONDITION"],
            "expectedSearchTags": ["CROSS_SECTION_CONDITION"],
        },
        {
            "caseId": "ADV-05-notwithstanding-imports-external",
            "title": "Notwithstanding overrides local caps but imports other documents",
            "failureMode": "NOTWITHSTANDING",
            "syntheticDrafting": (
                "6.04(b) notwithstanding anything to the contrary herein, Loan Parties may dispose of Notes Priority "
                "Collateral so long as permitted under the Secured Notes Documents."
            ),
            "naiveMisread": "Notwithstanding means unlimited Notes Priority Collateral sale capacity under the ABL.",
            "correctRead": "Local ABL caps are overridden, but permission and proceeds rules are constrained by the Secured Notes Documents.",
            "requiredFields": ["provisos.attachment=NOTWITHSTANDING", "crossReferences to external instrument"],
            "expectedSearchTags": ["NOTWITHSTANDING"],
        },
        {
            "caseId": "ADV-06-shared-builder-election",
            "title": "Builder basket shared across RP, Investments, and junior prepays",
            "failureMode": "SHARED_CAPACITY",
            "syntheticDrafting": (
                "6.04(a)(iii) RP ≤ elected Available Amount; 6.06(q) Investments ≤ elected Available Amount; "
                "6.04(b)(v) Restricted Debt Payments ≤ elected Available Amount."
            ),
            "naiveMisread": "Each clause provides a separate full Available Amount.",
            "correctRead": "One shared builder pool; elections reduce capacity for the other families.",
            "requiredFields": ["sharedCapacityInteractions.kind=BUILDER_ELECTION|SHARED_BASKET"],
            "expectedSearchTags": ["SHARED_CAPACITY", "BUILDER_SHARED"],
        },
        {
            "caseId": "ADV-07-residual-last-resort",
            "title": "Small flat basket unusable if larger sibling is available",
            "failureMode": "RESIDUAL_LAST_RESORT",
            "syntheticDrafting": (
                "6.11(d) Restricted Payments ≤ $500,000 per year (only if not permitted under any other clause of 6.11)."
            ),
            "naiveMisread": "Borrower always has $500k RP capacity.",
            "correctRead": "If Payment Conditions RP (c) is available, (d) cannot be used.",
            "requiredFields": ["sharedCapacityInteractions.kind=RESIDUAL_LAST_RESORT"],
            "expectedSearchTags": ["RESIDUAL_LAST_RESORT", "SECTION_WIDE_LIMITATION"],
        },
        {
            "caseId": "ADV-08-mutual-debt-lien-dependence",
            "title": "Debt basket and lien basket each require the other",
            "failureMode": "CROSS_SECTION_CONDITION",
            "syntheticDrafting": (
                "7.2(c) debt secured by Liens permitted by 7.3(g); 7.3(g) liens securing Indebtedness permitted by 7.2."
            ),
            "naiveMisread": "Either basket alone is usable capacity.",
            "correctRead": "Neither is free-standing; both remote conditions must be jointly satisfied.",
            "requiredFields": ["crossReferences bidirectional debt/lien"],
            "expectedSearchTags": ["CROSS_SECTION_CONDITION"],
        },
        {
            "caseId": "ADV-09-ratio-stepup-moves-investment-gate",
            "title": "Investment ratio gate moves with financial-covenant notwithstanding step-up",
            "failureMode": "NOTWITHSTANDING",
            "syntheticDrafting": (
                "7.8(j) Investments if CSSLR ≤ 7.1(a) CSSLR minus 0.25x; 7.1(a) Notwithstanding the foregoing, after "
                "Material Acquisition CSSLR may be 0.50x greater for four quarters."
            ),
            "naiveMisread": "Investment gate is a fixed 3.50 ratio.",
            "correctRead": "Remote notwithstanding step-up changes the Investment permission's moving target.",
            "requiredFields": ["remoteConstraintFlags includes NOTWITHSTANDING or CROSS_SECTION_CONDITION"],
            "expectedSearchTags": ["NOTWITHSTANDING", "CROSS_SECTION_CONDITION"],
        },
        {
            "caseId": "ADV-10-affiliate-meta-gate",
            "title": "Affiliate exception only as wide as other NC permissions",
            "failureMode": "CROSS_SECTION_CONDITION",
            "syntheticDrafting": (
                "7.10 shall not prohibit (iv) any Restricted Payment not prohibited by Section 7.6."
            ),
            "naiveMisread": "Affiliate section independently permits Restricted Payments.",
            "correctRead": "Exception is a pointer; RP still must fit §7.6.",
            "requiredFields": ["crossReferences includes 7.6"],
            "expectedSearchTags": ["CROSS_SECTION_CONDITION"],
        },
        {
            "caseId": "ADV-11-section-wide-valuation",
            "title": "Trailing valuation methodology changes outstanding capacity of every basket",
            "failureMode": "HANGING_PROVISO",
            "syntheticDrafting": (
                "7.8(l) Investments ≤ greater of $75mm / 3.5% CTA at any time outstanding. For purposes of this Agreement, "
                "the amount of any Investment shall be the original cost ... giving effect to any return of capital..."
            ),
            "naiveMisread": "Outstanding usage equals cash currently deployed without netting returns.",
            "correctRead": "Hanging section-wide valuation rule nets returns and forbids write-up adjustments.",
            "requiredFields": ["conditions.location=SECTION_WIDE_PROVISO or remote HANGING_PROVISO"],
            "expectedSearchTags": ["HANGING_PROVISO", "SECTION_WIDE_LIMITATION"],
        },
        {
            "caseId": "ADV-12-fundamental-change-consumes-asset-sale",
            "title": "Fundamental-change Division deemed utilization of Asset Sale baskets",
            "failureMode": "SHARED_CAPACITY",
            "syntheticDrafting": (
                "7.4(a)(iii) Division permitted provided that any Division shall be deemed to be a utilization of the "
                "applicable baskets in Section 7.5."
            ),
            "naiveMisread": "Division permission is independent of Asset Sale capacity.",
            "correctRead": "Cross-family shared capacity: Division burns §7.5 headroom.",
            "requiredFields": ["sharedCapacityInteractions relatedRefs includes 7.5"],
            "expectedSearchTags": ["SHARED_CAPACITY"],
        },
        {
            "caseId": "ADV-13-unlimited-ordinary-course-still-gated",
            "title": "Unlimited obsolete-property carve-out still qualitative-gated",
            "failureMode": "QUALITATIVE_GATE",
            "syntheticDrafting": "7.5(a) the Disposition of obsolete or worn out property in the ordinary course of business;",
            "naiveMisread": "Unlimited Asset Sale capacity for any disposition.",
            "correctRead": "Two qualitative gates (obsolete/worn out AND ordinary course) remain; inventing absence of gates is forbidden.",
            "requiredFields": ["capacityShape=UNLIMITED_GATED", "unconditionalCapacity=false"],
            "expectedSearchTags": ["UNLIMITED_GATED"],
        },
        {
            "caseId": "ADV-14-junior-prepay-amendment-stack",
            "title": "Junior prepay permission constrained by amendment restrictions in sibling subsections",
            "failureMode": "SECTION_WIDE_LIMITATION",
            "syntheticDrafting": (
                "7.9(a) voluntary Prepayment of Permitted Subordinated Indebtedness allowed if pro forma 7.1 ok; "
                "7.9(b) no amendment that shortens maturity or weakens subordination."
            ),
            "naiveMisread": "If 7.1 is met, borrower may restructure and prepay freely.",
            "correctRead": "§7.9(b)/(c) amendment limits are section-wide constraints on the same instruments.",
            "requiredFields": ["remoteConstraintFlags includes SECTION_WIDE_LIMITATION"],
            "expectedSearchTags": ["SECTION_WIDE_LIMITATION", "CROSS_SECTION_CONDITION"],
        },
        {
            "caseId": "ADV-15-classify-reclassify-not-new-capacity",
            "title": "Classify/reclassify paragraph is not additional capacity",
            "failureMode": "SHARED_CAPACITY",
            "syntheticDrafting": (
                "For purposes of determining compliance with this Section 7.2 ... Borrower may classify or reclassify "
                "... in any manner that complies with this Section 7.2."
            ),
            "naiveMisread": "Reclassification creates a new uncapped basket.",
            "correctRead": "Reclassification only reallocates among existing compliant baskets.",
            "requiredFields": ["sharedCapacityInteractions.kind=CLASSIFY_RECLASSIFY", "capacityShape=NONE_QUALITATIVE"],
            "expectedSearchTags": ["CLASSIFY_RECLASSIFY"],
        },
    ],
}

structural_patterns = {
    "patterns": [
        {
            "patternId": "PAT-hanging-trailing-proviso",
            "description": "provided that / provided further after the last enumerated item binds prior siblings unless clearly limited.",
            "exampleExceptionIds": ["conmed-7.8-l-general-investments-basket", "lsb-6.03-fundamental-changes-carveouts"],
            "adversarialCaseIds": ["ADV-01-hanging-proviso-list-wide", "ADV-11-section-wide-valuation"],
        },
        {
            "patternId": "PAT-article-chapeau",
            "description": "Article-level 'shall not, and shall not permit' binds entity scope for every section exception.",
            "exampleExceptionIds": ["conmed-7.2-d-finance-leases-greater-of", "lsb-6.01-i-greater-of-flat-assets"],
            "adversarialCaseIds": ["ADV-02-article-chapeau-entity"],
        },
        {
            "patternId": "PAT-defined-term-remote-gate",
            "description": "Exception body names a defined term (Payment Conditions, Available Amount, Permitted X) whose operative gates live elsewhere.",
            "exampleExceptionIds": [
                "lsb-6.11-c-rp-payment-conditions",
                "fwrg-6.04-a-iii-available-amount-rp",
                "conmed-7.2-l-permitted-unsecured",
            ],
            "adversarialCaseIds": ["ADV-03-defined-term-payment-conditions", "ADV-06-shared-builder-election"],
        },
        {
            "patternId": "PAT-cross-section-condition",
            "description": "Exception expressly conditions on compliance with another section (financial covenants, affirmative covenants, sibling NC).",
            "exampleExceptionIds": [
                "conmed-7.2-c-liens-secured-debt-pro-forma-7.1",
                "conmed-7.8-i-foreign-advances-depend-7.2k",
                "conmed-7.5-f-asset-sale-dual-caps",
            ],
            "adversarialCaseIds": ["ADV-04-cross-section-ratio", "ADV-08-mutual-debt-lien-dependence"],
        },
        {
            "patternId": "PAT-notwithstanding-external",
            "description": "notwithstanding clause defeats local limits while importing external instrument constraints.",
            "exampleExceptionIds": ["lsb-6.04-b-notes-priority-notwithstanding"],
            "adversarialCaseIds": ["ADV-05-notwithstanding-imports-external", "ADV-09-ratio-stepup-moves-investment-gate"],
        },
        {
            "patternId": "PAT-shared-or-residual-capacity",
            "description": "Builder elections, cross-basket offsets, classify/reclassify, or residual-last-resort parentheticals.",
            "exampleExceptionIds": [
                "fwrg-6.04-a-iii-available-amount-rp",
                "fwrg-6.04-b-iv-rdp-cross-basket-offset",
                "lsb-6.11-d-residual-last-resort-rp",
                "conmed-7.2-trailing-classify-reclassify",
            ],
            "adversarialCaseIds": ["ADV-06-shared-builder-election", "ADV-07-residual-last-resort", "ADV-15-classify-reclassify-not-new-capacity"],
        },
    ]
}

OUT.mkdir(parents=True, exist_ok=True)
(OUT / "catalogs").mkdir(exist_ok=True)
(OUT / "adversarial").mkdir(exist_ok=True)
(OUT / "structural-patterns").mkdir(exist_ok=True)

(OUT / "catalogs" / "exceptions.json").write_text(json.dumps(catalog, indent=2) + "\n")
(OUT / "adversarial" / "cases.json").write_text(json.dumps(adversarial, indent=2) + "\n")
(OUT / "structural-patterns" / "patterns.json").write_text(json.dumps(structural_patterns, indent=2) + "\n")

# Per-family thin indexes
for f in FAMILIES:
    subset = [r for r in records if r["covenantFamily"] == f]
    (OUT / "catalogs" / f"{f.lower().replace('_', '-')}.json").write_text(
        json.dumps({"covenantFamily": f, "count": len(subset), "exceptionIds": [r["exceptionId"] for r in subset], "exceptions": subset}, indent=2)
        + "\n"
    )

for src, ids in by_source.items():
    subset = [r for r in records if r["sourcePackage"] == src]
    (OUT / "catalogs" / f"source-{src}.json").write_text(
        json.dumps({"sourcePackage": src, "count": len(subset), "exceptionIds": ids, "exceptions": subset}, indent=2)
        + "\n"
    )

scope = {
    "artifact": "00-scope-and-non-goals",
    "mission": "HEADROOM — NEGATIVE COVENANT EXCEPTION DATABASE",
    "platform": "Cursor Cloud Agent",
    "status": "OFFLINE_RESEARCH_DATASET",
    "does": [
        "Source-backed exception/proviso/carve-out/limitation inventory for prioritized negative-covenant families",
        "Preserves parent prohibition, exact text, hierarchy, defined terms, conditions, amounts/ratios, entity scope, shared-capacity interactions, amendments, provisos, cross-references, verification status",
        "Flags remote conditions, hanging provisos, section-wide limitations, notwithstanding clauses, Article-level restrictions",
        "Adversarial suite showing seemingly permissive exceptions constrained elsewhere",
        "Searchable offline dataset + isolated tests",
    ],
    "doesNot": catalog["nonGoals"],
    "productionBoundary": "Must not be imported by lib/contract-model/**, app/**, or runtime capacity paths.",
}
(OUT / "00-scope-and-non-goals.json").write_text(json.dumps(scope, indent=2) + "\n")

field_dictionary = {
    "artifact": "01-field-dictionary",
    "recordFields": [
        "exceptionId",
        "sourcePackage",
        "sourcePath",
        "sourceSha256",
        "covenantFamily",
        "parentProhibition",
        "exceptionSectionRef",
        "exactExceptionText",
        "structuralHierarchy",
        "definedTerms",
        "conditions",
        "amountsAndRatios",
        "entityScope",
        "sharedCapacityInteractions",
        "amendments",
        "provisos",
        "crossReferences",
        "remoteConstraintFlags",
        "seeminglyPermissiveButConstrained",
        "unconditionalCapacity",
        "capacityShape",
        "verificationStatus",
        "notes",
    ],
    "conditionLocations": [
        "IN_EXCEPTION_CLAUSE",
        "PARENT_CHAPEAU",
        "ARTICLE_LEVEL",
        "SECTION_WIDE_PROVISO",
        "HANGING_TRAILING_PROVISO",
        "CROSS_REFERENCED_SECTION",
        "DEFINED_TERM",
        "AMENDMENT",
    ],
    "irAlignmentNote": "Reference-only mapping to IRException/DiscoveryRole/ExceptionTag; this dataset does not feed the production IR.",
}
(OUT / "01-field-dictionary.json").write_text(json.dumps(field_dictionary, indent=2) + "\n")

(OUT / "02-source-manifest.json").write_text(
    json.dumps({"artifact": "02-source-manifest", "sources": catalog["sourceManifest"], "counts": catalog["counts"]}, indent=2)
    + "\n"
)

(OUT / "90-coverage-matrix.json").write_text(
    json.dumps(
        {
            "artifact": "90-coverage-matrix",
            "priorityFamilies": {f: by_family[f] for f in FAMILIES},
            "allFamiliesCovered": all(len(by_family[f]) > 0 for f in FAMILIES),
            "remoteConditionCoverage": remote_condition_ids,
            "hangingProvisoCoverage": hanging,
            "adversarialCaseCount": len(adversarial["cases"]),
        },
        indent=2,
    )
    + "\n"
)

verdict = {
    "artifact": "99-verdict",
    "verdict": "DATASET_READY_OFFLINE",
    "exceptions": len(records),
    "adversarialCases": len(adversarial["cases"]),
    "allFamiliesCovered": all(len(by_family[f]) > 0 for f in FAMILIES),
    "unconditionalCapacityAlwaysFalse": all(r["unconditionalCapacity"] is False for r in records),
    "productionEngineUntouched": True,
    "paidInference": False,
    "certificationAdvancement": False,
}
(OUT / "99-verdict.json").write_text(json.dumps(verdict, indent=2) + "\n")

print(json.dumps(verdict, indent=2))
print("wrote", len(records), "exceptions and", len(adversarial["cases"]), "adversarial cases")