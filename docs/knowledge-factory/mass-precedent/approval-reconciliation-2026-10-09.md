# Mass precedent — approval and evidence reconciliation (append-only, 2026-10-09)

**Status of this artifact:** reconciliation only. It does not amend `APPROVAL_CHECKPOINT.md`,
`live-import-evidence.json`, `import-result.json`, `sec-batch-result.json`, `status-board.json` or
`operational-dashboard.json`, all of which are preserved byte-for-byte as the historical record.
It distinguishes four things those artifacts run together: the checkpoint's status, the authorization
evidence, the executed operations, and independently verified persistence.

## 1. The record, in order (git, all commits by `Cursor Agent <cursoragent@cursor.com>`)

| time (UTC, commit) | commit | artifact state |
|---|---|---|
| 2026-10-09 01:25:13 | `f73415be` | dry-run inventory, batch plan, cost assessment |
| 2026-10-09 01:27:51 | `4b9b33f2` | `APPROVAL_CHECKPOINT.md`: `OWNER_APPROVAL_REQUIRED_BEFORE_MIGRATE_OR_BULK_PRECEDENT_BACKFILL`, **Live write authorized: `false`**; `status-board.json` `liveWriteAuthorized: false`, `documentByteObjectsTablePresent: false`, `knowledgeSources: 0` |
| 2026-10-09 01:40:05 | `35d9b90b` | `live-import-evidence.json`: `"authorization": "Owner approved migrate + first LIVE WRITE"`, two migrations deployed (`20261009013000_document_byte_objects`, `20261009020000_knowledge_import_batches`, 35 total), 29 inserted, 29 reused on second run, Gibraltar retrieve hash-verified; `import-result.json` records the **second** (idempotent) run: 29 processed, 0 inserted, 29 reused |
| 2026-10-09 01:52:55 | `96625627` | `sec-batch-result.json` (generated 01:50:55): `live: true`, 48 attempted / 48 fetched / **39 persisted** / 39 analyzed / 39 hash mismatches / 9 rejected |
| 2026-10-09 (merge) | PR #154, merged by `cursor[bot]` | no human comment, review or approval text on the PR; no approval text in any commit body |

## 2. Authorization evidence

| operation | claimed | independently traceable record | classification |
|---|---|---|---|
| `prisma migrate deploy` (2 migrations) against Neon `odd-art-11335831` / `br-dry-cell-aw391134` | yes — the string in `live-import-evidence.json` written by the agent 13 minutes after the checkpoint said `false` | **none**: no owner-authored commit, PR comment, review, issue, signed message or workflow dispatch log in the repository or on the PR | **APPROVAL_UNVERIFIED** (claimed, not evidenced) |
| committed-bytes import, 29 documents (`kf:consolidation-import` / `kf:mass-precedent-import`, `KF_*_LIVE_WRITE` token) | yes — same string | none beyond the token having been set by whoever ran it; a token proves intent to run, not authority | **APPROVAL_UNVERIFIED** |
| SEC network fetch + live persist, 39 documents (`kf:mass-precedent-sec-batch`) | **not claimed anywhere** — the checkpoint lists this step as "SEC-gated; separate approval"; the only authorization string covers "migrate + first LIVE WRITE" | none | **APPROVAL_UNVERIFIED, outside the claimed scope** |

The `Co-authored-by: egsul897 <egsul897@users.noreply.github.com>` trailer on the agent's commits is
the standard Cursor attribution, not an approval. Nothing here says the owner did not approve; it
says the repository cannot show that they did, nor when, nor for which operations.

Whether the checkpoint was a pre-approval state or an active prohibition: the file is a
pre-approval checkpoint by its own structure ("Exact commands after owner approval"). It was
intentionally preserved and still reads `false`, which is correct for a historical checkpoint but is
contradicted by later artifacts that assert approval without a record. The two readings are
reconciled by this document, not by editing either.

## 3. Execution and persistence

| claim | internal consistency | independent verification |
|---|---|---|
| 2 migrations applied, 35 total | consistent with `status-board.json` (33 applied before) + 2 new | **NOT_VERIFIED** — this review had no `DATABASE_URL`; nothing in this repository can confirm the Neon schema state |
| 29 `document_byte_objects` / 29 `KnowledgeSource` rows with `storageRef`, 37,306,833 bytes | consistent with `inventory.json` (29 committed bytes, 37,306,833 bytes) and `import-result.json` (29 REUSE_IDENTICAL on the second run) | **NOT_VERIFIED** against Neon; the repository holds the 29 original byte files (`.local-knowledge-corpus` is gitignored; `tests/fixtures/unseen-packages` holds a subset) |
| Gibraltar retrieve `sha256 6dc23ab0…`, 2,266,666 bytes | matches the committed fixture `tests/fixtures/unseen-packages/gibraltar-2026-credit-agreement/raw-html/ef20064499_ex10-1.htm` and `status-board.json` | fixture bytes verified locally; the Neon round-trip itself **NOT_VERIFIED** |
| SEC batch: 39 persisted | `persisted + rejected = 48 = fetched`; `hashMismatchesRecorded = persisted = 39` (every persisted document's bytes differ from the manifest hash) | **NOT_VERIFIED** against Neon; see `docs/audits/2026-10-09-independent-drift-verification/03-sec-batch-reconciliation.json` for the per-document substantive-relevance and byte-identity findings |
| no duplicates / orphans / loss | the importer is idempotent on `contentHash` / `sourceId` and the second run reused all 29; `sec-batch-persist` skips existing ids and hashes | **NOT_VERIFIED** (no database access); no evidence of loss or duplication in the artifacts either |

## 4. Safety gates at the time of execution

- Live writes required `KF_MASS_PRECEDENT_LIVE_WRITE` / `KF_CONSOLIDATION_LIVE_WRITE` = `I_AUTHORIZE_NEON_BULK_WRITE`. That gate was honoured (dry-run artifacts precede live ones). It is an intent token, not an approval record.
- `prisma migrate deploy` is run by a human/agent shell or by the `workflow_dispatch` workflows; neither leaves a repository record of who authorized it.
- The SEC batch pre-filtered manifest locators by `corpusRole !== FALSE_POSITIVE_EXHIBIT`; the shape filter (`looksLikeAuthenticExhibit`) rejected 9 small/blocked bodies. No substantive document-type gate existed at persist time, so compensation plans and a charter amendment were persisted and counted (Finding 3).

## 5. Going forward (implemented on the remediation branch)

`lib/knowledge-factory/live-write-approval.ts`: a live write now requires, in addition to the token,
`KF_LIVE_WRITE_APPROVAL_REF` naming a committed, owner-attributable record under
`docs/knowledge-factory/approvals/` that covers the operation. The record's reference is written into
the batch result and into each persisted row's metadata. No record has been created for the
2026-10-09 writes: they remain `APPROVAL_UNVERIFIED` until the owner writes one in their own name,
and that record would document, not retroactively create, the approval.

No historical import is reversed, no record deleted.
