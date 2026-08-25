# Headroom — Live Document Upload Bugfix

**Status: CODE FIX APPLIED, NOT YET LIVE-VERIFIED.** This document reports a
root-caused, tested code fix for the reported production document-upload
failure. It does **not** report a confirmed live fix — this sandbox has no
Vercel API/dashboard access and no way to reach the production app as an
anonymous HTTPS client (`https://headroom-debt-compass.vercel.app` redirects
to Vercel's team-SSO login, i.e. Deployment Protection is on). See §H.

## A. Root cause (proven by code inspection + Vercel platform documentation, not live reproduction)

`lib/document-storage/index.ts`'s `getDocumentStorageProvider()` silently
returned `LocalFilesystemStorageProvider` whenever `BLOB_READ_WRITE_TOKEN`
was unset or unreadable — regardless of whether the code was running on
Vercel or on a developer's own machine. `LocalFilesystemStorageProvider`
writes under `path.join(process.cwd(), ".local-blob-storage")`
(`lib/document-storage/local-fs-provider.ts`). On a Vercel Node.js
serverless function, `process.cwd()` resolves to the read-only deployment
bundle directory — only `/tmp` is writable, and this provider never uses
`/tmp`. The `mkdir(...)`/`writeFile(...)` calls in `store()` would fail with
an `EROFS: read-only file system` error, thrown from deep inside a file
write with no context about *why* — exactly the kind of failure that
reaches a user as a generic, unhelpful error and a Vercel function log with
no obvious storage-configuration explanation.

This is the single most likely cause of "document upload does not work in
the live deployed product," and is not a guess: it follows directly from
Vercel's own documented serverless filesystem model (writable only under
`/tmp`), independent of this app's specific behavior. Whether
`BLOB_READ_WRITE_TOKEN` is in fact unset in Vercel Production is something
I cannot directly confirm from this sandbox (see §H) — but the code had no
safeguard against exactly this misconfiguration, and the fix closes that
gap regardless of which specific condition is currently true in Production.

## B. Files changed

- `lib/document-storage/index.ts` — `getDocumentStorageProvider()` now
  throws a new `MissingBlobStorageConfigError` (with the exact Vercel
  dashboard remedy in its message: Storage → Blob → Connect to Project) when
  `process.env.VERCEL` is set (Vercel's own standard env var, present on
  every Production/Preview/`vercel dev` invocation) and
  `BLOB_READ_WRITE_TOKEN` is not — instead of silently falling back to a
  provider guaranteed to fail on Vercel's filesystem. Local dev/test
  (`VERCEL` unset) keeps the existing `LocalFilesystemStorageProvider`
  fallback unchanged.
- `lib/document-storage/types.ts` — added `delete(storageRef): Promise<void>`
  to the `DocumentStorageProvider` interface (best-effort orphan cleanup;
  must never throw).
- `lib/document-storage/local-fs-provider.ts` / `vercel-blob-provider.ts` —
  implement `delete()` (`unlink`/`@vercel/blob`'s `del()` respectively, both
  swallowing their own errors).
- `lib/onboarding/documents.ts` — `uploadAndChunkDocument` now wraps the
  `Document` row creation in a try/catch: if it throws after the blob was
  already stored, the orphaned blob is deleted (best-effort) and the
  original DB error is rethrown unchanged. No Document row can ever exist
  without a real, already-stored blob behind it.
- `next.config.mjs` — server-action body-size limit raised from 20mb to
  50mb (a real filed credit agreement with exhibits/schedules can run
  20-30MB as a scanned PDF; 20mb was cutting it close).
- New tests (§I).

## C. Env/config issue

Cannot be confirmed from this sandbox which env vars are actually set in
Vercel Production — no dashboard/API access here. See §H for exactly what
is needed to close this out, and §D for the one indirect signal I do have.

## D. Vercel Blob status

**Indirect signal only, not a direct check**: `BLOB_READ_WRITE_TOKEN`'s mere
presence is not proof a Blob *store* is actually connected to this project
(the token could be stale, scoped to a deleted store, or never connected in
the first place). `@vercel/blob@2.8.0` exports a `BlobStoreNotFoundError`
specifically for this case — if that is what's actually happening in
Production, §A's fix does not change the failure (the token IS set, so the
new `MissingBlobStorageConfigError` guard never fires), but the underlying
`put()` call will now throw that specific, named error rather than
whatever opaque error it threw before, which is a real diagnostic
improvement either way. I cannot confirm which of "token unset" vs. "token
set but store not actually connected" is the real Production state without
either Vercel dashboard access or a live request — see §H.

## E. Runtime issue

None found. Checked for any `export const runtime = "edge"` anywhere under
`app/` — none exists, so every route (including the upload server action)
runs on Node.js runtime by default, which is required here (`Buffer`,
`unpdf`, `mammoth`, and `@vercel/blob`'s Node SDK are all Node-runtime-only;
none of them work on Edge). No runtime-boundary change was needed.

## F. DB persistence result

Verified against real, hosted-equivalent Postgres in this sandbox (same
schema as the now-migrated Neon hosted DB): a successful upload persists a
`Document` row with `storageRef`/`storageProvider` set, `source:
"user-upload"`, `typeConfirmedByUser: false`, plus its `DocumentChunk` rows
— `tests/onboarding/documents.test.ts`. **Not yet confirmed against the
actual hosted Neon database from a live Production request** (see §H) —
only that the code path, exercised against a real Postgres instance with
the same schema, behaves correctly.

## G. Refresh persistence result

Verified locally: re-querying `getDocumentsWithExtractionStatus` (the exact
function `app/[companyId]/onboarding/documents/page.tsx` calls on every
render — it holds no in-memory/session state) after an upload still returns
the document with the correct chunk count
(`tests/onboarding/documents.test.ts`, "survives a refresh"). Not yet
confirmed via an actual browser refresh against the live app (§H).

## H. Extraction-from-uploaded-document result

Verified at the code/test level: `storage.retrieve(document.storageRef)`
returns byte-identical content to what was uploaded, and `parseDocument()`
on the retrieved bytes parses correctly
(`tests/onboarding/documents.test.ts`). **One real finding along the way**:
nothing in the application UI currently calls `DocumentStorageProvider.retrieve()`
at all — extraction (`runExtractionForDocument`) reads only the already-
persisted `DocumentChunk` rows created at upload time, never re-fetches the
original file. There is no "open/view the original uploaded file" route in
the product today. This is not part of the reported upload bug and was
deliberately left alone (`Do NOT add new product features`), but it means
acceptance-test step 9.9 ("Open/retrieve the document through the app")
cannot be demonstrated through the live UI as written — only through
direct calls to the storage layer, which the new tests do.

### What actually blocks live verification

This sandbox has:
- No Vercel API, CLI, or dashboard access — cannot list/confirm Production
  env var names, confirm Blob store provisioning, or read Vercel function
  logs.
- No reachable path to the live app as an anonymous HTTPS client —
  `https://headroom-debt-compass.vercel.app` redirects to Vercel's
  team-SSO login (Deployment Protection is on for this project).

A Vercel "Protection Bypass for Automation" secret (Project Settings →
Deployment Protection) would let a future pass reach the live app directly
via the `x-vercel-protection-bypass` header and complete the required live
acceptance walkthrough (upload → confirm Neon row → confirm Blob object →
refresh → re-open → extraction) end to end. Until then, §F/§G/§H's "verified"
claims are **code-and-test-level**, not live-production-level, per the
task's own explicit "do not declare success on a local-only fix."

## I. Tests

All new/updated, all passing:
- `tests/document-storage/factory.test.ts` — extended: `VERCEL` set +
  `BLOB_READ_WRITE_TOKEN` unset → throws `MissingBlobStorageConfigError`
  (never falls back to local-fs); `VERCEL` set + token set → still
  `VercelBlobStorageProvider`; `VERCEL` unset + token unset → still
  `LocalFilesystemStorageProvider` (dev/test fallback preserved).
- `tests/document-storage/local-fs-provider.test.ts` — `delete()` removes a
  stored file; `delete()` of a nonexistent file does not throw.
- `tests/document-storage/vercel-blob-provider.test.ts` — `delete()` calls
  `del()` with the storageRef; `delete()` never throws even when `del()`
  itself fails.
- `tests/onboarding/documents.test.ts` (new file) — content-type validation
  (supported/unsupported extensions); successful upload persists the
  Document row + chunks + remotely-retrievable bytes that reparse
  correctly; refresh persistence; DB-write-fails-after-blob-stored →
  orphaned blob is cleaned up (a real Prisma FK-violation, not mocked) and
  no Document row is left behind.
- `tests/onboarding/documents-storage-failure.test.ts` (new file) — the
  storage write itself failing propagates the error and creates zero
  Document rows (never a half-uploaded document).

Regression, all matching the established baseline: `prisma validate`
valid, `tsc --noEmit` clean, `eslint .` clean, `vitest run` **335/335**
(35 files — 323 baseline + 12 new), Coherent golden-test **26/3/1/0**
unchanged, Matthews golden-test **2/4/10/2** unchanged, `npm run build`
succeeds (all 21 routes, no runtime/route regressions).

## J. GitHub SHA

See the final chat response for the exact commit SHA pushed and merged.

## K. Deployed Vercel SHA

Unknown from this sandbox — no Vercel access. See the final chat response.
