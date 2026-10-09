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
import {
  getDocumentStorageProvider,
  MissingBlobStorageConfigError,
  MissingPostgresByteaConfigError,
  PostgresDocumentStorageProvider,
} from "../../lib/document-storage";
import { LocalFilesystemStorageProvider } from "../../lib/document-storage/local-fs-provider";
import { VercelBlobStorageProvider } from "../../lib/document-storage/vercel-blob-provider";

const ORIGINAL_TOKEN = process.env.BLOB_READ_WRITE_TOKEN;
const ORIGINAL_VERCEL = process.env.VERCEL;
const ORIGINAL_BACKEND = process.env.DOCUMENT_STORAGE_BACKEND;
const ORIGINAL_DATABASE_URL = process.env.DATABASE_URL;

afterEach(() => {
  if (ORIGINAL_TOKEN === undefined) delete process.env.BLOB_READ_WRITE_TOKEN;
  else process.env.BLOB_READ_WRITE_TOKEN = ORIGINAL_TOKEN;
  if (ORIGINAL_VERCEL === undefined) delete process.env.VERCEL;
  else process.env.VERCEL = ORIGINAL_VERCEL;
  if (ORIGINAL_BACKEND === undefined) delete process.env.DOCUMENT_STORAGE_BACKEND;
  else process.env.DOCUMENT_STORAGE_BACKEND = ORIGINAL_BACKEND;
  if (ORIGINAL_DATABASE_URL === undefined) delete process.env.DATABASE_URL;
  else process.env.DATABASE_URL = ORIGINAL_DATABASE_URL;
});

describe("getDocumentStorageProvider", () => {
  it("returns LocalFilesystemStorageProvider when BLOB_READ_WRITE_TOKEN is unset and not running on Vercel", () => {
    delete process.env.BLOB_READ_WRITE_TOKEN;
    delete process.env.VERCEL;
    delete process.env.DOCUMENT_STORAGE_BACKEND;
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
    delete process.env.DOCUMENT_STORAGE_BACKEND;
    expect(() => getDocumentStorageProvider()).toThrow(MissingBlobStorageConfigError);
    expect(() => getDocumentStorageProvider()).toThrow(/Connect Vercel Blob to this project/);
  });

  it("returns PostgresDocumentStorageProvider when DOCUMENT_STORAGE_BACKEND=postgres and DATABASE_URL is set", () => {
    delete process.env.BLOB_READ_WRITE_TOKEN;
    delete process.env.VERCEL;
    process.env.DOCUMENT_STORAGE_BACKEND = "postgres";
    process.env.DATABASE_URL = "postgresql://example.invalid/headroom";
    expect(getDocumentStorageProvider()).toBeInstanceOf(PostgresDocumentStorageProvider);
  });

  it("throws MissingPostgresByteaConfigError when backend=postgres without DATABASE_URL", () => {
    delete process.env.BLOB_READ_WRITE_TOKEN;
    delete process.env.VERCEL;
    delete process.env.DATABASE_URL;
    process.env.DOCUMENT_STORAGE_BACKEND = "postgres";
    expect(() => getDocumentStorageProvider()).toThrow(MissingPostgresByteaConfigError);
  });
});
