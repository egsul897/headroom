/**
 * Deterministic, source-backed edge extraction from Phase-3F ground-truth
 * inventories. Edges are admitted only when backed by:
 *   - inventory declarations (keyDefinedTerms / unitType / notes cues), or
 *   - explicit legal connectives in the ground-truth description/notes, or
 *   - hand-authored overlays (loaded separately).
 *
 * Never admits an edge solely because two strings co-occur or look similar.
 */

import { readFileSync } from "node:fs";
import { analyzeGraph } from "./graph-analysis";
import { buildCompletenessReport, type CompletenessExpectations } from "./completeness";
import type {
  AtlasDocument,
  AtlasEdge,
  AtlasNode,
  Confidence,
  DependencyEdgeKind,
  EvidenceClass,
  ResolutionStatus,
  SourceSpan,
} from "./schema";
import {
  edgeIdOf,
  nodeIdForCrossDocument,
  nodeIdForFinancialInput,
  nodeIdForTerm,
  nodeIdForUnit,
  nodeIdForUnresolved,
} from "./schema";

export interface GroundTruthUnit {
  unitId: string;
  sectionRef: string;
  unitType: string;
  materiality?: string;
  description: string;
  keyDefinedTerms?: string[];
  notes?: string;
}

export interface GroundTruthDocument {
  documentId: string;
  sourceFile: string;
  articles: { articleRef: string; heading: string; units: GroundTruthUnit[] }[];
}

const COVENANTISH = new Set([
  "COVENANT",
  "BASKET",
  "FINANCIAL_TEST",
  "EXCEPTION",
  "CONDITION",
  "EVENT_OF_DEFAULT",
  "OTHER_OPERATIVE",
  "CROSS_REFERENCE",
]);

/** Explicit legal connectives — presence required for description-derived section edges. */
const SECTION_CONNECTIVES: { re: RegExp; kind: DependencyEdgeKind; label: string }[] = [
  { re: /\bsubject to\b.{0,80}\bSections?\s+([0-9]+\.[0-9]+(?:\([a-z0-9ivx]+\))*)/i, kind: "COVENANT_TO_CONDITION", label: "subject to Section" },
  { re: /\bexcept as (?:provided|set forth|permitted)\b.{0,80}\bSections?\s+([0-9]+\.[0-9]+(?:\([a-z0-9ivx]+\))*)/i, kind: "COVENANT_TO_EXCEPTION", label: "except as provided in Section" },
  { re: /\bpermitted by\b.{0,80}\bSections?\s+([0-9]+\.[0-9]+(?:\([a-z0-9ivx]+\))*)/i, kind: "COVENANT_TO_EXCEPTION", label: "permitted by Section" },
  { re: /\bas (?:amended|modified|restated)\b.{0,80}\b(?:by|in)\b/i, kind: "COVENANT_TO_AMENDMENT", label: "as amended/modified" },
  { re: /\breclassif(?:y|ication|iable)\b/i, kind: "RECLASSIFICATION", label: "reclassification" },
];

const FINANCIAL_INPUT_CUES: { re: RegExp; key: string }[] = [
  { re: /\b[Nn]et [Ii]ncome\b/, key: "NET_INCOME" },
  { re: /\b[Ii]nterest\b.{0,40}\b[Ee]xpense\b/, key: "INTEREST_EXPENSE" },
  { re: /\b[Uu]nrestricted [Cc]ash\b/, key: "UNRESTRICTED_CASH" },
  { re: /\b[Cc]onsolidated [Tt]otal [Aa]ssets\b/, key: "CONSOLIDATED_TOTAL_ASSETS" },
];

function spanForUnit(doc: GroundTruthDocument, unit: GroundTruthUnit, excerpt: string | null): SourceSpan {
  return {
    documentId: doc.documentId,
    sourceFile: doc.sourceFile,
    sectionRef: unit.sectionRef,
    unitId: unit.unitId,
    charStart: null,
    charEnd: null,
    excerpt,
  };
}

function mapUnitKind(unitType: string): AtlasNode["kind"] {
  switch (unitType) {
    case "DEFINITION":
      return "DEFINITION";
    case "COVENANT":
      return "COVENANT";
    case "BASKET":
      return "BASKET";
    case "CONDITION":
      return "CONDITION";
    case "EXCEPTION":
      return "EXCEPTION";
    case "FINANCIAL_TEST":
      return "FINANCIAL_TEST";
    case "EVENT_OF_DEFAULT":
      return "EVENT_OF_DEFAULT";
    default:
      return "OTHER_OPERATIVE";
  }
}

function ensureNode(nodes: Map<string, AtlasNode>, node: AtlasNode): AtlasNode {
  const existing = nodes.get(node.nodeId);
  if (!existing) {
    nodes.set(node.nodeId, node);
    return node;
  }
  // Upgrade DEFINITION → SHARED_BASKET when a later SHARED RESOURCE signal lands.
  if (existing.kind === "DEFINITION" && node.kind === "SHARED_BASKET") {
    const upgraded: AtlasNode = { ...existing, kind: "SHARED_BASKET", notes: node.notes ?? existing.notes };
    nodes.set(node.nodeId, upgraded);
    return upgraded;
  }
  return existing;
}

function addEdge(edges: Map<string, AtlasEdge>, edge: AtlasEdge): void {
  if (!edges.has(edge.edgeId)) edges.set(edge.edgeId, edge);
}

function findDefinitionUnit(units: GroundTruthUnit[], termName: string): GroundTruthUnit | undefined {
  const needle = termName.toLowerCase();
  return units.find(
    (u) =>
      u.unitType === "DEFINITION" &&
      (u.keyDefinedTerms ?? []).some((t) => t.toLowerCase() === needle),
  );
}

function findUnitsBySection(units: GroundTruthUnit[], sectionRef: string): GroundTruthUnit[] {
  const n = sectionRef.toLowerCase();
  return units.filter((u) => u.sectionRef.toLowerCase() === n || u.sectionRef.toLowerCase().startsWith(`${n}(`));
}

export function loadGroundTruthDocument(path: string): GroundTruthDocument {
  return JSON.parse(readFileSync(path, "utf-8")) as GroundTruthDocument;
}

export function allUnits(doc: GroundTruthDocument): GroundTruthUnit[] {
  return doc.articles.flatMap((a) => a.units);
}

function noteSignals(notes: string | undefined): {
  sharedResource: boolean;
  entityScope: boolean;
  crossDocument: boolean;
  reclassification: boolean;
  sharedBasketLabel: string | null;
  crossDocumentTarget: string | null;
} {
  const n = notes ?? "";
  const sharedResource = /SHARED RESOURCE/i.test(n);
  const entityScope = /ENTITY SCOPE|entity-scope/i.test(n);
  const crossDocument = /cross-document/i.test(n);
  const reclassification = /reclassif/i.test(n);
  let sharedBasketLabel: string | null = null;
  const aa = n.match(/Available Amount/i);
  if (sharedResource && aa) sharedBasketLabel = "Available Amount";
  else if (sharedResource) sharedBasketLabel = "SHARED_RESOURCE";
  let crossDocumentTarget: string | null = null;
  const xd = n.match(/cross-reference to the ([^.]+)/i) || n.match(/defined only by cross-reference to the ([^.]+)/i);
  if (xd) crossDocumentTarget = xd[1]!.trim();
  return { sharedResource, entityScope, crossDocument, reclassification, sharedBasketLabel, crossDocumentTarget };
}

export function extractDocumentAtlas(args: {
  packageId: string;
  doc: GroundTruthDocument;
  authoredEdges?: AtlasEdge[];
  authoredNodes?: AtlasNode[];
}): AtlasDocument {
  const { packageId, doc, authoredEdges = [], authoredNodes = [] } = args;
  const units = allUnits(doc);
  const nodes = new Map<string, AtlasNode>();
  const edges = new Map<string, AtlasEdge>();

  for (const unit of units) {
    ensureNode(nodes, {
      nodeId: nodeIdForUnit(doc.documentId, unit.unitId),
      kind: mapUnitKind(unit.unitType),
      documentId: doc.documentId,
      label: unit.unitId,
      sectionRef: unit.sectionRef,
      unitId: unit.unitId,
      termName: unit.unitType === "DEFINITION" ? (unit.keyDefinedTerms?.[0] ?? null) : null,
      materiality: unit.materiality ?? null,
      notes: unit.notes ?? null,
    });
  }
  for (const n of authoredNodes) ensureNode(nodes, n);

  // --- DEFINITION nodes for every inventory-declared term ---
  for (const unit of units) {
    for (const term of unit.keyDefinedTerms ?? []) {
      const defUnit = findDefinitionUnit(units, term);
      ensureNode(nodes, {
        nodeId: nodeIdForTerm(doc.documentId, term),
        kind: "DEFINITION",
        documentId: doc.documentId,
        label: term,
        sectionRef: defUnit?.sectionRef ?? "1.01",
        unitId: defUnit?.unitId ?? null,
        termName: term,
        materiality: defUnit?.materiality ?? null,
        notes: defUnit?.notes ?? null,
      });
    }
  }

  // --- COVENANT_TO_DEFINITION / DEFINITION_TO_DEFINITION from inventory ---
  for (const unit of units) {
    const fromId = nodeIdForUnit(doc.documentId, unit.unitId);
    const terms = unit.keyDefinedTerms ?? [];
    if (terms.length === 0) continue;

    if (unit.unitType === "DEFINITION") {
      const primary = terms[0]!;
      const fromTermId = nodeIdForTerm(doc.documentId, primary);
      for (const other of terms.slice(1)) {
        const toId = nodeIdForTerm(doc.documentId, other);
        const resolved = findDefinitionUnit(units, other) ? "RESOLVED" : "UNRESOLVED";
        let toNodeId = toId;
        if (resolved === "UNRESOLVED") {
          toNodeId = nodeIdForUnresolved(doc.documentId, other);
          ensureNode(nodes, {
            nodeId: toNodeId,
            kind: "UNRESOLVED_TARGET",
            documentId: doc.documentId,
            label: other,
            sectionRef: null,
            unitId: null,
            termName: other,
            materiality: null,
            notes: "Referenced in definition inventory but no DEFINITION unit declares this term as primary/key.",
          });
        }
        addEdge(edges, {
          edgeId: edgeIdOf("DEFINITION_TO_DEFINITION", fromTermId, toNodeId),
          kind: "DEFINITION_TO_DEFINITION",
          fromNodeId: fromTermId,
          toNodeId,
          resolution: resolved as ResolutionStatus,
          confidence: resolved === "RESOLVED" ? "HIGH" : "MEDIUM",
          evidenceClass: "GROUND_TRUTH_INVENTORY_DECLARATION",
          rationale: `Definition unit ${unit.unitId} inventory-lists '${other}' among keyDefinedTerms of '${primary}'.`,
          sourceSpans: [spanForUnit(doc, unit, unit.description.slice(0, 240))],
          unresolvedReason: resolved === "UNRESOLVED" ? `No DEFINITION unit in ${doc.documentId} declares term '${other}'.` : null,
          sharedBasketKey: null,
          financialInputKey: null,
        });
      }
    } else if (COVENANTISH.has(unit.unitType)) {
      for (const term of terms) {
        const defUnit = findDefinitionUnit(units, term);
        const toId = nodeIdForTerm(doc.documentId, term);
        const resolution: ResolutionStatus = defUnit ? "RESOLVED" : "UNRESOLVED";
        let toNodeId = toId;
        if (!defUnit) {
          toNodeId = nodeIdForUnresolved(doc.documentId, term);
          ensureNode(nodes, {
            nodeId: toNodeId,
            kind: "UNRESOLVED_TARGET",
            documentId: doc.documentId,
            label: term,
            sectionRef: null,
            unitId: null,
            termName: term,
            materiality: null,
            notes: "Covenant inventory cites term with no matching DEFINITION unit in this document.",
          });
        }
        addEdge(edges, {
          edgeId: edgeIdOf("COVENANT_TO_DEFINITION", fromId, toNodeId),
          kind: "COVENANT_TO_DEFINITION",
          fromNodeId: fromId,
          toNodeId,
          resolution,
          confidence: defUnit ? "HIGH" : "MEDIUM",
          evidenceClass: "GROUND_TRUTH_INVENTORY_DECLARATION",
          rationale: `Unit ${unit.unitId} (${unit.unitType}) inventory-declares keyDefinedTerm '${term}'${defUnit ? ` resolved to ${defUnit.unitId}` : " with no local definition unit"}.`,
          sourceSpans: [spanForUnit(doc, unit, (unit.notes || unit.description).slice(0, 240))],
          unresolvedReason: defUnit ? null : `Term '${term}' not declared by any DEFINITION unit in ${doc.documentId}.`,
          sharedBasketKey: null,
          financialInputKey: null,
        });
      }
    }
  }

  // --- Note-driven shared basket / entity scope / cross-document / reclass ---
  for (const unit of units) {
    const fromId = nodeIdForUnit(doc.documentId, unit.unitId);
    const sig = noteSignals(unit.notes);
    if (sig.sharedResource) {
      const basketKey = sig.sharedBasketLabel ?? "SHARED_RESOURCE";
      const basketNodeId = nodeIdForTerm(doc.documentId, basketKey);
      ensureNode(nodes, {
        nodeId: basketNodeId,
        kind: "SHARED_BASKET",
        documentId: doc.documentId,
        label: basketKey,
        sectionRef: findDefinitionUnit(units, basketKey)?.sectionRef ?? unit.sectionRef,
        unitId: findDefinitionUnit(units, basketKey)?.unitId ?? null,
        termName: basketKey,
        materiality: "CRITICAL",
        notes: unit.notes ?? null,
      });
      addEdge(edges, {
        edgeId: edgeIdOf("COVENANT_TO_SHARED_BASKET", fromId, basketNodeId),
        kind: "COVENANT_TO_SHARED_BASKET",
        fromNodeId: fromId,
        toNodeId: basketNodeId,
        resolution: "RESOLVED",
        confidence: "HIGH",
        evidenceClass: "EXPLICIT_GROUND_TRUTH_NOTE",
        rationale: `Ground-truth notes for ${unit.unitId} explicitly mark SHARED RESOURCE (${basketKey}).`,
        sourceSpans: [spanForUnit(doc, unit, unit.notes!.slice(0, 280))],
        unresolvedReason: null,
        sharedBasketKey: basketKey,
        financialInputKey: null,
      });
    }
    if (sig.entityScope) {
      const scopeNodeId = `${fromId}::entity_scope`;
      ensureNode(nodes, {
        nodeId: scopeNodeId,
        kind: "ENTITY_SCOPE_RULE",
        documentId: doc.documentId,
        label: `Entity scope @ ${unit.sectionRef}`,
        sectionRef: unit.sectionRef,
        unitId: unit.unitId,
        termName: null,
        materiality: unit.materiality ?? null,
        notes: unit.notes ?? null,
      });
      addEdge(edges, {
        edgeId: edgeIdOf("ENTITY_SCOPE", fromId, scopeNodeId),
        kind: "ENTITY_SCOPE",
        fromNodeId: fromId,
        toNodeId: scopeNodeId,
        resolution: "RESOLVED",
        confidence: "HIGH",
        evidenceClass: "EXPLICIT_GROUND_TRUTH_NOTE",
        rationale: `Ground-truth notes for ${unit.unitId} explicitly call out ENTITY SCOPE.`,
        sourceSpans: [spanForUnit(doc, unit, unit.notes!.slice(0, 280))],
        unresolvedReason: null,
        sharedBasketKey: null,
        financialInputKey: null,
      });
    }
    if (sig.crossDocument) {
      const targetLabel = sig.crossDocumentTarget ?? "external instrument";
      const xdId = nodeIdForCrossDocument(targetLabel);
      ensureNode(nodes, {
        nodeId: xdId,
        kind: "CROSS_DOCUMENT_TARGET",
        documentId: doc.documentId,
        label: targetLabel,
        sectionRef: null,
        unitId: null,
        termName: null,
        materiality: null,
        notes: unit.notes ?? null,
      });
      addEdge(edges, {
        edgeId: edgeIdOf("COVENANT_TO_CROSS_DOCUMENT", fromId, xdId),
        kind: "COVENANT_TO_CROSS_DOCUMENT",
        fromNodeId: fromId,
        toNodeId: xdId,
        resolution: "UNRESOLVED",
        confidence: "HIGH",
        evidenceClass: "EXPLICIT_GROUND_TRUTH_NOTE",
        rationale: `Ground-truth notes for ${unit.unitId} record a genuine cross-document dependency (${targetLabel}).`,
        sourceSpans: [spanForUnit(doc, unit, unit.notes!.slice(0, 280))],
        unresolvedReason: `Target instrument '${targetLabel}' is outside this document package.`,
        sharedBasketKey: null,
        financialInputKey: null,
      });
    }
    if (sig.reclassification) {
      // Prefer pointing at Permitted Investments / sibling RP baskets when named.
      const target =
        findDefinitionUnit(units, "Permitted Investments") ||
        units.find((u) => /reclassif/i.test(u.notes ?? "") && u.unitId !== unit.unitId);
      const toNodeId = target
        ? nodeIdForUnit(doc.documentId, target.unitId)
        : nodeIdForUnresolved(doc.documentId, `reclass-from-${unit.unitId}`);
      if (!target) {
        ensureNode(nodes, {
          nodeId: toNodeId,
          kind: "UNRESOLVED_TARGET",
          documentId: doc.documentId,
          label: `reclassification target of ${unit.unitId}`,
          sectionRef: null,
          unitId: null,
          termName: null,
          materiality: null,
          notes: unit.notes ?? null,
        });
      }
      addEdge(edges, {
        edgeId: edgeIdOf("RECLASSIFICATION", fromId, toNodeId),
        kind: "RECLASSIFICATION",
        fromNodeId: fromId,
        toNodeId,
        resolution: target ? "RESOLVED" : "UNRESOLVED",
        confidence: "MEDIUM",
        evidenceClass: "EXPLICIT_GROUND_TRUTH_NOTE",
        rationale: `Ground-truth notes for ${unit.unitId} mention reclassification.`,
        sourceSpans: [spanForUnit(doc, unit, (unit.notes ?? "").slice(0, 280))],
        unresolvedReason: target ? null : "Reclassification mentioned but destination provision not inventory-resolved.",
        sharedBasketKey: null,
        financialInputKey: null,
      });
    }
  }

  // --- Structural EXCEPTION / CONDITION units under covenant sections ---
  for (const unit of units) {
    if (unit.unitType !== "EXCEPTION" && unit.unitType !== "CONDITION") continue;
    const parentSection = unit.sectionRef.replace(/\([a-z0-9ivx]+\)$/i, "");
    const parents = units.filter(
      (u) =>
        COVENANTISH.has(u.unitType) &&
        u.unitType !== "EXCEPTION" &&
        u.unitType !== "CONDITION" &&
        (u.sectionRef === parentSection || u.unitId !== unit.unitId) &&
        (unit.description + " " + (unit.notes ?? "")).toLowerCase().includes(u.sectionRef.toLowerCase()),
    );
    // Prefer same-section covenant/basket units.
    const sameSectionParents = units.filter(
      (u) =>
        u.unitId !== unit.unitId &&
        (u.unitType === "COVENANT" || u.unitType === "BASKET" || u.unitType === "FINANCIAL_TEST") &&
        (u.sectionRef === parentSection || unit.sectionRef.startsWith(u.sectionRef)),
    );
    const chosen = sameSectionParents[0] ?? parents[0];
    const kind: DependencyEdgeKind = unit.unitType === "EXCEPTION" ? "COVENANT_TO_EXCEPTION" : "COVENANT_TO_CONDITION";
    if (chosen) {
      addEdge(edges, {
        edgeId: edgeIdOf(kind, nodeIdForUnit(doc.documentId, chosen.unitId), nodeIdForUnit(doc.documentId, unit.unitId)),
        kind,
        fromNodeId: nodeIdForUnit(doc.documentId, chosen.unitId),
        toNodeId: nodeIdForUnit(doc.documentId, unit.unitId),
        resolution: "RESOLVED",
        confidence: "MEDIUM",
        evidenceClass: "STRUCTURAL_UNIT_RELATION",
        rationale: `${unit.unitType} unit ${unit.unitId} is structurally related to ${chosen.unitType} ${chosen.unitId} under section ${chosen.sectionRef}.`,
        sourceSpans: [spanForUnit(doc, unit, unit.description.slice(0, 240))],
        unresolvedReason: null,
        sharedBasketKey: null,
        financialInputKey: null,
      });
    } else {
      const unresolvedId = nodeIdForUnresolved(doc.documentId, `parent-of-${unit.unitId}`);
      ensureNode(nodes, {
        nodeId: unresolvedId,
        kind: "UNRESOLVED_TARGET",
        documentId: doc.documentId,
        label: `parent of ${unit.unitId}`,
        sectionRef: parentSection,
        unitId: null,
        termName: null,
        materiality: null,
        notes: "EXCEPTION/CONDITION unit without a resolvable parent covenant unit in inventory.",
      });
      addEdge(edges, {
        edgeId: edgeIdOf(kind, unresolvedId, nodeIdForUnit(doc.documentId, unit.unitId)),
        kind,
        fromNodeId: unresolvedId,
        toNodeId: nodeIdForUnit(doc.documentId, unit.unitId),
        resolution: "UNRESOLVED",
        confidence: "LOW",
        evidenceClass: "STRUCTURAL_UNIT_RELATION",
        rationale: `${unit.unitType} unit ${unit.unitId} has no inventory-resolvable parent covenant.`,
        sourceSpans: [spanForUnit(doc, unit, unit.description.slice(0, 240))],
        unresolvedReason: `No parent COVENANT/BASKET unit found for section ${parentSection}.`,
        sharedBasketKey: null,
        financialInputKey: null,
      });
    }
  }

  // --- Explicit connectives in description/notes (section / reclass) ---
  for (const unit of units) {
    if (!COVENANTISH.has(unit.unitType) && unit.unitType !== "DEFINITION") continue;
    const text = `${unit.description} ${unit.notes ?? ""}`;
    const fromId = nodeIdForUnit(doc.documentId, unit.unitId);
    for (const cue of SECTION_CONNECTIVES) {
      if (cue.kind === "COVENANT_TO_AMENDMENT") {
        if (!cue.re.test(text)) continue;
        // Amendment edges for amendment documents themselves, or when text says as amended.
        if (!/amendment/i.test(doc.sourceFile) && !/as amended|as modified|as restated/i.test(text)) continue;
        const amdId = nodeIdForUnresolved(doc.documentId, `amendment-ref-${unit.unitId}`);
        ensureNode(nodes, {
          nodeId: amdId,
          kind: "AMENDMENT",
          documentId: doc.documentId,
          label: `amendment reference from ${unit.unitId}`,
          sectionRef: unit.sectionRef,
          unitId: unit.unitId,
          termName: null,
          materiality: null,
          notes: unit.notes ?? null,
        });
        addEdge(edges, {
          edgeId: edgeIdOf("COVENANT_TO_AMENDMENT", fromId, amdId, "connective"),
          kind: "COVENANT_TO_AMENDMENT",
          fromNodeId: fromId,
          toNodeId: amdId,
          resolution: /amendment/i.test(doc.sourceFile) ? "RESOLVED" : "AMBIGUOUS",
          confidence: "MEDIUM",
          evidenceClass: "EXPLICIT_SOURCE_CONNECTIVE",
          rationale: `Text of ${unit.unitId} uses amendment connective language (${cue.label}).`,
          sourceSpans: [spanForUnit(doc, unit, text.slice(0, 240))],
          unresolvedReason: /amendment/i.test(doc.sourceFile)
            ? null
            : "Amendment connective present but target amendment instrument not uniquely identified in inventory.",
          sharedBasketKey: null,
          financialInputKey: null,
        });
        continue;
      }
      if (cue.kind === "RECLASSIFICATION") {
        if (!cue.re.test(text)) continue;
        // Already handled via notes; add only if not already present.
        const existing = [...edges.values()].some((e) => e.kind === "RECLASSIFICATION" && e.fromNodeId === fromId);
        if (existing) continue;
        const unresolvedId = nodeIdForUnresolved(doc.documentId, `reclass-connective-${unit.unitId}`);
        ensureNode(nodes, {
          nodeId: unresolvedId,
          kind: "UNRESOLVED_TARGET",
          documentId: doc.documentId,
          label: `reclassification connective @ ${unit.unitId}`,
          sectionRef: unit.sectionRef,
          unitId: null,
          termName: null,
          materiality: null,
          notes: null,
        });
        addEdge(edges, {
          edgeId: edgeIdOf("RECLASSIFICATION", fromId, unresolvedId, "connective"),
          kind: "RECLASSIFICATION",
          fromNodeId: fromId,
          toNodeId: unresolvedId,
          resolution: "UNRESOLVED",
          confidence: "MEDIUM",
          evidenceClass: "EXPLICIT_SOURCE_CONNECTIVE",
          rationale: `Description/notes of ${unit.unitId} contain explicit reclassification language.`,
          sourceSpans: [spanForUnit(doc, unit, text.slice(0, 240))],
          unresolvedReason: "Reclassification connective found; destination not inventory-resolved.",
          sharedBasketKey: null,
          financialInputKey: null,
        });
        continue;
      }
      const m = text.match(cue.re);
      if (!m?.[1]) continue;
      const sectionRef = m[1];
      const targets = findUnitsBySection(units, sectionRef);
      if (targets.length === 1) {
        const t = targets[0]!;
        addEdge(edges, {
          edgeId: edgeIdOf(cue.kind, fromId, nodeIdForUnit(doc.documentId, t.unitId), "connective"),
          kind: cue.kind,
          fromNodeId: fromId,
          toNodeId: nodeIdForUnit(doc.documentId, t.unitId),
          resolution: "RESOLVED",
          confidence: "HIGH",
          evidenceClass: "EXPLICIT_SOURCE_CONNECTIVE",
          rationale: `${unit.unitId} uses connective '${cue.label}' targeting Section ${sectionRef} → ${t.unitId}.`,
          sourceSpans: [spanForUnit(doc, unit, m[0]!.slice(0, 240))],
          unresolvedReason: null,
          sharedBasketKey: null,
          financialInputKey: null,
        });
      } else if (targets.length > 1) {
        const ambId = nodeIdForUnresolved(doc.documentId, `ambiguous-${sectionRef}-${unit.unitId}`);
        ensureNode(nodes, {
          nodeId: ambId,
          kind: "UNRESOLVED_TARGET",
          documentId: doc.documentId,
          label: `ambiguous Section ${sectionRef}`,
          sectionRef,
          unitId: null,
          termName: null,
          materiality: null,
          notes: `Candidates: ${targets.map((t) => t.unitId).join(", ")}`,
        });
        addEdge(edges, {
          edgeId: edgeIdOf(cue.kind, fromId, ambId, "ambiguous"),
          kind: cue.kind,
          fromNodeId: fromId,
          toNodeId: ambId,
          resolution: "AMBIGUOUS",
          confidence: "MEDIUM",
          evidenceClass: "EXPLICIT_SOURCE_CONNECTIVE",
          rationale: `${unit.unitId} cites Section ${sectionRef} via '${cue.label}' but ${targets.length} inventory units match.`,
          sourceSpans: [spanForUnit(doc, unit, m[0]!.slice(0, 240))],
          unresolvedReason: `Ambiguous section target: ${targets.map((t) => t.unitId).join(", ")}`,
          sharedBasketKey: null,
          financialInputKey: null,
        });
      } else {
        const uId = nodeIdForUnresolved(doc.documentId, `section-${sectionRef}`);
        ensureNode(nodes, {
          nodeId: uId,
          kind: "UNRESOLVED_TARGET",
          documentId: doc.documentId,
          label: `Section ${sectionRef}`,
          sectionRef,
          unitId: null,
          termName: null,
          materiality: null,
          notes: "Cited via explicit connective; no inventory unit at that section.",
        });
        addEdge(edges, {
          edgeId: edgeIdOf(cue.kind, fromId, uId, "unresolved"),
          kind: cue.kind,
          fromNodeId: fromId,
          toNodeId: uId,
          resolution: "UNRESOLVED",
          confidence: "MEDIUM",
          evidenceClass: "EXPLICIT_SOURCE_CONNECTIVE",
          rationale: `${unit.unitId} cites Section ${sectionRef} via '${cue.label}' with no inventory unit.`,
          sourceSpans: [spanForUnit(doc, unit, m[0]!.slice(0, 240))],
          unresolvedReason: `Section ${sectionRef} not present as a ground-truth unit.`,
          sharedBasketKey: null,
          financialInputKey: null,
        });
      }
    }
  }

  // --- RATIO_CALCULATION for FINANCIAL_TEST / ratio definitions ---
  for (const unit of units) {
    const isRatioDef =
      unit.unitType === "DEFINITION" &&
      /ratio/i.test(unit.keyDefinedTerms?.[0] ?? "") &&
      (unit.keyDefinedTerms ?? []).length > 1;
    const isFinTest = unit.unitType === "FINANCIAL_TEST";
    if (!isRatioDef && !isFinTest) continue;
    const fromId =
      unit.unitType === "DEFINITION"
        ? nodeIdForTerm(doc.documentId, unit.keyDefinedTerms![0]!)
        : nodeIdForUnit(doc.documentId, unit.unitId);
    const components = (unit.keyDefinedTerms ?? []).slice(unit.unitType === "DEFINITION" ? 1 : 0);
    for (const term of components) {
      const toId = nodeIdForTerm(doc.documentId, term);
      addEdge(edges, {
        edgeId: edgeIdOf("RATIO_CALCULATION", fromId, toId),
        kind: "RATIO_CALCULATION",
        fromNodeId: fromId,
        toNodeId: toId,
        resolution: findDefinitionUnit(units, term) ? "RESOLVED" : "UNRESOLVED",
        confidence: "HIGH",
        evidenceClass: "GROUND_TRUTH_INVENTORY_DECLARATION",
        rationale: `${unit.unitId} is a ratio/financial-test inventory unit whose calculation depends on '${term}'.`,
        sourceSpans: [spanForUnit(doc, unit, unit.description.slice(0, 240))],
        unresolvedReason: findDefinitionUnit(units, term) ? null : `Component term '${term}' lacks a DEFINITION unit.`,
        sharedBasketKey: null,
        financialInputKey: null,
      });
    }
  }

  // --- FINANCIAL_INPUT from EBITDA / Net Income style definitions ---
  for (const unit of units) {
    if (unit.unitType !== "DEFINITION") continue;
    const primary = unit.keyDefinedTerms?.[0];
    if (!primary) continue;
    const text = `${unit.description} ${unit.notes ?? ""}`;
    const fromId = nodeIdForTerm(doc.documentId, primary);
    for (const cue of FINANCIAL_INPUT_CUES) {
      if (!cue.re.test(text)) continue;
      // Require the cue to appear in a calculation/compositional position, not mere mention:
      // admit only when description uses "plus"/"minus"/"divided by" near the cue OR the unit is a known calc definition.
      const compositional =
        /\b(?:plus|minus|divided by|less|aggregate|means)\b/i.test(text) ||
        /EBITDA|Net Income|Total Indebtedness|Leverage Ratio|Coverage Ratio/i.test(primary);
      if (!compositional) continue;
      const finId = nodeIdForFinancialInput(cue.key);
      ensureNode(nodes, {
        nodeId: finId,
        kind: "FINANCIAL_INPUT",
        documentId: doc.documentId,
        label: cue.key,
        sectionRef: null,
        unitId: null,
        termName: null,
        materiality: null,
        notes: "Financial input leaf referenced by a compositional definition.",
      });
      addEdge(edges, {
        edgeId: edgeIdOf("FINANCIAL_INPUT", fromId, finId, cue.key),
        kind: "FINANCIAL_INPUT",
        fromNodeId: fromId,
        toNodeId: finId,
        resolution: "RESOLVED",
        confidence: "MEDIUM",
        evidenceClass: "EXPLICIT_SOURCE_CONNECTIVE",
        rationale: `Definition '${primary}' compositionally references financial input ${cue.key}.`,
        sourceSpans: [spanForUnit(doc, unit, unit.description.slice(0, 240))],
        unresolvedReason: null,
        sharedBasketKey: null,
        financialInputKey: cue.key,
      });
    }
  }

  // --- Amendment documents: map amendment units → COVENANT_TO_AMENDMENT ---
  if (/amendment/i.test(doc.sourceFile) || /amendment/i.test(doc.documentId)) {
    for (const unit of units) {
      if (unit.unitType === "BOILERPLATE_SUMMARY") continue;
      const fromId = nodeIdForUnit(doc.documentId, unit.unitId);
      // Look for "Section X" targets in description as amendment targets.
      for (const m of textMatches(unit.description, /\bSections?\s+([0-9]+\.[0-9]+(?:\([a-z0-9ivx]+\))*)/gi)) {
        const sectionRef = m[1]!;
        const targets = findUnitsBySection(units, sectionRef);
        // In amendment docs, section refs often point outside — mark unresolved to base CA.
        const toId = nodeIdForUnresolved(doc.documentId, `amended-section-${sectionRef}`);
        ensureNode(nodes, {
          nodeId: toId,
          kind: targets[0] ? mapUnitKind(targets[0].unitType) : "UNRESOLVED_TARGET",
          documentId: doc.documentId,
          label: `amended Section ${sectionRef}`,
          sectionRef,
          unitId: targets[0]?.unitId ?? null,
          termName: null,
          materiality: null,
          notes: targets.length
            ? `Local inventory match(es): ${targets.map((t) => t.unitId).join(", ")}`
            : "Amendment target section not present as a unit in this amendment inventory — likely lives on the base credit agreement.",
        });
        addEdge(edges, {
          edgeId: edgeIdOf("COVENANT_TO_AMENDMENT", fromId, toId, sectionRef),
          kind: "COVENANT_TO_AMENDMENT",
          fromNodeId: fromId,
          toNodeId: toId,
          resolution: targets.length === 1 ? "RESOLVED" : targets.length > 1 ? "AMBIGUOUS" : "UNRESOLVED",
          confidence: "MEDIUM",
          evidenceClass: "EXPLICIT_SOURCE_CONNECTIVE",
          rationale: `Amendment-document unit ${unit.unitId} operatively references Section ${sectionRef}.`,
          sourceSpans: [spanForUnit(doc, unit, m[0]!.slice(0, 240))],
          unresolvedReason:
            targets.length === 0
              ? `Section ${sectionRef} not inventory-local to amendment document ${doc.documentId}.`
              : targets.length > 1
                ? `Multiple local matches for Section ${sectionRef}.`
                : null,
          sharedBasketKey: null,
          financialInputKey: null,
        });
      }
    }
  }

  for (const e of authoredEdges) {
    // Ensure endpoints exist.
    if (!nodes.has(e.fromNodeId)) {
      ensureNode(nodes, {
        nodeId: e.fromNodeId,
        kind: "OTHER_OPERATIVE",
        documentId: doc.documentId,
        label: e.fromNodeId,
        sectionRef: null,
        unitId: null,
        termName: null,
        materiality: null,
        notes: "Authored-edge endpoint.",
      });
    }
    if (!nodes.has(e.toNodeId)) {
      ensureNode(nodes, {
        nodeId: e.toNodeId,
        kind: "OTHER_OPERATIVE",
        documentId: doc.documentId,
        label: e.toNodeId,
        sectionRef: null,
        unitId: null,
        termName: null,
        materiality: null,
        notes: "Authored-edge endpoint.",
      });
    }
    addEdge(edges, e);
  }

  const nodeList = [...nodes.values()].sort((a, b) => a.nodeId.localeCompare(b.nodeId));
  const edgeList = [...edges.values()].sort((a, b) => a.edgeId.localeCompare(b.edgeId));
  const analysis = analyzeGraph(nodeList, edgeList);
  const expectations = deriveExpectations(units, edgeList);
  const completeness = buildCompletenessReport({
    documentId: doc.documentId,
    sourceFile: doc.sourceFile,
    nodeCount: nodeList.length,
    edges: edgeList,
    diamondCount: analysis.diamondCount,
    cycleCount: analysis.cycleCount,
    expectations,
  });

  return {
    documentId: doc.documentId,
    sourceFile: doc.sourceFile,
    packageId,
    nodes: nodeList,
    edges: edgeList,
    motifs: analysis.motifs,
    completeness,
  };
}

function textMatches(text: string, re: RegExp): RegExpMatchArray[] {
  return [...text.matchAll(re)];
}

function deriveExpectations(units: GroundTruthUnit[], edges: AtlasEdge[]): CompletenessExpectations {
  const expectedMinimumByKind: CompletenessExpectations["expectedMinimumByKind"] = {};
  const gapHints: string[] = [];

  const covenantish = units.filter((u) => COVENANTISH.has(u.unitType) && (u.keyDefinedTerms ?? []).length > 0);
  if (covenantish.length) expectedMinimumByKind.COVENANT_TO_DEFINITION = Math.min(covenantish.length, 5);

  const defWithDeps = units.filter((u) => u.unitType === "DEFINITION" && (u.keyDefinedTerms ?? []).length > 1);
  if (defWithDeps.length) expectedMinimumByKind.DEFINITION_TO_DEFINITION = Math.min(defWithDeps.length, 3);

  const shared = units.filter((u) => /SHARED RESOURCE/i.test(u.notes ?? ""));
  if (shared.length) expectedMinimumByKind.COVENANT_TO_SHARED_BASKET = shared.length;

  const entity = units.filter((u) => /ENTITY SCOPE|entity-scope/i.test(u.notes ?? ""));
  if (entity.length) expectedMinimumByKind.ENTITY_SCOPE = Math.min(entity.length, 2);

  const xd = units.filter((u) => /cross-document/i.test(u.notes ?? ""));
  if (xd.length) expectedMinimumByKind.COVENANT_TO_CROSS_DOCUMENT = xd.length;

  const ratios = units.filter(
    (u) =>
      (u.unitType === "FINANCIAL_TEST" || (u.unitType === "DEFINITION" && /ratio/i.test(u.keyDefinedTerms?.[0] ?? ""))) &&
      (u.keyDefinedTerms ?? []).length > 0,
  );
  if (ratios.length) expectedMinimumByKind.RATIO_CALCULATION = Math.min(ratios.length, 2);

  const exceptions = units.filter((u) => u.unitType === "EXCEPTION");
  if (exceptions.length) expectedMinimumByKind.COVENANT_TO_EXCEPTION = Math.min(exceptions.length, 1);

  const conditions = units.filter((u) => u.unitType === "CONDITION");
  if (conditions.length) expectedMinimumByKind.COVENANT_TO_CONDITION = Math.min(conditions.length, 1);

  // Soft expectations that inventory cannot yet satisfy — recorded as gaps, not fabrications.
  const reclassMentions = units.filter((u) => /reclassif/i.test(`${u.description} ${u.notes ?? ""}`));
  if (reclassMentions.length === 0) {
    gapHints.push(
      "RECLASSIFICATION: no ground-truth unit in this document explicitly records a reclassification right; edge kind preserved as unresolved/absent rather than inferred from similarity.",
    );
  } else {
    expectedMinimumByKind.RECLASSIFICATION = 1;
  }

  // Amendment expectation only when document is an amendment.
  void edges;
  return { expectedMinimumByKind, gapHints };
}

export type { Confidence, EvidenceClass };
