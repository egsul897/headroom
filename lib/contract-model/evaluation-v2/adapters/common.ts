/**
 * Evaluation Methodology V2 — dataset adapter helpers.
 *
 * Phase 3F.1.5. Adapters map frozen artifacts into the canonical evaluation
 * model. They are the ONLY place that touches the filesystem; the engine
 * itself is pure and takes plain data, exactly so it can be exercised against
 * synthetic fixtures with no real package in sight.
 *
 * Every derived field below (family, objects, actions, posture, role, scope,
 * figures, conditions) is computed by THIS evaluator from the provision's own
 * words on BOTH sides. A producing system's own label is preserved verbatim
 * for audit (`declaredFamily`, `provisionRoleDeclared`) but never treated as
 * truth.
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

import {
  classifyFamily,
  extractActions,
  extractConditions,
  extractCrossReferences,
  extractExceptions,
  extractInstruments,
  extractObjects,
  extractPosture,
  extractProvisionBreadth,
  extractProvisionRole,
  extractSignals,
  extractScope,
} from "../signals";
import type {
  CandidateAccountingRole,
  CandidateRepresentationType,
  CandidateSemanticRepresentation,
  EvaluationMateriality,
  GroundTruthAdjudicationProvenance,
  GroundTruthSemanticUnit,
  NumericFigure,
} from "../types";

export function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf-8")) as T;
}

export function fileHash(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

export function figuresFrom(text: string): NumericFigure[] {
  const s = extractSignals({ text });
  return [...s.amounts, ...s.percentages, ...s.ratios];
}

export interface GroundTruthUnitDraft {
  gtUnitId: string;
  datasetKey: string;
  packageKey: string;
  documentId: string;
  sectionRef: string;
  articleRef: string | null;
  sourceExcerpt: string;
  sourceExcerptResolution: GroundTruthSemanticUnit["sourceExcerptResolution"];
  semanticDescription: string;
  materiality: EvaluationMateriality;
  unitType: string;
  referencedDefinedTerms: string[];
  materialDependencies: string[];
  operativeStateAssumption: string;
  adjudication: GroundTruthAdjudicationProvenance;
  notes: string | null;
}

export function buildGroundTruthUnit(draft: GroundTruthUnitDraft): GroundTruthSemanticUnit {
  const text = [draft.sourceExcerpt, draft.semanticDescription, draft.notes ?? ""].filter(Boolean).join("\n");
  const posture = extractPosture(text, draft.unitType);
  const provisionRole = extractProvisionRole({ text, declaredType: draft.unitType, posture });
  return {
    ...draft,
    semanticFamily: classifyFamily(text),
    provisionRole,
    provisionBreadth: extractProvisionBreadth({ text, declaredType: draft.unitType, posture, role: provisionRole }),
    action: extractActions(text),
    legalPosture: posture,
    objectResource: extractObjects(text),
    scope: extractScope(text),
    instrument: extractInstruments(text),
    figures: figuresFrom(text),
    conditions: extractConditions(text),
    exceptions: extractExceptions(text),
    crossReferences: extractCrossReferences(text),
  };
}

export interface CandidateDraft {
  candidateId: string;
  datasetKey: string;
  packageKey: string;
  documentId: string;
  sectionRef: string | null;
  representationType: CandidateRepresentationType;
  accountingRole: CandidateAccountingRole;
  excerpts: string[];
  normalizedSemantics: string;
  provisionRoleDeclared: string | null;
  declaredFamily: string | null;
  formulaSemantics: string | null;
  dependencyRefs: string[];
  referencedDefinedTerms: string[];
  selfReportedState: CandidateSemanticRepresentation["selfReportedState"];
  operativeProvenance: CandidateSemanticRepresentation["operativeProvenance"];
  provenancePath: string;
  /** Structured entity scope the producing system recorded, merged with what the text itself says. */
  declaredScope?: string[];
}

export function buildCandidate(draft: CandidateDraft): CandidateSemanticRepresentation {
  const text = [...draft.excerpts, draft.normalizedSemantics, draft.formulaSemantics ?? "", ...(draft.declaredScope ?? [])].filter(Boolean).join("\n");
  const posture = extractPosture(text, draft.provisionRoleDeclared);
  const provisionRole = extractProvisionRole({ text, declaredType: draft.provisionRoleDeclared, posture });
  return {
    candidateId: draft.candidateId,
    datasetKey: draft.datasetKey,
    packageKey: draft.packageKey,
    documentId: draft.documentId,
    sectionRef: draft.sectionRef,
    representationType: draft.representationType,
    accountingRole: draft.accountingRole,
    excerpts: draft.excerpts,
    normalizedSemantics: draft.normalizedSemantics,
    provisionRole,
    provisionBreadth: extractProvisionBreadth({ text, declaredType: draft.provisionRoleDeclared, posture, role: provisionRole }),
    provisionRoleDeclared: draft.provisionRoleDeclared,
    legalPosture: posture,
    action: extractActions(text),
    objectResource: extractObjects(text),
    scope: extractScope(text),
    instrument: extractInstruments(text),
    figures: figuresFrom(text),
    conditions: extractConditions(text),
    exceptions: extractExceptions(text),
    formulaSemantics: draft.formulaSemantics,
    dependencyRefs: draft.dependencyRefs,
    crossReferences: extractCrossReferences(text),
    referencedDefinedTerms: draft.referencedDefinedTerms,
    semanticFamily: classifyFamily(text),
    declaredFamily: draft.declaredFamily,
    selfReportedState: draft.selfReportedState,
    operativeProvenance: draft.operativeProvenance,
    provenancePath: draft.provenancePath,
  };
}

export const EMPTY_SELF_REPORT: CandidateSemanticRepresentation["selfReportedState"] = {
  sufficiency: null,
  coverageState: null,
  reviewStatus: null,
  unresolvedReasons: [],
  verifierFindings: [],
  flaggedDangerousUnaccounted: false,
};

/**
 * A candidate with no content text at all cannot demonstrate correspondence to
 * anything, and therefore cannot grant credit or account for a claim under the
 * V2 rules. Dropping such candidates before the semantic layers is exactly
 * recall-neutral; the count is reported in the run artifacts so the filter is
 * visible rather than silent.
 */
export function hasContent(candidate: CandidateSemanticRepresentation): boolean {
  return candidate.excerpts.some((e) => e.trim().length > 0) || candidate.normalizedSemantics.trim().length > 0;
}
