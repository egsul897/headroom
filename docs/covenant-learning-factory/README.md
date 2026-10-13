# Covenant Learning Factory

Issuer-agnostic orchestration over Headroom’s existing Phase 1–4 compiler, knowledge factory, and Neon knowledge tables.

**Precedent processing ≠ training, certification, or production authority.**

## Commands

```bash
npm run clf:inventory      # Workstream A baseline + registered packages
npm run clf:batch -- --max=3
npm run clf:demo-unseen    # MTN / MHK / ROCK / CHWY same compiler
npm run clf:dashboard
npm run test:clf
```

Neon connect probe (no secrets printed):

```bash
npm run clf:neon-connect
```

HTTPS transport (Cloud Agents that block TCP 5432; uses `@neondatabase/serverless` + `PrismaNeonHTTP`):

```bash
export NEON_TRANSPORT=https
npm run clf:neon-apply    # idempotent additive learning_* migration only
npm run clf:neon-verify   # row counts per learning_* table
npm run clf:batch -- --persist-neon --max=2
```

Default (unset `NEON_TRANSPORT`) keeps Prisma TCP behavior unchanged.

Live Neon persist (optional; requires authenticated `DATABASE_URL` + applied migration):

```bash
npm run clf:batch -- --persist-neon --max=2
```

## Layout

| Path | Role |
|---|---|
| `lib/covenant-learning-factory/` | Registry, cohorts, process loop, batch runner, dashboard |
| `prisma/migrations/20261013180000_covenant_learning_factory/` | Additive `learning_*` tables |
| `.local-knowledge-corpus/covenant-learning-factory/` | File-backed manifests / checkpoints (gitignored) |
| `docs/covenant-learning-factory/` | Inventory, dashboard, demo artifacts, mission report |

## Knowledge states

Automated paths may append **PROPOSED** or **REVIEW_REQUIRED** only.  
**VERIFIED / REJECTED / SUPERSEDED** require attributable reviewer action.  
Never writes production `Permission`, ledger usage, or APPROVED financial snapshots.

## Cohorts

- **HELD_OUT** default: Mohawk (`0000851968` / MHK)
- **TRAIN_DEV**: all other registered packages
- Contamination of held-out CIKs into train/dev fails the batch runner closed
