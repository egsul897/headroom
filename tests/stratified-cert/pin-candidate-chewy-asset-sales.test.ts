/**
 * Golden: emitter produces Chewy §6.05(a)(2)(c) ASSET_SALES identity pin
 * with fail-closed eligible:false (UNRESOLVED_OPERATIVE_EVIDENCE).
 * Soft gate: offline sealed only; first-target/ + #68 hand pin untouched.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { pinCandidate } from "../../scripts/stratified-cert/lib/emit-pin-packet";

const DISCOVERY_ID = "discovery-candidate:b54ed7fe4f8f7bb7c224d99b";
const EXPECTED_SHA = "5b742209df1a13fcbdfb970733faf520799766df102a8a9dabf254a26ce93feb";
const EXPECTED_CHARS = 857;
const CANONICAL_PIN =
  "docs/phase-3-reliability-stratified-certification/pins/chwy-2026-credit-agreement/6.05(a)(2)(c)--b54ed7fe/v1";
const FIRST_TARGET = "docs/phase-3-reliability-stratified-certification/first-target";
const HAND_PIN =
  "docs/phase-3-reliability-stratified-certification/pins/chewy-2.18c-vii-incremental-shared-cap";

const tmpDirs: string[] = [];
afterEach(() => {
  for (const d of tmpDirs.splice(0)) {
    fs.rmSync(d, { recursive: true, force: true });
  }
});

function tmpOut(): string {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), "pin-candidate-asset-sales-"));
  tmpDirs.push(d);
  return d;
}

describe("pinCandidate Chewy ASSET_SALES §6.05(a)(2)(c)", () => {
  it("emits identity-strong offline pin with fail-closed eligible:false", () => {
    const outDir = tmpOut();
    const result = pinCandidate({
      packageKey: "chwy-2026-credit-agreement",
      discoveryId: DISCOVERY_ID,
      asOfDate: "2026-10-06",
      headSha: "test-head-sha-asset-sales",
      outDir,
      startedAt: "2026-10-06T00:00:00.000Z",
      expected: { chars: EXPECTED_CHARS, sha256: EXPECTED_SHA },
    });

    expect(result.eligible).toBe(false);
    expect(result.stratum).toBe("ASSET_SALES");
    expect(result.crossCuts).toContain("WITHOUT_SHARED_CAPS");
    expect(result.crossCuts).toContain("WITHOUT_BUILDERS");
    expect(result.crossCuts).toContain("WITHOUT_RECLASSIFICATION");
    expect(result.crossCuts).not.toContain("WITH_SHARED_CAPS");
    expect(result.operativeSourceChars).toBe(EXPECTED_CHARS);
    expect(result.operativeSourceSha256).toBe(EXPECTED_SHA);

    const identity = JSON.parse(fs.readFileSync(path.join(outDir, "01-target-identity.json"), "utf8"));
    expect(identity.identity.discoveryId).toBe(DISCOVERY_ID);
    expect(identity.identity.normalizedSourceRef).toBe("6.05(a)(2)(c)");
    expect(identity.identity.packageKey).toBe("chwy-2026-credit-agreement");
    expect(identity.identity.role).toBe("BASKET");
    expect(identity.identity.families).toEqual(["ASSET_SALES"]);
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
    expect(eligibility.eligible).toBe(false);
    expect(eligibility.eligibilityBlockers).toContain("UNRESOLVED_OPERATIVE_EVIDENCE");
    expect(eligibility.eligibilityBlockers.length).toBeGreaterThan(0);
    expect(eligibility.offlineBundle.hasUnresolvedOperativeEvidence).toBe(true);
    expect(eligibility.crossCutClaims.WITHOUT_SHARED_CAPS.claimed).toBe(true);
    expect(eligibility.canonicalMapHonesty.mapOutcome).toBe("NO_CHEWY_CANONICAL_MAP_YET");

    const preflight = JSON.parse(fs.readFileSync(path.join(outDir, "00-preflight.json"), "utf8"));
    expect(preflight.mode).toBe("DRY_RUN_OFFLINE_PIN");
    expect(preflight.note).toMatch(/No provider contacted/i);
    expect(preflight.interimBRelatedSeriesDetected).toBe(false);
    expect(preflight.stratum).toBe("ASSET_SALES");

    const manifest = JSON.parse(fs.readFileSync(path.join(outDir, "00-pin-manifest.json"), "utf8"));
    expect(manifest.status).toBe("PINNED_OFFLINE");
    expect(manifest.stratum).toBe("ASSET_SALES");
    expect(manifest.citesAdr).toContain("EVIDENCE-PACKET-VERSIONING-ADR");

    // Canonical committed packet matches emit identity sha/chars (ADR-1 append).
    const canonicalIdentity = JSON.parse(
      fs.readFileSync(path.join(CANONICAL_PIN, "01-target-identity.json"), "utf8"),
    );
    expect(canonicalIdentity.identity.operativeSourceSha256).toBe(EXPECTED_SHA);
    expect(canonicalIdentity.identity.operativeSourceChars).toBe(EXPECTED_CHARS);
    expect(canonicalIdentity.identity.operativeSourceText).toBe(identity.identity.operativeSourceText);

    // Soft gate: first-target + #68 hand pin folders still present and untouched shape.
    expect(fs.existsSync(path.join(FIRST_TARGET, "01-target-identity.json"))).toBe(true);
    expect(fs.existsSync(path.join(HAND_PIN, "01-target-identity.json"))).toBe(true);
  });

  it("refuses to mutate first-target/ and #68 hand pin", () => {
    expect(() =>
      pinCandidate({
        packageKey: "chwy-2026-credit-agreement",
        discoveryId: DISCOVERY_ID,
        asOfDate: "2026-10-06",
        headSha: "x",
        outDir: FIRST_TARGET,
        startedAt: "2026-10-06T00:00:00.000Z",
      }),
    ).toThrow(/first-target/);

    expect(() =>
      pinCandidate({
        packageKey: "chwy-2026-credit-agreement",
        discoveryId: DISCOVERY_ID,
        asOfDate: "2026-10-06",
        headSha: "x",
        outDir: HAND_PIN,
        startedAt: "2026-10-06T00:00:00.000Z",
      }),
    ).toThrow(/hand pin/);
  });
});
