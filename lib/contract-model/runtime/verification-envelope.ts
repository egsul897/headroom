/**
 * PHASE-4 VERIFICATION ENVELOPE - migration steps 1+2. TYPES AND IDENTITY ONLY.
 *
 * ================================ READ THIS FIRST ================================
 * NOTHING IN THIS FILE GATES ANYTHING. There is no blocksNode, no blocksUnit, no
 * dominance table and no status floor. An envelope passed into any Phase-4 entry point
 * today has EXACTLY ZERO effect on execution, deliberately and verifiably (see
 * tests/contract-model/runtime/verification-envelope.test.ts, which asserts precisely
 * that and will be INVERTED by migration step 3).
 *
 * A future maintainer should not read `policy: "REQUIRE"` as an active gate. It is
 * interface vocabulary being put in place ahead of the enforcement that will consume it.
 * =================================================================================
 *
 * Why the envelope exists at all: Phase 4 honours Phase-3 representation SUFFICIENCY in four
 * places and has never been given Phase-3 semantic VERIFICATION state. So a rule can be
 * sufficiency COMPLETE, carry a MATERIAL finding on the exact numeric its capacity expression
 * evaluates, and still hand the runtime something executable. Closing that needs the runtime to
 * receive verification state; this is the carrier, and it is deliberately the smallest one that
 * can answer "does a material finding apply to the node I am about to evaluate?".
 *
 * What it does NOT carry, by design: raw model output, compiler inventories, context bundles,
 * tool logs, non-material findings, or any whole Phase-3 verification object. The runtime gate is
 * not a transport for verifier diagnostics.
 */

/**
 * Migration vocabulary for step 4, present now so the plumbing is typed end to end.
 *
 * ALLOW_MISSING - a unit with no envelope record executes as it does today.
 * REQUIRE       - a unit with no envelope record will be treated as unverified once step 3 lands.
 *
 * IN THIS MISSION BOTH VALUES BEHAVE IDENTICALLY, because no code reads this field to make a
 * decision. REQUIRE is inert.
 */
export type VerificationGatePolicy = "ALLOW_MISSING" | "REQUIRE";

/** The default every entry point uses when a caller supplies nothing - and the only behaviour that exists today. */
export const DEFAULT_VERIFICATION_POLICY: VerificationGatePolicy = "ALLOW_MISSING";

/**
 * How firmly a unit record can be tied to the exact IR it was computed against.
 *
 * STRONG - every version field the binding relies on is present on both sides.
 * WEAK   - a nullable version field is absent, so the match cannot be proven even when nothing
 *          contradicts it. A WEAK match must never be reported as verified-clean; once step 3
 *          lands, a WEAK match carrying a MATERIAL finding still blocks.
 */
export type VerificationIdentityStrength = "STRONG" | "WEAK";

/** The identity a unit record claims to have verified. Every field is taken from the IR object itself - never from array position. */
export interface RuntimeVerificationIdentity {
  ruleOrDefinitionId: string;
  companyId: string;
  instrumentKey: string;
  irSchemaVersion: string;
  compilerVersion: string | null;
  sourceContentVersion: string | null;
}

/** Whether a finding names one specific expression node, or the compiled unit as a whole. */
export type RuntimeFindingScope = "NODE" | "UNIT";

/**
 * One MATERIAL verification finding, reduced to what a runtime gate could act on.
 *
 * `exprIds` is the predicate a future matcher will use - content-derived ids that every evaluated
 * expression node already carries, resolved Phase-3 side where the finding's positional path was
 * still meaningful. `irPathAsGiven` is audit only and must never be parsed at runtime.
 */
export interface RuntimeMaterialFinding {
  findingId: string;
  findingType: string;
  scope: RuntimeFindingScope;
  /** Non-empty only when scope is NODE. Sorted and de-duplicated. */
  exprIds: string[];
  /** Diagnostics/audit only - the path exactly as the verifier wrote it, including the unusable dialects. */
  irPathAsGiven: string | null;
  reason: string;
}

/** One compiled rule or definition, as verification saw it. */
export interface RuntimeVerificationUnit {
  identity: RuntimeVerificationIdentity;
  identityStrength: VerificationIdentityStrength;
  /** The Phase-3 status verbatim (VERIFIED_*, REVIEW_REQUIRED, MATERIAL_DISCREPANCY, VERIFICATION_INCOMPLETE, VERIFICATION_FAILED). Carried, never reinterpreted here. */
  verificationStatus: string;
  verifierAlgorithmVersion: string | null;
  /** Null when the verification result carried none - absence is preserved honestly, never synthesized. */
  evidenceSetHash: string | null;
  /** MATERIAL only. Sorted deterministically. */
  materialFindings: RuntimeMaterialFinding[];
}

export interface RuntimeVerificationEnvelope {
  envelopeVersion: string;
  companyId: string;
  instrumentKey: string;
  /** Sorted by ruleOrDefinitionId. */
  units: RuntimeVerificationUnit[];
}

export const RUNTIME_VERIFICATION_ENVELOPE_VERSION = "phase-4-verification-envelope.v1";

/** What a caller may hand any Phase-4 entry point. Both fields optional; omitting them is today's behaviour and the only behaviour. */
export interface VerificationAwareArgs {
  /** Optional. Inert in this migration - carried, never consulted. */
  verification?: RuntimeVerificationEnvelope;
  /** Optional. Inert in this migration - see VerificationGatePolicy. */
  policy?: VerificationGatePolicy;
}

// ---------------------------------------------------------------------------
// Identity binding - DETECTION ONLY (migration step 2, mission §15).
//
// These helpers make a mismatch *observable* so step 3 can fail closed on it. They impose no
// consequence themselves: nothing in the runtime calls them, and a mismatch today changes nothing.
// ---------------------------------------------------------------------------

export type IdentityMismatchField = "ruleOrDefinitionId" | "companyId" | "instrumentKey" | "irSchemaVersion" | "compilerVersion" | "sourceContentVersion";

export interface IdentityMatchResult {
  matches: boolean;
  /** Every field that disagreed, in a stable order - so a caller can say WHICH claim was stale. */
  mismatches: IdentityMismatchField[];
  strength: VerificationIdentityStrength;
}

const FIELDS: IdentityMismatchField[] = ["ruleOrDefinitionId", "companyId", "instrumentKey", "irSchemaVersion", "compilerVersion", "sourceContentVersion"];

/**
 * A unit record's identity is STRONG only when the two nullable version fields are actually
 * present. sourceContentVersion is null across every fixture inspected, so in practice most
 * envelopes are WEAK - stated rather than hidden behind an optimistic default.
 */
export function identityStrengthOf(identity: RuntimeVerificationIdentity): VerificationIdentityStrength {
  return identity.compilerVersion !== null && identity.sourceContentVersion !== null && identity.irSchemaVersion.length > 0 ? "STRONG" : "WEAK";
}

/** Compares a unit record's claimed identity against the IR object in hand. Pure; no side effects; no gating. */
export function compareVerificationIdentity(claimed: RuntimeVerificationIdentity, actual: RuntimeVerificationIdentity): IdentityMatchResult {
  const mismatches = FIELDS.filter((f) => claimed[f] !== actual[f]);
  return { matches: mismatches.length === 0, mismatches, strength: identityStrengthOf(claimed) };
}

/** The identity of an IR rule/definition as the binding sees it. Accepts either shape without importing the IR types. */
export function identityOfUnit(unit: { ruleId?: string; definitionId?: string; companyId: string; instrumentKey: string; irSchemaVersion: string; compilerVersion?: string | null; sourceContentVersion?: string | null }): RuntimeVerificationIdentity {
  return {
    ruleOrDefinitionId: unit.ruleId ?? unit.definitionId ?? "",
    companyId: unit.companyId,
    instrumentKey: unit.instrumentKey,
    irSchemaVersion: unit.irSchemaVersion,
    compilerVersion: unit.compilerVersion ?? null,
    sourceContentVersion: unit.sourceContentVersion ?? null,
  };
}

/** Looks a unit record up by id. A pure lookup - it does NOT decide anything, and it is not a gate. */
export function findVerificationUnit(envelope: RuntimeVerificationEnvelope | undefined, ruleOrDefinitionId: string): RuntimeVerificationUnit | null {
  return envelope?.units.find((u) => u.identity.ruleOrDefinitionId === ruleOrDefinitionId) ?? null;
}
