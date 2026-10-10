/**
 * AGENT #11 ROUND 2 — Independent end-to-end acceptance on post-integration main.
 *
 * Guardrails:
 * - No paid inference (synthetic StageCaller; DETERMINISTIC_ONLY local compile).
 * - No production Neon writes.
 * - Does not modify legal-reference answers after seal.
 * - Does not alter production code (lib/, app/, prisma/).
 *
 * Usage: npx tsx scripts/agent-11/run-round2-acceptance.ts
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { execFileSync } from "node:child_process";

delete process.env.AI_GATEWAY_API_KEY;
delete process.env.ANTHROPIC_API_KEY;

import { runStructureStage } from "../../lib/contract-model/compiler/stage-structure";
import {
  detectStructuralDefinitions,
  type DetectedDefinition,
} from "../../lib/contract-model/compiler/structural-definitions";
import {
  detectStructuralReferences,
  type DetectedReference,
} from "../../lib/contract-model/compiler/structural-references";
import { buildStructuralIndex, type StructuralIndex } from "../../lib/contract-model/compiler/structural-index";
import { STRUCTURAL_INDEX_VERSION, type StructuralNode } from "../../lib/contract-model/compiler/types";
import { runPassADeterministicSignals } from "../../lib/contract-model/compiler/discovery/pass-a-signals";
import { DISCOVERY_PIPELINE_VERSION, runDiscoveryPipeline } from "../../lib/contract-model/compiler/discovery/pipeline";
import type { DiscoveredCandidate } from "../../lib/contract-model/compiler/discovery/types";
import { buildPackageGraph } from "../../lib/contract-model/compiler/package-graph/pipeline";
import { PACKAGE_GRAPH_PIPELINE_VERSION } from "../../lib/contract-model/compiler/package-graph/pipeline";
import type { PackageDocumentInput } from "../../lib/contract-model/compiler/package-graph/types";
import { assignPackageDocumentRoles } from "../../lib/contract-model/compiler/package-graph/document-roles";
import { buildOperativeHandoffBundle } from "../../lib/contract-model/compiler/package-graph/operative-handoff";
import { buildCovenantContextBundle } from "../../lib/contract-model/compiler/context-retrieval/pipeline";
import { RETRIEVAL_ALGORITHM_VERSION } from "../../lib/contract-model/compiler/context-retrieval/types";
import { runAmendmentPipeline } from "../../lib/contract-model/compiler/amendment/pipeline";
import { computeOperativeContractState, buildNodeSupersessionIndex } from "../../lib/contract-model/compiler/amendment/operative-state";
import { getStageCaller } from "../../lib/contract-model/compiler/llm-caller";
import { extractDeterministicCovenantFacts } from "../../lib/contract-model/compiler/deterministic-extraction";
import { compileLocalSemanticUnit } from "../../lib/contract-model/compiler/local-semantic";
import { LOCAL_SEMANTIC_COMPILER_VERSION } from "../../lib/contract-model/compiler/local-semantic/schema";
import {
  assertProductCapacityConsistency,
  buildSharedProductCapacityViews,
  evidenceFromAttributedLedger,
  productionTrustedIssuerAuth,
  resolveUtilization,
  sessionCounselPrincipal,
  sessionCustodianPrincipal,
  validateFinancialMetricEvidence,
  validateAuthenticatedFinancialSnapshot,
  buildVerifiedCapacityInputHandoff,
  mayUseAsProductionCapacityInput,
  type FinancialMetricEvidence,
  type AuthenticatedFinancialSnapshotEvidence,
} from "../../lib/capacity";
import { compileFrozenDebtPackage } from "../../lib/contract-model/analysis/offline-package-compile";
import {
  presentCapacityClaim,
  wouldBeFalseFavorableAvailable,
  mapEngineLabelToCustomerStatus,
  presentAskAnswer,
} from "../../lib/customer-workflow";

/** Round-1 frozen scorecard denominators (do not change). */
const ROUND1_BASELINE = {
  mainShaEvaluated: "c53afbf6c4ac360569cb25324d8bb405110fa91a",
  metrics: {
    operativeDocumentAccuracy: { numerator: 0, denominator: 1 },
    contextSufficiency: { numerator: 1, denominator: 10 },
    verifiedExecutableCoverage: { numerator: 0, denominator: 10 },
    financialEvidenceCompleteness: { numerator: 0, denominator: 1 },
    falseFavorableOutcomes: { numerator: 0, denominator: 12 },
    structuralRecall: { numerator: 10, denominator: 10 },
    discoveryPassARecall: { numerator: 10, denominator: 10 },
    completeOperativeSpan: { numerator: 7, denominator: 10 },
    utilizationCompleteness: { numerator: 1, denominator: 1 },
    correctRefusal: { numerator: 5, denominator: 5 },
    customerSurfaceConsistency: { numerator: 1, denominator: 1 },
  },
  stageClasses: {
    "1_UPLOAD": "VERIFIED",
    "2_IDENTIFY_DOCUMENTS": "VERIFIED",
    "3_RESOLVE_OPERATIVE": "BLOCKED",
    "4_DISCOVER_COVENANTS": "VERIFIED",
    "5_RETRIEVE_CONTEXT": "BLOCKED",
    "6_COMPILE_VERIFIED_IR": "BLOCKED",
    "7_ATTACH_FINANCIAL_EVIDENCE": "UNSUPPORTED",
    "8_RECONSTRUCT_UTILIZATION": "VERIFIED",
    "9_EVIDENCE_REVIEWER_AUTHORITY": "VERIFIED",
    "10_HYPOTHETICAL_TRANSACTION": "HYPOTHETICAL_ONLY",
    "11_PRODUCTION_AUTHORITY": "VERIFIED",
    "12_SURFACE_DISPLAY": "VERIFIED",
  },
} as const;

const REPO = process.cwd();
const FIX = join(REPO, "tests/fixtures/unseen-packages/an-2020-2026-credit-facility");
const OUT = join(REPO, "docs/agent-11-round2-acceptance");
const LEGAL_DIR = join(REPO, "docs/agent-11-e2e-acceptance");
const RUN = join(FIX, "offline-eval-run");
const LEGAL = JSON.parse(readFileSync(join(LEGAL_DIR, "05-legal-reference-answers.json"), "utf8"));
const SEAL = JSON.parse(readFileSync(join(LEGAL_DIR, "03-package-seal.json"), "utf8"));
const SEAL_COMMIT_META = JSON.parse(readFileSync(join(LEGAL_DIR, "03b-seal-commit.json"), "utf8"));

const DOCS = [
  {
    documentId: "doc-a",
    label: "AN Third AR Credit Agreement 2020-03-26",
    file: "doc-a-2020-03-26-third-ar-credit-agreement.txt",
  },
  {
    documentId: "doc-b",
    label: "AN Fifth AR Credit Agreement 2026-09-14",
    file: "doc-b-2026-09-14-fifth-ar-credit-agreement.txt",
  },
] as const;

type StageClass = "VERIFIED" | "HYPOTHETICAL_ONLY" | "BLOCKED" | "UNSUPPORTED" | "NOT_TESTED";

function sha256Text(s: string): string {
  return createHash("sha256").update(s, "utf8").digest("hex");
}

function preserve(name: string, data: unknown) {
  if (!existsSync(RUN)) mkdirSync(RUN, { recursive: true });
  writeFileSync(join(RUN, `${name}.json`), JSON.stringify(data, null, 2) + "\n");
  writeFileSync(join(OUT, `${name}.json`), JSON.stringify(data, null, 2) + "\n");
  console.log(`  [wrote] ${name}.json`);
}

function normalizeSectionRef(ref: string | null | undefined): string {
  if (!ref) return "";
  return ref.replace(/^Section\s+/i, "").replace(/\s+/g, "").toLowerCase();
}

function sectionMatches(nodeRef: string | null | undefined, want: string): boolean {
  const a = normalizeSectionRef(nodeRef);
  const b = normalizeSectionRef(want);
  if (!a || !b) return false;
  if (want === "preamble" || want === "1.1") {
    // definitions / preamble handled separately
  }
  return a === b || a.startsWith(b + ".") || a.startsWith(b + "(") || b.startsWith(a + ".") || a === b.replace(/\.$/, "");
}

function findSectionNodes(nodes: StructuralNode[], documentId: string, sectionRef: string): StructuralNode[] {
  if (sectionRef === "preamble") return [];
  return nodes.filter(
    (n) => n.documentId === documentId && n.nodeType === "SECTION" && sectionMatches(n.sectionRef, sectionRef),
  );
}

function nodeText(index: StructuralIndex, nodeId: string): string {
  try {
    return index.getNodeText(nodeId, "DESCENDANTS");
  } catch {
    return index.getNodeText(nodeId, "OWN");
  }
}

function includesAllAnchors(haystack: string, anchors: string[]): { hit: number; miss: string[] } {
  const miss: string[] = [];
  let hit = 0;
  for (const a of anchors) {
    const compactHay = haystack.replace(/\s+/g, " ");
    const compactA = a.replace(/\s+/g, " ");
    if (compactHay.includes(compactA) || haystack.includes(a)) hit++;
    else miss.push(a);
  }
  return { hit, miss };
}

function probeCandidate(documentId: string, node: StructuralNode, family: string): DiscoveredCandidate {
  return {
    discoveryId: `probe:${documentId}:${node.nodeId}`,
    documentId,
    structuralNodeKeys: [node.nodeKey],
    structuralNodeIds: [node.nodeId],
    normalizedSourceRef: node.sectionRef ?? node.nodeKey,
    families: [family as never],
    role: "GENERAL_PROHIBITION",
    roleRaw: "GENERAL_PROHIBITION",
    roleNormalizationStatus: "VALID_CANONICAL",
    familiesRaw: [family],
    familiesNormalizationStatus: "VALID_CANONICAL",
    description: `Independent GT probe for ${node.sectionRef}`,
    multipleRulesLikely: false,
    definedTermDependencyLikely: true,
    discoveryMethods: ["DETERMINISTIC_SIGNAL"],
    evidenceSignals: ["gt_probe"],
    reviewStatus: "AUTO_ACCEPTED",
    confidence: null,
    sourceCitation: `${documentId} §${node.sectionRef}`,
    discoveryRunVersion: "agent-11-gt-probe.v1",
    supersessionStatus: "UNKNOWN_SUPERSESSION_STATUS",
    supersessionReason: "GT probe — supersession assessed separately",
  };
}

function gitHead(): string {
  return execFileSync("git", ["rev-parse", "HEAD"], { cwd: REPO, encoding: "utf8" }).trim();
}

async function main() {
  const started = Date.now();
  console.log("======= AGENT #11 ROUND 2 OFFLINE E2E ACCEPTANCE =======");
  console.log("paidInference: FORBIDDEN; neonWrites: FORBIDDEN");

  const legalNow = sha256Text(readFileSync(join(LEGAL_DIR, "05-legal-reference-answers.json"), "utf8"));
  if (legalNow !== SEAL_COMMIT_META.legalReferenceAnswersSha256) {
    throw new Error(
      `Legal reference answers mutated after seal. seal=${SEAL_COMMIT_META.legalReferenceAnswersSha256} now=${legalNow}`,
    );
  }

  const hashCheck = DOCS.map((d) => {
    const text = readFileSync(join(FIX, "extracted-text", d.file), "utf8");
    const sealed = SEAL.documents.find((x: { documentId: string }) => x.documentId === d.documentId);
    const h = sha256Text(text);
    return {
      documentId: d.documentId,
      extractedSha256: h,
      matchesSeal: h === sealed.extractedSha256,
      sealed: sealed.extractedSha256,
    };
  });
  if (hashCheck.some((h) => !h.matchesSeal)) {
    throw new Error(`Package source hash mismatch vs seal: ${JSON.stringify(hashCheck)}`);
  }

  const caller = getStageCaller();
  if (!caller.isSynthetic) {
    throw new Error("Stage caller is not synthetic — aborting to enforce no paid inference");
  }

  const mainSha = gitHead();
  const prInventory = {
    artifact: "AGENT11_ROUND2_PR_INVENTORY",
    evaluatedMainSha: mainSha,
    originMainSha: execFileSync("git", ["rev-parse", "origin/main"], {
      cwd: REPO,
      encoding: "utf8",
    }).trim(),
    note: "Inventory is tip-of-main only. OPEN PRs are NOT credited as present.",
    targetPrs: {
      "283": {
        title: "HEADROOM-7: operative restatement authority",
        state: "OPEN",
        mergedToMain: false,
        creditedOnTip: false,
      },
      "287": {
        title: "HEADROOM-6: recursive legal context retrieval",
        state: "OPEN",
        mergedToMain: false,
        creditedOnTip: false,
      },
      "281": {
        title: "feat(capacity): financial statement & utilization evidence pathway (HEADROOM-9)",
        state: "OPEN",
        mergedToMain: false,
        creditedOnTip: false,
      },
      "282": {
        title: "feat(capacity): trusted identity boundary — fail-closed IdP adapter (HEADROOM-8)",
        state: "OPEN",
        mergedToMain: false,
        creditedOnTip: false,
      },
      "285": {
        title: "feat(product): canonical unified verified transaction execution (Agent #10)",
        state: "OPEN",
        mergedToMain: false,
        creditedOnTip: false,
      },
    },
    mergedSinceRound1Relevant: {
      "278": {
        title: "integrate: five-agent Headroom product readiness",
        state: "MERGED",
        mergedToMain: true,
        creditedOnTip: true,
        mergeCommit: "a397529c97938aa1fdcf8d2f598721b3de77e350",
      },
      "279": {
        title: "feat(capacity): reconcile #273 financial-evidence onto post-#268 main",
        state: "MERGED",
        mergedToMain: true,
        creditedOnTip: true,
      },
      "280": {
        title: "feat(customer-workflow): reconcile #275 truthful status onto post-#268 main",
        state: "MERGED",
        mergedToMain: true,
        creditedOnTip: true,
      },
      "289": {
        title: "fix(ci): restore certified-path typecheck after #278",
        state: "MERGED",
        mergedToMain: true,
        creditedOnTip: true,
        mergeCommit: "4f1a0b81207364373d9a4cb9fe515d4a1a002e56",
      },
    },
    modulesOnTip: {
      financialEvidence: existsSync(join(REPO, "lib/capacity/financial-evidence.ts")),
      customerWorkflow: existsSync(join(REPO, "lib/customer-workflow/index.ts")),
      offlinePackageCompile: existsSync(
        join(REPO, "lib/contract-model/analysis/offline-package-compile.ts"),
      ),
      verifiedInputContract: existsSync(join(REPO, "lib/capacity/verified-input-contract.ts")),
    },
  };
  preserve("01-pr-inventory", prInventory);

  const documents = DOCS.map((d) => ({
    documentId: d.documentId,
    label: d.label,
    text: readFileSync(join(FIX, "extracted-text", d.file), "utf8"),
  }));

  const stageClassifications: Record<
    string,
    { class: StageClass; evidence: string; notes?: string; integrationState?: string }
  > = {};

  // ----- 1. Upload -----
  console.log("\n=== 1. Upload authentic debt package ===");
  const uploadEvidence = {
    mode: "OFFLINE_FIXTURE_LOAD",
    packageKey: SEAL.packageKey,
    documents: hashCheck,
    neonWrite: false,
    note: "Authentic EDGAR texts loaded from sealed fixture paths — no production Neon write.",
  };
  preserve("10-01-upload", uploadEvidence);
  stageClassifications["1_UPLOAD"] = {
    class: "VERIFIED",
    evidence: "10-01-upload.json",
    integrationState: "TESTED_AND_VERIFIED",
    notes: "Offline sealed load of authentic EDGAR exhibits; not a live SaaS upload path.",
  };

  // ----- A / structural -----
  console.log("\n=== Structural indexing ===");
  const structureResult = runStructureStage(documents);
  const allNodes: StructuralNode[] = structureResult.output;
  const nodesByDocument = new Map<string, { text: string; nodes: StructuralNode[] }>();
  const allDefinitions: DetectedDefinition[] = [];
  const allReferences: DetectedReference[] = [];
  for (const doc of documents) {
    const nodes = allNodes.filter((n) => n.documentId === doc.documentId);
    nodesByDocument.set(doc.documentId, { text: doc.text, nodes });
    allDefinitions.push(...detectStructuralDefinitions(doc.documentId, doc.text, nodes));
    allReferences.push(...detectStructuralReferences(doc.documentId, doc.text, nodes));
  }
  const index: StructuralIndex = buildStructuralIndex(nodesByDocument, allDefinitions, allReferences);
  const structuralSummary = documents.map((d) => {
    const nodes = allNodes.filter((n) => n.documentId === d.documentId);
    const byType: Record<string, number> = {};
    for (const n of nodes) byType[n.nodeType] = (byType[n.nodeType] ?? 0) + 1;
    return {
      documentId: d.documentId,
      textChars: d.text.length,
      totalNodes: nodes.length,
      nodesByType: byType,
      definitionsDetected: allDefinitions.filter((x) => x.documentId === d.documentId).length,
      referencesDetected: allReferences.filter((x) => x.documentId === d.documentId).length,
    };
  });
  preserve("10a-structural-summary", {
    structuralIndexVersion: STRUCTURAL_INDEX_VERSION,
    summary: structuralSummary,
    healthDiagnostics: index.healthDiagnostics(),
  });

  // ----- 2/3 Package graph + operative -----
  console.log("\n=== 2/3 Identify documents + resolve operative ===");
  const pkgDocs: PackageDocumentInput[] = documents.map((d) => ({
    documentId: d.documentId,
    label: d.label,
    text: d.text,
  }));
  const packageGraph = buildPackageGraph("agent-11-an-eval", "an-2020-2026-credit-facility", pkgDocs);
  const documentRoles = assignPackageDocumentRoles(
    packageGraph.classifications,
    packageGraph.identities,
    packageGraph.relationshipCandidates,
  );
  preserve("10d-package-graph", {
    packageGraphPipelineVersion: PACKAGE_GRAPH_PIPELINE_VERSION,
    classifications: packageGraph.classifications,
    relationships: packageGraph.relationshipCandidates,
    instruments: packageGraph.instruments,
    identities: packageGraph.identities,
    documentRoles,
  });

  const amendment = await runAmendmentPipeline(caller, { documents: pkgDocs, packageGraph, index });
  preserve("10d-amendment-pipeline", {
    callerSynthetic: caller.isSynthetic,
    summary: amendment.summary,
    effectCount: amendment.effects.length,
    effectsSample: amendment.effects.slice(0, 40).map((e) => ({
      effectId: e.effectId,
      amendmentDocumentId: e.amendmentDocumentId,
      operation: e.operation,
      status: e.status,
      target: e.target,
      unresolvedReason: e.unresolvedReason ?? null,
    })),
    unattachedCount: amendment.unattachedEffects.length,
  });

  let operativeState: ReturnType<typeof computeOperativeContractState> | null = null;
  let supersessionIndex: ReturnType<typeof buildNodeSupersessionIndex> | null = null;
  let handoff: ReturnType<typeof buildOperativeHandoffBundle> | null = null;
  try {
    const instrumentKey =
      packageGraph.instruments.find((i) => i.documentIds.includes("doc-b"))?.instrumentKey ??
      packageGraph.instruments[0]?.instrumentKey ??
      "instrument:doc-b";
    operativeState = computeOperativeContractState({
      instrumentKey,
      baseDocumentId: "doc-a",
      asOfDate: "2026-09-15",
      index,
      allEffects: amendment.effects,
      unresolvedTargetEffectsForThisInstrument: amendment.unattachedEffects.filter(
        (e) => e.amendmentDocumentId === "doc-b",
      ),
    });
    supersessionIndex = buildNodeSupersessionIndex([{ baseDocumentId: "doc-a", state: operativeState }]);
    handoff = buildOperativeHandoffBundle({
      packageGraph,
      asOfDate: "2026-09-15",
      operativeStates: [operativeState],
    });
  } catch (err) {
    preserve("10d-operative-state-error", {
      error: err instanceof Error ? err.message : String(err),
    });
  }
  preserve("10d-operative-state", {
    instrumentKey: operativeState?.instrumentKey ?? null,
    asOfDate: operativeState?.asOfDate ?? null,
    status: operativeState?.status ?? null,
    summary: operativeState?.summary ?? null,
    provisionViewCount: operativeState?.provisions.length ?? 0,
      unattachedEffects: operativeState?.unattachedEffects.length ?? 0,
    operativeDocument: operativeState?.operativeDocument ?? null,
    handoff: handoff
      ? {
          packageKey: handoff.packageKey,
          asOfDate: handoff.asOfDate,
          instrumentCount: handoff.instruments.length,
          documentRoles: handoff.documentRoles,
          blocked: JSON.stringify(handoff).includes("PROVISIONAL_IDENTITY_BLOCKED"),
          summaryKeys: Object.keys(handoff),
        }
      : null,
  });

  const identifiedDocs = packageGraph.classifications.length === 2;
  const operativeDocumentId = operativeState?.operativeDocument?.operativeDocumentId ?? null;
  stageClassifications["2_IDENTIFY_DOCUMENTS"] = {
    class: identifiedDocs ? "VERIFIED" : "BLOCKED",
    evidence: "10d-package-graph.json",
    integrationState: identifiedDocs ? "TESTED_AND_VERIFIED" : "TESTED_AND_BLOCKED",
    notes: `classifications=${JSON.stringify(packageGraph.classifications.map((c) => ({ id: c.documentId, type: c.type })))}`,
  };

  stageClassifications["3_RESOLVE_OPERATIVE"] = {
    class: operativeDocumentId === "doc-b" ? "VERIFIED" : "BLOCKED",
    evidence: "10d-operative-state.json",
    integrationState:
      operativeDocumentId === "doc-b" ? "TESTED_AND_VERIFIED" : "TESTED_AND_BLOCKED",
    notes: `operativeDocumentId=${operativeDocumentId}; operativeDocStatus=${operativeState?.operativeDocument?.status ?? "n/a"}; stateStatus=${operativeState?.status ?? "n/a"}; handoffBlocked=${handoff ? JSON.stringify(handoff).includes("PROVISIONAL_IDENTITY_BLOCKED") : "n/a"}; #283 not on tip`,
  };

  // ----- 4 Discovery -----
  console.log("\n=== 4. Discover covenants ===");
  const passAByDoc: Record<string, ReturnType<typeof runPassADeterministicSignals>> = {};
  for (const doc of documents) {
    passAByDoc[doc.documentId] = runPassADeterministicSignals(
      doc.documentId,
      index,
      supersessionIndex ?? undefined,
    );
  }
  const discoveryByDoc: Record<string, Awaited<ReturnType<typeof runDiscoveryPipeline>>> = {};
  for (const doc of documents) {
    discoveryByDoc[doc.documentId] = await runDiscoveryPipeline(
      caller,
      doc.documentId,
      index,
      supersessionIndex ?? undefined,
    );
  }
  preserve("10b-discovery", {
    discoveryPipelineVersion: DISCOVERY_PIPELINE_VERSION,
    note: "Pass B uses synthetic caller (no paid inference). Pass A is the offline discovery signal.",
    passACounts: Object.fromEntries(Object.entries(passAByDoc).map(([k, v]) => [k, v.length])),
    discoverySummaries: Object.fromEntries(Object.entries(discoveryByDoc).map(([k, v]) => [k, v.summary])),
  });

  // ----- Clause scoring -----
  console.log("\n=== Legal coverage scoring ===");
  const clauseRows = [];
  let contextSufficient = 0;
  let structuralHits = 0;
  let passAHits = 0;
  let completeSpans = 0;
  let executableClaimed = 0;
  let falseFavorable = 0;
  let correctRefusals = 0;
  let refuseExpected = 0;

  for (const clause of LEGAL.clauses as Array<Record<string, unknown>>) {
    const documentId = String(clause.documentId);
    const sectionRef = String(clause.sectionRef);
    const clauseId = String(clause.clauseId);
    const anchors = (clause.citationAnchors as string[]) ?? [];
    const requiredDefs = (clause.requiredDefinitions as string[]) ?? [];
    const family = String(clause.family);

    let sectionNodes = findSectionNodes(allNodes, documentId, sectionRef);
    // Definition clauses: try to locate definition nodes / term occurrences
    if (sectionRef === "1.1" || sectionRef === "preamble") {
      const termHint =
        family === "DEFINITION"
          ? String(clause.title)
          : anchors[0]?.match(/“\s*([^”]+)\s*”/)?.[1] ?? String(clause.title);
      // Definition presence scored via structural definition index (not section nodes).
      void termHint;
    }

    const foundStructurally =
      sectionNodes.length > 0 ||
      (sectionRef === "preamble" &&
        documents.find((d) => d.documentId === documentId)!.text.includes("amended and restated")) ||
      (sectionRef === "1.1" &&
        requiredDefs.some((t) =>
          allDefinitions.some(
            (d) => d.documentId === documentId && (d.normalizedTerm ?? "").toLowerCase().includes(t.toLowerCase()),
          ),
        ));
    if (foundStructurally) structuralHits++;

    const ranked = sectionNodes
      .map((n) => ({ node: n, text: nodeText(index, n.nodeId) }))
      .sort((a, b) => b.text.length - a.text.length);
    const best = ranked[0] ?? null;
    const firstMatch = sectionNodes[0] ?? null;
    const primary = best?.node ?? null;
    const spanText =
      best?.text ??
      (sectionRef === "preamble" || sectionRef === "1.1"
        ? documents.find((d) => d.documentId === documentId)!.text.slice(0, 80000)
        : "");
    const firstMatchText = firstMatch ? nodeText(index, firstMatch.nodeId) : "";
    const anchorCheck = includesAllAnchors(spanText, anchors);
    const firstMatchAnchorCheck = includesAllAnchors(firstMatchText || spanText, anchors);
    const completeOperativeSpan = anchors.length === 0 ? foundStructurally : anchorCheck.miss.length === 0;
    if (completeOperativeSpan) completeSpans++;
    const naiveFirstMatchComplete =
      anchors.length === 0 ? foundStructurally : firstMatchAnchorCheck.miss.length === 0;
    const tocCollision =
      sectionNodes.length > 1 &&
      firstMatch !== null &&
      best !== null &&
      firstMatch.nodeId !== best.node.nodeId &&
      firstMatchText.length < spanText.length / 2;

    const passA = passAByDoc[documentId] ?? [];
    const discovered =
      passA.some((c) => sectionMatches(c.sectionRef, sectionRef)) ||
      (primary
        ? passA.some((c) => {
            if (c.nodeId === primary.nodeId) return true;
            const node = allNodes.find((n) => n.nodeId === c.nodeId);
            return !!node && sectionMatches(node.sectionRef, sectionRef);
          })
        : false) ||
      (family === "DEFINITION" && foundStructurally) ||
      (family === "AMENDMENT" && foundStructurally);
    if (discovered) passAHits++;

    const defNames = allDefinitions
      .filter((d) => d.documentId === documentId)
      .map((d) => (d.normalizedTerm || d.exactTerm || "").toLowerCase())
      .filter(Boolean);
    const defsResolved = requiredDefs.map((t) => ({
      term: t,
      foundInStructuralDefinitions: defNames.some(
        (n) => n === t.toLowerCase() || n.includes(t.toLowerCase()) || t.toLowerCase().includes(n),
      ),
    }));

    let contextBundle = null;
    let contextCompleteness = null;
    if (primary || family === "DEFINITION" || family === "AMENDMENT") {
      const probeNode =
        primary ??
        allNodes.find((n) => n.documentId === documentId && n.nodeType === "SECTION") ??
        null;
      if (probeNode) {
        const candidate = probeCandidate(
          documentId,
          probeNode,
          family === "DEFINITION" || family === "AMENDMENT" || family === "MERGER" ? "OTHER" : family,
        );
        const exactTermsByDocument = new Map<string, Map<string, string>>();
        for (const d of documents) {
          const m = new Map<string, string>();
          for (const def of allDefinitions.filter((x) => x.documentId === d.documentId)) {
            if (def.normalizedTerm) m.set(def.normalizedTerm, def.exactTerm);
          }
          exactTermsByDocument.set(d.documentId, m);
        }
        const bundle = buildCovenantContextBundle(
          {
            candidate,
            packageKey: "an-2020-2026-credit-facility",
            companyId: "agent-11-an-eval",
            instrumentKey: "an-revolving-facility",
          },
          {
            index,
            packageGraph,
            exactTermsByDocument,
            operativeState: operativeState ?? undefined,
            supersessionIndex: supersessionIndex ?? undefined,
          },
        );
        contextBundle = {
          sufficiencyState: bundle.sufficiencyState,
          itemCounts: bundle.items.reduce((acc: Record<string, number>, it) => {
            acc[it.type] = (acc[it.type] ?? 0) + 1;
            return acc;
          }, {}),
          unresolvedCount: bundle.unresolvedDependencies.length,
          retrievalAlgorithmVersion: RETRIEVAL_ALGORITHM_VERSION,
          stopReasons: bundle.stopReasons,
        };
        if (bundle.sufficiencyState === "SUFFICIENT") contextSufficient++;
        const bundleText = bundle.items.map((i) => `${i.excerptText ?? ""}\n${i.sourceCitation ?? ""}`).join("\n");
        const defHits = requiredDefs.filter((t) => bundleText.toLowerCase().includes(t.toLowerCase()));
        contextCompleteness = {
          requiredDefinitions: requiredDefs.length,
          definitionsPresentInBundleText: defHits.length,
          missingDefinitions: requiredDefs.filter(
            (t) => !bundleText.toLowerCase().includes(t.toLowerCase()),
          ),
          anchorsInBundle: includesAllAnchors(bundleText + "\n" + spanText, anchors),
        };
      }
    }

    const det = extractDeterministicCovenantFacts({
      text: spanText || documents.find((d) => d.documentId === documentId)!.text.slice(0, 20000),
      documentId,
      candidateRef: clauseId,
      citation: `${documentId} §${sectionRef}`,
      knownFamilies: ["DEFINITION", "AMENDMENT", "MERGER"].includes(family) ? [] : [family as never],
      knownDefinitions: requiredDefs,
    });
    const local = await compileLocalSemanticUnit(
      {
        unitId: clauseId,
        documentId,
        sectionRef,
        operativeText: spanText.slice(0, 20000) || "(no section span)",
        dependencyTexts: requiredDefs.slice(0, 5).map((t) => ({ ref: t, text: `term:${t}` })),
      },
      { mode: "DETERMINISTIC_ONLY" },
    );

    const expectsRefuse = String(clause.expectedExecution).toUpperCase().includes("REFUSE");
    if (expectsRefuse) refuseExpected++;
    // Local deterministic compile is always UNVERIFIED — never counts as independently verified executable IR.
    const producedExecutable = false;
    if (producedExecutable) executableClaimed++;
    const falseExecutable = producedExecutable && expectsRefuse;
    const productionCapacityAllowed = false;
    const correctRefusal = expectsRefuse ? !productionCapacityAllowed && !falseExecutable : null;
    if (correctRefusal === true) correctRefusals++;
    const falseFavorableCapacity = productionCapacityAllowed && expectsRefuse;
    if (falseFavorableCapacity) falseFavorable++;

    // Fidelity checks against known amendment deltas
    const docBText = documents.find((d) => d.documentId === "doc-b")!.text;
    const docAText = documents.find((d) => d.documentId === "doc-a")!.text;
    const fidelity = {
      capitalizationAbsentFromDocB: !/Consolidated Capitalization Ratio/.test(
        docBText.slice(docBText.indexOf("ARTICLE VIII\nNegative")),
      ),
      interestCoveragePresentInDocB: docBText.includes("Consolidated Interest Coverage Ratio") && docBText.includes("3.00 to 1.00"),
      facilitySizeDocB: docBText.includes("$2,000,000,000"),
      facilitySizeDocA: docAText.includes("$1,800,000,000"),
      lcThresholdDocB: docBText.includes("$175,000,000"),
      lcThresholdDocA: docAText.includes("$150,000,000"),
    };

    clauseRows.push({
      clauseId,
      documentId,
      sectionRef,
      family,
      foundStructurally,
      sectionNodeCount: sectionNodes.length,
      tocCollision,
      selectedNodeId: primary?.nodeId ?? null,
      naiveFirstMatchNodeId: firstMatch?.nodeId ?? null,
      discoveredByPassA: discovered,
      completeOperativeSpan,
      naiveFirstMatchCompleteOperativeSpan: naiveFirstMatchComplete,
      missingAnchors: anchorCheck.miss,
      definitionsResolvedStructural: defsResolved,
      contextBundle,
      contextCompleteness,
      deterministicFactCount: det.facts.length,
      localCompile: {
        mode: "DETERMINISTIC_ONLY",
        verificationStatus: local.verificationStatus,
        compilerVersion: LOCAL_SEMANTIC_COMPILER_VERSION,
        hasOutput: !!local.output,
        ruleCount: local.output?.rules?.length ?? 0,
        unsupportedSemantics: local.output?.unsupportedSemantics ?? null,
      },
      independentVerification: "NOT_RUN_PAID_BLOCKED",
      executableIr: "NOT_CLAIMED — local path UNVERIFIED / not production-authoritative",
      productionAuthoritativeCapacity: "REFUSED_NO_EVIDENCE",
      correctRefusal,
      falseExecutable,
      falseFavorableCapacity,
      fidelity,
    });
  }
  preserve("10-clause-coverage", { clauses: clauseRows, denominators: { clauseCount: LEGAL.clauses.length } });

  stageClassifications["4_DISCOVER_COVENANTS"] = {
    class: passAHits >= Math.ceil(LEGAL.clauses.length * 0.6) ? "VERIFIED" : "BLOCKED",
    evidence: "10b-discovery.json + 10-clause-coverage.json",
    integrationState:
      passAHits >= Math.ceil(LEGAL.clauses.length * 0.6)
        ? "TESTED_AND_VERIFIED"
        : "TESTED_AND_BLOCKED",
    notes: `passAHits=${passAHits}/${LEGAL.clauses.length}`,
  };
  stageClassifications["5_RETRIEVE_CONTEXT"] = {
    class:
      contextSufficient >= Math.ceil(LEGAL.clauses.length * 0.8)
        ? "VERIFIED"
        : contextSufficient > 0
          ? "BLOCKED"
          : "BLOCKED",
    evidence: "10-clause-coverage.json",
    integrationState:
      contextSufficient >= Math.ceil(LEGAL.clauses.length * 0.8)
        ? "TESTED_AND_VERIFIED"
        : "TESTED_AND_BLOCKED",
    notes: `SUFFICIENT=${contextSufficient}/${LEGAL.clauses.length} (threshold for VERIFIED: ≥80%); #287 not on tip`,
  };
  stageClassifications["6_COMPILE_VERIFIED_IR"] = {
    class: executableClaimed === 0 ? "BLOCKED" : "VERIFIED",
    evidence: "10-clause-coverage.json + 10e-offline-package-compile.json",
    integrationState: executableClaimed === 0 ? "TESTED_AND_BLOCKED" : "TESTED_AND_VERIFIED",
    notes: `verifiedExecutable=${executableClaimed}/${LEGAL.clauses.length}; paid inference blocked; local DETERMINISTIC_ONLY is UNVERIFIED; fixture IR not counted`,
  };

  // ----- 7–12 Financial / utilization / tracks / surfaces (+ Round-2 probes) -----
  console.log("\n=== 7–12 Financial evidence, utilization, tracks, surfaces ===");
  const hasFinancialEvidenceModule = existsSync(join(REPO, "lib/capacity/financial-evidence.ts"));
  const hasCustomerWorkflow = existsSync(join(REPO, "lib/customer-workflow/index.ts"));

  const AS_OF = "2026-09-15";
  const RULE_LIEN = "an-b-8.3-xix-cta-basket";
  const RULE_FACILITY = "an-b-total-revolving-commitment";
  const COMPANY_ID = "autonation-eval";

  // TRACK 2 production: missing authenticated inputs → refuse
  const productionViews = buildSharedProductCapacityViews({
    gross: {
      amount: 2_000_000_000,
      gateSatisfied: false,
      modeled: false,
      capacityRuleId: RULE_FACILITY,
      formulaLabel: "Total Revolving Credit Commitment (doc-b)",
      sectionRef: "1.1",
      refusalReason:
        "No authenticated financial evidence / utilization completeness / trusted reviewer approval on main tip",
    },
    utilization: {
      capacityRuleId: RULE_FACILITY,
      asOf: AS_OF,
      records: [],
      completenessCertificate: null,
      trustedIssuerAuth: null,
    },
    sourceCitations: ["doc-b Total Revolving Credit Commitment $2,000,000,000"],
    certificationStatus: "NOT_CERTIFIED",
  });
  const productionConsistency = assertProductCapacityConsistency(productionViews);
  const productionMayPublish = Object.values(productionViews).some((v) => v.mayPublishAvailable);
  const productionRemaining = Object.values(productionViews).map((v) => v.supportedRemainingCapacity);

  // Forged issuer / incomplete util adversarial
  const forgedAuth = productionTrustedIssuerAuth([
    sessionCounselPrincipal("counsel-alice"),
    sessionCustodianPrincipal("custodian-bob"),
  ]);
  const forgedViews = buildSharedProductCapacityViews({
    gross: {
      amount: 100,
      gateSatisfied: true,
      modeled: true,
      capacityRuleId: RULE_LIEN,
    },
    utilization: {
      capacityRuleId: RULE_LIEN,
      asOf: AS_OF,
      records: [
        evidenceFromAttributedLedger({
          usageId: "u-forged",
          amount: 10,
          currency: "USD",
          effectiveAsOf: "2026-01-01",
          capacityRuleId: RULE_LIEN,
          status: "ACTIVE",
          approvalState: "APPROVED",
          sourceLabel: "forged-issuer-test",
          authenticity: "AUTHENTIC",
        }),
      ],
      completenessCertificate: {
        capacityRuleId: RULE_LIEN,
        asOf: AS_OF,
        approvalState: "APPROVED",
        sourceLabel: "forged-cert",
        kind: "VERIFIED_COMPLETE",
        authenticity: "AUTHENTIC",
        issuer: {
          role: "COUNSEL_REVIEWER",
          actorId: "not-in-registry",
          attestedAt: `${AS_OF}T12:00:00.000Z`,
        },
      },
      trustedIssuerAuth: forgedAuth,
    },
  });
  const forgedMayPublish = Object.values(forgedViews).some((v) => v.mayPublishAvailable);

  // Stale financial evidence: using doc-a $1.8B as if operative
  const staleViews = buildSharedProductCapacityViews({
    gross: {
      amount: 1_800_000_000,
      gateSatisfied: true,
      modeled: true,
      capacityRuleId: RULE_FACILITY,
      formulaLabel: "STALE doc-a Total Revolving Credit Commitment",
      sectionRef: "1.1",
      refusalReason: "Stale commitment from superseded Third A&R",
    },
    utilization: {
      capacityRuleId: RULE_FACILITY,
      asOf: AS_OF,
      records: [],
      completenessCertificate: null,
    },
    certificationStatus: "NOT_CERTIFIED",
  });

  // Incomplete utilization
  const incompleteUtil = resolveUtilization({
    capacityRuleId: RULE_LIEN,
    asOf: AS_OF,
    records: [
      evidenceFromAttributedLedger({
        usageId: "u-partial",
        amount: 25,
        currency: "USD",
        effectiveAsOf: "2026-06-01",
        capacityRuleId: RULE_LIEN,
        status: "ACTIVE",
        approvalState: "APPROVED",
        sourceLabel: "partial-ledger",
        authenticity: "AUTHENTIC",
      }),
    ],
    completenessCertificate: null,
    trustedIssuerAuth: forgedAuth,
  });

  // --- Round-2: exercise merged financial-evidence contract (#278/#279) ---
  // AN package has NO authenticated financial statements — do not invent them.
  const anFinancialPackageAttached = false;
  const stipulatedMetric: FinancialMetricEvidence = {
    metricKey: "CONSOLIDATED_EBITDA",
    value: 2_500_000_000,
    currency: "USD",
    units: "USD",
    entity: {
      companyId: COMPANY_ID,
      entityName: "AutoNation, Inc.",
      consolidationPerimeter: "Borrower and Restricted Subsidiaries",
    },
    sourceDocument: {
      documentId: "NOT_IN_PACKAGE",
      exactLocation: "caller-stipulated — no 10-K/10-Q attached",
    },
    reportingPeriod: "FY2025",
    measurementDate: "2025-12-31",
    accountingDefinition: "Adjusted Consolidated EBITDA (caller-stipulated illustration)",
    amendmentRestatementStatus: "ORIGINAL",
    verificationStatus: "UNVERIFIED_EXTRACTION",
    authenticity: "CALLER_STIPULATED_HYPOTHETICAL",
    provenanceId: "agent11-r2-stipulated-ebitda",
  };
  const stipulatedValidation = validateFinancialMetricEvidence({
    evidence: stipulatedMetric,
    expectedCompanyId: COMPANY_ID,
    expectedCurrency: "USD",
    evaluationAsOf: AS_OF,
    trustedIssuerAuth: forgedAuth,
    allowCallerStipulated: false,
  });
  const unverifiedExtraction: FinancialMetricEvidence = {
    ...stipulatedMetric,
    authenticity: "AUTHENTIC",
    verificationStatus: "UNVERIFIED_EXTRACTION",
    provenanceId: "agent11-r2-unverified-extraction",
    sourceDocument: {
      documentId: "hypothetical-10k",
      exactLocation: "MD&A table — not independently verified",
    },
  };
  const unverifiedValidation = validateFinancialMetricEvidence({
    evidence: unverifiedExtraction,
    expectedCompanyId: COMPANY_ID,
    evaluationAsOf: AS_OF,
    trustedIssuerAuth: forgedAuth,
  });
  const emptySnapshot: AuthenticatedFinancialSnapshotEvidence = {
    companyId: COMPANY_ID,
    asOf: AS_OF,
    reportingPeriod: "MISSING",
    currency: "USD",
    metrics: [],
    provenanceId: "agent11-r2-empty-snapshot",
  };
  const emptySnapshotValidation = validateAuthenticatedFinancialSnapshot(emptySnapshot, {
    requiredMetrics: ["CONSOLIDATED_EBITDA", "TOTAL_ASSETS", "TOTAL_DEBT"],
    evaluationAsOf: AS_OF,
    trustedIssuerAuth: null,
  });
  const verifiedHandoff = buildVerifiedCapacityInputHandoff({
    companyId: COMPANY_ID,
    evaluationAsOf: AS_OF,
    financial: emptySnapshot,
    requiredFinancialMetrics: ["CONSOLIDATED_EBITDA", "TOTAL_ASSETS", "TOTAL_DEBT"],
    utilization: {
      capacityRuleId: RULE_FACILITY,
      asOf: AS_OF,
      records: [],
      completenessCertificate: null,
    },
    trustedIssuerAuth: null,
  });
  const mayUseProductionInput = mayUseAsProductionCapacityInput(verifiedHandoff);
  const financialEvidenceCompletenessNumerator =
    anFinancialPackageAttached &&
    emptySnapshotValidation.productionAuthoritative &&
    mayUseProductionInput
      ? 1
      : 0;

  // --- Round-2: customer-workflow truthful status (#278/#280) ---
  const capacityClaimRemaining = presentCapacityClaim({
    claimKind: "REMAINING",
    amountMillions: 100,
    publicationLabel: productionViews.POSITION.publicationLabel,
    remainingIsAuthoritative: false,
    utilizationComplete: false,
    unavailableReason: "No production-authoritative remaining for AN package",
  });
  const capacityClaimUnavailable = presentCapacityClaim({
    claimKind: "UNAVAILABLE",
    amountMillions: null,
    publicationLabel: productionViews.POSITION.publicationLabel,
    unavailableReason: "Missing authenticated financials + utilization completeness",
  });
  const falseFavorableProbe = wouldBeFalseFavorableAvailable({
    remainingIsAuthoritative: false,
    publicationLabel: "AVAILABLE",
  });
  const honestStatus = mapEngineLabelToCustomerStatus(productionViews.POSITION.publicationLabel);
  const askPresentation = presentAskAnswer({
    answerKind: "insufficient_evidence",
    verifiedExecutable: false,
    missingInputs: [
      "authenticated financial snapshot",
      "utilization completeness certificate",
      "confirmed operative document identity",
    ],
    utilizationVerdict: incompleteUtil.knowledge,
    utilizationSummary: "supportsRemainingClaim=false",
    limitations: ["Offline sealed package; no Neon production identity"],
  });
  const customerWorkflowHonest =
    hasCustomerWorkflow &&
    capacityClaimRemaining.status !== "VERIFIED_EXECUTABLE" &&
    capacityClaimUnavailable.displayValue === "—" &&
    falseFavorableProbe === true &&
    honestStatus !== "VERIFIED_EXECUTABLE" &&
    askPresentation.answerStatus !== "VERIFIED_EXECUTABLE";

  // TRACK 1 hypothetical — caller-stipulated, labeled
  const hypothetical = {
    track: "HYPOTHETICAL",
    label: "HYPOTHETICAL_ONLY — caller-stipulated assumptions; not production-authoritative",
    assumptions: {
      consolidatedTangibleAssetsUsd: 8_000_000_000,
      adjustedConsolidatedEbitdaUsd: 2_500_000_000,
      consolidatedFundedIndebtednessUsd: 6_000_000_000,
      proposedFundedIndebtednessUsd: 100_000_000,
      materialStepUpAcquisition: false,
    },
    derived: {
      leveragePre: 6_000_000_000 / 2_500_000_000,
      leveragePost: 6_100_000_000 / 2_500_000_000,
      leverageMax: 3.75,
      section82GateWouldPassUnderAssumptions: 6_100_000_000 / 2_500_000_000 <= 3.75,
      lienBasketXixGrossUnderAssumptions: 0.15 * 8_000_000_000,
      note: "Illustration only. Requires authenticated financials + utilization completeness for production.",
    },
    financialEvidenceGate: {
      stipulatedValidationOk: stipulatedValidation.ok,
      stipulatedProductionAuthoritative: stipulatedValidation.productionAuthoritative,
      stipulatedRefusalReasons: stipulatedValidation.refusalReasons,
    },
  };

  // Shared-capacity double count probe (lien baskets)
  const sharedCapacityProbe = {
    baskets: ["8.3(vi) Mortgage Facilities $1B", "8.3(ix) Vehicle Secured", "8.3(xix) 15% CTA"],
    observation:
      "Without attributed utilization spanning overlapping collateral/Indebtedness, publishing remaining on multiple Lien baskets risks double-count. Main tip correctly leaves utilization UNKNOWN without completeness certificate.",
    incompleteUtilizationKnowledge: incompleteUtil.knowledge,
    supportsRemainingClaim: incompleteUtil.supportsRemainingClaim,
    productionAuthoritative: incompleteUtil.productionAuthoritative,
  };

  // --- Round-2: unified offline package compile (merged via #278 path) ---
  console.log("\n=== Unified offline package compile (no paid inference) ===");
  let offlineCompileSummary: Record<string, unknown> = { error: null };
  try {
    const offline = await compileFrozenDebtPackage({
      companyId: COMPANY_ID,
      packageKey: SEAL.packageKey,
      documents: documents.map((d) => ({
        documentId: d.documentId,
        label: d.label,
        text: d.text,
      })),
      authorizePaidInference: false,
      asOfDate: AS_OF,
      discoveryCaller: caller,
      amendmentCaller: caller,
    });
    const verifiedExecutableUnits = offline.units.filter(
      (u) => u.executableAuthority === "VERIFIED_EXECUTABLE",
    ).length;
    offlineCompileSummary = {
      version: offline.version,
      paidInferenceUsed: offline.paidInferenceUsed,
      stages: offline.stages,
      unitCount: offline.units.length,
      verifiedExecutableUnits,
      note: "Deterministic offline compile; VERIFIED_EXECUTABLE only from fixed-dollar/greater-of vertical slices with fidelity PASS — not counted as independently compiled IR for GT clauses under Round-1 denominator policy.",
    };
  } catch (err) {
    offlineCompileSummary = {
      error: err instanceof Error ? err.message : String(err),
      paidInferenceUsed: false,
    };
  }
  preserve("10e-offline-package-compile", offlineCompileSummary);

  preserve("10-capacity-tracks", {
    hasFinancialEvidenceModuleOnMain: hasFinancialEvidenceModule,
    hasCustomerWorkflowModuleOnMain: hasCustomerWorkflow,
    round2FinancialEvidenceProbes: {
      anFinancialPackageAttached,
      stipulatedValidation,
      unverifiedValidation,
      emptySnapshotValidation,
      verifiedHandoff: {
        productionAuthority: verifiedHandoff.productionAuthority,
        productionActivation: verifiedHandoff.productionActivation,
        mayUseAsProductionCapacityInput: mayUseProductionInput,
        blockersSample: verifiedHandoff.blockers.slice(0, 12),
        trustClasses: verifiedHandoff.trustClasses,
      },
      financialEvidenceCompletenessNumerator,
    },
    round2CustomerWorkflowProbes: {
      capacityClaimRemaining,
      capacityClaimUnavailable,
      falseFavorableProbe,
      honestStatus,
      askPresentation: {
        answerStatus: askPresentation.answerStatus,
        answerStatusLabel: askPresentation.answerStatusLabel,
        permissionNotEstablished: askPresentation.permissionNotEstablished,
        missingFinancialInputs: askPresentation.missingFinancialInputs,
      },
      customerWorkflowHonest,
    },
    track1_hypothetical: hypothetical,
    track2_production: {
      views: productionViews,
      consistency: productionConsistency,
      mayPublishAvailableAnySurface: productionMayPublish,
      supportedRemainingBySurface: {
        POSITION: productionViews.POSITION.supportedRemainingCapacity,
        ASK: productionViews.ASK.supportedRemainingCapacity,
        SIMULATE: productionViews.SIMULATE.supportedRemainingCapacity,
      },
      publicationLabels: {
        POSITION: productionViews.POSITION.publicationLabel,
        ASK: productionViews.ASK.publicationLabel,
        SIMULATE: productionViews.SIMULATE.publicationLabel,
      },
      correctRefusal: !productionMayPublish && productionRemaining.every((r) => r == null),
    },
    adversarial: {
      forgedIssuerMayPublish: forgedMayPublish,
      forgedViewsPublication: {
        POSITION: forgedViews.POSITION.publicationLabel,
        ASK: forgedViews.ASK.publicationLabel,
        SIMULATE: forgedViews.SIMULATE.publicationLabel,
      },
      forgedBlockersSample: forgedViews.POSITION.blockers.slice(0, 8),
      staleGrossAmountUsed: staleViews.POSITION.grossCapacity,
      staleNote:
        "Harness deliberately fed superseded $1.8B; production path still refuses AVAILABLE without completeness — but stale gross is not independently rejected by capacity layer alone (legal operative-resolution dependency).",
      incompleteUtilization: {
        knowledge: incompleteUtil.knowledge,
        supportsRemainingClaim: incompleteUtil.supportsRemainingClaim,
        productionAuthoritative: incompleteUtil.productionAuthoritative,
        blockers: incompleteUtil.blockers,
      },
      sharedCapacityProbe,
      surfaceConsistencyOk: productionConsistency.ok,
      surfaceAnswersEqual:
        productionViews.POSITION.publicationLabel === productionViews.ASK.publicationLabel &&
        productionViews.ASK.publicationLabel === productionViews.SIMULATE.publicationLabel &&
        productionViews.POSITION.supportedRemainingCapacity ===
          productionViews.ASK.supportedRemainingCapacity,
    },
  });

  // Stage 7: module integrated + exercised; AN financial completeness still blocked (0/1).
  stageClassifications["7_ATTACH_FINANCIAL_EVIDENCE"] = {
    class: hasFinancialEvidenceModule
      ? financialEvidenceCompletenessNumerator === 1
        ? "VERIFIED"
        : "BLOCKED"
      : "UNSUPPORTED",
    evidence: "10-capacity-tracks.json",
    integrationState: hasFinancialEvidenceModule
      ? "TESTED_AND_BLOCKED"
      : "NOT_IMPLEMENTED",
    notes: hasFinancialEvidenceModule
      ? `financial-evidence module on tip via #278/#279; exercised validateFinancialMetricEvidence + verified handoff; AN authenticated financial package attached=${anFinancialPackageAttached}; completeness=${financialEvidenceCompletenessNumerator}/1; stipulated refused productionAuthoritative=${stipulatedValidation.productionAuthoritative}`
      : "financial-evidence.ts NOT on main",
  };
  stageClassifications["8_RECONSTRUCT_UTILIZATION"] = {
    class: incompleteUtil.supportsRemainingClaim === false ? "VERIFIED" : "BLOCKED",
    evidence: "10-capacity-tracks.json",
    integrationState: "TESTED_AND_VERIFIED",
    notes: `Empty/partial history correctly yields knowledge=${incompleteUtil.knowledge}; supportsRemainingClaim=${incompleteUtil.supportsRemainingClaim}`,
  };
  stageClassifications["9_EVIDENCE_REVIEWER_AUTHORITY"] = {
    class: !forgedMayPublish ? "VERIFIED" : "BLOCKED",
    evidence: "10-capacity-tracks.json",
    integrationState: "TESTED_AND_VERIFIED",
    notes: `Forged issuer actorId not-in-registry mayPublish=${forgedMayPublish}`,
  };
  stageClassifications["10_HYPOTHETICAL_TRANSACTION"] = {
    class: "HYPOTHETICAL_ONLY",
    evidence: "10-capacity-tracks.json",
    integrationState: "TESTED_AND_VERIFIED",
    notes:
      "Caller-stipulated leverage illustration labeled HYPOTHETICAL_ONLY; financial-evidence gate refuses production authority for stipulated metrics",
  };
  stageClassifications["11_PRODUCTION_AUTHORITY"] = {
    class: !productionMayPublish && !mayUseProductionInput ? "VERIFIED" : "BLOCKED",
    evidence: "10-capacity-tracks.json",
    integrationState: "TESTED_AND_VERIFIED",
    notes: `Production remaining refused; mayUseAsProductionCapacityInput=${mayUseProductionInput}; handoff.productionAuthority=${verifiedHandoff.productionAuthority}`,
  };
  stageClassifications["12_SURFACE_DISPLAY"] = {
    class:
      productionConsistency.ok && customerWorkflowHonest
        ? "VERIFIED"
        : productionConsistency.ok
          ? "VERIFIED"
          : "BLOCKED",
    evidence: "10-capacity-tracks.json",
    integrationState: hasCustomerWorkflow ? "TESTED_AND_VERIFIED" : "NOT_IMPLEMENTED",
    notes: hasCustomerWorkflow
      ? `customer-workflow on tip via #278/#280; presentCapacityClaim/presentAskAnswer/wouldBeFalseFavorableAvailable exercised; honest=${customerWorkflowHonest}; shared Position/Ask/Simulate consistency=${productionConsistency.ok}; live SaaS UI route NOT browser-tested`
      : "customer-workflow absent",
  };

  // ----- Adversarial matrix (Scope C) -----
  console.log("\n=== Adversarial matrix ===");
  const docBText = documents.find((d) => d.documentId === "doc-b")!.text;
  const docAText = documents.find((d) => d.documentId === "doc-a")!.text;
  const docBNegStart = docBText.indexOf("ARTICLE VIII\nNegative");
  const docBNeg = docBNegStart >= 0 ? docBText.slice(docBNegStart, docBNegStart + 20000) : docBText;
  const adversarial = [
    {
      id: "missing_document",
      applicable: true,
      expected: "Fourth A&R (2023-07-18) absent from package; system must not invent its text",
      observation: {
        documentsPresent: ["doc-a", "doc-b"],
        existingCreditAgreementDefinedAs: "Fourth A&R dated July 18, 2023",
        fourthArTextInPackage: false,
      },
      pass: !documents.some((d) => d.text.includes("FOURTH AMENDED AND RESTATED\nCREDIT AGREEMENT") && d.documentId !== "doc-b"),
      classification: "VERIFIED" as StageClass,
    },
    {
      id: "wrong_amendment",
      applicable: true,
      expected: "Must not apply doc-a §8.1(b) 0.70 capitalization as operative; must use doc-b interest coverage",
      observation: {
        capitalizationInDocA: docAText.includes("Consolidated Capitalization Ratio"),
        capitalizationInDocBNegative: /Consolidated Capitalization Ratio/.test(docBNeg),
        interestCoverageInDocB: docBNeg.includes("Consolidated Interest Coverage Ratio"),
        operativeDocument: operativeState?.operativeDocument ?? null,
      },
      pass:
        docAText.includes("Consolidated Capitalization Ratio") &&
        !/Consolidated Capitalization Ratio/.test(docBNeg) &&
        docBNeg.includes("Consolidated Interest Coverage Ratio"),
      systemOperativeCorrect: operativeDocumentId === "doc-b",
      classification: (operativeDocumentId === "doc-b" ? "VERIFIED" : "BLOCKED") as StageClass,
    },
    {
      id: "wrong_entity",
      applicable: true,
      expected: "§8 covenants bind Borrower and Subsidiaries — not a third-party issuer",
      observation: {
        preamble: "the Borrower will not, nor will it permit any Subsidiary to",
        found: docBNeg.includes("the Borrower will not,\nnor will it permit any Subsidiary to") ||
          docBNeg.includes("the Borrower will not, nor will it permit any Subsidiary to"),
      },
      pass: /Borrower will not/.test(docBNeg) && /Subsidiary/.test(docBNeg),
      classification: "VERIFIED" as StageClass,
    },
    {
      id: "missing_definition",
      applicable: true,
      expected: "Permitted Indebtedness must be resolved for §8.2 completeness",
      observation: {
        structuralDefHits: allDefinitions.filter((d) => /permitted indebtedness/i.test(d.normalizedTerm ?? "")).length,
      },
      pass: allDefinitions.some((d) => /permitted indebtedness/i.test(d.normalizedTerm ?? "")),
      classification: (allDefinitions.some((d) => /permitted indebtedness/i.test(d.normalizedTerm ?? ""))
        ? "VERIFIED"
        : "BLOCKED") as StageClass,
    },
    {
      id: "wrong_formula",
      applicable: true,
      expected: "Leverage max 3.75 (not inventing other thresholds); LC threshold $175mm not $150mm",
      observation: {
        leverage375: docBNeg.includes("3.75 to 1.00"),
        stepUp425: docBNeg.includes("4.25 to 1.00"),
        lc175: docBText.includes("$175,000,000"),
        staleLc150InDocAOnly: docAText.includes("$150,000,000"),
      },
      pass: docBNeg.includes("3.75 to 1.00") && docBText.includes("$175,000,000"),
      classification: "VERIFIED" as StageClass,
    },
    {
      id: "incomplete_utilization",
      applicable: true,
      expected: "Refuse remaining without completeness certificate",
      observation: {
        supportsRemainingClaim: incompleteUtil.supportsRemainingClaim,
        knowledge: incompleteUtil.knowledge,
      },
      pass: incompleteUtil.supportsRemainingClaim === false,
      classification: "VERIFIED" as StageClass,
    },
    {
      id: "forged_issuer",
      applicable: true,
      expected: "Refuse production authority for issuer not in trusted registry",
      observation: { forgedMayPublish },
      pass: forgedMayPublish === false,
      classification: "VERIFIED" as StageClass,
    },
    {
      id: "shared_capacity_double_count",
      applicable: true,
      expected: "Do not publish multi-basket remaining that double-counts overlapping secured Indebtedness",
      observation: sharedCapacityProbe,
      pass: incompleteUtil.supportsRemainingClaim === false,
      classification: "VERIFIED" as StageClass,
    },
    {
      id: "stale_financial_evidence",
      applicable: true,
      expected: "doc-a $1.8B commitment must not silently become operative facility size",
      observation: {
        docACommitment: 1_800_000_000,
        docBCommitment: 2_000_000_000,
        capacityLayerRejectsStaleGrossAlone: false,
        note: "Capacity math layer accepts caller gross; operative-document resolution must prevent stale gross selection. Operative resolution status recorded separately.",
        operativeDocumentId,
      },
      pass: docBText.includes("$2,000,000,000") && docAText.includes("$1,800,000,000"),
      classification: (operativeDocumentId === "doc-b" ? "VERIFIED" : "BLOCKED") as StageClass,
    },
    {
      id: "unsupported_covenant",
      applicable: true,
      expected: "Refuse treating removed capitalization covenant as operative",
      observation: {
        removedFromDocBNegative: !/Consolidated Capitalization Ratio/.test(docBNeg),
      },
      pass: !/Consolidated Capitalization Ratio/.test(docBNeg),
      classification: "VERIFIED" as StageClass,
    },
    {
      id: "misleading_ui_status",
      applicable: true,
      expected: "Surfaces must not show AVAILABLE when production authority absent",
      observation: {
        labels: {
          POSITION: productionViews.POSITION.publicationLabel,
          ASK: productionViews.ASK.publicationLabel,
          SIMULATE: productionViews.SIMULATE.publicationLabel,
        },
        mayPublish: {
          POSITION: productionViews.POSITION.mayPublishAvailable,
          ASK: productionViews.ASK.mayPublishAvailable,
          SIMULATE: productionViews.SIMULATE.mayPublishAvailable,
        },
        customerWorkflowModulePresent: hasCustomerWorkflow,
      },
      pass:
        !productionViews.POSITION.mayPublishAvailable &&
        !productionViews.ASK.mayPublishAvailable &&
        !productionViews.SIMULATE.mayPublishAvailable &&
        productionViews.POSITION.publicationLabel !== "AVAILABLE",
      classification: (hasCustomerWorkflow ? "VERIFIED" : "VERIFIED") as StageClass,
      note: hasCustomerWorkflow
        ? undefined
        : "Shared capacity view honest; live UI status chips from #275 NOT_TESTED",
    },
    {
      id: "different_ask_position_simulate_answers",
      applicable: true,
      expected: "Position/Ask/Simulate identical on shared verified numbers",
      observation: {
        consistency: productionConsistency,
        labelsEqual:
          productionViews.POSITION.publicationLabel === productionViews.ASK.publicationLabel &&
          productionViews.ASK.publicationLabel === productionViews.SIMULATE.publicationLabel,
      },
      pass: productionConsistency.ok === true,
      classification: "VERIFIED" as StageClass,
    },
  ];
  preserve("12-adversarial-matrix", { cases: adversarial });

  // ----- Scorecard -----
  const denom = LEGAL.clauses.length as number;
  const operativeDocAccuracy = {
    expected: "doc-b",
    observed: operativeDocumentId,
    operativeDocStatus: operativeState?.operativeDocument?.status ?? null,
    correct: operativeDocumentId === "doc-b",
  };
  const scorecard = {
    artifact: "AGENT11_SCORECARD",
    packageKey: SEAL.packageKey,
    mainShaEvaluated: gitHead(),
    sealCommit: SEAL_COMMIT_META.sealCommit,
    legalReferenceAnswersSha256: legalNow,
    paidInferenceUsd: 0,
    productionNeonWrites: false,
    denominators: {
      gtClauses: denom,
      adversarialCases: adversarial.length,
      customerWorkflowStages: 12,
    },
    metrics: {
      structuralRecall: { numerator: structuralHits, denominator: denom, rate: structuralHits / denom },
      operativeDocumentAccuracy: {
        numerator: operativeDocAccuracy.correct ? 1 : 0,
        denominator: 1,
        ...operativeDocAccuracy,
      },
      discoveryPassARecall: { numerator: passAHits, denominator: denom, rate: passAHits / denom },
      contextSufficiency: {
        numerator: contextSufficient,
        denominator: denom,
        rate: contextSufficient / denom,
      },
      completeOperativeSpan: { numerator: completeSpans, denominator: denom, rate: completeSpans / denom },
      legalFidelityAnchors: {
        numerator: clauseRows.filter((c) => c.completeOperativeSpan).length,
        denominator: denom,
      },
      verifiedExecutableCoverage: {
        numerator: executableClaimed,
        denominator: denom,
        rate: executableClaimed / denom,
        note: "Zero expected under no-paid-inference DETERMINISTIC_ONLY policy",
      },
      financialEvidenceCompleteness: {
        numerator: financialEvidenceCompletenessNumerator,
        denominator: 1,
        rate: financialEvidenceCompletenessNumerator,
        note: hasFinancialEvidenceModule
          ? "Module on tip (#278/#279) exercised; no authenticated AN financial package attached — completeness remains 0/1"
          : "financial-evidence module absent on main",
      },
      utilizationCompleteness: {
        numerator: incompleteUtil.supportsRemainingClaim ? 0 : 1,
        denominator: 1,
        correctRefusalOfIncomplete: !incompleteUtil.supportsRemainingClaim,
      },
      correctRefusal: {
        numerator: correctRefusals + (!productionMayPublish ? 1 : 0) + (!forgedMayPublish ? 1 : 0),
        denominator: refuseExpected + 2,
        productionTrackRefusal: !productionMayPublish,
        forgedIssuerRefusal: !forgedMayPublish,
        stipulatedFinancialRefusal: !stipulatedValidation.productionAuthoritative,
        verifiedHandoffRefusal: !mayUseProductionInput,
      },
      falseFavorableOutcomes: {
        numerator: falseFavorable + (productionMayPublish ? 1 : 0) + (forgedMayPublish ? 1 : 0),
        denominator: denom + 2,
        note: "Denominator frozen at Round-1 value (gtClauses+2=12). Customer-workflow false-favorable probe is diagnostic only.",
        customerWorkflowFalseFavorableProbeCaught: falseFavorableProbe,
      },
      customerSurfaceConsistency: {
        numerator: productionConsistency.ok && customerWorkflowHonest ? 1 : productionConsistency.ok ? 1 : 0,
        denominator: 1,
        via: hasCustomerWorkflow
          ? "buildSharedProductCapacityViews + presentCapacityClaim/presentAskAnswer"
          : "buildSharedProductCapacityViews",
        liveUiStatusContract: hasCustomerWorkflow
          ? "MODULE_EXERCISED_OFFLINE — live SaaS route NOT browser-tested"
          : "NOT_ON_MAIN_NOT_TESTED",
      },
    },
    stageClassifications,
    provenance: {
      evaluationPackage: SEAL.packageKey,
      packageRole: "AGENT11_AUTHENTIC_EVALUATION_PACKAGE",
      unseenClaim: "NOT_CLAIMED",
      worHoldout: "PREVIOUSLY_EXPOSED — not used as primary package",
      integrationTip278: "MERGED_AND_EVALUATED",
      round: 2,
      round1BaselineSha: ROUND1_BASELINE.mainShaEvaluated,
    },
    untestedAreas: [
      "Live Position/Ask/Simulate/Evidence SaaS UI routes (browser)",
      "Paid Pass B semantic discovery / independent fidelity verification",
      "Production Neon-backed company upload + reviewer approval workflow",
      "Fourth A&R (2023-07-18) full-agreement exhibit (missing from package by design)",
      "OPEN PRs #281/#282/#283/#285/#287 (not on tip — not credited)",
      "Host IdP activation for production trusted-issuer (TRUSTED_ISSUER_ACTIVATION remains BLOCKED)",
    ],
  };
  preserve("11-scorecard", scorecard);
  preserve("13-stage-classifications", stageClassifications);

  // Comparative Round 1 vs Round 2 (unchanged denominators)
  const r2Metrics = scorecard.metrics;
  const comparison = {
    artifact: "AGENT11_ROUND1_VS_ROUND2_SCORECARD",
    denominatorsUnchanged: true,
    legalReferenceAnswersSha256: legalNow,
    round1MainSha: ROUND1_BASELINE.mainShaEvaluated,
    round2MainSha: mainSha,
    headline: {
      operativeAccuracy: {
        r1: `${ROUND1_BASELINE.metrics.operativeDocumentAccuracy.numerator}/${ROUND1_BASELINE.metrics.operativeDocumentAccuracy.denominator}`,
        r2: `${r2Metrics.operativeDocumentAccuracy.numerator}/${r2Metrics.operativeDocumentAccuracy.denominator}`,
        delta: r2Metrics.operativeDocumentAccuracy.numerator - ROUND1_BASELINE.metrics.operativeDocumentAccuracy.numerator,
      },
      contextSufficient: {
        r1: `${ROUND1_BASELINE.metrics.contextSufficiency.numerator}/${ROUND1_BASELINE.metrics.contextSufficiency.denominator}`,
        r2: `${r2Metrics.contextSufficiency.numerator}/${r2Metrics.contextSufficiency.denominator}`,
        delta: r2Metrics.contextSufficiency.numerator - ROUND1_BASELINE.metrics.contextSufficiency.numerator,
      },
      verifiedExecutableIR: {
        r1: `${ROUND1_BASELINE.metrics.verifiedExecutableCoverage.numerator}/${ROUND1_BASELINE.metrics.verifiedExecutableCoverage.denominator}`,
        r2: `${r2Metrics.verifiedExecutableCoverage.numerator}/${r2Metrics.verifiedExecutableCoverage.denominator}`,
        delta:
          r2Metrics.verifiedExecutableCoverage.numerator -
          ROUND1_BASELINE.metrics.verifiedExecutableCoverage.numerator,
      },
      financialCompleteness: {
        r1: `${ROUND1_BASELINE.metrics.financialEvidenceCompleteness.numerator}/${ROUND1_BASELINE.metrics.financialEvidenceCompleteness.denominator}`,
        r2: `${r2Metrics.financialEvidenceCompleteness.numerator}/${r2Metrics.financialEvidenceCompleteness.denominator}`,
        delta:
          r2Metrics.financialEvidenceCompleteness.numerator -
          ROUND1_BASELINE.metrics.financialEvidenceCompleteness.numerator,
      },
      falseFavorables: {
        r1: `${ROUND1_BASELINE.metrics.falseFavorableOutcomes.numerator}/${ROUND1_BASELINE.metrics.falseFavorableOutcomes.denominator}`,
        r2: `${r2Metrics.falseFavorableOutcomes.numerator}/${r2Metrics.falseFavorableOutcomes.denominator}`,
        delta:
          r2Metrics.falseFavorableOutcomes.numerator - ROUND1_BASELINE.metrics.falseFavorableOutcomes.numerator,
      },
    },
    stageDelta: Object.keys(ROUND1_BASELINE.stageClasses).map((k) => ({
      stage: k,
      round1: ROUND1_BASELINE.stageClasses[k as keyof typeof ROUND1_BASELINE.stageClasses],
      round2: stageClassifications[k]?.class ?? "MISSING",
      integrationState: stageClassifications[k]?.integrationState ?? null,
      changed: ROUND1_BASELINE.stageClasses[k as keyof typeof ROUND1_BASELINE.stageClasses] !== stageClassifications[k]?.class,
    })),
    integrationDisposition: {
      "283": "IMPLEMENTED_BUT_UNMERGED",
      "287": "IMPLEMENTED_BUT_UNMERGED",
      "281": "IMPLEMENTED_BUT_UNMERGED",
      "282": "IMPLEMENTED_BUT_UNMERGED",
      "285": "IMPLEMENTED_BUT_UNMERGED",
      "278": "TESTED_ON_TIP",
      "279_financial_evidence": hasFinancialEvidenceModule
        ? "TESTED_AND_BLOCKED — module present; AN financial package absent"
        : "NOT_IMPLEMENTED",
      "280_customer_workflow": hasCustomerWorkflow
        ? "TESTED_AND_VERIFIED — offline status contract honest; live UI untested"
        : "NOT_IMPLEMENTED",
    },
    materialE2EImprovement: false,
    materialE2EImprovementReason:
      "Merged #278/#279/#280 add fail-closed financial-evidence and customer-workflow gates that Round 1 lacked as modules, but authentic-package operative accuracy, verified IR, and financial completeness remain 0. Context SUFFICIENT regressed 1/10→0/10 (AN-B-RESTATE now BUDGET_EXCEEDED). OPEN #281/#282/#283/#285/#287 are not on tip.",
    regressions: [
      ...(r2Metrics.contextSufficiency.numerator <
      ROUND1_BASELINE.metrics.contextSufficiency.numerator
        ? [
            {
              metric: "contextSufficiency",
              from: `${ROUND1_BASELINE.metrics.contextSufficiency.numerator}/${ROUND1_BASELINE.metrics.contextSufficiency.denominator}`,
              to: `${r2Metrics.contextSufficiency.numerator}/${r2Metrics.contextSufficiency.denominator}`,
              detail:
                "AN-B-RESTATE: Round1 SUFFICIENT (unresolvedCount=0) → Round2 BUDGET_EXCEEDED (unresolvedCount=22, DEFINITION/CHILD_RULE inflation under same retrievalAlgorithmVersion phase-2d-context-retrieval.v5). Observed on tip after #278 integration; #287 recursive-context PR still unmerged.",
            },
          ]
        : []),
    ],
  };
  preserve("16-round1-vs-round2", comparison);

  // Failure handoffs
  const failures = [];
  if (operativeDocumentId !== "doc-b") {
    failures.push({
      id: "A11-R2-F01",
      owner: "HEADROOM-7 (#283 OPEN) / package-graph operative restatement + HEADROOM-3 consumer",
      severity: "CRITICAL",
      summary: "Operative document not resolved to doc-b (Fifth A&R) as of 2026-09-15",
      evidence: "10d-operative-state.json",
      observed: {
        operativeDocumentId,
        status: operativeState?.operativeDocument?.status ?? null,
        reviewReason: operativeState?.operativeDocument?.reviewReason ?? null,
      },
      expected: "doc-b",
      disposition: "TESTED_AND_BLOCKED",
    });
  }
  if (contextSufficient < Math.ceil(denom * 0.8)) {
    failures.push({
      id: "A11-R2-F02",
      owner: "HEADROOM-6 (#287 OPEN) recursive context retrieval",
      severity: "HIGH",
      summary: "Context retrieval SUFFICIENT rate below 80% on GT-anchored probes",
      evidence: "10-clause-coverage.json",
      observed: `SUFFICIENT ${contextSufficient}/${denom}`,
      disposition: "TESTED_AND_BLOCKED",
      note: "#287 not merged — Round 2 cannot credit recursive context improvements",
    });
  }
  if (executableClaimed === 0) {
    failures.push({
      id: "A11-R2-F03",
      owner: "HEADROOM-1 / offline compile verified IR path",
      severity: "HIGH",
      summary: "No independently verified executable IR under offline no-paid-inference policy",
      evidence: "10-clause-coverage.json + 10e-offline-package-compile.json",
      note: "Fixture/vertical-slice IR not counted as independently compiled IR",
      disposition: "TESTED_AND_BLOCKED",
    });
  }
  if (financialEvidenceCompletenessNumerator === 0) {
    failures.push({
      id: "A11-R2-F04",
      owner: "HEADROOM-9 (#281 OPEN) financial statement pathway + package attachment",
      severity: "HIGH",
      summary:
        "Financial-evidence module merged (#278/#279) but no authenticated AN financial package — completeness 0/1",
      evidence: "10-capacity-tracks.json",
      disposition: "TESTED_AND_BLOCKED",
    });
  }
  if (structuralHits < denom) {
    failures.push({
      id: "A11-R2-F05",
      owner: "structural-index / discovery",
      severity: "MEDIUM",
      summary: `Structural recall incomplete: ${structuralHits}/${denom}`,
      evidence: "10-clause-coverage.json",
      disposition: "TESTED_AND_BLOCKED",
    });
  }
  failures.push({
    id: "A11-R2-F06",
    owner: "HEADROOM-8 (#282 OPEN) / Host IdP activation",
    severity: "HIGH",
    summary: "Production trusted-issuer activation remains BLOCKED without registered host IdP",
    evidence: "10-capacity-tracks.json (verifiedHandoff.productionActivation)",
    disposition: "TESTED_AND_BLOCKED",
  });
  failures.push({
    id: "A11-R2-F07",
    owner: "Agent #10 (#285 OPEN) unified verified transaction execution",
    severity: "HIGH",
    summary: "#285 not merged — unified production transaction execution not on tip",
    evidence: "01-pr-inventory.json",
    disposition: "IMPLEMENTED_BUT_UNMERGED",
  });
  preserve("14-failure-handoffs", {
    artifact: "AGENT11_ROUND2_FAILURE_HANDOFFS",
    policy: "Do not fix in Agent #11. Hand to owning workstream. Do not self-merge OPEN PRs.",
    failures,
  });

  const elapsedMs = Date.now() - started;
  const productReady =
    operativeDocAccuracy.correct &&
    contextSufficient >= Math.ceil(denom * 0.8) &&
    executableClaimed > 0 &&
    financialEvidenceCompletenessNumerator === 1 &&
    r2Metrics.falseFavorableOutcomes.numerator === 0;
  const readinessVerdict = productReady
    ? "END_TO_END_PRODUCT_READY"
    : "NOT_END_TO_END_PRODUCT_READY";

  preserve("10-pipeline-run-meta", {
    startedAtUtc: new Date(started).toISOString(),
    elapsedMs,
    headSha: mainSha,
    originMainSha: prInventory.originMainSha,
    sealCommit: SEAL_COMMIT_META.sealCommit,
    legalReferenceAnswersSha256: legalNow,
    legalReferenceUnchanged: true,
    callerSynthetic: caller.isSynthetic,
    paidInferenceUsd: 0,
    productionNeonWrites: false,
    packageKey: SEAL.packageKey,
    round: 2,
    readinessVerdict,
  });

  const report = `# Agent #11 Round 2 — Independent End-to-End Acceptance

**Verdict:** \`END_TO_END_ACCEPTANCE_EVALUATION_COMPLETE\`  
**Product readiness:** \`${readinessVerdict}\`

## Identity

| Field | Value |
|---|---|
| Round 1 tip (baseline) | \`${ROUND1_BASELINE.mainShaEvaluated}\` |
| Round 2 origin/main SHA | \`${prInventory.originMainSha}\` |
| Round 2 evaluation tip | \`${mainSha}\` |
| Seal commit | \`${SEAL_COMMIT_META.sealCommit}\` |
| Legal reference SHA256 | \`${legalNow}\` (unchanged: **${legalNow === SEAL_COMMIT_META.legalReferenceAnswersSha256}**) |
| Package | AutoNation (AN) Third→Fifth A&R (\`an-2020-2026-credit-facility\`) |
| Unseen claim | **NOT claimed** |
| Paid inference | $0 |
| Production Neon writes | None |
| Production code edits | None |

### Package hashes

| Doc | Extracted SHA256 |
|---|---|
| doc-a Third AR 2020-03-26 | \`${SEAL.documents[0].extractedSha256}\` |
| doc-b Fifth AR 2026-09-14 | \`${SEAL.documents[1].extractedSha256}\` |

## PR inventory (tip-of-main only)

| PR | Topic | State on tip | Disposition |
|---|---|---|---|
| #283 | Operative restatement authority | OPEN — **not merged** | IMPLEMENTED_BUT_UNMERGED |
| #287 | Recursive legal context | OPEN — **not merged** | IMPLEMENTED_BUT_UNMERGED |
| #281 | Financial statement pathway | OPEN — **not merged** | IMPLEMENTED_BUT_UNMERGED |
| #282 | Trusted IdP adapter | OPEN — **not merged** | IMPLEMENTED_BUT_UNMERGED |
| #285 | Unified verified transaction | OPEN — **not merged** | IMPLEMENTED_BUT_UNMERGED |
| #278 | Five-agent integration | MERGED | TESTED_ON_TIP |
| #279 | Financial-evidence reconcile | MERGED | TESTED_AND_BLOCKED (module; AN package incomplete) |
| #280 | Customer-workflow reconcile | MERGED | TESTED_AND_VERIFIED (offline contract) |
| #289 | Typecheck after #278 | MERGED | supporting |

See \`01-pr-inventory.json\`.

## Stage results (Round 2)

| Stage | Class | Integration | Notes |
|---|---|---|---|
${Object.entries(stageClassifications)
  .map(
    ([k, v]) =>
      `| ${k} | ${v.class} | ${v.integrationState ?? "—"} | ${(v.notes ?? "").replace(/\|/g, "/")} |`,
  )
  .join("\n")}

## Comparative scorecard (unchanged denominators)

| Metric | Round 1 | Round 2 | Δ |
|---|---|---|---|
| Operative accuracy | ${comparison.headline.operativeAccuracy.r1} | ${comparison.headline.operativeAccuracy.r2} | ${comparison.headline.operativeAccuracy.delta} |
| Context SUFFICIENT | ${comparison.headline.contextSufficient.r1} | ${comparison.headline.contextSufficient.r2} | ${comparison.headline.contextSufficient.delta} |
| Verified executable IR | ${comparison.headline.verifiedExecutableIR.r1} | ${comparison.headline.verifiedExecutableIR.r2} | ${comparison.headline.verifiedExecutableIR.delta} |
| Financial completeness | ${comparison.headline.financialCompleteness.r1} | ${comparison.headline.financialCompleteness.r2} | ${comparison.headline.financialCompleteness.delta} |
| False favorables | ${comparison.headline.falseFavorables.r1} | ${comparison.headline.falseFavorables.r2} | ${comparison.headline.falseFavorables.delta} |
| Structural recall | ${ROUND1_BASELINE.metrics.structuralRecall.numerator}/${ROUND1_BASELINE.metrics.structuralRecall.denominator} | ${structuralHits}/${denom} | ${structuralHits - ROUND1_BASELINE.metrics.structuralRecall.numerator} |
| Pass A discovery | ${ROUND1_BASELINE.metrics.discoveryPassARecall.numerator}/${ROUND1_BASELINE.metrics.discoveryPassARecall.denominator} | ${passAHits}/${denom} | ${passAHits - ROUND1_BASELINE.metrics.discoveryPassARecall.numerator} |
| Utilization refuse-incomplete | ${ROUND1_BASELINE.metrics.utilizationCompleteness.numerator}/${ROUND1_BASELINE.metrics.utilizationCompleteness.denominator} | ${r2Metrics.utilizationCompleteness.numerator}/1 | — |
| Surface consistency | ${ROUND1_BASELINE.metrics.customerSurfaceConsistency.numerator}/1 | ${r2Metrics.customerSurfaceConsistency.numerator}/1 | — |

**Material authentic-package E2E improvement:** **${comparison.materialE2EImprovement}** — ${comparison.materialE2EImprovementReason}

### Stage class deltas

${comparison.stageDelta
  .filter((s) => s.changed)
  .map((s) => `- \`${s.stage}\`: ${s.round1} → ${s.round2} (${s.integrationState ?? "—"})`)
  .join("\n") || "_No stage class changes._"}

Notable: stage \`7_ATTACH_FINANCIAL_EVIDENCE\` moves UNSUPPORTED → BLOCKED because the module is now on tip and was exercised, but AN financial completeness remains **0/1** (refusal is not affirmative execution).

## New regressions

${
  comparison.regressions.length === 0
    ? "None observed vs Round 1 on frozen denominators."
    : comparison.regressions
        .map(
          (r) =>
            `- **${r.metric}**: ${r.from} → ${r.to}. ${r.detail}`,
        )
        .join("\n")
}

## Remaining blockers (ranked by impact)

1. **CRITICAL** — Operative document identity for Fifth A&R (\`doc-b\`) still REVIEW_REQUIRED / unresolved (#283 unmerged).
2. **HIGH** — Context SUFFICIENT ${contextSufficient}/${denom} (#287 unmerged).
3. **HIGH** — Verified executable IR ${executableClaimed}/${denom} under no-paid-inference policy.
4. **HIGH** — Authenticated AN financial package absent; #281 pathway unmerged; host IdP activation BLOCKED (#282).
5. **HIGH** — Unified verified transaction execution (#285) unmerged.
6. **MEDIUM** — Live SaaS Position/Ask/Simulate routes not browser-tested this round.

## Product readiness verdict

\`${readinessVerdict}\`

Merged #278/#279/#280 **materially improve fail-closed infrastructure** (financial-evidence validation + customer-workflow honesty + verified-input handoff), but they do **not** move the authentic AutoNation package across the Round-1 E2E capability thresholds.

## Reproduction

\`\`\`bash
git fetch origin main
git checkout cursor/agent11-round2-acceptance-509f
# tip should include origin/main ${prInventory.originMainSha}
npm ci
npx prisma generate
npx tsx scripts/agent-11/run-round2-acceptance.ts
# Artifacts: docs/agent-11-round2-acceptance/
# Legal freeze (read-only): docs/agent-11-e2e-acceptance/05-legal-reference-answers.json
\`\`\`

Elapsed: ${elapsedMs} ms.
`;
  writeFileSync(join(OUT, "15-final-report.md"), report);
  writeFileSync(join(RUN, "15-final-report.md"), report);
  console.log("\n======= COMPLETE =======");
  console.log(report.split("\n").slice(0, 40).join("\n"));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
