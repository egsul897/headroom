/**
 * Manifest → fulfillment join (Phase 4B sibling).
 *
 * Turns a FinancialDependencyManifest into a company-specific information
 * request by resolving each leaf against the strict snapshot resolver.
 * Missing never becomes zero. Consumable by dashboard + runtime — not a report.
 *
 * CONDITIONAL leaves: an unresolved (missing/stale/ambiguous/unapproved/…)
 * conditional input does NOT become executable merely because its dependency
 * status is CONDITIONAL. Exact execution requires either APPROVED_VERIFIED, or
 * an explicit ConditionalPathDisposition proving PATH_IRRELEVANT for the
 * selected branch, or (only when policy opts in) SAFE_BOUND when
 * safeBoundAvailableWithoutThis is true.
 */
import type { IRCapacityExpression, IRDefinition, IRRule } from "../../ir/types";
import { buildFinancialDependencyManifest, type ManifestArgs } from "./manifest";
import { resolveInput } from "./resolve";
import { buildSnapshotGraph } from "./snapshot";
import type {
  DependencyRecord,
  FinancialDependencyManifest,
  FinancialSnapshot,
  InputQuery,
  ResolutionPolicy,
  ResolutionResult,
  ResolutionState,
} from "./types";
import { DEFAULT_RESOLUTION_POLICY } from "./types";
import { FINANCIAL_INPUT_CONTRACT_VERSION } from "./version";

/** Fulfillment states required by the product join (distinct from raw ResolutionState). */
export type FulfillmentState =
  | "APPROVED_VERIFIED"
  | "MISSING"
  | "STALE"
  | "AMBIGUOUS"
  | "UNSUPPORTED"
  | "NOT_APPROVED"
  | "INCOMPATIBLE";

/**
 * Caller-supplied proof that an unresolved CONDITIONAL leaf may be disregarded.
 * Never inferred silently from status === CONDITIONAL alone.
 */
export type ConditionalPathDispositionKind = "PATH_IRRELEVANT" | "SAFE_BOUND";

export interface ConditionalPathDisposition {
  /** Must match DependencyRecord.key (and optionally conditionalOn). */
  dependencyKey: string;
  kind: ConditionalPathDispositionKind;
  /**
   * Auditable proof text: which IF/SCHEDULE branch was selected and why this
   * leaf is off-path, or why a MAX/MIN literal sibling supplies a safe bound.
   */
  proof: string;
  /**
   * For PATH_IRRELEVANT: substring that must appear in dependency.conditionalOn
   * (e.g. "then-branch") proving the disposition names the off-path branch label,
   * OR the selected on-path label when paired with selectedBranchIsOnPath=false
   * for the leaf's own conditionalOn.
   */
  branchLabel?: string | null;
}

export type InformationRequestExecutionMode = "EXACT" | "SAFE_BOUND" | "NOT_EXECUTABLE";

export interface FulfillmentPolicy {
  /** Snapshots/as-of older than this ISO date are STALE even if APPROVED. */
  staleBeforeIsoDate?: string | null;
  resolution?: ResolutionPolicy;
  /**
   * Explicit dispositions for unresolved CONDITIONAL / OPTIONAL_FOR_BOUND_ONLY leaves.
   * Without a matching disposition, unresolved conditionals block exact execution.
   */
  conditionalDispositions?: readonly ConditionalPathDisposition[];
  /**
   * When true, an unresolved CONDITIONAL with safeBoundAvailableWithoutThis may
   * proceed under SAFE_BOUND if a SAFE_BOUND disposition is supplied (or if
   * requireExplicitSafeBoundDisposition is false). Default false — exact answers
   * never auto-promote to bounds.
   */
  allowSafeBoundWithoutUnresolvedConditional?: boolean;
  /**
   * When true (default), SAFE_BOUND still requires an explicit disposition entry.
   * Set false only for lab harnesses that already opted into allowSafeBound*.
   */
  requireExplicitSafeBoundDisposition?: boolean;
}

export interface FulfilledDependency {
  dependency: DependencyRecord;
  fulfillmentState: FulfillmentState;
  resolution: ResolutionResult | null;
  /** Human-facing request line when not APPROVED_VERIFIED. */
  requestText: string | null;
  /** True when evaluation may proceed using this leaf's resolved value or proven irrelevance/bound. */
  usableForExecution: boolean;
  /** Why an unresolved conditional was (or was not) cleared. */
  conditionalDispositionApplied: ConditionalPathDisposition | null;
}

export interface FinancialInformationRequest {
  contractVersion: string;
  companyId: string | null;
  instrumentKey: string | null;
  manifest: FinancialDependencyManifest;
  items: FulfilledDependency[];
  /** Leaves that block executable evaluation. */
  blocking: FulfilledDependency[];
  /** Ready for evaluateExpression with a strict resolver over the same snapshots. */
  executable: boolean;
  /** EXACT when every needed leaf is APPROVED_VERIFIED or proven PATH_IRRELEVANT; SAFE_BOUND when a bound disposition cleared a leaf; NOT_EXECUTABLE otherwise. */
  executionMode: InformationRequestExecutionMode;
  summary: Record<FulfillmentState, number>;
}

function mapResolution(state: ResolutionState, stale: boolean): FulfillmentState {
  if (state === "RESOLVED") return stale ? "STALE" : "APPROVED_VERIFIED";
  if (state === "MISSING") return "MISSING";
  if (state === "AMBIGUOUS") return "AMBIGUOUS";
  if (state === "NOT_APPROVED") return "NOT_APPROVED";
  return "INCOMPATIBLE";
}

function isStale(result: ResolutionResult, policy: FulfillmentPolicy): boolean {
  if (!policy.staleBeforeIsoDate) return false;
  if (result.state !== "RESOLVED" || !result.provenance) return false;
  const asOf =
    result.provenance.identity.asOf.kind === "EXACT_DATE"
      ? result.provenance.identity.asOf.isoDate
      : null;
  if (!asOf) return false;
  return asOf < policy.staleBeforeIsoDate;
}

function requestTextFor(dep: DependencyRecord, state: FulfillmentState): string | null {
  if (state === "APPROVED_VERIFIED") return null;
  const period =
    dep.period.kind === "VERBATIM_CONTRACT_PERIOD_KEY"
      ? ` for period "${dep.period.key}"`
      : dep.period.kind === "EXACT_PERIOD_ID"
        ? ` for period ${dep.period.periodId}`
        : "";
  const asOf =
    dep.asOf.kind === "EXACT_DATE"
      ? ` as of ${dep.asOf.isoDate}`
      : dep.asOf.kind === "VERBATIM_CONTRACT_AS_OF_KEY"
        ? ` as of "${dep.asOf.key}"`
        : "";
  const label = dep.displayNameFromContract || dep.key;
  const conditionalNote =
    dep.status === "CONDITIONAL"
      ? ` Conditional leaf${dep.conditionalOn ? ` (${dep.conditionalOn})` : ""} — unresolved unless PATH_IRRELEVANT or SAFE_BOUND disposition is proven.`
      : "";
  switch (state) {
    case "MISSING":
      return `Supply approved ${dep.inputKind.toLowerCase()} "${label}"${period}${asOf} (type ${dep.expectedType}). Missing must not be treated as zero.${conditionalNote}`;
    case "STALE":
      return `Refresh approved "${label}"${period}${asOf} — resolved fact is stale relative to evaluation policy.${conditionalNote}`;
    case "AMBIGUOUS":
      return `Resolve ambiguity for "${label}"${period}${asOf} — multiple facts match; runtime will not pick.${conditionalNote}`;
    case "NOT_APPROVED":
      return `Obtain attributable approval for "${label}"${period}${asOf} before use.${conditionalNote}`;
    case "INCOMPATIBLE":
      return `Correct type/currency identity for "${label}"${period}${asOf}.${conditionalNote}`;
    case "UNSUPPORTED":
      return `Unsupported contractual structure blocks "${label}" — cannot be satisfied by a financial input alone.`;
    default:
      return `Complete "${label}"${period}${asOf}.${conditionalNote}`;
  }
}

function queryFromDependency(dep: DependencyRecord, fallbackCompanyId: string | null): InputQuery | null {
  const companyId = dep.companyId ?? fallbackCompanyId;
  if (!companyId) return null;
  return {
    companyId,
    instrumentKey: dep.instrumentKey,
    inputKind: dep.inputKind,
    key: dep.key,
    period: dep.period,
    asOf: dep.asOf,
    expectedType: dep.expectedType,
  };
}

function dispositionsFor(
  dep: DependencyRecord,
  policy: FulfillmentPolicy,
): ConditionalPathDisposition[] {
  const all = policy.conditionalDispositions ?? [];
  return all.filter((d) => d.dependencyKey === dep.key);
}

/**
 * Prove an unresolved CONDITIONAL (or OPTIONAL_FOR_BOUND_ONLY) leaf may be cleared.
 * Returns the applied disposition, or null if the leaf still blocks.
 */
export function proveConditionalClearance(
  dep: DependencyRecord,
  fulfillmentState: FulfillmentState,
  policy: FulfillmentPolicy,
): ConditionalPathDisposition | null {
  if (fulfillmentState === "APPROVED_VERIFIED") return null;
  if (dep.status === "REQUIRED") return null;

  const matches = dispositionsFor(dep, policy);
  const pathIrrelevant = matches.find((d) => d.kind === "PATH_IRRELEVANT");
  if (pathIrrelevant) {
    const label = pathIrrelevant.branchLabel?.trim();
    if (!label) return null;
    // Disposition must name a branch that appears on this leaf's conditionalOn
    // (the off-path branch this leaf belongs to), proving the caller identified
    // the leaf's branch — not a free-form waiver.
    if (!dep.conditionalOn || !dep.conditionalOn.includes(label)) return null;
    if (!pathIrrelevant.proof.trim()) return null;
    return pathIrrelevant;
  }

  const allowBound = policy.allowSafeBoundWithoutUnresolvedConditional === true;
  if (!allowBound || !dep.safeBoundAvailableWithoutThis) return null;

  const requireExplicit = policy.requireExplicitSafeBoundDisposition !== false;
  const safeBound = matches.find((d) => d.kind === "SAFE_BOUND");
  if (requireExplicit) {
    if (!safeBound || !safeBound.proof.trim()) return null;
    return safeBound;
  }
  return (
    safeBound ?? {
      dependencyKey: dep.key,
      kind: "SAFE_BOUND",
      proof: "Policy allowSafeBoundWithoutUnresolvedConditional with safeBoundAvailableWithoutThis (lab).",
    }
  );
}

function queryMissingCompany(dep: DependencyRecord): FulfilledDependency {
  return {
    dependency: dep,
    fulfillmentState: "MISSING",
    resolution: null,
    requestText: `Cannot resolve "${dep.key}" — companyId missing on manifest and dependency.`,
    usableForExecution: false,
    conditionalDispositionApplied: null,
  };
}

/**
 * Join a dependency manifest to snapshot resolution results.
 * Unsupported manifest nodes become UNSUPPORTED fulfillment rows (no invent).
 */
export function fulfillFinancialDependencyManifest(args: {
  manifest: FinancialDependencyManifest;
  snapshots: readonly FinancialSnapshot[];
  policy?: FulfillmentPolicy;
}): FinancialInformationRequest {
  const policy: FulfillmentPolicy = args.policy ?? {};
  const resolutionPolicy = policy.resolution ?? DEFAULT_RESOLUTION_POLICY;
  const graph = buildSnapshotGraph(args.snapshots);
  const items: FulfilledDependency[] = [];

  for (const reason of args.manifest.unsupportedNodes) {
    const synthetic: DependencyRecord = {
      inputKind: "METRIC",
      key: reason.reason,
      displayNameFromContract: reason.reason,
      identityStrength: "CONTRACT_NAME_ONLY",
      companyId: args.manifest.companyId,
      instrumentKey: args.manifest.instrumentKey,
      scopeHint: "COMPANY_OR_INSTRUMENT",
      period: { kind: "NOT_PERIOD_SPECIFIC" },
      asOf: { kind: "NOT_AS_OF_SPECIFIC" },
      expectedType: "MONEY",
      status: "REQUIRED",
      conditionalOn: null,
      safeBoundAvailableWithoutThis: false,
      via: { kind: "EXPRESSION" },
      exprIds: reason.exprId ? [reason.exprId] : [],
    };
    items.push({
      dependency: synthetic,
      fulfillmentState: "UNSUPPORTED",
      resolution: null,
      requestText: requestTextFor(synthetic, "UNSUPPORTED"),
      usableForExecution: false,
      conditionalDispositionApplied: null,
    });
  }

  for (const amb of args.manifest.ambiguousExpansions) {
    const synthetic: DependencyRecord = {
      inputKind: "TERM_VALUE",
      key: amb.key,
      displayNameFromContract: amb.key,
      identityStrength: "CONTRACT_NAME_ONLY",
      companyId: args.manifest.companyId,
      instrumentKey: args.manifest.instrumentKey,
      scopeHint: "COMPANY_OR_INSTRUMENT",
      period: { kind: "NOT_PERIOD_SPECIFIC" },
      asOf: { kind: "NOT_AS_OF_SPECIFIC" },
      expectedType: "MONEY",
      status: "REQUIRED",
      conditionalOn: null,
      safeBoundAvailableWithoutThis: false,
      via: { kind: "EXPRESSION" },
      exprIds: amb.exprId ? [amb.exprId] : [],
    };
    items.push({
      dependency: synthetic,
      fulfillmentState: "AMBIGUOUS",
      resolution: null,
      requestText: `Ambiguous ${amb.kind.toLowerCase()} expansion for "${amb.key}" (candidates: ${amb.candidateIds.join(", ")}); refuse to pick.`,
      usableForExecution: false,
      conditionalDispositionApplied: null,
    });
  }

  for (const dep of args.manifest.dependencies) {
    const query = queryFromDependency(dep, args.manifest.companyId);
    if (!query) {
      items.push(queryMissingCompany(dep));
      continue;
    }
    const resolution = resolveInput({ query, snapshots: args.snapshots, policy: resolutionPolicy, graph });
    const stale = isStale(resolution, policy);
    const fulfillmentState = mapResolution(resolution.state, stale);
    const disposition = proveConditionalClearance(dep, fulfillmentState, policy);

    let usableForExecution = false;
    if (fulfillmentState === "APPROVED_VERIFIED") {
      usableForExecution = true;
    } else if (disposition?.kind === "PATH_IRRELEVANT" || disposition?.kind === "SAFE_BOUND") {
      usableForExecution = true;
    }

    items.push({
      dependency: dep,
      fulfillmentState,
      resolution,
      requestText: requestTextFor(dep, fulfillmentState),
      usableForExecution,
      conditionalDispositionApplied: disposition,
    });
  }

  const summary: Record<FulfillmentState, number> = {
    APPROVED_VERIFIED: 0,
    MISSING: 0,
    STALE: 0,
    AMBIGUOUS: 0,
    UNSUPPORTED: 0,
    NOT_APPROVED: 0,
    INCOMPATIBLE: 0,
  };
  for (const i of items) summary[i.fulfillmentState]++;

  const blocking = items.filter((i) => {
    if (i.fulfillmentState === "UNSUPPORTED") return true;
    if (i.fulfillmentState === "AMBIGUOUS" && i.dependency.status === "REQUIRED") return true;
    // Ambiguous expansions (synthetic REQUIRED) already covered; leaf AMBIGUOUS always blocks.
    if (i.fulfillmentState === "AMBIGUOUS") return true;
    if (i.fulfillmentState === "APPROVED_VERIFIED") return false;
    if (i.usableForExecution && i.conditionalDispositionApplied) return false;
    // REQUIRED unresolved always blocks.
    if (i.dependency.status === "REQUIRED") return true;
    // CONDITIONAL / OPTIONAL_FOR_BOUND_ONLY unresolved without proven clearance blocks.
    if (i.dependency.status === "CONDITIONAL" || i.dependency.status === "OPTIONAL_FOR_BOUND_ONLY") {
      return true;
    }
    return true;
  });

  const usedSafeBound = items.some((i) => i.conditionalDispositionApplied?.kind === "SAFE_BOUND");
  const executable = blocking.length === 0 && args.manifest.cycles.length === 0;
  const executionMode: InformationRequestExecutionMode = !executable
    ? "NOT_EXECUTABLE"
    : usedSafeBound
      ? "SAFE_BOUND"
      : "EXACT";

  return {
    contractVersion: FINANCIAL_INPUT_CONTRACT_VERSION,
    companyId: args.manifest.companyId,
    instrumentKey: args.manifest.instrumentKey,
    manifest: args.manifest,
    items,
    blocking,
    executable,
    executionMode,
    summary,
  };
}

/** Build manifest then fulfill in one call — primary product entry point. */
export function buildFinancialInformationRequest(args: {
  expression: IRCapacityExpression;
  snapshots: readonly FinancialSnapshot[];
  definitions?: readonly IRDefinition[];
  rules?: readonly IRRule[];
  companyId?: string | null;
  instrumentKey?: string | null;
  asOf?: string | null;
  policy?: FulfillmentPolicy;
}): FinancialInformationRequest {
  const manifestArgs: ManifestArgs = {
    expression: args.expression,
    definitions: args.definitions,
    rules: args.rules,
    companyId: args.companyId,
    instrumentKey: args.instrumentKey,
    asOf: args.asOf,
  };
  const manifest = buildFinancialDependencyManifest(manifestArgs);
  return fulfillFinancialDependencyManifest({
    manifest,
    snapshots: args.snapshots,
    policy: args.policy,
  });
}
