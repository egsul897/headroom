/**
 * Agent #9 → Neon durable financial evidence + utilization acceptance
 * (docs/persistence/06-agent9-financial-utilization-handoff.md §4).
 *
 * Disposable PostgreSQL only. PRODUCTION_DB_TOUCHED: NO
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { createEphemeralDatabase, destroyEphemeralDatabase, type EphemeralDatabase } from "@/lib/testing/ephemeral-db";
import { assertDisposableDatabase } from "@/lib/testing/disposable-db";
import {
  normalizeFinancialStatementEvidence,
  reconstructUtilizationEvidence,
  resolveUtilization,
  buildVerifiedCapacityInputHandoff,
  mayUseAsProductionCapacityInput,
  type FinancialMetricKey,
  type HistoricalUtilizationEvent,
  type RawFinancialStatementLine,
  type StatementMetricDefinitionMapping,
} from "@/lib/capacity";
import {
  durablyRememberFinancialEvidence,
  durablyRememberUtilizationReconstruction,
  durablyRememberSimulation,
  durablyBuildAndRememberVerifiedCapacityInput,
  loadFinancialEvidenceSnapshot,
  revalidatePersistedFinancialEvidence,
  loadUtilizationReconstructionEnvelope,
  loadAttributedLedgerUsages,
  evaluatePersistedUtilizationAuthority,
  persistUtilizationCompletenessRecord,
  getProductionEligibleCompletenessRecord,
  persistCapacityCalculation,
  getLatestAuthorizedCapacityCalculation,
  getCapacityCalculationById,
  invalidateDependentArtifacts,
  invalidateCapacityAfterFinancialRevision,
  invalidateCapacityAfterCompletenessRevoke,
  persistFinancialEvidenceBundle,
  resolveDurableCapacityIdentitiesForProduct,
  PRODUCTION_ACTIVATION_STATUS,
  PersistenceContractError,
  TenantIsolationError,
  getFinancialEvidenceBundleById,
} from "@/lib/persistence";
import { loadSharedDurableCapacityIdentities } from "@/lib/product/durable-capacity-identities";

const BASE_URL = process.env.DATABASE_URL;
const SKIP = !BASE_URL;
const describeDb = SKIP ? describe.skip : describe;

const FIXTURE_PATH = join(
  process.cwd(),
  "tests/fixtures/financial-utilization-evidence/matthews-q1-fy2025-slice.json",
);

type SliceFixture = {
  companyId: string;
  entityName: string;
  reportingPeriod: string;
  asOf: string;
  currency: string;
  provenanceId: string;
  statementLines: RawFinancialStatementLine[];
  metricMappings: StatementMetricDefinitionMapping[];
  utilizationEvents: HistoricalUtilizationEvent[];
  capacityRuleId: string;
  requiredFinancialMetrics: FinancialMetricKey[];
};

const fixture = JSON.parse(readFileSync(FIXTURE_PATH, "utf8")) as SliceFixture;

describeDb("Agent #9 financial/utilization durable persistence (disposable PostgreSQL)", () => {
  let db: EphemeralDatabase;
  let prisma: PrismaClient;
  let databaseName = "";
  const COMPANY_A = "agent9-persist-co-a";
  const COMPANY_B = "agent9-persist-co-b";
  const BUNDLE_KEY = "matthews-q1-fy2025";

  beforeAll(async () => {
    db = await createEphemeralDatabase(BASE_URL!);
    prisma = new PrismaClient({ datasources: { db: { url: db.databaseUrl } } });
    databaseName = await assertDisposableDatabase(prisma);
    await prisma.company.createMany({
      data: [
        { id: COMPANY_A, name: "Agent9 Persist A", tenantKind: "EVALUATION" },
        { id: COMPANY_B, name: "Agent9 Persist B", tenantKind: "EVALUATION" },
      ],
    });
  }, 180_000);

  afterAll(async () => {
    await prisma?.$disconnect();
    if (db) await destroyEphemeralDatabase(db);
  }, 60_000);

  function ingestFor(companyId: string, verificationStatus: "UNVERIFIED_EXTRACTION" | "REVIEW_REQUIRED" | "VERIFIED" = "UNVERIFIED_EXTRACTION") {
    const lines = fixture.statementLines.map((l) => ({ ...l }));
    return normalizeFinancialStatementEvidence({
      companyId,
      entityName: fixture.entityName,
      asOf: fixture.asOf,
      reportingPeriod: fixture.reportingPeriod,
      currency: fixture.currency,
      provenanceId: `${fixture.provenanceId}:${companyId}`,
      lines,
      mappings: fixture.metricMappings,
      verificationStatus,
      authenticity: "AUTHENTIC",
      maxAgeDays: 400,
    });
  }

  function reconstructFor(companyId: string, events?: HistoricalUtilizationEvent[]) {
    const mapped = (events ?? fixture.utilizationEvents).map((e) => ({
      ...e,
      eventId: `${e.eventId}:${companyId}`,
      entityKey: companyId,
      applicableProvisionId: e.applicableProvisionId,
    }));
    return reconstructUtilizationEvidence({
      companyId,
      capacityRuleId: fixture.capacityRuleId,
      asOf: fixture.asOf,
      currency: fixture.currency,
      events: mapped,
      completenessCertificate: null,
      acknowledgeUnknownHistory: true,
    });
  }

  it("records disposable database identity", () => {
    expect(databaseName).toMatch(/^headroom_test_[a-f0-9]{8,}$/);
    expect(PRODUCTION_ACTIVATION_STATUS).toBe("BLOCKED");
  });

  it("1: Financial evidence write/read/restart — Matthews snapshot + sidecar intact", async () => {
    const ingestion = ingestFor(COMPANY_A, "REVIEW_REQUIRED");
    expect(ingestion.ok).toBe(true);
    expect(ingestion.snapshot).not.toBeNull();

    const persisted = await durablyRememberFinancialEvidence(prisma, {
      companyId: COMPANY_A,
      bundleKey: BUNDLE_KEY,
      snapshot: ingestion.snapshot!,
      ingestionAudit: {
        provenanceId: ingestion.snapshot!.provenanceId,
        reportingPeriod: fixture.reportingPeriod,
        currency: fixture.currency,
        entityName: fixture.entityName,
        mappedRoles: ingestion.mappedRoles,
        unmappedLineIds: ingestion.unmappedLineIds,
        refusalReasons: ingestion.refusalReasons,
        trace: ingestion.trace,
        sourceDocumentRefs: ingestion.snapshot!.metrics.map((m) => ({
          documentId: m.sourceDocument.documentId,
          exactLocation: m.sourceDocument.exactLocation,
        })),
      },
      claimedReviewerLabel: "claimed-not-trusted",
    });
    expect(persisted.created).toBe(true);

    const fresh = new PrismaClient({ datasources: { db: { url: db.databaseUrl } } });
    try {
      const loaded = await loadFinancialEvidenceSnapshot(fresh, COMPANY_A, BUNDLE_KEY);
      expect(loaded).not.toBeNull();
      expect(loaded!.snapshot.provenanceId).toContain(fixture.provenanceId);
      expect(loaded!.snapshot.metrics.length).toBeGreaterThan(0);
      const assets = loaded!.snapshot.metrics.find((m) => m.metricKey === "TOTAL_ASSETS");
      expect(assets?.sourceDocument.documentId).toContain("edgar:");
      expect(assets?.accountingDefinition).toMatch(/GAAP/);
      expect(loaded!.ingestionAudit?.unmappedLineIds).toContain("bs-total-assets-gaap-only");
      expect(loaded!.ingestionAudit?.mappedRoles).toContain("CONSOLIDATED_EBITDA");
      expect(loaded!.row.claimedReviewerLabel).toBe("claimed-not-trusted");
      // Stored ≠ trusted
      expect(loaded!.row.verificationStatus).toBe("REVIEW_REQUIRED");
    } finally {
      await fresh.$disconnect();
    }
  });

  it("2: Historical utilization write/read/restart via ContractLedgerUsage", async () => {
    const recon = reconstructFor(COMPANY_A);
    expect(recon.ok).toBe(true);
    expect(recon.usageAttributed.length).toBeGreaterThan(0);

    const persisted = await durablyRememberUtilizationReconstruction(prisma, {
      companyId: COMPANY_A,
      result: recon,
      instrumentKey: "instr-matw",
    });
    expect(persisted.ledgerAppended).toBeGreaterThan(0);
    expect(persisted.envelope.unknownHistoricalActivity).toBe(true);

    const fresh = new PrismaClient({ datasources: { db: { url: db.databaseUrl } } });
    try {
      const usages = await loadAttributedLedgerUsages(fresh, COMPANY_A);
      expect(usages.length).toBeGreaterThan(0);
      const first = usages.find((u) => u.usageId.includes("matw-revolver"));
      expect(first).toBeDefined();
      expect(first!.amount.currency).toBe("USD");
      expect(first!.capacityPath).toEqual({ kind: "RULE", ruleId: fixture.capacityRuleId });
      expect(first!.provenance.source).toContain("edgar:");
      expect(first!.provenance.approvalState).toBe("APPROVED");
      expect(first!.effectiveAsOf).toBe(fixture.asOf);

      const env = await loadUtilizationReconstructionEnvelope(fresh, COMPANY_A, fixture.capacityRuleId);
      expect(env?.envelope.layers).toContain("UNKNOWN_HISTORICAL_ACTIVITY");
      expect(env?.envelope.evidenceObserved.length).toBe(recon.evidenceObserved.length);
    } finally {
      await fresh.$disconnect();
    }
  });

  it("3: UNKNOWN utilization preservation — empty/partial ≠ zero", async () => {
    const emptyRecon = reconstructUtilizationEvidence({
      companyId: COMPANY_A,
      capacityRuleId: "rule-empty-unknown",
      asOf: fixture.asOf,
      currency: "USD",
      events: [],
      completenessCertificate: null,
      acknowledgeUnknownHistory: true,
    });
    expect(emptyRecon.unknownHistoricalActivity).toBe(true);

    await durablyRememberUtilizationReconstruction(prisma, {
      companyId: COMPANY_A,
      result: emptyRecon,
    });

    const auth = await evaluatePersistedUtilizationAuthority(prisma, {
      companyId: COMPANY_A,
      capacityRuleId: "rule-empty-unknown",
    });
    expect(auth.unknownHistoricalActivity).toBe(true);
    expect(auth.reviewerConfirmedCompleteness).toBe(false);

    const env = await loadUtilizationReconstructionEnvelope(prisma, COMPANY_A, "rule-empty-unknown");
    const resolution = resolveUtilization({
      capacityRuleId: "rule-empty-unknown",
      asOf: fixture.asOf,
      currency: "USD",
      records: env!.envelope.utilizationRecords,
      completenessCertificate: null,
    });
    expect(resolution.attributedAmount).toBeNull();
    expect(resolution.supportsRemainingClaim).toBe(false);
    expect(resolution.knowledge).toBe("UNKNOWN");
  });

  it("4: Incomplete evidence refusal after reload", async () => {
    const revalidated = await revalidatePersistedFinancialEvidence(prisma, {
      companyId: COMPANY_A,
      bundleKey: BUNDLE_KEY,
      requiredFinancialMetrics: fixture.requiredFinancialMetrics,
      evaluationAsOf: fixture.asOf,
      trustedIssuerAuth: null,
    });
    expect(revalidated.loaded).not.toBeNull();
    // REVIEW_REQUIRED / missing host trust → not production authoritative
    expect(revalidated.validation?.productionAuthoritative).toBe(false);

    const built = await durablyBuildAndRememberVerifiedCapacityInput(prisma, {
      companyId: COMPANY_A,
      financialBundleKey: BUNDLE_KEY,
      capacityRuleId: fixture.capacityRuleId,
      requiredFinancialMetrics: fixture.requiredFinancialMetrics,
      evaluationAsOf: fixture.asOf,
      trustedIssuerAuth: null,
      calculationId: "verified-input:matthews-incomplete",
    });
    expect(built.ok).toBe(true);
    expect(mayUseAsProductionCapacityInput(built.handoff!)).toBe(false);
    expect(built.mayUseAsProduction).toBe(false);
    expect(built.handoff!.productionActivation).toBe("BLOCKED");
  });

  it("5: Cross-tenant isolation", async () => {
    const ingestionB = ingestFor(COMPANY_B, "REVIEW_REQUIRED");
    await durablyRememberFinancialEvidence(prisma, {
      companyId: COMPANY_B,
      bundleKey: BUNDLE_KEY,
      snapshot: ingestionB.snapshot!,
    });

    // Company B cannot read Company A bundle by id
    const aBundle = await loadFinancialEvidenceSnapshot(prisma, COMPANY_A, BUNDLE_KEY);
    await expect(
      getFinancialEvidenceBundleById(prisma, COMPANY_B, aBundle!.row.id),
    ).rejects.toBeInstanceOf(TenantIsolationError);

    // Cross-tenant metric entity rejected on write
    await expect(
      persistFinancialEvidenceBundle(prisma, {
        companyId: COMPANY_A,
        bundleKey: "cross-tenant-reject",
        asOfDate: fixture.asOf,
        metrics: [
          {
            ...ingestionB.snapshot!.metrics[0]!,
            entity: { ...ingestionB.snapshot!.metrics[0]!.entity, companyId: COMPANY_B },
          },
        ],
      }),
    ).rejects.toBeInstanceOf(TenantIsolationError);

    // Company B ledger empty / separate
    const bUsages = await loadAttributedLedgerUsages(prisma, COMPANY_B);
    const aUsages = await loadAttributedLedgerUsages(prisma, COMPANY_A);
    expect(bUsages.every((u) => u.companyId === COMPANY_B)).toBe(true);
    expect(aUsages.every((u) => u.companyId === COMPANY_A)).toBe(true);
  });

  it("6: Duplicate event idempotency", async () => {
    const ingestion = ingestFor(COMPANY_A, "REVIEW_REQUIRED");
    const a = await durablyRememberFinancialEvidence(prisma, {
      companyId: COMPANY_A,
      bundleKey: BUNDLE_KEY,
      snapshot: ingestion.snapshot!,
      ingestionAudit: {
        provenanceId: ingestion.snapshot!.provenanceId,
        mappedRoles: ingestion.mappedRoles,
        unmappedLineIds: ingestion.unmappedLineIds,
        refusalReasons: ingestion.refusalReasons,
        trace: ingestion.trace,
      },
    });
    expect(a.created).toBe(false);

    const recon = reconstructFor(COMPANY_A);
    const u1 = await durablyRememberUtilizationReconstruction(prisma, {
      companyId: COMPANY_A,
      result: recon,
      instrumentKey: "instr-matw",
    });
    expect(u1.ledgerAppended).toBe(0);
    expect(u1.ledgerSkippedDuplicate).toBeGreaterThan(0);

    const usages = await loadAttributedLedgerUsages(prisma, COMPANY_A);
    const revolverIds = usages.filter((u) => u.usageId.includes("matw-revolver"));
    expect(revolverIds).toHaveLength(1);
  });

  it("7: Historical correction / supersession — revised financial marks prior SUPERSEDED", async () => {
    const ingestion = ingestFor(COMPANY_A, "REVIEW_REQUIRED");
    const revisedMetrics = ingestion.snapshot!.metrics.map((m) =>
      m.metricKey === "TOTAL_DEBT" ? { ...m, value: m.value + 1, provenanceId: `${m.provenanceId}:rev` } : m,
    );
    const revision = await durablyRememberFinancialEvidence(prisma, {
      companyId: COMPANY_A,
      bundleKey: BUNDLE_KEY,
      snapshot: { ...ingestion.snapshot!, metrics: revisedMetrics, provenanceId: `${fixture.provenanceId}:rev` },
      ingestionAudit: { provenanceId: `${fixture.provenanceId}:rev`, supersessionNote: "debt restatement +1" },
    });
    expect(revision.created).toBe(true);

    const latest = await loadFinancialEvidenceSnapshot(prisma, COMPANY_A, BUNDLE_KEY);
    expect(latest!.contentHash).toBe(revision.contentHash);
    expect(latest!.snapshot.provenanceId).toContain(":rev");

    const history = await prisma.financialEvidenceBundle.findMany({
      where: { companyId: COMPANY_A, bundleKey: BUNDLE_KEY },
      orderBy: { createdAt: "asc" },
    });
    expect(history.some((h: { status: string }) => h.status === "SUPERSEDED")).toBe(true);
    expect(history.filter((h: { status: string }) => h.status === "ACTIVE")).toHaveLength(1);
  });

  it("8: Dependency invalidation — financial revision / cert revoke → STALE/INVALIDATED", async () => {
    const calc = await persistCapacityCalculation(prisma, {
      companyId: COMPANY_A,
      calculationId: "calc-agent9-dep",
      asOfDate: fixture.asOf,
      authorityClass: "VERIFIED_CALCULATION",
      calculationStatus: "OK",
      request: { path: fixture.capacityRuleId },
      capacityOutput: { note: "must not reuse after invalidation" },
      financialSnapshotIdentity: "fin-hash-old",
      utilizationSnapshotIdentity: "util-hash-old",
    });

    const fin = await loadFinancialEvidenceSnapshot(prisma, COMPANY_A, BUNDLE_KEY);
    const inv = await invalidateCapacityAfterFinancialRevision(prisma, {
      companyId: COMPANY_A,
      financialBundleId: fin!.row.id,
      dependentCapacityCalculationIds: [calc.id],
      reason: "financial statement revision changed contentHash",
      sourceFingerprintBefore: "fin-hash-old",
      sourceFingerprintAfter: fin!.contentHash,
    });
    expect(inv.invalidated).toBe(1);

    const latest = await getLatestAuthorizedCapacityCalculation(prisma, COMPANY_A, "calc-agent9-dep");
    expect(latest).toBeNull();
    const stale = await getCapacityCalculationById(prisma, COMPANY_A, calc.id);
    expect(stale?.status).toBe("STALE");

    // Completeness revoke path
    const certPersist = await persistUtilizationCompletenessRecord(prisma, {
      companyId: COMPANY_A,
      certificate: {
        capacityRuleId: fixture.capacityRuleId,
        asOf: fixture.asOf,
        approvalState: "APPROVED",
        sourceLabel: "counsel-claimed",
        kind: "VERIFIED_COMPLETE",
        authenticity: "AUTHENTIC",
        issuer: { role: "COUNSEL_REVIEWER", actorId: "claimed-untrusted", attestedAt: "2024-12-31T00:00:00Z" },
      },
    });
    const calc2 = await persistCapacityCalculation(prisma, {
      companyId: COMPANY_A,
      calculationId: "calc-agent9-cert-dep",
      asOfDate: fixture.asOf,
      authorityClass: "REVIEW_REQUIRED",
      calculationStatus: "OK",
      request: {},
      utilizationSnapshotIdentity: certPersist.contentHash,
    });
    await invalidateCapacityAfterCompletenessRevoke(prisma, {
      companyId: COMPANY_A,
      completenessRecordId: certPersist.id,
      dependentCapacityCalculationIds: [calc2.id],
      reason: "completeness certificate revoked",
    });
    const invalidated = await getCapacityCalculationById(prisma, COMPANY_A, calc2.id);
    expect(invalidated?.status).toBe("INVALIDATED");
  });

  it("9: Source-provenance reconstruction from durable rows alone", async () => {
    const loaded = await loadFinancialEvidenceSnapshot(prisma, COMPANY_A, BUNDLE_KEY);
    expect(loaded).not.toBeNull();
    for (const m of loaded!.snapshot.metrics) {
      expect(m.sourceDocument.documentId.length).toBeGreaterThan(0);
      expect(m.sourceDocument.exactLocation.length).toBeGreaterThan(0);
      expect(m.accountingDefinition.length).toBeGreaterThan(0);
      expect(m.provenanceId.length).toBeGreaterThan(0);
    }
    // Covenant marker path: map TOTAL_CONSOLIDATED_ASSETS separately
    const covenantLine = fixture.statementLines.find((l) => l.lineId === "bs-total-assets")!;
    const covenantIngest = normalizeFinancialStatementEvidence({
      companyId: COMPANY_A,
      entityName: fixture.entityName,
      asOf: fixture.asOf,
      reportingPeriod: fixture.reportingPeriod,
      currency: fixture.currency,
      provenanceId: `${fixture.provenanceId}:covenant-assets`,
      lines: [
        {
          ...covenantLine,
          lineId: "bs-tca",
          definitionBasis: "CONTRACT_ADJUSTED",
          accountingDefinition: "Indenture Total Consolidated Assets",
          consolidationPerimeter: "Issuer and Restricted Subsidiaries",
          amount: 1800,
        },
      ],
      mappings: [{ lineId: "bs-tca", metricKey: "TOTAL_CONSOLIDATED_ASSETS" }],
      verificationStatus: "REVIEW_REQUIRED",
      authenticity: "AUTHENTIC",
    });
    expect(covenantIngest.ok).toBe(true);
    const other = covenantIngest.snapshot!.metrics.find((m) => m.metricKey === "OTHER");
    expect(other?.accountingDefinition).toContain("[COVENANT_TERM:TOTAL_CONSOLIDATED_ASSETS]");

    await durablyRememberFinancialEvidence(prisma, {
      companyId: COMPANY_A,
      bundleKey: "covenant-tca",
      snapshot: covenantIngest.snapshot!,
      ingestionAudit: {
        mappedRoles: covenantIngest.mappedRoles,
        unmappedLineIds: covenantIngest.unmappedLineIds,
        trace: covenantIngest.trace,
      },
    });
    const reloaded = await loadFinancialEvidenceSnapshot(prisma, COMPANY_A, "covenant-tca");
    expect(reloaded!.snapshot.metrics[0]?.accountingDefinition).toContain(
      "[COVENANT_TERM:TOTAL_CONSOLIDATED_ASSETS]",
    );
    expect(reloaded!.ingestionAudit?.mappedRoles).toContain("TOTAL_CONSOLIDATED_ASSETS");
  });

  it("10: Hypothetical simulation without ledger mutation", async () => {
    const before = await prisma.contractLedgerUsage.count({ where: { companyId: COMPANY_A } });
    await durablyRememberSimulation(prisma, {
      companyId: COMPANY_A,
      simulationId: "sim-agent9-hypo",
      simulationHash: "simhash-agent9",
      transactionId: "txn-hypo-1",
      transactionHash: "txnhash-hypo-1",
      simulationStatus: "SIMULATED",
      result: { ok: true, effects: [{ kind: "CONSUME_CAPACITY", amount: "1000" }] },
      proposedEffects: [{ kind: "CONSUME_CAPACITY", amount: "1000" }],
    });
    const after = await prisma.contractLedgerUsage.count({ where: { companyId: COMPANY_A } });
    expect(after).toBe(before);
  });

  // --- Adversarial ---

  it("adversarial: Stored APPROVED certificate with untrusted issuer does not activate production", async () => {
    const cert = await persistUtilizationCompletenessRecord(prisma, {
      companyId: COMPANY_A,
      certificate: {
        capacityRuleId: "rule-untrusted-issuer",
        asOf: fixture.asOf,
        approvalState: "APPROVED",
        sourceLabel: "claimed-counsel",
        kind: "VERIFIED_COMPLETE",
        authenticity: "AUTHENTIC",
        issuer: { role: "COUNSEL_REVIEWER", actorId: "untrusted-label", attestedAt: "2024-12-31T00:00:00Z" },
      },
    });
    // Persistence may store ACTIVE AUTHENTIC rows for audit — production eligibility is structural only.
    const eligible = await getProductionEligibleCompletenessRecord(
      prisma,
      COMPANY_A,
      "rule-untrusted-issuer",
      fixture.asOf,
    );
    expect(eligible?.id).toBe(cert.id);
    // Host trusted-issuer gates still BLOCKED — handoff must refuse production.
    const handoff = buildVerifiedCapacityInputHandoff({
      companyId: COMPANY_A,
      evaluationAsOf: fixture.asOf,
      financial: (await loadFinancialEvidenceSnapshot(prisma, COMPANY_A, BUNDLE_KEY))!.snapshot,
      requiredFinancialMetrics: ["TOTAL_ASSETS"],
      utilization: {
        capacityRuleId: "rule-untrusted-issuer",
        asOf: fixture.asOf,
        currency: "USD",
        records: [],
        completenessCertificate: {
          capacityRuleId: "rule-untrusted-issuer",
          asOf: fixture.asOf,
          approvalState: "APPROVED",
          sourceLabel: "claimed-counsel",
          kind: "VERIFIED_COMPLETE",
          authenticity: "AUTHENTIC",
          issuer: { role: "COUNSEL_REVIEWER", actorId: "untrusted-label", attestedAt: "2024-12-31T00:00:00Z" },
        },
      },
      trustedIssuerAuth: null,
    });
    expect(mayUseAsProductionCapacityInput(handoff)).toBe(false);
    expect(handoff.productionActivation).toBe("BLOCKED");
  });

  it("adversarial: Cross-tenant provenance substitution refused", async () => {
    const a = await loadFinancialEvidenceSnapshot(prisma, COMPANY_A, BUNDLE_KEY);
    await expect(
      revalidatePersistedFinancialEvidence(prisma, {
        companyId: COMPANY_B,
        bundleKey: BUNDLE_KEY,
        requiredFinancialMetrics: ["TOTAL_ASSETS"],
        evaluationAsOf: fixture.asOf,
        expectedProvenanceId: a!.snapshot.provenanceId,
      }),
    ).resolves.toMatchObject({
      // Company B has its own bundle from test 5 — provenance mismatch if we expect A's id
    });
    const bReval = await revalidatePersistedFinancialEvidence(prisma, {
      companyId: COMPANY_B,
      bundleKey: BUNDLE_KEY,
      requiredFinancialMetrics: ["TOTAL_ASSETS"],
      evaluationAsOf: fixture.asOf,
      expectedProvenanceId: a!.snapshot.provenanceId,
    });
    expect(bReval.validation?.ok === false || bReval.blockers.some((b) => /provenance|mismatch/i.test(b))).toBe(
      true,
    );
  });

  it("adversarial: Missing utilization events remain UNKNOWN", async () => {
    const auth = await evaluatePersistedUtilizationAuthority(prisma, {
      companyId: COMPANY_A,
      capacityRuleId: "rule-never-persisted",
    });
    expect(auth.unknownHistoricalActivity).toBe(true);
    expect(auth.envelope).toBeNull();
    expect(auth.blockers.some((b) => /UNKNOWN/i.test(b))).toBe(true);
  });

  it("adversarial: Duplicate event replay does not double-count", async () => {
    const before = await loadAttributedLedgerUsages(prisma, COMPANY_A);
    const recon = reconstructFor(COMPANY_A);
    const again = await durablyRememberUtilizationReconstruction(prisma, {
      companyId: COMPANY_A,
      result: recon,
      instrumentKey: "instr-matw",
    });
    expect(again.ledgerAppended).toBe(0);
    const after = await loadAttributedLedgerUsages(prisma, COMPANY_A);
    expect(after.filter((u) => u.status !== "SUPERSEDED").length).toBe(
      before.filter((u) => u.status !== "SUPERSEDED").length,
    );
  });

  it("adversarial: Stale calculation reuse refused", async () => {
    const calc = await persistCapacityCalculation(prisma, {
      companyId: COMPANY_A,
      calculationId: "calc-stale-reuse",
      asOfDate: fixture.asOf,
      authorityClass: "VERIFIED_CALCULATION",
      calculationStatus: "OK",
      request: { n: 1 },
      capacityOutput: { remaining: "999" },
    });
    await invalidateDependentArtifacts(prisma, {
      companyId: COMPANY_A,
      sourceEntityType: "FinancialEvidenceBundle",
      sourceEntityId: "any",
      dependents: [{ entityType: "CapacityCalculationRecord", entityId: calc.id }],
      reason: "stale reuse test",
      markAs: "STALE",
    });
    const latest = await getLatestAuthorizedCapacityCalculation(prisma, COMPANY_A, "calc-stale-reuse");
    expect(latest).toBeNull();
    const row = await getCapacityCalculationById(prisma, COMPANY_A, calc.id);
    expect(row?.status).toBe("STALE");
    // Historical retained for audit
    expect(row?.capacityOutput).toEqual({ remaining: "999" });
  });

  it("adversarial: GAAP/covenant metric confusion refused on ingest + preserved in store", async () => {
    const gaap = fixture.statementLines.find((l) => l.lineId === "bs-total-assets")!;
    const refused = normalizeFinancialStatementEvidence({
      companyId: COMPANY_A,
      entityName: fixture.entityName,
      asOf: fixture.asOf,
      reportingPeriod: fixture.reportingPeriod,
      currency: fixture.currency,
      provenanceId: "gaap-confusion",
      lines: [
        gaap,
        {
          ...gaap,
          lineId: "bs-tca-same",
          definitionBasis: "CONTRACT_ADJUSTED",
          accountingDefinition: "Total Consolidated Assets",
          consolidationPerimeter: "Issuer and Restricted Subsidiaries",
        },
      ],
      mappings: [
        { lineId: "bs-total-assets", metricKey: "TOTAL_ASSETS" },
        { lineId: "bs-tca-same", metricKey: "TOTAL_CONSOLIDATED_ASSETS" },
      ],
      verificationStatus: "UNVERIFIED_EXTRACTION",
      authenticity: "AUTHENTIC",
    });
    expect(refused.ok).toBe(false);
    expect(refused.refusalReasons).toContain("TOTAL_ASSETS_EQUATED_TO_CONSOLIDATED");
  });

  it("adversarial: Hypothetical transaction does not mutate ledger", async () => {
    const before = await prisma.contractLedgerUsage.count({ where: { companyId: COMPANY_A } });
    await durablyRememberSimulation(prisma, {
      companyId: COMPANY_A,
      simulationId: "sim-adv-hypo",
      simulationHash: "h2",
      transactionId: "t2",
      transactionHash: "th2",
      simulationStatus: "SIMULATED",
      result: { mutateWouldBe: true },
    });
    expect(await prisma.contractLedgerUsage.count({ where: { companyId: COMPANY_A } })).toBe(before);
  });

  it("adversarial: Reconstructed evidence with missing source document keeps empty documentId refused on revalidation path", async () => {
    await expect(
      persistFinancialEvidenceBundle(prisma, {
        companyId: COMPANY_A,
        bundleKey: "missing-source-doc",
        asOfDate: fixture.asOf,
        metrics: [
          {
            metricKey: "TOTAL_ASSETS",
            value: 1,
            currency: "USD",
            units: "USD",
            entity: {
              companyId: COMPANY_A,
              entityName: "X",
              consolidationPerimeter: "Borrower",
            },
            sourceDocument: { documentId: "", exactLocation: "", excerpt: null },
            reportingPeriod: "FY2025-Q1",
            measurementDate: fixture.asOf,
            accountingDefinition: "broken",
            amendmentRestatementStatus: "ORIGINAL",
            verificationStatus: "UNVERIFIED_EXTRACTION",
            authenticity: "AUTHENTIC",
            provenanceId: "broken-prov",
          },
        ],
      }),
    ).resolves.toMatchObject({ created: true });
    // Persist allows audit storage; revalidation / handoff must fail closed.
    const reval = await revalidatePersistedFinancialEvidence(prisma, {
      companyId: COMPANY_A,
      bundleKey: "missing-source-doc",
      requiredFinancialMetrics: ["TOTAL_ASSETS"],
      evaluationAsOf: fixture.asOf,
      trustedIssuerAuth: null,
    });
    expect(reval.validation?.productionAuthoritative).toBe(false);
    expect(reval.ok === false || (reval.validation && !reval.validation.productionAuthoritative)).toBe(true);
  });

  it("product wiring slice: Position/Ask/Simulate share durable identities", async () => {
    const ids = await loadSharedDurableCapacityIdentities(prisma, {
      companyId: COMPANY_A,
      financialBundleKey: BUNDLE_KEY,
      capacityRuleId: fixture.capacityRuleId,
      capacityCalculationId: "verified-input:matthews-incomplete",
    });
    expect(ids.financialSnapshotIdentity).toBeTruthy();
    expect(ids.utilizationSnapshotIdentity).toBeTruthy();
    expect(ids.unknownHistoricalActivity).toBe(true);
    expect(ids.mayUseAsProduction).toBe(false);

    const viaBridge = await resolveDurableCapacityIdentitiesForProduct(prisma, {
      companyId: COMPANY_A,
      financialBundleKey: BUNDLE_KEY,
      capacityRuleId: fixture.capacityRuleId,
    });
    expect(viaBridge.financialSnapshotIdentity).toBe(ids.financialSnapshotIdentity);
    expect(viaBridge.utilizationSnapshotIdentity).toBe(ids.utilizationSnapshotIdentity);
  });

  it("production activation remains BLOCKED", async () => {
    expect(PRODUCTION_ACTIVATION_STATUS).toBe("BLOCKED");
    await expect(
      persistCapacityCalculation(prisma, {
        companyId: COMPANY_A,
        calculationId: "calc-prod-blocked",
        asOfDate: fixture.asOf,
        authorityClass: "PRODUCTION_AUTHORITATIVE",
        calculationStatus: "OK",
        request: {},
        capacityOutput: { remaining: "1" },
      }),
    ).rejects.toBeInstanceOf(PersistenceContractError);
  });
});
