/**
 * Phase 2F.1 §8/§14/§15 - package-level structural-safety propagation.
 *
 * A pure aggregator, not a new pipeline stage: it reads structural-
 * coverage.ts's own per-document health (itself derived only from Phase
 * 2A's node list - task §8's "explicit upstream uncertainty/error"
 * signal) alongside Phase 2B's own discovery candidate count and Phase
 * 2C's own document classification, and rolls them into one package-
 * level safety verdict. It never mutates or gates Phase 2B/2D
 * themselves (task §8's own "do not necessarily block processing of
 * other healthy documents") - a caller consults this alongside the
 * primary pipeline's own output, the same way a caller already consults
 * Phase 2E's findings alongside Phase 2B/2D's own conclusions.
 *
 * Amendment detection for §15 deliberately does NOT rely solely on
 * Phase 2C's own DocumentType classification, because Phase 2F's own
 * dedicated diagnosis found that classifier can be wrong for exactly
 * this kind of document (the real Second Amendment and Omnibus
 * Amendment were both misclassified as base-agreement types) - a defect
 * this task explicitly does not fix. Corroborating with an independent
 * raw-text amendment-signal scan (signals.ts's own AMENDMENT category)
 * means this safety check still works correctly even while that
 * separate, known Phase 2C defect remains open.
 */
import { detectAmendmentAndDefinitionalSignals } from "./coverage-audit/signals";
import type { StructuralCoverageResult } from "./structural-coverage";

const AMENDMENT_DOCUMENT_TYPES = new Set(["AMENDMENT", "AMENDED_AND_RESTATED_AGREEMENT", "SUPPLEMENTAL_INDENTURE", "JOINDER"]);

export type PackageSafetyState = "PACKAGE_SAFE" | "PACKAGE_REVIEW_REQUIRED" | "PACKAGE_UNSAFE";

export interface DocumentSafetyEntry {
  documentId: string;
  structuralHealth: StructuralCoverageResult["health"];
  coveragePercent: number;
  discoveryCandidateCount: number;
  /** True when Phase 2A's own structural health is not good enough to trust an absence of findings for this document (task §8's own "STRUCTURAL_INPUT_INSUFFICIENT or equivalent"). */
  structuralInputInsufficient: boolean;
  /** Corroborated from Phase 2C's own classification OR an independent raw-text amendment-signal scan (see module header) - true if either source suggests this document is an amendment/restatement/supplement/joinder. */
  likelyAmendment: boolean;
  /** Task §15's own exact signal name - true only when likelyAmendment AND structuralInputInsufficient both hold. */
  potentiallyRelevantAmendmentNotFullyAnalyzed: boolean;
}

export interface PackageSafetyResult {
  packageKey: string;
  documents: DocumentSafetyEntry[];
  state: PackageSafetyState;
  reasons: string[];
  /** Task §14's own example phrasing, computed exactly: "N of M documents were not structurally analyzed successfully." */
  summarySentence: string;
}

export interface DocumentSafetyInput {
  documentId: string;
  documentText: string;
  coverage: StructuralCoverageResult;
  discoveryCandidateCount: number;
  declaredDocumentType?: string | null;
}

export function computePackageSafety(packageKey: string, inputs: DocumentSafetyInput[]): PackageSafetyResult {
  const documents: DocumentSafetyEntry[] = inputs.map((d) => {
    const structuralInputInsufficient = d.coverage.health === "STRUCTURE_FAILED" || d.coverage.health === "STRUCTURE_INSUFFICIENT";
    const classifiedAsAmendment = d.declaredDocumentType != null && AMENDMENT_DOCUMENT_TYPES.has(d.declaredDocumentType);
    const rawAmendmentSignal = detectAmendmentAndDefinitionalSignals(d.documentText.slice(0, 4000)).some((s) => s.category === "AMENDMENT");
    const likelyAmendment = classifiedAsAmendment || rawAmendmentSignal;
    return {
      documentId: d.documentId,
      structuralHealth: d.coverage.health,
      coveragePercent: d.coverage.coveragePercent,
      discoveryCandidateCount: d.discoveryCandidateCount,
      structuralInputInsufficient,
      likelyAmendment,
      potentiallyRelevantAmendmentNotFullyAnalyzed: likelyAmendment && structuralInputInsufficient,
    };
  });

  const failedOrInsufficientCount = documents.filter((d) => d.structuralInputInsufficient).length;
  const dangerousAmendments = documents.filter((d) => d.potentiallyRelevantAmendmentNotFullyAnalyzed);
  const reasons: string[] = [];
  let state: PackageSafetyState = "PACKAGE_SAFE";

  if (dangerousAmendments.length > 0) {
    state = "PACKAGE_UNSAFE";
    reasons.push(`${dangerousAmendments.length} document(s) are POTENTIALLY_RELEVANT_AMENDMENT_NOT_FULLY_ANALYZED: ${dangerousAmendments.map((d) => d.documentId).join(", ")} - an amendment-shaped document with insufficient structural coverage may alter otherwise correctly analyzed base language without Headroom having seen the change.`);
  } else if (failedOrInsufficientCount > 0) {
    state = "PACKAGE_REVIEW_REQUIRED";
    reasons.push(`${failedOrInsufficientCount} of ${documents.length} document(s) have insufficient structural coverage but are not amendment-shaped.`);
  } else {
    reasons.push("All documents reached STRUCTURE_HEALTHY or STRUCTURE_PARTIAL with no significant unresolved coverage gaps.");
  }

  return {
    packageKey,
    documents,
    state,
    reasons,
    summarySentence: `${failedOrInsufficientCount} of ${documents.length} documents were not structurally analyzed successfully.`,
  };
}
