/**
 * Golden: emitter reproduces Chewy §2.18(c)(vii) WITH_SHARED_CAPS pin identity
 * against the sealed hand pin (#68) without mutating it.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { pinCandidate } from "../../scripts/stratified-cert/lib/emit-pin-packet";

const DISCOVERY_ID = "discovery-candidate:cf3d8d9492aeca04392b5172";
const EXPECTED_SHA = "651afe4b14a01820c98be250741f968a1f0f20eec8a12bcd0c457ca92efb8f4f";
const EXPECTED_CHARS = 842;
const HAND_PIN = "docs/phase-3-reliability-stratified-certification/pins/chewy-2.18c-vii-incremental-shared-cap";

const tmpDirs: string[] = [];
afterEach(() => {
  for (const d of tmpDirs.splice(0)) {
    fs.rmSync(d, { recursive: true, force: true });
  }
});

function tmpOut(): string {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), "pin-candidate-chewy-"));
  tmpDirs.push(d);
  return d;
}

describe("pinCandidate Chewy WITH_SHARED_CAPS", () => {
  it("emits eligible offline pin matching sealed structural window (~842 chars)", () => {
    const outDir = tmpOut();
    const result = pinCandidate({
      packageKey: "chwy-2026-credit-agreement",
      discoveryId: DISCOVERY_ID,
      asOfDate: "2026-10-06",
      headSha: "test-head-sha",
      outDir,
      startedAt: "2026-10-06T00:00:00.000Z",
      expected: { chars: EXPECTED_CHARS, sha256: EXPECTED_SHA },
    });

    expect(result.eligible).toBe(true);
    expect(result.stratum).toBe("DEBT");
    expect(result.crossCuts).toContain("WITH_SHARED_CAPS");
    expect(result.operativeSourceChars).toBe(EXPECTED_CHARS);
    expect(result.operativeSourceSha256).toBe(EXPECTED_SHA);

    const identity = JSON.parse(fs.readFileSync(path.join(outDir, "01-target-identity.json"), "utf8"));
    expect(identity.identity.discoveryId).toBe(DISCOVERY_ID);
    expect(identity.identity.normalizedSourceRef).toBe("2.18(c)(vii)");
    expect(identity.identity.packageKey).toBe("chwy-2026-credit-agreement");
    expect(identity.identity.role).toBe("SHARED_CAP");
    expect(identity.assertions).toEqual({
      candidateIdMatches: true,
      documentMatches: true,
      sectionRefMatches: true,
      structuralNodeResolved: true,
      singleOccurrence: true,
      textSha256Matches: true,
      charsMatch: true,
    });

    const eligibility = JSON.parse(fs.readFileSync(path.join(outDir, "01c-target-eligibility.json"), "utf8"));
    expect(eligibility.eligible).toBe(true);
    expect(eligibility.crossCutClaims.WITH_SHARED_CAPS.claimed).toBe(true);
    expect(eligibility.canonicalMapHonesty.mapOutcome).toBe("NO_CHEWY_CANONICAL_MAP_YET");
    expect(eligibility.eligibilityBlockers).toEqual([]);

    const preflight = JSON.parse(fs.readFileSync(path.join(outDir, "00-preflight.json"), "utf8"));
    expect(preflight.mode).toBe("DRY_RUN_OFFLINE_PIN");
    expect(preflight.note).toMatch(/No provider contacted/i);
    expect(preflight.interimBRelatedSeriesDetected).toBe(false);

    const manifest = JSON.parse(fs.readFileSync(path.join(outDir, "00-pin-manifest.json"), "utf8"));
    expect(manifest.status).toBe("PINNED_OFFLINE");
    expect(manifest.citesAdr).toContain("EVIDENCE-PACKET-VERSIONING-ADR");

    // Hand pin remains untouched (ADR-1).
    const handIdentity = JSON.parse(fs.readFileSync(path.join(HAND_PIN, "01-target-identity.json"), "utf8"));
    expect(handIdentity.identity.operativeSourceSha256).toBe(EXPECTED_SHA);
    expect(handIdentity.identity.operativeSourceText).toBe(identity.identity.operativeSourceText);
  });

  it("refuses to mutate the hand pin folder", () => {
    expect(() =>
      pinCandidate({
        packageKey: "chwy-2026-credit-agreement",
        discoveryId: DISCOVERY_ID,
        asOfDate: "2026-10-06",
        headSha: "test",
        outDir: HAND_PIN,
        startedAt: "2026-10-06T00:00:00.000Z",
      }),
    ).toThrow(/refusing to write into hand pin/);
  });

  it("refuses invented discovery IDs", () => {
    expect(() =>
      pinCandidate({
        packageKey: "chwy-2026-credit-agreement",
        discoveryId: "discovery-candidate:deadbeefdeadbeefdeadbeef",
        asOfDate: "2026-10-06",
        headSha: "test",
        outDir: tmpOut(),
        startedAt: "2026-10-06T00:00:00.000Z",
      }),
    ).toThrow(/not in sealed population/);
  });
});
