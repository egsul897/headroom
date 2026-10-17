/**
 * Rule 82 — an approval fallback must never override a safety refusal.
 *
 * approveCertificateAction tries the FCE attributable path first,
 * then falls back to the workspace approve path. The FCE path
 * refuses when reconciliation is BLOCKED ("Reconciliation
 * disposition is BLOCKED; cannot approve"), but the workspace
 * path has no reconciliation check — so a BLOCKED refusal that
 * falls through would be approved anyway, defeating the safety
 * gate. (Today the page action passes no live reconciliation, so
 * the gate cannot fire from this flow; the guard makes the
 * invariant hold when one is ever supplied.)
 *
 * Fall back only for non-safety refusals (e.g. already-approved
 * idempotency, synthetic seeds outside the FCE flow).
 *
 * Prisma-free: pure decision over the FCE result's issues.
 */
export function shouldFallbackAfterFceRefusal(issues: readonly string[]): boolean {
  return !issues.some((i) => /BLOCKED/i.test(i));
}
