/**
 * Phase C Stage 10 - COVERAGE / NEGATIVE DETECTION (task §37-41). Compares
 * the INDEPENDENT structural/material-provision inventory (stage 3) against
 * what actually got modeled - never LLM self-confidence (task §41).
 *
 * Task §38 explicitly requires NOT reproducing C0's own evaluator mistake,
 * where a term present in definedTerms[] was scored MISSING because the
 * evaluator only checked rules[] (docs/phase-c0-analyzer-validation.md §M).
 * This module fixes that generally: a MATERIAL_RULE_CANDIDATE inventory item
 * is credited as modeled if EITHER a ContractRule cites its section OR (for
 * a DEFINITION-classified item, or a rule-classified item whose summary
 * names a term also present in the defined-term output) a DefinedTermNode
 * covers it - checked against BOTH real output arrays, not one.
 */
import type { CandidateContractRule, CandidateDefinedTerm } from "../types";
import type { InventoryStageOutput } from "./schemas";
import type { StageRunResult } from "./types";

export type CoverageDisposition = "MODELED" | "QUALITATIVE_ONLY" | "NOT_APPLICABLE" | "UNSUPPORTED" | "REVIEW_REQUIRED" | "UNHANDLED";

export interface CoverageResultItem {
  sourceSectionRef: string;
  classification: InventoryStageOutput["items"][number]["classification"];
  disposition: CoverageDisposition;
  reason: string;
}

function normalize(ref: string): string {
  return ref.replace(/^§/, "").replace(/^Section\s+/i, "").replace(/\s+/g, "").trim();
}

function sectionModeledByRule(sectionRef: string, rules: CandidateContractRule[]): boolean {
  const norm = normalize(sectionRef);
  return rules.some((r) => {
    const ruleRef = normalize(r.sourceSectionRef ?? "");
    return ruleRef === norm || norm.startsWith(ruleRef) || ruleRef.startsWith(norm);
  });
}

/** Checks BOTH real output arrays (task §38's own fix) - a definition-shaped inventory item can be legitimately covered by a DefinedTerm even with zero ContractRule citing it. */
function sectionModeledByDefinedTerm(sectionRef: string, definedTerms: CandidateDefinedTerm[]): boolean {
  const norm = normalize(sectionRef);
  return definedTerms.some((t) => t.sourceSectionRef && normalize(t.sourceSectionRef) === norm);
}

export function computeCoverage(inventory: InventoryStageOutput, rules: CandidateContractRule[], definedTerms: CandidateDefinedTerm[]): CoverageResultItem[] {
  return inventory.items.map((item): CoverageResultItem => {
    switch (item.classification) {
      case "BOILERPLATE_NOT_APPLICABLE":
        return { sourceSectionRef: item.sourceSectionRef, classification: item.classification, disposition: "NOT_APPLICABLE", reason: "classified boilerplate/not-applicable by the independent inventory" };
      case "DEFINITION": {
        const covered = sectionModeledByDefinedTerm(item.sourceSectionRef, definedTerms) || sectionModeledByRule(item.sourceSectionRef, rules);
        return { sourceSectionRef: item.sourceSectionRef, classification: item.classification, disposition: covered ? "MODELED" : "REVIEW_REQUIRED", reason: covered ? "a DefinedTerm (or ContractRule) cites this section" : "no DefinedTerm or ContractRule cites this definition section - a real gap" };
      }
      case "QUALITATIVE_OBLIGATION": {
        const covered = sectionModeledByRule(item.sourceSectionRef, rules);
        return { sourceSectionRef: item.sourceSectionRef, classification: item.classification, disposition: covered ? "MODELED" : "QUALITATIVE_ONLY", reason: covered ? "a ContractRule cites this qualitative obligation" : "no rule models this qualitative obligation - expected unless a future obligations engine covers it" };
      }
      case "MATERIAL_RULE_CANDIDATE": {
        const coveredByRule = sectionModeledByRule(item.sourceSectionRef, rules);
        const coveredByTerm = sectionModeledByDefinedTerm(item.sourceSectionRef, definedTerms);
        if (coveredByRule) return { sourceSectionRef: item.sourceSectionRef, classification: item.classification, disposition: "MODELED", reason: "a ContractRule cites this section" };
        if (coveredByTerm) return { sourceSectionRef: item.sourceSectionRef, classification: item.classification, disposition: "MODELED", reason: "a DefinedTerm cites this section (fixes the C0 definedTerms[]-scope gap generally, task §38)" };
        return { sourceSectionRef: item.sourceSectionRef, classification: item.classification, disposition: "REVIEW_REQUIRED", reason: "independently inventoried as a material rule candidate but no ContractRule or DefinedTerm cites it - a real, surfaced gap" };
      }
      case "UNCERTAIN":
        return { sourceSectionRef: item.sourceSectionRef, classification: item.classification, disposition: "REVIEW_REQUIRED", reason: "inventory itself was uncertain about this section's classification" };
      case "UNHANDLED":
      default:
        return { sourceSectionRef: item.sourceSectionRef, classification: item.classification, disposition: "UNHANDLED", reason: "inventory classified this section as not fitting any known category" };
    }
  });
}

export function runCoverageStage(inventory: InventoryStageOutput, rules: CandidateContractRule[], definedTerms: CandidateDefinedTerm[]): StageRunResult<CoverageResultItem[]> {
  const results = computeCoverage(inventory, rules, definedTerms);
  const gaps = results.filter((r) => r.disposition === "REVIEW_REQUIRED" || r.disposition === "UNHANDLED");
  return {
    status: gaps.length > 0 ? "REVIEW_REQUIRED" : "COMPLETED",
    output: results,
    notes: gaps.length > 0 ? gaps.map((g) => `${g.sourceSectionRef}: ${g.disposition} - ${g.reason}`) : undefined,
  };
}
