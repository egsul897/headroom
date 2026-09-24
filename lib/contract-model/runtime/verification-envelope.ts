/**
 * PHASE-4 VERIFICATION ENVELOPE - the carrier. TYPES AND IDENTITY ONLY.
 *
 * Migration steps 1+2 put this interface in place and proved it inert. Migration step 3 made it
 * LIVE: runtime/verification-gate.ts now reads an envelope supplied to any Phase-4 entry point and
 * imposes the approved semantics (a MATERIAL finding on the exact node blocks that node; a UNIT
 * finding, an identity mismatch or - under REQUIRE - a missing record blocks the whole unit). This
 * file still gates nothing itself: it defines what is carried and how identity is compared. The
 * semantics live in ONE place, verification-gate.ts, and the four runtime sites ask it.
 *
 * Why the envelope exists at all: Phase 4 honours Phase-3 representation SUFFICIENCY in four
 * places and had never been given Phase-3 semantic VERIFICATION state. So a rule could be
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
 * How a runtime call treats a unit with NO verification record.
 *
 * ALLOW_MISSING - the unit executes as it always has. The default for every runtime primitive, so
 *                 historical fixtures and Phase-4 gate artifacts keep their exact meaning.
 * REQUIRE       - the unit fails closed: absence of verification is not evidence of correctness.
 *                 Live since migration step 3 for any caller that states it. NOT the default
 *                 anywhere, and no product caller states it yet (that is migration step 4).
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

/** What a caller may hand any Phase-4 entry point. Both optional; omitting both is the legacy behaviour, byte for byte. */
export interface VerificationAwareArgs {
  /** Optional. When supplied, verification-gate.ts acts on it. */
  verification?: RuntimeVerificationEnvelope;
  /** Optional. Defaults to ALLOW_MISSING - see VerificationGatePolicy. */
  policy?: VerificationGatePolicy;
}

// ---------------------------------------------------------------------------
// The shape of a refusal (produced by verification-gate.ts, carried on 4A diagnostics)
// ---------------------------------------------------------------------------

export type VerificationBlockReason =
  /** A MATERIAL NODE finding names exactly the evaluated exprId. */
  | "MATERIAL_NODE_FINDING"
  /** A MATERIAL finding on the unit could not be scoped to a node, so the whole unit is refused. */
  | "MATERIAL_UNIT_FINDING"
  /** The record's identity disagrees with the IR in hand; nothing is salvaged from it. */
  | "IDENTITY_MISMATCH"
  /** Policy REQUIRE and no record exists for the unit. */
  | "REQUIRED_VERIFICATION_MISSING"
  /** More than one record claims the unit; none is chosen. */
  | "AMBIGUOUS_UNIT_RECORD";

export interface VerificationBlock {
  reason: VerificationBlockReason;
  scope: RuntimeFindingScope;
  unitId: string;
  /** The blocked node, for NODE scope; null for a whole-unit block. */
  exprId: string | null;
  /** Sorted. Empty for REQUIRED_VERIFICATION_MISSING. */
  findingIds: string[];
  /** Populated for IDENTITY_MISMATCH only. */
  mismatches: IdentityMismatchField[];
  identityStrength: VerificationIdentityStrength | null;
  message: string;
}

// ---------------------------------------------------------------------------
// Identity binding - comparison helpers. verification-gate.ts fails closed on a mismatch.
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

/** Compares a unit record's claimed identity against the IR object in hand, on every field. Pure. */
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

/** Looks a unit record up by id. A pure lookup; the gate's own lookup additionally refuses duplicates. */
export function findVerificationUnit(envelope: RuntimeVerificationEnvelope | undefined, ruleOrDefinitionId: string): RuntimeVerificationUnit | null {
  return envelope?.units.find((u) => u.identity.ruleOrDefinitionId === ruleOrDefinitionId) ?? null;
}
