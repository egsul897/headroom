/**
 * Golden: emitter produces CONMED §7.3(m) LIENS BASKET offline pin
 * with Certification-preference eligible:true.
 * Soft gate: offline sealed only; first-target/ + #68 hand pin + #73 ASSET_SALES untouched.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { pinCandidate } from "../../scripts/stratified-cert/lib/emit-pin-packet";

const DISCOVERY_ID = "discovery-candidate:b5bb07b092f9863985f89812";
const EXPECTED_SHA = "f3592673d6d3fcb4d7589bc9d824bbcb895cd0779f4c04c38156780e884c14dd";
const EXPECTED_CHARS = 458;
const CANONICAL_PIN =
  "docs/phase-3-reliability-stratified-certification/pins/conmed-2025-credit-facility/7.3(m)--b5bb07b0/v1";
const FIRST_TARGET = "docs/phase-3-reliability-stratified-certification/first-target";
const HAND_PIN =
  "docs/phase-3-reliability-stratified-certification/pins/chewy-2.18c-vii-incremental-shared-cap";
const ASSET_SALES_PIN =
  "docs/phase-3-reliability-stratified-certification/pins/chwy-2026-credit-agreement/6.05(a)(2)(c)--b54ed7fe/v1";

const tmpDirs: string[] = [];
afterEach(() => {
  for (const d of tmpDirs.splice(0)) {
    fs.rmSync(d, { recursive: true, force: true });
  }
});

function tmpOut(): string {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), "pin-candidate-conmed-liens-"));
  tmpDirs.push(d);
  return d;
}

describe("pinCandidate CONMED LIENS §7.3(m)", () => {
  it("emits Certification-preference offline pin with eligible:true", () => {
    const outDir = tmpOut();
    const result = pinCandidate({
      packageKey: "conmed-2025-credit-facility",
      discoveryId: DISCOVERY_ID,
      asOfDate: "2026-10-06",
      headSha: "test-head-sha-conmed-liens",
      outDir,
      startedAt: "2026-10-06T00:00:00.000Z",
      expected: { chars: EXPECTED_CHARS, sha256: EXPECTED_SHA },
    });

    expect(result.eligible).toBe(true);
    expect(result.stratum).toBe("LIENS");
    expect(result.crossCuts).toContain("WITHOUT_SHARED_CAPS");
    expect(result.crossCuts).toContain("WITHOUT_BUILDERS");
    expect(result.crossCuts).toContain("WITHOUT_RECLASSIFICATION");
    expect(result.crossCuts).not.toContain("WITH_SHARED_CAPS");
    expect(result.operativeSourceChars).toBe(EXPECTED_CHARS);
    expect(result.operativeSourceSha256).toBe(EXPECTED_SHA);

    const identity = JSON.parse(fs.readFileSync(path.join(outDir, "01-target-identity.json"), "utf8"));
    expect(identity.identity.discoveryId).toBe(DISCOVERY_ID);
    expect(identity.identity.normalizedSourceRef).toBe("7.3(m)");
    expect(identity.identity.packageKey).toBe("conmed-2025-credit-facility");
    expect(identity.identity.role).toBe("BASKET");
    expect(identity.identity.families).toEqual(["LIENS"]);
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
    expect(eligibility.eligibilityBlockers).toEqual([]);
    expect(eligibility.offlineBundle.hasUnresolvedOperativeEvidence).toBe(false);
    expect(eligibility.crossCutClaims.WITHOUT_SHARED_CAPS.claimed).toBe(true);
    // Map honesty must not be dressed as CERTIFIED credit.
    expect(eligibility.canonicalMapHonesty.mapOutcome).toBeTruthy();
    expect(String(eligibility.canonicalMapHonesty.mapOutcome)).not.toMatch(/CERTIFIED/i);

    const preflight = JSON.parse(fs.readFileSync(path.join(outDir, "00-preflight.json"), "utf8"));
    expect(preflight.mode).toBe("DRY_RUN_OFFLINE_PIN");
    expect(preflight.note).toMatch(/No provider contacted/i);
    expect(preflight.interimBRelatedSeriesDetected).toBe(false);
    expect(preflight.stratum).toBe("LIENS");

    const manifest = JSON.parse(fs.readFileSync(path.join(outDir, "00-pin-manifest.json"), "utf8"));
    expect(manifest.status).toBe("PINNED_OFFLINE");
    expect(manifest.stratum).toBe("LIENS");
    expect(manifest.citesAdr).toContain("EVIDENCE-PACKET-VERSIONING-ADR");

    // Canonical committed packet matches emit identity sha/chars (ADR-1 append).
    const canonicalIdentity = JSON.parse(
      fs.readFileSync(path.join(CANONICAL_PIN, "01-target-identity.json"), "utf8"),
    );
    expect(canonicalIdentity.identity.operativeSourceSha256).toBe(EXPECTED_SHA);
    expect(canonicalIdentity.identity.operativeSourceChars).toBe(EXPECTED_CHARS);
    expect(canonicalIdentity.identity.operativeSourceText).toBe(identity.identity.operativeSourceText);

    // Soft gate: first-target + #68 hand pin + #73 ASSET_SALES still present.
    expect(fs.existsSync(path.join(FIRST_TARGET, "01-target-identity.json"))).toBe(true);
    expect(fs.existsSync(path.join(HAND_PIN, "01-target-identity.json"))).toBe(true);
    expect(fs.existsSync(path.join(ASSET_SALES_PIN, "01-target-identity.json"))).toBe(true);
  });

  it("refuses to write into first-target/ or hand pin folder", () => {
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

    expect(() =>
      pinCandidate({
        packageKey: "conmed-2025-credit-facility",
        discoveryId: DISCOVERY_ID,
        asOfDate: "2026-10-06",
        headSha: "test",
        outDir: HAND_PIN,
        startedAt: "2026-10-06T00:00:00.000Z",
      }),
    ).toThrow(/hand pin/);
  });
});
