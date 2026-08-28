/**
 * Phase 2E.1 §2 - extracts the exact, full-detail baseline for the five
 * Phase 2E material FWRG findings, straight from the frozen Phase 2E
 * auditor (lib/contract-model/compiler/coverage-audit/*, unmodified) run
 * against the real FWRG package. This script does not modify any Phase 2E
 * file - it is a new, read-only introspection harness, exactly the same
 * relationship scripts/phase-2d-evaluate-context-retrieval.ts has to the
 * Phase 2D pipeline it evaluates.
 */
import fs from "node:fs";
import path from "node:path";
import { parseDocumentStructure } from "../lib/contract-model/compiler/stage-structure";
import { detectStructuralDefinitions } from "../lib/contract-model/compiler/structural-definitions";
import { detectStructuralReferences } from "../lib/contract-model/compiler/structural-references";
import { buildStructuralIndex } from "../lib/contract-model/compiler/structural-index";
import { buildCovenantContextBundle } from "../lib/contract-model/compiler/context-retrieval/pipeline";
import { auditContextCoverage } from "../lib/contract-model/compiler/coverage-audit/context-comparison";
import { auditDefinitionCompleteness } from "../lib/contract-model/compiler/coverage-audit/definition-audit";
import type { DiscoveredCandidate } from "../lib/contract-model/compiler/discovery/types";
import { FWRG_CONTEXT_BENCHMARK } from "../tests/fixtures/context-retrieval-benchmark/fwrg-context-ground-truth";

const dir = path.join(__dirname, "..", "tests", "fixtures", "unseen-packages", "fwrg-2021-credit-agreement");
const text = fs.readFileSync(path.join(dir, "definitions-excerpt.txt"), "utf-8") + "\n\n" + fs.readFileSync(path.join(dir, "article-6-negative-covenants.txt"), "utf-8");
const label = "fwrg";
const nodes = parseDocumentStructure({ documentId: label, label, text });
const defs = detectStructuralDefinitions(label, text, nodes);
const refs = detectStructuralReferences(label, text, nodes);
const index = buildStructuralIndex(new Map([[label, { text, nodes }]]), defs, refs);
const exactTermsByDocument = new Map([[label, new Map(defs.map((d) => [d.normalizedTerm, d.exactTerm] as const))]]);

const runDir = path.join(dir, "discovery-runs");
const files = fs.readdirSync(runDir).filter((f) => f.endsWith(".json"));
const raw = JSON.parse(fs.readFileSync(path.join(runDir, files[0]!), "utf-8")) as { candidates: DiscoveredCandidate[] };
const candidates = raw.candidates;

for (const c of FWRG_CONTEXT_BENCHMARK) {
  const candidate = candidates.find((x) => x.discoveryId === c.discoveryId);
  if (!candidate) continue;
  const bundle = buildCovenantContextBundle({ candidate, packageKey: label, companyId: label, instrumentKey: null }, { index, packageGraph: null, exactTermsByDocument });
  const nodeId = bundle.originatingStructuralNodeIds[0];
  if (!nodeId) continue;
  const findings = [...auditContextCoverage({ companyId: label, packageKey: label, instrumentKey: null, documentId: label, nodeId, index, packageGraph: null, bundle }), ...auditDefinitionCompleteness(bundle, index, label, label, label, null)];
  const material = findings.filter((f) => f.materiality === "MATERIAL");
  if (material.length === 0) continue;

  console.log(`\n################ CASE ${c.caseId} (sectionRef=${c.sectionRef}, family=${c.covenantFamily}) ################`);
  console.log(`Originating structural node: ${nodeId}`);
  console.log(`Bundle sufficiencyState: ${bundle.sufficiencyState}`);
  console.log(`Bundle stopReasons: ${JSON.stringify(bundle.stopReasons)}`);
  console.log(`Bundle items (${bundle.items.length}):`);
  for (const it of bundle.items) console.log(`  [${it.type}] ${it.normalizedRef}  (nodeKey=${it.structuralNodeKey})`);
  console.log(`Bundle unresolvedDependencies (${bundle.unresolvedDependencies.length}):`);
  for (const u of bundle.unresolvedDependencies) console.log(`  ${u.dependencyType}: "${u.sourceText}" (${u.reason})`);

  for (const f of material) {
    console.log(`\n--- MATERIAL FINDING ---`);
    console.log(JSON.stringify(f, null, 2));
    // Show what the referenced target node's own real text looks like, and
    // where it sits structurally, to trace the exact retrieval-path
    // question ("where did traversal stop").
    const targetRef = f.sourceCitation.split("::")[1];
    if (targetRef) {
      const targetNode = index.getNodeByRef(label, targetRef);
      if (targetNode) {
        console.log(`Target node ${targetRef}: parent=${targetNode.parentSectionRef}, type=${targetNode.nodeType}, children=${index.getChildren(targetNode.nodeKey).map((n) => n.sectionRef).join(",")}`);
        console.log(`Target node OWN text (first 300 chars): ${index.getNodeText(targetNode.nodeKey, "OWN").slice(0, 300)}`);
      } else {
        console.log(`Target ref ${targetRef} has NO structural node in the index at all.`);
      }
    }
  }
}
