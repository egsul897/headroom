# Live-write approval records

A live Neon write (`prisma migrate deploy` against the shared branch, bulk precedent import, SEC
batch persist, derived-export import) requires a committed approval record in this directory, named
by `KF_LIVE_WRITE_APPROVAL_REF` at run time, in addition to the live-write token. The token is an
intent to run; the record is the authority to run. `lib/knowledge-factory/live-write-approval.ts`
validates it and refuses otherwise.

Format (one `key: value` per line; other lines are free text):

```
approvedBy: <owner identity, e.g. GitHub login or signed email>
approvedAt: <ISO-8601 timestamp>
environment: <Neon project / branch / database>
scope: <what may be written, e.g. "document_byte_objects + KnowledgeSource for 71 manifest locators">
operations: <comma-separated: prisma-migrate-deploy, consolidation-import, mass-precedent-import, mass-precedent-sec-batch, derived-export-import>
reference: <where the approval was given: PR comment URL, issue, signed message>
```

Rules: the approver writes or co-signs the record in a commit attributable to them (not an agent's
commit on their behalf); one record per approval, never edited after the write it authorized ran;
no record is ever created retroactively to make an already-executed write look approved — that case
is recorded as `APPROVAL_UNVERIFIED` in a reconciliation artifact instead.

No approval record exists in this directory for the 2026-10-09 migrations, the 29-document import
or the 39-document SEC batch; see
`docs/knowledge-factory/mass-precedent/approval-reconciliation-2026-10-09.md`.
