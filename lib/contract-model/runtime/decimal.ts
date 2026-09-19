/**
 * PHASE 4A - exact rational arithmetic for the runtime.
 *
 * Decision (mission §6): no binary floating point crosses an operation. Every
 * numeric runtime value is an exact rational number (BigInt numerator over a
 * positive BigInt denominator, always reduced). IR literals arrive as JS
 * numbers (75000000, 0.125, 2.5); they are converted through their shortest
 * decimal string representation, so 0.125 becomes exactly 125/1000 = 1/8 and
 * never 0.12500000000000000694. Money, percentages and ratios therefore
 * add, scale and compare exactly; a division that does not terminate stays
 * exact as a fraction and is only rounded when rendered.
 *
 * Deterministic by construction: no Math.random, no Date, no locale.
 */

export interface Rational {
  readonly num: bigint;
  /** Always > 0 and coprime with num. */
  readonly den: bigint;
}

function gcd(a: bigint, b: bigint): bigint {
  let x = a < 0n ? -a : a;
  let y = b < 0n ? -b : b;
  while (y !== 0n) { const t = x % y; x = y; y = t; }
  return x;
}

export function rational(num: bigint, den: bigint = 1n): Rational {
  if (den === 0n) throw new Error("rational: zero denominator");
  if (den < 0n) { num = -num; den = -den; }
  const g = gcd(num, den);
  return g > 1n ? { num: num / g, den: den / g } : { num, den };
}

const DECIMAL_RE = /^([+-])?(\d*)(?:\.(\d*))?(?:[eE]([+-]?\d+))?$/;

/** Exact parse of a decimal string (optionally with an exponent). Rejects anything else - never NaN, never Infinity. */
export function rationalFromString(text: string): Rational {
  const m = DECIMAL_RE.exec(text.trim());
  if (!m || (m[2] === "" && (m[3] ?? "") === "")) throw new Error(`rationalFromString: not a decimal literal: "${text}"`);
  const sign = m[1] === "-" ? -1n : 1n;
  const intPart = m[2] ?? "";
  const fracPart = m[3] ?? "";
  const exp = m[4] ? Number.parseInt(m[4], 10) : 0;
  let num = BigInt((intPart || "0") + fracPart) * sign;
  let den = 10n ** BigInt(fracPart.length);
  if (exp > 0) num *= 10n ** BigInt(exp);
  else if (exp < 0) den *= 10n ** BigInt(-exp);
  return rational(num, den);
}

/** Exact conversion of an IR numeric literal: through its shortest round-trip decimal representation, so the number the compiler wrote (0.125, 2.5, 75000000) is the number the runtime uses. Non-finite numbers are rejected. */
export function rationalFromNumber(n: number): Rational {
  if (!Number.isFinite(n)) throw new Error(`rationalFromNumber: not finite: ${n}`);
  return rationalFromString(n.toString());
}

export const ZERO: Rational = { num: 0n, den: 1n };
export const ONE: Rational = { num: 1n, den: 1n };

export function add(a: Rational, b: Rational): Rational { return rational(a.num * b.den + b.num * a.den, a.den * b.den); }
export function subtract(a: Rational, b: Rational): Rational { return rational(a.num * b.den - b.num * a.den, a.den * b.den); }
export function multiply(a: Rational, b: Rational): Rational { return rational(a.num * b.num, a.den * b.den); }
/** Caller must check isZero(b) first; a zero divisor is a structured runtime ERROR, never an exception at the public boundary. */
export function divide(a: Rational, b: Rational): Rational { if (b.num === 0n) throw new Error("divide: division by zero"); return rational(a.num * b.den, a.den * b.num); }
export function negate(a: Rational): Rational { return { num: -a.num, den: a.den }; }
export function isZero(a: Rational): boolean { return a.num === 0n; }
export function compare(a: Rational, b: Rational): -1 | 0 | 1 { const l = a.num * b.den, r = b.num * a.den; return l < r ? -1 : l > r ? 1 : 0; }
export function equals(a: Rational, b: Rational): boolean { return a.num === b.num && a.den === b.den; }
export function max(values: readonly Rational[]): Rational { return values.reduce((m, v) => (compare(v, m) > 0 ? v : m)); }
export function min(values: readonly Rational[]): Rational { return values.reduce((m, v) => (compare(v, m) < 0 ? v : m)); }

/** True when the reduced denominator has only factors 2 and 5, i.e. the value has a finite decimal expansion. */
export function isTerminatingDecimal(a: Rational): boolean {
  let d = a.den;
  while (d % 2n === 0n) d /= 2n;
  while (d % 5n === 0n) d /= 5n;
  return d === 1n;
}

/**
 * Canonical, deterministic string form used in serialized results:
 * the exact finite decimal ("75000000", "0.125", "-2.5") when the value
 * terminates, otherwise the exact fraction ("1/3"). Never a float.
 */
export function toCanonicalString(a: Rational): string {
  if (a.den === 1n) return a.num.toString();
  if (!isTerminatingDecimal(a)) return `${a.num}/${a.den}`;
  // scale to a power of ten
  let den = a.den, num = a.num, digits = 0;
  while (den % 10n === 0n) { den /= 10n; digits++; }
  // den now has only 2s or 5s (not both, since the 10s are stripped); multiply up to a power of ten
  while (den !== 1n) { if (den % 2n === 0n) { den /= 2n; num *= 5n; } else { den /= 5n; num *= 2n; } digits++; }
  const neg = num < 0n; if (neg) num = -num;
  let s = num.toString().padStart(digits + 1, "0");
  s = `${s.slice(0, s.length - digits)}.${s.slice(s.length - digits)}`.replace(/\.?0+$/, "");
  return (neg ? "-" : "") + s;
}

/** Fixed-scale decimal rendering with round-half-even - for display only, never for further arithmetic. */
export function toFixed(a: Rational, scale: number): string {
  const factor = 10n ** BigInt(scale);
  const scaled = a.num * factor;
  let q = scaled / a.den;
  const r = scaled % a.den;
  const twice = (r < 0n ? -r : r) * 2n;
  if (twice > a.den || (twice === a.den && (q % 2n !== 0n))) q += scaled < 0n ? -1n : 1n;
  const neg = q < 0n; if (neg) q = -q;
  let s = q.toString().padStart(scale + 1, "0");
  if (scale > 0) s = `${s.slice(0, s.length - scale)}.${s.slice(s.length - scale)}`;
  return (neg ? "-" : "") + s;
}

/** Approximate JS number - for diagnostics/display only. */
export function toApproximateNumber(a: Rational): number { return Number(a.num) / Number(a.den); }
