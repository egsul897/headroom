/**
 * getDocumentStorageProvider() - the ONE place environment-based branching
 * exists in the document-storage abstraction. Includes the live-document-
 * upload bugfix's own regression coverage (docs/live-document-upload-bugfix.md):
 * on Vercel (process.env.VERCEL set) without BLOB_READ_WRITE_TOKEN, this must
 * now fail loudly instead of silently returning a LocalFilesystemStorageProvider
 * that would crash later with an opaque filesystem error - Vercel's serverless
 * functions cannot write outside /tmp, and this provider does not use /tmp.
 */
import { afterEach, describe, expect, it } from "vitest";
import { getDocumentStorageProvider, MissingBlobStorageConfigError } from "../../lib/document-storage";
import { LocalFilesystemStorageProvider } from "../../lib/document-storage/local-fs-provider";
import { VercelBlobStorageProvider } from "../../lib/document-storage/vercel-blob-provider";

const ORIGINAL_TOKEN = process.env.BLOB_READ_WRITE_TOKEN;
const ORIGINAL_VERCEL = process.env.VERCEL;

afterEach(() => {
  if (ORIGINAL_TOKEN === undefined) delete process.env.BLOB_READ_WRITE_TOKEN;
  else process.env.BLOB_READ_WRITE_TOKEN = ORIGINAL_TOKEN;
  if (ORIGINAL_VERCEL === undefined) delete process.env.VERCEL;
  else process.env.VERCEL = ORIGINAL_VERCEL;
});

describe("getDocumentStorageProvider", () => {
  it("returns LocalFilesystemStorageProvider when BLOB_READ_WRITE_TOKEN is unset and not running on Vercel", () => {
    delete process.env.BLOB_READ_WRITE_TOKEN;
    delete process.env.VERCEL;
    expect(getDocumentStorageProvider()).toBeInstanceOf(LocalFilesystemStorageProvider);
  });

  it("returns VercelBlobStorageProvider when BLOB_READ_WRITE_TOKEN is set", () => {
    delete process.env.VERCEL;
    process.env.BLOB_READ_WRITE_TOKEN = "vercel_blob_rw_test_token";
    expect(getDocumentStorageProvider()).toBeInstanceOf(VercelBlobStorageProvider);
  });

  it("returns VercelBlobStorageProvider when BOTH VERCEL and BLOB_READ_WRITE_TOKEN are set (the real production case)", () => {
    process.env.VERCEL = "1";
    process.env.BLOB_READ_WRITE_TOKEN = "vercel_blob_rw_test_token";
    expect(getDocumentStorageProvider()).toBeInstanceOf(VercelBlobStorageProvider);
  });

  it("throws MissingBlobStorageConfigError - never falls back to LocalFilesystemStorageProvider - when VERCEL is set but BLOB_READ_WRITE_TOKEN is not", () => {
    process.env.VERCEL = "1";
    delete process.env.BLOB_READ_WRITE_TOKEN;
    expect(() => getDocumentStorageProvider()).toThrow(MissingBlobStorageConfigError);
    expect(() => getDocumentStorageProvider()).toThrow(/Connect Vercel Blob to this project/);
  });
});
