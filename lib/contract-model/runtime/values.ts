/** PHASE 4A - runtime value constructors and serialization. */
import type { EntityClassTag } from "@prisma/client";
import type { Rational } from "./decimal";
import { toCanonicalString } from "./decimal";
import type { CapacityValue, RuntimeValue, SerializedRuntimeValue, ValueLineage } from "./types";

export const lineage = (exprId: string | null, inputKeys: string[] = [], rawSource?: number | string | boolean | null): ValueLineage => (rawSource === undefined ? { exprId, inputKeys } : { exprId, inputKeys, rawSource });

export const money = (amount: Rational, currency: string, l: ValueLineage): RuntimeValue => ({ type: "MONEY", amount, currency, lineage: l });
export const number = (value: Rational, l: ValueLineage): RuntimeValue => ({ type: "NUMBER", value, lineage: l });
export const percent = (fraction: Rational, l: ValueLineage): RuntimeValue => ({ type: "PERCENT", fraction, lineage: l });
export const ratio = (value: Rational, l: ValueLineage): RuntimeValue => ({ type: "RATIO", value, lineage: l });
export const boolean = (value: boolean, l: ValueLineage): RuntimeValue => ({ type: "BOOLEAN", value, lineage: l });
export const date = (isoDate: string, l: ValueLineage): RuntimeValue => ({ type: "DATE", isoDate, lineage: l });
export const entitySet = (include: EntityClassTag[], exclude: EntityClassTag[], l: ValueLineage): RuntimeValue => ({ type: "ENTITY_SET", include, exclude, lineage: l });
export const capacity = (c: CapacityValue["capacity"], l: ValueLineage): RuntimeValue => ({ type: "CAPACITY", capacity: c, lineage: l });

/** The exact numeric payload of a numeric value, or null for non-numeric values. */
export function numericOf(v: RuntimeValue): Rational | null {
  switch (v.type) {
    case "MONEY": return v.amount;
    case "NUMBER": return v.value;
    case "PERCENT": return v.fraction;
    case "RATIO": return v.value;
    default: return null;
  }
}

/** Re-tag a value with a new lineage (e.g. after an operation). */
export function withLineage(v: RuntimeValue, l: ValueLineage): RuntimeValue { return { ...v, lineage: l }; }

export function serializeValue(v: RuntimeValue): SerializedRuntimeValue {
  switch (v.type) {
    case "MONEY": return { type: "MONEY", amount: toCanonicalString(v.amount), currency: v.currency, lineage: v.lineage };
    case "NUMBER": return { type: "NUMBER", value: toCanonicalString(v.value), lineage: v.lineage };
    case "PERCENT": return { type: "PERCENT", fraction: toCanonicalString(v.fraction), lineage: v.lineage };
    case "RATIO": return { type: "RATIO", value: toCanonicalString(v.value), lineage: v.lineage };
    case "BOOLEAN": return { type: "BOOLEAN", value: v.value, lineage: v.lineage };
    case "DATE": return { type: "DATE", isoDate: v.isoDate, lineage: v.lineage };
    case "ENTITY_SET": return { type: "ENTITY_SET", include: v.include, exclude: v.exclude, lineage: v.lineage };
    case "CAPACITY": return { type: "CAPACITY", capacity: v.capacity.kind === "AMOUNT" ? { kind: "AMOUNT", amount: toCanonicalString(v.capacity.amount), currency: v.capacity.currency } : v.capacity, lineage: v.lineage };
  }
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
/** Strict ISO YYYY-MM-DD check with calendar validity (deterministic, UTC-free). */
export function isIsoDate(s: string): boolean {
  if (!ISO_DATE.test(s)) return false;
  const [y, m, d] = s.split("-").map((x) => Number.parseInt(x, 10)) as [number, number, number];
  if (m < 1 || m > 12 || d < 1) return false;
  const leap = (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1]!;
  return d <= days;
}
