/**
 * Golden: emitter produces Chewy §1.08(d)(i) FINANCIAL_COVENANTS CONDITION offline pin.
 * Soft gate: one cell; PINNED_OFFLINE ≠ CERTIFIED. Role CONDITION is not a Chewy FINANCIAL_TEST eligible:true claim.
 * Hinted FINANCIAL_TEST spans stay eligible:false and unpinned. Fallbacks stay unpinned.
 * Zero provider calls. first-target/ + prior pins untouched.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { pinCandidate } from "../../scripts/stratified-cert/lib/emit-pin-packet";

const DISCOVERY_ID = "discovery-candidate:c2018498f55ca1d0fef7aa4f";
const FINANCIAL_TEST_108A = "discovery-candidate:3746c55b7f0755c138bbcf59";
const FINANCIAL_TEST_104B = "discovery-candidate:c9e7af41092f13e79989b95e";
const FALLBACK_108D_II = "discovery-candidate:5be40987571c84b616abb07e";
const FALLBACK_108G = "discovery-candidate:c3708f1e7541fd0456804118";
const EXPECTED_SHA = "f1e98f1d5133d7e93cfe32cdbf57c8331e82c4b9f113326e498edbbc692ef609";
const EXPECTED_CHARS = 557;
const PLAN_SHA = "6f71e081842913e79ce22dd0a018d891feb5d78a39cd2f14274120a98c130483";
const BASE_SHA = "7351d0fad8d75451b39a6ffb338de41be90518fc";
const CANONICAL_PIN =
  "docs/phase-3-reliability-stratified-certification/pins/chwy-2026-credit-agreement/1.08(d)(i)--c2018498/v1";
const MATRIX = "docs/phase-3-reliability-stratified-certification/01-pin-matrix.json";
const FIRST_TARGET = "docs/phase-3-reliability-stratified-certification/first-target";
const HAND_PIN =
  "docs/phase-3-reliability-stratified-certification/pins/chewy-2.18c-vii-incremental-shared-cap";
const ASSET_SALES_PIN =
  "docs/phase-3-reliability-stratified-certification/pins/chwy-2026-credit-agreement/6.05(a)(2)(c)--b54ed7fe/v1";
const SHARED_CAP_PIN =
  "docs/phase-3-reliability-stratified-certification/pins/chwy-2026-credit-agreement/2.18(c)(vii)--cf3d8d94/v1";
const LIENS_PIN =
  "docs/phase-3-reliability-stratified-certification/pins/conmed-2025-credit-facility/7.3(m)--b5bb07b0/v1";
const INVESTMENTS_PIN =
  "docs/phase-3-reliability-stratified-certification/pins/conmed-2025-credit-facility/7.8(l)--3476b082/v1";
const CONMED_FC_PIN =
  "docs/phase-3-reliability-stratified-certification/pins/conmed-2025-credit-facility/7.1(c)--5f83b15e/v1";
const UNPINNED_108A =
  "docs/phase-3-reliability-stratified-certification/pins/chwy-2026-credit-agreement/1.08(a)(i)--3746c55b/v1";
const UNPINNED_104B =
  "docs/phase-3-reliability-stratified-certification/pins/chwy-2026-credit-agreement/1.04(b)--c9e7af41/v1";
const UNPINNED_108D_II =
  "docs/phase-3-reliability-stratified-certification/pins/chwy-2026-credit-agreement/1.08(d)(ii)--5be40987/v1";
const UNPINNED_108G =
  "docs/phase-3-reliability-stratified-certification/pins/chwy-2026-credit-agreement/1.08(g)--c3708f1e/v1";
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
  const d = fs.mkdtempSync(path.join(os.tmpdir(), "pin-candidate-chewy-fincov-"));
  tmpDirs.push(d);
  return d;
}

const emitArgs = {
  packageKey: "chwy-2026-credit-agreement" as const,
  discoveryId: DISCOVERY_ID,
  asOfDate: "2026-10-07",
  headSha: "test-head-sha-chewy-fincov",
  startedAt: "2026-10-07T00:00:00.000Z",
  expected: { chars: EXPECTED_CHARS, sha256: EXPECTED_SHA },
};

describe("pinCandidate Chewy FINANCIAL_COVENANTS §1.08(d)(i) CONDITION", () => {
  it("emits one eligible CONDITION pin under the FinCov stratum", () => {
    const outDir = tmpOut();
    const result = pinCandidate({ ...emitArgs, outDir });

    expect(result.eligible).toBe(true);
    expect(result.stratum).toBe("FINANCIAL_COVENANTS");
    expect(result.crossCuts).toContain("WITHOUT_SHARED_CAPS");
    expect(result.crossCuts).toContain("WITHOUT_BUILDERS");
    expect(result.crossCuts).toContain("WITHOUT_RECLASSIFICATION");
    expect(result.crossCuts).not.toContain("WITH_SHARED_CAPS");
    expect(result.crossCuts).not.toContain("WITH_BUILDERS");
    expect(result.crossCuts).not.toContain("WITH_RECLASSIFICATION");
    expect(result.operativeSourceChars).toBe(EXPECTED_CHARS);
    expect(result.operativeSourceSha256).toBe(EXPECTED_SHA);

    const identity = JSON.parse(fs.readFileSync(path.join(outDir, "01-target-identity.json"), "utf8"));
    expect(identity.identity.discoveryId).toBe(DISCOVERY_ID);
    expect(identity.identity.normalizedSourceRef).toBe("1.08(d)(i)");
    expect(identity.identity.packageKey).toBe("chwy-2026-credit-agreement");
    expect(identity.identity.role).toBe("CONDITION");
    expect(identity.identity.role).not.toBe("FINANCIAL_TEST");
    expect(identity.identity.families).toEqual(["FINANCIAL_COVENANTS"]);
    expect(identity.identity.operativeSourceText).toMatch(/Specified Transaction Adjustment/);
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
    expect(eligibility.offlineBundle.hasUnresolvedOperativeEvidence).toBe(false);
    expect(eligibility.status).toBe("PINNED_OFFLINE");
    expect(JSON.stringify(eligibility)).not.toMatch(/"status":"CERTIFIED"/);
    expect(eligibility.canonicalMapHonesty.mapOutcome).toBe("NO_CHEWY_CANONICAL_MAP_YET");
    expect(eligibility.canonicalMapHonesty.note).toMatch(/not pre-credit/i);
    expect(eligibility.discoveryHonesty.reviewStatus).toBe("UNCERTAIN");

    const preflight = JSON.parse(fs.readFileSync(path.join(outDir, "00-preflight.json"), "utf8"));
    expect(preflight.mode).toBe("DRY_RUN_OFFLINE_PIN");
    expect(preflight.note).toMatch(/No provider contacted/i);
    expect(preflight.interimBRelatedSeriesDetected).toBe(false);
    expect(preflight.stratum).toBe("FINANCIAL_COVENANTS");
    expect(preflight.role).toBe("CONDITION");

    const manifest = JSON.parse(fs.readFileSync(path.join(outDir, "00-pin-manifest.json"), "utf8"));
    expect(manifest.status).toBe("PINNED_OFFLINE");
    expect(manifest.status).not.toBe("CERTIFIED");
    expect(manifest.stratum).toBe("FINANCIAL_COVENANTS");
    expect(manifest.discoveryId).toBe(DISCOVERY_ID);
    expect(manifest.citesAdr).toContain("EVIDENCE-PACKET-VERSIONING-ADR");

    const canonicalIdentity = JSON.parse(
      fs.readFileSync(path.join(CANONICAL_PIN, "01-target-identity.json"), "utf8"),
    );
    expect(canonicalIdentity.identity.operativeSourceSha256).toBe(EXPECTED_SHA);
    expect(canonicalIdentity.identity.operativeSourceChars).toBe(EXPECTED_CHARS);
    expect(canonicalIdentity.identity.operativeSourceText).toBe(identity.identity.operativeSourceText);
    expect(canonicalIdentity.identity.discoveryId).toBe(DISCOVERY_ID);
    expect(canonicalIdentity.identity.role).toBe("CONDITION");
    expect(canonicalIdentity.baseSha).toBe(BASE_SHA);
    for (const name of FILES) {
      expect(fs.existsSync(path.join(CANONICAL_PIN, name)), name).toBe(true);
    }

    const matrix = JSON.parse(fs.readFileSync(MATRIX, "utf8"));
    expect(matrix.baseSha).toBe(BASE_SHA);
    const pin = matrix.pins.find((p: { discoveryId?: string }) => p.discoveryId === DISCOVERY_ID);
    expect(pin.status).toBe("PINNED_OFFLINE");
    expect(pin.role).toBe("CONDITION");
    expect(pin.stratum).toBe("FINANCIAL_COVENANTS");
    expect(pin.eligible).toBe(true);
    expect(pin.planBinding.planSha256).toBe(PLAN_SHA);
    expect(pin.note).toMatch(/not a claim that a Chewy FINANCIAL_TEST became eligible:true/i);
    expect(pin.note).toMatch(/PINNED_OFFLINE is not CERTIFIED/);

    const stratum = matrix.matrix.strata.find((s: { id: string }) => s.id === "FINANCIAL_COVENANTS");
    expect(stratum.chewyFollowOn.status).toBe("PINNED_OFFLINE");
    expect(stratum.chewyFollowOn.discoveryId).toBe(DISCOVERY_ID);
    expect(stratum.chewyFollowOn.role).toBe("CONDITION");
    expect(stratum.chewyFollowOn.note).toMatch(/not a claim that a Chewy FINANCIAL_TEST became eligible:true/i);
    expect(stratum.chewyFollowOn.financialTest.status).toBe("DEFERRED");
    expect(stratum.chewyFollowOn.financialTest.candidateHintsFromSealedTree.join(" ")).toContain(FINANCIAL_TEST_108A);
    expect(stratum.chewyFollowOn.financialTest.candidateHintsFromSealedTree.join(" ")).toContain(FINANCIAL_TEST_104B);
    const unpinnedIds = stratum.chewyFollowOn.unpinnedEligibleScouts.map(
      (s: { discoveryId: string }) => s.discoveryId,
    );
    expect(unpinnedIds).toEqual([FALLBACK_108D_II, FALLBACK_108G]);

    expect(matrix.coverageSummary.chewyFinancialCovenantsFollowOnPinned).toBe(true);
    expect(matrix.coverageSummary.chewyFinancialCovenantsFollowOnRole).toBe("CONDITION");
    expect(matrix.coverageSummary.chewyFinancialCovenantsFollowOnDiscoveryId).toBe(DISCOVERY_ID);
    expect(matrix.coverageSummary.chewyFinancialCovenantsStillDeferred).toBe(false);
    expect(matrix.coverageSummary.chewyFinancialCovenantsResolved).toBe(false);
    expect(matrix.coverageSummary.chewyFinancialTestStillUnpinned).toBe(true);
    expect(matrix.coverageSummary.chewyFinancialTestEligibleTrue).toBe(false);
    expect(matrix.coverageSummary.note).toMatch(/does not mark Chewy FINANCIAL_COVENANTS resolved/);
    expect(matrix.coverageSummary.note).toMatch(/not a claim that a Chewy FINANCIAL_TEST became eligible:true/i);
    expect(matrix.coverageSummary.note).toMatch(/PINNED_OFFLINE is not CERTIFIED/);
    expect(matrix.reviewAsk.passUnlocks).toMatch(/Merge HOLD/);
    expect(matrix.reviewAsk.ask).toMatch(/COMMENT \(not APPROVE\)/);

    expect(fs.existsSync(path.join(FIRST_TARGET, "01-target-identity.json"))).toBe(true);
    expect(fs.existsSync(path.join(HAND_PIN, "01-target-identity.json"))).toBe(true);
    const assetSales = JSON.parse(fs.readFileSync(path.join(ASSET_SALES_PIN, "01-target-identity.json"), "utf8"));
    expect(assetSales.identity.discoveryId).toBe("discovery-candidate:b54ed7fe4f8f7bb7c224d99b");
    const sharedCap = JSON.parse(fs.readFileSync(path.join(SHARED_CAP_PIN, "01-target-identity.json"), "utf8"));
    expect(sharedCap.identity.operativeSourceSha256).toBe(
      "651afe4b14a01820c98be250741f968a1f0f20eec8a12bcd0c457ca92efb8f4f",
    );
    const liens = JSON.parse(fs.readFileSync(path.join(LIENS_PIN, "01-target-identity.json"), "utf8"));
    expect(liens.identity.operativeSourceSha256).toBe(
      "f3592673d6d3fcb4d7589bc9d824bbcb895cd0779f4c04c38156780e884c14dd",
    );
    const investments = JSON.parse(fs.readFileSync(path.join(INVESTMENTS_PIN, "01-target-identity.json"), "utf8"));
    expect(investments.identity.operativeSourceSha256).toBe(
      "1243e346aba340bbb822dfa32d7e7a36fe69b15e51bbc50eec0b51752476e91a",
    );
    const conmedFc = JSON.parse(fs.readFileSync(path.join(CONMED_FC_PIN, "01-target-identity.json"), "utf8"));
    expect(conmedFc.identity.discoveryId).toBe("discovery-candidate:5f83b15ed6cd0ea8b06289a0");
    expect(conmedFc.identity.role).toBe("FINANCIAL_TEST");
    expect(conmedFc.identity.operativeSourceSha256).toBe(
      "6caf027b1c9d4b750d05b26de025ebaee20a0ed031b2362c712878387762a19d",
    );

    expect(fs.existsSync(UNPINNED_108A)).toBe(false);
    expect(fs.existsSync(UNPINNED_104B)).toBe(false);
    expect(fs.existsSync(UNPINNED_108D_II)).toBe(false);
    expect(fs.existsSync(UNPINNED_108G)).toBe(false);
  });

  it("fail-closes hinted Chewy FINANCIAL_TEST spans and does not ship them", () => {
    for (const discoveryId of [FINANCIAL_TEST_108A, FINANCIAL_TEST_104B]) {
      const outDir = tmpOut();
      const result = pinCandidate({
        packageKey: "chwy-2026-credit-agreement",
        discoveryId,
        asOfDate: "2026-10-07",
        headSha: "test-head-sha-chewy-fincov",
        outDir,
        startedAt: "2026-10-07T00:00:00.000Z",
      });
      expect(result.eligible).toBe(false);
      expect(result.stratum).toBe("FINANCIAL_COVENANTS");
      const identity = JSON.parse(fs.readFileSync(path.join(outDir, "01-target-identity.json"), "utf8"));
      expect(identity.identity.role).toBe("FINANCIAL_TEST");
      const eligibility = JSON.parse(fs.readFileSync(path.join(outDir, "01c-target-eligibility.json"), "utf8"));
      expect(eligibility.eligibilityBlockers).toEqual(["UNRESOLVED_OPERATIVE_EVIDENCE"]);
    }
    expect(fs.existsSync(UNPINNED_108A)).toBe(false);
    expect(fs.existsSync(UNPINNED_104B)).toBe(false);
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
        packageKey: "chwy-2026-credit-agreement",
        discoveryId: DISCOVERY_ID,
        asOfDate: "2026-10-07",
        headSha: "test",
        outDir: FIRST_TARGET,
        startedAt: "2026-10-07T00:00:00.000Z",
      }),
    ).toThrow(/first-target/);

    expect(() =>
      pinCandidate({
        packageKey: "chwy-2026-credit-agreement",
        discoveryId: DISCOVERY_ID,
        asOfDate: "2026-10-07",
        headSha: "test",
        outDir: HAND_PIN,
        startedAt: "2026-10-07T00:00:00.000Z",
      }),
    ).toThrow(/hand pin/);
  });
});
