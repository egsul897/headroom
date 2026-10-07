/**
 * Golden: emitter produces CONMED §7.8(l) INVESTMENTS BASKET offline pin
 * with Certification-preference eligible:true.
 * Soft gate: offline sealed only; first-target/ + #68 hand pin + #73 ASSET_SALES + #76 LIENS untouched.
 * P3-CI2 also pins §7.8(d) (eligible:true BASKET). That span stays dirtier than §7.8(l).
 * PINNED_OFFLINE ≠ CERTIFIED. IMPLEMENTED ≠ CERTIFIED.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { pinCandidate } from "../../scripts/stratified-cert/lib/emit-pin-packet";

const DISCOVERY_ID = "discovery-candidate:3476b082d53dec709a3dca23";
const FOLLOWON_DISCOVERY_ID = "discovery-candidate:8aaa7b743717492d1a9fa0b2";
const EXPECTED_SHA = "1243e346aba340bbb822dfa32d7e7a36fe69b15e51bbc50eec0b51752476e91a";
const EXPECTED_CHARS = 427;
const CANONICAL_PIN =
  "docs/phase-3-reliability-stratified-certification/pins/conmed-2025-credit-facility/7.8(l)--3476b082/v1";
const PIN_78D =
  "docs/phase-3-reliability-stratified-certification/pins/conmed-2025-credit-facility/7.8(d)--8aaa7b74/v1";
const FOLLOWON_SHA = "4e5b6f9baa7708af8be1b7cda27ede79dfd2a501e69f82a8312c16fd6f95753b";
const FOLLOWON_CHARS = 389;
const FOLLOWON_PACKET_BASE = "129724b3f3b945a5c06f87f9630c9d3c6b87cb73";
const PLAN_SHA = "1b84020d4e5f1acdf21a65278c3afca09995ced4730f859b63b63432154dbb7f";
const PLAN_BASE_SHA = "ceb419bf772854ce67a4008713e4f91b0de20b1a";
const RANKING_SHA = "6248ede2766cb67d0278ef0125eaa724eb4428967a892c5ea044fc9a116a65ca";
const MATRIX = "docs/phase-3-reliability-stratified-certification/01-pin-matrix.json";
const DISCOVERY_FIXTURE =
  "tests/fixtures/unseen-packages/phase-2f-freeze/phase-2f-stage2-discovery-candidates.json";
const PRIMARY_PACKET_SHA256: Record<string, string> = {
  "00-pin-manifest.json": "58db6dd9f1db4e8f33242259bbc4dc166cfacface71af01db47dc90456713581",
  "00-preflight.json": "4db1951791ab0d5c2627912cb8ec2d463c7f0dfe254b3d99a45210dfa57e3dd3",
  "01-target-identity.json": "bb04dc153396bb0d348d92dd3b4b941fff4f1f51bf01e7ef0ddff2cbb3f5852d",
  "01b-operative-state.json": "37fd04854d4b8f41a06fa70f6add1bc5259eed49c8fa239e3ac33c2c4517f281",
  "01c-target-eligibility.json": "3dfa9d37df3e6d12c27152415d9cbcd28b05e4448e9067027d7267e4cc16e5c6",
};
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

    // §7.8(d) follow-on is shipped; §7.8(l) remains the stratum primary asserted above.
    expect(fs.existsSync(path.join(PIN_78D, "01-target-identity.json"))).toBe(true);
    expect(DISCOVERY_ID).not.toBe(FOLLOWON_DISCOVERY_ID);
    for (const [name, digest] of Object.entries(PRIMARY_PACKET_SHA256)) {
      const bytes = fs.readFileSync(path.join(CANONICAL_PIN, name));
      expect(crypto.createHash("sha256").update(bytes).digest("hex"), name).toBe(digest);
    }
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

const followOnEmitArgs = {
  packageKey: "conmed-2025-credit-facility" as const,
  discoveryId: FOLLOWON_DISCOVERY_ID,
  asOfDate: "2026-10-07",
  headSha: FOLLOWON_PACKET_BASE,
  startedAt: "2026-10-07T00:00:00.000Z",
  expected: { chars: FOLLOWON_CHARS, sha256: FOLLOWON_SHA },
};

describe("pinCandidate CONMED INVESTMENTS §7.8(d)", () => {
  it("emits the dirtier eligible BASKET pin and keeps §7.8(l) byte-untouched", () => {
    const outDir = tmpOut();
    const result = pinCandidate({ ...followOnEmitArgs, outDir });

    expect(result.eligible).toBe(true);
    expect(result.stratum).toBe("INVESTMENTS");
    expect(result.operativeSourceChars).toBe(FOLLOWON_CHARS);
    expect(result.operativeSourceSha256).toBe(FOLLOWON_SHA);
    expect(result.crossCuts).toEqual([
      "WITHOUT_SHARED_CAPS",
      "WITHOUT_BUILDERS",
      "WITHOUT_RECLASSIFICATION",
    ]);

    const identity = JSON.parse(fs.readFileSync(path.join(outDir, "01-target-identity.json"), "utf8"));
    expect(identity.identity.discoveryId).toBe(FOLLOWON_DISCOVERY_ID);
    expect(identity.identity.normalizedSourceRef).toBe("7.8(d)");
    expect(identity.identity.packageKey).toBe("conmed-2025-credit-facility");
    expect(identity.identity.role).toBe("BASKET");
    expect(identity.identity.families).toEqual(["INVESTMENTS"]);
    expect(identity.identity.occurrencesOfRefInDocument).toBe(1);
    expect(identity.identity.operativeSourceText).toMatch(/\n103\n/);
    expect(identity.identity.operativeSourceText).toMatch(/key man insurance/i);
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
    expect(eligibility.status).toBe("PINNED_OFFLINE");
    expect(eligibility.status).not.toBe("CERTIFIED");
    expect(eligibility.offlineBundle.hasUnresolvedOperativeEvidence).toBe(false);
    expect(eligibility.canonicalMapHonesty.mapOutcome).toBe("UNSERVED");
    expect(eligibility.canonicalMapHonesty.note).toMatch(/not pre-credit/i);

    const preflight = JSON.parse(fs.readFileSync(path.join(outDir, "00-preflight.json"), "utf8"));
    expect(preflight.mode).toBe("DRY_RUN_OFFLINE_PIN");
    expect(preflight.note).toMatch(/No provider contacted/i);
    expect(preflight.interimBRelatedSeriesDetected).toBe(false);
    expect(preflight.stratum).toBe("INVESTMENTS");
    expect(preflight.role).toBe("BASKET");

    const manifest = JSON.parse(fs.readFileSync(path.join(outDir, "00-pin-manifest.json"), "utf8"));
    expect(manifest.status).toBe("PINNED_OFFLINE");
    expect(manifest.status).not.toBe("CERTIFIED");
    expect(manifest.discoveryId).toBe(FOLLOWON_DISCOVERY_ID);
    expect(manifest.stratum).toBe("INVESTMENTS");
    expect(manifest.baseSha).toBe(FOLLOWON_PACKET_BASE);

    const canonicalIdentity = JSON.parse(fs.readFileSync(path.join(PIN_78D, "01-target-identity.json"), "utf8"));
    expect(canonicalIdentity.identity.operativeSourceSha256).toBe(FOLLOWON_SHA);
    expect(canonicalIdentity.identity.operativeSourceChars).toBe(FOLLOWON_CHARS);
    expect(canonicalIdentity.identity.operativeSourceText).toBe(identity.identity.operativeSourceText);
    expect(canonicalIdentity.identity.discoveryId).toBe(FOLLOWON_DISCOVERY_ID);
    expect(canonicalIdentity.identity.role).toBe("BASKET");
    expect(canonicalIdentity.baseSha).toBe(FOLLOWON_PACKET_BASE);
    for (const name of FILES) {
      const emitted = fs.readFileSync(path.join(outDir, name));
      const canonical = fs.readFileSync(path.join(PIN_78D, name));
      expect(emitted.equals(canonical), `${name} differs from canonical pin`).toBe(true);
    }

    const discovery = JSON.parse(fs.readFileSync(DISCOVERY_FIXTURE, "utf8"));
    const candidates = Array.isArray(discovery) ? discovery : discovery.candidates ?? discovery.items;
    const sealed = candidates.find((c: { discoveryId?: string }) => c.discoveryId === FOLLOWON_DISCOVERY_ID);
    expect(sealed.multipleRulesLikely).toBe(true);
    expect(sealed.role).toBe("BASKET");
    expect(sealed.normalizedSourceRef).toBe("7.8(d)");

    const matrix = JSON.parse(fs.readFileSync(MATRIX, "utf8"));
    expect(matrix.baseSha).toBe("e5905c4e1c0981b4f5691e284171d50ea40387b2");
    const pin = matrix.pins.find((p: { discoveryId?: string }) => p.discoveryId === FOLLOWON_DISCOVERY_ID);
    expect(pin.status).toBe("PINNED_OFFLINE");
    expect(pin.role).toBe("BASKET");
    expect(pin.stratum).toBe("INVESTMENTS");
    expect(pin.eligible).toBe(true);
    expect(pin.sectionRef).toBe("7.8(d)");
    expect(pin.operativeSourceChars).toBe(FOLLOWON_CHARS);
    expect(pin.planBinding.chunkId).toBe("P3-CI2");
    expect(pin.planBinding.planSha256).toBe(PLAN_SHA);
    expect(pin.planBinding.baseSha).toBe(PLAN_BASE_SHA);
    expect(pin.planBinding.rankingSha256).toBe(RANKING_SHA);
    expect(pin.planBinding.prBaseSha).toBe(FOLLOWON_PACKET_BASE);
    expect(pin.why).toMatch(/PDF page footer 103/);
    expect(pin.why).toMatch(/key-man/i);
    expect(pin.why).toMatch(/multipleRulesLikely/);
    expect(pin.why).toMatch(/dirtier than/i);
    expect(pin.note).toMatch(/PINNED_OFFLINE is not CERTIFIED/);
    expect(pin.note).toMatch(/IMPLEMENTED is not CERTIFIED/);
    expect(pin.note).toMatch(/Chewy INVESTMENTS remains DEFERRED/);

    const primary = matrix.pins.find((p: { discoveryId?: string }) => p.discoveryId === DISCOVERY_ID);
    expect(primary.status).toBe("PINNED_OFFLINE");
    expect(primary.sectionRef).toBe("7.8(l)");
    expect(primary.role).toBe("BASKET");
    expect(primary.note).toMatch(/remains unpinned/);

    const stratum = matrix.matrix.strata.find((s: { id: string }) => s.id === "INVESTMENTS");
    expect(stratum.status).toBe("PINNED_OFFLINE");
    expect(stratum.pinId).toBe("conmed-7.8l-3476b082-v1");
    expect(stratum.sectionRef).toBe("7.8(l)");
    expect(stratum.chewyFollowOn.status).toBe("DEFERRED");
    expect(stratum.unpinnedConmedScout.status).toBe("PINNED_OFFLINE");
    expect(stratum.unpinnedConmedScout.discoveryId).toBe(FOLLOWON_DISCOVERY_ID);
    expect(stratum.unpinnedConmedScout.sectionRef).toBe("7.8(d)");
    expect(stratum.unpinnedConmedScout.eligible).toBe(true);
    expect(stratum.unpinnedConmedScout.role).toBe("BASKET");
    expect(stratum.note).toMatch(/PDF page footer 103/);
    expect(stratum.note).toMatch(/key-man/i);
    expect(stratum.note).toMatch(/multipleRulesLikely/);
    expect(stratum.note).toMatch(/dirtier/i);

    expect(matrix.coverageSummary.conmed78dStillUnpinned).toBe(false);
    expect(matrix.coverageSummary.conmed78dPinned).toBe(true);
    expect(matrix.coverageSummary.conmed78dRole).toBe("BASKET");
    expect(matrix.coverageSummary.conmed78dDiscoveryId).toBe(FOLLOWON_DISCOVERY_ID);
    expect(matrix.coverageSummary.chewyInvestmentsStillDeferred).toBe(true);
    expect(matrix.coverageSummary.note).toMatch(/dirtier than §7\.8\(l\)/);
    expect(matrix.coverageSummary.note).toMatch(/multipleRulesLikely/);
    expect(matrix.coverageSummary.note).toMatch(/Chewy INVESTMENTS remains DEFERRED/);
    expect(matrix.coverageSummary.note).toMatch(/PINNED_OFFLINE is not CERTIFIED/);
    expect(matrix.coverageSummary.note).toMatch(/IMPLEMENTED is not CERTIFIED/);
    expect(matrix.reviewAsk.ask).toMatch(/COMMENT \(not APPROVE\)/);
    expect(matrix.reviewAsk.passUnlocks).toMatch(/Merge HOLD/);

    const builders = matrix.matrix.crossCuts.find((c: { id: string }) => c.id === "WITH_BUILDERS");
    expect(builders.status).toBe("DEFERRED");
    expect(builders.honestyOutcome).toBe("PIN_HOLD");

    for (const [name, digest] of Object.entries(PRIMARY_PACKET_SHA256)) {
      const bytes = fs.readFileSync(path.join(CANONICAL_PIN, name));
      expect(crypto.createHash("sha256").update(bytes).digest("hex"), `${name} mutated`).toBe(digest);
    }
  });

  it("re-run twice → byte-identical §7.8(d) packets", () => {
    const a = tmpOut();
    const b = tmpOut();
    pinCandidate({ ...followOnEmitArgs, outDir: a });
    pinCandidate({ ...followOnEmitArgs, outDir: b });
    for (const name of FILES) {
      const left = fs.readFileSync(path.join(a, name));
      const right = fs.readFileSync(path.join(b, name));
      expect(left.equals(right), `${name} differs across runs`).toBe(true);
    }
  });
});
