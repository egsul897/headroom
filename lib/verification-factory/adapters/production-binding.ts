/**
 * Prove CVF adapters bind to production modules — they must import real engines,
 * not reimplement conjunction / capacity / sequential logic in the harness.
 */

import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

export const PRODUCTION_IMPORT_REQUIREMENTS: Record<string, string[]> = {
  "cross-document.ts": [
    "@/lib/product/covenant-intelligence/cross-document-authentic-packages",
    "@/lib/product/covenant-intelligence/cross-document-adversarial",
    "@/lib/product/covenant-intelligence/cross-document-scenarios",
  ],
  "capacity-a8.ts": ["@/lib/contract-model/runtime/capacity/types"],
  "sequential.ts": [
    "@/lib/product/covenant-intelligence/cross-document-sequential-state",
    "@/lib/product/covenant-intelligence/cross-document-authentic-packages",
  ],
  "metamorphic.ts": [
    "@/lib/product/covenant-intelligence/cross-document-covenant",
    "@/lib/product/covenant-intelligence/cross-document-authentic-packages",
  ],
  "grounded-boundary.ts": [
    "@/lib/product/covenant-intelligence/cross-document-authentic-packages",
    "@/lib/product/covenant-intelligence/cross-document-covenant",
    "@/lib/product/covenant-intelligence/cross-document-adversarial",
    "@/lib/product/covenant-intelligence/cross-document-scenarios",
  ],
  // suite-pointer validates frozen expectations files only — no production evaluator to import.
};

/** Forbidden: adapters must not contain a parallel conjunction / capacity engine. */
export const FORBIDDEN_ADAPTER_PATTERNS: RegExp[] = [
  /function\s+evaluateCrossDocumentTransaction\s*\(/,
  /function\s+evaluateCapacityState\s*\(/,
  /function\s+simulateTransaction\s*\(/,
  /ALL_APPLICABLE_DOCUMENTS_MUST_PERMIT\s*=/,
  /op:\s*"MAX"\s*,\s*items:/, // parallel capacity formula builder
];

export function auditAdapterProductionBinding(cwd = process.cwd()): {
  ok: boolean;
  adaptersChecked: string[];
  missingImports: Array<{ adapter: string; missing: string }>;
  forbiddenHits: Array<{ adapter: string; pattern: string }>;
  note: string;
} {
  const dir = join(cwd, "lib/verification-factory/adapters");
  const files = readdirSync(dir).filter((f) => f.endsWith(".ts") && f !== "production-binding.ts");
  const missingImports: Array<{ adapter: string; missing: string }> = [];
  const forbiddenHits: Array<{ adapter: string; pattern: string }> = [];

  for (const file of files) {
    const src = readFileSync(join(dir, file), "utf8");
    const required = PRODUCTION_IMPORT_REQUIREMENTS[file] ?? [];
    for (const imp of required) {
      if (!src.includes(imp)) missingImports.push({ adapter: file, missing: imp });
    }
    for (const pat of FORBIDDEN_ADAPTER_PATTERNS) {
      if (pat.test(src)) forbiddenHits.push({ adapter: file, pattern: String(pat) });
    }
  }

  // Metamorphic may call evaluateCrossDocumentTransaction via import — that is required, not a redefinition.
  // Forbidden pattern is function definition only.

  return {
    ok: missingImports.length === 0 && forbiddenHits.length === 0,
    adaptersChecked: files.sort(),
    missingImports,
    forbiddenHits,
    note: "Adapters must import production modules; they must not redefine production evaluators.",
  };
}
