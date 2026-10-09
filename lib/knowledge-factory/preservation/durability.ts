/**
 * Probe whether an approved shared durable destination is actually available.
 * Never claim cross-VM durability from local gitignored bytes alone.
 *
 * Cursor-first: DATABASE_URL alone is sufficient when document bytes are stored
 * in PostgreSQL BYTEA (same shared Neon as KnowledgeSource). Vercel Blob remains
 * an optional alternate byte store when BLOB_READ_WRITE_TOKEN is set.
 */

export type DurabilityMode =
  | "POSTGRES_BYTEA_DURABLE"
  | "POSTGRES_AND_OBJECT_STORAGE_AVAILABLE"
  | "POSTGRES_AVAILABLE"
  | "OBJECT_STORAGE_AVAILABLE"
  | "LOCAL_ONLY_NOT_CROSS_VM_DURABLE";

export interface DurabilityProbeResult {
  mode: DurabilityMode;
  durable: boolean;
  databaseUrlPresent: boolean;
  objectStorageTokenPresent: boolean;
  /** True when Postgres can serve as the durable byte store (shared DB). */
  postgresByteaCapable: boolean;
  missingPrerequisites: string[];
  notes: string[];
}

export function probeDurability(env: NodeJS.ProcessEnv = process.env): DurabilityProbeResult {
  const databaseUrlPresent = Boolean(env.DATABASE_URL && env.DATABASE_URL.trim());
  const objectStorageTokenPresent = Boolean(
    (env.BLOB_READ_WRITE_TOKEN && env.BLOB_READ_WRITE_TOKEN.trim()) ||
      (env.VERCEL_BLOB_READ_WRITE_TOKEN && env.VERCEL_BLOB_READ_WRITE_TOKEN.trim()),
  );
  // Same shared Postgres holds KnowledgeSource registry + BYTEA bytes.
  const postgresByteaCapable = databaseUrlPresent;

  const missingPrerequisites: string[] = [];
  if (!databaseUrlPresent) {
    missingPrerequisites.push(
      "DATABASE_URL pointing at an approved shared Postgres instance with KnowledgeSource* and document_byte_objects migrations applied",
    );
  }

  // Durable when registry DB is present AND a byte store is available.
  // Cursor-first: Postgres BYTEA satisfies the byte store without Blob.
  const byteStorePresent = postgresByteaCapable || objectStorageTokenPresent;
  const durable = databaseUrlPresent && byteStorePresent;

  let mode: DurabilityMode = "LOCAL_ONLY_NOT_CROSS_VM_DURABLE";
  if (databaseUrlPresent && objectStorageTokenPresent) mode = "POSTGRES_AND_OBJECT_STORAGE_AVAILABLE";
  else if (databaseUrlPresent && postgresByteaCapable) mode = "POSTGRES_BYTEA_DURABLE";
  else if (databaseUrlPresent) mode = "POSTGRES_AVAILABLE";
  else if (objectStorageTokenPresent) mode = "OBJECT_STORAGE_AVAILABLE";

  const notes: string[] = [
    "Local .local-knowledge-corpus/ is session-scoped and gitignored; Cursor Cloud Agent VMs do not share those bytes.",
    "Git-committed acquisition manifests + content hashes enable deterministic recovery, not durability.",
    "Cursor-first durable bytes use PostgreSQL BYTEA (document_byte_objects); Vercel Blob is optional.",
  ];
  if (!durable) {
    notes.push(
      "Do not claim read-after-write durability or independent-session retrieval until shared Postgres (registry + byte store) is available and verified.",
    );
  } else if (!objectStorageTokenPresent) {
    notes.push(
      "Byte store = PostgreSQL BYTEA on the same DATABASE_URL. Requires migration 20261009013000_document_byte_objects.",
    );
  }

  return {
    mode,
    durable,
    databaseUrlPresent,
    objectStorageTokenPresent,
    postgresByteaCapable,
    missingPrerequisites,
    notes,
  };
}
