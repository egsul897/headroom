/**
 * Document storage abstraction (docs/document-onboarding-pipeline-foundation.md).
 *
 * The one interface every caller (the upload route a later phase builds, and
 * this phase's own parsing/chunking code) programs against - never a
 * concrete provider directly. `getDocumentStorageProvider()` in ./index.ts
 * is the only place that branches on environment to decide which
 * implementation backs this interface.
 *
 * `store`/`retrieve` deal in `Buffer` only - no provider-specific stream or
 * URL type leaks into this interface. `storageRef` is opaque: callers persist
 * it (Document.storageRef) and pass it back to `retrieve`, but must never
 * parse it, construct one by hand, or expose it directly to a client
 * component - see VercelBlobStorageProvider's own header comment for why
 * that discipline is the real privacy guarantee here, independent of a given
 * provider's own ACL model.
 */

export interface DocumentStorageProvider {
  store(params: { companyId: string; filename: string; contentType: string; data: Buffer }): Promise<{ storageRef: string; provider: string }>;
  retrieve(storageRef: string): Promise<Buffer>;
}
