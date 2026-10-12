/**
 * Autonomous Phase 3 compile bridge for the Matthews dashboard vertical slice.
 *
 * Provider-free path: structure → package-graph → operative-authority →
 * deterministic covenant extraction over authentic EDGAR-reconstructed excerpts.
 * No paid LLMs, no Neon writes, no package CERTIFIED claim, no production remaining.
 */

import { runStructureStage } from "@/lib/contract-model/compiler/stage-structure";
import { detectStructuralDefinitions } from "@/lib/contract-model/compiler/structural-definitions";
import { detectStructuralReferences } from "@/lib/contract-model/compiler/structural-references";
import { buildStructuralIndex } from "@/lib/contract-model/compiler/structural-index";
import { STRUCTURAL_INDEX_VERSION } from "@/lib/contract-model/compiler/types";
import { buildPackageGraph } from "@/lib/contract-model/compiler/package-graph/pipeline";
import {
  buildOperativeAuthorityHandoffBundle,
  summarizeBundleProductionAuthority,
} from "@/lib/contract-model/compiler/operative-authority";
import { extractDeterministicCovenantFacts } from "@/lib/contract-model/compiler/deterministic-extraction/extract";
import { TRUSTED_IDENTITY_PRODUCTION_ACTIVATION } from "@/lib/capacity";
import { matthewsCompilerPackageDocuments } from "./source-excerpts-matthews";

export type CompiledCovenantCandidate = {
  documentId: string;
  sectionHint: string | null;
  familySignals: string[];
  thresholdSignals: string[];
  ratioSignals: string[];
  excerpt: string;
  source: "DETERMINISTIC_EXTRACTION";
  operativeAuthorityClassification: string | null;
  governingDocumentId: string | null;
  displayedOnDashboard: boolean;
};

export type Phase3CompileBridgeResult = {
  asOfDate: string;
  documentsCompiled: number;
  structuralNodeCount: number;
  deterministicFactCount: number;
  compiledCovenants: CompiledCovenantCandidate[];
  autonomouslyCompiledDisplayedCount: number;
  operativeAuthorityClassifications: Array<{
    sectionRef: string | null;
    authorityClassification: string;
    governingDocumentId: string | null;
  }>;
  productionAuthorityActive: boolean;
  trustedIdentityActivation: string;
  path: string[];
  limitations: string[];
  structuralIndexVersion: string;
};

/**
 * Compile authentic Matthews excerpts through structure / OA / deterministic extraction.
 */
export function compileMatthewsPhase3DashboardBridge(
  asOfDate = "2024-12-31",
): Phase3CompileBridgeResult {
  // Provider-free path — no process.env mutation. Stages below never call paid APIs.
  const docs = matthewsCompilerPackageDocuments();
  const path: string[] = ["source-excerpts"];

  const structureResult = runStructureStage(docs);
  const allNodes = structureResult.output;
  path.push(`structure:${allNodes.length}`);

  const nodesByDocument = new Map<string, { text: string; nodes: typeof allNodes }>();
  const allDefinitions = [];
  const allReferences = [];
  for (const doc of docs) {
    const nodes = allNodes.filter((n) => n.documentId === doc.documentId);
    nodesByDocument.set(doc.documentId, { text: doc.text, nodes });
    allDefinitions.push(...detectStructuralDefinitions(doc.documentId, doc.text, nodes));
    allReferences.push(...detectStructuralReferences(doc.documentId, doc.text, nodes));
  }
  buildStructuralIndex(nodesByDocument, allDefinitions, allReferences);
  path.push("structural-index");

  const packageGraph = buildPackageGraph(
    "matthews",
    "matthews-international-q1-fy2025",
    docs.map((d) => ({ documentId: d.documentId, label: d.label, text: d.text })),
  );
  path.push("package-graph");

  const oaBundle = buildOperativeAuthorityHandoffBundle({
    companyId: "matthews",
    packageKey: "matthews-international-q1-fy2025",
    asOfDate,
    documents: docs.map((d) => ({ documentId: d.documentId, label: d.label, text: d.text })),
    packageGraph,
    provisions: [
      { sectionRef: "4.09" },
      { sectionRef: "4.09(a)" },
      { sectionRef: "4.10" },
      { sectionRef: "6.01" },
      { sectionRef: "1.01" },
    ],
    instrumentDocumentIds: docs.map((d) => d.documentId),
    baseDocumentId: "matw-2027-second-lien-notes-indenture",
  });
  path.push("operative-authority");

  const summary = summarizeBundleProductionAuthority(oaBundle, {
    attemptPromotionToProduction: true,
  });

  const compiled: CompiledCovenantCandidate[] = [];
  let deterministicFactCount = 0;

  for (const doc of docs) {
    const extracted = extractDeterministicCovenantFacts({
      text: doc.text,
      documentId: doc.documentId,
      candidateRef: "FULL_DOCUMENT",
      citation: `${doc.edgarAccession}:${doc.documentId}`,
      knownDefinitions: ["Permitted Debt", "Debt Facilities", "Consolidated Fixed Charge Coverage Ratio"],
    });
    deterministicFactCount += extracted.facts.length;
    path.push(`deterministic-extraction:${doc.documentId}:${extracted.facts.length}`);

    const families = [
      ...new Set(
        extracted.facts
          .filter((f) => f.kind === "COVENANT_FAMILY_SIGNAL")
          .map((f) => String((f.value as { family?: string }).family ?? ""))
          .filter(Boolean),
      ),
    ];
    const thresholds = [
      ...new Set(
        extracted.facts
          .filter((f) => f.kind === "NUMERICAL_THRESHOLD")
          .map((f) => String((f.value as { raw?: string; matchedText?: string }).raw ?? (f.value as { matchedText?: string }).matchedText ?? f.source.excerpt ?? ""))
          .filter(Boolean),
      ),
    ].slice(0, 12);
    const ratios = [
      ...new Set(
        extracted.facts
          .filter((f) => f.kind === "FINANCIAL_RATIO")
          .map((f) => String((f.value as { ratioName?: string; matchedText?: string }).ratioName ?? (f.value as { matchedText?: string }).matchedText ?? f.source.excerpt ?? ""))
          .filter(Boolean),
      ),
    ].slice(0, 12);

    if (families.length === 0 && thresholds.length === 0 && ratios.length === 0) continue;

    const indentureProv = oaBundle.provisions.find((p) => (p.sectionRef ?? "").startsWith("4."));
    const caProv = oaBundle.provisions.find((p) => (p.sectionRef ?? "").startsWith("6."));
    const prov =
      doc.documentId === "matw-2027-second-lien-notes-indenture" ? indentureProv : caProv;

    compiled.push({
      documentId: doc.documentId,
      sectionHint: doc.documentId === "matw-2027-second-lien-notes-indenture" ? "4.09" : "6.01",
      familySignals: families,
      thresholdSignals: thresholds,
      ratioSignals: ratios,
      excerpt: doc.text.slice(0, 240),
      source: "DETERMINISTIC_EXTRACTION",
      operativeAuthorityClassification: prov?.authorityClassification ?? null,
      governingDocumentId: prov?.governingDocumentId ?? null,
      displayedOnDashboard: true,
    });
  }

  return {
    asOfDate,
    documentsCompiled: docs.length,
    structuralNodeCount: allNodes.length,
    deterministicFactCount,
    compiledCovenants: compiled,
    autonomouslyCompiledDisplayedCount: compiled.length,
    operativeAuthorityClassifications: oaBundle.provisions.map((p) => ({
      sectionRef: p.sectionRef,
      authorityClassification: p.authorityClassification,
      governingDocumentId: p.governingDocumentId,
    })),
    productionAuthorityActive: summary.allProvisionsProductionActive === true,
    trustedIdentityActivation: TRUSTED_IDENTITY_PRODUCTION_ACTIVATION.status,
    path,
    limitations: [
      "EDGAR-reconstructed excerpts — not the full Indenture exhibit.",
      "Deterministic structure/package-graph/OA/extraction only — no paid inference.",
      "Capacity arithmetic still via evaluateProvision leaf formulas on authentic financials.",
      "Not package CERTIFIED; not Phase 4E; not PRODUCTION_AUTHORITATIVE remaining.",
    ],
    structuralIndexVersion: STRUCTURAL_INDEX_VERSION,
  };
}
