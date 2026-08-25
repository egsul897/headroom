/**
 * VercelBlobStorageProvider - no live Vercel Blob store is reachable from
 * this sandbox (see the file's own header comment), so this test stubs
 * @vercel/blob's `put`/`get` and proves the REQUEST-SHAPING logic: what
 * pathname/options `store()` sends, and how `retrieve()` turns a `get()`
 * result's stream back into a Buffer. It does not (and cannot, from here)
 * prove the real Vercel Blob API accepts these calls - that is confirmed
 * only once deployed with real credentials, as the source file states.
 */
import { Readable } from "node:stream";
import { beforeEach, describe, expect, it, vi } from "vitest";

const putMock = vi.fn();
const getMock = vi.fn();
const delMock = vi.fn();

vi.mock("@vercel/blob", () => ({
  put: (...args: unknown[]) => putMock(...args),
  get: (...args: unknown[]) => getMock(...args),
  del: (...args: unknown[]) => delMock(...args),
}));

// Imported AFTER the mock so it picks up the mocked module.
const { VercelBlobStorageProvider } = await import("../../lib/document-storage/vercel-blob-provider");

beforeEach(() => {
  putMock.mockReset();
  getMock.mockReset();
  delMock.mockReset();
});

function webStreamFrom(text: string): ReadableStream<Uint8Array> {
  const nodeReadable = Readable.from([Buffer.from(text, "utf-8")]);
  return Readable.toWeb(nodeReadable) as unknown as ReadableStream<Uint8Array>;
}

describe("VercelBlobStorageProvider.store", () => {
  it("uploads with access: 'private', addRandomSuffix, and the given contentType, under a companyId-scoped pathname", async () => {
    putMock.mockResolvedValue({ url: "https://example-store.public.blob.vercel-storage.com/documents/co-1/credit-agreement-abc123.pdf", pathname: "documents/co-1/credit-agreement-abc123.pdf", contentType: "application/pdf", contentDisposition: "inline", downloadUrl: "https://example.com/download" });

    const provider = new VercelBlobStorageProvider();
    const data = Buffer.from("bytes");
    const result = await provider.store({ companyId: "co-1", filename: "credit-agreement.pdf", contentType: "application/pdf", data });

    expect(putMock).toHaveBeenCalledTimes(1);
    const [pathname, body, options] = putMock.mock.calls[0]!;
    expect(pathname).toBe("documents/co-1/credit-agreement.pdf");
    expect(body).toBe(data);
    expect(options).toMatchObject({ access: "private", addRandomSuffix: true, contentType: "application/pdf" });

    expect(result.provider).toBe("vercel-blob");
    expect(result.storageRef).toBe("https://example-store.public.blob.vercel-storage.com/documents/co-1/credit-agreement-abc123.pdf");
  });
});

describe("VercelBlobStorageProvider.retrieve", () => {
  it("calls get() with access: 'private' and returns the stream's bytes as a Buffer", async () => {
    getMock.mockResolvedValue({
      statusCode: 200,
      stream: webStreamFrom("hello from blob storage"),
      headers: new Headers(),
      blob: { url: "https://example.com/x", downloadUrl: "https://example.com/x", pathname: "x", contentDisposition: "inline", cacheControl: "", uploadedAt: new Date(), etag: "abc", contentType: "text/plain", size: 24 },
    });

    const provider = new VercelBlobStorageProvider();
    const buf = await provider.retrieve("https://example.com/x");

    expect(getMock).toHaveBeenCalledWith("https://example.com/x", { access: "private" });
    expect(buf.toString("utf-8")).toBe("hello from blob storage");
  });

  it("throws when the blob does not exist (get() resolves null) instead of returning empty bytes", async () => {
    getMock.mockResolvedValue(null);
    const provider = new VercelBlobStorageProvider();
    await expect(provider.retrieve("https://example.com/missing")).rejects.toThrow(/not found/);
  });
});

describe("VercelBlobStorageProvider.delete", () => {
  it("calls del() with the given storageRef", async () => {
    delMock.mockResolvedValue(undefined);
    const provider = new VercelBlobStorageProvider();
    await provider.delete("https://example.com/orphaned-blob.pdf");
    expect(delMock).toHaveBeenCalledWith("https://example.com/orphaned-blob.pdf");
  });

  it("never throws, even when del() itself fails (best-effort orphan cleanup)", async () => {
    delMock.mockRejectedValue(new Error("network error"));
    const provider = new VercelBlobStorageProvider();
    await expect(provider.delete("https://example.com/orphaned-blob.pdf")).resolves.toBeUndefined();
  });
});
