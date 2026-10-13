/**
 * Isolated DB acceptance on post-#333 main tip:
 * APPROVED NS-4 → EBITDA → ratio; verified Simulate execution (not href-only);
 * supersession invalidates leverage AND simulate artifacts; PATH_IRRELEVANT
 * requires sealed authority; Coherent + Matthews same implementation.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import {
  loadApprovedSnapshotsFromPrisma,
  PrismaApprovedSnapshotStore,
  proposeFromCertificateAsync,
  approveCertificateProposalAsync,
  LedgerProposalRecorder,
  type SyntheticCertificate,
  type CertificateFactProposal,
} from "@/lib/contract-model/north-star-bridge";
import {
  coherentEbitdaBuildupLeverageRequest,
  matthewsEbitdaBuildupLeverageRequest,
  COHERENT_EBITDA_COMPONENTS,
  MATTHEWS_EBITDA_COMPONENTS,
  runCanonicalContractualFinancialPath,
  executeCanonicalPathWithVerifiedSimulate,
  invalidateAndRecomputeAfterSupersession,
  calculateContractualLeverage,
} from "@/lib/product/contractual-leverage";
import {
  buildFinancialInformationRequest,
  selectConditionalPaths,
} from "@/lib/contract-model/runtime/input/information-request";
import { withExpressionId } from "@/lib/contract-model/ir/identity";
import { BOOL, resetIds } from "../contract-model/runtime/helpers";
import { identity, input, money, snapshot } from "../contract-model/runtime/input/helpers";

const describeDb = process.env.DATABASE_URL ? describe : describe.skip;
const CO = "afc-absorb322-canonical-co";
const INST = "afc-canonical-ca";
const PERIOD = "FY2026-Q2";
const AS_OF = "2026-06-30";

beforeEach(resetIds);

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

function moneyFact(key: string, dollars: string): CertificateFactProposal {
  return {
    companyId: CO,
    scope: { kind: "INSTRUMENT_LEVEL", instrumentKey: INST },
    inputKind: "METRIC",
    key,
    identityStrength: "CONTRACT_NAME_ONLY",
    period: { kind: "NOT_PERIOD_SPECIFIC" },
    asOf: { kind: "NOT_AS_OF_SPECIFIC" },
    valueType: "MONEY",
    currency: "USD",
    value: { type: "MONEY", amount: dollars, currency: "USD" },
    locator: { page: 1, section: "Financials", table: "Components", row: key },
    displayName: key,
  };
}

function mToDollars(millions: number): string {
  return String(Math.round(millions * 1_000_000));
}

function coherentComponentCert(snapshotId: string): SyntheticCertificate {
  const facts: CertificateFactProposal[] = [
    ...Object.entries(COHERENT_EBITDA_COMPONENTS).map(([k, v]) => moneyFact(k, mToDollars(v as number))),
    moneyFact("Total Debt", mToDollars(3258)),
    moneyFact("Cash", mToDollars(1162)),
  ];
  return {
    documentId: `synth-afc-coherent-${snapshotId}`,
    versionHash: `sha256:afc-coherent-${snapshotId}`,
    companyId: CO,
    reportingPeriod: PERIOD,
    asOf: AS_OF,
    layoutId: "afc-canonical-coherent",
    proposer: { kind: "human", id: "afc-tester", note: "SYNTHETIC_LABELED acceptance" },
    proposalStatus: "DRAFT",
    snapshotId,
    version: "1",
    supersedesSnapshotId: null,
    note: "SYNTHETIC — Coherent component pack",
    facts,
    basketUsageLines: [],
  };
}

describeDb("canonical absorb #322 — isolated DB acceptance", () => {
  const prisma = new PrismaClient();

  beforeAll(async () => {
    await teardown(prisma, CO);
    await prisma.company.create({
      data: { id: CO, name: "AFC Absorb 322 Co", tenantKind: "EVALUATION" },
    });
  }, 60_000);

  afterAll(async () => {
    await teardown(prisma, CO);
    await prisma.$disconnect();
  }, 60_000);

  it("1+2+5: APPROVED components → EBITDA → ratio; verified Simulate attempt (href ≠ proof)", async () => {
    const snapId = `snap-${CO}-coherent-v1`;
    const store = await PrismaApprovedSnapshotStore.open(prisma, CO);
    const proposed = await proposeFromCertificateAsync(
      store,
      coherentComponentCert(snapId),
      new LedgerProposalRecorder(),
    );
    expect(proposed.ok).toBe(true);
    const approved = await approveCertificateProposalAsync(store, {
      snapshotId: snapId,
      reviewedBy: "afc-counsel",
      reviewedAt: "2026-07-15T12:00:00Z",
      approvalRef: "apr-afc-coherent-1",
    });
    expect(approved.ok).toBe(true);

    const snaps = await loadApprovedSnapshotsFromPrisma(prisma, CO);
    const req = {
      ...coherentEbitdaBuildupLeverageRequest(
        {},
        { ebitda: null, totalDebt: null, securedDebt: null, cash: null },
      ),
      companyId: CO,
      instrumentKey: INST,
    };

    const bound = await executeCanonicalPathWithVerifiedSimulate({
      request: req,
      snapshots: snaps,
      identity: { companyId: CO, instrumentKey: INST, snapshotId: snapId, asOfIsoDate: AS_OF },
      amountUnit: "USD",
      debtCashKeys: { totalDebt: "Total Debt", cash: "Cash" },
      simulate: {
        kind: "UNSECURED_DEBT",
        amountMillions: 100,
        secured: false,
        runVerifiedSimulate: true,
      },
    });

    expect(bound.financialPath.leverage.status).toBe("COMPUTED");
    expect(bound.financialPath.leverage.derivedEbitdaMillions).toBeCloseTo(1700, 4);
    expect(bound.financialPath.leverage.currentRatio).toBeCloseTo((3258 - 1162) / 1700, 6);
    expect(bound.financialPath.leverage.debtHeadroomIsVerifiedCapacity).toBe(false);
    expect(bound.grossVersusVerified.simulateHrefIsNotExecutionProof).toBe(true);
    expect(bound.simulateHref).toContain(`/${CO}/simulate`);
    // Actual execution attempt object present (may refuse on missing VEP — still not href-only).
    expect(bound.verifiedSimulate).not.toBeNull();
    expect(bound.verifiedSimulate!.certified).toBeDefined();
    expect(Array.isArray(bound.verifiedSimulate!.refusalSummary)).toBe(true);
    expect(bound.boundIdentity.snapshotIds).toContain(snapId);

    // Matthews via same binder (in-memory APPROVED).
    const mFacts = [
      ...Object.entries(MATTHEWS_EBITDA_COMPONENTS).map(([k, v]) =>
        input({
          identity: identity({
            key: k,
            companyId: CO,
            scope: { kind: "INSTRUMENT_LEVEL", instrumentKey: INST },
          }),
          value: money(mToDollars(v as number)),
        }),
      ),
      input({
        identity: identity({
          key: "Secured Debt",
          companyId: CO,
          scope: { kind: "INSTRUMENT_LEVEL", instrumentKey: INST },
        }),
        value: money(mToDollars(778.882)),
      }),
      input({
        identity: identity({
          key: "Cash",
          companyId: CO,
          scope: { kind: "INSTRUMENT_LEVEL", instrumentKey: INST },
        }),
        value: money(mToDollars(33.513)),
      }),
    ];
    const mPath = runCanonicalContractualFinancialPath({
      request: {
        ...matthewsEbitdaBuildupLeverageRequest(
          {},
          { ebitda: null, totalDebt: null, securedDebt: null, cash: null },
        ),
        companyId: CO,
        instrumentKey: INST,
      },
      snapshots: [
        snapshot({
          snapshotId: "snap-matthews-mem",
          companyId: CO,
          inputs: mFacts,
          review: {
            reviewedBy: "afc-counsel",
            reviewedAt: "2026-07-15T12:00:00Z",
            approvalRef: "apr-matthews-mem",
          },
        }),
      ],
      identity: { companyId: CO, instrumentKey: INST, snapshotId: "snap-matthews-mem" },
      amountUnit: "USD",
      debtCashKeys: { securedDebt: "Secured Debt", cash: "Cash" },
    });
    expect(mPath.leverage.status).toBe("COMPUTED");
    expect(mPath.leverage.derivedEbitdaMillions).toBeCloseTo(128.313, 3);
  }, 90_000);

  it("3+6: supersession invalidates leverage AND prior simulate artifacts", async () => {
    const v1 = `snap-${CO}-super-v1`;
    const v2 = `snap-${CO}-super-v2`;
    const store = await PrismaApprovedSnapshotStore.open(prisma, CO);

    await proposeFromCertificateAsync(
      store,
      { ...coherentComponentCert(v1), snapshotId: v1, documentId: `doc-${v1}`, versionHash: `sha256:${v1}` },
      new LedgerProposalRecorder(),
    );
    await approveCertificateProposalAsync(store, {
      snapshotId: v1,
      reviewedBy: "afc-counsel",
      reviewedAt: "2026-07-16T12:00:00Z",
      approvalRef: "apr-super-1",
    });

    const snapsV1 = await loadApprovedSnapshotsFromPrisma(prisma, CO);
    const first = await executeCanonicalPathWithVerifiedSimulate({
      request: {
        ...coherentEbitdaBuildupLeverageRequest({}, { ebitda: null, totalDebt: null, securedDebt: null, cash: null }),
        companyId: CO,
        instrumentKey: INST,
      },
      snapshots: snapsV1,
      identity: { companyId: CO, instrumentKey: INST, snapshotId: v1, asOfIsoDate: AS_OF },
      amountUnit: "USD",
      debtCashKeys: { totalDebt: "Total Debt", cash: "Cash" },
      simulate: { kind: "UNSECURED_DEBT", amountMillions: 50, runVerifiedSimulate: true },
    });
    expect(first.financialPath.leverage.status).toBe("COMPUTED");
    const priorRatio = first.financialPath.leverage.currentRatio!;
    const priorArtifact = {
      contributingSnapshotIds: first.boundIdentity.snapshotIds,
      simulateArtifactId: `sim:${v1}:${first.verifiedSimulate?.selectedPathId ?? "none"}`,
      evaluationDate: first.boundIdentity.asOf ?? AS_OF,
      executable: first.verifiedSimulate?.executable ?? false,
    };

    const restatedFacts = coherentComponentCert(v2).facts.map((f) =>
      f.key === "Cash" ? { ...f, value: { type: "MONEY" as const, amount: mToDollars(2000), currency: "USD" } } : f,
    );
    await proposeFromCertificateAsync(
      store,
      {
        ...coherentComponentCert(v2),
        snapshotId: v2,
        documentId: `doc-${v2}`,
        versionHash: `sha256:${v2}`,
        supersedesSnapshotId: v1,
        facts: restatedFacts,
      },
      new LedgerProposalRecorder(),
    );
    await approveCertificateProposalAsync(store, {
      snapshotId: v2,
      reviewedBy: "afc-counsel",
      reviewedAt: "2026-07-17T12:00:00Z",
      approvalRef: "apr-super-2",
    });

    const snapsV2 = await loadApprovedSnapshotsFromPrisma(prisma, CO);
    const inv = await invalidateAndRecomputeAfterSupersession({
      prior: priorArtifact,
      snapshots: snapsV2,
      recompute: {
        request: {
          ...coherentEbitdaBuildupLeverageRequest({}, { ebitda: null, totalDebt: null, securedDebt: null, cash: null }),
          companyId: CO,
          instrumentKey: INST,
        },
        snapshots: snapsV2,
        identity: { companyId: CO, instrumentKey: INST, snapshotId: v2, asOfIsoDate: AS_OF },
        amountUnit: "USD",
        debtCashKeys: { totalDebt: "Total Debt", cash: "Cash" },
        simulate: { kind: "UNSECURED_DEBT", amountMillions: 50, runVerifiedSimulate: true },
      },
    });
    expect(inv.leverageInvalidated).toBe(true);
    expect(inv.simulateInvalidated).toBe(true);
    expect(inv.invalidatedSimulateArtifactIds).toContain(priorArtifact.simulateArtifactId);
    expect(inv.recomputed!.financialPath.leverage.currentRatio!).toBeLessThan(priorRatio);
    expect(inv.recomputed!.financialPath.leverage.currentRatio).toBeCloseTo((3258 - 2000) / 1700, 6);
    expect(inv.recomputed!.verifiedSimulate).not.toBeNull();
  }, 90_000);

  it("4: unresolved conditional refuses; sealed authority clears inactive only", () => {
    const expr = withExpressionId({
      kind: "IF",
      type: "MONEY",
      condition: withExpressionId(BOOL(true)),
      then: withExpressionId({
        kind: "METRIC_REFERENCE",
        type: "MONEY",
        metricName: "Restructuring Integration Transaction Costs",
        companyId: "co",
        instrumentKey: "inst",
        resolvedDefinitionId: null,
      }),
      else: withExpressionId({
        kind: "METRIC_REFERENCE",
        type: "MONEY",
        metricName: "Alt Addback",
        companyId: "co",
        instrumentKey: "inst",
        resolvedDefinitionId: null,
      }),
    });
    const snap = snapshot({
      snapshotId: "cond-only-then",
      companyId: "co",
      inputs: [
        input({
          identity: identity({
            key: "Restructuring Integration Transaction Costs",
            companyId: "co",
            scope: { kind: "INSTRUMENT_LEVEL", instrumentKey: "inst" },
          }),
          value: money("200000000"),
        }),
      ],
    });
    const refused = buildFinancialInformationRequest({
      expression: expr,
      snapshots: [snap],
      companyId: "co",
      instrumentKey: "inst",
      policy: {
        conditionalDispositions: [
          {
            dependencyKey: "Alt Addback",
            kind: "PATH_IRRELEVANT",
            branchLabel: "else-branch",
            proof: "fabricated without authority",
          },
        ],
      },
    });
    expect(refused.executable).toBe(false);

    const auth = selectConditionalPaths({
      expression: expr,
      snapshots: [snap],
      companyId: "co",
      instrumentKey: "inst",
    });
    expect(auth.ok).toBe(true);
    if (!auth.ok) return;
    const cleared = buildFinancialInformationRequest({
      expression: expr,
      snapshots: [snap],
      companyId: "co",
      instrumentKey: "inst",
      policy: {
        selectedPathAuthority: auth.authority,
        conditionalDispositions: [
          {
            dependencyKey: "Alt Addback",
            kind: "PATH_IRRELEVANT",
            branchLabel: "else-branch",
            proof: "Condition true; else inactive per sealed authority.",
          },
        ],
      },
    });
    expect(cleared.executable).toBe(true);
    expect(cleared.executionMode).toBe("EXACT");
  });
});

describe("canonical path pure — Coherent vs Matthews", () => {
  it("fixtures compute through calculateContractualLeverage", () => {
    const c = calculateContractualLeverage(coherentEbitdaBuildupLeverageRequest());
    const m = calculateContractualLeverage(matthewsEbitdaBuildupLeverageRequest());
    expect(c.status).toBe("COMPUTED");
    expect(m.status).toBe("COMPUTED");
    expect(c.debtHeadroomIsVerifiedCapacity).toBe(false);
    expect(m.debtHeadroomIsVerifiedCapacity).toBe(false);
  });
});
