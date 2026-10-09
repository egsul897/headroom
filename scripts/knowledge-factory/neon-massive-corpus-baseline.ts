/**
 * Read-only Neon corpus baseline for Continuous Debt Agreement / Covenant Factory.
 * Does not print secrets. Does not write.
 */
import { Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma";

async function safeCount(label: string, fn: () => Promise<number>): Promise<[string, number | string]> {
  try {
    return [label, await fn()];
  } catch (e) {
    return [label, `ERR: ${e instanceof Error ? e.message.slice(0, 120) : String(e).slice(0, 120)}`];
  }
}

async function dbSize(): Promise<Record<string, unknown>> {
  try {
    const size = await prisma.$queryRaw<Array<{ db_size: string; db_size_bytes: bigint }>>`
      SELECT pg_size_pretty(pg_database_size(current_database())) AS db_size,
             pg_database_size(current_database())::bigint AS db_size_bytes
    `;
    const tables = await prisma.$queryRaw<
      Array<{ table_name: string; total_size: string; total_bytes: bigint; row_estimate: bigint }>
    >`
      SELECT relname AS table_name,
             pg_size_pretty(pg_total_relation_size(c.oid)) AS total_size,
             pg_total_relation_size(c.oid)::bigint AS total_bytes,
             COALESCE(c.reltuples, 0)::bigint AS row_estimate
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relkind = 'r'
      ORDER BY pg_total_relation_size(c.oid) DESC
      LIMIT 40
    `;
    let neonLimit: unknown = null;
    try {
      const lim = await prisma.$queryRaw<Array<Record<string, unknown>>>`
        SELECT * FROM neon.pg_stat_file_cache LIMIT 0
      `;
      neonLimit = { note: "neon schema present", sample: lim };
    } catch {
      neonLimit = { note: "neon.* diagnostic views not queried / unavailable" };
    }
    return {
      databaseSize: size[0]?.db_size,
      databaseSizeBytes: Number(size[0]?.db_size_bytes ?? 0),
      topTables: tables.map((t) => ({
        table: t.table_name,
        size: t.total_size,
        bytes: Number(t.total_bytes),
        rowEstimate: Number(t.row_estimate),
      })),
      neonDiagnostics: neonLimit,
    };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

async function knowledgeQuality(): Promise<Record<string, unknown>> {
  const rows = await prisma.knowledgeSource.findMany({
    select: {
      sourceId: true,
      issuerCik: true,
      issuerTicker: true,
      documentClass: true,
      representationLevel: true,
      extractionStatus: true,
      usageRightsReviewStatus: true,
      storageRef: true,
      originalBytesHash: true,
      metadata: true,
      accessionNumber: true,
    },
  });

  const byClass: Record<string, number> = {};
  const byLevel: Record<string, number> = {};
  const byExtraction: Record<string, number> = {};
  const byRights: Record<string, number> = {};
  const issuers = new Set<string>();
  const tickers = new Set<string>();
  const accessions = new Set<string>();
  let withStorage = 0;
  let withHash = 0;
  let withV2 = 0;
  let covenantItems = 0;
  let withCandidates = 0;
  let candidateTotal = 0;
  let withDefs = 0;
  let defTotal = 0;
  let withStructural = 0;
  let structuralTotal = 0;
  let verifiedLike = 0;
  let certifiedLike = 0;
  let syntheticFlag = 0;

  for (const r of rows) {
    byClass[r.documentClass] = (byClass[r.documentClass] ?? 0) + 1;
    byLevel[r.representationLevel] = (byLevel[r.representationLevel] ?? 0) + 1;
    byExtraction[r.extractionStatus] = (byExtraction[r.extractionStatus] ?? 0) + 1;
    byRights[r.usageRightsReviewStatus] = (byRights[r.usageRightsReviewStatus] ?? 0) + 1;
    if (r.issuerCik) issuers.add(r.issuerCik);
    if (r.issuerTicker) tickers.add(r.issuerTicker);
    if (r.accessionNumber) accessions.add(r.accessionNumber);
    if (r.storageRef) withStorage += 1;
    if (r.originalBytesHash) withHash += 1;

    const m =
      r.metadata && typeof r.metadata === "object" && !Array.isArray(r.metadata)
        ? (r.metadata as Record<string, unknown>)
        : {};
    const summary = m.covenantSummary as { items?: unknown[] } | undefined;
    if (Array.isArray(summary?.items) && summary!.items!.length) {
      withV2 += 1;
      covenantItems += summary!.items!.length;
    }
    const analysis = m.analysis as {
      covenantCandidates?: number;
      definitions?: number;
      structuralNodes?: number;
      verificationStatus?: string;
    } | undefined;
    if (typeof analysis?.covenantCandidates === "number" && analysis.covenantCandidates > 0) {
      withCandidates += 1;
      candidateTotal += analysis.covenantCandidates;
    }
    if (typeof analysis?.definitions === "number" && analysis.definitions > 0) {
      withDefs += 1;
      defTotal += analysis.definitions;
    }
    if (typeof analysis?.structuralNodes === "number" && analysis.structuralNodes > 0) {
      withStructural += 1;
      structuralTotal += analysis.structuralNodes;
    }
    const level = String(r.representationLevel);
    if (level.includes("VERIFIED") || level.includes("REVIEWER")) verifiedLike += 1;
    if (level.includes("CERTIFIED")) certifiedLike += 1;
    if (m.synthetic === true || m.inputKind === "synthetic") syntheticFlag += 1;
  }

  return {
    knowledgeSourceRows: rows.length,
    distinctIssuerCiks: issuers.size,
    distinctTickers: tickers.size,
    distinctAccessions: accessions.size,
    withStorageRef: withStorage,
    withOriginalBytesHash: withHash,
    withV2Summaries: withV2,
    covenantSummaryItems: covenantItems,
    withCovenantCandidates: withCandidates,
    covenantCandidateTotalFromMeta: candidateTotal,
    withDefinitionsMeta: withDefs,
    definitionsTotalFromMeta: defTotal,
    withStructuralMeta: withStructural,
    structuralTotalFromMeta: structuralTotal,
    representationVerifiedLike: verifiedLike,
    representationCertifiedLike: certifiedLike,
    syntheticFlagged: syntheticFlag,
    byDocumentClass: byClass,
    byRepresentationLevel: byLevel,
    byExtractionStatus: byExtraction,
    byUsageRights: byRights,
    qualityNote:
      "DISCOVERED/STRUCTURALLY_INDEXED/DETERMINISTICALLY_VALIDATED ≠ REVIEWER_VERIFIED or CERTIFIED legal truth",
  };
}

async function main() {
  const started = Date.now();
  const counts = Object.fromEntries(
    await Promise.all([
      safeCount("companies", () => prisma.company.count()),
      safeCount("companiesCustomer", () =>
        prisma.company.count({ where: { tenantKind: "CUSTOMER" as never } }).catch(() =>
          prisma.company.count(),
        ),
      ),
      safeCount("documents", () => prisma.document.count()),
      safeCount("documentNodes", () => prisma.documentNode.count()),
      safeCount("documentRelationships", () => prisma.documentRelationshipEdge.count()),
      safeCount("debtInstruments", () => prisma.debtInstrument.count()),
      safeCount("facilities", () => prisma.facility.count()),
      safeCount("covenantProvisions", () => prisma.covenantProvision.count()),
      safeCount("definedTerms", () => prisma.definedTerm.count()),
      safeCount("definedTermNodes", () => prisma.definedTermNode.count()),
      safeCount("definedTermDeps", () => prisma.definedTermDependencyEdge.count()),
      safeCount("contractRules", () => prisma.contractRule.count()),
      safeCount("contractRuleRelationships", () => prisma.contractRuleRelationship.count()),
      safeCount("amendmentEffects", () => prisma.amendmentEffect.count()),
      safeCount("permissions", () => prisma.permission.count()),
      safeCount("sharedCapacityConstraints", () => prisma.sharedCapacityConstraint.count()),
      safeCount("intercreditorAgreements", () => prisma.intercreditorAgreement.count()),
      safeCount("financialSnapshots", () => prisma.financialSnapshot.count()),
      safeCount("financialStates", () => prisma.financialState.count()),
      safeCount("ledgerEntries", () => prisma.ledgerEntry.count()),
      safeCount("debtEvents", () => prisma.debtEvent.count()),
      safeCount("debtTranches", () => prisma.debtTranche.count()),
      safeCount("goldenTests", () => prisma.goldenTest.count()),
      safeCount("semanticTruthRecords", () => prisma.semanticTruthRecord.count()),
      safeCount("knowledgeSources", () => prisma.knowledgeSource.count()),
      safeCount("knowledgeRelationships", () => prisma.knowledgeRelationshipEdge.count()),
      safeCount("documentByteObjects", () => prisma.documentByteObject.count()),
      safeCount("knowledgeImportBatches", () => prisma.knowledgeImportBatch.count()),
      safeCount("knowledgeCostLedger", () => prisma.knowledgeCostLedgerEntry.count()),
      safeCount("ingestionJobs", () => prisma.ingestionJob.count()),
      safeCount("sourceArtifacts", () => prisma.sourceArtifact.count()),
      safeCount("extractionRuns", () => prisma.extractionRun.count()),
      safeCount("extractionCandidates", () => prisma.extractionCandidate.count()),
      safeCount("legalReviewRecords", () => prisma.legalReviewRecord.count()),
      safeCount("contractInputSnapshots", () => prisma.contractInputSnapshot.count()),
      safeCount("contractLedgerUsages", () => prisma.contractLedgerUsage.count()),
    ]),
  );

  // Financing packages proxy: DebtInstrument + unique package-like Document groupings
  let financingPackages: Record<string, unknown> = {};
  try {
    const instruments = await prisma.debtInstrument.findMany({
      select: { id: true, companyId: true, name: true, instrumentType: true },
    });
    const docsByCompany = await prisma.document.groupBy({
      by: ["companyId"],
      _count: true,
    });
    financingPackages = {
      debtInstrumentRows: instruments.length,
      companiesWithDocuments: docsByCompany.length,
      note: "Package identity is multi-table; DebtInstrument + Document graphs are proxies, not a single package table",
    };
  } catch (e) {
    financingPackages = { error: e instanceof Error ? e.message : String(e) };
  }

  let retrievalIndexes: Record<string, unknown> = {};
  try {
    const ksWithMeta = await prisma.knowledgeSource.count({
      where: {
        metadata: { path: ["retrievalIndex"], not: Prisma.DbNull },
      },
    });
    retrievalIndexes = {
      knowledgeSourcesWithRetrievalIndexMeta: ksWithMeta,
      note: "Mass-precedent retrieval index also lives under docs/knowledge-factory/mass-precedent/",
    };
  } catch {
    retrievalIndexes = {
      note: "JSON path query for retrievalIndex unsupported or empty; check mass-precedent artifacts on disk",
    };
  }

  let verification: Record<string, unknown> = {};
  try {
    const truthByStatus = await prisma.semanticTruthRecord.groupBy({
      by: ["trustStatus"],
      _count: true,
    });
    const permissionsByStatus = await prisma.permission.groupBy({
      by: ["modelingStatus"],
      _count: true,
    });
    const rulesByCoverage = await prisma.contractRule.groupBy({
      by: ["coverageStatus"],
      _count: true,
    });
    verification = {
      semanticTruthByTrust: Object.fromEntries(truthByStatus.map((r) => [r.trustStatus, r._count])),
      permissionsByModelingStatus: Object.fromEntries(
        permissionsByStatus.map((r) => [String(r.modelingStatus), r._count]),
      ),
      contractRulesByCoverageStatus: Object.fromEntries(
        rulesByCoverage.map((r) => [String(r.coverageStatus), r._count]),
      ),
    };
  } catch (e) {
    verification = { error: e instanceof Error ? e.message.slice(0, 200) : String(e).slice(0, 200) };
  }

  const size = await dbSize();
  const kfQuality = await knowledgeQuality();

  // Sample company names (non-secret)
  let companySample: unknown[] = [];
  try {
    companySample = await prisma.company.findMany({
      select: { id: true, name: true, ticker: true, tenantKind: true },
      take: 40,
      orderBy: { name: "asc" },
    });
  } catch {
    try {
      companySample = await prisma.company.findMany({
        select: { id: true, name: true },
        take: 40,
      });
    } catch (e) {
      companySample = [{ error: e instanceof Error ? e.message : String(e) }];
    }
  }

  const report = {
    schema: "neon-massive-corpus-baseline.v1",
    generatedAt: new Date().toISOString(),
    wallMs: Date.now() - started,
    readOnly: true,
    counts,
    financingPackages,
    knowledgeFactoryQuality: kfQuality,
    verification,
    retrievalIndexes,
    databaseSize: size,
    companySample,
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
