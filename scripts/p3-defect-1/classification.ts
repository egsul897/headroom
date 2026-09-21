import type { Classification } from "./evidence";

/**
 * §2 — the pre-remediation classification of each of the 20 P3-DEFECT-1 targets.
 *
 * Each entry states the FIRST point at which the material proposition stopped
 * progressing, established from the frozen run artifacts and from production source in
 * evidence.ts. §1: "If a P3-DEFECT-1 case is actually caused by another root cause,
 * reclassify it instead of widening scope."
 */
export interface TargetClassification {
  caseId: string;
  classification: Classification;
  subReason: string;
  firstStopPoint: string;
  materialPropositionDiscovered: boolean;
  candidateCorrespondsToClaim: boolean;
  failureIsPromotionOrCompilation: boolean;
  primarySourceEvidenceExists: boolean;
  merelySectionAdjacent: boolean;
  enoughSemanticContentToActOn: boolean;
  evidence: string;
}

const DSGR_STOP =
  "STAGE 6 of scripts/phase-3f-first-blind-run.ts never ran for this candidate. That harness compiles eligibleOrdered.slice(0, COMPILE_CAP) with COMPILE_CAP = 30 under a $30 ceiling; the first 30 eligible candidates in document-then-emission order are all doc-a Article I (§1.01–§1.11(b)(iv)). Zero Article VI candidates were sent to the compiler in the entire DSGR run.";

const CONMED_STOP =
  "There is no stage 6 in the CONMED evidence at all. tests/fixtures/unseen-packages/phase-2f-freeze contains stages 1–5 only (structure, discovery, package graph, context bundles, audit); Phase 2F predates the Phase-3B semantic compiler. Compilation was never invoked for ANY CONMED candidate.";

function dsgr(caseId: string, evidence: string): TargetClassification {
  return {
    caseId,
    classification: "OTHER",
    subReason: "BENCHMARK_HARNESS_COMPILE_CAP",
    firstStopPoint: DSGR_STOP,
    materialPropositionDiscovered: true,
    candidateCorrespondsToClaim: true,
    failureIsPromotionOrCompilation: false,
    primarySourceEvidenceExists: true,
    merelySectionAdjacent: false,
    enoughSemanticContentToActOn: true,
    evidence,
  };
}

function conmed(caseId: string, evidence: string): TargetClassification {
  return {
    caseId,
    classification: "OTHER",
    subReason: "BENCHMARK_HARNESS_NO_COMPILATION_STAGE",
    firstStopPoint: CONMED_STOP,
    materialPropositionDiscovered: true,
    candidateCorrespondsToClaim: true,
    failureIsPromotionOrCompilation: false,
    primarySourceEvidenceExists: true,
    merelySectionAdjacent: false,
    enoughSemanticContentToActOn: true,
    evidence,
  };
}

export const TARGET_CLASSIFICATIONS: TargetClassification[] = [
  dsgr("CASE-88cfbb3bb8", "doc-a §6.05: 5 discovery candidates at this exact address, 0 compiled."),
  dsgr("CASE-3e2b123d74", "doc-a §6.05 (IP flush): same 5 candidates, 0 compiled."),
  dsgr("CASE-5a66cad386", "doc-b §6.05: discovery candidates exist, 0 compiled — no doc-b candidate was compiled at all."),
  dsgr("CASE-393f8732d2", "doc-d §6.05: discovery candidates exist, 0 compiled — no doc-d candidate was compiled at all."),
  dsgr("CASE-5ac1cd56ef", "doc-a §6.10: 2 discovery candidates at this exact address, 0 compiled."),
  dsgr("CASE-e008d4278a", "doc-b §6.04: discovery candidates exist, 0 compiled."),
  dsgr("CASE-30db965277", "doc-d §6.04: discovery candidates exist, 0 compiled."),
  dsgr("CASE-8de9def8ca", "doc-d §6.08: discovery candidates exist, 0 compiled."),
  dsgr(
    "CASE-d2514bfbe7",
    "doc-a §10.01: exactly 1 discovery candidate, and it is a synthesized section-level container — the very mechanism P3-DEFECT-2 was said to be missing. It exists; it was simply never compiled.",
  ),
  {
    caseId: "CASE-2034884b7a",
    classification: "MISCLASSIFIED_SECTION_MAPPING",
    subReason: "VERBATIM_CITATION_CHECK_AGAINST_A_FORM_THE_DOCUMENT_NEVER_USES",
    firstStopPoint:
      "Compilation DID run and DID produce a rule at Section 6.03(a). The rule was then demoted to HONEST_UNRESOLVED by a verification check reporting “cited section ‘Section 6.03(a)’ not found verbatim in source text”. The provision exists — the LSB source writes “SECTION  6.03 Restrictions on Fundamental Changes . (a) Enter into any merger…” and never writes the composed string “Section 6.03(a)” anywhere.",
    materialPropositionDiscovered: true,
    candidateCorrespondsToClaim: true,
    failureIsPromotionOrCompilation: false,
    primarySourceEvidenceExists: true,
    merelySectionAdjacent: false,
    enoughSemanticContentToActOn: true,
    evidence:
      "compiler-rule:lsb-2023-abl-credit-agreement:4:Section6.03(a) exists with accountingRole=HONEST_UNRESOLVED. Literal search of the LSB Article VI source for “Section 6.03(a)” returns no match; “SECTION  6.03 Restrictions on Fundamental Changes” is present. Same shape as CASE-7fd6c57745 at §6.01(m). This is P3-DEFECT-4 territory and §1/§10 forbid fixing it here.",
  },
  {
    caseId: "CASE-ca1109d4da",
    classification: "OTHER",
    subReason: "SUPERSEDED_SUBSYSTEM_PHASE_C0_ANALYZER",
    firstStopPoint:
      "The FWRG evidence layer contains zero COMPILED_IR_RULE candidates: every substantive FWRG representation is an ANALYZER_RULE from a Phase-C0 analyzer run that predates the Phase-3B semantic compiler. The analyzer emitted rules for §6.02, §6.02(k), §6.02(s) and §6.02(u) but not for §6.02(a). The production discovery→compilation seam was never on this path.",
    materialPropositionDiscovered: true,
    candidateCorrespondsToClaim: true,
    failureIsPromotionOrCompilation: false,
    primarySourceEvidenceExists: true,
    merelySectionAdjacent: false,
    enoughSemanticContentToActOn: true,
    evidence:
      "discovery:discovery-candidate:2a878c34f1a54346d5f1e47d at sectionRef 6.02(a), INVENTORY_ONLY, “Permits Liens securing the Secured Obligations.”, excerpt “(a) Liens securing the Secured Obligations;”. This is the single closest case to a genuine promotion gap in the whole set — but it is a gap in a superseded subsystem, and it has never been run through the current production compiler.",
  },
  conmed("CASE-b2658c02e7", "§7.1: 6 discovery candidates, 0 compiled (no compile stage existed)."),
  conmed("CASE-579c5d3f33", "§7.10: 5 discovery candidates, 0 compiled."),
  conmed("CASE-963cc44044", "§7.14: 4 discovery candidates, 0 compiled."),
  conmed("CASE-9948558e99", "§7.11: 2 discovery candidates, 0 compiled."),
  conmed("CASE-d32081582b", "§7.13: 4 discovery candidates, 0 compiled."),
  conmed("CASE-55163b4198", "§7.16: 2 discovery candidates, 0 compiled."),
  conmed("CASE-9a30560f37", "§7.17: 3 discovery candidates, 0 compiled."),
  conmed("CASE-b38c3b48eb", "§7.2: 31 discovery candidates — the richest inventory in the set — 0 compiled."),
  conmed("CASE-0c169f38c3", "§7.2(c): covered by the same 31-candidate §7.2 inventory, 0 compiled."),
];

/**
 * §14's companion finding: cases the V3.1.1 backlog attributed to P3-DEFECT-2
 * DISCOVERY_MISS that the same evidence shows were also never-compiled, not
 * never-discovered. Recorded additively; the V3.1.1 artifacts are not modified.
 */
export const BACKLOG_ATTRIBUTION_CORRECTIONS = [
  { caseId: "CASE-2aa00d5566", wasClassified: "DISCOVERY_MISS", shouldBe: "OTHER / BENCHMARK_HARNESS_COMPILE_CAP", evidence: "doc-a §6.01 has 11 discovery candidates in stage2; none was compiled and only 1 of them appears anywhere in the 47 review packets." },
  { caseId: "CASE-b9ca777174", wasClassified: "DISCOVERY_MISS", shouldBe: "OTHER / BENCHMARK_HARNESS_COMPILE_CAP", evidence: "doc-b §6.01 has 7 discovery candidates in stage2; none appears in any packet and none was compiled." },
  { caseId: "CASE-8c29f13dc0", wasClassified: "DISCOVERY_MISS", shouldBe: "OTHER / BENCHMARK_HARNESS_COMPILE_CAP", evidence: "doc-d §6.01 has 4 discovery candidates in stage2, one of which describes the general prohibition explicitly; none appears in any packet." },
  { caseId: "CASE-641203d620", wasClassified: "DISCOVERY_MISS", shouldBe: "OTHER / BENCHMARK_HARNESS_COMPILE_CAP", evidence: "doc-a §6.04 has 5 discovery candidates in stage2; none was compiled." },
  { caseId: "CASE-90415d6765", wasClassified: "DISCOVERY_MISS", shouldBe: "OTHER / BENCHMARK_HARNESS_COMPILE_CAP", evidence: "doc-a §6.08 has 5 discovery candidates in stage2; none was compiled." },
];
