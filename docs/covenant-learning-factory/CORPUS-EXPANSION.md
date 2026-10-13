# Precedent corpus expansion

Offline plan (no database). Counts are in-batch deduped by sha256 and by
accession+filename. A live Neon import also skips rows already stored.
Knife River (CIK 0001955520 / KNF) is excluded. Hashes that are not on disk
are not invented.

Regenerate:

```bash
npm run neon:https-precedent-plan
```

Snapshot: `docs/covenant-learning-factory/corpus-expansion-plan.json`.

## knowledge_sources that would be added (54)

| Corpus | Bytes inserted | Metadata only | Not loaded |
| --- | ---: | ---: | --- |
| basket-phase2-edgar | 13 | 0 | 0 |
| fdp-sources | 11 | 0 | 0 |
| amendment-chain-documents | 0 | 30 | 4 hash not recorded (AZZ base and amendments 1–3) |
| edgar-expand-local | 0 until `kf:edgar-expand` writes a manifest | 0 | 0 |

## kf_precedent_corpus_records that would be added (6614)

| Corpus | Rows |
| --- | ---: |
| basket-phase2-export | 1572 |
| basket-phase2-summaries | 8 |
| basket-phase3-export | 1560 |
| basket-phase3-summaries | 399 |
| basket-phase4-export | 1950 |
| basket-phase4-summaries | 10 |
| basket-library-export | 67 |
| fdp-records | 587 |
| amendment-chain-records | 197 |
| precedent-comparison | 228 |
| neon-flywheel | 36 |

## kf_precedent_document_relationships

34 amendment-chain parent/child links (COMPUTED_NOT_CERTIFIED).

## Already covered by the existing HTTPS importer

| Stage | Rows the dry-run would touch |
| --- | ---: |
| mass-precedent byte candidates | 33 |
| export/v1 sources | 125 |
| export/v1 structural nodes | 37789 |
| export/v1 covenant candidates | 4590 |
| export/v1 definitions | 257 |
| export/v1 dependency edges | 23876 |
| export/v1 conditions/exceptions | 14975 |
| export/v1 document relationships | 46 |
| export/v1 unresolved | 3333 |

## Commands the owner runs

```bash
export NEON_TRANSPORT=https
# DATABASE_URL must be set. These scripts do not print it.

npm run neon:https-migrate
npm run neon:https-precedent-plan
npm run neon:https-precedent-import
KF_MASS_PRECEDENT_LIVE_WRITE=I_AUTHORIZE_NEON_BULK_WRITE \
  npm run neon:https-precedent-import
npm run neon:https-verify

export SEC_EDGAR_CONTACT_EMAIL='authorized-operator@your-domain'
export HEADROOM_SEC_FETCH_OWNER=WS-CKF
npm run kf:edgar-expand
npm run kf:edgar-expand -- --universe=sp1500 --max-issuers=1500 --max-fetches=100
npm run kf:edgar-expand -- --resume
```

`sp1500` selects up to 1500 distinct registrants from SEC `company_tickers.json`
and keeps EX-4 / EX-10 credit agreements and indentures. It is not a licensed
S&P 1500 constituent list. Historical pilot-100-v2 found 868 distinct
agreements and queued 149 fetchable; those artifacts were ephemeral.
`kf:edgar-expand` re-discovers and attempts every distinct non-UNKNOWN
agreement. Failures are `UNRESOLVED` with a reason. Rate limit is at most
10 requests/second.
