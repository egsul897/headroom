/**
 * Document storage abstraction - public entry point
 * (docs/document-onboarding-pipeline-foundation.md).
 *
 * `getDocumentStorageProvider()` is the ONLY place in this codebase that
 * branches on environment to decide which DocumentStorageProvider backs the
 * pipeline - every other caller (parsing, chunking, a later phase's upload
 * route) programs against the DocumentStorageProvider interface only.
 *
 * Cursor-first durable bytes: when DOCUMENT_STORAGE_BACKEND=postgres (or
 * KF durable path selects postgres), use PostgresDocumentStorageProvider.
 * Vercel Blob remains available when BLOB_READ_WRITE_TOKEN is set.
 */

import { LocalFilesystemStorageProvider } from "./local-fs-provider";
import { PostgresDocumentStorageProvider } from "./postgres-bytea-provider";
import { VercelBlobStorageProvider } from "./vercel-blob-provider";
import type { DocumentStorageProvider } from "./types";

export type { DocumentStorageProvider } from "./types";
export { LocalFilesystemStorageProvider } from "./local-fs-provider";
export { VercelBlobStorageProvider } from "./vercel-blob-provider";
export {
  PostgresDocumentStorageProvider,
  POSTGRES_BYTEA_PROVIDER_ID,
  POSTGRES_BYTEA_REF_PREFIX,
  isPostgresByteaStorageRef,
  buildPostgresByteaStorageRef,
  parsePostgresByteaStorageRef,
} from "./postgres-bytea-provider";

/**
 * Thrown by getDocumentStorageProvider() when running on Vercel
 * (`process.env.VERCEL` - Vercel's own standard env var, set on every
 * Production/Preview/`vercel dev` invocation) without BLOB_READ_WRITE_TOKEN
 * configured. Deliberately fails loudly here rather than silently returning
 * LocalFilesystemStorageProvider: that provider writes under
 * `path.join(process.cwd(), ".local-blob-storage")`, and a Vercel Node.js
 * serverless function's `process.cwd()` is the read-only deployment bundle
 * (only `/tmp` is writable) - a silent fallback would not fail here, it
 * would fail later with an opaque `EROFS`/`ENOENT` deep inside a file write,
 * indistinguishable from a random crash. This surfaces the real,
 * actionable cause at the one place that actually knows it.
 */
export class MissingBlobStorageConfigError extends Error {
  constructor() {
    super("BLOB_READ_WRITE_TOKEN is not set in this Vercel deployment, so document uploads cannot work: Vercel's serverless filesystem has no writable local-storage fallback outside /tmp. Connect Vercel Blob to this project (Vercel dashboard -> Project -> Storage -> Blob -> Connect to Project) and redeploy.");
  }
}

export class MissingPostgresByteaConfigError extends Error {
  constructor() {
    super(
      "DOCUMENT_STORAGE_BACKEND=postgres requires DATABASE_URL (shared Neon/Postgres with document_byte_objects migration applied).",
    );
  }
}

/**
 * Resolve storage backend for general onboarding callers.
 *
 * Priority:
 * 1. BLOB_READ_WRITE_TOKEN → Vercel Blob (unchanged production path)
 * 2. DOCUMENT_STORAGE_BACKEND=postgres|postgres-bytea → Postgres BYTEA
 * 3. DATABASE_URL present (Cursor/Neon) → Postgres BYTEA by default
 * 4. VERCEL without blob → fail loud
 * 5. else local filesystem (dev/test only — never durable)
 */
export function getDocumentStorageProvider(): DocumentStorageProvider {
  if (process.env.BLOB_READ_WRITE_TOKEN) {
    return new VercelBlobStorageProvider();
  }
  const backend = (process.env.DOCUMENT_STORAGE_BACKEND || "").trim().toLowerCase();
  const inAutomatedTest =
    process.env.VITEST === "true" ||
    process.env.NODE_ENV === "test" ||
    process.env.DOCUMENT_STORAGE_BACKEND === "local";
  const preferPostgres =
    backend === "postgres" ||
    backend === "postgres-bytea" ||
    (backend === "" && Boolean(process.env.DATABASE_URL?.trim()) && !inAutomatedTest);
  if (preferPostgres) {
    if (!process.env.DATABASE_URL?.trim()) {
      throw new MissingPostgresByteaConfigError();
    }
    return new PostgresDocumentStorageProvider();
  }
  if (process.env.VERCEL) {
    throw new MissingBlobStorageConfigError();
  }
  return new LocalFilesystemStorageProvider();
}
