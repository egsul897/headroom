/**
 * Read-only Neon intelligence baseline inventory.
 * Does not mutate production records. Does not print secrets.
 */
import { prisma } from "../../lib/prisma";

type CountRow = { label: string; count: number; extra?: Record<string, unknown> };

async function safeCount(
  label: string,
  fn: () => Promise<number>,
  extra?: () => Promise<Record<string, unknown>>,
): Promise<CountRow> {
  try {
    const count = await fn();
    const e = extra ? await extra() : undefined;
    return { label, count, ...(e ? { extra: e } : {}) };
  } catch (err) {
    return {
      label,
      count: -1,
      extra: { error: err instanceof Error ? err.message : String(err) },
    };
  }
}

async function main() {
  const startedAt = new Date().toISOString();

  const core = await Promise.all([
    safeCount("Company", () => prisma.company.count(), async () => {
      const byStatus = await prisma.company.groupBy({
        by: ["onboardingStatus"],
        _count: true,
      });
      const byTenant = await prisma.company.groupBy({
        by: ["tenantKind"],
        _count: true,
      });
      return {
        byOnboardingStatus: Object.fromEntries(
          byStatus.map((r) => [r.onboardingStatus, r._count]),
        ),
        byTenantKind: Object.fromEntries(byTenant.map((r) => [r.tenantKind, r._count])),
      };
    }),
    safeCount("Document", () => prisma.document.count(), async () => {
      const byType = await prisma.document.groupBy({ by: ["type"], _count: true });
      const distinctCompanies = await prisma.document.findMany({
        select: { companyId: true },
        distinct: ["companyId"],
      });
      return {
        byType: Object.fromEntries(byType.map((r) => [r.type, r._count])),
        distinctCompanies: distinctCompanies.length,
      };
    }),
    safeCount("DebtInstrument", () => prisma.debtInstrument.count()),
    safeCount("CovenantProvision", () => prisma.covenantProvision.count(), async () => {
      const byFormula = await prisma.covenantProvision.groupBy({
        by: ["formulaType"],
        _count: true,
      });
      const distinctDocs = await prisma.covenantProvision.findMany({
        select: { documentId: true },
        distinct: ["documentId"],
      });
      return {
        byFormulaType: Object.fromEntries(byFormula.map((r) => [r.formulaType, r._count])),
        distinctDocuments: distinctDocs.length,
      };
    }),
    safeCount("DefinedTerm", () => prisma.definedTerm.count(), async () => {
      const byStatus = await prisma.definedTerm.groupBy({
        by: ["status"],
        _count: true,
      });
      return {
        byStatus: Object.fromEntries(byStatus.map((r) => [r.status, r._count])),
      };
    }),
    safeCount("Permission", () => prisma.permission.count(), async () => {
      const byStatus = await prisma.permission.groupBy({
        by: ["reviewStatus"],
        _count: true,
      });
      const byGrant = await prisma.permission.groupBy({
        by: ["grantType"],
        _count: true,
      });
      const byModeling = await prisma.permission.groupBy({
        by: ["modelingStatus"],
        _count: true,
      });
      const byFormula = await prisma.permission.groupBy({
        by: ["formulaType"],
        _count: true,
      });
      const distinctDocs = await prisma.permission.findMany({
        select: { documentId: true },
        distinct: ["documentId"],
      });
      return {
        byReviewStatus: Object.fromEntries(byStatus.map((r) => [r.reviewStatus, r._count])),
        byGrantType: Object.fromEntries(byGrant.map((r) => [r.grantType, r._count])),
        byModelingStatus: Object.fromEntries(
          byModeling.map((r) => [r.modelingStatus, r._count]),
        ),
        byFormulaType: Object.fromEntries(byFormula.map((r) => [r.formulaType, r._count])),
        distinctDocuments: distinctDocs.length,
      };
    }),
    safeCount("PermissionRelationship", () => prisma.permissionRelationship.count()),
    safeCount("SharedCapacityConstraint", () => prisma.sharedCapacityConstraint.count()),
    safeCount("SharedCapacityConstraintMember", () =>
      prisma.sharedCapacityConstraintMember.count(),
    ),
    safeCount("SolverCoverageDeclaration", () => prisma.solverCoverageDeclaration.count()),
    safeCount("FinancialSnapshot", () => prisma.financialSnapshot.count()),
    safeCount("DebtTranche", () => prisma.debtTranche.count()),
    safeCount("LedgerEntry", () => prisma.ledgerEntry.count(), async () => {
      const byStatus = await prisma.ledgerEntry.groupBy({
        by: ["status"],
        _count: true,
      });
      return {
        byStatus: Object.fromEntries(byStatus.map((r) => [r.status, r._count])),
      };
    }),
    safeCount("FinancialState", () => prisma.financialState.count()),
    safeCount("Facility", () => prisma.facility.count()),
    safeCount("DebtEvent", () => prisma.debtEvent.count()),
    safeCount("ExternalInputRecord", () => prisma.externalInputRecord.count(), async () => {
      const byKind = await prisma.externalInputRecord.groupBy({
        by: ["kind"],
        _count: true,
      });
      const byStatus = await prisma.externalInputRecord.groupBy({
        by: ["reviewStatus"],
        _count: true,
      });
      return {
        byKind: Object.fromEntries(byKind.map((r) => [r.kind, r._count])),
        byReviewStatus: Object.fromEntries(byStatus.map((r) => [r.reviewStatus, r._count])),
      };
    }),
    safeCount("GoldenTest", () => prisma.goldenTest.count(), async () => {
      const byStatus = await prisma.goldenTest.groupBy({
        by: ["status"],
        _count: true,
      });
      const byType = await prisma.goldenTest.groupBy({
        by: ["queryType"],
        _count: true,
      });
      return {
        byStatus: Object.fromEntries(byStatus.map((r) => [r.status, r._count])),
        byQueryType: Object.fromEntries(byType.map((r) => [r.queryType, r._count])),
      };
    }),
    safeCount("LegalReviewRecord", () => prisma.legalReviewRecord.count(), async () => {
      const byStatus = await prisma.legalReviewRecord.groupBy({
        by: ["reviewStatus"],
        _count: true,
      });
      return {
        byReviewStatus: Object.fromEntries(
          byStatus.map((r) => [r.reviewStatus, r._count]),
        ),
      };
    }),
  ]);

  const extraction = await Promise.all([
    safeCount("DocumentChunk", () => prisma.documentChunk.count()),
    safeCount("ExtractionRun", () => prisma.extractionRun.count()),
    safeCount("ExtractionCandidate", () => prisma.extractionCandidate.count(), async () => {
      const byStatus = await prisma.extractionCandidate.groupBy({
        by: ["reviewStatus"],
        _count: true,
      });
      const byKind = await prisma.extractionCandidate.groupBy({
        by: ["kind"],
        _count: true,
      });
      return {
        byReviewStatus: Object.fromEntries(byStatus.map((r) => [r.reviewStatus, r._count])),
        byKind: Object.fromEntries(byKind.map((r) => [r.kind, r._count])),
      };
    }),
    safeCount("SourceArtifact", () => prisma.sourceArtifact.count()),
    safeCount("IngestionJob", () => prisma.ingestionJob.count()),
    safeCount("CompanySourceConnection", () => prisma.companySourceConnection.count()),
  ]);

  const contractModel = await Promise.all([
    safeCount("DocumentNode", () => prisma.documentNode.count()),
    safeCount("DocumentRelationshipEdge", () => prisma.documentRelationshipEdge.count(), async () => {
      const unresolved = await prisma.documentRelationshipEdge.count({
        where: { OR: [{ targetDocumentId: null }, { resolved: false }] },
      });
      const byType = await prisma.documentRelationshipEdge.groupBy({
        by: ["relationshipType"],
        _count: true,
      });
      return {
        unresolvedOrNullTarget: unresolved,
        byType: Object.fromEntries(byType.map((r) => [r.relationshipType, r._count])),
      };
    }),
    safeCount("DefinedTermNode", () => prisma.definedTermNode.count(), async () => {
      const byStatus = await prisma.definedTermNode.groupBy({
        by: ["reviewStatus"],
        _count: true,
      });
      return {
        byReviewStatus: Object.fromEntries(byStatus.map((r) => [r.reviewStatus, r._count])),
      };
    }),
    safeCount("DefinedTermDependencyEdge", () => prisma.definedTermDependencyEdge.count()),
    safeCount("ContractReferenceEdge", () => prisma.contractReferenceEdge.count(), async () => {
      const unresolved = await prisma.contractReferenceEdge.count({
        where: { resolved: false },
      });
      return { unresolved };
    }),
    safeCount("ContractRule", () => prisma.contractRule.count(), async () => {
      const byStatus = await prisma.contractRule.groupBy({
        by: ["reviewStatus"],
        _count: true,
      });
      const byFamily = await prisma.contractRule.groupBy({
        by: ["covenantFamily"],
        _count: true,
      });
      const distinctDocs = await prisma.contractRule.findMany({
        select: { sourceDocumentId: true },
        distinct: ["sourceDocumentId"],
      });
      return {
        byReviewStatus: Object.fromEntries(byStatus.map((r) => [r.reviewStatus, r._count])),
        byCovenantFamily: Object.fromEntries(
          byFamily.map((r) => [String(r.covenantFamily), r._count]),
        ),
        distinctSourceDocuments: distinctDocs.length,
      };
    }),
    safeCount("ContractRuleRelationship", () => prisma.contractRuleRelationship.count()),
    safeCount("AmendmentEffect", () => prisma.amendmentEffect.count()),
    safeCount("ContractEventObligation", () => prisma.contractEventObligation.count()),
    safeCount("ContractCoverageRecord", () => prisma.contractCoverageRecord.count()),
    safeCount("UnresolvedContractItem", () => prisma.unresolvedContractItem.count(), async () => {
      const byType = await prisma.unresolvedContractItem.groupBy({
        by: ["itemType"],
        _count: true,
      });
      return {
        byItemType: Object.fromEntries(byType.map((r) => [r.itemType, r._count])),
      };
    }),
    safeCount("ContractCompilerRun", () => prisma.contractCompilerRun.count()),
    safeCount("AnalysisRun", () => prisma.analysisRun.count(), async () => {
      const byStatus = await prisma.analysisRun.groupBy({
        by: ["status"],
        _count: true,
      });
      return {
        byStatus: Object.fromEntries(byStatus.map((r) => [r.status, r._count])),
      };
    }),
    safeCount("AnalysisRunIssue", () => prisma.analysisRunIssue.count()),
    safeCount("SemanticTruthRecord", () => prisma.semanticTruthRecord.count(), async () => {
      const byTrust = await prisma.semanticTruthRecord.groupBy({
        by: ["trustStatus"],
        _count: true,
      });
      const byKind = await prisma.semanticTruthRecord.groupBy({
        by: ["kind"],
        _count: true,
      });
      const distinctDocs = await prisma.semanticTruthRecord.findMany({
        select: { sourceDocumentId: true },
        distinct: ["sourceDocumentId"],
      });
      const verified = await prisma.semanticTruthRecord.count({
        where: { trustStatus: "VERIFIED" },
      });
      return {
        byTrustStatus: Object.fromEntries(byTrust.map((r) => [r.trustStatus, r._count])),
        byKind: Object.fromEntries(byKind.map((r) => [r.kind, r._count])),
        distinctSourceDocuments: distinctDocs.length,
        trustStatusVerified: verified,
      };
    }),
    safeCount("ClaimReviewItem", () => prisma.claimReviewItem.count()),
    safeCount("ClaimReviewDecision", () => prisma.claimReviewDecision.count()),
  ]);

  const knowledge = await Promise.all([
    safeCount("KnowledgeSource", () => prisma.knowledgeSource.count(), async () => {
      const byRights = await prisma.knowledgeSource.groupBy({
        by: ["usageRightsReviewStatus"],
        _count: true,
      });
      const byClass = await prisma.knowledgeSource.groupBy({
        by: ["documentClass"],
        _count: true,
      });
      const byRep = await prisma.knowledgeSource.groupBy({
        by: ["representationLevel"],
        _count: true,
      });
      const byExtract = await prisma.knowledgeSource.groupBy({
        by: ["extractionStatus"],
        _count: true,
      });
      const withCompany = await prisma.knowledgeSource.count({
        where: { companyId: { not: null } },
      });
      const withHash = await prisma.knowledgeSource.count({
        where: { NOT: { originalBytesHash: "" } },
      });
      const issuers = await prisma.knowledgeSource.findMany({
        select: { issuerCik: true },
        distinct: ["issuerCik"],
      });
      return {
        byUsageRights: Object.fromEntries(
          byRights.map((r) => [r.usageRightsReviewStatus, r._count]),
        ),
        byDocumentClass: Object.fromEntries(byClass.map((r) => [r.documentClass, r._count])),
        byRepresentationLevel: Object.fromEntries(
          byRep.map((r) => [r.representationLevel, r._count]),
        ),
        byExtractionStatus: Object.fromEntries(
          byExtract.map((r) => [r.extractionStatus, r._count]),
        ),
        linkedToCompany: withCompany,
        withOriginalBytesHash: withHash,
        distinctIssuers: issuers.length,
      };
    }),
    safeCount("KnowledgeRelationshipEdge", () => prisma.knowledgeRelationshipEdge.count(), async () => {
      const byKind = await prisma.knowledgeRelationshipEdge.groupBy({
        by: ["kind"],
        _count: true,
      });
      const byEvidence = await prisma.knowledgeRelationshipEdge.groupBy({
        by: ["evidenceStatus"],
        _count: true,
      });
      // targetSourceId stores logical KnowledgeSource.sourceId (not cuid id).
      const orphanVsCuid = await prisma.$queryRaw<Array<{ count: bigint }>>`
        SELECT COUNT(*)::bigint AS count
        FROM knowledge_relationship_edges e
        WHERE e."targetSourceId" IS NOT NULL
          AND NOT EXISTS (
            SELECT 1 FROM knowledge_sources s WHERE s.id = e."targetSourceId"
          )
      `;
      const orphanVsSourceId = await prisma.$queryRaw<Array<{ count: bigint }>>`
        SELECT COUNT(*)::bigint AS count
        FROM knowledge_relationship_edges e
        WHERE e."targetSourceId" IS NOT NULL
          AND NOT EXISTS (
            SELECT 1 FROM knowledge_sources s WHERE s."sourceId" = e."targetSourceId"
          )
      `;
      const resolvedViaSourceId = await prisma.$queryRaw<Array<{ count: bigint }>>`
        SELECT COUNT(*)::bigint AS count
        FROM knowledge_relationship_edges e
        JOIN knowledge_sources s ON s."sourceId" = e."targetSourceId"
      `;
      return {
        byKind: Object.fromEntries(byKind.map((r) => [r.kind, r._count])),
        byEvidenceStatus: Object.fromEntries(
          byEvidence.map((r) => [r.evidenceStatus, r._count]),
        ),
        targetColumnSemantics: "logical_sourceId_not_cuid",
        unresolvedIfJoinedAsCuid: Number(orphanVsCuid[0]?.count ?? 0),
        unresolvedVsLogicalSourceId: Number(orphanVsSourceId[0]?.count ?? 0),
        resolvedViaLogicalSourceId: Number(resolvedViaSourceId[0]?.count ?? 0),
      };
    }),
    safeCount("DocumentByteObject", () => prisma.documentByteObject.count()),
    safeCount("KnowledgeImportBatch", () => prisma.knowledgeImportBatch.count()),
    safeCount("KnowledgeCostLedgerEntry", () => prisma.knowledgeCostLedgerEntry.count()),
  ]);

  const phase4 = await Promise.all([
    safeCount("ContractInputSnapshot", () => prisma.contractInputSnapshot.count(), async () => {
      const byStatus = await prisma.contractInputSnapshot.groupBy({
        by: ["status"],
        _count: true,
      });
      return {
        byStatus: Object.fromEntries(byStatus.map((r) => [r.status, r._count])),
      };
    }),
    safeCount("ContractInputFact", () => prisma.contractInputFact.count()),
    safeCount("ContractLedgerUsage", () => prisma.contractLedgerUsage.count()),
    safeCount("ContractLedgerUsageEvent", () => prisma.contractLedgerUsageEvent.count()),
  ]);

  let knowledgeMetadata: Record<string, unknown> = {
    withV2Summaries: 0,
    covenantSummaryItems: 0,
    withCovenantCandidatesMeta: 0,
    covenantCandidatesMetaSum: 0,
    distinctSourceDocumentKeys: 0,
    emptyMetadata: 0,
  };
  try {
    const rows = await prisma.knowledgeSource.findMany({
      select: {
        accessionNumber: true,
        exhibitFilename: true,
        originalBytesHash: true,
        metadata: true,
      },
    });
    const docKeys = new Set<string>();
    let withV2 = 0;
    let itemCount = 0;
    let withCandidates = 0;
    let candidateSum = 0;
    let emptyMetadata = 0;
    for (const r of rows) {
      const key = `${r.accessionNumber || ""}::${r.exhibitFilename || ""}::${r.originalBytesHash || ""}`;
      docKeys.add(key);
      const m =
        r.metadata && typeof r.metadata === "object" && !Array.isArray(r.metadata)
          ? (r.metadata as Record<string, unknown>)
          : null;
      if (!m || Object.keys(m).length === 0) {
        emptyMetadata += 1;
        continue;
      }
      const summary = m.covenantSummary as { items?: unknown[] } | undefined;
      if (Array.isArray(summary?.items) && summary!.items!.length) {
        withV2 += 1;
        itemCount += summary!.items!.length;
      }
      const analysis = m.analysis as { covenantCandidates?: number } | undefined;
      if (typeof analysis?.covenantCandidates === "number" && analysis.covenantCandidates > 0) {
        withCandidates += 1;
        candidateSum += analysis.covenantCandidates;
      }
    }
    knowledgeMetadata = {
      withV2Summaries: withV2,
      covenantSummaryItems: itemCount,
      withCovenantCandidatesMeta: withCandidates,
      covenantCandidatesMetaSum: candidateSum,
      distinctSourceDocumentKeys: docKeys.size,
      emptyMetadata,
    };
  } catch (err) {
    knowledgeMetadata = {
      error: err instanceof Error ? err.message : String(err),
    };
  }

  let duplicatePrevalence: Record<string, unknown> = {};
  try {
    const hashDupes = await prisma.$queryRaw<
      Array<{ originalBytesHash: string; cnt: bigint }>
    >`
      SELECT "originalBytesHash", COUNT(*)::bigint AS cnt
      FROM knowledge_sources
      WHERE "originalBytesHash" IS NOT NULL AND "originalBytesHash" <> ''
      GROUP BY "originalBytesHash"
      HAVING COUNT(*) > 1
      ORDER BY cnt DESC
      LIMIT 20
    `;
    const totalWithHash = await prisma.knowledgeSource.count({
      where: { NOT: { originalBytesHash: "" } },
    });
    const dupeRowCount = hashDupes.reduce((acc, r) => acc + Number(r.cnt), 0);
    duplicatePrevalence = {
      knowledgeSourcesWithHash: totalWithHash,
      duplicateHashGroups: hashDupes.length,
      recordsInDuplicateHashGroups: dupeRowCount,
      topDuplicateHashes: hashDupes.slice(0, 10).map((r) => ({
        hashPrefix: r.originalBytesHash.slice(0, 12),
        count: Number(r.cnt),
      })),
    };
  } catch (err) {
    duplicatePrevalence = {
      error: err instanceof Error ? err.message : String(err),
    };
  }

  const orphans: Record<string, unknown> = {};
  try {
    const ksOrphanCompany = await prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*)::bigint AS count
      FROM knowledge_sources ks
      WHERE ks."companyId" IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM companies c WHERE c.id = ks."companyId")
    `;
    orphans.knowledgeSourceOrphanCompanyId = Number(ksOrphanCompany[0]?.count ?? 0);

    const ksWithDocumentId = await prisma.knowledgeSource.count({
      where: { documentId: { not: null } },
    });
    const ksDocumentIdLinked = await prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*)::bigint AS count
      FROM knowledge_sources ks
      WHERE ks."documentId" IS NOT NULL
        AND EXISTS (SELECT 1 FROM documents d WHERE d.id = ks."documentId")
    `;
    orphans.knowledgeSourceWithDocumentIdField = ksWithDocumentId;
    orphans.knowledgeSourceDocumentIdResolvesToDocument = Number(
      ksDocumentIdLinked[0]?.count ?? 0,
    );

    const byteOrphans = await prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*)::bigint AS count
      FROM document_byte_objects b
      WHERE NOT EXISTS (
        SELECT 1 FROM knowledge_sources ks
        WHERE ks."originalBytesHash" = b."contentHash"
      )
    `;
    orphans.documentByteObjectsUnreferencedByKnowledgeSourceHash = Number(
      byteOrphans[0]?.count ?? 0,
    );

    const provisionsOrphanDoc = await prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*)::bigint AS count
      FROM covenant_provisions cp
      WHERE NOT EXISTS (SELECT 1 FROM documents d WHERE d.id = cp."documentId")
    `;
    orphans.covenantProvisionOrphanDocument = Number(provisionsOrphanDoc[0]?.count ?? 0);

    const permissionsOrphanDoc = await prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*)::bigint AS count
      FROM permissions p
      WHERE NOT EXISTS (SELECT 1 FROM documents d WHERE d.id = p."documentId")
    `;
    orphans.permissionOrphanDocument = Number(permissionsOrphanDoc[0]?.count ?? 0);
  } catch (err) {
    orphans.error = err instanceof Error ? err.message : String(err);
  }

  let customerFacing: Record<string, unknown> = {};
  try {
    const companiesWithPerms = await prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(DISTINCT p."companyId")::bigint AS count FROM permissions p
    `;
    const companiesWithProvisions = await prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(DISTINCT cp."companyId")::bigint AS count FROM covenant_provisions cp
    `;
    const companiesWithSnapshots = await prisma.financialSnapshot.findMany({
      select: { companyId: true },
      distinct: ["companyId"],
    });
    const companiesWithLedger = await prisma.ledgerEntry.findMany({
      select: { companyId: true },
      distinct: ["companyId"],
    });
    const companiesWithGolden = await prisma.goldenTest.findMany({
      select: { companyId: true },
      distinct: ["companyId"],
    });
    const companiesWithSemantic = await prisma.semanticTruthRecord.findMany({
      select: { companyId: true },
      distinct: ["companyId"],
    });
    customerFacing = {
      companiesWithPermissions: Number(companiesWithPerms[0]?.count ?? 0),
      companiesWithCovenantProvisions: Number(companiesWithProvisions[0]?.count ?? 0),
      companiesWithFinancialSnapshots: companiesWithSnapshots.length,
      companiesWithLedgerEntries: companiesWithLedger.length,
      companiesWithGoldenTests: companiesWithGolden.length,
      companiesWithSemanticTruth: companiesWithSemantic.length,
    };
  } catch (err) {
    customerFacing = {
      error: err instanceof Error ? err.message : String(err),
    };
  }

  const report = {
    schemaVersion: "neon-intelligence-baseline.v1",
    generatedAt: startedAt,
    finishedAt: new Date().toISOString(),
    accessMode: "READ_ONLY",
    databaseHostHint: "neon (pooled) — hostname omitted from report",
    layers: {
      coreTenantAndLegacyEngine: core,
      extractionAndIngestion: extraction,
      contractModelAndSemanticTruth: contractModel,
      knowledgeFactory: knowledge,
      phase4InputsAndLedger: phase4,
    },
    knowledgeMetadata,
    duplicatePrevalence,
    orphans,
    customerFacing,
  };

  console.log(JSON.stringify(report, null, 2));
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  try {
    await prisma.$disconnect();
  } catch {
    /* ignore */
  }
  process.exit(1);
});
