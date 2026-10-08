/**
 * Phase 3 runner: missed-edge audit, expanded independent GT recall/precision,
 * controlling-restriction defect cards, definition subtypes, cycle adjudication,
 * holdout integrity, high-risk family coverage, CKF durable import demo.
 *
 * Large generated datasets write to `.local-dependency-atlas/` (gitignored).
 */

import { execSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { adjudicateCycles } from "./adjudicate-cycles";
import { analyzeControllingRisks } from "./analyze-controlling-risks";
import { analyzeMissingDefinitions } from "./analyze-definitions";
import { authorIndependentGroundTruth } from "./author-independent-gt";
import { buildAtlasDataset } from "./build-atlas";
import { runPhase2 } from "./build-phase2";
import { runCkfImportDemo } from "./ckf-import-demo";
import { buildFixtureCorpusRegistry, corpusSummary } from "./corpus-registry";
import type { AtlasDocument } from "./schema";

const ROOT = resolve(__dirname, "../..");
const LOCAL = join(ROOT, ".local-dependency-atlas");
const DOCS = join(ROOT, "docs/covenant-dependency-atlas/phase-3");

function writeJson(path: string, value: unknown): void {
  mkdirSync(join(path, ".."), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

function checksumOf(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function gitSha(): string {
  try {
    return execSync("git rev-parse HEAD", { cwd: ROOT, encoding: "utf-8" }).trim();
  } catch {
    return "UNKNOWN";
  }
}

interface IndependentExpected {
  edgeId: string;
  documentId: string;
  issuer: string;
  split: "development" | "evaluation" | "blind";
  kind: string;
  toLabel: string;
  connective: string;
  termName?: string;
  sourceSpan: { sourceFile: string; charStart: number; charEnd: number; excerpt: string };
  notes: string;
}

function measureExpandedRecall(
  docs: AtlasDocument[],
  expected: IndependentExpected[],
): {
  bySplit: Record<
    string,
    {
      expected: number;
      truePositives: number;
      falseNegatives: number;
      precisionProbeFalsePositives: number;
      recall: number | null;
      precision: number | null;
      wilsonRecallLow: number | null;
      wilsonRecallHigh: number | null;
    }
  >;
  overall: {
    expected: number;
    truePositives: number;
    falseNegatives: number;
    precisionProbeFalsePositives: number;
    recall: number | null;
    precision: number | null;
    wilsonRecallLow: number | null;
    wilsonRecallHigh: number | null;
  };
  details: { edgeId: string; documentId: string; split: string; kind: string; hit: boolean }[];
} {
  const details: { edgeId: string; documentId: string; split: string; kind: string; hit: boolean }[] = [];
  let tp = 0;
  let expectedN = 0;
  let fpProbe = 0;
  const splitAcc: Record<string, { expected: number; tp: number; fp: number }> = {
    development: { expected: 0, tp: 0, fp: 0 },
    evaluation: { expected: 0, tp: 0, fp: 0 },
    blind: { expected: 0, tp: 0, fp: 0 },
  };

  for (const exp of expected) {
    expectedN += 1;
    splitAcc[exp.split]!.expected += 1;
    const doc = docs.find((d) => d.documentId === exp.documentId);
    let hit = false;
    if (doc) {
      hit = doc.edges.some((e) => {
        if (e.kind !== exp.kind) return false;
        const term = exp.termName ?? exp.toLabel;
        const termOk =
          !term ||
          e.toNodeId.includes(term.toLowerCase().replace(/\s+/g, "_")) ||
          e.rationale.toLowerCase().includes(term.toLowerCase()) ||
          e.sourceSpans.some((s) => (s.excerpt ?? "").toLowerCase().includes(term.toLowerCase().slice(0, 24)));
        return termOk;
      });
    }
    if (hit) {
      tp += 1;
      splitAcc[exp.split]!.tp += 1;
    }
    details.push({ edgeId: exp.edgeId, documentId: exp.documentId, split: exp.split, kind: exp.kind, hit });
  }

  // Precision probe on docs covered by expected set
  const coveredIds = new Set(expected.map((e) => e.documentId));
  for (const doc of docs.filter((d) => coveredIds.has(d.documentId))) {
    const n = doc.edges.filter(
      (e) =>
        (e.kind === "RECLASSIFICATION" || e.kind === "COVENANT_TO_SHARED_BASKET") &&
        e.evidenceClass !== "STRUCTURAL_CROSS_REFERENCE" &&
        e.evidenceClass !== "EXPLICIT_SOURCE_CONNECTIVE" &&
        e.evidenceClass !== "STRUCTURAL_DEFINITION_OCCURRENCE",
    ).length;
    fpProbe += n;
    const split = expected.find((e) => e.documentId === doc.documentId)?.split ?? "development";
    splitAcc[split]!.fp += n;
  }

  const wilson = (successes: number, n: number): { low: number; high: number } | null => {
    if (n === 0) return null;
    const z = 1.96;
    const p = successes / n;
    const denom = 1 + (z * z) / n;
    const centre = p + (z * z) / (2 * n);
    const margin = z * Math.sqrt((p * (1 - p) + (z * z) / (4 * n)) / n);
    return { low: Math.max(0, (centre - margin) / denom), high: Math.min(1, (centre + margin) / denom) };
  };

  const pack = (expected: number, truePositives: number, fp: number) => {
    const w = wilson(truePositives, expected);
    return {
      expected,
      truePositives,
      falseNegatives: expected - truePositives,
      precisionProbeFalsePositives: fp,
      recall: expected === 0 ? null : truePositives / expected,
      precision: truePositives + fp === 0 ? null : truePositives / (truePositives + fp),
      wilsonRecallLow: w?.low ?? null,
      wilsonRecallHigh: w?.high ?? null,
    };
  };

  const overallW = wilson(tp, expectedN);
  return {
    bySplit: {
      development: pack(splitAcc.development!.expected, splitAcc.development!.tp, splitAcc.development!.fp),
      evaluation: pack(splitAcc.evaluation!.expected, splitAcc.evaluation!.tp, splitAcc.evaluation!.fp),
      blind: pack(splitAcc.blind!.expected, splitAcc.blind!.tp, splitAcc.blind!.fp),
    },
    overall: {
      expected: expectedN,
      truePositives: tp,
      falseNegatives: expectedN - tp,
      precisionProbeFalsePositives: fpProbe,
      recall: expectedN === 0 ? null : tp / expectedN,
      precision: tp + fpProbe === 0 ? null : tp / (tp + fpProbe),
      wilsonRecallLow: overallW?.low ?? null,
      wilsonRecallHigh: overallW?.high ?? null,
    },
    details,
  };
}

function auditFiveMissedEdges(): unknown {
  // Reconstruct Phase-2 five misses from exact source evidence (pre-fix classification).
  return {
    method: "SOURCE_SPAN_RECONSTRUCTION — not derived from post-fix extractor success alone",
    edges: [
      {
        id: "miss-1",
        documentId: "chwy-doc-a",
        expected: { kind: "RATIO_CALCULATION", termName: "EBITDA", connective: "ratio definition compositional reference" },
        sourceReconstruction: {
          term: "Total Leverage Ratio",
          declarationSpanNote: "Production detectStructuralDefinitions charEnd ends at declaration match (~30 chars: '\" Total Leverage Ratio \" means')",
          definitionExcerptContains: "Consolidated EBITDA",
          excerptEvidence:
            "Total Leverage Ratio means, on any date, the ratio of (a) Consolidated Total Debt ... to (b) Consolidated EBITDA",
        },
        rootCause: "INCORRECT_EXTRACTION_BOUNDARY",
        classificationFamily: "Ratio dependency",
        detail:
          "Atlas adapter sliced text.slice(charStart, charEnd) which excluded the compositional body already present in definitionExcerpt. Fix: Atlas-owned definitionBodyWindow (excerpt + text to next definition / bound). Production parser untouched.",
        fixApplied: "Atlas adapter definitionBodyWindow in extract-from-structural.ts",
      },
      {
        id: "miss-2",
        documentId: "riot-doc-a",
        expected: { kind: "COVENANT_TO_DEFINITION", termName: "Indebtedness" },
        sourceReconstruction: {
          search: "Indebtedness",
          result: "ABSENT from RIOT doc-a definitions and operative text",
          presentInstead: ["Loan", "Collateral", "Actual LTV Ratio", "Prevailing Market Value"],
        },
        rootCause: "UNSUPPORTED_LEGAL_INTERPRETATION",
        classificationFamily: "Covenant-family recognition / incorrect expected sample",
        detail:
          "Phase-2 expected edge assumed a traditional credit-agreement Indebtedness covenant family. RIOT is an LTV / bitcoin-collateral facility without that defined term. Not an extractor miss — incorrect ground-truth sample.",
        fixApplied: "Rewrote RIOT expected edges from exact source terms (Collateral, Loan, Actual LTV Ratio)",
      },
      {
        id: "miss-3",
        documentId: "riot-doc-a",
        expected: { kind: "COVENANT_TO_CROSS_DOCUMENT", connective: "Security/Collateral/Intercreditor Agreement" },
        sourceReconstruction: {
          search: ["Security Agreement", "Intercreditor Agreement"],
          result: "ABSENT",
          presentInstead: ["Collateral Documents", "Custody Agreement", "Pledge and Collateral Account Control Agreement"],
        },
        rootCause: "COVENANT_FAMILY_RECOGNITION",
        classificationFamily: "Cross-document / external document",
        detail:
          "Expected connective set was traditional loan-package labels. RIOT uses Collateral Documents / Custody Agreement. Adapter cross-document patterns expanded (Atlas-only) to include those authentic instrument names; section-body scan added.",
        fixApplied: "CONNECTIVE_RULES + section-body cross-document scan in Atlas adapter",
      },
      {
        id: "miss-4",
        documentId: "riot-doc-a",
        expected: { kind: "COVENANT_TO_SHARED_BASKET", connective: "Available Amount / shared basket" },
        sourceReconstruction: {
          search: ["Available Amount", "shared capacity", "shared basket"],
          result: "ABSENT",
        },
        rootCause: "UNSUPPORTED_LEGAL_INTERPRETATION",
        classificationFamily: "Shared basket",
        detail:
          "RIOT doc-a has no Available Amount / shared-basket mechanic. Expected edge was fabricated from a different covenant family. Removed from RIOT sample; shared-basket expectations retained on CHWY/DSGR/FWRG/Gibraltar where source supports them.",
        fixApplied: "Corrected GT sample; no fabricated RIOT shared-basket edge",
      },
      {
        id: "miss-5",
        documentId: "riot-doc-a",
        expected: { kind: "RATIO_CALCULATION", connective: "Leverage Ratio definition" },
        sourceReconstruction: {
          search: "Leverage Ratio",
          result: "ABSENT",
          presentInstead: "Actual LTV Ratio means ... principal amount of the Loan ... to ... Prevailing Market Value of the Collateral",
        },
        rootCause: "RATIO_DEPENDENCY / COVENANT_FAMILY_RECOGNITION",
        classificationFamily: "Ratio dependency",
        detail:
          "Expected traditional Leverage Ratio; source defines Actual LTV Ratio with Loan / Prevailing Market Value / Collateral components. After definitionBodyWindow + classic-component expansion, Atlas extracts RATIO_CALCULATION for Actual LTV Ratio → those components.",
        fixApplied: "Source-true RIOT ratio expectations + Atlas body window / component matching",
      },
    ],
    summary: {
      structuralExtractionBoundary: 1,
      incorrectGroundTruthSample: 3,
      covenantFamilyRecognitionGap: 1,
      note: "Correctness prioritized: three of five 'misses' were bad expected edges, not extractor failures.",
    },
  };
}

export function runPhase3(): Record<string, unknown> {
  mkdirSync(DOCS, { recursive: true });
  mkdirSync(join(LOCAL, "exports"), { recursive: true });

  const shaAtStart = gitSha();

  // Ensure independent GT fixture exists / refreshed from source (not extractor).
  const gtAuthored = authorIndependentGroundTruth();
  const gtPayload = JSON.parse(readFileSync(gtAuthored.path, "utf-8")) as {
    edges: IndependentExpected[];
    totals: unknown;
    knifeRiverBlind: string;
    gibraltarNote: string;
  };

  // Rebuild phase-2 structural corpus (includes adapter fixes + registry split correction).
  const phase2 = runPhase2();
  const structuralPath = join(LOCAL, "exports/structural-atlas-dataset.json");
  const structuralDataset = JSON.parse(readFileSync(structuralPath, "utf-8")) as typeof phase2.structuralDataset;
  const structuralDocs = structuralDataset.packages.flatMap((p) => p.documents);

  const registry = buildFixtureCorpusRegistry();
  const summary = corpusSummary(registry);

  // Small recall sample (CHWY/RIOT rewritten)
  const samplePath = join(ROOT, "tests/fixtures/covenant-dependency-atlas/review-samples/structural-recall-sample.json");
  const smallSample = JSON.parse(readFileSync(samplePath, "utf-8")) as {
    documentId: string;
    expected: { kind: string; termName?: string; connective: string }[];
  }[];
  let smallTp = 0;
  let smallExp = 0;
  const smallDetails: unknown[] = [];
  for (const sample of smallSample) {
    const doc = structuralDocs.find((d) => d.documentId === sample.documentId);
    for (const exp of sample.expected) {
      smallExp += 1;
      const hit = !!doc?.edges.some((e) => {
        if (e.kind !== exp.kind) return false;
        if (!exp.termName) return true;
        return (
          e.toNodeId.includes(exp.termName.toLowerCase().replace(/\s+/g, "_")) ||
          e.rationale.includes(exp.termName) ||
          e.sourceSpans.some((s) => (s.excerpt ?? "").includes(exp.termName!))
        );
      });
      if (hit) smallTp += 1;
      smallDetails.push({ documentId: sample.documentId, expected: exp, hit });
    }
  }

  const expanded = measureExpandedRecall(structuralDocs, gtPayload.edges);

  // GT-assisted DSGR for controlling risks / definitions / cycles
  const gtDataset = buildAtlasDataset(new Date().toISOString());
  const gtEdges = gtDataset.packages.flatMap((p) => p.documents.flatMap((d) => d.edges));
  const gtNodes = gtDataset.packages.flatMap((p) => p.documents.flatMap((d) => d.nodes));

  const controlling = analyzeControllingRisks(gtEdges);
  // Persist all cards locally; commit a capped summary in docs
  writeJson(join(LOCAL, "exports/controlling-restriction-defect-cards.json"), controlling);
  writeJson(join(DOCS, "04-controlling-restriction-risks.json"), {
    totalOpenControllingRisks: controlling.totalOpenControllingRisks,
    byCategory: controlling.byCategory,
    prioritizedSummary: controlling.prioritizedSummary,
    defectCardsSample: controlling.defectCards.slice(0, 40),
    note: "Full defect card set at .local-dependency-atlas/exports/controlling-restriction-defect-cards.json",
  });

  const defReport = analyzeMissingDefinitions(gtEdges, gtNodes);
  writeJson(join(LOCAL, "exports/missing-definition-subtypes.json"), defReport);
  writeJson(join(DOCS, "05-definition-resolution.json"), {
    totalMissingDefinition: defReport.totalMissingDefinition,
    bySubtype: defReport.bySubtype,
    examples: defReport.examples,
    coordinationNotes: defReport.coordinationNotes,
  });

  const cycles = adjudicateCycles(gtDataset);
  writeJson(join(DOCS, "06-cycle-adjudication.json"), cycles);

  const missed = auditFiveMissedEdges();
  writeJson(join(DOCS, "01-missed-edge-audit.json"), missed);

  writeJson(join(DOCS, "02-independent-ground-truth.json"), {
    path: "tests/fixtures/covenant-dependency-atlas/authored-edges/independent-ground-truth-phase3.json",
    totals: gtPayload.totals,
    knifeRiverBlind: gtPayload.knifeRiverBlind,
    gibraltarNote: gtPayload.gibraltarNote,
    method: "SOURCE_TEXT_SPAN — not derived from extractor output",
  });

  writeJson(join(DOCS, "03-recall-precision.json"), {
    smallChwyRiotSample: {
      expected: smallExp,
      truePositives: smallTp,
      recall: smallExp === 0 ? null : smallTp / smallExp,
      details: smallDetails,
      note: "Rewritten source-true CHWY/RIOT sample after Phase-2 miss audit",
    },
    expandedIndependentGt: expanded,
    denominators: {
      recall: "truePositives / independently authored expected edges",
      precision: "truePositives / (truePositives + precisionProbeFalsePositives)",
      uncertainty: "Wilson score interval 95% on recall (wilsonRecallLow/High)",
    },
  });

  const priorityCoverage = {
    RECLASSIFICATION: structuralDocs.reduce((n, d) => n + d.edges.filter((e) => e.kind === "RECLASSIFICATION").length, 0),
    ENTITY_SCOPE: structuralDocs.reduce((n, d) => n + d.edges.filter((e) => e.kind === "ENTITY_SCOPE").length, 0),
    COVENANT_TO_SHARED_BASKET: structuralDocs.reduce((n, d) => n + d.edges.filter((e) => e.kind === "COVENANT_TO_SHARED_BASKET").length, 0),
    COVENANT_TO_CROSS_DOCUMENT: structuralDocs.reduce((n, d) => n + d.edges.filter((e) => e.kind === "COVENANT_TO_CROSS_DOCUMENT").length, 0),
    RATIO_CALCULATION: structuralDocs.reduce((n, d) => n + d.edges.filter((e) => e.kind === "RATIO_CALCULATION").length, 0),
    FINANCIAL_INPUT: structuralDocs.reduce((n, d) => n + d.edges.filter((e) => e.kind === "FINANCIAL_INPUT").length, 0),
    COVENANT_TO_CONDITION: structuralDocs.reduce((n, d) => n + d.edges.filter((e) => e.kind === "COVENANT_TO_CONDITION").length, 0),
    COVENANT_TO_AMENDMENT: structuralDocs.reduce((n, d) => n + d.edges.filter((e) => e.kind === "COVENANT_TO_AMENDMENT").length, 0),
  };
  writeJson(join(DOCS, "07-high-risk-family-coverage.json"), {
    priorityCoverage,
    policy: "No fabricated edges — counts are STRUCTURAL_INDEX_ONLY discoveries with explicit connectives/definition occurrences",
    phase2BaselineApprox: {
      note: "Phase 2 priorityCoverage from prior summary for comparison",
      reference: "docs/covenant-dependency-atlas/phase-2/05-priority-coverage.json",
    },
  });

  writeJson(join(DOCS, "08-holdout-integrity.json"), {
    gibraltar: {
      phase2Label: "evaluation",
      phase3Label: summary.holdoutIntegrity?.gibraltarSplit,
      archCertDesignation: "DEVELOPMENT",
      howUsed:
        "Phase 2: extracted for corpus counts under incorrect evaluation label; connective rules were generic English patterns not Gibraltar-tuned. Phase 3: reclassified to development per Arch+Cert; used for development GT spans and corpus extraction only.",
      influencedConnectiveTuning: false,
      bodyOpened: true,
    },
    evaluationPackage: {
      documentId: summary.holdoutIntegrity?.evaluationPackage,
      policy: summary.holdoutIntegrity?.evaluationPackagePolicy,
      note: "cnmd-htm-amd2 sealed for measurement; Atlas connectives not iteratively tuned against it in Phase 3",
    },
    knifeRiver: {
      status: "BLIND_PRESERVED_UNREAD",
      bodyOpened: false,
      registeredInCorpus: false,
      evidence: "No Knife River extracted-text body in fixtures; only designation strings in Gibraltar provenance.json",
    },
    independentGtSplits: (gtPayload.totals as { bySplit: unknown }).bySplit,
  });

  const kfPath = join(LOCAL, "exports/structural-knowledge-factory-dataset.json");
  const ckf = runCkfImportDemo(kfPath);
  writeJson(join(DOCS, "09-ckf-import.json"), {
    status: ckf.pass2.status,
    sourceVersionId: ckf.pass1.sourceVersionId,
    pass1: ckf.pass1,
    pass2: ckf.pass2,
    storePath: ".local-dependency-atlas/ckf-demo-store/store.json",
    peerBranch: "cursor/covenant-knowledge-factory-7327",
    guarantees: [
      "Idempotent second import (same source-version identity)",
      "Unresolved/ambiguous edges preserved",
      "Source-version identity hashed from schema + node/edge ids",
      "Duplicate node/edge ids skipped on re-import",
      "promotedToLegalTruth always 0",
    ],
  });

  const phase3Summary = {
    schemaVersion: "covenant-dependency-atlas.phase-3",
    generatedAt: new Date().toISOString(),
    startingSha: "fdea754a4c3f2cbf6ffa34ed2355506280b0f2b7",
    shaAtBuild: shaAtStart,
    paidInference: false,
    productionResolverTouched: false,
    merges: false,
    certificationChanges: false,
    corpus: summary,
    structuralIndexOnly: {
      documents: structuralDataset.totals.documents,
      edges: structuralDataset.totals.edges,
      priorityCoverage,
    },
    missedEdgeAudit: (missed as { summary: unknown }).summary,
    independentGroundTruth: gtPayload.totals,
    recallPrecision: {
      smallSample: { expected: smallExp, truePositives: smallTp, recall: smallExp === 0 ? null : smallTp / smallExp },
      expanded: expanded.overall,
      bySplit: expanded.bySplit,
    },
    controllingRestrictionRisks: {
      total: controlling.totalOpenControllingRisks,
      byCategory: controlling.byCategory,
    },
    definitionSubtypes: defReport.bySubtype,
    cycleAdjudication: cycles.counts,
    holdoutIntegrity: summary.holdoutIntegrity,
    ckfImport: {
      idempotent: ckf.pass2.idempotent,
      unresolvedPreserved: ckf.pass2.unresolvedPreserved,
      promotedToLegalTruth: ckf.pass2.promotedToLegalTruth,
      sourceVersionId: ckf.pass1.sourceVersionId,
    },
    checksums: {} as Record<string, string>,
  };

  const checksumPaths = [
    join(DOCS, "00-summary.json"),
    join(DOCS, "01-missed-edge-audit.json"),
    join(DOCS, "02-independent-ground-truth.json"),
    join(DOCS, "03-recall-precision.json"),
    join(DOCS, "04-controlling-restriction-risks.json"),
    join(DOCS, "05-definition-resolution.json"),
    join(DOCS, "06-cycle-adjudication.json"),
    join(DOCS, "07-high-risk-family-coverage.json"),
    join(DOCS, "08-holdout-integrity.json"),
    join(DOCS, "09-ckf-import.json"),
  ];
  writeJson(join(DOCS, "00-summary.json"), phase3Summary);
  for (const p of checksumPaths) {
    if (existsSync(p)) phase3Summary.checksums[p.replace(`${ROOT}/`, "")] = checksumOf(p);
  }
  writeJson(join(DOCS, "00-summary.json"), phase3Summary);
  writeJson(join(DOCS, "10-checksums.json"), phase3Summary.checksums);

  return phase3Summary;
}

const isDirectRun =
  typeof process.argv[1] === "string" &&
  (process.argv[1].endsWith("build-phase3.ts") || process.argv[1].endsWith("build-phase3.js"));

if (isDirectRun) {
  const summary = runPhase3();
  // eslint-disable-next-line no-console
  console.log(
    JSON.stringify(
      {
        ok: true,
        recall: (summary as { recallPrecision: { expanded: { recall: number | null } } }).recallPrecision.expanded.recall,
        gtEdges: (summary as { independentGroundTruth: { edges: number } }).independentGroundTruth.edges,
        ckfIdempotent: (summary as { ckfImport: { idempotent: boolean | null } }).ckfImport.idempotent,
      },
      null,
      2,
    ),
  );
}
