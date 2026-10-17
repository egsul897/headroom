/**
 * Apply verified Stripe webhook events to the workspace subscription row.
 *
 * - Atomic + idempotent: the receipt row, the order check and the subscription
 *   write happen in ONE store transaction. A failure anywhere rolls the receipt
 *   back too, so Stripe's retry re-processes the event (never "DUPLICATE" for an
 *   event that was not applied). A receipt only counts as a duplicate once
 *   processedAt is set.
 * - Serialised per workspace: the transaction takes a per-company lock before the
 *   order check, so check + upsert cannot interleave with another delivery.
 * - Ordered: an event older than the row's lastEventCreated never overwrites it,
 *   and CANCELED is terminal for that subscription id (Stripe never reactivates a
 *   canceled subscription; `created` is whole seconds, so a same-second "active"
 *   update must not resurrect it). A new subscription id applies normally.
 * - Tenant binding comes ONLY from metadata.companyId / client_reference_id
 *   that our own checkout set, and the company must exist. An event that
 *   cannot be bound is recorded as UNBOUND and changes nothing.
 * - Nothing here invents a plan or status: unknown price ⇒ plan null,
 *   unknown Stripe status ⇒ UNKNOWN (which the gate treats as inactive).
 */
import { planForPrice, type BillingConfig } from "./config";
import { mapStripeStatus, type SubscriptionStatus } from "./plan-gate";

export interface StripeEvent {
  id: string;
  type: string;
  created: number;
  data: { object: Record<string, unknown> };
}

export interface SubscriptionPatch {
  companyId: string;
  stripeCustomerId?: string | null;
  stripeSubscriptionId?: string | null;
  plan?: string | null;
  stripePriceId?: string | null;
  status?: SubscriptionStatus;
  currentPeriodEnd?: Date | null;
  cancelAtPeriodEnd?: boolean;
  lastEventCreated: number;
}

export interface OrderState {
  lastEventCreated: number | null;
  status: SubscriptionStatus | null;
  stripeSubscriptionId: string | null;
}

/** Store operations available inside one transaction. */
export interface BillingTx {
  /** Insert the receipt if absent and lock it; "DONE" only when it was already processed. */
  claimEvent(e: { id: string; type: string; companyId: string | null }): Promise<"FRESH" | "DONE">;
  markEventProcessed(id: string, outcome: string): Promise<void>;
  companyExists(companyId: string): Promise<boolean>;
  findCompanyIdBySubscription(stripeSubscriptionId: string): Promise<string | null>;
  /** Serialise event application for this workspace until the transaction ends. */
  lockCompany(companyId: string): Promise<void>;
  getOrderState(companyId: string): Promise<OrderState | null>;
  upsertSubscription(patch: SubscriptionPatch): Promise<void>;
}

export interface BillingStore {
  /** Run fn atomically: all of its writes commit together or none do. */
  transaction<T>(fn: (tx: BillingTx) => Promise<T>): Promise<T>;
}

export type ApplyOutcome = "DUPLICATE" | "IGNORED_TYPE" | "UNBOUND" | "STALE" | "APPLIED";

function str(v: unknown): string | null {
  return typeof v === "string" && v.length > 0 ? v : null;
}

function idOf(v: unknown): string | null {
  if (typeof v === "string") return v || null;
  if (v && typeof v === "object") return str((v as Record<string, unknown>).id);
  return null;
}

function metadataCompanyId(obj: Record<string, unknown>): string | null {
  const md = obj.metadata;
  if (md && typeof md === "object") return str((md as Record<string, unknown>).companyId);
  return null;
}

function subscriptionPriceId(sub: Record<string, unknown>): string | null {
  const items = sub.items as { data?: Array<{ price?: unknown }> } | undefined;
  const first = items?.data?.[0];
  return first ? idOf(first.price) : null;
}

function periodEnd(sub: Record<string, unknown>): Date | null {
  const direct = sub.current_period_end;
  const items = sub.items as { data?: Array<{ current_period_end?: unknown }> } | undefined;
  const v = typeof direct === "number" ? direct : items?.data?.[0]?.current_period_end;
  return typeof v === "number" && Number.isFinite(v) ? new Date(v * 1000) : null;
}

const HANDLED = new Set([
  "checkout.session.completed",
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
]);

export async function applyStripeEvent(event: StripeEvent, store: BillingStore, config: BillingConfig): Promise<ApplyOutcome> {
  return store.transaction((tx) => applyInTx(event, tx, config));
}

async function applyInTx(event: StripeEvent, tx: BillingTx, config: BillingConfig): Promise<ApplyOutcome> {
  const obj = event.data?.object ?? {};
  let companyId: string | null = null;
  let incomingSubId: string | null = null;
  if (event.type === "checkout.session.completed") {
    companyId = metadataCompanyId(obj) ?? str(obj.client_reference_id);
    incomingSubId = idOf(obj.subscription);
  } else if (event.type.startsWith("customer.subscription.")) {
    companyId = metadataCompanyId(obj);
    incomingSubId = idOf(obj.id);
    if (!companyId && incomingSubId) companyId = await tx.findCompanyIdBySubscription(incomingSubId);
  }

  if ((await tx.claimEvent({ id: event.id, type: event.type, companyId })) === "DONE") return "DUPLICATE";

  const finish = async (o: ApplyOutcome) => {
    await tx.markEventProcessed(event.id, o);
    return o;
  };

  if (!HANDLED.has(event.type)) return finish("IGNORED_TYPE");
  if (!companyId || !(await tx.companyExists(companyId))) return finish("UNBOUND");

  await tx.lockCompany(companyId);
  const st = await tx.getOrderState(companyId);
  if (st?.lastEventCreated != null && event.created < st.lastEventCreated) return finish("STALE");
  const terminal =
    st?.status === "CANCELED" && st.stripeSubscriptionId !== null && incomingSubId === st.stripeSubscriptionId && event.type !== "customer.subscription.deleted";
  if (terminal) return finish("STALE");

  if (event.type === "checkout.session.completed") {
    if (obj.mode !== "subscription") return finish("IGNORED_TYPE");
    await tx.upsertSubscription({
      companyId,
      stripeCustomerId: idOf(obj.customer),
      stripeSubscriptionId: incomingSubId,
      lastEventCreated: event.created,
      // status/plan arrive with customer.subscription.* — never guessed here.
    });
    return finish("APPLIED");
  }

  const priceId = subscriptionPriceId(obj);
  await tx.upsertSubscription({
    companyId,
    stripeCustomerId: idOf(obj.customer),
    stripeSubscriptionId: incomingSubId,
    stripePriceId: priceId,
    plan: planForPrice(config, priceId),
    status: event.type === "customer.subscription.deleted" ? "CANCELED" : mapStripeStatus(obj.status),
    currentPeriodEnd: periodEnd(obj),
    cancelAtPeriodEnd: obj.cancel_at_period_end === true,
    lastEventCreated: event.created,
  });
  return finish("APPLIED");
}

export function parseStripeEvent(raw: string): StripeEvent | null {
  try {
    const e = JSON.parse(raw) as Partial<StripeEvent>;
    if (typeof e.id !== "string" || typeof e.type !== "string" || typeof e.created !== "number") return null;
    if (!e.data || typeof e.data !== "object" || !e.data.object || typeof e.data.object !== "object") return null;
    return e as StripeEvent;
  } catch {
    return null;
  }
}
