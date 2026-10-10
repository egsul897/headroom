# HEADROOM — Disposable EVAL DB Provisioning & Persistence Verification

**Verdict:** `PERSISTENCE_IDENTITY_VERIFIED`  
**Date:** 2026-10-10  
**Prior state:** `BLOCKED_BY_EVAL_DB` (PR #288)  
**Starting SHA (`origin/main`):** `4f1a0b81207364373d9a4cb9fe515d4a1a002e56`  
**Ending SHA (docs archive tip):** recorded at commit time on `cursor/disposable-eval-db-persistence-5a28`

## Phase 1 — Environment safety

### Starting SHA

```
4f1a0b81207364373d9a4cb9fe515d4a1a002e56
Merge pull request #289 from egsul897/cursor/fix-278-typecheck-e920
```

### Evaluation environment classification

| Axis | Finding |
| --- | --- |
| Class | **DISPOSABLE_LOCAL_EVAL_POSTGRES** |
| Engine | PostgreSQL 16.15 (Ubuntu package) on agent VM loopback |
| Host | `127.0.0.1` |
| Port | `5432` |
| Database | `headroom_eval` |
| Role | `headroom_eval` (LOGIN only; no superuser; no production grants) |
| Production Neon | `ep-shiny-rice-aw903tjv-pooler…` / `neondb` — **not used for writes or ALLOW_EVAL_DB** |
| Neon / cloud API keys | Absent (`NEON_API_KEY` unset) |
| Secrets handling | Password generated ephemerally; URL stored mode `0600` under `/tmp/headroom-eval-db/`; **never printed or committed**; shredded on dispose |

### Proof of isolation and authorization

1. **Authorization:** Agent VM has local `sudo`/`apt` authority to install and operate Postgres on this disposable machine. No third-party Neon project credentials were used.
2. **Fresh cluster:** After install, only system DB `postgres` existed before `headroom_eval` creation.
3. **Empty before migrate:** `user_tables = 0` on `headroom_eval`; no `Company`/`Document` rows possible.
4. **Network isolation:** Target hostname is loopback `127.0.0.1`, not `*.neon.tech`. Safety is not inferred from hostname alone — emptiness + ownership + no production grants established first.
5. **Credential isolation:** Dedicated role `headroom_eval` owns only `headroom_eval`; `REVOKE ALL … FROM PUBLIC` applied.
6. **Process isolation:** `HEADROOM3_ALLOW_EVAL_DB=1` and eval `DATABASE_URL` set only inside the vitest child process. Parent ambient `DATABASE_URL` remained the production-classified Neon URL with `HEADROOM3_ALLOW_EVAL_DB` unset.
7. **#246 frozen:** No PR #246 merge; `prisma migrate deploy` applied only migrations present on canonical `main` (42 migrations ending at `20261009223000_add_financial_statement_document_type`).

## Phase 2 — Schema and testing

### Schema version

| Item | Value |
| --- | --- |
| Source | `origin/main` @ `4f1a0b81…` `prisma/migrations` |
| Deploy command | `npx prisma migrate deploy` with eval `DATABASE_URL` only |
| Migrations applied | **42** |
| Last migration | `20261009223000_add_financial_statement_document_type` |
| Public tables after migrate | **70** (includes `companies`, `documents`, `debt_instruments`, `document_relationship_edges`) |
| Row counts before tests | companies=0, documents=0, debt_instruments=0 |

### Exact commands

```bash
# Provision (no secrets echoed)
sudo apt-get install -y postgresql postgresql-contrib
sudo pg_ctlcluster 16 main start
# CREATE ROLE headroom_eval / CREATE DATABASE headroom_eval OWNER headroom_eval
# store URL at /tmp/headroom-eval-db/DATABASE_URL mode 0600

export DATABASE_URL="$(cat /tmp/headroom-eval-db/DATABASE_URL)"   # migrate shell only
npx prisma generate
npx prisma migrate deploy

# Isolated test process only:
(
  export DATABASE_URL="$(cat /tmp/headroom-eval-db/DATABASE_URL)"
  export HEADROOM3_ALLOW_EVAL_DB=1
  npx vitest run \
    tests/package-graph-authority/persistence-identity.test.ts \
    tests/package-graph-authority/persistence-membership-plan.test.ts \
    --reporter=verbose
)
```

### Exact test results

```
Test Files  2 passed (2)
     Tests  9 passed (9)
  Duration  454ms
```

| Test | Result | Behavior covered |
| --- | --- | --- |
| provisional associations never appear in confirmed membership plan | PASS | provisional isolation (plan) |
| foreign company document ids are skipped from the plan | PASS | cross-company (plan) |
| stale clear plan removes contaminated provisional assignment on replay | PASS | stale cleanup (plan) |
| orphan bases disappear from currentBaseDocumentIds after upgrade merge | PASS | orphan/rollback plan |
| repeated planning is deterministic | PASS | idempotency (plan) |
| provisional bridge does not assign shared instrumentId across instruments | PASS | confirmed grouping + provisional isolation (live) |
| upgrade merges; rejection/split clears stale instrumentId; orphan singleton deleted | PASS | stale cleanup + rollback/split-orphan (live) |
| repeated persistence is idempotent | PASS | idempotency (live) |
| cross-company contamination: company B never receives company A instrumentId | PASS | cross-company isolation (live) |

**Skipped:** 0  
**Failed:** 0  

Assertions were not modified.

### Post-test cleanup / disposal

| Step | Result |
| --- | --- |
| Fixture companies after `afterAll` | 0 |
| All companies/docs/instruments | 0 |
| `DROP DATABASE headroom_eval` | done |
| `DROP ROLE headroom_eval` | done |
| Credential file shredded | done |
| Postgres cluster stopped | done (`pg_isready` → no response) |
| Database disposed | **YES** |

## Phase 3 — Verdict

### Persistence safety verdict

**`PERSISTENCE_IDENTITY_VERIFIED`**

Live `#274` persistence-identity suite passed on a disposable, empty, loopback evaluation database provisioned for this mission. Production Neon was not written. `#246` remained frozen.

### Remaining blockers

None for the four previously skipped persistence-identity tests.  
Optional follow-up: persist a long-lived shared EVAL Neon credential in the Cloud Agent environment if future agents should avoid local Postgres provisioning.

### Uncommitted / unpushed changes

This archive commit on `cursor/disposable-eval-db-persistence-5a28` (docs + evidence only). No application or schema code changes.

## Evidence paths

- `docs/package-graph-authority/evidence/2026-10-10-persistence-identity-vitest.txt`
- `docs/package-graph-authority/evidence/2026-10-10-migrate-deploy-summary.txt`
