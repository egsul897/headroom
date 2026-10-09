# Mass precedent acquisition

Controlled path from committed authentic bytes → Neon BYTEA / KnowledgeSource → analysis → product corpus browse.

## Commands

| Command | Effect |
| --- | --- |
| `npm run kf:mass-precedent-dry-run` | Inventory + batch-100 plan (read-only Neon) |
| `npm run kf:mass-precedent-dry-run -- --include-network` | Same + schedule SEC fetch slots |
| `npm run kf:mass-precedent-analyze -- --limit=3` | Local pipeline on committed bytes |
| `npm run kf:mass-precedent-import` | Dry-run unless `KF_MASS_PRECEDENT_LIVE_WRITE=I_AUTHORIZE_NEON_BULK_WRITE` |

## Product

`/research/corpus` — read-only browse of persisted `KnowledgeSource` rows (issuer-disjoint; not operative authority).

## Safety

See `APPROVAL_CHECKPOINT.md`. Stop before `prisma migrate deploy` or bulk write without owner approval.
