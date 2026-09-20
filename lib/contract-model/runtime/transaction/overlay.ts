/**
 * PHASE 4D - the explicit pro-forma financial overlay.
 *
 * An approved Phase-4B snapshot is immutable. A hypothetical transaction may state that a financial
 * input would be different, and this module represents that as an OVERLAY over the snapshot: base
 * value, stated adjustment, resulting value, side by side, with the base fact's own provenance
 * preserved.
 *
 * Two rules keep this honest:
 *   - nothing is inferred. Only inputs the caller explicitly adjusted differ; every other input
 *     reads through to the base snapshot unchanged. A transaction described as affecting some
 *     balance changes no input unless the caller says which input and by how much.
 *   - nothing is invented. An adjustment applies only where the base snapshot actually resolves the
 *     fact. Adjusting an input the approved snapshot does not supply would manufacture a financial
 *     fact, so it is refused and reported, and the capacity stays NEEDS_INPUT.
 */
import { rationalFromString } from "../decimal";
import { addAll } from "../units";
import { serializeValue } from "../values";
import { asOfSelectorFromContract, hashOf, periodSelectorFromContract } from "../input/identity";
import { FINANCIAL_INPUT_CONTRACT_VERSION } from "../input/version";
import type { InputProvenance, InputResolver, MetricQuery, RuntimeValue, StrictInputResolver } from "../types";
import type { ResolutionResult } from "../input/types";
import type { CapacityState } from "../capacity/types";
import type { ChangeMetricEffect, EventStateEffect, EventOverlayEntry, OverlayEntry, SimulationInputView, SimulationLimitation, TransactionQuantity } from "./types";

const L = { exprId: null, inputKeys: [] as string[] };

/** A caller-stated quantity as an exact Phase-4A runtime value. No float, ever. */
export function quantityToRuntimeValue(q: TransactionQuantity): RuntimeValue {
  switch (q.type) {
    case "MONEY": return { type: "MONEY", amount: rationalFromString(q.amount), currency: q.currency, lineage: L };
    case "NUMBER": return { type: "NUMBER", value: rationalFromString(q.value), lineage: L };
    case "PERCENT": return { type: "PERCENT", fraction: rationalFromString(q.fraction), lineage: L };
    case "RATIO": return { type: "RATIO", value: rationalFromString(q.value), lineage: L };
  }
}

export const quantityUnit = (q: TransactionQuantity): string => (q.type === "MONEY" ? `MONEY:${q.currency}` : q.type);
export const valueUnit = (v: RuntimeValue): string => (v.type === "MONEY" ? `MONEY:${v.currency}` : v.type);

/** Null matches anything, exactly as the Phase-4A resolver convention has it. */
const selectorMatches = (candidate: string | null, wanted: string | null): boolean => candidate === null || wanted === null || candidate === wanted;

const matchKey = (metricKey: string, period: string | null, asOf: string | null) => `${metricKey}::${period ?? "*"}::${asOf ?? "*"}`;

interface PreparedAdjustment {
  entry: OverlayEntry;
  /** The value the overlay serves when a query matches. Null when the adjustment was not applied. */
  resultValue: RuntimeValue | null;
  /** The base resolution the overlay was computed from, cloned rather than mutated. */
  baseResolution: ResolutionResult | null;
}

export interface BuiltOverlay {
  resolver: InputResolver;
  entries: OverlayEntry[];
  eventEntries: EventOverlayEntry[];
  limitations: SimulationLimitation[];
  inputViewHash: string;
  view(binding: CapacityState["snapshotBinding"]): SimulationInputView;
}

export interface BuildOverlayArgs {
  base: InputResolver;
  transactionId: string;
  companyId: string;
  instrumentKey: string;
  metricEffects: ChangeMetricEffect[];
  eventEffects: EventStateEffect[];
}

/**
 * Resolve every stated adjustment against the base snapshot once, eagerly, so the pro-forma view is
 * complete and deterministic whatever the selected capacities happen to read.
 */
export function buildOverlay(args: BuildOverlayArgs): BuiltOverlay {
  const limitations: SimulationLimitation[] = [];
  const prepared = new Map<string, PreparedAdjustment>();
  const entries: OverlayEntry[] = [];

  // One input identity may be adjusted at most once. Two adjustments of the same fact are a
  // specification the runtime will not arbitrate, so both are refused.
  const byTarget = new Map<string, ChangeMetricEffect[]>();
  for (const e of args.metricEffects) {
    const k = matchKey(e.metricKey, e.period, e.asOf);
    byTarget.set(k, [...(byTarget.get(k) ?? []), e]);
  }

  const baseStrict: StrictInputResolver | undefined = args.base.strict;

  for (const [key, effects] of [...byTarget.entries()].sort(([a], [b]) => (a < b ? -1 : 1))) {
    const conflicting = effects.length > 1;
    if (conflicting) {
      limitations.push({
        code: "AMBIGUOUS_FINANCIAL_INPUT",
        message: `${effects.length} explicit adjustments target the same financial input identity (${key}); the runtime does not combine or choose between them`,
        refs: effects.map((e) => e.effectId).sort(),
      });
    }
    for (const effect of [...effects].sort((a, b) => (a.effectId < b.effectId ? -1 : 1))) {
      const query: MetricQuery = {
        metricName: effect.metricKey, companyId: args.companyId, instrumentKey: args.instrumentKey,
        period: effect.period, asOf: effect.asOf,
        expectedType: effect.adjustment.value.type,
      };
      const strictBase = baseStrict ? baseStrict.resolveMetricStrict(query) : null;
      const looseBase = strictBase === null ? args.base.resolveMetric(query) : null;
      const baseValue: RuntimeValue | null = strictBase
        ? (strictBase.state === "RESOLVED" && strictBase.input ? strictBase.input.value : null)
        : (looseBase ? looseBase.value : null);

      const mk = (state: OverlayEntry["state"], result: RuntimeValue | null, reason: string): OverlayEntry => ({
        effectId: effect.effectId, transactionId: args.transactionId, metricKey: effect.metricKey,
        period: effect.period, asOf: effect.asOf, adjustmentKind: effect.adjustment.kind, adjustment: effect.adjustment.value,
        state, baseValue: baseValue ? serializeValue(baseValue) : null, result: result ? serializeValue(result) : null, reason,
        baseProvenance: strictBase?.provenance
          ? { snapshotId: strictBase.provenance.snapshotId, snapshotVersion: strictBase.provenance.snapshotVersion, source: strictBase.provenance.source }
          : looseBase ? { snapshotId: looseBase.provenance.snapshotId ?? null, snapshotVersion: looseBase.provenance.snapshotVersion ?? null, source: looseBase.provenance.source } : null,
      });

      if (conflicting) {
        const entry = mk("BASE_NOT_RESOLVED", null, `the same input identity is adjusted by ${effects.length} effects; no adjustment is applied`);
        entries.push(entry);
        continue;
      }
      if (!baseValue) {
        // MISSING means the approved snapshot simply does not carry the fact; every other
        // non-resolved state means it carries something the contract cannot rely on.
        const state = !strictBase || strictBase.state === "MISSING" ? "BASE_MISSING" : "BASE_NOT_RESOLVED";
        const reason = strictBase && strictBase.state !== "RESOLVED" && strictBase.state !== "MISSING"
          ? `the approved snapshot does not resolve "${effect.metricKey}" (${strictBase.state}): ${strictBase.reason}. An adjustment states how a supplied fact would differ; it never supplies one.`
          : `the approved snapshot supplies no value for "${effect.metricKey}". An adjustment states how a supplied fact would differ; it never supplies one.`;
        entries.push(mk(state, null, reason));
        limitations.push({ code: "OVERLAY_BASE_INPUT_MISSING", message: reason, refs: [effect.effectId, effect.metricKey] });
        continue;
      }

      const adjustmentValue = quantityToRuntimeValue(effect.adjustment.value);
      if (effect.adjustment.kind === "SET") {
        if (valueUnit(adjustmentValue) !== valueUnit(baseValue)) {
          const reason = `the stated value is ${valueUnit(adjustmentValue)} but the supplied fact "${effect.metricKey}" is ${valueUnit(baseValue)}; no conversion is modelled`;
          entries.push(mk("INCOMPATIBLE_UNIT", null, reason));
          limitations.push({ code: valueUnit(adjustmentValue).startsWith("MONEY") && valueUnit(baseValue).startsWith("MONEY") ? "CURRENCY_MISMATCH_NO_CONVERSION_MODELED" : "INCOMPATIBLE_UNIT", message: reason, refs: [effect.effectId, effect.metricKey] });
          continue;
        }
        const entry = mk("APPLIED", adjustmentValue, `the transaction states this input's pro-forma value outright`);
        entries.push(entry);
        prepared.set(key, { entry, resultValue: adjustmentValue, baseResolution: strictBase });
        continue;
      }

      // DELTA goes through the Phase-4A unit algebra, which refuses a mixed-unit or mixed-currency
      // sum rather than converting.
      const summed = addAll([baseValue, adjustmentValue], L);
      if (!summed.ok) {
        entries.push(mk("INCOMPATIBLE_UNIT", null, summed.message));
        limitations.push({ code: summed.code === "UNIT_MISMATCH" ? "CURRENCY_MISMATCH_NO_CONVERSION_MODELED" : "INCOMPATIBLE_UNIT", message: summed.message, refs: [effect.effectId, effect.metricKey] });
        continue;
      }
      const entry = mk("APPLIED", summed.value, `the transaction adjusts the supplied fact by an explicit delta, summed through the Phase-4A unit algebra`);
      entries.push(entry);
      prepared.set(key, { entry, resultValue: summed.value, baseResolution: strictBase });
    }
  }

  const eventEntries: EventOverlayEntry[] = [];
  const eventByKey = new Map<string, EventOverlayEntry>();
  for (const e of [...args.eventEffects].sort((a, b) => (a.effectId < b.effectId ? -1 : 1))) {
    const entry: EventOverlayEntry = { effectId: e.effectId, transactionId: args.transactionId, eventDescription: e.eventDescription, asOf: e.asOf, active: e.kind === "ACTIVATE_EVENT" };
    eventEntries.push(entry);
    eventByKey.set(matchKey(e.eventDescription, null, e.asOf), entry);
  }

  const findAdjustment = (metricName: string, period: string | null, asOf: string | null): PreparedAdjustment | null => {
    for (const [k, p] of prepared) {
      const [key, kPeriod, kAsOf] = k.split("::") as [string, string, string];
      if (key !== metricName) continue;
      if (!selectorMatches(kPeriod === "*" ? null : kPeriod, period)) continue;
      if (!selectorMatches(kAsOf === "*" ? null : kAsOf, asOf)) continue;
      return p;
    }
    return null;
  };

  const findEvent = (eventDescription: string, asOf: string | null): EventOverlayEntry | null => {
    for (const [k, e] of eventByKey) {
      const [key, , kAsOf] = k.split("::") as [string, string, string];
      if (key !== eventDescription) continue;
      if (!selectorMatches(kAsOf === "*" ? null : kAsOf, asOf)) continue;
      return e;
    }
    return null;
  };

  const overlayProvenance = (p: InputProvenance): InputProvenance => ({ ...p, note: `${p.note ? `${p.note}; ` : ""}adjusted by the explicit pro-forma overlay of transaction ${args.transactionId}` });

  const strict: StrictInputResolver | undefined = baseStrict
    ? {
        contractVersion: baseStrict.contractVersion,
        resolveMetricStrict: (q) => {
          const hit = findAdjustment(q.metricName, q.period, q.asOf);
          const base = baseStrict.resolveMetricStrict(q);
          if (!hit || !hit.resultValue || base.state !== "RESOLVED" || !base.input) return base;
          return {
            ...base,
            input: { ...base.input, value: hit.resultValue, note: `${base.input.note ? `${base.input.note}; ` : ""}pro-forma value under transaction ${args.transactionId}` },
            reason: `${base.reason}; adjusted by the explicit pro-forma overlay of transaction ${args.transactionId}`,
          };
        },
        resolveTermStrict: baseStrict.resolveTermStrict.bind(baseStrict),
        resolveLedgerUsageStrict: baseStrict.resolveLedgerUsageStrict.bind(baseStrict),
        resolveTransactionInputStrict: baseStrict.resolveTransactionInputStrict.bind(baseStrict),
        // An overlaid event is served through the loose surface, which carries an honest Phase-4D
        // provenance rather than a fabricated snapshot one; MISSING makes the evaluator read it there.
        resolveEventActiveStrict: (d, asOf, c, i) => (findEvent(d, asOf) ? { state: "MISSING", contractVersion: FINANCIAL_INPUT_CONTRACT_VERSION, query: { companyId: c, instrumentKey: i, inputKind: "EVENT", key: d, period: periodSelectorFromContract(null), asOf: asOfSelectorFromContract(asOf), expectedType: "BOOLEAN" }, input: null, provenance: null, selectionMethod: "NONE", reason: `the event state is stated by the pro-forma overlay of transaction ${args.transactionId}`, candidates: [] } : baseStrict.resolveEventActiveStrict(d, asOf, c, i)),
      }
    : undefined;

  const resolver: InputResolver = {
    ...(strict ? { strict } : {}),
    resolveMetric: (q) => {
      const hit = findAdjustment(q.metricName, q.period, q.asOf);
      const base = args.base.resolveMetric(q);
      if (!hit || !hit.resultValue || !base) return base;
      return { ...base, value: hit.resultValue, provenance: overlayProvenance(base.provenance) };
    },
    resolveTerm: (t, d, c, i) => args.base.resolveTerm(t, d, c, i),
    resolveRule: (r) => args.base.resolveRule(r),
    resolveLedgerUsage: (k) => args.base.resolveLedgerUsage(k),
    resolveTransactionInput: (n, t) => args.base.resolveTransactionInput(n, t),
    resolveEventActive: (d, asOf) => {
      const hit = findEvent(d, asOf);
      if (hit) return { active: hit.active, provenance: { source: `Phase-4D explicit pro-forma overlay of transaction ${args.transactionId}`, sourceVersion: null, note: `stated by effect ${hit.effectId}` } };
      return args.base.resolveEventActive(d, asOf);
    },
  };

  const inputViewHash = hashOf({
    adjustments: entries.map((e) => ({ metricKey: e.metricKey, period: e.period, asOf: e.asOf, kind: e.adjustmentKind, adjustment: e.adjustment, state: e.state, result: e.result })),
    events: eventEntries.map((e) => ({ eventDescription: e.eventDescription, asOf: e.asOf, active: e.active })),
  });

  return {
    resolver, entries, eventEntries, limitations, inputViewHash,
    view: (binding) => ({
      inputContractVersion: FINANCIAL_INPUT_CONTRACT_VERSION,
      baseSnapshotBinding: binding,
      adjustments: entries,
      eventAdjustments: eventEntries,
      unadjustedInputsUseBaseValues: true,
      inputViewHash,
    }),
  };
}
