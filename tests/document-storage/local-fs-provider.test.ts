/**
 * LocalFilesystemStorageProvider - real filesystem I/O against a temp
 * directory (never the real .local-blob-storage/ this repo's dev flow
 * uses), cleaned up after every test.
 */
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { LocalFilesystemStorageProvider } from "../../lib/document-storage/local-fs-provider";

let baseDir: string;
let provider: LocalFilesystemStorageProvider;

beforeEach(async () => {
  baseDir = await mkdtemp(path.join(tmpdir(), "headroom-blob-test-"));
  provider = new LocalFilesystemStorageProvider(baseDir);
});

afterEach(async () => {
  await rm(baseDir, { recursive: true, force: true });
});

describe("LocalFilesystemStorageProvider", () => {
  it("stores bytes under companyId and retrieves the exact same bytes back", async () => {
    const data = Buffer.from("credit agreement bytes", "utf-8");
    const { storageRef, provider: providerName } = await provider.store({ companyId: "co-1", filename: "credit-agreement.pdf", contentType: "application/pdf", data });

    expect(providerName).toBe("local-fs-dev");
    expect(storageRef).toMatch(/^co-1\//);

    const retrieved = await provider.retrieve(storageRef);
    expect(retrieved.equals(data)).toBe(true);
  });

  it("writes the file to disk at a path derived from the returned storageRef", async () => {
    const { storageRef } = await provider.store({ companyId: "co-1", filename: "doc.txt", contentType: "text/plain", data: Buffer.from("hi") });
    const onDisk = await readFile(path.join(baseDir, ...storageRef.split("/")));
    expect(onDisk.toString("utf-8")).toBe("hi");
  });

  it("never collides two uploads with the same filename for the same company", async () => {
    const data1 = Buffer.from("version 1");
    const data2 = Buffer.from("version 2");
    const first = await provider.store({ companyId: "co-1", filename: "same-name.pdf", contentType: "application/pdf", data: data1 });
    const second = await provider.store({ companyId: "co-1", filename: "same-name.pdf", contentType: "application/pdf", data: data2 });

    expect(first.storageRef).not.toBe(second.storageRef);
    expect((await provider.retrieve(first.storageRef)).equals(data1)).toBe(true);
    expect((await provider.retrieve(second.storageRef)).equals(data2)).toBe(true);
  });

  it("keeps two different companies' files separate even with an identical filename", async () => {
    const a = await provider.store({ companyId: "company-a", filename: "shared-name.pdf", contentType: "application/pdf", data: Buffer.from("A") });
    const b = await provider.store({ companyId: "company-b", filename: "shared-name.pdf", contentType: "application/pdf", data: Buffer.from("B") });
    expect(a.storageRef.startsWith("company-a/")).toBe(true);
    expect(b.storageRef.startsWith("company-b/")).toBe(true);
  });

  it("sanitizes a path-traversal attempt in companyId/filename instead of escaping the base directory", async () => {
    const { storageRef } = await provider.store({ companyId: "../../etc", filename: "../../../passwd", contentType: "text/plain", data: Buffer.from("nope") });
    // The sanitized ref must stay a plain two-segment relative path with no ".." components.
    expect(storageRef.includes("..")).toBe(false);
    const resolved = path.resolve(baseDir, ...storageRef.split("/"));
    expect(resolved.startsWith(path.resolve(baseDir))).toBe(true);
  });

  it("rejects retrieval of a file that was never stored", async () => {
    await expect(provider.retrieve("co-1/does-not-exist.pdf")).rejects.toThrow();
  });

  it("delete() removes a previously stored file - retrieve() then fails", async () => {
    const { storageRef } = await provider.store({ companyId: "co-1", filename: "to-delete.pdf", contentType: "application/pdf", data: Buffer.from("bytes") });
    await provider.delete(storageRef);
    await expect(provider.retrieve(storageRef)).rejects.toThrow();
  });

  it("delete() of a file that was never stored does not throw (best-effort orphan cleanup)", async () => {
    await expect(provider.delete("co-1/never-existed.pdf")).resolves.toBeUndefined();
  });
});
