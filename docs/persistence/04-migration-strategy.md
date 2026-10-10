# Migration Strategy

**PHASE:** P0  
**PRODUCTION_DB_TOUCHED:** NO (hard rule)

## Preconditions

1. Inspect `prisma/schema.prisma` and migration history through `20261009223000_add_financial_statement_document_type`.
2. Confirm open PRs #282–#293 add **no** competing schema.
3. Prefer additive CREATE TABLE / CREATE TYPE / CREATE INDEX only.
4. Test exclusively via `lib/testing/ephemeral-db.ts` (`headroom_test_[a-f0-9]{8,}`) or an independently owned EVAL Neon branch.
5. Never set `HEADROOM3_ALLOW_EVAL_DB` against production Neon.

## Migration plan

| Step | Action | Risk |
|------|--------|------|
| 1 | Add enums + 8 tables in one migration `20261010160000_institutional_intelligence_persistence` | Low — empty tables |
| 2 | Add Company relations for the four company-scoped artifact groups that need FK integrity | Low — nullable/cascade |
| 3 | `prisma migrate deploy` on disposable DB | Isolates failures |
| 4 | Run `tests/persistence/*` with ephemeral DB | Acceptance |
| 5 | No production backfill | Zero data-loss risk to existing rows |

## Compatibility

- Existing NS-4 / ledger / semantic-truth stores unchanged.
- No column renames or drops.
- New services live under `lib/persistence/**` and wrap — do not rewrite — engines.

## Data-loss risk

**NONE** for existing production data (additive only, zero backfill).

## Rollback / forward recovery

- Rollback: discontinue service calls; tables may remain empty.
- Forward recovery: re-run migrate deploy; re-persist from source documents and event logs.
- Audit events are append-only; never UPDATE/DELETE in application code.

## Tenant isolation

Every write path requires `companyId` and rejects cross-tenant reads (service-layer assertion + query scoping). Acceptance tests create two companies and prove isolation.
