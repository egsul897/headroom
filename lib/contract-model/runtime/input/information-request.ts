/**
 * Manifest → fulfillment join (Phase 4B sibling).
 *
 * Turns a FinancialDependencyManifest into a company-specific information
 * request by resolving each leaf against the strict snapshot resolver.
 * Missing never becomes zero. Consumable by dashboard + runtime — not a report.
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

export interface FulfillmentPolicy {
  /** Snapshots/as-of older than this ISO date are STALE even if APPROVED. */
  staleBeforeIsoDate?: string | null;
  resolution?: ResolutionPolicy;
}

export interface FulfilledDependency {
  dependency: DependencyRecord;
  fulfillmentState: FulfillmentState;
  resolution: ResolutionResult | null;
  /** Human-facing request line when not APPROVED_VERIFIED. */
  requestText: string | null;
  /** True when evaluation may proceed using this leaf's resolved value. */
  usableForExecution: boolean;
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
  // Prefer snapshot as-of from identity; when absent, cannot claim stale from date alone.
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
  switch (state) {
    case "MISSING":
      return `Supply approved ${dep.inputKind.toLowerCase()} "${label}"${period}${asOf} (type ${dep.expectedType}). Missing must not be treated as zero.`;
    case "STALE":
      return `Refresh approved "${label}"${period}${asOf} — resolved fact is stale relative to evaluation policy.`;
    case "AMBIGUOUS":
      return `Resolve ambiguity for "${label}"${period}${asOf} — multiple facts match; runtime will not pick.`;
    case "NOT_APPROVED":
      return `Obtain attributable approval for "${label}"${period}${asOf} before use.`;
    case "INCOMPATIBLE":
      return `Correct type/currency identity for "${label}"${period}${asOf}.`;
    case "UNSUPPORTED":
      return `Unsupported contractual structure blocks "${label}" — cannot be satisfied by a financial input alone.`;
    default:
      return `Complete "${label}"${period}${asOf}.`;
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
    });
  }

  for (const dep of args.manifest.dependencies) {
    const query = queryFromDependency(dep, args.manifest.companyId);
    if (!query) {
      items.push({
        dependency: dep,
        fulfillmentState: "MISSING",
        resolution: null,
        requestText: `Cannot resolve "${dep.key}" — companyId missing on manifest and dependency.`,
        usableForExecution: false,
      });
      continue;
    }
    const resolution = resolveInput({ query, snapshots: args.snapshots, policy: resolutionPolicy, graph });
    const stale = isStale(resolution, policy);
    const fulfillmentState = mapResolution(resolution.state, stale);
    const usableForExecution = fulfillmentState === "APPROVED_VERIFIED" || dep.status === "CONDITIONAL";
    // CONDITIONAL leaves that are missing do not block exact answers alone when a bound exists —
    // but REQUIRED missing always blocks.
    const blocks =
      dep.status === "REQUIRED" && fulfillmentState !== "APPROVED_VERIFIED"
        ? true
        : false;
    items.push({
      dependency: dep,
      fulfillmentState,
      resolution,
      requestText: requestTextFor(dep, fulfillmentState),
      usableForExecution: !blocks && (fulfillmentState === "APPROVED_VERIFIED" || dep.status !== "REQUIRED"),
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
    if (i.fulfillmentState === "UNSUPPORTED" || i.fulfillmentState === "AMBIGUOUS") return true;
    if (i.dependency.status !== "REQUIRED") return false;
    return i.fulfillmentState !== "APPROVED_VERIFIED";
  });

  return {
    contractVersion: FINANCIAL_INPUT_CONTRACT_VERSION,
    companyId: args.manifest.companyId,
    instrumentKey: args.manifest.instrumentKey,
    manifest: args.manifest,
    items,
    blocking,
    executable: blocking.length === 0 && args.manifest.cycles.length === 0,
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
