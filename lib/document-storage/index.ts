/**
 * Document storage abstraction - public entry point
 * (docs/document-onboarding-pipeline-foundation.md).
 *
 * `getDocumentStorageProvider()` is the ONLY place in this codebase that
 * branches on environment to decide which DocumentStorageProvider backs the
 * pipeline - every other caller (parsing, chunking, a later phase's upload
 * route) programs against the DocumentStorageProvider interface only.
 */

import { LocalFilesystemStorageProvider } from "./local-fs-provider";
import { VercelBlobStorageProvider } from "./vercel-blob-provider";
import type { DocumentStorageProvider } from "./types";

export type { DocumentStorageProvider } from "./types";
export { LocalFilesystemStorageProvider } from "./local-fs-provider";
export { VercelBlobStorageProvider } from "./vercel-blob-provider";

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

export function getDocumentStorageProvider(): DocumentStorageProvider {
  if (process.env.BLOB_READ_WRITE_TOKEN) {
    return new VercelBlobStorageProvider();
  }
  if (process.env.VERCEL) {
    throw new MissingBlobStorageConfigError();
  }
  return new LocalFilesystemStorageProvider();
}
