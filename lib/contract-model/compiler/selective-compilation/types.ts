export const SELECTIVE_PLANNER_VERSION = "selective-compilation-planner.v1";

export type PlanInclusionReason =
  | "SEED_CANDIDATE"
  | "GOVERNING_PROHIBITION"
  | "EXCEPTION_OR_PROVISO"
  | "DEFINITION_DEPENDENCY"
  | "AMENDMENT_EFFECT"
  | "SHARED_CAPACITY"
  | "CROSS_DOCUMENT_RESTRICTION"
  | "CROSS_REFERENCE_CLOSURE"
  | "ENTITY_SCOPE_CONTEXT";

export interface PlanUnit {
  unitId: string;
  documentId: string | null;
  sectionRef: string | null;
  text: string;
  reasons: PlanInclusionReason[];
  dependencyOf: string[];
  factIds: string[];
}

export interface OmittedSourceAudit {
  sourceId: string;
  documentId: string | null;
  sectionRef: string | null;
  whyOmitted: string;
  independentlyReviewed: true;
}

export interface SelectiveCompilationPlan {
  version: typeof SELECTIVE_PLANNER_VERSION;
  seedCandidateRefs: string[];
  units: PlanUnit[];
  /** Units selected for semantic compilation (not the full inventory). */
  compileUnitIds: string[];
  omitted: OmittedSourceAudit[];
  stats: {
    inventoryCount: number;
    legallyRelevantCount: number;
    compileCount: number;
    omittedCount: number;
    modelInputChars: number;
    fullInventoryChars: number;
    reductionRatio: number;
  };
  notes: string[];
}
