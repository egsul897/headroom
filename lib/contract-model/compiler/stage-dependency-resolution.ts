/**
 * Phase C Stage 5 - DEPENDENCY + CROSS-REFERENCE RESOLUTION (task §22/§23).
 * Deterministic, not an LLM call: real evidence from this same session
 * (the FWRG single-call run extracted zero relationships and inconsistent
 * cross-referencing when asked to do it "as part of" a combined call) plus
 * cost-consciousness (task §59 - "not resending entire document") both favor
 * a plain regex scan here, exactly like STRUCTURE. Resolves two things:
 * (1) each extracted rule's own definedTermRefs against the real,
 * already-inventoried DefinedTerm set; (2) real cross-reference PHRASES in
 * the source text ("subject to Section X", "as defined in...", "pursuant to
 * clause (b)", "notwithstanding...") against real structural nodes, so an
 * unresolved reference is a first-class, reported fact (task §23), never a
 * silently dropped one.
 */
import type { CandidateContractRule, CandidateContractReference, CandidateDefinedTerm } from "../types";
import type { StructuralNode } from "./types";

export type DependencyResolutionState = "RESOLVED" | "UNRESOLVED" | "UNSUPPORTED" | "REVIEW_REQUIRED";

export interface RuleDependencyResolution {
  ruleSourceSectionRef: string;
  termRef: string;
  state: DependencyResolutionState;
}

// Mapped onto the real, closed ContractReferenceType Postgres enum
// (prisma/schema.prisma) - never a made-up string, since this candidate
// output is meant to map directly into a real ContractReferenceEdge row.
const CROSS_REF_PATTERNS: { type: CandidateContractReference["referenceType"]; re: RegExp }[] = [
  { type: "SUBJECT_TO", re: /subject to (?:Section|§)\s*([\d.()a-z]+)/gi },
  { type: "REQUIRES", re: /pursuant to (?:Section|§|clause)\s*([\d.()a-z]+)/gi },
  { type: "EXCEPT_AS_PROVIDED_IN", re: /except (?:as )?pursuant to (?:Section|§|clause)\s*([\d.()a-z]+)/gi },
  { type: "DEFINED_IN", re: /as defined in (?:Section|§)\s*([\d.()a-z]+)/gi },
  { type: "OVERRIDES", re: /notwithstanding (?:the foregoing|anything (?:herein|to the contrary)|Section\s*([\d.()a-z]+))/gi },
];

function sectionExists(ref: string, nodes: StructuralNode[]): boolean {
  const norm = ref.replace(/\s+/g, "");
  return nodes.some((n) => n.sectionRef.replace(/\s+/g, "") === norm || norm.startsWith(n.sectionRef.replace(/\s+/g, "")));
}

export function resolveDefinedTermDependencies(rules: CandidateContractRule[], definedTerms: CandidateDefinedTerm[]): RuleDependencyResolution[] {
  const termNames = new Set(definedTerms.map((t) => t.termName.toLowerCase()));
  const out: RuleDependencyResolution[] = [];
  for (const rule of rules) {
    for (const termRef of rule.definedTermRefs) {
      const state: DependencyResolutionState = termNames.has(termRef.toLowerCase()) ? "RESOLVED" : "UNRESOLVED";
      out.push({ ruleSourceSectionRef: rule.sourceSectionRef, termRef, state });
    }
  }
  return out;
}

export function detectCrossReferences(documentId: string, text: string, structuralNodes: StructuralNode[]): CandidateContractReference[] {
  const refs: CandidateContractReference[] = [];
  const docNodes = structuralNodes.filter((n) => n.documentId === documentId);
  for (const { type, re } of CROSS_REF_PATTERNS) {
    const pattern = new RegExp(re.source, re.flags);
    let m: RegExpExecArray | null;
    while ((m = pattern.exec(text)) !== null) {
      const targetRef = (m[1] ?? "").trim();
      const resolved = targetRef.length > 0 && sectionExists(targetRef, docNodes);
      refs.push({
        referenceType: type,
        referenceText: m[0],
        targetSectionRef: targetRef.length > 0 ? targetRef : undefined,
        sourceSectionRef: undefined,
      });
      void resolved; // resolution status is derived again by the caller against the persisted DocumentNode set (service.ts), not embedded here - this stage's job is detection, not final resolution recording.
      if (m.index === pattern.lastIndex) pattern.lastIndex++;
    }
  }
  return refs;
}
