/**
 * Persisted acceptance: changed APPROVED NS-4 financial snapshot invalidates
 * capacity + simulation inputs across product surfaces (not Dashboard-only).
 *
 * Requires local/disposable DATABASE_URL. Skips (does not fail) when unset.
 * Refuses Neon / AWS RDS hostnames — never write test data to production Neon.
 * Authority remains TEST_ATTRIBUTED_APPROVAL / fixture-labeled.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomBytes } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import type { IRExpression, IRRule } from "@/lib/contract-model/ir/types";
import type {
  VerifiedExecutionPackage,
  VerifiedUnitArtifact,
  HypotheticalTransaction,
  SelectedPath,
} from "@/lib/contract-model/verified-execution";
import type { SemanticVerificationResult } from "@/lib/contract-model/compiler/semantic-verification/types";
import {
  proposeAuthenticCertificateFixtureForCompany,
  approveFceProposedCertificate,
  approveWorkspaceCertificate,
  proposeCertificateRestatement,
  loadApprovedFinancialInputBundle,
  loadAuthoritativeCapacity,
  attemptCertifiedTransaction,
  loadNs4DashboardFinancialState,
  MATTHEWS_FIXTURE_AUTHORITY,
  COHERENT_FIXTURE_AUTHORITY,
} from "@/lib/product/north-star-workflow";

const BASE_URL = process.env.DATABASE_URL ?? "";
const refusesProductionHost = /neon\.tech|amazonaws\.com|supabase\.co/i.test(BASE_URL);
const canRun = Boolean(BASE_URL) && !refusesProductionHost;

const describeIso = canRun ? describe : describe.skip;

const STRONG = { compilerVersion: "ns4-e2e-c1", sourceContentVersion: "ns4-e2e-s1" } as const;
const INSTRUMENT = "company-level";

function verificationResult(): SemanticVerificationResult {
  return {
    candidateRef: "ns4-e2e-cand",
    status: "VERIFIED_NO_MATERIAL_GAP_FOUND",
    findings: [],
    semanticReviewInvoked: false,
    semanticReviewSkippedReason: null,
    conditionSuspicion: null,
    verifierAlgorithmVersion: "ns4-e2e-verifier.v1",
    verifiedAt: "2026-01-01T00:00:00.000Z",
    evidenceSetHash: "ns4-e2e-evidence",
  } as unknown as SemanticVerificationResult;
}

function ebitdaGrowerPackage(companyId: string): VerifiedExecutionPackage {
  let n = 0;
  const nid = () => `ns4-e2e-expr-${++n}`;
  const PCT = (value: number): IRExpression => ({
    kind: "PERCENT",
    type: "PERCENT",
    value,
    exprId: nid(),
  });
  const FIGURE = (metricName: string): IRExpression => ({
    kind: "METRIC_REFERENCE",
    type: "MONEY",
    metricName,
    companyId,
    instrumentKey: INSTRUMENT,
    resolvedDefinitionId: null,
    exprId: nid(),
  });
  const MUL = (...operands: IRExpression[]): IRExpression => ({
    kind: "MULTIPLY",
    type: "MONEY",
    operands,
    exprId: nid(),
  });

  const capacityExpression = MUL(PCT(0.1), FIGURE("Consolidated EBITDA"));
  const rule: IRRule = {
    ruleId: "ns4-e2e-general-debt-basket",
    irSchemaVersion: "ns4-e2e-v1",
    companyId,
    instrumentKey: INSTRUMENT,
    sourceDocumentId: "ns4-e2e-fixture-ca",
    sourceSectionRef: "§e2e-basket",
    covenantFamily: "INDEBTEDNESS",
    ruleType: "QUANTITATIVE_PERMISSION",
    posture: "PERMISSION",
    action: "INCUR_DEBT",
    entityScope: [],
    entityScopeExcluded: [],
    transactionScope: null,
    capacityExpression,
    conditions: [],
    exceptions: [],
    dependsOn: [],
    operativeLineage: null,
    sufficiency: "COMPLETE",
    sufficiencyReasons: ["FIXTURE_IR for NS-4 financial invalidation acceptance"],
    provenance: {
      documentId: "ns4-e2e-fixture-ca",
      sourceNodeKey: null,
      sourceCitation: "cite-ns4-e2e",
      excerpt: "10% of Consolidated EBITDA (fixture IR)",
    },
    ...STRONG,
  };

  const artifact: VerifiedUnitArtifact = {
    ruleOrDefinitionId: rule.ruleId,
    kind: "RULE",
    verifiedIdentity: {
      ruleOrDefinitionId: rule.ruleId,
      companyId,
      instrumentKey: INSTRUMENT,
      compilerVersion: STRONG.compilerVersion,
      sourceContentVersion: STRONG.sourceContentVersion,
      irSchemaVersion: rule.irSchemaVersion,
    },
    result: verificationResult(),
  };

  return {
    companyId,
    instrumentKey: INSTRUMENT,
    rules: [rule],
    definitions: [],
    verifications: [artifact],
  };
}

function capacityStateHash(
  attempt: Awaited<ReturnType<typeof attemptCertifiedTransaction>>,
): string | null {
  if (attempt.capacity?.outcome !== "EXECUTED") return null;
  return attempt.capacity.state.stateHash;
}

function grossAmount(
  attempt: Awaited<ReturnType<typeof attemptCertifiedTransaction>>,
): string | null {
  if (attempt.capacity?.outcome !== "EXECUTED") return null;
  const cap = attempt.capacity.state.capacities.find((c) => c.ruleId === "ns4-e2e-general-debt-basket");
  if (!cap || cap.grossCapacity.kind !== "AMOUNT") return null;
  const v = cap.grossCapacity.value;
  if (v.type !== "MONEY") return null;
  return v.amount;
}

function capacityNodeId(
  attempt: Awaited<ReturnType<typeof attemptCertifiedTransaction>>,
): string | null {
  if (attempt.capacity?.outcome !== "EXECUTED") return null;
  return (
    attempt.capacity.state.capacities.find((c) => c.ruleId === "ns4-e2e-general-debt-basket")
      ?.capacityNodeId ?? null
  );
}

async function teardown(prisma: PrismaClient, companyId: string) {
  await prisma.contractLedgerUsageEvent.deleteMany({ where: { companyId } });
  await prisma.contractLedgerUsage.deleteMany({ where: { companyId } });
  await prisma.contractInputSnapshotEvent.deleteMany({ where: { companyId } });
  await prisma.contractInputFactLocator.deleteMany({
    where: { fact: { snapshot: { companyId } } },
  });
  await prisma.contractInputFact.deleteMany({ where: { snapshot: { companyId } } });
  await prisma.contractInputSnapshot.deleteMany({ where: { companyId } });
  await prisma.company.deleteMany({ where: { id: companyId } });
}

describeIso("NS-4 APPROVED financial change invalidates capacity + simulation", () => {
  const prisma = new PrismaClient();
  const COMPANY = `ns4-cap-sim-${randomBytes(4).toString("hex")}`;
  const EVAL_MAT = "2025-02-01";
  const EVAL_COH = "2026-08-01";

  beforeAll(async () => {
    expect(refusesProductionHost).toBe(false);
    await teardown(prisma, COMPANY);
    await prisma.company.create({
      data: { id: COMPANY, name: "NS4 Cap Sim E2E", tenantKind: "EVALUATION" },
    });
  }, 60_000);

  afterAll(async () => {
    await teardown(prisma, COMPANY);
    await prisma.$disconnect();
  }, 60_000);

  it("preserves fixture authority labels and never claims production approval", () => {
    expect(MATTHEWS_FIXTURE_AUTHORITY.kind).toBe("AUTHENTIC_SOURCE_DERIVED");
    expect(COHERENT_FIXTURE_AUTHORITY.kind).toBe("SEED_ALIGNED_MODELED");
    expect(MATTHEWS_FIXTURE_AUTHORITY.realReviewerApproval).toBe(false);
    expect(COHERENT_FIXTURE_AUTHORITY.realReviewerApproval).toBe(false);
  });

  it("Matthews APPROVED → shared binder + certified capacity; Coherent delivery invalidates fingerprint/capacity/sim", async () => {
    const pkg = ebitdaGrowerPackage(COMPANY);

    const matthewsPropose = await proposeAuthenticCertificateFixtureForCompany(
      COMPANY,
      "matthews_q1_fy2025",
    );
    expect(matthewsPropose.ok).toBe(true);
    expect(matthewsPropose.authoritative).toBe(false);
    expect(matthewsPropose.fixtureAuthority?.kind).toBe("AUTHENTIC_SOURCE_DERIVED");

    const matthewsApprove = await approveFceProposedCertificate({
      companyId: COMPANY,
      snapshotId: matthewsPropose.snapshotId!,
      reviewedBy: "counsel-matthews@test.local",
      approvalRef: "apr-matthews-e2e",
      reviewedAt: `${EVAL_MAT}T12:00:00Z`,
    });
    expect(matthewsApprove.ok).toBe(true);

    const binder1 = await loadApprovedFinancialInputBundle({
      companyId: COMPANY,
      evaluationDate: EVAL_MAT,
    });
    expect(binder1.status).toBe("APPROVED_BOUND");
    expect(binder1.boundSnapshotId).toBe(matthewsPropose.snapshotId);
    expect(binder1.financialInputFingerprint).toBeTruthy();
    expect(binder1.authority.kind).toBe("TEST_ATTRIBUTED_APPROVAL");
    expect(binder1.authority.realReviewerApproval).toBe(false);
    expect(binder1.leverageIr.status).toBe("EXECUTABLE");
    expect(binder1.verifiedCapacity?.capacitySnapshot?.ebitda).toBeCloseTo(128.313, 3);
    expect(binder1.reusableFor).toEqual(
      expect.arrayContaining(["debt_capacity", "transaction_simulation", "dashboard_leverage"]),
    );

    const dash1 = await loadNs4DashboardFinancialState({
      companyId: COMPANY,
      evaluationDate: EVAL_MAT,
    });
    expect(dash1.boundSnapshot?.snapshotId).toBe(binder1.boundSnapshotId);

    const auth1 = await loadAuthoritativeCapacity({
      companyId: COMPANY,
      evaluationDate: EVAL_MAT,
      verifiedPackage: pkg,
    });
    expect(auth1.cutoff.approvedSnapshotId).toBe(binder1.boundSnapshotId);
    expect(auth1.snapshotFactKeys).toEqual(expect.arrayContaining(["Consolidated EBITDA"]));

    const cap1 = await attemptCertifiedTransaction({
      companyId: COMPANY,
      evaluationDate: EVAL_MAT,
      verifiedPackage: pkg,
      utilizationCompleteness: "VERIFIED_EMPTY",
    });
    expect(cap1.approvedSnapshotId).toBe(binder1.boundSnapshotId);
    expect(cap1.capacity?.outcome).toBe("EXECUTED");
    const hash1 = capacityStateHash(cap1);
    const gross1 = grossAmount(cap1);
    const node1 = capacityNodeId(cap1);
    expect(hash1).toBeTruthy();
    expect(gross1).toBeTruthy();
    expect(node1).toBeTruthy();

    const txn1: HypotheticalTransaction = {
      transactionId: "ns4-e2e-txn-1",
      companyId: COMPANY,
      instrumentKey: INSTRUMENT,
      effectiveAsOf: EVAL_MAT,
      effects: [
        {
          effectId: "ns4-e2e-e1",
          kind: "CONSUME_CAPACITY",
          capacityNodeId: node1!,
          amount: { type: "MONEY", amount: "1000000", currency: "USD" },
        },
      ],
      provenance: {
        source: "ns4-e2e-acceptance",
        sourceVersion: "1",
        approvalRef: null,
      },
    };
    const path1: SelectedPath = {
      capacityNodeIds: [node1!],
      ruleIds: ["ns4-e2e-general-debt-basket"],
      sharedCapacityIds: [],
      reclassificationElectionIds: [],
    };
    const sim1 = await attemptCertifiedTransaction({
      companyId: COMPANY,
      evaluationDate: EVAL_MAT,
      verifiedPackage: pkg,
      utilizationCompleteness: "VERIFIED_EMPTY",
      transaction: txn1,
      selectedPath: path1,
    });
    expect(sim1.simulation?.outcome).toBe("EXECUTED");

    // Second issuer certificate — same product path, later delivery, different EBITDA.
    const coherentPropose = await proposeAuthenticCertificateFixtureForCompany(
      COMPANY,
      "coherent_fy2026",
    );
    expect(coherentPropose.ok).toBe(true);
    expect(coherentPropose.fixtureAuthority?.kind).toBe("SEED_ALIGNED_MODELED");
    const coherentApprove = await approveFceProposedCertificate({
      companyId: COMPANY,
      snapshotId: coherentPropose.snapshotId!,
      reviewedBy: "counsel-coherent@test.local",
      approvalRef: "apr-coherent-e2e",
      reviewedAt: `${EVAL_COH}T12:00:00Z`,
    });
    expect(coherentApprove.ok).toBe(true);

    const binder2 = await loadApprovedFinancialInputBundle({
      companyId: COMPANY,
      evaluationDate: EVAL_COH,
    });
    expect(binder2.status).toBe("APPROVED_BOUND");
    expect(binder2.boundSnapshotId).toBe(coherentPropose.snapshotId);
    expect(binder2.boundSnapshotId).not.toBe(binder1.boundSnapshotId);
    expect(binder2.financialInputFingerprint).not.toBe(binder1.financialInputFingerprint);
    expect(binder2.verifiedCapacity?.capacitySnapshot?.ebitda).toBeCloseTo(1700, 3);
    expect(binder2.verifiedCapacity?.capacitySnapshot?.ebitda).not.toBe(
      binder1.verifiedCapacity?.capacitySnapshot?.ebitda,
    );

    const cap2 = await attemptCertifiedTransaction({
      companyId: COMPANY,
      evaluationDate: EVAL_COH,
      verifiedPackage: pkg,
      utilizationCompleteness: "VERIFIED_EMPTY",
    });
    expect(cap2.approvedSnapshotId).toBe(binder2.boundSnapshotId);
    expect(cap2.capacity?.outcome).toBe("EXECUTED");
    const hash2 = capacityStateHash(cap2);
    const gross2 = grossAmount(cap2);
    const node2 = capacityNodeId(cap2);
    expect(hash2).toBeTruthy();
    expect(gross2).toBeTruthy();
    expect(hash2).not.toBe(hash1);
    expect(gross2).not.toBe(gross1);

    const txn2: HypotheticalTransaction = {
      ...txn1,
      transactionId: "ns4-e2e-txn-2",
      effectiveAsOf: EVAL_COH,
      effects: [
        {
          effectId: "ns4-e2e-e2",
          kind: "CONSUME_CAPACITY",
          capacityNodeId: node2!,
          amount: { type: "MONEY", amount: "1000000", currency: "USD" },
        },
      ],
    };
    const path2: SelectedPath = {
      capacityNodeIds: [node2!],
      ruleIds: ["ns4-e2e-general-debt-basket"],
      sharedCapacityIds: [],
      reclassificationElectionIds: [],
    };
    const sim2 = await attemptCertifiedTransaction({
      companyId: COMPANY,
      evaluationDate: EVAL_COH,
      verifiedPackage: pkg,
      utilizationCompleteness: "VERIFIED_EMPTY",
      transaction: txn2,
      selectedPath: path2,
    });
    expect(sim2.simulation?.outcome).toBe("EXECUTED");
    if (sim1.simulation?.outcome === "EXECUTED" && sim2.simulation?.outcome === "EXECUTED") {
      expect(sim2.simulation.capacity.stateHash).not.toBe(sim1.simulation.capacity.stateHash);
    }

    // Prior Matthews evaluation date still binds Matthews — no silent latest-quarter collapse.
    const binderMatthewsStill = await loadApprovedFinancialInputBundle({
      companyId: COMPANY,
      evaluationDate: EVAL_MAT,
    });
    expect(binderMatthewsStill.boundSnapshotId).toBe(matthewsPropose.snapshotId);

    // DRAFT restatement must not alter currently approved Coherent binding.
    const restatement = await proposeCertificateRestatement({
      companyId: COMPANY,
      predecessorSnapshotId: coherentPropose.snapshotId!,
      reviewedByNote: "draft correction — must not invalidate until approved",
      // Delivery after Coherent (2026-07-20) and on/before EVAL_COH (2026-08-01).
      deliveredAtIsoDate: "2026-07-28",
    });
    expect(restatement.ok).toBe(true);
    expect(restatement.status).toBe("DRAFT");
    const binderWhileDraft = await loadApprovedFinancialInputBundle({
      companyId: COMPANY,
      evaluationDate: EVAL_COH,
    });
    expect(binderWhileDraft.boundSnapshotId).toBe(coherentPropose.snapshotId);
    expect(binderWhileDraft.financialInputFingerprint).toBe(binder2.financialInputFingerprint);

    // Approving restatement supersedes predecessor and invalidates fingerprint.
    const restatementApprove = await approveWorkspaceCertificate({
      companyId: COMPANY,
      snapshotId: restatement.snapshotId,
      reviewedBy: "counsel-restatement@test.local",
      approvalRef: "apr-restatement-e2e",
      reviewedAt: `${EVAL_COH}T18:00:00Z`,
    });
    expect(restatementApprove.ok).toBe(true);
    const binderAfterRestatement = await loadApprovedFinancialInputBundle({
      companyId: COMPANY,
      evaluationDate: EVAL_COH,
    });
    expect(binderAfterRestatement.boundSnapshotId).toBe(restatement.snapshotId);
    expect(binderAfterRestatement.boundSnapshotId).not.toBe(coherentPropose.snapshotId);
    expect(binderAfterRestatement.financialInputFingerprint).not.toBe(
      binder2.financialInputFingerprint,
    );
  });
});

describe("NS-4 capacity-sim e2e production-host guard", () => {
  it("skips write suite when DATABASE_URL points at Neon/RDS (structural)", () => {
    if (!BASE_URL) {
      expect(canRun).toBe(false);
      return;
    }
    if (refusesProductionHost) {
      expect(canRun).toBe(false);
    } else {
      expect(canRun).toBe(true);
    }
  });
});
