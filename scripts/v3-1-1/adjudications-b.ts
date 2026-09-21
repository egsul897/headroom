import type { Adjudication } from "./adjudication-types";

/** §9 group 2 — the evidence repairs, re-adjudicated on the repaired excerpt. */
export const ADJUDICATIONS_EVIDENCE_REPAIR: Adjudication[] = [
  {
    caseId: "CASE-2aa00d5566",
    bucket: "READJUDICATION_REQUIRED_EVIDENCE_REPAIR",
    correctedGroundTruthClaim: null,
    propositions: [
      {
        id: "P1",
        proposition:
          "No Loan Party will, nor will it permit any Restricted Subsidiary to, create, incur, assume or suffer to exist any Indebtedness.",
        sourceQuotation:
          "“SECTION 6.01. Indebtedness . No Loan Party will, nor will it permit any Restricted Subsidiary to, create, incur, assume or suffer to exist any Indebtedness, except:”",
        independence: "MATERIAL_INDEPENDENT",
        representedBy: null,
        surfacedBy: [],
      },
      {
        id: "P2",
        proposition: "The prohibition is subject to the exceptions enumerated in clauses (a) through (q).",
        sourceQuotation: "clauses (a) through (q) of Section 6.01, enumerated in the operative span",
        independence: "MATERIAL_INDEPENDENT",
        representedBy: null,
        surfacedBy: [],
      },
    ],
    candidatesCited: [
      "coverage-unit:9abe33eb7732e17856375faac8f15ca05abd4de316da282b870d4a2f5737c183",
      "coverage-unit:b281fa9f21bb1eed86502eb4305f769b29b31f9af7e84055a2099c706ddd80a0",
      "coverage-unit:bf99be6e72342e8839305e3c402e7a3a351e2eff3ad629865d43ffd45801b5d7",
    ],
    credit: "NO_CREDIT",
    completeness: "NONE",
    compositeSurfacing: "NOT_SPECIFICALLY_SURFACED",
    dangerousSilentOmission: true,
    priorConsensus: { credit: "NO_CREDIT", surfacingBinary: "NOT_SPECIFICALLY_SURFACED", completeness: "NONE" },
    reasoning:
      "The candidate pool contains no SUBSTANTIVE_REPRESENTATION of any kind for this claim (60 candidates: 35 SAFETY_FLAG, 24 HONEST_UNRESOLVED, 1 INVENTORY_ONLY). Every claim-address-related flag is anchored at a strict enumerated descendant such as 6.01(i)(i)(ii)(ii)(ii), and each one's own text is a specific sub-basket (a supply-chain financing carve-out, a refinancing limb, a $25,000,000/25% basket). None names the chapeau prohibition or the enumeration. The decision is unchanged; what changes is that it can now be checked, because the packet's excerpt previously carried the “Prime Rate” definition instead of Section 6.01.",
  },
  {
    caseId: "CASE-b9ca777174",
    bucket: "READJUDICATION_REQUIRED_EVIDENCE_REPAIR",
    correctedGroundTruthClaim: null,
    propositions: [
      {
        id: "P1",
        proposition:
          "No Loan Party will, nor will it permit any Restricted Subsidiary to, create, incur, assume or suffer to exist any Indebtedness.",
        sourceQuotation:
          "“SECTION 6.01. Indebtedness . No Loan Party will, nor will it permit any Restricted Subsidiary to, create, incur, assume or suffer to exist any Indebtedness, except:”",
        independence: "MATERIAL_INDEPENDENT",
        representedBy: null,
        surfacedBy: [],
      },
      {
        id: "P2",
        proposition: "The prohibition is subject to the exceptions enumerated in clauses (a) through (q).",
        sourceQuotation: "clauses (a) through (q) of Section 6.01, enumerated in the operative span",
        independence: "MATERIAL_INDEPENDENT",
        representedBy: null,
        surfacedBy: [],
      },
    ],
    candidatesCited: [],
    credit: "NO_CREDIT",
    completeness: "NONE",
    compositeSurfacing: "NOT_SPECIFICALLY_SURFACED",
    dangerousSilentOmission: true,
    priorConsensus: { credit: "NO_CREDIT", surfacingBinary: "NOT_SPECIFICALLY_SURFACED", completeness: "NONE" },
    reasoning:
      "No SUBSTANTIVE_REPRESENTATION in the pool. Four flags carry a 6.01 address and all four are strict descendants — 6.01(c)(i) (the Guarantee limb) and 6.01(g)(i) (a Refinance Indebtedness limb). Neither names the chapeau prohibition or the enumeration. Decision unchanged on repaired evidence.",
  },
  {
    caseId: "CASE-8c29f13dc0",
    bucket: "READJUDICATION_REQUIRED_EVIDENCE_REPAIR",
    correctedGroundTruthClaim: null,
    propositions: [
      {
        id: "P1",
        proposition:
          "No Loan Party will, nor will it permit any Restricted Subsidiary to, create, incur, assume or suffer to exist any Indebtedness.",
        sourceQuotation:
          "“SECTION 6.01.\\nIndebtedness . No Loan Party will, nor will it permit any Restricted Subsidiary to, create, incur, assume or suffer to exist any Indebtedness, except:”",
        independence: "MATERIAL_INDEPENDENT",
        representedBy: null,
        surfacedBy: [],
      },
      {
        id: "P2",
        proposition: "The prohibition is subject to the exceptions enumerated in clauses (a) through (r).",
        sourceQuotation: "clauses (a) through (r) of Section 6.01, enumerated in the operative span",
        independence: "MATERIAL_INDEPENDENT",
        representedBy: null,
        surfacedBy: [],
      },
    ],
    candidatesCited: [],
    credit: "NO_CREDIT",
    completeness: "NONE",
    compositeSurfacing: "NOT_SPECIFICALLY_SURFACED",
    dangerousSilentOmission: true,
    priorConsensus: { credit: "NO_CREDIT", surfacingBinary: "NOT_SPECIFICALLY_SURFACED", completeness: "NONE" },
    reasoning:
      "No SUBSTANTIVE_REPRESENTATION, and — uniquely in this group — not a single one of the 60 candidates carries a 6.01 address at all. The section is entirely absent from the claim-address pool. Decision unchanged on repaired evidence.",
  },
  {
    caseId: "CASE-88cfbb3bb8",
    bucket: "READJUDICATION_REQUIRED_EVIDENCE_REPAIR",
    correctedGroundTruthClaim: null,
    propositions: [
      {
        id: "P1",
        proposition:
          "No Loan Party will, nor will it permit any Restricted Subsidiary to, Dispose of any asset, including any Equity Interest owned by it.",
        sourceQuotation:
          "“SECTION 6.05. Asset Sales . No Loan Party will, nor will it permit any Restricted Subsidiary to, Dispose of any asset, including any Equity Interest owned by it”",
        independence: "MATERIAL_INDEPENDENT",
        representedBy: null,
        surfacedBy: [],
      },
      {
        id: "P2",
        proposition:
          "No Loan Party will permit any Restricted Subsidiary to issue any additional Equity Interest in itself, other than to another Loan Party or another Restricted Subsidiary in compliance with Section 6.04.",
        sourceQuotation:
          "“nor will any Loan Party permit any Restricted Subsidiary to issue any additional Equity Interest in such Restricted Subsidiary (other than to another Loan Party or another Restricted Subsidiary in compliance with Section 6.04)”",
        independence: "MATERIAL_INDEPENDENT",
        representedBy: null,
        surfacedBy: [],
      },
      {
        id: "P3",
        proposition: "Both prohibitions are subject to the exceptions enumerated in clauses (a) through (k).",
        sourceQuotation: "clauses (a) through (k) of Section 6.05, enumerated in the operative span",
        independence: "MATERIAL_INDEPENDENT",
        representedBy: null,
        surfacedBy: ["discovery:discovery-candidate:7a11d163ac0f012c731566f3"],
      },
    ],
    candidatesCited: [
      "discovery:discovery-candidate:7a11d163ac0f012c731566f3",
      "discovery:discovery-candidate:f00dadce443ea55a003d7fb8",
    ],
    credit: "NO_CREDIT",
    completeness: "NONE",
    compositeSurfacing: "PARTIALLY_SURFACED",
    dangerousSilentOmission: true,
    priorConsensus: { credit: "NO_CREDIT", surfacingBinary: "SPECIFICALLY_SURFACED", completeness: "NONE" },
    reasoning:
      "No SUBSTANTIVE_REPRESENTATION. Two flags carry the claim's own address 6.05. The first says in its own words “Flagged sub-clause likely providing a specific exception or basket to the Asset Sales prohibition; full text not included in provided excerpt” — a sub-clause-scoped warning despite the parent address, which §10 says does not override the narrower scope its content shows; it surfaces P3. The second names the fair-value / 75%-cash requirement, which is the §6.05(k) proviso and is not one of this claim's propositions. Neither warns that the chapeau prohibitions P1 and P2 are unrepresented. One gap proposition surfaced, two not: PARTIALLY_SURFACED, which projects to NOT_SPECIFICALLY_SURFACED and makes this a dangerous silent omission of the chapeau.",
  },
  {
    caseId: "CASE-5a66cad386",
    bucket: "READJUDICATION_REQUIRED_EVIDENCE_REPAIR",
    correctedGroundTruthClaim: null,
    propositions: [
      {
        id: "P1",
        proposition:
          "No Loan Party will, nor will it permit any Restricted Subsidiary to, Dispose of any asset, including any Equity Interest owned by it.",
        sourceQuotation:
          "“SECTION 6.05. Asset Sales . No Loan Party will, nor will it permit any Restricted Subsidiary to, Dispose of any asset, including any Equity Interest owned by it”",
        independence: "MATERIAL_INDEPENDENT",
        representedBy: null,
        surfacedBy: ["coverage-unit:1edc96335466b19295c339677ac5cdc61b039d637f55d6"],
      },
      {
        id: "P2",
        proposition:
          "No Loan Party will permit any Restricted Subsidiary to issue any additional Equity Interest in itself, other than to another Loan Party or another Restricted Subsidiary in compliance with Section 6.04.",
        sourceQuotation:
          "“nor will any Loan Party permit any Restricted Subsidiary to issue any additional Equity Interest in such Restricted Subsidiary (other than to another Loan Party or another Restricted Subsidiary in compliance with Section 6.04)”",
        independence: "MATERIAL_INDEPENDENT",
        representedBy: null,
        surfacedBy: ["coverage-unit:1edc96335466b19295c339677ac5cdc61b039d637f55d6"],
      },
      {
        id: "P3",
        proposition: "Both prohibitions are subject to the exceptions enumerated in clauses (a) through (k).",
        sourceQuotation: "clauses (a) through (k) of Section 6.05, enumerated in the operative span",
        independence: "MATERIAL_INDEPENDENT",
        representedBy: null,
        surfacedBy: ["coverage-unit:1edc96335466b19295c339677ac5cdc61b039d637f55d6"],
      },
    ],
    candidatesCited: ["coverage-unit:1edc96335466b19295c339677ac5cdc61b039d637f55d6"],
    credit: "NO_CREDIT",
    completeness: "NONE",
    compositeSurfacing: "FULLY_SURFACED",
    dangerousSilentOmission: false,
    priorConsensus: { credit: "NO_CREDIT", surfacingBinary: "SPECIFICALLY_SURFACED", completeness: "NONE" },
    reasoning:
      "No SUBSTANTIVE_REPRESENTATION, so NO_CREDIT. Surfacing turns on one candidate: a HONEST_UNRESOLVED coverage unit anchored at the claim's own address 6.05, whose own text is the section heading and opening words (“Asset Sales . No Loan Party will, nor will it”) and whose state is coverageState=SOURCE_CONTEXT_INCOMPLETE with “a candidate was discovered for this unit's region but never compiled to IR”. That is a whole-unit declaration that the section was seen and not represented, so it covers every proposition in the claim. Note for the record: the frozen evaluator's V3.1 projection demoted this case to PARTIALLY_SURFACED because the only flag that reached its surfacedAsUnsafeBy list was a descendant at 6.05(A)(a)(B). The explicit atomic decomposition, which V3.1 itself says takes precedence over the derived signals, reaches FULLY_SURFACED on the packet evidence.",
  },
  {
    caseId: "CASE-393f8732d2",
    bucket: "READJUDICATION_REQUIRED_EVIDENCE_REPAIR",
    correctedGroundTruthClaim: null,
    propositions: [
      {
        id: "P1",
        proposition:
          "No Loan Party will, nor will it permit any Restricted Subsidiary to, Dispose of any asset, including any Equity Interest owned by it.",
        sourceQuotation:
          "“SECTION 6.05. Asset Sales . No Loan Party will, nor will it permit any Restricted Subsidiary to, Dispose of any asset, including any Equity Interest owned by it”",
        independence: "MATERIAL_INDEPENDENT",
        representedBy: null,
        surfacedBy: ["coverage-unit:08c0cbe28dd53b1b4bd75df45c3ea36eb8da6eb7edce1c"],
      },
      {
        id: "P2",
        proposition:
          "No Loan Party will permit any Restricted Subsidiary to issue any additional Equity Interest in itself, other than to another Loan Party or another Restricted Subsidiary in compliance with Section 6.04.",
        sourceQuotation:
          "“nor will any Loan Party permit any Restricted Subsidiary to issue any additional Equity Interest in such Restricted Subsidiary (other than to another Loan Party or another Restricted Subsidiary in compliance with Section 6.04)”",
        independence: "MATERIAL_INDEPENDENT",
        representedBy: null,
        surfacedBy: ["coverage-unit:08c0cbe28dd53b1b4bd75df45c3ea36eb8da6eb7edce1c"],
      },
      {
        id: "P3",
        proposition: "Both prohibitions are subject to the exceptions enumerated in clauses (a) through (k).",
        sourceQuotation: "clauses (a) through (k) of Section 6.05, enumerated in the operative span",
        independence: "MATERIAL_INDEPENDENT",
        representedBy: null,
        surfacedBy: ["coverage-unit:08c0cbe28dd53b1b4bd75df45c3ea36eb8da6eb7edce1c"],
      },
    ],
    candidatesCited: ["coverage-unit:08c0cbe28dd53b1b4bd75df45c3ea36eb8da6eb7edce1c"],
    credit: "NO_CREDIT",
    completeness: "NONE",
    compositeSurfacing: "FULLY_SURFACED",
    dangerousSilentOmission: false,
    priorConsensus: { credit: "NO_CREDIT", surfacingBinary: "SPECIFICALLY_SURFACED", completeness: "NONE" },
    reasoning:
      "Identical shape to CASE-5a66cad386: no representation, and one whole-unit HONEST_UNRESOLVED coverage unit at the claim's own address declaring the section discovered but never compiled. Decision unchanged; the repaired excerpt replaces a compliance-certificate exhibit form that sat 326,537 characters away from the operative section.",
  },
  {
    caseId: "CASE-3e2b123d74",
    bucket: "READJUDICATION_REQUIRED_EVIDENCE_REPAIR",
    correctedGroundTruthClaim: null,
    propositions: [
      {
        id: "P1",
        proposition:
          "Notwithstanding the foregoing, no Loan Party or Restricted Subsidiary may consummate any transaction — by way of Restricted Payment, investment, Lien, sale, conveyance, transfer or other Disposition, in a single transaction or a series — that results in the Disposition of intellectual property material to the business of the Company and its Restricted Subsidiaries to any Unrestricted Subsidiary.",
        sourceQuotation:
          "“Notwithstanding the foregoing, no Loan Party or any Restricted Subsidiary shall consummate any transaction that results in the Disposition (whether by way of any Restricted Payment, investment, Lien, sale, conveyance, transfer or other Disposition, and whether in a single transaction or a series of transactions) of intellectual property that is material to the business of the Company and its Restricted Subsidiaries to any Unrestricted Subsidiary”",
        independence: "MATERIAL_INDEPENDENT",
        representedBy: null,
        surfacedBy: [
          "coverage-unit:19a05c35c04c2e7a0a9d568ff2f109a617ead1884",
          "coverage-unit:b26882867f27c5727f22d790d95756c26c9586188",
        ],
      },
      {
        id: "P2",
        proposition:
          "The Company and its Restricted Subsidiaries may nonetheless grant non-exclusive licences of intellectual property to an Unrestricted Subsidiary in the ordinary course of business so long as they retain the beneficial ownership and the same rights to use that intellectual property as held prior to the licence.",
        sourceQuotation:
          "“provided that the Company and its Restricted Subsidiaries may grant non-exclusive licenses of any intellectual property to any Unrestricted Subsidiary in the ordinary course of business so long as the Company and its Restricted Subsidiaries retain the beneficial ownership and the same rights to use such intellectual property as held prior to such license”",
        independence: "MATERIAL_INDEPENDENT",
        representedBy: null,
        surfacedBy: [],
      },
    ],
    candidatesCited: [
      "coverage-unit:19a05c35c04c2e7a0a9d568ff2f109a617ead1884",
      "coverage-unit:b26882867f27c5727f22d790d95756c26c9586188",
    ],
    credit: "NO_CREDIT",
    completeness: "NONE",
    compositeSurfacing: "PARTIALLY_SURFACED",
    dangerousSilentOmission: true,
    priorConsensus: { credit: "NO_CREDIT", surfacingBinary: "NOT_SPECIFICALLY_SURFACED", completeness: "NONE" },
    reasoning:
      "No SUBSTANTIVE_REPRESENTATION. Two SAFETY_FLAG coverage units carry the flush prohibition inside their own 500-character unit text and declare it a CRITICAL unit with no adequate compiled or verified IR representation (CANDIDATE_DISCOVERED_NEVER_COMPILED), so P1 is specifically surfaced. Their unit text stops at “to any Un” and never reaches the licence proviso, so P2 is not. The binary projection is unchanged from the prior adjudication; the composite state is now recorded as PARTIALLY_SURFACED rather than collapsed, which is strictly more informative.",
  },
  {
    caseId: "CASE-5c33066800",
    bucket: "READJUDICATION_REQUIRED_EVIDENCE_REPAIR",
    correctedGroundTruthClaim: null,
    propositions: [
      {
        id: "P1",
        proposition:
          "Applicable EBITDA means EBITDA for the Company and its Restricted Subsidiaries on a consolidated basis in accordance with GAAP.",
        sourceQuotation:
          "“Applicable EBITDA means, at any time, EBITDA for the Company and its Restricted Subsidiaries on a consolidated basis in accordance with GAAP”",
        independence: "MATERIAL_INDEPENDENT",
        representedBy: "ir-definition:ir-definition:2f660825c4d06c8c85d1c437",
        surfacedBy: [],
      },
      {
        id: "P2",
        proposition:
          "The measurement period is the four consecutive fiscal quarters ended on or most recently prior to that time for which financial statements have been delivered to the Administrative Agent pursuant to Section 5.01(a) or (b).",
        sourceQuotation:
          "“for the period of four consecutive fiscal quarters of the Company ended on or most recently prior to such time for which financial statements have been delivered to the Administrative Agent pursuant to Section 5.01(a) or (b)”",
        independence: "MATERIAL_INDEPENDENT",
        representedBy: "ir-definition:ir-definition:2f660825c4d06c8c85d1c437",
        surfacedBy: [],
      },
      {
        id: "P3",
        proposition:
          "Before the first delivery under Section 5.01(a) or (b), the most recent financial statements referred to in Section 3.04(a) are used instead.",
        sourceQuotation:
          "“(or, if prior to the date of the delivery of the first financial statements to be delivered pursuant to Section 5.01(a) or (b), the most recent financial statements referred to in Section 3.04(a))”",
        independence: "QUALIFIER",
        representedBy: null,
        surfacedBy: [],
      },
    ],
    candidatesCited: ["ir-definition:ir-definition:2f660825c4d06c8c85d1c437"],
    credit: "CREDIT",
    completeness: "FULL",
    compositeSurfacing: "NOT_APPLICABLE",
    dangerousSilentOmission: false,
    priorConsensus: { credit: "CREDIT", surfacingBinary: "NOT_APPLICABLE", completeness: "FULL" },
    reasoning:
      "A COMPILED_IR_DEFINITION of “Applicable EBITDA” with sufficiency=COMPLETE and no unresolvedReasons captures P1 and P2. §10 forbids rejecting a SUBSTANTIVE_REPRESENTATION merely because reviewStatus=REVIEW_REQUIRED. P3 is a one-time transitional convention selecting which financial statements to use before the first delivery; it does not change whether any transaction is permitted or how much capacity exists, so it is a QUALIFIER and does not defeat completeness. Disclosed limitation: the packet's stored excerpt for this candidate is 284 characters and stops at “have been delivered”, so whether the representation itself carries the Section 5.01(a)/(b) and Section 3.04(a) cross-references cannot be established from the packet. Decision unchanged from the prior adjudication.",
  },
  {
    caseId: "CASE-768547a920",
    bucket: "READJUDICATION_REQUIRED_EVIDENCE_REPAIR",
    correctedGroundTruthClaim: null,
    propositions: [
      {
        id: "P1",
        proposition:
          "Interest Coverage Ratio means, for any period of four consecutive fiscal quarters of the Company, the ratio of (a) EBITDA for such period to (b) Consolidated Interest Expense for such period.",
        sourceQuotation:
          "“‘ Interest Coverage Ratio ’ means, for any period of four consecutive fiscal quarters of the Company, the ratio of (a) EBITDA for such period to (b) Consolidated Interest Expense for such period.”",
        independence: "MATERIAL_INDEPENDENT",
        representedBy: null,
        surfacedBy: [],
      },
      {
        id: "P2",
        proposition:
          "For each Annualized Quarter ending 31 March, 30 June, 30 September and 31 December 2022, Consolidated Interest Expense equals post-Effective-Date Consolidated Interest Expense multiplied by four, two, four thirds and one respectively.",
        sourceQuotation:
          "“Notwithstanding the foregoing, solely for purposes of determining the Interest Coverage Ratio for any period of four consecutive fiscal quarters ending as of March 31, 2022, June 30, 2022, September 30, 2022 or December 31, 2022 (each such fiscal quarter being referred to as an ‘ Annualized Quarter ’), Consolidated Interest Expense shall be equal to the product of (I) ... multiplied by (II) (A) four ... (B) two ... (C) four thirds (4/3) ... or (D) one (1)”",
        independence: "MATERIAL_INDEPENDENT",
        representedBy: null,
        surfacedBy: [
          "coverage-unit:1453d5df1475e6deab9b7e2bd960138e1b89df4efd9de3",
          "coverage-unit:0bdc66dc7ca7d46ebfaf50209c577d4fd9da20d72bde4f",
        ],
      },
    ],
    candidatesCited: [
      "coverage-unit:1453d5df1475e6deab9b7e2bd960138e1b89df4efd9de3",
      "coverage-unit:0bdc66dc7ca7d46ebfaf50209c577d4fd9da20d72bde4f",
      "ir-definition:ir-definition:2f660825c4d06c8c85d1c437",
      "ir-definition:ir-definition:007a5206dfd349a2dec8b9c0",
    ],
    credit: "NO_CREDIT",
    completeness: "NONE",
    compositeSurfacing: "PARTIALLY_SURFACED",
    dangerousSilentOmission: true,
    priorConsensus: { credit: "NO_CREDIT", surfacingBinary: "NOT_SPECIFICALLY_SURFACED", completeness: "NONE" },
    reasoning:
      "The only two SUBSTANTIVE_REPRESENTATIONs in the pool define “Acquisition” and “Applicable EBITDA” — different defined terms — so nothing represents this claim. Two SAFETY_FLAG coverage units DO carry the Annualized Quarter proviso verbatim in their own unit text, with coverageState=UNREPRESENTED and flaggedDangerousUnaccounted=true, so P2 is specifically surfaced. Their unit text begins at “(b) Consolidated Interest Expense for such period” and never contains the ratio's own definition or its numerator, so P1 is not surfaced. Their addresses — 2.09(ii)(ii)(b)(a)(b) and 7.01(b)(a)(b) — are in different base sections from the claim, so structure is not decisive and the decision rests on content, as V3.1 requires. Binary projection unchanged from the prior adjudication.",
  },
];
