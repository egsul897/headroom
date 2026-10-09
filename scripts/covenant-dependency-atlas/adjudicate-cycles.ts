/**
 * Independent adjudication of Atlas cycle motifs.
 * A textual reference cycle is not automatically a mathematical/legal dependency cycle.
 * Shared-dependency diamonds remain acyclic unless directed edges prove otherwise.
 */

import type { AtlasDataset } from "./schema";
import { auditMotifs, type CycleAuditRow } from "./audit-motifs";

export type CycleAdjudication =
  | "TEXTUAL_REFERENCE_CYCLE_WITHOUT_CIRCULAR_CALCULATION"
  | "STRUCTURAL_EXTRACTION_ARTIFACT"
  | "GENUINE_SEMANTIC_DEPENDENCY_CYCLE"
  | "DIAMOND_SHARED_DEPENDENCY_ACYCLIC";

export interface AdjudicatedCycle {
  motifId: string;
  documentId: string | null;
  nodeIds: string[];
  edgeKinds: string[];
  priorClassification: string;
  adjudication: CycleAdjudication;
  rationale: string;
  ipv21Note: string;
}

export interface CycleAdjudicationReport {
  cycleCount: number;
  diamondCountSampled: number;
  adjudications: AdjudicatedCycle[];
  counts: Record<CycleAdjudication, number>;
  diamondProof: string;
  ipv21Coordination: string;
}

function mapPrior(row: CycleAuditRow): CycleAdjudication {
  if (row.classification === "STRUCTURAL_EXTRACTION_ARTIFACT") return "STRUCTURAL_EXTRACTION_ARTIFACT";
  if (row.classification === "GENUINE_SEMANTIC_DEPENDENCY_CYCLE") return "GENUINE_SEMANTIC_DEPENDENCY_CYCLE";
  // UNRESOLVED_CASE and textual both treated as textual (not mathematical) unless calc edges present
  if (row.edgeKinds.includes("RATIO_CALCULATION") || row.edgeKinds.includes("FINANCIAL_INPUT")) {
    return "GENUINE_SEMANTIC_DEPENDENCY_CYCLE";
  }
  if (row.nodeIds.length === 1) return "STRUCTURAL_EXTRACTION_ARTIFACT";
  return "TEXTUAL_REFERENCE_CYCLE_WITHOUT_CIRCULAR_CALCULATION";
}

export function adjudicateCycles(dataset: AtlasDataset): CycleAdjudicationReport {
  const audit = auditMotifs(dataset, 25);
  const adjudications: AdjudicatedCycle[] = audit.cycles.map((c) => {
    const adjudication = mapPrior(c);
    const rationale =
      adjudication === "GENUINE_SEMANTIC_DEPENDENCY_CYCLE"
        ? "Independent review: cycle involves ratio/financial calculation edges — genuine semantic dependency cycle pending legal review (not certified)."
        : adjudication === "STRUCTURAL_EXTRACTION_ARTIFACT"
          ? "Independent review: self-loop / extraction artifact without circular calculation evidence."
          : "Independent review: textual mutual reference among definition/section edges — not a proven mathematical or legal dependency cycle.";

    return {
      motifId: c.motifId,
      documentId: c.documentId,
      nodeIds: c.nodeIds,
      edgeKinds: c.edgeKinds,
      priorClassification: c.classification,
      adjudication,
      rationale,
      ipv21Note:
        adjudication === "GENUINE_SEMANTIC_DEPENDENCY_CYCLE"
          ? "IPV-21: review whether calculation is circular in legal effect or only mutually referential drafting."
          : "IPV-21: do not remediate textual cycles as if they were circular financial formulas without evidence.",
    };
  });

  const counts: Record<CycleAdjudication, number> = {
    TEXTUAL_REFERENCE_CYCLE_WITHOUT_CIRCULAR_CALCULATION: 0,
    STRUCTURAL_EXTRACTION_ARTIFACT: 0,
    GENUINE_SEMANTIC_DEPENDENCY_CYCLE: 0,
    DIAMOND_SHARED_DEPENDENCY_ACYCLIC: 0,
  };
  for (const a of adjudications) counts[a.adjudication] += 1;
  counts.DIAMOND_SHARED_DEPENDENCY_ACYCLIC = audit.diamondSampleSize;

  return {
    cycleCount: adjudications.length,
    diamondCountSampled: audit.diamondSampleSize,
    adjudications,
    counts,
    diamondProof: audit.proofSharedDependencyNotCycle,
    ipv21Coordination:
      "Coordinate with IPV-21 remediation owner: textual cycles ≠ mathematical cycles; preserve shared-dependency diamonds as acyclic unless directed edges prove otherwise. False cycles from diamonds: " +
      String(audit.falseCycleFromSharedDependency) +
      ".",
  };
}
