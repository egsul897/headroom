import type { ExcerptRepair } from "./types";

/**
 * §4 / §9 — the excerpt repairs.
 *
 * The frozen V3.1 packet built every RESOLVED_FROM_RAW_SOURCE excerpt by taking the
 * FIRST textual occurrence of the section number. In eleven cases that first occurrence
 * is a cross-reference inside a definition, or an exhibit form, not the operative
 * provision. Nine were named by the integrity audit; two more (CASE-5c33066800 and
 * CASE-768547a920) fail the same deterministic containment test and are added here under
 * §9's instruction to add any other case whose evidence was contaminated.
 *
 * Each repair declares a locator and an anchor. The generator proves the repaired
 * excerpt starts inside the operative span, and that the ORIGINAL excerpt did not.
 */
export const EXCERPT_REPAIRS: ExcerptRepair[] = [
  {
    caseId: "CASE-2aa00d5566",
    originalExcerpt: "",
    originalExcerptOffset: 156440,
    originalExcerptLandedIn: "the tail of a cross-reference inside Article I, immediately followed by the “Prime Rate” definition",
    locator: { kind: "section", key: "6.01" },
    anchor: String.raw`SECTION\s+6\.01`,
    maxChars: 900,
    claimStillCorrect: true,
    claimDefectFound: null,
    note: "Operative §6.01 enumerates clauses (a) through (q); the claim's “(a) through (q)” is confirmed.",
  },
  {
    caseId: "CASE-b9ca777174",
    originalExcerpt: "",
    originalExcerptOffset: 191303,
    originalExcerptLandedIn: "a cross-reference inside Article I, followed by the “Prime Rate” definition",
    locator: { kind: "section", key: "6.01" },
    anchor: String.raw`SECTION\s+6\.01`,
    maxChars: 900,
    claimStillCorrect: true,
    claimDefectFound: null,
    note: "Same defect and same repair as CASE-2aa00d5566, in the conformed Third Amendment text.",
  },
  {
    caseId: "CASE-8c29f13dc0",
    originalExcerpt: "",
    originalExcerptOffset: 158157,
    originalExcerptLandedIn: "a cross-reference inside Article I, followed by the “Prime Rate” definition",
    locator: { kind: "section", key: "6.01" },
    anchor: String.raw`SECTION\s+6\.01`,
    maxChars: 900,
    claimStillCorrect: true,
    claimDefectFound: null,
    note: "Operative §6.01 of the 2025 Second A&R enumerates clauses (a) through (r); the claim's “(a) through (r)” is confirmed.",
  },
  {
    caseId: "CASE-88cfbb3bb8",
    originalExcerpt: "",
    originalExcerptOffset: 89023,
    originalExcerptLandedIn: "the EBITDA definition's cross-reference “permitted under Section 6.05” in Article I",
    locator: { kind: "section", key: "6.05" },
    anchor: String.raw`SECTION\s+6\.05`,
    maxChars: 700,
    claimStillCorrect: true,
    claimDefectFound: null,
    note: "Operative §6.05 enumerates clauses (a) through (k); the claim's “(a) through (k)” is confirmed.",
  },
  {
    caseId: "CASE-5a66cad386",
    originalExcerpt: "",
    originalExcerptOffset: 120335,
    originalExcerptLandedIn: "the EBITDA definition's cross-reference “permitted under Section 6.05” in Article I",
    locator: { kind: "section", key: "6.05" },
    anchor: String.raw`SECTION\s+6\.05`,
    maxChars: 700,
    claimStillCorrect: true,
    claimDefectFound: null,
    note: "Same defect and same repair as CASE-88cfbb3bb8, in the conformed Third Amendment text.",
  },
  {
    caseId: "CASE-393f8732d2",
    originalExcerpt: "",
    originalExcerptOffset: 810913,
    originalExcerptLandedIn: "a compliance-certificate exhibit form with blank dollar lines",
    locator: { kind: "section", key: "6.05" },
    anchor: String.raw`SECTION\s+6\.05`,
    maxChars: 700,
    claimStillCorrect: true,
    claimDefectFound: null,
    note: "The worst of the eleven: the excerpt came from an exhibit form near the end of the document, 326,537 characters past the operative section.",
  },
  {
    caseId: "CASE-3e2b123d74",
    originalExcerpt: "",
    originalExcerptOffset: 89023,
    originalExcerptLandedIn: "the EBITDA definition's cross-reference “permitted under Section 6.05” in Article I",
    locator: { kind: "section", key: "6.05" },
    anchor: String.raw`Notwithstanding the foregoing, no Loan Party`,
    maxChars: 800,
    claimStillCorrect: true,
    claimDefectFound: null,
    note: "The claim is about the unnumbered flush prohibition at the END of §6.05, so the anchor targets that sentence rather than the section heading.",
  },
  {
    caseId: "CASE-5c33066800",
    originalExcerpt: "",
    originalExcerptOffset: 13464,
    originalExcerptLandedIn: "the tail of a different definition plus “Acquired Entity or Business” and “Acquisition”",
    locator: { kind: "definition", key: "Applicable EBITDA" },
    anchor: String.raw`“\s*Applicable\s+EBITDA\s*”`,
    maxChars: 700,
    claimStillCorrect: true,
    claimDefectFound: null,
    note: "ADDED BY THIS MISSION under §9. The integrity audit named this case as an example of the wrong-excerpt defect but left it out of its nine-case repair list. It fails the same deterministic containment test, so it is repaired here.",
  },
  {
    caseId: "CASE-768547a920",
    originalExcerpt: "",
    originalExcerptOffset: 13464,
    originalExcerptLandedIn: "the tail of a different definition plus “Acquired Entity or Business” and “Acquisition”",
    locator: { kind: "definition", key: "Interest Coverage Ratio" },
    anchor: String.raw`“\s*Interest\s+Coverage\s+Ratio\s*”`,
    maxChars: 1100,
    claimStillCorrect: true,
    claimDefectFound: null,
    note: "ADDED BY THIS MISSION under §9. Same contaminated excerpt as CASE-5c33066800; the containment test fails identically.",
  },
  {
    caseId: "CASE-e555117f4c",
    originalExcerpt: "",
    originalExcerptOffset: 13464,
    originalExcerptLandedIn: "the tail of a different definition plus “Acquired Entity or Business” and “Acquisition”",
    locator: { kind: "definition", key: "EBITDA" },
    anchor: String.raw`“\s*EBITDA\s*”\s*means`,
    maxChars: 12000,
    claimStillCorrect: true,
    claimDefectFound:
      "INCOMPLETE_ENUMERATION: the claim lists the twenty add-backs and six deductions but omits the 20% Combined Cap that limits clauses (a)(vii), (a)(viii) and (a)(xviii)(b), and the stipulated 2021 quarterly EBITDA overrides. Both are added to the corrected propositions, which makes the benchmark STRICTER, not easier.",
    note: "Also a §5 source resolution: the integrity audit could not locate this definition. It is at offset 88521 and was located deterministically by matching the defined-term lead-in rather than the bare term.",
  },
  {
    caseId: "CASE-4a1c6a48a0",
    originalExcerpt: "",
    originalExcerptOffset: 455225,
    originalExcerptLandedIn:
      "the correct section, but only its first 1,453 characters — the §6.04 chapeau. The claim is about the flush valuation rules at the END of §6.04, 6,734 characters further in, which the excerpt never reaches.",
    locator: { kind: "section", key: "6.04" },
    anchor: String.raw`For purposes of the definition`,
    maxChars: 1400,
    claimStillCorrect: true,
    claimDefectFound: null,
    note: "Also a §5 source resolution. This case shows that span containment alone is not sufficient: the original excerpt WAS inside the operative span and still failed to carry the claimed provision. The generator therefore applies a second, claim-support test.",
  },
];
