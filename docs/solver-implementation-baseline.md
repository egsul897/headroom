# Solver Implementation — Phase 0 Baseline

**Purpose**: record the state of the repository immediately before Phases 1–7
of `docs/solver-architecture-design.md` are implemented, so the "zero
Permission rows populated → behavior unchanged" requirement has a concrete
before-snapshot to diff against.

## Commit

Baseline commit (before any solver-infrastructure code was added):

```
3e2d26ed2b1bcb19c806933a0f613f8ae539fa5c
Add generalized Phase 1 solver architecture design
```

Branch: `claude/headroom-scaffold-covenant-engine-jrijk8`

## Environment

- PostgreSQL 16 (local, `postgresql://postgres:headroom@localhost:5432/headroom`)
- Node/npm as configured in `package.json` (Next.js 14.2.35, Prisma 5.22, Vitest 2.1.9)

## Baseline check results (all run against the commit above, before any change)

| Check | Command | Result |
|---|---|---|
| Prisma schema validity | `npx prisma validate` | ✅ `The schema at prisma/schema.prisma is valid` |
| Migrations applied | `npx prisma migrate deploy` | ✅ 5 migrations found, no pending migrations |
| TypeScript | `npx tsc --noEmit` | ✅ clean, zero errors |
| ESLint | `npx eslint . --ext .ts,.tsx` | ✅ clean, zero warnings/errors |
| Seed | `npm run prisma:seed` | ✅ `Seeded Coherent Corp. (coherent)` |
| Vitest (full suite) | `npx vitest run` | ✅ **4 test files, 23 tests, all passed** (`tests/ledger-regression.test.ts` 4, `tests/covenant-engine.test.ts` 9, `tests/synthetic-company.test.ts` 7, `tests/versioning.test.ts` 3) |
| Golden tests | `npm run golden-test` | ✅ **29 passed, 0 failed, 1 flagged out-of-scope, 0 errored (30 total)** — the 1 flagged row is `OUT_OF_SCOPE` (Restricted/Unrestricted Subsidiary redesignation), which is flagged by design and does not affect the exit code |
| Production build | `npm run build` | ✅ compiled successfully, 9/9 static pages generated, zero type errors |

## Verdict

**Baseline is green.** Nothing is unexpectedly failing. Phases 1–7 may proceed.

This document is the reference point for the "Legacy compatibility
requirement" in the task spec: every one of the above commands is re-run
verbatim at the end of Phase 7 (see
`docs/solver-implementation-phases-0-7-report.md` §M "Legacy regression
results"), with zero `Permission` (or other new solver-native table) rows
populated, and must show byte-for-byte identical pass/fail counts.
