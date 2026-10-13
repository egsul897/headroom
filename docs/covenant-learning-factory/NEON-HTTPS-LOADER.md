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
# Imports mass-precedent committed bytes → knowledge_sources + document_byte_objects,
# docs/knowledge-factory/export/v1 → kf_precedent_*,
# and the in-repo corpora (basket phase-2/3/4, financial-definitions-precedent,
# amendment-chain-research, precedent-comparison, neon-corpus-flywheel,
# plus .local-knowledge-corpus/edgar-expand/manifest.jsonl when present).
# Dedupe by sha256 and accession+filename. COMPUTED_NOT_CERTIFIED.
# Never ContractRule / certification.

npm run neon:https-precedent-plan
# Offline counts only. No DATABASE_URL. Writes
# docs/covenant-learning-factory/corpus-expansion-plan.json

npm run neon:https-verify
# Per-table row counts.

# EDGAR expansion (free SEC, <=10 req/s). Writes bytes under
# .local-knowledge-corpus/edgar-expand and imports via the HTTPS loader
# when DATABASE_URL is set. Knife River / KNF / CIK 0001955520 is excluded.
export SEC_EDGAR_CONTACT_EMAIL='authorized-operator@your-domain'
export HEADROOM_SEC_FETCH_OWNER=WS-CKF
npm run kf:edgar-expand
npm run kf:edgar-expand -- --universe=sp1500 --max-issuers=1500 --max-fetches=100
npm run kf:edgar-expand -- --resume
# sp1500 = up to 1500 registrants from SEC company_tickers.json, EX-4/EX-10
# credit agreements and indentures. Not a licensed S&P 1500 list.

# Re-persist local CLF packages that never reached Neon (no recompile):
npm run clf:batch -- --persist-neon --force --packages=chwy-2026-credit-agreement,gibraltar-2026-credit-agreement
# or explicitly:
npm run clf:batch -- --persist-neon --re-persist --packages=chwy-2026-credit-agreement,gibraltar-2026-credit-agreement
```

Default Prisma TCP via `lib/prisma.ts` is unchanged. This stack stays in `scripts/neon-https` + `lib/neon-https` (eslint-ignored for Next).
