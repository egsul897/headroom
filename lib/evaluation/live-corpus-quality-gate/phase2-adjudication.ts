/**
 * Phase 2 — independent adjudication of critical Phase-1 defects.
 * Distinguishes source inconsistency vs compiler/parser error.
 * Does not implement production fixes.
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const ROOT = process.cwd();

export type DefectClass =
  | "SOURCE_INCONSISTENCY"
  | "COMPILER_DEFECT"
  | "EVALUATION_HARNESS_DEFECT"
  | "UNRESOLVED_LEGAL_QUESTION";

export type OwningAgent =
  | "Structural Compiler"
  | "Legal Core"
  | "Amendment Intelligence"
  | "Dependency Atlas"
  | "Covenant Knowledge Factory";

export interface CriticalAdjudication {
  defectId: string;
  title: string;
  priority: "CRITICAL" | "HIGH";
  classification: DefectClass;
  secondaryClassifications?: DefectClass[];
  sampleId: string;
  sourcePath: string;
  sourceSha256: string;
  exactSourceSpan: {
    method: string;
    charStart?: number;
    charEnd?: number;
    excerpt: string;
    sectionRef?: string;
  };
  compilerStage:
    | "document-classification"
    | "structural-index"
    | "reference-resolution"
    | "pass-a-deterministic-discovery"
    | "relationship-resolution"
    | "package-graph"
    | "n/a-source-only";
  actualOutput: Record<string, unknown>;
  expectedSafeBehavior: string;
  rootCauseHypothesis: string;
  independentEvidence: string[];
  recommendedOwningAgent: OwningAgent;
  coordinatingAgents: OwningAgent[];
  blocksLegalVerification: boolean;
  productionFixInThisBranch: false;
}

function sha256File(rel: string): string {
  return crypto.createHash("sha256").update(fs.readFileSync(path.join(ROOT, rel))).digest("hex");
}

function read(rel: string): string {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

function findSpan(text: string, needle: string): { start: number; end: number; excerpt: string } | null {
  const start = text.indexOf(needle);
  if (start < 0) return null;
  const end = start + needle.length;
  const lo = Math.max(0, start - 80);
  const hi = Math.min(text.length, end + 80);
  return { start, end, excerpt: text.slice(lo, hi) };
}

export function adjudicateCriticalFindings(): CriticalAdjudication[] {
  const gibTextPath =
    "tests/fixtures/unseen-packages/gibraltar-2026-credit-agreement/extracted-text/credit-agreement.txt";
  const gibText = read(gibTextPath);
  const gibSha = sha256File(gibTextPath);
  const structureDir = "tests/fixtures/unseen-packages/gibraltar-2026-credit-agreement/structure";
  const summary = JSON.parse(read(`${structureDir}/structure-summary.json`));
  const health = JSON.parse(read(`${structureDir}/health-summary.json`));
  const sharedCap = JSON.parse(read(`${structureDir}/pass-a-shared-cap.json`)) as unknown[];
  const natural = JSON.parse(read(`${structureDir}/natural-search.json`));
  const operative = JSON.parse(read(`${structureDir}/operative-article-vii.json`)) as Array<{
    sectionRef: string;
    charStart: number;
    charEnd: number;
  }>;

  const out: CriticalAdjudication[] = [];

  // 1. Builder basket marker conflict
  const defNeedle = "Available Amount Builder Basket ” has the meaning specified in Section 7.05(a)(y)";
  // tolerate NBSP variants
  const defIdx = gibText.search(/Available Amount Builder Basket[\s\S]{0,40}7\.05\(a\)\(y\)/);
  const opExcerpt =
    (natural.builder_grower as Array<{ excerpt: string; tightestRef: string }> | undefined)?.find((x) =>
      x.excerpt.includes("Available Amount Builder Basket"),
    ) ?? null;
  const defSpan =
    defIdx >= 0
      ? {
          start: defIdx,
          end: defIdx + 120,
          excerpt: gibText.slice(Math.max(0, defIdx - 40), defIdx + 160),
        }
      : findSpan(gibText, "Section 7.05(a)(y)");

  out.push({
    defectId: "LCQG-GIB-XREF-BUILDER-MARKER-CONFLICT",
    title: "Available Amount Builder Basket citation marker conflict (7.05(a)(y) vs printed (vi))",
    priority: "CRITICAL",
    classification: "SOURCE_INCONSISTENCY",
    secondaryClassifications: ["COMPILER_DEFECT"],
    sampleId: "gib-doc-a",
    sourcePath: gibTextPath,
    sourceSha256: gibSha,
    exactSourceSpan: {
      method: "regex locate definition cite + natural-search operative prong",
      charStart: defSpan?.start,
      charEnd: defSpan?.end,
      excerpt: defSpan?.excerpt ?? opExcerpt?.excerpt ?? "",
      sectionRef: opExcerpt?.tightestRef ?? "7.05(a)(y)|7.05(a)(4)(ii)(vi)(B)",
    },
    compilerStage: "reference-resolution",
    actualOutput: {
      definitionCites: "Section 7.05(a)(y)",
      printedMarker: "(vi)",
      parentheticalStillSays: "clause (y)",
      compilerStructuralPath: opExcerpt?.tightestRef ?? "7.05(a)(4)(ii)(vi)(B)",
    },
    expectedSafeBehavior:
      "Treat as UNRESOLVED / dual-cite REVIEW_REQUIRED. Never force a unique resolved target that prefers compiler path over source disagreement.",
    rootCauseHypothesis:
      "Primary: filed HTML itself disagrees (definition vs printed marker). Secondary: structural path 7.05(a)(4)(ii)(vi)(B) matches neither clean legal citation, so reference-resolution can invent false certainty if it binds uniquely.",
    independentEvidence: [
      `sourceSha256=${gibSha}`,
      `definitionSpan=${defSpan?.excerpt?.slice(0, 200) ?? "NOT_FOUND"}`,
      `operativeExcerpt=${opExcerpt?.excerpt ?? "NOT_FOUND"}`,
      "Lane C report docs/p3-lane-c-gibraltar-dev-edgar-1acdff3.md §Builder/grower",
    ],
    recommendedOwningAgent: "Dependency Atlas",
    coordinatingAgents: ["Structural Compiler", "Legal Core", "Covenant Knowledge Factory"],
    blocksLegalVerification: true,
    productionFixInThisBranch: false,
  });

  // 2. Shared-capacity false affirmative
  const phraseShared = gibText.toLowerCase().includes("shared capacity");
  out.push({
    defectId: "LCQG-GIB-FALSE-AFFIRM-SHARED-CAP",
    title: "Pass A shared_cap over-fires on aggregate-amount nodes (51 hits)",
    priority: "CRITICAL",
    classification: "COMPILER_DEFECT",
    sampleId: "gib-doc-a",
    sourcePath: gibTextPath,
    sourceSha256: gibSha,
    exactSourceSpan: {
      method: "Pass A shared_cap fixture excerpts + absence of phrase 'shared capacity'",
      excerpt: String((sharedCap[0] as { excerpt?: string } | undefined)?.excerpt ?? "").slice(0, 280),
      sectionRef: String((sharedCap[0] as { sectionRef?: string } | undefined)?.sectionRef ?? ""),
    },
    compilerStage: "pass-a-deterministic-discovery",
    actualOutput: {
      sharedCapSignalCount: sharedCap.length,
      phraseSharedCapacityPresent: phraseShared,
      realReallocationTermPresent: gibText.includes("Restricted Payment Reallocated Amount"),
    },
    expectedSafeBehavior:
      "Do not emit affirmative shared-capacity / combined-headroom conclusions from aggregate-amount pattern matches alone. Require explicit shared-pool / combined-cap / reallocation semantics.",
    rootCauseHypothesis:
      "Pass A `shared_cap` regex/heuristic keyed primarily to 'aggregate amount' (and similar), which fires on ordinary EBITDA add-back caps and other non-shared constructions.",
    independentEvidence: [
      `sharedCapCount=${sharedCap.length}`,
      `phraseSharedCapacityPresent=${phraseShared}`,
      `${structureDir}/pass-a-shared-cap.json`,
      "Lane C report: shared capacity phrase does not occur",
    ],
    recommendedOwningAgent: "Covenant Knowledge Factory",
    coordinatingAgents: ["Legal Core", "Structural Compiler"],
    blocksLegalVerification: true,
    productionFixInThisBranch: false,
  });

  // 3. Superior RESTATES omission
  const supBPath =
    "tests/fixtures/unseen-packages/final-lightweight-unseen-sup/extracted-text/doc-b-2024-08-14-amended-restated-term-loan-credit-agreement.txt";
  const supB = read(supBPath);
  const supBSha = sha256File(supBPath);
  const captionSpan = findSpan(supB, "AMENDED AND RESTATED");
  const report = read("docs/final-lightweight-unseen.md");
  out.push({
    defectId: "LCQG-SUP-AMEND-RESTATES-MISSING",
    title: "SUP doc-b RESTATES doc-a never surfaced (classifier whitespace / newline defect)",
    priority: "CRITICAL",
    classification: "COMPILER_DEFECT",
    sampleId: "sup-doc-b",
    sourcePath: supBPath,
    sourceSha256: supBSha,
    exactSourceSpan: {
      method: "caption locate AMENDED AND RESTATED + historical lightweight report",
      charStart: captionSpan?.start,
      charEnd: captionSpan?.end,
      excerpt: captionSpan?.excerpt ?? supB.slice(0, 400),
      sectionRef: "caption",
    },
    compilerStage: "document-classification",
    actualOutput: {
      historicalClassification: "CREDIT_AGREEMENT @ 0.9",
      restatesCandidates: 0,
      historicalReportConfirms: report.includes("doc-b classified `CREDIT_AGREEMENT` at confidence 0.9"),
    },
    expectedSafeBehavior:
      "Classify as AMENDED_AND_RESTATED_AGREEMENT; surface RESTATES→doc-a or honest REVIEW_REQUIRED — never silent omission.",
    rootCauseHypothesis:
      "document-classifier AMENDED_AND_RESTATED pattern requires literal space between 'RESTATED' and 'CREDIT AGREEMENT' without whitespace normalization; EDGAR HTML line-wrap inserts newline and falls through to CREDIT_AGREEMENT. Relationship scan gated on classification type, so RESTATES never attempted.",
    independentEvidence: [
      `sourceSha256=${supBSha}`,
      "docs/final-lightweight-unseen.md §4",
      "docs/final-lightweight-unseen/07-targeted-ground-truth.json claims C2 + D1",
      "docs/final-lightweight-unseen/12-document-classification.json",
    ],
    recommendedOwningAgent: "Amendment Intelligence",
    coordinatingAgents: ["Structural Compiler", "Dependency Atlas"],
    blocksLegalVerification: true,
    productionFixInThisBranch: false,
  });

  // 4. TOC/body ambiguity
  out.push({
    defectId: "LCQG-GIB-STRUCT-AMBIGUOUS-TOC",
    title: "Gibraltar TOC duplication yields AMBIGUOUS bare section refs",
    priority: "HIGH",
    classification: "COMPILER_DEFECT",
    secondaryClassifications: ["SOURCE_INCONSISTENCY"],
    sampleId: "gib-doc-a",
    sourcePath: gibTextPath,
    sourceSha256: gibSha,
    exactSourceSpan: {
      method: "Articles I–X appear twice (TOC + body); health-summary counts",
      excerpt: "Articles I through X appear twice: table of contents, then the body. Bare section labels AMBIGUOUS under resolveUniqueNodeByRef.",
      sectionRef: "I–X / 7.xx",
    },
    compilerStage: "structural-index",
    actualOutput: {
      healthByCode: health.byCode,
      findingCount: health.findingCount,
      articlesJsonLength: 20,
      operativeLongSpanRecovery: operative.map((o) => o.sectionRef),
    },
    expectedSafeBehavior:
      "Prefer long-span operative body nodes; never silently bind TOC stubs; expose AMBIGUOUS explicitly to consumers.",
    rootCauseHypothesis:
      "EDGAR HTML embeds a full TOC before the body (source shape). Structural index correctly emits duplicate labels but resolveUniqueNodeByRef stays AMBIGUOUS; downstream consumers that ignore span length risk TOC binding.",
    independentEvidence: [
      `${structureDir}/health-summary.json`,
      `${structureDir}/articles.json length=20`,
      `${structureDir}/operative-article-vii.json long-span recovery exists`,
    ],
    recommendedOwningAgent: "Structural Compiler",
    coordinatingAgents: ["Dependency Atlas", "Covenant Knowledge Factory"],
    blocksLegalVerification: true,
    productionFixInThisBranch: false,
  });

  // 5. Unresolved cross-references
  out.push({
    defectId: "LCQG-GIB-XREF-LOW-RESOLVE",
    title: "Gibraltar cross-reference resolve rate ~33.7% (968 unresolved)",
    priority: "HIGH",
    classification: "COMPILER_DEFECT",
    secondaryClassifications: ["UNRESOLVED_LEGAL_QUESTION"],
    sampleId: "gib-doc-a",
    sourcePath: gibTextPath,
    sourceSha256: gibSha,
    exactSourceSpan: {
      method: "structure-summary reference counters",
      excerpt: `referencesDetected=${summary.referencesDetected} resolved=${summary.referencesResolved} unresolved=${summary.referencesUnresolved}`,
    },
    compilerStage: "reference-resolution",
    actualOutput: {
      detected: summary.referencesDetected,
      resolved: summary.referencesResolved,
      unresolved: summary.referencesUnresolved,
      resolveRate: summary.referencesDetected
        ? summary.referencesResolved / summary.referencesDetected
        : null,
    },
    expectedSafeBehavior:
      "Keep material unresolved refs explicit (UNRESOLVED/REVIEW_REQUIRED). Do not force-bind to ambiguous TOC targets. Improve resolution where unique operative targets exist.",
    rootCauseHypothesis:
      "Mixture of (a) TOC-induced AMBIGUOUS targets, (b) external/schedule references omitted from package, (c) genuine cross-article refs not yet resolved by deterministic matcher. Not purely a source inconsistency.",
    independentEvidence: [
      `${structureDir}/structure-summary.json`,
      `${structureDir}/health-summary.json AMBIGUOUS_LEGAL_REFERENCE=306`,
    ],
    recommendedOwningAgent: "Dependency Atlas",
    coordinatingAgents: ["Structural Compiler", "Legal Core"],
    blocksLegalVerification: true,
    productionFixInThisBranch: false,
  });

  return out;
}
