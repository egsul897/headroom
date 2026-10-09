# M1 — Repository builds, modules execute, application launches

| Field | Value |
|---|---|
| Base main SHA | `617dbd4738d469fbe4bf123694839950adc222e9` |
| Integration branch | `cursor/full-repo-execution-0e3f` |
| Changed surface | Merged #177 + #176/#175 onto main; package.json scripts unified |
| DB effects | None in this commit (reads + prior `conmed-demo` rows unchanged) |

## Commands / results

| Command | Result |
|---|---|
| `npx prisma generate` | OK |
| `npx tsc --noEmit` | OK (exit 0) |
| KF + storage + product + acceptance vitest | 302 passed / 28 skipped |
| `verified-execution` | 29 passed |
| `npm run build` | OK — product routes including covenants/position/evidence/documents/[id] |
| `kf:consolidation-dry-run` | OK — approval checkpoint; BYTEA table absent |

## Known blockers

- BYTEA migrations undeployed → durable corpus import fail-closed  
- #136 not mergeable for certified path  
- CONMED capacity NOT DETERMINABLE without financials/IR (by design)  

## Next

Owner approve migrate deploy + Gibraltar durable proof (M2/M6 durability).
