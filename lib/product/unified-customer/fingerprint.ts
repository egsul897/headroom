import { createHash } from "crypto";

/** Stable JSON stringify with sorted keys for fingerprinting. */
function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`).join(",")}}`;
}

/**
 * Content hash of verified contractual + financial inputs.
 * Used to reject stale Simulate/Ask results when underlying state changed,
 * and to invalidate evidence when the contemplated amount changes.
 */
export function fingerprintVerifiedState(parts: Record<string, unknown>): string {
  return createHash("sha256").update(stableStringify(parts)).digest("hex").slice(0, 24);
}

/**
 * Request fingerprint binding amount + transaction shape + state.
 * Changing the amount MUST produce a different fingerprint so prior
 * results/evidence cannot be reused.
 */
export function fingerprintSimulationRequest(input: {
  stateFingerprint: string;
  kind: string;
  amountMillions: number;
  secured: boolean | null;
  evaluationDate: string | null;
  documentId?: string | null;
  currency?: string;
}): string {
  return fingerprintVerifiedState({
    state: input.stateFingerprint,
    kind: input.kind,
    amountMillions: input.amountMillions,
    secured: input.secured,
    evaluationDate: input.evaluationDate,
    documentId: input.documentId ?? null,
    currency: input.currency ?? "USD",
  });
}

export function newHandoffId(): string {
  return `handoff_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}
