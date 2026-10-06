/**
 * Golden: emitter produces CONMED §7.8(l) INVESTMENTS BASKET offline pin
 * with Certification-preference eligible:true.
 * Soft gate: offline sealed only; first-target/ + #68 hand pin + #73 ASSET_SALES + #76 LIENS untouched.
 * §7.8(d) is an eligible:true scout left unpinned (dirtier span).
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { pinCandidate } from "../../scripts/stratified-cert/lib/emit-pin-packet";

const DISCOVERY_ID = "discovery-candidate:3476b082d53dec709a3dca23";
const UNPINNED_DISCOVERY_ID = "discovery-candidate:8aaa7b743717492d1a9fa0b2";
const EXPECTED_SHA = "1243e346aba340bbb822dfa32d7e7a36fe69b15e51bbc50eec0b51752476e91a";
const EXPECTED_CHARS = 427;
const CANONICAL_PIN =
  "docs/phase-3-reliability-stratified-certification/pins/conmed-2025-credit-facility/7.8(l)--3476b082/v1";
const UNPINNED_78D =
  "docs/phase-3-reliability-stratified-certification/pins/conmed-2025-credit-facility/7.8(d)--8aaa7b74/v1";
const FIRST_TARGET = "docs/phase-3-reliability-stratified-certification/first-target";
const HAND_PIN =
  "docs/phase-3-reliability-stratified-certification/pins/chewy-2.18c-vii-incremental-shared-cap";
const ASSET_SALES_PIN =
  "docs/phase-3-reliability-stratified-certification/pins/chwy-2026-credit-agreement/6.05(a)(2)(c)--b54ed7fe/v1";
const LIENS_PIN =
  "docs/phase-3-reliability-stratified-certification/pins/conmed-2025-credit-facility/7.3(m)--b5bb07b0/v1";
const LIENS_SHA = "f3592673d6d3fcb4d7589bc9d824bbcb895cd0779f4c04c38156780e884c14dd";
const FILES = [
  "00-pin-manifest.json",
  "00-preflight.json",
  "01-target-identity.json",
  "01b-operative-state.json",
  "01c-target-eligibility.json",
];

const tmpDirs: string[] = [];
afterEach(() => {
  for (const d of tmpDirs.splice(0)) {
    fs.rmSync(d, { recursive: true, force: true });
  }
});

function tmpOut(): string {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), "pin-candidate-conmed-investments-"));
  tmpDirs.push(d);
  return d;
}

const emitArgs = {
  packageKey: "conmed-2025-credit-facility" as const,
  discoveryId: DISCOVERY_ID,
  asOfDate: "2026-10-06",
  headSha: "test-head-sha-conmed-investments",
  startedAt: "2026-10-06T00:00:00.000Z",
  expected: { chars: EXPECTED_CHARS, sha256: EXPECTED_SHA },
};

describe("pinCandidate CONMED INVESTMENTS §7.8(l)", () => {
  it("emits Certification-preference offline pin with eligible:true", () => {
    const outDir = tmpOut();
    const result = pinCandidate({ ...emitArgs, outDir });

    expect(result.eligible).toBe(true);
    expect(result.stratum).toBe("INVESTMENTS");
    expect(result.crossCuts).toContain("WITHOUT_SHARED_CAPS");
    expect(result.crossCuts).toContain("WITHOUT_BUILDERS");
    expect(result.crossCuts).toContain("WITHOUT_RECLASSIFICATION");
    expect(result.crossCuts).not.toContain("WITH_SHARED_CAPS");
    expect(result.operativeSourceChars).toBe(EXPECTED_CHARS);
    expect(result.operativeSourceSha256).toBe(EXPECTED_SHA);

    const identity = JSON.parse(fs.readFileSync(path.join(outDir, "01-target-identity.json"), "utf8"));
    expect(identity.identity.discoveryId).toBe(DISCOVERY_ID);
    expect(identity.identity.normalizedSourceRef).toBe("7.8(l)");
    expect(identity.identity.packageKey).toBe("conmed-2025-credit-facility");
    expect(identity.identity.role).toBe("BASKET");
    expect(identity.identity.families).toEqual(["INVESTMENTS"]);
    expect(identity.identity.operativeSourceText).not.toMatch(/\n103\n/);
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
    expect(eligibility.identityStrength).toBe("STRONG");
    expect(eligibility.offlineBundle.hasUnresolvedOperativeEvidence).toBe(false);
    expect(eligibility.crossCutClaims.WITHOUT_SHARED_CAPS.claimed).toBe(true);
    // Map honesty UNSERVED must not be dressed as CERTIFIED credit.
    expect(eligibility.canonicalMapHonesty.mapOutcome).toBe("UNSERVED");
    expect(String(eligibility.canonicalMapHonesty.mapOutcome)).not.toMatch(/CERTIFIED/i);
    expect(eligibility.canonicalMapHonesty.note).toMatch(/not pre-credit/i);

    const preflight = JSON.parse(fs.readFileSync(path.join(outDir, "00-preflight.json"), "utf8"));
    expect(preflight.mode).toBe("DRY_RUN_OFFLINE_PIN");
    expect(preflight.note).toMatch(/No provider contacted/i);
    expect(preflight.interimBRelatedSeriesDetected).toBe(false);
    expect(preflight.stratum).toBe("INVESTMENTS");

    const manifest = JSON.parse(fs.readFileSync(path.join(outDir, "00-pin-manifest.json"), "utf8"));
    expect(manifest.status).toBe("PINNED_OFFLINE");
    expect(manifest.stratum).toBe("INVESTMENTS");
    expect(manifest.citesAdr).toContain("EVIDENCE-PACKET-VERSIONING-ADR");

    // Canonical committed packet matches emit identity sha/chars (ADR-1 append).
    const canonicalIdentity = JSON.parse(
      fs.readFileSync(path.join(CANONICAL_PIN, "01-target-identity.json"), "utf8"),
    );
    expect(canonicalIdentity.identity.operativeSourceSha256).toBe(EXPECTED_SHA);
    expect(canonicalIdentity.identity.operativeSourceChars).toBe(EXPECTED_CHARS);
    expect(canonicalIdentity.identity.operativeSourceText).toBe(identity.identity.operativeSourceText);
    expect(canonicalIdentity.identity.discoveryId).toBe(DISCOVERY_ID);

    // Soft gate: prior pins still present and LIENS identity unchanged.
    expect(fs.existsSync(path.join(FIRST_TARGET, "01-target-identity.json"))).toBe(true);
    expect(fs.existsSync(path.join(HAND_PIN, "01-target-identity.json"))).toBe(true);
    expect(fs.existsSync(path.join(ASSET_SALES_PIN, "01-target-identity.json"))).toBe(true);
    const liensIdentity = JSON.parse(fs.readFileSync(path.join(LIENS_PIN, "01-target-identity.json"), "utf8"));
    expect(liensIdentity.identity.operativeSourceSha256).toBe(LIENS_SHA);
    expect(liensIdentity.identity.discoveryId).toBe("discovery-candidate:b5bb07b092f9863985f89812");

    // One primary pin: §7.8(d) folder is not shipped.
    expect(fs.existsSync(UNPINNED_78D)).toBe(false);
    expect(DISCOVERY_ID).not.toBe(UNPINNED_DISCOVERY_ID);
  });

  it("re-run twice → byte-identical packets", () => {
    const a = tmpOut();
    const b = tmpOut();
    pinCandidate({ ...emitArgs, outDir: a });
    pinCandidate({ ...emitArgs, outDir: b });
    for (const name of FILES) {
      const left = fs.readFileSync(path.join(a, name));
      const right = fs.readFileSync(path.join(b, name));
      expect(left.equals(right), `${name} differs across runs`).toBe(true);
    }
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
