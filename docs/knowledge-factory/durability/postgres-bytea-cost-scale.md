# PostgreSQL BYTEA storage — cost and scale assessment

**Scope:** Initial Knowledge Factory corpus on existing Neon (Cursor-first).  
**Not a pricing quote** — planning bounds for when to prefer object storage.

## Initial corpus reference

| Item | Size |
|---|---|
| Gibraltar EX-10.1 fixture (HTML) | **2,266,666 bytes (~2.16 MiB)** |
| Typical credit-agreement HTML exhibit | ~0.5–3 MiB |
| Initial target (1 real doc proof) | ~2.2 MiB |
| Early corpus (≈50 exhibits @ 2 MiB) | ~100–110 MiB raw |
| Early corpus (≈500 exhibits @ 2 MiB) | ~1.0–1.1 GiB raw |

PostgreSQL stores large `BYTEA` via TOAST. HTML often compresses well in TOAST; on-disk may be **below** raw sum. Plan capacity on **raw** size (worst case).

## Neon cost sketch (order of magnitude)

Assume storage billed near **~$0.15–$0.35 per GB-month** (plan-dependent; verify current Neon pricing). Compute is separate and already paid for app/Prisma traffic.

| Corpus raw size | Approx. storage $/month (illustrative) | Notes |
|---|---|---|
| 10 MiB (few docs) | < $0.01 | Noise vs compute |
| 100 MiB (~50 docs) | ~$0.02–$0.04 | Still noise |
| 1 GiB (~500 docs) | ~$0.15–$0.35 | Acceptable for proof/dev |
| 10 GiB (~5k docs) | ~$1.50–$3.50 | Still cheap vs engineering time; watch backups |
| 50–100 GiB | ~$7–$35 | Revisit object storage seriously |

**Verdict for initial corpus:** BYTEA on Neon is **cost-appropriate**. Do not introduce Blob/S3 for cost reasons at proof scale.

## Performance notes

| Dimension | BYTEA on Neon | Prefer object storage when… |
|---|---|---|
| Persist latency | Single INSERT; fine for multi-MB HTML | Sustained multi-hundred-MB blobs |
| Retrieve | Full buffer into Node; OK for 1–5 MiB | Streaming / range reads needed |
| Concurrent agents | Shared DB; connection pool limits | Many parallel multi-MB pulls saturate pool |
| Backup / PITR | Bytes inflate DB backup size | Backup windows grow painfully |
| CDN / public URL | N/A (private registry path) | Need signed URLs / CDN edge |

## Threshold recommendation

Prefer keeping **Postgres BYTEA** while **all** of the following hold:

1. Typical document **≤ ~10 MiB**
2. Total durable corpus **≲ ~5–10 GiB** raw
3. Retrieve pattern is occasional agent/proof pulls, not high-QPS media serving
4. Neon storage + backup size remain operationally comfortable

**Prefer object storage** (existing optional Vercel Blob provider, or later S3-compatible) when any of:

1. Corpus projected **> ~10 GiB** within the planning horizon, **or**
2. Individual artifacts routinely **> ~15–20 MiB**, **or**
3. Backup/restore or connection memory pressure from large BYTEA becomes a measured problem, **or**
4. Production needs signed URL / CDN delivery of original bytes

Switch is **configuration + provider selection** (`KF_BYTE_STORE` / factory), not a registry redesign — `KnowledgeSource.storageRef` already opaque.

## Migration path (future)

1. Keep `document_byte_objects` for small/medium corpus or dual-read during cutover.
2. Persist new large objects via Blob (or other) with `storageRef` URL.
3. Optionally backfill large rows out of BYTEA; leave registry rows intact.
4. Never invent a second corpus registry.

## Decision for Track A2

**Use Postgres BYTEA now.** Re-evaluate at ~5–10 GiB or when a measured ops pain appears. Cost is not the blocker for Gibraltar proof or early reuse experiments.
