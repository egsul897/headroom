/**
 * PHASE 4A - deterministic in-memory InputResolver (mission §7-§8).
 *
 * This is the fixture/reference implementation of the InputResolver
 * interface: Phase 5 will supply real financial inputs behind the SAME
 * interface. Nothing here parses spreadsheets, syncs an ERP or normalizes
 * statements - it only looks values up by key, deterministically.
 */
import type { IRDefinition, IRRule, IRValueType } from "../ir/types";
import type { InputProvenance, InputResolver, MetricInput, MetricQuery, RuntimeValue, TermResolution } from "./types";

export interface FixtureInputs {
  /** Metrics by name. A metric may carry several period/as-of specific values; the first whose period AND asOf match the query (null matches anything) wins. */
  metrics?: MetricInput[];
  /** Directly supplied term values (a term with no evaluable Phase-3 definition). */
  terms?: { termName: string; input: MetricInput }[];
  /** Phase-3 definitions by definitionId AND termName (either key resolves). */
  definitions?: IRDefinition[];
  /** Phase-3 rules by ruleId (for RULE_REFERENCE operands). */
  rules?: IRRule[];
  ledgerUsage?: { sharedCapId: string | null; ruleId: string | null; input: MetricInput }[];
  transactionInputs?: { inputName: string; input: MetricInput }[];
  events?: { eventDescription: string; asOf: string | null; active: boolean; provenance: InputProvenance }[];
}

export function metricInput(metricKey: string, value: RuntimeValue, provenance: InputProvenance, period: string | null = null, asOf: string | null = null): MetricInput {
  return { metricKey, period, asOf, value, provenance };
}

function periodMatches(candidate: string | null, wanted: string | null): boolean { return candidate === null || wanted === null || candidate === wanted; }

export function fixtureInputResolver(inputs: FixtureInputs): InputResolver {
  const metrics = inputs.metrics ?? [];
  const terms = inputs.terms ?? [];
  const definitions = inputs.definitions ?? [];
  const rules = inputs.rules ?? [];
  const ledger = inputs.ledgerUsage ?? [];
  const tx = inputs.transactionInputs ?? [];
  const events = inputs.events ?? [];
  return {
    resolveMetric(q: MetricQuery): MetricInput | null {
      return metrics.find((m) => m.metricKey === q.metricName && periodMatches(m.period, q.period) && periodMatches(m.asOf, q.asOf)) ?? null;
    },
    resolveTerm(termName: string, resolvedDefinitionId: string | null): TermResolution {
      const def = definitions.find((d) => (resolvedDefinitionId !== null && d.definitionId === resolvedDefinitionId) || d.termName === termName);
      if (def) return { kind: "DEFINITION", definition: def };
      const direct = terms.find((t) => t.termName === termName);
      return direct ? { kind: "VALUE", input: direct.input } : null;
    },
    resolveRule(ruleId: string): IRRule | null { return rules.find((r) => r.ruleId === ruleId) ?? null; },
    resolveLedgerUsage(key): MetricInput | null { return ledger.find((l) => l.sharedCapId === key.sharedCapId && l.ruleId === key.ruleId)?.input ?? null; },
    resolveTransactionInput(inputName: string, _expectedType: IRValueType): MetricInput | null { return tx.find((t) => t.inputName === inputName)?.input ?? null; },
    resolveEventActive(eventDescription: string, asOf: string | null) {
      const e = events.find((x) => x.eventDescription === eventDescription && periodMatches(x.asOf, asOf));
      return e ? { active: e.active, provenance: e.provenance } : null;
    },
  };
}

/** A resolver that supplies nothing - every reference becomes NEEDS_INPUT. */
export const EMPTY_RESOLVER: InputResolver = fixtureInputResolver({});
