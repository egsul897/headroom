import type { Adjudication } from "./adjudication-types";

/**
 * §7 bucket 5 — rubric dependency.
 *
 * Every case whose prior adjudication said SPECIFICALLY_SURFACED was screened, because
 * the AMB-1 resolution can only ever demote: a case already at NOT_SPECIFICALLY_SURFACED
 * cannot fall further, and a CREDIT case is NOT_APPLICABLE. Twenty-one cases carried
 * SPECIFICALLY_SURFACED. Nine were already in the benchmark-change, evidence-repair or
 * source-resolution buckets. Of the remaining twelve, eight have a claim-specific flag
 * whose own text covers the whole unit (or whose descendant flags collectively tile every
 * material proposition) and stay valid; four do not, and are re-adjudicated here together
 * with the three the frozen evaluator's own V3.1 delta had already identified.
 */
export const ADJUDICATIONS_RUBRIC_DEPENDENCY: Adjudication[] = [
  {
    caseId: "CASE-2034884b7a",
    bucket: "READJUDICATION_REQUIRED_RUBRIC_DEPENDENCY",
    correctedGroundTruthClaim: null,
    propositions: [
      {
        id: "P1",
        proposition: "Prohibition on merger, consolidation or reclassification of stock.",
        sourceQuotation: "“SECTION 6.04 ... (a) merge into or consolidate with any other Person, or permit any other Person to merge into or consolidate with it, or reclassify its stock”",
        independence: "MATERIAL_INDEPENDENT",
        representedBy: null,
        surfacedBy: ["compiler-rule:lsb-2023-abl-credit-agreement:4:Section6.03(a)"],
      },
      {
        id: "P2",
        proposition: "Prohibition on liquidation or dissolution, subject to a good-faith carve-out for a non-Loan-Party Subsidiary whose assets transfer to a Loan Party.",
        sourceQuotation: "“(b) liquidate or dissolve”, with the Borrower Representative good-faith carve-out",
        independence: "MATERIAL_INDEPENDENT",
        representedBy: null,
        surfacedBy: ["discovery:discovery-candidate:9b17a56d58808b2c60885829"],
      },
      {
        id: "P3",
        proposition: "Prohibition on the sale of all or substantially all of the assets of a Loan Party.",
        sourceQuotation: "“(c) ... sell ... all or substantially all of the assets”",
        independence: "MATERIAL_INDEPENDENT",
        representedBy: null,
        surfacedBy: [],
      },
    ],
    candidatesCited: [
      "compiler-rule:lsb-2023-abl-credit-agreement:4:Section6.03(a)",
      "discovery:discovery-candidate:9b17a56d58808b2c60885829",
      "discovery:discovery-candidate:94b354aa0aa621e0de76a529",
    ],
    credit: "NO_CREDIT",
    completeness: "NONE",
    compositeSurfacing: "PARTIALLY_SURFACED",
    dangerousSilentOmission: true,
    priorConsensus: { credit: "NO_CREDIT", surfacingBinary: "SPECIFICALLY_SURFACED", completeness: "FULL" },
    reasoning:
      "The two SUBSTANTIVE_REPRESENTATIONs in the pool are at Section 6.01(i) and Section 6.04(a) — different claims — so nothing represents this one. The HONEST_UNRESOLVED compiled rule at Section 6.03(a) declares “VERIFICATION_FAILED: cited section ‘Section 6.03(a)’ not found verbatim in source text”, which surfaces P1. The discovery SAFETY_FLAG sits at the claim's own address 6.03, but its own text describes only the good-faith liquidation carve-out, so under §10's address-versus-scope rule it surfaces P2 and not the rest. Nothing surfaces P3, the all-or-substantially-all asset sale limb. This is the case the frozen evaluator's own V3.1 delta already flagged as the AMB-1 shape in the LSB dataset.",
  },
  {
    caseId: "CASE-5ac1cd56ef",
    bucket: "READJUDICATION_REQUIRED_RUBRIC_DEPENDENCY",
    correctedGroundTruthClaim: null,
    propositions: [
      {
        id: "P1",
        proposition:
          "No Loan Party will enter into, incur or permit to exist any agreement prohibiting, restricting or conditioning the ability of a Loan Party or Restricted Subsidiary to create, incur or permit to exist any Lien upon its property.",
        sourceQuotation:
          "“(a) the ability of such Loan Party or any Restricted Subsidiary to create, incur or permit to exist any Lien upon any of its property”",
        independence: "MATERIAL_INDEPENDENT",
        representedBy: null,
        surfacedBy: ["coverage-unit:d39baa122dbbfca52dabc030a9c6d86430cb373a727ce3207a3a121d6f7bbf54"],
      },
      {
        id: "P2",
        proposition:
          "The same prohibition applies to any agreement restricting the ability of a Restricted Subsidiary to pay dividends or distributions on its Equity Interests, make or repay loans or advances to a Borrower or Restricted Subsidiary, or Guarantee Indebtedness of a Borrower or Restricted Subsidiary.",
        sourceQuotation:
          "“(b) the ability of any Restricted Subsidiary to pay dividends or other distributions with respect to any Equity Interest”, and the loan/advance and Guarantee limbs that follow",
        independence: "MATERIAL_INDEPENDENT",
        representedBy: null,
        surfacedBy: [
          "coverage-unit:c08f07c17673a0fe6111470ff2d58d1e7e7bd94d6e6d202774386497b0997188",
          "coverage-unit:4947a0fbba5cdb6656ff38e3438b10b9cfb035de7cfc8b9c4ffc4d76531df4e8",
          "coverage-unit:85ac5d16c7dcddfd734a9ba131e08f10375786699e7cfb3c84acc9b35c797372",
        ],
      },
    ],
    candidatesCited: [
      "coverage-unit:d39baa122dbbfca52dabc030a9c6d86430cb373a727ce3207a3a121d6f7bbf54",
      "coverage-unit:c08f07c17673a0fe6111470ff2d58d1e7e7bd94d6e6d202774386497b0997188",
      "coverage-unit:061997e0bde697724fde2e789106910a500c8517e5713fcb8460e1963c24d4a9",
      "coverage-unit:f953585b4489cab978d09e0552da751f311b2c7d5b18926ce39bd02760f2b27b",
    ],
    credit: "NO_CREDIT",
    completeness: "NONE",
    compositeSurfacing: "FULLY_SURFACED",
    dangerousSilentOmission: false,
    priorConsensus: { credit: "NO_CREDIT", surfacingBinary: "SPECIFICALLY_SURFACED", completeness: "FULL" },
    reasoning:
      "No SUBSTANTIVE_REPRESENTATION, so NO_CREDIT. Every claim-specific flag is anchored at a strict descendant — 6.10(a), 6.10(b), 6.10(b)(i), 6.10(b)(i)(a) — and the frozen evaluator's V3.1 structural rule therefore demoted this case to PARTIALLY_SURFACED. The explicit atomic decomposition reaches the opposite answer and V3.1 says the decomposition takes precedence: the claim has exactly two material propositions, limb (a) and limb (b), and the descendant flags cover BOTH, quoting each limb's own operative words. When the descendants collectively tile the claim, nothing is left unwarned. Recorded deliberately as a promotion, in a mission whose other rubric-dependency findings all demote, so that the decomposition rule is visibly not being applied in one direction only.",
  },
  {
    caseId: "CASE-e008d4278a",
    bucket: "READJUDICATION_REQUIRED_RUBRIC_DEPENDENCY",
    correctedGroundTruthClaim: null,
    propositions: [
      {
        id: "P1",
        proposition:
          "No Loan Party will, nor will it permit any Restricted Subsidiary to, form any subsidiary after the Effective Date, or purchase, hold or acquire Equity Interests, evidences of indebtedness or other securities of, make or permit loans or advances to, Guarantee obligations of, or make any investment or other interest in, any other Person, or acquire assets of another Person constituting a business unit.",
        sourceQuotation:
          "“SECTION 6.04. Investments, Loans, Advances, Guarantees and Acquisitions . No Loan Party will, nor will it permit any Restricted Subsidiary to, form any subsidiary after the Effective Date, or purchase, hold or acquire ...”",
        independence: "MATERIAL_INDEPENDENT",
        representedBy: null,
        surfacedBy: ["coverage-unit:cb696c3159ae21e95d4a848b809c03ffecdb91374dfbfefe5802c2975afd6583"],
      },
      {
        id: "P2",
        proposition: "The prohibition is subject to the exceptions enumerated in clauses (a) through (r).",
        sourceQuotation: "clauses (a) through (r) of Section 6.04, enumerated in the operative span",
        independence: "MATERIAL_INDEPENDENT",
        representedBy: null,
        surfacedBy: ["coverage-unit:cb696c3159ae21e95d4a848b809c03ffecdb91374dfbfefe5802c2975afd6583"],
      },
    ],
    candidatesCited: [
      "coverage-unit:cb696c3159ae21e95d4a848b809c03ffecdb91374dfbfefe5802c2975afd6583",
      "discovery:discovery-candidate:c38a45beaaba2ac934b40009",
      "discovery:discovery-candidate:94c7975a2964f042d65cd824",
    ],
    credit: "NO_CREDIT",
    completeness: "NONE",
    compositeSurfacing: "FULLY_SURFACED",
    dangerousSilentOmission: false,
    priorConsensus: { credit: "NO_CREDIT", surfacingBinary: "SPECIFICALLY_SURFACED", completeness: "FULL" },
    reasoning:
      "No SUBSTANTIVE_REPRESENTATION. A HONEST_UNRESOLVED coverage unit is anchored at the claim's own address 6.04 and its own text is the section heading and chapeau (“Investments, Loans, Advances, Guarantees and Acquisitions . No Loan Party will, nor will it permit any Restricted”) with coverageState=SOURCE_CONTEXT_INCOMPLETE and “a candidate was discovered for this unit's region but never compiled to IR”. That is a whole-unit declaration and it covers both propositions. As with CASE-5a66cad386, the frozen evaluator's V3.1 projection demoted this case because the only flag reaching its surfacedAsUnsafeBy list was a descendant at 6.04(2); the decomposition, which takes precedence, does not.",
  },
  {
    caseId: "CASE-b2658c02e7",
    bucket: "READJUDICATION_REQUIRED_RUBRIC_DEPENDENCY",
    correctedGroundTruthClaim: null,
    propositions: [
      {
        id: "P1",
        proposition:
          "Consolidated Senior Secured Leverage Ratio may not exceed 3.75 to 1.00, with a 0.50 step-up available on a Material Acquisition, usable at most twice and not in consecutive election periods.",
        sourceQuotation: "Section 7.1(a) of the CONMED Eighth A&R, “3.75 to 1.00” with the “0.50 to 1.00” Material Acquisition step-up",
        independence: "MATERIAL_INDEPENDENT",
        representedBy: null,
        surfacedBy: [],
      },
      {
        id: "P2",
        proposition:
          "Consolidated Total Leverage Ratio may not exceed 5.50 to 1.00, with the same step-up mechanic capped at 6.00 to 1.00.",
        sourceQuotation: "Section 7.1(b), “5.50 to 1.00” capped at “6.00 to 1.00”",
        independence: "MATERIAL_INDEPENDENT",
        representedBy: null,
        surfacedBy: [
          "audit-finding:93ae2fdb4c380a95718f63771e250fd0807480234cfe53c1e7582e24c20f228e",
          "audit-finding:ff3d243e928756b0008f5187a5ee5cd804a4af47d0c31e5fb29062e5972c2c78",
          "audit-finding:28f3e279e55f31f55a32f8ec8dd75afae276834195819b20177dac57d26839ed",
        ],
      },
      {
        id: "P3",
        proposition: "Interest Coverage Ratio may not be less than 2.75 to 1.00.",
        sourceQuotation: "Section 7.1(c), “2.75 to 1.00”",
        independence: "MATERIAL_INDEPENDENT",
        representedBy: null,
        surfacedBy: [],
      },
      {
        id: "P4",
        proposition:
          "A springing Liquidity covenant of $75,000,000 plus Early Maturing Debt applies from the date 91 days before the earliest Convertible Notes maturity, and only where Early Maturing Debt exceeds $200,000,000.",
        sourceQuotation: "Section 7.1(d), “$75,000,000” plus Early Maturing Debt, “91 days”, “$200,000,000”",
        independence: "MATERIAL_INDEPENDENT",
        representedBy: null,
        surfacedBy: [
          "discovery:discovery-candidate:1b08da2e952127a1caebe77d",
          "discovery:discovery-candidate:e37352369564a1e784e0560b",
          "audit-finding:23392dbf53988f1c3057b7e0b43a49d2f1e9453768074915874128ad2f1d1ca7",
          "audit-finding:9df55010bedf2cd1f00a3c89d264a10d684a7abe64966d60526a07915be0741d",
        ],
      },
    ],
    candidatesCited: [
      "discovery:discovery-candidate:1b08da2e952127a1caebe77d",
      "discovery:discovery-candidate:e37352369564a1e784e0560b",
      "audit-finding:23392dbf53988f1c3057b7e0b43a49d2f1e9453768074915874128ad2f1d1ca7",
      "audit-finding:28f3e279e55f31f55a32f8ec8dd75afae276834195819b20177dac57d26839ed",
      "audit-finding:93ae2fdb4c380a95718f63771e250fd0807480234cfe53c1e7582e24c20f228e",
      "audit-finding:9df55010bedf2cd1f00a3c89d264a10d684a7abe64966d60526a07915be0741d",
      "audit-finding:ff3d243e928756b0008f5187a5ee5cd804a4af47d0c31e5fb29062e5972c2c78",
    ],
    credit: "NO_CREDIT",
    completeness: "NONE",
    compositeSurfacing: "PARTIALLY_SURFACED",
    dangerousSilentOmission: true,
    priorConsensus: { credit: "NO_CREDIT", surfacingBinary: "SPECIFICALLY_SURFACED", completeness: "PARTIAL" },
    reasoning:
      "This is the exact scenario V3.1's own worked example describes. No SUBSTANTIVE_REPRESENTATION exists for any of the four maintenance covenants. Six flags are anchored at strict descendants — four at 7.1(d) or 7.1(d)(i) and two at 7.1(b) or 7.1(b)(ii) — so the springing Liquidity covenant and the Total Leverage covenant are specifically surfaced. The one flag at the claim's own address 7.1 says in its own words that it “Sets forth the two components (fixed $75,000,000 amount plus outstanding Early Maturing Debt) that together comprise the minimum Liquidity threshold in clause (d)” — content that is plainly clause (d)-scoped, which §10 says does not get whole-claim effect from the parent address. The Senior Secured Leverage covenant at 3.75x and the Interest Coverage covenant at 2.75x carry no warning at all. Two of four material covenants are dangerously silent.",
  },
  {
    caseId: "CASE-579c5d3f33",
    bucket: "READJUDICATION_REQUIRED_RUBRIC_DEPENDENCY",
    correctedGroundTruthClaim: null,
    propositions: [
      {
        id: "P1",
        proposition:
          "Transactions with Affiliates involving more than $2,500,000 must be on terms no less favourable than those obtainable in a comparable arm's-length transaction.",
        sourceQuotation: "Section 7.10 of the CONMED Eighth A&R, fair-and-reasonable-terms requirement, “$2,500,000”",
        independence: "MATERIAL_INDEPENDENT",
        representedBy: null,
        surfacedBy: [],
      },
      {
        id: "P2",
        proposition:
          "The requirement is subject to enumerated carve-outs for ordinary-course transactions, cost allocations, tax arrangements and the Receivables Program.",
        sourceQuotation: "the enumerated exceptions of Section 7.10, including the clause (v) Investment limitation",
        independence: "MATERIAL_INDEPENDENT",
        representedBy: null,
        surfacedBy: [
          "discovery:discovery-candidate:176ac085bab5c6de92914f92",
          "audit-finding:8af7ea5e1740c12ae545a735bf40ff367a607055e4944f3d92e9c5b4bdb3bbfa",
        ],
      },
    ],
    candidatesCited: [
      "discovery:discovery-candidate:176ac085bab5c6de92914f92",
      "audit-finding:8af7ea5e1740c12ae545a735bf40ff367a607055e4944f3d92e9c5b4bdb3bbfa",
    ],
    credit: "NO_CREDIT",
    completeness: "NONE",
    compositeSurfacing: "PARTIALLY_SURFACED",
    dangerousSilentOmission: true,
    priorConsensus: { credit: "NO_CREDIT", surfacingBinary: "SPECIFICALLY_SURFACED", completeness: "PARTIAL" },
    reasoning:
      "No SUBSTANTIVE_REPRESENTATION. The flag at the claim's own address 7.10 describes itself as a “Carve-out limiting the (v) exception so it does not cover an Investment not specifically contemplated by Section 7.8”, and the descendant flag at 7.10(b)(i) reports that six enumerated items were not separated by the structural parser. Both are about the carve-out set, so P2 is surfaced. Nothing warns that the operative arm's-length requirement and its $2,500,000 trigger — the economic substance of the covenant — are unrepresented.",
  },
  {
    caseId: "CASE-963cc44044",
    bucket: "READJUDICATION_REQUIRED_RUBRIC_DEPENDENCY",
    correctedGroundTruthClaim: null,
    propositions: [
      {
        id: "P1",
        proposition:
          "Prohibition on consensual restrictions on a Subsidiary's ability to pay dividends or make other distributions in respect of its Capital Stock.",
        sourceQuotation: "“(a) pay dividends or make any other distributions in respect of any Capital Stock of such Subsidiary”",
        independence: "MATERIAL_INDEPENDENT",
        representedBy: null,
        surfacedBy: ["discovery:discovery-candidate:53e4ea586b2732863f2d4c10"],
      },
      {
        id: "P2",
        proposition:
          "Prohibition on consensual restrictions on a Subsidiary's ability to make loans, advances or other Investments in the Parent Borrower or another Subsidiary.",
        sourceQuotation: "the second prohibited restriction type of Section 7.14",
        independence: "MATERIAL_INDEPENDENT",
        representedBy: null,
        surfacedBy: ["discovery:discovery-candidate:6d475ada38fa539312598179"],
      },
      {
        id: "P3",
        proposition:
          "Prohibition on consensual restrictions on a Subsidiary's ability to transfer assets to the Parent Borrower or another Subsidiary.",
        sourceQuotation: "the asset-transfer limb of Section 7.14",
        independence: "MATERIAL_INDEPENDENT",
        representedBy: null,
        surfacedBy: [],
      },
      {
        id: "P4",
        proposition:
          "The prohibition is subject to carve-outs for the Loan Documents, agreements governing a permitted Disposition, and the Receivables Program.",
        sourceQuotation: "the enumerated carve-outs of Section 7.14",
        independence: "MATERIAL_INDEPENDENT",
        representedBy: null,
        surfacedBy: [],
      },
    ],
    candidatesCited: [
      "discovery:discovery-candidate:53e4ea586b2732863f2d4c10",
      "discovery:discovery-candidate:6d475ada38fa539312598179",
    ],
    credit: "NO_CREDIT",
    completeness: "NONE",
    compositeSurfacing: "PARTIALLY_SURFACED",
    dangerousSilentOmission: true,
    priorConsensus: { credit: "NO_CREDIT", surfacingBinary: "SPECIFICALLY_SURFACED", completeness: "PARTIAL" },
    reasoning:
      "No SUBSTANTIVE_REPRESENTATION. The descendant flag at 7.14(a) carries the dividend limb verbatim and surfaces P1. The flag at the claim's own address 7.14 describes itself as identifying “the second prohibited type of restriction” — limb-scoped content under a parent address — and surfaces P2. The asset-transfer limb and the carve-out set carry no warning.",
  },
  {
    caseId: "CASE-166617b06a",
    bucket: "READJUDICATION_REQUIRED_RUBRIC_DEPENDENCY",
    correctedGroundTruthClaim: null,
    propositions: [
      {
        id: "P1",
        proposition:
          "On the Effective Date the Existing Credit Agreement is amended, superseded and restated in its entirety by this Agreement, and this is expressly not a novation.",
        sourceQuotation:
          "“Effective on the Effective Date, the terms and provisions of the Existing Credit Agreement are amended, superseded and restated in their entirety by this Agreement”",
        independence: "MATERIAL_INDEPENDENT",
        representedBy: "ir-rule:ir-rule:4f30a13212fd33c21d641317",
        surfacedBy: [],
      },
      {
        id: "P2",
        proposition:
          "Existing liens, guarantees and obligations outstanding on the Effective Date continue and are re-evidenced under this Agreement.",
        sourceQuotation:
          "“any deeds of trust, mortgages, liens, security interests or contractual or legal rights securing” the Existing Credit Agreement obligations",
        independence: "MATERIAL_INDEPENDENT",
        representedBy: "ir-rule:ir-rule:1eee93e6374572f5d91daab8",
        surfacedBy: [
          "coverage-unit:64fb566abb3a1d75688e51a9e9bade982e00cecfc08b27bd61701dd46ab25e32",
          "coverage-unit:1a44c60cbc0384a18597bed5c79f3a71e1fd9c5f4dd7afa9dd1e76a16eb6f266",
          "coverage-unit:fdfba63ff43e31d747e5c8d001444cce721f65718552d7dc92d1299402ec39f7",
        ],
      },
      {
        id: "P3",
        proposition:
          "“Commitments” under the Existing Credit Agreement continue as Revolving Commitments under this Agreement.",
        sourceQuotation: "Section 1.11(b) of the doc-a 2022 A&R, continuation of Existing Credit Agreement Commitments as Revolving Commitments",
        independence: "MATERIAL_INDEPENDENT",
        representedBy: null,
        surfacedBy: [],
      },
      {
        id: "P4",
        proposition:
          "The Administrative Agent may effect reallocations, sales and assignments among Lenders so that each Lender's Credit Exposure reflects its Applicable Percentage on the Effective Date, without payment of any assignment fee.",
        sourceQuotation:
          "“the reallocation, sales and assignments are deemed effected by way of, and subject to the terms and conditions of, Assignment and Assumptions, without payment of any related assignment fee”",
        independence: "MATERIAL_INDEPENDENT",
        representedBy: null,
        surfacedBy: [
          "ir-rule:ir-rule:5ac07e3b86e39b1c198c590a",
          "ir-rule:ir-rule:6889a4813012716f6b69cb3b",
          "ir-rule:ir-rule:b1313b242ee5eadda4d8ed71",
          "coverage-unit:766cb495f52e9f933d6913e8d10001f68f08f7a1065cda3c0866916ed4a60f65",
        ],
      },
      {
        id: "P5",
        proposition:
          "Accrued interest and fees under the Existing Credit Agreement, plus break costs, are payable on the Effective Date.",
        sourceQuotation: "Section 1.11(b) of the doc-a 2022 A&R, accrued interest, fees and break funding amounts payable on the Effective Date",
        independence: "MATERIAL_INDEPENDENT",
        representedBy: null,
        surfacedBy: [],
      },
      {
        id: "P6",
        proposition: "Each Loan Party ratifies and reaffirms its prior guarantees and Lien grants.",
        sourceQuotation: "Section 1.11 of the doc-a 2022 A&R, ratification and reaffirmation by each Loan Party",
        independence: "MATERIAL_INDEPENDENT",
        representedBy: null,
        surfacedBy: [],
      },
    ],
    candidatesCited: [
      "ir-rule:ir-rule:4f30a13212fd33c21d641317",
      "ir-rule:ir-rule:1eee93e6374572f5d91daab8",
      "ir-rule:ir-rule:3ec755027950ed6ff173ab8f",
      "ir-rule:ir-rule:5ac07e3b86e39b1c198c590a",
      "ir-rule:ir-rule:6889a4813012716f6b69cb3b",
      "ir-rule:ir-rule:b1313b242ee5eadda4d8ed71",
      "coverage-unit:64fb566abb3a1d75688e51a9e9bade982e00cecfc08b27bd61701dd46ab25e32",
      "discovery:discovery-candidate:2b735814977763255f1563c0",
    ],
    credit: "NO_CREDIT",
    completeness: "PARTIAL",
    compositeSurfacing: "PARTIALLY_SURFACED",
    dangerousSilentOmission: true,
    priorConsensus: { credit: "NO_CREDIT", surfacingBinary: "SPECIFICALLY_SURFACED", completeness: "PARTIAL" },
    reasoning:
      "Six SUBSTANTIVE_REPRESENTATIONs sit at 1.11(a) and one at 1.11(b)(i). Between them they carry P1 and P2, so completeness is PARTIAL rather than NONE and credit stays NO_CREDIT because four material propositions are unrepresented. Of those four, P4 is specifically surfaced by a cluster of HONEST_UNRESOLVED rules at 1.11(b)(iv) that quote the reallocation and no-assignment-fee language directly. P3, P5 and P6 — the continuation of Commitments as Revolving Commitments, the Effective-Date payment of accrued interest, fees and break costs, and each Loan Party's ratification and reaffirmation — are neither represented nor warned. A scan of the whole 60-candidate pool for “Revolving Commitment”, “accrued interest”, “break”, “ratif” and “reaffirm” returns nothing anchored to this claim.",
  },
];
