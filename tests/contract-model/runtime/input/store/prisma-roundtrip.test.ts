/**
 * NS-4 — durable Prisma store round-trip against live Postgres (DATABASE_URL):
 * certificate propose → attributable approve → reload events → materialization loader → 4B resolve.
 *
 * Uses uniquely-prefixed synthetic company ids and tears down only those rows.
 * Skips when DATABASE_URL is unset. Does not use createdb (Neon-compatible).
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import {
  LedgerProposalRecorder,
  PrismaApprovedSnapshotStore,
  approveCertificateProposalAsync,
  loadApprovedSnapshotsFromPrisma,
  proposeFromCertificateAsync,
} from "@/lib/contract-model/runtime/input/store";
import { CONMED_FORM_INSPIRED_CERT } from "@/lib/contract-model/runtime/input/store/certificate/fixtures";
import { resolveInput } from "@/lib/contract-model/runtime/input/resolve";
import { toCanonicalString } from "@/lib/contract-model/runtime/decimal";
import type { SyntheticCertificate } from "@/lib/contract-model/runtime/input/store";

const BASE_URL = process.env.DATABASE_URL;
const describeDb = BASE_URL ? describe : describe.skip;

const CO = "ns4-persist-test-co";
const SNAP = "ns4-persist-test-snap-q2";
const SNAP_NO_ATTR = "ns4-persist-test-snap-no-attr";

function certFor(overrides: Partial<SyntheticCertificate> & { snapshotId: string }): SyntheticCertificate {
  return {
    ...CONMED_FORM_INSPIRED_CERT,
    companyId: CO,
    facts: CONMED_FORM_INSPIRED_CERT.facts.map((f) => ({ ...f, companyId: CO })),
    documentId: `synth-cert-${overrides.snapshotId}`,
    versionHash: `sha256:${overrides.snapshotId}`,
    ...overrides,
  };
}

async function teardown(prisma: PrismaClient) {
  // Events first (FK to snapshots is SET NULL, but clear explicitly).
  await prisma.contractInputSnapshotEvent.deleteMany({ where: { companyId: CO } });
  await prisma.contractInputFactLocator.deleteMany({
    where: { fact: { snapshot: { companyId: CO } } },
  });
  await prisma.contractInputFact.deleteMany({ where: { snapshot: { companyId: CO } } });
  await prisma.contractInputSnapshot.deleteMany({ where: { companyId: CO } });
}

describeDb("NS-4 PrismaApprovedSnapshotStore round-trip", () => {
  const prisma = new PrismaClient();

  beforeAll(async () => {
    await teardown(prisma);
  }, 60_000);

  afterAll(async () => {
    await teardown(prisma);
    await prisma.$disconnect();
  }, 60_000);

  it("propose → approve → reopen → loadApprovedSnapshotsFromPrisma → 4B resolve", async () => {
    const cert = certFor({ snapshotId: SNAP });
    const store = await PrismaApprovedSnapshotStore.open(prisma, CO);
    const ledger = new LedgerProposalRecorder();

    const proposed = await proposeFromCertificateAsync(store, cert, ledger);
    expect(proposed.ok).toBe(true);
    if (!proposed.ok) return;

    expect(store.getSnapshot(SNAP)!.status).toBe("DRAFT");
    expect(ledger.count()).toBe(1);
    expect(await loadApprovedSnapshotsFromPrisma(prisma, CO)).toHaveLength(0);

    const approved = await approveCertificateProposalAsync(store, {
      snapshotId: SNAP,
      reviewedBy: "alice-ns4-persist",
      reviewedAt: "2026-10-09T12:00:00Z",
      approvalRef: "apr-ns4-prisma-1",
      sourceDocumentId: cert.documentId,
      sourceVersionHash: cert.versionHash,
      proposerKind: "human",
    });
    expect(approved.ok).toBe(true);

    const reopened = await PrismaApprovedSnapshotStore.open(prisma, CO);
    expect(reopened.eventCount()).toBeGreaterThanOrEqual(2);
    const fromEvents = reopened.getSnapshot(SNAP)!;
    expect(fromEvents.status).toBe("APPROVED");
    expect(fromEvents.review.reviewedBy).toBe("alice-ns4-persist");
    expect(fromEvents.review.approvalRef).toContain("apr-ns4-prisma-1");

    const fromTables = await loadApprovedSnapshotsFromPrisma(prisma, CO);
    expect(fromTables.map((s) => s.snapshotId)).toContain(SNAP);
    const snap = fromTables.find((s) => s.snapshotId === SNAP)!;
    expect(snap.status).toBe("APPROVED");

    const ebitdaFact = snap.inputs.find((i) => i.identity.key === "Consolidated EBITDA")!;
    expect(ebitdaFact.value.type).toBe("MONEY");
    if (ebitdaFact.value.type === "MONEY") {
      expect(toCanonicalString(ebitdaFact.value.amount)).toBe("125000000");
      expect(ebitdaFact.value.currency).toBe("USD");
    }

    const resolved = resolveInput({
      query: {
        companyId: CO,
        instrumentKey: "synthetic-term-loan-a",
        inputKind: "METRIC",
        key: "Consolidated EBITDA",
        period: { kind: "VERBATIM_CONTRACT_PERIOD_KEY", key: "FY2026-Q2" },
        asOf: { kind: "EXACT_DATE", isoDate: "2026-06-30" },
        expectedType: "MONEY",
        currency: "USD",
      },
      snapshots: [snap],
    });
    expect(resolved.state).toBe("RESOLVED");
    expect(resolved.provenance!.snapshotId).toBe(SNAP);
    expect(resolved.provenance!.snapshotStatus).toBe("APPROVED");
    expect(resolved.provenance!.reliedOnNonApprovedSnapshot).toBe(false);
    expect(resolved.input!.value.type).toBe("MONEY");
    if (resolved.input!.value.type === "MONEY") {
      expect(toCanonicalString(resolved.input!.value.amount)).toBe("125000000");
    }

    const eventTypes = reopened.events.map((e) => e.type);
    expect(eventTypes).toContain("SNAPSHOT_APPENDED");
    expect(eventTypes).toContain("SNAPSHOT_APPROVED");
  });

  it("refuses to approve without attributable fields even after durable append", async () => {
    const cert = certFor({ snapshotId: SNAP_NO_ATTR });
    const store = await PrismaApprovedSnapshotStore.open(prisma, CO);
    const ledger = new LedgerProposalRecorder();
    const proposed = await proposeFromCertificateAsync(store, cert, ledger);
    expect(proposed.ok).toBe(true);

    const bad = await store.approveSnapshot({
      snapshotId: SNAP_NO_ATTR,
      reviewedBy: "",
      reviewedAt: "2026-10-09T12:00:00Z",
      approvalRef: "x",
    });
    expect(bad.ok).toBe(false);
    const approvedOnly = await loadApprovedSnapshotsFromPrisma(prisma, CO);
    expect(approvedOnly.every((s) => s.snapshotId !== SNAP_NO_ATTR)).toBe(true);
  });
});
