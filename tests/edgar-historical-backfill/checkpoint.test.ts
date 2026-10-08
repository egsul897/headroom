import { describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  checkpointPath,
  loadCheckpoint,
  newCheckpoint,
  saveCheckpoint,
} from "../../lib/edgar-historical-backfill/checkpoint";

describe("durable checkpoints", () => {
  it("round-trips and resumes issuer cursor", () => {
    const dir = mkdtempSync(join(tmpdir(), "hb-cp-"));
    const path = checkpointPath(dir);
    const cp = newCheckpoint({
      runId: "testrun",
      scale: "custom",
      issuers: [
        { cik: "0000000001", ticker: "AAA" },
        { cik: "0000000002", ticker: "BBB" },
      ],
    });
    cp.issuerCursor = 1;
    cp.completedCiks.push("0000000001");
    cp.stats.filingsScanned = 12;
    saveCheckpoint(path, cp);
    const loaded = loadCheckpoint(path);
    expect(loaded?.issuerCursor).toBe(1);
    expect(loaded?.completedCiks).toEqual(["0000000001"]);
    expect(loaded?.stats.filingsScanned).toBe(12);
    rmSync(dir, { recursive: true, force: true });
  });
});
