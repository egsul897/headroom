import { describe, expect, it } from "vitest";
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  checkpointPath,
  loadCheckpoint,
  newCheckpoint,
  saveCheckpoint,
} from "../../lib/edgar-historical-backfill/checkpoint";
import { buildRunIntegrityManifest, queueIdSet } from "../../lib/edgar-historical-backfill/integrity";
import { buildAcquisitionQueue } from "../../lib/edgar-historical-backfill/ranking";
import type { ExhibitRef } from "../../lib/edgar-historical-backfill/types";

function sampleExhibit(n: number): ExhibitRef {
  return {
    cik: "0000816956",
    accessionNumber: `0001174947-25-00094${n}`,
    filingDate: "2025-06-16",
    form: "8-K",
    exhibitType: `EX-10.${n}`,
    filename: `ex10-${n}.htm`,
    description: n === 1 ? "CREDIT AGREEMENT" : `Amendment No. ${n} to Credit Agreement`,
    documentKind: n === 1 ? "CREDIT_AGREEMENT" : "AMENDMENT",
    relevanceScore: 90,
    isIncorporatedByReference: false,
    sourceUri: `https://www.sec.gov/Archives/edgar/data/816956/00011749472500094${n}/ex10-${n}.htm`,
    agreementIdentityKey: `0000816956|${n === 1 ? "CREDIT_AGREEMENT" : "AMENDMENT"}|key-${n}`,
    discoveryStatus: "DISCOVERED",
  };
}

describe("durable resumability (local artifacts)", () => {
  it("recovers issuer cursor after interruption and regenerates identical queue ids", () => {
    const dir = mkdtempSync(join(tmpdir(), "ehb-resume-"));
    const path = checkpointPath(dir);
    const cp = newCheckpoint({
      runId: "resume-demo",
      scale: "custom",
      issuers: [
        { cik: "0000000001", ticker: "AAA" },
        { cik: "0000000002", ticker: "BBB" },
        { cik: "0000000003", ticker: "CCC" },
      ],
    });
    cp.issuerCursor = 1;
    cp.completedCiks = ["0000000001"];
    cp.stats.filingsScanned = 10;
    saveCheckpoint(path, cp);

    const loaded = loadCheckpoint(path)!;
    expect(loaded.issuerCursor).toBe(1);
    expect(loaded.completedCiks).toEqual(["0000000001"]);
    // Simulate resume: skip completed, continue from cursor.
    const remaining = loaded.issuers.slice(loaded.issuerCursor).filter((i) => !loaded.completedCiks.includes(i.cik));
    expect(remaining.map((i) => i.cik)).toEqual(["0000000002", "0000000003"]);

    const exhibits = [sampleExhibit(1), sampleExhibit(2)];
    const issuers = new Map([["0000816956", { cik: "0000816956", ticker: "CNMD" }]]);
    const q1 = buildAcquisitionQueue({ exhibits, issuersByCik: issuers });
    const q2 = buildAcquisitionQueue({ exhibits, issuersByCik: issuers });
    expect(q1.map((x) => x.queueId)).toEqual(q2.map((x) => x.queueId));

    writeFileSync(join(dir, "acquisition-queue.json"), JSON.stringify(q1));
    const ids = queueIdSet(join(dir, "acquisition-queue.json"));
    expect(ids).toEqual([...q1.map((x) => x.queueId)].sort());

    // Replay does not invent new queue identities for the same exhibits.
    writeFileSync(join(dir, "acquisition-queue.json"), JSON.stringify(q2));
    expect(queueIdSet(join(dir, "acquisition-queue.json"))).toEqual(ids);

    const integrity = buildRunIntegrityManifest(dir);
    expect(integrity.storageStatus).toBe("EPHEMERAL_WORKSPACE");
    expect(integrity.queueSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(integrity.notes.some((n) => /workspace-local|Checksums/i.test(n))).toBe(true);

    rmSync(dir, { recursive: true, force: true });
  });
});
