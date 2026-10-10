/**
 * Ask → Simulate deep-link handoff.
 * Seeds the shared SimulateClient with structured draft fields — no second engine.
 */

export type SimulateActionType = "debt" | "rp" | "investment" | "assetSale";

export interface SimulateHandoffDraft {
  action: SimulateActionType;
  amountMillions: number;
  secured?: boolean | null;
  /** Optional as-of / evaluation date (YYYY-MM-DD) for display; Simulate still uses company financials. */
  evaluationDate?: string | null;
  source?: "ask" | "demo";
}

/** Map Ask transaction kinds onto Simulate action tabs. */
export function simulateActionFromAskKind(
  kind: "SECURED_DEBT" | "UNSECURED_DEBT" | "RESTRICTED_PAYMENT" | "INVESTMENT" | "ACQUISITION" | "UNKNOWN",
): SimulateActionType | null {
  switch (kind) {
    case "SECURED_DEBT":
    case "UNSECURED_DEBT":
    case "ACQUISITION":
      return "debt";
    case "RESTRICTED_PAYMENT":
      return "rp";
    case "INVESTMENT":
      return "investment";
    default:
      return null;
  }
}

export function buildSimulateHandoffHref(companyId: string, draft: SimulateHandoffDraft): string {
  const params = new URLSearchParams();
  params.set("action", draft.action);
  params.set("amount", String(draft.amountMillions));
  if (draft.secured != null) params.set("secured", draft.secured ? "1" : "0");
  if (draft.evaluationDate) params.set("asOf", draft.evaluationDate);
  if (draft.source) params.set("from", draft.source);
  return `/${companyId}/simulate?${params.toString()}`;
}

/** Parse Simulate page search params into a handoff draft (fail closed on garbage). */
export function parseSimulateHandoffSearchParams(
  searchParams: Record<string, string | string[] | undefined> | URLSearchParams,
): Partial<SimulateHandoffDraft> {
  const get = (key: string): string | undefined => {
    if (searchParams instanceof URLSearchParams) return searchParams.get(key) ?? undefined;
    const v = searchParams[key];
    return Array.isArray(v) ? v[0] : v;
  };
  const actionRaw = get("action");
  const amountRaw = get("amount");
  const securedRaw = get("secured");
  const asOf = get("asOf") ?? null;
  const sourceRaw = get("from");

  const action =
    actionRaw === "debt" || actionRaw === "rp" || actionRaw === "investment" || actionRaw === "assetSale"
      ? actionRaw
      : undefined;
  const amountMillions = amountRaw != null && amountRaw !== "" && Number.isFinite(Number(amountRaw)) ? Number(amountRaw) : undefined;
  const secured = securedRaw === "1" ? true : securedRaw === "0" ? false : null;
  const source = sourceRaw === "ask" || sourceRaw === "demo" ? sourceRaw : undefined;

  return {
    ...(action ? { action } : {}),
    ...(amountMillions != null && amountMillions >= 0 ? { amountMillions } : {}),
    ...(secured != null ? { secured } : {}),
    ...(asOf ? { evaluationDate: asOf } : {}),
    ...(source ? { source } : {}),
  };
}
