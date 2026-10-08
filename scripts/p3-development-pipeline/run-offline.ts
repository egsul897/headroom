/**
 * Generalized DEVELOPMENT pipeline for an in-repo package.
 *
 * Offline stages are the production functions already used for ingestion,
 * structure, and Pass A. Pass B/C/D run only when a real provider key is
 * set. A missing key refuses Pass B. The synthetic stage caller is never
 * used. No discoveryId and no semantic role is minted on the refusal path.
 *
 * Text observations use the same builder/reclass regexes as the stratified
 * cross-cut helper, and asset-disposition headings use the same headline
 * vocabulary as Pass A. An observation is not a sealed role, not a family,
 * and not a pin.
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { parseDocument } from "../../lib/extraction/parse";
import { chunkDocument } from "../../lib/extraction/chunk";
import { parseDocumentStructure } from "../../lib/contract-model/compiler/stage-structure";
import { buildStructuralIndex } from "../../lib/contract-model/compiler/structural-index";
import { detectStructuralDefinitions } from "../../lib/contract-model/compiler/structural-definitions";
import { detectStructuralReferences } from "../../lib/contract-model/compiler/structural-references";
import { runPassADeterministicSignals, isAssetDispositionHeading } from "../../lib/contract-model/compiler/discovery/pass-a-signals";
import { buildPassBUserContent, passBSystemPrompt, type SectionBatchInput } from "../../lib/contract-model/compiler/discovery/pass-b-semantic";
import { getStageCaller } from "../../lib/contract-model/compiler/llm-caller";
import { runDiscoveryPipeline } from "../../lib/contract-model/compiler/discovery/pipeline";
import { EMPTY_SUPERSESSION_INDEX, getNodeSupersessionStatus } from "../../lib/contract-model/compiler/amendment/operative-state";
import { observeDeterministicCrossCutText } from "../stratified-cert/lib/cross-cuts";
import { DEFAULT_GATEWAY_ANALYZER_MODEL, DEFAULT_MAX_TOKENS, reservedMaxInputTokens } from "../../lib/contract-model/analyzer/anthropic-analyzer";
import { maxCostOfRequestUsd, PRICING_TABLE_VERSION } from "../../lib/contract-model/analyzer/pricing";
import { resolveReferenceTarget } from "../../lib/contract-model/compiler/semantic-accountability/reference-resolver";
import type { ReferenceResolutionStatus } from "../../lib/contract-model/compiler/semantic-accountability/types";

export const DEVELOPMENT_BANNER = "DEVELOPMENT ≠ CERTIFIED ≠ PINNED_OFFLINE";

const VERIFICATION_RESERVATION_SOURCE = "docs/phase-3-final-chewy/02-cost-preflight.json verifierSemanticReviewPerCandidate $0.3293 (85,458 in / 15,838 out on Sonnet) and conditionSuspicionPerCall $0.0114 times 5. Haiku figure scales that same token observation by scripts/semantic-accountability-cost-plan.ts list prices $1/$5, which are half of Sonnet $2/$10. Not executed. Not a rate-card price. Verification is per compiled candidate; these rows were not compiled.";

function reserveVerification(candidateCount: number): DevelopmentPipelineResult["verificationReservation"] {
  const sonnetReview = 0.3293;
  const suspicion = 0.0114;
  const suspicionCalls = 5;
  const haikuReview = 85458 * (1 / 1e6) + 15838 * (5 / 1e6);
  const haikuSuspicion = suspicion * 0.5;
  return {
    executed: false,
    candidateCount,
    sonnetObservedRateUsd: Number((candidateCount * sonnetReview + candidateCount * suspicionCalls * suspicion).toFixed(2)),
    haikuListScaledUsd: Number((candidateCount * haikuReview + candidateCount * suspicionCalls * haikuSuspicion).toFixed(2)),
    source: VERIFICATION_RESERVATION_SOURCE,
  };
}

function readCrossCuts(candidates: DevelopmentPipelineResult["discoveredCandidates"], owningNodeIds: string[], reclassNodeIds: string[], assetNodeIds: string[]): DevelopmentPipelineResult["crossCutRead"] {
  const owns = new Set(owningNodeIds);
  const reclass = new Set(reclassNodeIds);
  const assets = new Set(assetNodeIds);
  const hits = (ids: string[], wanted: Set<string>) => ids.some((id) => wanted.has(id));
  return {
    builderRoleCount: candidates.filter((candidate) => candidate.role === "BUILDER").length,
    builderOnOwningNodes: candidates.filter((candidate) => hits(candidate.structuralNodeIds, owns)).map((candidate) => candidate.discoveryId),
    builderOn705: candidates.filter((candidate) => candidate.normalizedSourceRef === "7.05" || candidate.normalizedSourceRef.startsWith("7.05")).map((candidate) => candidate.discoveryId),
    reclassOnWindowNodes: candidates.filter((candidate) => hits(candidate.structuralNodeIds, reclass)).map((candidate) => candidate.discoveryId),
    reclassEdgeWritten: false,
    assetOn704Nodes: candidates.filter((candidate) => hits(candidate.structuralNodeIds, assets) || candidate.normalizedSourceRef === "7.04" || candidate.normalizedSourceRef.startsWith("7.04")).map((candidate) => candidate.discoveryId),
    assetNodeSelected: false,
  };
}

export interface DevelopmentPackageInput {
  /** Fixture root. Only files under this directory are read. */
  packageDir: string;
  documentId: string;
  label: string;
  /** Path to the raw HTML exhibit, relative to packageDir. */
  rawHtmlRelative: string;
  /** Path to the already-extracted text, relative to packageDir. */
  extractedTextRelative: string;
  provenanceRelative: string;
  /** Grant-bound FROZEN body. Hashed, not interpreted as a tip-tree fact. */
  frozenBodyPath: string;
  expectedFrozenSha256: string;
  /** Exact command that continues at Pass B when AI_GATEWAY_API_KEY is set. */
  passBCommand: string;
}

export interface DevelopmentWindowRow {
  sectionRef: string;
  heading: string;
  nodeType: string;
  nodeId: string;
  charStart: number;
  charEnd: number;
  ownChars: number;
  passASignals: string[];
  builderHeuristic: boolean;
  reclassificationHeuristic: boolean;
  supersessionStatus: string;
  bareRefResolution: "UNIQUE" | "AMBIGUOUS" | "NOT_FOUND" | null;
  bareRefCandidateCount: number | null;
  discoveryId: null;
  sealedRole: null;
  family: null;
  excerpt: string;
}

export interface DevelopmentPipelineResult {
  banner: typeof DEVELOPMENT_BANNER;
  designation: "DEVELOPMENT";
  certified: false;
  pinnedOffline: false;
  eligibleClaimed: false;
  matrixCellSelected: false;
  pinWritten: false;
  readyToPinInvented: false;
  stage1MarkerInvented: false;
  phase3PercentRaised: false;
  discoveryIdsMinted: boolean;
  semanticRolesAssigned: boolean;
  frozenSha256: string;
  frozenHashMatches: boolean;
  documentId: string;
  label: string;
  offline: {
    structuredFrom: "html-parse-matches-extracted-text" | "provenance-extracted-text";
    htmlParseMatchesExtractedText: boolean;
    extractedTextSha256: string;
    provenanceExtractedTextSha256: string | null;
    extractedTextMatchesProvenance: boolean;
    htmlBodySha256: string;
    provenanceBodySha256: string | null;
    htmlBodyMatchesProvenance: boolean;
    parsedChars: number;
    chunkCount: number;
    chunksWithSectionRef: number;
    totalNodes: number;
    definitionsDetected: number;
    referencesDetected: number;
    referencesResolved: number;
    referencesUnresolved: number;
    referencesAmbiguous: number;
    passACandidates: number;
    passASignalCounts: Record<string, number>;
    healthFindings: number;
    supersessionIndex: "EMPTY";
  };
  passB: {
    executed: false;
    terminal: "PROVIDER_EXECUTION_REQUIRED";
    syntheticInvented: false;
  } | {
    executed: true;
    terminal: "PASS_B_REAL_PROVIDER";
    providerName: string;
    model: string;
    syntheticInvented: false;
    modelCalls: number;
    sectionFailures: number;
    finalCandidateCount: number;
    inputTokens: number;
    outputTokens: number;
  };
  passC: { executed: boolean; reason: string };
  passD: { executed: boolean; reason: string };
  providerExecutionRequired: null | {
    code: "PROVIDER_EXECUTION_REQUIRED";
    provider: "VERCEL_AI_GATEWAY";
    model: string;
    command: string;
    workflow: string;
    expectedMaxCostUsd: number;
    pricingTableVersion: string;
    maxOutputTokensPerCall: number;
    sectionsToCall: number;
    pipelineStageUnlocked: "PASS_B_SEMANTIC_CLASSIFICATION";
  };
  investigations: {
    builderBasket: {
      phrase: "Available Amount Builder Basket";
      citedRef: "7.05(a)(y)";
      citedRefResolution: ReferenceResolutionStatus;
      citedRefCandidateCount: number;
      owningNodes: Array<{ sectionRef: string; nodeId: string; ownChars: number; excerpt: string }>;
      discoveryId: null;
      sealedRole: null;
    };
    reclass: {
      edgeWritten: false;
      categoryToTargetRuleIdInvented: false;
      windows: Array<{ sectionRef: string; nodeId: string; ownChars: number; mentionsSectionRef: boolean; excerpt: string }>;
    };
    assetDispositions704: {
      sectionRef: "7.04";
      resolution: ReferenceResolutionStatus;
      selected: false;
      resolvedNodeId: string | null;
      excludedDegenerateNodeIds: string[];
      candidates: Array<{ nodeId: string; heading: string; charStart: number; charEnd: number; ownedChars: number }>;
    };
  };
  /** Every Pass D candidate from a real provider run. Empty when Pass B is refused. */
  discoveredCandidates: Array<{
    discoveryId: string;
    role: string;
    families: string[];
    normalizedSourceRef: string;
    structuralNodeIds: string[];
    description: string;
    banner: typeof DEVELOPMENT_BANNER;
    certified: false;
    pinnedOffline: false;
  }>;
  /** Real Pass B/C/D identities for the builder and asset-disposition filters. Empty when Pass B is refused. */
  providerScopedCandidates: Array<{
    discoveryId: string;
    role: string;
    families: string[];
    normalizedSourceRef: string;
    structuralNodeIds: string[];
    banner: typeof DEVELOPMENT_BANNER;
    certified: false;
    pinnedOffline: false;
  }>;
  /** Read of persisted candidates against the deterministic cross-cut windows. Does not seal a role or write an edge. */
  crossCutRead: {
    builderRoleCount: number;
    builderOnOwningNodes: string[];
    builderOn705: string[];
    reclassOnWindowNodes: string[];
    reclassEdgeWritten: false;
    assetOn704Nodes: string[];
    assetNodeSelected: false;
  };
  /** Not executed. Arithmetic from the frozen Chewy per-candidate observations times this run's candidate count. */
  verificationReservation: {
    executed: false;
    candidateCount: number;
    sonnetObservedRateUsd: number;
    haikuListScaledUsd: number;
    source: string;
  };
  paths: {
    builder: {
      stage: "PASS_A_BUILDER_LANGUAGE_PLUS_CROSS_CUT_TEXT_HEURISTIC";
      sealedRole: null;
      crossCutClaimed: false;
      rows: DevelopmentWindowRow[];
    };
    reclass: {
      stage: "CROSS_CUT_RECLASS_TEXT_HEURISTIC";
      sealedRole: null;
      crossCutClaimed: false;
      rows: DevelopmentWindowRow[];
    };
    assetDispositions: {
      stage: "PASS_A_HEADLINE_DISPOSITION_HEADING";
      familyAssigned: false;
      stratum: null;
      crossCutClaimed: false;
      rows: DevelopmentWindowRow[];
    };
  };
}

function sha256(bytes: Buffer | string): string {
  const data = typeof bytes === "string" ? Buffer.from(bytes) : bytes;
  return createHash("sha256").update(data).digest("hex");
}

function excerptAround(text: string, needle: RegExp): string {
  const match = needle.exec(text);
  const at = match?.index ?? 0;
  const start = Math.max(0, at - 60);
  const end = Math.min(text.length, at + (match?.[0].length ?? 0) + 100);
  return text.slice(start, end).replace(/\s+/g, " ").trim().slice(0, 180);
}

function realProvider(): "gateway" | "anthropic" | null {
  if (process.env.AI_GATEWAY_API_KEY) return "gateway";
  if (process.env.ANTHROPIC_API_KEY) return "anthropic";
  return null;
}

export async function runOfflineDevelopmentPipeline(input: DevelopmentPackageInput): Promise<DevelopmentPipelineResult> {
  const frozenBytes = readFileSync(input.frozenBodyPath);
  const frozenSha256 = sha256(frozenBytes);
  const frozenHashMatches = frozenSha256 === input.expectedFrozenSha256;
  if (!frozenHashMatches) {
    throw new Error(`FROZEN sha256 ${frozenSha256} does not match ${input.expectedFrozenSha256}`);
  }

  const packageDir = path.resolve(input.packageDir);
  const rawHtmlPath = path.resolve(packageDir, input.rawHtmlRelative);
  const extractedPath = path.resolve(packageDir, input.extractedTextRelative);
  const provenancePath = path.resolve(packageDir, input.provenanceRelative);
  for (const file of [rawHtmlPath, extractedPath, provenancePath]) {
    if (!file.startsWith(packageDir + path.sep)) {
      throw new Error(`Refusing to read outside the package directory: ${file}`);
    }
  }

  const provenance = JSON.parse(readFileSync(provenancePath, "utf8")) as {
    designation?: string;
    designationIsNotCertified?: boolean;
    bodySha256?: string;
    extractedTextSha256?: string;
  };
  if (provenance.designation !== "DEVELOPMENT" || provenance.designationIsNotCertified !== true) {
    throw new Error("Package provenance is not DEVELOPMENT with designationIsNotCertified true. Refusing to relabel it.");
  }

  const rawHtml = readFileSync(rawHtmlPath);
  const extractedText = readFileSync(extractedPath, "utf8");
  const parsed = await parseDocument(rawHtml, "text/html");
  const htmlParseMatchesExtractedText = parsed.fullText === extractedText;
  const text = htmlParseMatchesExtractedText ? parsed.fullText : extractedText;
  const structuredFrom = htmlParseMatchesExtractedText ? "html-parse-matches-extracted-text" : "provenance-extracted-text";

  const chunks = chunkDocument({ pages: [{ pageNumber: 1, text }], fullText: text });
  const nodes = parseDocumentStructure({ documentId: input.documentId, label: input.label, text });
  const definitions = detectStructuralDefinitions(input.documentId, text, nodes);
  const references = detectStructuralReferences(input.documentId, text, nodes);
  const index = buildStructuralIndex(new Map([[input.documentId, { text, nodes }]]), definitions, references);
  const deterministic = runPassADeterministicSignals(input.documentId, index, EMPTY_SUPERSESSION_INDEX);
  const signalsByNodeId = new Map(deterministic.map((candidate) => [candidate.nodeId, candidate.signals] as const));

  const passASignalCounts: Record<string, number> = {};
  for (const candidate of deterministic) {
    for (const signal of candidate.signals) {
      passASignalCounts[signal] = (passASignalCounts[signal] ?? 0) + 1;
    }
  }

  const resolutionCache = new Map<string, { status: "UNIQUE" | "AMBIGUOUS" | "NOT_FOUND"; count: number }>();
  function bareRef(sectionRef: string): { status: "UNIQUE" | "AMBIGUOUS" | "NOT_FOUND"; count: number } {
    const cached = resolutionCache.get(sectionRef);
    if (cached) return cached;
    const resolved = index.resolveUniqueNodeByRef(input.documentId, sectionRef);
    const value = {
      status: resolved.status,
      count: resolved.status === "AMBIGUOUS" ? resolved.candidates.length : resolved.status === "UNIQUE" ? 1 : 0,
    };
    resolutionCache.set(sectionRef, value);
    return value;
  }

  function rowFor(nodeId: string, excerptNeedle: RegExp, includeBareRef: boolean): DevelopmentWindowRow | null {
    const node = index.getNodeById(nodeId);
    if (!node) return null;
    const ownText = index.getNodeText(nodeId, "OWN");
    const observed = observeDeterministicCrossCutText(ownText);
    const supersession = getNodeSupersessionStatus(EMPTY_SUPERSESSION_INDEX, input.documentId, nodeId);
    const ref = includeBareRef ? bareRef(node.sectionRef) : null;
    return {
      sectionRef: node.sectionRef,
      heading: node.heading,
      nodeType: node.nodeType,
      nodeId: node.nodeId,
      charStart: node.charStart,
      charEnd: node.charEnd,
      ownChars: ownText.length,
      passASignals: signalsByNodeId.get(nodeId) ?? [],
      builderHeuristic: observed.builderHeuristic,
      reclassificationHeuristic: observed.reclassificationHeuristic,
      supersessionStatus: supersession.status,
      bareRefResolution: ref?.status ?? null,
      bareRefCandidateCount: ref?.count ?? null,
      discoveryId: null,
      sealedRole: null,
      family: null,
      excerpt: excerptAround(ownText, excerptNeedle),
    };
  }

  const builderRows: DevelopmentWindowRow[] = [];
  for (const candidate of deterministic) {
    if (!candidate.signals.includes("builder_language")) continue;
    const row = rowFor(candidate.nodeId, /\b(?:builder basket|Available Amount|cumulative|Retained Excess Cash Flow|builder|grower)\b/i, false);
    if (row) builderRows.push(row);
  }

  const reclassRows: DevelopmentWindowRow[] = [];
  for (const node of index.allNodes()) {
    if (node.documentId !== input.documentId) continue;
    const ownText = index.getNodeText(node.nodeId, "OWN");
    if (!observeDeterministicCrossCutText(ownText).reclassificationHeuristic) continue;
    const row = rowFor(node.nodeId, /\b(?:reclassif(?:y|ication)|re[- ]characterize|anti[- ]duplication)\b/i, false);
    if (row) reclassRows.push(row);
  }

  const assetRows: DevelopmentWindowRow[] = [];
  for (const node of index.allNodes()) {
    if (node.documentId !== input.documentId || node.nodeType !== "SECTION") continue;
    if (!isAssetDispositionHeading(node.heading)) continue;
    const row = rowFor(node.nodeId, /\b(?:Dispositions?|Asset Sales?)\b/i, true);
    if (row) assetRows.push(row);
  }

  const candidateIds = new Set(deterministic.map((candidate) => candidate.nodeId));
  const passBSections: SectionBatchInput[] = [];
  const structuralSections = index.allNodes().filter((node) => node.documentId === input.documentId && node.nodeType === "SECTION");
  for (const section of structuralSections) {
    const descendantIds = index.getDescendants(section.nodeId).map((descendant) => descendant.nodeId);
    const hasCandidate = candidateIds.has(section.nodeId) || descendantIds.some((id) => candidateIds.has(id));
    if (!hasCandidate) continue;
    const sectionResolution = resolveReferenceTarget(index, input.documentId, section.sectionRef);
    if (sectionResolution.status === "UNIQUE_AFTER_DEGENERATE_EXCLUSION" && sectionResolution.excludedDegenerateNodeIds.includes(section.nodeId)) continue;
    const passAHints = [section.nodeId, ...descendantIds]
      .filter((id) => candidateIds.has(id))
      .map((id) => index.getNodeById(id)?.sectionRef ?? id)
      .filter((ref) => ref !== section.sectionRef);
    passBSections.push({
      documentId: input.documentId,
      sectionNodeKey: section.nodeKey,
      sectionNodeId: section.nodeId,
      sectionRef: section.sectionRef,
      heading: section.heading,
      text: index.getNodeText(section.nodeId, "DESCENDANTS"),
      passAHints,
    });
  }
  const systemPrompt = passBSystemPrompt();
  let expectedMaxCostUsd = 0;
  for (const batch of passBSections) {
    const user = buildPassBUserContent(batch);
    const maxInputTokens = reservedMaxInputTokens(systemPrompt.length + user.length);
    const callMax = maxCostOfRequestUsd({ maxInputTokens, maxOutputTokens: DEFAULT_MAX_TOKENS }, DEFAULT_GATEWAY_ANALYZER_MODEL);
    if (callMax === null) throw new Error(`No rate card for ${DEFAULT_GATEWAY_ANALYZER_MODEL}`);
    expectedMaxCostUsd += callMax;
  }
  expectedMaxCostUsd = Number(expectedMaxCostUsd.toFixed(2));

  const basketPhrase = "Available Amount Builder Basket";
  const citedRef = "7.05(a)(y)";
  const citedResolved = resolveReferenceTarget(index, input.documentId, citedRef);
  const owningNodes = index
    .allNodes()
    .filter((node) => node.documentId === input.documentId && index.getNodeText(node.nodeId, "OWN").includes(basketPhrase))
    .map((node) => {
      const ownText = index.getNodeText(node.nodeId, "OWN");
      return {
        sectionRef: node.sectionRef,
        nodeId: node.nodeId,
        ownChars: ownText.length,
        excerpt: excerptAround(ownText, /Available Amount Builder Basket/),
      };
    });
  const reclassWindows = reclassRows.map((row) => {
    const ownText = index.getNodeText(row.nodeId, "OWN");
    return {
      sectionRef: row.sectionRef,
      nodeId: row.nodeId,
      ownChars: row.ownChars,
      mentionsSectionRef: /\bSection\s+\d+\.\d+/.test(ownText),
      excerpt: row.excerpt,
    };
  });
  const asset704 = resolveReferenceTarget(index, input.documentId, "7.04");
  const assetCandidates = asset704.candidateNodeIds
    .map((nodeId) => index.getNodeById(nodeId))
    .filter((node): node is NonNullable<typeof node> => node !== null);

  const provider = realProvider();
  let passB: DevelopmentPipelineResult["passB"];
  let passC: DevelopmentPipelineResult["passC"];
  let passD: DevelopmentPipelineResult["passD"];
  let discoveredCandidates: DevelopmentPipelineResult["discoveredCandidates"] = [];
  let providerScopedCandidates: DevelopmentPipelineResult["providerScopedCandidates"] = [];
  let discoveryIdsMinted = false;
  let semanticRolesAssigned = false;
  let providerExecutionRequired: DevelopmentPipelineResult["providerExecutionRequired"] = null;
  if (!provider) {
    passB = { executed: false, terminal: "PROVIDER_EXECUTION_REQUIRED", syntheticInvented: false };
    passC = { executed: false, reason: "Pass C expands Pass B semantic items. Pass B did not run." };
    passD = { executed: false, reason: "Pass D reconciles Pass C candidates. Pass B did not run." };
    providerExecutionRequired = {
      code: "PROVIDER_EXECUTION_REQUIRED",
      provider: "VERCEL_AI_GATEWAY",
      model: DEFAULT_GATEWAY_ANALYZER_MODEL,
      command: input.passBCommand,
      workflow: "getStageCaller selects VERCEL_AI_GATEWAY when AI_GATEWAY_API_KEY is set (ANTHROPIC_API_KEY is the direct fallback; neither key is set here). Model is DEFAULT_GATEWAY_ANALYZER_MODEL unless ANALYZER_MODEL is set. runDiscoveryPipeline then calls runPassBSemanticClassification once per Pass A section (stage covenant_discovery_section). Pass C and Pass D run in that same call after real Pass B items return. SyntheticStageCaller is not used.",
      expectedMaxCostUsd,
      pricingTableVersion: PRICING_TABLE_VERSION,
      maxOutputTokensPerCall: DEFAULT_MAX_TOKENS,
      sectionsToCall: passBSections.length,
      pipelineStageUnlocked: "PASS_B_SEMANTIC_CLASSIFICATION",
    };
  } else {
    const caller = getStageCaller();
    if (caller.isSynthetic) {
      throw new Error("Refusing synthetic Pass B. A real provider key was expected and the caller is synthetic.");
    }
    const discovery = await runDiscoveryPipeline(caller, input.documentId, index, EMPTY_SUPERSESSION_INDEX);
    passB = {
      executed: true,
      terminal: "PASS_B_REAL_PROVIDER",
      providerName: caller.providerName,
      model: caller.model,
      syntheticInvented: false,
      modelCalls: discovery.summary.modelCalls,
      sectionFailures: discovery.summary.sectionFailures.length,
      finalCandidateCount: discovery.summary.finalCandidateCount,
      inputTokens: discovery.summary.inputTokens,
      outputTokens: discovery.summary.outputTokens,
    };
    discoveredCandidates = discovery.candidates.map((candidate) => ({
      discoveryId: candidate.discoveryId,
      role: candidate.role,
      families: [...candidate.families],
      normalizedSourceRef: candidate.normalizedSourceRef,
      structuralNodeIds: [...candidate.structuralNodeIds],
      description: candidate.description,
      banner: DEVELOPMENT_BANNER,
      certified: false as const,
      pinnedOffline: false as const,
    }));
    passC = { executed: true, reason: "Pass C ran inside runDiscoveryPipeline on real Pass B items." };
    passD = { executed: true, reason: "Pass D ran inside runDiscoveryPipeline on real Pass C candidates." };
    providerScopedCandidates = discovery.candidates
      .filter((candidate) => candidate.role === "BUILDER" || candidate.families.includes("ASSET_SALES") || candidate.families.includes("DISPOSITIONS"))
      .map((candidate) => ({
        discoveryId: candidate.discoveryId,
        role: candidate.role,
        families: [...candidate.families],
        normalizedSourceRef: candidate.normalizedSourceRef,
        structuralNodeIds: [...candidate.structuralNodeIds],
        banner: DEVELOPMENT_BANNER,
        certified: false as const,
        pinnedOffline: false as const,
      }));
    discoveryIdsMinted = discovery.candidates.length > 0;
    semanticRolesAssigned = discovery.candidates.length > 0;
  }

  return {
    banner: DEVELOPMENT_BANNER,
    designation: "DEVELOPMENT",
    certified: false,
    pinnedOffline: false,
    eligibleClaimed: false,
    matrixCellSelected: false,
    pinWritten: false,
    readyToPinInvented: false,
    stage1MarkerInvented: false,
    phase3PercentRaised: false,
    discoveryIdsMinted,
    semanticRolesAssigned,
    frozenSha256,
    frozenHashMatches,
    documentId: input.documentId,
    label: input.label,
    offline: {
      structuredFrom,
      htmlParseMatchesExtractedText,
      extractedTextSha256: sha256(extractedText),
      provenanceExtractedTextSha256: provenance.extractedTextSha256 ?? null,
      extractedTextMatchesProvenance: sha256(extractedText) === provenance.extractedTextSha256,
      htmlBodySha256: sha256(rawHtml),
      provenanceBodySha256: provenance.bodySha256 ?? null,
      htmlBodyMatchesProvenance: sha256(rawHtml) === provenance.bodySha256,
      parsedChars: text.length,
      chunkCount: chunks.length,
      chunksWithSectionRef: chunks.filter((chunk) => chunk.sectionRef !== null).length,
      totalNodes: nodes.length,
      definitionsDetected: definitions.length,
      referencesDetected: references.length,
      referencesResolved: references.filter((reference) => reference.resolved).length,
      referencesUnresolved: references.filter((reference) => !reference.resolved && !reference.targetAmbiguous).length,
      referencesAmbiguous: references.filter((reference) => reference.targetAmbiguous).length,
      passACandidates: deterministic.length,
      passASignalCounts,
      healthFindings: index.healthDiagnostics().length,
      supersessionIndex: "EMPTY",
    },
    passB,
    passC,
    passD,
    providerExecutionRequired,
    investigations: {
      builderBasket: {
        phrase: basketPhrase,
        citedRef,
        citedRefResolution: citedResolved.status,
        citedRefCandidateCount: citedResolved.candidateNodeIds.length,
        owningNodes,
        discoveryId: null,
        sealedRole: null,
      },
      reclass: {
        edgeWritten: false,
        categoryToTargetRuleIdInvented: false,
        windows: reclassWindows,
      },
      assetDispositions704: {
        sectionRef: "7.04",
        resolution: asset704.status,
        selected: false,
        resolvedNodeId: asset704.node?.nodeId ?? null,
        excludedDegenerateNodeIds: asset704.excludedDegenerateNodeIds,
        candidates: assetCandidates.map((node) => ({
          nodeId: node.nodeId,
          heading: node.heading,
          charStart: node.charStart,
          charEnd: node.charEnd,
          ownedChars: node.charEnd - node.charStart,
        })),
      },
    },
    discoveredCandidates,
    providerScopedCandidates,
    crossCutRead: readCrossCuts(discoveredCandidates, owningNodes.map((node) => node.nodeId), reclassWindows.map((window) => window.nodeId), assetCandidates.map((node) => node.nodeId)),
    verificationReservation: reserveVerification(discoveredCandidates.length),
    paths: {
      builder: {
        stage: "PASS_A_BUILDER_LANGUAGE_PLUS_CROSS_CUT_TEXT_HEURISTIC",
        sealedRole: null,
        crossCutClaimed: false,
        rows: builderRows,
      },
      reclass: {
        stage: "CROSS_CUT_RECLASS_TEXT_HEURISTIC",
        sealedRole: null,
        crossCutClaimed: false,
        rows: reclassRows,
      },
      assetDispositions: {
        stage: "PASS_A_HEADLINE_DISPOSITION_HEADING",
        familyAssigned: false,
        stratum: null,
        crossCutClaimed: false,
        rows: assetRows,
      },
    },
  };
}
