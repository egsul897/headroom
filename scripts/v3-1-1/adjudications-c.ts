import type { Adjudication } from "./adjudication-types";

/** §9 group 3 — the two cases the integrity audit could not locate in the primary source. */
export const ADJUDICATIONS_SOURCE_RESOLUTION: Adjudication[] = [
  {
    caseId: "CASE-e555117f4c",
    bucket: "READJUDICATION_REQUIRED_SOURCE_RESOLUTION",
    correctedGroundTruthClaim:
      "EBITDA means, for any period, Net Income plus the twenty add-backs enumerated in clause (a)(i)-(xx) and minus the six deductions enumerated in clause (b)(i)-(vi), all calculated for the Company and its Restricted Subsidiaries on a consolidated basis in accordance with GAAP; provided that the aggregate of all items added back under clauses (a)(vii), (a)(viii) and (a)(xviii)(b) may not exceed 20% of EBITDA calculated before those add-backs (the “Combined Cap”); and EBITDA for each of the four quarters of 2021 is a stipulated dollar amount that supersedes the formula for those quarters.",
    propositions: [
      {
        id: "P1",
        proposition:
          "EBITDA is Net Income for the period plus the add-backs enumerated in clause (a), items (i) through (xx), and minus the deductions enumerated in clause (b), items (i) through (vi), consolidated under GAAP.",
        sourceQuotation:
          "“‘ EBITDA ’ means, for any period, Net Income for such period plus (a) ... the sum of: (i) ... (xx) ... minus (b) ... (i) ... (vi) ... all calculated for the Company and its Restricted Subsidiaries on a consolidated basis in accordance with GAAP”",
        independence: "MATERIAL_INDEPENDENT",
        representedBy: null,
        surfacedBy: ["ir-definition:ir-definition:32c350f36f4d1860970bf978"],
      },
      {
        id: "P2",
        proposition:
          "Each of the twenty add-backs and six deductions carries its own conditions and provisos, which determine whether and how much of each item may be added or subtracted.",
        sourceQuotation:
          "the enumerated text of clauses (a)(i)–(a)(xx) and (b)(i)–(b)(vi) in the operative definition, each with its own qualifying language",
        independence: "MATERIAL_INDEPENDENT",
        representedBy: null,
        surfacedBy: ["ir-definition:ir-definition:32c350f36f4d1860970bf978"],
      },
      {
        id: "P3",
        proposition:
          "The aggregate of all items added back under clauses (a)(vii), (a)(viii) and (a)(xviii)(b) may not exceed 20% of EBITDA calculated before those add-backs.",
        sourceQuotation:
          "“the aggregate amount all items added back to Net Income during any period in respect of clauses (a)(vii), (a)(viii), and (a)(xviii)(b) shall not exceed 20% of EBITDA calculated before such add-backs (the ‘ Combined Cap ’)”",
        independence: "MATERIAL_INDEPENDENT",
        representedBy: null,
        surfacedBy: ["ir-definition:ir-definition:32c350f36f4d1860970bf978"],
      },
      {
        id: "P4",
        proposition:
          "EBITDA for each quarter of 2021 is a stipulated dollar amount that supersedes the formula, and adjustments used in those amounts may not be reused after 31 December 2021.",
        sourceQuotation:
          "“Notwithstanding anything to the contrary set forth in this Agreement, EBITDA shall, in each case, be deemed to be the amount set forth below opposite such period, and any adjustments taken into account in calculating the amounts below will not be used in adjusting EBITDA after December 31, 2021”",
        independence: "MATERIAL_INDEPENDENT",
        representedBy: null,
        surfacedBy: ["ir-definition:ir-definition:32c350f36f4d1860970bf978"],
      },
    ],
    candidatesCited: ["ir-definition:ir-definition:32c350f36f4d1860970bf978"],
    credit: "NO_CREDIT",
    completeness: "PARTIAL",
    compositeSurfacing: "FULLY_SURFACED",
    dangerousSilentOmission: false,
    priorConsensus: { credit: "NO_CREDIT", surfacingBinary: "SPECIFICALLY_SURFACED", completeness: "PARTIAL" },
    reasoning:
      "SOURCE RESOLVED. The definition is at offset 88521 of the doc-a extracted text and was located deterministically by matching the defined-term lead-in rather than the bare term; the integrity audit's failure to find it was a locator failure, not an absent provision. Reading it confirms exactly twenty add-backs (a)(i)-(xx) and six deductions (b)(i)-(vi), and also shows that the frozen claim OMITTED the 20% Combined Cap and the stipulated 2021 quarterly amounts. Both are added as propositions P3 and P4, which makes this benchmark case STRICTER than the version it replaces. On adjudication: the pool's representation of EBITDA is a COMPILED_IR_DEFINITION whose accountingRole is HONEST_UNRESOLVED, with sufficiency=PARTIAL and reviewStatus=REVIEW_REQUIRED. §10 says HONEST_UNRESOLVED may support surfacing but may not earn substantive CREDIT, so NO_CREDIT. Completeness is PARTIAL because the top-level structure is captured. Its unresolvedReasons name, in the system's own words, the aggregated twenty add-backs and six deductions, the Combined Cap held separately as a shared capacity, and the unmodelled 2021 quarterly overrides — so every material proposition of the corrected claim, including the two the benchmark had omitted, is specifically surfaced: FULLY_SURFACED.",
  },
  {
    caseId: "CASE-4a1c6a48a0",
    bucket: "READJUDICATION_REQUIRED_SOURCE_RESOLUTION",
    correctedGroundTruthClaim: null,
    propositions: [
      {
        id: "P1",
        proposition:
          "For the “Unrestricted Subsidiary” definition and the covenants under Sections 5.15 and 6.04, “investments” include the proportionate share of the fair market value of a Subsidiary's net assets at the time it is designated an Unrestricted Subsidiary.",
        sourceQuotation:
          "“For purposes of the definition of ‘Unrestricted Subsidiary’ and the covenants described under Section 5.15 and under this Section 6.04: (x) ‘investments’ shall include the portion (proportionate to the Company’s or the applicable Restricted Subsidiary’s Equity Interests in such Subsidiary) of the fair market value of the net assets of a Subsidiary at the time that such Subsidiary is designated an Unrestricted Subsidiary”",
        independence: "MATERIAL_INDEPENDENT",
        representedBy: null,
        surfacedBy: [],
      },
      {
        id: "P2",
        proposition:
          "On re-designation as a Restricted Subsidiary, a permanent deemed investment remains in an amount, if positive, equal to the investment at the time of re-designation less the proportionate fair market value of the Subsidiary's net assets at that time.",
        sourceQuotation:
          "“upon a re-designation of such Subsidiary as a Restricted Subsidiary, the Company (or the applicable Restricted Subsidiary owning such re-designated Subsidiary) shall be deemed to continue to have a permanent ‘investment’ in an Unrestricted Subsidiary in an amount (if positive) equal to (A) ... ‘investment’ in such Subsidiary at the time of such re-designation, less (B) the portion ... of the fair market value of the net assets of such Subsidiary at the time of such re-designation”",
        independence: "MATERIAL_INDEPENDENT",
        representedBy: null,
        surfacedBy: [],
      },
      {
        id: "P3",
        proposition:
          "Any property transferred to or from an Unrestricted Subsidiary is valued at its fair market value at the time of the transfer.",
        sourceQuotation:
          "“(y) any property transferred to or from an Unrestricted Subsidiary shall be valued at its fair market value at the time of such transfer”",
        independence: "MATERIAL_INDEPENDENT",
        representedBy: null,
        surfacedBy: [],
      },
    ],
    candidatesCited: [
      "coverage-unit:f2a2729f36ccf2610ef3a501dfc7a84b5745927a4",
      "coverage-unit:922d0d7c77217bce62ec6256478965cb352ef3f2f",
      "coverage-unit:b6a49835c609f1683c0f7786c424a2ccda1dff9fe",
      "coverage-unit:7ffe6af1f5c863b465b87abc895a553c67162cb38",
    ],
    credit: "NO_CREDIT",
    completeness: "NONE",
    compositeSurfacing: "NOT_SPECIFICALLY_SURFACED",
    dangerousSilentOmission: true,
    priorConsensus: { credit: "NO_CREDIT", surfacingBinary: "SPECIFICALLY_SURFACED", completeness: "PARTIAL" },
    reasoning:
      "SOURCE RESOLVED. The flush valuation rules sit 6,734 characters into the operative Section 6.04 span and the claim is confirmed verbatim, so the case moves from SOURCE_UNRESOLVED to VERIFIED. Locating them is what changes the adjudication. The pool's two SUBSTANTIVE_REPRESENTATIONs are the “Acquisition” definition and a Section 1.11(a) restatement rule — neither is this claim. Four flags carry a “6.04(2)” address and their own unit text is about redesignation and fair market value, which is why the prior adjudication read them as claim-specific. Against the located source they are not: their text — “the transfer of all or substantially all of the assets of an Unrestricted Subsidiary to a Borrower or any Restricted Subsidiary), the fair market value ... of the investment in such Unrestricted Subsidiary at the time of such redesignation, in each case, to the extent such investment ... was made using the Available Amount pursuant to Section 6.04(q)” — is clause (vi) of the Available Amount definition at offset 30254 in Article I, not the Section 6.04 flush. It governs how much the Available Amount builds back on redesignation, not what counts as an “investment” for the covenant. §10 says a warning counts only for the proposition it actually surfaces, so none of P1, P2 or P3 is surfaced. This is the only case in the corpus where resolving the source turned a claimed warning into a dangerous silent omission.",
  },
];
