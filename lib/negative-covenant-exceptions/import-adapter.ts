/**
 * Idempotent import adapter for NCEDB → Covenant Knowledge Factory corpus.
 *
 * Does NOT write production Permission / SharedCapacityConstraint tables.
 * Does NOT modify lib/contract-model. Coordinates with WS-CKF schema owner via
 * delivery-contract fields only.
 */

import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import {
  NCEDB_DATASET_VERSION,
  PERMISSION_CLASSIFICATIONS,
  type ExceptionRecordV2,
  type ImportableDatasetManifest,
  type PermissionClassification,
} from "./types";
import { assertSourceIdentity, exceptionImportKey } from "./source-identity";

export interface ImportBatchItem {
  importKey: string;
  exceptionId: string;
  sourceIdentityKey: string;
  permissionClassification: PermissionClassification;
  covenantFamily: string;
  exactExceptionText: string;
  exceptionSpan: { sourcePath: string; sourceSha256: string; charStart: number; charEnd: number };
  parentProhibitionSpan: { sourcePath: string; sourceSha256: string; charStart: number; charEnd: number };
  localConditionCount: number;
  remoteConditionCount: number;
  unresolvedControllingSources: string[];
  verificationStatus: string;
  representationLevelCeiling: "SOURCE_ONLY" | "DETERMINISTICALLY_VALIDATED";
  /** Explicit: never promote to operative capacity. */
  productionCapacityApproved: false;
}

export interface ImportBatch {
  datasetVersion: string;
  generatedAt: string;
  items: ImportBatchItem[];
  skippedDuplicates: string[];
  rejected: Array<{ exceptionId: string; reasons: string[] }>;
}

export function defaultCatalogPath(): string {
  return resolve(
    process.cwd(),
    "docs/negative-covenant-exception-database/phase-2/catalogs/exceptions-v2.json",
  );
}

export function loadExceptionCatalogV2(path = defaultCatalogPath()): {
  manifest: ImportableDatasetManifest;
  exceptions: ExceptionRecordV2[];
} {
  if (!existsSync(path)) {
    throw new Error(`NCEDB phase-2 catalog missing at ${path}`);
  }
  const raw = JSON.parse(readFileSync(path, "utf8")) as {
    manifest: ImportableDatasetManifest;
    exceptions: ExceptionRecordV2[];
  };
  return raw;
}

function validateRecord(r: ExceptionRecordV2): string[] {
  const errors: string[] = [];
  errors.push(...assertSourceIdentity(r.sourceIdentity));
  if (!PERMISSION_CLASSIFICATIONS.includes(r.permissionClassification)) {
    errors.push(`invalid permissionClassification ${r.permissionClassification}`);
  }
  if (r.unconditionalCapacity !== false) {
    errors.push("unconditionalCapacity must be false");
  }
  if (r.exceptionSourceSpan.matchStatus === "UNRESOLVED") {
    errors.push("exception source span unresolved");
  }
  if (r.exactExceptionText.includes("...") && r.exactExceptionText === r.paraphraseSummary) {
    errors.push("ellipsized summary used as exactExceptionText");
  }
  // Exact text must equal span exactText when span resolved.
  if (
    r.exceptionSourceSpan.matchStatus !== "UNRESOLVED" &&
    r.exceptionSourceSpan.exactText !== r.exactExceptionText
  ) {
    errors.push("exactExceptionText diverges from exceptionSourceSpan.exactText");
  }
  if (r.permissionClassification === "UNCONDITIONAL_SOURCE_VERIFIED" && r.localConditions.length > 0) {
    // Allow definitional/entity local notes only if classification rationale acknowledges —
    // hard-fail when financial/money local conditions exist.
    const economic = r.localConditions.some((c) =>
      ["MONEY", "RATIO", "NO_DEFAULT", "SHARED_POOL"].includes(c.computableHint),
    );
    if (economic) {
      errors.push("UNCONDITIONAL_SOURCE_VERIFIED with economic local conditions");
    }
  }
  return errors;
}

/**
 * Build an idempotent import batch. Re-running with the same catalog yields the
 * same importKeys; duplicates within the batch are skipped.
 */
export function buildImportBatch(
  exceptions: ExceptionRecordV2[],
  options: { alreadyImportedKeys?: Iterable<string> } = {},
): ImportBatch {
  const seen = new Set<string>();
  const already = new Set(options.alreadyImportedKeys ?? []);
  const items: ImportBatchItem[] = [];
  const skippedDuplicates: string[] = [];
  const rejected: Array<{ exceptionId: string; reasons: string[] }> = [];

  for (const r of exceptions) {
    const reasons = validateRecord(r);
    if (reasons.length) {
      rejected.push({ exceptionId: r.exceptionId, reasons });
      continue;
    }
    const importKey = exceptionImportKey(r.exceptionId, r.sourceIdentity.sourceIdentityKey);
    if (seen.has(importKey) || already.has(importKey)) {
      skippedDuplicates.push(importKey);
      continue;
    }
    seen.add(importKey);
    items.push({
      importKey,
      exceptionId: r.exceptionId,
      sourceIdentityKey: r.sourceIdentity.sourceIdentityKey,
      permissionClassification: r.permissionClassification,
      covenantFamily: r.covenantFamily,
      exactExceptionText: r.exactExceptionText,
      exceptionSpan: {
        sourcePath: r.exceptionSourceSpan.sourcePath,
        sourceSha256: r.exceptionSourceSpan.sourceSha256,
        charStart: r.exceptionSourceSpan.charStart,
        charEnd: r.exceptionSourceSpan.charEnd,
      },
      parentProhibitionSpan: {
        sourcePath: r.parentProhibition.sourceSpan.sourcePath,
        sourceSha256: r.parentProhibition.sourceSpan.sourceSha256,
        charStart: r.parentProhibition.sourceSpan.charStart,
        charEnd: r.parentProhibition.sourceSpan.charEnd,
      },
      localConditionCount: r.localConditions.length,
      remoteConditionCount: r.remoteConditions.length,
      unresolvedControllingSources: r.unresolvedControllingSources.map((u) => u.ref),
      verificationStatus: r.verificationStatus,
      representationLevelCeiling:
        r.verificationStatus === "SOURCE_VERIFIED" || r.verificationStatus === "SOURCE_VERIFIED_PARTIAL_CONTEXT"
          ? "DETERMINISTICALLY_VALIDATED"
          : "SOURCE_ONLY",
      productionCapacityApproved: false,
    });
  }

  return {
    datasetVersion: NCEDB_DATASET_VERSION,
    generatedAt: new Date(0).toISOString(), // deterministic placeholder; callers may stamp
    items,
    skippedDuplicates,
    rejected,
  };
}

/** Deterministic stamp for replay-stable batches. */
export function buildDeterministicImportBatch(exceptions: ExceptionRecordV2[]): ImportBatch {
  const batch = buildImportBatch(exceptions);
  batch.generatedAt = "1970-01-01T00:00:00.000Z";
  return batch;
}
