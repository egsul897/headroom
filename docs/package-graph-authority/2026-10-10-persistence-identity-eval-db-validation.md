# HEADROOM — Isolated Package Identity Persistence Validation

**Verdict:** `BLOCKED_BY_EVAL_DB`  
**Date:** 2026-10-10  
**Starting SHA (`origin/main` at mission start):** `a397529c97938aa1fdcf8d2f598721b3de77e350`  
**Branch tip for this archive:** same (docs-only; no application/schema change)

## Mission

Run previously skipped `#274` persistence-identity integration tests against a disposable, isolated evaluation database. Do not treat skips as success. Do not write production Neon. Do not merge `#246` or apply its unsafe migration.

## 1. Starting SHA

```
a397529c97938aa1fdcf8d2f598721b3de77e350
Merge pull request #278 from egsul897/cursor/five-agent-integration-e920
2026-10-10 14:09:07 +0000
```

Fetched via `git fetch origin main` then `git rev-parse origin/main`.

## 2. Test environment classification

| Axis | Finding |
| --- | --- |
| Classification | **PRODUCTION_LIKE_NEON — NOT disposable EVAL** |
| Injected secrets | `DATABASE_URL` only (`CLOUD_AGENT_INJECTED_SECRET_NAMES`) |
| Eval-specific credentials | **Absent** (`EVAL_DATABASE_URL` unset; no other eval DB secret) |
| Host (no secrets) | `ep-shiny-rice-aw903tjv-pooler.c-12.us-east-1.aws.neon.tech` |
| Database name | `neondb` |
| DB user (name only) | `neondb_owner` |
| Query flags present | `sslmode`, `channel_binding` |
| Repo classification of this host | Product-proof / closeout docs treat `*.neon.tech` `DATABASE_URL` as **Neon production host**; writes forbidden |
| `HEADROOM3_ALLOW_EVAL_DB` | **Not set** (must not enable against unverified/production-like host) |
| Customer-data isolation proof | **Not obtained** — cannot confirm empty/non-customer EVAL schema without a reachable disposable EVAL DB |

### Pre-opt-in host/schema validation

| Check | Command / method | Result |
| --- | --- | --- |
| TCP 5432 | Python `socket.connect` to pooler host | **open** |
| TCP 6432 | same | timeout |
| Read-only Prisma | `SELECT 1`, `current_database()` via `@prisma/client` **without** `HEADROOM3_ALLOW_EVAL_DB` | **FAIL** — `PrismaClientInitializationError`: Can't reach database server at `ep-shiny-rice-aw903tjv-pooler…:5432` |
| Schema inventory (tables / tenantKind) | blocked on connectivity | **NOT RUN** |

Because host/schema validation did not succeed on an isolated EVAL target, **`HEADROOM3_ALLOW_EVAL_DB=1` was never enabled**.

## 3. Tests executed / skipped

### Exact commands

```bash
# Environment identity (secrets redacted)
echo "INJECTED_SECRETS=$CLOUD_AGENT_INJECTED_SECRET_NAMES"
# parse host/db/user only from DATABASE_URL

# Read-only reachability (ALLOW_EVAL_DB unset)
node --import tsx -e '... prisma.$queryRaw`SELECT 1 ...`'

# Suite without opt-in (documents skip gate; not treated as pass)
unset HEADROOM3_ALLOW_EVAL_DB
npx vitest run \
  tests/package-graph-authority/persistence-identity.test.ts \
  tests/package-graph-authority/persistence-membership-plan.test.ts \
  --reporter=verbose
```

### Results

| Suite | Mode | Result |
| --- | --- | --- |
| `persistence-membership-plan.test.ts` (pure / no DB) | always on | **5 passed** |
| `persistence-identity.test.ts` (live Prisma) | `HEADROOM3_ALLOW_EVAL_DB` unset | **file skipped; 4 tests skipped** |

Vitest summary:

```
Test Files  1 passed | 1 skipped (2)
     Tests  5 passed | 4 skipped (9)
```

Skipped live cases (assertions untouched; not executed):

1. provisional bridge does not assign shared instrumentId across instruments  
2. upgrade merges; rejection/split clears stale instrumentId; orphan singleton deleted  
3. repeated persistence is idempotent (no duplicate instruments / edges)  
4. cross-company contamination: company B document never receives company A instrumentId  

Coverage requested by mission vs execution:

| Required behavior | Live DB exercised? |
| --- | --- |
| Confirmed instrument grouping | **NO** (skipped) |
| Provisional identity isolation | **NO** (skipped) — pure plan tests cover planning only |
| Stale managed-ID cleanup | **NO** (skipped) — pure plan tests cover planning only |
| Cross-company isolation | **NO** (skipped) — pure plan tests cover planning only |
| Rollback / split-orphan cleanup behavior | **NO** (skipped) |

## 4. Persistence safety verdict

**`BLOCKED_BY_EVAL_DB`**

Live persistence-identity safety is **not verified**. Skipped tests are **not** counted as successful. No production Neon writes were performed. No `#246` merge or unsafe migration applied. No application/schema changes made to force a pass.

## 5. Defects discovered

1. **Missing disposable EVAL database credentials** in this agent environment — only production-classified Neon `DATABASE_URL` is injected.  
2. **Injected Neon URL is unreachable for Prisma** despite TCP:5432 open — cannot validate schema or prove absence of customer data.  
3. **Opt-in gate correctly refuses** live writes when `HEADROOM3_ALLOW_EVAL_DB≠1`; enabling it against the current URL would violate mission constraints (production Neon / unvalidated host).

No assertion defects were found or altered — live suite never ran.

## 6. Required remediation

1. Provision a **disposable** Postgres/Neon database with **no customer data**, distinct host from production `ep-shiny-rice-…`.  
2. Inject eval credentials separately (e.g. `EVAL_DATABASE_URL` or a clearly labeled eval `DATABASE_URL`) and document host/db identity.  
3. Apply the **current main** Prisma schema to that eval DB only (no `#246` unsafe migration).  
4. Validate host + schema (connectivity, `tenantKind` / fixture tables) **before** setting `HEADROOM3_ALLOW_EVAL_DB=1`.  
5. Re-run:

```bash
export HEADROOM3_ALLOW_EVAL_DB=1
export DATABASE_URL="<disposable-eval-url>"
npx vitest run tests/package-graph-authority/persistence-identity.test.ts --reporter=verbose
```

6. Archive pass evidence (commands, host fingerprint without secrets, full vitest output).

## 7. Archive status

**ARCHIVED** as this document under `docs/package-graph-authority/`.  
Live persistence proof remains **open** until remediation completes.
