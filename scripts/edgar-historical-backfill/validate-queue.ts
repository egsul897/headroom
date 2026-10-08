#!/usr/bin/env npx tsx
/**
 * Offline validation of an existing acquisition-queue.json (no SEC network).
 *
 *   npx tsx scripts/edgar-historical-backfill/validate-queue.ts data/edgar-historical-backfill/pilot-100/acquisition-queue.json
 */

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import type { AcquisitionQueueItem } from "../../lib/edgar-historical-backfill/types";
import { validateAcquisitionQueue, validateQueueItem } from "../../lib/edgar-historical-backfill/queue-validate";
import { parentRelationshipCandidates } from "../../lib/edgar-historical-backfill/relationships";
import { toCkfHandoffPackage } from "../../lib/edgar-historical-backfill/ckf-handoff";

function upgradeLegacyItem(raw: Record<string, unknown>): AcquisitionQueueItem {
  const base = raw as unknown as AcquisitionQueueItem;
  const resolutionStatus =
    base.resolutionStatus ??
    (base.sourceUri && !/index\.htm/i.test(base.sourceUri) ? "FETCHABLE_INLINE" : "URL_MISSING");
  const item: AcquisitionQueueItem = {
    ...base,
    resolutionStatus,
    parentRelationshipCandidates:
      base.parentRelationshipCandidates ??
      parentRelationshipCandidates({
        documentKind: base.documentKind,
        description: base.description,
        agreementIdentityKey: base.agreementIdentityKey,
      }),
    dedupeIdentity: base.dedupeIdentity ?? base.agreementIdentityKey,
    isIncorporatedByReference: base.isIncorporatedByReference ?? false,
  };
  item.validation = validateQueueItem(item);
  return item;
}

function main() {
  const path = process.argv[2] ?? "data/edgar-historical-backfill/pilot-100/acquisition-queue.json";
  const raw = JSON.parse(readFileSync(path, "utf8")) as Array<Record<string, unknown>>;
  const items = raw.map(upgradeLegacyItem);
  const report = validateAcquisitionQueue(items);
  const handoff = toCkfHandoffPackage(items, { storageStatus: "EPHEMERAL_WORKSPACE" });

  const outDir = dirname(path);
  writeFileSync(join(outDir, "queue-validation.json"), JSON.stringify(report, null, 2));
  writeFileSync(join(outDir, "ckf-handoff.json"), JSON.stringify(handoff, null, 2));
  mkdirSync("docs/edgar-historical-backfill", { recursive: true });
  writeFileSync(
    "docs/edgar-historical-backfill/ckf-handoff-summary.json",
    JSON.stringify(
      {
        ...handoff,
        documents: handoff.documents.slice(0, 25),
        storageStatus: "COMMITTED_DOCS_SUMMARY",
        sourceQueuePath: path,
        validation: report,
      },
      null,
      2,
    ),
  );

  console.log(JSON.stringify({ path, report, fetchableForCkf: handoff.fetchableCount }, null, 2));
}

main();
