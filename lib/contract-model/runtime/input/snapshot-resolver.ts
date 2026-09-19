/**
 * PHASE 4B - the reference InputResolver over immutable FinancialSnapshots.
 *
 * This is what Phase 5 must satisfy. It holds facts in memory and selects them
 * deterministically; it does not fetch, parse, normalize or calculate anything.
 */
import type { IRDefinition, IRRule, IRValueType } from "../../ir/types";
import type { InputResolver, MetricInput, MetricQuery, StrictInputResolver, TermResolution } from "../types";
import { FINANCIAL_INPUT_CONTRACT_VERSION } from "./version";
import { asOfSelectorFromContract, periodSelectorFromContract } from "./identity";
import { buildSnapshotGraph, type SnapshotGraph } from "./snapshot";
import { resolveInput } from "./resolve";
import type { FinancialSnapshot, InputQuery, ResolutionPolicy, ResolutionResult, TermResolutionOutcome } from "./types";
import { DEFAULT_RESOLUTION_POLICY } from "./types";

export interface SnapshotResolverArgs {
  snapshots: readonly FinancialSnapshot[];
  /** Phase-3 objects available for expansion. Identity is enforced against them, never assumed. */
  definitions?: readonly IRDefinition[];
  rules?: readonly IRRule[];
  policy?: ResolutionPolicy;
  /** The company/instrument the evaluation is about, used when the IR node does not carry them. */
  companyId?: string;
  instrumentKey?: string | null;
}

export interface SnapshotInputResolver extends InputResolver {
  strict: StrictInputResolver;
  graph: SnapshotGraph;
  policy: ResolutionPolicy;
}

/** Adapts a strict resolution into the Phase-4A MetricInput shape, carrying the full snapshot provenance. */
export const resolutionToMetricInput = (r: ResolutionResult): MetricInput | null =>
  r.state === "RESOLVED" && r.input
    ? {
        metricKey: r.input.identity.key,
        period: r.input.identity.period.kind === "VERBATIM_CONTRACT_PERIOD_KEY" ? r.input.identity.period.key : r.input.identity.period.kind === "EXACT_PERIOD_ID" ? r.input.identity.period.periodId : null,
        asOf: r.input.identity.asOf.kind === "EXACT_DATE" ? r.input.identity.asOf.isoDate : r.input.identity.asOf.kind === "VERBATIM_CONTRACT_AS_OF_KEY" ? r.input.identity.asOf.key : null,
        value: r.input.value,
        provenance: {
          source: r.provenance!.source,
          sourceVersion: r.provenance!.sourceVersion,
          snapshotId: r.provenance!.snapshotId,
          snapshotVersion: r.provenance!.snapshotVersion,
          snapshotStatus: r.provenance!.snapshotStatus,
          reviewedBy: r.provenance!.reviewedBy,
          reviewedAt: r.provenance!.reviewedAt,
          approvalRef: r.provenance!.approvalRef,
          selectionMethod: r.provenance!.selectionMethod,
          inputContractVersion: FINANCIAL_INPUT_CONTRACT_VERSION,
          reliedOnNonApprovedSnapshot: r.provenance!.reliedOnNonApprovedSnapshot,
          identityStrength: r.provenance!.identity.identityStrength,
          currency: r.provenance!.identity.currency,
        },
      }
    : null;

export function snapshotInputResolver(args: SnapshotResolverArgs): SnapshotInputResolver {
  const snapshots = args.snapshots;
  const definitions = args.definitions ?? [];
  const rules = args.rules ?? [];
  const policy = args.policy ?? DEFAULT_RESOLUTION_POLICY;
  const graph = buildSnapshotGraph(snapshots);
  const resolve = (query: InputQuery): ResolutionResult => resolveInput({ query, snapshots, policy, graph });

  const queryFor = (kind: InputQuery["inputKind"], key: string, companyId: string, instrumentKey: string | null, period: string | null, asOf: string | null, expectedType: IRValueType | "CAPACITY"): InputQuery => ({
    companyId, instrumentKey, inputKind: kind, key, period: periodSelectorFromContract(period), asOf: asOfSelectorFromContract(asOf), expectedType,
  });

  const resolveMetricStrict = (q: MetricQuery): ResolutionResult => resolve(queryFor("METRIC", q.metricName, q.companyId, q.instrumentKey, q.period, q.asOf, q.expectedType));

  const resolveTermStrict = (termName: string, resolvedDefinitionId: string | null, companyId: string, instrumentKey: string | null, expectedType: IRValueType | "CAPACITY", period: string | null, asOf: string | null): TermResolutionOutcome => {
    const rejected: { definitionId: string; reason: string }[] = [];
    const valueResult = resolve(queryFor("TERM_VALUE", termName, companyId, instrumentKey, period, asOf, expectedType));
    const suppliedValue = valueResult.state === "RESOLVED" ? valueResult : null;

    // A stable definition id always takes precedence over a name, and never falls back to one.
    if (resolvedDefinitionId !== null) {
      const byId = definitions.filter((d) => d.definitionId === resolvedDefinitionId);
      if (byId.length === 0) return { state: "MISSING", contractVersion: FINANCIAL_INPUT_CONTRACT_VERSION, reason: `the IR names definition ${resolvedDefinitionId} for term "${termName}", and it is not available; the runtime does not fall back to a name lookup after a stable id`, definition: null, value: null, rejectedDefinitions: rejected };
      const def = byId[0]!;
      if (def.companyId !== companyId || (instrumentKey !== null && def.instrumentKey !== instrumentKey)) {
        rejected.push({ definitionId: def.definitionId, reason: `definition belongs to company ${def.companyId} / instrument ${def.instrumentKey}, the query is company ${companyId} / instrument ${instrumentKey ?? "-"}` });
        return { state: "CONFLICT", contractVersion: FINANCIAL_INPUT_CONTRACT_VERSION, reason: `definition ${resolvedDefinitionId} contradicts the reference's own company/instrument identity`, definition: null, value: null, rejectedDefinitions: rejected };
      }
      if (byId.length > 1) return { state: "AMBIGUOUS", contractVersion: FINANCIAL_INPUT_CONTRACT_VERSION, reason: `definition id ${resolvedDefinitionId} matches ${byId.length} objects`, definition: null, value: null, rejectedDefinitions: rejected };
      const override = suppliedValue?.input?.overridesDefinitionId;
      if (suppliedValue && override !== def.definitionId) return { state: "CONFLICT", contractVersion: FINANCIAL_INPUT_CONTRACT_VERSION, reason: `both an evaluable definition (${def.definitionId}) and a supplied value exist for "${termName}", and the value does not declare itself an override of that definition`, definition: def, value: valueResult, rejectedDefinitions: rejected };
      if (suppliedValue) return { state: "RESOLVED_VALUE", contractVersion: FINANCIAL_INPUT_CONTRACT_VERSION, reason: `an approved calculated fact explicitly overrides definition ${def.definitionId}`, definition: def, value: valueResult, rejectedDefinitions: rejected };
      return { state: "RESOLVED_DEFINITION", contractVersion: FINANCIAL_INPUT_CONTRACT_VERSION, reason: `resolved by stable definition id`, definition: def, value: null, rejectedDefinitions: rejected };
    }

    // Name lookup, with company and instrument identity enforced exactly.
    const byName = definitions.filter((d) => {
      if (d.termName !== termName) return false;
      if (d.companyId !== companyId) { rejected.push({ definitionId: d.definitionId, reason: `belongs to company ${d.companyId}` }); return false; }
      if (instrumentKey !== null && d.instrumentKey !== instrumentKey) { rejected.push({ definitionId: d.definitionId, reason: `belongs to instrument ${d.instrumentKey}` }); return false; }
      return true;
    }).sort((a, b) => (a.definitionId < b.definitionId ? -1 : 1));

    if (byName.length > 1) return { state: "AMBIGUOUS", contractVersion: FINANCIAL_INPUT_CONTRACT_VERSION, reason: `${byName.length} definitions named "${termName}" share this company/instrument identity (${byName.map((d) => d.definitionId).join(", ")})`, definition: null, value: null, rejectedDefinitions: rejected };
    const def = byName[0] ?? null;
    if (def && suppliedValue) {
      const override = suppliedValue.input?.overridesDefinitionId;
      if (override !== def.definitionId) return { state: "CONFLICT", contractVersion: FINANCIAL_INPUT_CONTRACT_VERSION, reason: `both an evaluable definition (${def.definitionId}) and a supplied value exist for "${termName}", and the value does not declare itself an override of that definition`, definition: def, value: valueResult, rejectedDefinitions: rejected };
      return { state: "RESOLVED_VALUE", contractVersion: FINANCIAL_INPUT_CONTRACT_VERSION, reason: `an approved calculated fact explicitly overrides definition ${def.definitionId}`, definition: def, value: valueResult, rejectedDefinitions: rejected };
    }
    if (def) return { state: "RESOLVED_DEFINITION", contractVersion: FINANCIAL_INPUT_CONTRACT_VERSION, reason: `resolved by name within the reference's own company/instrument identity`, definition: def, value: null, rejectedDefinitions: rejected };
    if (valueResult.state === "RESOLVED") return { state: "RESOLVED_VALUE", contractVersion: FINANCIAL_INPUT_CONTRACT_VERSION, reason: `no definition is available; a supplied term value satisfies the reference`, definition: null, value: valueResult, rejectedDefinitions: rejected };
    const mapped: TermResolutionOutcome["state"] = valueResult.state === "AMBIGUOUS" ? "AMBIGUOUS" : valueResult.state === "INCOMPATIBLE" ? "INCOMPATIBLE" : valueResult.state === "NOT_APPROVED" ? "NOT_APPROVED" : "MISSING";
    return { state: mapped, contractVersion: FINANCIAL_INPUT_CONTRACT_VERSION, reason: valueResult.reason, definition: null, value: valueResult, rejectedDefinitions: rejected };
  };

  const strict: StrictInputResolver = {
    contractVersion: FINANCIAL_INPUT_CONTRACT_VERSION,
    resolveMetricStrict,
    resolveTermStrict,
    resolveLedgerUsageStrict: (key, companyId, instrumentKey) => resolve(queryFor("LEDGER_USAGE", key, companyId, instrumentKey, null, null, "MONEY")),
    resolveTransactionInputStrict: (inputName, expectedType, companyId, instrumentKey) => resolve(queryFor("TRANSACTION_INPUT", inputName, companyId, instrumentKey, null, null, expectedType)),
    resolveEventActiveStrict: (eventDescription, asOf, companyId, instrumentKey) => resolve(queryFor("EVENT", eventDescription, companyId, instrumentKey, null, asOf, "BOOLEAN")),
  };

  return {
    strict,
    graph,
    policy,
    resolveMetric: (q) => resolutionToMetricInput(resolveMetricStrict(q)),
    resolveTerm: (termName, resolvedDefinitionId, companyId, instrumentKey): TermResolution => {
      const out = resolveTermStrict(termName, resolvedDefinitionId, companyId, instrumentKey, "MONEY", null, null);
      if (out.state === "RESOLVED_DEFINITION" && out.definition) return { kind: "DEFINITION", definition: out.definition };
      if (out.state === "RESOLVED_VALUE" && out.value) { const mi = resolutionToMetricInput(out.value); return mi ? { kind: "VALUE", input: mi } : null; }
      return null;
    },
    resolveRule: (ruleId) => rules.find((r) => r.ruleId === ruleId) ?? null,
    resolveLedgerUsage: (key) => resolutionToMetricInput(strict.resolveLedgerUsageStrict(key.sharedCapId ?? key.ruleId ?? "(unkeyed)", args.companyId ?? "", args.instrumentKey ?? null)),
    resolveTransactionInput: (inputName, expectedType) => resolutionToMetricInput(strict.resolveTransactionInputStrict(inputName, expectedType, args.companyId ?? "", args.instrumentKey ?? null)),
    resolveEventActive: (eventDescription, asOf) => {
      const r = strict.resolveEventActiveStrict(eventDescription, asOf, args.companyId ?? "", args.instrumentKey ?? null);
      const mi = resolutionToMetricInput(r);
      return mi && mi.value.type === "BOOLEAN" ? { active: mi.value.value, provenance: mi.provenance } : null;
    },
  };
}
