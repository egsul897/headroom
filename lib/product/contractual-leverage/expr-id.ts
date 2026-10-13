/**
 * Browser-safe expression ids for leverage IR trees.
 *
 * Deliberately does NOT import lib/contract-model/ir/identity (node:crypto via
 * stable-keys) — that pull breaks the Next.js client bundle when the dashboard
 * recalculates leverage in the browser.
 */

import type { IRCapacityExpression, IRExpression } from "@/lib/contract-model/ir/types";

let seq = 0;

/** Reset between tests when deterministic numbering is required. */
export function resetLeverageExprIds(): void {
  seq = 0;
}

type ExprInput<T extends IRExpression> = T extends unknown ? Omit<T, "exprId"> : never;

export function withLeverageExprId<T extends IRExpression>(expr: ExprInput<T>): T {
  seq += 1;
  return { ...(expr as object), exprId: `cl-expr:${seq}` } as T;
}

export function withLeverageCapacityId(capacity: IRCapacityExpression): IRCapacityExpression {
  if (capacity.kind === "UNLIMITED_CAPACITY") return capacity;
  return withLeverageExprId(capacity as IRExpression) as IRCapacityExpression;
}
