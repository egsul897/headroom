/**
 * certifyCandidate - THE ONE pure decision that says whether a candidate's artifacts are CERTIFIED, REVIEW_REQUIRED
 * or NOT_CERTIFIED. No provider, no clock, no I/O: it reads the compile input, the compiled units, the verification,
 * the pre-verification snapshot, the paired verified-unit package and the units as they exist now, and returns
 * structured blockers. Nothing else in the codebase may decide certification.
 */
import type { DiscoveredCandidate } from "../compiler/discovery/types";
import type { CovenantContextBundle } from "../compiler/context-retrieval/types";
import type { OperativeProvisionView } from "../compiler/amendment/types";
import type { SemanticCompilationResult } from "../compiler/semantic/types";
import type { SemanticVerificationResult } from "../compiler/semantic-verification/types";
import type { OperativeLineageRef } from "../ir/types";
import { canonicalJson, identityOfUnit, unitIdOf, type PersistedVerifiedUnitPackage, type UnitSnapshot, type VerifiableUnit } from "../verified-units";
import type { IdentityStrength } from "../covenant-map/types";
import type { SemanticSourceContract } from "./semantic-source-contract";
import { PHASE3_CERTIFICATION_DECISION_VERSION, type CandidateCertification, type CertificationBlocker, type CertificationBlockerCode, type CertificationWarning } from "./types";

export interface CertifyCandidateInput {
  candidate: Pick<DiscoveredCandidate, "discoveryId" | "structuralNodeIds" | "normalizedSourceRef">;
  /** True when the candidate's anchor node resolved and a compiler input was built. */
  anchored: boolean;
  operativeSourceVersion: string | null;
  operativeIdentityStrength: IdentityStrength;
  semanticSourceContract: SemanticSourceContract | null;
  bundle: CovenantContextBundle | null;
  compilation: SemanticCompilationResult | null;
  verification: SemanticVerificationResult | null;
  operativeProvision: OperativeProvisionView | null;
  operativeLineage: OperativeLineageRef | null;
  snapshot: UnitSnapshot | null;
  verifiedPackage: PersistedVerifiedUnitPackage | null;
  /** The units as they exist NOW (after verification and packaging) - the exact objects a consumer would execute. */
  currentUnits: readonly VerifiableUnit[];
}

const OK_VERIFICATION = new Set(["VERIFIED_NO_MATERIAL_GAP_FOUND", "VERIFIED_WITH_NON_MATERIAL_FINDINGS"]);
const FAILED_VERIFICATION = new Set(["NOT_VERIFIED", "VERIFICATION_FAILED", "VERIFICATION_INCOMPLETE"]);

export function certifyCandidate(input: CertifyCandidateInput): CandidateCertification {
  const blockers: CertificationBlocker[] = [];
  const warnings: CertificationWarning[] = [];
  const block = (code: CertificationBlockerCode, severity: CertificationBlocker["severity"], detail: string, refs: string[] = []) => blockers.push({ code, severity, detail, refs: [...refs].sort() });
  const warn = (code: string, detail: string, refs: string[] = []) => warnings.push({ code, detail, refs: [...refs].sort() });
  const comp = input.compilation;
  const units: VerifiableUnit[] = comp ? [...comp.rules, ...comp.definitions, ...comp.sharedCapacities] : [];
  const unitIds = units.map(unitIdOf);
  const unitIdSet = new Set(unitIds);

  // 1. anchored + compiled
  if (!input.anchored || input.candidate.structuralNodeIds.length === 0) block("NOT_ANCHORED", "BLOCKING", "the candidate resolves to no structural anchor; nothing can be identified");
  if (!comp) block("CANDIDATE_NOT_COMPILED", "BLOCKING", "no compilation result exists for the candidate");
  else if (comp.status === "FAILED") block("COMPILATION_FAILED", "BLOCKING", `compilation FAILED: ${comp.failureReasons.join(", ") || comp.errorDetail?.sanitizedMessage || "no reason recorded"}`);
  else if (comp.status !== "COMPLETED") block("COMPILATION_NOT_COMPLETED", "REVIEW", `compilation ${comp.status}: ${comp.failureReasons.join(", ") || comp.unresolvedIssues[0] || "see unresolvedIssues"}`);
  if (comp && units.length === 0 && comp.status !== "FAILED") block("NO_UNITS", "BLOCKING", "the candidate compiled to no rule, definition or shared capacity; there is nothing to certify");

  // 2. identities
  if (input.operativeIdentityStrength !== "STRONG" || !input.operativeSourceVersion) block("SOURCE_IDENTITY_WEAK", "BLOCKING", "the operative source identity (scv1) is not STRONG: no anchor or empty operative text");
  if (!input.semanticSourceContract) block("SEMANTIC_SOURCE_IDENTITY_WEAK", "BLOCKING", "no semantic source contract was computed for the candidate");
  else if (input.semanticSourceContract.strength !== "STRONG") block("SEMANTIC_SOURCE_IDENTITY_WEAK", "BLOCKING", `the semantic source contract is WEAK (attribution ${input.semanticSourceContract.attributionMode})`);
  else if (input.semanticSourceContract.attributionMode === "BROAD_BUNDLE") warn("BROAD_BUNDLE_ATTRIBUTION", "some relied-upon context could not be attributed to a bundle item; the whole bundle identity is bound (conservative)", [...input.semanticSourceContract.reliedUpon.unattributedTerms, ...input.semanticSourceContract.reliedUpon.unattributedSectionRefs]);

  // 3. operative state + context contract
  if (input.operativeProvision && input.operativeProvision.status !== "OPERATIVE_STATE_RESOLVED") block("OPERATIVE_STATE_UNACCEPTABLE", "REVIEW", `operative state ${input.operativeProvision.status} for provision ${input.operativeProvision.provisionKey}`, [input.operativeProvision.provisionKey]);
  if (input.bundle?.hasUnresolvedOperativeEvidence || comp?.inputHasUnresolvedOperativeEvidence) block("OPERATIVE_STATE_UNACCEPTABLE", "REVIEW", "the context bundle carries unresolved operative evidence (conflicted / ambiguous / partial amendment state)", [...(input.bundle?.unresolvedEvidenceItemIds ?? comp?.unresolvedEvidenceItemIds ?? [])]);
  if (input.bundle) {
    if (input.bundle.sufficiencyState !== "SUFFICIENT") block("CONTEXT_CONTRACT_UNACCEPTABLE", "REVIEW", `context bundle sufficiency ${input.bundle.sufficiencyState}: ${input.bundle.stopReasons.join("; ")}`);
    const high = input.bundle.unresolvedDependencies.filter((d) => d.severity === "HIGH");
    if (high.length > 0) block("CONTEXT_CONTRACT_UNACCEPTABLE", "REVIEW", `${high.length} HIGH-severity unresolved context dependenc${high.length === 1 ? "y" : "ies"}`, high.map((d) => `${d.dependencyType}:${d.sourceText}`));
  }

  // 4. units: sufficiency, lineage, dependencies, duplicates
  const dup = unitIds.filter((id, i) => unitIds.indexOf(id) !== i);
  if (dup.length > 0) block("DUPLICATE_UNIT_ID", "BLOCKING", "a unit id is emitted more than once by the candidate", [...new Set(dup)]);
  const insufficient = units.filter((u) => "sufficiency" in u && u.sufficiency !== "COMPLETE");
  if (insufficient.length > 0) block("UNIT_SUFFICIENCY_INCOMPLETE", "REVIEW", "executable unit(s) are not COMPLETE", insufficient.map((u) => `${unitIdOf(u)}:${(u as { sufficiency: string }).sufficiency}`));
  if (comp) {
    for (const r of comp.rules) {
      if (input.operativeLineage && r.operativeLineage && r.operativeLineage.provisionKey !== input.operativeLineage.provisionKey) block("LINEAGE_UNACCEPTABLE", "REVIEW", `rule ${r.ruleId} claims lineage ${r.operativeLineage.provisionKey}; the candidate's operative provision is ${input.operativeLineage.provisionKey}`, [r.ruleId]);
      if (input.operativeLineage && r.operativeLineage && r.operativeLineage.operativeStatus !== "OPERATIVE_STATE_RESOLVED") block("LINEAGE_UNACCEPTABLE", "REVIEW", `rule ${r.ruleId} lineage status ${r.operativeLineage.operativeStatus}`, [r.ruleId]);
      // SEMANTIC FIDELITY: a structurally RESOLVED cross-unit reference is correct candidate semantics whose binding is a
      // package-level step (warning SEMANTIC_BINDING_PENDING_PACKAGE); only a DEPENDENCY_UNKNOWN reference is a defect.
      const unknownDeps = [...(r.sourceDependencies ?? []).filter((d) => d.resolutionStatus === "DEPENDENCY_UNKNOWN"), ...(r.unresolvedDependencies ?? []).filter((d) => !(r.sourceDependencies ?? []).some((sd) => sd.exactSourceTargetRef === d.targetRef)).map((d) => ({ exactSourceTargetRef: d.targetRef }))];
      if (unknownDeps.length > 0) block("DEPENDENCY_INVALID", "REVIEW", `rule ${r.ruleId} references ${unknownDeps.map((d) => `"${d.exactSourceTargetRef}"`).join(", ")} which resolve to no structural node (DEPENDENCY_UNKNOWN)`, [r.ruleId]);
      const pending = [...(r.sourceDependencies ?? []).filter((d) => d.resolutionStatus === "SOURCE_REFERENCE_RESOLVED"), ...r.conditions.flatMap((c) => (c.referencesRuleTargets ?? []).filter((t) => t.resolutionStatus === "SOURCE_REFERENCE_RESOLVED"))];
      if (pending.length > 0) warn("SEMANTIC_BINDING_PENDING_PACKAGE", `rule ${r.ruleId} references ${[...new Set(pending.map((d) => d.exactSourceTargetRef))].join(", ")} - structurally resolved${pending.some((d) => d.owningCandidateRefs.length > 0) ? ` (owned by ${[...new Set(pending.flatMap((d) => d.owningCandidateRefs))].join(", ")})` : ""}; semantic target binding is a package-level step`, [r.ruleId]);
      const unknownTargets = r.conditions.flatMap((c) => (c.referencesRuleTargets ?? []).filter((t) => t.resolutionStatus === "DEPENDENCY_UNKNOWN"));
      if (unknownTargets.length > 0) block("DEPENDENCY_INVALID", "REVIEW", `rule ${r.ruleId} condition(s) reference ${unknownTargets.map((t) => `"${t.exactSourceTargetRef}"`).join(", ")} which resolve to no structural node (DEPENDENCY_UNKNOWN)`, [r.ruleId]);
      for (const d of r.dependsOn) if (!unitIdSet.has(d.targetRuleId)) warn("CROSS_CANDIDATE_DEPENDENCY", `rule ${r.ruleId} depends on ${d.targetRuleId}, which is not a unit of this candidate; resolved at package level`, [r.ruleId, d.targetRuleId]);
      for (const e of r.exceptions) if (e.permissionRuleId && !unitIdSet.has(e.permissionRuleId)) warn("CROSS_CANDIDATE_DEPENDENCY", `exception ${e.exceptionId} of ${r.ruleId} names permission ${e.permissionRuleId}, which is not a unit of this candidate; resolved at package level`, [r.ruleId, e.permissionRuleId]);
    }
    for (const c of comp.sharedCapacities) {
      const missing = c.memberRuleIds.filter((m) => !unitIdSet.has(m));
      if (missing.length > 0) block("DEPENDENCY_INVALID", "REVIEW", `shared capacity ${c.sharedCapId} names member rule(s) the candidate did not compile`, [c.sharedCapId, ...missing]);
      if (c.memberRuleIds.length === 0) block("DEPENDENCY_INVALID", "REVIEW", `shared capacity ${c.sharedCapId} has no member rules`, [c.sharedCapId]);
    }
  }

  if (comp && (comp.contextOnlyEmissions?.length ?? 0) > 0) warn("CONTEXT_ONLY_UNIT_QUARANTINED", `${comp.contextOnlyEmissions!.length} unit(s) the composition emitted for source this candidate does not own were quarantined (never in the certified IR)`, comp.contextOnlyEmissions!.map((e) => e.unitId));
  if (comp && (comp.dependencyProseDiagnostics ?? []).some((d) => d.targetEconomicsExcluded.length > 0)) warn("TARGET_ECONOMICS_EXCLUDED", "figures the model restated from referenced provisions were excluded from this unit's dependency semantics", comp.dependencyProseDiagnostics!.flatMap((d) => d.targetEconomicsExcluded));

  // 5. verification: completed, clean, owners canonical, no open material/uncertain finding, inventory/support
  const ver = input.verification;
  if (!ver) { if (comp && comp.status !== "FAILED") block("VERIFICATION_MISSING", "BLOCKING", "the compiled units were never verified"); }
  else {
    if (FAILED_VERIFICATION.has(ver.status)) block("VERIFICATION_NOT_COMPLETED", "BLOCKING", `verification ${ver.status}`);
    else if (!OK_VERIFICATION.has(ver.status)) block("VERIFICATION_NOT_CLEAN", "REVIEW", `verification ${ver.status}: ${ver.findings.filter((f) => f.severity === "MATERIAL").length} material finding(s)`);
    const foreign = ver.findings.filter((f) => f.ruleOrDefinitionId !== null && !unitIdSet.has(f.ruleOrDefinitionId));
    if (foreign.length > 0) block("FINDING_OWNER_NOT_CANONICAL", "REVIEW", "finding(s) name a unit the candidate did not compile", foreign.map((f) => `${f.findingId}->${f.ruleOrDefinitionId}`));
    const ambiguous = ver.findings.filter((f) => f.ownerNormalization && (f.ownerNormalization.repair === "VERIFIER_OWNER_AMBIGUOUS_MULTI_UNIT" || f.ownerNormalization.repair === "VERIFIER_OWNER_UNRESOLVED") && f.severity !== "NON_MATERIAL");
    if (ambiguous.length > 0) block("FINDING_OWNER_NOT_CANONICAL", "REVIEW", "material/uncertain finding(s) could not be pinned to one unit", ambiguous.map((f) => f.findingId));
    const open = ver.findings.filter((f) => (f.severity === "MATERIAL" || f.severity === "UNCERTAIN") && f.resolutionStatus !== "RESOLVED");
    if (open.length > 0) block("OPEN_MATERIAL_OR_UNCERTAIN_FINDING", "REVIEW", `${open.length} open MATERIAL/UNCERTAIN finding(s)`, open.map((f) => f.findingId));
    if (!ver.sourceInventory) block("INVENTORY_MISSING", "BLOCKING", "the verification carries no source inventory");
    else if (ver.sourceInventory.supersessionStatus === "KNOWN_SUPERSEDED") block("INVENTORY_STATUS_UNACCEPTABLE", "REVIEW", `source inventory supersession status ${ver.sourceInventory.supersessionStatus}: ${ver.sourceInventory.supersessionReason}`);
    const unaccounted = ver.reconciliation.items.filter((i) => i.classification === "NOT_ACCOUNTED_FOR" && i.sourceItem !== null);
    if (ver.reconciliation.materialUnresolvedCount > 0 || unaccounted.length > 0) block("UNACCOUNTED_MATERIAL_SOURCE", "REVIEW", `${Math.max(ver.reconciliation.materialUnresolvedCount, unaccounted.length)} material source item(s) are not accounted for by the IR`, unaccounted.map((i) => i.sourceItem!.itemId));
    const ungrounded = (ver.numericAssertions?.groundings ?? []).filter((g) => g.status === "UNGROUNDED" || g.status === "AMBIGUOUS");
    if (ungrounded.length > 0) block("SUPPORT_UNACCEPTABLE", "REVIEW", `${ungrounded.length} numeric assertion(s) in the IR are ungrounded or ambiguous against the admitted evidence`, ungrounded.map((g) => `${g.assertion.ruleOrDefinitionId}:${g.assertion.itemId}`));
    if ((ver.qualitativeLineage?.materialUngrounded ?? 0) > 0) block("SUPPORT_UNACCEPTABLE", "REVIEW", `${ver.qualitativeLineage!.materialUngrounded} material qualitative unit(s) have no source lineage`);
  }

  // 6. snapshot + paired package + exact identity of the units in hand
  const pkg = input.verifiedPackage;
  if (!input.snapshot || input.snapshot.units.length === 0) { if (units.length > 0) block("SNAPSHOT_MISSING", "BLOCKING", "no pre-verification snapshot of the units exists; the verification cannot be tied to exact units"); }
  if (!pkg) { if (units.length > 0) block("VERIFIED_PACKAGE_INCOMPLETE", "BLOCKING", "no verified-unit package was built for the candidate"); }
  else {
    if (!pkg.complete) block("VERIFIED_PACKAGE_INCOMPLETE", "BLOCKING", `the verified-unit package is incomplete: ${pkg.problems.map((p) => p.code).join(", ") || "unpaired unit(s)"}`, [...pkg.problems.flatMap((p) => p.refs), ...pkg.unpaired.map((u) => u.ruleOrDefinitionId)]);
    if (input.snapshot && pkg.snapshotHash && pkg.snapshotHash !== input.snapshot.snapshotHash) block("ARTIFACT_IDENTITY_MISMATCH", "BLOCKING", "the package was built from a different snapshot than the one taken before verification");
    const persisted = new Map(pkg.units.map((u) => [u.ruleOrDefinitionId, u] as const));
    const drift: string[] = [];
    for (const u of input.currentUnits) {
      const p = persisted.get(unitIdOf(u));
      if (!p) { drift.push(`${unitIdOf(u)}:NOT_PERSISTED`); continue; }
      if (canonicalJson(identityOfUnit(u)) !== canonicalJson(p.verifiedIdentity)) drift.push(`${unitIdOf(u)}:IDENTITY`);
      else if (canonicalJson(u) !== canonicalJson(p.unit)) drift.push(`${unitIdOf(u)}:CONTENT`);
    }
    for (const id of persisted.keys()) if (!input.currentUnits.some((u) => unitIdOf(u) === id)) drift.push(`${id}:NOT_CURRENT`);
    if (drift.length > 0) block("ARTIFACT_IDENTITY_MISMATCH", "BLOCKING", "the units in hand are not byte-identical to the persisted verified units (identity or content changed after the snapshot)", drift);
    const weakArtifacts = pkg.units.filter((u) => !u.verifiedIdentity.compilerVersion || !u.verifiedIdentity.sourceContentVersion || !u.verifiedIdentity.irSchemaVersion);
    if (weakArtifacts.length > 0) block("SOURCE_IDENTITY_WEAK", "BLOCKING", "persisted artifact(s) carry a WEAK verified identity (missing compiler, schema or source version)", weakArtifacts.map((u) => u.ruleOrDefinitionId));
  }

  blockers.sort((a, b) => (a.severity !== b.severity ? (a.severity === "BLOCKING" ? -1 : 1) : a.code < b.code ? -1 : a.code > b.code ? 1 : 0));
  const status = blockers.some((b) => b.severity === "BLOCKING") ? "NOT_CERTIFIED" : blockers.length > 0 ? "REVIEW_REQUIRED" : "CERTIFIED";
  const unitArtifactHashes: Record<string, string> = {};
  if (pkg && status !== "NOT_CERTIFIED") for (const u of pkg.units) unitArtifactHashes[u.ruleOrDefinitionId] = u.artifactHash;
  return {
    decisionVersion: PHASE3_CERTIFICATION_DECISION_VERSION, candidateRef: input.candidate.discoveryId, status, blockers, warnings,
    sourceIdentityStrength: input.operativeIdentityStrength, semanticSourceIdentityStrength: input.semanticSourceContract?.strength ?? "WEAK",
    operativeSourceVersion: input.operativeSourceVersion, semanticSourceContractVersion: input.semanticSourceContract?.version ?? null,
    artifactPackageHash: pkg?.packageHash ?? null, snapshotHash: input.snapshot?.snapshotHash ?? null, unitIds: [...unitIds].sort(), unitArtifactHashes,
  };
}

/** The certification record for a candidate that never reached the certification step (offline reconstruction, historical evidence). Honest: NOT_CERTIFIED. */
export function uncertified(candidateRef: string, detail: string): CandidateCertification {
  return { decisionVersion: PHASE3_CERTIFICATION_DECISION_VERSION, candidateRef, status: "NOT_CERTIFIED", blockers: [{ code: "CERTIFICATION_NOT_PERFORMED", severity: "BLOCKING", detail, refs: [] }], warnings: [], sourceIdentityStrength: "WEAK", semanticSourceIdentityStrength: "WEAK", operativeSourceVersion: null, semanticSourceContractVersion: null, artifactPackageHash: null, snapshotHash: null, unitIds: [], unitArtifactHashes: {} };
}
