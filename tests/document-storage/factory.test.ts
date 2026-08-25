/**
 * getDocumentStorageProvider() - the ONE place environment-based branching
 * exists in the document-storage abstraction.
 */
import { afterEach, describe, expect, it } from "vitest";
import { getDocumentStorageProvider } from "../../lib/document-storage";
import { LocalFilesystemStorageProvider } from "../../lib/document-storage/local-fs-provider";
import { VercelBlobStorageProvider } from "../../lib/document-storage/vercel-blob-provider";

const ORIGINAL = process.env.BLOB_READ_WRITE_TOKEN;

afterEach(() => {
  if (ORIGINAL === undefined) delete process.env.BLOB_READ_WRITE_TOKEN;
  else process.env.BLOB_READ_WRITE_TOKEN = ORIGINAL;
});

describe("getDocumentStorageProvider", () => {
  it("returns LocalFilesystemStorageProvider when BLOB_READ_WRITE_TOKEN is unset", () => {
    delete process.env.BLOB_READ_WRITE_TOKEN;
    expect(getDocumentStorageProvider()).toBeInstanceOf(LocalFilesystemStorageProvider);
  });

  it("returns VercelBlobStorageProvider when BLOB_READ_WRITE_TOKEN is set", () => {
    process.env.BLOB_READ_WRITE_TOKEN = "vercel_blob_rw_test_token";
    expect(getDocumentStorageProvider()).toBeInstanceOf(VercelBlobStorageProvider);
  });
});
