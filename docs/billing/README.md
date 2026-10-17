# Workspace billing (Grok lane 1)

Stripe subscription billing scaffold. **No Stripe account exists yet**, so
in every current deployment billing is OFF and nothing calls Stripe.

## Env (all required; any missing/malformed ⇒ OFF)

| Var | Format |
| --- | --- |
| `STRIPE_SECRET_KEY` | `sk_live_…` / `sk_test_…` |
| `STRIPE_WEBHOOK_SECRET` | `whsec_…` |
| `STRIPE_PRICE_IDS` | `planKey:price_…[,planKey:price_…]` |
| `HEADROOM_APP_URL` | absolute https origin for checkout return links |
| `HEADROOM_BILLING_ENFORCE` | `1` to enforce the plan gate (default off) |

Enforce ON + Stripe OFF ⇒ gated features are **denied** (fail closed).

## Surface

- `POST /api/billing/checkout {plan}` — Checkout session for the signed-in user's own workspace (workspace from the session, never the body). 503 `BILLING_DISABLED` when OFF.
- `POST /api/billing/webhook` — HMAC-verified (`Stripe-Signature`, 300 s tolerance), idempotent on event id, out-of-order safe (`lastEventCreated`), binds only to an existing workspace named in our own checkout metadata. Unknown price ⇒ plan null; unknown status ⇒ UNKNOWN (inactive).
- `GET /api/billing/status` — stored state + gate decision for the caller's workspace.
- `lib/billing/gate.ts#checkWorkspacePlan(companyId, {requiredPlans})` — server-side gate for features.

## Migration

`prisma/migrations/20261017160000_workspace_billing` — additive (`workspace_subscriptions`, `stripe_webhook_events`). **Not applied to Neon.** No FK/relation on `Company` so the Company model is untouched.

## Held (needs an owner action)

- Create the Stripe account, products/prices, and webhook endpoint (`/api/billing/webhook`, events `checkout.session.completed`, `customer.subscription.created|updated|deleted`), then set the env vars above.
- Apply the migration.
- Decide which features call `checkWorkspacePlan` and the pricing UI (Designer).

## Webhook correctness (Reviewer round 2)

- **One transaction per event.** Each webhook event is handled in a single DB transaction: the receipt row (`INSERT … ON CONFLICT DO NOTHING` and then `SELECT … FOR UPDATE`), a per-workspace advisory lock, the order check, the subscription upsert, and `processedAt`. If anything fails, the whole transaction rolls back, including the receipt. Stripe's retry then processes the event again. An event counts as a duplicate only once `processedAt` is committed.
- **CANCELED is terminal for a subscription id.** A same-second `active` update can't resurrect it, because Stripe's `created` field is whole seconds. A new subscription id applies normally.
- **`lastEventCreated` is BIGINT.**
- **Store read errors are reported as 503 `BILLING_STORE_UNAVAILABLE`.** The gate denies with `STORE_UNAVAILABLE` and never reports `NO_SUBSCRIPTION` for a read failure. Checkout makes no Stripe call when our own store can't be read.
- **Who can check out.** Only a platform `ADMIN` or a user listed in `workspace_billing_owners` can start a checkout for their workspace. UserRole has no OWNER value, and that table is provisioned offline.
- **Rollback.** `prisma/migrations/20261017160000_workspace_billing/down.sql` is a manual, destructive rollback and needs owner approval.
- **Real-Postgres tests.** `BILLING_TEST_DATABASE_URL=… npx vitest run tests/billing/prisma-store.pg.test.ts` checks atomicity, concurrent duplicate delivery, concurrent older/newer delivery, and BIGINT.
