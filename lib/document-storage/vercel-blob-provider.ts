/**
 * Production DocumentStorageProvider backed by @vercel/blob
 * (docs/document-onboarding-pipeline-foundation.md). Selected automatically
 * by getDocumentStorageProvider() whenever BLOB_READ_WRITE_TOKEN is set - the
 * SDK reads that env var itself for every call below, so this file never
 * touches it directly.
 *
 * UNVERIFIED FROM THIS SANDBOX: there is no live Vercel Blob store reachable
 * here, so `store`/`retrieve` below are correct against @vercel/blob 2.8.0's
 * actual published types (read directly from node_modules/@vercel/blob/dist -
 * not guessed) and type-check cleanly, but their live behavior against a real
 * store can only be confirmed once deployed with real Vercel credentials.
 * tests/document-storage.test.ts covers this file's request-shaping logic
 * with a stubbed `put`/`get` instead.
 *
 * PRIVACY, PRECISELY: every blob this provider writes uses `access: 'private'`
 * (@vercel/blob 2.8.0 genuinely supports a private access tier - `get()`
 * requires the store's own read-write token to fetch a private blob's bytes,
 * not merely an unguessable public pathname as older Blob SDK versions were
 * limited to). That said, the guarantee this pipeline actually depends on is
 * NOT Vercel Blob's own ACL nuance - it is that `retrieve()` below is the
 * only path that ever calls `get()`, and every caller of `retrieve()` in this
 * codebase runs server-side (a route handler or a server action, never a
 * client component). `storageRef` (the blob's own `url`) must never be
 * returned to a client component or embedded in a client bundle; treat that
 * as a hard rule independent of whatever ACL tier is configured.
 */

import { get, put } from "@vercel/blob";
import { Readable } from "node:stream";
import type { ReadableStream as NodeWebReadableStream } from "node:stream/web";
import type { DocumentStorageProvider } from "./types";

// `get()`'s result carries the DOM lib's global `ReadableStream` type (this
// project's tsconfig includes "dom"); `Readable.fromWeb` wants the
// structurally-identical `node:stream/web` one - a type-only cast, not a
// runtime conversion, since both describe the same underlying Web Streams
// object at runtime.
async function streamToBuffer(stream: ReadableStream<Uint8Array>): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of Readable.fromWeb(stream as unknown as NodeWebReadableStream<Uint8Array>)) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as Uint8Array));
  }
  return Buffer.concat(chunks);
}

export class VercelBlobStorageProvider implements DocumentStorageProvider {
  async store(params: { companyId: string; filename: string; contentType: string; data: Buffer }): Promise<{ storageRef: string; provider: string }> {
    const pathname = `documents/${params.companyId}/${params.filename}`;
    const result = await put(pathname, params.data, {
      access: "private",
      addRandomSuffix: true,
      contentType: params.contentType,
    });
    // The blob's own URL is the most portable retrieve() key - stable
    // regardless of which store ID this deployment resolves to, and exactly
    // what @vercel/blob's own `get()` accepts as `urlOrPathname`.
    return { storageRef: result.url, provider: "vercel-blob" };
  }

  async retrieve(storageRef: string): Promise<Buffer> {
    const result = await get(storageRef, { access: "private" });
    if (!result || result.statusCode !== 200) {
      throw new Error(`VercelBlobStorageProvider.retrieve: blob not found for storageRef ${storageRef}`);
    }
    return streamToBuffer(result.stream);
  }
}
