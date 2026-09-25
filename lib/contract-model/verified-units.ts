/**
 * VERIFIED UNIT PERSISTENCE - the Phase-3 artifact contract the strict Phase-4 boundary consumes.
 *
 * One persisted record says: THIS exact IR unit was verified by THIS exact verification result under
 * THIS exact identity. The three pieces travel together or the record does not exist.
 *
 * Why: the historical corpus kept compiled IR and verification results in separate places, on
 * separate schedules. 411 of 498 MATERIAL findings could not be bound to the unit they were about,
 * because that unit was not preserved beside the result. The strict boundary
 * (verified-execution.ts) refuses to execute without the pair. This module makes the pair the unit
 * of persistence, produced while both objects are in memory - never reconstructed later.
 *
 * What this module does NOT do: resolve finding paths to exprIds (the resolver owns that), select
 * MATERIAL findings (the resolver owns that), decide anything about execution (the gate owns that),
 * or add a boolean that claims verification happened (the result and the identity ARE the claim).
 * It also never reads a clock: the same inputs serialize to the same bytes.
 *
 * Layering: Phase-3 side. Imports the IR and verification TYPES and, for the trivial adapter at the
 * bottom, the boundary's package type - type-only. No runtime code is imported.
 */
import { createHash } from "node:crypto";
import type { IRDefinition, IRRule } from "./ir/types";
import type { SemanticVerificationResult } from "./compiler/semantic-verification/types";
import type { RuntimeVerificationIdentity } from "./runtime/verification-envelope";
import type { VerifiedExecutionPackage, VerifiedUnitArtifact } from "./verified-execution";

export const VERIFIED_UNIT_PACKAGE_SCHEMA = "p3-verified-unit-package.v1" as const;
export const VERIFIED_UNIT_MANIFEST_SCHEMA = "p3-verified-unit-manifest.v1" as const;

// ---------------------------------------------------------------------------
// Canonical serialization - the same object always produces the same bytes
// ---------------------------------------------------------------------------

/** Sorted-key JSON. Arrays keep their order (a finding list's order is the verifier's, and is part of the exact result). */
export function canonicalJson(value: unknown): string {
  const walk = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(walk);
    if (v && typeof v === "object") return Object.fromEntries(Object.keys(v as object).sort().map((k) => [k, walk((v as Record<string, unknown>)[k])]));
    return v === undefined ? null : v;
  };
  return JSON.stringify(walk(value));
}
const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

/** A structural snapshot: no shared references with the live object, and frozen all the way down. */
function snapshot<T>(value: T): T {
  const copy = JSON.parse(JSON.stringify(value)) as T;
  const freeze = (v: unknown) => { if (v && typeof v === "object" && !Object.isFrozen(v)) { Object.freeze(v); for (const x of Object.values(v as object)) freeze(x); } };
  freeze(copy);
  return copy;
}

// ---------------------------------------------------------------------------
// Identity, captured from the unit at the moment it is handed to the verifier
// ---------------------------------------------------------------------------

export type VerifiedUnitKind = "RULE" | "DEFINITION";
const unitIdOf = (u: IRRule | IRDefinition): string => ("ruleId" in u ? u.ruleId : u.definitionId);
const kindOf = (u: IRRule | IRDefinition): VerifiedUnitKind => ("ruleId" in u ? "RULE" : "DEFINITION");

/** The identity of a unit exactly as it stands - read from the unit, never from whatever IR is loaded later. */
export function identityOfUnit(u: IRRule | IRDefinition): RuntimeVerificationIdentity {
  return { ruleOrDefinitionId: unitIdOf(u), companyId: u.companyId, instrumentKey: u.instrumentKey, irSchemaVersion: u.irSchemaVersion, compilerVersion: u.compilerVersion ?? null, sourceContentVersion: u.sourceContentVersion ?? null };
}

/**
 * The units as handed to the verifier: snapshotted BEFORE verification runs, with their identity
 * captured then. Persisting from this snapshot rather than from the live objects afterwards is what
 * guarantees "the exact unit the verifier saw" - if anything downstream mutates the live IR, the
 * snapshot does not move.
 */
export interface UnitSnapshot {
  units: readonly { kind: VerifiedUnitKind; unit: IRRule | IRDefinition; verifiedIdentity: RuntimeVerificationIdentity }[];
}

export function snapshotUnitsForVerification(compiled: { rules?: readonly IRRule[] | null; definitions?: readonly IRDefinition[] | null }): UnitSnapshot {
  const all: (IRRule | IRDefinition)[] = [...(compiled.rules ?? []), ...(compiled.definitions ?? [])];
  const units = all.map((u) => ({ kind: kindOf(u), unit: snapshot(u), verifiedIdentity: identityOfUnit(u) }));
  units.sort((a, b) => (a.kind !== b.kind ? (a.kind === "DEFINITION" ? -1 : 1) : unitIdOf(a.unit) < unitIdOf(b.unit) ? -1 : unitIdOf(a.unit) > unitIdOf(b.unit) ? 1 : 0));
  return { units };
}

// ---------------------------------------------------------------------------
// The persisted artifact
// ---------------------------------------------------------------------------

/**
 * One verified unit. Structurally the boundary's VerifiedUnitArtifact plus the unit itself and an
 * artifact hash; the adapter to the boundary is the identity function on the shared fields.
 */
export interface PersistedVerifiedUnit {
  ruleOrDefinitionId: string;
  kind: VerifiedUnitKind;
  /** Captured at verification time from the unit the verifier was given. */
  verifiedIdentity: RuntimeVerificationIdentity;
  /** The complete unit, exactly as verified. Never an excerpt, never an id. */
  unit: IRRule | IRDefinition;
  /** The complete verification result, verbatim. Findings for other units of the same candidate are present too; the resolver filters by unit id. */
  verification: SemanticVerificationResult;
  /** sha256 over (id, kind, verifiedIdentity, unit, verification) in canonical form: these bytes are this verified unit. */
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
  schema: typeof VERIFIED_UNIT_PACKAGE_SCHEMA;
  companyId: string;
  instrumentKey: string;
  candidateRef: string;
  /** Caller-supplied run identity. Never a clock read inside this module. */
  runId: string;
  compilerVersion: string | null;
  verifierAlgorithmVersion: string | null;
  verificationStatus: string | null;
  /** Every verified unit, sorted definitions-then-rules by id. */
  units: PersistedVerifiedUnit[];
  /** Units the candidate compiled that could NOT be paired (no verification, or refused below), listed by id so nothing is silently omitted. */
  unpaired: { ruleOrDefinitionId: string; kind: VerifiedUnitKind; reason: PackageProblemCode }[];
  problems: PackageProblem[];
  counts: { rulesCompiled: number; definitionsCompiled: number; unitsVerified: number; artifactsPersisted: number; unitsMissingVerification: number; unitsMissingIr: number };
  /** True only when every compiled unit has a persisted artifact and no problem was found. */
  complete: boolean;
  /** sha256 over everything above in canonical form. */
  packageHash: string;
}

export interface BuildPackageArgs {
  companyId: string;
  instrumentKey: string;
  candidateRef: string;
  runId: string;
  /** From snapshotUnitsForVerification, taken before the verifier ran. */
  snapshot: UnitSnapshot;
  /** The verifier's result for this candidate, or null when the run did not verify (recorded as such, never as clean). */
  verification: SemanticVerificationResult | null;
  /**
   * Optional: the units as they stand NOW (after verification). When supplied, each is compared to
   * its snapshot identity, and a unit whose identity changed since verification is refused rather
   * than persisted under a stale claim.
   */
  currentUnits?: readonly (IRRule | IRDefinition)[];
}

/**
 * Builds the package from a pre-verification snapshot and the verification result, while both are
 * in memory. Every problem is recorded; nothing is dropped silently; `complete` is false whenever
 * anything is missing.
 */
export function buildVerifiedUnitPackage(args: BuildPackageArgs): PersistedVerifiedUnitPackage {
  const problems: PackageProblem[] = [];
  const unpaired: PersistedVerifiedUnitPackage["unpaired"] = [];
  const units: PersistedVerifiedUnit[] = [];
  const verification = args.verification ? snapshot(args.verification) : null;

  // duplicates, scope
  const ids = new Map<string, number>();
  for (const s of args.snapshot.units) ids.set(unitIdOf(s.unit), (ids.get(unitIdOf(s.unit)) ?? 0) + 1);
  const duplicates = new Set([...ids].filter(([, n]) => n > 1).map(([id]) => id));
  if (duplicates.size > 0) problems.push({ code: "DUPLICATE_UNIT_ID", message: "a unit id appears more than once in the compiled candidate", refs: [...duplicates].sort() });
  const mixedCompany = args.snapshot.units.filter((s) => s.unit.companyId !== args.companyId).map((s) => unitIdOf(s.unit)).sort();
  if (mixedCompany.length > 0) problems.push({ code: "MIXED_COMPANY", message: "unit(s) belong to another company than the package states", refs: mixedCompany });
  const mixedInstrument = args.snapshot.units.filter((s) => s.unit.instrumentKey !== args.instrumentKey).map((s) => unitIdOf(s.unit)).sort();
  if (mixedInstrument.length > 0) problems.push({ code: "MIXED_INSTRUMENT", message: "unit(s) belong to another instrument than the package states", refs: mixedInstrument });

  // identity drift between snapshot and now
  const current = new Map((args.currentUnits ?? []).map((u) => [unitIdOf(u), identityOfUnit(u)]));
  const drifted = new Set<string>();
  for (const s of args.snapshot.units) {
    const now = current.get(unitIdOf(s.unit));
    if (now && canonicalJson(now) !== canonicalJson(s.verifiedIdentity)) drifted.add(unitIdOf(s.unit));
  }
  if (drifted.size > 0) problems.push({ code: "IDENTITY_MISMATCH", message: "unit identity changed between verification and persistence; the artifact would describe a unit the verifier did not see", refs: [...drifted].sort() });

  // verification naming units the candidate did not compile
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
    units.push({ ...body, artifactHash: sha256(canonicalJson(body)) });
  }
  if (!verification && args.snapshot.units.length > 0) problems.push({ code: "IR_WITHOUT_VERIFICATION", message: "the candidate compiled but was not verified; no unit can be paired", refs: args.snapshot.units.map((s) => unitIdOf(s.unit)).sort() });
  unpaired.sort((a, b) => (a.ruleOrDefinitionId < b.ruleOrDefinitionId ? -1 : 1));
  problems.sort((a, b) => (`${a.code}|${a.refs.join(",")}` < `${b.code}|${b.refs.join(",")}` ? -1 : 1));

  const rulesCompiled = args.snapshot.units.filter((s) => s.kind === "RULE").length;
  const definitionsCompiled = args.snapshot.units.length - rulesCompiled;
  const counts = {
    rulesCompiled, definitionsCompiled,
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
    units, unpaired, problems, counts, complete,
  };
  return snapshot({ ...body, packageHash: sha256(canonicalJson(body)) });
}

/** Canonical bytes. Deterministic: the same package serializes identically every time. */
export function serializeVerifiedUnitPackage(pkg: PersistedVerifiedUnitPackage): string {
  return canonicalJson(pkg);
}

/** Parses and re-checks the package hash, so a file edited after writing is caught rather than trusted. */
export function parseVerifiedUnitPackage(text: string): PersistedVerifiedUnitPackage {
  const parsed = JSON.parse(text) as PersistedVerifiedUnitPackage;
  if (parsed.schema !== VERIFIED_UNIT_PACKAGE_SCHEMA) throw new Error(`not a verified-unit package: schema ${String(parsed.schema)}`);
  const { packageHash, ...body } = parsed;
  const expected = sha256(canonicalJson(body));
  if (expected !== packageHash) throw new Error(`verified-unit package hash mismatch: file says ${packageHash}, content hashes to ${expected}`);
  for (const u of parsed.units) {
    const { artifactHash, ...ub } = u;
    if (sha256(canonicalJson(ub)) !== artifactHash) throw new Error(`verified-unit artifact ${u.ruleOrDefinitionId} hash mismatch`);
  }
  return snapshot(parsed);
}

// ---------------------------------------------------------------------------
// Run manifest
// ---------------------------------------------------------------------------

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
  /** True only when every candidate package is complete. Never true while anything is missing. */
  complete: boolean;
}

export function buildVerifiedUnitRunManifest(args: { companyId: string; instrumentKey: string; runId: string; packages: { pkg: PersistedVerifiedUnitPackage; file: string | null }[] }): VerifiedUnitRunManifest {
  const zero: PersistedVerifiedUnitPackage["counts"] = { rulesCompiled: 0, definitionsCompiled: 0, unitsVerified: 0, artifactsPersisted: 0, unitsMissingVerification: 0, unitsMissingIr: 0 };
  const problemsByCode: Record<PackageProblemCode, number> = { IR_WITHOUT_VERIFICATION: 0, VERIFICATION_WITHOUT_IR: 0, DUPLICATE_UNIT_ID: 0, IDENTITY_MISMATCH: 0, MIXED_COMPANY: 0, MIXED_INSTRUMENT: 0 };
  const statusCounts: Record<string, number> = {};
  const sorted = [...args.packages].sort((a, b) => (a.pkg.candidateRef < b.pkg.candidateRef ? -1 : a.pkg.candidateRef > b.pkg.candidateRef ? 1 : 0));
  const candidates = sorted.map(({ pkg, file }) => {
    for (const k of Object.keys(zero) as (keyof typeof zero)[]) zero[k] += pkg.counts[k];
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

// ---------------------------------------------------------------------------
// Adapter to the strict boundary - the identity function on the shared fields
// ---------------------------------------------------------------------------

/** One persisted unit as the boundary's artifact: the same four fields, nothing added, nothing derived. */
export function toVerifiedUnitArtifact(u: PersistedVerifiedUnit): VerifiedUnitArtifact {
  return { ruleOrDefinitionId: u.ruleOrDefinitionId, kind: u.kind, verifiedIdentity: u.verifiedIdentity, result: u.verification };
}

/**
 * One or more persisted packages (the candidates of one instrument) as the boundary's execution
 * package. The IR units come from the artifacts themselves - the exact units verified - so the
 * boundary executes what was verified, not whatever IR happens to be loaded. Packages that are not
 * complete still adapt: their unpaired units are simply absent, and the boundary's own coverage
 * report and REQUIRE semantics say so.
 */
export function toVerifiedExecutionPackage(packages: readonly PersistedVerifiedUnitPackage[], sharedCapacities: VerifiedExecutionPackage["sharedCapacities"] = []): VerifiedExecutionPackage {
  const first = packages[0];
  if (!first) throw new Error("no verified-unit packages supplied");
  const units = packages.flatMap((p) => p.units);
  return {
    companyId: first.companyId, instrumentKey: first.instrumentKey,
    rules: units.filter((u) => u.kind === "RULE").map((u) => u.unit as IRRule),
    definitions: units.filter((u) => u.kind === "DEFINITION").map((u) => u.unit as IRDefinition),
    sharedCapacities,
    verifications: units.map(toVerifiedUnitArtifact),
  };
}
