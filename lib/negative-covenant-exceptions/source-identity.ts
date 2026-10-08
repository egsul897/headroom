import { createHash } from "node:crypto";
import type { StableSourceIdentity } from "./types";

/** Stable, content-addressed source identity for idempotent imports. */
export function buildSourceIdentityKey(parts: {
  issuerKey: string;
  sourceSha256: string;
  documentKind: string;
  sourcePath: string;
}): string {
  const material = [
    parts.issuerKey.trim().toLowerCase(),
    parts.documentKind,
    parts.sourceSha256.toLowerCase(),
    parts.sourcePath.replace(/\\/g, "/"),
  ].join("|");
  const digest = createHash("sha256").update(material).digest("hex").slice(0, 24);
  return `ncedb-src:${parts.issuerKey}:${digest}`;
}

export function assertSourceIdentity(id: StableSourceIdentity): string[] {
  const errors: string[] = [];
  if (!id.sourceIdentityKey.startsWith("ncedb-src:")) {
    errors.push(`sourceIdentityKey must be ncedb-src:* (got ${id.sourceIdentityKey})`);
  }
  if (!/^[a-f0-9]{64}$/i.test(id.sourceSha256)) {
    errors.push(`sourceSha256 must be 64-hex (got ${id.sourceSha256})`);
  }
  if (!id.issuerKey.trim()) errors.push("issuerKey required");
  if (!id.sourcePath.trim()) errors.push("sourcePath required");
  return errors;
}

/** Idempotency key for an exception record across re-imports. */
export function exceptionImportKey(exceptionId: string, sourceIdentityKey: string): string {
  return `${sourceIdentityKey}::${exceptionId}`;
}
