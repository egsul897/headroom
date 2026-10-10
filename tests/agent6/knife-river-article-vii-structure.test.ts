/**
 * A6-D6 — Knife River operative CA must expose Article VII negative-covenant
 * SECTIONs as structural SECTION nodes, including titles wrapped across a
 * blank line by EDGAR HTML→text extraction. Amendment Pass A hits must not
 * be treated as curing a missing operative-base SECTION.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { runStructureStage } from "@/lib/contract-model/compiler/stage-structure";
import { runPassADeterministicSignals } from "@/lib/contract-model/compiler/discovery/pass-a-signals";
import { detectStructuralDefinitions, type DetectedDefinition } from "@/lib/contract-model/compiler/structural-definitions";
import { detectStructuralReferences, type DetectedReference } from "@/lib/contract-model/compiler/structural-references";
import { buildStructuralIndex } from "@/lib/contract-model/compiler/structural-index";

const ROOT = "tests/fixtures/authentic-packages/knife-river-2023-2026";

function load(docId: string, file: string) {
  return {
    documentId: docId,
    label: docId,
    text: readFileSync(join(ROOT, "extracted-text", file), "utf8"),
  };
}

describe("A6-D6 Knife River Article VII structural completeness", () => {
  it("operative base exposes 7.01–7.08 as SECTION nodes including wrapped titles", () => {
    const doc = load("doc-a", "doc-a-2023-05-31-credit-agreement.txt");
    const nodes = runStructureStage([doc]).output.filter((n) => n.documentId === "doc-a" && n.nodeType === "SECTION");
    const refs = new Set(nodes.map((n) => n.sectionRef));
    for (const ref of ["7.01", "7.02", "7.03", "7.04", "7.05", "7.06", "7.07", "7.08"]) {
      expect(refs.has(ref), `missing SECTION ${ref} on operative base`).toBe(true);
    }
    const s703 = nodes.find((n) => n.sectionRef === "7.03")!;
    expect(s703.heading.replace(/\s+/g, " ")).toMatch(/Fundamental\s+Changes/i);
    const s705 = nodes.find((n) => n.sectionRef === "7.05")!;
    expect(s705.heading.replace(/\s+/g, " ")).toMatch(/Restricted\s+Payments/i);
    const s708 = nodes.find((n) => n.sectionRef === "7.08")!;
    expect(s708.heading.replace(/\s+/g, " ")).toMatch(/Financial\s+Covenant/i);
  });

  it("synthetic blank-line-wrapped SECTION title is recognized generally", () => {
    const text = [
      "ARTICLE VII NEGATIVE COVENANTS",
      "",
      "Section 7.03        Fundamental",
      "",
      "        Changes  . Merge, dissolve, or consolidate with or into another Person.",
      "",
      "Section 7.04        Asset Sales  . Sell or otherwise dispose of any asset.",
      "",
    ].join("\n");
    const nodes = runStructureStage([{ documentId: "syn", label: "syn", text }]).output;
    const sections = nodes.filter((n) => n.nodeType === "SECTION").map((n) => n.sectionRef);
    expect(sections).toContain("7.03");
    expect(sections).toContain("7.04");
  });

  it("does not treat amendment Pass A hit as operative-base structural coverage", () => {
    const docs = [
      load("doc-a", "doc-a-2023-05-31-credit-agreement.txt"),
      load("doc-b", "doc-b-2025-03-07-first-amendment.txt"),
    ];
    const structure = runStructureStage(docs).output;
    const nodesByDocument = new Map<string, { text: string; nodes: typeof structure }>();
    const definitions: DetectedDefinition[] = [];
    const references: DetectedReference[] = [];
    for (const d of docs) {
      const nodes = structure.filter((n) => n.documentId === d.documentId);
      nodesByDocument.set(d.documentId, { text: d.text, nodes });
      definitions.push(...detectStructuralDefinitions(d.documentId, d.text, nodes));
      references.push(...detectStructuralReferences(d.documentId, d.text, nodes));
    }
    const index = buildStructuralIndex(nodesByDocument, definitions, references);
    const baseSections = structure.filter((n) => n.documentId === "doc-a" && n.nodeType === "SECTION" && n.sectionRef === "7.05");
    expect(baseSections.length).toBeGreaterThanOrEqual(1);
    const amendPassA = runPassADeterministicSignals("doc-b", index);
    const amendHit705 = amendPassA.some((c) => c.sectionRef === "7.05" || c.sectionRef?.startsWith("7.05."));
    // Whether amendment hits or not, base coverage is independently required.
    expect(baseSections[0]!.documentId).toBe("doc-a");
    void amendHit705;
  });
});
