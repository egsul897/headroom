/**
 * VERIFIED-UNIT PACKAGES - the paired artifact that binds an exact compiled semantic unit to the exact verification
 * result produced for it. Schema v2 (Phase 3 certification closure): a SHARED_CAPACITY is a first-class verified unit
 * alongside RULE and DEFINITION - its cap expression is independent, model-derived source semantics that changes every
 * member's capacity, so it is snapshotted, verified, hashed and bound exactly like a rule. v1 packages (rules and
 * definitions only) remain readable; nothing historical is rewritten.
 *
 * Invariant: identity stamping -> snapshot -> verification -> package. The package is built from the SNAPSHOT the
 * verifier saw; a live unit whose identity drifted after the snapshot is refused (IDENTITY_MISMATCH), never re-paired.
 */
import { createHash } from "node:crypto";
import type { IRDefinition, IRRule, IRSharedCapacity } from "./ir/types";
import type { SemanticVerificationResult } from "./compiler/semantic-verification/types";
import type { RuntimeVerificationIdentity } from "./runtime/verification-envelope";
import type { VerifiedExecutionPackage, VerifiedUnitArtifact } from "./verified-execution";

export const VERIFIED_UNIT_PACKAGE_SCHEMA = "p3-verified-unit-package.v2" as const;
export const VERIFIED_UNIT_PACKAGE_SCHEMA_V1 = "p3-verified-unit-package.v1" as const;
export const VERIFIED_UNIT_MANIFEST_SCHEMA = "p3-verified-unit-manifest.v1" as const;

/** Canonical JSON: keys sorted at every level, undefined object members dropped (as JSON.stringify does), undefined array slots -> null. */
export function canonicalJson(value: unknown): string {
  const walk = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map((x) => (x === undefined ? null : walk(x)));
    if (v && typeof v === "object") return Object.fromEntries(Object.keys(v as object).sort().filter((k) => (v as Record<string, unknown>)[k] !== undefined).map((k) => [k, walk((v as Record<string, unknown>)[k])]));
    return v;
  };
  return JSON.stringify(walk(value));
}
const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

/**
 * v2 identity hashing: the artifact and package hashes bind CONTENT. The two wall-clock keys a verification result
 * carries (`verifiedAt` on the result, `createdAt` on each finding) and the one cache-hit flag (`fromCache` on the
 * condition-suspicion result) are execution facts, not verified content: they are dropped before hashing, so the same
 * verified content produced by two runs hashes the same and the hash can enter the canonical map's own identity.
 * Nothing else is excluded. v1 packages were hashed over the full body and are still parsed that way.
 */
const VOLATILE_KEYS = new Set(["verifiedAt", "createdAt", "fromCache"]);
export function stableContentJson(value: unknown): string {
  const strip = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(strip);
    if (v && typeof v === "object") return Object.fromEntries(Object.entries(v as Record<string, unknown>).filter(([k]) => !VOLATILE_KEYS.has(k)).map(([k, x]) => [k, strip(x)]));
    return v;
  };
  return canonicalJson(strip(value));
}
const contentHash = (value: unknown) => sha256(stableContentJson(value));

function snapshot<T>(value: T): T {
  const copy = JSON.parse(JSON.stringify(value)) as T;
  const freeze = (v: unknown) => { if (v && typeof v === "object" && !Object.isFrozen(v)) { Object.freeze(v); for (const x of Object.values(v as object)) freeze(x); } };
  freeze(copy);
  return copy;
}

export type VerifiedUnitKind = "RULE" | "DEFINITION" | "SHARED_CAPACITY";
export type VerifiableUnit = IRRule | IRDefinition | IRSharedCapacity;
export const unitIdOf = (u: VerifiableUnit): string => ("ruleId" in u ? u.ruleId : "definitionId" in u ? u.definitionId : u.sharedCapId);
export const unitKindOf = (u: VerifiableUnit): VerifiedUnitKind => ("ruleId" in u ? "RULE" : "definitionId" in u ? "DEFINITION" : "SHARED_CAPACITY");
const KIND_ORDER: Record<VerifiedUnitKind, number> = { DEFINITION: 0, RULE: 1, SHARED_CAPACITY: 2 };

export function identityOfUnit(u: VerifiableUnit): RuntimeVerificationIdentity {
  return { ruleOrDefinitionId: unitIdOf(u), companyId: u.companyId, instrumentKey: u.instrumentKey, irSchemaVersion: u.irSchemaVersion ?? "", compilerVersion: u.compilerVersion ?? null, sourceContentVersion: u.sourceContentVersion ?? null };
}

export interface UnitSnapshot {
  units: readonly { kind: VerifiedUnitKind; unit: VerifiableUnit; verifiedIdentity: RuntimeVerificationIdentity }[];
  /** Content hash of the exact snapshotted units (kinds, units, identities) - what verification, packaging and Phase 4 must all refer to. */
  snapshotHash: string;
}

/** Deep-frozen copies of EVERY semantic unit (rules, definitions, shared capacities) with the identity each carried at snapshot time. Taken BEFORE verification. */
export function snapshotUnitsForVerification(compiled: { rules?: readonly IRRule[] | null; definitions?: readonly IRDefinition[] | null; sharedCapacities?: readonly IRSharedCapacity[] | null }): UnitSnapshot {
  const all: VerifiableUnit[] = [...(compiled.rules ?? []), ...(compiled.definitions ?? []), ...(compiled.sharedCapacities ?? [])];
  const units = all.map((u) => ({ kind: unitKindOf(u), unit: snapshot(u), verifiedIdentity: identityOfUnit(u) }));
  units.sort((a, b) => (a.kind !== b.kind ? KIND_ORDER[a.kind] - KIND_ORDER[b.kind] : unitIdOf(a.unit) < unitIdOf(b.unit) ? -1 : unitIdOf(a.unit) > unitIdOf(b.unit) ? 1 : 0));
  return snapshot({ units, snapshotHash: sha256(canonicalJson(units)) });
}

export interface PersistedVerifiedUnit {
  ruleOrDefinitionId: string;
  kind: VerifiedUnitKind;
  verifiedIdentity: RuntimeVerificationIdentity;
  unit: VerifiableUnit;
  verification: SemanticVerificationResult;
  artifactHash: string;
}

export type PackageProblemCode =
  | "IR_WITHOUT_VERIFICATION"
  | "VERIFICATION_WITHOUT_IR"
  | "DUPLICATE_UNIT_ID"
  | "IDENTITY_MISMATCH"
  | "MIXED_COMPANY"
  | "MIXED_INSTRUMENT";

export interface PackageProblem { code: PackageProblemCode; message: string; refs: string[] }

export interface PersistedVerifiedUnitPackage {
  schema: typeof VERIFIED_UNIT_PACKAGE_SCHEMA | typeof VERIFIED_UNIT_PACKAGE_SCHEMA_V1;
  companyId: string;
  instrumentKey: string;
  candidateRef: string;
  runId: string;
  compilerVersion: string | null;
  verifierAlgorithmVersion: string | null;
  verificationStatus: string | null;
  /** v2: the hash of the snapshot the verifier saw; every paired unit below is byte-for-byte that snapshot's unit. */
  snapshotHash?: string;
  units: PersistedVerifiedUnit[];
  unpaired: { ruleOrDefinitionId: string; kind: VerifiedUnitKind; reason: PackageProblemCode }[];
  problems: PackageProblem[];
  counts: { rulesCompiled: number; definitionsCompiled: number; sharedCapacitiesCompiled?: number; unitsVerified: number; artifactsPersisted: number; unitsMissingVerification: number; unitsMissingIr: number };
  complete: boolean;
  packageHash: string;
}

export interface BuildPackageArgs {
  companyId: string;
  instrumentKey: string;
  candidateRef: string;
  runId: string;
  snapshot: UnitSnapshot;
  verification: SemanticVerificationResult | null;
  /** The live units as they are NOW; any whose identity drifted from the snapshot is refused (IDENTITY_MISMATCH). */
  currentUnits?: readonly VerifiableUnit[];
}

export function buildVerifiedUnitPackage(args: BuildPackageArgs): PersistedVerifiedUnitPackage {
  const problems: PackageProblem[] = [];
  const unpaired: PersistedVerifiedUnitPackage["unpaired"] = [];
  const units: PersistedVerifiedUnit[] = [];
  const verification = args.verification ? snapshot(args.verification) : null;

  const ids = new Map<string, number>();
  for (const s of args.snapshot.units) ids.set(unitIdOf(s.unit), (ids.get(unitIdOf(s.unit)) ?? 0) + 1);
  const duplicates = new Set([...ids].filter(([, n]) => n > 1).map(([id]) => id));
  if (duplicates.size > 0) problems.push({ code: "DUPLICATE_UNIT_ID", message: "a unit id appears more than once in the compiled candidate", refs: [...duplicates].sort() });
  const mixedCompany = args.snapshot.units.filter((s) => s.unit.companyId !== args.companyId).map((s) => unitIdOf(s.unit)).sort();
  if (mixedCompany.length > 0) problems.push({ code: "MIXED_COMPANY", message: "unit(s) belong to another company than the package states", refs: mixedCompany });
  const mixedInstrument = args.snapshot.units.filter((s) => s.unit.instrumentKey !== args.instrumentKey).map((s) => unitIdOf(s.unit)).sort();
  if (mixedInstrument.length > 0) problems.push({ code: "MIXED_INSTRUMENT", message: "unit(s) belong to another instrument than the package states", refs: mixedInstrument });

  // identity drift AND content drift: a live unit that no longer equals the snapshot (identity or semantic content) is refused
  const current = new Map((args.currentUnits ?? []).map((u) => [unitIdOf(u), u]));
  const drifted = new Set<string>();
  for (const s of args.snapshot.units) {
    const now = current.get(unitIdOf(s.unit));
    if (!now) continue;
    if (canonicalJson(identityOfUnit(now)) !== canonicalJson(s.verifiedIdentity) || canonicalJson(now) !== canonicalJson(s.unit)) drifted.add(unitIdOf(s.unit));
  }
  if (drifted.size > 0) problems.push({ code: "IDENTITY_MISMATCH", message: "unit identity or content changed between the snapshot the verifier saw and persistence; the artifact would describe a unit the verifier did not see", refs: [...drifted].sort() });

  if (verification) {
    const named = new Set(verification.findings.map((f) => f.ruleOrDefinitionId).filter((x): x is string => typeof x === "string"));
    const missingIr = [...named].filter((id) => !ids.has(id)).sort();
    if (missingIr.length > 0) problems.push({ code: "VERIFICATION_WITHOUT_IR", message: "the verification result names unit(s) the compiled candidate does not carry; their findings cannot be bound", refs: missingIr });
  }

  for (const s of args.snapshot.units) {
    const id = unitIdOf(s.unit);
    const refuse = (reason: PackageProblemCode) => unpaired.push({ ruleOrDefinitionId: id, kind: s.kind, reason });
    if (duplicates.has(id)) { refuse("DUPLICATE_UNIT_ID"); continue; }
    if (s.unit.companyId !== args.companyId) { refuse("MIXED_COMPANY"); continue; }
    if (s.unit.instrumentKey !== args.instrumentKey) { refuse("MIXED_INSTRUMENT"); continue; }
    if (drifted.has(id)) { refuse("IDENTITY_MISMATCH"); continue; }
    if (!verification) { refuse("IR_WITHOUT_VERIFICATION"); continue; }
    const body = { ruleOrDefinitionId: id, kind: s.kind, verifiedIdentity: s.verifiedIdentity, unit: s.unit, verification };
    units.push({ ...body, artifactHash: contentHash(body) });
  }
  if (!verification && args.snapshot.units.length > 0) problems.push({ code: "IR_WITHOUT_VERIFICATION", message: "the candidate compiled but was not verified; no unit can be paired", refs: args.snapshot.units.map((s) => unitIdOf(s.unit)).sort() });
  unpaired.sort((a, b) => (a.ruleOrDefinitionId < b.ruleOrDefinitionId ? -1 : 1));
  problems.sort((a, b) => (`${a.code}|${a.refs.join(",")}` < `${b.code}|${b.refs.join(",")}` ? -1 : 1));

  const rulesCompiled = args.snapshot.units.filter((s) => s.kind === "RULE").length;
  const definitionsCompiled = args.snapshot.units.filter((s) => s.kind === "DEFINITION").length;
  const sharedCapacitiesCompiled = args.snapshot.units.filter((s) => s.kind === "SHARED_CAPACITY").length;
  const counts = {
    rulesCompiled, definitionsCompiled, sharedCapacitiesCompiled,
    unitsVerified: verification ? args.snapshot.units.length : 0,
    artifactsPersisted: units.length,
    unitsMissingVerification: unpaired.filter((u) => u.reason === "IR_WITHOUT_VERIFICATION").length,
    unitsMissingIr: problems.find((p) => p.code === "VERIFICATION_WITHOUT_IR")?.refs.length ?? 0,
  };
  const complete = problems.length === 0 && unpaired.length === 0 && units.length === args.snapshot.units.length && units.length > 0;
  const body = {
    schema: VERIFIED_UNIT_PACKAGE_SCHEMA, companyId: args.companyId, instrumentKey: args.instrumentKey, candidateRef: args.candidateRef, runId: args.runId,
    compilerVersion: args.snapshot.units[0]?.verifiedIdentity.compilerVersion ?? null,
    verifierAlgorithmVersion: verification?.verifierAlgorithmVersion ?? null,
    verificationStatus: verification?.status ?? null,
    snapshotHash: args.snapshot.snapshotHash,
    units, unpaired, problems, counts, complete,
  };
  return snapshot({ ...body, packageHash: contentHash(body) });
}

export function serializeVerifiedUnitPackage(pkg: PersistedVerifiedUnitPackage): string {
  return canonicalJson(pkg);
}

/** Reads v2 and historical v1 packages; the hash chain (package and every artifact) must verify. */
export function parseVerifiedUnitPackage(text: string): PersistedVerifiedUnitPackage {
  const parsed = JSON.parse(text) as PersistedVerifiedUnitPackage;
  if (parsed.schema !== VERIFIED_UNIT_PACKAGE_SCHEMA && parsed.schema !== VERIFIED_UNIT_PACKAGE_SCHEMA_V1) throw new Error(`not a verified-unit package: schema ${String(parsed.schema)}`);
  const hashOf = parsed.schema === VERIFIED_UNIT_PACKAGE_SCHEMA_V1 ? (v: unknown) => sha256(canonicalJson(v)) : contentHash;
  const { packageHash, ...body } = parsed;
  const expected = hashOf(body);
  if (expected !== packageHash) throw new Error(`verified-unit package hash mismatch: file says ${packageHash}, content hashes to ${expected}`);
  for (const u of parsed.units) {
    const { artifactHash, ...ub } = u;
    if (hashOf(ub) !== artifactHash) throw new Error(`verified-unit artifact ${u.ruleOrDefinitionId} hash mismatch`);
  }
  return snapshot(parsed);
}

export interface VerifiedUnitRunManifest {
  schema: typeof VERIFIED_UNIT_MANIFEST_SCHEMA;
  companyId: string;
  instrumentKey: string;
  runId: string;
  compilerVersion: string | null;
  verifierAlgorithmVersion: string | null;
  candidates: { candidateRef: string; packageFile: string | null; packageHash: string; complete: boolean; artifactHashes: string[]; counts: PersistedVerifiedUnitPackage["counts"]; problems: PackageProblemCode[] }[];
  totals: PersistedVerifiedUnitPackage["counts"] & { candidates: number; completePackages: number; incompletePackages: number; problemsByCode: Record<PackageProblemCode, number> };
  verificationStatusCounts: Record<string, number>;
  complete: boolean;
}

export function buildVerifiedUnitRunManifest(args: { companyId: string; instrumentKey: string; runId: string; packages: { pkg: PersistedVerifiedUnitPackage; file: string | null }[] }): VerifiedUnitRunManifest {
  const zero: PersistedVerifiedUnitPackage["counts"] = { rulesCompiled: 0, definitionsCompiled: 0, sharedCapacitiesCompiled: 0, unitsVerified: 0, artifactsPersisted: 0, unitsMissingVerification: 0, unitsMissingIr: 0 };
  const problemsByCode: Record<PackageProblemCode, number> = { IR_WITHOUT_VERIFICATION: 0, VERIFICATION_WITHOUT_IR: 0, DUPLICATE_UNIT_ID: 0, IDENTITY_MISMATCH: 0, MIXED_COMPANY: 0, MIXED_INSTRUMENT: 0 };
  const statusCounts: Record<string, number> = {};
  const sorted = [...args.packages].sort((a, b) => (a.pkg.candidateRef < b.pkg.candidateRef ? -1 : a.pkg.candidateRef > b.pkg.candidateRef ? 1 : 0));
  const candidates = sorted.map(({ pkg, file }) => {
    for (const k of Object.keys(zero) as (keyof typeof zero)[]) zero[k] = (zero[k] ?? 0) + (pkg.counts[k] ?? 0);
    for (const p of pkg.problems) problemsByCode[p.code]++;
    const st = pkg.verificationStatus ?? "NOT_VERIFIED_IN_RUN";
    statusCounts[st] = (statusCounts[st] ?? 0) + 1;
    return { candidateRef: pkg.candidateRef, packageFile: file, packageHash: pkg.packageHash, complete: pkg.complete, artifactHashes: pkg.units.map((u) => u.artifactHash), counts: pkg.counts, problems: [...new Set(pkg.problems.map((p) => p.code))].sort() };
  });
  const completePackages = candidates.filter((c) => c.complete).length;
  const versions = (k: "compilerVersion" | "verifierAlgorithmVersion") => { const s = [...new Set(sorted.map((p) => p.pkg[k]).filter((v): v is string => v !== null))]; return s.length === 1 ? s[0]! : s.length === 0 ? null : `MIXED(${s.sort().join(",")})`; };
  return {
    schema: VERIFIED_UNIT_MANIFEST_SCHEMA, companyId: args.companyId, instrumentKey: args.instrumentKey, runId: args.runId,
    compilerVersion: versions("compilerVersion"), verifierAlgorithmVersion: versions("verifierAlgorithmVersion"),
    candidates,
    totals: { ...zero, candidates: candidates.length, completePackages, incompletePackages: candidates.length - completePackages, problemsByCode },
    verificationStatusCounts: statusCounts,
    complete: candidates.length > 0 && completePackages === candidates.length,
  };
}

export function toVerifiedUnitArtifact(u: PersistedVerifiedUnit): VerifiedUnitArtifact {
  return { ruleOrDefinitionId: u.ruleOrDefinitionId, kind: u.kind, verifiedIdentity: u.verifiedIdentity, result: u.verification };
}

/**
 * The Phase 4 execution package is DERIVED from verified-unit packages only: rules, definitions AND shared capacities
 * come from the paired artifacts. There is no side channel for an unverified shared capacity (the v1 `sharedCapacities`
 * parameter is gone); a v1 package simply carries none.
 */
export function toVerifiedExecutionPackage(packages: readonly PersistedVerifiedUnitPackage[]): VerifiedExecutionPackage {
  const first = packages[0];
  if (!first) throw new Error("no verified-unit packages supplied");
  const units = packages.flatMap((p) => p.units);
  return {
    companyId: first.companyId, instrumentKey: first.instrumentKey,
    rules: units.filter((u) => u.kind === "RULE").map((u) => u.unit as IRRule),
    definitions: units.filter((u) => u.kind === "DEFINITION").map((u) => u.unit as IRDefinition),
    sharedCapacities: units.filter((u) => u.kind === "SHARED_CAPACITY").map((u) => u.unit as IRSharedCapacity),
    verifications: units.map(toVerifiedUnitArtifact),
  };
}
