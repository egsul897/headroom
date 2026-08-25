/**
 * Dev/test filesystem fallback for DocumentStorageProvider
 * (docs/document-onboarding-pipeline-foundation.md). Used automatically by
 * getDocumentStorageProvider() whenever BLOB_READ_WRITE_TOKEN is unset - this
 * sandbox's own development and every test in tests/document-storage.test.ts
 * exercise real I/O against this implementation, since the real Vercel Blob
 * provider is not reachable from here (see VercelBlobStorageProvider's own
 * header comment).
 *
 * Writes under a gitignored directory (default `.local-blob-storage/` at the
 * repo root) so a developer's uploaded test documents never end up in git
 * history. Not multi-instance-safe and not what a real deployment uses - it
 * exists purely so this pipeline is exercisable without live Vercel
 * credentials.
 */

import { randomUUID } from "node:crypto";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import type { DocumentStorageProvider } from "./types";

const DEFAULT_BASE_DIR = path.join(process.cwd(), ".local-blob-storage");

/** Strips path separators and other characters that would let a filename or companyId escape the base directory. */
function sanitizePathSegment(segment: string): string {
  const base = path.basename(segment).replace(/[^a-zA-Z0-9._-]/g, "_");
  return base.length > 0 ? base : "_";
}

export class LocalFilesystemStorageProvider implements DocumentStorageProvider {
  constructor(private readonly baseDir: string = DEFAULT_BASE_DIR) {}

  async store(params: { companyId: string; filename: string; contentType: string; data: Buffer }): Promise<{ storageRef: string; provider: string }> {
    const relativeDir = sanitizePathSegment(params.companyId);
    const relativeFile = `${randomUUID()}-${sanitizePathSegment(params.filename)}`;
    const storageRef = path.posix.join(relativeDir, relativeFile);

    const absoluteDir = path.join(this.baseDir, relativeDir);
    await mkdir(absoluteDir, { recursive: true });
    await writeFile(path.join(absoluteDir, relativeFile), params.data);

    return { storageRef, provider: "local-fs-dev" };
  }

  async retrieve(storageRef: string): Promise<Buffer> {
    // storageRef is always exactly two sanitized segments joined by store()
    // above (no ".."/separators can have survived sanitizePathSegment), so
    // re-splitting and re-joining against baseDir cannot escape it.
    const segments = storageRef.split("/").map(sanitizePathSegment);
    const absolutePath = path.join(this.baseDir, ...segments);
    return readFile(absolutePath);
  }

  async delete(storageRef: string): Promise<void> {
    const segments = storageRef.split("/").map(sanitizePathSegment);
    const absolutePath = path.join(this.baseDir, ...segments);
    try {
      await unlink(absolutePath);
    } catch {
      // best-effort - see the interface's own doc comment (types.ts).
    }
  }
}
