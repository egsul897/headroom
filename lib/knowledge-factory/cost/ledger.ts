/**
 * Cost accounting — estimated and actual tracked separately; never mixed.
 */

import { randomUUID } from "node:crypto";
import type { CostLedgerEntry, CorpusManifestStats } from "../types";
import type { CorpusStore } from "../store/corpus-store";

export function recordCost(
  store: CorpusStore,
  category: CostLedgerEntry["category"],
  amount: number,
  unit: string,
  estimated: boolean,
  note?: string,
): CostLedgerEntry {
  const entry: CostLedgerEntry = {
    id: randomUUID(),
    timestamp: new Date().toISOString(),
    category,
    amount,
    unit,
    estimated,
    note,
  };
  store.appendCost(entry);
  return entry;
}

export function summarizeCosts(entries: CostLedgerEntry[]): {
  actualPaidUsd: number;
  estimatedModelCostUsd: number;
  secRequests: number;
  downloadBytes: number;
  storageBytes: number;
  parsingMs: number;
  databaseWrites: number;
  estimatedModelTokens: number;
  reviewerTimeMs: number;
} {
  let actualPaidUsd = 0;
  let estimatedModelCostUsd = 0;
  let secRequests = 0;
  let downloadBytes = 0;
  let storageBytes = 0;
  let parsingMs = 0;
  let databaseWrites = 0;
  let estimatedModelTokens = 0;
  let reviewerTimeMs = 0;

  for (const e of entries) {
    switch (e.category) {
      case "ACTUAL_PROVIDER_COST_USD":
        if (!e.estimated) actualPaidUsd += e.amount;
        break;
      case "ESTIMATED_MODEL_COST_USD":
        if (e.estimated) estimatedModelCostUsd += e.amount;
        break;
      case "SEC_REQUEST":
        secRequests += e.amount;
        break;
      case "DOWNLOAD_BYTES":
        downloadBytes += e.amount;
        break;
      case "STORAGE_BYTES":
        storageBytes += e.amount;
        break;
      case "PARSING_MS":
        parsingMs += e.amount;
        break;
      case "DATABASE_WRITES":
        databaseWrites += e.amount;
        break;
      case "ESTIMATED_MODEL_TOKENS":
        estimatedModelTokens += e.amount;
        break;
      case "REVIEWER_TIME_MS":
        reviewerTimeMs += e.amount;
        break;
    }
  }

  return {
    actualPaidUsd,
    estimatedModelCostUsd,
    secRequests,
    downloadBytes,
    storageBytes,
    parsingMs,
    databaseWrites,
    estimatedModelTokens,
    reviewerTimeMs,
  };
}

/** Explicitly modeled (not claimed measured) corpus economics. */
export function modelCorpusEconomics(perDoc: {
  storageBytes: number;
  parseMs: number;
  estimatedModelTokensIfUsed: number;
  estimatedModelUsdPer1kTokens: number;
  reviewerMinutes: number;
  reviewerUsdPerHour: number;
}): Record<string, { documents: number; storageGb: number; computeHours: number; modelInferenceUsd: number; humanReviewUsd: number; notes: string }> {
  const scales = [100, 1000, 10_000, 100_000];
  const out: Record<string, { documents: number; storageGb: number; computeHours: number; modelInferenceUsd: number; humanReviewUsd: number; notes: string }> = {};
  for (const n of scales) {
    out[String(n)] = {
      documents: n,
      storageGb: (n * perDoc.storageBytes) / (1024 ** 3),
      computeHours: (n * perDoc.parseMs) / 3_600_000,
      modelInferenceUsd: (n * perDoc.estimatedModelTokensIfUsed * perDoc.estimatedModelUsdPer1kTokens) / 1000,
      humanReviewUsd: (n * perDoc.reviewerMinutes * perDoc.reviewerUsdPerHour) / 60,
      notes: "Modeled estimate from measured per-document proxies — not a claimed measured cost advantage.",
    };
  }
  return out;
}

export function emptyStats(): CorpusManifestStats {
  return {
    issuersDiscovered: 0,
    relevantFilings: 0,
    documentsDownloaded: 0,
    distinctAgreements: 0,
    amendments: 0,
    indentures: 0,
    extractableDocuments: 0,
    structuralNodes: 0,
    covenantCandidates: 0,
    definitions: 0,
    crossReferences: 0,
    unsupportedFormats: 0,
    duplicateRate: 0,
    errors: 0,
    measuredProcessingMs: 0,
    actualPaidSpendUsd: 0,
  };
}
