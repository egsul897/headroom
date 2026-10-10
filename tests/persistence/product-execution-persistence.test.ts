/**
 * P5/P6 — canonical product execution ↔ Neon persistence acceptance.
 *
 * Proves executeUnifiedVerifiedTransaction results survive disposable Postgres
 * write → fresh PrismaClient read-back with authority / tenant / invalidation
 * invariants intact. PRODUCTION_DB_TOUCHED: NO
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { createEphemeralDatabase, destroyEphemeralDatabase, type EphemeralDatabase } from "@/lib/testing/ephemeral-db";
import { assertDisposableDatabase } from "@/lib/testing/disposable-db";
import type { SemanticVerificationResult } from "@/lib/contract-model/compiler/semantic-verification/types";
import type { IRCapacityExpression, IRExpression, IRRule } from "@/lib/contract-model/ir/types";
import { snapshotInputResolver } from "@/lib/contract-model/runtime/input";
import { rationalFromString } from "@/lib/contract-model/runtime/decimal";
import type { VerifiedExecutionPackage, VerifiedUnitArtifact } from "@/lib/contract-model/verified-execution";
import {
  demoTrustedIssuerAuth,
  productionTrustedIssuerAuth,
  sessionCounselPrincipal,
  type UtilizationCompletenessCertificate,
} from "@/lib/capacity";
import {
  executeAndPersistUnifiedVerifiedTransaction,
  loadPersistedUnifiedExecution,
  persistUnifiedTransactionExecution,
  executeUnifiedVerifiedTransaction,
  type FinancialMetricEvidence,
  type OperativeSourceAuthority,
  type UnifiedTransactionExecutionRequest,
  type VerifiedExecutableRuleIdentity,
} from "@/lib/product/verified-transaction-execution";
import {
  invalidateDependentArtifacts,
  revokeCompletenessRecord,
  revokeFinancialEvidenceBundle,
  PRODUCTION_ACTIVATION_STATUS,
  TenantIsolationError,
  getOperativeAuthoritySnapshotById,
} from "@/lib/persistence";

const BASE_URL = process.env.DATABASE_URL;
const SKIP = !BASE_URL;
const describeDb = SKIP ? describe.skip : describe;

const ORG = "persist-ute-co-a";
const ORG_B = "persist-ute-co-b";
const INST = "persist-ute-facility";
const WHEN = "2025-06-30";
const STRONG = {
  irSchemaVersion: "ute-persist-v1",
  compilerVersion: "ute-persist-compiler-v1",
  sourceContentVersion: "ute-persist-source-v1",
} as const;

let exprN = 0;
const eid = () => `ute-p-expr-${++exprN}`;
const MONEY = (amount: number, currency = "USD"): IRExpression => ({
  kind: "MONEY",
  type: "MONEY",
  amount,
  currency,
  exprId: eid(),
});

function cleanResult(): SemanticVerificationResult {
  return {
    candidateRef: "ute-p-cand",
    status: "VERIFIED_NO_MATERIAL_GAP_FOUND",
    findings: [],
    sourceInventory: { items: [] },
    irInventory: {
      candidateRef: "ute-p-cand",
      items: [],
      ruleCount: 0,
      definitionCount: 0,
      inventoryAlgorithmVersion: "ute-ir-inventory.v1",
    },
    reconciliation: { items: [] },
    semanticReviewInvoked: false,
    semanticReviewSkippedReason: "persist fixture",
    conditionSuspicion: null,
    verifierAlgorithmVersion: "ute-verifier-v1",
    verifiedAt: "2025-01-01T00:00:00.000Z",
    evidenceSetHash: "ute-p-eh-1",
  } as unknown as SemanticVerificationResult;
}

function ruleOf(ruleId: string, capacity: IRCapacityExpression): IRRule {
  return {
    ruleId,
    ...STRONG,
    companyId: ORG,
    instrumentKey: INST,
    sourceDocumentId: "doc-ca",
    sourceSectionRef: "7.02(d)",
    covenantFamily: "INDEBTEDNESS",
    ruleType: "QUANTITATIVE_PERMISSION",
    posture: "PERMISSION",
    action: "INCUR_DEBT",
    entityScope: ["BORROWER"],
    entityScopeExcluded: [],
    transactionScope: null,
    capacityExpression: capacity,
    conditions: [],
    exceptions: [],
    dependsOn: [],
    operativeLineage: null,
    sufficiency: "COMPLETE",
    sufficiencyReasons: [],
    provenance: {
      documentId: "doc-ca",
      sourceNodeKey: null,
      sourceCitation: "§7.02(d)",
      excerpt: null,
    },
  };
}

function artifactForRule(u: IRRule): VerifiedUnitArtifact {
  return {
    ruleOrDefinitionId: u.ruleId,
    kind: "RULE",
    verifiedIdentity: {
      ruleOrDefinitionId: u.ruleId,
      companyId: u.companyId,
      instrumentKey: u.instrumentKey,
      irSchemaVersion: u.irSchemaVersion ?? "",
      compilerVersion: u.compilerVersion ?? null,
      sourceContentVersion: u.sourceContentVersion ?? null,
    },
    result: cleanResult(),
  };
}

function pkgOf(rules: IRRule[]): VerifiedExecutionPackage {
  return {
    companyId: ORG,
    instrumentKey: INST,
    rules,
    definitions: [],
    sharedCapacities: [],
    verifications: rules.map(artifactForRule),
  };
}

function metric(
  over: Partial<FinancialMetricEvidence> & Pick<FinancialMetricEvidence, "metricKey" | "value">,
): FinancialMetricEvidence {
  return {
    currency: "USD",
    units: "USD",
    entity: {
      companyId: ORG,
      entityName: "Persist UTE Co",
      consolidationPerimeter: "Borrower and Restricted Subsidiaries",
    },
    sourceDocument: { documentId: "doc-10q", exactLocation: "BS / Total assets", excerpt: null },
    reportingPeriod: "FY2025-Q1",
    measurementDate: "2025-03-31",
    accountingDefinition: "covenant Total Consolidated Assets — NOT GAAP Total Assets",
    amendmentRestatementStatus: "ORIGINAL",
    verificationStatus: "VERIFIED",
    authenticity: "AUTHENTIC",
    provenanceId: `prov-${over.metricKey}`,
    ...over,
  };
}

function operative(over: Partial<OperativeSourceAuthority> = {}): OperativeSourceAuthority {
  return {
    canonicalInstrumentKey: INST,
    sourceDocumentId: "doc-ca",
    sourceSectionRef: "7.02(d)",
    sourceCitation: "§7.02(d)",
    authorityClassification: "CONFIRMED_OPERATIVE",
    documentStatus: "OPERATIVE",
    effectiveAsOfDate: "2025-01-01",
    provisionalIdentity: false,
    conflictingAmendment: false,
    unresolvedConflicts: [],
    mayConsolidateOperative: true,
    ...over,
  };
}

function ruleIdentity(ruleId: string, over: Partial<VerifiedExecutableRuleIdentity> = {}): VerifiedExecutableRuleIdentity {
  return {
    ruleId,
    lifecycle: "VERIFIED_EXECUTABLE",
    verificationArtifactId: `va-${ruleId}`,
    sourceSectionRef: "7.02(d)",
    sourceCitation: "§7.02(d)",
    ...STRONG,
    ...over,
  };
}

function emptyUtilCert(ruleId: string): UtilizationCompletenessCertificate {
  return {
    capacityRuleId: ruleId,
    asOf: WHEN,
    approvalState: "APPROVED",
    sourceLabel: "ute-persist-completeness",
    kind: "VERIFIED_EMPTY",
    authenticity: "AUTHENTIC",
    issuer: { role: "COUNSEL_REVIEWER", actorId: "counsel-1" },
  };
}

function baseRequest(
  pkg: VerifiedExecutionPackage,
  ruleId: string,
  over: Partial<UnifiedTransactionExecutionRequest> = {},
): UnifiedTransactionExecutionRequest {
  const mv = (amount: string) => ({
    type: "MONEY" as const,
    amount: rationalFromString(amount),
    currency: "USD",
    lineage: { exprId: null as string | null, inputKeys: [] as string[] },
  });
  const inputs = snapshotInputResolver({
    snapshots: [
      {
        snapshotId: "ute-persist-snap",
        version: "1",
        companyId: ORG,
        asOf: WHEN,
        reportingPeriod: "FY2025-Q1",
        status: "APPROVED",
        supersedesSnapshotId: null,
        provenance: { source: "ute persist test", sourceVersion: "v1" },
        review: {
          reviewedBy: "counsel-1",
          reviewedAt: "2025-05-01T00:00:00Z",
          approvalRef: "apr-ute-p-1",
        },
        inputs: [
          {
            identity: {
              companyId: ORG,
              scope: { kind: "INSTRUMENT_LEVEL", instrumentKey: INST },
              inputKind: "METRIC",
              key: "Consolidated Total Assets",
              identityStrength: "CONTRACT_NAME_ONLY",
              period: { kind: "NOT_PERIOD_SPECIFIC" },
              asOf: { kind: "EXACT_DATE", isoDate: WHEN },
              valueType: "MONEY",
              currency: "USD",
            },
            value: mv("2000000000"),
            sourceVersion: "src-1",
          },
        ],
      },
    ],
    definitions: [],
    rules: [...pkg.rules],
    companyId: ORG,
    instrumentKey: INST,
  });

  return {
    companyId: ORG,
    instrumentKey: INST,
    transaction: {
      type: "FINANCE_LEASE",
      amount: 10_000_000,
      currency: "USD",
      date: WHEN,
      label: "persist UTE finance lease",
      transactionId: `ute-persist-tx-${ruleId}`,
    },
    selectedLegalPath: {
      pathId: `path:${ruleId}`,
      ruleIds: [ruleId],
      capacityNodeIds: [`capacity:rule:${ruleId}`],
      sharedCapacityIds: [],
      label: `path ${ruleId}`,
      selectionMode: "EXPLICIT",
    },
    verifiedExecutableRule: ruleIdentity(ruleId),
    operativeSourceAuthority: operative(),
    financialEvidence: {
      metrics: [
        metric({
          metricKey: "TOTAL_ASSETS",
          value: 2_000_000_000,
          authenticity: "SYNTHETIC_LABELED",
        }),
      ],
      requiredMetricKeys: [],
    },
    utilization: {
      capacityRuleId: ruleId,
      records: [],
      completenessCertificate: emptyUtilCert(ruleId),
      allowSyntheticRemaining: true,
    },
    ledger: [],
    reviewerAuthorization: {
      required: false,
      actorId: null,
      role: null,
      trustedIssuerAuth: demoTrustedIssuerAuth(),
    },
    verifiedPackage: pkg,
    inputs,
    mode: "HYPOTHETICAL",
    allowHypotheticalFinancials: true,
    ...over,
  };
}

describeDb("Product execution persistence (canonical VTE → Neon)", () => {
  let db: EphemeralDatabase;
  let prisma: PrismaClient;
  let databaseName = "";
  const RULE = "rule-702d-flat";

  beforeAll(async () => {
    db = await createEphemeralDatabase(BASE_URL!);
    prisma = new PrismaClient({ datasources: { db: { url: db.databaseUrl } } });
    databaseName = await assertDisposableDatabase(prisma);
    await prisma.company.createMany({
      data: [
        { id: ORG, name: "Persist UTE A", tenantKind: "EVALUATION" },
        { id: ORG_B, name: "Persist UTE B", tenantKind: "EVALUATION" },
      ],
    });
  }, 120_000);

  afterAll(async () => {
    await prisma?.$disconnect();
    if (db) await destroyEphemeralDatabase(db);
  }, 60_000);

  it("records disposable database identity", () => {
    expect(databaseName).toMatch(/^headroom_test_[a-f0-9]{8,}$/);
    expect(PRODUCTION_ACTIVATION_STATUS).toBe("BLOCKED");
  });

  it("write → fresh PrismaClient read-back reconstructs authority + evidence + sim isolation", async () => {
    const pkg = pkgOf([ruleOf(RULE, MONEY(50_000_000))]);
    const request = baseRequest(pkg, RULE);
    const { result, persistence } = await executeAndPersistUnifiedVerifiedTransaction(prisma, request);

    expect(persistence.complete).toBe(true);
    expect(persistence.capacityCalculationRecordId).toBeTruthy();
    expect(persistence.operativeAuthoritySnapshotId).toBeTruthy();
    expect(persistence.financialEvidenceBundleId).toBeTruthy();
    expect(persistence.utilizationCompletenessRecordId).toBeTruthy();
    expect(result.productionAuthority).not.toBe("PRODUCTION_AUTHORITY_ACTIVE");

    const ledgerBefore = await prisma.contractLedgerUsage.count({ where: { companyId: ORG } });

    const fresh = new PrismaClient({ datasources: { db: { url: db.databaseUrl } } });
    try {
      const loaded = await loadPersistedUnifiedExecution(fresh, ORG, persistence.calculationId);
      expect(loaded).not.toBeNull();
      expect(loaded!.calculation.calculationStatus).toBe(result.executionStatus);
      expect(loaded!.calculation.authorityClass).toBe("HYPOTHETICAL");
      expect(loaded!.operative?.provisionalIdentity).toBe(false);
      expect(loaded!.operative?.authorityClassification).toBe("CONFIRMED_OPERATIVE");
      const finPayload = loaded!.financial!.payload as unknown as { metrics: FinancialMetricEvidence[] };
      expect(finPayload.metrics[0]?.accountingDefinition).toContain("NOT GAAP");
      expect(loaded!.simulation?.mutatesActualLedger).toBe(false);
      expect(loaded!.audits.length).toBeGreaterThan(0);
      expect(loaded!.reusableAsCurrentAuthority).toBe(true);
    } finally {
      await fresh.$disconnect();
    }

    const ledgerAfter = await prisma.contractLedgerUsage.count({ where: { companyId: ORG } });
    expect(ledgerAfter).toBe(ledgerBefore);
  });

  it("idempotent duplicate execution does not fork authoritative rows", async () => {
    const ruleId = "rule-idempotent";
    const pkg = pkgOf([ruleOf(ruleId, MONEY(50_000_000))]);
    const request = baseRequest(pkg, ruleId, {
      transaction: {
        type: "FINANCE_LEASE",
        amount: 10_000_000,
        currency: "USD",
        date: WHEN,
        transactionId: "ute-idempotent-1",
      },
    });
    const a = await executeAndPersistUnifiedVerifiedTransaction(prisma, request);
    const b = await executeAndPersistUnifiedVerifiedTransaction(prisma, request);
    expect(a.persistence.calculationId).toBe(b.persistence.calculationId);
    expect(a.persistence.capacityCalculationRecordId).toBe(b.persistence.capacityCalculationRecordId);
    expect(a.persistence.operativeAuthoritySnapshotId).toBe(b.persistence.operativeAuthoritySnapshotId);

    const activeCount = await prisma.capacityCalculationRecord.count({
      where: { companyId: ORG, calculationId: a.persistence.calculationId, status: "ACTIVE" },
    });
    expect(activeCount).toBe(1);
  });

  it("concurrent duplicate writes stay idempotent", async () => {
    const pkg = pkgOf([ruleOf("rule-concurrent", MONEY(25_000_000))]);
    const request = baseRequest(pkg, "rule-concurrent", {
      transaction: {
        type: "FINANCE_LEASE",
        amount: 1_000_000,
        currency: "USD",
        date: WHEN,
        transactionId: "ute-concurrent-1",
      },
    });
    const [x, y] = await Promise.all([
      executeAndPersistUnifiedVerifiedTransaction(prisma, request),
      executeAndPersistUnifiedVerifiedTransaction(prisma, request),
    ]);
    expect(x.persistence.calculationId).toBe(y.persistence.calculationId);
    const n = await prisma.capacityCalculationRecord.count({
      where: { companyId: ORG, calculationId: x.persistence.calculationId },
    });
    expect(n).toBe(1);
  });

  it("refused provisional path persists refusal without ledger mutation", async () => {
    const pkg = pkgOf([ruleOf("rule-prov", MONEY(50_000_000))]);
    const request = baseRequest(pkg, "rule-prov", {
      operativeSourceAuthority: operative({
        authorityClassification: "PROVISIONAL_IDENTITY_BLOCKED",
        provisionalIdentity: true,
        canonicalInstrumentKey: null,
      }),
      transaction: {
        type: "FINANCE_LEASE",
        amount: 1,
        currency: "USD",
        date: WHEN,
        transactionId: "ute-prov-1",
      },
    });
    const before = await prisma.contractLedgerUsage.count({ where: { companyId: ORG } });
    const { result, persistence } = await executeAndPersistUnifiedVerifiedTransaction(prisma, request);
    expect(result.blockers.length).toBeGreaterThan(0);
    expect(persistence.complete).toBe(true);
    const loaded = await loadPersistedUnifiedExecution(prisma, ORG, persistence.calculationId);
    expect(loaded!.calculation.authorityClass).toBe("PROVISIONAL");
    expect(loaded!.calculation.refusalReasons).toEqual(expect.arrayContaining([expect.any(String)]));
    expect(await prisma.contractLedgerUsage.count({ where: { companyId: ORG } })).toBe(before);
  });

  it("cross-tenant read of persisted operative snapshot is refused", async () => {
    const snap = await prisma.operativeAuthoritySnapshot.findFirst({
      where: { companyId: ORG, status: "ACTIVE" },
    });
    expect(snap).not.toBeNull();
    await expect(getOperativeAuthoritySnapshotById(prisma, ORG_B, snap!.id)).rejects.toBeInstanceOf(
      TenantIsolationError,
    );
  });

  it("dependency invalidation + evidence revocation blocks current reuse", async () => {
    const pkg = pkgOf([ruleOf("rule-inv", MONEY(50_000_000))]);
    const request = baseRequest(pkg, "rule-inv", {
      transaction: {
        type: "FINANCE_LEASE",
        amount: 2_000_000,
        currency: "USD",
        date: WHEN,
        transactionId: "ute-inv-1",
      },
    });
    const { persistence } = await executeAndPersistUnifiedVerifiedTransaction(prisma, request);
    expect(persistence.capacityCalculationRecordId).toBeTruthy();

    await invalidateDependentArtifacts(prisma, {
      companyId: ORG,
      sourceEntityType: "FinancialEvidenceBundle",
      sourceEntityId: persistence.financialEvidenceBundleId!,
      dependents: [
        { entityType: "CapacityCalculationRecord", entityId: persistence.capacityCalculationRecordId! },
      ],
      reason: "financial evidence revised",
      markAs: "STALE",
    });

    const afterInvalidate = await loadPersistedUnifiedExecution(prisma, ORG, persistence.calculationId);
    expect(afterInvalidate).toBeNull(); // ACTIVE-only loader

    const staleRow = await prisma.capacityCalculationRecord.findUnique({
      where: { id: persistence.capacityCalculationRecordId! },
    });
    expect(staleRow?.status).toBe("STALE");

    // Revoke evidence — production-eligible completeness must disappear
    if (persistence.utilizationCompletenessRecordId) {
      await revokeCompletenessRecord(prisma, ORG, persistence.utilizationCompletenessRecordId);
    }
    if (persistence.financialEvidenceBundleId) {
      await revokeFinancialEvidenceBundle(prisma, ORG, persistence.financialEvidenceBundleId);
    }
    const fin = await prisma.financialEvidenceBundle.findUnique({
      where: { id: persistence.financialEvidenceBundleId! },
    });
    expect(fin?.status).toBe("REVOKED");
  });

  it("historical supersession preserves prior operative claim as-of", async () => {
    const pkg = pkgOf([ruleOf("rule-hist", MONEY(50_000_000))]);
    const r1 = baseRequest(pkg, "rule-hist", {
      operativeSourceAuthority: operative({ unresolvedConflicts: [], sourceCitation: "§7.02(d)-v1" }),
      transaction: {
        type: "FINANCE_LEASE",
        amount: 1,
        currency: "USD",
        date: WHEN,
        transactionId: "ute-hist-1",
      },
    });
    const first = await executeAndPersistUnifiedVerifiedTransaction(prisma, r1);
    const r2 = baseRequest(pkg, "rule-hist", {
      operativeSourceAuthority: operative({
        unresolvedConflicts: ["amendment uploaded"],
        sourceCitation: "§7.02(d)-v2-amended",
      }),
      transaction: {
        type: "FINANCE_LEASE",
        amount: 1,
        currency: "USD",
        date: WHEN,
        transactionId: "ute-hist-2",
      },
    });
    const second = await executeAndPersistUnifiedVerifiedTransaction(prisma, r2);
    expect(second.persistence.operativeAuthoritySnapshotId).not.toBe(
      first.persistence.operativeAuthoritySnapshotId,
    );

    const prior = await prisma.operativeAuthoritySnapshot.findUnique({
      where: { id: first.persistence.operativeAuthoritySnapshotId! },
    });
    expect(prior?.status).toBe("SUPERSEDED");
    expect(prior?.supersededById).toBe(second.persistence.operativeAuthoritySnapshotId);
    const priorPayload = prior!.payload as unknown as { claim: OperativeSourceAuthority };
    expect(priorPayload.claim.sourceCitation).toBe("§7.02(d)-v1");
  });

  it("production mode cannot persist PRODUCTION_AUTHORITATIVE while activation BLOCKED", async () => {
    const pkg = pkgOf([ruleOf("rule-prod", MONEY(50_000_000))]);
    const request = baseRequest(pkg, "rule-prod", {
      mode: "PRODUCTION_AUTHORITY",
      reviewerAuthorization: {
        required: true,
        actorId: "counsel-1",
        role: "COUNSEL_REVIEWER",
        trustedIssuerAuth: productionTrustedIssuerAuth([sessionCounselPrincipal("counsel-1")]),
        requireIdentityAuthorization: true,
      },
      transaction: {
        type: "FINANCE_LEASE",
        amount: 1,
        currency: "USD",
        date: WHEN,
        transactionId: "ute-prod-1",
      },
    });
    const result = await executeUnifiedVerifiedTransaction(request);
    // Even if somehow ACTIVE slipped through, persistence maps away under BLOCKED.
    expect(result.productionAuthority).not.toBe("PRODUCTION_AUTHORITY_ACTIVE");
    const persistence = await persistUnifiedTransactionExecution(prisma, { request, result });
    expect(persistence.complete).toBe(true);
    const loaded = await loadPersistedUnifiedExecution(prisma, ORG, persistence.calculationId);
    expect(loaded!.calculation.authorityClass).not.toBe("PRODUCTION_AUTHORITATIVE");
  });

  it("Position/Ask/Simulate handoff traceIds are durable in audit payload", async () => {
    const pkg = pkgOf([ruleOf("rule-surfaces", MONEY(50_000_000))]);
    const request = baseRequest(pkg, "rule-surfaces", {
      transaction: {
        type: "FINANCE_LEASE",
        amount: 500_000,
        currency: "USD",
        date: WHEN,
        transactionId: "ute-surfaces-1",
      },
    });
    const { persistence } = await executeAndPersistUnifiedVerifiedTransaction(prisma, request);
    expect(persistence.handoffs.POSITION.surface).toBe("POSITION");
    expect(persistence.handoffs.ASK.surface).toBe("ASK");
    expect(persistence.handoffs.SIMULATE.surface).toBe("SIMULATE");
    const audit = await prisma.institutionalAuditEvent.findFirst({
      where: {
        companyId: ORG,
        entityType: "UnifiedTransactionExecution",
        entityId: persistence.calculationId,
      },
      orderBy: { occurredAt: "desc" },
    });
    const state = audit!.newState as { handoffTraceIds: Record<string, string> };
    expect(state.handoffTraceIds.POSITION).toBe(persistence.handoffs.POSITION.traceId);
    expect(state.handoffTraceIds.ASK).toBe(persistence.handoffs.ASK.traceId);
    expect(state.handoffTraceIds.SIMULATE).toBe(persistence.handoffs.SIMULATE.traceId);
  });
});
