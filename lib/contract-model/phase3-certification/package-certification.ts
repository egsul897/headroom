/**
 * PACKAGE CERTIFICATION - whether a whole instrument's map may be relied on as a certified package, and the canonical
 * manifest that records every identity behind that claim. Pure: computed from the map, the per-candidate
 * certifications and the sealed discovery population.
 *
 *   CERTIFIED        sealed COMPLETE population, every eligible candidate represented and CERTIFIED, no blocking or
 *                    review unresolved item, no review-only executable dependency, no weak identity, no incomplete
 *                    artifact, no dangling executable relationship
 *   REVIEW_REQUIRED  sound artifacts, but at least one candidate / unresolved item / edge needs a reviewer
 *   PARTIAL          the population is a declared PARTIAL_TARGET_SET, unsealed, or not fully represented - a benchmark
 *                    or targeted run is never package-certified, whatever its candidates individually are
 *   FAILED           the population hash does not match the seal, or a candidate is NOT_CERTIFIED, or a blocking
 *                    unresolved item / dangling executable relationship exists
 */
import { canonicalJson, sha256Hex } from "../covenant-map/source-content-version";
import type { CanonicalCovenantMap, CovenantMapEdgeType } from "../covenant-map/types";
import { computeCandidatePopulationHash } from "./discovery-population";
import { PHASE3_PACKAGE_CERTIFICATION_VERSION, PHASE3_PACKAGE_MANIFEST_SCHEMA, type CandidateCertification, type CertificationWarning, type DiscoveryPopulationIdentity, type PackageCertificationBlocker, type Phase3PackageCertification, type Phase3PackageCertificationManifest, type Phase3PackageManifestCandidate } from "./types";

/** Edge types Phase 4 would act on: a relationship that changes what executes or how much capacity exists. */
export const EXECUTABLE_EDGE_TYPES: ReadonlySet<CovenantMapEdgeType> = new Set<CovenantMapEdgeType>(["RULE_DEPENDS_ON_RULE", "RULE_USES_DEFINITION", "DEFINITION_USES_DEFINITION", "RULE_USES_SHARED_CAPACITY", "RULE_MODIFIED_BY_EXCEPTION", "RULE_SUBJECT_TO_GENERAL_PROHIBITION", "RULE_SUBJECT_TO_CONDITION", "RULE_SUBJECT_TO_PROVISO"]);

export interface CertifyPackageInput {
  map: CanonicalCovenantMap;
  certifications: readonly CandidateCertification[];
  discoveryPopulation: DiscoveryPopulationIdentity;
}

export function certifyPackage(input: CertifyPackageInput): Phase3PackageCertification {
  const { map } = input;
  const blockers: PackageCertificationBlocker[] = [];
  const warnings: CertificationWarning[] = [];
  const block = (code: PackageCertificationBlocker["code"], severity: PackageCertificationBlocker["severity"], detail: string, refs: string[] = []) => blockers.push({ code, severity, detail, refs: [...refs].sort() });
  const certByRef = new Map(input.certifications.map((c) => [c.candidateRef, c] as const));
  const pop = input.discoveryPopulation;

  // population: sealed, complete, exactly represented
  const representedPopulationHash = computeCandidatePopulationHash(map.candidates.map((c) => ({ discoveryId: c.discoveryId, documentId: c.documentId, normalizedSourceRef: c.sectionRef, structuralNodeIds: c.structuralNodeIds, families: c.families as never, role: c.role as never })));
  if (map.candidates.length === 0) block("NO_CANDIDATES", "FAILED", "the map has no candidates");
  if (pop.scope === "PARTIAL_TARGET_SET") block("PARTIAL_TARGET_SET", "PARTIAL", "the population is a declared partial target set; a package certification is never claimed over a subset");
  if (!pop.sealedDiscoveryIdentity) block("DISCOVERY_POPULATION_UNSEALED", "PARTIAL", "the candidate population was not sealed by discovery; its completeness cannot be asserted");
  if (representedPopulationHash !== pop.candidatePopulationHash) block("POPULATION_HASH_MISMATCH", "FAILED", "the candidates the map was assembled over are not the sealed population", [pop.candidatePopulationHash, representedPopulationHash]);
  if (pop.candidatesDiscovered !== map.candidates.length) block("POPULATION_HASH_MISMATCH", "FAILED", `the seal states ${pop.candidatesDiscovered} candidate(s); the map carries ${map.candidates.length}`);

  // candidates
  const eligible = map.candidates.filter((c) => c.outcome !== "INELIGIBLE");
  let certified = 0, review = 0, notCertified = 0, represented = 0;
  for (const c of eligible) {
    const cert = certByRef.get(c.candidateRef);
    if (!cert || c.outcome === "UNSERVED") { block("ELIGIBLE_CANDIDATE_NOT_REPRESENTED", "PARTIAL", `eligible candidate ${c.sectionRef} has no certification record (outcome ${c.outcome})`, [c.candidateRef]); continue; }
    represented++;
    if (cert.status === "CERTIFIED") certified++;
    else if (cert.status === "REVIEW_REQUIRED") { review++; block("CANDIDATE_REVIEW_REQUIRED", "REVIEW", `candidate ${c.sectionRef}: ${cert.blockers.map((b) => b.code).join(", ")}`, [c.candidateRef]); }
    else { notCertified++; block("CANDIDATE_NOT_CERTIFIED", "FAILED", `candidate ${c.sectionRef}: ${cert.blockers.map((b) => b.code).join(", ")}`, [c.candidateRef]); }
    if (cert.sourceIdentityStrength !== "STRONG" || cert.semanticSourceIdentityStrength !== "STRONG") block("WEAK_IDENTITY", "FAILED", `candidate ${c.sectionRef} has a WEAK identity`, [c.candidateRef]);
    if (cert.status !== "NOT_CERTIFIED" && !cert.artifactPackageHash) block("INCOMPLETE_ARTIFACT", "FAILED", `candidate ${c.sectionRef} has no artifact package`, [c.candidateRef]);
  }

  // unresolved items
  const blocking = map.unresolved.filter((u) => u.severity === "BLOCKING");
  if (blocking.length > 0) block("BLOCKING_UNRESOLVED_ITEM", "FAILED", `${blocking.length} blocking unresolved item(s)`, blocking.map((u) => u.unresolvedId));
  const reviewItems = map.unresolved.filter((u) => u.severity === "REVIEW");
  if (reviewItems.length > 0) block("REVIEW_UNRESOLVED_ITEM", "REVIEW", `${reviewItems.length} unresolved item(s) require review`, reviewItems.map((u) => u.unresolvedId));
  const dangling = map.unresolved.filter((u) => u.kind === "DANGLING_RULE_DEPENDENCY" || u.kind === "DANGLING_EXCEPTION_PERMISSION" || u.kind === "DANGLING_SHARED_CAPACITY_MEMBER");
  if (dangling.length > 0) block("DANGLING_EXECUTABLE_RELATIONSHIP", "FAILED", `${dangling.length} executable relationship(s) point outside the map`, dangling.map((u) => u.unresolvedId));

  // edges: an executable relationship Phase 4 would act on must be CERTIFIED_SEMANTIC
  const edges = { executable: 0, certifiedSemantic: 0, reviewOnly: 0, deterministicStructural: 0, contextualInference: 0 };
  for (const e of map.edges) {
    if (e.edgeAuthority === "CERTIFIED_SEMANTIC") edges.certifiedSemantic++;
    else if (e.edgeAuthority === "REVIEW_ONLY") edges.reviewOnly++;
    else if (e.edgeAuthority === "DETERMINISTIC_STRUCTURAL") edges.deterministicStructural++;
    else edges.contextualInference++;
    if (!EXECUTABLE_EDGE_TYPES.has(e.edgeType)) continue;
    edges.executable++;
    if (e.edgeAuthority === "REVIEW_ONLY") block("REVIEW_ONLY_EXECUTABLE_DEPENDENCY", "REVIEW", `${e.edgeType} ${e.fromNodeId} -> ${e.toNodeId} is REVIEW_ONLY (an endpoint is not certified)`, [e.edgeId]);
    else if (e.edgeAuthority !== "CERTIFIED_SEMANTIC") warnings.push({ code: "NON_SEMANTIC_EXECUTABLE_EDGE", detail: `${e.edgeType} ${e.fromNodeId} -> ${e.toNodeId} is ${e.edgeAuthority}; Phase 4 does not act on it`, refs: [e.edgeId] });
  }

  // package-level dependency bindings: a typed cross-reference is executable only when BOUND with both endpoints CERTIFIED
  const pd = map.packageDependencies;
  for (const b of pd?.bindings ?? []) {
    const what = `${b.fromNodeId} ${b.path} ${b.relationshipType ?? "CONDITION_TARGET"} "${b.exactSourceTargetRef}"`;
    if (b.status === "BOUND") { if (!b.executable) block("UNBOUND_EXECUTABLE_BINDING", "REVIEW", `${what} is bound to ${b.boundSemanticTargetIds.join(", ")} but an endpoint is not CERTIFIED`, [b.bindingId]); }
    else if (b.status === "TARGET_CANDIDATE_NOT_IN_TARGET_SET") block("DEPENDENCY_TARGET_NOT_IN_TARGET_SET", "PARTIAL", `${what}: ${b.detail}`, [b.bindingId]);
    else if (b.status === "DEPENDENCY_UNKNOWN") block("DEPENDENCY_UNKNOWN", "FAILED", `${what}: ${b.detail}`, [b.bindingId]);
    else block("DEPENDENCY_TARGET_NOT_BOUND", "REVIEW", `${what} [${b.status}]: ${b.detail}`, [b.bindingId]);
  }
  const bindings = pd?.counts ?? { total: 0, bound: 0, executable: 0, notInTargetSet: 0, notCompiled: 0, unitNotFound: 0, unknown: 0 };

  blockers.sort((a, b) => (a.code < b.code ? -1 : a.code > b.code ? 1 : 0));
  const status: Phase3PackageCertification["status"] = blockers.some((b) => b.severity === "FAILED") ? "FAILED" : blockers.some((b) => b.severity === "PARTIAL") ? "PARTIAL" : blockers.length > 0 ? "REVIEW_REQUIRED" : "CERTIFIED";
  return { version: PHASE3_PACKAGE_CERTIFICATION_VERSION, status, blockers, warnings, discoveryPopulation: pop, representedPopulationHash, candidates: { total: map.candidates.length, eligible: eligible.length, represented, certified, reviewRequired: review, notCertified }, edges, bindings };
}

export function buildPackageCertificationManifest(args: { map: CanonicalCovenantMap; certifications: readonly CandidateCertification[]; packageCertification: Phase3PackageCertification }): Phase3PackageCertificationManifest {
  const { map } = args;
  const certByRef = new Map(args.certifications.map((c) => [c.candidateRef, c] as const));
  const candidateCertifications: Phase3PackageManifestCandidate[] = map.candidates.map((c) => {
    const cert = certByRef.get(c.candidateRef);
    return {
      candidateRef: c.candidateRef, sectionRef: c.sectionRef, documentId: c.documentId, outcome: c.outcome,
      status: cert?.status ?? "NOT_CERTIFIED", blockers: cert ? cert.blockers.map((b) => b.code) : ["CERTIFICATION_NOT_PERFORMED"],
      operativeSourceVersion: cert?.operativeSourceVersion ?? null, semanticSourceContractVersion: cert?.semanticSourceContractVersion ?? null,
      artifactPackageHash: cert?.artifactPackageHash ?? null, snapshotHash: cert?.snapshotHash ?? null, unitIds: cert?.unitIds ?? [], unitArtifactHashes: cert?.unitArtifactHashes ?? {},
    };
  });
  const body: Omit<Phase3PackageCertificationManifest, "manifestHash"> = {
    schema: PHASE3_PACKAGE_MANIFEST_SCHEMA,
    sourcePackage: { companyId: map.companyId, packageKey: map.packageKey, instrumentKey: map.instrumentKey, asOfDate: map.asOfDate, documents: map.documents.map((d) => ({ documentId: d.documentId, role: d.role, textSha256: d.textSha256 })) },
    discoveryPopulation: args.packageCertification.discoveryPopulation,
    certifiedConfigIdentity: map.identity.certifiedConfigIdentity,
    mapIdentity: { mapHash: map.mapHash, mapAlgorithmVersion: map.identity.mapAlgorithmVersion, compilerAlgorithmVersion: map.identity.compilerAlgorithmVersion, verifierAlgorithmVersion: map.identity.verifierAlgorithmVersion, irSchemaVersion: map.identity.irSchemaVersion },
    candidateCertifications,
    verifiedArtifactPackageHashes: candidateCertifications.map((c) => c.artifactPackageHash).filter((h): h is string => h !== null).sort(),
    packageCertification: args.packageCertification,
  };
  return { ...body, manifestHash: sha256Hex(canonicalJson(body)) };
}
