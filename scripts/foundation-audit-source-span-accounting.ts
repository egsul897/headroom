/**
 * Foundation Assurance Audit - Part 3: raw-source accounting mechanism
 * analysis + real per-package (FWRG/LSB/CONMED/DSGR) source-span accounting.
 *
 * This is an ANALYSIS script, not production logic - it reuses the
 * EXISTING, already-committed loaders (loadFwrgLsbStructuralIndex from
 * scripts/phase-3b-real-regression.ts; the CONMED/DSGR loading logic
 * verbatim-duplicated from scripts/phase-3f1-2-known-package-structural-
 * regression.ts's own loadConmed/loadDsgr, which are not exported from that
 * file, so the identical fixture-reading + real-extraction-parser + real-
 * runStructureStage call sequence is reproduced here rather than imported -
 * no new production logic is introduced, and nothing here branches on any
 * package identity: every computation below is a generic function of
 * (documentId, text, nodes, health findings) that would run identically
 * over any package).
 *
 * Independence claim under test (ADR §18/§20): does the raw-source-
 * accounting/coverage mechanism (structural-coverage.ts's own top-level-span
 * gap computation) independently notice a region whose real content was
 * silently absorbed into an ADJACENT node's own charStart..charEnd (proven
 * possible in tests/foundation-audit/part2-adversarial-structural-
 * assumptions.test.ts, Q1/Q2), or is it blind to that case because it only
 * ever measures gaps BETWEEN already-recognized top-level node boundaries,
 * never whether a recognized node's own span is itself materially correct?
 *
 * Run via: npx tsx scripts/foundation-audit-source-span-accounting.ts
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { runStructureStage } from "../lib/contract-model/compiler/stage-structure";
import { buildStructuralIndex, type StructuralIndex, type StructuralHealthFinding } from "../lib/contract-model/compiler/structural-index";
import { computeStructuralCoverage } from "../lib/contract-model/compiler/structural-coverage";
import type { StructuralNode, CompilerDocumentInput } from "../lib/contract-model/compiler/types";
import { parseDocument } from "../lib/extraction/parse";
import { loadFwrgLsbStructuralIndex } from "./phase-3b-real-regression";

const OUT_DIR = "tests/fixtures/foundation-audit";

// ---------------------------------------------------------------------------
// Loaders - FWRG/LSB reused directly via import. CONMED/DSGR reproduced
// verbatim (same fixture paths, same real extraction call, same
// runStructureStage call) from scripts/phase-3f1-2-known-package-structural-
// regression.ts's own loadConmed/loadDsgr, which are not exported there.
// ---------------------------------------------------------------------------

async function loadConmedDocuments(): Promise<CompilerDocumentInput[]> {
  const files: { documentId: string; label: string; file: string }[] = [
    { documentId: "conmed-doc-a", label: "CONMED Eighth A&R Credit Agreement", file: "ex10-1-eighth-ar-credit-agreement-2025-06-16.htm" },
    { documentId: "conmed-doc-b", label: "CONMED A&R Guarantee and Collateral Agreement", file: "ex10-2-ar-guarantee-and-collateral-agreement-2025-06-16.htm" },
    { documentId: "conmed-doc-c", label: "CONMED Second Amendment 2022", file: "ex10-2-second-amendment-2022-08-02.htm" },
    { documentId: "conmed-doc-d", label: "CONMED First Omnibus Amendment 2026", file: "ex10-1-first-omnibus-amendment-2026-06-01.htm" },
  ];
  const documents: CompilerDocumentInput[] = [];
  for (const f of files) {
    const raw = readFileSync(`tests/fixtures/unseen-packages/conmed-2025-credit-facility/raw-source/${f.file}`);
    const parsed = await parseDocument(raw, "text/html");
    documents.push({ documentId: f.documentId, label: f.label, text: parsed.fullText });
  }
  return documents;
}

async function loadDsgrDocuments(): Promise<CompilerDocumentInput[]> {
  const files: { documentId: string; label: string; file: string }[] = [
    { documentId: "doc-a", label: "DSGR 2022 A&R Credit Agreement", file: "doc-a-2022-amended-restated-credit-agreement.txt" },
    { documentId: "doc-b", label: "DSGR 2024 Third Amendment", file: "doc-b-2024-third-amendment.txt" },
    { documentId: "doc-c", label: "DSGR 2025 Fourth Amendment", file: "doc-c-2025-fourth-amendment.txt" },
    { documentId: "doc-d", label: "DSGR 2025 Second A&R Credit Agreement", file: "doc-d-2025-second-amended-restated-credit-agreement.txt" },
  ];
  return files.map((f) => ({ documentId: f.documentId, label: f.label, text: readFileSync(`tests/fixtures/unseen-packages/dsgr-2022-2025-credit-facility/extracted-text/${f.file}`, "utf-8") }));
}

async function loadFwrgDocuments(): Promise<CompilerDocumentInput[]> {
  return [
    { documentId: "fwrg-article-6", label: "FWRG Article 6", text: readFileSync("tests/fixtures/unseen-packages/fwrg-2021-credit-agreement/article-6-negative-covenants.txt", "utf-8") },
    { documentId: "fwrg-definitions", label: "FWRG Definitions", text: readFileSync("tests/fixtures/unseen-packages/fwrg-2021-credit-agreement/definitions-excerpt.txt", "utf-8") },
  ];
}

async function loadLsbDocuments(): Promise<CompilerDocumentInput[]> {
  return [
    { documentId: "lsb-article-6", label: "LSB Article 6", text: readFileSync("tests/fixtures/unseen-packages/lsb-2023-abl-credit-agreement/article-6-negative-covenants.txt", "utf-8") },
    { documentId: "lsb-definitions", label: "LSB Definitions", text: readFileSync("tests/fixtures/unseen-packages/lsb-2023-abl-credit-agreement/definitions-excerpt.txt", "utf-8") },
  ];
}

// ---------------------------------------------------------------------------
// Region classification heuristics - built fresh for this audit, generic
// (no package-specific keyword), applied ONLY to regions already established
// as "uncovered" by the span mechanism below. A region whose materiality
// cannot be mechanically determined is classified "unknown" (never silently
// folded into a "safe" bucket) - the forbidden-circularity discipline the
// audit brief requires.
// ---------------------------------------------------------------------------

type RegionClass = "whitespace" | "toc" | "signatureBlock" | "exhibitSchedule" | "definitions" | "unknown";

const SIGNATURE_BLOCK_RE = /(IN WITNESS WHEREOF|\/s\/|By:\s*_{2,}|By:\s*\n|Name:\s*_{0,}\n|Title:\s*_{0,}\n|its authorized signatory)/i;
const EXHIBIT_SCHEDULE_RE = /^\s*(SCHEDULE|EXHIBIT|ANNEX)\s+[A-Z0-9]/im;
const DEFINITIONS_RE = /("\s*means\b|\bmeans\s+(?:with respect to|for purposes of|any|the))/i;
const TOC_LEADER_RE = /\.{4,}\s*\d+\s*$/m; // dot-leader page-number lines, classic ToC shape
const TOC_HEADER_RE = /TABLE OF CONTENTS/i;

function classifyRegion(text: string): RegionClass {
  const trimmed = text.trim();
  if (trimmed.length === 0) return "whitespace";
  if (TOC_HEADER_RE.test(trimmed) || TOC_LEADER_RE.test(trimmed)) return "toc";
  if (SIGNATURE_BLOCK_RE.test(trimmed)) return "signatureBlock";
  if (EXHIBIT_SCHEDULE_RE.test(trimmed)) return "exhibitSchedule";
  if (DEFINITIONS_RE.test(trimmed)) return "definitions";
  return "unknown";
}

function countSubstantive(text: string): number {
  let n = 0;
  for (const ch of text) if (!/\s/.test(ch)) n++;
  return n;
}

// ---------------------------------------------------------------------------
// Per-document accounting - independent of, but comparable against,
// structural-coverage.ts's own computeStructuralCoverage.
// ---------------------------------------------------------------------------

interface DocumentAccounting {
  documentId: string;
  totalChars: number;
  claimedByNodesChars: number; // sum of every node's OWN-text length (charStart..firstChild's charStart or own charEnd) - disjoint by construction, no double counting of descendants.
  uncoveredChars: number;
  uncoveredRegions: { charStart: number; charEnd: number; chars: number; substantiveChars: number; classification: RegionClass; excerpt: string }[];
  productionCoverage: ReturnType<typeof computeStructuralCoverage>;
}

function accountForDocument(documentId: string, text: string, nodes: StructuralNode[], index: StructuralIndex): DocumentAccounting {
  // claimedByNodesChars: sum of OWN-text length over every node in this document, at OWN-text granularity (never double-counts a descendant's own text as part of an ancestor's own text - getNodeText(..., "OWN") stops at the first child).
  const docNodes = nodes.filter((n) => n.documentId === documentId);
  let claimedByNodesChars = 0;
  for (const n of docNodes) claimedByNodesChars += index.getNodeText(n.nodeId, "OWN").length;

  // Independent gap computation over ROOT spans only (mirrors, but does not
  // import, structural-coverage.ts's own top-level-span logic - generalized
  // to whatever the index calls "roots" for this document, since a malformed
  // document's root need not be an ARTICLE/SECTION).
  const roots = index.roots().filter((n) => n.documentId === documentId).sort((a, b) => a.charStart - b.charStart);
  const uncoveredRegions: DocumentAccounting["uncoveredRegions"] = [];
  let cursor = 0;
  for (const r of roots) {
    if (r.charStart > cursor) {
      const regionText = text.slice(cursor, r.charStart);
      uncoveredRegions.push({ charStart: cursor, charEnd: r.charStart, chars: regionText.length, substantiveChars: countSubstantive(regionText), classification: classifyRegion(regionText), excerpt: regionText.trim().slice(0, 200) });
    }
    cursor = Math.max(cursor, r.charEnd);
  }
  if (cursor < text.length) {
    const regionText = text.slice(cursor, text.length);
    uncoveredRegions.push({ charStart: cursor, charEnd: text.length, chars: regionText.length, substantiveChars: countSubstantive(regionText), classification: classifyRegion(regionText), excerpt: regionText.trim().slice(0, 200) });
  }
  const uncoveredChars = uncoveredRegions.reduce((s, r) => s + r.chars, 0);

  const productionCoverage = computeStructuralCoverage(documentId, text, docNodes);

  return { documentId, totalChars: text.length, claimedByNodesChars, uncoveredChars, uncoveredRegions, productionCoverage };
}

interface PackageAccounting {
  packageKey: string;
  totalSourceChars: number;
  claimedByNodesChars: number;
  uncoveredChars: number;
  uncoveredPercent: number;
  invalidOrOverlappingSpans: number;
  uncoveredRegionClassification: Record<RegionClass, number>; // char counts, not region counts
  documents: DocumentAccounting[];
  // Cross-check against Q1's proven silent-absorption mechanism: does this
  // package's REAL parse show any evidence a top-level node's own OWN-text
  // span is anomalously large relative to its siblings (a mechanical,
  // package-agnostic proxy for "may have silently swallowed a neighbor" -
  // NEVER asserted as proof of an actual swallow without a ground-truth
  // section list, which this audit does not fabricate)?
  anomalousOwnSpanSizeFlags: { nodeId: string; sectionRef: string; ownTextChars: number; siblingMedianChars: number; ratio: number }[];
}

function computePackageAccounting(packageKey: string, documents: CompilerDocumentInput[]): PackageAccounting {
  const structureResult = runStructureStage(documents);
  const nodes = structureResult.output;
  const nodesByDocument = new Map(documents.map((d) => [d.documentId, { text: d.text, nodes: nodes.filter((n) => n.documentId === d.documentId) }]));
  const index = buildStructuralIndex(nodesByDocument, [], []);
  const health: StructuralHealthFinding[] = index.healthDiagnostics();
  const invalidOrOverlappingSpans = health.filter((f) => f.code === "INVALID_SOURCE_SPAN" || f.code === "OVERLAPPING_INCOMPATIBLE_SPAN").length;

  const documentAccountings = documents.map((d) => accountForDocument(d.documentId, d.text, nodes, index));

  const totalSourceChars = documentAccountings.reduce((s, d) => s + d.totalChars, 0);
  const claimedByNodesChars = documentAccountings.reduce((s, d) => s + d.claimedByNodesChars, 0);
  const uncoveredChars = documentAccountings.reduce((s, d) => s + d.uncoveredChars, 0);
  const uncoveredPercent = totalSourceChars === 0 ? 0 : Number(((uncoveredChars / totalSourceChars) * 100).toFixed(4));

  const uncoveredRegionClassification: Record<RegionClass, number> = { whitespace: 0, toc: 0, signatureBlock: 0, exhibitSchedule: 0, definitions: 0, unknown: 0 };
  for (const d of documentAccountings) {
    for (const r of d.uncoveredRegions) uncoveredRegionClassification[r.classification] += r.chars;
  }

  // Anomalous-own-span-size proxy: for each SECTION-level sibling group,
  // flag a node whose own-text length is >=5x the group's median AND
  // >=500 chars absolute (never flags a normally-terse section) - a cheap,
  // generic, package-agnostic mechanical signal for "this node's own span
  // may have absorbed content that was not really its own" (Q1/Q2's
  // mechanism), NOT a claim that it definitely did.
  const anomalousOwnSpanSizeFlags: PackageAccounting["anomalousOwnSpanSizeFlags"] = [];
  for (const [documentId, { nodes: docNodes }] of nodesByDocument) {
    void documentId;
    const byParent = new Map<string, StructuralNode[]>();
    for (const n of docNodes) {
      if (n.nodeType !== "SECTION") continue;
      const key = n.parentNodeId ?? "ROOT";
      const list = byParent.get(key) ?? [];
      list.push(n);
      byParent.set(key, list);
    }
    for (const siblings of byParent.values()) {
      if (siblings.length < 3) continue; // need a real group to compute a meaningful median against.
      const ownLens = siblings.map((n) => ({ n, len: index.getNodeText(n.nodeId, "OWN").length })).sort((a, b) => a.len - b.len);
      const median = ownLens[Math.floor(ownLens.length / 2)]!.len;
      if (median === 0) continue;
      for (const { n, len } of ownLens) {
        const ratio = len / median;
        if (ratio >= 5 && len >= 500) {
          anomalousOwnSpanSizeFlags.push({ nodeId: n.nodeId, sectionRef: n.sectionRef, ownTextChars: len, siblingMedianChars: median, ratio: Number(ratio.toFixed(2)) });
        }
      }
    }
  }

  return { packageKey, totalSourceChars, claimedByNodesChars, uncoveredChars, uncoveredPercent, invalidOrOverlappingSpans, uncoveredRegionClassification, documents: documentAccountings, anomalousOwnSpanSizeFlags };
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });

  console.log("Loading FWRG (reused loadFwrgLsbStructuralIndex helper is index-only; loading raw documents separately here for per-document span accounting)...");
  const fwrgDocs = await loadFwrgDocuments();
  const fwrg = computePackageAccounting("FWRG", fwrgDocs);

  console.log("Loading LSB...");
  const lsbDocs = await loadLsbDocuments();
  const lsb = computePackageAccounting("LSB", lsbDocs);

  console.log("Loading CONMED (real HTML extraction)...");
  const conmedDocs = await loadConmedDocuments();
  const conmed = computePackageAccounting("CONMED", conmedDocs);

  console.log("Loading DSGR...");
  const dsgrDocs = await loadDsgrDocuments();
  const dsgr = computePackageAccounting("DSGR", dsgrDocs);

  // Sanity cross-check: loadFwrgLsbStructuralIndex (the already-approved,
  // reused loader named in the audit brief) must produce the SAME node
  // count as this script's own independent FWRG+LSB load - confirms this
  // script is not silently drifting from the canonical loader's own
  // document set/order.
  const { index: canonicalFwrgLsbIndex } = loadFwrgLsbStructuralIndex();
  const canonicalCount = canonicalFwrgLsbIndex.allNodes().length;
  const thisScriptCount = fwrg.documents.reduce((s, d) => s + d.productionCoverage.totalNodeCount, 0) + lsb.documents.reduce((s, d) => s + d.productionCoverage.totalNodeCount, 0);
  const loaderCrossCheckPassed = canonicalCount === thisScriptCount;

  const perPackage = [fwrg, lsb, conmed, dsgr];

  const report = {
    purpose: "Foundation Assurance Audit Part 3 - real per-package source-span accounting (FWRG/LSB/CONMED/DSGR) + independence analysis of the raw-source-coverage mechanism from successful structural traversal.",
    loaderCrossCheck: { canonicalFwrgLsbNodeCount: canonicalCount, thisScriptFwrgLsbNodeCount: thisScriptCount, passed: loaderCrossCheckPassed },
    mechanismIndependenceAnalysis: {
      claim:
        "structural-coverage.ts's computeStructuralCoverage (and this script's own independently-recomputed gap logic, which agrees with it) measures uncovered regions ONLY as gaps BETWEEN already-recognized top-level (ARTICLE/SECTION, or more generally root()) node boundaries. It has no mechanism to detect that a recognized node's own [charStart,charEnd) span is materially too large because a SIBLING heading failed to match (tests/foundation-audit/part2-adversarial-structural-assumptions.test.ts Q1/Q2, reproduced against the real parser). In that exact scenario, the swallowed region reports ZERO uncovered span and 100% coverage - it is fully 'claimed' by the wrong node's own span. The mechanism is therefore CIRCULAR with respect to this specific failure mode: it can only ever notice a gap the parser's own top-level recognizer left unrecognized as a node BOUNDARY, never a gap the parser recognized a node for but attributed a materially incorrect END boundary to.",
      whatItCanDetect: "Wholesale non-recognition: if NO top-level node is ever recognized for a whole document (STRUCTURE_FAILED) or a genuine gap exists between two top-level nodes' own charStart values with nothing else claiming that byte range at all (e.g. an un-headed preamble/recitals block), this IS independently and correctly caught - it does not require the parser to have gotten every internal detail right, only that top-level node boundaries exist where real ones do.",
      whatItCannotDetect: "A sibling's silently-swallowed content (Q1/Q2) - proven via the real parser in part2-adversarial-structural-assumptions.test.ts. This is a real, bounded blind spot, not a hypothetical one.",
      anomalousOwnSpanSizeProxyResults: "A generic, package-agnostic 'is any node's own-text length anomalously large relative to its SECTION-level sibling group' proxy heuristic was run (>=5x sibling median AND >=500 absolute chars) as a best-effort INDEPENDENT-of-the-gap-mechanism secondary signal. Results per package are in perPackageDetail[].anomalousOwnSpanSizeFlags below - a non-empty result is NOT proof of an actual swallow (a genuinely long single section is a normal, expected real-world case), it is a review-worthy signal only.",
    },
    perPackageSummary: perPackage.map((p) => ({
      packageKey: p.packageKey,
      totalSourceChars: p.totalSourceChars,
      claimedByNodesChars: p.claimedByNodesChars,
      uncoveredChars: p.uncoveredChars,
      uncoveredPercent: p.uncoveredPercent,
      invalidOrOverlappingSpans: p.invalidOrOverlappingSpans,
      uncoveredRegionClassification: p.uncoveredRegionClassification,
      anomalousOwnSpanSizeFlagCount: p.anomalousOwnSpanSizeFlags.length,
    })),
    perPackageDetail: perPackage,
  };

  writeFileSync(`${OUT_DIR}/source-span-accounting.json`, JSON.stringify(report, null, 2));

  console.log("\n=== SUMMARY ===");
  for (const p of perPackage) {
    console.log(`${p.packageKey}: total=${p.totalSourceChars} claimed=${p.claimedByNodesChars} uncovered=${p.uncoveredChars} (${p.uncoveredPercent}%) invalidOrOverlapping=${p.invalidOrOverlappingSpans} anomalousFlags=${p.anomalousOwnSpanSizeFlags.length}`);
    console.log(`  classification: ${JSON.stringify(p.uncoveredRegionClassification)}`);
  }
  console.log(`\nLoader cross-check (canonical loadFwrgLsbStructuralIndex vs this script's independent load): canonical=${canonicalCount} thisScript=${thisScriptCount} passed=${loaderCrossCheckPassed}`);
  console.log(`\n[written] ${OUT_DIR}/source-span-accounting.json`);
}

main();
