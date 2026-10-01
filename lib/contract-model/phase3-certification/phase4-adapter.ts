/**
 * THE ONE adapter from certified Phase 3 artifacts to the Phase 4 execution package.
 *
 * It consumes CERTIFIED candidate certifications and their PERSISTED verified-unit packages - never a map node's
 * status, never raw compiler IR, never a caller's claim. The execution package is derived exclusively from the
 * persisted artifacts (toVerifiedExecutionPackage), so what Phase 4 binds is byte-for-byte what the verifier saw.
 * A certified unit whose executable relationship (dependency, exception permission, shared-capacity membership)
 * points at a unit that is not in the certified set is a dangling executable relationship: the adapter refuses
 * rather than letting Phase 4 execute half a relationship.
 */
import { parseVerifiedUnitPackage, toVerifiedExecutionPackage, type PersistedVerifiedUnitPackage } from "../verified-units";
import type { VerifiedExecutionPackage } from "../verified-execution";
import type { IRRule, IRSharedCapacity } from "../ir/types";
import type { CandidateCertification } from "./types";

export interface CertifiedCandidateArtifacts {
  certification: CandidateCertification;
  /** The persisted package, as an object or as the serialized file (parsed and hash-checked here). */
  verifiedPackage: PersistedVerifiedUnitPackage | string;
}

export type AdapterRefusalCode = "CANDIDATE_NOT_CERTIFIED" | "ARTIFACT_HASH_MISMATCH" | "PACKAGE_INCOMPLETE" | "PACKAGE_UNREADABLE" | "DANGLING_EXECUTABLE_RELATIONSHIP" | "MIXED_INSTRUMENT" | "NO_CERTIFIED_ARTIFACTS";
export interface AdapterRefusal { code: AdapterRefusalCode; detail: string; refs: string[] }

export type CertifiedExecutionPackageResult =
  | { outcome: "REFUSED"; refusals: AdapterRefusal[]; included: string[]; excluded: { candidateRef: string; status: CandidateCertification["status"]; blockers: string[] }[] }
  | { outcome: "DERIVED"; package: VerifiedExecutionPackage; included: string[]; excluded: { candidateRef: string; status: CandidateCertification["status"]; blockers: string[] }[]; artifactPackageHashes: string[] };

/**
 * `candidates` is the full certification set; only CERTIFIED entries contribute. Every excluded candidate is listed,
 * so a consumer can never mistake a partial package for the whole instrument.
 */
export function certifiedMapToVerifiedExecutionPackage(candidates: readonly CertifiedCandidateArtifacts[]): CertifiedExecutionPackageResult {
  const refusals: AdapterRefusal[] = [];
  const included: string[] = [];
  const excluded: { candidateRef: string; status: CandidateCertification["status"]; blockers: string[] }[] = [];
  const packages: PersistedVerifiedUnitPackage[] = [];
  for (const c of candidates) {
    const cert = c.certification;
    if (cert.status !== "CERTIFIED") { excluded.push({ candidateRef: cert.candidateRef, status: cert.status, blockers: cert.blockers.map((b) => b.code) }); continue; }
    let pkg: PersistedVerifiedUnitPackage;
    try { pkg = typeof c.verifiedPackage === "string" ? parseVerifiedUnitPackage(c.verifiedPackage) : c.verifiedPackage; }
    catch (err) { refusals.push({ code: "PACKAGE_UNREADABLE", detail: err instanceof Error ? err.message : String(err), refs: [cert.candidateRef] }); continue; }
    if (pkg.packageHash !== cert.artifactPackageHash) { refusals.push({ code: "ARTIFACT_HASH_MISMATCH", detail: `certification of ${cert.candidateRef} names package ${cert.artifactPackageHash}; the supplied package hashes to ${pkg.packageHash}`, refs: [cert.candidateRef] }); continue; }
    if (!pkg.complete || pkg.candidateRef !== cert.candidateRef) { refusals.push({ code: "PACKAGE_INCOMPLETE", detail: `package for ${cert.candidateRef} is incomplete or belongs to another candidate`, refs: [cert.candidateRef] }); continue; }
    for (const u of pkg.units) if (cert.unitArtifactHashes[u.ruleOrDefinitionId] !== u.artifactHash) refusals.push({ code: "ARTIFACT_HASH_MISMATCH", detail: `unit ${u.ruleOrDefinitionId} artifact hash differs from the certification record`, refs: [cert.candidateRef, u.ruleOrDefinitionId] });
    included.push(cert.candidateRef);
    packages.push(pkg);
  }
  if (packages.length === 0 && refusals.length === 0) refusals.push({ code: "NO_CERTIFIED_ARTIFACTS", detail: "no CERTIFIED candidate artifacts were supplied", refs: [] });
  const instruments = new Set(packages.map((p) => `${p.companyId}|${p.instrumentKey}`));
  if (instruments.size > 1) refusals.push({ code: "MIXED_INSTRUMENT", detail: "certified packages belong to more than one instrument", refs: [...instruments].sort() });
  if (refusals.length > 0) return { outcome: "REFUSED", refusals, included, excluded };

  const pkg = toVerifiedExecutionPackage(packages);
  const ids = new Set([...pkg.rules.map((r) => r.ruleId), ...(pkg.definitions ?? []).map((d) => d.definitionId), ...(pkg.sharedCapacities ?? []).map((c) => c.sharedCapId)]);
  const dangling: string[] = [];
  for (const r of pkg.rules as readonly IRRule[]) {
    for (const d of r.dependsOn) if (!ids.has(d.targetRuleId)) dangling.push(`${r.ruleId} dependsOn ${d.targetRuleId}`);
    for (const e of r.exceptions) if (e.permissionRuleId && !ids.has(e.permissionRuleId)) dangling.push(`${r.ruleId} exception ${e.exceptionId} -> ${e.permissionRuleId}`);
  }
  for (const c of (pkg.sharedCapacities ?? []) as readonly IRSharedCapacity[]) for (const m of c.memberRuleIds) if (!ids.has(m)) dangling.push(`${c.sharedCapId} member ${m}`);
  if (dangling.length > 0) return { outcome: "REFUSED", refusals: [{ code: "DANGLING_EXECUTABLE_RELATIONSHIP", detail: "certified unit(s) carry an executable relationship to a unit outside the certified set; Phase 4 never executes half a relationship", refs: dangling.sort() }], included, excluded };
  return { outcome: "DERIVED", package: pkg, included, excluded, artifactPackageHashes: packages.map((p) => p.packageHash).sort() };
}
