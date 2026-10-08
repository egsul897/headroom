import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { parseDocument } from "../../lib/extraction/parse";
import { parseDocumentStructure } from "../../lib/contract-model/compiler/stage-structure";
import { buildStructuralIndex } from "../../lib/contract-model/compiler/structural-index";
import { detectStructuralDefinitions } from "../../lib/contract-model/compiler/structural-definitions";
import { detectStructuralReferences } from "../../lib/contract-model/compiler/structural-references";
import { runPassADeterministicSignals } from "../../lib/contract-model/compiler/discovery/pass-a-signals";
import { EMPTY_SUPERSESSION_INDEX } from "../../lib/contract-model/compiler/amendment/operative-state";

const out = process.argv[2];
if (!out) throw new Error("usage: dump-pass-a-compare.ts <out.json>");
const packageDir = path.resolve("tests/fixtures/unseen-packages/gibraltar-2026-credit-agreement");
const documentId = "gibraltar-doc-a-2026-02-02-credit-agreement";
const label = "Gibraltar Industries, Inc. Credit Agreement dated as of February 2, 2026 (EX-10.1)";
const rawHtml = readFileSync(path.join(packageDir, "raw-html/ef20064499_ex10-1.htm"));
const extractedText = readFileSync(path.join(packageDir, "extracted-text/credit-agreement.txt"), "utf8");
async function main(): Promise<void> {
  if (!out) throw new Error("usage: dump-pass-a-compare.ts <out.json>");
  const parsed = await parseDocument(rawHtml, "text/html");
  const text = parsed.fullText === extractedText ? parsed.fullText : extractedText;
  const nodes = parseDocumentStructure({ documentId, label, text });
  const definitions = detectStructuralDefinitions(documentId, text, nodes);
  const references = detectStructuralReferences(documentId, text, nodes);
  const index = buildStructuralIndex(new Map([[documentId, { text, nodes }]]), definitions, references);
  const deterministic = runPassADeterministicSignals(documentId, index, EMPTY_SUPERSESSION_INDEX);
  const rows = deterministic.map((candidate) => {
    const node = index.getNodeById(candidate.nodeId)!;
    const own = index.getNodeText(candidate.nodeId, "OWN");
    return {
      sectionRef: candidate.sectionRef,
      nodeType: node.nodeType,
      nodeId: candidate.nodeId,
      charStart: node.charStart,
      charEnd: node.charEnd,
      heading: node.heading,
      signals: candidate.signals,
      ownHash: createHash("sha256").update(own.replace(/\s+/g, " ").trim()).digest("hex"),
      own: own.replace(/\s+/g, " ").trim().slice(0, 280),
    };
  });
  const counts: Record<string, number> = {};
  for (const row of rows) for (const signal of row.signals) counts[signal] = (counts[signal] ?? 0) + 1;
  writeFileSync(out, JSON.stringify({ passACandidates: rows.length, totalNodes: nodes.length, signalCounts: counts, rows }, null, 2));
  console.log(JSON.stringify({ passACandidates: rows.length, totalNodes: nodes.length }));
}

main();
