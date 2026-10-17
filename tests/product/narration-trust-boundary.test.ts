/**
 * Narration trust boundary (audit 2026-10-17): parseFormulaFromItem
 * used to join item.plainEnglish — analyzer-GENERATED narration —
 * into the text every formula extractor scans, and extractors take
 * the FIRST figure they find. The audit measured 0/1,688 corpus
 * items compiling from narration (pure redundancy: baskets /
 * permissions precede it in the join with the same figures), but
 * its counterfactual probes minted MODELED Permissions by mutating
 * ONLY narration:
 *
 *   Probe A (aon 4.2(b)): a narration-carried condition whose "%"
 *     was mutated to "$10,000,000" compiled FLAT $10M from KNM.
 *   Probe B (solaris 2.05(b)): a narration-only "Amount/threshold:
 *     $75,000,000" line plus the item's genuine "Available Amount"
 *     keyword compiled a BUILDER_BASKET $75M from KNM.
 *   Probe C (solaris 7.03(iv) shape): narration carried a condition
 *     clip that severed "$10,000,000" into "$10,000,0…" — which
 *     parses as $100,000, a figure nowhere in the contract — and
 *     narration precedes the excerpt in the join, so the corrupt
 *     figure would win over the contract's own text.
 *
 * The fix removes plainEnglish from the formula scan and scans
 * item.conditions explicitly instead (verbatim excerpt clips —
 * contract text; conditions previously reached the scan only via
 * narration). These pins reproduce the probes: the compiled result
 * must be identical with narration faithful, mutated, or absent;
 * a narration-carried figure must never win over contract fields;
 * and a cap that legitimately lives in a verbatim conditions clip
 * must still compile (the conduit survives, now explicit).
 */
import { describe, expect, it } from "vitest";
import { parseFormulaFromItem } from "../../lib/product/customer-intelligence/formula-parse";
import type { CovenantSummaryItem } from "../../lib/product/covenant-intelligence/summarize";

function item(overrides: Partial<CovenantSummaryItem>): CovenantSummaryItem {
  return {
    heading: "Section",
    sectionRef: "0.00",
    category: "DEBT_INCURRENCE",
    categoryLabel: "Debt incurrence",
    posture: "CONDITIONAL_PERMISSION",
    plainEnglish: "",
    restriction: null,
    permissions: [],
    coveredEntities: ["Borrower"],
    exceptions: [],
    conditions: [],
    materialBasketsThresholds: [],
    draftingPatterns: [],
    operativeLanguageExcerpt: "",
    sourceCitation: "test",
    governingAgreement: "test",
    families: [],
    relatedDefinedTerms: [],
    applicableDefinitions: [],
    entityScope: {
      borrower: true,
      guarantor: false,
      restrictedSubsidiary: false,
      unrestrictedSubsidiary: false,
      notes: [],
    },
    crossReferences: [],
    dependencies: [],
    epistemicStatus: "DISCOVERED_CANDIDATE",
    interpretationNote: "",
    unresolvedQuestions: [],
    ...overrides,
  } as unknown as CovenantSummaryItem;
}

describe("narration trust boundary — audit probes", () => {
  it("Probe A: a dollar proviso that exists only in narration never compiles (aon 4.2(b) shape)", () => {
    // The item's conditions carry a %-of-assets proviso as a
    // verbatim clip; no contract field carries a dollar amount.
    const base = {
      sectionRef: "4.2(b)",
      category: "BASKETS_EXCEPTIONS_CONDITIONS" as const,
      posture: "CONDITIONAL_PERMISSION" as const,
      permissions: [
        "(b) Prior to or substantially concurrently with the funding of the Loans, all of the conditions precedent to the consummation of the Acquisition shall have been satisfied or waived in all material respects.",
      ],
      conditions: [
        "provided_that: provided, that such Indebtedness shall not exceed 10% of Consolidated Total Assets",
      ],
      materialBasketsThresholds: [],
      operativeLanguageExcerpt:
        "Prior to or substantially concurrently with the funding of the Loans, all of the conditions precedent to the consummation of the Acquisition shall have been satisfied or waived in all material respects in accordance with the terms thereof.",
    };
    const faithful = item({
      ...base,
      plainEnglish:
        "Section 4.2(b) operates as a conditional permission. Conditions/provisos signaled: provided_that: provided, that such Indebtedness shall not exceed 10% of Consolidated Total Assets.",
    });
    // The audit's mutation: the narration-carried condition's "%"
    // becomes a dollar amount. On the old scan this minted FLAT $10M.
    const mutated = item({
      ...base,
      plainEnglish:
        "Section 4.2(b) operates as a conditional permission. Conditions/provisos signaled: provided_that: provided, that such Indebtedness shall not exceed $10,000,000.",
    });
    const absent = item({ ...base, plainEnglish: "" });

    const expected = parseFormulaFromItem(faithful);
    expect(expected.modelingStatus).toBe("KNOWN_NOT_MODELED");
    expect(expected.thresholdValue).toBe(0);
    expect(parseFormulaFromItem(mutated)).toEqual(expected);
    expect(parseFormulaFromItem(absent)).toEqual(expected);
  });

  it("Probe B: a narration-only Amount/threshold line never mints a BUILDER_BASKET (solaris 2.05(b) shape)", () => {
    // "Available Amount" is genuinely in the contract fields (the
    // builder keyword is real); the $75M exists ONLY in narration.
    const base = {
      sectionRef: "2.05(b)",
      posture: "CONDITIONAL_PERMISSION" as const,
      permissions: [],
      conditions: [],
      materialBasketsThresholds: ["Builder / Available Amount construct referenced."],
      operativeLanguageExcerpt:
        "The Borrower may incur additional Indebtedness under this Section so long as the Available Amount, after giving effect to such incurrence, is not less than zero.",
    };
    const mutated = item({
      ...base,
      plainEnglish:
        "Section 2.05(b) operates as a conditional permission within the debt incurrence regime for Borrower. Material baskets/thresholds identified: Amount/threshold: $75,000,000; Builder / Available Amount construct referenced.",
    });
    const faithful = item({
      ...base,
      plainEnglish:
        "Section 2.05(b) operates as a conditional permission within the debt incurrence regime for Borrower. Material baskets/thresholds identified: Builder / Available Amount construct referenced.",
    });
    const absent = item({ ...base, plainEnglish: "" });

    const expected = parseFormulaFromItem(faithful);
    expect(expected.modelingStatus).toBe("KNOWN_NOT_MODELED");
    expect(expected.formulaType).not.toBe("BUILDER_BASKET");
    expect(parseFormulaFromItem(mutated)).toEqual(expected);
    expect(parseFormulaFromItem(absent)).toEqual(expected);
  });

  it("Probe C: a narration-carried corrupt figure never wins over the contract's own figure", () => {
    // The contract figure lives in the operative excerpt. The
    // narration carries the severed condition clip "$10,000,0…"
    // (the corpus specimen: a 160-char clip cut "$10,000,000"
    // mid-figure), which parses as $100,000 — a figure nowhere in
    // the contract. Narration preceded the excerpt in the old join,
    // so the corrupt figure was the first money match.
    const base = {
      sectionRef: "7.03(iv)",
      posture: "ENUMERATED_PERMISSION" as const,
      permissions: ["(iv) Guarantees of Indebtedness in respect of contingent liabilities of the Borrower and its Subsidiaries"],
      conditions: [
        "provided_that: provided, that the amount of contingent liabilities at any time shall be computed as the amount that, in light of all the facts and circumstances existing at such time, can reasonably be expected to become an actual or matured liability",
      ],
      materialBasketsThresholds: [],
      operativeLanguageExcerpt:
        "Guarantees of Indebtedness in respect of contingent liabilities; provided, that the aggregate amount of such Guarantees shall not exceed $10,000,000 at any time outstanding.",
    };
    const severed = item({
      ...base,
      plainEnglish:
        "Section 7.03(iv) is a general debt incurrence prohibition covering Borrower. Conditions/provisos signaled: provided_that: provided, that the amount of contingent liabilities shall not exceed $10,000,0…",
    });
    const faithful = item({
      ...base,
      plainEnglish: "Section 7.03(iv) is a general debt incurrence prohibition covering Borrower.",
    });
    const absent = item({ ...base, plainEnglish: "" });

    const expected = parseFormulaFromItem(faithful);
    expect(expected.modelingStatus).toBe("MODELED");
    expect(expected.formulaType).toBe("FLAT_AMOUNT");
    expect(expected.thresholdValue).toBe(10);
    expect(parseFormulaFromItem(severed)).toEqual(expected);
    expect(parseFormulaFromItem(severed).thresholdValue).not.toBe(0.1);
    expect(parseFormulaFromItem(absent)).toEqual(expected);
  });

  it("Conduit preserved: a cap that legitimately appears in a verbatim conditions clip still compiles", () => {
    // Before the fix this item compiled because narration
    // republished the condition; after the fix it compiles because
    // conditions are scanned explicitly. Same result, honest path.
    const base = {
      sectionRef: "7.02(f)",
      category: "RESTRICTED_PAYMENTS_INVESTMENTS" as const,
      posture: "CONDITIONAL_PERMISSION" as const,
      permissions: ["Investments in Unrestricted Subsidiaries, in each case subject to the conditions set forth in this clause (f)"],
      materialBasketsThresholds: [],
      operativeLanguageExcerpt:
        "The Borrower may make Investments in Unrestricted Subsidiaries, in each case subject to satisfaction of the conditions set forth in this clause (f).",
    };
    const withConditions = item({
      ...base,
      conditions: [
        "provided_that: provided, that the aggregate amount of all such Investments shall not exceed $15,000,000 at any time outstanding",
      ],
      plainEnglish:
        "Section 7.02(f) operates as a conditional permission. Conditions/provisos signaled: provided_that: provided, that the aggregate amount of all such Investments shall not exceed $15,000,000 at any time outstanding.",
    });
    const noNarration = item({ ...withConditions, plainEnglish: "" });
    const noConditions = item({ ...withConditions, conditions: [] });

    const compiled = parseFormulaFromItem(withConditions);
    expect(compiled.modelingStatus).toBe("MODELED");
    expect(compiled.formulaType).toBe("FLAT_AMOUNT");
    expect(compiled.thresholdValue).toBe(15);
    expect(parseFormulaFromItem(noNarration)).toEqual(compiled);
    // The conditions field is the conduit: remove it and the cap
    // is (correctly) no longer found anywhere in the scanned text.
    expect(parseFormulaFromItem(noConditions).modelingStatus).toBe("KNOWN_NOT_MODELED");
  });
});
