/**
 * Phase C persistence layer - maps each stage's Candidate-shaped and
 * StructuralNode output into the real Phase B tables (docs/contract-model-foundation-phase-b.md),
 * never a second parallel data model. Every write is an upsert keyed by
 * (companyId, stableKey) computed via lib/contract-model/stable-keys.ts's
 * computeStableKey - the same content-derived-identity discipline every
 * other Phase B table already uses - so replaying the same package (task
 * §72/§73 idempotency/replay safety) never duplicates a row; it updates the
 * existing one in place.
 */
import { prisma } from "../../prisma";
import { computeStableKey } from "../stable-keys";
import type { CandidateContractRule, CandidateDefinedTerm, CandidateContractReference, CandidateRuleRelationship } from "../types";
import type { StructuralNode } from "./types";
import type { DetectedReference } from "./structural-references";
import type { DetectedDefinition } from "./structural-definitions";
import type { EntityClassTag } from "@prisma/client";

/**
 * @deprecated Phase 3F.1.2: this label-shaped key (`${documentId}::${sectionRef}`)
 * is NOT a unique physical occurrence identity - two distinct physical
 * structural occurrences can share it (a cross-reference sentence, a
 * table-of-contents entry, duplicate/malformed numbering - see
 * docs/architecture/STRUCTURAL-NODE-IDENTITY-ADR.md). It is retained ONLY
 * as the lookup key for `PersistedNodeIndex.idsByLegalRef` below, which is
 * explicitly a MANY-valued (`string[]`) map for exactly this reason - never
 * use it to construct a singleton lookup.
 */
export function nodeLookupKey(documentId: string, sectionRef: string): string {
  return `${documentId}::${sectionRef.replace(/\s+/g, "")}`;
}

/**
 * Phase 3F.1.2 - result of persisting a document's structural nodes.
 * `idByNodeId` is the authoritative, occurrence-safe map (physical
 * occurrence identity -> DB row id) - use this whenever the caller already
 * holds a real StructuralNode/DetectedReference/DetectedDefinition object
 * (i.e. already has a real nodeId, never re-derived from a label).
 * `idsByLegalRef` is the citation-based lookup a caller with ONLY a
 * section-reference STRING (e.g. an LLM-produced CandidateContractRule.
 * sourceSectionRef, which never carries a nodeId) must use instead - always
 * many-valued, since a legal reference is not guaranteed unique; a caller
 * must treat >1 candidate as ambiguous and never silently pick one (the
 * exact discipline structural-index.ts's resolveUniqueNodeByRef already
 * applies in memory, mirrored here for the persisted layer).
 */
export interface PersistedNodeIndex {
  idByNodeId: Map<string, string>;
  idsByLegalRef: Map<string, string[]>;
}

/** Resolves a bare legal-reference STRING (never a real occurrence id) against `idsByLegalRef`, returning the DB row id only when exactly one physical occurrence matches - undefined for both "no match" and "ambiguous, more than one match" (never an arbitrary pick, mirroring resolveUniqueNodeByRef's UNIQUE/NOT_FOUND/AMBIGUOUS discipline). */
export function resolveUniquePersistedNodeByRef(index: PersistedNodeIndex, documentId: string, sectionRef: string): string | undefined {
  const candidates = index.idsByLegalRef.get(nodeLookupKey(documentId, sectionRef)) ?? [];
  return candidates.length === 1 ? candidates[0] : undefined;
}

/**
 * Phase 2A fix: the real Prisma schema has always had a genuine self-
 * relation (DocumentNode.parentId) for parent/child edges, but this
 * function never populated it - every persisted node's parentId was
 * silently null, so no real tree ever existed in the database even though
 * StructuralNode carried parentSectionRef in memory. Fixed generally with a
 * two-pass upsert: nodes are created/updated first (parents always appear
 * before their children in the sorted input, but this makes no assumption
 * about that - it simply cannot set a child's parentId before the parent
 * row exists), then every row's parentId is set once every node's real id
 * is known - via `node.parentNodeId`, the true PHYSICAL parent occurrence
 * determined at parse time (stage-structure.ts), never by re-matching a
 * parentSectionRef LABEL (Phase 3F.1.2: this is what previously let two
 * distinct physical parent occurrences sharing a label silently collide
 * into one DB row, reparenting children to whichever occurrence's upsert
 * happened to run last).
 *
 * `stableKey` now includes `charStart` as a disambiguator (Phase 3F.1.2) -
 * the pre-3F.1.2 formula (companyId, documentId, nodeType, sectionRef only)
 * let two distinct physical occurrences sharing a label collide onto the
 * SAME unique-constrained row, so the second upsert's `update` branch
 * silently overwrote the first occurrence's persisted heading/ordinal/
 * charStart/charEnd - a genuine, confirmed DB-level instance of the same
 * defect structural-index.ts's byKey map had in memory, not merely a
 * theoretical risk (see the ADR's "persistence layer" finding).
 */
export async function persistStructuralNodes(companyId: string, nodes: StructuralNode[]): Promise<PersistedNodeIndex> {
  const idByNodeId = new Map<string, string>();
  const idsByLegalRef = new Map<string, string[]>();
  for (const node of nodes) {
    const stableKey = computeStableKey("document-node", companyId, node.documentId, node.nodeType, node.sectionRef, String(node.charStart));
    const row = await prisma.documentNode.upsert({
      where: { companyId_stableKey: { companyId, stableKey } },
      create: { companyId, documentId: node.documentId, stableKey, nodeType: node.nodeType, heading: node.heading, sectionRef: node.sectionRef, ordinal: node.ordinal, charStart: node.charStart, charEnd: node.charEnd },
      update: { heading: node.heading, ordinal: node.ordinal, charStart: node.charStart, charEnd: node.charEnd },
    });
    idByNodeId.set(node.nodeId, row.id);
    const legalRefKey = nodeLookupKey(node.documentId, node.sectionRef);
    const list = idsByLegalRef.get(legalRefKey) ?? [];
    list.push(row.id);
    idsByLegalRef.set(legalRefKey, list);
  }
  for (const node of nodes) {
    if (!node.parentNodeId) continue;
    const parentId = idByNodeId.get(node.parentNodeId);
    if (!parentId) continue; // parent wasn't itself a recognized structural node (e.g. an ARTICLE-less top-level SECTION) - leave parentId null rather than guess.
    const childId = idByNodeId.get(node.nodeId)!;
    await prisma.documentNode.update({ where: { id: childId }, data: { parentId } });
  }
  return { idByNodeId, idsByLegalRef };
}

/**
 * Phase 2A - persists deterministically-detected explicit references
 * (structural-references.ts), fixing the same real gap the LLM-candidate
 * path (persistReferences below) always had: sourceNodeId was never set,
 * so "what references this node" (task §9) could never be answered from
 * persisted data. Phase 3F.1.2: resolved via `nodeIndex.idByNodeId`, keyed
 * by DetectedReference's own real `sourceNodeId`/`targetNodeId` fields
 * (physical occurrence identity), never the deprecated label-shaped
 * `sourceNodeKey`/`targetNodeKey`.
 */
export async function persistStructuralReferences(companyId: string, references: DetectedReference[], nodeIndex: PersistedNodeIndex): Promise<number> {
  let persisted = 0;
  for (const ref of references) {
    const sourceNodeId = ref.sourceNodeId ? nodeIndex.idByNodeId.get(ref.sourceNodeId) : undefined;
    const targetDocumentNodeId = ref.targetNodeId ? nodeIndex.idByNodeId.get(ref.targetNodeId) : undefined;
    await prisma.contractReferenceEdge.create({
      data: {
        companyId,
        sourceNodeId,
        referenceType: "REQUIRES",
        referenceText: ref.referenceText,
        targetType: ref.resolved ? "SECTION" : "UNRESOLVED",
        targetDocumentNodeId,
        resolved: ref.resolved,
        unresolvedReason: ref.unresolvedReason ?? undefined,
      },
    });
    persisted++;
  }
  return persisted;
}

/**
 * Phase 2A - persists deterministically-detected defined-term declarations
 * (structural-definitions.ts). Uses the SAME stableKey scheme as
 * persistDefinedTerms below (keyed only by companyId + lowercased term
 * name) so a term found by both the deterministic detector and the LLM
 * DEFINITIONS stage converges on one row rather than creating a duplicate -
 * this call additionally fills in sourceNodeId/definitionTextRef, which the
 * LLM path alone never populated with a real structural anchor. Phase
 * 3F.1.2: resolved via DetectedDefinition's own real `sourceNodeId` field
 * (physical occurrence identity), never the deprecated `sourceNodeKey`.
 */
export async function persistStructuralDefinitions(companyId: string, definitions: DetectedDefinition[], nodeIndex: PersistedNodeIndex): Promise<Map<string, string>> {
  const idByTermName = new Map<string, string>();
  for (const def of definitions) {
    const stableKey = computeStableKey("defined-term", companyId, def.normalizedTerm);
    const sourceNodeId = def.sourceNodeId ? nodeIndex.idByNodeId.get(def.sourceNodeId) : undefined;
    const row = await prisma.definedTermNode.upsert({
      where: { companyId_stableKey: { companyId, stableKey } },
      create: { companyId, documentId: def.documentId, stableKey, termName: def.exactTerm, normalizedName: def.normalizedTerm, sourceNodeId, definitionTextRef: def.definitionExcerpt },
      update: { sourceNodeId, definitionTextRef: def.definitionExcerpt },
    });
    idByTermName.set(def.normalizedTerm, row.id);
  }
  return idByTermName;
}

export async function persistDefinedTerms(companyId: string, documentId: string, terms: CandidateDefinedTerm[]): Promise<Map<string, string>> {
  const idByTermName = new Map<string, string>();
  for (const term of terms) {
    const stableKey = computeStableKey("defined-term", companyId, term.termName.toLowerCase());
    const row = await prisma.definedTermNode.upsert({
      where: { companyId_stableKey: { companyId, stableKey } },
      create: { companyId, documentId, stableKey, termName: term.termName, normalizedName: term.termName.toLowerCase(), definitionTextRef: term.sourceSectionRef },
      update: { definitionTextRef: term.sourceSectionRef },
    });
    idByTermName.set(term.termName.toLowerCase(), row.id);
  }
  return idByTermName;
}

/** Maps the Candidate*'s free-text entityScope tags onto the real EntityClassTag enum, dropping anything that isn't a real member rather than throwing - task §20's "do not default unknown entity scope to company-wide" is honored by dropping to an empty/explicit set, never silently substituting a broad default. */
function toEntityClassTags(raw: string[], validTags: Set<string>): EntityClassTag[] {
  return raw.filter((t): t is EntityClassTag => validTags.has(t)) as EntityClassTag[];
}

/**
 * `rule.sourceSectionRef` is an LLM-produced citation STRING, never a real
 * occurrence id - Phase 3F.1.2: resolved via `resolveUniquePersistedNodeByRef`,
 * which returns undefined (never an arbitrary pick) when the citation
 * matches more than one physical occurrence in this document, exactly as
 * structural-index.ts's in-memory `resolveUniqueNodeByRef` already does.
 */
export async function persistContractRules(companyId: string, documentId: string, rules: CandidateContractRule[], nodeIndex: PersistedNodeIndex, entityClassTags: Set<string>): Promise<Map<string, string>> {
  const idBySectionRef = new Map<string, string>();
  for (const rule of rules) {
    const stableKey = computeStableKey("contract-rule", companyId, documentId, rule.sourceSectionRef, rule.action);
    const sourceNodeId = resolveUniquePersistedNodeByRef(nodeIndex, documentId, rule.sourceSectionRef) ?? null;
    const row = await prisma.contractRule.upsert({
      where: { companyId_stableKey: { companyId, stableKey } },
      create: {
        companyId,
        sourceDocumentId: documentId,
        sourceNodeId,
        stableKey,
        covenantFamily: rule.covenantFamily as never,
        ruleType: rule.ruleType as never,
        evaluationClass: rule.evaluationClass as never,
        action: rule.action,
        entityScope: toEntityClassTags(rule.entityScope, entityClassTags),
        entityScopeExcluded: toEntityClassTags(rule.entityScopeExcluded, entityClassTags),
        thresholdValue: rule.thresholdValue,
        thresholdUnit: rule.thresholdUnit,
        formulaRef: rule.formulaRef,
        operator: rule.operator,
        conditions: rule.conditions as object[],
        exceptions: rule.exceptions as object[],
        sourceSectionRef: rule.sourceSectionRef,
        definedTermRefs: rule.definedTermRefs,
        notes: rule.notes,
        extractionOrigin: { provider: "phase-c-compiler-v1", model: "see ContractCompilerStage.model", promptVersion: "phase-c.1", schemaVersion: "phase-c.1" },
      },
      update: {
        covenantFamily: rule.covenantFamily as never,
        ruleType: rule.ruleType as never,
        evaluationClass: rule.evaluationClass as never,
        thresholdValue: rule.thresholdValue,
        thresholdUnit: rule.thresholdUnit,
        formulaRef: rule.formulaRef,
        conditions: rule.conditions as object[],
        exceptions: rule.exceptions as object[],
        notes: rule.notes,
      },
    });
    idBySectionRef.set(rule.sourceSectionRef, row.id);
  }
  return idBySectionRef;
}

function normalizeSectionRef(ref: string): string {
  return ref
    .replace(/^§/, "")
    .replace(/^Section\s+/i, "")
    .replace(/\s*\[[^\]]*\]\s*$/, "") // strips a stray bracketed annotation if a model echoes one back despite the prompt instruction not to (defense in depth, not a substitute for the prompt fix).
    .replace(/\s+/g, "")
    .trim();
}

/** Exact match first, then a normalized (Section-prefix/whitespace/bracket-tolerant) match - real evidence (LSB run) showed a naive exact-string lookup silently dropped 100% of otherwise-correct relationships over a formatting mismatch. */
function resolveRuleRef(ref: string, ruleIdBySectionRef: Map<string, string>): string | undefined {
  const exact = ruleIdBySectionRef.get(ref);
  if (exact) return exact;
  const normalizedTarget = normalizeSectionRef(ref);
  for (const [key, id] of ruleIdBySectionRef) {
    if (normalizeSectionRef(key) === normalizedTarget) return id;
  }
  return undefined;
}

export async function persistRuleRelationships(companyId: string, relationships: CandidateRuleRelationship[], ruleIdBySectionRef: Map<string, string>): Promise<number> {
  let persisted = 0;
  for (const rel of relationships) {
    const fromId = resolveRuleRef(rel.fromRuleRef, ruleIdBySectionRef);
    const toId = resolveRuleRef(rel.toRuleRef, ruleIdBySectionRef);
    if (!fromId || !toId) continue; // unresolved endpoint - not persisted as a relationship (would violate the FK); reported separately as an UnresolvedContractItem by the caller.
    // ContractRuleRelationship has no stableKey/unique constraint of its own
    // (task §M's design decision: it is a plain edge table) - idempotency
    // here is a real findFirst-then-create/update, not a DB-enforced upsert.
    const existing = await prisma.contractRuleRelationship.findFirst({ where: { companyId, fromRuleId: fromId, toRuleId: toId, relationshipType: rel.relationshipType as never } });
    if (existing) {
      await prisma.contractRuleRelationship.update({ where: { id: existing.id }, data: { notes: rel.notes } });
    } else {
      await prisma.contractRuleRelationship.create({ data: { companyId, fromRuleId: fromId, toRuleId: toId, relationshipType: rel.relationshipType as never, notes: rel.notes } });
    }
    persisted++;
  }
  return persisted;
}

export async function persistReferences(companyId: string, documentId: string, references: CandidateContractReference[], nodeIndex: PersistedNodeIndex): Promise<number> {
  let persisted = 0;
  for (const ref of references) {
    const targetNodeId = ref.targetSectionRef ? resolveUniquePersistedNodeByRef(nodeIndex, documentId, ref.targetSectionRef) : undefined;
    const resolved = !!targetNodeId;
    await prisma.contractReferenceEdge.create({
      data: {
        companyId,
        referenceType: ref.referenceType as never,
        referenceText: ref.referenceText,
        targetType: resolved ? "SECTION" : "UNRESOLVED",
        targetDocumentNodeId: targetNodeId,
        resolved,
        unresolvedReason: resolved ? undefined : `target section "${ref.targetSectionRef ?? "(none)"}" not found among this package's own structural nodes`,
      },
    });
    persisted++;
  }
  return persisted;
}
