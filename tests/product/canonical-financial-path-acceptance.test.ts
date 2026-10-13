/**
 * Isolated DB-backed acceptance: APPROVED NS-4 components → contractual EBITDA
 * → ratio; same identity → Simulate handoff; snapshot supersession invalidates;
 * unresolved conditional refuses; Coherent + Matthews share one implementation.
 *
 * SYNTHETIC_LABELED facts — not production Neon writes.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
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
  snapshotInvalidatesPriorResults,
  calculateContractualLeverage,
} from "@/lib/product/contractual-leverage";
import {
  buildFinancialInformationRequest,
} from "@/lib/contract-model/runtime/input/information-request";
import { BOOL, IF, METRIC, resetIds } from "../contract-model/runtime/helpers";
import { identity, input, money, snapshot } from "../contract-model/runtime/input/helpers";
import { beforeEach } from "vitest";

const describeDb = process.env.DATABASE_URL ? describe : describe.skip;
const CO = "afc-canonical-path-co";
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

/** Convert $M fixture → full USD string for certificate facts. */
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
    note: "SYNTHETIC — Coherent component pack for canonical path acceptance",
    facts,
    basketUsageLines: [],
  };
}

function matthewsComponentCert(snapshotId: string): SyntheticCertificate {
  const facts: CertificateFactProposal[] = [
    ...Object.entries(MATTHEWS_EBITDA_COMPONENTS).map(([k, v]) => moneyFact(k, mToDollars(v as number))),
    moneyFact("Secured Debt", mToDollars(778.882)),
    moneyFact("Cash", mToDollars(33.513)),
  ];
  return {
    documentId: `synth-afc-matthews-${snapshotId}`,
    versionHash: `sha256:afc-matthews-${snapshotId}`,
    companyId: CO,
    reportingPeriod: PERIOD,
    asOf: AS_OF,
    layoutId: "afc-canonical-matthews",
    proposer: { kind: "human", id: "afc-tester", note: "SYNTHETIC_LABELED acceptance" },
    proposalStatus: "DRAFT",
    snapshotId,
    version: "1",
    supersedesSnapshotId: null,
    note: "SYNTHETIC — Matthews component pack for canonical path acceptance",
    facts,
    basketUsageLines: [],
  };
}

describeDb("canonical financial path — isolated DB acceptance", () => {
  const prisma = new PrismaClient();

  beforeAll(async () => {
    await teardown(prisma, CO);
    await prisma.company.create({
      data: { id: CO, name: "AFC Canonical Path Co", tenantKind: "EVALUATION" },
    });
  }, 60_000);

  afterAll(async () => {
    await teardown(prisma, CO);
    await prisma.$disconnect();
  }, 60_000);

  it("1+2+5: APPROVED Coherent components → EBITDA → ratio; same identity → Simulate", async () => {
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
    expect(snaps.some((s) => s.snapshotId === snapId && s.status === "APPROVED")).toBe(true);

    const req = {
      ...coherentEbitdaBuildupLeverageRequest(
        {},
        { ebitda: null, totalDebt: null, securedDebt: null, cash: null },
      ),
      companyId: CO,
      instrumentKey: INST,
    };

    const path = runCanonicalContractualFinancialPath({
      request: req,
      snapshots: snaps,
      identity: { companyId: CO, instrumentKey: INST, snapshotId: snapId },
      amountUnit: "USD",
      debtCashKeys: { totalDebt: "Total Debt", cash: "Cash" },
      simulateDraft: { action: "debt", amountMillions: 100, secured: false },
    });

    expect(path.bindStatus).toBe("BOUND");
    expect(path.leverage.status).toBe("COMPUTED");
    expect(path.leverage.derivedEbitdaMillions).toBeCloseTo(1700, 4);
    expect(path.leverage.currentRatio).toBeCloseTo((3258 - 1162) / 1700, 6);
    expect(path.leverage.debtHeadroomIsVerifiedCapacity).toBe(false);
    expect(path.grossVersusVerified.debtHeadroomIsVerifiedCapacity).toBe(false);
    expect(path.financialIdentity.snapshotIds).toContain(snapId);
    expect(path.financialIdentity.approvalRefs).toContain("apr-afc-coherent-1");
    expect(path.simulateHref).toContain(`/${CO}/simulate`);
    expect(path.simulateHref).toContain("action=debt");
    expect(path.simulateHref).toContain("amount=100");

    // Same implementation for Matthews shape (in-memory APPROVED pack — same binder).
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
    const mSnap = snapshot({
      snapshotId: "snap-matthews-mem",
      companyId: CO,
      inputs: mFacts,
      review: { reviewedBy: "afc-counsel", reviewedAt: "2026-07-15T12:00:00Z", approvalRef: "apr-matthews-mem" },
    });
    const mReq = {
      ...matthewsEbitdaBuildupLeverageRequest(
        {},
        { ebitda: null, totalDebt: null, securedDebt: null, cash: null },
      ),
      companyId: CO,
      instrumentKey: INST,
    };
    const mPath = runCanonicalContractualFinancialPath({
      request: mReq,
      snapshots: [mSnap],
      identity: { companyId: CO, instrumentKey: INST, snapshotId: "snap-matthews-mem" },
      amountUnit: "USD",
      debtCashKeys: { securedDebt: "Secured Debt", cash: "Cash" },
    });
    expect(mPath.leverage.status).toBe("COMPUTED");
    expect(mPath.leverage.derivedEbitdaMillions).toBeCloseTo(128.313, 3);
    expect(mPath.leverage.currentRatio).toBeCloseTo((778.882 - 33.513) / 128.313, 5);
  }, 60_000);

  it("3: new APPROVED snapshot superseding prior → invalidation + recomputation", async () => {
    const v1 = `snap-${CO}-super-v1`;
    const v2 = `snap-${CO}-super-v2`;
    const store = await PrismaApprovedSnapshotStore.open(prisma, CO);

    const p1 = await proposeFromCertificateAsync(
      store,
      {
        ...coherentComponentCert(v1),
        snapshotId: v1,
        documentId: `doc-${v1}`,
        versionHash: `sha256:${v1}`,
      },
      new LedgerProposalRecorder(),
    );
    expect(p1.ok).toBe(true);
    await approveCertificateProposalAsync(store, {
      snapshotId: v1,
      reviewedBy: "afc-counsel",
      reviewedAt: "2026-07-16T12:00:00Z",
      approvalRef: "apr-super-1",
    });

    const snapsV1 = await loadApprovedSnapshotsFromPrisma(prisma, CO);
    const first = runCanonicalContractualFinancialPath({
      request: {
        ...coherentEbitdaBuildupLeverageRequest({}, { ebitda: null, totalDebt: null, securedDebt: null, cash: null }),
        companyId: CO,
        instrumentKey: INST,
      },
      snapshots: snapsV1,
      identity: { companyId: CO, instrumentKey: INST, snapshotId: v1 },
      amountUnit: "USD",
      debtCashKeys: { totalDebt: "Total Debt", cash: "Cash" },
    });
    expect(first.leverage.status).toBe("COMPUTED");
    const priorRatio = first.leverage.currentRatio!;
    const priorIds = first.contributingSnapshotIds;

    // Restate with higher cash → lower net leverage; supersedes v1.
    const restatedFacts = coherentComponentCert(v2).facts.map((f) =>
      f.key === "Cash" ? { ...f, value: { type: "MONEY" as const, amount: mToDollars(2000), currency: "USD" } } : f,
    );
    const p2 = await proposeFromCertificateAsync(
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
    expect(p2.ok).toBe(true);
    await approveCertificateProposalAsync(store, {
      snapshotId: v2,
      reviewedBy: "afc-counsel",
      reviewedAt: "2026-07-17T12:00:00Z",
      approvalRef: "apr-super-2",
    });

    const snapsV2 = await loadApprovedSnapshotsFromPrisma(prisma, CO);
    const invalidation = snapshotInvalidatesPriorResults({
      priorContributingSnapshotIds: priorIds,
      snapshots: snapsV2,
    });
    expect(invalidation.invalidated).toBe(true);
    expect(invalidation.supersededIds).toContain(v1);

    const second = runCanonicalContractualFinancialPath({
      request: {
        ...coherentEbitdaBuildupLeverageRequest({}, { ebitda: null, totalDebt: null, securedDebt: null, cash: null }),
        companyId: CO,
        instrumentKey: INST,
      },
      snapshots: snapsV2,
      identity: { companyId: CO, instrumentKey: INST, snapshotId: v2 },
      amountUnit: "USD",
      debtCashKeys: { totalDebt: "Total Debt", cash: "Cash" },
    });
    expect(second.leverage.status).toBe("COMPUTED");
    expect(second.leverage.currentRatio!).toBeLessThan(priorRatio);
    expect(second.leverage.currentRatio).toBeCloseTo((3258 - 2000) / 1700, 6);
  }, 60_000);

  it("4: unresolved conditional component → refusal unless proven irrelevant", () => {
    const expr = IF(BOOL(true), METRIC("Restructuring Integration Transaction Costs"), METRIC("Alt Addback"));
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
    });
    expect(refused.executable).toBe(false);
    expect(refused.blocking.some((b) => b.dependency.key === "Alt Addback")).toBe(true);

    const cleared = buildFinancialInformationRequest({
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
            proof: "BOOL(true) selects then-branch; Alt Addback is else-branch only.",
          },
        ],
      },
    });
    expect(cleared.executable).toBe(true);
    expect(cleared.executionMode).toBe("EXACT");
  });

  it("does not promote modeled / DRAFT evidence to APPROVED components", async () => {
    const draftId = `snap-${CO}-draft-only`;
    const store = await PrismaApprovedSnapshotStore.open(prisma, CO);
    const proposed = await proposeFromCertificateAsync(
      store,
      {
        ...coherentComponentCert(draftId),
        snapshotId: draftId,
        documentId: `doc-${draftId}`,
        versionHash: `sha256:${draftId}`,
      },
      new LedgerProposalRecorder(),
    );
    expect(proposed.ok).toBe(true);
    // Intentionally NOT approved.
    const snaps = await loadApprovedSnapshotsFromPrisma(prisma, CO);
    expect(snaps.some((s) => s.snapshotId === draftId)).toBe(false);

    const path = runCanonicalContractualFinancialPath({
      request: {
        ...coherentEbitdaBuildupLeverageRequest({}, { ebitda: null, totalDebt: null, securedDebt: null, cash: null }),
        companyId: CO,
        instrumentKey: INST,
      },
      snapshots: snaps.filter((s) => s.snapshotId === draftId),
      identity: { companyId: CO, instrumentKey: INST, snapshotId: draftId },
      amountUnit: "USD",
      debtCashKeys: { totalDebt: "Total Debt", cash: "Cash" },
    });
    expect(path.leverage.status).not.toBe("COMPUTED");
    expect(path.bindStatus).toBe("INCOMPLETE");
  }, 60_000);
});

describe("canonical path pure (no DB) — Coherent vs Matthews same API", () => {
  it("fixtures still compute through calculateContractualLeverage", () => {
    const c = calculateContractualLeverage(coherentEbitdaBuildupLeverageRequest());
    const m = calculateContractualLeverage(matthewsEbitdaBuildupLeverageRequest());
    expect(c.status).toBe("COMPUTED");
    expect(m.status).toBe("COMPUTED");
    expect(c.derivedEbitdaMillions).toBeCloseTo(1700, 6);
    expect(m.derivedEbitdaMillions).toBeCloseTo(128.313, 6);
    expect(c.debtHeadroomIsVerifiedCapacity).toBe(false);
    expect(m.debtHeadroomIsVerifiedCapacity).toBe(false);
  });
});
