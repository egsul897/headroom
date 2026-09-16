/**
 * HD-4 §19: a REAL subprocess, killed with SIGKILL mid-Pass-A, then relaunched over the same evidence directory.
 * Drives scripts/phase-3-601-hd4-sigkill.ts (the same implementation the certification script runs). Zero model calls.
 */
import { describe, expect, it } from "vitest";
import { sigkillProof } from "../../scripts/phase-3-601-hd4-sigkill";

describe("HD-4 §19 real SIGKILL recovery", () => {
  it("child persists N calls -> SIGKILL -> relaunch replays exactly N, executes the rest, equals the uninterrupted control; a third launch resumes the ensemble", async () => {
    const p = await sigkillProof({ killAfterRecords: 5, delayMs: 120 });
    expect(p.failures).toEqual([]);
    expect(p.crash.signal).toBe("SIGKILL");
    expect(p.crash.recordsAtKill).toBeGreaterThanOrEqual(5);
    expect(p.restart.accounting).toMatchObject({ logicalCalls: 14, replayedCalls: p.crash.recordsAtKill, liveCalls: 14 - p.crash.recordsAtKill });
    expect(p.restart.hashEqualsControl && p.restart.projectionEqualsControl).toBe(true);
    expect(p.thirdLaunch.source).toBe("RESUMED_FROM_ENSEMBLE_PERSISTENCE");
  }, 180_000);
});
