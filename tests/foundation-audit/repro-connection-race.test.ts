import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../../lib/prisma";
import { getOrCreateUploadConnection } from "../../lib/connectors/registry";

const CO = "audit-repro-connection-race";

describe("repro: getOrCreateUploadConnection concurrent first-call race", () => {
  beforeAll(async () => {
    await prisma.companySourceConnection.deleteMany({ where: { companyId: CO } }).catch(() => {});
    await prisma.company.deleteMany({ where: { id: CO } }).catch(() => {});
    await prisma.company.create({ data: { id: CO, name: "Audit repro connection race" } });
  });
  afterAll(async () => {
    await prisma.companySourceConnection.deleteMany({ where: { companyId: CO } }).catch(() => {});
    await prisma.company.deleteMany({ where: { id: CO } }).catch(() => {});
  });

  it("N concurrent first-time calls should all succeed and converge on one row", async () => {
    const settled = await Promise.allSettled(Array.from({ length: 8 }, () => getOrCreateUploadConnection(CO)));
    const rejected = settled.filter((s) => s.status === "rejected");
    const fulfilled = settled.filter((s) => s.status === "fulfilled") as PromiseFulfilledResult<Awaited<ReturnType<typeof getOrCreateUploadConnection>>>[];
    // eslint-disable-next-line no-console
    console.log("rejected:", rejected.length, "fulfilled:", fulfilled.length, rejected.map((r: any) => r.reason?.code ?? r.reason?.message));
    const rows = await prisma.companySourceConnection.findMany({ where: { companyId: CO, connectorType: "DOCUMENT_UPLOAD" } });
    expect(rows).toHaveLength(1);
    expect(rejected).toHaveLength(0);
  });

  // AUD-S12-01: getOrCreateUploadConnection catches P2002 and returns the
  // winning DOCUMENT_UPLOAD row. This case used to be it.fails while that
  // race was unhandled. It now asserts zero rejections and one row per company.
  it("20 trials x 6 concurrent first-time calls each, fresh company per trial - looking for ANY P2002 rejection", async () => {
    let totalRejected = 0;
    const codes: string[] = [];
    const rowCounts: number[] = [];
    for (let trial = 0; trial < 20; trial++) {
      const trialCo = `${CO}-trial-${trial}`;
      await prisma.companySourceConnection.deleteMany({ where: { companyId: trialCo } }).catch(() => {});
      await prisma.company.deleteMany({ where: { id: trialCo } }).catch(() => {});
      await prisma.company.create({ data: { id: trialCo, name: `Audit repro trial ${trial}` } });
      const settled = await Promise.allSettled(Array.from({ length: 6 }, () => getOrCreateUploadConnection(trialCo)));
      const rejected = settled.filter((s) => s.status === "rejected");
      totalRejected += rejected.length;
      for (const r of rejected) codes.push((r as PromiseRejectedResult).reason?.code ?? String((r as PromiseRejectedResult).reason));
      const rows = await prisma.companySourceConnection.findMany({ where: { companyId: trialCo, connectorType: "DOCUMENT_UPLOAD" } });
      rowCounts.push(rows.length);
      await prisma.companySourceConnection.deleteMany({ where: { companyId: trialCo } }).catch(() => {});
      await prisma.company.deleteMany({ where: { id: trialCo } }).catch(() => {});
    }
    // eslint-disable-next-line no-console
    console.log("TOTAL REJECTED ACROSS 20 TRIALS:", totalRejected, codes);
    expect(totalRejected).toBe(0);
    expect(rowCounts).toEqual(Array.from({ length: 20 }, () => 1));
  });
});
