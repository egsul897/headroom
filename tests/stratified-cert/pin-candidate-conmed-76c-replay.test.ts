/**
 * CONMED §7.6(c) replay: emitter identity assertions + operative sha match first-target/
 * without mutating the baseline (subset equality).
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { pinCandidate } from "../../scripts/stratified-cert/lib/emit-pin-packet";

const DISCOVERY_ID = "discovery-candidate:565fd64640e534d8a46bbe7a";
const FIRST_TARGET = "docs/phase-3-reliability-stratified-certification/first-target";

const tmpDirs: string[] = [];
afterEach(() => {
  for (const d of tmpDirs.splice(0)) fs.rmSync(d, { recursive: true, force: true });
});

describe("pinCandidate CONMED §7.6(c) replay", () => {
  it("matches first-target identity subset without writing into first-target/", () => {
    const baseline = JSON.parse(fs.readFileSync(path.join(FIRST_TARGET, "01-target-identity.json"), "utf8"));
    const outDir = fs.mkdtempSync(path.join(os.tmpdir(), "pin-candidate-conmed-"));
    tmpDirs.push(outDir);

    expect(() =>
      pinCandidate({
        packageKey: "conmed-2025-credit-facility",
        discoveryId: DISCOVERY_ID,
        asOfDate: "2026-10-06",
        headSha: "test",
        outDir: FIRST_TARGET,
        startedAt: "2026-10-06T00:00:00.000Z",
      }),
    ).toThrow(/first-target/);

    const result = pinCandidate({
      packageKey: "conmed-2025-credit-facility",
      discoveryId: DISCOVERY_ID,
      asOfDate: "2026-10-06",
      headSha: "test-head-sha",
      outDir,
      startedAt: "2026-10-06T00:00:00.000Z",
      expected: baseline.identity.expected,
    });

    const emitted = JSON.parse(fs.readFileSync(path.join(outDir, "01-target-identity.json"), "utf8"));
    expect(emitted.identity.discoveryId).toBe(baseline.identity.discoveryId);
    expect(emitted.identity.documentId).toBe(baseline.identity.documentId);
    expect(emitted.identity.normalizedSourceRef).toBe(baseline.identity.normalizedSourceRef);
    expect(emitted.identity.operativeSourceSha256).toBe(baseline.identity.operativeSourceSha256);
    expect(emitted.identity.operativeSourceChars).toBe(baseline.identity.operativeSourceChars);
    expect(emitted.identity.operativeSourceText).toBe(baseline.identity.operativeSourceText);
    expect(emitted.identity.role).toBe(baseline.identity.role);
    expect(emitted.assertions.singleOccurrence).toBe(true);
    expect(emitted.assertions.textSha256Matches).toBe(true);
    expect(result.eligible).toBe(true);

    // Baseline bytes unchanged.
    const after = fs.readFileSync(path.join(FIRST_TARGET, "01-target-identity.json"), "utf8");
    expect(after).toBe(JSON.stringify(baseline, null, 2) + (after.endsWith("\n") ? "\n" : after.endsWith("\n") ? "\n" : ""));
    // More simply: re-read equals original parse round-trip of file on disk before emit.
    expect(JSON.parse(fs.readFileSync(path.join(FIRST_TARGET, "01-target-identity.json"), "utf8"))).toEqual(baseline);
  });
});
