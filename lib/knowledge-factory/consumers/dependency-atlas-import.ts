/**
 * Independent Dependency Atlas consumer import against CKF canonical export.
 * Upserts nodes/edges by id; second pass must be idempotent; never promotes legal truth.
 */

import type {
  CanonicalConsumerExport,
  ConsumerDependencyEdge,
  ConsumerSourceRecord,
  ConsumerStructuralNode,
} from "../export/consumer-contract";

export const DEPENDENCY_ATLAS_ADAPTER_VERSION = "covenant-dependency-atlas-ckf-import.v1";

export interface AtlasImportedNode {
  nodeId: string;
  sourceId: string;
  kind: string;
  label: string;
  sectionRef?: string;
  charStart?: number;
  charEnd?: number;
  documentId: string;
}

export interface AtlasImportedEdge {
  edgeId: string;
  kind: string;
  fromNodeId: string;
  toNodeId: string;
  sourceId: string;
  resolution: "UNRESOLVED" | "AMBIGUOUS" | "RESOLVED";
  rationale: string;
  sourceSpans: Array<{
    sourceId: string;
    charStart: number;
    charEnd: number;
    excerpt: string;
    sectionRef?: string;
  }>;
  legalTruth: false;
}

export interface AtlasImportResult {
  consumer: "Dependency Atlas";
  adapterVersion: typeof DEPENDENCY_ATLAS_ADAPTER_VERSION;
  ok: boolean;
  pass: 1 | 2;
  sourceVersionId: string;
  sourcesUpserted: number;
  sourcesSkipped: number;
  nodesUpserted: number;
  nodesSkipped: number;
  edgesUpserted: number;
  edgesSkipped: number;
  canonicalSourceIds: string[];
  idempotent: boolean;
  promotedToLegalTruth: 0;
  errors: string[];
}

export class DependencyAtlasImportStore {
  sources = new Map<string, ConsumerSourceRecord>();
  nodes = new Map<string, AtlasImportedNode>();
  edges = new Map<string, AtlasImportedEdge>();

  importFromCanonical(exportDoc: CanonicalConsumerExport, pass: 1 | 2): AtlasImportResult {
    const errors: string[] = [];
    let sourcesUpserted = 0;
    let sourcesSkipped = 0;
    let nodesUpserted = 0;
    let nodesSkipped = 0;
    let edgesUpserted = 0;
    let edgesSkipped = 0;

    for (const s of exportDoc.sources) {
      if (this.sources.has(s.sourceId)) {
        sourcesSkipped += 1;
        continue;
      }
      this.sources.set(s.sourceId, s);
      sourcesUpserted += 1;
    }

    for (const n of exportDoc.structuralNodes as ConsumerStructuralNode[]) {
      if (this.nodes.has(n.nodeId)) {
        nodesSkipped += 1;
        continue;
      }
      if (!this.sources.has(n.sourceId)) {
        errors.push(`node ${n.nodeId} missing source ${n.sourceId}`);
        continue;
      }
      this.nodes.set(n.nodeId, {
        nodeId: n.nodeId,
        sourceId: n.sourceId,
        kind: n.nodeType,
        label: n.heading || n.sectionRef || n.nodeId,
        sectionRef: n.sectionRef,
        charStart: n.charStart,
        charEnd: n.charEnd,
        documentId: n.sourceId,
      });
      nodesUpserted += 1;
    }

    for (const e of exportDoc.dependencyEdges as ConsumerDependencyEdge[]) {
      if (this.edges.has(e.edgeId)) {
        edgesSkipped += 1;
        continue;
      }
      if (!this.sources.has(e.sourceId)) {
        errors.push(`edge ${e.edgeId} missing source ${e.sourceId}`);
        continue;
      }
      const fromNodeId = e.fromNodeId ?? `span:${e.sourceId}:${e.charStart}`;
      if (!this.nodes.has(fromNodeId)) {
        // Materialize a span node so atlas graph remains importable without inventing legal resolution.
        this.nodes.set(fromNodeId, {
          nodeId: fromNodeId,
          sourceId: e.sourceId,
          kind: "CROSS_REFERENCE_SPAN",
          label: e.rawReference,
          charStart: e.charStart,
          charEnd: e.charEnd,
          documentId: e.sourceId,
        });
        nodesUpserted += 1;
      }
      const toNodeId = `ref:${e.sourceId}:${e.rawReference.slice(0, 80)}`;
      if (!this.nodes.has(toNodeId)) {
        this.nodes.set(toNodeId, {
          nodeId: toNodeId,
          sourceId: e.sourceId,
          kind: "CROSS_REFERENCE_TARGET",
          label: e.rawReference,
          documentId: e.sourceId,
        });
        nodesUpserted += 1;
      }
      this.edges.set(e.edgeId, {
        edgeId: e.edgeId,
        kind: e.kind,
        fromNodeId,
        toNodeId,
        sourceId: e.sourceId,
        resolution: e.resolution,
        rationale: `CKF structural cross-reference: ${e.rawReference}`,
        sourceSpans: [
          {
            sourceId: e.sourceId,
            charStart: e.charStart,
            charEnd: e.charEnd,
            excerpt: e.rawReference,
          },
        ],
        legalTruth: false,
      });
      edgesUpserted += 1;
    }

    const idempotent =
      pass === 2 && sourcesUpserted === 0 && nodesUpserted === 0 && edgesUpserted === 0 && errors.length === 0;

    return {
      consumer: "Dependency Atlas",
      adapterVersion: DEPENDENCY_ATLAS_ADAPTER_VERSION,
      ok: errors.length === 0,
      pass,
      sourceVersionId: exportDoc.sourceVersionId,
      sourcesUpserted,
      sourcesSkipped,
      nodesUpserted,
      nodesSkipped,
      edgesUpserted,
      edgesSkipped,
      canonicalSourceIds: [...this.sources.keys()].sort(),
      idempotent,
      promotedToLegalTruth: 0,
      errors,
    };
  }
}

export function runDependencyAtlasImport(exportDoc: CanonicalConsumerExport): {
  pass1: AtlasImportResult;
  pass2: AtlasImportResult;
  sharedSourceIdsWithExport: boolean;
  sharedSourceIdsWithPeer: (peerIds: string[]) => boolean;
} {
  const store = new DependencyAtlasImportStore();
  const pass1 = store.importFromCanonical(exportDoc, 1);
  const pass2 = store.importFromCanonical(exportDoc, 2);
  const exportIds = new Set(exportDoc.sources.map((s) => s.sourceId));
  const sharedSourceIdsWithExport =
    pass1.canonicalSourceIds.length === exportIds.size &&
    pass1.canonicalSourceIds.every((id) => exportIds.has(id));
  return {
    pass1,
    pass2,
    sharedSourceIdsWithExport,
    sharedSourceIdsWithPeer: (peerIds) => {
      const a = new Set(pass1.canonicalSourceIds);
      return peerIds.length === a.size && peerIds.every((id) => a.has(id));
    },
  };
}
