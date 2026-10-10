/**
 * Gate 3 — physical span / parent containment / identity uniqueness
 * across DSGR, Chewy, CONMED, and LSB holdout.
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parseDocumentStructure } from "../../lib/contract-model/compiler/stage-structure";
import { detectStructuralDefinitions } from "../../lib/contract-model/compiler/structural-definitions";
import { detectStructuralReferences } from "../../lib/contract-model/compiler/structural-references";
import { buildStructuralIndex } from "../../lib/contract-model/compiler/structural-index";
import type { StructuralNode } from "../../lib/contract-model/compiler/types";

function loadDocs(): Array<{ packageKey: string; documentId: string; text: string }> {
  const out: Array<{ packageKey: string; documentId: string; text: string }> = [];
  const addDir = (packageKey: string, dir: string) => {
    if (!existsSync(dir)) return;
    for (const f of readdirSync(dir).filter((x) => x.endsWith(".txt")).sort()) {
      out.push({
        packageKey,
        documentId: f.replace(/\.txt$/, ""),
        text: readFileSync(path.join(dir, f), "utf8"),
      });
    }
  };
  addDir("dsgr", "tests/fixtures/unseen-packages/dsgr-2022-2025-credit-facility/extracted-text");
  addDir("chwy", "tests/fixtures/unseen-packages/chwy-2026-credit-agreement/extracted-text");
  addDir("conmed", "tests/fixtures/unseen-packages/conmed-2025-credit-facility/curated");
  // Held-out falsification package (not used to author remediation)
  for (const f of ["definitions-excerpt.txt", "article-6-negative-covenants.txt", "intercreditor-joinder.txt"]) {
    const p = path.join("tests/fixtures/unseen-packages/lsb-2023-abl-credit-agreement", f);
    if (existsSync(p)) {
      out.push({ packageKey: "lsb-holdout", documentId: f.replace(/\.txt$/, ""), text: readFileSync(p, "utf8") });
    }
  }
  return out;
}

const DOCS = loadDocs();

function assertIntegrity(documentId: string, text: string, nodes: StructuralNode[]) {
  const byId = new Map(nodes.map((n) => [n.nodeId, n]));
  const idCounts = new Map<string, number>();
  for (const n of nodes) {
    idCounts.set(n.nodeId, (idCounts.get(n.nodeId) ?? 0) + 1);
    expect(n.charStart).toBeGreaterThanOrEqual(0);
    expect(n.charStart).toBeLessThan(n.charEnd);
    expect(n.charEnd).toBeLessThanOrEqual(text.length);
    if (n.parentNodeId) {
      const parent = byId.get(n.parentNodeId);
      expect(parent, `${documentId} ${n.sectionRef} missing parent`).toBeDefined();
      expect(n.charStart).toBeGreaterThanOrEqual(parent!.charStart);
      expect(n.charEnd).toBeLessThanOrEqual(parent!.charEnd);
      expect(parent!.documentId).toBe(n.documentId);
    }
  }
  expect([...idCounts.values()].every((c) => c === 1)).toBe(true);
}

describe("Gate 3 — structural identity and span integrity", () => {
  it("loads DSGR, Chewy, CONMED, and LSB holdout fixtures", () => {
    expect(DOCS.some((d) => d.packageKey === "dsgr")).toBe(true);
    expect(DOCS.some((d) => d.packageKey === "chwy")).toBe(true);
    expect(DOCS.some((d) => d.packageKey === "conmed")).toBe(true);
    expect(DOCS.some((d) => d.packageKey === "lsb-holdout")).toBe(true);
  });

  for (const doc of DOCS) {
    it(`${doc.packageKey}/${doc.documentId}: spans, containment, unique nodeIds`, () => {
      const nodes = parseDocumentStructure({
        documentId: doc.documentId,
        label: doc.documentId,
        text: doc.text,
      });
      // Some curated excerpts / joinders mint zero SECTION headers — still valid
      // (empty integrity). Full CA packages must produce structure.
      if (doc.packageKey === "dsgr" || doc.packageKey === "chwy" || doc.documentId.includes("guarantee") || doc.documentId.includes("amendment") || doc.documentId.includes("article")) {
        expect(nodes.length, doc.documentId).toBeGreaterThan(0);
      }
      assertIntegrity(doc.documentId, doc.text, nodes);
    });
  }

  it("duplicated sectionRef/nodeKey remain AMBIGUOUS (never arbitrary unique match)", () => {
    const samples = DOCS.filter((d) => d.packageKey === "dsgr" || d.packageKey === "chwy");
    for (const doc of samples) {
      const nodes = parseDocumentStructure({
        documentId: doc.documentId,
        label: doc.documentId,
        text: doc.text,
      });
      const defs = detectStructuralDefinitions(doc.documentId, doc.text, nodes);
      const refs = detectStructuralReferences(doc.documentId, doc.text, nodes);
      const index = buildStructuralIndex(new Map([[doc.documentId, { text: doc.text, nodes }]]), defs, refs);
      const byRef = new Map<string, StructuralNode[]>();
      for (const n of nodes) {
        const arr = byRef.get(n.sectionRef) ?? [];
        arr.push(n);
        byRef.set(n.sectionRef, arr);
      }
      for (const [ref, matches] of byRef) {
        if (matches.length < 2) continue;
        const resolution = index.resolveUniqueNodeByRef(doc.documentId, ref);
        expect(resolution.status, `${doc.documentId} ${ref}`).toBe("AMBIGUOUS");
      }
      const errors = index.healthDiagnostics().filter((h) => h.severity === "ERROR");
      // Remediation must not introduce new ERROR-class identity failures on these docs.
      const identityErrors = errors.filter((e) =>
        ["DUPLICATE_OCCURRENCE_ID", "INVALID_SOURCE_SPAN", "CROSS_DOCUMENT_PARENT", "CYCLE"].includes(e.code),
      );
      expect(identityErrors).toEqual([]);
    }
  });

  it("definition ownership attributes sourceNodeId inside an enclosing span", () => {
    const dsgr = DOCS.find((d) => d.documentId.includes("doc-d-2025-second"));
    expect(dsgr).toBeDefined();
    const nodes = parseDocumentStructure({
      documentId: dsgr!.documentId,
      label: dsgr!.documentId,
      text: dsgr!.text,
    });
    const defs = detectStructuralDefinitions(dsgr!.documentId, dsgr!.text, nodes);
    const aa = defs.find((d) => d.normalizedTerm === "available amount" && !d.nested);
    expect(aa).toBeDefined();
    expect(aa!.sourceNodeId).toBeTruthy();
    const owner = nodes.find((n) => n.nodeId === aa!.sourceNodeId);
    expect(owner).toBeDefined();
    expect(aa!.charStart).toBeGreaterThanOrEqual(owner!.charStart);
    expect(aa!.charStart).toBeLessThan(owner!.charEnd);
  });
});
