/**
 * Foundation Audit (adversarial) - Section 13 live retest probe.
 * READ-ONLY exploration script. Not part of any production pipeline.
 * Constructs a synthetic document where one real section heading is
 * rendered case-folded (a plausible PDF/HTML extraction artifact - loss of
 * capitalization on a heading run together with the end of the prior
 * paragraph) so that NONE of stage-structure.ts's heading patterns match
 * it, and checks:
 *   1. Does the primary discovery signal pass (pass-a-signals.ts) produce
 *      a distinct, correctly-cited candidate for the swallowed section?
 *   2. Does the "independent" coverage auditor's raw-source-fallback path
 *      (structural-coverage.ts + raw-source-fallback.ts) notice anything
 *      is wrong?
 *   3. Does the auditor's own structural inventory (source-inventory.ts)
 *      notice anything is wrong?
 */
import { parseDocumentStructure } from "../lib/contract-model/compiler/stage-structure";
import { buildStructuralIndex } from "../lib/contract-model/compiler/structural-index";
import { runPassADeterministicSignals } from "../lib/contract-model/compiler/discovery/pass-a-signals";
import { computeStructuralCoverage } from "../lib/contract-model/compiler/structural-coverage";
import { partitionUncoveredSpan, scanRawSourceRegion, buildRawSourceFallbackFindings } from "../lib/contract-model/compiler/coverage-audit/raw-source-fallback";
import { buildSourceCoverageInventory } from "../lib/contract-model/compiler/coverage-audit/source-inventory";

const documentId = "shared-substrate-probe-doc";

// Section 6.04 is a normal, well-formed heading. Section 6.05's own heading
// is rendered case-folded and run together with the end of 6.04's own text
// with NO newline break - a real, plausible extraction artifact (a PDF
// text layer that drops a heading run's own bold/caps styling, or an HTML
// extractor that collapses a <b>SECTION 6.05</b> tag's own text run into
// the surrounding paragraph without preserving a line break). Section 6.06
// is again normal and well-formed.
const text = `
ARTICLE VI COVENANTS

Section 6.04 Limitation on Distributions . Neither party shall make any Restricted Payment except a Restricted Payment permitted under this Agreement. section 6.05 limitation on affiliate transactions the Borrower will not enter into any transaction with an Affiliate involving $5,000,000 or more without the approval of a majority of disinterested directors, except transactions permitted under this Agreement.

Section 6.06 Liens . Neither party shall grant Liens except Permitted Liens.
`.trim();

const nodes = parseDocumentStructure({ documentId, label: documentId, text });
console.log("=== Parsed nodes ===");
for (const n of nodes) {
  console.log(`${n.nodeType} sectionRef=${n.sectionRef} heading=${JSON.stringify(n.heading)} charStart=${n.charStart} charEnd=${n.charEnd}`);
}

const index = buildStructuralIndex(new Map([[documentId, { text, nodes }]]), [], []);

console.log("\n=== resolveUniqueNodeByRef for 6.05 ===");
console.log(index.resolveUniqueNodeByRef(documentId, "6.05"));

console.log("\n=== 6.04's OWN text (does it silently absorb 6.05's real content?) ===");
const r604 = index.resolveUniqueNodeByRef(documentId, "6.04");
if (r604.status === "UNIQUE") {
  console.log(JSON.stringify(index.getNodeText(r604.node.nodeId, "OWN")));
}

console.log("\n=== Primary discovery: Pass A candidates ===");
const candidates = runPassADeterministicSignals(documentId, index);
for (const c of candidates) {
  console.log(`sectionRef=${c.sectionRef} signals=${JSON.stringify(c.signals)}`);
}
const has605Candidate = candidates.some((c) => c.sectionRef === "6.05");
console.log(`Distinct candidate exists for 6.05? ${has605Candidate}`);
const dollarSignalUnder604 = candidates.find((c) => c.sectionRef === "6.04")?.signals.includes("dollar_value");
console.log(`Does the 6.04 candidate's signal list include a dollar_value signal that actually belongs to 6.05's real text? ${dollarSignalUnder604}`);

console.log("\n=== structural-coverage.ts health ===");
const coverage = computeStructuralCoverage(documentId, text, nodes);
console.log(JSON.stringify({ health: coverage.health, coveragePercent: coverage.coveragePercent, topLevelNodeCount: coverage.topLevelNodeCount, significantUncoveredSpans: coverage.significantUncoveredSpans.length, healthReasons: coverage.healthReasons }, null, 2));

console.log("\n=== raw-source-fallback: would it fire at all? ===");
const wouldSkip = coverage.significantUncoveredSpans.length === 0 && coverage.health === "STRUCTURE_HEALTHY";
console.log(`pipeline.ts's own skip condition (coverage.significantUncoveredSpans.length === 0 && health === STRUCTURE_HEALTHY) evaluates to: ${wouldSkip} (true means the fallback NEVER RUNS for this document at all)`);

if (!wouldSkip) {
  const scanResults = coverage.significantUncoveredSpans.flatMap((span) => partitionUncoveredSpan(documentId, text, span, "probe").map(scanRawSourceRegion));
  const findings = buildRawSourceFallbackFindings({ companyId: "probe-co", packageKey: "probe-pkg", instrumentKey: null, documentId, healthReasons: coverage.healthReasons, includeDocumentLevelFinding: coverage.health !== "STRUCTURE_HEALTHY", scanResults });
  console.log(`raw-source-fallback findings: ${findings.length}`);
  for (const f of findings) console.log(` - ${f.findingType} materiality=${f.materiality} citation=${f.sourceCitation}`);
}

console.log("\n=== auditor's own independent structural inventory (source-inventory.ts) ===");
const regions = buildSourceCoverageInventory(documentId, index, { companyId: "probe-co", packageKey: "probe-pkg", instrumentKey: null });
for (const r of regions) {
  console.log(` - sectionRef=${r.sectionRef} signals=${JSON.stringify(r.detectedSignals)} possibleUnstructuredMultiItem=${r.possibleUnstructuredMultiItem}`);
}
const auditorHas605Region = regions.some((r) => r.sectionRef === "6.05");
console.log(`Does the independent auditor's own structural inventory produce a distinct region for 6.05? ${auditorHas605Region}`);

console.log("\n=== SUMMARY ===");
console.log(JSON.stringify({
  section605NodeExists: index.resolveUniqueNodeByRef(documentId, "6.05").status !== "NOT_FOUND",
  section605DiscoveredAsDistinctPrimaryCandidate: has605Candidate,
  section605MisattributedDollarSignalUnder604: dollarSignalUnder604,
  documentHealthLooksFine: coverage.health === "STRUCTURE_HEALTHY",
  rawSourceFallbackWouldRunAtAll: !wouldSkip,
  auditorIndependentInventoryHasDistinct605Region: auditorHas605Region,
}, null, 2));
