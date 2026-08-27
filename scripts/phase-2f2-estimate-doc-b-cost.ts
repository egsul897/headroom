/**
 * Phase 2F.2 §23 - free (zero-LLM-call) cost estimate for the real
 * Document B rerun: runs only Pass A's deterministic signal detector
 * (real production code, same logic pipeline.ts uses to decide which
 * sections get a Pass B call) to compute the exact expected call count and
 * total section-text volume before spending any real money.
 */
import fs from "node:fs";
import path from "node:path";
import { parseDocumentStructure } from "../lib/contract-model/compiler/stage-structure";
import { buildStructuralIndex } from "../lib/contract-model/compiler/structural-index";
import { runPassADeterministicSignals } from "../lib/contract-model/compiler/discovery/pass-a-signals";

const PKG_DIR = path.join(__dirname, "..", "tests", "fixtures", "unseen-packages", "conmed-2025-credit-facility", "curated");
const text = fs.readFileSync(path.join(PKG_DIR, "guarantee-and-collateral-agreement-full.txt"), "utf-8");
const documentId = "conmed-doc-b-guarantee-collateral-agreement";
const nodes = parseDocumentStructure({ documentId, label: documentId, text });
const nodesByDocument = new Map([[documentId, { text, nodes }]]);
const index = buildStructuralIndex(nodesByDocument, [], []);

const deterministic = runPassADeterministicSignals(documentId, index);
const candidateKeys = new Set(deterministic.map((c) => c.nodeKey));
const allNodes = index.allNodes().filter((n) => n.documentId === documentId);
const sections = allNodes.filter((n) => n.nodeType === "SECTION");

let attempted = 0;
let totalChars = 0;
for (const section of sections) {
  const descendantKeys = index.getDescendants(section.nodeKey).map((d) => d.nodeKey);
  const hasCandidate = candidateKeys.has(section.nodeKey) || descendantKeys.some((k) => candidateKeys.has(k));
  if (hasCandidate) {
    attempted++;
    totalChars += index.getNodeText(section.nodeKey, "DESCENDANTS").length;
  }
}
console.log(JSON.stringify({ totalSections: sections.length, sectionsAttempted: attempted, totalSectionTextChars: totalChars, avgCharsPerSection: Math.round(totalChars / attempted) }, null, 2));
