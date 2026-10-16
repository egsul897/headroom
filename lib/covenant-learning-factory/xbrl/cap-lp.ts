/**
 * Exact cap allocation: maximize Σ x_i subject to 0 ≤ x_i ≤ u_i and Σ_{i∈S_k} x_i ≤ c_k for every cap k.
 * Dense tableau simplex over exact rationals (BigInt), Bland's rule (smallest index enters/leaves) — terminates, is
 * deterministic and returns a proven optimum. Problems here are tiny (a few clauses, a few caps).
 */
type Q = { n: bigint; d: bigint };
const gcd = (a: bigint, b: bigint): bigint => { a = a < 0n ? -a : a; b = b < 0n ? -b : b; while (b) [a, b] = [b, a % b]; return a || 1n; };
const q = (n: bigint, d = 1n): Q => { if (d < 0n) { n = -n; d = -d; } const g = gcd(n, d); return { n: n / g, d: d / g }; };
const add = (a: Q, b: Q) => q(a.n * b.d + b.n * a.d, a.d * b.d);
const sub = (a: Q, b: Q) => q(a.n * b.d - b.n * a.d, a.d * b.d);
const mul = (a: Q, b: Q) => q(a.n * b.n, a.d * b.d);
const div = (a: Q, b: Q) => q(a.n * b.d, a.d * b.n);
const cmp = (a: Q, b: Q) => { const x = a.n * b.d - b.n * a.d; return x < 0n ? -1 : x > 0n ? 1 : 0; };
const ZERO = q(0n);

export const MAX_ITER = 10_000;
export interface CapLpResult { x: bigint[]; value: bigint; integral: boolean; exactValue: { num: bigint; den: bigint } }

export function solveCapLp(upper: readonly bigint[], caps: ReadonlyArray<{ members: readonly number[]; amount: bigint }>, maxIter = MAX_ITER): CapLpResult {
  const n = upper.length;
  const rows: Array<{ a: bigint[]; b: bigint }> = [
    ...upper.map((u, i) => ({ a: upper.map((_, j) => (j === i ? 1n : 0n)), b: u < 0n ? 0n : u })),
    ...caps.map((c) => ({ a: upper.map((_, j) => (c.members.includes(j) ? 1n : 0n)), b: c.amount < 0n ? 0n : c.amount })),
  ];
  const m = rows.length, cols = n + m;
  const T: Q[][] = rows.map((r, i) => [...r.a.map((v) => q(v)), ...Array.from({ length: m }, (_, k) => q(k === i ? 1n : 0n)), q(r.b)]);
  const z: Q[] = [...Array.from({ length: n }, () => q(-1n)), ...Array.from({ length: m }, () => ZERO), ZERO]; // z_j − c_j
  const basis = Array.from({ length: m }, (_, i) => n + i);
  for (let iter = 0; ; iter++) {
    const enter = z.slice(0, cols).findIndex((v) => cmp(v, ZERO) < 0);
    if (enter < 0) break;
    // Bland's rule cannot cycle; hitting the guard means a bug — never return an unproven allocation.
    if (iter >= maxIter) throw new Error(`cap LP did not converge within ${maxIter} pivots`);
    let leave = -1; let best: Q | null = null;
    for (let i = 0; i < m; i++) {
      if (cmp(T[i]![enter]!, ZERO) <= 0) continue;
      const r = div(T[i]![cols]!, T[i]![enter]!);
      const c = best ? cmp(r, best) : -1;
      if (c < 0 || (c === 0 && basis[i]! < basis[leave]!)) { best = r; leave = i; }
    }
    if (leave < 0) throw new Error("cap LP unbounded (every variable has an upper bound; cannot happen)");
    const piv = T[leave]![enter]!;
    T[leave] = T[leave]!.map((v) => div(v, piv));
    for (let i = 0; i < m; i++) if (i !== leave && cmp(T[i]![enter]!, ZERO) !== 0) { const f = T[i]![enter]!; T[i] = T[i]!.map((v, j) => sub(v, mul(f, T[leave]![j]!))); }
    if (cmp(z[enter]!, ZERO) !== 0) { const f = z[enter]!; for (let j = 0; j <= cols; j++) z[j] = sub(z[j]!, mul(f, T[leave]![j]!)); }
    basis[leave] = enter;
  }
  const xq: Q[] = Array.from({ length: n }, () => ZERO);
  basis.forEach((b, i) => { if (b < n) xq[b] = T[i]![cols]!; });
  const value = xq.reduce(add, ZERO);
  const integral = xq.every((v) => v.d === 1n);
  const x = xq.map((v) => v.n / v.d); // floor for non-negative values: still feasible
  return { x, value: x.reduce((a, b) => a + b, 0n), integral, exactValue: { num: value.n, den: value.d } };
}
