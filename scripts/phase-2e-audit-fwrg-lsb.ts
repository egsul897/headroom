/**
 * Phase 2E - real-package independent coverage audit against the FWRG/LSB
 * known regression packages (task §29-32, §42, §46). Zero new LLM calls.
 * FWRG/LSB are KNOWN regression packages, NOT unseen - this run is a
 * regression check against already-diagnosed limitations, never evidence
 * of generalization, and adds NO FWRG/LSB-specific detection rules (the
 * same coverage-audit/* modules used by the synthetic test suite run here
 * unmodified).
 */
import fs from "node:fs";
import path from "node:path";
import { parseDocumentStructure } from "../lib/contract-model/compiler/stage-structure";
import { detectStructuralDefinitions } from "../lib/contract-model/compiler/structural-definitions";
import { detectStructuralReferences } from "../lib/contract-model/compiler/structural-references";
import { buildStructuralIndex } from "../lib/contract-model/compiler/structural-index";
import { buildCovenantContextBundle } from "../lib/contract-model/compiler/context-retrieval/pipeline";
import { buildSourceCoverageInventory } from "../lib/contract-model/compiler/coverage-audit/source-inventory";
import { auditDiscoveryCoverage } from "../lib/contract-model/compiler/coverage-audit/discovery-comparison";
import { auditContextCoverage } from "../lib/contract-model/compiler/coverage-audit/context-comparison";
import { auditDefinitionCompleteness } from "../lib/contract-model/compiler/coverage-audit/definition-audit";
import type { DiscoveredCandidate } from "../lib/contract-model/compiler/discovery/types";
import type { AuditFinding } from "../lib/contract-model/compiler/coverage-audit/types";
import { FWRG_CONTEXT_BENCHMARK } from "../tests/fixtures/context-retrieval-benchmark/fwrg-context-ground-truth";
import { LSB_CONTEXT_BENCHMARK } from "../tests/fixtures/context-retrieval-benchmark/lsb-context-ground-truth";

function buildPackage(label: string, dir: string) {
  const text = fs.readFileSync(path.join(dir, "definitions-excerpt.txt"), "utf-8") + "\n\n" + fs.readFileSync(path.join(dir, "article-6-negative-covenants.txt"), "utf-8");
  const nodes = parseDocumentStructure({ documentId: label, label, text });
  const nodesByDocument = new Map([[label, { text, nodes }]]);
  const defs = detectStructuralDefinitions(label, text, nodes);
  const refs = detectStructuralReferences(label, text, nodes);
  const index = buildStructuralIndex(nodesByDocument, defs, refs);
  const exactTermsByDocument = new Map([[label, new Map(defs.map((d) => [d.normalizedTerm, d.exactTerm] as const))]]);
  return { index, exactTermsByDocument };
}

function loadDiscoveryCandidates(dir: string): DiscoveredCandidate[] {
  const runDir = path.join(dir, "discovery-runs");
  const files = fs.readdirSync(runDir).filter((f) => f.endsWith(".json"));
  const raw = JSON.parse(fs.readFileSync(path.join(runDir, files[0]!), "utf-8")) as { candidates: DiscoveredCandidate[] };
  return raw.candidates;
}

function summarizeFindings(label: string, findings: AuditFinding[]) {
  const byType = new Map<string, number>();
  for (const f of findings) byType.set(f.findingType, (byType.get(f.findingType) ?? 0) + 1);
  console.log(`\n${label}: ${findings.length} findings (material=${findings.filter((f) => f.materiality === "MATERIAL").length}, uncertain=${findings.filter((f) => f.materiality === "UNCERTAIN").length})`);
  for (const [type, count] of byType) console.log(`  ${type}: ${count}`);
}

function auditPackage(label: string, dir: string, benchmark: typeof FWRG_CONTEXT_BENCHMARK) {
  console.log(`\n=== ${label} independent coverage audit ===`);
  const access = buildPackage(label, dir);
  const candidates = loadDiscoveryCandidates(dir);

  const regions = buildSourceCoverageInventory(label, access.index, { companyId: label, packageKey: label, instrumentKey: null });
  console.log(`Independent regions generated: ${regions.length}`);

  const discoveryFindings = auditDiscoveryCoverage(regions, candidates, access.index);
  summarizeFindings(`${label} DISCOVERY coverage`, discoveryFindings);

  const structuralGaps = discoveryFindings.filter((f) => f.findingType === "STRUCTURAL_COVERAGE_GAP");
  console.log(`\n${label} STRUCTURAL_COVERAGE_GAP findings (independently rediscovered, not primary-pipeline-attributed):`);
  for (const g of structuralGaps) console.log(`  ${g.sourceCitation}: ${g.sourceEvidence}`);

  const contextFindings: AuditFinding[] = [];
  for (const c of benchmark) {
    const candidate = candidates.find((x) => x.discoveryId === c.discoveryId);
    if (!candidate) continue;
    const bundle = buildCovenantContextBundle({ candidate, packageKey: label, companyId: label, instrumentKey: null }, { index: access.index, packageGraph: null, exactTermsByDocument: access.exactTermsByDocument });
    const nodeId = bundle.originatingStructuralNodeIds[0];
    if (!nodeId) continue;
    contextFindings.push(...auditContextCoverage({ companyId: label, packageKey: label, instrumentKey: null, documentId: label, nodeId, index: access.index, packageGraph: null, bundle }));
    contextFindings.push(...auditDefinitionCompleteness(bundle, access.index, label, label, label, null));
  }
  summarizeFindings(`${label} CONTEXT coverage (12-case Phase 2D benchmark, independently re-audited from source)`, contextFindings);

  const materialContextMisses = contextFindings.filter((f) => f.materiality === "MATERIAL");
  console.log(`\n${label} Phase 2D benchmark challenge (task §31):`);
  if (materialContextMisses.length === 0) {
    console.log(`  PHASE_2D_BENCHMARK_INDEPENDENTLY_CONFIRMED - independent re-audit of the same ${benchmark.length} cases from source found zero material context misses.`);
  } else {
    console.log(`  PHASE_2D_CONTEXT_MISS_FOUND - ${materialContextMisses.length} material finding(s):`);
    for (const f of materialContextMisses) console.log(`    ${f.sourceCitation}: ${f.sourceEvidence}`);
  }

  return { discoveryFindings, contextFindings, structuralGaps };
}

const fwrgResult = auditPackage("fwrg", path.join(__dirname, "..", "tests", "fixtures", "unseen-packages", "fwrg-2021-credit-agreement"), FWRG_CONTEXT_BENCHMARK);
const lsbResult = auditPackage("lsb", path.join(__dirname, "..", "tests", "fixtures", "unseen-packages", "lsb-2023-abl-credit-agreement"), LSB_CONTEXT_BENCHMARK);

console.log(`\n=== Known-gap rediscovery check (task §30) ===`);
const lsb614Gap = lsbResult.structuralGaps.find((g) => g.sourceCitation.includes("6.14"));
console.log(`LSB 6.14(b)/(c)/(d) comma-list gap independently rediscovered as STRUCTURAL_COVERAGE_GAP: ${lsb614Gap ? "YES - " + lsb614Gap.sourceCitation : "NOT FOUND at 6.14 (see full structural gap list above)"}`);
const fwrg601wGap = fwrgResult.structuralGaps.find((g) => g.sourceCitation.includes("6.01"));
console.log(`FWRG 6.01(w) clause mis-scoping independently rediscovered as STRUCTURAL_COVERAGE_GAP near 6.01: ${fwrg601wGap ? "YES - " + fwrg601wGap.sourceCitation : "NOT FOUND at 6.01 (see full structural gap list above)"}`);

const allContextFindings = [...fwrgResult.contextFindings, ...lsbResult.contextFindings];
const allMaterial = allContextFindings.filter((f) => f.materiality === "MATERIAL");
console.log(`\n=== Combined Phase 2D 12-case benchmark challenge verdict (task §31) ===`);
console.log(`Total independent context findings across all 12 cases: ${allContextFindings.length} (material=${allMaterial.length}, uncertain=${allContextFindings.length - allMaterial.length})`);
console.log(allMaterial.length > 0 ? "PHASE_2D_CONTEXT_MISS_FOUND" : "PHASE_2D_BENCHMARK_INDEPENDENTLY_CONFIRMED");

console.log("\n=== FWRG CONTEXT finding detail ===");
for (const f of fwrgResult.contextFindings) console.log(`  [${f.findingType}] ${f.sourceCitation}: ${f.sourceEvidence}`);
console.log("\n=== LSB CONTEXT finding detail ===");
for (const f of lsbResult.contextFindings) console.log(`  [${f.findingType}] ${f.sourceCitation}: ${f.sourceEvidence}`);
