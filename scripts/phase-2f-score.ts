/**
 * Phase 2F - scores the sealed first-blind-run output (Stage 2/4/5
 * artifacts, hash-identified in phase-2f-first-blind-run-manifest.json)
 * against the independent ground truth authored after that seal. This
 * script only reads/compares - it makes no pipeline calls itself.
 */
import fs from "node:fs";
import path from "node:path";
import { ALL_COVENANT_UNITS, DOCUMENT_A_UNITS, DOCUMENT_B_UNITS, DOCUMENT_C_UNITS, DOCUMENT_D_UNITS } from "../tests/fixtures/unseen-packages/conmed-2025-credit-facility/human-ground-truth";
import type { DiscoveredCandidate } from "../lib/contract-model/compiler/discovery/types";

const OUT_DIR = path.join(__dirname, "..", "tests", "fixtures", "unseen-packages", "phase-2f-freeze");

const candidates: DiscoveredCandidate[] = JSON.parse(fs.readFileSync(path.join(OUT_DIR, "phase-2f-stage2-discovery-candidates.json"), "utf-8"));
const findings: Array<{ documentId: string; findingType: string; materiality: string; sourceCitation?: string }> = JSON.parse(fs.readFileSync(path.join(OUT_DIR, "phase-2f-stage5-audit-findings.json"), "utf-8"));

function normalizeRef(ref: string): string {
  return ref.replace(/^SECTION\s*/i, "").replace(/\s+/g, "").toUpperCase();
}

function candidateCoversRef(documentId: string, sectionRef: string): DiscoveredCandidate[] {
  const norm = normalizeRef(sectionRef);
  return candidates.filter((c) => c.documentId === documentId && (normalizeRef(c.normalizedSourceRef) === norm || normalizeRef(c.normalizedSourceRef).startsWith(norm + "(")));
}

// --- Document A: covenant-bearing SECTION recall (task §15) ---
const docASectionUnits = DOCUMENT_A_UNITS.filter((u) => !u.isBasketLevel && u.sourceSectionRef !== "7.7");
let sectionsFound = 0;
const sectionMisses: string[] = [];
for (const u of docASectionUnits) {
  const hits = candidateCoversRef(u.documentId, u.sourceSectionRef);
  if (hits.length > 0) sectionsFound++;
  else sectionMisses.push(u.sourceSectionRef);
}

// --- Document A: basket-level recall (representative sample, task §15) ---
const docABaskets = DOCUMENT_A_UNITS.filter((u) => u.isBasketLevel);
let basketsFound = 0;
const basketMisses: string[] = [];
for (const u of docABaskets) {
  const hits = candidateCoversRef(u.documentId, u.sourceSectionRef);
  if (hits.length > 0) basketsFound++;
  else basketMisses.push(u.sourceSectionRef);
}

// --- Family recall across all MATERIAL Document A units (section-level) ---
const familySet = new Set(docASectionUnits.map((u) => u.family));
const familyRecall: Record<string, { expected: number; found: number }> = {};
for (const fam of familySet) familyRecall[fam] = { expected: 0, found: 0 };
for (const u of docASectionUnits) {
  familyRecall[u.family]!.expected++;
  if (candidateCoversRef(u.documentId, u.sourceSectionRef).length > 0) familyRecall[u.family]!.found++;
}

// --- Candidate precision proxy: candidates whose normalizedSourceRef corresponds to a real Article VII section (7.1-7.17, excluding 7.7) ---
const realSectionNumbers = new Set(docASectionUnits.map((u) => u.sourceSectionRef));
function isPlausibleArticleViiRef(ref: string): boolean {
  const m = /^7\.(\d{1,2})/.exec(ref);
  if (!m) return false;
  const sectionRef = `7.${m[1]}`;
  return realSectionNumbers.has(sectionRef);
}
const docACandidates = candidates.filter((c) => c.documentId === "conmed-doc-a-eighth-ar-credit-agreement");
const plausibleCandidates = docACandidates.filter((c) => isPlausibleArticleViiRef(c.normalizedSourceRef));

// --- Documents B/C/D: zero-candidate confirmation ---
const docBCandidates = candidates.filter((c) => c.documentId === "conmed-doc-b-guarantee-collateral-agreement");
const docCCandidates = candidates.filter((c) => c.documentId === "conmed-doc-c-second-amendment-2022");
const docDCandidates = candidates.filter((c) => c.documentId === "conmed-doc-d-first-omnibus-amendment-2026");

// --- Auditor: findings attributed per document vs ground truth material unit count ---
const findingsByDoc: Record<string, number> = {};
for (const f of findings) findingsByDoc[f.documentId] = (findingsByDoc[f.documentId] ?? 0) + 1;

const summary = {
  scoreId: "PHASE_2F_SCORE",
  generatedAt: new Date().toISOString(),
  documentA: {
    sectionRecall: { expected: docASectionUnits.length, found: sectionsFound, recall: Number((sectionsFound / docASectionUnits.length).toFixed(4)), misses: sectionMisses },
    basketRecall: { expected: docABaskets.length, found: basketsFound, recall: Number((basketsFound / docABaskets.length).toFixed(4)), misses: basketMisses },
    familyRecall: Object.fromEntries(Object.entries(familyRecall).map(([k, v]) => [k, { ...v, recall: v.expected > 0 ? Number((v.found / v.expected).toFixed(4)) : null }])),
    candidatePrecisionProxy: { totalCandidates: docACandidates.length, plausibleCandidates: plausibleCandidates.length, precision: Number((plausibleCandidates.length / docACandidates.length).toFixed(4)) },
  },
  documentB: { groundTruthUnits: DOCUMENT_B_UNITS.length, discoveredCandidates: docBCandidates.length, auditFindings: findingsByDoc["conmed-doc-b-guarantee-collateral-agreement"] ?? 0 },
  documentC: { groundTruthUnits: DOCUMENT_C_UNITS.length, discoveredCandidates: docCCandidates.length, auditFindings: findingsByDoc["conmed-doc-c-second-amendment-2022"] ?? 0 },
  documentD: { groundTruthUnits: DOCUMENT_D_UNITS.length, discoveredCandidates: docDCandidates.length, auditFindings: findingsByDoc["conmed-doc-d-first-omnibus-amendment-2026"] ?? 0 },
  dangerousUnflaggedOmissionCandidates: [
    { document: "conmed-doc-b-guarantee-collateral-agreement", groundTruthMaterialUnits: DOCUMENT_B_UNITS.filter((u) => u.materiality === "MATERIAL").length, discoveredCandidates: docBCandidates.length, auditorFindingsForThisDoc: findingsByDoc["conmed-doc-b-guarantee-collateral-agreement"] ?? 0, note: "Auditor DID surface 116 findings for Document B (its own independent region inventory reached it even though Phase 2B's discovery crashed) - primary system silent, but auditor caught it. Not a fully unflagged omission." },
    { document: "conmed-doc-c-second-amendment-2022", groundTruthMaterialUnits: DOCUMENT_C_UNITS.filter((u) => u.materiality === "MATERIAL").length, discoveredCandidates: docCCandidates.length, auditorFindingsForThisDoc: findingsByDoc["conmed-doc-c-second-amendment-2022"] ?? 0, note: "Zero candidates AND zero audit findings - fully unflagged." },
    { document: "conmed-doc-d-first-omnibus-amendment-2026", groundTruthMaterialUnits: DOCUMENT_D_UNITS.filter((u) => u.materiality === "MATERIAL").length, discoveredCandidates: docDCandidates.length, auditorFindingsForThisDoc: findingsByDoc["conmed-doc-d-first-omnibus-amendment-2026"] ?? 0, note: "Zero candidates AND zero audit findings - fully unflagged." },
  ],
};

fs.writeFileSync(path.join(OUT_DIR, "phase-2f-score-summary.json"), JSON.stringify(summary, null, 2));
console.log(JSON.stringify(summary, null, 2));
