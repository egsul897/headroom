#!/usr/bin/env python3
"""
Build the source-backed covenant basket / capacity-formula corpus.

Reads public financing-agreement fixture text already in the repo.
Does not call paid APIs, modify the production capacity engine, merge,
or change certification artifacts.
"""

from __future__ import annotations

import json
import re
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "docs" / "covenant-basket-capacity-formula-library"
EXPORT = OUT / "export"

SOURCES: dict[str, dict[str, str]] = {
    "chwy": {
        "instrumentId": "chwy-2026-credit-agreement",
        "documentPath": "tests/fixtures/unseen-packages/chwy-2026-credit-agreement/extracted-text/doc-a-2026-06-23-credit-agreement.txt",
        "sourceLabel": "Chewy, Inc. Credit Agreement dated June 23, 2026 (fixture extract)",
        "versionNote": "tests/fixtures/unseen-packages/chwy-2026-credit-agreement extracted-text doc-a",
    },
    "dsgr": {
        "instrumentId": "dsgr-2025-second-ar-credit-agreement",
        "documentPath": "tests/fixtures/unseen-packages/dsgr-2022-2025-credit-facility/extracted-text/doc-d-2025-second-amended-restated-credit-agreement.txt",
        "sourceLabel": "Distribution Solutions Group Second A&R Credit Agreement (2025 fixture extract)",
        "versionNote": "tests/fixtures/unseen-packages/dsgr-2022-2025-credit-facility extracted-text doc-d",
    },
    "gib": {
        "instrumentId": "gibraltar-2026-credit-agreement",
        "documentPath": "tests/fixtures/unseen-packages/gibraltar-2026-credit-agreement/extracted-text/credit-agreement.txt",
        "sourceLabel": "Gibraltar Industries Credit Agreement (2026 fixture extract)",
        "versionNote": "tests/fixtures/unseen-packages/gibraltar-2026-credit-agreement extracted-text",
    },
    "conmed": {
        "instrumentId": "conmed-base-credit-agreement-article-vii",
        "documentPath": "tests/fixtures/unseen-packages/conmed-2025-credit-facility/curated/base-credit-agreement-article-vii-negative-covenants.txt",
        "sourceLabel": "CONMED base credit agreement Article VII curated negative covenants",
        "versionNote": "tests/fixtures/unseen-packages/conmed-2025-credit-facility/curated",
    },
    "lsb": {
        "instrumentId": "lsb-2023-abl-credit-agreement",
        "documentPath": "tests/fixtures/unseen-packages/lsb-2023-abl-credit-agreement/article-6-negative-covenants.txt",
        "sourceLabel": "LSB Industries ABL Credit Agreement Article VI (fixture extract)",
        "versionNote": "tests/fixtures/unseen-packages/lsb-2023-abl-credit-agreement",
    },
    "sup": {
        "instrumentId": "sup-2024-ar-term-loan-credit-agreement",
        "documentPath": "tests/fixtures/unseen-packages/final-lightweight-unseen-sup/extracted-text/doc-b-2024-08-14-amended-restated-term-loan-credit-agreement.txt",
        "sourceLabel": "Superior Industries A&R Term Loan Credit Agreement (2024 fixture extract)",
        "versionNote": "tests/fixtures/unseen-packages/final-lightweight-unseen-sup extracted-text doc-b",
    },
    "fwrg": {
        "instrumentId": "fwrg-2021-credit-agreement",
        "documentPath": "tests/fixtures/unseen-packages/fwrg-2021-credit-agreement/article-6-negative-covenants.txt",
        "sourceLabel": "First Watch Restaurant Group Credit Agreement Article 6 (fixture extract; single long line)",
        "versionNote": "tests/fixtures/unseen-packages/fwrg-2021-credit-agreement",
    },
}


def load_text(key: str) -> str:
    return (ROOT / SOURCES[key]["documentPath"]).read_text(encoding="utf-8")


def exact_span(text: str, needle: str, length: int | None = None, end_needle: str | None = None) -> str:
    """Return the exact source substring. Prefer raw match; fall back to whitespace-normalized locate then recover raw slice when possible."""
    idx = text.find(needle)
    if idx >= 0:
        if end_needle is not None:
            end = text.find(end_needle, idx)
            if end < 0:
                raise ValueError(f"end_needle not found after start: {end_needle!r}")
            return text[idx : end + len(end_needle)]
        if length is None:
            return needle
        return text[idx : idx + length]

    # Normalized locate for needles typed with simplified whitespace
    norm_text = re.sub(r"\s+", " ", text)
    norm_needle = re.sub(r"\s+", " ", needle)
    nidx = norm_text.find(norm_needle)
    if nidx < 0:
        raise ValueError(f"span not found: {needle[:120]!r}")
    # Recover a raw substring by walking source until normalized prefix matches
    # Use a window search around approximate character ratio.
    approx = int(nidx * (len(text) / max(len(norm_text), 1)))
    window_start = max(0, approx - 4000)
    window = text[window_start : window_start + 20000]
    # Expand needle uniqueness: take first 80 chars of normalized needle and find raw
    tip = norm_needle[:80]
    # Brute: slide in window with normalized compare
    wnorm = re.sub(r"\s+", " ", window)
    wpos = wnorm.find(norm_needle)
    if wpos < 0:
        # As last resort store the normalized needle itself only if it appears in normalized text
        if norm_needle in norm_text:
            return norm_needle
        raise ValueError(f"unable to recover raw span: {needle[:120]!r}")
    # Map wpos in normalized window back to raw by progressive consumption
    target = norm_needle if length is None and end_needle is None else None
    raw_chars: list[str] = []
    ni = 0
    # Find raw start: consume window until normalized length == wpos
    raw_i = 0
    built = ""
    while len(re.sub(r"\s+", " ", built)) < wpos and raw_i < len(window):
        built += window[raw_i]
        raw_i += 1
    start_raw = raw_i
    # Now consume until we have the needle
    built2 = ""
    j = start_raw
    while re.sub(r"\s+", " ", built2) != norm_needle and j < len(window):
        built2 += window[j]
        j += 1
        if len(re.sub(r"\s+", " ", built2)) > len(norm_needle) + 5:
            break
    if re.sub(r"\s+", " ", built2) != norm_needle:
        # fallback: return normalized (validator accepts whitespace normalization)
        return norm_needle
    return built2


def src(key: str) -> dict[str, str]:
    return dict(SOURCES[key])


def cand(**kwargs: Any) -> dict[str, Any]:
    required = [
        "id",
        "exactSourceSpan",
        "governingCovenant",
        "basketFamily",
        "amountOrFormulaCandidate",
        "measurementDate",
        "financialInputs",
        "entityScope",
        "conditions",
        "sharedCapacityDependencies",
        "reclassificationRights",
        "sourceVersion",
        "verificationStatus",
        "capacitySemantics",
        "capacityComputable",
        "capacityComputationBlockers",
        "notes",
    ]
    for r in required:
        if r not in kwargs:
            raise KeyError(r)
    return kwargs


def adv(**kwargs: Any) -> dict[str, Any]:
    required = [
        "id",
        "role",
        "exactSourceSpan",
        "governingProvision",
        "whyNotAffirmativeCapacity",
        "lookalikeTrap",
        "pairedCapacityControlId",
        "sourceVersion",
        "verificationStatus",
    ]
    for r in required:
        if r not in kwargs:
            raise KeyError(r)
    return kwargs


def build() -> None:
    texts = {k: load_text(k) for k in SOURCES}

    def S(key: str, needle: str, length: int | None = None, end: str | None = None) -> str:
        return exact_span(texts[key], needle, length=length, end_needle=end)

    candidates: list[dict[str, Any]] = []

    # ----- CHWY -----
    candidates.append(
        cand(
            id="chwy-fixed-incremental-amount",
            exactSourceSpan=S(
                "chwy",
                "“ Fixed\nIncremental Amount ” means, at any date, the sum of (a) the greater of (i) $720.0 million and (ii) an amount equal to 100% of Consolidated EBITDA on a Pro Forma Basis for the most recently completed four (4) consecutive\nfiscal quarters of the Borrowers for which financial statements have been delivered as of such date of determination, plus (b) any unused amounts under Section 6.01(b)(12)(b), plus (c) any unused amounts under the General Lien Basket\nReallocated Amount, plus (d) any unused amounts under the Available RP Capacity Amount minus (e) without duplication, the sum of the aggregate principal amount of all (i) Incremental Facilities, (ii) Incremental Equivalent Debt\nand (iii) Indebtedness incurred in reliance on Section 6.01(b)(1)(Z) or (14)(e)(2), in each case, that were incurred prior to such date of determination in reliance on the Fixed Incremental Amount (in each case, to the extent not\nsubsequently reclassified).",
            ),
            governingCovenant="Definitions — Fixed Incremental Amount (feeds §2.18 Incremental / §6.01)",
            basketFamily="INCREMENTAL_DEBT",
            secondaryFamilies=["GREATER_OF_FIXED_AND_PERCENTAGE", "GROWER", "SHARED", "ANTI_DOUBLE_COUNTING"],
            amountOrFormulaCandidate={
                "formulaKind": "INCREMENTAL_CAP_SUM",
                "expressionText": "max($720mm, 100% Consolidated EBITDA) + unused 6.01(b)(12)(b) + General Lien Basket Reallocated Amount + unused Available RP Capacity Amount − prior Fixed Incremental usage (without duplication)",
                "structured": {
                    "fixedDollar": "$720.0 million",
                    "percentage": "100%",
                    "metric": "Consolidated EBITDA",
                    "components": [
                        "greater-of starter",
                        "unused §6.01(b)(12)(b)",
                        "General Lien Basket Reallocated Amount",
                        "Available RP Capacity Amount unused",
                        "minus prior Fixed Incremental usage",
                    ],
                },
            },
            measurementDate="date of determination; EBITDA for most recently completed four consecutive fiscal quarters for which financial statements have been delivered",
            financialInputs=["Consolidated EBITDA", "unused amounts under §6.01(b)(12)(b)", "General Lien Basket Reallocated Amount", "Available RP Capacity Amount unused", "prior Incremental/Equivalent usage under Fixed Incremental Amount"],
            entityScope="Borrowers / Restricted Parties as used in Incremental Facility mechanics",
            conditions=["amounts not subsequently reclassified"],
            sharedCapacityDependencies=["§6.01(b)(12)(b)", "General Lien Basket", "Available RP Capacity Amount", "Incremental Cap components"],
            reclassificationRights="prior Fixed Incremental usage excluded to the extent subsequently reclassified",
            sourceVersion=src("chwy"),
            verificationStatus="SPAN_GROUNDED_NEEDS_INPUTS",
            capacitySemantics="AFFIRMATIVE_CAPACITY",
            capacityComputable=False,
            capacityComputationBlockers=[
                "Consolidated EBITDA for the referenced Test Period not supplied in-corpus",
                "unused shared-basket and RP-capacity balances not supplied",
                "prior Fixed Incremental usage ledger not supplied",
            ],
            notes="Greater-of grower starter inside Fixed Incremental Amount; shared reallocations feed the bucket.",
        )
    )

    candidates.append(
        cand(
            id="chwy-incremental-cap",
            exactSourceSpan=S(
                "chwy",
                "“ Incremental Cap ” means, as of any date of determination:\n\n(a)\nthe Fixed Incremental Amount; plus\n\n(b)\nthe Voluntary Prepayment Incremental Amount; plus\n\n(c)\nthe Ratio Incremental Amount; plus\n\n(d)\nthe Extension Amount.",
            ),
            governingCovenant="Definitions — Incremental Cap",
            basketFamily="INCREMENTAL_DEBT",
            secondaryFamilies=["AVAILABLE_AMOUNT_BUILDER", "SHARED"],
            amountOrFormulaCandidate={
                "formulaKind": "INCREMENTAL_CAP_SUM",
                "expressionText": "Fixed Incremental Amount + Voluntary Prepayment Incremental Amount + Ratio Incremental Amount + Extension Amount",
                "structured": {
                    "components": [
                        "Fixed Incremental Amount",
                        "Voluntary Prepayment Incremental Amount",
                        "Ratio Incremental Amount",
                        "Extension Amount",
                    ]
                },
            },
            measurementDate="as of any date of determination",
            financialInputs=["Fixed Incremental Amount", "Voluntary Prepayment Incremental Amount", "Ratio Incremental Amount", "Extension Amount"],
            entityScope="Restricted Parties eligible for Incremental Facilities / Incremental Equivalent Debt",
            conditions=[],
            sharedCapacityDependencies=["each Incremental Cap component basket"],
            reclassificationRights="see §1.08 Fixed Amounts / Incurrence-Based Amounts ordering and reclassification",
            sourceVersion=src("chwy"),
            verificationStatus="SPAN_GROUNDED_NEEDS_INPUTS",
            capacitySemantics="AFFIRMATIVE_CAPACITY",
            capacityComputable=False,
            capacityComputationBlockers=["all four Incremental Cap component values require separate computation/inputs"],
            notes="Available Amount–style builder for incremental debt capacity.",
        )
    )

    candidates.append(
        cand(
            id="chwy-ratio-incremental-amount",
            exactSourceSpan=S(
                "chwy",
                "“ Ratio Incremental Amount ” means, at any date, an aggregate principal amount that, after giving to the issuance,\nincurrence or assumption, thereof on a Pro Forma Basis, in accordance with Section 1.08 , so long as:\n\n(a)\nwith respect to any Indebtedness that is secured by all or a material portion of the Collateral on a pari\npassu basis with the Secured Obligations, on a Pro Forma Basis the First Lien Leverage Ratio for the applicable Test Period does not exceed the greater of (1) 2.00:1.00 or (2) the First Lien Leverage Ratio immediately prior to such",
                length=520,
            ),
            governingCovenant="Definitions — Ratio Incremental Amount",
            basketFamily="RATIO_BASED",
            secondaryFamilies=["INCREMENTAL_DEBT", "GROWER"],
            amountOrFormulaCandidate={
                "formulaKind": "RATIO_INCURRENCE_ROOM",
                "expressionText": "residual principal such that pro forma First Lien / Senior Secured / Total Leverage or Interest Coverage tests are met (priority-tiered)",
                "structured": {"ratioTest": "First Lien Leverage Ratio ≤ max(2.00x, pre-incurrence ratio) for pari passu secured (partial span; other tiers continue in source)"},
            },
            measurementDate="applicable Test Period on a Pro Forma Basis / date of issuance, incurrence or assumption",
            financialInputs=["First Lien Leverage Ratio", "Senior Secured Leverage Ratio", "Total Leverage Ratio", "Interest Coverage Ratio", "pro forma adjustments per §1.08"],
            entityScope="Restricted Parties incurring Incremental / ratio-based debt",
            conditions=["pro forma compliance with the applicable priority-tiered ratio test"],
            sharedCapacityDependencies=["Incremental Cap", "Fixed Amounts disregarded when testing Incurrence-Based Amounts per §1.08(f)"],
            reclassificationRights="automatic reclassification from Fixed Amounts into Incurrence-Based Amounts unless elected otherwise (§1.08(f))",
            sourceVersion=src("chwy"),
            verificationStatus="SPAN_GROUNDED_NEEDS_INPUTS",
            capacitySemantics="AFFIRMATIVE_CAPACITY",
            capacityComputable=False,
            capacityComputationBlockers=[
                "ratio inputs and pro forma adjustments not supplied",
                "full priority-tier text beyond the captured opening limb needed for non-pari-passu paths",
            ],
            notes="Ratio room is affirmative incremental capacity, not a maintenance covenant.",
        )
    )

    candidates.append(
        cand(
            id="chwy-available-amount-builder",
            exactSourceSpan=S(
                "chwy",
                "is less than the sum of (without duplication) (the sum or the amounts attributable to clauses (a) through (f) below are referred to herein as the “ Available Amount ”):\n\n(a) the greater of (x) 50% of the Consolidated Net Income of the Restricted Parties",
                length=280,
            ),
            governingCovenant="§6.08(a)(3) Limitation on Restricted Payments — Available Amount builder",
            basketFamily="AVAILABLE_AMOUNT_BUILDER",
            secondaryFamilies=["CUMULATIVE_CREDIT", "RESTRICTED_PAYMENT", "ANTI_DOUBLE_COUNTING"],
            amountOrFormulaCandidate={
                "formulaKind": "BUILDER_SUM_COMPONENTS",
                "expressionText": "Available Amount = sum(without duplication) of builder clauses (a)–(f)+ later legs − usages; RP permitted if cumulative RPs < Available Amount",
                "structured": {"components": ["CNI/ECF/EBITDA builder starter (a)", "equity proceeds (b)", "contributions (c)", "returns (d)", "redesignation (e)", "greater-of starter (f)", "retained proceeds (g)", "sale-leaseback (h)", "minus lien/debt usages (i)"]},
            },
            measurementDate="time of Restricted Payment (or declaration); CNI/ECF measured through most recently ended fiscal quarter with internal financials available",
            financialInputs=["Consolidated Net Income", "Retained Excess Cash Flow", "Consolidated EBITDA", "Consolidated Interest Expense", "equity/contribution proceeds", "returns on Restricted Investments", "prior RP/builder usages", "Lien/Debt usages under identified clauses"],
            entityScope="Borrowers and Restricted Subsidiaries / Restricted Parties",
            conditions=["no continuing Specified Event of Default for volitional dividend/distribution under clause (a)"],
            sharedCapacityDependencies=["§6.01(b)(32) and Permitted Liens (46)(ii) reduce Available Amount", "Available RP Capacity Amount mechanics"],
            reclassificationRights="Borrowers may classify/reclassify RP reductions among §6.08 clauses",
            sourceVersion=src("chwy"),
            verificationStatus="SPAN_GROUNDED_NEEDS_INPUTS",
            capacitySemantics="AFFIRMATIVE_CAPACITY",
            capacityComputable=False,
            capacityComputationBlockers=["multi-component builder facts and cumulative usage ledger not supplied in-corpus"],
            notes="Canonical Available Amount builder. Partial opening span is grounded; component inventory continues in the same section.",
        )
    )

    candidates.append(
        cand(
            id="chwy-available-amount-starter-grower",
            exactSourceSpan=S(
                "chwy",
                "(f) the greater of (x)\n$540.0 million and (y) 75% of Consolidated EBITDA for the most recently ended Test Period, calculated on a Pro Forma Basis; plus",
            ),
            governingCovenant="§6.08(a)(3)(f) Available Amount starter/grower component",
            basketFamily="GROWER",
            secondaryFamilies=["AVAILABLE_AMOUNT_BUILDER", "GREATER_OF_FIXED_AND_PERCENTAGE"],
            amountOrFormulaCandidate={
                "formulaKind": "GREATER_OF_FIXED_OR_PCT_METRIC",
                "expressionText": "max($540.0 million, 75% Consolidated EBITDA for most recently ended Test Period, Pro Forma)",
                "structured": {"fixedDollar": "$540.0 million", "percentage": "75%", "metric": "Consolidated EBITDA"},
            },
            measurementDate="most recently ended Test Period, calculated on a Pro Forma Basis",
            financialInputs=["Consolidated EBITDA"],
            entityScope="Restricted Parties (Available Amount context)",
            conditions=["component of Available Amount; subject to overall builder and RP conditions"],
            sharedCapacityDependencies=["other Available Amount components", "RP usages"],
            reclassificationRights=None,
            sourceVersion=src("chwy"),
            verificationStatus="SPAN_GROUNDED_NEEDS_INPUTS",
            capacitySemantics="AFFIRMATIVE_CAPACITY",
            capacityComputable=False,
            capacityComputationBlockers=["Consolidated EBITDA not supplied; cannot treat this leg alone as the full Available Amount"],
            notes="Grower leg inside builder — not a standalone permission without the surrounding Available Amount sum and RP gateway.",
        )
    )

    candidates.append(
        cand(
            id="chwy-equity-contribution-builder-leg",
            exactSourceSpan=S(
                "chwy",
                "(c) 100% of the aggregate amount of cash and the Fair Market Value of marketable securities or other property contributed to\nthe capital of any Restricted Party (including the aggregate principal amount of any Indebtedness of any Restricted Party contributed to any Restricted Party for cancellation), or that becomes part of the capital of any Restricted Party through\nconsolidation, amalgamation or merger after the Effective Date (other than net cash proceeds to the extent such net cash proceeds (i) have been used to incur Indebtedness or issue Disqualified Stock or Preferred Stock pursuant to\nSection 6.01(b)(12)(a) hereof, (ii) are contributed by a Restricted Subsidiary, (iii) from ABL Cure Amount or (iv) constitute Excluded Contributions); plus",
            ),
            governingCovenant="§6.08(a)(3)(c) Available Amount — equity/contribution credit",
            basketFamily="EQUITY_CONTRIBUTION",
            secondaryFamilies=["AVAILABLE_AMOUNT_BUILDER", "CUMULATIVE_CREDIT"],
            amountOrFormulaCandidate={
                "formulaKind": "EQUITY_PROCEEDS_CREDIT",
                "expressionText": "100% cash/FMV contributions to Restricted Party capital after Effective Date, excluding listed categories",
            },
            measurementDate="cumulative after the Effective Date through determination",
            financialInputs=["cash contributions", "FMV of contributed property", "Excluded Contribution designations", "amounts already used under §6.01(b)(12)(a)", "ABL Cure Amount"],
            entityScope="any Restricted Party",
            conditions=["excludes Restricted Subsidiary contributions, ABL Cure Amount, Excluded Contributions, and proceeds already used to incur certain debt/preferred"],
            sharedCapacityDependencies=["§6.01(b)(12)(a) debt usage of equity proceeds"],
            reclassificationRights=None,
            sourceVersion=src("chwy"),
            verificationStatus="SPAN_GROUNDED_NEEDS_INPUTS",
            capacitySemantics="AFFIRMATIVE_CAPACITY",
            capacityComputable=False,
            capacityComputationBlockers=["contribution history and exclusion designations not supplied"],
            notes="Equity contribution basket leg inside Available Amount.",
        )
    )

    candidates.append(
        cand(
            id="chwy-general-lien-basket",
            exactSourceSpan=S(
                "chwy",
                "(21) other Liens securing obligations that any time outstanding do not exceed the greater of (x)\n$720.0 million and (y) 100% of Consolidated EBITDA for the most recently ended Test Period, calculated on a Pro Forma Basis, at the time of incurrence; provided that Liens permitted pursuant to this clause (21) may be secured by the\nCollateral on a pari passu basis or junior basis with the Liens on the Collateral securing the Secured Obligations subject to the applicable Customary Intercreditor Agreement;",
            ),
            governingCovenant="Permitted Liens clause (21) — General Lien Basket",
            basketFamily="GENERAL_LIEN",
            secondaryFamilies=["GREATER_OF_FIXED_AND_PERCENTAGE", "GROWER"],
            amountOrFormulaCandidate={
                "formulaKind": "GREATER_OF_FIXED_OR_PCT_METRIC",
                "expressionText": "max($720.0 million, 100% Consolidated EBITDA) outstanding at time of incurrence",
                "structured": {"fixedDollar": "$720.0 million", "percentage": "100%", "metric": "Consolidated EBITDA"},
            },
            measurementDate="most recently ended Test Period at the time of incurrence (Pro Forma)",
            financialInputs=["Consolidated EBITDA", "outstanding secured obligations under this clause"],
            entityScope="Restricted Parties (Permitted Liens)",
            conditions=["Customary Intercreditor Agreement when securing Collateral pari/junior"],
            sharedCapacityDependencies=["General Lien Basket Reallocated Amount may move unused capacity to Fixed Incremental Amount"],
            reclassificationRights="Permitted Liens classification/reclassification rights in the Permitted Liens definition",
            sourceVersion=src("chwy"),
            verificationStatus="SPAN_GROUNDED_NEEDS_INPUTS",
            capacitySemantics="AFFIRMATIVE_CAPACITY",
            capacityComputable=False,
            capacityComputationBlockers=["Consolidated EBITDA and outstanding clause (21) usage not supplied"],
            notes="Source expressly names this clause the General Lien Basket elsewhere in definitions.",
        )
    )

    candidates.append(
        cand(
            id="chwy-general-lien-reallocated-amount",
            exactSourceSpan=S(
                "chwy",
                "“ General Lien Basket Reallocated Amount ” shall mean any amount then available to be incurred under the General Lien Basket that, at the\noption of the Initial Borrower, has been reallocated from the General Lien Basket to the Fixed Incremental Amount ( provided that for the avoidance of doubt, such reallocated amount may be used to incur additional Indebtedness that is secured\nby the Collateral on a pari passu basis or junior basis with the Secured Obligations).",
            ),
            governingCovenant="Definitions — General Lien Basket Reallocated Amount",
            basketFamily="RECLASSIFICATION",
            secondaryFamilies=["CROSS_COVENANT_CAPACITY_RESTRICTION", "INCREMENTAL_DEBT", "GENERAL_LIEN"],
            amountOrFormulaCandidate={
                "formulaKind": "REALLOCATION_TRANSFER",
                "expressionText": "elected unused General Lien Basket capacity reallocated into Fixed Incremental Amount",
            },
            measurementDate="time of reallocation election / Fixed Incremental determination",
            financialInputs=["unused General Lien Basket capacity", "election record"],
            entityScope="Initial Borrower election; capacity usable for additional secured Indebtedness",
            conditions=["optional election by Initial Borrower"],
            sharedCapacityDependencies=["General Lien Basket", "Fixed Incremental Amount"],
            reclassificationRights="explicit optional reallocation from General Lien Basket to Fixed Incremental Amount",
            sourceVersion=src("chwy"),
            verificationStatus="SPAN_GROUNDED_NEEDS_INPUTS",
            capacitySemantics="AFFIRMATIVE_CAPACITY",
            capacityComputable=False,
            capacityComputationBlockers=["no election record or unused General Lien balance supplied"],
            notes="Cross-covenant reallocation: lien capacity becomes incremental debt capacity.",
        )
    )

    candidates.append(
        cand(
            id="chwy-debt-reclassification",
            exactSourceSpan=S(
                "chwy",
                "in the event that an item of Indebtedness, Disqualified Stock or Preferred Stock (or any portion thereof) meets the\ncriteria of more than one of the categories of permitted Indebtedness, Disqualified Stock or Preferred Stock described in Sections 6.01(b)(1) through (33) hereof or is entitled to be incurred pursuant to Section 6.01(a) hereof, the Initial\nBorrower, in its sole discretion, shall allocate, classify and reclassify all or a portion of such item of Indebtedness, Disqualified Stock or Preferred Stock (or any portion thereof) in any manner that complies with this Section 6.01 and shall\nonly be required to include the amount and type of such Indebtedness, Disqualified Stock or Preferred Stock (or any portion thereof) in one (1) of the above clauses or subsections;",
            ),
            governingCovenant="§6.01 — reclassification / divide-and-classify",
            basketFamily="RECLASSIFICATION",
            amountOrFormulaCandidate={
                "formulaKind": "REALLOCATION_TRANSFER",
                "expressionText": "sole-discretion allocation/classification/reclassification among §6.01 baskets; count in only one clause",
            },
            measurementDate="incurrence and any later reclassification date",
            financialInputs=["identity of overlapping basket eligibility", "elected classification"],
            entityScope="Initial Borrower",
            conditions=["must comply with §6.01; Effective Date facilities locked into specified clauses"],
            sharedCapacityDependencies=["all §6.01(b) categories and §6.01(a)"],
            reclassificationRights="sole discretion to allocate, classify, and reclassify among complying categories",
            sourceVersion=src("chwy"),
            verificationStatus="SPAN_GROUNDED",
            capacitySemantics="AFFIRMATIVE_CAPACITY",
            capacityComputable=False,
            capacityComputationBlockers=["reclassification is an election mechanic, not a numeric capacity without the elected baskets' own inputs"],
            notes="Structural capacity mechanic governing how baskets may be used/reused.",
        )
    )

    candidates.append(
        cand(
            id="chwy-automatic-fixed-to-incurrence-reclass",
            exactSourceSpan=S(
                "chwy",
                "any Indebtedness (and associated Liens, subject to the applicable priorities required pursuant to the applicable\nIncurrence-Based Amounts), Investments, liquidations, dissolutions, mergers, consolidations, Restricted Payments or any prepayments of Indebtedness (or, in each case, any portion thereof) incurred or otherwise effected in reliance on Fixed Amounts\nshall be automatically and immediately reclassified at any time, unless the Initial Borrower otherwise elects from time to time, as incurred under the applicable Incurrence-Based Amounts if the Borrowers subsequently meets the applicable ratio for\nsuch Incurrence-Based Amounts on a Pro Forma Basis.",
            ),
            governingCovenant="§1.08(f) Fixed Amounts / Incurrence-Based Amounts automatic reclassification",
            basketFamily="RECLASSIFICATION",
            secondaryFamilies=["RATIO_BASED", "BASKET_REPLENISHMENT"],
            amountOrFormulaCandidate={
                "formulaKind": "REALLOCATION_TRANSFER",
                "expressionText": "automatic reclass of Fixed Amount usage into Incurrence-Based Amounts when ratio later met, unless opted out",
            },
            measurementDate="any later time when pro forma ratio for Incurrence-Based Amounts is met",
            financialInputs=["applicable leverage/coverage ratios", "opt-out election"],
            entityScope="Borrowers / Restricted Parties",
            conditions=["unless Initial Borrower elects otherwise"],
            sharedCapacityDependencies=["Fixed Amounts", "Incurrence-Based Amounts"],
            reclassificationRights="automatic unless elected otherwise",
            sourceVersion=src("chwy"),
            verificationStatus="SPAN_GROUNDED_NEEDS_INPUTS",
            capacitySemantics="AFFIRMATIVE_CAPACITY",
            capacityComputable=False,
            capacityComputationBlockers=["ratio satisfaction and election state not supplied"],
            notes="Reclassification that replenishes Fixed Amount capacity when ratio room opens.",
        )
    )

    candidates.append(
        cand(
            id="chwy-basket-replenishment-return-of-capital",
            exactSourceSpan=S(
                "chwy",
                "In the case of any Investment that has been made in reliance on any Numerical\nPermission, capacity under such Numerical Permission shall be increased by the amount of return of capital (including a dividend on common Equity Interests) on such prior Investment.",
            ),
            governingCovenant="§1.08(i) Numerical Permission replenishment",
            basketFamily="BASKET_REPLENISHMENT",
            secondaryFamilies=["INVESTMENT"],
            amountOrFormulaCandidate={
                "formulaKind": "RETURN_OF_CAPITAL_REPLENISHMENT",
                "expressionText": "Numerical Permission capacity += return of capital (incl. common dividend) on prior Investment made under that permission",
            },
            measurementDate="upon receipt of return of capital on the prior Investment",
            financialInputs=["prior Investment amount under Numerical Permission", "return of capital received"],
            entityScope="Investment previously made under a Numerical Permission",
            conditions=["Investment was made in reliance on a Numerical Permission"],
            sharedCapacityDependencies=["the specific Numerical Permission basket used"],
            reclassificationRights=None,
            sourceVersion=src("chwy"),
            verificationStatus="SPAN_GROUNDED_NEEDS_INPUTS",
            capacitySemantics="AFFIRMATIVE_CAPACITY",
            capacityComputable=False,
            capacityComputationBlockers=["prior usage and returns not supplied"],
            notes="Explicit basket replenishment rule.",
        )
    )

    candidates.append(
        cand(
            id="chwy-annual-carry-forward",
            exactSourceSpan=S(
                "chwy",
                "Any metric set by reference to a financial year, calendar year, relevant period or similar period (“ Annual Period ”)\nshall to the extent unused, be automatically carried forward to any subsequent year.",
            ),
            governingCovenant="§1.08(j) Annual Period carry-forward",
            basketFamily="BASKET_REPLENISHMENT",
            amountOrFormulaCandidate={
                "formulaKind": "CARRY_FORWARD_UNUSED",
                "expressionText": "unused Annual Period metric automatically carried forward to subsequent year",
            },
            measurementDate="period boundary / subsequent year",
            financialInputs=["period cap", "period usage"],
            entityScope="as applicable to the Annual Period metric being measured",
            conditions=["metric is set by reference to an Annual Period"],
            sharedCapacityDependencies=[],
            reclassificationRights="Initial Borrower may also pull forward from next Annual Period subject to reduction of next period",
            sourceVersion=src("chwy"),
            verificationStatus="SPAN_GROUNDED_NEEDS_INPUTS",
            capacitySemantics="AFFIRMATIVE_CAPACITY",
            capacityComputable=False,
            capacityComputationBlockers=["specific Annual Period metric identity and usage not supplied"],
            notes="Replenishment via unused carry-forward.",
        )
    )

    candidates.append(
        cand(
            id="chwy-anti-double-count-available-amount-transactions",
            exactSourceSpan=S(
                "chwy",
                "Section 1.09 Available Amount Transactions . If more than one\n(1) action occurs on any given date the permissibility of the taking of which is determined hereunder by reference to the amount of the Available Amount immediately prior to the taking of such action, the permissibility of the taking of each\nsuch action shall be determined independently but in no event may any two (2) or more such actions be treated as occurring simultaneously, i.e., each transaction must be permitted under the Available Amount as so calculated.",
            ),
            governingCovenant="§1.09 Available Amount Transactions",
            basketFamily="ANTI_DOUBLE_COUNTING",
            secondaryFamilies=["AVAILABLE_AMOUNT_BUILDER", "SHARED"],
            amountOrFormulaCandidate={
                "formulaKind": "WITHOUT_DUPLICATION_NETTING",
                "expressionText": "same-day Available Amount actions tested independently/sequentially; not simultaneous against the same pre-action Available Amount",
            },
            measurementDate="date on which multiple Available Amount actions occur",
            financialInputs=["Available Amount immediately prior to each sequential action"],
            entityScope="actions whose permissibility references Available Amount",
            conditions=[],
            sharedCapacityDependencies=["Available Amount"],
            reclassificationRights=None,
            sourceVersion=src("chwy"),
            verificationStatus="SPAN_GROUNDED",
            capacitySemantics="AFFIRMATIVE_CAPACITY",
            capacityComputable=False,
            capacityComputationBlockers=["ordering/ledger of same-day actions required; no numeric capacity without Available Amount inputs"],
            notes="Anti-double-counting sequencing rule for shared builder capacity.",
        )
    )

    candidates.append(
        cand(
            id="chwy-cross-covenant-rp-capacity-reduction",
            exactSourceSpan=S(
                "chwy",
                "provided that the capacity available to make Restricted Payments pursuant to the provisions of Section 6.08 shall be reduced (with such reduction to be classified and/or reclassified among such clauses by the Borrowers as described in\nSection 6.08), without duplication by (i) the aggregate principal amount of Indebtedness that has been incurred pursuant to and to the extent outstanding under Section 6.01(b)(31) (together with any outstanding Indebtedness under\nSection 6.01(b)(13) incurred to Refinance any Indebtedness initially incurred pursuant to Section 6.01(b)(31)) and (ii) the amount of the Available RP Capacity Amount utilized by the Restricted Parties to incur Liens pursuant to",
                length=520,
            ),
            governingCovenant="Definitions — Available RP Capacity Amount / cross-covenant reduction",
            basketFamily="CROSS_COVENANT_CAPACITY_RESTRICTION",
            secondaryFamilies=["RESTRICTED_PAYMENT", "SHARED", "ANTI_DOUBLE_COUNTING"],
            amountOrFormulaCandidate={
                "formulaKind": "CROSS_BASKET_USAGE_REDUCTION",
                "expressionText": "§6.08 RP capacity reduced (without duplication) by outstanding §6.01(b)(31) debt (and refi) and by Available RP Capacity Amount used for Liens",
            },
            measurementDate="time of determination of RP capacity",
            financialInputs=["§6.01(b)(31) outstanding", "related §6.01(b)(13) refinancing outstanding", "Available RP Capacity Amount used for Liens"],
            entityScope="Restricted Parties",
            conditions=[],
            sharedCapacityDependencies=["§6.08", "§6.01(b)(31)", "§6.01(b)(13)", "Lien usages of Available RP Capacity Amount"],
            reclassificationRights="reduction classified/reclassified among §6.08 clauses by Borrowers",
            sourceVersion=src("chwy"),
            verificationStatus="SPAN_GROUNDED_NEEDS_INPUTS",
            capacitySemantics="AFFIRMATIVE_CAPACITY",
            capacityComputable=False,
            capacityComputationBlockers=["cross-usage ledger not supplied"],
            notes="Debt/lien usage explicitly reduces RP capacity.",
        )
    )

    candidates.append(
        cand(
            id="chwy-voluntary-prepayment-incremental",
            exactSourceSpan=S(
                "chwy",
                "“ Voluntary Prepayment Incremental Amount ” means the sum of the aggregate principal amount of voluntary prepayments, redemptions and\nrepurchases and debt buybacks, payments utilizing the provision of",
                length=220,
            ),
            governingCovenant="Definitions — Voluntary Prepayment Incremental Amount",
            basketFamily="INCREMENTAL_DEBT",
            secondaryFamilies=["CUMULATIVE_CREDIT", "BASKET_REPLENISHMENT"],
            amountOrFormulaCandidate={
                "formulaKind": "OTHER_SOURCE_STATED",
                "expressionText": "sum of voluntary prepayments/redemptions/repurchases/buybacks (definition continues in source)",
            },
            measurementDate="cumulative history through Incremental Cap determination date",
            financialInputs=["voluntary prepayment / repurchase history for qualifying debt"],
            entityScope="as defined for Incremental Cap usage",
            conditions=["qualifying voluntary prepayments per remainder of definition"],
            sharedCapacityDependencies=["Incremental Cap"],
            reclassificationRights=None,
            sourceVersion=src("chwy"),
            verificationStatus="SPAN_GROUNDED_NEEDS_INPUTS",
            capacitySemantics="AFFIRMATIVE_CAPACITY",
            capacityComputable=False,
            capacityComputationBlockers=["full definitional exclusions and prepayment ledger not fully captured in this span"],
            notes="Prepayment-based incremental capacity component.",
        )
    )

    candidates.append(
        cand(
            id="chwy-refinancing-premiums-addon",
            exactSourceSpan=S(
                "chwy",
                "Any Refinancing Indebtedness, Disqualified Stock or Preferred Stock and any Indebtedness incurred to Refinance Indebtedness, Disqualified Stock or Preferred Stock incurred pursuant to\nSections 6.01(b)(1), (4), (12), (31), (32) and (33) hereof shall be permitted to include additional Indebtedness, Disqualified Stock or Preferred Stock incurred to pay premiums (including tender premiums), defeasance costs, underwriting\ndiscounts, accrued and unpaid interest, dividends and fees, costs and expenses (including upfront fees, original issue discount or similar fees) in connection with such Refinancing.",
            ),
            governingCovenant="§6.01 refinancing mechanics",
            basketFamily="REFINANCING",
            amountOrFormulaCandidate={
                "formulaKind": "REFINANCE_PRINCIPAL_PLUS_COSTS",
                "expressionText": "Refinancing Indebtedness may include premiums, defeasance costs, discounts, accrued interest/dividends, and fees/OID in connection with the Refinancing",
            },
            measurementDate="refinancing consummation",
            financialInputs=["principal being refinanced", "premiums/fees/interest/dividends/costs"],
            entityScope="Restricted Parties refinancing listed §6.01 baskets",
            conditions=["Refinancing of Indebtedness/DQ/Preferred incurred under specified clauses"],
            sharedCapacityDependencies=["original basket clauses being refinanced"],
            reclassificationRights=None,
            sourceVersion=src("chwy"),
            verificationStatus="SPAN_GROUNDED",
            capacitySemantics="AFFIRMATIVE_CAPACITY",
            capacityComputable=False,
            capacityComputationBlockers=["original principal and cost schedule not supplied"],
            notes="Affirmative refinancing capacity add-on, not a free general debt basket.",
        )
    )

    # ----- DSGR -----
    candidates.append(
        cand(
            id="dsgr-available-amount-builder",
            exactSourceSpan=S(
                "dsgr",
                "“ Available Amount ”\nmeans, at any time (the “ Reference Date ”), the sum (without duplication) of:\n\n(i)\nthe greater of (x) $47,500,000 and (y) 25% of Applicable EBITDA (calculated on a pro forma basis) as of the\nlast day of the most recently ended four fiscal-quarter period on or prior to the date of determination; plus",
            ),
            governingCovenant="Definitions — Available Amount",
            basketFamily="AVAILABLE_AMOUNT_BUILDER",
            secondaryFamilies=["GROWER", "GREATER_OF_FIXED_AND_PERCENTAGE", "ANTI_DOUBLE_COUNTING"],
            amountOrFormulaCandidate={
                "formulaKind": "BUILDER_STARTER_PLUS_CUMULATIVE",
                "expressionText": "max($47,500,000, 25% Applicable EBITDA) + equity proceeds + debt-for-equity conversions + Returns + disposition proceeds + redesignation FMV + Borrower Retained Prepayment Amounts − AA usages",
                "structured": {
                    "fixedDollar": "$47,500,000",
                    "percentage": "25%",
                    "metric": "Applicable EBITDA",
                    "components": ["starter grower", "Qualified Stock proceeds", "debt converted to Qualified Stock", "Returns", "Disposition proceeds", "redesignation FMV", "Borrower Retained Prepayment Amounts", "minus §6.04(q)/§6.08(a)(iv) usages"],
                },
            },
            measurementDate="Reference Date; EBITDA as of last day of most recently ended four fiscal-quarter period on or prior to determination",
            financialInputs=["Applicable EBITDA", "Qualified Stock net cash proceeds", "converted debt principal", "Returns", "Disposition proceeds", "redesignation FMV", "Borrower Retained Prepayment Amounts", "§6.04(q)/§6.08(a)(iv) usages"],
            entityScope="Company and Restricted Subsidiaries (builder credits/usages as specified)",
            conditions=["Not Otherwise Applied where stated; investment-return credits capped at original investment"],
            sharedCapacityDependencies=["§6.04(q) investments", "§6.08(a)(iv) Restricted Payments"],
            reclassificationRights=None,
            sourceVersion=src("dsgr"),
            verificationStatus="SPAN_GROUNDED_NEEDS_INPUTS",
            capacitySemantics="AFFIRMATIVE_CAPACITY",
            capacityComputable=False,
            capacityComputationBlockers=["builder component facts and AA usage ledger not supplied"],
            notes="Full builder continues through clause (viii) in the same definition.",
        )
    )

    candidates.append(
        cand(
            id="dsgr-equity-qualified-stock-leg",
            exactSourceSpan=S(
                "dsgr",
                "without duplication, the net cash proceeds of any issuance of Qualified Stock received by the Company during\nthe period from and including the Business Day immediately following the Effective Date through and including the Reference Date, in each case, to the extent not included in the definition of “Specified Equity Contribution” and Not\nOtherwise Applied; plus",
            ),
            governingCovenant="Available Amount clause (ii)",
            basketFamily="EQUITY_CONTRIBUTION",
            secondaryFamilies=["AVAILABLE_AMOUNT_BUILDER", "CUMULATIVE_CREDIT"],
            amountOrFormulaCandidate={
                "formulaKind": "EQUITY_PROCEEDS_CREDIT",
                "expressionText": "net cash proceeds of Qualified Stock issuances (ex Specified Equity Contribution), Not Otherwise Applied",
            },
            measurementDate="Business Day after Effective Date through Reference Date",
            financialInputs=["Qualified Stock issuance proceeds", "Specified Equity Contribution exclusions", "Not Otherwise Applied status"],
            entityScope="Company",
            conditions=["not Specified Equity Contribution", "Not Otherwise Applied"],
            sharedCapacityDependencies=["Available Amount"],
            reclassificationRights=None,
            sourceVersion=src("dsgr"),
            verificationStatus="SPAN_GROUNDED_NEEDS_INPUTS",
            capacitySemantics="AFFIRMATIVE_CAPACITY",
            capacityComputable=False,
            capacityComputationBlockers=["equity issuance ledger not supplied"],
            notes="Equity contribution component of Available Amount.",
        )
    )

    candidates.append(
        cand(
            id="dsgr-returns-replenishment",
            exactSourceSpan=S(
                "dsgr",
                "the aggregate amount of all Returns (including all cash repayment of principal) received in cash or Permitted Investments by the Company or any Restricted Subsidiary from any investment or Unrestricted\nSubsidiary during the period from and including the Business Day immediately following the Effective Date through and including the Reference Date, in each case, to the extent any such investment was made using the Available Amount pursuant to\nSection 6.04(q) (up to the amount of the original\ninvestment); plus",
            ),
            governingCovenant="Available Amount clause (iv)",
            basketFamily="BASKET_REPLENISHMENT",
            secondaryFamilies=["AVAILABLE_AMOUNT_BUILDER", "INVESTMENT"],
            amountOrFormulaCandidate={
                "formulaKind": "RETURN_OF_CAPITAL_REPLENISHMENT",
                "expressionText": "Returns on AA-funded investments, capped at original investment, added back to Available Amount",
            },
            measurementDate="Business Day after Effective Date through Reference Date",
            financialInputs=["Returns received", "original AA-funded investment amounts", "whether already reflected as return of capital"],
            entityScope="Company or any Restricted Subsidiary receiving Returns",
            conditions=["investment was made using Available Amount under §6.04(q)", "up to original investment", "not already reflected as return of capital for that investment"],
            sharedCapacityDependencies=["§6.04(q)", "Available Amount"],
            reclassificationRights=None,
            sourceVersion=src("dsgr"),
            verificationStatus="SPAN_GROUNDED_NEEDS_INPUTS",
            capacitySemantics="AFFIRMATIVE_CAPACITY",
            capacityComputable=False,
            capacityComputationBlockers=["return and original investment ledgers not supplied"],
            notes="Classic replenishment into Available Amount.",
        )
    )

    candidates.append(
        cand(
            id="dsgr-purchase-money-basket",
            exactSourceSpan=S(
                "dsgr",
                "Indebtedness of the Company or any Restricted Subsidiary incurred to finance the\nacquisition, construction or improvement of any fixed or capital assets (whether or not constituting purchase money Indebtedness), including Capital Lease Obligations and any Indebtedness assumed in connection with the acquisition of any such assets\nor secured by a Lien on any such assets prior to the acquisition thereof, and extensions, renewals and replacements of any such Indebtedness in accordance with clause (g) above; provided that (i) such Indebtedness is incurred prior\nto or within 180 days after such acquisition or the completion of such construction or improvement and (ii) the aggregate principal amount of Indebtedness permitted by this clause (p), together with any Refinance Indebtedness in respect thereof\npermitted by clause (g) above, shall not exceed at any time outstanding an amount equal to 15% of Applicable EBITDA;",
            ),
            governingCovenant="§6.01(p) purchase-money / capex Indebtedness",
            basketFamily="PURCHASE_MONEY",
            secondaryFamilies=["SHARED", "GROWER", "REFINANCING"],
            amountOrFormulaCandidate={
                "formulaKind": "PURCHASE_MONEY_COST_LINKED",
                "expressionText": "purchase-money/capex/Capital Lease debt incurred within 180 days; aggregate with related Refinance Indebtedness ≤ 15% Applicable EBITDA outstanding",
                "structured": {"percentage": "15%", "metric": "Applicable EBITDA"},
            },
            measurementDate="incurrence timing vs acquisition/completion; aggregate outstanding tested continuously",
            financialInputs=["Applicable EBITDA", "outstanding clause (p) + related clause (g) Refinance Indebtedness", "acquisition/completion dates"],
            entityScope="Company or any Restricted Subsidiary",
            conditions=["incurred prior to or within 180 days after acquisition or completion of construction/improvement"],
            sharedCapacityDependencies=["clause (g) Refinance Indebtedness in respect of clause (p)"],
            reclassificationRights=None,
            sourceVersion=src("dsgr"),
            verificationStatus="SPAN_GROUNDED_NEEDS_INPUTS",
            capacitySemantics="AFFIRMATIVE_CAPACITY",
            capacityComputable=False,
            capacityComputationBlockers=["Applicable EBITDA, outstanding usage, and timing facts not supplied"],
            notes="Shared ceiling with refinancing overlay; percentage-only grower (no fixed dollar leg).",
        )
    )

    candidates.append(
        cand(
            id="dsgr-general-debt-basket",
            exactSourceSpan=S(
                "dsgr",
                "other Indebtedness in an aggregate outstanding principal amount not exceeding at any time the greater of\n$47,500,000 and 25% of Applicable EBITDA.",
            ),
            governingCovenant="§6.01(r) general debt basket",
            basketFamily="GENERAL_DEBT",
            secondaryFamilies=["GREATER_OF_FIXED_AND_PERCENTAGE", "GROWER"],
            amountOrFormulaCandidate={
                "formulaKind": "GREATER_OF_FIXED_OR_PCT_METRIC",
                "expressionText": "max($47,500,000, 25% Applicable EBITDA) aggregate outstanding",
                "structured": {"fixedDollar": "$47,500,000", "percentage": "25%", "metric": "Applicable EBITDA"},
            },
            measurementDate="any time outstanding / determination at use",
            financialInputs=["Applicable EBITDA", "outstanding principal under §6.01(r)"],
            entityScope="Loan Parties / Restricted Subsidiaries per §6.01 chapeau",
            conditions=[],
            sharedCapacityDependencies=[],
            reclassificationRights=None,
            sourceVersion=src("dsgr"),
            verificationStatus="SPAN_GROUNDED_NEEDS_INPUTS",
            capacitySemantics="AFFIRMATIVE_CAPACITY",
            capacityComputable=False,
            capacityComputationBlockers=["Applicable EBITDA and outstanding usage not supplied"],
            notes="Clean general debt greater-of grower.",
        )
    )

    candidates.append(
        cand(
            id="dsgr-ratio-debt-basket",
            exactSourceSpan=S(
                "dsgr",
                "if such Indebtedness is secured by a Lien on the Collateral on a pari passu basis with the Secured Obligations,\nthe aggregate principal amount of such Indebtedness shall not exceed an amount so long as on and as of the date of such incurrence the First Lien Net Leverage Ratio (on a pro forma basis) does not exceed 3.75 to 1.00 as of the last day of the most\nrecently ended period of four consecutive fiscal quarters for which financial statements have been delivered pursuant to Section 5.01(a) or (b)",
                length=420,
            ),
            governingCovenant="§6.01(q)(i)(A) ratio debt (pari passu)",
            basketFamily="RATIO_BASED",
            secondaryFamilies=["GENERAL_DEBT"],
            amountOrFormulaCandidate={
                "formulaKind": "RATIO_INCURRENCE_ROOM",
                "expressionText": "pari passu secured debt limited to residual room while First Lien Net Leverage Ratio ≤ 3.75x pro forma",
                "structured": {"ratioTest": "First Lien Net Leverage Ratio ≤ 3.75 to 1.00 (pro forma)"},
            },
            measurementDate="date of incurrence; ratio as of last day of most recently ended four-quarter period with delivered financials",
            financialInputs=["First Lien Net Leverage Ratio inputs", "pro forma adjustments", "financial statements delivery status"],
            entityScope="Loan Party; secured on Collateral pari passu with Secured Obligations",
            conditions=["no Event of Default / representation conditions in later clauses of §6.01(q)", "intercreditor / maturity conditions"],
            sharedCapacityDependencies=["junior and unsecured limbs of §6.01(q) are alternative ratio paths, not the same dollar pool"],
            reclassificationRights=None,
            sourceVersion=src("dsgr"),
            verificationStatus="SPAN_GROUNDED_NEEDS_INPUTS",
            capacitySemantics="AFFIRMATIVE_CAPACITY",
            capacityComputable=False,
            capacityComputationBlockers=["leverage inputs and pro forma adjustments not supplied; sibling limbs needed for non-pari-passu debt"],
            notes="Incurrence ratio capacity — not the §6.12 maintenance covenant.",
        )
    )

    candidates.append(
        cand(
            id="dsgr-rp-available-amount",
            exactSourceSpan=S(
                "dsgr",
                "other Restricted Payments in an amount not to exceed the Available Amount immediately prior to the time of the making of such Restricted Payment, so long as at the time of making such Restricted Payment and",
                length=240,
            ),
            governingCovenant="§6.08 Restricted Payments — Available Amount usage",
            basketFamily="RESTRICTED_PAYMENT",
            secondaryFamilies=["AVAILABLE_AMOUNT_BUILDER"],
            amountOrFormulaCandidate={
                "formulaKind": "BUILDER_SUM_COMPONENTS",
                "expressionText": "Restricted Payments ≤ Available Amount immediately prior to making the RP (subject to continuing conditions in source)",
            },
            measurementDate="immediately prior to the time of making the Restricted Payment",
            financialInputs=["Available Amount", "conditions stated in the remainder of the clause"],
            entityScope="Company / Restricted Subsidiaries per §6.08",
            conditions=["clause continues with additional conditions after the captured span"],
            sharedCapacityDependencies=["Available Amount shared with §6.04(q) investments"],
            reclassificationRights=None,
            sourceVersion=src("dsgr"),
            verificationStatus="SPAN_GROUNDED_NEEDS_INPUTS",
            capacitySemantics="AFFIRMATIVE_CAPACITY",
            capacityComputable=False,
            capacityComputationBlockers=["Available Amount not computable without builder inputs; trailing conditions not fully in span"],
            notes="RP permission that consumes the shared Available Amount builder.",
        )
    )

    candidates.append(
        cand(
            id="dsgr-investment-available-amount",
            exactSourceSpan=S(
                "dsgr",
                "other investments in an amount not to exceed the Available Amount immediately prior to the time of the making of such investment, so long",
                length=160,
            ),
            governingCovenant="§6.04(q) investments using Available Amount",
            basketFamily="INVESTMENT",
            secondaryFamilies=["AVAILABLE_AMOUNT_BUILDER", "SHARED"],
            amountOrFormulaCandidate={
                "formulaKind": "BUILDER_SUM_COMPONENTS",
                "expressionText": "investments ≤ Available Amount immediately prior to making the investment",
            },
            measurementDate="immediately prior to the time of the making of such investment",
            financialInputs=["Available Amount"],
            entityScope="Loan Parties / Restricted Subsidiaries per §6.04",
            conditions=["trailing 'so long' conditions continue in source"],
            sharedCapacityDependencies=["Available Amount shared with §6.08(a)(iv) RPs"],
            reclassificationRights=None,
            sourceVersion=src("dsgr"),
            verificationStatus="SPAN_GROUNDED_NEEDS_INPUTS",
            capacitySemantics="AFFIRMATIVE_CAPACITY",
            capacityComputable=False,
            capacityComputationBlockers=["Available Amount inputs missing; trailing conditions incomplete in span"],
            notes="Shared builder capacity across investments and RPs.",
        )
    )

    candidates.append(
        cand(
            id="dsgr-investment-unrestricted-sub-grower",
            exactSourceSpan=S(
                "dsgr",
                "investments in Unrestricted Subsidiaries in aggregate amount not to exceed an amount equal to the greater of $28,500,000 and 15% of Applicable EBITDA during the term of this Agreement; and",
            ),
            governingCovenant="§6.04 investments in Unrestricted Subsidiaries",
            basketFamily="INVESTMENT",
            secondaryFamilies=["GREATER_OF_FIXED_AND_PERCENTAGE", "GROWER"],
            amountOrFormulaCandidate={
                "formulaKind": "GREATER_OF_FIXED_OR_PCT_METRIC",
                "expressionText": "max($28,500,000, 15% Applicable EBITDA) aggregate during term",
                "structured": {"fixedDollar": "$28,500,000", "percentage": "15%", "metric": "Applicable EBITDA"},
            },
            measurementDate="during the term of this Agreement (aggregate)",
            financialInputs=["Applicable EBITDA", "aggregate investments in Unrestricted Subsidiaries under this clause"],
            entityScope="investments in Unrestricted Subsidiaries",
            conditions=[],
            sharedCapacityDependencies=[],
            reclassificationRights=None,
            sourceVersion=src("dsgr"),
            verificationStatus="SPAN_GROUNDED_NEEDS_INPUTS",
            capacitySemantics="AFFIRMATIVE_CAPACITY",
            capacityComputable=False,
            capacityComputationBlockers=["Applicable EBITDA and cumulative usage not supplied"],
            notes="Fixed + percentage investment grower.",
        )
    )

    candidates.append(
        cand(
            id="dsgr-asset-sale-reinvestment",
            exactSourceSpan=S(
                "dsgr",
                "reinvest all or any portion of such Net Proceeds in assets useful for its or any Restricted Subsidiary’s business (x) within twelve (12) months following receipt of such Net Proceeds or",
                length=220,
            ),
            governingCovenant="mandatory prepayment / asset-sale Net Proceeds reinvestment right",
            basketFamily="ASSET_SALE_REINVESTMENT",
            amountOrFormulaCandidate={
                "formulaKind": "OTHER_SOURCE_STATED",
                "expressionText": "option to reinvest Net Proceeds in useful assets within 12 months (clause continues with committed/reinvestment mechanics in source)",
            },
            measurementDate="within twelve (12) months following receipt of Net Proceeds",
            financialInputs=["Net Proceeds amount", "reinvestment expenditures / commitments"],
            entityScope="Company / Restricted Subsidiaries receiving Net Proceeds",
            conditions=["assets useful for its or any Restricted Subsidiary’s business", "timing window"],
            sharedCapacityDependencies=[],
            reclassificationRights=None,
            sourceVersion=src("dsgr"),
            verificationStatus="SPAN_GROUNDED_NEEDS_INPUTS",
            capacitySemantics="AFFIRMATIVE_CAPACITY",
            capacityComputable=False,
            capacityComputationBlockers=[
                "Net Proceeds amount not supplied",
                "surrounding mandatory-prepayment exceptions and commitment extension limb needed for a complete capacity statement",
            ],
            notes="Reinvestment right affects prepayment capacity; not a free cash RP basket.",
        )
    )

    candidates.append(
        cand(
            id="dsgr-refinancing-basket",
            exactSourceSpan=S(
                "dsgr",
                "such Refinance Indebtedness does not increase the principal amount thereof (other than by the amount of any unused commitments thereunder, accrued interest,",
                length=240,
            ),
            governingCovenant="§6.01(g) Refinance Indebtedness",
            basketFamily="REFINANCING",
            amountOrFormulaCandidate={
                "formulaKind": "REFINANCE_PRINCIPAL_PLUS_COSTS",
                "expressionText": "Refinance Indebtedness principal ≤ original principal + unused commitments + accrued interest (+ further cost add-ons in source)",
            },
            measurementDate="refinancing consummation",
            financialInputs=["Original Indebtedness principal", "unused commitments", "accrued interest", "other permitted add-ons in remainder of clause"],
            entityScope="Loan Party / Restricted Subsidiary refinancing Original Indebtedness under clause (f) or (q) per surrounding text",
            conditions=["lien/extension/maturity/subordination constraints continue in source"],
            sharedCapacityDependencies=["Original Indebtedness baskets"],
            reclassificationRights=None,
            sourceVersion=src("dsgr"),
            verificationStatus="SPAN_GROUNDED_NEEDS_INPUTS",
            capacitySemantics="AFFIRMATIVE_CAPACITY",
            capacityComputable=False,
            capacityComputationBlockers=["full refinancing proviso chain and original balances not fully in span / not supplied"],
            notes="Refinancing basket with limited principal increase exceptions.",
        )
    )

    candidates.append(
        cand(
            id="dsgr-shared-purchase-money-with-refi",
            exactSourceSpan=S(
                "dsgr",
                "the aggregate principal amount of Indebtedness permitted by this clause (p), together with any Refinance Indebtedness in respect thereof\npermitted by clause (g) above, shall not exceed at any time outstanding an amount equal to 15% of Applicable EBITDA",
            ),
            governingCovenant="§6.01(p)/(g) shared purchase-money ceiling",
            basketFamily="SHARED",
            secondaryFamilies=["PURCHASE_MONEY", "REFINANCING"],
            amountOrFormulaCandidate={
                "formulaKind": "SHARED_AGGREGATE_CEILING",
                "expressionText": "clause (p) + related clause (g) Refinance Indebtedness ≤ 15% Applicable EBITDA outstanding",
                "structured": {"percentage": "15%", "metric": "Applicable EBITDA", "components": ["§6.01(p)", "§6.01(g) Refinance of (p)"]},
            },
            measurementDate="any time outstanding",
            financialInputs=["Applicable EBITDA", "outstanding under (p)", "outstanding Refinance Indebtedness in respect of (p)"],
            entityScope="Company / Restricted Subsidiaries",
            conditions=[],
            sharedCapacityDependencies=["§6.01(p)", "§6.01(g)"],
            reclassificationRights=None,
            sourceVersion=src("dsgr"),
            verificationStatus="SPAN_GROUNDED_NEEDS_INPUTS",
            capacitySemantics="AFFIRMATIVE_CAPACITY",
            capacityComputable=False,
            capacityComputationBlockers=["metric and member usages not supplied"],
            notes="Explicit 'together with' shared ceiling.",
        )
    )

    # ----- Gibraltar -----
    candidates.append(
        cand(
            id="gib-non-guarantor-debt-grower",
            exactSourceSpan=S(
                "gib",
                "Indebtedness of non-Guarantors in an aggregate principal amount not to exceed the greater of (i) $172,000,000 and (ii) 50.0% of LTM EBITDA at the time of incurrence, and any\nRefinancing Indebtedness in respect thereof;",
            ),
            governingCovenant="§7.01 Indebtedness — non-Guarantor basket",
            basketFamily="GREATER_OF_FIXED_AND_PERCENTAGE",
            secondaryFamilies=["GROWER", "GENERAL_DEBT", "REFINANCING"],
            amountOrFormulaCandidate={
                "formulaKind": "GREATER_OF_FIXED_OR_PCT_METRIC",
                "expressionText": "max($172,000,000, 50% LTM EBITDA) at incurrence, plus Refinancing Indebtedness in respect thereof",
                "structured": {"fixedDollar": "$172,000,000", "percentage": "50.0%", "metric": "LTM EBITDA"},
            },
            measurementDate="at the time of incurrence",
            financialInputs=["LTM EBITDA", "non-Guarantor debt outstanding under this clause"],
            entityScope="non-Guarantors",
            conditions=[],
            sharedCapacityDependencies=["Refinancing Indebtedness in respect of this clause"],
            reclassificationRights=None,
            sourceVersion=src("gib"),
            verificationStatus="SPAN_GROUNDED_NEEDS_INPUTS",
            capacitySemantics="AFFIRMATIVE_CAPACITY",
            capacityComputable=False,
            capacityComputationBlockers=["LTM EBITDA and usage not supplied"],
            notes="Entity-scoped grower basket.",
        )
    )

    candidates.append(
        cand(
            id="gib-general-debt-with-rp-reallocation",
            exactSourceSpan=S(
                "gib",
                "Indebtedness in an aggregate outstanding principal amount which, when taken together with the principal amount of all other Indebtedness incurred\npursuant to this clause (14) and then outstanding, will not exceed the sum of (x) the greater of (i) $344,000,000 and (ii) 100.0% of LTM EBITDA plus (y) the Restricted Payment Reallocated Amount, and any Refinancing Indebtedness in\nrespect thereof;   provided that available amounts under this clause (14) shall be reduced by the then-outstanding amount of any Indebtedness incurred pursuant to the\nGeneral Debt Basket Reallocated Amount and reallocated to the Incremental Amount;",
            ),
            governingCovenant="§7.01(14) general debt basket with RP reallocation",
            basketFamily="GENERAL_DEBT",
            secondaryFamilies=["GROWER", "SHARED", "CROSS_COVENANT_CAPACITY_RESTRICTION", "RECLASSIFICATION"],
            amountOrFormulaCandidate={
                "formulaKind": "GREATER_OF_FIXED_OR_PCT_METRIC",
                "expressionText": "max($344,000,000, 100% LTM EBITDA) + Restricted Payment Reallocated Amount − amounts moved out via General Debt Basket Reallocated Amount to Incremental Amount",
                "structured": {
                    "fixedDollar": "$344,000,000",
                    "percentage": "100.0%",
                    "metric": "LTM EBITDA",
                    "components": ["greater-of core", "Restricted Payment Reallocated Amount", "minus General Debt Basket Reallocated Amount outstanding"],
                },
            },
            measurementDate="time of incurrence / then outstanding",
            financialInputs=["LTM EBITDA", "clause (14) outstanding", "Restricted Payment Reallocated Amount", "General Debt Basket Reallocated Amount outstanding"],
            entityScope="Borrower / Restricted Subsidiaries per §7.01",
            conditions=["available amounts reduced by General Debt Basket Reallocated Amount outstanding moved to Incremental Amount"],
            sharedCapacityDependencies=["Restricted Payment Reallocated Amount", "Incremental Amount", "Refinancing Indebtedness in respect thereof"],
            reclassificationRights="RP capacity may be reallocated in; general debt capacity may be reallocated out to Incremental Amount",
            sourceVersion=src("gib"),
            verificationStatus="SPAN_GROUNDED_NEEDS_INPUTS",
            capacitySemantics="AFFIRMATIVE_CAPACITY",
            capacityComputable=False,
            capacityComputationBlockers=["LTM EBITDA and reallocation ledgers not supplied"],
            notes="General debt grower with explicit cross-covenant reallocation in both directions.",
        )
    )

    candidates.append(
        cand(
            id="gib-investment-grower-with-returns",
            exactSourceSpan=S(
                "gib",
                "additional Investments having an aggregate fair market value, taken together with all other Investments made pursuant to this clause (21) that are at that time outstanding, not to exceed the sum of (x) the greater of (i) $223,600,000 and (ii) 65.0% of LTM EBITDA (with the fair",
                length=320,
            ),
            governingCovenant="Permitted Investments clause (21)",
            basketFamily="INVESTMENT",
            secondaryFamilies=["GREATER_OF_FIXED_AND_PERCENTAGE", "GROWER", "BASKET_REPLENISHMENT", "SHARED"],
            amountOrFormulaCandidate={
                "formulaKind": "GREATER_OF_FIXED_OR_PCT_METRIC",
                "expressionText": "max($223,600,000, 65% LTM EBITDA) + returns on such Investments (without duplication vs Available Amount Builder) — formula continues in source",
                "structured": {"fixedDollar": "$223,600,000", "percentage": "65.0%", "metric": "LTM EBITDA"},
            },
            measurementDate="FMV measured at time Investment made; outstanding test at determination",
            financialInputs=["LTM EBITDA", "outstanding Investments under clause (21)", "returns on those Investments"],
            entityScope="Borrower / Restricted Subsidiaries per Permitted Investments",
            conditions=["FMV measured at time made without subsequent changes in value"],
            sharedCapacityDependencies=["Available Amount Builder Basket (anti-duplication of returns)", "possible reallocations from RP clauses noted later in source"],
            reclassificationRights="source later permits redesignation among investment clauses in related limbs",
            sourceVersion=src("gib"),
            verificationStatus="SPAN_GROUNDED_NEEDS_INPUTS",
            capacitySemantics="AFFIRMATIVE_CAPACITY",
            capacityComputable=False,
            capacityComputationBlockers=["LTM EBITDA, outstanding investments, and returns not supplied; span truncated before full returns limb"],
            notes="Investment grower with replenishment via returns (continues after span).",
        )
    )

    candidates.append(
        cand(
            id="gib-asset-disposition-reclassification",
            exactSourceSpan=S(
                "gib",
                "the Borrower, in its sole discretion, will be entitled to divide, classify and reclassify such transaction (or a portion thereof) as an\nAsset Disposition and/or one or more of the types of Permitted Investments or Investments permitted under Section 7.05 .",
            ),
            governingCovenant="Asset Disposition / Investment classification election",
            basketFamily="RECLASSIFICATION",
            secondaryFamilies=["INVESTMENT", "ASSET_SALE_REINVESTMENT"],
            amountOrFormulaCandidate={
                "formulaKind": "REALLOCATION_TRANSFER",
                "expressionText": "sole-discretion divide/classify/reclassify among Asset Disposition and Investment / §7.05 categories",
            },
            measurementDate="transaction date / reclassification date",
            financialInputs=["elected classification"],
            entityScope="Borrower",
            conditions=["transaction meets criteria of more than one category per surrounding text"],
            sharedCapacityDependencies=["Asset Disposition exceptions", "Permitted Investments", "§7.05"],
            reclassificationRights="sole discretion to divide, classify, and reclassify",
            sourceVersion=src("gib"),
            verificationStatus="SPAN_GROUNDED",
            capacitySemantics="AFFIRMATIVE_CAPACITY",
            capacityComputable=False,
            capacityComputationBlockers=["election mechanic only; numeric capacity depends on elected baskets"],
            notes="Cross-category reclassification among asset sales and investments.",
        )
    )

    candidates.append(
        cand(
            id="gib-available-amount-builder-pointer",
            exactSourceSpan=S(
                "gib",
                "“ Available Amount Builder Basket ” has the meaning specified in Section 7.05(a)(y) .",
            ),
            governingCovenant="Definitions — Available Amount Builder Basket → §7.05(a)(y)",
            basketFamily="AVAILABLE_AMOUNT_BUILDER",
            secondaryFamilies=["RESTRICTED_PAYMENT"],
            amountOrFormulaCandidate={
                "formulaKind": "BUILDER_SUM_COMPONENTS",
                "expressionText": "Available Amount Builder Basket defined by cross-reference to §7.05(a)(y)",
            },
            measurementDate="as specified in §7.05(a)(y)",
            financialInputs=["components set out in §7.05(a)(y)"],
            entityScope="as specified in §7.05",
            conditions=["operative formula is in the cross-referenced section"],
            sharedCapacityDependencies=["§7.05 Restricted Payments / Permitted Payments"],
            reclassificationRights=None,
            sourceVersion=src("gib"),
            verificationStatus="SPAN_GROUNDED_NEEDS_INPUTS",
            capacitySemantics="INCOMPLETE_SEMANTICS",
            capacityComputable=False,
            capacityComputationBlockers=[
                "this span is only a cross-reference pointer; §7.05(a)(y) builder components are required before any capacity figure can be stated",
            ],
            notes="Records the builder concept without inventing §7.05(a)(y) text not captured here.",
        )
    )

    candidates.append(
        cand(
            id="gib-anti-duplication-investment-returns",
            exactSourceSpan=S(
                "gib",
                "(without duplication for purposes of Section 7.05 of any amounts applied pursuant to clause (y) of Section 7.05(a) ) with the fair market value of each Investment being measured at the time made and without giving effect to subsequent changes in value;",
                length=260,
            ),
            governingCovenant="Permitted Investments — returns without duplication vs §7.05(a)(y)",
            basketFamily="ANTI_DOUBLE_COUNTING",
            secondaryFamilies=["INVESTMENT", "AVAILABLE_AMOUNT_BUILDER"],
            amountOrFormulaCandidate={
                "formulaKind": "WITHOUT_DUPLICATION_NETTING",
                "expressionText": "investment returns counted without duplication of amounts applied under Available Amount Builder §7.05(a)(y)",
            },
            measurementDate="time Investment made (FMV); returns as received",
            financialInputs=["returns amounts", "amounts already applied under §7.05(a)(y)"],
            entityScope="Investments under the applicable Permitted Investment clause",
            conditions=[],
            sharedCapacityDependencies=["§7.05(a)(y) Available Amount Builder Basket"],
            reclassificationRights=None,
            sourceVersion=src("gib"),
            verificationStatus="SPAN_GROUNDED",
            capacitySemantics="AFFIRMATIVE_CAPACITY",
            capacityComputable=False,
            capacityComputationBlockers=["anti-duplication constraint only; still needs underlying basket inputs"],
            notes="Explicit without-duplication bridge between investment returns and RP builder.",
        )
    )

    # ----- CONMED -----
    candidates.append(
        cand(
            id="conmed-finance-lease-grower",
            exactSourceSpan=S(
                "conmed",
                "Finance Lease Obligations in an aggregate principal amount not to exceed the greater of (x) $50,000,000 and (y) 3.0% of Consolidated\nTotal Assets (measured on the date of incurrence of such Finance Lease Obligations) at any one time outstanding;",
            ),
            governingCovenant="§7.2(d) Finance Lease Obligations",
            basketFamily="GREATER_OF_FIXED_AND_PERCENTAGE",
            secondaryFamilies=["GROWER", "PURCHASE_MONEY"],
            amountOrFormulaCandidate={
                "formulaKind": "GREATER_OF_FIXED_OR_PCT_METRIC",
                "expressionText": "max($50,000,000, 3.0% Consolidated Total Assets) at any one time outstanding",
                "structured": {"fixedDollar": "$50,000,000", "percentage": "3.0%", "metric": "Consolidated Total Assets"},
            },
            measurementDate="date of incurrence (assets measured then); outstanding tested continuously",
            financialInputs=["Consolidated Total Assets", "outstanding Finance Lease Obligations under §7.2(d)"],
            entityScope="Parent Borrower and Subsidiaries per §7.2 chapeau",
            conditions=[],
            sharedCapacityDependencies=[],
            reclassificationRights="§7.2 divide/classify/reclassify rights",
            sourceVersion=src("conmed"),
            verificationStatus="SPAN_GROUNDED_NEEDS_INPUTS",
            capacitySemantics="AFFIRMATIVE_CAPACITY",
            capacityComputable=False,
            capacityComputationBlockers=["Consolidated Total Assets and outstanding usage not supplied"],
            notes="Greater-of grower on Total Assets (not EBITDA).",
        )
    )

    candidates.append(
        cand(
            id="conmed-general-debt-basket",
            exactSourceSpan=S(
                "conmed",
                "unsecured Indebtedness not otherwise permitted by this Section 7.2 in an aggregate principal amount not to exceed the greater of\n(i) $60,000,000 and (ii) 3.25% of Consolidated Total Assets (measured on the date of incurrence of such Indebtedness);",
            ),
            governingCovenant="§7.2(o) general unsecured debt basket",
            basketFamily="GENERAL_DEBT",
            secondaryFamilies=["GREATER_OF_FIXED_AND_PERCENTAGE", "GROWER"],
            amountOrFormulaCandidate={
                "formulaKind": "GREATER_OF_FIXED_OR_PCT_METRIC",
                "expressionText": "max($60,000,000, 3.25% Consolidated Total Assets)",
                "structured": {"fixedDollar": "$60,000,000", "percentage": "3.25%", "metric": "Consolidated Total Assets"},
            },
            measurementDate="date of incurrence",
            financialInputs=["Consolidated Total Assets", "outstanding §7.2(o) unsecured debt"],
            entityScope="Parent Borrower and Subsidiaries",
            conditions=["unsecured", "not otherwise permitted by §7.2"],
            sharedCapacityDependencies=[],
            reclassificationRights="§7.2 reclassification paragraph",
            sourceVersion=src("conmed"),
            verificationStatus="SPAN_GROUNDED_NEEDS_INPUTS",
            capacitySemantics="AFFIRMATIVE_CAPACITY",
            capacityComputable=False,
            capacityComputationBlockers=["Consolidated Total Assets and usage not supplied"],
            notes="General debt greater-of basket.",
        )
    )

    candidates.append(
        cand(
            id="conmed-fixed-dollar-rp-basket",
            exactSourceSpan=S(
                "conmed",
                "the Parent Borrower may make Restricted Payments in any fiscal year in an aggregate amount not to exceed $40,000,000;",
            ),
            governingCovenant="§7.6 / Restricted Payments fixed annual basket (curated Article VII)",
            basketFamily="FIXED_DOLLAR",
            secondaryFamilies=["RESTRICTED_PAYMENT"],
            amountOrFormulaCandidate={
                "formulaKind": "FIXED_DOLLAR_CEILING",
                "expressionText": "$40,000,000 aggregate Restricted Payments per fiscal year",
                "structured": {"fixedDollar": "$40,000,000"},
            },
            measurementDate="any fiscal year",
            financialInputs=["fiscal-year Restricted Payment usage under this clause"],
            entityScope="Parent Borrower",
            conditions=["surrounding §7.6 conditions/order of clauses may gate availability — see curated section context"],
            sharedCapacityDependencies=[],
            reclassificationRights=None,
            sourceVersion=src("conmed"),
            verificationStatus="SPAN_GROUNDED_NEEDS_INPUTS",
            capacitySemantics="AFFIRMATIVE_CAPACITY",
            capacityComputable=False,
            capacityComputationBlockers=["fiscal-year usage not supplied; confirm no higher-priority default blocker in surrounding RP section before treating as currently usable"],
            notes="Pure fixed-dollar RP basket (annual).",
        )
    )

    candidates.append(
        cand(
            id="conmed-rp-ratio-unlimited",
            exactSourceSpan=S(
                "conmed",
                "make Restricted Payments in an unlimited amount;",
                length=200,
            ),
            governingCovenant="§7.6 Restricted Payments — ratio-gated unlimited limb",
            basketFamily="RATIO_BASED",
            secondaryFamilies=["RESTRICTED_PAYMENT"],
            amountOrFormulaCandidate={
                "formulaKind": "UNLIMITED_SUBJECT_TO_GATE",
                "expressionText": "unlimited Restricted Payments subject to pro forma leverage gate in surrounding text",
            },
            measurementDate="as of last day of most recently ended quarter with available financials (per surrounding text)",
            financialInputs=["leverage ratio for the gate in the surrounding proviso", "pro forma adjustments"],
            entityScope="Parent Borrower",
            conditions=["pro forma leverage compliance stated in the surrounding sentences before/after this limb"],
            sharedCapacityDependencies=[],
            reclassificationRights=None,
            sourceVersion=src("conmed"),
            verificationStatus="SPAN_GROUNDED_NEEDS_INPUTS",
            capacitySemantics="AFFIRMATIVE_CAPACITY",
            capacityComputable=False,
            capacityComputationBlockers=[
                "the captured clause text alone says 'unlimited' but the operative leverage gate sits in surrounding RP prose — gate inputs not supplied and must not be invented",
            ],
            notes="Unlimited-subject-to-gate RP capacity; do not report a dollar figure.",
        )
    )

    candidates.append(
        cand(
            id="conmed-general-lien-basket",
            exactSourceSpan=S(
                "conmed",
                "Liens not otherwise permitted by this Section 7.3 so long as neither (i) the aggregate outstanding principal amount of the obligations\nsecured thereby nor (ii) the aggregate fair market value (determined as of the date such Lien is incurred) of the assets subject thereto\nexceeds (as to the Parent Borrower and all Subsidiaries) the greater of (A) $50,000,000 and (B) 3.0% of Consolidated Total Assets\n(measured on the date of incurrence of such Liens);",
            ),
            governingCovenant="§7.3(m) general lien basket",
            basketFamily="GENERAL_LIEN",
            secondaryFamilies=["GREATER_OF_FIXED_AND_PERCENTAGE", "GROWER"],
            amountOrFormulaCandidate={
                "formulaKind": "GREATER_OF_FIXED_OR_PCT_METRIC",
                "expressionText": "max($50,000,000, 3% Consolidated Total Assets) dual-tested on secured obligations outstanding AND FMV of assets subject to the Liens",
                "structured": {"fixedDollar": "$50,000,000", "percentage": "3.0%", "metric": "Consolidated Total Assets"},
            },
            measurementDate="date of incurrence of such Liens (FMV and Total Assets); outstanding principal tested ongoing",
            financialInputs=["Consolidated Total Assets", "aggregate secured obligations under this clause", "FMV of assets subject to such Liens"],
            entityScope="Parent Borrower and all Subsidiaries",
            conditions=["Liens not otherwise permitted by §7.3"],
            sharedCapacityDependencies=[],
            reclassificationRights="§7.3 classify/reclassify paragraph",
            sourceVersion=src("conmed"),
            verificationStatus="SPAN_GROUNDED_NEEDS_INPUTS",
            capacitySemantics="AFFIRMATIVE_CAPACITY",
            capacityComputable=False,
            capacityComputationBlockers=["Total Assets, secured obligations, and asset FMV not supplied"],
            notes="General lien grower with two concurrent ceilings.",
        )
    )

    candidates.append(
        cand(
            id="conmed-debt-reclassification",
            exactSourceSpan=S(
                "conmed",
                "the Parent Borrower shall, in its sole discretion, classify or reclassify, or later divide, classify or reclassify, such item of Indebtedness\n(or any portion thereof) in any manner that complies with this Section 7.2 and will only be required to include the amount and type of\nsuch item of Indebtedness (or any portion thereof) in one of the above clauses",
                length=320,
            ),
            governingCovenant="§7.2 reclassification",
            basketFamily="RECLASSIFICATION",
            amountOrFormulaCandidate={
                "formulaKind": "REALLOCATION_TRANSFER",
                "expressionText": "sole-discretion divide/classify/reclassify among §7.2 categories; count in only one clause",
            },
            measurementDate="incurrence or later reclassification",
            financialInputs=["elected clause"],
            entityScope="Parent Borrower",
            conditions=["must comply with §7.2"],
            sharedCapacityDependencies=["§7.2(a)–(s) baskets"],
            reclassificationRights="sole discretion to classify, reclassify, or later divide",
            sourceVersion=src("conmed"),
            verificationStatus="SPAN_GROUNDED",
            capacitySemantics="AFFIRMATIVE_CAPACITY",
            capacityComputable=False,
            capacityComputationBlockers=["election mechanic; numeric capacity depends on destination basket inputs"],
            notes="Standard divide-and-classify clause.",
        )
    )

    candidates.append(
        cand(
            id="conmed-investment-grower",
            exactSourceSpan=S(
                "conmed",
                "Investments by the Parent Borrower or any of its Subsidiaries in an aggregate amount (valued at cost) not to exceed\nthe greater of (x) $75,000,000 and (y) 3.5% of Consolidated Total Assets (measured on the date of the making of such Investment) at any",
                length=250,
            ),
            governingCovenant="§7.8 general investment basket",
            basketFamily="INVESTMENT",
            secondaryFamilies=["GREATER_OF_FIXED_AND_PERCENTAGE", "GROWER"],
            amountOrFormulaCandidate={
                "formulaKind": "GREATER_OF_FIXED_OR_PCT_METRIC",
                "expressionText": "max($75,000,000, 3.5% Consolidated Total Assets) aggregate Investments valued at cost",
                "structured": {"fixedDollar": "$75,000,000", "percentage": "3.5%", "metric": "Consolidated Total Assets"},
            },
            measurementDate="date of the making of such Investment",
            financialInputs=["Consolidated Total Assets", "aggregate Investments under this clause valued at cost"],
            entityScope="Parent Borrower or any of its Subsidiaries",
            conditions=["no Default or Event of Default shall have occurred and be continuing (per surrounding clause text)"],
            sharedCapacityDependencies=[],
            reclassificationRights=None,
            sourceVersion=src("conmed"),
            verificationStatus="SPAN_GROUNDED_NEEDS_INPUTS",
            capacitySemantics="AFFIRMATIVE_CAPACITY",
            capacityComputable=False,
            capacityComputationBlockers=["Consolidated Total Assets and investment usage not supplied"],
            notes="Investment greater-of grower on Total Assets.",
        )
    )

    candidates.append(
        cand(
            id="conmed-purchase-money-lien",
            exactSourceSpan=S(
                "conmed",
                "was created solely for the purpose of securing Indebtedness representing, or incurred\nto finance, refinance or refund, the cost (including the cost of construction) of such Property and permitted by Section 7.2; provided\nthat (A) no such Lien shall extend to or cover any Property of the Parent Borrower or such Subsidiary other than the Property so acquired\nor financed, and (B) the principal amount of Indebtedness secured by any such Lien shall at no time exceed 80% of the fair market value\n(as determined in good faith by a Responsible Officer) of such Property at the time it was acquired (by purchase, construction or otherwise);",
            ),
            governingCovenant="§7.3(g) purchase-money / construction Liens",
            basketFamily="PURCHASE_MONEY",
            secondaryFamilies=["GENERAL_LIEN"],
            amountOrFormulaCandidate={
                "formulaKind": "PURCHASE_MONEY_COST_LINKED",
                "expressionText": "purchase-money/construction Lien securing ≤ 80% FMV of the acquired/financed Property; Lien limited to that Property",
                "structured": {"percentage": "80%", "metric": "fair market value of Property at acquisition"},
            },
            measurementDate="time Property was acquired (by purchase, construction or otherwise)",
            financialInputs=["FMV of Property", "principal secured"],
            entityScope="Parent Borrower or any of its Subsidiaries",
            conditions=["Lien limited to acquired/financed Property", "secured Indebtedness permitted by §7.2"],
            sharedCapacityDependencies=["related §7.2 debt permission"],
            reclassificationRights=None,
            sourceVersion=src("conmed"),
            verificationStatus="SPAN_GROUNDED_NEEDS_INPUTS",
            capacitySemantics="AFFIRMATIVE_CAPACITY",
            capacityComputable=False,
            capacityComputationBlockers=["Property FMV and secured principal not supplied"],
            notes="Purchase-money lien capacity linked to asset cost/FMV.",
        )
    )

    # ----- LSB -----
    candidates.append(
        cand(
            id="lsb-general-debt-total-assets-grower",
            exactSourceSpan=S(
                "lsb",
                "other Indebtedness in an aggregate principal amount outstanding at any time not to exceed the greater of $70,000,000 and\n5.5% of the total consolidated assets of the Loan Parties and their Subsidiaries as reflected on their balance sheet in accordance with GAAP;",
            ),
            governingCovenant="§6.01(i) general debt basket",
            basketFamily="GENERAL_DEBT",
            secondaryFamilies=["GREATER_OF_FIXED_AND_PERCENTAGE", "GROWER"],
            amountOrFormulaCandidate={
                "formulaKind": "GREATER_OF_FIXED_OR_PCT_METRIC",
                "expressionText": "max($70,000,000, 5.5% total consolidated assets per GAAP balance sheet)",
                "structured": {"fixedDollar": "$70,000,000", "percentage": "5.5%", "metric": "total consolidated assets (GAAP balance sheet)"},
            },
            measurementDate="any time outstanding; assets as reflected on balance sheet",
            financialInputs=["total consolidated assets", "outstanding §6.01(i) Indebtedness"],
            entityScope="Loan Parties and their Subsidiaries",
            conditions=[],
            sharedCapacityDependencies=[],
            reclassificationRights=None,
            sourceVersion=src("lsb"),
            verificationStatus="SPAN_GROUNDED_NEEDS_INPUTS",
            capacitySemantics="AFFIRMATIVE_CAPACITY",
            capacityComputable=False,
            capacityComputationBlockers=["total consolidated assets and usage not supplied"],
            notes="General debt grower on total assets (not EBITDA).",
        )
    )

    candidates.append(
        cand(
            id="lsb-ratio-gated-unlimited-debt",
            exactSourceSpan=S(
                "lsb",
                "the Loan Parties and their respective Subsidiaries shall be entitled to incur Indebtedness if on the date of the\nincurrence of such Indebtedness, (i) after giving effect to the incurrence thereof, the Fixed Charge Coverage Ratio of the Parent and its Subsidiaries for the most recently ended four full fiscal quarter period is greater than 2.0 to 1.0 and\n(ii) the Payment Conditions are satisfied with respect to such incurrence . The foregoing limitation shall not apply to:",
            ),
            governingCovenant="§6.01 chapeau — ratio + Payment Conditions debt permission",
            basketFamily="RATIO_BASED",
            secondaryFamilies=["GENERAL_DEBT"],
            amountOrFormulaCandidate={
                "formulaKind": "UNLIMITED_SUBJECT_TO_GATE",
                "expressionText": "uncapped Indebtedness if FCCR > 2.0x and Payment Conditions satisfied; enumerated (a)–(t) are additional exceptions",
                "structured": {"ratioTest": "Fixed Charge Coverage Ratio > 2.0 to 1.0"},
            },
            measurementDate="date of incurrence; FCCR for most recently ended four full fiscal quarters",
            financialInputs=["Fixed Charge Coverage Ratio", "Payment Conditions components"],
            entityScope="Loan Parties and their respective Subsidiaries",
            conditions=["FCCR > 2.0x after giving effect", "Payment Conditions satisfied"],
            sharedCapacityDependencies=[],
            reclassificationRights=None,
            sourceVersion=src("lsb"),
            verificationStatus="SPAN_GROUNDED_NEEDS_INPUTS",
            capacitySemantics="AFFIRMATIVE_CAPACITY",
            capacityComputable=False,
            capacityComputationBlockers=["FCCR inputs and Payment Conditions facts not supplied — must not invent a dollar cap"],
            notes="Affirmative unlimited-subject-to-gate capacity distinct from maintenance tests.",
        )
    )

    candidates.append(
        cand(
            id="lsb-refinancing-basket",
            exactSourceSpan=S(
                "lsb",
                "refinancings, renewals, replacements or extensions of Indebtedness permitted under clauses (b) and (c) of this\n Section  6.01 (and continuance or renewal of any Permitted Liens associated therewith) so long as: (i) [ reserved ], (ii) such refinancings, renewals, or extensions do not result in an increase in the\nprincipal amount of, or interest rate with respect to, the Indebtedness so refinanced, renewed, or extended, except for increases in the principal amount of such Indebtedness not exceeding the principal amount of such Indebtedness outstanding on the\nEffective Date,",
                length=520,
            ),
            governingCovenant="§6.01(d) refinancing basket",
            basketFamily="REFINANCING",
            amountOrFormulaCandidate={
                "formulaKind": "REFINANCE_PRINCIPAL_PLUS_COSTS",
                "expressionText": "refinance/renew/replace/extend §6.01(b)/(c) debt without increasing principal above Effective Date outstanding (plus other constraints in clause)",
            },
            measurementDate="refinancing consummation",
            financialInputs=["original principal", "Effective Date outstanding principal", "interest rate comparison", "maturity/WAL", "subordination terms if applicable"],
            entityScope="Loan Parties / Subsidiaries refinancing permitted (b)/(c) debt",
            conditions=["no material more burdensome terms; subordination protections if original was subordinated"],
            sharedCapacityDependencies=["§6.01(b)", "§6.01(c) Permitted Purchase Money Indebtedness"],
            reclassificationRights=None,
            sourceVersion=src("lsb"),
            verificationStatus="SPAN_GROUNDED_NEEDS_INPUTS",
            capacitySemantics="AFFIRMATIVE_CAPACITY",
            capacityComputable=False,
            capacityComputationBlockers=["original balances and term comparison facts not supplied"],
            notes="Refinancing basket tied to purchase-money and scheduled debt.",
        )
    )

    candidates.append(
        cand(
            id="lsb-asset-sale-annual-grower",
            exactSourceSpan=S(
                "lsb",
                "the aggregate Fair Market Value of all such assets sold during any\nfiscal year of the Loan Parties pursuant to this Section  6.04(a) shall not exceed the greater of $10,000,000 and 1.0% of the total consolidated assets of the Loan Parties and their Subsidiaries as reflected on their balance\nsheet in accordance with GAAP",
            ),
            governingCovenant="§6.04(a) asset disposition annual basket",
            basketFamily="ASSET_SALE_REINVESTMENT",
            secondaryFamilies=["GREATER_OF_FIXED_AND_PERCENTAGE", "GROWER"],
            amountOrFormulaCandidate={
                "formulaKind": "GREATER_OF_FIXED_OR_PCT_METRIC",
                "expressionText": "max($10,000,000, 1.0% total consolidated assets) aggregate FMV of §6.04(a) sales per fiscal year",
                "structured": {"fixedDollar": "$10,000,000", "percentage": "1.0%", "metric": "total consolidated assets"},
            },
            measurementDate="during any fiscal year; assets per GAAP balance sheet",
            financialInputs=["total consolidated assets", "aggregate FMV of §6.04(a) sales in the fiscal year"],
            entityScope="Loan Party and any Subsidiary of a Loan Party",
            conditions=["Borrowing Base Certificate if ABL Priority Collateral", "sold for Fair Market Value"],
            sharedCapacityDependencies=[],
            reclassificationRights=None,
            sourceVersion=src("lsb"),
            verificationStatus="SPAN_GROUNDED_NEEDS_INPUTS",
            capacitySemantics="AFFIRMATIVE_CAPACITY",
            capacityComputable=False,
            capacityComputationBlockers=["total consolidated assets and YTD sale FMV not supplied"],
            notes="Asset-sale capacity basket (annual). Distinct from mandatory-prepayment reinvestment rights.",
        )
    )

    candidates.append(
        cand(
            id="lsb-fixed-dollar-card-basket",
            exactSourceSpan=S(
                "lsb",
                "Indebtedness incurred in the ordinary course of business in respect of credit cards, credit card processing services,\ndebit cards, stored value cards, commercial cards (including so-called “purchase cards”, “procurement cards” or “p-cards”), or Banking\nServices in an aggregate principal amount not to exceed, with respect to any such Indebtedness owed to any Person that is not a Lender or any Affiliate of a Lender, $2,000,000 at any one time outstanding;",
            ),
            governingCovenant="§6.01(r) credit-card / banking services basket",
            basketFamily="FIXED_DOLLAR",
            secondaryFamilies=["GENERAL_DEBT"],
            amountOrFormulaCandidate={
                "formulaKind": "FIXED_DOLLAR_CEILING",
                "expressionText": "$2,000,000 outstanding for non-Lender/Affiliate card/banking services Indebtedness",
                "structured": {"fixedDollar": "$2,000,000"},
            },
            measurementDate="any one time outstanding",
            financialInputs=["outstanding non-Lender card/banking Indebtedness"],
            entityScope="Loan Parties and Subsidiaries; dollar cap applies to non-Lender/Affiliate creditors",
            conditions=["ordinary course of business"],
            sharedCapacityDependencies=[],
            reclassificationRights=None,
            sourceVersion=src("lsb"),
            verificationStatus="SPAN_GROUNDED_NEEDS_INPUTS",
            capacitySemantics="AFFIRMATIVE_CAPACITY",
            capacityComputable=False,
            capacityComputationBlockers=["outstanding usage not supplied"],
            notes="Narrow fixed-dollar basket with creditor-scope condition.",
        )
    )

    # ----- SUP -----
    candidates.append(
        cand(
            id="sup-non-loan-party-debt-grower",
            exactSourceSpan=S(
                "sup",
                "exceed (as of the date such Indebtedness, Disqualified Stock or Preferred Stock is issued, incurred or otherwise obtained) the greater of (I) $100.0 million and (II) 50% of Consolidated EBITDA of the Borrower and the Subsidiaries for the most",
                length=260,
            ),
            governingCovenant="§7.02 Indebtedness — non-Loan Party / general grower limb",
            basketFamily="GREATER_OF_FIXED_AND_PERCENTAGE",
            secondaryFamilies=["GROWER", "GENERAL_DEBT"],
            amountOrFormulaCandidate={
                "formulaKind": "GREATER_OF_FIXED_OR_PCT_METRIC",
                "expressionText": "max($100.0 million, 50% Consolidated EBITDA) as of issuance/incurrence date",
                "structured": {"fixedDollar": "$100.0 million", "percentage": "50%", "metric": "Consolidated EBITDA"},
            },
            measurementDate="date such Indebtedness/DQ/Preferred is issued, incurred or otherwise obtained; EBITDA for most recently ended Test Period (per surrounding text)",
            financialInputs=["Consolidated EBITDA", "outstanding under the applicable §7.02 limb"],
            entityScope="Borrower and Subsidiaries as scoped by the enclosing clause",
            conditions=["see enclosing §7.02 clause for entity/purpose limitations"],
            sharedCapacityDependencies=[],
            reclassificationRights="§7.02 classify/reclassify rights",
            sourceVersion=src("sup"),
            verificationStatus="SPAN_GROUNDED_NEEDS_INPUTS",
            capacitySemantics="AFFIRMATIVE_CAPACITY",
            capacityComputable=False,
            capacityComputationBlockers=["Consolidated EBITDA, exact enclosing clause identity details, and usage not fully supplied by this span alone"],
            notes="SUP greater-of debt grower; surrounding clause context retained via governingCovenant note.",
        )
    )

    candidates.append(
        cand(
            id="sup-debt-reclassification",
            exactSourceSpan=S(
                "sup",
                "reclassify, such item of Indebtedness, Disqualified Stock or Preferred Stock (or any portion thereof) and will only be required to include the amount and type of such Indebtedness, Disqualified Stock or Preferred Stock (or a portion thereof) in such",
                length=280,
            ),
            governingCovenant="§7.02 reclassification",
            basketFamily="RECLASSIFICATION",
            amountOrFormulaCandidate={
                "formulaKind": "REALLOCATION_TRANSFER",
                "expressionText": "classify/reclassify Indebtedness/DQ/Preferred among complying §7.02 baskets; count in one basket",
            },
            measurementDate="incurrence or later reclassification",
            financialInputs=["elected basket"],
            entityScope="Borrower",
            conditions=["must comply with §7.02; certain Effective Date facilities locked per surrounding text"],
            sharedCapacityDependencies=["§7.02 baskets"],
            reclassificationRights="permitted to reclassify among complying categories",
            sourceVersion=src("sup"),
            verificationStatus="SPAN_GROUNDED",
            capacitySemantics="AFFIRMATIVE_CAPACITY",
            capacityComputable=False,
            capacityComputationBlockers=["election mechanic only"],
            notes="SUP divide-and-classify mechanic.",
        )
    )

    candidates.append(
        cand(
            id="sup-lien-reclassification",
            exactSourceSpan=S(
                "sup",
                "or more of the categories of Permitted Liens, the Borrower will, in its sole discretion, be entitled to divide, classify or reclassify, in whole or in part, any such Lien (or any portion thereof) among one or more of such categories or clauses in",
                length=260,
            ),
            governingCovenant="Permitted Liens reclassification",
            basketFamily="RECLASSIFICATION",
            secondaryFamilies=["GENERAL_LIEN"],
            amountOrFormulaCandidate={
                "formulaKind": "REALLOCATION_TRANSFER",
                "expressionText": "sole-discretion divide/classify/reclassify Liens among Permitted Lien categories",
            },
            measurementDate="incurrence or later reclassification",
            financialInputs=["elected Permitted Lien category"],
            entityScope="Borrower",
            conditions=[],
            sharedCapacityDependencies=["Permitted Lien categories"],
            reclassificationRights="sole discretion",
            sourceVersion=src("sup"),
            verificationStatus="SPAN_GROUNDED",
            capacitySemantics="AFFIRMATIVE_CAPACITY",
            capacityComputable=False,
            capacityComputationBlockers=["election mechanic only"],
            notes="Lien-side reclassification.",
        )
    )

    # ----- FWRG -----
    candidates.append(
        cand(
            id="fwrg-purchase-money-grower",
            exactSourceSpan=S(
                "fwrg",
                "purchase money Indebtedness in an aggregate outstanding principal amount not to exceed the greater of $30,000,000 and 50% of Consolidated Adjusted EBITDA",
            ),
            governingCovenant="§6.01 purchase-money Indebtedness",
            basketFamily="PURCHASE_MONEY",
            secondaryFamilies=["GREATER_OF_FIXED_AND_PERCENTAGE", "GROWER"],
            amountOrFormulaCandidate={
                "formulaKind": "GREATER_OF_FIXED_OR_PCT_METRIC",
                "expressionText": "max($30,000,000, 50% Consolidated Adjusted EBITDA) aggregate outstanding purchase-money Indebtedness",
                "structured": {"fixedDollar": "$30,000,000", "percentage": "50%", "metric": "Consolidated Adjusted EBITDA"},
            },
            measurementDate="as stated in surrounding §6.01 text (outstanding test)",
            financialInputs=["Consolidated Adjusted EBITDA", "outstanding purchase-money Indebtedness under this clause"],
            entityScope="Borrower / Restricted Subsidiaries per §6.01",
            conditions=["must be purchase money Indebtedness per source"],
            sharedCapacityDependencies=[],
            reclassificationRights=None,
            sourceVersion=src("fwrg"),
            verificationStatus="SPAN_GROUNDED_NEEDS_INPUTS",
            capacitySemantics="AFFIRMATIVE_CAPACITY",
            capacityComputable=False,
            capacityComputationBlockers=["Consolidated Adjusted EBITDA and usage not supplied"],
            notes="FWRG article-6 extract is a single long line; span grounded via substring match.",
        )
    )

    candidates.append(
        cand(
            id="fwrg-available-amount-and-excluded-contribution",
            exactSourceSpan=S(
                "fwrg",
                "Available Amount on such date that the Borrower elects to apply to this clause (iii)(A) and/or (B) the portion, if any, of the Available Excluded Contribution Amount on such date that the Borrower elects to apply",
            ),
            governingCovenant="§6.04 / RP-related permission using Available Amount and Available Excluded Contribution Amount",
            basketFamily="AVAILABLE_AMOUNT_BUILDER",
            secondaryFamilies=["EQUITY_CONTRIBUTION", "RESTRICTED_PAYMENT", "INVESTMENT"],
            amountOrFormulaCandidate={
                "formulaKind": "BUILDER_SUM_COMPONENTS",
                "expressionText": "elective application of Available Amount and/or Available Excluded Contribution Amount to the clause",
            },
            measurementDate="such date of election/application",
            financialInputs=["Available Amount", "Available Excluded Contribution Amount", "election"],
            entityScope="Borrower",
            conditions=["Borrower election to apply stated amounts"],
            sharedCapacityDependencies=["Available Amount", "Available Excluded Contribution Amount"],
            reclassificationRights=None,
            sourceVersion=src("fwrg"),
            verificationStatus="SPAN_GROUNDED_NEEDS_INPUTS",
            capacitySemantics="AFFIRMATIVE_CAPACITY",
            capacityComputable=False,
            capacityComputationBlockers=[
                "Available Amount and Available Excluded Contribution Amount builder definitions/inputs not fully reconstituted from this usage span alone",
            ],
            notes="Usage pointer into dual builders (AA + Excluded Contribution).",
        )
    )

    candidates.append(
        cand(
            id="fwrg-anti-double-counting-incremental",
            exactSourceSpan=S(
                "fwrg",
                "without duplication of any amount outstanding in reliance on the relevant clause such that the amount available under the relevant clause",
            ),
            governingCovenant="§6.01 Fixed Incremental / related clauses — without duplication",
            basketFamily="ANTI_DOUBLE_COUNTING",
            secondaryFamilies=["INCREMENTAL_DEBT", "SHARED"],
            amountOrFormulaCandidate={
                "formulaKind": "WITHOUT_DUPLICATION_NETTING",
                "expressionText": "incurrence under Fixed Incremental / listed clauses without duplication of amounts outstanding in reliance on the relevant clause",
            },
            measurementDate="incurrence / outstanding determination",
            financialInputs=["amounts outstanding in reliance on each overlapping clause"],
            entityScope="Borrower incremental / §6.01 usage",
            conditions=[],
            sharedCapacityDependencies=["Fixed Incremental Amount and cross-referenced §6.01 clauses in surrounding text"],
            reclassificationRights=None,
            sourceVersion=src("fwrg"),
            verificationStatus="SPAN_GROUNDED",
            capacitySemantics="AFFIRMATIVE_CAPACITY",
            capacityComputable=False,
            capacityComputationBlockers=["anti-duplication constraint; still needs clause balances"],
            notes="Anti-double-counting language for incremental / shared clauses.",
        )
    )

    candidates.append(
        cand(
            id="chwy-builder-returns-without-duplication",
            exactSourceSpan=S(
                "chwy",
                "any returns, profits, distribution and similar amounts received on account of any\nPermitted Investment subject to a dollar-denominated or ratio-based basket and without duplication of any returns, profits, distributions or similar amounts included in the calculation of such basket;",
            ),
            governingCovenant="§6.08(a)(3)(d)(iii) Available Amount returns leg",
            basketFamily="ANTI_DOUBLE_COUNTING",
            secondaryFamilies=["BASKET_REPLENISHMENT", "AVAILABLE_AMOUNT_BUILDER", "INVESTMENT"],
            amountOrFormulaCandidate={
                "formulaKind": "WITHOUT_DUPLICATION_NETTING",
                "expressionText": "returns on dollar/ratio Permitted Investments credited to Available Amount without duplicating amounts already included in that basket's own calculation",
            },
            measurementDate="after the Effective Date as returns are received",
            financialInputs=["returns/profits/distributions", "amounts already included in the underlying Permitted Investment basket"],
            entityScope="Restricted Parties",
            conditions=["Permitted Investment was subject to a dollar-denominated or ratio-based basket"],
            sharedCapacityDependencies=["the underlying Permitted Investment basket", "Available Amount"],
            reclassificationRights=None,
            sourceVersion=src("chwy"),
            verificationStatus="SPAN_GROUNDED",
            capacitySemantics="AFFIRMATIVE_CAPACITY",
            capacityComputable=False,
            capacityComputationBlockers=["return amounts and basket-internal credits not supplied"],
            notes="Builder replenishment with explicit anti-duplication against the investment basket.",
        )
    )

    candidates.append(
        cand(
            id="chwy-cumulative-retained-ecf-pointer",
            exactSourceSpan=S(
                "chwy",
                "“ Retained Excess Cash Flow ” means, at any date of determination, an amount equal to the sum of (a) the portion of the Excess Cash Flow",
                length=200,
            ),
            governingCovenant="Definitions — Retained Excess Cash Flow (Available Amount input)",
            basketFamily="CUMULATIVE_CREDIT",
            secondaryFamilies=["AVAILABLE_AMOUNT_BUILDER"],
            amountOrFormulaCandidate={
                "formulaKind": "BUILDER_SUM_COMPONENTS",
                "expressionText": "Retained Excess Cash Flow cumulative sum (definition continues); feeds Available Amount clause (a)(y)",
            },
            measurementDate="any date of determination",
            financialInputs=["Excess Cash Flow", "mandatory prepayment percentages/applications per remainder of definition"],
            entityScope="Borrowers / Restricted Parties as defined",
            conditions=[],
            sharedCapacityDependencies=["Available Amount", "ECF sweep mechanics"],
            reclassificationRights=None,
            sourceVersion=src("chwy"),
            verificationStatus="SPAN_GROUNDED_NEEDS_INPUTS",
            capacitySemantics="AFFIRMATIVE_CAPACITY",
            capacityComputable=False,
            capacityComputationBlockers=["full Retained Excess Cash Flow definition and ECF history not supplied in this opening span"],
            notes="Cumulative credit input to Available Amount builder.",
        )
    )

    # Adversarial examples
    adversarial: list[dict[str, Any]] = []

    adversarial.append(
        adv(
            id="adv-conmed-maintenance-leverage",
            role="FINANCIAL_MAINTENANCE_TEST",
            exactSourceSpan=S(
                "conmed",
                "Permit the Consolidated Senior Secured Leverage Ratio as at the last day of\nany period of four consecutive fiscal quarters of the Parent Borrower and its Subsidiaries ending on or after the Closing Date to exceed\n3.75 to 1.00.",
            ),
            governingProvision="§7.1(a) Consolidated Senior Secured Leverage Ratio",
            whyNotAffirmativeCapacity="This is an ongoing maintenance financial covenant. Exceeding 3.75x is a default posture, not a grant of incremental debt room.",
            lookalikeTrap="The same 3.75x number can appear in incurrence tests; here the verb is 'Permit ... to exceed' in the Financial Condition Covenants section, not an Indebtedness exception basket.",
            pairedCapacityControlId="dsgr-ratio-debt-basket",
            sourceVersion=src("conmed"),
            verificationStatus="SPAN_GROUNDED_NOT_CAPACITY",
        )
    )

    adversarial.append(
        adv(
            id="adv-chwy-threshold-amount",
            role="DEFAULT_OR_EVENT_THRESHOLD",
            exactSourceSpan=S(
                "chwy",
                "“ Threshold Amount ” means the greater of (a) $324.0 million and (b) 45% of\nConsolidated EBITDA on a Pro Forma Basis as of the applicable da",
                length=140,
            ),
            governingProvision="Definitions — Threshold Amount",
            whyNotAffirmativeCapacity="Threshold Amount is used as a size comparator for defaults/exceptions (e.g., small subordinated debt prepayments below Threshold Amount), not as a permission ceiling authorizing that amount of debt or RPs.",
            lookalikeTrap="Uses the same 'greater of fixed and % EBITDA' drafting pattern as real grower baskets.",
            pairedCapacityControlId="chwy-general-lien-basket",
            sourceVersion=src("chwy"),
            verificationStatus="SPAN_GROUNDED_NOT_CAPACITY",
        )
    )

    adversarial.append(
        adv(
            id="adv-chwy-asset-sale-de-minimis",
            role="DEFINITION_DE_MINIMIS_EXCLUSION",
            exactSourceSpan=S(
                "chwy",
                "any transaction or series of related transactions with an aggregate Fair Market Value of less than the greater of (i) $108.0 million and (ii) 15% of Consolidated EBITDA for the most recently ended Test Period, calculated on a Pro Forma Basis;",
            ),
            governingProvision="Asset Sale definition — de minimis exclusion",
            whyNotAffirmativeCapacity="This number excludes small dispositions from the defined term Asset Sale; it does not affirmatively authorize $108mm/% EBITDA of investments, debt, or RPs.",
            lookalikeTrap="Identical greater-of grower syntax used in affirmative baskets.",
            pairedCapacityControlId="chwy-available-amount-starter-grower",
            sourceVersion=src("chwy"),
            verificationStatus="SPAN_GROUNDED_NOT_CAPACITY",
        )
    )

    adversarial.append(
        adv(
            id="adv-lsb-payment-conditions-gate-vs-dollar",
            role="APPROVAL_OR_CONSENT_TRIGGER",
            exactSourceSpan=S(
                "lsb",
                "(ii) the Payment Conditions are satisfied with respect to such incurrence . The foregoing limitation shall not apply to:",
            ),
            governingProvision="§6.01 chapeau — Payment Conditions",
            whyNotAffirmativeCapacity="Payment Conditions are a compound eligibility gate (liquidity/no-default/certificate style), not themselves a dollar basket. Satisfying them may unlock the uncapped ratio path, but the gate is not an amount.",
            lookalikeTrap="Sitting next to FCCR > 2.0x, it can be mistaken for a second numeric capacity formula.",
            pairedCapacityControlId="lsb-ratio-gated-unlimited-debt",
            sourceVersion=src("lsb"),
            verificationStatus="SPAN_GROUNDED_NOT_CAPACITY",
        )
    )

    adversarial.append(
        adv(
            id="adv-conmed-stepup-is-maintenance-relief",
            role="FINANCIAL_MAINTENANCE_TEST",
            exactSourceSpan=S(
                "conmed",
                "the Consolidated Senior Secured Leverage Ratio may be 0.50 to 1.00 greater\nthan the ratio set forth above for four consecutive fiscal quarters starting with the fiscal quarter in which such Material Acquisition\nis consummated; provided that (x) such step-up shall be permitted only twice during the term of this Agreement and (y) there shall\nbe at least two fiscal quarters in between any such step-ups.",
            ),
            governingProvision="§7.1(a) Material Acquisition step-up",
            whyNotAffirmativeCapacity="Step-up temporarily relaxes a maintenance test threshold; it does not create a debt/RP/investment basket amount.",
            lookalikeTrap="Mentions 'permitted' and a numeric 0.50x change that can be misread as capacity.",
            pairedCapacityControlId="conmed-general-debt-basket",
            sourceVersion=src("conmed"),
            verificationStatus="SPAN_GROUNDED_NOT_CAPACITY",
        )
    )

    adversarial.append(
        adv(
            id="adv-chwy-abr-greater-of-rate",
            role="INTEREST_RATE_FORMULA",
            exactSourceSpan=S(
                "chwy",
                "shall be the greater of clauses (a) and (b) above and shall be determined without reference to clause (c) above. Notwithstanding the foregoing, the Alternate Base Rate will be deemed to be 0.00% per annum if the Alternate Base Rate",
            ),
            governingProvision="Alternate Base Rate definition",
            whyNotAffirmativeCapacity="Greater-of language here selects an interest rate component, not covenant capacity.",
            lookalikeTrap="'the greater of' is the same operator used in grower baskets.",
            pairedCapacityControlId="chwy-general-lien-basket",
            sourceVersion=src("chwy"),
            verificationStatus="SPAN_GROUNDED_NOT_CAPACITY",
        )
    )

    adversarial.append(
        adv(
            id="adv-dsgr-availability-facility-draw",
            role="COMPARATOR_THRESHOLD",
            exactSourceSpan=S(
                "dsgr",
                "“ Availability ” means, at any time, an amount equal to (a) the aggregate Commitments minus (b) the\nAggregate Revolving Exposure (calculated, with respect to any Defaulting Lender, as if such Defaulting Lender had funded its Applicable Percentage of all outstanding Borrowings).",
            ),
            governingProvision="Definitions — Availability",
            whyNotAffirmativeCapacity="Facility Availability is revolving headroom under commitments, not a negative-covenant basket permission for debt/liens/RPs/investments outside the facility.",
            lookalikeTrap="Named similarly to Available Amount builder baskets.",
            pairedCapacityControlId="dsgr-available-amount-builder",
            sourceVersion=src("dsgr"),
            verificationStatus="SPAN_GROUNDED_NOT_CAPACITY",
        )
    )

    adversarial.append(
        adv(
            id="adv-gib-affiliate-transaction-threshold",
            role="APPROVAL_OR_CONSENT_TRIGGER",
            exactSourceSpan=S(
                "gib",
                "in the event such Affiliate Transaction involves an aggregate value in excess of the greater of (i) $51,600,000 and (ii) 15.0% of LTM EBITDA, the terms of such transaction have been",
                length=220,
            ),
            governingProvision="Affiliate Transactions — approval threshold",
            whyNotAffirmativeCapacity="The greater-of figure triggers a heightened approval/fairness process for Affiliate Transactions; it is not a basket authorizing $51.6mm of affiliate payments.",
            lookalikeTrap="Same grower drafting as investment/debt baskets.",
            pairedCapacityControlId="gib-investment-grower-with-returns",
            sourceVersion=src("gib"),
            verificationStatus="SPAN_GROUNDED_NOT_CAPACITY",
        )
    )

    adversarial.append(
        adv(
            id="adv-chwy-subordinated-below-threshold-exception",
            role="COMPARATOR_THRESHOLD",
            exactSourceSpan=S(
                "chwy",
                "Indebtedness individually having an aggregate principal amount which is below the\nThreshold Amount; or",
            ),
            governingProvision="§6.08(a)(iii)(c) Restricted Debt Payment exception",
            whyNotAffirmativeCapacity="Being below Threshold Amount carves a small subordinated prepayment out of the RP prohibition; it does not grant Threshold Amount of RP capacity.",
            lookalikeTrap="References a greater-of EBITDA-linked Threshold Amount definition.",
            pairedCapacityControlId="chwy-available-amount-builder",
            sourceVersion=src("chwy"),
            verificationStatus="SPAN_GROUNDED_NOT_CAPACITY",
        )
    )

    adversarial.append(
        adv(
            id="adv-conmed-liquidity-maintenance",
            role="FINANCIAL_MAINTENANCE_TEST",
            exactSourceSpan=S(
                "conmed",
                "From and after the date that is 91 days prior to the earliest scheduled maturity date of the Convertible Notes\nand so long as the aggregate outstanding principal amount of the Early Maturing Debt is in excess of $200,000,000, permit the Liquidity\nat any time to be less than the sum of (i) $75,000,000 plus (ii) the aggregate outstanding principal amount of the Early Maturing Debt.",
            ),
            governingProvision="§7.1(d) Liquidity maintenance",
            whyNotAffirmativeCapacity="Minimum liquidity maintenance test with springing conditions; breach is default, not a permission to spend $75mm+$Early Maturing Debt.",
            lookalikeTrap="Contains large dollar figures adjacent to covenant capacity drafting.",
            pairedCapacityControlId="conmed-fixed-dollar-rp-basket",
            sourceVersion=src("conmed"),
            verificationStatus="SPAN_GROUNDED_NOT_CAPACITY",
        )
    )

    adversarial.append(
        adv(
            id="adv-sup-locked-effective-date-facility",
            role="COMPARATOR_THRESHOLD",
            exactSourceSpan=S(
                "sup",
                "Amendment and Restatement Date will, at all times, be treated as incurred on the Amendment and Restatement Date under Section 7.02(b)(1) (and may not be reclassified to or divided among any other basket) and (y) all",
                length=240,
            ),
            governingProvision="§7.02 reclassification — locked Effective Date treatment",
            whyNotAffirmativeCapacity="This sentence restricts reclassification of existing facilities; it is not itself a capacity grant and forbids moving that debt into other baskets.",
            lookalikeTrap="Appears inside the reclassification paragraph that otherwise expands election rights.",
            pairedCapacityControlId="sup-debt-reclassification",
            sourceVersion=src("sup"),
            verificationStatus="SPAN_GROUNDED_NOT_CAPACITY",
        )
    )

    adversarial.append(
        adv(
            id="adv-control-chwy-general-lien-is-capacity",
            role="AFFIRMATIVE_CAPACITY_CONTROL",
            exactSourceSpan=S(
                "chwy",
                "(21) other Liens securing obligations that any time outstanding do not exceed the greater of (x)\n$720.0 million and (y) 100% of Consolidated EBITDA for the most recently ended Test Period, calculated on a Pro Forma Basis, at the time of incurrence;",
            ),
            governingProvision="Permitted Liens (21) — control example of real capacity",
            whyNotAffirmativeCapacity="N/A — this IS affirmative lien capacity (control). Listed so classifiers must keep true baskets on the capacity side of the adversarial split.",
            lookalikeTrap="Uses the same greater-of pattern as Threshold Amount / de minimis exclusions, but here it is an operative Permitted Liens ceiling.",
            pairedCapacityControlId="chwy-general-lien-basket",
            sourceVersion=src("chwy"),
            verificationStatus="SPAN_GROUNDED",
        )
    )

    # Validate spans
    def span_ok(document_path: str, span: str) -> bool:
        text = (ROOT / document_path).read_text(encoding="utf-8")
        if span in text:
            return True
        return re.sub(r"\s+", " ", span) in re.sub(r"\s+", " ", text)

    bad = []
    for rec in candidates + adversarial:
        path = rec["sourceVersion"]["documentPath"]
        if not span_ok(path, rec["exactSourceSpan"]):
            bad.append(rec["id"])
    if bad:
        raise SystemExit(f"Span grounding failed for: {bad}")

    # Enforce semantic rules locally
    for rec in candidates:
        if rec["capacityComputable"]:
            if rec["capacitySemantics"] != "AFFIRMATIVE_CAPACITY" or rec["capacityComputationBlockers"]:
                raise SystemExit(f"bad computable flag: {rec['id']}")
        if rec["capacitySemantics"] == "AFFIRMATIVE_CAPACITY" and not rec["capacityComputable"]:
            if not rec["capacityComputationBlockers"]:
                raise SystemExit(f"missing blockers: {rec['id']}")
        if rec["capacitySemantics"] == "NOT_CAPACITY" and rec["capacityComputable"]:
            raise SystemExit(f"not-capacity marked computable: {rec['id']}")

    families = [
        "FIXED_DOLLAR",
        "GREATER_OF_FIXED_AND_PERCENTAGE",
        "GROWER",
        "RATIO_BASED",
        "AVAILABLE_AMOUNT_BUILDER",
        "CUMULATIVE_CREDIT",
        "EQUITY_CONTRIBUTION",
        "INCREMENTAL_DEBT",
        "REFINANCING",
        "PURCHASE_MONEY",
        "GENERAL_DEBT",
        "GENERAL_LIEN",
        "RESTRICTED_PAYMENT",
        "INVESTMENT",
        "ASSET_SALE_REINVESTMENT",
        "SHARED",
        "RECLASSIFICATION",
        "BASKET_REPLENISHMENT",
        "ANTI_DOUBLE_COUNTING",
        "CROSS_COVENANT_CAPACITY_RESTRICTION",
    ]
    fam_counts: Counter[str] = Counter()
    for rec in candidates:
        fam_counts[rec["basketFamily"]] += 1
        for sec in rec.get("secondaryFamilies") or []:
            fam_counts[sec] += 0  # ensure key exists without inflating primary counts
            # Also credit secondary for coverage presence
            fam_counts[f"secondary:{sec}"] += 1

    # Coverage: primary or secondary
    coverage: dict[str, int] = {f: 0 for f in families}
    for rec in candidates:
        coverage[rec["basketFamily"]] += 1
        for sec in rec.get("secondaryFamilies") or []:
            coverage[sec] += 1

    missing = [f for f, n in coverage.items() if n == 0]
    if missing:
        raise SystemExit(f"Missing family coverage: {missing}")

    formula_counts: Counter[str] = Counter(r["amountOrFormulaCandidate"]["formulaKind"] for r in candidates)
    instruments = sorted({r["sourceVersion"]["instrumentId"] for r in candidates})

    affirm = sum(1 for r in candidates if r["capacitySemantics"] == "AFFIRMATIVE_CAPACITY")
    not_cap = sum(1 for r in candidates if r["capacitySemantics"] == "NOT_CAPACITY")
    incomplete = sum(1 for r in candidates if r["capacitySemantics"] == "INCOMPLETE_SEMANTICS")
    computable = sum(1 for r in candidates if r["capacityComputable"])
    blocked = sum(1 for r in candidates if r["capacitySemantics"] == "AFFIRMATIVE_CAPACITY" and not r["capacityComputable"])
    grounded = sum(1 for r in candidates if r["verificationStatus"].startswith("SPAN_GROUNDED"))

    manifest = {
        "schemaVersion": "basket-capacity-formula-corpus.v1",
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "corpusId": "covenant-basket-capacity-formula-library-v1",
        "productionEngineUntouched": True,
        "paidCalls": False,
        "merges": False,
        "certificationChanges": False,
        "counts": {
            "basketCandidates": len(candidates),
            "affirmativeCapacity": affirm,
            "notCapacity": not_cap,
            "incompleteSemantics": incomplete,
            "capacityComputable": computable,
            "capacityBlockedMissingInputs": blocked,
            "adversarialExamples": len(adversarial),
            "familiesCovered": sum(1 for f in families if coverage[f] > 0),
            "formulaKindsCovered": len(formula_counts),
            "sourceInstruments": len(instruments),
            "spanGrounded": grounded,
        },
        "familyCoverage": coverage,
        "formulaKindCoverage": dict(formula_counts),
        "sourceInstruments": instruments,
    }

    OUT.mkdir(parents=True, exist_ok=True)
    EXPORT.mkdir(parents=True, exist_ok=True)

    # Taxonomy export (mirrors lib/basket-formula-corpus/taxonomy.ts conceptually)
    taxonomy_path = ROOT / "lib" / "basket-formula-corpus" / "taxonomy.ts"
    # Also write JSON taxonomy from a compact table
    taxonomy_json = json.loads((OUT / "01-formula-taxonomy.json").read_text()) if (OUT / "01-formula-taxonomy.json").exists() else None

    with (EXPORT / "basket-candidates.jsonl").open("w", encoding="utf-8") as f:
        for rec in candidates:
            f.write(json.dumps(rec, ensure_ascii=False) + "\n")

    with (EXPORT / "adversarial-examples.jsonl").open("w", encoding="utf-8") as f:
        for rec in adversarial:
            f.write(json.dumps(rec, ensure_ascii=False) + "\n")

    (EXPORT / "dataset-manifest.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    (OUT / "04-corpus-summary.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    (OUT / "03-source-inventory.json").write_text(
        json.dumps({"schemaVersion": "basket-capacity-formula-corpus.v1", "sources": SOURCES}, indent=2) + "\n",
        encoding="utf-8",
    )
    (OUT / "05-adversarial-examples.json").write_text(json.dumps(adversarial, indent=2) + "\n", encoding="utf-8")
    (EXPORT / "basket-candidates.json").write_text(json.dumps(candidates, indent=2) + "\n", encoding="utf-8")

    print(json.dumps(manifest["counts"], indent=2))
    print("familyCoverage", json.dumps(coverage, indent=2))
    print(f"Wrote {len(candidates)} candidates and {len(adversarial)} adversarial examples")


if __name__ == "__main__":
    build()
