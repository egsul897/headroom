# Test Infrastructure Incident — 2026-08-30

**Verdict: `HEADROOM_TEST_INFRASTRUCTURE_RECOVERY_AND_ISOLATION_PASSED`**

## What happened

During Phase 3F.1.6.RX-FINAL Part A, 7 concurrent workstream agents (each in
its own git worktree) shared one physical Postgres database. During
quality-gate execution, the `Company` table was found at zero rows, with
cascading loss of Coherent/Matthews sandbox data and the two persistent FWRG/
LSB fixture companies. Recovery began, was authorized twice by the user, and
was then explicitly interrupted mid-flight ("Stop here") while a background
compiler call was still running. This document covers the incident-control
response that followed: quiesce, forensics, hardening, and completed
recovery.

## Root cause — `ROOT_CAUSE_CONFIRMED`

Not an application-level `deleteMany`/`TRUNCATE` defect (a targeted grep
found zero catastrophic patterns anywhere in the codebase). The Postgres
server log shows the real mechanism directly: four distinct
`prisma_migrate_shadow_db_<uuid>` connections forcibly terminated within 1.6
seconds of each other, followed by three separate `DROP TABLE
_prisma_migrations` failures (each finding the table already gone) over a
20-minute window. This is the signature of **concurrent `prisma migrate
dev`/`migrate reset` invocations** — every worktree's `.env` pointed at the
identical `DATABASE_URL`, so any one workstream running the standard
`npm run prisma:migrate` script (`prisma migrate dev`) could trigger an
unattended, drift-triggered reset that silently wipes every other agent's
data. This repository's own `docs/CODEX-HANDOFF.md` already documented this
exact hazard ("`prisma migrate dev`/`db push` are non-interactive-hostile in
this sandbox... never reset/force a real database") — the incident is that
convention being violated under concurrency pressure, not a new discovery.

## Hardening added

- `lib/testing/disposable-db.ts` + `ephemeral-db.ts`: a real, per-worktree
  ephemeral Postgres database lifecycle (`createdb` → `prisma migrate
  deploy` → use → `dropdb`), gated by a live `current_database()`
  naming-convention check so a destructive reset can never target the
  persistent regression database.
- `scripts/check-destructive-db-patterns.ts`: a bounded static guard against
  the catastrophic empty-predicate `deleteMany` shapes and unguarded
  `migrate dev`/`migrate reset`/`db push` usage (`npm run
  db:check-destructive-patterns`), verified to catch 7/7 injected
  violations and clean against the real repository.
- Fixed `package.json`'s own `prisma:migrate` script from `migrate dev` to
  `migrate deploy`, closing the standing footgun that contradicted the
  project's own documented convention.
- `tests/infrastructure/db-isolation-adversarial.test.ts`: real-Postgres
  proof (not a design claim) that a destructive reset against one ephemeral
  database leaves sibling ephemeral databases and the persistent regression
  database completely unaffected.

## Recovery

Coherent and Matthews were restored earlier in this response (13 fully
deterministic, zero-LLM-cost scripts, independently re-verified 236/236).
The two persistent FWRG/LSB fixture companies required a real, paid rerun of
`scripts/run-phase-c-compiler.ts` (their data originates from real LLM
calls) — the user was shown the ~$1.6 estimate and supplied a credential.
Both packages completed cleanly in the foreground (this time waited for, not
backgrounded and lost track of): FWRG 12/18 correct evaluation, LSB 11/14,
both 0% dangerous-unflagged, real cost **$1.48** total. CONMED and DSGR were
never affected — their own known-package regression script is entirely
fixture-file + scratch-company based and was independently re-confirmed
unchanged.

The full untargeted suite now passes completely: **240 files, 2515 tests,
zero failures**, including the two certification tests that were failing
before recovery and the new isolation adversarial test. The
`_prisma_migrations` bookkeeping table (separately found missing, a residual
of the incident) was repaired via `prisma migrate resolve --applied` for all
30 migrations — `prisma migrate status` now reports "Database schema is up
to date!" instead of the misleading "30 migrations not applied."

## Production code: untouched throughout

`git diff c2954d3 HEAD -- lib app prisma/schema.prisma prisma/migrations`
shows only the two new, additive `lib/testing/*.ts` isolation modules — every
line of the 7 workstreams' own Part A fixes for the 8 frozen findings is
byte-identical to before the incident. This was purely a data-plane event;
it never touched the git-tracked source tree. All 8 findings' production
fixes are classified `VALID` with no re-work required.

## Artifact index

`docs/test-infrastructure-incident-2026-08-30/`: 00–01 (quiesce), 02
(mid-recovery snapshot), 03 (timeline), 04–05 (package/half-written state),
06–07 (paid-AI accounting, recoverable artifacts), 08–10 (destructive-op
inventory, root cause, concurrency), 11–13 (isolation design, guards,
adversarial proof), 14–16 (recovery plan, execution, fixture integrity),
17–18 (false-credit re-check, snapshot), 19–20 (prior-evidence validity,
infrastructure verdict).

## Next step

Infrastructure verdict PASSED unlocks continuation of the terminal Phase
3F.1.6.RX-FINAL certification (Part A verdict → production freeze → Part B
independent recertification → final terminal verdict) in the same session,
per the incident-control charter's own §29 instruction to resume from
exactly where remediation was stopped.
