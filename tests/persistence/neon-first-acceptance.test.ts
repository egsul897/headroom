/**
 * Neon-first institutional persistence acceptance (docs/persistence/).
 *
 * Uses a real disposable PostgreSQL database via createEphemeralDatabase.
 * PRODUCTION_DB_TOUCHED: NO
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { createEphemeralDatabase, destroyEphemeralDatabase, type EphemeralDatabase } from "@/lib/testing/ephemeral-db";
import { assertDisposableDatabase } from "@/lib/testing/disposable-db";
import type { OperativeHandoffBundle } from "@/lib/contract-model/compiler/package-graph/operative-handoff";
import type { CovenantContextBundle } from "@/lib/contract-model/compiler/context-retrieval/types";
import type { FinancialMetricEvidence } from "@/lib/capacity/financial-evidence";
import type { UtilizationCompletenessCertificate } from "@/lib/capacity/utilization-types";
import {
  persistOperativeAuthoritySnapshot,
  getLatestOperativeAuthoritySnapshot,
  listOperativeAuthorityHistory,
  persistContextRetrievalManifest,
  getContextRetrievalManifest,
  persistFinancialEvidenceBundle,
  getLatestFinancialEvidenceBundle,
  revokeFinancialEvidenceBundle,
  persistUtilizationCompletenessRecord,
  getProductionEligibleCompletenessRecord,
  revokeCompletenessRecord,
  persistCapacityCalculation,
  getLatestAuthorizedCapacityCalculation,
  persistTransactionSimulation,
  getTransactionSimulation,
  invalidateDependentArtifacts,
  listInstitutionalAuditEvents,
  PRODUCTION_ACTIVATION_STATUS,
  PersistenceContractError,
  TenantIsolationError,
  getOperativeAuthoritySnapshotById,
  getFinancialEvidenceBundleById,
} from "@/lib/persistence";

const BASE_URL = process.env.DATABASE_URL;
const SKIP = !BASE_URL;
const describeDb = SKIP ? describe.skip : describe;

function sampleHandoff(companyId: string, overrides?: Partial<OperativeHandoffBundle>): OperativeHandoffBundle {
  return {
    companyId,
    packageKey: "pkg-main",
    asOfDate: "2024-12-31",
    documentRoles: [
      {
        documentId: "doc-ca",
        role: "ORIGINAL_AGREEMENT",
        confidence: "PROVISIONAL",
        effectiveDate: "2020-01-01",
        executionDate: "2020-01-01",
        evidenceCitations: ["title"],
        reason: "base CA",
      },
    ],
    instruments: [
      {
        instrumentKey: "instr-1",
        associationKind: "PROVISIONAL",
        reviewStatus: "REVIEW_REQUIRED",
        confirmedDocumentIds: ["doc-ca"],
        provisionalDocumentIds: ["doc-am"],
        mayConsolidateOperative: false,
        bridgeBlockers: [{ sourceDocumentId: "doc-am", targetDocumentId: "doc-ca", reason: "provisional RESTATES" }],
      },
    ],
    provisions: [
      {
        provisionKey: "sec-6.01",
        kind: "SECTION",
        sectionRef: "6.01",
        definedTermRef: null,
        canonicalInstrumentKey: null,
        instrumentKey: "instr-1",
        sourceDocumentId: "doc-ca",
        sourceSpan: { citation: "§6.01", nodeId: "n1", nodeKey: "6.01" },
        applicableAmendmentChain: [],
        effectiveAsOfDate: "2024-12-31",
        supersessionStatus: "CURRENT_OPERATIVE",
        authorityClassification: "PROVISIONAL_IDENTITY_BLOCKED",
        unresolvedConflicts: ["provisional identity"],
        provenance: {
          operativeStateStatus: "OPERATIVE_STATE_PARTIAL",
          targetResolutionStatus: "NOT_FOUND",
          structuralHealthStatus: "STRUCTURAL_HEALTH_SUFFICIENT",
          associationKind: "PROVISIONAL",
          reviewRequired: true,
          currentTextPresent: true,
          attemptedTextPresent: false,
        },
      },
    ],
    unsupportedCases: [],
    ...overrides,
  };
}

function sampleContext(companyId: string, overrides?: Partial<CovenantContextBundle>): CovenantContextBundle {
  return {
    bundleId: "context-bundle:test-1",
    packageKey: "pkg-main",
    companyId,
    instrumentKey: "instr-1",
    originatingDocumentId: "doc-ca",
    originatingDiscoveryId: "disc-1",
    originatingStructuralNodeKeys: ["6.01"],
    originatingStructuralNodeIds: ["n1"],
    normalizedSourceRef: "6.01",
    originatingFamilies: ["INDEBTEDNESS"],
    originatingSupersessionStatus: "UNKNOWN_SUPERSESSION_STATUS",
    originatingSupersessionReason: "no amendment index",
    items: [
      {
        itemId: "context-item:a",
        type: "OPERATIVE_SOURCE",
        documentId: "doc-ca",
        structuralNodeKey: "6.01",
        structuralNodeId: "n1",
        normalizedRef: "6.01",
        sourceCitation: "§6.01",
        excerptText: "The Borrower shall not incur Indebtedness...",
        reason: "originating source",
        retrievalDepth: 0,
        retrievalPath: [],
        retrievalMethod: "STRUCTURAL_TRAVERSAL",
        confidence: 1,
        evidenceState: { status: "CURRENT", isCurrentTruth: true, reason: "current operative" },
      },
    ],
    edges: [],
    unresolvedDependencies: [
      {
        originatingNodeKey: "6.01",
        dependencyType: "MISSING_SCHEDULE",
        sourceText: "Schedule 6.01",
        attemptedResolution: "schedule index miss",
        reason: "schedule absent",
        candidateTargets: [],
        citation: "§6.01",
        severity: "HIGH",
      },
    ],
    retrievalAlgorithmVersion: "phase-2d-context-retrieval.v5",
    semanticPromptVersion: null,
    providerIdentity: null,
    contentIdentity: "content-id-test-1",
    sufficiencyState: "REVIEW_REQUIRED",
    stopReasons: ["MISSING_SCHEDULE"],
    hasUnresolvedOperativeEvidence: false,
    unresolvedEvidenceItemIds: [],
    performance: {
      itemsConsidered: 1,
      itemsRetained: 1,
      duplicatePathsDeduplicated: 0,
      maxDefinitionDepthReached: 0,
      maxCrossReferenceDepthReached: 0,
      crossReferenceTraversals: 0,
      crossDocumentLeads: 0,
      deterministicWallClockMs: 1,
      semanticWallClockMs: 0,
      semanticCalls: 0,
      inputTokens: 0,
      outputTokens: 0,
    },
    ...overrides,
  };
}

function sampleMetric(companyId: string, overrides?: Partial<FinancialMetricEvidence>): FinancialMetricEvidence {
  return {
    metricKey: "TOTAL_ASSETS",
    value: 1_000_000,
    currency: "USD",
    units: "USD",
    entity: {
      companyId,
      entityName: "Acme Borrower",
      consolidationPerimeter: "Borrower and Restricted Subsidiaries",
    },
    sourceDocument: { documentId: "doc-10q", exactLocation: "p.4 / Consolidated Balance Sheet / Total assets", excerpt: "Total assets" },
    reportingPeriod: "FY2024-Q3",
    measurementDate: "2024-09-30",
    accountingDefinition: "covenant Total Consolidated Assets per §1.01 — NOT GAAP Total Assets",
    amendmentRestatementStatus: "ORIGINAL",
    verificationStatus: "VERIFIED",
    authenticity: "AUTHENTIC",
    provenanceId: "prov-fin-1",
    ...overrides,
  };
}

describeDb("Neon-first persistence acceptance (disposable PostgreSQL)", () => {
  let db: EphemeralDatabase;
  let prisma: PrismaClient;
  let databaseName = "";
  const COMPANY_A = "persist-accept-co-a";
  const COMPANY_B = "persist-accept-co-b";

  beforeAll(async () => {
    db = await createEphemeralDatabase(BASE_URL!);
    prisma = new PrismaClient({ datasources: { db: { url: db.databaseUrl } } });
    databaseName = await assertDisposableDatabase(prisma);
    await prisma.company.createMany({
      data: [
        { id: COMPANY_A, name: "Persist Accept A", tenantKind: "EVALUATION" },
        { id: COMPANY_B, name: "Persist Accept B", tenantKind: "EVALUATION" },
      ],
    });
  }, 120_000);

  afterAll(async () => {
    await prisma?.$disconnect();
    if (db) await destroyEphemeralDatabase(db);
  }, 60_000);

  it("records disposable database identity for the report", () => {
    expect(databaseName).toMatch(/^headroom_test_[a-f0-9]{8,}$/);
  });

  it("1+2+3+4: operative authority + provisional caveats survive restart-equivalent reload", async () => {
    const bundle = sampleHandoff(COMPANY_A);
    const first = await persistOperativeAuthoritySnapshot(prisma, { bundle });
    expect(first.created).toBe(true);

    // Simulate process restart with a fresh PrismaClient on the same disposable DB.
    const fresh = new PrismaClient({ datasources: { db: { url: db.databaseUrl } } });
    try {
      const loaded = await getLatestOperativeAuthoritySnapshot(fresh, COMPANY_A, "pkg-main", "2024-12-31");
      expect(loaded).not.toBeNull();
      expect(loaded!.provisionalIdentity).toBe(true);
      expect(loaded!.authorityClassification).toBe("PROVISIONAL_IDENTITY_BLOCKED");
      const payload = loaded!.payload as unknown as OperativeHandoffBundle;
      expect(payload.provisions[0]?.unresolvedConflicts).toContain("provisional identity");
      expect(payload.instruments[0]?.provisionalDocumentIds).toEqual(["doc-am"]);
    } finally {
      await fresh.$disconnect();
    }

    // Idempotent re-persist
    const second = await persistOperativeAuthoritySnapshot(prisma, { bundle });
    expect(second.created).toBe(false);
    expect(second.id).toBe(first.id);
  });

  it("5: recursive context manifests are reproducible and durable", async () => {
    const bundle = sampleContext(COMPANY_A);
    const a = await persistContextRetrievalManifest(prisma, { bundle });
    const b = await persistContextRetrievalManifest(prisma, { bundle });
    expect(a.created).toBe(true);
    expect(b.created).toBe(false);
    const loaded = await getContextRetrievalManifest(
      prisma,
      COMPANY_A,
      bundle.bundleId,
      bundle.retrievalAlgorithmVersion,
    );
    expect(loaded?.sufficiencyState).toBe("REVIEW_REQUIRED");
    const payload = loaded!.payload as unknown as CovenantContextBundle;
    expect(payload.unresolvedDependencies[0]?.dependencyType).toBe("MISSING_SCHEDULE");
    expect(payload.items[0]?.excerptText).toContain("Indebtedness");
  });

  it("6+7: SemanticTruthRecord retains provenance; unverified cannot become verified via persistence", async () => {
    await prisma.semanticTruthRecord.create({
      data: {
        companyId: COMPANY_A,
        packageKey: "pkg-main",
        instrumentKey: "instr-1",
        kind: "RULE",
        semanticObjectId: "rule-debt-1",
        sourceDocumentId: "doc-ca",
        sourceSectionRef: "6.01",
        sourceCitation: "§6.01",
        sourceExcerpt: "shall not incur",
        irSchemaVersion: "ir.v1",
        compilerAlgorithmVersion: "compiler.v1",
        compilerPromptVersion: "prompt.v1",
        toolPolicyVersion: "tools.v1",
        verificationStatus: null,
        trustStatus: "COMPILED",
        sufficiency: "PARTIAL",
        sufficiencyReasons: ["missing schedule"],
        payloadSchemaVersion: "payload.v1",
        payload: { ruleId: "rule-debt-1", kind: "DEBT" },
        contentHash: "hash-compiled-1",
        version: 1,
      },
    });

    // Re-read and ensure COMPILED stays COMPILED (no silent promotion).
    const row = await prisma.semanticTruthRecord.findUnique({
      where: {
        companyId_instrumentKey_kind_semanticObjectId: {
          companyId: COMPANY_A,
          instrumentKey: "instr-1",
          kind: "RULE",
          semanticObjectId: "rule-debt-1",
        },
      },
    });
    expect(row?.trustStatus).toBe("COMPILED");
    expect(row?.verificationStatus).toBeNull();
    expect(row?.sourceCitation).toBe("§6.01");

    // Trusted getter pattern: only VERIFIED would be production-usable.
    const verifiedOnly = await prisma.semanticTruthRecord.findMany({
      where: { companyId: COMPANY_A, trustStatus: "VERIFIED" },
    });
    expect(verifiedOnly).toHaveLength(0);
  });

  it("8: financial snapshots retain source identity and covenant accounting definition", async () => {
    const metrics = [sampleMetric(COMPANY_A)];
    const r = await persistFinancialEvidenceBundle(prisma, {
      companyId: COMPANY_A,
      bundleKey: "fin-q3-2024",
      asOfDate: "2024-09-30",
      metrics,
      claimedReviewerLabel: "not-an-idp-identity",
    });
    expect(r.created).toBe(true);
    const loaded = await getLatestFinancialEvidenceBundle(prisma, COMPANY_A, "fin-q3-2024");
    const payload = loaded!.payload as unknown as { metrics: FinancialMetricEvidence[] };
    expect(payload.metrics[0]?.accountingDefinition).toContain("NOT GAAP Total Assets");
    expect(payload.metrics[0]?.sourceDocument.documentId).toBe("doc-10q");
    expect(payload.metrics[0]?.provenanceId).toBe("prov-fin-1");
    expect(loaded!.claimedReviewerLabel).toBe("not-an-idp-identity");
  });

  it("9: unknown historical utilization remains unknown (empty ledger ≠ zero)", async () => {
    const usages = await prisma.contractLedgerUsage.findMany({ where: { companyId: COMPANY_A } });
    expect(usages).toHaveLength(0);
    // Completeness absent → no production-eligible cert
    const cert = await getProductionEligibleCompletenessRecord(prisma, COMPANY_A, "rule-6.01", "2024-12-31");
    expect(cert).toBeNull();
  });

  it("10+11: ledger replay / reclassification preserve history via supersession", async () => {
    await prisma.contractLedgerUsage.create({
      data: {
        usageId: "usage-1",
        companyId: COMPANY_A,
        instrumentKey: "instr-1",
        effectiveAsOf: "2024-01-15",
        amount: "100000",
        currency: "USD",
        status: "RECORDED",
        capacityPathJson: { ruleId: "rule-6.01" },
        provenanceJson: { source: "test" },
      },
    });
    await prisma.contractLedgerUsageEvent.create({
      data: {
        eventId: "evt-usage-1",
        companyId: COMPANY_A,
        usageId: "usage-1",
        type: "USAGE_APPENDED",
        at: new Date("2024-01-15T00:00:00Z"),
        payloadJson: { amount: "100000" },
      },
    });
    // Reclassification/supersession: keep prior row, add superseding usage
    await prisma.contractLedgerUsage.update({
      where: { usageId: "usage-1" },
      data: { status: "SUPERSEDED", supersededByUsageId: "usage-1b" },
    });
    await prisma.contractLedgerUsage.create({
      data: {
        usageId: "usage-1b",
        companyId: COMPANY_A,
        instrumentKey: "instr-1",
        effectiveAsOf: "2024-02-01",
        amount: "80000",
        currency: "USD",
        status: "RECORDED",
        capacityPathJson: { ruleId: "rule-6.01", reclassifiedFrom: "usage-1" },
        provenanceJson: { source: "reclass" },
      },
    });
    await prisma.contractLedgerUsageEvent.create({
      data: {
        eventId: "evt-usage-1-super",
        companyId: COMPANY_A,
        usageId: "usage-1",
        type: "USAGE_SUPERSEDED",
        at: new Date("2024-02-01T00:00:00Z"),
        payloadJson: { supersededByUsageId: "usage-1b" },
      },
    });

    const history = await prisma.contractLedgerUsage.findMany({
      where: { companyId: COMPANY_A },
      orderBy: { effectiveAsOf: "asc" },
    });
    expect(history).toHaveLength(2);
    expect(history[0]?.status).toBe("SUPERSEDED");
    expect(history[1]?.amount).toBe("80000");
    const events = await prisma.contractLedgerUsageEvent.findMany({
      where: { companyId: COMPANY_A },
      orderBy: { at: "asc" },
    });
    expect(events.map((e) => e.type)).toEqual(["USAGE_APPENDED", "USAGE_SUPERSEDED"]);
  });

  it("12+13: simulation does not mutate actual capacity; refused mutatesActualLedger", async () => {
    const usageCountBefore = await prisma.contractLedgerUsage.count({ where: { companyId: COMPANY_A } });
    const sim = await persistTransactionSimulation(prisma, {
      companyId: COMPANY_A,
      simulationId: "sim-1",
      simulationHash: "simhash-1",
      transactionId: "txn-1",
      transactionHash: "txnhash-1",
      simulationStatus: "SIMULATED",
      result: { ok: true, effects: [{ kind: "CONSUME_CAPACITY", amount: "50000" }] },
      proposedEffects: [{ kind: "CONSUME_CAPACITY", amount: "50000" }],
      mutatesActualLedger: false,
    });
    expect(sim.created).toBe(true);
    const loaded = await getTransactionSimulation(prisma, COMPANY_A, "sim-1");
    expect(loaded!.mutatesActualLedger).toBe(false);
    expect(loaded!.authorityClass).toBe("HYPOTHETICAL");
    const usageCountAfter = await prisma.contractLedgerUsage.count({ where: { companyId: COMPANY_A } });
    expect(usageCountAfter).toBe(usageCountBefore);

    await expect(
      persistTransactionSimulation(prisma, {
        companyId: COMPANY_A,
        simulationId: "sim-bad",
        simulationHash: "bad",
        transactionId: "txn-bad",
        transactionHash: "bad",
        simulationStatus: "SIMULATED",
        result: {},
        mutatesActualLedger: true,
      }),
    ).rejects.toBeInstanceOf(PersistenceContractError);
  });

  it("14: revoked evidence cannot authorize new production calculations", async () => {
    const cert: UtilizationCompletenessCertificate = {
      capacityRuleId: "rule-6.01",
      asOf: "2024-12-31",
      approvalState: "APPROVED",
      sourceLabel: "counsel",
      kind: "VERIFIED_COMPLETE",
      authenticity: "AUTHENTIC",
      issuer: { role: "COUNSEL_REVIEWER", actorId: "claimed-but-untrusted", attestedAt: "2024-12-31T00:00:00Z" },
    };
    const persisted = await persistUtilizationCompletenessRecord(prisma, { companyId: COMPANY_A, certificate: cert });
    expect(await getProductionEligibleCompletenessRecord(prisma, COMPANY_A, "rule-6.01", "2024-12-31")).not.toBeNull();

    await revokeCompletenessRecord(prisma, COMPANY_A, persisted.id);
    expect(await getProductionEligibleCompletenessRecord(prisma, COMPANY_A, "rule-6.01", "2024-12-31")).toBeNull();

    const fin = await getLatestFinancialEvidenceBundle(prisma, COMPANY_A, "fin-q3-2024");
    await revokeFinancialEvidenceBundle(prisma, COMPANY_A, fin!.id);
    const revoked = await getFinancialEvidenceBundleById(prisma, COMPANY_A, fin!.id);
    expect(revoked!.status).toBe("REVOKED");
  });

  it("15: cross-tenant reads and writes are rejected", async () => {
    const bundle = sampleHandoff(COMPANY_A);
    const r = await persistOperativeAuthoritySnapshot(prisma, { bundle });
    await expect(getOperativeAuthoritySnapshotById(prisma, COMPANY_B, r.id)).rejects.toBeInstanceOf(TenantIsolationError);

    const foreign = sampleHandoff(COMPANY_B);
    // Persisting under wrong company in metric entity should fail when companyId disagrees.
    await expect(
      persistFinancialEvidenceBundle(prisma, {
        companyId: COMPANY_A,
        bundleKey: "cross-tenant",
        asOfDate: "2024-09-30",
        metrics: [sampleMetric(COMPANY_B)],
      }),
    ).rejects.toBeInstanceOf(TenantIsolationError);
  });

  it("16: duplicate ingestion is idempotent", async () => {
    const metrics = [sampleMetric(COMPANY_A, { provenanceId: "prov-dup" })];
    const a = await persistFinancialEvidenceBundle(prisma, {
      companyId: COMPANY_A,
      bundleKey: "fin-dup",
      asOfDate: "2024-09-30",
      metrics,
    });
    const b = await persistFinancialEvidenceBundle(prisma, {
      companyId: COMPANY_A,
      bundleKey: "fin-dup",
      asOfDate: "2024-09-30",
      metrics,
    });
    expect(a.id).toBe(b.id);
    expect(b.created).toBe(false);
  });

  it("17: source changes invalidate dependent results", async () => {
    const calc = await persistCapacityCalculation(prisma, {
      companyId: COMPANY_A,
      calculationId: "calc-1",
      asOfDate: "2024-12-31",
      authorityClass: "VERIFIED_CALCULATION",
      calculationStatus: "OK",
      request: { path: "6.01", amount: "1" },
      capacityOutput: { remaining: "900000" },
      verifiedIrIdentity: "hash-compiled-1",
    });
    expect(calc.created).toBe(true);

    const inv = await invalidateDependentArtifacts(prisma, {
      companyId: COMPANY_A,
      sourceEntityType: "SemanticTruthRecord",
      sourceEntityId: "rule-debt-1",
      dependents: [{ entityType: "CapacityCalculationRecord", entityId: calc.id }],
      reason: "verified IR contentHash changed",
      sourceFingerprintBefore: "hash-compiled-1",
      sourceFingerprintAfter: "hash-compiled-2",
    });
    expect(inv.invalidated).toBe(1);
    const stale = await getLatestAuthorizedCapacityCalculation(prisma, COMPANY_A, "calc-1");
    expect(stale).toBeNull();
    const row = await prisma.capacityCalculationRecord.findUnique({ where: { id: calc.id } });
    expect(row?.status).toBe("STALE");
  });

  it("18: historical as-of reconstruction remains correct after supersession", async () => {
    const v1 = sampleHandoff(COMPANY_A, {
      provisions: [
        {
          ...sampleHandoff(COMPANY_A).provisions[0]!,
          unresolvedConflicts: ["v1-conflict"],
        },
      ],
    });
    // Force different content by mutating unsupportedCases
    const first = await persistOperativeAuthoritySnapshot(prisma, {
      bundle: { ...v1, unsupportedCases: ["case-v1"] },
    });
    const second = await persistOperativeAuthoritySnapshot(prisma, {
      bundle: { ...v1, unsupportedCases: ["case-v2-amended"] },
    });
    expect(second.created).toBe(true);
    expect(second.id).not.toBe(first.id);

    const history = await listOperativeAuthorityHistory(prisma, COMPANY_A, "pkg-main", "2024-12-31");
    const superseded = history.find((h) => h.id === first.id);
    expect(superseded?.status).toBe("SUPERSEDED");
    expect(superseded?.supersededById).toBe(second.id);
    const active = await getLatestOperativeAuthoritySnapshot(prisma, COMPANY_A, "pkg-main", "2024-12-31");
    expect(active?.id).toBe(second.id);
    const oldPayload = superseded!.payload as unknown as OperativeHandoffBundle;
    expect(oldPayload.unsupportedCases).toEqual(["case-v1"]);
  });

  it("19: process restart does not lose approvals / audit trail", async () => {
    const events = await listInstitutionalAuditEvents(prisma, COMPANY_A, { limit: 1000 });
    expect(events.length).toBeGreaterThan(0);
    expect(events.some((e) => e.action === "REVOCATION")).toBe(true);
    expect(events.some((e) => e.action === "INVALIDATION")).toBe(true);

    const fresh = new PrismaClient({ datasources: { db: { url: db.databaseUrl } } });
    try {
      const again = await listInstitutionalAuditEvents(fresh, COMPANY_A, { limit: 1000 });
      expect(again.length).toBe(events.length);
    } finally {
      await fresh.$disconnect();
    }
  });

  it("20: production activation remains BLOCKED without both trusted gates", async () => {
    expect(PRODUCTION_ACTIVATION_STATUS).toBe("BLOCKED");
    await expect(
      persistCapacityCalculation(prisma, {
        companyId: COMPANY_A,
        calculationId: "calc-prod",
        asOfDate: "2024-12-31",
        authorityClass: "PRODUCTION_AUTHORITATIVE",
        calculationStatus: "OK",
        request: {},
        capacityOutput: { remaining: "1" },
      }),
    ).rejects.toBeInstanceOf(PersistenceContractError);
  });

  it("refused calculation persists without mutating ledger", async () => {
    const before = await prisma.contractLedgerUsage.count({ where: { companyId: COMPANY_A } });
    const r = await persistCapacityCalculation(prisma, {
      companyId: COMPANY_A,
      calculationId: "calc-refused",
      asOfDate: "2024-12-31",
      authorityClass: "REFUSED",
      calculationStatus: "REFUSED",
      request: { path: "missing" },
      refusalReasons: ["MISSING_FINANCIAL_EVIDENCE"],
      missingInputs: ["TOTAL_CONSOLIDATED_ASSETS"],
    });
    expect(r.created).toBe(true);
    const loaded = await getLatestAuthorizedCapacityCalculation(prisma, COMPANY_A, "calc-refused");
    expect(loaded?.authorityClass).toBe("REFUSED");
    expect(loaded?.refusalReasons).toEqual(["MISSING_FINANCIAL_EVIDENCE"]);
    const after = await prisma.contractLedgerUsage.count({ where: { companyId: COMPANY_A } });
    expect(after).toBe(before);
  });
});
