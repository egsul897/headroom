/**
 * Historical Haiku rows are auditable and are not current-tree evidence.
 * DEVELOPMENT ≠ CERTIFIED. No paid provider call.
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { runStructureStage } from "../../lib/contract-model/compiler/stage-structure";
import {
  CURRENT_RECORD_RELATIVE,
  HISTORICAL_PARSER_CODE_SHA256,
  HISTORICAL_PROVIDER_EXECUTION_IDENTITY,
  HISTORICAL_RECORD_RELATIVE,
  HISTORICAL_STRUCTURAL_TREE_SHA256,
  KNOWN_SECTION_REF_DRIFT,
  assertHistoricalProviderRecordNotPromotable,
  assertProviderCandidatesMatchCurrentTree,
  assertSectionRefAnchorsMatchLiveTree,
  collectSectionRefAnchors,
  type EvidenceIntegrityError,
} from "../../scripts/p3-development-pipeline/evidence-integrity";
import { runOfflineDevelopmentPipeline } from "../../scripts/p3-development-pipeline/run-offline";

const PACKAGE_DIR = "tests/fixtures/unseen-packages/gibraltar-2026-credit-agreement";
const HISTORICAL = path.join(PACKAGE_DIR, HISTORICAL_RECORD_RELATIVE);
const CURRENT = path.join(PACKAGE_DIR, CURRENT_RECORD_RELATIVE);
const MANIFEST = path.join(PACKAGE_DIR, "development-pipeline/historical/haiku-pass-b-2087-node-tree/MANIFEST.json");
const FROZEN = "docs/architecture/PHASE-3-TRACK-D.FROZEN.md";
const FROZEN_SHA = "f782f2f98537c8b76a8a4506c92a51e74c40a0a8eafd203b7343eaa0a21aede3";

function pipelineInput() {
  return {
    packageDir: PACKAGE_DIR,
    documentId: "gibraltar-doc-a-2026-02-02-credit-agreement",
    label: "Gibraltar Industries, Inc. Credit Agreement dated as of February 2, 2026 (EX-10.1)",
    rawHtmlRelative: "raw-html/ef20064499_ex10-1.htm",
    extractedTextRelative: "extracted-text/credit-agreement.txt",
    provenanceRelative: "provenance.json",
    frozenBodyPath: FROZEN,
    expectedFrozenSha256: FROZEN_SHA,
    passBCommand: 'AI_GATEWAY_API_KEY="$AI_GATEWAY_API_KEY" npx tsx scripts/p3-development-pipeline/execute-gibraltar.ts',
  };
}

describe("Gibraltar evidence integrity", () => {
  it("keeps the Haiku snapshot auditable and refuses to promote it", () => {
    const historical = JSON.parse(fs.readFileSync(HISTORICAL, "utf8")) as {
      offline: { totalNodes: number; passACandidates: number };
      passB: { executed: boolean; terminal: string };
      discoveredCandidates: unknown[];
      certified: boolean;
      verificationReservation: { executed: boolean };
    };
    const manifest = JSON.parse(fs.readFileSync(MANIFEST, "utf8")) as {
      label: string;
      promotable: boolean;
      currentTreeEvidence: boolean;
      verificationState: string;
      certified: boolean;
      providerCandidateCount: number;
      structuralNodeCount: number;
      parserCodeSha256: string;
      structuralTreeSha256: string;
      providerExecutionIdentity: string;
    };

    expect(historical.offline.totalNodes).toBe(2087);
    expect(historical.offline.passACandidates).toBe(946);
    expect(historical.passB.executed).toBe(true);
    expect(historical.passB.terminal).toBe("PASS_B_REAL_PROVIDER");
    expect(historical.discoveredCandidates).toHaveLength(842);
    expect(historical.verificationReservation.executed).toBe(false);
    expect(historical.certified).toBe(false);
    expect(manifest.label).toBe("HISTORICAL_PROVIDER_EXECUTION");
    expect(manifest.promotable).toBe(false);
    expect(manifest.currentTreeEvidence).toBe(false);
    expect(manifest.providerCandidateCount).toBe(842);
    expect(manifest.structuralNodeCount).toBe(2087);
    expect(manifest.parserCodeSha256).toBe(HISTORICAL_PARSER_CODE_SHA256);
    expect(manifest.structuralTreeSha256).toBe(HISTORICAL_STRUCTURAL_TREE_SHA256);
    expect(manifest.providerExecutionIdentity).toBe(HISTORICAL_PROVIDER_EXECUTION_IDENTITY);
    expect(() => assertHistoricalProviderRecordNotPromotable(manifest)).toThrow(/cannot be promoted/);
  });

  it("rejects historical provider candidates against the current parser and tree", async () => {
    const historical = JSON.parse(fs.readFileSync(HISTORICAL, "utf8")) as {
      discoveredCandidates: Array<{ structuralNodeIds: string[] }>;
    };
    const current = await runOfflineDevelopmentPipeline(pipelineInput());
    expect(current.evidenceIdentity.parserCodeSha256).not.toBe(HISTORICAL_PARSER_CODE_SHA256);
    expect(current.evidenceIdentity.structuralTreeSha256).not.toBe(HISTORICAL_STRUCTURAL_TREE_SHA256);
    expect(() =>
      assertProviderCandidatesMatchCurrentTree({
        candidates: historical.discoveredCandidates,
        recordParserCodeSha256: HISTORICAL_PARSER_CODE_SHA256,
        recordStructuralTreeSha256: HISTORICAL_STRUCTURAL_TREE_SHA256,
        currentParserCodeSha256: current.evidenceIdentity.parserCodeSha256,
        currentStructuralTreeSha256: current.evidenceIdentity.structuralTreeSha256,
      }),
    ).toThrow(/different parser identity/);
  }, 60000);

  it("rejects the same node id when the section reference changed", () => {
    const text = fs.readFileSync(path.join(PACKAGE_DIR, "extracted-text/credit-agreement.txt"), "utf8");
    const nodes = runStructureStage([{ documentId: "gibraltar-doc-a-2026-02-02-credit-agreement", label: "gib", text }]).output;
    const live = new Map(nodes.map((node) => [node.nodeId, node.sectionRef]));
    for (const drift of KNOWN_SECTION_REF_DRIFT) {
      expect(live.get(drift.nodeId)).toBe(drift.currentSectionRef);
      expect(() =>
        assertSectionRefAnchorsMatchLiveTree([{ nodeId: drift.nodeId, sectionRef: drift.historicalSectionRef }], live),
      ).toThrow(/changed section reference/);
    }
    const historical = JSON.parse(fs.readFileSync(HISTORICAL, "utf8"));
    expect(() => assertSectionRefAnchorsMatchLiveTree(collectSectionRefAnchors(historical), live)).toThrow(/changed section reference/);
  });

  it("keeps the current provider-free record fail-closed and distinct from the historical file", async () => {
    expect(process.env.AI_GATEWAY_API_KEY ?? "").toBe("");
    expect(process.env.ANTHROPIC_API_KEY ?? "").toBe("");
    const current = JSON.parse(fs.readFileSync(CURRENT, "utf8")) as {
      certified: boolean;
      offline: { totalNodes: number; passACandidates: number };
      passB: { executed: boolean; terminal: string };
      discoveredCandidates: unknown[];
      providerScopedCandidates: unknown[];
      verificationReservation: { executed: boolean };
      evidenceIdentity: { providerExecutionIdentity: string; verificationState: string; structuralTreeSha256: string; parserCodeSha256: string };
    };
    const fresh = await runOfflineDevelopmentPipeline(pipelineInput());
    expect(current.offline.totalNodes).toBe(2081);
    expect(current.offline.passACandidates).toBe(943);
    expect(current.passB.executed).toBe(false);
    expect(current.passB.terminal).toBe("PROVIDER_EXECUTION_REQUIRED");
    expect(current.discoveredCandidates).toEqual([]);
    expect(current.providerScopedCandidates).toEqual([]);
    expect(current.verificationReservation.executed).toBe(false);
    expect(current.certified).toBe(false);
    expect(current.evidenceIdentity.providerExecutionIdentity).toBe("PROVIDER_EXECUTION_REQUIRED");
    expect(current.evidenceIdentity.verificationState).toBe("NOT_EXECUTED");
    expect(current.evidenceIdentity.structuralTreeSha256).toBe(fresh.evidenceIdentity.structuralTreeSha256);
    expect(current.evidenceIdentity.parserCodeSha256).toBe(fresh.evidenceIdentity.parserCodeSha256);
    expect(JSON.stringify(current)).not.toContain("discovery-candidate:");
    expect(JSON.stringify(current)).not.toContain("PASS_B_REAL_PROVIDER");
    expect(fresh.passB.executed).toBe(false);
    expect(fresh.passB.terminal).toBe("PROVIDER_EXECUTION_REQUIRED");
    expect(fresh.discoveredCandidates).toEqual([]);
  }, 60000);
});

void (0 as unknown as EvidenceIntegrityError);
