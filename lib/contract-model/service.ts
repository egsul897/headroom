/**
 * Contractual-state query API (task §43/§44, docs/contract-model-foundation-phase-b.md).
 * The ONE place app/UI code (and, later, Ask Headroom/Dashboard) queries the
 * Phase B graph - never Prisma directly for anything beyond a single-row
 * lookup, matching this codebase's own established "no calculation/graph-
 * walking in the UI layer" discipline (lib/dashboard-service.ts's header
 * comment). Every function here is read-only.
 */
import type { AmendmentEffect, ContractCoverageStatus, ContractRule, ContractRuleRelationship, ContractReferenceEdge, CovenantFamily, DebtInstrument, DefinedTermDependencyEdge, DefinedTermNode, Document, DocumentNode, DocumentRelationshipEdge } from "@prisma/client";
import { prisma } from "../prisma";

// ---------------------------------------------------------------------------
// Document graph (task §9/§43)
// ---------------------------------------------------------------------------

export interface DocumentNodeTree extends DocumentNode {
  children: DocumentNodeTree[];
}

/** The full DocumentNode tree for one document, assembled from a single flat query (no N+1 per-level fetch). */
export async function getDocumentGraph(companyId: string, documentId: string): Promise<DocumentNodeTree[]> {
  const nodes = await prisma.documentNode.findMany({ where: { companyId, documentId }, orderBy: { ordinal: "asc" } });
  const byId = new Map<string, DocumentNodeTree>(nodes.map((n) => [n.id, { ...n, children: [] }]));
  const roots: DocumentNodeTree[] = [];
  for (const node of byId.values()) {
    if (node.parentId && byId.has(node.parentId)) byId.get(node.parentId)!.children.push(node);
    else roots.push(node);
  }
  return roots;
}

// ---------------------------------------------------------------------------
// Rules by covenant family / action (task §43)
// ---------------------------------------------------------------------------

export async function getRulesByCovenantFamily(companyId: string, family: CovenantFamily): Promise<ContractRule[]> {
  return prisma.contractRule.findMany({ where: { companyId, covenantFamily: family }, orderBy: { createdAt: "asc" } });
}

export async function getRulesForAction(companyId: string, action: string): Promise<ContractRule[]> {
  return prisma.contractRule.findMany({ where: { companyId, action }, orderBy: { createdAt: "asc" } });
}

// ---------------------------------------------------------------------------
// Rule dependencies / relationships (task §20/§21/§43) - a bounded,
// cycle-safe BFS. A relationship graph among rules can legitimately contain
// a cycle (e.g. two ACTIVATES/DEACTIVATES edges toggling each other) - this
// never infinite-loops (task §15/§50's own "detect cycles, do not
// infinite-loop" requirement, applied here too even though that requirement
// was written for defined terms).
// ---------------------------------------------------------------------------

const MAX_TRAVERSAL_DEPTH = 25;

export interface RuleDependencyResult {
  relationships: ContractRuleRelationship[];
  visitedRuleIds: string[];
  cycleDetected: boolean;
  maxDepthReached: boolean;
}

/** Every relationship reachable from `ruleId` by following fromRule->toRule edges outward, breadth-first, bounded and cycle-safe. */
export async function getRuleDependencies(companyId: string, ruleId: string): Promise<RuleDependencyResult> {
  const visited = new Set<string>([ruleId]);
  const collected: ContractRuleRelationship[] = [];
  let frontier = [ruleId];
  let cycleDetected = false;
  let maxDepthReached = false;

  for (let depth = 0; frontier.length > 0; depth++) {
    if (depth >= MAX_TRAVERSAL_DEPTH) {
      maxDepthReached = true;
      break;
    }
    const edges = await prisma.contractRuleRelationship.findMany({ where: { companyId, fromRuleId: { in: frontier } } });
    const nextFrontier: string[] = [];
    for (const edge of edges) {
      collected.push(edge);
      if (visited.has(edge.toRuleId)) {
        cycleDetected = true;
        continue;
      }
      visited.add(edge.toRuleId);
      nextFrontier.push(edge.toRuleId);
    }
    frontier = nextFrontier;
  }

  return { relationships: collected, visitedRuleIds: [...visited], cycleDetected, maxDepthReached };
}

// ---------------------------------------------------------------------------
// Defined-term dependency graph (task §15/§16/§43) - same bounded,
// cycle-safe traversal shape as rule dependencies above.
// ---------------------------------------------------------------------------

export interface DefinedTermDependencyResult {
  edges: DefinedTermDependencyEdge[];
  visitedTermIds: string[];
  cycleDetected: boolean;
  maxDepthReached: boolean;
}

export async function getDefinedTermDependencies(companyId: string, termId: string): Promise<DefinedTermDependencyResult> {
  const visited = new Set<string>([termId]);
  const collected: DefinedTermDependencyEdge[] = [];
  let frontier = [termId];
  let cycleDetected = false;
  let maxDepthReached = false;

  for (let depth = 0; frontier.length > 0; depth++) {
    if (depth >= MAX_TRAVERSAL_DEPTH) {
      maxDepthReached = true;
      break;
    }
    const edges = await prisma.definedTermDependencyEdge.findMany({ where: { companyId, fromTermId: { in: frontier } } });
    const nextFrontier: string[] = [];
    for (const edge of edges) {
      collected.push(edge);
      if (!edge.toTermId) continue; // USES_SECTION/USES_FINANCIAL_INPUT edges have no further term to traverse into
      if (visited.has(edge.toTermId)) {
        cycleDetected = true;
        continue;
      }
      visited.add(edge.toTermId);
      nextFrontier.push(edge.toTermId);
    }
    frontier = nextFrontier;
  }

  return { edges: collected, visitedTermIds: [...visited], cycleDetected, maxDepthReached };
}

// ---------------------------------------------------------------------------
// Unresolved references (task §19/§43/§46)
// ---------------------------------------------------------------------------

export async function getUnresolvedReferences(companyId: string): Promise<ContractReferenceEdge[]> {
  return prisma.contractReferenceEdge.findMany({ where: { companyId, resolved: false }, orderBy: { createdAt: "asc" } });
}

// ---------------------------------------------------------------------------
// Source trace (task §44) - RULE -> DEPENDENCIES -> DEFINED TERMS -> CLAUSE
// -> DOCUMENT -> DOCUMENT VERSION. Proves the backend trace a future Why?
// UI needs, even though that UI is not built this phase.
// ---------------------------------------------------------------------------

export interface RuleSourceTrace {
  rule: ContractRule;
  sourceNode: DocumentNode | null;
  definedTerms: DefinedTermNode[];
  dependencies: RuleDependencyResult;
  amendmentEffects: AmendmentEffect[];
}

export async function getRuleSourceTrace(companyId: string, ruleId: string): Promise<RuleSourceTrace | null> {
  const rule = await prisma.contractRule.findFirst({ where: { id: ruleId, companyId } });
  if (!rule) return null;

  const [sourceNode, definedTerms, dependencies, amendmentEffects] = await Promise.all([
    rule.sourceNodeId ? prisma.documentNode.findUnique({ where: { id: rule.sourceNodeId } }) : Promise.resolve(null),
    rule.definedTermRefs.length > 0 ? prisma.definedTermNode.findMany({ where: { companyId, stableKey: { in: rule.definedTermRefs } } }) : Promise.resolve([]),
    getRuleDependencies(companyId, ruleId),
    prisma.amendmentEffect.findMany({ where: { companyId, targetRuleId: ruleId } }),
  ]);

  return { rule, sourceNode, definedTerms, dependencies, amendmentEffects };
}

// ---------------------------------------------------------------------------
// Operative version model (task §12/§27/§43) - "what language governs as of
// a selected date." A rule is operative as of `asOfDate` purely based on its
// own effectiveFrom/effectiveTo window - the EXACT SAME mechanism
// Document.effectiveFrom/effectiveTo already uses for the legacy engine's
// amendment precedence (see that model's own comment: "when an amendment
// supersedes this document, set THIS document's effectiveTo to the
// amendment's effectiveFrom"). By the same convention, superseding a
// ContractRule means setting the OLD rule's effectiveTo to the NEW rule's
// effectiveFrom - `supersededByRuleId` itself is informational provenance
// only ("this rule was replaced by that one"), never consulted by this
// filter, so a HISTORICAL asOfDate before the amendment's effective date
// still correctly resolves to the original rule, not the amendment.
// ---------------------------------------------------------------------------

function isEffectiveAsOf(effectiveFrom: Date | null, effectiveTo: Date | null, asOfDate: Date): boolean {
  if (effectiveFrom && asOfDate < effectiveFrom) return false;
  if (effectiveTo && asOfDate >= effectiveTo) return false;
  return true;
}

export interface ContractualState {
  companyId: string;
  asOfDate: Date;
  operativeRules: ContractRule[];
  operativeDefinedTerms: DefinedTermNode[];
  documentIds: string[];
  unresolvedReferences: ContractReferenceEdge[];
  coverageByFamily: Partial<Record<CovenantFamily, ContractCoverageStatus>>;
}

/**
 * The Phase B analogue of getCompanyDashboard()/getCanonicalCompanyState() -
 * a computed, read-time aggregation (task §27's own "this will later plug
 * into CanonicalCompanyState... do not duplicate financial state"), never a
 * persisted table. Composes ONLY the models this file already queries above;
 * no covenant-capacity arithmetic of any kind.
 */
export async function getOperativeContractualState(companyId: string, asOfDate: Date = new Date()): Promise<ContractualState> {
  const [allRules, allTerms, unresolvedReferences, coverageRecords] = await Promise.all([
    prisma.contractRule.findMany({ where: { companyId } }),
    prisma.definedTermNode.findMany({ where: { companyId } }),
    getUnresolvedReferences(companyId),
    prisma.contractCoverageRecord.findMany({ where: { companyId, covenantFamily: { not: null } } }),
  ]);

  const operativeRules = allRules.filter((r) => isEffectiveAsOf(r.effectiveFrom, r.effectiveTo, asOfDate));
  const operativeDefinedTerms = allTerms.filter((t) => isEffectiveAsOf(t.effectiveFrom, t.effectiveTo, asOfDate));
  const documentIds = [...new Set(operativeRules.map((r) => r.sourceDocumentId))];

  const coverageByFamily: Partial<Record<CovenantFamily, ContractCoverageStatus>> = {};
  for (const rec of coverageRecords) {
    if (rec.covenantFamily) coverageByFamily[rec.covenantFamily] = rec.status;
  }

  return { companyId, asOfDate, operativeRules, operativeDefinedTerms, documentIds, unresolvedReferences, coverageByFamily };
}

// ---------------------------------------------------------------------------
// Phase 2C - debt package graph query API (task §13,
// docs/phase-2c-debt-package-graph.md). The one place a future Phase 2D
// retrieval system (or any UI code) reads package/instrument/relationship
// topology - never re-derives it by re-scanning raw document text. A
// "Debt Package" is a ContractCompilerRun's own (companyId, packageKey) +
// member-document set (see that model's own schema comment) - reused here
// rather than a second persisted concept. Two of the twelve functions the
// task names (getCovenantsForInstrument/getCovenantsForDocument) are NOT
// here: Phase 2B's discovery output is not yet persisted to any DB table
// (a disclosed Phase 2B limitation, docs/phase-2b-autonomous-covenant-discovery.md
// §27) so there is nothing in this database for them to query yet; the
// in-memory equivalents operating on a CovenantInstrumentAssociation[]
// live in lib/contract-model/compiler/package-graph/covenant-association.ts
// instead, ready to be pointed at a real table once one exists.
// ---------------------------------------------------------------------------

export interface PackageDocumentsResult {
  packageKey: string;
  companyId: string;
  documents: Document[];
}

/** getPackageDocuments (task §13). */
export async function getPackageDocuments(companyId: string, packageKey: string): Promise<PackageDocumentsResult | null> {
  const run = await prisma.contractCompilerRun.findUnique({ where: { companyId_packageKey: { companyId, packageKey } }, include: { documents: { include: { document: true } } } });
  if (!run) return null;
  return { packageKey, companyId, documents: run.documents.map((d) => d.document) };
}

/** getInstruments (task §13). */
export async function getInstruments(companyId: string): Promise<DebtInstrument[]> {
  return prisma.debtInstrument.findMany({ where: { companyId }, orderBy: { createdAt: "asc" } });
}

/** getDocumentsForInstrument (task §13). */
export async function getDocumentsForInstrument(instrumentId: string): Promise<Document[]> {
  return prisma.document.findMany({ where: { instrumentId }, orderBy: { createdAt: "asc" } });
}

/** getBaseDocuments (task §13) - every document that is either a resolved instrument's own base document, or has no instrument grouping at all (an ungrouped document is trivially its own base - no evidence exists that it amends/supplements anything else). */
export async function getBaseDocuments(companyId: string): Promise<Document[]> {
  const [instruments, ungrouped] = await Promise.all([prisma.debtInstrument.findMany({ where: { companyId }, select: { baseDocumentId: true } }), prisma.document.findMany({ where: { companyId, instrumentId: null } })]);
  const baseIds = instruments.map((i) => i.baseDocumentId).filter((id): id is string => !!id);
  const baseDocs = baseIds.length > 0 ? await prisma.document.findMany({ where: { id: { in: baseIds } } }) : [];
  const byId = new Map([...baseDocs, ...ungrouped].map((d) => [d.id, d] as const));
  return [...byId.values()];
}

/** getAmendmentsForDocument (task §13) - every AMENDS/RESTATES (the real enum's own name for an "amends and restates" relationship - see package-graph/types.ts's PackageRelationshipType comment) edge whose TARGET is this document, i.e. every document that amends it. */
export async function getAmendmentsForDocument(documentId: string): Promise<DocumentRelationshipEdge[]> {
  return prisma.documentRelationshipEdge.findMany({ where: { targetDocumentId: documentId, relationshipType: { in: ["AMENDS", "RESTATES"] } }, orderBy: { createdAt: "asc" } });
}

/** getSupplementsForDocument (task §13). */
export async function getSupplementsForDocument(documentId: string): Promise<DocumentRelationshipEdge[]> {
  return prisma.documentRelationshipEdge.findMany({ where: { targetDocumentId: documentId, relationshipType: "SUPPLEMENTS" }, orderBy: { createdAt: "asc" } });
}

/** getRelatedDocuments (task §13) - every document connected to this one by ANY relationship edge, in either direction, regardless of type. */
export async function getRelatedDocuments(documentId: string): Promise<Document[]> {
  const edges = await prisma.documentRelationshipEdge.findMany({ where: { OR: [{ sourceDocumentId: documentId }, { targetDocumentId: documentId }] } });
  const relatedIds = new Set<string>();
  for (const e of edges) {
    if (e.sourceDocumentId !== documentId) relatedIds.add(e.sourceDocumentId);
    if (e.targetDocumentId && e.targetDocumentId !== documentId) relatedIds.add(e.targetDocumentId);
  }
  if (relatedIds.size === 0) return [];
  return prisma.document.findMany({ where: { id: { in: [...relatedIds] } } });
}

/** getDocumentRelationships (task §13) - the raw edge rows, optionally scoped to one document (as source or target); every edge for the company otherwise. */
export async function getDocumentRelationships(companyId: string, documentId?: string): Promise<DocumentRelationshipEdge[]> {
  return prisma.documentRelationshipEdge.findMany({ where: { companyId, ...(documentId ? { OR: [{ sourceDocumentId: documentId }, { targetDocumentId: documentId }] } : {}) }, orderBy: { createdAt: "asc" } });
}

/** getModificationCandidates (task §13) - AmendmentEffect rows persisted as pre-application candidates (reviewStatus REVIEW_REQUIRED, resolutionMethod "DETERMINISTIC_AMENDMENT_STATEMENT") for one amendment-like document, per lib/contract-model/compiler/package-graph/persistence.ts. */
export async function getModificationCandidates(documentId: string): Promise<AmendmentEffect[]> {
  return prisma.amendmentEffect.findMany({ where: { amendmentDocumentId: documentId }, orderBy: { createdAt: "asc" } });
}

/** findDocumentsReferencing (task §13) - every document with a persisted relationship edge pointing AT the given target document (i.e. every document that references/amends/supplements/governs/etc it). */
export async function findDocumentsReferencing(targetDocumentId: string): Promise<Document[]> {
  const edges = await prisma.documentRelationshipEdge.findMany({ where: { targetDocumentId } });
  const sourceIds = [...new Set(edges.map((e) => e.sourceDocumentId))];
  if (sourceIds.length === 0) return [];
  return prisma.document.findMany({ where: { id: { in: sourceIds } } });
}
