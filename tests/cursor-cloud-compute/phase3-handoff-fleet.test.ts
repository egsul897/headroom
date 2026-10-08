/**
 * Phase 3 handoff contract + fleet SEC gate acceptance (soft gate).
 * IMPLEMENTED ≠ CERTIFIED. Zero paid calls.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildHandoffRecord,
  persistHandoffPackage,
  proveArtifactReconstruction,
  sha256Buffer,
  HANDOFF_CONTRACT_VERSION,
} from "../../lib/cursor-cloud-compute/phase3/handoff-contract";
import {
  evaluateFleetSecGate,
  resolveAuthorizedUserAgent,
  ensureSharedBudgetFile,
} from "../../lib/cursor-cloud-compute/phase3/fleet-sec";
import type { SourceDocumentRef } from "../../lib/cursor-cloud-compute/phase2/types";

function sampleSource(): SourceDocumentRef {
  return {
    sourceDocumentId: "doc-1",
    cik: "0000000001",
    accessionNumber: "0000000001-26-000001",
    filingDate: "2026-01-01",
    form: "8-K",
    exhibitType: "EX-10.1",
    filename: "ex10-1.htm",
    description: "Credit Agreement",
    documentKind: "CREDIT_AGREEMENT",
    sourceUri: "https://www.sec.gov/Archives/edgar/data/1/000000000126000001/ex10-1.htm",
    agreementIdentityKey: "key-1",
    relevanceScore: 90,
    ehbRunDir: "/tmp/fake-ehb",
  };
}

describe("phase3 handoff contract", () => {
  it("persists content-addressed CAS and proves independent reconstruction", () => {
    const packageRoot = fs.mkdtempSync(path.join(os.tmpdir(), "cca-handoff-"));
    const reconstructRoot = fs.mkdtempSync(path.join(os.tmpdir(), "cca-recon-"));
    const raw = Buffer.from("<html>ARTICLE I DEFINITIONS\nSection 1.01 Defined Terms. \"Borrower\" means X.</html>");
    const nodes = [
      {
        nodeId: "n1",
        nodeType: "ARTICLE",
        sectionRef: "I",
        heading: "ARTICLE I DEFINITIONS",
        charStart: 0,
        charEnd: 20,
        parentNodeId: null,
      },
    ];
    const record = buildHandoffRecord({
      source: sampleSource(),
      rawBytes: raw,
      normalizedText: "ARTICLE I DEFINITIONS Section 1.01 Defined Terms. \"Borrower\" means X.",
      structuralNodes: nodes,
      extractionStatus: "OK",
      failureDiagnostics: null,
      acquiredVia: "WS-EHB-SecAccessCoordinator",
      checkpointId: "ckpt-test",
      metrics: {
        byteLength: raw.length,
        charCount: 68,
        nodeCount: 1,
        definitionCount: 1,
        referenceCount: 0,
        resolvedReferenceCount: 0,
        passACandidateCount: 0,
      },
    });
    expect(record.contractVersion).toBe(HANDOFF_CONTRACT_VERSION);
    expect(record.sourceHash).toBe(sha256Buffer(raw));

    const manifest = persistHandoffPackage({
      packageRoot,
      checkpointId: "ckpt-test",
      records: [{ record, rawBytes: raw, structuralNodes: nodes }],
    });
    expect(manifest.documentCount).toBe(1);
    expect(fs.existsSync(path.join(packageRoot, record.artifactRefs.rawBytesRel))).toBe(true);

    const proof = proveArtifactReconstruction({
      sourcePackageRoot: packageRoot,
      reconstructRoot,
    });
    expect(proof.proved).toBe(true);
    expect(proof.hashMatches).toBe(1);
    expect(proof.structuralMatches).toBe(1);
    // Working corpus path is NOT required for proof
    expect(proof.notes.some((n) => n.includes("CAS"))).toBe(true);
  });
});

describe("phase3 fleet SEC gate", () => {
  it("rejects placeholder User-Agent contacts", () => {
    expect(() =>
      resolveAuthorizedUserAgent({
        SEC_EDGAR_USER_AGENT: "Headroom/1.0 (contact: engineering@headroom-app.example)",
      }),
    ).toThrow(/placeholder/);
  });

  it("allows authorized contact and denies live when owner NONE without shared budget", async () => {
    const report = await evaluateFleetSecGate({
      ehbRoot: process.env.HEADROOM_EHB_ROOT ?? "/tmp/peer-worktrees/ehb",
      env: {
        ...process.env,
        SEC_EDGAR_CONTACT_EMAIL: "egsul897@gmail.com",
        HEADROOM_SEC_FETCH_OWNER: "NONE",
        HEADROOM_SEC_SHARED_BUDGET_PATH: "",
      },
    });
    expect(report.authorizedUserAgentConfigured).toBe(true);
    expect(report.liveNetworkAllowedForCca).toBe(false);
    expect(report.processLocalLimiterOnly).toBe(true);
  });

  it("allows EHB-owner live path when designated and UA configured", async () => {
    const budget = path.join(os.tmpdir(), `cca-sec-budget-${Date.now()}.json`);
    ensureSharedBudgetFile(budget);
    const report = await evaluateFleetSecGate({
      ehbRoot: process.env.HEADROOM_EHB_ROOT ?? "/tmp/peer-worktrees/ehb",
      env: {
        ...process.env,
        SEC_EDGAR_CONTACT_EMAIL: "egsul897@gmail.com",
        HEADROOM_SEC_FETCH_OWNER: "WS-EHB",
        HEADROOM_SEC_SHARED_BUDGET_PATH: budget,
      },
    });
    expect(report.sharedBudgetConfigured).toBe(true);
    expect(report.liveNetworkAllowedForCca).toBe(true);
    expect(report.designatedOwner).toBe("WS-EHB");
  });
});
