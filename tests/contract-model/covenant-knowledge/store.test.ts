import { describe, expect, it } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  CovenantKnowledgeStore,
  findNearDuplicates,
  invalidateAffectedRecords,
  mayReuseSemanticInterpretation,
  retrieveSourceBacked,
  structuralContentKey,
} from "../../../lib/contract-model/covenant-knowledge";

describe("covenant knowledge store", () => {
  it("persists content-addressed records and refuses model auto-verify", () => {
    const dir = mkdtempSync(join(tmpdir(), "hr-kb-"));
    const store = new CovenantKnowledgeStore({ rootDir: dir });
    const rec = store.put({
      recordId: "r1",
      kind: "SEMANTIC_HYPOTHESIS",
      companyId: "c",
      packageKey: "p",
      instrumentKey: null,
      documentId: "d",
      candidateRef: "x",
      verificationStatus: "UNVERIFIED",
      modelGenerated: true,
      body: { text: "hello world" },
      uncertainty: ["ambiguous"],
      dependencies: ["dep1"],
      invalidatedBy: null,
      reviewerDecision: null,
    });
    expect(rec.contentHash).toHaveLength(64);
    expect(store.get("r1")?.verificationStatus).toBe("UNVERIFIED");
    expect(() =>
      store.put({
        recordId: "bad",
        kind: "SEMANTIC_HYPOTHESIS",
        verificationStatus: "INDEPENDENTLY_VERIFIED",
        modelGenerated: true,
        body: { text: "x" },
        uncertainty: [],
        dependencies: [],
        invalidatedBy: null,
        reviewerDecision: null,
        companyId: null,
        packageKey: null,
        instrumentKey: null,
        documentId: null,
        candidateRef: null,
      })
    ).toThrow(/INDEPENDENTLY_VERIFIED/);
  });

  it("detects near-duplicates and blocks unsafe semantic reuse", () => {
    const dir = mkdtempSync(join(tmpdir(), "hr-kb2-"));
    const store = new CovenantKnowledgeStore({ rootDir: dir });
    store.put({
      recordId: "a",
      kind: "STRUCTURAL_PROVISION",
      verificationStatus: "UNVERIFIED",
      modelGenerated: false,
      body: { text: "Section 7.02  Indebtedness." },
      uncertainty: [],
      dependencies: [],
      invalidatedBy: null,
      reviewerDecision: null,
      companyId: null,
      packageKey: null,
      instrumentKey: null,
      documentId: "d",
      candidateRef: null,
    });
    const matches = findNearDuplicates("Section 7.02 Indebtedness.", store.list());
    expect(matches.length).toBeGreaterThan(0);
    expect(mayReuseSemanticInterpretation({ sourceContextHash: "a", targetContextHash: "b" }).allowed).toBe(false);
    expect(structuralContentKey({ documentId: "d", sectionRef: "7.02", text: "x", extractorVersion: "v1" })).toHaveLength(64);
  });

  it("invalidates dependents when documents change", () => {
    const dir = mkdtempSync(join(tmpdir(), "hr-kb3-"));
    const store = new CovenantKnowledgeStore({ rootDir: dir });
    store.put({
      recordId: "hyp",
      kind: "SEMANTIC_HYPOTHESIS",
      verificationStatus: "UNVERIFIED",
      modelGenerated: false,
      body: { text: "guess" },
      uncertainty: [],
      dependencies: ["doc-a"],
      invalidatedBy: null,
      reviewerDecision: null,
      companyId: null,
      packageKey: null,
      instrumentKey: null,
      documentId: "doc-a",
      candidateRef: "c",
    });
    const updated = invalidateAffectedRecords(store, {
      trigger: "DOCUMENT_CHANGED",
      reason: "source amended",
      changedRefs: ["doc-a"],
      at: "t1",
    });
    expect(updated.some((u) => u.verificationStatus === "INVALIDATED")).toBe(true);
    expect(retrieveSourceBacked(store, { documentId: "doc-a", requireSourceSpan: false }).length).toBeGreaterThan(0);
  });
});
