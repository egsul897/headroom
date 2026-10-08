/**
 * Separates raw provider text, parsed candidates, semantic IR, verification
 * findings, and certification evidence. A complete hit is reusable only under
 * the exact contract. It never advances certification.
 */
import { createHash } from "node:crypto";
import { dependencyUncertainty, evidenceKey, type EvidenceReuseContract } from "./identity";

export type EvidenceCompleteness = "COMPLETE" | "PARTIAL";

export interface StoredEvidenceRecord<T> {
  contract: EvidenceReuseContract;
  key: string;
  payload: T;
  payloadSha256: string;
  completeness: EvidenceCompleteness;
  /** The store has no certification transition. This field stays false. */
  advancesCertification: false;
}

export type EvidenceRead<T> =
  | { status: "HIT"; record: StoredEvidenceRecord<T>; advancesCertification: false }
  | { status: "MISS"; advancesCertification: false }
  | { status: "PARTIAL"; record: StoredEvidenceRecord<T>; advancesCertification: false; usableAsComplete: false }
  | { status: "CORRUPT"; reason: string; advancesCertification: false }
  | { status: "UNREUSABLE"; reason: string; advancesCertification: false };

export function payloadSha256(payload: unknown): string {
  return createHash("sha256").update(JSON.stringify(payload), "utf8").digest("hex");
}

export function assessStoredRecord<T>(record: StoredEvidenceRecord<T>, expected: EvidenceReuseContract): EvidenceRead<T> {
  if (record.advancesCertification !== false) {
    return { status: "CORRUPT", reason: "CACHE_CORRUPT: a stored record claimed certification.", advancesCertification: false };
  }
  if (record.key !== evidenceKey(expected) || record.key !== evidenceKey(record.contract)) {
    return { status: "MISS", advancesCertification: false };
  }
  if (payloadSha256(record.payload) !== record.payloadSha256) {
    return { status: "CORRUPT", reason: "CACHE_CORRUPT: payload bytes do not match the stored sha256.", advancesCertification: false };
  }
  const uncertain = dependencyUncertainty(expected);
  if (uncertain.length > 0) {
    return { status: "UNREUSABLE", reason: `UNCERTAIN_DEPENDENCY: ${uncertain.join("; ")}`, advancesCertification: false };
  }
  if (record.completeness !== "COMPLETE") {
    return { status: "PARTIAL", record, advancesCertification: false, usableAsComplete: false };
  }
  return { status: "HIT", record, advancesCertification: false };
}

export class ContentAddressedEvidenceStore {
  private readonly records = new Map<string, StoredEvidenceRecord<unknown>>();

  put<T>(contract: EvidenceReuseContract, payload: T, completeness: EvidenceCompleteness): StoredEvidenceRecord<T> {
    const record: StoredEvidenceRecord<T> = {
      contract,
      key: evidenceKey(contract),
      payload,
      payloadSha256: payloadSha256(payload),
      completeness,
      advancesCertification: false,
    };
    this.records.set(record.key, record);
    return record;
  }

  read<T>(contract: EvidenceReuseContract): EvidenceRead<T> {
    const key = evidenceKey(contract);
    const record = this.records.get(key) as StoredEvidenceRecord<T> | undefined;
    if (!record) return { status: "MISS", advancesCertification: false };
    return assessStoredRecord(record, contract);
  }
}
