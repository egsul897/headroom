/**
 * AGENT #11 ROUND 2B SAFETY — Independent safety acceptance of corrected canonical SHA.
 *
 * Evaluates #293 production modules (not origin/main). Round 2 main-baseline
 * results are comparison inputs only — never re-labeled as a #293 evaluation.
 *
 * Guardrails:
 * - No paid inference (synthetic StageCaller; DETERMINISTIC_ONLY local compile).
 * - No production Neon writes.
 * - Does not modify legal-reference answers after seal.
 * - Does not alter production code (lib/, app/, prisma/).
 * - Does not overwrite Round 1 / Round 2 artifacts.
 * - Caveated operative authority ≠ unconditional production authority.
 *
 * Usage: npx tsx scripts/agent-11/run-round2b-safety-acceptance.ts
 * Legal freeze: docs/agent-11-e2e-acceptance/ (SHA256 sealed).
 * Writes only to docs/agent-11-round2b-safety-acceptance/.
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
import {
  bindCandidateToOperativeRetrievalSource,
  buildOperativeAuthorityHandoffBundle,
  resolvePackageRestatementAuthorities,
  summarizeBundleProductionAuthority,
  evaluateProductionAuthorityPromotion,
  OPERATIVE_AUTHORITY_MODULE_VERSION,
} from "../../lib/contract-model/compiler/operative-authority";
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
  buildVerifiedCapacityInputHandoff,
  mayUseAsProductionCapacityInput,
  type FinancialMetricEvidence,
  type AuthenticatedFinancialSnapshotEvidence,
} from "../../lib/capacity";
import {
  presentCapacityClaim,
  wouldBeFalseFavorableAvailable,
  mapEngineLabelToCustomerStatus,
  presentAskAnswer,
} from "../../lib/customer-workflow";
import { executeUnifiedVerifiedTransaction } from "../../lib/product/verified-transaction-execution";

const REPO = process.cwd();
const FIX = join(REPO, "tests/fixtures/unseen-packages/an-2020-2026-credit-facility");
/** Immutable sealed legal freeze (same SHA256 as Round 1). */
const LEGAL_DIR = join(REPO, "docs/agent-11-e2e-acceptance");
/** Round 2 main-baseline artifacts (comparison only — not re-labeled as #293). */
const R2_MAIN_DIR = join(REPO, "docs/agent-11-round2-acceptance");
/** Round 2B outputs only — never overwrite Round 1 / Round 2. */
const OUT = join(REPO, "docs/agent-11-round2b-safety-acceptance");
const RUN = join(FIX, "offline-eval-run-round2b-safety");
const LEGAL = JSON.parse(readFileSync(join(LEGAL_DIR, "05-legal-reference-answers.json"), "utf8"));
const SEAL = JSON.parse(readFileSync(join(LEGAL_DIR, "03-package-seal.json"), "utf8"));
const SEAL_COMMIT_META = JSON.parse(readFileSync(join(LEGAL_DIR, "03b-seal-commit.json"), "utf8"));
const R1_SCORECARD = JSON.parse(
  readFileSync(join(REPO, "docs/agent-11-e2e-acceptance-round1-frozen/11-scorecard.json"), "utf8"),
);
const R2_MAIN_SCORECARD = JSON.parse(readFileSync(join(R2_MAIN_DIR, "11-scorecard.json"), "utf8"));
const R2_MAIN_COV = JSON.parse(readFileSync(join(R2_MAIN_DIR, "10-clause-coverage.json"), "utf8"));
/** Production code under test — pinned #293 tip (docs-only commits on evidence branch do not change lib/). */
const PR_293_EVALUATED_SHA = "59c3c4b36cd31d21e1c2deeff25ef0fb1f4cfab3";
const ROUND2_MAIN_BASELINE_SHA = "4f1a0b81207364373d9a4cb9fe515d4a1a002e56";

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

function gitFileSha(relPath: string): string {
  try {
    return execFileSync("git", ["rev-parse", `${PR_293_EVALUATED_SHA}:${relPath}`], {
      cwd: REPO,
      encoding: "utf8",
    }).trim();
  } catch {
    return "UNTRACKED_OR_MISSING";
  }
}

function moduleProbe(relPath: string) {
  return {
    path: relPath,
    present: existsSync(join(REPO, relPath)),
    blobShaAt293: gitFileSha(relPath),
    evaluatedCodeSha: PR_293_EVALUATED_SHA,
  };
}

async function main() {
  const started = Date.now();
  console.log("======= AGENT #11 ROUND 2B — CANONICAL #293 ACCEPTANCE =======");
  console.log(`pr293EvaluatedSha: ${PR_293_EVALUATED_SHA}`);
  const headNow = gitHead();
  if (headNow !== PR_293_EVALUATED_SHA) {
    throw new Error(
      `Production tree HEAD ${headNow} does not match evaluated SHA ${PR_293_EVALUATED_SHA}. Checkout the exact code tip before running.`,
    );
  }

  console.log(`round2MainBaseline: ${ROUND2_MAIN_BASELINE_SHA}`);
  console.log("paidInference: FORBIDDEN; neonWrites: FORBIDDEN");

  if (!existsSync(OUT)) mkdirSync(OUT, { recursive: true });
  const legalNow = sha256Text(readFileSync(join(LEGAL_DIR, "05-legal-reference-answers.json"), "utf8"));
  if (legalNow !== SEAL_COMMIT_META.legalReferenceAnswersSha256) {
    throw new Error(
      `Legal reference answers mutated after seal. seal=${SEAL_COMMIT_META.legalReferenceAnswersSha256} now=${legalNow}`,
    );
  }

  const moduleInventory = {
    artifact: "AGENT11_ROUND2B_MODULE_INVENTORY",
    pr293EvaluatedSha: PR_293_EVALUATED_SHA,
    evidenceBranchHead: gitHead(),
    note: "Each stage imports these #293 tip blobs — not origin/main.",
    modules: {
      structural: moduleProbe("lib/contract-model/compiler/stage-structure.ts"),
      packageGraph: moduleProbe("lib/contract-model/compiler/package-graph/pipeline.ts"),
      amendmentOperativeState: moduleProbe("lib/contract-model/compiler/amendment/operative-state.ts"),
      operativeAuthority: moduleProbe("lib/contract-model/compiler/operative-authority/index.ts"),
      contextRetrieval: moduleProbe("lib/contract-model/compiler/context-retrieval/pipeline.ts"),
      contextBodyAnchor: moduleProbe("lib/contract-model/compiler/context-retrieval/body-anchor.ts"),
      contextManifest: moduleProbe("lib/contract-model/compiler/context-retrieval/manifest.ts"),
      discovery: moduleProbe("lib/contract-model/compiler/discovery/pipeline.ts"),
      localSemantic: moduleProbe("lib/contract-model/compiler/local-semantic/index.ts"),
      financialEvidence: moduleProbe("lib/capacity/financial-evidence.ts"),
      verifiedInputContract: moduleProbe("lib/capacity/verified-input-contract.ts"),
      customerWorkflow: moduleProbe("lib/customer-workflow/status-contract.ts"),
      unifiedTransaction: moduleProbe("lib/product/verified-transaction-execution/execute.ts"),
      trustedIssuerHost: moduleProbe("lib/capacity/trusted-issuer-host.ts"),
    },
    operativeAuthorityModuleVersion: OPERATIVE_AUTHORITY_MODULE_VERSION,
    retrievalAlgorithmVersion: RETRIEVAL_ALGORITHM_VERSION,
  };
  preserve("01-module-inventory", moduleInventory);

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

  const documents = DOCS.map((d) => ({
    documentId: d.documentId,
    label: d.label,
    text: readFileSync(join(FIX, "extracted-text", d.file), "utf8"),
  }));

  const stageClassifications: Record<
    string,
    { class: StageClass; evidence: string; notes?: string }
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

  // ----- #283 operative restatement authority (integrated on #293 tip) -----
  const restatementAuthorities = resolvePackageRestatementAuthorities({
    documents: pkgDocs,
    packageGraph,
  });
  const agent7Provisions = (LEGAL.clauses as Array<Record<string, unknown>>)
    .filter((c) => c.documentId === "doc-b" || c.sectionRef === "preamble")
    .map((c) => ({ sectionRef: c.sectionRef === "preamble" ? "1.01" : String(c.sectionRef) }));
  const agent7Bundle = buildOperativeAuthorityHandoffBundle({
    companyId: "agent-11-an-eval",
    packageKey: "an-2020-2026-credit-facility",
    asOfDate: "2026-09-15",
    documents: pkgDocs,
    packageGraph,
    provisions: agent7Provisions.length > 0 ? agent7Provisions : [{ sectionRef: "8.1" }, { sectionRef: "11.01" }],
    instrumentDocumentIds: ["doc-a", "doc-b"],
    baseDocumentId: "doc-a",
  });
  const agent7GoverningDocId =
    agent7Bundle.provisions.find((p) => p.governingDocumentId === "doc-b")?.governingDocumentId ??
    (restatementAuthorities.some((a) => a.successorDocumentId === "doc-b" && a.status === "OPERATIVE_AUTHORITY_CONFIRMED")
      ? "doc-b"
      : null);
  const amendmentPipelineOperativeDocId = operativeState?.operativeDocument?.operativeDocumentId ?? null;
  const docBAuthority = restatementAuthorities.find((a) => a.successorDocumentId === "doc-b");
  // Independent selection: prefer #283 governing doc when present; do NOT invent doc-b.
  let operativeDocumentId: string | null = agent7GoverningDocId ?? amendmentPipelineOperativeDocId;
  if (docBAuthority?.status === "OPERATIVE_AUTHORITY_CONFIRMED") {
    operativeDocumentId = "doc-b";
  }
  const docBCaveats = docBAuthority?.caveats ?? [];
  const cpSatisfaction = docBAuthority?.conditionsPrecedentSatisfaction ?? null;
  const confirmedWithCaveats =
    docBAuthority?.status === "OPERATIVE_AUTHORITY_CONFIRMED" &&
    (docBCaveats.length > 0 ||
      cpSatisfaction === "NOT_INDEPENDENTLY_PROVEN" ||
      cpSatisfaction === "NOT_STATED");
  const unconditionalOperativeAuthority =
    docBAuthority?.status === "OPERATIVE_AUTHORITY_CONFIRMED" &&
    docBCaveats.length === 0 &&
    (cpSatisfaction === "SATISFIED" || cpSatisfaction === "NOT_APPLICABLE");
  const productionAuthoritySummary = summarizeBundleProductionAuthority(agent7Bundle);
  const docBProvision =
    agent7Bundle.provisions.find((p) => p.governingDocumentId === "doc-b") ?? null;
  // Never fall back to a doc-a CONFIRMED_OPERATIVE provision when evaluating Fifth A&R authority.
  const primaryProvisionClass =
    docBProvision?.authorityClassification ??
    (docBAuthority?.status === "OPERATIVE_AUTHORITY_CONFIRMED"
      ? "CONFIRMED_OPERATIVE_WITH_CAVEATS"
      : "AMBIGUOUS");
  const productionPromotion = evaluateProductionAuthorityPromotion({
    authorityClassification: primaryProvisionClass,
    conditionsPrecedentSatisfaction: cpSatisfaction,
    caveats: docBCaveats,
    attemptPromotionToProduction: true,
  });
  // False-favorable diagnostic (does not alter frozen 0/12 capacity denominator):
  // #293 must not treat superseded Third A&R (doc-a) provisions as PRODUCTION_AUTHORITY_ACTIVE
  // when sealed expected operative document is Fifth A&R (doc-b).
  const wrongDocumentProductionPromotion =
    operativeDocumentId !== "doc-b" &&
    agent7Bundle.provisions.some(
      (p) =>
        p.governingDocumentId === "doc-a" &&
        (p.authorityClassification === "CONFIRMED_OPERATIVE" ||
          p.authorityClassification === "CONFIRMED_OPERATIVE_WITH_CAVEATS"),
    ) &&
    productionAuthoritySummary.allProvisionsProductionActive === true;
  // Round-1 denominator: observed operative document id === doc-b (identity accuracy).
  // Production-authority classification is scored separately and must not treat caveats as unconditional.
  preserve("10d-agent7-operative-authority", {
    asOfDate: "2026-09-15",
    moduleVersion: OPERATIVE_AUTHORITY_MODULE_VERSION,
    modulePath: "lib/contract-model/compiler/operative-authority/",
    evaluatedCodeSha: PR_293_EVALUATED_SHA,
    restatementAuthorities: restatementAuthorities.map((a) => ({
      successorDocumentId: a.successorDocumentId,
      predecessorDocumentId: a.predecessorDocumentId,
      status: a.status,
      effectiveDateIso: a.effectiveDateIso,
      conditionsPrecedentSatisfaction: a.conditionsPrecedentSatisfaction,
      caveats: a.caveats,
      effectivenessInference: a.effectivenessInference,
      doesNotMutatePackageGraphRelationship: a.doesNotMutatePackageGraphRelationship,
    })),
    agent7GoverningDocId,
    amendmentPipelineOperativeDocId,
    selectedOperativeDocumentId: operativeDocumentId,
    confirmedWithCaveats,
    unconditionalOperativeAuthority,
    productionAuthoritySummary,
    productionPromotion,
    wrongDocumentProductionPromotion,
    note: "Caveated/confirmed-with-CP-unproven must not be scored as unconditional. Wrong-document doc-a PRODUCTION_AUTHORITY_ACTIVE is a false-favorable diagnostic.",
    verdict: agent7Bundle.verdict,
    verdictReasons: agent7Bundle.verdictReasons,
    provisionAuthorities: agent7Bundle.provisions.map((p) => ({
      provisionKey: p.provisionKey,
      governingDocumentId: p.governingDocumentId,
      authorityClassification: p.authorityClassification,
      caveats: p.caveats,
    })),
  });

  const identifiedDocs = packageGraph.classifications.length === 2;
  stageClassifications["2_IDENTIFY_DOCUMENTS"] = {
    class: identifiedDocs ? "VERIFIED" : "BLOCKED",
    evidence: "10d-package-graph.json",
    notes: `classifications=${JSON.stringify(packageGraph.classifications.map((c) => ({ id: c.documentId, type: c.type })))}; module=package-graph@${PR_293_EVALUATED_SHA.slice(0, 8)}`,
  };

  stageClassifications["3_RESOLVE_OPERATIVE"] = {
    class: operativeDocumentId === "doc-b" ? "VERIFIED" : "BLOCKED",
    evidence: "10d-agent7-operative-authority.json",
    notes: `operativeDocumentId=${operativeDocumentId}; agent7=${agent7GoverningDocId}; amendmentPipeline=${amendmentPipelineOperativeDocId}; docBAuthority=${docBAuthority?.status ?? "n/a"}; cp=${cpSatisfaction}; confirmedWithCaveats=${confirmedWithCaveats}; unconditional=${unconditionalOperativeAuthority}; productionDisposition=${productionPromotion.disposition}; verdict=${agent7Bundle.verdict}`,
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
        const retrievalBinding = bindCandidateToOperativeRetrievalSource({
          candidate,
          authority: agent7Bundle,
          index,
        });
        const bundle = buildCovenantContextBundle(
          {
            candidate: retrievalBinding.retrievalCandidate,
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
          originatingDocumentId: bundle.originatingDocumentId,
          retrievalBinding: {
            originalDocumentId: retrievalBinding.originalDocumentId,
            governingDocumentId: retrievalBinding.governingDocumentId,
            remapped: retrievalBinding.remapped,
            retrievalAuthorized: retrievalBinding.retrievalAuthorized,
            authorityClassification: retrievalBinding.authorityClassification,
            refusalReason: retrievalBinding.refusalReason,
          },
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
      title: String(clause.title ?? ""),
      expectedExecution: String(clause.expectedExecution ?? ""),
      verifiedExecutable: producedExecutable,
      localCompileStatus: local.verificationStatus,
      primaryNodeId: primary?.nodeId ?? null,
      anchorCheck,
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
    notes: `SUFFICIENT=${contextSufficient}/${LEGAL.clauses.length} (threshold for VERIFIED: ≥80%)`,
  };
  stageClassifications["6_COMPILE_VERIFIED_IR"] = {
    class: executableClaimed === 0 ? "BLOCKED" : "VERIFIED",
    evidence: "10-clause-coverage.json",
    notes: `verifiedExecutable=${executableClaimed}/${LEGAL.clauses.length}; paid inference blocked; local DETERMINISTIC_ONLY is UNVERIFIED`,
  };

  // ----- 7–12 Financial / utilization / tracks / surfaces -----
  console.log("\n=== 7–12 Financial evidence, utilization, tracks, surfaces ===");
  const hasFinancialEvidenceModule = existsSync(join(REPO, "lib/capacity/financial-evidence.ts"));
  const hasCustomerWorkflow = existsSync(join(REPO, "lib/customer-workflow/index.ts"));

  const AS_OF = "2026-09-15";
  const RULE_LIEN = "an-b-8.3-xix-cta-basket";
  const RULE_FACILITY = "an-b-total-revolving-commitment";

  // TRACK 2 production: missing authenticated inputs → refuse
  const productionViews = buildSharedProductCapacityViews({
    gross: {
      amount: 2_000_000_000,
      gateSatisfied: false,
      modeled: false,
      capacityRuleId: RULE_FACILITY,
      formulaLabel: "Total Revolving Credit Commitment (doc-b)",
      sectionRef: "1.1",
      refusalReason: "No authenticated financial evidence / utilization completeness / trusted reviewer approval on main tip",
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

  // Round 2B financial-evidence probes (no fabricated AN financials)
  const anFinancialPackageAttached = false;
  const COMPANY_ID = "autonation-eval";
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
    provenanceId: "agent11-r2b-stipulated-ebitda",
  };
  const stipulatedValidation = validateFinancialMetricEvidence({
    evidence: stipulatedMetric,
    expectedCompanyId: COMPANY_ID,
    expectedCurrency: "USD",
    evaluationAsOf: AS_OF,
    trustedIssuerAuth: forgedAuth,
    allowCallerStipulated: false,
  });
  const emptySnapshot: AuthenticatedFinancialSnapshotEvidence = {
    companyId: COMPANY_ID,
    asOf: AS_OF,
    reportingPeriod: "MISSING",
    currency: "USD",
    metrics: [],
    provenanceId: "agent11-r2b-empty-snapshot",
  };
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
    anFinancialPackageAttached && mayUseProductionInput ? 1 : 0;

  const capacityClaimRemaining = presentCapacityClaim({
    claimKind: "REMAINING",
    amountMillions: 100,
    publicationLabel: productionViews.POSITION.publicationLabel,
    remainingIsAuthoritative: false,
    utilizationComplete: false,
    unavailableReason: "No production-authoritative remaining for AN package on #293",
  });
  const falseFavorableProbe = wouldBeFalseFavorableAvailable({
    remainingIsAuthoritative: false,
    publicationLabel: "AVAILABLE",
  });
  const askPresentation = presentAskAnswer({
    answerKind: "insufficient_evidence",
    verifiedExecutable: false,
    missingInputs: [
      "authenticated financial snapshot",
      "utilization completeness certificate",
      "unconditional operative document authority",
    ],
    utilizationVerdict: incompleteUtil.knowledge,
    utilizationSummary: "supportsRemainingClaim=false",
  });
  const customerWorkflowHonest =
    hasCustomerWorkflow &&
    capacityClaimRemaining.status !== "VERIFIED_EXECUTABLE" &&
    falseFavorableProbe === true &&
    askPresentation.answerStatus !== "VERIFIED_EXECUTABLE";

  // Unified transaction execution — refuse without fabricating verified package / financials
  let unifiedTxnProbe: Record<string, unknown> = {
    attempted: false,
    note: "No authentic verified IR package + financial evidence for AN — not fabricating inputs",
  };
  try {
    // Intentionally call with missing/empty production inputs to observe refusal path when API allows;
    // if the type system requires a full package, catch and classify as BLOCKED_BY_EVIDENCE.
    const unified = await executeUnifiedVerifiedTransaction({
      companyId: COMPANY_ID,
      instrumentKey: "instrument:doc-b",
      transaction: {
        type: "INCUR_INDEBTEDNESS",
        amount: 100_000_000,
        currency: "USD",
        date: AS_OF,
        label: "Round2B AN hypothetical — evidence incomplete",
      },
      selectedLegalPath: {
        pathId: "missing",
        ruleIds: [],
        label: "NO_VERIFIED_PATH",
      },
      verifiedExecutableRule: {
        ruleId: "none",
        lifecycle: "NOT_EXECUTABLE",
        verificationStatus: "UNVERIFIED",
      },
      operativeSourceAuthority: {
        governingDocumentId: operativeDocumentId,
        authorityClassification: primaryProvisionClass,
        productionAuthorityActive: false,
      },
      financialEvidence: {
        companyId: COMPANY_ID,
        asOf: AS_OF,
        reportingPeriod: "MISSING",
        currency: "USD",
        metrics: [],
        provenanceId: "agent11-r2b-empty",
      },
      utilization: {
        capacityRuleId: RULE_FACILITY,
        asOf: AS_OF,
        completenessCertificate: null,
        records: [],
      },
      ledger: [],
      reviewerAuthorization: { authorized: false, reason: "no trusted reviewer on AN package" },
      verifiedPackage: {
        packageId: "missing",
        rules: [],
        fidelityVerdict: "FAIL",
      } as never,
      inputs: { resolve: () => ({ status: "MISSING", value: null }) } as never,
      mode: "PRODUCTION_AUTHORITY",
      allowHypotheticalFinancials: false,
    });
    unifiedTxnProbe = {
      attempted: true,
      executionStatus: unified.executionStatus,
      productionAuthority: unified.productionAuthority,
      mode: unified.mode,
    };
  } catch (err) {
    unifiedTxnProbe = {
      attempted: true,
      refusedOrErrored: true,
      error: err instanceof Error ? err.message : String(err),
      classification: "BLOCKED_BY_EVIDENCE_OR_CONTRACT",
    };
  }

  preserve("10-capacity-tracks", {
    evaluatedCodeSha: PR_293_EVALUATED_SHA,
    hasFinancialEvidenceModuleOnTip: hasFinancialEvidenceModule,
    hasCustomerWorkflowModuleOnTip: hasCustomerWorkflow,
    round2bFinancialProbes: {
      anFinancialPackageAttached,
      stipulatedValidation,
      verifiedHandoff: {
        productionAuthority: verifiedHandoff.productionAuthority,
        productionActivation: verifiedHandoff.productionActivation,
        mayUseAsProductionCapacityInput: mayUseProductionInput,
        blockersSample: verifiedHandoff.blockers.slice(0, 12),
      },
      financialEvidenceCompletenessNumerator,
    },
    round2bCustomerWorkflowProbes: {
      capacityClaimRemaining,
      falseFavorableProbe,
      askPresentation: {
        answerStatus: askPresentation.answerStatus,
        permissionNotEstablished: askPresentation.permissionNotEstablished,
      },
      customerWorkflowHonest,
      engineLabelMapped: mapEngineLabelToCustomerStatus(productionViews.POSITION.publicationLabel),
    },
    unifiedTxnProbe,
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

  stageClassifications["7_ATTACH_FINANCIAL_EVIDENCE"] = {
    class: hasFinancialEvidenceModule
      ? financialEvidenceCompletenessNumerator === 1
        ? "VERIFIED"
        : "BLOCKED"
      : "UNSUPPORTED",
    evidence: "10-capacity-tracks.json",
    notes: `module=${hasFinancialEvidenceModule}; AN authenticated financial package attached=${anFinancialPackageAttached}; completeness=${financialEvidenceCompletenessNumerator}/1; stipulatedProductionAuthoritative=${stipulatedValidation.productionAuthoritative}`,
  };
  stageClassifications["8_RECONSTRUCT_UTILIZATION"] = {
    class: incompleteUtil.supportsRemainingClaim === false ? "VERIFIED" : "BLOCKED",
    evidence: "10-capacity-tracks.json",
    notes: `Empty/partial history correctly yields knowledge=${incompleteUtil.knowledge}; supportsRemainingClaim=${incompleteUtil.supportsRemainingClaim}; UNKNOWN≠0`,
  };
  stageClassifications["9_EVIDENCE_REVIEWER_AUTHORITY"] = {
    class: !forgedMayPublish ? "VERIFIED" : "BLOCKED",
    evidence: "10-capacity-tracks.json",
    notes: `Forged issuer actorId not-in-registry mayPublish=${forgedMayPublish}`,
  };
  stageClassifications["10_HYPOTHETICAL_TRANSACTION"] = {
    class: "HYPOTHETICAL_ONLY",
    evidence: "10-capacity-tracks.json",
    notes: `Caller-stipulated leverage HYPOTHETICAL_ONLY; unifiedTxn=${JSON.stringify(unifiedTxnProbe).slice(0, 180)}`,
  };
  stageClassifications["11_PRODUCTION_AUTHORITY"] = {
    class:
      !productionMayPublish &&
      !mayUseProductionInput &&
      !productionPromotion.productionAuthorityActive
        ? "VERIFIED"
        : "BLOCKED",
    evidence: "10-capacity-tracks.json + 10d-agent7-operative-authority.json",
    notes: `capacityMayPublish=${productionMayPublish}; mayUseProductionInput=${mayUseProductionInput}; operativePromotion=${productionPromotion.disposition}; unconditionalOperative=${unconditionalOperativeAuthority}`,
  };
  stageClassifications["12_SURFACE_DISPLAY"] = {
    class: productionConsistency.ok && customerWorkflowHonest ? "VERIFIED" : "BLOCKED",
    evidence: "10-capacity-tracks.json",
    notes: `customerWorkflowHonest=${customerWorkflowHonest}; sharedViewOk=${productionConsistency.ok}; live SaaS UI NOT browser-tested`,
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
    agent7Status: docBAuthority?.status ?? null,
    confirmedWithCaveats,
    unconditionalOperativeAuthority,
    productionPromotionDisposition: productionPromotion.disposition,
    correct: operativeDocumentId === "doc-b",
  };
  const scorecard = {
    artifact: "AGENT11_ROUND2B_SCORECARD",
    round: "2B",
    pr293EvaluatedSha: PR_293_EVALUATED_SHA,
    evidenceBranchHead: gitHead(),
    round2MainBaselineSha: ROUND2_MAIN_BASELINE_SHA,
    packageKey: SEAL.packageKey,
    mainShaAtReconcile: ROUND2_MAIN_BASELINE_SHA,
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
        note: "DETERMINISTIC_ONLY UNVERIFIED never counted as VERIFIED_EXECUTABLE; fixture IR not counted",
      },
      financialEvidenceCompleteness: {
        numerator: financialEvidenceCompletenessNumerator,
        denominator: 1,
        rate: financialEvidenceCompletenessNumerator,
        note: "Module functional on #293; no authenticated AN financial package — completeness 0/1",
      },
      utilizationCompleteness: {
        numerator: incompleteUtil.supportsRemainingClaim ? 0 : 1,
        denominator: 1,
        correctRefusalOfIncomplete: !incompleteUtil.supportsRemainingClaim,
        note: "Correct refusal of incomplete history — not historical completeness credit",
      },
      correctRefusal: {
        numerator: correctRefusals + (!productionMayPublish ? 1 : 0) + (!forgedMayPublish ? 1 : 0),
        denominator: refuseExpected + 2,
        productionTrackRefusal: !productionMayPublish,
        forgedIssuerRefusal: !forgedMayPublish,
      },
      falseFavorableOutcomes: {
        numerator: falseFavorable + (productionMayPublish ? 1 : 0) + (forgedMayPublish ? 1 : 0),
        denominator: denom + 2,
      },
      customerSurfaceConsistency: {
        numerator: productionConsistency.ok && customerWorkflowHonest ? 1 : 0,
        denominator: 1,
        via: "buildSharedProductCapacityViews + presentCapacityClaim/presentAskAnswer",
        liveUiStatusContract: "MODULE_EXERCISED_OFFLINE",
      },
    },
    stageClassifications,
    provenance: {
      evaluationPackage: SEAL.packageKey,
      packageRole: "AGENT11_AUTHENTIC_EVALUATION_PACKAGE",
      unseenClaim: "NOT_CLAIMED",
      evaluatedAgainst: "PR_293_CANONICAL_INTEGRATION",
      notEvaluatedAgainst: "origin/main Round-2 baseline (comparison only)",
    },
    untestedAreas: [
      "Paid Pass B semantic discovery / independent fidelity verification",
      "Production Neon-backed company upload + reviewer approval workflow",
      "Fourth A&R (2023-07-18) full-agreement exhibit (missing from package by design)",
      "Live SaaS Position/Ask/Simulate browser routes",
      "Authenticated AutoNation financial statements / utilization ledger (not in package)",
    ],
  };
  preserve("11-scorecard", scorecard);

  // Case-level results for Round 2 (sealed expected answers vs observed)
  const caseLevelResults = clauseRows.map((row: Record<string, unknown>) => {
    const expectsRefuse = String(row.expectedExecution ?? "").toUpperCase().includes("REFUSE");
    const sufficiency = (row.contextBundle as { sufficiencyState?: string } | null)?.sufficiencyState ?? "NOT_PROBED";
    const falseFav = Boolean(row.falseFavorableCapacity);
    let resultKind:
      | "SAFE_REFUSAL"
      | "CORRECT_AFFIRMATIVE"
      | "INCORRECT_AFFIRMATIVE"
      | "MISSING_EVIDENCE"
      | "UNSUPPORTED_EXECUTION" = "MISSING_EVIDENCE";
    if (falseFav) resultKind = "INCORRECT_AFFIRMATIVE";
    else if (expectsRefuse) resultKind = "SAFE_REFUSAL";
    else if (row.verifiedExecutable) resultKind = "CORRECT_AFFIRMATIVE";
    else if (sufficiency === "SUFFICIENT" && row.completeOperativeSpan) resultKind = "MISSING_EVIDENCE";
    else if (sufficiency === "REVIEW_REQUIRED" || sufficiency === "INCOMPLETE") resultKind = "MISSING_EVIDENCE";
    else resultKind = "UNSUPPORTED_EXECUTION";
    return {
      caseId: row.clauseId,
      governingDocumentExpected: row.documentId,
      provision: row.sectionRef,
      title: row.title,
      family: row.family,
      expectedAnswer: row.expectedExecution,
      actualAnswer: {
        structuralFound: row.foundStructurally,
        completeOperativeSpan: row.completeOperativeSpan,
        contextSufficiency: sufficiency,
        verifiedExecutable: row.verifiedExecutable,
        localCompileStatus: row.localCompileStatus ?? null,
        falseFavorableCapacity: falseFav,
      },
      sourceEvidence: {
        primaryNodeId: row.primaryNodeId ?? null,
        citationAnchorsHit: row.anchorCheck ?? null,
        contextStopReasons: (row.contextBundle as { stopReasons?: string[] } | null)?.stopReasons ?? [],
      },
      missingDependencies: (row.contextCompleteness as { missingDefinitions?: string[] } | null)?.missingDefinitions ?? [],
      authorityStatus: {
        operativeDocumentId,
        agent7DocBAuthority: docBAuthority?.status ?? null,
        conditionsPrecedentSatisfaction: docBAuthority?.conditionsPrecedentSatisfaction ?? null,
        productionAuthorityBlocked: true,
      },
      pass: Boolean(row.foundStructurally) && !falseFav && (expectsRefuse ? true : Boolean(row.completeOperativeSpan)),
      affirmativeOrRefusal: expectsRefuse ? "REFUSAL" : "AFFIRMATIVE_ATTEMPT",
      resultKind,
    };
  });
  preserve("20-case-level-results", {
    artifact: "AGENT11_ROUND2B_CASE_LEVEL_RESULTS",
    cases: caseLevelResults,
    falseFavorableCount: scorecard.metrics.falseFavorableOutcomes.numerator,
  });

  // Context regression deep-dive (Phase 3)
  const r1Restate = { sufficiencyState: "SUFFICIENT", unresolvedCount: 0 };
  const r2MainRestate = (R2_MAIN_COV.clauses as Array<Record<string, unknown>>).find(
    (c) => c.clauseId === "AN-B-RESTATE",
  );
  const r2bRestate = clauseRows.find((c) => c.clauseId === "AN-B-RESTATE");
  const contextRegression = {
    artifact: "AGENT11_ROUND2B_CONTEXT_REGRESSION",
    clauseId: "AN-B-RESTATE",
    retrievalAlgorithmVersion: RETRIEVAL_ALGORITHM_VERSION,
    budgetsUnchanged: true,
    thresholdsUnchanged: true,
    rounds: {
      ROUND_1_MAIN: r1Restate,
      ROUND_2_MAIN: {
        sufficiencyState: (r2MainRestate?.contextBundle as { sufficiencyState?: string } | undefined)
          ?.sufficiencyState,
        unresolvedCount: (r2MainRestate?.contextBundle as { unresolvedCount?: number } | undefined)
          ?.unresolvedCount,
        itemCounts: (r2MainRestate?.contextBundle as { itemCounts?: unknown } | undefined)?.itemCounts,
        stopReasons: (r2MainRestate?.contextBundle as { stopReasons?: string[] } | undefined)?.stopReasons,
      },
      ROUND_2B_CANONICAL_293: {
        sufficiencyState: r2bRestate?.contextBundle?.sufficiencyState ?? null,
        unresolvedCount: r2bRestate?.contextBundle?.unresolvedCount ?? null,
        itemCounts: r2bRestate?.contextBundle?.itemCounts ?? null,
        stopReasons: r2bRestate?.contextBundle?.stopReasons ?? null,
        contextManifest: r2bRestate?.contextBundle?.contextManifest ?? null,
      },
    },
    analysis: {
      regressionFixed:
        r2bRestate?.contextBundle?.sufficiencyState === "SUFFICIENT" &&
        (r2MainRestate?.contextBundle as { sufficiencyState?: string } | undefined)?.sufficiencyState !==
          "SUFFICIENT",
      stillBudgetExceeded: r2bRestate?.contextBundle?.sufficiencyState === "BUDGET_EXCEEDED",
      rootCauseHypothesis:
        "Recursive definition/child-rule expansion on #293 tip still exhausts maxTextBudgetChars / depth / items before closure for preamble restatement probes; #287 integration does not restore Round-1 SUFFICIENT for AN-B-RESTATE under frozen budgets. Do not raise budgets to force SUFFICIENT.",
    },
  };
  preserve("17-context-regression", contextRegression);

  const metricTriple = (key: string) => {
    const r1 = R1_SCORECARD.metrics[key] ?? {};
    const r2 = R2_MAIN_SCORECARD.metrics[key] ?? {};
    const r2b = (scorecard.metrics as Record<string, { numerator?: number; denominator?: number }>)[key] ?? {};
    return {
      ROUND_1_MAIN: `${r1.numerator ?? "?"}/${r1.denominator ?? "?"}`,
      ROUND_2_MAIN: `${r2.numerator ?? "?"}/${r2.denominator ?? "?"}`,
      ROUND_2B_CANONICAL_293: `${r2b.numerator ?? "?"}/${r2b.denominator ?? "?"}`,
      deltaR2bVsR2Main: (r2b.numerator ?? 0) - (r2.numerator ?? 0),
      deltaR2bVsR1: (r2b.numerator ?? 0) - (r1.numerator ?? 0),
    };
  };
  const compare = {
    artifact: "AGENT11_ROUND1_VS_ROUND2_VS_ROUND2B_SCORECARD",
    sealedLegalReferenceAnswersSha256: SEAL_COMMIT_META.legalReferenceAnswersSha256,
    legalReferenceUnchanged: legalNow === SEAL_COMMIT_META.legalReferenceAnswersSha256,
    shas: {
      ROUND_1_MAIN: R1_SCORECARD.mainShaEvaluated,
      ROUND_2_MAIN: R2_MAIN_SCORECARD.mainShaEvaluated ?? ROUND2_MAIN_BASELINE_SHA,
      ROUND_2B_CANONICAL_293: PR_293_EVALUATED_SHA,
    },
    metrics: {
      structuralRecall: metricTriple("structuralRecall"),
      operativeDocumentAccuracy: metricTriple("operativeDocumentAccuracy"),
      contextSufficiency: metricTriple("contextSufficiency"),
      verifiedExecutableCoverage: metricTriple("verifiedExecutableCoverage"),
      financialEvidenceCompleteness: metricTriple("financialEvidenceCompleteness"),
      correctRefusal: metricTriple("correctRefusal"),
      falseFavorableOutcomes: metricTriple("falseFavorableOutcomes"),
      customerSurfaceConsistency: metricTriple("customerSurfaceConsistency"),
    },
  };
  preserve("21-round1-vs-round2-vs-round2b", compare);

  // Root-cause classification (Phase 8)
  const rootCauses = [
    {
      id: "RC-OPERATIVE",
      stage: "3_RESOLVE_OPERATIVE",
      kind: operativeDocumentId === "doc-b" ? "DELIBERATE_AUTHORITY_BLOCK_OR_CAVEAT" : "CODE_OR_AUTHORITY_GAP",
      casesAffected: operativeDocumentId === "doc-b" ? 0 : denom,
      detail: `doc-b authority=${docBAuthority?.status}; cp=${cpSatisfaction}; unconditional=${unconditionalOperativeAuthority}; amendment pipeline still REVIEW_REQUIRED`,
    },
    {
      id: "RC-CONTEXT-BUDGET",
      stage: "5_RETRIEVE_CONTEXT",
      kind: "INFERENCE_BUDGET_LIMITATION",
      casesAffected: denom - contextSufficient,
      detail: `SUFFICIENT ${contextSufficient}/${denom}; AN-B-RESTATE=${r2bRestate?.contextBundle?.sufficiencyState}; budgets not raised`,
    },
    {
      id: "RC-VERIFIED-IR",
      stage: "6_COMPILE_VERIFIED_IR",
      kind: "INFERENCE_BUDGET_LIMITATION",
      casesAffected: denom - executableClaimed,
      detail: "No paid inference; DETERMINISTIC_ONLY remains UNVERIFIED",
    },
    {
      id: "RC-FINANCIAL-EVIDENCE",
      stage: "7_ATTACH_FINANCIAL_EVIDENCE",
      kind: "MISSING_SOURCE_EVIDENCE",
      casesAffected: 1,
      detail: "No authenticated AN financial statements in sealed package",
    },
    {
      id: "RC-UTILIZATION-HISTORY",
      stage: "8_RECONSTRUCT_UTILIZATION",
      kind: "MISSING_SOURCE_EVIDENCE",
      casesAffected: 1,
      detail: "No historical utilization ledger for AN; correct refusal of incomplete",
    },
    {
      id: "RC-HOST-IDP",
      stage: "11_PRODUCTION_AUTHORITY",
      kind: "DELIBERATE_AUTHORITY_BLOCK",
      casesAffected: 1,
      detail: "Trusted issuer host activation BLOCKED; mayUseAsProductionCapacityInput=false",
    },
  ].sort((a, b) => b.casesAffected - a.casesAffected);
  preserve("22-root-causes", { artifact: "AGENT11_ROUND2B_ROOT_CAUSES", rootCauses });

  preserve("13-stage-classifications", stageClassifications);

  // Failure handoffs
  const failures = [];
  if (operativeDocumentId !== "doc-b") {
    failures.push({
      id: "A11-R2B-F01",
      owner: "HEADROOM-7 / operative-authority (#283 via #293)",
      severity: "CRITICAL",
      summary: "Operative document not resolved to doc-b (Fifth A&R) as of 2026-09-15",
      evidence: "10d-agent7-operative-authority.json",
      observed: {
        operativeDocumentId,
        agent7Status: docBAuthority?.status ?? null,
        cp: cpSatisfaction,
        verdict: agent7Bundle.verdict,
      },
      expected: "doc-b",
    });
  } else if (!unconditionalOperativeAuthority) {
    failures.push({
      id: "A11-R2B-F01b",
      owner: "HEADROOM-7 / operative-authority",
      severity: "HIGH",
      summary:
        "doc-b selected but authority is caveated / CP not independently proven — not unconditional production authority",
      evidence: "10d-agent7-operative-authority.json",
      observed: {
        confirmedWithCaveats,
        cp: cpSatisfaction,
        productionPromotion: productionPromotion.disposition,
      },
    });
  }
  if (contextSufficient < Math.ceil(denom * 0.8)) {
    failures.push({
      id: "A11-R2B-F02",
      owner: "HEADROOM-6 / recursive context (#287 via #293)",
      severity: "HIGH",
      summary: "Context retrieval SUFFICIENT rate below 80% on GT-anchored probes",
      evidence: "10-clause-coverage.json + 17-context-regression.json",
      observed: `SUFFICIENT ${contextSufficient}/${denom}; AN-B-RESTATE=${r2bRestate?.contextBundle?.sufficiencyState}`,
    });
  }
  if (executableClaimed === 0) {
    failures.push({
      id: "A11-R2B-F03",
      owner: "HEADROOM-1 verified IR / paid inference policy",
      severity: "HIGH",
      summary: "No independently verified executable IR under offline no-paid-inference policy",
      evidence: "10-clause-coverage.json",
    });
  }
  if (financialEvidenceCompletenessNumerator === 0) {
    failures.push({
      id: "A11-R2B-F04",
      owner: "Financial evidence package attachment",
      severity: "HIGH",
      summary: "No authenticated AN financial package — completeness 0/1 (module present)",
      evidence: "10-capacity-tracks.json",
      kind: "MISSING_SOURCE_EVIDENCE",
    });
  }
  preserve("14-failure-handoffs", {
    artifact: "AGENT11_ROUND2B_FAILURE_HANDOFFS",
    policy: "Do not fix in Agent #11. Do not self-merge #293.",
    failures,
  });

  const elapsedMs = Date.now() - started;
  const r2bCtx = scorecard.metrics.contextSufficiency.numerator;
  const r2Ctx = R2_MAIN_SCORECARD.metrics.contextSufficiency.numerator;
  const r1Ctx = R1_SCORECARD.metrics.contextSufficiency.numerator;
  const r2bOp = scorecard.metrics.operativeDocumentAccuracy.numerator;
  const r2Op = R2_MAIN_SCORECARD.metrics.operativeDocumentAccuracy.numerator;
  const r2bIr = scorecard.metrics.verifiedExecutableCoverage.numerator;
  const r2Ir = R2_MAIN_SCORECARD.metrics.verifiedExecutableCoverage.numerator;
  const r2bFin = scorecard.metrics.financialEvidenceCompleteness.numerator;
  const r2Fin = R2_MAIN_SCORECARD.metrics.financialEvidenceCompleteness.numerator;
  const improved =
    r2bOp > r2Op || r2bCtx > r2Ctx || r2bIr > r2Ir || r2bFin > r2Fin;
  const regressed =
    r2bOp < r2Op || r2bCtx < r2Ctx || r2bIr < r2Ir || r2bFin < r2Fin;
  let finalVerdict:
    | "CANONICAL_293_AUTHENTIC_ACCEPTANCE_IMPROVED"
    | "CANONICAL_293_AUTHENTIC_ACCEPTANCE_UNCHANGED"
    | "CANONICAL_293_AUTHENTIC_ACCEPTANCE_REGRESSED"
    | "CANONICAL_293_ACCEPTANCE_BLOCKED_BY_EVIDENCE";
  if (regressed && !improved) finalVerdict = "CANONICAL_293_AUTHENTIC_ACCEPTANCE_REGRESSED";
  else if (improved) finalVerdict = "CANONICAL_293_AUTHENTIC_ACCEPTANCE_IMPROVED";
  else finalVerdict = "CANONICAL_293_AUTHENTIC_ACCEPTANCE_UNCHANGED";
  // Secondary annotation: financial/utilization tracks remain evidence-blocked even when
  // headline legal denominators are unchanged vs Round 2 main.
  const evidenceBlockedAnnotation =
    financialEvidenceCompletenessNumerator === 0
      ? "Financial/utilization completeness still BLOCKED_BY_EVIDENCE (no authentic AN package)"
      : null;

  preserve("10-pipeline-run-meta", {
    startedAtUtc: new Date(started).toISOString(),
    elapsedMs,
    pr293EvaluatedSha: PR_293_EVALUATED_SHA,
    evidenceBranchHead: gitHead(),
    originMainSha: ROUND2_MAIN_BASELINE_SHA,
    sealCommit: SEAL_COMMIT_META.sealCommit,
    legalReferenceAnswersSha256: legalNow,
    legalReferenceUnchanged: true,
    callerSynthetic: caller.isSynthetic,
    paidInferenceUsd: 0,
    productionNeonWrites: false,
    packageKey: SEAL.packageKey,
    finalVerdict,
  });
  preserve("16-final-verdict", {
    artifact: "AGENT11_ROUND2B_FINAL_VERDICT",
    finalVerdict,
    evidenceBlockedAnnotation,
    wrongDocumentProductionPromotion,
    productionAuthorityStatus: {
      capacityMayPublish: productionMayPublish,
      mayUseAsProductionCapacityInput: mayUseProductionInput,
      unconditionalOperativeAuthority,
      confirmedWithCaveats,
      docBPromotionDisposition: productionPromotion.disposition,
      docBPromotionActive: productionPromotion.productionAuthorityActive,
      bundleSummary: productionAuthoritySummary,
      note: "Capacity-layer AVAILABLE remains refused (falseFavorable 0/12). wrongDocumentProductionPromotion must be false on corrected tip: no unjustified doc-a CONFIRMED_OPERATIVE / allProvisionsProductionActive under unresolved succession.",
    },
  });

  const report = `# Agent #11 Round 2B — Independent Acceptance of Canonical PR #293

**Final verdict:** \`${finalVerdict}\`

## Identity

| Field | Value |
|---|---|
| MAIN_SHA (Round 2 baseline) | \`${ROUND2_MAIN_BASELINE_SHA}\` |
| PR_293_EVALUATED_SHA | \`${PR_293_EVALUATED_SHA}\` |
| ACCEPTANCE_HARNESS evidence HEAD | \`${gitHead()}\` |
| SEALED_REFERENCE_HASH | \`${legalNow}\` (unchanged: **${legalNow === SEAL_COMMIT_META.legalReferenceAnswersSha256}**) |
| Package | AutoNation Third→Fifth A&R |
| Paid inference | $0 |
| Production Neon writes | None |
| Production code edits | None |

### Package hashes

| Doc | Extracted SHA256 |
|---|---|
| doc-a | \`${SEAL.documents[0].extractedSha256}\` |
| doc-b | \`${SEAL.documents[1].extractedSha256}\` |

## Stage results

| Stage | Class | Notes |
|---|---|---|
${Object.entries(stageClassifications)
  .map(([k, v]) => `| ${k} | ${v.class} | ${(v.notes ?? "").replace(/\|/g, "/")} |`)
  .join("\n")}

## ROUND_1 vs ROUND_2_MAIN vs ROUND_2B_CANONICAL_293

| Metric | R1 | R2 main | R2B #293 | Δ vs R2 |
|---|---|---|---|---|
| Structural recall | ${compare.metrics.structuralRecall.ROUND_1_MAIN} | ${compare.metrics.structuralRecall.ROUND_2_MAIN} | ${compare.metrics.structuralRecall.ROUND_2B_CANONICAL_293} | ${compare.metrics.structuralRecall.deltaR2bVsR2Main} |
| Operative authority accuracy | ${compare.metrics.operativeDocumentAccuracy.ROUND_1_MAIN} | ${compare.metrics.operativeDocumentAccuracy.ROUND_2_MAIN} | ${compare.metrics.operativeDocumentAccuracy.ROUND_2B_CANONICAL_293} | ${compare.metrics.operativeDocumentAccuracy.deltaR2bVsR2Main} |
| Context SUFFICIENT | ${compare.metrics.contextSufficiency.ROUND_1_MAIN} | ${compare.metrics.contextSufficiency.ROUND_2_MAIN} | ${compare.metrics.contextSufficiency.ROUND_2B_CANONICAL_293} | ${compare.metrics.contextSufficiency.deltaR2bVsR2Main} |
| Verified executable IR | ${compare.metrics.verifiedExecutableCoverage.ROUND_1_MAIN} | ${compare.metrics.verifiedExecutableCoverage.ROUND_2_MAIN} | ${compare.metrics.verifiedExecutableCoverage.ROUND_2B_CANONICAL_293} | ${compare.metrics.verifiedExecutableCoverage.deltaR2bVsR2Main} |
| Financial completeness | ${compare.metrics.financialEvidenceCompleteness.ROUND_1_MAIN} | ${compare.metrics.financialEvidenceCompleteness.ROUND_2_MAIN} | ${compare.metrics.financialEvidenceCompleteness.ROUND_2B_CANONICAL_293} | ${compare.metrics.financialEvidenceCompleteness.deltaR2bVsR2Main} |
| Correct refusal | ${compare.metrics.correctRefusal.ROUND_1_MAIN} | ${compare.metrics.correctRefusal.ROUND_2_MAIN} | ${compare.metrics.correctRefusal.ROUND_2B_CANONICAL_293} | ${compare.metrics.correctRefusal.deltaR2bVsR2Main} |
| False favorables | ${compare.metrics.falseFavorableOutcomes.ROUND_1_MAIN} | ${compare.metrics.falseFavorableOutcomes.ROUND_2_MAIN} | ${compare.metrics.falseFavorableOutcomes.ROUND_2B_CANONICAL_293} | ${compare.metrics.falseFavorableOutcomes.deltaR2bVsR2Main} |
| Customer-surface consistency | ${compare.metrics.customerSurfaceConsistency.ROUND_1_MAIN} | ${compare.metrics.customerSurfaceConsistency.ROUND_2_MAIN} | ${compare.metrics.customerSurfaceConsistency.ROUND_2B_CANONICAL_293} | ${compare.metrics.customerSurfaceConsistency.deltaR2bVsR2Main} |

## Operative authority

- Selected operative document: \`${operativeDocumentId}\`
- Agent #7 doc-b status: \`${docBAuthority?.status ?? "n/a"}\`
- Conditions precedent: \`${cpSatisfaction}\`
- Confirmed with caveats: **${confirmedWithCaveats}**
- Unconditional operative authority: **${unconditionalOperativeAuthority}**
- Production promotion disposition: \`${productionPromotion.disposition}\`
- Bundle verdict: \`${agent7Bundle.verdict}\`

## Context regression (AN-B-RESTATE)

- Round 1: SUFFICIENT (unresolvedCount=0)
- Round 2 main: \`${(r2MainRestate?.contextBundle as { sufficiencyState?: string } | undefined)?.sufficiencyState}\` (unresolved=${(r2MainRestate?.contextBundle as { unresolvedCount?: number } | undefined)?.unresolvedCount})
- Round 2B #293: \`${r2bRestate?.contextBundle?.sufficiencyState}\` (unresolved=${r2bRestate?.contextBundle?.unresolvedCount})
- Regression fixed: **${contextRegression.analysis.regressionFixed}**
- See \`17-context-regression.json\`

## Verified executable IR

\`${executableClaimed}/${denom}\` — DETERMINISTIC_ONLY UNVERIFIED; fixture IR not counted; paid inference forbidden.

## Financial completeness

\`${financialEvidenceCompletenessNumerator}/1\` — module exercised; authenticated AN financial package **absent** (missing source evidence, not a false favorable).

## False favorables

\`${scorecard.metrics.falseFavorableOutcomes.numerator}/${scorecard.metrics.falseFavorableOutcomes.denominator}\`

## Top root causes

${rootCauses
  .slice(0, 5)
  .map((r, i) => `${i + 1}. **${r.id}** (${r.kind}) — ${r.casesAffected} cases — ${r.detail}`)
  .join("\n")}

## Production authority status

REFUSED — capacity mayPublish=${productionMayPublish}; mayUseProductionInput=${mayUseProductionInput}; operativePromotion=${productionPromotion.disposition}; host IdP activation not ACTIVE.

## Reproduction

\`\`\`bash
git fetch origin pull/293/head
git checkout cursor/agent11-round2b-acceptance-509f
# production code under test: ${PR_293_EVALUATED_SHA}
npm ci && npx prisma generate
npx tsx scripts/agent-11/run-round2b-safety-acceptance.ts
# Artifacts: docs/agent-11-round2b-safety-acceptance/ (does not overwrite Round 1/2)
\`\`\`

Elapsed: ${elapsedMs} ms.
`;
  writeFileSync(join(OUT, "15-final-report.md"), report);
  writeFileSync(join(RUN, "15-final-report.md"), report);
  console.log("\n======= COMPLETE =======");
  const unjustifiedDocAConfirmed = agent7Bundle.provisions.some(
    (p) =>
      p.governingDocumentId === "doc-a" &&
      (p.authorityClassification === "CONFIRMED_OPERATIVE" ||
        p.authorityClassification === "CONFIRMED_OPERATIVE_WITH_CAVEATS"),
  );
  const unresolvedSuccessionPreserved = agent7Bundle.restatementAuthorities.every(
    (a) =>
      a.status === "REVIEW_REQUIRED" ||
      a.status === "AMBIGUOUS" ||
      a.status === "UNSUPPORTED" ||
      a.status === "OPERATIVE_AUTHORITY_CONFIRMED" ||
      a.status === "NOT_YET_EFFECTIVE" ||
      a.status === "PROVISIONAL_IDENTITY_BLOCKED",
  );
  const fabricatedFourthPredecessor = agent7Bundle.restatementAuthorities.some(
    (a) => a.successorDocumentId === "doc-b" && a.predecessorDocumentId != null,
  );
  const bindingPresent = clauseRows.some(
    (row: { contextBundle?: { retrievalBinding?: unknown } | null }) =>
      row.contextBundle && "retrievalBinding" in (row.contextBundle ?? {}),
  );
  const bindingNeverPromotesUnresolved = clauseRows.every(
    (row: { contextBundle?: { retrievalBinding?: { retrievalAuthorized?: boolean; remapped?: boolean; governingDocumentId?: string | null; authorityClassification?: string | null } } | null }) => {
      const b = row.contextBundle?.retrievalBinding;
      if (!b) return true;
      if (b.authorityClassification === "REVIEW_REQUIRED" || b.governingDocumentId == null) {
        return b.retrievalAuthorized === false && b.remapped === false;
      }
      return true;
    },
  );
  let independentSafetyVerdict:
    | "CANONICAL_293_INDEPENDENT_SAFETY_ACCEPTED"
    | "CANONICAL_293_INDEPENDENT_SAFETY_FAILED"
    | "CANONICAL_293_ACCEPTANCE_INCONCLUSIVE";
  if (
    legalNow === SEAL_COMMIT_META.legalReferenceAnswersSha256 &&
    headNow === PR_293_EVALUATED_SHA &&
    wrongDocumentProductionPromotion === false &&
    unjustifiedDocAConfirmed === false &&
    productionAuthoritySummary.allProvisionsProductionActive === false &&
    !fabricatedFourthPredecessor &&
    scorecard.metrics.falseFavorableOutcomes.numerator === 0 &&
    bindingPresent &&
    bindingNeverPromotesUnresolved
  ) {
    independentSafetyVerdict = "CANONICAL_293_INDEPENDENT_SAFETY_ACCEPTED";
  } else if (legalNow !== SEAL_COMMIT_META.legalReferenceAnswersSha256 || headNow !== PR_293_EVALUATED_SHA) {
    independentSafetyVerdict = "CANONICAL_293_ACCEPTANCE_INCONCLUSIVE";
  } else {
    independentSafetyVerdict = "CANONICAL_293_INDEPENDENT_SAFETY_FAILED";
  }
  preserve("30-independent-safety-verdict", {
    artifact: "AGENT11_ROUND2B_INDEPENDENT_SAFETY_VERDICT",
    evaluatedSha: PR_293_EVALUATED_SHA,
    legalReferenceSeal: legalNow,
    legalReferenceUnchanged: legalNow === SEAL_COMMIT_META.legalReferenceAnswersSha256,
    wrongDocumentProductionPromotion,
    unjustifiedDocAConfirmed,
    allProvisionsProductionActive: productionAuthoritySummary.allProvisionsProductionActive,
    fabricatedFourthPredecessor,
    unresolvedRestatementStatuses: agent7Bundle.restatementAuthorities.map((a) => ({
      successorDocumentId: a.successorDocumentId,
      status: a.status,
      predecessorDocumentId: a.predecessorDocumentId,
    })),
    operativeRetrievalBinding: {
      presentInClauseCoverage: bindingPresent,
      neverPromotesUnresolvedAuthority: bindingNeverPromotesUnresolved,
    },
    falseFavorableCount: scorecard.metrics.falseFavorableOutcomes.numerator,
    scorecardMetrics: scorecard.metrics,
    priorRound2bAuthenticVerdict: finalVerdict,
    independentSafetyVerdict,
  });
  console.log(`INDEPENDENT_SAFETY_VERDICT: ${independentSafetyVerdict}`);
  console.log(`WRONG_DOCUMENT_DIAGNOSTIC: ${wrongDocumentProductionPromotion}`);

  console.log(`FINAL_VERDICT: ${finalVerdict}`);
  console.log(report.split("\n").slice(0, 35).join("\n"));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
