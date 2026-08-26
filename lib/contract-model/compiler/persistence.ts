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
import type { EntityClassTag } from "@prisma/client";

/** Key used everywhere a rule/reference needs to look up "the node for this section, in this document" - documentId-scoped so two documents in the same package sharing a section number (e.g. both have a "6.01") never collide. */
export function nodeLookupKey(documentId: string, sectionRef: string): string {
  return `${documentId}::${sectionRef.replace(/\s+/g, "")}`;
}

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
  return idByLookupKey;
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

export async function persistRuleRelationships(companyId: string, relationships: CandidateRuleRelationship[], ruleIdBySectionRef: Map<string, string>): Promise<number> {
  let persisted = 0;
  for (const rel of relationships) {
    const fromId = ruleIdBySectionRef.get(rel.fromRuleRef);
    const toId = ruleIdBySectionRef.get(rel.toRuleRef);
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
