import type { Adjudication } from "./adjudication-types";

/**
 * §9 group 1 — the four source-proven benchmark defects, re-adjudicated against the
 * CORRECTED claim. §3 governs what each corrected claim must say.
 *
 * Materiality test used throughout (§10): a proposition is MATERIAL_INDEPENDENT when
 * losing it would change whether a transaction is permitted, or how much capacity
 * exists. A measurement, delivery or transitional convention attached to a proposition
 * already listed is a QUALIFIER and does not independently defeat completeness.
 */
export const ADJUDICATIONS_BENCHMARK_CHANGE: Adjudication[] = [
  {
    caseId: "CASE-e3520246bd",
    bucket: "READJUDICATION_REQUIRED_BENCHMARK_CHANGE",
    correctedGroundTruthClaim:
      "Unlimited (uncapped-dollar) Restricted Payments, permitted so long as no Event of Default exists and so long as the Total Rent Adjusted Net Leverage Ratio, calculated on a Pro Forma Basis, would not exceed 3.50:1.00 as of the last day of the most recently ended Test Period.",
    propositions: [
      {
        id: "P1",
        proposition: "The Borrower may make Restricted Payments in an uncapped dollar amount under this clause.",
        sourceQuotation: "“the Borrower may make Restricted Payments”",
        independence: "MATERIAL_INDEPENDENT",
        representedBy: "analyzer-rule:fwrg-2021-credit-agreement:23:Section6.04(a)(xi)",
        surfacedBy: [],
      },
      {
        id: "P2",
        proposition:
          "The permission is gated on the Total Rent Adjusted Net Leverage Ratio, calculated on a Pro Forma Basis, not exceeding 3.50:1.00.",
        sourceQuotation:
          "“so long as the Total Rent Adjusted Net Leverage Ratio, calculated on a Pro Forma Basis, would not exceed 3.50:1.00”",
        independence: "MATERIAL_INDEPENDENT",
        representedBy: "analyzer-rule:fwrg-2021-credit-agreement:23:Section6.04(a)(xi)",
        surfacedBy: [],
      },
      {
        id: "P3",
        proposition: "The permission is available only so long as no Event of Default exists.",
        sourceQuotation: "“(xi) so long as no Event of Default exists”",
        independence: "MATERIAL_INDEPENDENT",
        representedBy: "analyzer-rule:fwrg-2021-credit-agreement:23:Section6.04(a)(xi)",
        surfacedBy: [],
      },
      {
        id: "P4",
        proposition: "The ratio is measured as of the last day of the most recently ended Test Period.",
        sourceQuotation: "“as of the last day of the most recently ended Test Period”",
        independence: "QUALIFIER",
        representedBy: "analyzer-rule:fwrg-2021-credit-agreement:23:Section6.04(a)(xi)",
        surfacedBy: [],
      },
    ],
    candidatesCited: [
      "analyzer-rule:fwrg-2021-credit-agreement:23:Section6.04(a)(xi)",
      "discovery:discovery-candidate:f5e9943acaa199496176a56d",
    ],
    credit: "CREDIT",
    completeness: "FULL",
    compositeSurfacing: "NOT_APPLICABLE",
    dangerousSilentOmission: false,
    priorConsensus: { credit: "NO_CREDIT", surfacingBinary: "NOT_SPECIFICALLY_SURFACED", completeness: "NONE" },
    reasoning:
      "The single SUBSTANTIVE_REPRESENTATION at the claim's own address carries ruleType=RATIO_TEST, threshold 3.5, a RATIO_SATISFIED condition naming the Pro Forma Total Rent Adjusted Net Leverage Ratio at 3.50:1.00, and a NO_DEFAULT condition, with sufficiency=EXECUTABLE. Every material proposition of the CORRECTED claim is captured. Under the frozen benchmark the NO_DEFAULT condition read as an invented condition, because the benchmark affirmatively asserted the basket had “no default condition attached”; the primary source says the opposite. §3 is explicit that Headroom's NO_DEFAULT extraction is not to be classified as a system defect. This is the one credit flip in the corpus and it is caused entirely by the benchmark correction.",
  },
  {
    caseId: "CASE-9001417020",
    bucket: "READJUDICATION_REQUIRED_BENCHMARK_CHANGE",
    correctedGroundTruthClaim:
      "Restricted Debt Payments permitted so long as no Event of Default exists, in an aggregate amount not to exceed (A) the greater of $21,000,000 and 35% of Consolidated Adjusted EBITDA as of the last day of the most recently ended Test Period, plus (B) at the Borrower's election, the amount of Restricted Payments then permitted under Section 6.04(a)(x), with any amount so used reducing the amount available under Section 6.04(a)(x).",
    propositions: [
      {
        id: "P1",
        proposition:
          "Restricted Debt Payments are capped at the greater of $21,000,000 and 35% of Consolidated Adjusted EBITDA.",
        sourceQuotation: "“the greater of $21,000,000 and 35% of Consolidated Adjusted EBITDA”",
        independence: "MATERIAL_INDEPENDENT",
        representedBy: "analyzer-rule:fwrg-2021-credit-agreement:25:Section6.04(b)(iv)",
        surfacedBy: [],
      },
      {
        id: "P2",
        proposition:
          "At the Borrower's election the basket is increased by the amount then available under Section 6.04(a)(x), and any amount so used reduces the amount available under Section 6.04(a)(x).",
        sourceQuotation:
          "“any amount utilized ... shall result in a reduction in the amount available under Section 6.04(a)(x)”",
        independence: "MATERIAL_INDEPENDENT",
        representedBy: "analyzer-rule:fwrg-2021-credit-agreement:25:Section6.04(b)(iv)",
        surfacedBy: [],
      },
      {
        id: "P3",
        proposition: "The permission is available only so long as no Event of Default exists.",
        sourceQuotation: "“(iv) so long as no Event of Default exists, Restricted Debt Payments in an aggregate amount not to exceed (A) ...”",
        independence: "MATERIAL_INDEPENDENT",
        representedBy: "analyzer-rule:fwrg-2021-credit-agreement:25:Section6.04(b)(iv)",
        surfacedBy: [],
      },
    ],
    candidatesCited: [
      "analyzer-rule:fwrg-2021-credit-agreement:25:Section6.04(b)(iv)",
      "discovery:discovery-candidate:505b87080fada588cc2975be",
    ],
    credit: "CREDIT",
    completeness: "FULL",
    compositeSurfacing: "NOT_APPLICABLE",
    dangerousSilentOmission: false,
    priorConsensus: { credit: "CREDIT", surfacingBinary: "NOT_APPLICABLE", completeness: "FULL" },
    reasoning:
      "The representation carries threshold=21000000, formula=GREATER_OF_FLAT_OR_PCT_EBITDA, an explicit NO_DEFAULT condition, and prose naming the elective add-on and the corresponding reduction to Section 6.04(a)(x). The decision is unchanged, but the basis changes: the correction removes the risk that the source-confirmed NO_DEFAULT gate would be scored as an invented condition.",
  },
  {
    caseId: "CASE-a898053843",
    bucket: "READJUDICATION_REQUIRED_BENCHMARK_CHANGE",
    correctedGroundTruthClaim:
      "A Loan Party and any Subsidiary of a Loan Party may sell or otherwise dispose of any of its other assets, provided that (i) to the extent the disposition involves ABL Priority Collateral, the Borrowers shall have delivered, concurrently with or prior to the disposition, a new Borrowing Base Certificate demonstrating compliance with Section 2.01(a), (ii) the assets are sold for Fair Market Value, and (iii) the aggregate Fair Market Value of all assets sold in any fiscal year under Section 6.04(a) does not exceed the greater of $10,000,000 and 1.0% of the total consolidated assets of the Loan Parties and their Subsidiaries. The ABL Priority Collateral condition scopes the Borrowing Base Certificate requirement only; it does not scope the basket.",
    propositions: [
      {
        id: "P1",
        proposition:
          "A Loan Party and any Subsidiary of a Loan Party may sell or otherwise dispose of any of its other assets (a general disposal permission, not one limited to a collateral type).",
        sourceQuotation:
          "“(a) a Loan Party and any Subsidiary of a Loan Party may sell or otherwise dispose of any of its other assets, provided that”",
        independence: "MATERIAL_INDEPENDENT",
        representedBy: "compiler-rule:lsb-2023-abl-credit-agreement:5:Section6.04(a)",
        surfacedBy: [],
      },
      {
        id: "P2",
        proposition:
          "Aggregate Fair Market Value of assets sold in any fiscal year under this clause may not exceed the greater of $10,000,000 and 1.0% of total consolidated assets.",
        sourceQuotation: "“the greater of $10,000,000 and 1.0% of the total consolidated assets”",
        independence: "MATERIAL_INDEPENDENT",
        representedBy: "compiler-rule:lsb-2023-abl-credit-agreement:5:Section6.04(a)",
        surfacedBy: [],
      },
      {
        id: "P3",
        proposition: "The assets must be sold for Fair Market Value.",
        sourceQuotation: "“sold for Fair Market Value”",
        independence: "MATERIAL_INDEPENDENT",
        representedBy: "compiler-rule:lsb-2023-abl-credit-agreement:5:Section6.04(a)",
        surfacedBy: [],
      },
      {
        id: "P4",
        proposition:
          "A new Borrowing Base Certificate demonstrating compliance with Section 2.01(a) must be delivered concurrently with or prior to the disposition.",
        sourceQuotation:
          "“delivered a new Borrowing Base Certificate (giving effect to such disposition ...) demonstrating compliance with Section 2.01(a)”",
        independence: "MATERIAL_INDEPENDENT",
        representedBy: "compiler-rule:lsb-2023-abl-credit-agreement:5:Section6.04(a)",
        surfacedBy: [],
      },
      {
        id: "P5",
        proposition:
          "The Borrowing Base Certificate requirement applies only to the extent the disposition involves ABL Priority Collateral; it is a conditional branch, not the scope of the basket.",
        sourceQuotation: "“to the extent such disposition involves ABL Priority Collateral”",
        independence: "MATERIAL_INDEPENDENT",
        representedBy: "compiler-rule:lsb-2023-abl-credit-agreement:5:Section6.04(a)",
        surfacedBy: [],
      },
    ],
    candidatesCited: [
      "compiler-rule:lsb-2023-abl-credit-agreement:5:Section6.04(a)",
      "discovery:discovery-candidate:e79fa4f952a500410c504b81",
      "discovery:discovery-candidate:8523d2aeab25a40630654f51",
    ],
    credit: "CREDIT",
    completeness: "FULL",
    compositeSurfacing: "NOT_APPLICABLE",
    dangerousSilentOmission: false,
    priorConsensus: { credit: "CREDIT", surfacingBinary: "NOT_APPLICABLE", completeness: "FULL" },
    reasoning:
      "Headroom modelled §6.04(a) as a general SELL_ASSET permission with the ABL Priority Collateral requirement expressed as a conditional OTHER_RULE_SATISFIED branch — which is what the source says, and what the frozen benchmark denied. The decision is unchanged but the grounds invert: the system was right where the benchmark was wrong, and §10's rule that a source-confirmed condition must not be penalised because the old benchmark omitted it applies in reverse here — a correct general scope must not be penalised because the old benchmark narrowed it.",
  },
  {
    caseId: "CASE-1284ab8e71",
    bucket: "READJUDICATION_REQUIRED_BENCHMARK_CHANGE",
    correctedGroundTruthClaim:
      "Section 6.08(a) prohibits payments in respect of Indebtedness (other than Indebtedness in respect of the Secured Notes) except for six enumerated carve-outs: (i) payments in respect of the Secured Obligations; (ii) scheduled principal, interest and other required amounts on Indebtedness permitted under Section 6.01, other than Subordinated Indebtedness; (iii) payments resulting from a refinancing permitted by Section 6.01(d); (iv) payments of Subordinated Indebtedness to the extent its own subordination terms permit; (v) payments to the extent the Payment Conditions are satisfied; and (vi) payments not exceeding $500,000 in the aggregate in any fiscal year, available only where no other clause of Section 6.08(a) would permit the payment at the time. Section 6.08(b) separately prohibits amendments to Subordinated Indebtedness terms materially adverse to the Administrative Agent or the Lenders, as determined by the Administrative Agent in its Permitted Discretion.",
    propositions: [
      {
        id: "P1",
        proposition:
          "General prohibition on making any payment in respect of Indebtedness other than Indebtedness in respect of the Secured Notes.",
        sourceQuotation:
          "“(a) Make any payment in respect of Indebtedness (other than Indebtedness in respect of the Secured Notes), except the following payments of Indebtedness shall be permitted:”",
        independence: "MATERIAL_INDEPENDENT",
        representedBy: "compiler-rule:lsb-2023-abl-credit-agreement:7:Section6.08(a)",
        surfacedBy: [],
      },
      {
        id: "P2",
        proposition: "Carve-out (i): payments in respect of the Secured Obligations are permitted.",
        sourceQuotation: "“(i) payments in respect of the Secured Obligations;”",
        independence: "MATERIAL_INDEPENDENT",
        representedBy: null,
        surfacedBy: [],
      },
      {
        id: "P3",
        proposition:
          "Carve-out (ii): scheduled principal, interest and other required amounts on Indebtedness permitted under Section 6.01, other than Subordinated Indebtedness, are permitted.",
        sourceQuotation:
          "“(ii) scheduled payments of principal and interest, and payment of any other amount, in each case to the extent such payment is required pursuant to the terms of any Indebtedness permitted under Section 6.01, other than Subordinated Indebtedness”",
        independence: "MATERIAL_INDEPENDENT",
        representedBy: null,
        surfacedBy: [],
      },
      {
        id: "P4",
        proposition: "Carve-out (iii): payments resulting from a refinancing permitted by Section 6.01(d) are permitted.",
        sourceQuotation: "“(iii) payments of Indebtedness as a result of any refinancing of Indebtedness permitted by Section 6.01(d);”",
        independence: "MATERIAL_INDEPENDENT",
        representedBy: null,
        surfacedBy: [],
      },
      {
        id: "P5",
        proposition:
          "Carve-out (iv): payments of Subordinated Indebtedness are permitted only to the extent permitted by its own terms or its subordination agreement.",
        sourceQuotation:
          "“(iv) payments of Subordinated Indebtedness to the extent permitted in accordance with the terms of such Subordinated Indebtedness or any agreement with respect thereto governing the subordination thereof;”",
        independence: "MATERIAL_INDEPENDENT",
        representedBy: null,
        surfacedBy: [],
      },
      {
        id: "P6",
        proposition: "Carve-out (v): payments are permitted to the extent the Payment Conditions are satisfied.",
        sourceQuotation: "“(v) payments of Indebtedness to the extent the Payment Conditions are satisfied; and”",
        independence: "MATERIAL_INDEPENDENT",
        representedBy: null,
        surfacedBy: ["discovery:discovery-candidate:67064d13c52b6ff4d62fefa3"],
      },
      {
        id: "P7",
        proposition: "Carve-out (vi): payments of Indebtedness not exceeding $500,000 in the aggregate in any fiscal year are permitted.",
        sourceQuotation: "“(vi) payments of Indebtedness not to exceed $500,000 in the aggregate in any fiscal year of the Loan Parties”",
        independence: "MATERIAL_INDEPENDENT",
        representedBy: null,
        surfacedBy: [],
      },
      {
        id: "P8",
        proposition:
          "Anti-stacking proviso: a payment under clause (vi) is permitted only if it would not, at the time, be permitted under any other clause of Section 6.08(a).",
        sourceQuotation:
          "“it being understood and agreed that any payment of Indebtedness made pursuant this clause (vi) shall only be permitted if such payment would not, at the time thereof, be permitted (or be able to be made) under any other clause of this Section 6.08(a)”",
        independence: "MATERIAL_INDEPENDENT",
        representedBy: null,
        surfacedBy: [],
      },
      {
        id: "P9",
        proposition:
          "Section 6.08(b) prohibits amending the terms of any document evidencing Subordinated Indebtedness in a manner materially adverse to the Administrative Agent or the Lenders, as determined by the Administrative Agent in its Permitted Discretion.",
        sourceQuotation:
          "“(b) No Loan Party shall amend, modify, alter, or change any of the terms or conditions of any agreement, instrument, document, indenture, or other writing evidencing or concerning Subordinated Indebtedness if such amendment, modification, alteration or change would be materially adverse to the Administrative Agent or the Lenders”",
        independence: "MATERIAL_INDEPENDENT",
        representedBy: null,
        surfacedBy: [],
      },
    ],
    candidatesCited: [
      "compiler-rule:lsb-2023-abl-credit-agreement:7:Section6.08(a)",
      "discovery:discovery-candidate:67064d13c52b6ff4d62fefa3",
      "discovery:discovery-candidate:cea37d84cffe6e2e218270d9",
      "discovery:discovery-candidate:0aedf65770c4567350dba903",
      "discovery:discovery-candidate:7cf5d8bf8b51cb8a788e95e6",
    ],
    credit: "NO_CREDIT",
    completeness: "PARTIAL",
    compositeSurfacing: "PARTIALLY_SURFACED",
    dangerousSilentOmission: true,
    priorConsensus: { credit: "NO_CREDIT", surfacingBinary: "SPECIFICALLY_SURFACED", completeness: "FULL" },
    reasoning:
      "The only SUBSTANTIVE_REPRESENTATION captures P1 and then points at the exceptions (“exception: See permitted payments (i)-(vi) of Section 6.08(a)”). §10 is explicit that a general pointer to enumerated exceptions does not represent each independently gated exception where losing the gates would alter transaction permission — and P6 (Payment Conditions), P7/P8 ($500,000 subject to anti-stacking) and P5 (subordination terms) each change what may be paid. P9 exists only as an INVENTORY_ONLY discovery candidate, which §10 forbids from supplying a missing substantive atom. For surfacing, the only claim-specific flag that names a gap proposition is the NEEDS_REVIEW flag on 6.08(a)(v), which surfaces P6. The section-level 6.08 container flag sits at the claim's own address but its own text declares its scope to be “the section's own general/chapeau language” — that is P1, which is already represented — so under §10's address-versus-scope rule it does not surface P2–P5 or P7–P9. One gap proposition surfaced, seven not: PARTIALLY_SURFACED.",
  },
];
