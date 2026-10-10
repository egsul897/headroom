/**
 * Diagnostic only — measures Phase 2D context sufficiency on WOR body anchors.
 * Not part of the sealed holdout legal-reference corpus.
 */
import { readFileSync } from "fs";
import { buildCovenantContextBundle } from "../../lib/contract-model/compiler/context-retrieval/pipeline";
import { resolveCanonicalBodyAnchor } from "../../lib/contract-model/compiler/context-retrieval/body-anchor";
import { buildPackageGraph } from "../../lib/contract-model/compiler/package-graph/pipeline";
import type { DiscoveredCandidate } from "../../lib/contract-model/compiler/discovery/types";
import { buildExactTermsByDocument, buildTestIndex } from "../../tests/contract-model/context-retrieval-test-utils";

const base = "tests/fixtures/unseen-packages/wor-2023-2026-credit-facility/extracted-text";
const docs = [
  { documentId: "doc-a", label: "Fourth AR", text: readFileSync(`${base}/doc-a-2023-09-27-fourth-ar-credit-agreement.txt`, "utf8") },
  { documentId: "doc-b", label: "Fifth AR", text: readFileSync(`${base}/doc-b-2026-08-31-fifth-ar-credit-agreement.txt`, "utf8") },
];
const index = buildTestIndex(docs);
const packageGraph = buildPackageGraph("co", "wor", docs);
const exactTermsByDocument = buildExactTermsByDocument(docs);

const TERM_HINTS: Record<string, string> = {
  "WOR-B-PERM-LIENS": "Permitted Liens",
  "WOR-B-DEF-ICR": "Interest Coverage Ratio",
  "WOR-B-DEF-EBITDA": "Consolidated EBITDA",
  "WOR-B-FACILITY": "Aggregate Commitment",
};

function probe(documentId: string, sectionRef: string, family: string, evidenceSignals: string[]): ReturnType<typeof buildCovenantContextBundle> {
  const resolution = resolveCanonicalBodyAnchor(index, documentId, sectionRef);
  const primary = resolution.selected;
  if (!primary) throw new Error(`no body anchor for ${sectionRef}: ${resolution.reason}`);
  const candidate: DiscoveredCandidate = {
    discoveryId: `probe:${documentId}:${primary.nodeId}`,
    documentId,
    structuralNodeKeys: [primary.nodeKey],
    structuralNodeIds: [primary.nodeId],
    normalizedSourceRef: sectionRef,
    families: [family as never],
    role: "GENERAL_PROHIBITION",
    roleRaw: "GENERAL_PROHIBITION",
    roleNormalizationStatus: "VALID_CANONICAL",
    familiesRaw: [family],
    familiesNormalizationStatus: "VALID_CANONICAL",
    description: evidenceSignals.find((s) => s.startsWith("DEFINED_TERM:"))?.replace("DEFINED_TERM:", "Definition of ") ?? `Independent GT probe for ${sectionRef}`,
    multipleRulesLikely: true,
    definedTermDependencyLikely: true,
    discoveryMethods: ["DETERMINISTIC_SIGNAL"],
    evidenceSignals,
    reviewStatus: "AUTO_ACCEPTED",
    confidence: null,
    sourceCitation: `${documentId} §${sectionRef}`,
    discoveryRunVersion: "probe",
    supersessionStatus: "UNKNOWN_SUPERSESSION_STATUS",
    supersessionReason: "probe",
  };
  return buildCovenantContextBundle({ candidate, packageKey: "wor", companyId: "co", instrumentKey: null }, { index, packageGraph, exactTermsByDocument });
}

const legal = JSON.parse(readFileSync("docs/headroom-5-independent-holdout/05-legal-reference-answers.json", "utf8")) as {
  clauses: Array<{ clauseId: string; documentId: string; sectionRef: string; family: string }>;
};

let sufficient = 0;
let budget = 0;
let incomplete = 0;
let review = 0;
for (const c of legal.clauses) {
  const signals = ["gt_probe"];
  if (TERM_HINTS[c.clauseId]) signals.push(`DEFINED_TERM:${TERM_HINTS[c.clauseId]}`);
  const fam = c.family === "DEFINITION" ? "DEFINITIONS_CALCULATION_RULES" : c.family;
  const b = probe(c.documentId, c.sectionRef, fam, signals);
  if (b.sufficiencyState === "SUFFICIENT") sufficient++;
  else if (b.sufficiencyState === "BUDGET_EXCEEDED") budget++;
  else if (b.sufficiencyState === "INCOMPLETE") incomplete++;
  else if (b.sufficiencyState === "REVIEW_REQUIRED") review++;
  const depthStops = (b.retrievalStops ?? []).filter((r) => r.reason === "DEPTH_LIMIT_WITH_UNRETRIEVED_DEPENDENCIES");
  const medHigh = b.unresolvedDependencies.filter((u) => u.severity === "MEDIUM" || u.severity === "HIGH");
  console.log(
    c.clauseId.padEnd(22),
    b.sufficiencyState.padEnd(16),
    `defs=${b.items.filter((i) => i.type === "DEFINITION" || i.type === "DEFINITION_DEPENDENCY").length}`,
    `items=${b.items.length}`,
    medHigh.length ? medHigh.map((u) => `${u.severity}:${u.dependencyType}:${u.sourceText}`).slice(0, 3).join(" | ") : "",
    depthStops[0] ? `\n  depth: ${depthStops[0].detail.slice(0, 160)}` : "",
  );
}
console.log(`\nSUMMARY denom=10 SUFFICIENT=${sufficient} REVIEW_REQUIRED=${review} BUDGET_EXCEEDED=${budget} INCOMPLETE=${incomplete}`);
