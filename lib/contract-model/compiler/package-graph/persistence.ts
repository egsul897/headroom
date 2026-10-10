/**
 * Phase 2C persistence - maps PackageGraphResult onto the real schema
 * (DebtInstrument/Document.instrumentId+type/DocumentRelationshipEdge/
 * AmendmentEffect), never a parallel table. Every write is idempotent
 * (findFirst-then-create/update, or a real upsert where a natural key
 * exists) so replaying the same package never duplicates a row - the same
 * discipline lib/contract-model/compiler/persistence.ts already
 * established for Phase C's own stage outputs.
 *
 * Incrementality (task §20): because every classification/identity/
 * relationship-candidate is computed per-SOURCE-document (a document's own
 * classification and its own outgoing relationship candidates depend only
 * on its own text, plus - for relationship TARGET resolution only - the
 * other documents' cheap identity signals (type/execution date), never
 * their full text), changing one document's body text never changes
 * another document's own classification, identity, or outgoing
 * relationship candidates, unless that change altered the OTHER document's
 * own identity signals. persistPackageGraph reflects this directly:
 * documents whose derived rows are unchanged simply upsert to the same
 * values (a genuine no-op write, not a skipped one) - never touching
 * relationship edges or instrument members that do not mention the changed
 * document. See package-graph-incrementality.test.ts for a real
 * assertion of this (unrelated documents' own persisted rows are
 * byte-identical after only one document's unrelated body text changes).
 *
 * Canonical instrument identity: only InstrumentGroupingResult.documentIds
 * (trusted confirmed members) receive Document.instrumentId.
 * provisionalDocumentIds are discovery associations and never assign
 * instrumentId. Stale assignments to managed instruments are cleared on replay.
 */
import { prisma } from "../../../prisma";
import type { DocumentType } from "@prisma/client";
import type { ModificationOperation, PackageGraphResult } from "./types";

const AMENDMENT_EFFECT_TYPE_BY_OPERATION: Record<ModificationOperation, "REPLACE_TEXT" | "ADD_TEXT" | "DELETE_TEXT" | "MODIFY_PROVISION" | "UNKNOWN_CHANGE"> = {
  REPLACE: "REPLACE_TEXT",
  ADD: "ADD_TEXT",
  DELETE: "DELETE_TEXT",
  MODIFY: "MODIFY_PROVISION",
  RESTATE: "REPLACE_TEXT",
  UNKNOWN_CHANGE: "UNKNOWN_CHANGE",
};

export interface PackageGraphPersistenceSummary {
  documentTypesUpdated: number;
  instrumentsUpserted: number;
  documentsAssignedToInstrument: number;
  relationshipEdgesUpserted: number;
  amendmentEffectCandidatesUpserted: number;
}

/** Only proposes a classification onto Document.type when nobody has confirmed a type yet (typeConfirmedByUser === false) and confidence clears a real bar - never silently overwrites a human-confirmed value (task §4/§14's own conservatism applied to persistence, not just detection). */
const MIN_CONFIDENCE_TO_PROPOSE_TYPE = 0.7;

export async function persistPackageGraph(companyId: string, result: PackageGraphResult): Promise<PackageGraphPersistenceSummary> {
  let documentTypesUpdated = 0;
  for (const classification of result.classifications) {
    if (classification.confidence < MIN_CONFIDENCE_TO_PROPOSE_TYPE) continue;
    const doc = await prisma.document.findUnique({ where: { id: classification.documentId }, select: { typeConfirmedByUser: true, type: true } });
    if (!doc || doc.typeConfirmedByUser) continue;
    if (doc.type === classification.type) continue;
    await prisma.document.update({ where: { id: classification.documentId }, data: { type: classification.type as DocumentType } });
    documentTypesUpdated++;
  }

  let instrumentsUpserted = 0;
  let documentsAssignedToInstrument = 0;
  // Canonical membership only — provisionalDocumentIds never assign instrumentId.
  const confirmedDocumentToInstrumentId = new Map<string, string>();
  const managedInstrumentIds = new Set<string>();
  const currentBaseDocumentIds = new Set(
    result.instruments.map((i) => i.baseDocumentId).filter((id): id is string => !!id),
  );

  for (const instrument of result.instruments) {
    if (!instrument.baseDocumentId) continue;
    const reviewStatus = instrument.reviewStatus === "RESOLVED" ? "APPROVED" : "REVIEW_REQUIRED";
    const existing = await prisma.debtInstrument.findFirst({ where: { companyId, baseDocumentId: instrument.baseDocumentId } });
    let row = existing;
    if (!existing) {
      row = await prisma.debtInstrument.create({ data: { companyId, baseDocumentId: instrument.baseDocumentId, name: instrument.name, confidence: instrument.confidence, reviewStatus } });
      instrumentsUpserted++;
    } else if (existing.name !== instrument.name || existing.confidence !== instrument.confidence || existing.reviewStatus !== reviewStatus) {
      // No-op skip when nothing actually changed (task §20): an unrelated
      // document's re-derived instrument row must not touch updatedAt just
      // from being re-persisted with identical values.
      row = await prisma.debtInstrument.update({ where: { id: existing.id }, data: { name: instrument.name, confidence: instrument.confidence, reviewStatus } });
      instrumentsUpserted++;
    }
    managedInstrumentIds.add(row!.id);
    for (const documentId of instrument.documentIds) {
      confirmedDocumentToInstrumentId.set(documentId, row!.id);
    }
  }

  // Assign / reassign confirmed members.
  for (const [documentId, instrumentId] of confirmedDocumentToInstrumentId) {
    const doc = await prisma.document.findUnique({ where: { id: documentId }, select: { instrumentId: true } });
    if (doc?.instrumentId === instrumentId) continue;
    await prisma.document.update({ where: { id: documentId }, data: { instrumentId } });
    documentsAssignedToInstrument++;
  }

  // Clear stale canonical membership: package documents still pointing at a
  // managed instrument without being confirmed members (e.g. former provisional
  // mis-assignment, or membership removed after edge rejection/downgrade).
  const packageDocumentIds = new Set(result.classifications.map((c) => c.documentId));
  for (const documentId of packageDocumentIds) {
    const expected = confirmedDocumentToInstrumentId.get(documentId);
    if (expected) continue; // already assigned above
    const doc = await prisma.document.findUnique({ where: { id: documentId }, select: { instrumentId: true } });
    if (!doc?.instrumentId) continue;
    if (!managedInstrumentIds.has(doc.instrumentId)) continue;
    await prisma.document.update({ where: { id: documentId }, data: { instrumentId: null } });
  }

  // Drop orphan DebtInstrument rows whose base is no longer a current instrument
  // base and that have zero remaining member documents (upgrade/merge cleanup).
  if (currentBaseDocumentIds.size > 0) {
    const orphans = await prisma.debtInstrument.findMany({
      where: { companyId, baseDocumentId: { notIn: [...currentBaseDocumentIds] } },
      select: { id: true },
    });
    for (const orphan of orphans) {
      const members = await prisma.document.count({ where: { instrumentId: orphan.id } });
      if (members === 0) {
        await prisma.debtInstrument.delete({ where: { id: orphan.id } });
      }
    }
  }

  let relationshipEdgesUpserted = 0;
  for (const rel of result.relationshipCandidates) {
    const existing = await prisma.documentRelationshipEdge.findFirst({ where: { companyId, sourceDocumentId: rel.sourceDocumentId, relationshipType: rel.relationshipType as never, sourceCitation: rel.sourceCitation } });
    const data = {
      companyId,
      sourceDocumentId: rel.sourceDocumentId,
      targetDocumentId: rel.targetDocumentId,
      relationshipType: rel.relationshipType as never,
      sourceCitation: rel.sourceCitation,
      targetHint: rel.targetHint,
      confidence: rel.confidence,
      resolved: rel.status === "RESOLVED",
      unresolvedReason: rel.unresolvedReason,
      resolutionMethod: rel.resolutionMethod,
      reviewStatus: (rel.status === "REVIEW_REQUIRED" ? "REVIEW_REQUIRED" : "PENDING") as never,
    };
    if (!existing) {
      await prisma.documentRelationshipEdge.create({ data });
      relationshipEdgesUpserted++;
    } else if (existing.targetDocumentId !== data.targetDocumentId || existing.targetHint !== data.targetHint || existing.confidence !== data.confidence || existing.resolved !== data.resolved || existing.unresolvedReason !== data.unresolvedReason) {
      await prisma.documentRelationshipEdge.update({ where: { id: existing.id }, data });
      relationshipEdgesUpserted++;
    }
  }

  // Natural key is WHAT is targeted (document + effect kind + target ref),
  // never the raw matched excerpt text - the excerpt is expected to change
  // wording across re-scans of the same underlying amendment clause, and
  // keying on it would silently orphan the old row instead of updating it
  // in place (a real bug this exact design caught during development).
  let amendmentEffectCandidatesUpserted = 0;
  for (const mc of result.modificationCandidates) {
    const effectType = AMENDMENT_EFFECT_TYPE_BY_OPERATION[mc.operation];
    const existing = await prisma.amendmentEffect.findFirst({ where: { companyId, amendmentDocumentId: mc.sourceDocumentId, effectType: effectType as never, targetSectionRef: mc.targetSectionRef, targetDefinedTermRef: mc.targetDefinedTermRef } });
    const data = {
      companyId,
      amendmentDocumentId: mc.sourceDocumentId,
      effectType: effectType as never,
      targetDocumentId: mc.targetDocumentId,
      targetSectionRef: mc.targetSectionRef,
      targetDefinedTermRef: mc.targetDefinedTermRef,
      description: `Modification candidate (${mc.operation}) detected in ${mc.sourceNodeCitation}${mc.targetSectionRef ? `, targeting Section ${mc.targetSectionRef}` : ""}${mc.targetDefinedTermRef ? `, targeting the definition of "${mc.targetDefinedTermRef}"` : ""}.`,
      sourceSectionRef: mc.sourceText,
      resolved: mc.status === "RESOLVED",
      unresolvedReason: mc.unresolvedReason,
      resolutionMethod: "DETERMINISTIC_AMENDMENT_STATEMENT",
      reviewStatus: "REVIEW_REQUIRED" as never,
    };
    if (!existing) {
      await prisma.amendmentEffect.create({ data });
      amendmentEffectCandidatesUpserted++;
    } else if (existing.targetDocumentId !== data.targetDocumentId || existing.resolved !== data.resolved || existing.unresolvedReason !== data.unresolvedReason || existing.sourceSectionRef !== data.sourceSectionRef) {
      await prisma.amendmentEffect.update({ where: { id: existing.id }, data });
      amendmentEffectCandidatesUpserted++;
    }
  }

  return { documentTypesUpdated, instrumentsUpserted, documentsAssignedToInstrument, relationshipEdgesUpserted, amendmentEffectCandidatesUpserted };
}
