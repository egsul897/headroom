/**
 * Phase 2A - real-package structural validation report (task §18/§16).
 * FWRG and LSB used as REGRESSION FIXTURES (already examined in prior
 * phases), never called unseen. Zero LLM calls - pure deterministic parse +
 * navigation over already-available fixture text.
 */
import fs from "node:fs";
import path from "node:path";
import { parseDocumentStructure } from "../lib/contract-model/compiler/stage-structure";
import { detectStructuralDefinitions } from "../lib/contract-model/compiler/structural-definitions";
import { detectStructuralReferences } from "../lib/contract-model/compiler/structural-references";
import { buildStructuralIndex } from "../lib/contract-model/compiler/structural-index";

function report(label: string, dir: string) {
  const text = fs.readFileSync(path.join(dir, "definitions-excerpt.txt"), "utf-8") + "\n\n" + fs.readFileSync(path.join(dir, "article-6-negative-covenants.txt"), "utf-8");
  const documentId = label;

  const parseStart = performance.now();
  const nodes = parseDocumentStructure({ documentId, label, text });
  const parseMs = performance.now() - parseStart;

  const defs = detectStructuralDefinitions(documentId, text, nodes);
  const refs = detectStructuralReferences(documentId, text, nodes);
  const nodesByDocument = new Map([[documentId, { text, nodes }]]);
  const index = buildStructuralIndex(nodesByDocument, defs, refs);

  const byType = new Map<string, number>();
  for (const n of nodes) byType.set(n.nodeType, (byType.get(n.nodeType) ?? 0) + 1);

  // Duplicate/ambiguous identity check: two distinct nodes should never share a nodeKey.
  const keyCount = new Map<string, number>();
  for (const n of nodes) keyCount.set(n.nodeKey, (keyCount.get(n.nodeKey) ?? 0) + 1);
  const duplicates = [...keyCount.entries()].filter(([, c]) => c > 1);

  console.log(`\n=== ${label} ===`);
  console.log(`parse time: ${parseMs.toFixed(2)}ms for ${text.length} chars`);
  console.log(`nodes: ${nodes.length}`, Object.fromEntries(byType));
  console.log(`definitions: ${defs.length}`);
  console.log(`references: ${refs.length}, resolved: ${refs.filter((r) => r.resolved).length}, unresolved: ${refs.filter((r) => !r.resolved).length}`);
  console.log(`duplicate/ambiguous nodeKeys: ${duplicates.length}`, duplicates);
  console.log(`parse failures: ${nodes.length === 0 ? "YES - zero nodes found" : "none"}`);

  // Representative sample: a simple section, a deeply nested section, a definition, a cross-reference.
  const sections = nodes.filter((n) => n.nodeType === "SECTION");
  const simple = sections.find((s) => index.getChildren(s.nodeKey).length === 0) ?? sections[0];
  const deepest = nodes.reduce((max, n) => {
    const depth = index.getAncestors(n.nodeKey).length;
    return depth > (max ? index.getAncestors(max.nodeKey).length : -1) ? n : max;
  }, sections[0]);
  console.log(`\nsample simple section: ${simple?.sectionRef} "${simple?.heading}"`);
  console.log(`sample deepest node: ${deepest?.sectionRef} (depth ${index.getAncestors(deepest!.nodeKey).length}), ancestors: ${index.getAncestors(deepest!.nodeKey).map((a) => a.sectionRef).join(" > ")}`);
  console.log(`sample definitions: ${defs.slice(0, 3).map((d) => d.exactTerm).join(" | ")}`);
  console.log(`sample resolved reference: ${JSON.stringify(refs.find((r) => r.resolved))}`);
  console.log(`sample unresolved reference: ${JSON.stringify(refs.find((r) => !r.resolved))}`);

  // Lookup latency (representative): 1000 repeated exact-ref lookups + ancestor walks.
  const lookupStart = performance.now();
  for (let i = 0; i < 1000; i++) {
    const n = nodes[i % nodes.length]!;
    index.getNode(n.nodeKey);
    index.getAncestors(n.nodeKey);
    index.getChildren(n.nodeKey);
  }
  const lookupMs = performance.now() - lookupStart;
  console.log(`1000 combined getNode+getAncestors+getChildren calls: ${lookupMs.toFixed(2)}ms (${(lookupMs / 1000).toFixed(4)}ms/call)`);

  return { nodes, defs, refs, duplicates };
}

report("FWRG", path.join(__dirname, "..", "tests", "fixtures", "unseen-packages", "fwrg-2021-credit-agreement"));
report("LSB", path.join(__dirname, "..", "tests", "fixtures", "unseen-packages", "lsb-2023-abl-credit-agreement"));
