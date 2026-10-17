# Neon HTTPS loader (scripts only)

Cloud Agents that block TCP 5432 use `NEON_TRANSPORT=https`.

## Commands

```bash
export NEON_TRANSPORT=https
# DATABASE_URL must be set (never printed by these scripts)

npm run neon:https-migrate
# Apply ALL prisma/migrations in order over HTTPS (idempotent; skips applied,
# including 20261013180000_covenant_learning_factory). Safe on a DB that already
# has learning_* tables.

npm run neon:https-precedent-import
# Dry-run by default. Live write:
KF_MASS_PRECEDENT_LIVE_WRITE=I_AUTHORIZE_NEON_BULK_WRITE \
  npm run neon:https-precedent-import
# Imports mass-precedent committed bytes → knowledge_sources + document_byte_objects
# and docs/knowledge-factory/export/v1 → kf_precedent_* (COMPUTED_NOT_CERTIFIED).
# Never ContractRule / certification.

npm run neon:https-verify
# Per-table row counts.

# Re-persist local CLF packages that never reached Neon (no recompile):
npm run clf:batch -- --persist-neon --force --packages=chwy-2026-credit-agreement,gibraltar-2026-credit-agreement
# or explicitly:
npm run clf:batch -- --persist-neon --re-persist --packages=chwy-2026-credit-agreement,gibraltar-2026-credit-agreement
```

Default Prisma TCP via `lib/prisma.ts` is unchanged. This stack stays in `scripts/neon-https` + `lib/neon-https` (eslint-ignored for Next).
