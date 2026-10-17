/**
 * Apply verified Stripe webhook events to the workspace subscription row.
 *
 * - Idempotent: the Stripe event id is recorded first; a replay is a no-op.
 * - Ordered: an event older than the row's lastEventCreated never overwrites it.
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

export interface BillingStore {
  /** Insert the event receipt; return false when this id was already recorded. */
  recordEvent(e: { id: string; type: string; companyId: string | null }): Promise<boolean>;
  markEventProcessed(id: string, outcome: string): Promise<void>;
  companyExists(companyId: string): Promise<boolean>;
  findCompanyIdBySubscription(stripeSubscriptionId: string): Promise<string | null>;
  getLastEventCreated(companyId: string): Promise<number | null>;
  upsertSubscription(patch: SubscriptionPatch): Promise<void>;
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
  const obj = event.data?.object ?? {};
  let companyId: string | null = null;
  if (event.type === "checkout.session.completed") {
    companyId = metadataCompanyId(obj) ?? str(obj.client_reference_id);
  } else if (event.type.startsWith("customer.subscription.")) {
    companyId = metadataCompanyId(obj);
    const subId = idOf(obj.id);
    if (!companyId && subId) companyId = await store.findCompanyIdBySubscription(subId);
  }

  const fresh = await store.recordEvent({ id: event.id, type: event.type, companyId });
  if (!fresh) return "DUPLICATE";

  const finish = async (o: ApplyOutcome) => {
    await store.markEventProcessed(event.id, o);
    return o;
  };

  if (!HANDLED.has(event.type)) return finish("IGNORED_TYPE");
  if (!companyId || !(await store.companyExists(companyId))) return finish("UNBOUND");

  const last = await store.getLastEventCreated(companyId);
  if (last !== null && event.created < last) return finish("STALE");

  if (event.type === "checkout.session.completed") {
    if (obj.mode !== "subscription") return finish("IGNORED_TYPE");
    await store.upsertSubscription({
      companyId,
      stripeCustomerId: idOf(obj.customer),
      stripeSubscriptionId: idOf(obj.subscription),
      lastEventCreated: event.created,
      // status/plan arrive with customer.subscription.* — never guessed here.
    });
    return finish("APPLIED");
  }

  const priceId = subscriptionPriceId(obj);
  await store.upsertSubscription({
    companyId,
    stripeCustomerId: idOf(obj.customer),
    stripeSubscriptionId: idOf(obj.id),
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
