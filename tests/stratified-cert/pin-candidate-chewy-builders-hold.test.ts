/**
 * P3-WB1 hard honesty: Chewy §6.01(b)(4)(a)(i) BUILDER is UNIQUE and now
 * emits WITH_BUILDERS, but eligible:false. Do not ship a pin. Do not coerce.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { pinCandidate } from "../../scripts/stratified-cert/lib/emit-pin-packet";

const DISCOVERY_ID = "discovery-candidate:f62db8ebcda9d35c4fc03b2a";
const SIBLING_AMBIGUOUS = "discovery-candidate:6ffcfd3794d39597caa7b83b";
const MATRIX = "docs/phase-3-reliability-stratified-certification/01-pin-matrix.json";
const PIN_DIR =
  "docs/phase-3-reliability-stratified-certification/pins/chwy-2026-credit-agreement/6.01(b)(4)(a)(i)--f62db8eb";

const tmpDirs: string[] = [];
afterEach(() => {
  for (const d of tmpDirs.splice(0)) fs.rmSync(d, { recursive: true, force: true });
});

function tmpOut(): string {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), "pin-candidate-wb1-"));
  tmpDirs.push(d);
  return d;
}

describe("Chewy WITH_BUILDERS pin HOLD", () => {
  it("emits WITH_BUILDERS for the sealed BUILDER cell and stays eligible:false", () => {
    const outDir = tmpOut();
    const result = pinCandidate({
      packageKey: "chwy-2026-credit-agreement",
      discoveryId: DISCOVERY_ID,
      asOfDate: "2026-10-06",
      headSha: "990e8f891f1fdbd47d77dec8e27ca86e8896cee4",
      outDir,
      startedAt: "2026-10-07T00:00:00.000Z",
    });

    expect(result.eligible).toBe(false);
    expect(result.operativeSourceChars).toBe(285);
    expect(result.crossCuts).toContain("WITH_BUILDERS");
    expect(result.crossCuts).not.toContain("WITHOUT_BUILDERS");
    expect(result.crossCuts).toContain("WITHOUT_SHARED_CAPS");

    const identity = JSON.parse(fs.readFileSync(path.join(outDir, "01-target-identity.json"), "utf8"));
    expect(identity.identity.discoveryId).toBe(DISCOVERY_ID);
    expect(identity.identity.role).toBe("BUILDER");
    expect(identity.identity.normalizedSourceRef).toBe("6.01(b)(4)(a)(i)");
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
    expect(eligibility.eligibilityBlockers).toEqual(["UNRESOLVED_OPERATIVE_EVIDENCE"]);
    expect(eligibility.offlineBundle.hasUnresolvedOperativeEvidence).toBe(true);
    expect(eligibility.crossCutClaims.WITH_BUILDERS.claimed).toBe(true);
    expect(eligibility.crossCutClaims.WITH_BUILDERS.basis).toBe(
      `Sealed discovery role BUILDER === BUILDER on ${DISCOVERY_ID}; WITH_BUILDERS derived from role only (not operative-text heuristics).`,
    );
    expect(eligibility.crossCutClaims.WITHOUT_BUILDERS).toBeUndefined();

    expect(fs.existsSync(PIN_DIR)).toBe(false);
  });

  it("does not pin the AMBIGUOUS §6.08 sibling", () => {
    expect(() =>
      pinCandidate({
        packageKey: "chwy-2026-credit-agreement",
        discoveryId: SIBLING_AMBIGUOUS,
        asOfDate: "2026-10-06",
        headSha: "990e8f891f1fdbd47d77dec8e27ca86e8896cee4",
        outDir: tmpOut(),
        startedAt: "2026-10-07T00:00:00.000Z",
      }),
    ).toThrow(/AMBIGUOUS/);
  });

  it("keeps the matrix WITH_BUILDERS row DEFERRED with no false PINNED_OFFLINE", () => {
    const matrix = JSON.parse(fs.readFileSync(MATRIX, "utf8"));
    const cut = matrix.matrix.crossCuts.find((c: { id: string }) => c.id === "WITH_BUILDERS");
    expect(cut.status).toBe("DEFERRED");
    expect(cut.honestyOutcome).toBe("PIN_HOLD");
    expect(cut.pinId).toBeUndefined();
    expect(cut.blocker).toMatch(/eligible:false/);
    expect(cut.blocker).toMatch(/UNRESOLVED_OPERATIVE_EVIDENCE/);
    expect(cut.blocker).toMatch(new RegExp(DISCOVERY_ID.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    expect(matrix.coverageSummary.crossCutsDeferred).toContain("WITH_BUILDERS");
    expect(matrix.coverageSummary.crossCutsPinnedOffline).not.toContain("WITH_BUILDERS");
    const pinned = (matrix.pins ?? []).some((p: { discoveryId?: string }) => p.discoveryId === DISCOVERY_ID);
    expect(pinned).toBe(false);
  });
});
