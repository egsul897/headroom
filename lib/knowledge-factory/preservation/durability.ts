/**
 * Probe whether an approved shared durable destination is actually available.
 * Never claim cross-VM durability from local gitignored bytes alone.
 */

export type DurabilityMode =
  | "POSTGRES_AVAILABLE"
  | "OBJECT_STORAGE_AVAILABLE"
  | "POSTGRES_AND_OBJECT_STORAGE_AVAILABLE"
  | "LOCAL_ONLY_NOT_CROSS_VM_DURABLE";

export interface DurabilityProbeResult {
  mode: DurabilityMode;
  durable: boolean;
  databaseUrlPresent: boolean;
  objectStorageTokenPresent: boolean;
  missingPrerequisites: string[];
  notes: string[];
}

export function probeDurability(env: NodeJS.ProcessEnv = process.env): DurabilityProbeResult {
  const databaseUrlPresent = Boolean(env.DATABASE_URL && env.DATABASE_URL.trim());
  const objectStorageTokenPresent = Boolean(
    (env.BLOB_READ_WRITE_TOKEN && env.BLOB_READ_WRITE_TOKEN.trim()) ||
      (env.VERCEL_BLOB_READ_WRITE_TOKEN && env.VERCEL_BLOB_READ_WRITE_TOKEN.trim()),
  );

  const missingPrerequisites: string[] = [];
  if (!databaseUrlPresent) {
    missingPrerequisites.push(
      "DATABASE_URL pointing at an approved shared Postgres instance with KnowledgeSource* migrations applied",
    );
  }
  if (!objectStorageTokenPresent) {
    missingPrerequisites.push(
      "BLOB_READ_WRITE_TOKEN or VERCEL_BLOB_READ_WRITE_TOKEN for durable object storage of source bytes",
    );
  }

  let mode: DurabilityMode = "LOCAL_ONLY_NOT_CROSS_VM_DURABLE";
  if (databaseUrlPresent && objectStorageTokenPresent) mode = "POSTGRES_AND_OBJECT_STORAGE_AVAILABLE";
  else if (databaseUrlPresent) mode = "POSTGRES_AVAILABLE";
  else if (objectStorageTokenPresent) mode = "OBJECT_STORAGE_AVAILABLE";

  // Canonical records without bytes (or bytes without registry) are incomplete durability.
  const durable = databaseUrlPresent && objectStorageTokenPresent;

  const notes: string[] = [
    "Local .local-knowledge-corpus/ is session-scoped and gitignored; Cursor Cloud Agent VMs do not share those bytes.",
    "Git-committed acquisition manifests + content hashes enable deterministic recovery, not durability.",
  ];
  if (!durable) {
    notes.push("Do not claim read-after-write durability or independent-session retrieval until both Postgres and object storage are available and verified.");
  }

  return {
    mode,
    durable,
    databaseUrlPresent,
    objectStorageTokenPresent,
    missingPrerequisites,
    notes,
  };
}
