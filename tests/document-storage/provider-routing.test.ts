/**
 * Retrieval must route by the storageRef's own scheme, not by
 * current env: a document uploaded when the backend was Postgres
 * (ref pgbytea:v1:...) still lives in Postgres even if
 * BLOB_READ_WRITE_TOKEN is set later. Strata re-analysis failed
 * with "blob not found" because re-analysis retrieved through
 * the env-default Vercel Blob provider.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

// Break the prisma import chain (postgres provider imports prisma;
// the test never touches the DB).
vi.mock("@/lib/prisma", () => ({ prisma: {} }));
import {
  LocalFilesystemStorageProvider,
  PostgresDocumentStorageProvider,
  VercelBlobStorageProvider,
  getDocumentStorageProviderForRef,
} from "../../lib/document-storage";

const ENV_KEYS = ["BLOB_READ_WRITE_TOKEN", "DOCUMENT_STORAGE_BACKEND", "DATABASE_URL", "VERCEL", "NODE_ENV", "VITEST"];
const saved = new Map<string, string | undefined>();

afterEach(() => {
  for (const k of ENV_KEYS) {
    const v = saved.get(k);
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  saved.clear();
});

function clearEnv() {
  for (const k of ENV_KEYS) {
    if (!saved.has(k)) saved.set(k, process.env[k]);
    delete process.env[k];
  }
}

describe("getDocumentStorageProviderForRef", () => {
  it("routes pgbytea: refs to Postgres even when a Blob token is set", () => {
    clearEnv();
    process.env.BLOB_READ_WRITE_TOKEN = "fake-token";
    const p = getDocumentStorageProviderForRef(`pgbytea:v1:${"a".repeat(64)}`);
    expect(p).toBeInstanceOf(PostgresDocumentStorageProvider);
  });

  it("routes https Blob URLs to Vercel Blob", () => {
    clearEnv();
    const p = getDocumentStorageProviderForRef("https://example.blob.core.windows.net/container/doc.pdf");
    expect(p).toBeInstanceOf(VercelBlobStorageProvider);
  });

  it("falls back to the env default for unrecognized refs", () => {
    clearEnv();
    const p = getDocumentStorageProviderForRef("legacy-ref-without-scheme");
    expect(p).toBeInstanceOf(LocalFilesystemStorageProvider);
  });
});
