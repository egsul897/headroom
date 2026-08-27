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
 * Key used everywhere a rule/reference needs to look up "the node for this
 * section, in this document" - documentId-scoped so two documents in the
 * same package sharing a section number (e.g. both have a "6.01") never
 * collide. Identical in format to StructuralNode.nodeKey (both are
 * `${documentId}::${sectionRef with whitespace stripped}`), so the map
 * persistStructuralNodes returns doubles as the nodeKey->id map
 * persistStructuralReferences/persistStructuralDefinitions need - one real
 * identity scheme, not two.
 */
export function nodeLookupKey(documentId: string, sectionRef: string): string {
  return `${documentId}::${sectionRef.replace(/\s+/g, "")}`;
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
 * is known, keyed by the same nodeKey-derived stableKey scheme.
 */
export async function persistStructuralNodes(companyId: string, nodes: StructuralNode[]): Promise<Map<string, string>> {
  const idByLookupKey = new Map<string, string>();
  for (const node of nodes) {
    const stableKey = computeStableKey("document-node", companyId, node.documentId, node.nodeType, node.sectionRef);
    const row = await prisma.documentNode.upsert({
      where: { companyId_stableKey: { companyId, stableKey } },
      create: { companyId, documentId: node.documentId, stableKey, nodeType: node.nodeType, heading: node.heading, sectionRef: node.sectionRef, ordinal: node.ordinal, charStart: node.charStart, charEnd: node.charEnd },
      update: { heading: node.heading, ordinal: node.ordinal, charStart: node.charStart, charEnd: node.charEnd },
    });
    idByLookupKey.set(nodeLookupKey(node.documentId, node.sectionRef), row.id);
  }
  for (const node of nodes) {
    if (!node.parentSectionRef) continue;
    const parentId = idByLookupKey.get(nodeLookupKey(node.documentId, node.parentSectionRef));
    if (!parentId) continue; // parent wasn't itself a recognized structural node (e.g. an ARTICLE-less top-level SECTION) - leave parentId null rather than guess.
    const childId = idByLookupKey.get(node.nodeKey)!;
    await prisma.documentNode.update({ where: { id: childId }, data: { parentId } });
  }
  return idByLookupKey;
}

/**
 * Phase 2A - persists deterministically-detected explicit references
 * (structural-references.ts), fixing the same real gap the LLM-candidate
 * path (persistReferences below) always had: sourceNodeId was never set,
 * so "what references this node" (task §9) could never be answered from
 * persisted data. idByNodeKey must come from persistStructuralNodes's own
 * return value's underlying node-key map (exposed via the second return
 * value here) so both sides agree on identity.
 */
export async function persistStructuralReferences(companyId: string, references: DetectedReference[], idByNodeKey: Map<string, string>): Promise<number> {
  let persisted = 0;
  for (const ref of references) {
    const sourceNodeId = ref.sourceNodeKey ? idByNodeKey.get(ref.sourceNodeKey) : undefined;
    const targetDocumentNodeId = ref.targetNodeKey ? idByNodeKey.get(ref.targetNodeKey) : undefined;
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
 * LLM path alone never populated with a real structural anchor.
 */
export async function persistStructuralDefinitions(companyId: string, definitions: DetectedDefinition[], idByNodeKey: Map<string, string>): Promise<Map<string, string>> {
  const idByTermName = new Map<string, string>();
  for (const def of definitions) {
    const stableKey = computeStableKey("defined-term", companyId, def.normalizedTerm);
    const sourceNodeId = def.sourceNodeKey ? idByNodeKey.get(def.sourceNodeKey) : undefined;
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

export async function persistContractRules(companyId: string, documentId: string, rules: CandidateContractRule[], nodeIdByLookupKey: Map<string, string>, entityClassTags: Set<string>): Promise<Map<string, string>> {
  const idBySectionRef = new Map<string, string>();
  for (const rule of rules) {
    const stableKey = computeStableKey("contract-rule", companyId, documentId, rule.sourceSectionRef, rule.action);
    const sourceNodeId = nodeIdByLookupKey.get(nodeLookupKey(documentId, rule.sourceSectionRef)) ?? null;
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

export async function persistReferences(companyId: string, documentId: string, references: CandidateContractReference[], nodeIdByLookupKey: Map<string, string>): Promise<number> {
  let persisted = 0;
  for (const ref of references) {
    const targetNodeId = ref.targetSectionRef ? nodeIdByLookupKey.get(nodeLookupKey(documentId, ref.targetSectionRef)) : undefined;
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
