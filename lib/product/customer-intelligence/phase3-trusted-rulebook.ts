/**
 * Read-only product view of Phase 3 trusted semantic truth.
 *
 * Uses the existing AUDIT-F1 trust gate (SemanticTruthRecord.trustStatus ===
 * VERIFIED — the same filter as getTrustedSemanticTruth). Does NOT certify
 * candidates, assemble package certification, or invent PHASE3_CERTIFIED /
 * Phase 4E capacity. Package certification remains Phase 3 agent /
 * lib/contract-model/phase3-certification/**.
 */

import { prisma } from "@/lib/prisma";
import type { SemanticTruthKind, SemanticTruthTrustStatus } from "@prisma/client";

export interface Phase3TrustedRuleUnit {
  semanticObjectId: string;
  kind: SemanticTruthKind;
  instrumentKey: string;
  sourceSectionRef: string | null;
  sourceCitation: string | null;
  sourceDocumentId: string;
  trustStatus: "VERIFIED";
}

export interface Phase3TrustedRulebookStatus {
  companyId: string;
  /** VERIFIED SemanticTruthRecord count (trusted semantic units). */
  trustedUnitCount: number;
  trustedRuleCount: number;
  trustedDefinitionCount: number;
  /** Distinct instruments that have at least one VERIFIED unit. */
  instrumentKeysWithTrustedTruth: string[];
  /** Non-VERIFIED rows still on file (compiled / review / contradicted / unsupported). */
  nonTrustedByStatus: Partial<Record<SemanticTruthTrustStatus, number>>;
  /**
   * True only when at least one VERIFIED unit exists.
   * Never means package CERTIFIED or Phase 4E-executable capacity.
   */
  hasTrustedSemanticUnits: boolean;
  units: Phase3TrustedRuleUnit[];
}

/**
 * Load Phase 3 trusted semantic units for product surfaces.
 * Empty when analysis has not produced VERIFIED truth — fail closed, never invent.
 */
export async function loadPhase3TrustedRulebookStatus(
  companyId: string,
): Promise<Phase3TrustedRulebookStatus> {
  const [trusted, nonTrustedGroups] = await Promise.all([
    prisma.semanticTruthRecord.findMany({
      where: { companyId, trustStatus: "VERIFIED" },
      orderBy: [{ instrumentKey: "asc" }, { kind: "asc" }, { updatedAt: "desc" }],
      select: {
        semanticObjectId: true,
        kind: true,
        instrumentKey: true,
        sourceSectionRef: true,
        sourceCitation: true,
        sourceDocumentId: true,
        trustStatus: true,
      },
    }),
    prisma.semanticTruthRecord.groupBy({
      by: ["trustStatus"],
      where: { companyId, trustStatus: { not: "VERIFIED" } },
      _count: true,
    }),
  ]);

  const nonTrustedByStatus: Partial<Record<SemanticTruthTrustStatus, number>> = {};
  for (const g of nonTrustedGroups) {
    nonTrustedByStatus[g.trustStatus] = g._count;
  }

  const units: Phase3TrustedRuleUnit[] = trusted.map((r) => ({
    semanticObjectId: r.semanticObjectId,
    kind: r.kind,
    instrumentKey: r.instrumentKey,
    sourceSectionRef: r.sourceSectionRef,
    sourceCitation: r.sourceCitation,
    sourceDocumentId: r.sourceDocumentId,
    trustStatus: "VERIFIED",
  }));

  const instrumentKeysWithTrustedTruth = [...new Set(units.map((u) => u.instrumentKey))].sort();

  return {
    companyId,
    trustedUnitCount: units.length,
    trustedRuleCount: units.filter((u) => u.kind === "RULE").length,
    trustedDefinitionCount: units.filter((u) => u.kind === "DEFINITION").length,
    instrumentKeysWithTrustedTruth,
    nonTrustedByStatus,
    hasTrustedSemanticUnits: units.length > 0,
    units,
  };
}
