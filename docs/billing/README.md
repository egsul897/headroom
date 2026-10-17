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
