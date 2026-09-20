/**
 * PHASE 4A - deterministic unit algebra (mission §11-§12).
 *
 * Every operation is total: it returns either a typed value or a structured
 * failure (code + message). No coercion: MONEY + PERCENT, DATE + MONEY,
 * MONEY(USD) + MONEY(EUR) are failures, never guesses. FX conversion is not
 * modeled - a cross-currency operation is a structured error naming the
 * limitation (the IR has no node to express a conversion dependency).
 */
import type { CompareOperator } from "../ir/types";
import type { Rational } from "./decimal";
import * as R from "./decimal";
import type { RuntimeDiagnosticCode, RuntimeValue, ValueLineage } from "./types";
import { boolean, money, number, numericOf, percent, ratio } from "./values";

export type UnitFailure = { ok: false; code: RuntimeDiagnosticCode; message: string };
export type UnitOutcome = { ok: true; value: RuntimeValue } | UnitFailure;

const fail = (code: RuntimeDiagnosticCode, message: string): UnitFailure => ({ ok: false, code, message });
const describe = (v: RuntimeValue) => (v.type === "MONEY" ? `MONEY(${v.currency})` : v.type);

function sameCurrency(values: RuntimeValue[]): string | null {
  const currencies = [...new Set(values.filter((v): v is Extract<RuntimeValue, { type: "MONEY" }> => v.type === "MONEY").map((v) => v.currency))];
  return currencies.length === 1 ? currencies[0]! : null;
}

/** ADD / SUM: all MONEY (one currency) -> MONEY; all NUMBER -> NUMBER; all RATIO -> RATIO; all PERCENT -> PERCENT. Any mix is a unit mismatch. */
export function addAll(values: RuntimeValue[], l: ValueLineage): UnitOutcome {
  if (values.length === 0) return fail("MALFORMED_NODE", "ADD/SUM with no operands");
  const types = new Set(values.map((v) => v.type));
  if (types.size !== 1) return fail("UNIT_MISMATCH", `cannot add ${values.map(describe).join(" + ")}: operands must share one dimension`);
  const t = values[0]!.type;
  if (t !== "MONEY" && t !== "NUMBER" && t !== "RATIO" && t !== "PERCENT") return fail("UNIT_MISMATCH", `cannot add values of type ${t}`);
  if (t === "MONEY") {
    const cur = sameCurrency(values);
    if (!cur) return fail("CURRENCY_MISMATCH_NO_CONVERSION_MODELED", `cannot add ${values.map(describe).join(" + ")}: no currency conversion is modeled in the IR; supply a conversion as an explicit operand`);
    return { ok: true, value: money(values.reduce((s, v) => R.add(s, numericOf(v)!), R.ZERO), cur, l) };
  }
  const sum = values.reduce((s, v) => R.add(s, numericOf(v)!), R.ZERO);
  if (t === "NUMBER") return { ok: true, value: number(sum, l) };
  if (t === "RATIO") return { ok: true, value: ratio(sum, l) };
  if (t === "PERCENT") return { ok: true, value: percent(sum, l) };
  return fail("UNIT_MISMATCH", `cannot add values of type ${t}`);
}

export function subtractValues(left: RuntimeValue, right: RuntimeValue, l: ValueLineage): UnitOutcome {
  if (left.type !== right.type) return fail("UNIT_MISMATCH", `cannot subtract ${describe(right)} from ${describe(left)}`);
  if (left.type === "MONEY" && right.type === "MONEY") {
    if (left.currency !== right.currency) return fail("CURRENCY_MISMATCH_NO_CONVERSION_MODELED", `cannot subtract ${describe(right)} from ${describe(left)}: no currency conversion is modeled`);
    return { ok: true, value: money(R.subtract(left.amount, right.amount), left.currency, l) };
  }
  const a = numericOf(left), b = numericOf(right);
  if (a === null || b === null) return fail("UNIT_MISMATCH", `cannot subtract values of type ${left.type}`);
  const d = R.subtract(a, b);
  return { ok: true, value: left.type === "NUMBER" ? number(d, l) : left.type === "RATIO" ? ratio(d, l) : percent(d, l) };
}

/**
 * MULTIPLY: any number of scaling factors (PERCENT/NUMBER) times at most one dimensioned operand (MONEY or RATIO);
 * the product takes the dimensioned operand's type. All-PERCENT -> PERCENT; otherwise dimensionless -> NUMBER.
 * Two dimensioned operands (MONEY x MONEY, MONEY x RATIO) are a unit mismatch.
 */
export function multiplyAll(values: RuntimeValue[], l: ValueLineage): UnitOutcome {
  if (values.length === 0) return fail("MALFORMED_NODE", "MULTIPLY with no operands");
  const dimensioned = values.filter((v) => v.type === "MONEY" || v.type === "RATIO");
  const scalars = values.filter((v) => v.type === "PERCENT" || v.type === "NUMBER");
  if (dimensioned.length + scalars.length !== values.length) return fail("UNIT_MISMATCH", `cannot multiply ${values.map(describe).join(" x ")}: only MONEY/RATIO/NUMBER/PERCENT operands are multipliable`);
  if (dimensioned.length > 1) return fail("UNIT_MISMATCH", `cannot multiply ${values.map(describe).join(" x ")}: at most one dimensioned operand (MONEY or RATIO)`);
  const product = values.reduce((p, v) => R.multiply(p, numericOf(v)!), R.ONE);
  const dim = dimensioned[0];
  if (dim?.type === "MONEY") return { ok: true, value: money(product, dim.currency, l) };
  if (dim?.type === "RATIO") return { ok: true, value: ratio(product, l) };
  if (scalars.every((v) => v.type === "PERCENT")) return { ok: true, value: percent(product, l) };
  return { ok: true, value: number(product, l) };
}

/**
 * DIVIDE: MONEY/MONEY (same currency) -> dimensionless, typed per the node's declared type (RATIO or NUMBER);
 * MONEY/NUMBER -> MONEY; NUMBER/NUMBER -> NUMBER (or RATIO when declared); RATIO/NUMBER -> RATIO; PERCENT/NUMBER -> PERCENT.
 * Division by zero is a structured ERROR.
 */
export function divideValues(numerator: RuntimeValue, denominator: RuntimeValue, declared: "NUMBER" | "RATIO", l: ValueLineage): UnitOutcome {
  const n = numericOf(numerator), d = numericOf(denominator);
  if (n === null || d === null) return fail("UNIT_MISMATCH", `cannot divide ${describe(numerator)} by ${describe(denominator)}`);
  if (R.isZero(d)) return fail("DIVISION_BY_ZERO", `division by zero (${describe(numerator)} / ${describe(denominator)} = 0)`);
  const q = R.divide(n, d);
  if (numerator.type === "MONEY" && denominator.type === "MONEY") {
    if (numerator.currency !== denominator.currency) return fail("CURRENCY_MISMATCH_NO_CONVERSION_MODELED", `cannot divide ${describe(numerator)} by ${describe(denominator)}: no currency conversion is modeled`);
    return { ok: true, value: declared === "RATIO" ? ratio(q, l) : number(q, l) };
  }
  if (numerator.type === "MONEY" && denominator.type === "NUMBER") return { ok: true, value: money(q, numerator.currency, l) };
  if (denominator.type !== "NUMBER") return fail("UNIT_MISMATCH", `cannot divide ${describe(numerator)} by ${describe(denominator)}: the divisor must be a NUMBER unless both are MONEY of one currency`);
  if (numerator.type === "NUMBER") return { ok: true, value: declared === "RATIO" ? ratio(q, l) : number(q, l) };
  if (numerator.type === "RATIO") return { ok: true, value: ratio(q, l) };
  if (numerator.type === "PERCENT") return { ok: true, value: percent(q, l) };
  return fail("UNIT_MISMATCH", `cannot divide ${describe(numerator)} by ${describe(denominator)}`);
}

/** MAX/MIN over one shared dimension (MONEY in one currency, NUMBER, RATIO, PERCENT, or DATE). Returns the index of the extreme operand. */
export function extreme(values: RuntimeValue[], which: "MAX" | "MIN"): { ok: true; index: number } | { ok: false; code: RuntimeDiagnosticCode; message: string } {
  if (values.length === 0) return fail("MALFORMED_NODE", `${which} with no operands`);
  const types = new Set(values.map((v) => v.type));
  if (types.size !== 1) return fail("UNIT_MISMATCH", `${which} over ${values.map(describe).join(", ")}: operands must share one dimension`);
  if (values[0]!.type === "MONEY" && !sameCurrency(values)) return fail("CURRENCY_MISMATCH_NO_CONVERSION_MODELED", `${which} over ${values.map(describe).join(", ")}: no currency conversion is modeled`);
  let best = 0;
  for (let i = 1; i < values.length; i++) {
    const c = compareValues(values[i]!, values[best]!);
    if (!c.ok) return c;
    if ((which === "MAX" && c.cmp > 0) || (which === "MIN" && c.cmp < 0)) best = i;
  }
  return { ok: true, index: best };
}

export function compareValues(a: RuntimeValue, b: RuntimeValue): { ok: true; cmp: -1 | 0 | 1 } | { ok: false; code: RuntimeDiagnosticCode; message: string } {
  if (a.type !== b.type) return fail("UNIT_MISMATCH", `cannot compare ${describe(a)} with ${describe(b)}`);
  if (a.type === "MONEY" && b.type === "MONEY" && a.currency !== b.currency) return fail("CURRENCY_MISMATCH_NO_CONVERSION_MODELED", `cannot compare ${describe(a)} with ${describe(b)}: no currency conversion is modeled`);
  if (a.type === "DATE" && b.type === "DATE") return { ok: true, cmp: a.isoDate < b.isoDate ? -1 : a.isoDate > b.isoDate ? 1 : 0 };
  if (a.type === "BOOLEAN" && b.type === "BOOLEAN") return { ok: true, cmp: a.value === b.value ? 0 : a.value ? 1 : -1 };
  const x = numericOf(a), y = numericOf(b);
  if (x === null || y === null) return fail("UNIT_MISMATCH", `cannot compare values of type ${a.type}`);
  return { ok: true, cmp: R.compare(x, y) };
}

export type RuntimeCompareOperator = CompareOperator | "NE";

/** COMPARE with an explicit operator and strict type compatibility (no truthiness). EQ/NE additionally accept BOOLEAN and DATE operands. */
export function compareWith(a: RuntimeValue, b: RuntimeValue, op: RuntimeCompareOperator, l: ValueLineage): UnitOutcome {
  const c = compareValues(a, b);
  if (!c.ok) return c;
  if ((a.type === "BOOLEAN") && op !== "EQ" && op !== "NE") return fail("TYPE_CONTRACT_VIOLATION", `${op} is not defined for BOOLEAN operands`);
  const r = c.cmp;
  const out = op === "EQ" ? r === 0 : op === "NE" ? r !== 0 : op === "GT" ? r > 0 : op === "GTE" ? r >= 0 : op === "LT" ? r < 0 : r <= 0;
  return { ok: true, value: boolean(out, l) };
}

export function rationalOrNull(v: RuntimeValue | null): Rational | null { return v ? numericOf(v) : null; }
