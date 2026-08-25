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

export function getDocumentStorageProvider(): DocumentStorageProvider {
  if (process.env.BLOB_READ_WRITE_TOKEN) {
    return new VercelBlobStorageProvider();
  }
  return new LocalFilesystemStorageProvider();
}
