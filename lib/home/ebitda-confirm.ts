export type ConfirmKind = "AMOUNT" | "LENDER_APPROVAL";

export type EbitdaCallError = {
  status: number;
  text: string;
  refetch: boolean;
  /** 401 is the calm sign-in state, not an inline error. */
  signIn: boolean;
};

/** The allowed-range sentence from an OUT_OF_RANGE body, or the server message. */
export function outOfRangeText(message: string | undefined): string {
  const basis = message?.match(/plausible maximum \((.+)\)/i)?.[1]?.trim();
  if (basis) return `Allowed up to ${basis}.`;
  return message?.trim() || "That figure is outside the allowed range.";
}

/** "Last updated Oct 16, 2026" from a FAILED box's staleSince. Null when there is no last good box. */
export function lastUpdatedLabel(staleSince: string | null | undefined): string | null {
  if (!staleSince) return null;
  const date = new Date(staleSince);
  if (Number.isNaN(date.getTime())) return null;
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;
  return `Last updated ${months[date.getUTCMonth()]} ${date.getUTCDate()}, ${date.getUTCFullYear()}`;
}

/** Quiet copy for the panel. A 401 is the sign-in state. Never a success message. */
export function ebitdaCallError(status: number, message: string | undefined, code?: string | null): EbitdaCallError {
  if (status === 401) return { status, text: "Sign in to confirm", refetch: false, signIn: true };
  if (status === 503 || code === "SEC_UNAVAILABLE") {
    return { status: 503, text: "SEC data temporarily unavailable, try again", refetch: false, signIn: false };
  }
  if (code === "NEEDS_BASE") return { status, text: "Needs base EBITDA first", refetch: false, signIn: false };
  if (code === "OUT_OF_RANGE") return { status, text: outOfRangeText(message), refetch: false, signIn: false };
  if (code === "IDEMPOTENCY_CONFLICT" || status === 409) {
    return { status: status === 409 ? 409 : status, text: message?.trim() || "This confirmation conflicts with the current box.", refetch: true, signIn: false };
  }
  if (status === 404) return { status, text: "The EBITDA box or this document was not found.", refetch: false, signIn: false };
  if (status === 422) return { status, text: message?.trim() || "That figure was refused.", refetch: false, signIn: false };
  return { status, text: message?.trim() || "Confirm was refused.", refetch: false, signIn: false };
}

export function isPreparingMiss(status: number, message: string | undefined): boolean {
  return status === 404 && /no EBITDA box yet/i.test(message ?? "");
}

/** Document ids whose upload recorded `agreementPipeline.ebitdaBox.status === "SCHEDULED"`. */
export function scheduledEbitdaDocumentIds(
  rows: readonly { documentId?: string | null; metadata?: unknown }[],
): string[] {
  const ids: string[] = [];
  for (const row of rows) {
    if (!row.documentId) continue;
    const meta = row.metadata;
    if (!meta || typeof meta !== "object" || Array.isArray(meta)) continue;
    const pipeline = (meta as Record<string, unknown>).agreementPipeline;
    if (!pipeline || typeof pipeline !== "object" || Array.isArray(pipeline)) continue;
    const box = (pipeline as Record<string, unknown>).ebitdaBox;
    if (!box || typeof box !== "object" || Array.isArray(box)) continue;
    if ((box as Record<string, unknown>).status === "SCHEDULED") ids.push(row.documentId);
  }
  return ids;
}

/** One key per click. A retry of that click reuses it. A 2xx retires it. */
export function createConfirmKeys() {
  const keys = new Map<string, string>();
  const id = (inputKey: string, kind: ConfirmKind) => `${kind}:${inputKey}`;
  return {
    forClick(inputKey: string, kind: ConfirmKind): string {
      const slot = id(inputKey, kind);
      let key = keys.get(slot);
      if (!key) {
        key = globalThis.crypto.randomUUID();
        keys.set(slot, key);
      }
      return key;
    },
    finish(inputKey: string, kind: ConfirmKind) {
      keys.delete(id(inputKey, kind));
    },
  };
}
