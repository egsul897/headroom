/**
 * Phase C persistence layer - maps each stage's Candidate-shaped and
 * StructuralNode output into the real Phase B tables (docs/contract-model-foundation-phase-b.md),
 * never a second parallel data model. Every write is an upsert keyed by
 * (companyId, stableKey) computed via lib/contract-model/stable-keys.ts's
 * computeStableKey - the same content-derived-identity discipline every
 * other Phase B table already uses - so replaying the same package (task
 * §72/§73 idempotency/replay safety) never duplicates a row; it updates the
 * existing one in place.
 *
 * Phase 3F.1.4 (P0-2/P1-9 remediation, docs/foundation-assurance/02-tenant-
 * instrument-isolation-results.json + 12-fault-injection-results.json):
 *
 * P0-2 - `defined-term` stableKeys (persistStructuralDefinitions,
 * persistDefinedTerms) now include `documentId`, matching DocumentNode
 * (charStart) and ContractRule (sourceDocumentId)'s own disambiguators. A
 * DefinedTermNode row's identity is the PHYSICAL DEFINITION OCCURRENCE - "this
 * document's own declaration of this term" - never the bare lexical string
 * alone. Two facilities independently defining "Payment Conditions" now
 * persist as two genuinely separate, internally-consistent rows (each row's
 * own documentId and sourceNodeId always agree, because each row belongs to
 * exactly one document by construction) instead of colliding onto one
 * contradictory row. This does NOT change the DB-level tenant/lexical
 * scoping already correct for every other model; it only adds the missing
 * instrument/document axis defined-term identity was missing. A caller that
 * wants "the term this company uses, regardless of which document defines
 * it" was never a coherent request in real multi-instrument drafting (the
 * whole point of this fix) and must now explicitly choose a documentId/
 * instrument scope or accept an honestly-ambiguous multi-row result - never
 * an arbitrary single implicit answer.
 *
 * P1-9 - every persist* function below that previously only ever upserted
 * (never deleted) now also tombstones, in the SAME database transaction,
 * any previously-persisted row for a (companyId, documentId) pair actually
 * represented in the current call's own input that the current run no
 * longer produces - e.g. a corrected extraction that stops emitting a
 * spurious duplicate. This is a real DELETE, not a soft "isCurrent" flag:
 * no current consumer in this codebase (service.ts, validators.ts, the
 * amendment/context-retrieval layers) reads or needs prior-extraction-run
 * history for these five models - the codebase's own real historical-
 * lineage mechanism (ContractRule.effectiveFrom/effectiveTo/
 * supersededByRuleId, driven by AMENDMENTS across DIFFERENT documents, never
 * by re-parsing the SAME document) is untouched by this change, since
 * tombstoning here is always scoped to one document's own re-persisted
 * output, never across documents. Scoping is always (companyId, documentId)
 * for a document actually present in this call's input - never a broader
 * company-wide or table-wide delete - and every persist* function's entire
 * upsert+tombstone sequence runs inside one `prisma.$transaction`, so a
 * partial failure rolls back atomically rather than leaving stale rows
 * deleted with their replacements only half-written.
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
  return prisma.$transaction(async (tx) => {
    const idByNodeId = new Map<string, string>();
    const idsByLegalRef = new Map<string, string[]>();
    const currentKeysByDocument = new Map<string, Set<string>>();
    for (const node of nodes) {
      const stableKey = computeStableKey("document-node", companyId, node.documentId, node.nodeType, node.sectionRef, String(node.charStart));
      const row = await tx.documentNode.upsert({
        where: { companyId_stableKey: { companyId, stableKey } },
        create: { companyId, documentId: node.documentId, stableKey, nodeType: node.nodeType, heading: node.heading, sectionRef: node.sectionRef, ordinal: node.ordinal, charStart: node.charStart, charEnd: node.charEnd },
        update: { heading: node.heading, ordinal: node.ordinal, charStart: node.charStart, charEnd: node.charEnd },
      });
      idByNodeId.set(node.nodeId, row.id);
      const legalRefKey = nodeLookupKey(node.documentId, node.sectionRef);
      const list = idsByLegalRef.get(legalRefKey) ?? [];
      list.push(row.id);
      idsByLegalRef.set(legalRefKey, list);
      const keys = currentKeysByDocument.get(node.documentId) ?? new Set<string>();
      keys.add(stableKey);
      currentKeysByDocument.set(node.documentId, keys);
    }
    for (const node of nodes) {
      if (!node.parentNodeId) continue;
      const parentId = idByNodeId.get(node.parentNodeId);
      if (!parentId) continue; // parent wasn't itself a recognized structural node (e.g. an ARTICLE-less top-level SECTION) - leave parentId null rather than guess.
      const childId = idByNodeId.get(node.nodeId)!;
      await tx.documentNode.update({ where: { id: childId }, data: { parentId } });
    }
    // Phase 3F.1.4 (P1-9) - tombstone: for every document actually
    // represented in `nodes`, delete any previously-persisted DocumentNode
    // row for THAT (companyId, documentId) pair whose stableKey the current
    // run did not (re-)produce. A document with zero nodes in this call is
    // never touched - this asserts nothing about documents this call was
    // not given evidence for.
    for (const [documentId, currentKeys] of currentKeysByDocument) {
      await tx.documentNode.deleteMany({ where: { companyId, documentId, stableKey: { notIn: [...currentKeys] } } });
    }
    return { idByNodeId, idsByLegalRef };
  }, { timeout: 30_000 });
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
 *
 * Phase 3F.1.4 (P1-9) - this previously used a plain `.create()` with no
 * stableKey at all (ContractReferenceEdge had none), so replaying the same
 * document's reference-detection pass duplicated every edge on every run,
 * and a corrected pass that stopped emitting a spurious reference left the
 * stale edge in place forever. Now upserts on a real content-derived
 * stableKey (documentId + this occurrence's own charStart/charEnd +
 * referenceText - the same charStart-based physical-occurrence discipline
 * DocumentNode already uses) and tombstones, per document actually present
 * in `references`, any previously-persisted edge with that stableKey scheme
 * the current run no longer produces. The OTHER creator of this model,
 * persistReferences below (the LLM-candidate path), is deliberately
 * untouched - it has no stableKey of its own and this function's tombstone
 * step only ever matches non-null stableKeys, so it can never delete a row
 * that function created.
 */
export async function persistStructuralReferences(companyId: string, references: DetectedReference[], nodeIndex: PersistedNodeIndex): Promise<number> {
  return prisma.$transaction(async (tx) => {
    let persisted = 0;
    const currentKeysByDocument = new Map<string, Set<string>>();
    for (const ref of references) {
      const sourceNodeId = ref.sourceNodeId ? nodeIndex.idByNodeId.get(ref.sourceNodeId) : undefined;
      const targetDocumentNodeId = ref.targetNodeId ? nodeIndex.idByNodeId.get(ref.targetNodeId) : undefined;
      const stableKey = computeStableKey("reference-edge", companyId, ref.documentId, String(ref.charStart), String(ref.charEnd), ref.referenceText);
      await tx.contractReferenceEdge.upsert({
        where: { companyId_stableKey: { companyId, stableKey } },
        create: {
          companyId,
          stableKey,
          sourceNodeId,
          referenceType: "REQUIRES",
          referenceText: ref.referenceText,
          targetType: ref.resolved ? "SECTION" : "UNRESOLVED",
          targetDocumentNodeId,
          resolved: ref.resolved,
          unresolvedReason: ref.unresolvedReason ?? undefined,
        },
        update: {
          sourceNodeId,
          targetType: ref.resolved ? "SECTION" : "UNRESOLVED",
          targetDocumentNodeId,
          resolved: ref.resolved,
          unresolvedReason: ref.unresolvedReason ?? undefined,
        },
      });
      persisted++;
      const keys = currentKeysByDocument.get(ref.documentId) ?? new Set<string>();
      keys.add(stableKey);
      currentKeysByDocument.set(ref.documentId, keys);
    }
    // Tombstone: for every document actually represented in `references`,
    // delete any previously-persisted edge THIS function created for that
    // (companyId, documentId) (identified by a non-null stableKey - never
    // touching persistReferences' own null-stableKey rows) that the current
    // run did not reproduce. Scoping the stableKey match to this document's
    // own charStart/charEnd namespace (via the deterministic formula above,
    // never a bare `stableKey: { not: null }`) means this can only ever
    // match rows this same function persisted for this same document.
    for (const [documentId, currentKeys] of currentKeysByDocument) {
      await tx.contractReferenceEdge.deleteMany({
        where: { companyId, stableKey: { not: null, notIn: [...currentKeys] }, sourceNode: { documentId } },
      });
    }
    return persisted;
  }, { timeout: 30_000 });
}

/**
 * Phase 2A - persists deterministically-detected defined-term declarations
 * (structural-definitions.ts). Uses the SAME stableKey scheme as
 * persistDefinedTerms below (keyed by companyId + documentId + lowercased
 * term name - see the P0-2 header comment above) so a term found by both the
 * deterministic detector and the LLM DEFINITIONS stage for the SAME
 * document converges on one row rather than creating a duplicate, while a
 * legitimately different document's own same-named definition never
 * collides onto it - this call additionally fills in sourceNodeId/
 * definitionTextRef, which the LLM path alone never populated with a real
 * structural anchor. Phase 3F.1.2: resolved via DetectedDefinition's own
 * real `sourceNodeId` field (physical occurrence identity), never the
 * deprecated `sourceNodeKey`.
 *
 * Phase 3F.1.4 (P0-2): stableKey now includes `def.documentId` - the fix for
 * docs/foundation-assurance/02-tenant-instrument-isolation-results.json's
 * `definitions-cross-instrument-P0` finding. Every row this upsert ever
 * creates or updates now belongs to exactly one document by construction,
 * so `documentId` and `sourceNodeId` (via nodeIndex, itself always scoped to
 * the document that built it) can never disagree the way they did before -
 * the internal-contradiction defect is closed structurally, not just
 * papered over with an extra check.
 *
 * Phase 3F.1.4 (P1-9): tombstones, per document actually represented in
 * `definitions`, any previously-persisted DefinedTermNode row for that
 * (companyId, documentId) whose stableKey the current run did not
 * reproduce - e.g. a corrected detector that stops emitting a spurious
 * duplicate declaration. Runs in the same transaction as the upserts.
 */
export async function persistStructuralDefinitions(companyId: string, definitions: DetectedDefinition[], nodeIndex: PersistedNodeIndex): Promise<Map<string, string>> {
  return prisma.$transaction(async (tx) => {
    // Keyed by normalizedTerm only, matching this function's pre-existing
    // return-type contract - if `definitions` spans multiple documents that
    // each define the same term name (now legitimately two separate rows,
    // per the P0-2 fix above), this convenience map retains only the LAST
    // one seen; callers needing a specific document's own term id must go
    // through the real DB row (companyId, documentId, stableKey), not this
    // map - there is no current caller of this map across multiple
    // documents in one call (grep-confirmed: persistStructuralDefinitions
    // has no production caller at all today; its own tests exercise one
    // document at a time).
    const idByTermName = new Map<string, string>();
    const currentKeysByDocument = new Map<string, Set<string>>();
    for (const def of definitions) {
      const stableKey = computeStableKey("defined-term", companyId, def.documentId, def.normalizedTerm);
      const sourceNodeId = def.sourceNodeId ? nodeIndex.idByNodeId.get(def.sourceNodeId) : undefined;
      const row = await tx.definedTermNode.upsert({
        where: { companyId_stableKey: { companyId, stableKey } },
        create: { companyId, documentId: def.documentId, stableKey, termName: def.exactTerm, normalizedName: def.normalizedTerm, sourceNodeId, definitionTextRef: def.definitionExcerpt },
        update: { sourceNodeId, definitionTextRef: def.definitionExcerpt },
      });
      idByTermName.set(def.normalizedTerm, row.id);
      const keys = currentKeysByDocument.get(def.documentId) ?? new Set<string>();
      keys.add(stableKey);
      currentKeysByDocument.set(def.documentId, keys);
    }
    for (const [documentId, currentKeys] of currentKeysByDocument) {
      await tx.definedTermNode.deleteMany({ where: { companyId, documentId, stableKey: { notIn: [...currentKeys] } } });
    }
    return idByTermName;
  }, { timeout: 30_000 });
}

/**
 * Phase 3F.1.4 (P0-2): stableKey now includes `documentId` - see the P0-2
 * header comment above and persistStructuralDefinitions' own comment; this
 * is the production-wired twin of that function (orchestrator.ts calls this
 * one, per-document, for the LLM DEFINITIONS stage's candidates) and carried
 * the identical defect (confirmed independently in
 * docs/foundation-assurance/12-fault-injection-results.json's "cross-
 * document definition collision at PERSISTENCE layer" finding).
 *
 * Phase 3F.1.4 (P1-9): tombstones any previously-persisted DefinedTermNode
 * row for this (companyId, documentId) whose stableKey the current run did
 * not reproduce, in the same transaction as the upserts. Already
 * document-scoped by this function's own signature, so no per-item grouping
 * is needed here the way the other four persist* functions require.
 */
export async function persistDefinedTerms(companyId: string, documentId: string, terms: CandidateDefinedTerm[]): Promise<Map<string, string>> {
  return prisma.$transaction(async (tx) => {
    const idByTermName = new Map<string, string>();
    const currentKeys = new Set<string>();
    for (const term of terms) {
      const stableKey = computeStableKey("defined-term", companyId, documentId, term.termName.toLowerCase());
      const row = await tx.definedTermNode.upsert({
        where: { companyId_stableKey: { companyId, stableKey } },
        create: { companyId, documentId, stableKey, termName: term.termName, normalizedName: term.termName.toLowerCase(), definitionTextRef: term.sourceSectionRef },
        update: { definitionTextRef: term.sourceSectionRef },
      });
      idByTermName.set(term.termName.toLowerCase(), row.id);
      currentKeys.add(stableKey);
    }
    // Fail-closed guard (disclosed, not silently incomplete): an EMPTY
    // `terms` array never triggers a tombstone. This function's own
    // documentId scoping means an empty call could mean either "this
    // document genuinely has zero defined terms" OR "an upstream stage
    // failed/produced nothing this run" - those are indistinguishable from
    // this function's own signature alone, and silently deleting every
    // previously-known term for a document on the strength of an empty
    // array would risk exactly the kind of silent, catastrophic data loss
    // this whole remediation phase exists to prevent. A genuine
    // "this document truly has zero terms now" correction requires a
    // non-empty call this function can actually compare against (or an
    // explicit administrative action), never an implicit side effect of an
    // ordinary empty re-run.
    if (currentKeys.size > 0) {
      await tx.definedTermNode.deleteMany({ where: { companyId, documentId, stableKey: { notIn: [...currentKeys] } } });
    }
    return idByTermName;
  }, { timeout: 30_000 });
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
 *
 * Phase 3F.1.4 (P1-9): tombstones, inside the same transaction as the
 * upserts, any previously-persisted ContractRule row for this
 * (companyId, sourceDocumentId=documentId) whose stableKey the current run
 * did not reproduce - e.g. a corrected extraction that stops emitting a
 * spurious duplicate rule. Never fires on an EMPTY `rules` array (see
 * persistDefinedTerms' identical guard's comment for why) - an upstream
 * failure that yields zero candidates must never be indistinguishable from
 * "this document was re-examined and genuinely has zero rules now."
 * Pre-existing FK semantics (ContractReferenceEdge.sourceRuleId: Cascade;
 * targetRuleId/AmendmentEffect.targetRuleId/ContractRule.supersededByRuleId:
 * SetNull; ContractRuleRelationship: Cascade) already govern what happens to
 * dependents of a tombstoned rule - this fix does not change any of that,
 * it only makes the tombstone itself actually happen.
 */
/**
 * Phase 3F.1.5.R (sub-task 2) - `ContractRule.definedTermRefs` must be
 * stored in the SAME identity space `getRuleSourceTrace`/
 * `validateDefinedTermTargetsExist` (lib/contract-model/service.ts,
 * lib/contract-model/validators.ts) already query it in: DefinedTermNode's
 * own `stableKey`, not the raw defined-term name string. This function used
 * to persist `rule.definedTermRefs` verbatim (the raw candidate term names,
 * e.g. "Consolidated EBITDA") - real, verified defect, not a false alarm:
 * those raw strings can never equal a `defined-term:<sha256>` stableKey, so
 * every real rule's source trace silently reported an EMPTY `definedTerms`
 * array (and `validateDefinedTermTargetsExist` flagged every non-empty
 * `definedTermRefs` rule as referencing an "unknown" term, a permanent
 * false-positive baked into the VALIDATION stage's own status - masked from
 * ever blocking promotion only by an unrelated, separate pre-existing bug in
 * stage-promotion.ts's own issue-message filter, which matches on
 * `rule.sourceSectionRef` while this validator's own message names the
 * rule's opaque db id instead, so the false-positive issue never actually
 * attaches to any rule's promotion decision - that filter bug is a distinct,
 * narrower defect, out of this sub-task's scope, and left untouched here).
 *
 * The fix computes each ref's document-scoped stableKey with the EXACT same
 * formula `persistDefinedTerms` below already uses to create the row in the
 * first place (`computeStableKey("defined-term", companyId, documentId,
 * name.toLowerCase())`) - never a new/second identity scheme. `documentId`
 * is this rule's own `sourceDocumentId` (the only document a bare defined-
 * term NAME reference can safely mean without cross-document guessing - the
 * same P0-2-family discipline sub-task 1 applies elsewhere in this phase).
 * `persistDefinedTerms` is production-orchestrator's only currently-wired
 * term-persistence path (orchestrator.ts calls it per-document; the
 * alternative persistStructuralDefinitions has no production caller today -
 * grep-confirmed), so this is the one real target identity to match; if a
 * referenced term's own row does not exist yet/at all, the computed
 * stableKey simply will not resolve in getRuleSourceTrace/validators, which
 * is the correct, honest NOT_FOUND-shaped behavior (never fabricated), not
 * a new failure mode.
 */
function toDefinedTermStableKeys(companyId: string, documentId: string, definedTermRefs: string[]): string[] {
  return definedTermRefs.map((name) => computeStableKey("defined-term", companyId, documentId, name.toLowerCase()));
}

export async function persistContractRules(companyId: string, documentId: string, rules: CandidateContractRule[], nodeIndex: PersistedNodeIndex, entityClassTags: Set<string>): Promise<Map<string, string>> {
  return prisma.$transaction(async (tx) => {
    const idBySectionRef = new Map<string, string>();
    const currentKeys = new Set<string>();
    for (const rule of rules) {
      const stableKey = computeStableKey("contract-rule", companyId, documentId, rule.sourceSectionRef, rule.action);
      const sourceNodeId = resolveUniquePersistedNodeByRef(nodeIndex, documentId, rule.sourceSectionRef) ?? null;
      const definedTermRefs = toDefinedTermStableKeys(companyId, documentId, rule.definedTermRefs);
      const row = await tx.contractRule.upsert({
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
          definedTermRefs,
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
          // Phase 3F.1.5.R (sub-task 2): previously omitted from the update
          // branch entirely, so a re-run that corrected/added defined-term
          // references left the ORIGINAL (pre-fix, or simply stale) value
          // permanently in place on any already-persisted rule row - the
          // same "upsert's update branch must touch every field a re-run can
          // legitimately change" discipline P0-2's own remediation already
          // established for this table (see this file's header comment).
          definedTermRefs,
          notes: rule.notes,
        },
      });
      idBySectionRef.set(rule.sourceSectionRef, row.id);
      currentKeys.add(stableKey);
    }
    if (currentKeys.size > 0) {
      await tx.contractRule.deleteMany({ where: { companyId, sourceDocumentId: documentId, stableKey: { notIn: [...currentKeys] } } });
    }
    return idBySectionRef;
  }, { timeout: 30_000 });
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
