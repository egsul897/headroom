/**
 * Issuer-agnostic offline package compilation entry point.
 *
 * Reuses production libraries (structure → package-graph → amendment → discovery →
 * definition-exception catalogs → context retrieval → deterministic fact extraction →
 * local-semantic compile → independent coverage audit → verified-execution handoff).
 *
 * Does NOT:
 * - write Neon / production DB
 * - call paid inference unless explicitly authorized
 * - hardcode issuer names, tickers, or provision IDs
 * - claim executable authority for unverified / incomplete units
 * - invent modeled formula types for unsupported semantics
 */
import { createHash } from "node:crypto";
import { parseDocumentStructure } from "../compiler/stage-structure";
import { buildStructuralIndex, type StructuralIndex } from "../compiler/structural-index";
import { detectStructuralDefinitions } from "../compiler/structural-definitions";
import { detectStructuralReferences } from "../compiler/structural-references";
import { buildPackageGraph } from "../compiler/package-graph/pipeline";
import type { PackageDocumentInput, PackageGraphResult } from "../compiler/package-graph/types";
import { runAmendmentPipeline } from "../compiler/amendment/pipeline";
import {
  buildNodeSupersessionIndex,
  computeOperativeContractState,
  EMPTY_SUPERSESSION_INDEX,
} from "../compiler/amendment/operative-state";
import type { OperativeContractState, NodeSupersessionIndex } from "../compiler/amendment/types";
import { runDiscoveryPipeline } from "../compiler/discovery/pipeline";
import { runPassADeterministicSignals } from "../compiler/discovery/pass-a-signals";
import {
  discoverDefinitionExceptionCatalogs,
  discoverProhibitionToPermittedLinks,
  discoverSectionExceptionCatalogs,
  type ExceptionCatalogDiscovery,
} from "../compiler/discovery/definition-exception-catalog";
import type { DiscoveredCandidate } from "../compiler/discovery/types";
import { getStageCaller, type StageCaller } from "../compiler/llm-caller";
import { buildCovenantContextBundle, type PackageAccess } from "../compiler/context-retrieval/pipeline";
import { operativeSourceTextFor } from "../compiler/candidate-span";
import { isEligibleForSemanticCompilation } from "../compiler/semantic/package-compile";
import { extractDeterministicCovenantFacts } from "../compiler/deterministic-extraction";
import { compileLocalSemanticUnit } from "../compiler/local-semantic/compile-local";
import { runIndependentCoverageAudit } from "../compiler/coverage-audit/pipeline";
import {
  evaluateVerifiedCapacity,
  type VerifiedCapacityResult,
} from "../verified-execution";
import type { CovenantContextBundle } from "../compiler/context-retrieval/types";
import {
  compileFixedDollarBasket,
  evaluateFixedDollarCapacity,
  type FixedDollarCapacityEval,
  type FixedDollarCompileResult,
} from "../compiler/fixed-dollar-basket";
import {
  compileGreaterOfAssetsBasket,
  compileGreaterOfSharedPair,
  evaluateGreaterOfCapacity,
  type GreaterOfCapacityEval,
  type GreaterOfCompileResult,
} from "../compiler/greater-of-assets-basket";
import {
  buildOperativeHandoffBundle,
  type OperativeHandoffBundle,
} from "../compiler/package-graph/operative-handoff";
import {
  isLegallyConfirmedAmendmentChain,
  mayConsolidateOperativeAgreement,
} from "../compiler/package-graph/instrument-grouping";
import {
  bindCandidateToOperativeRetrievalSource,
  buildOperativeAuthorityHandoffBundle,
  confirmedIdentityFromInstrumentGrouping,
  summarizeBundleProductionAuthority,
  type BundleProductionAuthoritySummary,
  type OperativeAuthorityHandoffBundle,
  type OperativeRetrievalSourceBinding,
} from "../compiler/operative-authority";

export const OFFLINE_PACKAGE_COMPILE_VERSION = "offline-package-compile.v1";

export type RepresentationSupportStatus =
  | "SUPPORTED_STRUCTURE"
  | "PARTIAL"
  | "AMBIGUOUS"
  | "UNSUPPORTED_SEMANTICS"
  | "UNVERIFIED"
  | "REFUSED_EXECUTABLE";

export interface OfflinePackageDocument {
  documentId: string;
  label: string;
  text: string;
}

export interface OfflinePackageCompileOptions {
  companyId: string;
  packageKey: string;
  /** Defaults to first CREDIT_AGREEMENT instrument or first document. */
  instrumentKey?: string;
  documents: OfflinePackageDocument[];
  /** When true and credentials exist, Pass B / semantic callers may be live. Default false. */
  authorizePaidInference?: boolean;
  authorizationRef?: string | null;
  /** Inject callers for tests. */
  discoveryCaller?: StageCaller;
  amendmentCaller?: StageCaller;
  asOfDate?: string;
}

export interface CompileUnitRepresentation {
  unitId: string;
  discoveryId: string;
  documentId: string;
  sourceRef: string;
  role: string;
  families: string[];
  description: string;
  operativeText: string;
  operativeTextSha256: string;
  sourceSpan: { charStart: number | null; charEnd: number | null };
  supportStatus: RepresentationSupportStatus;
  capsAndThresholds: { excerpt: string; kind: string }[];
  ratioMentions: string[];
  entityMentions: string[];
  crossReferences: string[];
  definedTermDependencies: string[];
  debtLienLinks: { kind: string; target: string; excerpt: string }[];
  contextBundleSummary: {
    itemCount: number;
    unresolvedDependencies: number;
    sufficiencyState: string | null;
  } | null;
  deterministicFactCount: number;
  localCompileStatus: string;
  /**
   * Default REFUSED. Fixed-dollar / greater-of vertical slices may set
   * VERIFIED_EXECUTABLE after independent fidelity PASS on generalized IR.
   * Production capacity remains separately refused.
   */
  executableAuthority: "REFUSED" | "VERIFIED_EXECUTABLE";
  fixedDollarSlice: {
    classification: string;
    compileClass: string;
    fidelityVerdict: string | null;
    capacityOutcome: string | null;
    availableAmountUsd: number | null;
    productionRefusal: string | null;
  } | null;
  greaterOfSlice: {
    classification: string;
    compileClass: string;
    fidelityVerdict: string | null;
    capacityOutcome: string | null;
    availableAmountUsd: number | null;
    metricName: string | null;
    fixedAmountUsd: number | null;
    percentFraction: number | null;
    productionRefusal: string | null;
    sharedCapacity: boolean;
  } | null;
  provenance: {
    discoveryMethods: string[];
    evidenceSignals: string[];
    offlineCompileVersion: string;
  };
}

export interface OfflinePackageCompileResult {
  version: string;
  companyId: string;
  packageKey: string;
  instrumentKey: string;
  paidInferenceUsed: boolean;
  stages: {
    structural: { nodeCount: number; definitionCount: number; referenceCount: number };
    packageGraph: { documentCount: number; relationshipCount: number; classifications: { documentId: string; type: string }[] };
    amendment: { effectCount: number };
    discovery: {
      passACount: number;
      pipelineCandidateCount: number;
      exceptionCatalogCount: number;
      exceptionClauseCount: number;
      prohibitionLinkCount: number;
      totalCandidates: number;
      syntheticDiscovery: boolean;
    };
    context: {
      bundlesBuilt: number;
      /** Agent #7 → #6: candidates remapped onto governingDocumentId for retrieval. */
      operativeSourceRemapped: number;
      /** Candidates kept on discovery document because authority refused consolidation. */
      operativeSourceRemapRefused: number;
      /** Candidates already on the governing document (no remap needed). */
      operativeSourceAlreadyGoverning: number;
    };
    coverageAudit: { findingCount: number; regionCount: number } | null;
    capacityHandoff: { attempted: boolean; outcome: string; detail: string };
    operativeHandoff: {
      instrumentKey: string;
      identityConfirmed: boolean;
      mayConsolidateOperative: boolean;
      provisionCount: number;
      confirmedOperativeCount: number;
      provisionalBlockedCount: number;
      authorityGate: "CONFIRMED_OPERATIVE_IDENTITY" | "PROVISIONAL_IDENTITY_BLOCKED" | "NO_OPERATIVE_STATE";
    };
    /** Agent #7 restatement / governing-document authority (additive; never mutates package graph). */
    operativeRestatementAuthority: {
      verdict: OperativeAuthorityHandoffBundle["verdict"] | "NOT_BUILT";
      provisionCount: number;
      restatementAuthorityCount: number;
      packageGraphRelationshipsUnchanged: boolean;
      productionAuthorityActive: boolean;
      anyCaveatedDisclosedOnly: boolean;
      anyProductionRefused: boolean;
      effectivenessInference: string | null;
      conditionsPrecedentSatisfaction: string | null;
    };
    fixedDollarVerticalSlice: {
      attempted: number;
      verifiedExecutable: number;
      productionCapacityRefused: number;
    };
    greaterOfVerticalSlice: {
      attempted: number;
      verifiedExecutable: number;
      productionCapacityRefused: number;
      sharedCapacityPairs: number;
    };
  };
  exceptionCatalogs: ExceptionCatalogDiscovery[];
  candidates: DiscoveredCandidate[];
  units: CompileUnitRepresentation[];
  fixedDollarResults: {
    sourceRef: string;
    compile: FixedDollarCompileResult;
    evaluation: FixedDollarCapacityEval;
  }[];
  greaterOfResults: {
    sourceRef: string;
    compile: GreaterOfCompileResult;
    evaluation: GreaterOfCapacityEval;
  }[];
  greaterOfSharedPairs: {
    refA: string;
    refB: string;
    shared: boolean;
    evidence: string[];
    sharedCapId: string | null;
  }[];
  /** HEADROOM-3 → HEADROOM-1 operative identity handoff (confirmed vs provisional). */
  operativeHandoff: OperativeHandoffBundle | null;
  /**
   * Agent #7 → Agent #6 / unified execution: governing-document + restatement
   * authority with caveats. Never strips source identity, effective dates, or
   * CP-satisfaction disclosures. Never mutates package-graph edges.
   */
  operativeAuthorityHandoff: OperativeAuthorityHandoffBundle | null;
  /** Production-authority disposition derived from operativeAuthorityHandoff. */
  productionAuthorityFromRestatement: BundleProductionAuthoritySummary | null;
  humanInterventions: { kind: string; detail: string }[];
  summary: {
    supportedStructureUnits: number;
    partialUnits: number;
    unsupportedUnits: number;
    unverifiedUnits: number;
    refusedExecutableUnits: number;
    verifiedExecutableUnits: number;
    falseExecutableClassifications: number;
  };
}

function sha256(s: string): string {
  return createHash("sha256").update(s).digest("hex");
}

function pickInstrumentKey(packageGraph: PackageGraphResult, documents: OfflinePackageDocument[], explicit?: string): string {
  if (explicit) return explicit;
  const credit = packageGraph.classifications.find((c) => c.type === "CREDIT_AGREEMENT" || c.type === "AMENDED_AND_RESTATED_AGREEMENT");
  if (credit) return `instrument:${credit.documentId}`;
  const grouped = packageGraph.instruments[0];
  if (grouped) return grouped.instrumentKey;
  return `instrument:${documents[0]!.documentId}`;
}

function extractCaps(text: string): { excerpt: string; kind: string }[] {
  const out: { excerpt: string; kind: string }[] = [];
  const dollar = text.match(/\$\s?[\d,]+(?:\.\d+)?(?:\s*(?:million|billion))?/gi) ?? [];
  for (const d of dollar.slice(0, 8)) out.push({ excerpt: d, kind: "DOLLAR_THRESHOLD" });
  const pct = text.match(/\b\d+(?:\.\d+)?\s*%/g) ?? [];
  for (const p of pct.slice(0, 4)) out.push({ excerpt: p, kind: "PERCENTAGE" });
  const ratio = text.match(/\b\d+(?:\.\d+)?\s*(?:to\s*1(?:\.0+)?|x)\b/gi) ?? [];
  for (const r of ratio.slice(0, 4)) out.push({ excerpt: r, kind: "RATIO_THRESHOLD" });
  const greater = text.match(/\b(?:greater|lesser)\s+of\b[^.|;]{0,120}/gi) ?? [];
  for (const g of greater.slice(0, 3)) out.push({ excerpt: g.trim(), kind: "GREATER_LESSER_OF" });
  return out;
}

function debtLienLinksFromText(text: string): { kind: string; target: string; excerpt: string }[] {
  const links: { kind: string; target: string; excerpt: string }[] = [];
  // Tolerate EDGAR spacing/quotes inside "definition of " Permitted X ""
  const re =
    /\bclause\s*\(([a-z0-9]+)\)\s+of\s+the\s+definition\s+of\s+[“"']?[\s\u00a0\u202f]*(Permitted\s+[A-Z][A-Za-z]+(?:\s+[A-Z][A-Za-z]+)*)[\s\u00a0\u202f]*[”"']?/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    links.push({
      kind: "DEFINITION_CLAUSE_CROSS_REF",
      target: `${m[2]}(${m[1]})`,
      excerpt: m[0],
    });
  }
  // Section-style debt↔lien ties
  const secRe = /\b(?:permitted\s+under|pursuant to)\s+Section\s*(\d+\.\d+)\(([a-z0-9]+)\)/gi;
  while ((m = secRe.exec(text)) !== null) {
    links.push({
      kind: "SECTION_CLAUSE_CROSS_REF",
      target: `Section ${m[1]}(${m[2]})`,
      excerpt: m[0],
    });
  }
  if (/\bPermitted\s+Liens\b/i.test(text) && /\bPermitted\s+(?:Debt|Indebtedness)\b/i.test(text)) {
    links.push({
      kind: "DEBT_LIEN_COMENTION",
      target: "Permitted Debt/Indebtedness ↔ Permitted Liens",
      excerpt: "co-mention in unit text",
    });
  }
  if (/\bCollateral\b/i.test(text) && /\bSecured\s+(?:Debt|Indebtedness)\b/i.test(text)) {
    links.push({
      kind: "SECURED_COLLATERAL_LINK",
      target: "Secured Debt / Collateral",
      excerpt: "Secured Debt + Collateral co-mention",
    });
  }
  if (/\bMaximum Facility Amount\b/i.test(text)) {
    links.push({
      kind: "FACILITY_CAP_DEPENDENCY",
      target: "Maximum Facility Amount",
      excerpt: "Maximum Facility Amount",
    });
  }
  if (/\bFacility Amount\b/i.test(text) && !/\bMaximum Facility Amount\b/i.test(text.replace(/Maximum Facility Amount/gi, ""))) {
    // Facility Amount mentioned outside the Maximum Facility Amount phrase
    if (/(?<!Maximum )Facility Amount\b/i.test(text)) {
      links.push({
        kind: "FACILITY_CAP_DEPENDENCY",
        target: "Facility Amount",
        excerpt: "Facility Amount",
      });
    }
  } else if (/(?<!Maximum )Facility Amount\b/.test(text)) {
    links.push({
      kind: "FACILITY_CAP_DEPENDENCY",
      target: "Facility Amount",
      excerpt: "Facility Amount",
    });
  }
  if (/\bdifference between\b/i.test(text) && /\bFacility Amount\b/i.test(text)) {
    links.push({
      kind: "FORMULA_DIFFERENCE_DEPENDENCY",
      target: "difference between facility-capacity terms",
      excerpt: "difference between … Facility Amount",
    });
  }
  return links;
}

function supportStatusForUnit(args: {
  catalogStatus?: ExceptionCatalogDiscovery["supportStatus"];
  operativeText: string;
  localStatus: string;
  hasUnresolvedContext: boolean;
}): RepresentationSupportStatus {
  if (args.localStatus !== "DETERMINISTIC" && args.localStatus !== "OK") {
    return "UNSUPPORTED_SEMANTICS";
  }
  // Deterministic local compile never produces verified executable IR.
  if (args.hasUnresolvedContext) return "PARTIAL";
  if (args.catalogStatus === "SUPPORTED_STRUCTURE") return "SUPPORTED_STRUCTURE";
  if (args.catalogStatus === "PARTIAL_STRUCTURE") return "PARTIAL";
  if (args.operativeText.trim().length < 20) return "AMBIGUOUS";
  return "UNVERIFIED";
}

export async function compileFrozenDebtPackage(
  options: OfflinePackageCompileOptions,
): Promise<OfflinePackageCompileResult> {
  const humanInterventions: { kind: string; detail: string }[] = [];
  const asOfDate = options.asOfDate ?? new Date().toISOString().slice(0, 10);
  const documents: PackageDocumentInput[] = options.documents.map((d) => ({
    documentId: d.documentId,
    label: d.label,
    text: d.text,
  }));

  // --- structural ---
  const nodesByDocument = new Map<string, { text: string; nodes: ReturnType<typeof parseDocumentStructure> }>();
  const allDefinitions = [];
  const allReferences = [];
  for (const doc of documents) {
    const nodes = parseDocumentStructure({ documentId: doc.documentId, label: doc.label, text: doc.text });
    nodesByDocument.set(doc.documentId, { text: doc.text, nodes });
    allDefinitions.push(...detectStructuralDefinitions(doc.documentId, doc.text, nodes));
    allReferences.push(...detectStructuralReferences(doc.documentId, doc.text, nodes));
  }
  const index: StructuralIndex = buildStructuralIndex(nodesByDocument, allDefinitions, allReferences);

  // --- package graph ---
  const packageGraph = buildPackageGraph(options.companyId, options.packageKey, documents);
  const instrumentKey = pickInstrumentKey(packageGraph, options.documents, options.instrumentKey);

  const exactTermsByDocument = new Map<string, Map<string, string>>();
  for (const def of allDefinitions) {
    if (!exactTermsByDocument.has(def.documentId)) exactTermsByDocument.set(def.documentId, new Map());
    exactTermsByDocument.get(def.documentId)!.set(def.normalizedTerm, def.exactTerm);
  }

  // --- amendment / operative ---
  const amendmentCaller = options.amendmentCaller ?? getStageCaller();
  const amendmentResult = await runAmendmentPipeline(amendmentCaller, { documents, packageGraph, index });
  const baseDocumentId =
    packageGraph.instruments.find((i) => i.instrumentKey === instrumentKey)?.baseDocumentId
    ?? packageGraph.classifications.find((c) => c.type === "CREDIT_AGREEMENT" || c.type === "AMENDED_AND_RESTATED_AGREEMENT")?.documentId
    ?? documents[0]!.documentId;
  const unresolvedTargetEffectsForThisInstrument = amendmentResult.effects.filter((e) => e.target.targetInstrumentKey === null);
  const operativeState: OperativeContractState | null = computeOperativeContractState({
    instrumentKey,
    baseDocumentId,
    asOfDate,
    index,
    allEffects: amendmentResult.effects,
    unresolvedTargetEffectsForThisInstrument,
  });
  const supersessionIndex: NodeSupersessionIndex =
    operativeState ? buildNodeSupersessionIndex([{ baseDocumentId, state: operativeState }]) : EMPTY_SUPERSESSION_INDEX;

  // Snapshot package-graph relationships BEFORE Agent #7 authority evaluation —
  // Agent #7 must never silently rewrite edges (check #7).
  const packageGraphRelationshipsBeforeAuthority = JSON.stringify(packageGraph.relationshipCandidates);

  // --- HEADROOM-3 operative handoff (confirmed vs provisional identity) ---
  // Agent #1 compiler consumes confirmed operative document identity rather than
  // provisional identity. Provisional associations fail closed for executable claims.
  const operativeHandoff: OperativeHandoffBundle | null = operativeState
    ? buildOperativeHandoffBundle({
        packageGraph,
        asOfDate,
        operativeStates: [operativeState],
      })
    : null;
  const instrumentGrouping = packageGraph.instruments.find((i) => i.instrumentKey === instrumentKey) ?? null;
  const identityConfirmed =
    instrumentGrouping != null &&
    isLegallyConfirmedAmendmentChain(instrumentGrouping) &&
    mayConsolidateOperativeAgreement(instrumentGrouping) &&
    (instrumentGrouping.provisionalDocumentIds?.length ?? 0) === 0;
  const provisionalBlockedCount =
    operativeHandoff?.provisions.filter((p) => p.authorityClassification === "PROVISIONAL_IDENTITY_BLOCKED").length ?? 0;
  const confirmedOperativeCount =
    operativeHandoff?.provisions.filter((p) => p.authorityClassification === "CONFIRMED_OPERATIVE").length ?? 0;
  // Fail closed only when the package graph marks the instrument provisional or the
  // handoff explicitly blocks provisions. A missing instrument grouping (single-doc
  // edge) does not by itself invent provisional identity.
  const operativeAuthorityGate: OfflinePackageCompileResult["stages"]["operativeHandoff"]["authorityGate"] =
    !operativeState
      ? "NO_OPERATIVE_STATE"
      : provisionalBlockedCount > 0 || (instrumentGrouping != null && !identityConfirmed)
        ? "PROVISIONAL_IDENTITY_BLOCKED"
        : "CONFIRMED_OPERATIVE_IDENTITY";
  if (operativeAuthorityGate === "PROVISIONAL_IDENTITY_BLOCKED") {
    humanInterventions.push({
      kind: "OPERATIVE_IDENTITY_GATE",
      detail:
        "Canonical instrument identity is not confirmed (or provisions are PROVISIONAL_IDENTITY_BLOCKED); executable vertical-slice authority refused.",
    });
  }

  // --- Agent #7 restatement / governing-document authority (additive) ---
  // Consumes #274 confirmed identity when available. Does not rewrite package graph.
  const confirmedInstrumentIdentity = instrumentGrouping
    ? confirmedIdentityFromInstrumentGrouping(instrumentGrouping)
    : null;

  // --- discovery ---
  const discoveryCaller = options.discoveryCaller ?? getStageCaller();
  const syntheticDiscovery = discoveryCaller.isSynthetic || !options.authorizePaidInference;
  if (syntheticDiscovery) {
    humanInterventions.push({
      kind: "DISCOVERY_MODE",
      detail: "Pass B semantic discovery running synthetic/unpaid — definition-exception catalog + Pass A supply deterministic candidates",
    });
  }

  const passA = documents.flatMap((d) => runPassADeterministicSignals(d.documentId, index, supersessionIndex));
  let pipelineCandidates: DiscoveredCandidate[] = [];
  if (!syntheticDiscovery) {
    for (const doc of documents) {
      const result = await runDiscoveryPipeline(discoveryCaller, doc.documentId, index, supersessionIndex);
      pipelineCandidates.push(...result.candidates);
    }
  } else {
    // Still invoke pipeline once so wiring is exercised; synthetic Pass B yields empty semantics.
    for (const doc of documents) {
      const result = await runDiscoveryPipeline(discoveryCaller, doc.documentId, index, supersessionIndex);
      pipelineCandidates.push(...result.candidates);
    }
  }

  const definitionCatalogs = discoverDefinitionExceptionCatalogs(
    index,
    allDefinitions,
    documents.map((d) => d.documentId),
  );
  const sectionCatalogs = discoverSectionExceptionCatalogs(
    index,
    documents.map((d) => d.documentId),
  );
  const exceptionCatalogs = [...definitionCatalogs, ...sectionCatalogs];
  const prohibitionLinks = discoverProhibitionToPermittedLinks(
    index,
    documents.map((d) => d.documentId),
  );
  const catalogCandidates = exceptionCatalogs.flatMap((c) => c.candidates);

  // Merge candidates by discoveryId (catalog + prohibition + pipeline).
  const byId = new Map<string, DiscoveredCandidate>();
  for (const c of [...pipelineCandidates, ...prohibitionLinks, ...catalogCandidates]) {
    if (!byId.has(c.discoveryId)) byId.set(c.discoveryId, c);
  }
  const candidates = [...byId.values()].filter((c) => isEligibleForSemanticCompilation(c).eligible);

  // Build Agent #7 handoff for discovered section/definition refs (Agent #6 / execution consumers).
  const provisionQueries: Array<{ sectionRef?: string | null; definedTermRef?: string | null }> = [];
  const seenProvisionKeys = new Set<string>();
  for (const c of candidates) {
    const defMatch = /^def:([^(]+)/i.exec(c.normalizedSourceRef);
    if (defMatch) {
      const term = defMatch[1]!.trim();
      const key = `DEFINITION::${term}`;
      if (!seenProvisionKeys.has(key)) {
        seenProvisionKeys.add(key);
        provisionQueries.push({ definedTermRef: term });
      }
      continue;
    }
    const secMatch = /^(\d+\.\d+)/.exec(c.normalizedSourceRef);
    if (secMatch) {
      const sectionRef = secMatch[1]!;
      const key = `SECTION::${sectionRef}`;
      if (!seenProvisionKeys.has(key)) {
        seenProvisionKeys.add(key);
        provisionQueries.push({ sectionRef });
      }
    }
  }
  // Always include a whole-agreement probe so restatement succession is visible even when discovery is empty.
  if (provisionQueries.length === 0) {
    provisionQueries.push({});
  }

  const familyIds =
    confirmedInstrumentIdentity?.confirmedDocumentIds ??
    instrumentGrouping?.documentIds ??
    documents.map((d) => d.documentId);

  const operativeAuthorityHandoff: OperativeAuthorityHandoffBundle = buildOperativeAuthorityHandoffBundle({
    companyId: options.companyId,
    packageKey: options.packageKey,
    asOfDate,
    documents: documents.map((d) => ({ documentId: d.documentId, label: d.label, text: d.text })),
    packageGraph,
    provisions: provisionQueries,
    confirmedInstrumentIdentity,
    instrumentDocumentIds: familyIds,
    baseDocumentId,
  });

  const packageGraphRelationshipsUnchanged =
    JSON.stringify(packageGraph.relationshipCandidates) === packageGraphRelationshipsBeforeAuthority;

  // Attempted production promotion — caveated / provisional / conflicting authorities must refuse.
  const productionAuthorityFromRestatement = summarizeBundleProductionAuthority(operativeAuthorityHandoff, {
    attemptPromotionToProduction: true,
  });

  if (!packageGraphRelationshipsUnchanged) {
    humanInterventions.push({
      kind: "PACKAGE_GRAPH_MUTATION_GUARD",
      detail: "FATAL: package-graph relationshipCandidates changed during operative-authority evaluation — refusing production authority.",
    });
  }
  if (productionAuthorityFromRestatement.anyCaveatedDisclosedOnly) {
    humanInterventions.push({
      kind: "OPERATIVE_RESTATEMENT_CAVEAT",
      detail:
        "Restatement authority is CONFIRMED_OPERATIVE_WITH_CAVEATS or carries unproven conditions-precedent satisfaction — PRODUCTION_AUTHORITY_ACTIVE refused. Effectiveness is supported by contractual language + execution evidence only; CP satisfaction is not independently established.",
    });
  }
  if (productionAuthorityFromRestatement.anyProductionRefused && !productionAuthorityFromRestatement.allProvisionsProductionActive) {
    humanInterventions.push({
      kind: "OPERATIVE_RESTATEMENT_PRODUCTION_GATE",
      detail:
        "One or more provisions cannot authorize PRODUCTION_AUTHORITY_ACTIVE (provisional identity, conflict, review-required, not-yet-effective, unsupported, or caveated).",
    });
  }

  // --- context bundles (Agent #6 retrieval bound to Agent #7 governingDocumentId) ---
  const access: PackageAccess = {
    index,
    packageGraph,
    exactTermsByDocument,
    operativeState,
    supersessionIndex,
  };
  const retrievalBindings = new Map<string, OperativeRetrievalSourceBinding>();
  let operativeSourceRemapped = 0;
  let operativeSourceRemapRefused = 0;
  let operativeSourceAlreadyGoverning = 0;
  for (const candidate of candidates) {
    const binding = bindCandidateToOperativeRetrievalSource({
      candidate,
      authority: operativeAuthorityHandoff,
      index,
    });
    retrievalBindings.set(candidate.discoveryId, binding);
    if (binding.remapped) operativeSourceRemapped += 1;
    else if (binding.refusalReason) operativeSourceRemapRefused += 1;
    else if (binding.retrievalAuthorized && binding.governingDocumentId === binding.originalDocumentId) {
      operativeSourceAlreadyGoverning += 1;
    }
  }
  if (operativeSourceRemapRefused > 0) {
    humanInterventions.push({
      kind: "OPERATIVE_RETRIEVAL_SOURCE_BLOCKED",
      detail: `${operativeSourceRemapRefused} candidate(s) were not remapped onto a successor governing document (provisional identity, null governingDocumentId, or unresolved authority). Discovery document preserved; no silent consolidation.`,
    });
  }
  const bundles = new Map<string, CovenantContextBundle>();
  for (const candidate of candidates) {
    const binding = retrievalBindings.get(candidate.discoveryId)!;
    bundles.set(
      candidate.discoveryId,
      buildCovenantContextBundle(
        {
          candidate: binding.retrievalCandidate,
          packageKey: options.packageKey,
          companyId: options.companyId,
          instrumentKey,
        },
        access,
      ),
    );
  }

  // --- independent coverage audit ---
  let coverageAudit: OfflinePackageCompileResult["stages"]["coverageAudit"] = null;
  try {
    const audit = runIndependentCoverageAudit({
      companyId: options.companyId,
      packageKey: options.packageKey,
      instrumentKey,
      documentIds: documents.map((d) => d.documentId),
      index,
      candidates,
      packageGraph,
      bundles: [...bundles.values()],
      supersessionIndex,
    });
    coverageAudit = {
      findingCount: audit.findings.length,
      regionCount: audit.regions.length,
    };
  } catch (err) {
    humanInterventions.push({
      kind: "COVERAGE_AUDIT_ERROR",
      detail: err instanceof Error ? err.message : String(err),
    });
  }

  // Map discoveryId → catalog support
  const catalogStatusByDiscoveryId = new Map<string, ExceptionCatalogDiscovery["supportStatus"]>();
  for (const cat of exceptionCatalogs) {
    for (const c of cat.candidates) catalogStatusByDiscoveryId.set(c.discoveryId, cat.supportStatus);
  }

  // --- per-candidate representation + local compile (deterministic) ---
  const units: CompileUnitRepresentation[] = [];
  const fixedDollarResults: OfflinePackageCompileResult["fixedDollarResults"] = [];
  const greaterOfResults: OfflinePackageCompileResult["greaterOfResults"] = [];
  const greaterOfCandidates: {
    sourceRef: string;
    operativeText: string;
    documentId: string;
    discoveryId: string;
    families: string[];
  }[] = [];
  for (const candidate of candidates) {
    const bundle = bundles.get(candidate.discoveryId) ?? null;
    const retrievalBinding = retrievalBindings.get(candidate.discoveryId)!;
    const operativeCandidate = retrievalBinding.retrievalCandidate;
    const operativeDocumentId = operativeCandidate.documentId;
    let operativeText = operativeSourceTextFor(operativeCandidate, index, operativeState);
    // For definition catalog clauses, operativeSourceTextFor may be empty if no node ids —
    // fall back to candidate description's catalog clause text from exception catalogs.
    if (!operativeText.trim()) {
      const sectionTerm = (term: string) => term.replace(/^Section\s+/i, "");
      for (const cat of exceptionCatalogs) {
        // Exact clause refs only — never match across catalogs by marker alone
        // (previously Liens(d) incorrectly bound to Debt(d)).
        const markerMatch = candidate.normalizedSourceRef.match(/\(([a-z0-9]+)\)$/i);
        const marker = markerMatch?.[1]?.toLowerCase() ?? null;
        const isExactClause =
          marker != null &&
          (candidate.normalizedSourceRef === `def:${cat.termExact}(${marker})` ||
            candidate.normalizedSourceRef === `${sectionTerm(cat.termExact)}(${marker})`);
        if (isExactClause) {
          const clause = cat.clauses.find((cl) => cl.marker === marker);
          if (clause) {
            operativeText = `${cat.termExact} (${clause.marker}): ${clause.text}`;
            break;
          }
        }
        if (
          candidate.normalizedSourceRef === `def:${cat.termExact}` ||
          candidate.normalizedSourceRef === sectionTerm(cat.termExact)
        ) {
          operativeText = cat.chapeauText + "\n" + cat.clauses.map((cl) => `(${cl.marker}) ${cl.text}`).join("\n");
          break;
        }
      }
      // Direct section-clause ref: "7.03(g)"
      if (!operativeText.trim()) {
        const secClause = candidate.normalizedSourceRef.match(/^(\d+\.\d+)\(([a-z0-9]+)\)$/i);
        if (secClause) {
          const cat = exceptionCatalogs.find(
            (c) =>
              sectionTerm(c.termExact) === secClause[1] ||
              c.referencedFromProhibitionRefs.includes(`§${secClause[1]}`),
          );
          const clause = cat?.clauses.find((cl) => cl.marker === secClause[2]!.toLowerCase());
          if (cat && clause) operativeText = `§${secClause[1]}(${clause.marker}): ${clause.text}`;
        }
      }
    }
    if (!operativeText.trim()) {
      operativeText = candidate.description;
    }

    const knownDefs = [...(exactTermsByDocument.get(operativeDocumentId)?.values() ?? [])];
    const facts = extractDeterministicCovenantFacts({
      text: operativeText,
      documentId: operativeDocumentId,
      candidateRef: candidate.discoveryId,
      citation: candidate.normalizedSourceRef,
      knownFamilies: candidate.families,
      knownDefinitions: knownDefs.slice(0, 50),
    });

    const depTexts = (bundle?.items ?? [])
      .filter((i) => i.type === "DEFINITION" || i.type === "DEFINITION_DEPENDENCY" || i.type === "CROSS_REFERENCE")
      .slice(0, 12)
      .map((i) => ({
        ref: i.normalizedRef,
        text: (i.excerptText ?? "").slice(0, 2000),
        citation: i.sourceCitation ?? i.normalizedRef ?? null,
      }));

    const local = await compileLocalSemanticUnit(
      {
        unitId: candidate.discoveryId,
        documentId: candidate.documentId,
        sectionRef: candidate.normalizedSourceRef,
        operativeText,
        dependencyTexts: depTexts,
        lineage: {
          companyId: options.companyId,
          packageKey: options.packageKey,
          instrumentKey,
          documentId: candidate.documentId,
          candidateRef: candidate.discoveryId,
          operativeVersionRef: null,
          sourceContentHashes: [sha256(operativeText)],
        },
      },
      {
        mode: "DETERMINISTIC_ONLY",
        founderPaidAuthorization: false,
        authorizationRef: options.authorizationRef ?? null,
      },
    );

    const unresolvedDeps = bundle?.unresolvedDependencies?.length ?? 0;
    const hasUnresolved = unresolvedDeps > 0 || Boolean(bundle?.hasUnresolvedOperativeEvidence);
    const support = supportStatusForUnit({
      catalogStatus: catalogStatusByDiscoveryId.get(candidate.discoveryId),
      operativeText,
      localStatus: local.inference.status,
      hasUnresolvedContext: hasUnresolved,
    });

    // Locate span from catalog if present (definition or section clause).
    let charStart: number | null = null;
    let charEnd: number | null = null;
    for (const cat of exceptionCatalogs) {
      const sectionTerm = cat.termExact.replace(/^Section\s+/i, "");
      const clause = cat.clauses.find(
        (cl) =>
          candidate.normalizedSourceRef === `def:${cat.termExact}(${cl.marker})` ||
          candidate.normalizedSourceRef === `${sectionTerm}(${cl.marker})`,
      );
      if (clause) {
        charStart = clause.documentCharStart;
        charEnd = clause.documentCharEnd;
        break;
      }
    }

    // Vertical slices: attempt only on catalog clause candidates.
    // Provisional operative identity fails closed — never elevate to VERIFIED_EXECUTABLE.
    let executableAuthority: CompileUnitRepresentation["executableAuthority"] = "REFUSED";
    let fixedDollarSlice: CompileUnitRepresentation["fixedDollarSlice"] = null;
    let greaterOfSlice: CompileUnitRepresentation["greaterOfSlice"] = null;
    const isCatalogClause =
      /\([a-z0-9]+\)$/i.test(candidate.normalizedSourceRef) &&
      (candidate.normalizedSourceRef.startsWith("def:") || /^\d+\.\d+\(/i.test(candidate.normalizedSourceRef));
    // Fail closed on provisional identity OR when restatement authority refuses
    // unconditional production promotion for caveated / blocked governing docs.
    // Hypothetical vertical-slice compile may still run when identity is confirmed
    // and authority is merely caveated (disclosed) — production capacity stays refused.
    const restatementBlocksAllExecutable =
      !packageGraphRelationshipsUnchanged ||
      operativeAuthorityGate === "PROVISIONAL_IDENTITY_BLOCKED";
    if (isCatalogClause && !restatementBlocksAllExecutable) {
      const fdCompile = compileFixedDollarBasket({
        companyId: options.companyId,
        instrumentKey,
        sourceDocumentId: candidate.documentId,
        candidateRef: candidate.discoveryId,
        sourceSectionRef: candidate.normalizedSourceRef,
        operativeSourceText: operativeText,
        covenantFamily: candidate.families[0],
        action: candidate.families.includes("LIENS") ? "CREATE_LIEN" : "INCUR_DEBT",
      });
      if (fdCompile.executableClass !== "UNSUPPORTED") {
        const hypo = evaluateFixedDollarCapacity({
          compile: fdCompile,
          operativeSourceText: operativeText,
          authorityMode: "CALLER_STIPULATED_HYPOTHETICAL",
          asOf: asOfDate,
        });
        const prod = evaluateFixedDollarCapacity({
          compile: fdCompile,
          operativeSourceText: operativeText,
          authorityMode: "PRODUCTION",
          asOf: asOfDate,
        });
        fixedDollarResults.push({ sourceRef: candidate.normalizedSourceRef, compile: fdCompile, evaluation: hypo });
        fixedDollarSlice = {
          classification: fdCompile.classification.class,
          compileClass: fdCompile.executableClass,
          fidelityVerdict: hypo.fidelity.verdict,
          capacityOutcome: hypo.capacity?.outcome ?? hypo.outcomeLabel,
          availableAmountUsd: hypo.availableAmountUsd,
          productionRefusal: prod.productionRefusal,
        };
        if (hypo.outcomeLabel === "VERIFIED_EXECUTABLE" && hypo.fidelity.verdict === "PASS") {
          executableAuthority = "VERIFIED_EXECUTABLE";
        }
      } else {
        const goCompile = compileGreaterOfAssetsBasket({
          companyId: options.companyId,
          instrumentKey,
          sourceDocumentId: candidate.documentId,
          candidateRef: candidate.discoveryId,
          sourceSectionRef: candidate.normalizedSourceRef,
          operativeSourceText: operativeText,
          covenantFamily: candidate.families[0],
          action: candidate.families.includes("LIENS") ? "CREATE_LIEN" : "INCUR_DEBT",
        });
        if (goCompile.executableClass !== "UNSUPPORTED") {
          greaterOfCandidates.push({
            sourceRef: candidate.normalizedSourceRef,
            operativeText,
            documentId: candidate.documentId,
            discoveryId: candidate.discoveryId,
            families: candidate.families,
          });
          // No fabricated Total Assets in package compile — metric must be supplied by caller.
          // Hypothetical metric stipulations are never treated as AUTHENTICATED_APPROVED production evidence.
          const hypo = evaluateGreaterOfCapacity({
            compile: goCompile,
            operativeSourceText: operativeText,
            authorityMode: "CALLER_STIPULATED_HYPOTHETICAL",
            financialEvidenceMode: "CALLER_STIPULATED",
            totalAssetsUsd: null,
            asOf: asOfDate,
          });
          const prod = evaluateGreaterOfCapacity({
            compile: goCompile,
            operativeSourceText: operativeText,
            authorityMode: "PRODUCTION",
            financialEvidenceMode: "STALE_OR_UNAUTHENTICATED",
            totalAssetsUsd: null,
            asOf: asOfDate,
          });
          greaterOfResults.push({ sourceRef: candidate.normalizedSourceRef, compile: goCompile, evaluation: hypo });
          greaterOfSlice = {
            classification: goCompile.classification.class,
            compileClass: goCompile.executableClass,
            fidelityVerdict: hypo.fidelity.verdict,
            capacityOutcome: hypo.outcomeLabel,
            availableAmountUsd: hypo.availableAmountUsd,
            metricName: goCompile.classification.metricName,
            fixedAmountUsd: goCompile.classification.fixedAmountUsd,
            percentFraction: goCompile.classification.percentFraction,
            productionRefusal: prod.productionRefusal,
            sharedCapacity: false,
          };
          if (hypo.fidelity.verdict === "PASS" && goCompile.executableClass === "VERIFIED_EXECUTABLE_CANDIDATE") {
            executableAuthority = "VERIFIED_EXECUTABLE";
          }
        }
      }
    }

    units.push({
      unitId: `unit:${candidate.discoveryId}`,
      discoveryId: candidate.discoveryId,
      documentId: candidate.documentId,
      sourceRef: candidate.normalizedSourceRef,
      role: candidate.role,
      families: candidate.families,
      description: candidate.description,
      operativeText: operativeText.slice(0, 8000),
      operativeTextSha256: sha256(operativeText),
      sourceSpan: { charStart, charEnd },
      supportStatus: support,
      capsAndThresholds: extractCaps(operativeText),
      ratioMentions: (operativeText.match(/\b(?:Leverage|Coverage|Interest Coverage|Senior Secured)\s+Ratio\b/gi) ?? []).slice(0, 8),
      entityMentions: (operativeText.match(/\b(?:Restricted\s+(?:Compan(?:y|ies)|Subsidiar(?:y|ies))|Borrower|Guarantors?)\b/gi) ?? []).slice(0, 8),
      crossReferences: facts.facts.filter((f) => f.kind === "CROSS_REFERENCE").map((f) => String((f.value as { sectionRef?: string }).sectionRef ?? f.source.excerpt)).slice(0, 12),
      definedTermDependencies: facts.facts.filter((f) => f.kind === "DEFINITION").map((f) => String((f.value as { termName?: string }).termName ?? "")).filter(Boolean).slice(0, 12),
      debtLienLinks: debtLienLinksFromText(operativeText),
      contextBundleSummary: bundle
        ? {
            itemCount: bundle.items.length,
            unresolvedDependencies: unresolvedDeps,
            sufficiencyState: bundle.sufficiencyState ?? null,
          }
        : null,
      deterministicFactCount: facts.facts.length,
      localCompileStatus: local.inference.status,
      executableAuthority,
      fixedDollarSlice,
      greaterOfSlice,
      provenance: {
        discoveryMethods: candidate.discoveryMethods,
        evidenceSignals: candidate.evidenceSignals,
        offlineCompileVersion: OFFLINE_PACKAGE_COMPILE_VERSION,
      },
    });
  }

  // Shared-capacity pairs: only when operative text mutually asserts without-duplication combine.
  const greaterOfSharedPairs: OfflinePackageCompileResult["greaterOfSharedPairs"] = [];
  for (let i = 0; i < greaterOfCandidates.length; i++) {
    for (let j = i + 1; j < greaterOfCandidates.length; j++) {
      const a = greaterOfCandidates[i]!;
      const b = greaterOfCandidates[j]!;
      const pair = compileGreaterOfSharedPair({
        companyId: options.companyId,
        instrumentKey,
        sourceDocumentId: a.documentId,
        candidateRef: `shared:${a.discoveryId}+${b.discoveryId}`,
        memberA: {
          sourceSectionRef: a.sourceRef,
          operativeSourceText: a.operativeText,
          action: a.families.includes("LIENS") ? "CREATE_LIEN" : "INCUR_DEBT",
          covenantFamily: a.families[0],
        },
        memberB: {
          sourceSectionRef: b.sourceRef,
          operativeSourceText: b.operativeText,
          action: b.families.includes("LIENS") ? "CREATE_LIEN" : "INCUR_DEBT",
          covenantFamily: b.families[0],
        },
      });
      if (pair.shared) {
        greaterOfSharedPairs.push({
          refA: a.sourceRef,
          refB: b.sourceRef,
          shared: true,
          evidence: pair.evidence,
          sharedCapId: pair.sharedCapacity?.sharedCapId ?? null,
        });
        for (const u of units) {
          if (u.sourceRef === a.sourceRef || u.sourceRef === b.sourceRef) {
            if (u.greaterOfSlice) u.greaterOfSlice.sharedCapacity = true;
          }
        }
      }
    }
  }

  const verifiedExecutableUnits = units.filter((u) => u.executableAuthority === "VERIFIED_EXECUTABLE");
  const productionRefused = verifiedExecutableUnits.filter(
    (u) => u.fixedDollarSlice?.productionRefusal || u.greaterOfSlice?.productionRefusal,
  ).length;

  // Hard rule: caveated restatement authority never yields PRODUCTION_AUTHORITY_ACTIVE.
  const productionAuthorityActive =
    packageGraphRelationshipsUnchanged &&
    productionAuthorityFromRestatement.allProvisionsProductionActive &&
    !productionAuthorityFromRestatement.anyCaveatedDisclosedOnly &&
    operativeAuthorityGate !== "PROVISIONAL_IDENTITY_BLOCKED";

  let capacityHandoff: OfflinePackageCompileResult["stages"]["capacityHandoff"];
  if (verifiedExecutableUnits.length === 0) {
    capacityHandoff = {
      attempted: true,
      outcome: "REFUSED_NO_VEP",
      detail: "No verified IR units available; numerical capacity claims refused.",
    };
  } else if (!productionAuthorityActive) {
    capacityHandoff = {
      attempted: true,
      outcome: "VERTICAL_SLICE_PASSED_PRODUCTION_AUTHORITY_REFUSED",
      detail: `${verifiedExecutableUnits.length} unit(s) verified executable (fixed-dollar and/or greater-of); PRODUCTION_AUTHORITY_ACTIVE refused (restatement caveats, unproven CP satisfaction, provisional identity, and/or missing authenticated financial/utilization evidence). Caveated operative authority remains HYPOTHETICAL_OR_DISCLOSED_ONLY.`,
    };
  } else {
    capacityHandoff = {
      attempted: true,
      outcome: "VERTICAL_SLICE_PASSED_PRODUCTION_CAPACITY_REFUSED",
      detail: `${verifiedExecutableUnits.length} unit(s) verified executable (fixed-dollar and/or greater-of); production capacity refused for all (${productionRefused}) pending authenticated financial/utilization evidence. Greater-of units require stipulated Total Assets for hypothetical numeric capacity.`,
    };
  }

  const summary = {
    supportedStructureUnits: units.filter((u) => u.supportStatus === "SUPPORTED_STRUCTURE").length,
    partialUnits: units.filter((u) => u.supportStatus === "PARTIAL").length,
    unsupportedUnits: units.filter((u) => u.supportStatus === "UNSUPPORTED_SEMANTICS").length,
    unverifiedUnits: units.filter((u) => u.supportStatus === "UNVERIFIED").length,
    refusedExecutableUnits: units.filter((u) => u.executableAuthority === "REFUSED").length,
    verifiedExecutableUnits: verifiedExecutableUnits.length,
    // False executable = claimed VERIFIED_EXECUTABLE without a passing fidelity slice.
    falseExecutableClassifications: units.filter((u) => {
      if (u.executableAuthority !== "VERIFIED_EXECUTABLE") return false;
      const fdOk = u.fixedDollarSlice?.fidelityVerdict === "PASS";
      const goOk = u.greaterOfSlice?.fidelityVerdict === "PASS";
      return !fdOk && !goOk;
    }).length,
  };

  const greaterOfVerified = units.filter(
    (u) => u.executableAuthority === "VERIFIED_EXECUTABLE" && u.greaterOfSlice?.fidelityVerdict === "PASS",
  ).length;
  const fixedDollarVerified = units.filter(
    (u) => u.executableAuthority === "VERIFIED_EXECUTABLE" && u.fixedDollarSlice?.fidelityVerdict === "PASS",
  ).length;

  return {
    version: OFFLINE_PACKAGE_COMPILE_VERSION,
    companyId: options.companyId,
    packageKey: options.packageKey,
    instrumentKey,
    paidInferenceUsed: Boolean(options.authorizePaidInference) && !discoveryCaller.isSynthetic,
    stages: {
      structural: {
        nodeCount: [...nodesByDocument.values()].reduce((n, d) => n + d.nodes.length, 0),
        definitionCount: allDefinitions.length,
        referenceCount: allReferences.length,
      },
      packageGraph: {
        documentCount: documents.length,
        relationshipCount: packageGraph.relationshipCandidates.length,
        classifications: packageGraph.classifications.map((c) => ({ documentId: c.documentId, type: c.type })),
      },
      amendment: { effectCount: amendmentResult.effects.length },
      discovery: {
        passACount: passA.length,
        pipelineCandidateCount: pipelineCandidates.length,
        exceptionCatalogCount: exceptionCatalogs.length,
        exceptionClauseCount: exceptionCatalogs.reduce((n, c) => n + c.clauses.length, 0),
        prohibitionLinkCount: prohibitionLinks.length,
        totalCandidates: candidates.length,
        syntheticDiscovery,
      },
      context: {
        bundlesBuilt: bundles.size,
        operativeSourceRemapped,
        operativeSourceRemapRefused,
        operativeSourceAlreadyGoverning,
      },
      coverageAudit,
      capacityHandoff,
      operativeHandoff: {
        instrumentKey,
        identityConfirmed,
        mayConsolidateOperative: instrumentGrouping != null && mayConsolidateOperativeAgreement(instrumentGrouping),
        provisionCount: operativeHandoff?.provisions.length ?? 0,
        confirmedOperativeCount,
        provisionalBlockedCount,
        authorityGate: operativeAuthorityGate,
      },
      operativeRestatementAuthority: {
        verdict: operativeAuthorityHandoff.verdict,
        provisionCount: operativeAuthorityHandoff.provisions.length,
        restatementAuthorityCount: operativeAuthorityHandoff.restatementAuthorities.length,
        packageGraphRelationshipsUnchanged,
        productionAuthorityActive,
        anyCaveatedDisclosedOnly: productionAuthorityFromRestatement.anyCaveatedDisclosedOnly,
        anyProductionRefused: productionAuthorityFromRestatement.anyProductionRefused,
        effectivenessInference:
          operativeAuthorityHandoff.restatementAuthorities.find((a) => a.status === "OPERATIVE_AUTHORITY_CONFIRMED")
            ?.effectivenessInference ??
          operativeAuthorityHandoff.restatementAuthorities[0]?.effectivenessInference ??
          null,
        conditionsPrecedentSatisfaction:
          operativeAuthorityHandoff.restatementAuthorities.find((a) => a.status === "OPERATIVE_AUTHORITY_CONFIRMED")
            ?.conditionsPrecedentSatisfaction ??
          operativeAuthorityHandoff.restatementAuthorities[0]?.conditionsPrecedentSatisfaction ??
          null,
      },
      fixedDollarVerticalSlice: {
        attempted: fixedDollarResults.length,
        verifiedExecutable: fixedDollarVerified,
        productionCapacityRefused: units.filter((u) => u.fixedDollarSlice?.productionRefusal).length,
      },
      greaterOfVerticalSlice: {
        attempted: greaterOfResults.length,
        verifiedExecutable: greaterOfVerified,
        productionCapacityRefused: units.filter((u) => u.greaterOfSlice?.productionRefusal).length,
        sharedCapacityPairs: greaterOfSharedPairs.length,
      },
    },
    exceptionCatalogs,
    candidates,
    units,
    fixedDollarResults,
    greaterOfResults,
    greaterOfSharedPairs,
    operativeHandoff,
    operativeAuthorityHandoff,
    productionAuthorityFromRestatement,
    humanInterventions,
    summary,
  };
}
