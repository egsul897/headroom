/**
 * Generalized operative covenant package compilation.
 *
 * Connects existing components — structural index, package graph, operative
 * authority, definition/section exception catalogs, fixed-dollar / greater-of
 * verified IR, ratio-incurrence structure compile, and evaluateVerifiedCapacity —
 * into one issuer-agnostic API:
 *
 *   compileOperativeCovenantPackage(packageContext)
 *
 * Does NOT recreate a parallel evaluator. Does NOT branch on companyId for
 * discovery or compilation. Does NOT mutate process.env credentials.
 * Unsupported / ambiguous structures fail closed.
 * Never publishes AVAILABLE without authority + utilization + financial gates.
 */

import { TRUSTED_IDENTITY_PRODUCTION_ACTIVATION } from "@/lib/capacity";
import {
  createProviderFreeStageCaller,
  type StageCaller,
} from "@/lib/contract-model/compiler/llm-caller";
import { classifyFixedDollarBasket } from "@/lib/contract-model/compiler/fixed-dollar-basket";
import { compileRatioIncurrencePermission } from "@/lib/contract-model/compiler/ratio-incurrence";
import {
  auditIndependentSourceCoverage,
  type IndependentExpectedProvision,
  type IndependentSourceCoverageReport,
} from "./independent-source-coverage";
import {
  compileFrozenDebtPackage,
  type CompileUnitRepresentation,
  type OfflinePackageCompileResult,
  type OfflinePackageDocument,
} from "./offline-package-compile";

export const OPERATIVE_COVENANT_PACKAGE_VERSION = "operative-covenant-package.v2";

export type CapacityPublicationClass =
  | "SOURCE_BACKED_GROSS_CONTRACTUAL"
  | "MODELED_HYPOTHETICAL"
  | "VERIFIED_REMAINING"
  | "UNSUPPORTED_OR_UNKNOWN"
  | "PRODUCTION_AVAILABLE"; // never emitted while trusted-identity BLOCKED

export type OperativeProvisionKind =
  | "DEBT_INCURRENCE_PROHIBITION"
  | "LIEN_RESTRICTION"
  | "PERMITTED_DEBT_BASKET"
  | "PERMITTED_LIEN_BASKET"
  | "RATIO_BASED_PERMISSION"
  | "GREATER_OF_BASKET"
  | "FIXED_DOLLAR_BASKET"
  | "GRANDFATHERED_OR_NON_CAP"
  | "DEFINITION_DEPENDENCY"
  | "OTHER_OR_UNKNOWN";

/** Request-scoped execution — never mutates process-wide credentials. */
export type OperativeExecutionMode = "PROVIDER_FREE" | "AUTHORIZED_PAID";

export interface OperativePackageContext {
  companyId: string;
  packageKey: string;
  instrumentKey?: string;
  asOfDate?: string;
  documents: OfflinePackageDocument[];
  /**
   * Default PROVIDER_FREE. Injects synthetic StageCallers and forces
   * authorizePaidInference=false. AUTHORIZED_PAID requires authorizationRef
   * and still respects existing founder-paid gates inside the offline compiler.
   */
  executionMode?: OperativeExecutionMode;
  /** @deprecated Prefer executionMode. Kept for callers; ignored when executionMode=PROVIDER_FREE. */
  authorizePaidInference?: boolean;
  authorizationRef?: string | null;
  /** Optional injectable callers (tests). When omitted, PROVIDER_FREE uses createProviderFreeStageCaller(). */
  discoveryCaller?: StageCaller;
  amendmentCaller?: StageCaller;
  /** Independently authored expected inventory for omission-coverage audit. */
  independentExpectedInventory?: readonly IndependentExpectedProvision[];
}

export interface ExecutableOperativeUnit {
  unitId: string;
  sourceRef: string;
  documentId: string;
  /** Governing document from operative-authority handoff when remapped; else discovery document. */
  governingDocumentId: string;
  operativeAuthorityClassification: string;
  governingAuthorityConfirmed: boolean;
  provisionKind: OperativeProvisionKind;
  role: string;
  families: string[];
  executableAuthority: "VERIFIED_EXECUTABLE" | "REFUSED";
  capacityClass: CapacityPublicationClass;
  /** Gross contractual ceiling — NOT unconditional permission when residualConditions nonempty. */
  sourceBackedGrossCapacityUsd: number | null;
  modeledHypotheticalCapacityUsd: number | null;
  verifiedRemainingCapacityUsd: null;
  productionAvailableCapacityUsd: null;
  unconditionalPermission: false;
  residualConditions: Array<{ kind: string; excerpt: string }>;
  currency: "USD" | null;
  sourceSpan: { charStart: number | null; charEnd: number | null };
  operativeText: string;
  definedTermDependencies: string[];
  exceptionsAndConditions: string[];
  crossReferences: string[];
  fidelityVerdict: string | null;
  productionRefusal: string | null;
  missingDependencies: string[];
  ratioCompile: {
    executableClass: string;
    definitionClosureComplete: boolean;
    missingDependencies: string[];
  } | null;
  provenance: {
    discoveryMethods: string[];
    evidenceSignals: string[];
    offlineCompileVersion: string;
    operativePackageVersion: string;
  };
}

export interface RejectedOperativeUnit {
  unitId: string;
  sourceRef: string;
  documentId: string;
  governingDocumentId: string | null;
  operativeAuthorityClassification: string | null;
  provisionKind: OperativeProvisionKind;
  reason: string;
  supportStatus: string;
  operativeTextExcerpt: string;
}

export interface OperativeCoverageReport {
  discoveredProhibitionCount: number;
  discoveredBasketCount: number;
  discoveredRatioPermissionCount: number;
  discoveredLienRestrictionCount: number;
  discoveredDefinitionDependencyCount: number;
  executableFixedDollarCount: number;
  executableGreaterOfCount: number;
  rejectedCount: number;
  /** Inventory of discovered-but-not-executable units (NOT omission coverage). */
  missedOrUnsupportedRelevant: Array<{
    sourceRef: string;
    documentId: string;
    provisionKind: OperativeProvisionKind;
    why: string;
  }>;
  /** Present when caller supplied independentExpectedInventory. */
  independentSourceCoverage: IndependentSourceCoverageReport | null;
}

export interface OperativeCovenantPackageResult {
  version: string;
  companyId: string;
  packageKey: string;
  instrumentKey: string;
  asOfDate: string;
  executionMode: OperativeExecutionMode;
  executableUnits: ExecutableOperativeUnit[];
  rejectedUnits: RejectedOperativeUnit[];
  coverage: OperativeCoverageReport;
  diagnostics: {
    path: string[];
    capacityHandoffOutcome: string;
    productionAvailablePublished: boolean;
    verifiedRemainingPublished: boolean;
    trustedIdentityActivation: string;
    paidInferenceUsed: boolean;
    providerFreeEnforced: boolean;
    envCredentialsMutated: false;
    falseExecutableClassifications: number;
    autonomousCompilationProven: "NOT_PROVEN" | "PARTIAL" | "PROVEN";
    autonomousCompilationRationale: string;
    humanInterventions: { kind: string; detail: string }[];
  };
  offlineCompile: OfflinePackageCompileResult;
}

function classifyProvisionKind(unit: CompileUnitRepresentation): OperativeProvisionKind {
  const ref = unit.sourceRef;
  const role = unit.role;
  const families = unit.families;
  const text = unit.operativeText;
  const head = text.slice(0, 240);

  if (unit.greaterOfSlice) return "GREATER_OF_BASKET";
  if (unit.fixedDollarSlice?.classification?.startsWith("FIXED_DOLLAR")) return "FIXED_DOLLAR_BASKET";
  if (role === "DEFINITIONAL_DEPENDENCY_CANDIDATE") return "DEFINITION_DEPENDENCY";
  if (
    role === "RATIO_BASED_PERMISSION" ||
    (unit.ratioMentions.length > 0 && /would be|at least|no greater than/i.test(text))
  ) {
    return "RATIO_BASED_PERMISSION";
  }
  if (role === "GENERAL_PROHIBITION") {
    if (families.includes("LIENS") || /\bLiens?\b/i.test(head)) return "LIEN_RESTRICTION";
    if (families.includes("INDEBTEDNESS") || /\b(?:Indebtedness|Debt)\b/i.test(head)) {
      return "DEBT_INCURRENCE_PROHIBITION";
    }
    // Do not assume indebtedness for unclassified prohibitions.
    return "OTHER_OR_UNKNOWN";
  }
  if (role === "BASKET" || role === "SHARED_CAP" || role === "PERMISSION") {
    if (families.includes("LIENS") || /\bLiens?\b/i.test(head)) return "PERMITTED_LIEN_BASKET";
    if (/\$[\d,]+/.test(text) && !/\bnot\s+to\s+exceed\b|\bshall\s+not\s+exceed\b|\bdoes\s+not\s+exceed\b/i.test(text)) {
      return "GRANDFATHERED_OR_NON_CAP";
    }
    if (families.includes("INDEBTEDNESS") || /\b(?:Indebtedness|Debt)\b/i.test(head)) {
      return "PERMITTED_DEBT_BASKET";
    }
    // Investment / RP / asset-sale baskets stay unknown until family is resolved.
    return "OTHER_OR_UNKNOWN";
  }
  if (ref.startsWith("def:") && /Lien/i.test(ref)) return "PERMITTED_LIEN_BASKET";
  if (ref.startsWith("def:") && /(?:Debt|Indebtedness)/i.test(ref)) return "PERMITTED_DEBT_BASKET";
  if (ref.startsWith("def:")) return "OTHER_OR_UNKNOWN";
  return "OTHER_OR_UNKNOWN";
}

function capacityClassFor(unit: CompileUnitRepresentation): CapacityPublicationClass {
  if (unit.executableAuthority === "VERIFIED_EXECUTABLE" && unit.fixedDollarSlice?.fidelityVerdict === "PASS") {
    return "SOURCE_BACKED_GROSS_CONTRACTUAL";
  }
  if (unit.executableAuthority === "VERIFIED_EXECUTABLE" && unit.greaterOfSlice?.fidelityVerdict === "PASS") {
    return "MODELED_HYPOTHETICAL";
  }
  return "UNSUPPORTED_OR_UNKNOWN";
}

function missingDepsFor(unit: CompileUnitRepresentation): string[] {
  const out: string[] = [];
  if (unit.contextBundleSummary && unit.contextBundleSummary.unresolvedDependencies > 0) {
    out.push(`unresolved_context_dependencies:${unit.contextBundleSummary.unresolvedDependencies}`);
  }
  if (unit.greaterOfSlice && unit.greaterOfSlice.availableAmountUsd == null) {
    out.push(`financial_metric:${unit.greaterOfSlice.metricName ?? "Total Assets"}`);
  }
  if (unit.ratioMentions.length > 0 && unit.executableAuthority === "REFUSED") {
    out.push("ratio_definition_closure");
    out.push("approved_financial_snapshot");
  }
  if (!unit.fixedDollarSlice && !unit.greaterOfSlice && unit.executableAuthority === "REFUSED") {
    out.push("verified_executable_ir");
  }
  out.push("utilization_completeness_certificate");
  out.push("trusted_issuer_activation");
  return out;
}

/**
 * Narrow document-relationship + restatement-precedence evidence for
 * provision↔unit authority binding.
 *
 * Verified document succession is necessary but not sufficient: operative
 * authority for the specific provision is resolved with as-of effective-date
 * and supersession precedence. Unverified / ambiguous / conflicting succession
 * never binds. No issuer-specific exceptions.
 */
export interface DocumentRelationshipEvidence {
  /** ISO as-of date required whenever restatement authorities are supplied. */
  asOfDate?: string | null;
  restatementAuthorities?: ReadonlyArray<{
    status: string;
    successorDocumentId: string;
    predecessorDocumentId: string | null;
    effectiveDateIso?: string | null;
    restatementScope?: string | null;
    partialProvisionRefs?: readonly string[] | null;
  }>;
  /**
   * Explicitly verified continuing provision refs (section / def keys) that
   * survive restatement on the predecessor. Historical evidence alone never
   * invents continuation.
   */
  verifiedContinuingProvisionRefs?: readonly string[] | null;
}

export type ProvisionIdentityRefs = {
  sectionRef?: string | null;
  definedTermRef?: string | null;
};

function provisionIdentityKey(identity?: ProvisionIdentityRefs | null): string | null {
  const section = identity?.sectionRef?.trim() ?? "";
  if (section) return section;
  const term = identity?.definedTermRef?.trim() ?? "";
  if (term) return `def:${term.toLowerCase()}`;
  return null;
}

function provisionRefCoveredByPartial(
  provisionKey: string | null,
  partialRefs: readonly string[] | null | undefined,
): boolean {
  if (!provisionKey || !partialRefs || partialRefs.length === 0) return false;
  for (const raw of partialRefs) {
    const ref = raw.trim();
    if (!ref) continue;
    if (provisionKey === ref) return true;
    if (provisionKey.startsWith(`${ref}(`) || provisionKey.startsWith(`${ref}.`)) return true;
    // partial "7.03(f)" covers unit key "7.03" only via exact/prefix on provision side —
    // require the restatement's listed ref to cover the provision key, not the reverse widen.
  }
  return false;
}

function isVerifiedContinuing(
  provisionKey: string | null,
  relationship?: DocumentRelationshipEvidence | null,
): boolean {
  if (!provisionKey) return false;
  const continuing = relationship?.verifiedContinuingProvisionRefs ?? [];
  for (const raw of continuing) {
    const ref = raw.trim();
    if (!ref) continue;
    if (provisionKey === ref) return true;
    if (provisionKey.startsWith(`${ref}(`) || provisionKey.startsWith(`${ref}.`)) return true;
  }
  return false;
}

type NormalizedRestatement = {
  status: string;
  successorDocumentId: string;
  predecessorDocumentId: string;
  effectiveDateIso: string | null;
  restatementScope: string;
  partialProvisionRefs: readonly string[];
};

function normalizeRestatementAuthorities(
  relationship?: DocumentRelationshipEvidence | null,
): NormalizedRestatement[] {
  const out: NormalizedRestatement[] = [];
  for (const a of relationship?.restatementAuthorities ?? []) {
    const succ = a.successorDocumentId?.trim() ?? "";
    const pred = a.predecessorDocumentId?.trim() ?? "";
    if (!succ) continue;
    out.push({
      status: a.status,
      successorDocumentId: succ,
      predecessorDocumentId: pred,
      effectiveDateIso: a.effectiveDateIso?.trim() || null,
      restatementScope: (a.restatementScope ?? "UNKNOWN").trim() || "UNKNOWN",
      partialProvisionRefs: a.partialProvisionRefs ?? [],
    });
  }
  return out;
}

function restatementAffectsProvision(
  a: NormalizedRestatement,
  provisionKey: string | null,
): boolean {
  if (a.restatementScope === "FULL_AGREEMENT") return true;
  if (a.restatementScope === "PARTIAL_PROVISIONS") {
    return provisionRefCoveredByPartial(provisionKey, a.partialProvisionRefs);
  }
  // UNKNOWN scope — fail closed: treat as potentially replacing when confirmed.
  return true;
}

/**
 * Resolve the single operative governing document for a provision as of date.
 * Returns null when evidence is missing, conflicting, or unresolved.
 */
export function resolveOperativeGoverningDocumentId(
  relationship: DocumentRelationshipEvidence | null | undefined,
  provisionIdentity?: ProvisionIdentityRefs | null,
): { operativeDocumentId: string | null; refusalReason: string | null } {
  const authorities = normalizeRestatementAuthorities(relationship);
  if (authorities.length === 0) {
    return { operativeDocumentId: null, refusalReason: null };
  }
  const asOf = relationship?.asOfDate?.trim() ?? "";
  if (!asOf) {
    return { operativeDocumentId: null, refusalReason: "missing_as_of_date" };
  }

  const provisionKey = provisionIdentityKey(provisionIdentity);
  const confirmedAffecting = authorities.filter(
    (a) =>
      a.status === "OPERATIVE_AUTHORITY_CONFIRMED" &&
      a.predecessorDocumentId &&
      restatementAffectsProvision(a, provisionKey),
  );

  // Unresolved / ambiguous succession that could affect this provision → refuse.
  const blockingUnresolved = authorities.some(
    (a) =>
      a.predecessorDocumentId &&
      (a.status === "REVIEW_REQUIRED" ||
        a.status === "AMBIGUOUS" ||
        a.status === "UNSUPPORTED" ||
        a.status === "PROVISIONAL_IDENTITY_BLOCKED") &&
      restatementAffectsProvision(a, provisionKey) &&
      // Future-dated unresolved does not block current predecessor authority.
      (a.effectiveDateIso == null || a.effectiveDateIso <= asOf),
  );
  if (blockingUnresolved) {
    return { operativeDocumentId: null, refusalReason: "unresolved_succession" };
  }

  const effectiveConfirmed = confirmedAffecting.filter((a) => {
    if (!a.effectiveDateIso) return false; // missing date → not usable for precedence
    return a.effectiveDateIso <= asOf;
  });
  const missingDateConfirmed = confirmedAffecting.some((a) => !a.effectiveDateIso);
  if (missingDateConfirmed && effectiveConfirmed.length === 0) {
    return { operativeDocumentId: null, refusalReason: "missing_effective_date" };
  }

  if (effectiveConfirmed.length === 0) {
    // Restatement not yet effective — predecessor remains operative when unique.
    const preds = [
      ...new Set(confirmedAffecting.map((a) => a.predecessorDocumentId).filter(Boolean)),
    ];
    if (preds.length === 1) {
      return { operativeDocumentId: preds[0]!, refusalReason: null };
    }
    return { operativeDocumentId: null, refusalReason: "ambiguous_pre_effective_predecessor" };
  }

  // Latest effective confirmed successor; conflict if multiple distinct successors
  // share the latest effective date.
  const latestIso = [...effectiveConfirmed]
    .map((a) => a.effectiveDateIso!)
    .sort((a, b) => (a < b ? 1 : a > b ? -1 : 0))[0]!;
  const latest = effectiveConfirmed.filter((a) => a.effectiveDateIso === latestIso);
  const successors = [...new Set(latest.map((a) => a.successorDocumentId))];
  if (successors.length !== 1) {
    return { operativeDocumentId: null, refusalReason: "conflicting_confirmed_successors" };
  }
  return { operativeDocumentId: successors[0]!, refusalReason: null };
}

/**
 * True when the provision's governing document may bind the unit under
 * verified succession AND as-of supersession precedence for that provision.
 *
 * - Same document: permitted only if not a superseded predecessor for the provision
 *   (unless explicitly verified continuing).
 * - Cross-document: provision governing must be the operative document as-of;
 *   unit may be that document or its confirmed predecessor (discovery location).
 * - Bidirectional predecessor↔successor matching alone is insufficient.
 *
 * Exported for adversarial regression tests.
 */
export function documentsShareOperativeAuthority(
  provisionGoverningDocumentId: string | null | undefined,
  unitDocumentId: string | null | undefined,
  relationship?: DocumentRelationshipEvidence | null,
  provisionIdentity?: ProvisionIdentityRefs | null,
): boolean {
  const gov = provisionGoverningDocumentId?.trim() ?? "";
  const unitDoc = unitDocumentId?.trim() ?? "";
  if (!gov || !unitDoc) return false;

  const authorities = normalizeRestatementAuthorities(relationship);
  const provisionKey = provisionIdentityKey(provisionIdentity);

  // No succession evidence → only exact same-document identity.
  if (authorities.length === 0) {
    return gov === unitDoc;
  }

  // Continuing provision: predecessor governing may remain when explicitly verified.
  if (isVerifiedContinuing(provisionKey, relationship)) {
    const continuingPred = authorities.some(
      (a) =>
        a.status === "OPERATIVE_AUTHORITY_CONFIRMED" &&
        a.predecessorDocumentId === gov &&
        (unitDoc === gov || unitDoc === a.successorDocumentId),
    );
    if (continuingPred && gov === unitDoc) return true;
  }

  const resolved = resolveOperativeGoverningDocumentId(relationship, provisionIdentity);
  if (resolved.operativeDocumentId == null) {
    return false;
  }
  const operative = resolved.operativeDocumentId;

  // Provision's stated governing document must be the operative document as-of.
  if (gov !== operative) return false;

  if (unitDoc === operative) return true;

  // Unit discovered on immediate confirmed predecessor of the operative successor.
  const predOfOperative = authorities.find(
    (a) =>
      a.status === "OPERATIVE_AUTHORITY_CONFIRMED" &&
      a.successorDocumentId === operative &&
      a.predecessorDocumentId &&
      a.effectiveDateIso &&
      relationship?.asOfDate &&
      a.effectiveDateIso <= relationship.asOfDate.trim() &&
      restatementAffectsProvision(a, provisionKey),
  )?.predecessorDocumentId;
  return predOfOperative != null && unitDoc === predOfOperative;
}

/**
 * Match a handoff provision to a compile unit by provision identity
 * (sectionRef / definedTermRef) AND document relationship with restatement
 * precedence.
 *
 * - Same-document governingDocumentId alone is NEVER sufficient — distinct
 *   sections must not inherit one another's authority.
 * - Section / defined-term identity across unrelated documents REFUSES.
 * - Verified succession is separated from operative authority: as-of effective
 *   date + supersession precedence apply; replaced predecessor provisions REFUSE.
 * - Explicitly verified continuing provisions may remain on the predecessor.
 *
 * Exported for adversarial regression tests.
 */
export function provisionIdentityMatchesUnit(
  provision: {
    kind: string;
    sectionRef: string | null;
    definedTermRef: string | null;
    governingDocumentId?: string | null;
  },
  unit: Pick<CompileUnitRepresentation, "sourceRef" | "documentId">,
  relationship?: DocumentRelationshipEvidence | null,
): boolean {
  const provisionIdentity: ProvisionIdentityRefs = {
    sectionRef: provision.sectionRef,
    definedTermRef: provision.definedTermRef,
  };
  // Document-relationship + precedence gate first — never bind on section/term alone.
  if (
    !documentsShareOperativeAuthority(
      provision.governingDocumentId,
      unit.documentId,
      relationship,
      provisionIdentity,
    )
  ) {
    return false;
  }

  const sourceRef = unit.sourceRef.trim();
  if (!sourceRef) return false;

  if (provision.sectionRef) {
    const section = provision.sectionRef.trim();
    if (!section) return false;
    // Exact section identity, or unit sourceRef scoped under that section
    // (e.g. provision "7.03" matches unit "7.03(f)"). Never document-wide.
    if (sourceRef === section) return true;
    if (sourceRef.startsWith(`${section}(`) || sourceRef.startsWith(`${section}.`)) return true;
    return false;
  }

  if (provision.definedTermRef) {
    const term = provision.definedTermRef.trim();
    if (!term) return false;
    const lower = sourceRef.toLowerCase();
    const termLower = term.toLowerCase();
    if (lower === `def:${termLower}`) return true;
    if (lower.startsWith(`def:${termLower}(`) || lower.startsWith(`def:${termLower}/`)) return true;
    // Permit "def:Permitted Debt(2)" style when definedTermRef is "Permitted Debt"
    if (lower.startsWith("def:") && lower.slice(4).startsWith(termLower)) {
      const after = lower.slice(4 + termLower.length);
      return after.length === 0 || after.startsWith("(") || after.startsWith("/");
    }
    return false;
  }

  // WHOLE_AGREEMENT / empty identity — refuse to bind a unit-level authority claim.
  return false;
}

function authorityForUnit(
  unit: CompileUnitRepresentation,
  offline: OfflinePackageCompileResult,
): {
  governingDocumentId: string;
  operativeAuthorityClassification: string;
  governingAuthorityConfirmed: boolean;
} {
  const handoff = offline.operativeAuthorityHandoff;
  const relationship: DocumentRelationshipEvidence = {
    asOfDate: handoff?.asOfDate ?? null,
    restatementAuthorities: (handoff?.restatementAuthorities ?? []).map((a) => ({
      status: a.status,
      successorDocumentId: a.successorDocumentId,
      predecessorDocumentId: a.predecessorDocumentId,
      effectiveDateIso: a.effectiveDateIso,
      restatementScope: a.evidence?.restatementScope ?? null,
      partialProvisionRefs: a.evidence?.partialProvisionRefs ?? [],
    })),
  };
  const provision =
    handoff?.provisions.find((p) => provisionIdentityMatchesUnit(p, unit, relationship)) ?? null;

  // Without a provision-identity match, do not inherit another section's
  // governingDocumentId or authorityClassification — fall back to the unit's
  // own discovery document and the package gate (unconfirmed).
  const governingDocumentId = provision?.governingDocumentId ?? unit.documentId;
  const classification =
    provision?.authorityClassification ??
    offline.stages.operativeHandoff.authorityGate ??
    "NO_OPERATIVE_STATE";
  const confirmed =
    provision != null &&
    offline.stages.operativeHandoff.authorityGate === "CONFIRMED_OPERATIVE_IDENTITY" &&
    classification === "CONFIRMED_OPERATIVE";
  return {
    governingDocumentId,
    operativeAuthorityClassification: classification,
    governingAuthorityConfirmed: confirmed,
  };
}

function residualConditionsFor(unit: CompileUnitRepresentation): Array<{ kind: string; excerpt: string }> {
  const fd = classifyFixedDollarBasket(unit.operativeText);
  return fd.residuals.map((r) => ({ kind: r.kind, excerpt: r.excerpt }));
}

function toExecutable(
  unit: CompileUnitRepresentation,
  offline: OfflinePackageCompileResult,
): ExecutableOperativeUnit {
  const kind = classifyProvisionKind(unit);
  const capacityClass = capacityClassFor(unit);
  const fdUsd =
    capacityClass === "SOURCE_BACKED_GROSS_CONTRACTUAL"
      ? unit.fixedDollarSlice?.availableAmountUsd ?? null
      : null;
  const modeledUsd =
    capacityClass === "MODELED_HYPOTHETICAL"
      ? unit.greaterOfSlice?.availableAmountUsd ?? null
      : null;
  const authority = authorityForUnit(unit, offline);
  const residuals = residualConditionsFor(unit);

  let ratioCompile: ExecutableOperativeUnit["ratioCompile"] = null;
  if (kind === "RATIO_BASED_PERMISSION") {
    const compiled = compileRatioIncurrencePermission({
      companyId: offline.companyId,
      instrumentKey: offline.instrumentKey,
      sourceDocumentId: unit.documentId,
      candidateRef: unit.discoveryId,
      sourceSectionRef: unit.sourceRef,
      operativeSourceText: unit.operativeText,
    });
    ratioCompile = {
      executableClass: compiled.executableClass,
      definitionClosureComplete: compiled.definitionClosureComplete,
      missingDependencies: compiled.missingDependencies,
    };
  }

  return {
    unitId: unit.unitId,
    sourceRef: unit.sourceRef,
    documentId: unit.documentId,
    governingDocumentId: authority.governingDocumentId,
    operativeAuthorityClassification: authority.operativeAuthorityClassification,
    governingAuthorityConfirmed: authority.governingAuthorityConfirmed,
    provisionKind: kind,
    role: unit.role,
    families: unit.families,
    executableAuthority: unit.executableAuthority,
    capacityClass,
    sourceBackedGrossCapacityUsd: fdUsd,
    modeledHypotheticalCapacityUsd: modeledUsd,
    verifiedRemainingCapacityUsd: null,
    productionAvailableCapacityUsd: null,
    unconditionalPermission: false,
    residualConditions: residuals,
    currency: fdUsd != null || modeledUsd != null ? "USD" : null,
    sourceSpan: unit.sourceSpan,
    operativeText: unit.operativeText,
    definedTermDependencies: unit.definedTermDependencies,
    exceptionsAndConditions: [
      ...unit.capsAndThresholds.map((c) => `${c.kind}:${c.excerpt}`),
      ...unit.ratioMentions.map((r) => `RATIO:${r}`),
      ...residuals.map((r) => `RESIDUAL:${r.kind}:${r.excerpt}`),
    ].slice(0, 24),
    crossReferences: unit.crossReferences,
    fidelityVerdict: unit.fixedDollarSlice?.fidelityVerdict ?? unit.greaterOfSlice?.fidelityVerdict ?? null,
    productionRefusal: unit.fixedDollarSlice?.productionRefusal ?? unit.greaterOfSlice?.productionRefusal ?? null,
    missingDependencies: [
      ...missingDepsFor(unit),
      ...(ratioCompile?.missingDependencies ?? []),
      ...(authority.governingAuthorityConfirmed ? [] : ["governing_authority_not_confirmed_for_production"]),
    ],
    ratioCompile,
    provenance: {
      ...unit.provenance,
      operativePackageVersion: OPERATIVE_COVENANT_PACKAGE_VERSION,
    },
  };
}

function toRejected(
  unit: CompileUnitRepresentation,
  offline: OfflinePackageCompileResult,
): RejectedOperativeUnit {
  const kind = classifyProvisionKind(unit);
  const authority = authorityForUnit(unit, offline);
  let reason = `supportStatus=${unit.supportStatus}; executableAuthority=REFUSED`;
  if (kind === "RATIO_BASED_PERMISSION") {
    const compiled = compileRatioIncurrencePermission({
      companyId: offline.companyId,
      instrumentKey: offline.instrumentKey,
      sourceDocumentId: unit.documentId,
      candidateRef: unit.discoveryId,
      sourceSectionRef: unit.sourceRef,
      operativeSourceText: unit.operativeText,
    });
    reason = `Ratio refuse: ${compiled.executableClass}; missing=${compiled.missingDependencies.join(",")}`;
  } else if (kind === "GRANDFATHERED_OR_NON_CAP") {
    reason = "Dollar amount present without cap-role (grandfathered / stated amount) — not new-incurrence ceiling";
  } else if (kind === "GREATER_OF_BASKET" && unit.greaterOfSlice == null) {
    reason = "Greater-of / grower formulation not classified as executable assets basket";
  } else if (unit.fixedDollarSlice?.classification === "NOT_FIXED_DOLLAR" || !unit.fixedDollarSlice) {
    reason = `No verified fixed-dollar or greater-of IR (${kind})`;
  }
  return {
    unitId: unit.unitId,
    sourceRef: unit.sourceRef,
    documentId: unit.documentId,
    governingDocumentId: authority.governingDocumentId,
    operativeAuthorityClassification: authority.operativeAuthorityClassification,
    provisionKind: kind,
    reason,
    supportStatus: unit.supportStatus,
    operativeTextExcerpt: unit.operativeText.slice(0, 240).replace(/\s+/g, " "),
  };
}

function buildCoverage(
  units: CompileUnitRepresentation[],
  independent: IndependentSourceCoverageReport | null,
): OperativeCoverageReport {
  const kinds = units.map((u) => ({ u, kind: classifyProvisionKind(u) }));
  const missedOrUnsupportedRelevant = kinds
    .filter(({ u, kind }) => {
      if (u.executableAuthority === "VERIFIED_EXECUTABLE") return false;
      return (
        kind === "RATIO_BASED_PERMISSION" ||
        kind === "PERMITTED_DEBT_BASKET" ||
        kind === "PERMITTED_LIEN_BASKET" ||
        kind === "GRANDFATHERED_OR_NON_CAP" ||
        kind === "GREATER_OF_BASKET" ||
        kind === "FIXED_DOLLAR_BASKET" ||
        kind === "DEBT_INCURRENCE_PROHIBITION" ||
        kind === "LIEN_RESTRICTION"
      );
    })
    .map(({ u, kind }) => ({
      sourceRef: u.sourceRef,
      documentId: u.documentId,
      provisionKind: kind,
      why:
        kind === "RATIO_BASED_PERMISSION"
          ? "Discovered but unsupported/incomplete — not an omission gap"
          : kind === "GRANDFATHERED_OR_NON_CAP"
            ? "Grandfathered / non-cap dollar discovered; not compiled as new-incurrence ceiling"
            : u.executableAuthority === "REFUSED"
              ? "Discovered but not elevated to verified executable IR"
              : "Unsupported or incomplete",
    }));

  return {
    discoveredProhibitionCount: kinds.filter(
      (k) => k.kind === "DEBT_INCURRENCE_PROHIBITION" || k.kind === "LIEN_RESTRICTION",
    ).length,
    discoveredBasketCount: kinds.filter(
      (k) =>
        k.kind === "PERMITTED_DEBT_BASKET" ||
        k.kind === "PERMITTED_LIEN_BASKET" ||
        k.kind === "FIXED_DOLLAR_BASKET" ||
        k.kind === "GREATER_OF_BASKET" ||
        k.kind === "GRANDFATHERED_OR_NON_CAP",
    ).length,
    discoveredRatioPermissionCount: kinds.filter((k) => k.kind === "RATIO_BASED_PERMISSION").length,
    discoveredLienRestrictionCount: kinds.filter((k) => k.kind === "LIEN_RESTRICTION").length,
    discoveredDefinitionDependencyCount: kinds.filter((k) => k.kind === "DEFINITION_DEPENDENCY").length,
    executableFixedDollarCount: units.filter(
      (u) => u.executableAuthority === "VERIFIED_EXECUTABLE" && u.fixedDollarSlice?.fidelityVerdict === "PASS",
    ).length,
    executableGreaterOfCount: units.filter(
      (u) => u.executableAuthority === "VERIFIED_EXECUTABLE" && u.greaterOfSlice?.fidelityVerdict === "PASS",
    ).length,
    rejectedCount: units.filter((u) => u.executableAuthority === "REFUSED").length,
    missedOrUnsupportedRelevant,
    independentSourceCoverage: independent,
  };
}

function autonomousVerdict(
  coverage: OperativeCoverageReport,
  offline: OfflinePackageCompileResult,
): { verdict: "NOT_PROVEN" | "PARTIAL" | "PROVEN"; rationale: string } {
  const hasExecutable = coverage.executableFixedDollarCount + coverage.executableGreaterOfCount > 0;
  const hasGenericDiscovery =
    offline.stages.discovery.exceptionCatalogCount > 0 ||
    offline.stages.discovery.exceptionClauseCount > 0;
  const falseExec = offline.summary.falseExecutableClassifications;
  if (falseExec > 0) {
    return {
      verdict: "NOT_PROVEN",
      rationale: `False executable classifications=${falseExec}; fail-closed integrity broken.`,
    };
  }
  if (!hasExecutable || !hasGenericDiscovery) {
    return {
      verdict: "NOT_PROVEN",
      rationale: "No source-backed verified executable units from generic catalog discovery.",
    };
  }
  const omissionOk = coverage.independentSourceCoverage?.omissionCoverageComplete !== false;
  if (coverage.discoveredRatioPermissionCount > 0 && coverage.executableFixedDollarCount > 0 && omissionOk) {
    return {
      verdict: "PARTIAL",
      rationale:
        "Generic discovery + fixed-dollar/greater-of VE compile proven; ratio structure compile present but numeric VE refused; production AVAILABLE refused; P0 provider-free enforced.",
    };
  }
  return {
    verdict: "PARTIAL",
    rationale:
      "Generic discovery + verified fixed-dollar/greater-of compile proven; remaining/AVAILABLE and full ratio numeric closure not proven.",
  };
}

function resolveExecution(packageContext: OperativePackageContext): {
  mode: OperativeExecutionMode;
  authorizePaidInference: boolean;
  discoveryCaller: StageCaller;
  amendmentCaller: StageCaller;
  providerFreeEnforced: boolean;
} {
  const mode: OperativeExecutionMode = packageContext.executionMode ?? "PROVIDER_FREE";
  if (mode === "PROVIDER_FREE") {
    const free = packageContext.discoveryCaller ?? createProviderFreeStageCaller();
    const freeAmd = packageContext.amendmentCaller ?? createProviderFreeStageCaller();
    if (!free.isSynthetic || !freeAmd.isSynthetic) {
      throw new Error(
        "PROVIDER_FREE execution requires synthetic StageCallers — refuse non-synthetic injection",
      );
    }
    return {
      mode,
      authorizePaidInference: false,
      discoveryCaller: free,
      amendmentCaller: freeAmd,
      providerFreeEnforced: true,
    };
  }
  // AUTHORIZED_PAID — still requires explicit authorizationRef; offline compiler
  // and inference policy enforce founder-paid gates. Never deletes env credentials.
  if (!packageContext.authorizationRef || packageContext.authorizationRef.trim().length === 0) {
    throw new Error(
      "AUTHORIZED_PAID execution requires a non-empty authorizationRef (existing founder-paid gate)",
    );
  }
  return {
    mode,
    authorizePaidInference: true,
    discoveryCaller: packageContext.discoveryCaller ?? createProviderFreeStageCaller(),
    amendmentCaller: packageContext.amendmentCaller ?? createProviderFreeStageCaller(),
    providerFreeEnforced: false,
  };
}

/**
 * Compile an authentic, structurally indexable debt-document package into
 * operative covenant units with capacity publication classes.
 *
 * Issuer-agnostic: discovery and compile paths do not branch on companyId.
 * Never mutates process.env.
 */
export async function compileOperativeCovenantPackage(
  packageContext: OperativePackageContext,
): Promise<OperativeCovenantPackageResult> {
  const asOfDate = packageContext.asOfDate ?? new Date().toISOString().slice(0, 10);
  const execution = resolveExecution(packageContext);
  const path: string[] = [
    "package-context",
    `executionMode:${execution.mode}`,
    "structure→package-graph→amendment→operative-authority",
    "generic-discovery(pass-a+exception-catalogs+ratio-sections)",
    "fixed-dollar|greater-of|ratio-structure→evaluateVerifiedCapacity",
    "capacity-publication-classes",
    "independent-source-coverage",
  ];

  const offline = await compileFrozenDebtPackage({
    companyId: packageContext.companyId,
    packageKey: packageContext.packageKey,
    instrumentKey: packageContext.instrumentKey,
    documents: packageContext.documents,
    authorizePaidInference: execution.authorizePaidInference,
    authorizationRef: packageContext.authorizationRef,
    asOfDate,
    discoveryCaller: execution.discoveryCaller,
    amendmentCaller: execution.amendmentCaller,
  });

  path.push(`catalogs:${offline.stages.discovery.exceptionCatalogCount}`);
  path.push(`clauses:${offline.stages.discovery.exceptionClauseCount}`);
  path.push(`units:${offline.units.length}`);
  path.push(`ve:${offline.summary.verifiedExecutableUnits}`);
  path.push(`oaGate:${offline.stages.operativeHandoff.authorityGate}`);

  // Refuse executable elevation when provisional identity blocks (preserve #306 path).
  // Units already refused inside offline compile for PROVISIONAL_IDENTITY_BLOCKED.
  const executableUnits = offline.units
    .filter((u) => u.executableAuthority === "VERIFIED_EXECUTABLE")
    .map((u) => toExecutable(u, offline));
  const rejectedUnits = offline.units
    .filter((u) => u.executableAuthority === "REFUSED")
    .map((u) => toRejected(u, offline));

  const independent =
    packageContext.independentExpectedInventory && packageContext.independentExpectedInventory.length > 0
      ? auditIndependentSourceCoverage({
          expected: packageContext.independentExpectedInventory,
          units: offline.units.map((u) => ({
            sourceRef: u.sourceRef,
            documentId: u.documentId,
            executableAuthority: u.executableAuthority,
            provisionKind: classifyProvisionKind(u),
          })),
        })
      : null;

  const coverage = buildCoverage(offline.units, independent);
  const { verdict, rationale } = autonomousVerdict(coverage, offline);

  for (const u of executableUnits) {
    if (u.capacityClass === "PRODUCTION_AVAILABLE" || u.productionAvailableCapacityUsd != null) {
      throw new Error(`compileOperativeCovenantPackage refused AVAILABLE for ${u.unitId}`);
    }
    if (u.verifiedRemainingCapacityUsd != null) {
      throw new Error(`compileOperativeCovenantPackage refused verified remaining for ${u.unitId}`);
    }
    if (u.unconditionalPermission !== false) {
      throw new Error(`GROSS must never claim unconditionalPermission for ${u.unitId}`);
    }
    if (u.capacityClass === "SOURCE_BACKED_GROSS_CONTRACTUAL" && u.sourceBackedGrossCapacityUsd == null) {
      throw new Error(`GROSS unit missing amount: ${u.unitId}`);
    }
    if (!u.governingDocumentId) {
      throw new Error(`Executable unit missing governingDocumentId: ${u.unitId}`);
    }
    if (u.sourceSpan.charStart == null || u.sourceSpan.charEnd == null) {
      // Soft: catalog parents may lack spans; leaf VE clauses must have spans.
      if (/\([a-z0-9]+\)$/i.test(u.sourceRef) || /\(\d{1,2}\)\([a-z0-9]+\)$/i.test(u.sourceRef)) {
        throw new Error(`Executable catalog clause missing source span: ${u.unitId} ${u.sourceRef}`);
      }
    }
  }

  if (execution.mode === "PROVIDER_FREE" && offline.paidInferenceUsed) {
    throw new Error("PROVIDER_FREE execution must not report paidInferenceUsed=true");
  }

  return {
    version: OPERATIVE_COVENANT_PACKAGE_VERSION,
    companyId: packageContext.companyId,
    packageKey: packageContext.packageKey,
    instrumentKey: offline.instrumentKey,
    asOfDate,
    executionMode: execution.mode,
    executableUnits,
    rejectedUnits,
    coverage,
    diagnostics: {
      path,
      capacityHandoffOutcome: offline.stages.capacityHandoff.outcome,
      productionAvailablePublished: false,
      verifiedRemainingPublished: false,
      trustedIdentityActivation: TRUSTED_IDENTITY_PRODUCTION_ACTIVATION.status,
      paidInferenceUsed: offline.paidInferenceUsed,
      providerFreeEnforced: execution.providerFreeEnforced,
      envCredentialsMutated: false,
      falseExecutableClassifications: offline.summary.falseExecutableClassifications,
      autonomousCompilationProven: verdict,
      autonomousCompilationRationale: rationale,
      humanInterventions: offline.humanInterventions,
    },
    offlineCompile: offline,
  };
}

export type { IndependentExpectedProvision, IndependentSourceCoverageReport };
