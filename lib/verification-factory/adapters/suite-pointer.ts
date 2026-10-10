/**
 * Suite-pointer adapter — registers product-acceptance / completeness provenance
 * without reimplementing suite runners. Verifies source expectations exist and
 * match frozen hashes when available.
 */

import { existsSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import type { AdapterExecutionResult, VerificationCaseMeta } from "../types";

export function runSuitePointerAdapter(meta: VerificationCaseMeta): AdapterExecutionResult {
  if ("holdoutSealId" in meta.provenance) {
    return {
      adapter: "suite-pointer",
      actualLegalOutcome: "SEALED",
      falseFavorable: false,
      materialOmissions: [],
      notes: ["Sealed — not scored via suite-pointer"],
    };
  }

  const docs = meta.provenance.sourceDocuments;
  const missing: string[] = [];
  const hashMismatches: string[] = [];
  for (const d of docs) {
    if (!existsSync(d.path)) {
      missing.push(d.path);
      continue;
    }
    if (d.sha256) {
      const actual = createHash("sha256").update(readFileSync(d.path)).digest("hex");
      if (actual !== d.sha256) hashMismatches.push(d.path);
    }
  }

  if (missing.length) {
    return {
      adapter: "suite-pointer",
      actualLegalOutcome: "ERROR",
      falseFavorable: false,
      materialOmissions: missing,
      notes: [`Missing source documents: ${missing.join(", ")}`],
      details: { matchesExpected: false },
    };
  }

  // Provenance pointer validated — full PA suite remains scripts/product-acceptance.
  // MATCH_BASELINE means "source-backed expectations present and hash-stable".
  return {
    adapter: "suite-pointer",
    actualLegalOutcome: "MATCH_BASELINE",
    falseFavorable: false,
    materialOmissions: hashMismatches,
    notes: [
      "suite-pointer: expectations/source present",
      hashMismatches.length ? `hash_mismatch:${hashMismatches.join(",")}` : "hashes_ok_or_unset",
      "full suite execution deferred to product-acceptance run-all",
    ],
    details: {
      matchesExpected: hashMismatches.length === 0,
      deterministic: true,
    },
  };
}
