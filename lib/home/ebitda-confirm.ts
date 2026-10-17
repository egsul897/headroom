export type ConfirmKind = "AMOUNT" | "LENDER_APPROVAL";

export type EbitdaCallError = {
  status: number;
  text: string;
  refetch: boolean;
};

/** Quiet copy for the panel. Never a success message. */
export function ebitdaCallError(status: number, message: string | undefined): EbitdaCallError {
  if (status === 401) return { status, text: "Sign-in is needed to confirm this.", refetch: false };
  if (status === 404) return { status, text: "The EBITDA box or this document was not found.", refetch: false };
  if (status === 409) return { status, text: message?.trim() || "This confirmation conflicts with the current box.", refetch: true };
  if (status === 422) return { status, text: message?.trim() || "That figure was refused.", refetch: false };
  return { status, text: message?.trim() || "Confirm was refused.", refetch: false };
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
