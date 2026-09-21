/**
 * §7 — the record of the rubric-dependency screen, including the cases it CLEARED.
 *
 * The AMB-1 resolution can only demote, so the screen population is every case whose
 * prior adjudication said SPECIFICALLY_SURFACED. A case clears the screen when at least
 * one claim-specific flag covers the whole unit on its own content, or when the
 * descendant flags collectively tile every material proposition of the claim.
 */
export interface ScreenRecord {
  caseId: string;
  claimSectionRef: string;
  outcome: "CLEARED" | "RE_ADJUDICATED";
  basis: string;
}

export const RUBRIC_SCREEN: ScreenRecord[] = [
  {
    caseId: "CASE-8de9def8ca",
    claimSectionRef: "6.08(b)",
    outcome: "CLEARED",
    basis:
      "SAFETY_FLAG at the claim's own address 6.08(b) whose own text restates the prohibition itself — whole-unit content, not a limb.",
  },
  {
    caseId: "CASE-7fd6c57745",
    claimSectionRef: "6.01(m)",
    outcome: "CLEARED",
    basis:
      "Single-proposition claim (unconditional carve-out for Secured Notes debt and guarantees). A claim with one atomic proposition cannot be partially surfaced. The HONEST_UNRESOLVED rule at the claim's own address reports VERIFICATION_FAILED on that provision.",
  },
  {
    caseId: "CASE-d32081582b",
    claimSectionRef: "7.13",
    outcome: "CLEARED",
    basis:
      "Two flags at the own address cover the carve-out set and two descendant flags at 7.13(a) cover the prohibition limb. The descendants and the own-address flags together tile both material propositions.",
  },
  {
    caseId: "CASE-a57ab21f38",
    claimSectionRef: "1.04",
    outcome: "CLEARED",
    basis:
      "Own-address flags carry the GAAP-as-in-effect general rule and the GAAP-freeze amendment mechanic; descendant flags at 1.04(i) and 1.04(ii) carry the ASC 825-10-25 and ASC 470-20 limbs. All four material propositions are covered.",
  },
  {
    caseId: "CASE-9a30560f37",
    claimSectionRef: "7.17",
    outcome: "CLEARED",
    basis:
      "Own-address flag states the covenant's operative prohibition (covered activity / covered transaction) rather than a limb; descendants at 7.17(a) and 7.17(b)(i) add the defined-term limbs.",
  },
  {
    caseId: "CASE-c8f9a9b5c0",
    claimSectionRef: "6.04(b)",
    outcome: "CLEARED",
    basis:
      "Single-proposition claim. HONEST_UNRESOLVED compiled rule at the claim's own address names the cross-document Secured Notes Documents dependency, which is the whole of the claim.",
  },
  {
    caseId: "CASE-d2514bfbe7",
    claimSectionRef: "10.01(a)",
    outcome: "CLEARED",
    basis:
      "Four flags at the claim's own address, one of them a heading-matched whole-unit coverage flag on the Guaranty section itself. Whole-unit content.",
  },
  {
    caseId: "CASE-16a7d152b6",
    claimSectionRef: "6.02",
    outcome: "CLEARED",
    basis:
      "Own-address flag names both the general prohibition on Liens and the Permitted Liens exception in one sentence, so both unrepresented propositions are covered; the replacement-lien limb is separately represented by a compiled rule.",
  },
  { caseId: "CASE-b2658c02e7", claimSectionRef: "7.1", outcome: "RE_ADJUDICATED", basis: "Own-address flag is clause (d)-scoped on its own content; (a) and (c) carry no warning." },
  { caseId: "CASE-579c5d3f33", claimSectionRef: "7.10", outcome: "RE_ADJUDICATED", basis: "Own-address flag is carve-out-scoped; the arm's-length requirement and its $2,500,000 trigger carry no warning." },
  { caseId: "CASE-963cc44044", claimSectionRef: "7.14", outcome: "RE_ADJUDICATED", basis: "Own-address flag is second-limb-scoped; the asset-transfer limb and the carve-outs carry no warning." },
  { caseId: "CASE-166617b06a", claimSectionRef: "1.11", outcome: "RE_ADJUDICATED", basis: "No own-address flag at all; three material propositions have neither representation nor warning." },
  { caseId: "CASE-2034884b7a", claimSectionRef: "6.03", outcome: "RE_ADJUDICATED", basis: "Own-address flag is liquidation-carve-out-scoped; the all-or-substantially-all limb carries no warning. Already identified by the frozen evaluator's V3.1 delta." },
  { caseId: "CASE-5ac1cd56ef", claimSectionRef: "6.10", outcome: "RE_ADJUDICATED", basis: "Identified by the frozen evaluator's V3.1 delta. Re-adjudication PROMOTES it: the descendants tile both limbs." },
  { caseId: "CASE-e008d4278a", claimSectionRef: "6.04", outcome: "RE_ADJUDICATED", basis: "Identified by the frozen evaluator's V3.1 delta. Re-adjudication PROMOTES it: a whole-unit coverage flag sits at the claim's own address." },
  { caseId: "CASE-e555117f4c", claimSectionRef: "1.01", outcome: "RE_ADJUDICATED", basis: "Also in the source-resolution bucket." },
  { caseId: "CASE-4a1c6a48a0", claimSectionRef: "6.04", outcome: "RE_ADJUDICATED", basis: "Also in the source-resolution bucket." },
  { caseId: "CASE-88cfbb3bb8", claimSectionRef: "6.05", outcome: "RE_ADJUDICATED", basis: "Also in the evidence-repair bucket." },
  { caseId: "CASE-5a66cad386", claimSectionRef: "6.05", outcome: "RE_ADJUDICATED", basis: "Also in the evidence-repair bucket." },
  { caseId: "CASE-393f8732d2", claimSectionRef: "6.05", outcome: "RE_ADJUDICATED", basis: "Also in the evidence-repair bucket." },
  { caseId: "CASE-1284ab8e71", claimSectionRef: "6.08", outcome: "RE_ADJUDICATED", basis: "Also in the benchmark-change bucket." },
];
