/**
 * Golden: emitter produces CONMED §7.1(c) FINANCIAL_COVENANTS FINANCIAL_TEST offline pin
 * with Certification-preference eligible:true.
 * Soft gate: offline sealed only; first-target/ + #68 hand pin + #73 ASSET_SALES + #76 LIENS + #78 INVESTMENTS untouched.
 * §7.1(a)/§7.1(b) seal identity but stay unpinned (leverage-definition REVIEW fail-closed).
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { pinCandidate } from "../../scripts/stratified-cert/lib/emit-pin-packet";

const DISCOVERY_ID = "discovery-candidate:5f83b15ed6cd0ea8b06289a0";
const LEVERAGE_SIBLING_ID = "discovery-candidate:8fe38049fe62ea9e9e741511";
const EXPECTED_SHA = "6caf027b1c9d4b750d05b26de025ebaee20a0ed031b2362c712878387762a19d";
const EXPECTED_CHARS = 234;
const CANONICAL_PIN =
  "docs/phase-3-reliability-stratified-certification/pins/conmed-2025-credit-facility/7.1(c)--5f83b15e/v1";
const UNPINNED_71A =
  "docs/phase-3-reliability-stratified-certification/pins/conmed-2025-credit-facility/7.1(a)--8fe38049/v1";
const UNPINNED_71B =
  "docs/phase-3-reliability-stratified-certification/pins/conmed-2025-credit-facility/7.1(b)--cf15af8f/v1";
const FIRST_TARGET = "docs/phase-3-reliability-stratified-certification/first-target";
const HAND_PIN =
  "docs/phase-3-reliability-stratified-certification/pins/chewy-2.18c-vii-incremental-shared-cap";
const ASSET_SALES_PIN =
  "docs/phase-3-reliability-stratified-certification/pins/chwy-2026-credit-agreement/6.05(a)(2)(c)--b54ed7fe/v1";
const LIENS_PIN =
  "docs/phase-3-reliability-stratified-certification/pins/conmed-2025-credit-facility/7.3(m)--b5bb07b0/v1";
const INVESTMENTS_PIN =
  "docs/phase-3-reliability-stratified-certification/pins/conmed-2025-credit-facility/7.8(l)--3476b082/v1";
const LIENS_SHA = "f3592673d6d3fcb4d7589bc9d824bbcb895cd0779f4c04c38156780e884c14dd";
const INVESTMENTS_SHA = "1243e346aba340bbb822dfa32d7e7a36fe69b15e51bbc50eec0b51752476e91a";
const FILES = [
  "00-pin-manifest.json",
  "00-preflight.json",
  "01-target-identity.json",
  "01b-operative-state.json",
  "01c-target-eligibility.json",
];

const LEVERAGE_KEYS = [
  "conmed-eighth-ar-credit-agreement::DEFINITION::consolidated senior secured leverage ratio",
  "conmed-eighth-ar-credit-agreement::DEFINITION::consolidated total leverage ratio",
];

const tmpDirs: string[] = [];
afterEach(() => {
  for (const d of tmpDirs.splice(0)) {
    fs.rmSync(d, { recursive: true, force: true });
  }
});

function tmpOut(): string {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), "pin-candidate-conmed-financial-covenants-"));
  tmpDirs.push(d);
  return d;
}

const emitArgs = {
  packageKey: "conmed-2025-credit-facility" as const,
  discoveryId: DISCOVERY_ID,
  asOfDate: "2026-10-06",
  headSha: "test-head-sha-conmed-financial-covenants",
  startedAt: "2026-10-06T00:00:00.000Z",
  expected: { chars: EXPECTED_CHARS, sha256: EXPECTED_SHA },
};

describe("pinCandidate CONMED FINANCIAL_COVENANTS §7.1(c)", () => {
  it("emits Certification-preference offline pin with eligible:true", () => {
    const outDir = tmpOut();
    const result = pinCandidate({ ...emitArgs, outDir });

    expect(result.eligible).toBe(true);
    expect(result.stratum).toBe("FINANCIAL_COVENANTS");
    expect(result.crossCuts).toContain("WITHOUT_SHARED_CAPS");
    expect(result.crossCuts).toContain("WITHOUT_BUILDERS");
    expect(result.crossCuts).toContain("WITHOUT_RECLASSIFICATION");
    expect(result.crossCuts).not.toContain("WITH_SHARED_CAPS");
    expect(result.operativeSourceChars).toBe(EXPECTED_CHARS);
    expect(result.operativeSourceSha256).toBe(EXPECTED_SHA);

    const identity = JSON.parse(fs.readFileSync(path.join(outDir, "01-target-identity.json"), "utf8"));
    expect(identity.identity.discoveryId).toBe(DISCOVERY_ID);
    expect(identity.identity.normalizedSourceRef).toBe("7.1(c)");
    expect(identity.identity.packageKey).toBe("conmed-2025-credit-facility");
    expect(identity.identity.role).toBe("FINANCIAL_TEST");
    expect(identity.identity.families).toEqual(["FINANCIAL_COVENANTS"]);
    expect(identity.identity.operativeSourceText).toMatch(/Interest Coverage Ratio/);
    expect(identity.identity.operativeSourceText).toMatch(/2\.75 to 1\.00/);
    expect(identity.identity.operativeSourceText).not.toMatch(/consolidated senior secured leverage ratio/i);
    expect(identity.identity.operativeSourceText).not.toMatch(/consolidated total leverage ratio/i);
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
    expect(eligibility.governingProvision).toBeNull();
    expect(eligibility.governingProvisionReviewRequired).toBe(false);
    expect(eligibility.offlineBundle.hasUnresolvedOperativeEvidence).toBe(false);
    expect(eligibility.offlineBundle.sufficiencyState).toBe("SUFFICIENT");
    for (const key of LEVERAGE_KEYS) {
      const hit = eligibility.phase2ReviewRequiredProvisions.find(
        (p: { provisionKey: string }) => p.provisionKey === key,
      );
      expect(hit, key).toBeTruthy();
      expect(hit.status).toBe("OPERATIVE_STATE_REVIEW_REQUIRED");
      expect(hit.definedTermMentionedInOperativeText).toBe(false);
      expect(hit.directlyReferencedBySection).toBe(false);
    }
    expect(eligibility.crossCutClaims.WITHOUT_SHARED_CAPS.claimed).toBe(true);
    // Map honesty MAPPED_WITH_REVIEW must not be dressed as CERTIFIED credit.
    expect(eligibility.canonicalMapHonesty.mapOutcome).toBe("MAPPED_WITH_REVIEW");
    expect(eligibility.canonicalMapHonesty.compilationStatus).toBe("REVIEW_REQUIRED");
    expect(eligibility.canonicalMapHonesty.verificationStatus).toBe("VERIFICATION_INCOMPLETE");
    expect(String(eligibility.canonicalMapHonesty.mapOutcome)).not.toMatch(/CERTIFIED/i);
    expect(eligibility.canonicalMapHonesty.note).toMatch(/not pre-credit/i);

    const preflight = JSON.parse(fs.readFileSync(path.join(outDir, "00-preflight.json"), "utf8"));
    expect(preflight.mode).toBe("DRY_RUN_OFFLINE_PIN");
    expect(preflight.note).toMatch(/No provider contacted/i);
    expect(preflight.interimBRelatedSeriesDetected).toBe(false);
    expect(preflight.stratum).toBe("FINANCIAL_COVENANTS");

    const manifest = JSON.parse(fs.readFileSync(path.join(outDir, "00-pin-manifest.json"), "utf8"));
    expect(manifest.status).toBe("PINNED_OFFLINE");
    expect(manifest.stratum).toBe("FINANCIAL_COVENANTS");
    expect(manifest.citesAdr).toContain("EVIDENCE-PACKET-VERSIONING-ADR");

    // Canonical committed packet matches emit identity sha/chars (ADR-1 append).
    const canonicalIdentity = JSON.parse(
      fs.readFileSync(path.join(CANONICAL_PIN, "01-target-identity.json"), "utf8"),
    );
    expect(canonicalIdentity.identity.operativeSourceSha256).toBe(EXPECTED_SHA);
    expect(canonicalIdentity.identity.operativeSourceChars).toBe(EXPECTED_CHARS);
    expect(canonicalIdentity.identity.operativeSourceText).toBe(identity.identity.operativeSourceText);
    expect(canonicalIdentity.identity.discoveryId).toBe(DISCOVERY_ID);

    // Soft gate: prior pins still present and LIENS / INVESTMENTS identity unchanged.
    expect(fs.existsSync(path.join(FIRST_TARGET, "01-target-identity.json"))).toBe(true);
    expect(fs.existsSync(path.join(HAND_PIN, "01-target-identity.json"))).toBe(true);
    expect(fs.existsSync(path.join(ASSET_SALES_PIN, "01-target-identity.json"))).toBe(true);
    const liensIdentity = JSON.parse(fs.readFileSync(path.join(LIENS_PIN, "01-target-identity.json"), "utf8"));
    expect(liensIdentity.identity.operativeSourceSha256).toBe(LIENS_SHA);
    expect(liensIdentity.identity.discoveryId).toBe("discovery-candidate:b5bb07b092f9863985f89812");
    const investmentsIdentity = JSON.parse(
      fs.readFileSync(path.join(INVESTMENTS_PIN, "01-target-identity.json"), "utf8"),
    );
    expect(investmentsIdentity.identity.operativeSourceSha256).toBe(INVESTMENTS_SHA);
    expect(investmentsIdentity.identity.discoveryId).toBe("discovery-candidate:3476b082d53dec709a3dca23");

    // One primary pin: leverage-ratio siblings are not shipped.
    expect(fs.existsSync(UNPINNED_71A)).toBe(false);
    expect(fs.existsSync(UNPINNED_71B)).toBe(false);
    expect(DISCOVERY_ID).not.toBe(LEVERAGE_SIBLING_ID);
  });

  it("fail-closes §7.1(a) when the REVIEW_REQUIRED leverage definition is named", () => {
    const outDir = tmpOut();
    const result = pinCandidate({
      packageKey: "conmed-2025-credit-facility",
      discoveryId: LEVERAGE_SIBLING_ID,
      asOfDate: "2026-10-06",
      headSha: "test-head-sha-conmed-financial-covenants",
      outDir,
      startedAt: "2026-10-06T00:00:00.000Z",
    });
    expect(result.eligible).toBe(false);
    expect(result.stratum).toBe("FINANCIAL_COVENANTS");
    const eligibility = JSON.parse(fs.readFileSync(path.join(outDir, "01c-target-eligibility.json"), "utf8"));
    expect(eligibility.eligibilityBlockers).toEqual(["PHASE2_REVIEW_REQUIRED_MENTIONED_IN_OPERATIVE"]);
    const csslr = eligibility.phase2ReviewRequiredProvisions.find(
      (p: { provisionKey: string }) => p.provisionKey === LEVERAGE_KEYS[0],
    );
    expect(csslr.definedTermMentionedInOperativeText).toBe(true);
    expect(fs.existsSync(UNPINNED_71A)).toBe(false);
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
