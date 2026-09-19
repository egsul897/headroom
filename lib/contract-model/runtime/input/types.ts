/**
 * PHASE 4B - the deterministic boundary between the Phase-4A runtime and the
 * financial truth Phase 5 will eventually supply.
 *
 * This module defines identity, not data acquisition. Nothing here parses a
 * spreadsheet, a PDF, an ERP export, a bank feed, a covenant certificate or a
 * reporting pack, and nothing here decides how any financial metric is
 * calculated - that is contract semantics (Phase 3) or a supplied fact
 * (Phase 5).
 *
 * The invariant the whole module exists to enforce: no input is ever selected
 * by array order, first match, implicit wildcard, silent period or as-of
 * fallback, company-agnostic or instrument-agnostic name equality, or a
 * latest-looking version guess.
 */
import type { IRValueType } from "../../ir/types";
import type { RuntimeValue, RuntimeValueType } from "../types";

export type InputKind = "METRIC" | "TERM_VALUE" | "LEDGER_USAGE" | "TRANSACTION_INPUT" | "EVENT";

/**
 * Which entity an input belongs to. A company-level input is reusable across
 * instruments only when it says so - reuse is represented intentionally, never
 * achieved by ignoring instrumentKey.
 */
export type InputScope =
  | { kind: "COMPANY_LEVEL"; instrumentApplicability: { kind: "ALL_INSTRUMENTS" } | { kind: "LISTED"; instrumentKeys: string[] } }
  | { kind: "INSTRUMENT_LEVEL"; instrumentKey: string };

/**
 * How strong the link between the contract reference and this input is.
 * Phase 3 often supplies only a name for a metric or term; that is preserved
 * honestly rather than dressed up as a stable key.
 */
export type IdentityStrength = "STABLE_KEY" | "CONTRACT_NAME_ONLY";

/** Period identity. Legal English is never parsed into dates here. */
export type PeriodSelector =
  | { kind: "NOT_PERIOD_SPECIFIC" }
  | { kind: "EXACT_PERIOD_ID"; periodId: string }
  /** The period text the contract itself used, carried verbatim from the Phase-3 IR. */
  | { kind: "VERBATIM_CONTRACT_PERIOD_KEY"; key: string }
  | { kind: "TRAILING_PERIOD"; spec: string };

/** As-of identity. An ISO date is a date; anything else is contract text carried verbatim. */
export type AsOfSelector =
  | { kind: "NOT_AS_OF_SPECIFIC" }
  | { kind: "EXACT_DATE"; isoDate: string }
  | { kind: "VERBATIM_CONTRACT_AS_OF_KEY"; key: string };

export interface FinancialInputIdentity {
  companyId: string;
  scope: InputScope;
  inputKind: InputKind;
  /** Metric key, term key, ledger key, transaction input name or event description - whatever stable identity the supplier has. */
  key: string;
  identityStrength: IdentityStrength;
  period: PeriodSelector;
  asOf: AsOfSelector;
  valueType: RuntimeValueType;
  /** Required when valueType is MONEY; part of identity, never converted. */
  currency: string | null;
}

export interface FinancialInput {
  identity: FinancialInputIdentity;
  value: RuntimeValue;
  /** Human-readable label. Never used for matching. */
  displayName?: string;
  /** The version of the upstream source this fact came from (a filing, a pack, a manual entry). */
  sourceVersion: string | null;
  /**
   * Set only on a TERM_VALUE that is deliberately an approved calculated fact standing in for a
   * Phase-3 definition. Without it, a supplied value that competes with an evaluable definition is
   * a conflict, not a choice (mission section 22).
   */
  overridesDefinitionId?: string;
  note?: string;
}

export type SnapshotStatus = "DRAFT" | "REVIEW_REQUIRED" | "APPROVED" | "SUPERSEDED";

/**
 * An immutable set of facts about one company as of one point. A revised
 * reporting pack is a NEW snapshot or version, never a mutation of this one.
 */
export interface FinancialSnapshot {
  snapshotId: string;
  /** Opaque. The runtime never orders versions or infers which is newer. */
  version: string;
  companyId: string;
  asOf: string | null;
  reportingPeriod: string | null;
  status: SnapshotStatus;
  /** Explicit supersession only. Null means this snapshot supersedes nothing. */
  supersedesSnapshotId: string | null;
  inputs: FinancialInput[];
  provenance: { source: string; sourceVersion: string | null; note?: string };
  review: { reviewedBy: string | null; reviewedAt: string | null; approvalRef: string | null };
}

// ---------------------------------------------------------------------------
// Resolution
// ---------------------------------------------------------------------------

export type ResolutionState = "RESOLVED" | "MISSING" | "AMBIGUOUS" | "INCOMPATIBLE" | "NOT_APPROVED";

export type SelectionMethod =
  | "EXACT_IDENTITY"
  | "EXACT_IDENTITY_AFTER_SUPERSESSION"
  | "EXACT_IDENTITY_VIA_COMPANY_LEVEL_APPLICABILITY"
  | "LATEST_ON_OR_BEFORE_AS_OF"
  | "NONE";

export type RejectionReason =
  | "COMPANY_MISMATCH"
  | "INSTRUMENT_SCOPE_MISMATCH"
  | "KIND_MISMATCH"
  | "KEY_MISMATCH"
  | "PERIOD_MISMATCH"
  | "AS_OF_MISMATCH"
  | "VALUE_TYPE_MISMATCH"
  | "CURRENCY_NOT_REQUESTED"
  | "SNAPSHOT_STATUS_NOT_ACCEPTABLE"
  | "SUPERSEDED_BY_ANOTHER_SNAPSHOT_IN_SCOPE";

export interface ResolutionCandidate {
  snapshotId: string;
  snapshotVersion: string;
  snapshotStatus: SnapshotStatus;
  identity: FinancialInputIdentity;
  /** Null when the candidate survived every filter. */
  rejectedBecause: RejectionReason | null;
}

export interface ResolvedInputProvenance {
  snapshotId: string;
  snapshotVersion: string;
  snapshotStatus: SnapshotStatus;
  source: string;
  sourceVersion: string | null;
  reviewedBy: string | null;
  reviewedAt: string | null;
  approvalRef: string | null;
  selectionMethod: SelectionMethod;
  identity: FinancialInputIdentity;
  contractVersion: string;
  /** True when the caller explicitly widened the acceptable-status policy beyond APPROVED. */
  reliedOnNonApprovedSnapshot: boolean;
}

export interface InputQuery {
  companyId: string;
  /** Null for a genuinely company-level question. */
  instrumentKey: string | null;
  inputKind: InputKind;
  key: string;
  period: PeriodSelector;
  asOf: AsOfSelector;
  /** The type the IR declares at the reference site. */
  expectedType: IRValueType | "CAPACITY";
}

export interface ResolutionResult {
  state: ResolutionState;
  contractVersion: string;
  query: InputQuery;
  input: FinancialInput | null;
  provenance: ResolvedInputProvenance | null;
  selectionMethod: SelectionMethod;
  reason: string;
  /** Every candidate considered, in canonical order, each with why it was rejected. */
  candidates: ResolutionCandidate[];
}

/** What the caller is willing to rely on. The default requires an approved snapshot and exact as-of identity. */
export interface ResolutionPolicy {
  acceptableStatuses: SnapshotStatus[];
  asOfMode: "EXACT" | "LATEST_ON_OR_BEFORE";
}

export const DEFAULT_RESOLUTION_POLICY: ResolutionPolicy = { acceptableStatuses: ["APPROVED"], asOfMode: "EXACT" };

// ---------------------------------------------------------------------------
// Term resolution
// ---------------------------------------------------------------------------

export type TermResolutionState = "RESOLVED_DEFINITION" | "RESOLVED_VALUE" | "MISSING" | "AMBIGUOUS" | "CONFLICT" | "INCOMPATIBLE" | "NOT_APPROVED";

export interface TermResolutionOutcome {
  state: TermResolutionState;
  contractVersion: string;
  reason: string;
  definition: import("../../ir/types").IRDefinition | null;
  value: ResolutionResult | null;
  /** Definitions that matched by name but failed an identity constraint. */
  rejectedDefinitions: { definitionId: string; reason: string }[];
}

// ---------------------------------------------------------------------------
// Dependency manifest
// ---------------------------------------------------------------------------

export type DependencyStatus = "REQUIRED" | "CONDITIONAL" | "OPTIONAL_FOR_BOUND_ONLY";

export interface DependencyRecord {
  inputKind: InputKind;
  key: string;
  displayNameFromContract: string;
  identityStrength: IdentityStrength;
  /** Null only when the manifest was built with no company context at all. */
  companyId: string | null;
  instrumentKey: string | null;
  scopeHint: "COMPANY_OR_INSTRUMENT" | "INSTRUMENT_LEVEL";
  period: PeriodSelector;
  asOf: AsOfSelector;
  expectedType: IRValueType | "CAPACITY";
  status: DependencyStatus;
  /** Why the dependency is conditional (the branch that must be selected). */
  conditionalOn: string | null;
  /**
   * True when a sibling operand of an enclosing MAX/MIN needs no input at all, so a safe bound
   * can be reported without this dependency. The dependency is still REQUIRED for an exact answer -
   * a bound is never complete input coverage.
   */
  safeBoundAvailableWithoutThis: boolean;
  /** Where the dependency entered: the expression itself, or a definition/rule that was expanded. */
  via: { kind: "EXPRESSION" } | { kind: "DEFINITION"; definitionId: string } | { kind: "RULE"; ruleId: string };
  exprIds: string[];
}

/** A definition or rule reference that matched more than one Phase-3 object, so it was NOT expanded. */
export interface AmbiguousExpansion {
  exprId: string | null;
  kind: "DEFINITION" | "RULE";
  key: string;
  candidateIds: string[];
}

export interface FinancialDependencyManifest {
  contractVersion: string;
  runtimeVersion: string;
  companyId: string | null;
  instrumentKey: string | null;
  rootExprId: string | null;
  ruleId: string | null;
  dependencies: DependencyRecord[];
  /** Definitions and rules expanded while building the manifest. */
  expandedObjects: { kind: "DEFINITION" | "RULE"; id: string }[];
  /** Cycles found while expanding; the manifest never loops. */
  cycles: string[][];
  /** Nodes Phase 3 marked UNSUPPORTED - no input can satisfy them. */
  unsupportedNodes: { exprId: string | null; reason: string }[];
  /**
   * References that matched more than one Phase-3 definition or rule. The manifest refuses to pick
   * one, reports the dependency as an unexpanded fact, and names every candidate.
   */
  ambiguousExpansions: AmbiguousExpansion[];
  counts: { total: number; required: number; conditional: number; optionalForBoundOnly: number };
  manifestHash: string;
}
