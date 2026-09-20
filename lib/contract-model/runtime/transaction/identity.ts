/**
 * PHASE 4D - canonicalization and deterministic identity.
 *
 * Identity is computed from an explicit canonical FORM, never from an arbitrary JSON
 * serialization. Every collection is declared order-sensitive or order-insensitive below, object
 * property order can never matter (the canonical JSON writer sorts keys), and every numeric payload
 * hashes from its exact value plus its unit - never from a formatted string.
 */
import { hashOf } from "../input/identity";
import type { CapacityState, LedgerUsageRecord } from "../capacity/types";
import { TRANSACTION_SIMULATION_VERSION } from "./version";
import type { HypotheticalTransaction, SelectedPath, TransactionEffect, TransactionQuantity } from "./types";

/**
 * The canonicalization contract, stated once and asserted by the identity tests.
 *
 * ORDER-SENSITIVE: the sequence is part of what the caller specified, so a different sequence is a
 * different specification and hashes differently.
 *
 * ORDER-INSENSITIVE: the collection is a SET whose order carries no legal meaning; it is sorted
 * before hashing, so a permutation is the same identity.
 *
 * EXCLUDED: carried on the result for the reader, never part of semantic identity.
 */
export const CANONICALIZATION_RULES = {
  orderSensitive: [
    "transaction.effects - the stated sequence of effects",
  ],
  orderInsensitive: [
    "transaction.entities",
    "selectedPath.capacityNodeIds",
    "selectedPath.ruleIds",
    "selectedPath.sharedCapacityIds",
    "selectedPath.reclassificationElectionIds",
    "effect.dependsOnEffectIds",
    "election.movesUsageIds",
    "snapshot identity - the snapshot id set",
  ],
  excluded: [
    "transaction.label - a display name",
    "effect.note - reader-facing text",
    "diagnostics - observability, not specification",
    "trace - observability, and its formatting",
    "complexity counters - measurement, not meaning",
    "wall-clock timestamps",
    "random or environment-specific identifiers",
  ],
  numericRule: "every quantity hashes from its exact decimal value plus its unit (currency for MONEY); no formatted string and no float ever enters identity",
  objectKeyRule: "the canonical JSON writer sorts object keys, so property insertion order cannot affect any hash",
} as const;

const sorted = (xs: readonly string[] | undefined): string[] => [...(xs ?? [])].sort();

/** Exact value plus unit. A quantity's identity is never its rendering. */
export function canonicalQuantity(q: TransactionQuantity | null | undefined): unknown {
  if (!q) return null;
  switch (q.type) {
    case "MONEY": return { unit: `MONEY:${q.currency}`, exact: q.amount };
    case "NUMBER": return { unit: "NUMBER", exact: q.value };
    case "PERCENT": return { unit: "PERCENT", exact: q.fraction };
    case "RATIO": return { unit: "RATIO", exact: q.value };
  }
}

/** The semantic form of one effect. `note` is excluded; everything that changes meaning is included. */
export function canonicalEffect(e: TransactionEffect): unknown {
  const base = { effectId: e.effectId, kind: e.kind, dependsOnEffectIds: sorted(e.dependsOnEffectIds) };
  switch (e.kind) {
    case "CONSUME_CAPACITY": return { ...base, capacityNodeId: e.capacityNodeId, amount: canonicalQuantity(e.amount) };
    case "RESTORE_CAPACITY": return { ...base, usageId: e.usageId, reason: e.reason };
    case "SUPERSEDE_LEDGER_USAGE": return { ...base, usageId: e.usageId, replacementAmount: canonicalQuantity(e.replacementAmount), reason: e.reason };
    case "APPLY_RECLASSIFICATION": return {
      ...base,
      election: {
        electionId: e.election.electionId, sourceRuleId: e.election.sourceRuleId, destinationRuleId: e.election.destinationRuleId,
        amount: canonicalQuantity({ type: "MONEY", amount: e.election.amount.amount, currency: e.election.amount.currency }),
        effectiveAsOf: e.election.effectiveAsOf, movesUsageIds: sorted(e.election.movesUsageIds),
        provenance: e.election.provenance,
      },
    };
    case "CHANGE_METRIC": return { ...base, metricKey: e.metricKey, period: e.period, asOf: e.asOf, adjustment: { kind: e.adjustment.kind, value: canonicalQuantity(e.adjustment.value) } };
    case "ACTIVATE_EVENT": case "DEACTIVATE_EVENT": return { ...base, eventDescription: e.eventDescription, asOf: e.asOf };
    default: return base;
  }
}

/** The selected path as a canonical SET of ids: a permutation is the same selection. */
export function canonicalSelectedPath(p: SelectedPath): unknown {
  return {
    capacityNodeIds: sorted(p.capacityNodeIds),
    ruleIds: sorted(p.ruleIds),
    sharedCapacityIds: sorted(p.sharedCapacityIds),
    reclassificationElectionIds: sorted(p.reclassificationElectionIds),
  };
}

/** The immutable financial identity a transaction was specified against. */
export function canonicalSnapshotIdentity(binding: CapacityState["snapshotBinding"]): unknown {
  return {
    snapshotIds: sorted(binding.snapshotIds),
    snapshotVersions: sorted(binding.snapshotVersions),
    snapshotSetHash: binding.snapshotSetHash,
    inputContractVersion: binding.inputContractVersion,
  };
}

/** The canonical semantic form of a transaction, including the path and financial identity it binds to. */
export function canonicalTransaction(tx: HypotheticalTransaction, selectedPath: SelectedPath, binding: CapacityState["snapshotBinding"]): Record<string, unknown> {
  return {
    transactionId: tx.transactionId,
    companyId: tx.companyId,
    instrumentKey: tx.instrumentKey,
    effectiveAsOf: tx.effectiveAsOf,
    category: tx.category ?? null,
    entities: sorted(tx.entities as string[] | undefined),
    intendedAmount: canonicalQuantity(tx.intendedAmount),
    unallocatedAmount: canonicalQuantity(tx.unallocatedAmount),
    effects: tx.effects.map(canonicalEffect),
    provenance: tx.provenance,
    selectedPath: canonicalSelectedPath(selectedPath),
    snapshotIdentity: canonicalSnapshotIdentity(binding),
    transactionSimulationVersion: TRANSACTION_SIMULATION_VERSION,
  };
}

export const transactionHash = (tx: HypotheticalTransaction, selectedPath: SelectedPath, binding: CapacityState["snapshotBinding"]): string =>
  hashOf(canonicalTransaction(tx, selectedPath, binding));

/** Ledger identity: the set of records the state was computed from, order-independent. */
export const ledgerHash = (ledger: readonly LedgerUsageRecord[]): string => hashOf([...ledger].map((u) => hashOf(u)).sort());

/**
 * The simulation identity. Derived only from what was specified and what it was specified against,
 * so the same specification replays to the same id. No clock, no counter, no random source.
 */
export const simulationIdOf = (parts: { transactionHash: string; preStateHash: string; inputViewHash: string; graphHash: string; ledgerHash: string }): string =>
  hashOf({ ...parts, transactionSimulationVersion: TRANSACTION_SIMULATION_VERSION });
