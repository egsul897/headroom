/**
 * Gibraltar DEVELOPMENT execution. Offline stages run. Pass B does not.
 * DEVELOPMENT ≠ CERTIFIED. No synthetic Pass B. No pin.
 */
import { createHash } from "node:crypto";
import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { runOfflineDevelopmentPipeline } from "../../scripts/p3-development-pipeline/run-offline";

const GRANT = "docs/architecture/OWNER-GIBRALTAR-DEVELOPMENT-GRANT-2026-10-07.md";
const FROZEN = "docs/architecture/PHASE-3-TRACK-D.FROZEN.md";
const GRANT_SHA = "4a5f26122c64fd67539831bd8464e01e2229f5f3e527de4fdb4777d68a54445a";
const FROZEN_SHA = "f782f2f98537c8b76a8a4506c92a51e74c40a0a8eafd203b7343eaa0a21aede3";
const PACKAGE_DIR = "tests/fixtures/unseen-packages/gibraltar-2026-credit-agreement";

function sha256(path: string): string {
  return createHash("sha256").update(fs.readFileSync(path)).digest("hex");
}

describe("Gibraltar DEVELOPMENT pipeline execution", () => {
  it("hashes the grant and FROZEN bodies", () => {
    expect(sha256(GRANT)).toBe(GRANT_SHA);
    expect(sha256(FROZEN)).toBe(FROZEN_SHA);
  });

  it("runs offline stages and escalates Pass B", async () => {
    const result = await runOfflineDevelopmentPipeline({
      packageDir: PACKAGE_DIR,
      documentId: "gibraltar-doc-a-2026-02-02-credit-agreement",
      label: "Gibraltar Industries, Inc. Credit Agreement dated as of February 2, 2026 (EX-10.1)",
      rawHtmlRelative: "raw-html/ef20064499_ex10-1.htm",
      extractedTextRelative: "extracted-text/credit-agreement.txt",
      provenanceRelative: "provenance.json",
      frozenBodyPath: FROZEN,
      expectedFrozenSha256: FROZEN_SHA,
      passBCommand: 'AI_GATEWAY_API_KEY="$AI_GATEWAY_API_KEY" npx tsx scripts/p3-development-pipeline/execute-gibraltar.ts',
    });

    expect(result.banner).toBe("DEVELOPMENT ≠ CERTIFIED ≠ PINNED_OFFLINE");
    expect(result.designation).toBe("DEVELOPMENT");
    expect(result.certified).toBe(false);
    expect(result.pinnedOffline).toBe(false);
    expect(result.eligibleClaimed).toBe(false);
    expect(result.discoveryIdsMinted).toBe(false);
    expect(result.semanticRolesAssigned).toBe(false);
    expect(result.discoveredCandidates).toEqual([]);
    expect(result.providerScopedCandidates).toEqual([]);
    expect(result.crossCutRead.builderRoleCount).toBe(0);
    expect(result.crossCutRead.reclassEdgeWritten).toBe(false);
    expect(result.crossCutRead.assetNodeSelected).toBe(false);
    expect(result.verificationReservation.executed).toBe(false);
    expect(result.verificationReservation.candidateCount).toBe(0);
    expect(result.verificationReservation.sonnetObservedRateUsd).toBe(0);
    expect(result.verificationReservation.haikuListScaledUsd).toBe(0);
    expect(result.passB.executed).toBe(false);
    expect(result.passB.terminal).toBe("PROVIDER_EXECUTION_REQUIRED");
    expect(result.offline.passACandidates).toBe(946);
    expect(result.offline.totalNodes).toBe(2087);
    expect(result.offline.htmlBodyMatchesProvenance).toBe(true);
    expect(result.offline.extractedTextMatchesProvenance).toBe(true);

    const escalation = result.providerExecutionRequired;
    expect(escalation?.code).toBe("PROVIDER_EXECUTION_REQUIRED");
    expect(escalation?.provider).toBe("VERCEL_AI_GATEWAY");
    expect(escalation?.model).toBe("anthropic/claude-sonnet-5");
    expect(escalation?.pipelineStageUnlocked).toBe("PASS_B_SEMANTIC_CLASSIFICATION");
    expect(escalation?.sectionsToCall).toBe(141);
    expect(escalation?.expectedMaxCostUsd).toBe(181.67);
    expect(escalation?.command).toContain("scripts/p3-development-pipeline/execute-gibraltar.ts");

    expect(result.investigations.builderBasket.citedRefResolution).toBe("NOT_FOUND");
    expect(result.investigations.builderBasket.discoveryId).toBeNull();
    expect(result.investigations.builderBasket.owningNodes.map((node) => node.sectionRef)).toContain("7.05(a)(4)(ii)(vi)(B)");
    expect(result.investigations.reclass.edgeWritten).toBe(false);
    expect(result.investigations.reclass.categoryToTargetRuleIdInvented).toBe(false);
    expect(result.investigations.reclass.windows.map((window) => window.sectionRef)).toContain("7.01(b)(a)");
    expect(result.investigations.assetDispositions704.resolution).toBe("AMBIGUOUS");
    expect(result.investigations.assetDispositions704.selected).toBe(false);
    expect(result.investigations.assetDispositions704.candidates).toHaveLength(2);

    const matrix = fs.readFileSync("docs/phase-3-reliability-stratified-certification/01-pin-matrix.json", "utf8");
    expect(matrix.toLowerCase()).not.toContain("gibraltar");
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain("discovery-candidate:");
    expect(serialized).not.toContain("RECLASSIFIABLE_TO");
  }, 60000);
});
