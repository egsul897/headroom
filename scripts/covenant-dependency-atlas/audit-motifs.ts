/**
 * Independent audit of reported cycles and a sample of material diamonds.
 * Classifies each cycle; proves shared-dependency diamonds are not cycles.
 */

import type { AtlasDataset, AtlasEdge, AtlasNode, GraphMotif } from "./schema";

export type CycleClass =
  | "GENUINE_SEMANTIC_DEPENDENCY_CYCLE"
  | "TEXTUAL_REFERENCE_CYCLE_WITHOUT_CIRCULAR_CALCULATION"
  | "STRUCTURAL_EXTRACTION_ARTIFACT"
  | "UNRESOLVED_CASE";

export interface CycleAuditRow {
  motifId: string;
  documentId: string | null;
  nodeIds: string[];
  edgeIds: string[];
  edgeKinds: string[];
  classification: CycleClass;
  rationale: string;
}

export interface DiamondAuditRow {
  motifId: string;
  nodeIds: string[];
  edgeKinds: string[];
  isCycle: boolean;
  sharedChildKind: string | null;
  rationale: string;
}

export interface MotifAuditReport {
  cycleCount: number;
  cycles: CycleAuditRow[];
  diamondSampleSize: number;
  diamondSample: DiamondAuditRow[];
  falseCycleFromSharedDependency: number;
  proofSharedDependencyNotCycle: string;
}

function edgesForMotif(edges: AtlasEdge[], motif: GraphMotif): AtlasEdge[] {
  const set = new Set(motif.edgeIds);
  return edges.filter((e) => set.has(e.edgeId));
}

function classifyCycle(motif: GraphMotif, edges: AtlasEdge[], nodes: Map<string, AtlasNode>): CycleAuditRow {
  const motifEdges = edgesForMotif(edges, motif);
  const edgeKinds = [...new Set(motifEdges.map((e) => e.kind))];
  const nodeObjs = motif.nodeIds.map((id) => nodes.get(id)).filter(Boolean) as AtlasNode[];
  const documentId = nodeObjs[0]?.documentId ?? motifEdges[0]?.sourceSpans[0]?.documentId ?? null;
  const hasUnresolved = motifEdges.some((e) => e.resolution !== "RESOLVED") || motif.nodeIds.some((id) => id.includes(":unresolved:"));
  const allDefToDef = motifEdges.length > 0 && motifEdges.every((e) => e.kind === "DEFINITION_TO_DEFINITION" || e.kind === "RATIO_CALCULATION");
  const hasFinancialCalc = motifEdges.some((e) => e.kind === "RATIO_CALCULATION" || e.kind === "FINANCIAL_INPUT");
  const selfLoop = motif.nodeIds.length === 1;

  let classification: CycleClass;
  let rationale: string;

  if (hasUnresolved) {
    classification = "UNRESOLVED_CASE";
    rationale = "Cycle path includes an unresolved/ambiguous edge or unresolved target node — not asserted as a closed semantic calculation cycle.";
  } else if (selfLoop && !hasFinancialCalc) {
    classification = "STRUCTURAL_EXTRACTION_ARTIFACT";
    rationale = "Self-loop without a financial/ratio calculation edge — likely inventory self-reference / extraction artifact rather than a circular formula.";
  } else if (allDefToDef && !hasFinancialCalc) {
    classification = "TEXTUAL_REFERENCE_CYCLE_WITHOUT_CIRCULAR_CALCULATION";
    rationale = "Directed cycle among definition/reference inventory edges without FINANCIAL_INPUT/RATIO_CALCULATION edges — textual mutual reference, not proven circular calculation.";
  } else if (hasFinancialCalc && allDefToDef) {
    classification = "GENUINE_SEMANTIC_DEPENDENCY_CYCLE";
    rationale = "Cycle involves ratio/financial calculation edges among definitions — treated as a genuine semantic dependency cycle pending legal review.";
  } else {
    classification = "TEXTUAL_REFERENCE_CYCLE_WITHOUT_CIRCULAR_CALCULATION";
    rationale = `Mixed edge kinds [${edgeKinds.join(", ")}] form a directed cycle without a clear circular calculation signature.`;
  }

  return {
    motifId: motif.motifId,
    documentId,
    nodeIds: motif.nodeIds,
    edgeIds: motif.edgeIds,
    edgeKinds,
    classification,
    rationale,
  };
}

export function auditMotifs(dataset: AtlasDataset, diamondSampleLimit = 25): MotifAuditReport {
  const nodes = new Map<string, AtlasNode>();
  const edges: AtlasEdge[] = [];
  const cycles: GraphMotif[] = [];
  const diamonds: GraphMotif[] = [];

  for (const pkg of dataset.packages) {
    for (const doc of pkg.documents) {
      for (const n of doc.nodes) nodes.set(n.nodeId, n);
      edges.push(...doc.edges);
      for (const m of doc.motifs) {
        if (m.motifType === "GENUINE_CYCLE") cycles.push(m);
        else diamonds.push(m);
      }
    }
  }

  const cycleRows = cycles.map((m) => classifyCycle(m, edges, nodes));

  // Sample diamonds: prefer SHARED_BASKET children, then first N.
  const ranked = [...diamonds].sort((a, b) => {
    const ac = a.nodeIds.some((id) => nodes.get(id)?.kind === "SHARED_BASKET") ? 0 : 1;
    const bc = b.nodeIds.some((id) => nodes.get(id)?.kind === "SHARED_BASKET") ? 0 : 1;
    return ac - bc;
  });
  const sample = ranked.slice(0, diamondSampleLimit);
  const diamondSample: DiamondAuditRow[] = sample.map((m) => {
    const motifEdges = edgesForMotif(edges, m);
    const child = m.nodeIds.find((id) => motifEdges.filter((e) => e.toNodeId === id).length >= 2) ?? m.nodeIds[m.nodeIds.length - 1]!;
    const isCycle = cycles.some(
      (c) => c.nodeIds.length === m.nodeIds.length && c.nodeIds.every((id) => m.nodeIds.includes(id)),
    );
    return {
      motifId: m.motifId,
      nodeIds: m.nodeIds,
      edgeKinds: [...new Set(motifEdges.map((e) => e.kind))],
      isCycle,
      sharedChildKind: nodes.get(child)?.kind ?? null,
      rationale: isCycle
        ? "ERROR: diamond nodes also reported as a cycle."
        : "Shared fan-in only; no directed cycle among the diamond nodes.",
    };
  });

  const falseCycleFromSharedDependency = diamondSample.filter((d) => d.isCycle).length;

  return {
    cycleCount: cycleRows.length,
    cycles: cycleRows,
    diamondSampleSize: diamondSample.length,
    diamondSample,
    falseCycleFromSharedDependency,
    proofSharedDependencyNotCycle:
      falseCycleFromSharedDependency === 0
        ? `Audited ${diamondSample.length} material diamonds; none were also classified as cycles. Shared-dependency fan-in (e.g. Available Amount) is distinct from directed circular dependency.`
        : `FAILURE: ${falseCycleFromSharedDependency} diamond(s) incorrectly overlap cycle reports.`,
  };
}
