/** PHASE 4B - canonical identity keys, selector helpers and deterministic hashing. */
import { createHash } from "node:crypto";
import type { AsOfSelector, FinancialInputIdentity, FinancialSnapshot, InputQuery, InputScope, PeriodSelector } from "./types";

/** Stable JSON: object keys sorted, so a hash never depends on construction order. */
export function canonicalJson(value: unknown): string {
  // BigInt is the runtime's exact numeric representation, so it must hash, not throw.
  if (typeof value === "bigint") return JSON.stringify(`${value.toString()}n`);
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>).filter(([, v]) => v !== undefined).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(",")}}`;
}

export function hashOf(value: unknown): string {
  return createHash("sha256").update(canonicalJson(value)).digest("hex");
}

export const periodKeyOf = (p: PeriodSelector): string => (p.kind === "NOT_PERIOD_SPECIFIC" ? "NOT_PERIOD_SPECIFIC" : p.kind === "EXACT_PERIOD_ID" ? `EXACT_PERIOD_ID:${p.periodId}` : p.kind === "VERBATIM_CONTRACT_PERIOD_KEY" ? `VERBATIM:${p.key}` : `TRAILING:${p.spec}`);
export const asOfKeyOf = (a: AsOfSelector): string => (a.kind === "NOT_AS_OF_SPECIFIC" ? "NOT_AS_OF_SPECIFIC" : a.kind === "EXACT_DATE" ? `EXACT_DATE:${a.isoDate}` : `VERBATIM:${a.key}`);
export const scopeKeyOf = (s: InputScope): string => (s.kind === "INSTRUMENT_LEVEL" ? `INSTRUMENT_LEVEL:${s.instrumentKey}` : s.instrumentApplicability.kind === "ALL_INSTRUMENTS" ? "COMPANY_LEVEL:ALL" : `COMPANY_LEVEL:[${[...s.instrumentApplicability.instrumentKeys].sort().join("|")}]`);

/** The full identity key. Two inputs with the same key are the same fact and must not both be selected. */
export function identityKey(id: FinancialInputIdentity): string {
  return [id.companyId, scopeKeyOf(id.scope), id.inputKind, id.key, periodKeyOf(id.period), asOfKeyOf(id.asOf), id.valueType, id.currency ?? "-"].join("::");
}

/** Canonical sort key for candidates; used so reduction never depends on array order. */
export function candidateSortKey(snapshotId: string, version: string, id: FinancialInputIdentity): string {
  return `${identityKey(id)}::${snapshotId}::${version}`;
}

export const queryKey = (q: InputQuery): string => [q.companyId, q.instrumentKey ?? "-", q.inputKind, q.key, periodKeyOf(q.period), asOfKeyOf(q.asOf), String(q.expectedType)].join("::");

/** Deterministic content hash of a snapshot. Excludes nothing semantic; review timestamps are part of the record. */
export const snapshotHash = (s: FinancialSnapshot): string => hashOf(s);

/** Hash of a whole snapshot set, order-independent. */
export const snapshotSetHash = (snapshots: readonly FinancialSnapshot[]): string => hashOf([...snapshots].map(snapshotHash).sort());

export const periodEquals = (a: PeriodSelector, b: PeriodSelector): boolean => periodKeyOf(a) === periodKeyOf(b);
export const asOfEquals = (a: AsOfSelector, b: AsOfSelector): boolean => asOfKeyOf(a) === asOfKeyOf(b);

/**
 * Translates the Phase-3 IR's loose period/as-of strings into explicit selectors.
 * An ISO date is a date; any other text is the contract's own wording carried verbatim.
 * Nothing is parsed into a calendar range.
 */
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
export const periodSelectorFromContract = (period: string | null): PeriodSelector => (period === null ? { kind: "NOT_PERIOD_SPECIFIC" } : { kind: "VERBATIM_CONTRACT_PERIOD_KEY", key: period });
export const asOfSelectorFromContract = (asOf: string | null): AsOfSelector => (asOf === null ? { kind: "NOT_AS_OF_SPECIFIC" } : ISO_DATE.test(asOf) ? { kind: "EXACT_DATE", isoDate: asOf } : { kind: "VERBATIM_CONTRACT_AS_OF_KEY", key: asOf });
