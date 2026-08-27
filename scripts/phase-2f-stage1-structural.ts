/**
 * Phase 2F - Stage 1: deterministic structural indexing (Phase 2A) across
 * all 4 real documents of the selected unseen CONMED package. Zero LLM
 * calls, zero cost. Writes raw output to disk before any diagnosis, per
 * Phase 2F §8's "preserve first-run artifacts before any diagnosis."
 */
import fs from "node:fs";
import path from "node:path";
import { parseDocumentStructure } from "../lib/contract-model/compiler/stage-structure";
import { buildStructuralIndex } from "../lib/contract-model/compiler/structural-index";
import { detectStructuralReferences } from "../lib/contract-model/compiler/structural-references";
import { detectStructuralDefinitions } from "../lib/contract-model/compiler/structural-definitions";

const PKG_DIR = path.join(__dirname, "..", "tests", "fixtures", "unseen-packages", "conmed-2025-credit-facility", "curated");

interface DocSpec {
  documentId: string;
  label: string;
  files: string[];
}

const DOCS: DocSpec[] = [
  { documentId: "conmed-doc-a-eighth-ar-credit-agreement", label: "CONMED Eighth Amended and Restated Credit Agreement (2025-06-10)", files: ["base-credit-agreement-definitions-excerpt.txt", "base-credit-agreement-article-vii-negative-covenants.txt"] },
  { documentId: "conmed-doc-b-guarantee-collateral-agreement", label: "CONMED Amended and Restated Guarantee and Collateral Agreement (2025-06-10)", files: ["guarantee-and-collateral-agreement-full.txt"] },
  { documentId: "conmed-doc-c-second-amendment-2022", label: "CONMED Second Amendment to Seventh A&R Credit Agreement (2022-08-01)", files: ["second-amendment-2022-full.txt"] },
  { documentId: "conmed-doc-d-first-omnibus-amendment-2026", label: "CONMED First Omnibus Amendment and Increased Facility Activation Notice (2026-05-27)", files: ["first-omnibus-amendment-2026-curated.txt"] },
];

function main() {
  const nodesByDocument = new Map<string, { text: string; nodes: ReturnType<typeof parseDocumentStructure> }>();
  const allDefinitions = [];
  const allReferences = [];
  const perDocReport: Record<string, unknown> = {};

  for (const doc of DOCS) {
    const text = doc.files.map((f) => fs.readFileSync(path.join(PKG_DIR, f), "utf-8")).join("\n\n");
    const nodes = parseDocumentStructure({ documentId: doc.documentId, label: doc.label, text });
    nodesByDocument.set(doc.documentId, { text, nodes });

    const refs = detectStructuralReferences(doc.documentId, text, nodes);
    const defs = detectStructuralDefinitions(doc.documentId, text, nodes);
    allReferences.push(...refs);
    allDefinitions.push(...defs);

    const byType: Record<string, number> = {};
    for (const n of nodes) byType[n.nodeType] = (byType[n.nodeType] ?? 0) + 1;

    perDocReport[doc.documentId] = {
      label: doc.label,
      textChars: text.length,
      totalNodes: nodes.length,
      nodesByType: byType,
      definitionsDetected: defs.length,
      referencesDetected: refs.length,
      referencesResolved: refs.filter((r) => r.resolved).length,
      referencesUnresolved: refs.filter((r) => !r.resolved).length,
    };
  }

  const index = buildStructuralIndex(nodesByDocument, allDefinitions, allReferences);

  const summary = {
    runId: "PHASE_2F_STAGE1_STRUCTURAL",
    generatedAt: new Date().toISOString(),
    documents: perDocReport,
    totals: {
      documentCount: DOCS.length,
      totalChars: [...nodesByDocument.values()].reduce((n, d) => n + d.text.length, 0),
      totalNodes: [...nodesByDocument.values()].reduce((n, d) => n + d.nodes.length, 0),
      totalDefinitions: allDefinitions.length,
      totalReferences: allReferences.length,
      totalReferencesResolved: allReferences.filter((r) => r.resolved).length,
      totalReferencesUnresolved: allReferences.filter((r) => !r.resolved).length,
    },
  };

  const outDir = path.join(__dirname, "..", "tests", "fixtures", "unseen-packages", "phase-2f-freeze");
  fs.writeFileSync(path.join(outDir, "phase-2f-stage1-structural-summary.json"), JSON.stringify(summary, null, 2));

  // Full node dump for later structural-metric reporting / ground-truth cross-check.
  const allNodesDump = [...nodesByDocument.entries()].map(([documentId, d]) => ({
    documentId,
    nodes: d.nodes.map((n) => ({ nodeKey: n.nodeKey, nodeType: n.nodeType, sectionRef: n.sectionRef, heading: n.heading, parentSectionRef: n.parentSectionRef, charStart: n.charStart, charEnd: n.charEnd })),
  }));
  fs.writeFileSync(path.join(outDir, "phase-2f-stage1-all-nodes.json"), JSON.stringify(allNodesDump, null, 2));
  fs.writeFileSync(path.join(outDir, "phase-2f-stage1-all-references.json"), JSON.stringify(allReferences, null, 2));
  fs.writeFileSync(path.join(outDir, "phase-2f-stage1-all-definitions.json"), JSON.stringify(allDefinitions.map((d) => ({ documentId: d.documentId, exactTerm: d.exactTerm, normalizedTerm: d.normalizedTerm, sourceNodeKey: d.sourceNodeKey })), null, 2));

  console.log(JSON.stringify(summary, null, 2));
}

main();
