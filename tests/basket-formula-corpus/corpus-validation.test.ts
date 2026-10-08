import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { BASKET_FAMILIES, FORMULA_TAXONOMY } from "../../lib/basket-formula-corpus";
import {
  validateAdversarialExample,
  validateBasketCandidate,
  validateTaxonomy,
} from "../../lib/basket-formula-corpus/validate";

const ROOT = resolve(__dirname, "../..");
const EXPORT = resolve(ROOT, "docs/covenant-basket-capacity-formula-library/export");
const TAXONOMY_JSON = resolve(ROOT, "docs/covenant-basket-capacity-formula-library/01-formula-taxonomy.json");

function readJsonl(path: string): unknown[] {
  return readFileSync(path, "utf8")
    .split("\n")
    .filter((l) => l.trim().length > 0)
    .map((l) => JSON.parse(l));
}

describe("covenant basket / capacity formula corpus", () => {
  it("exports exist", () => {
    expect(existsSync(resolve(EXPORT, "basket-candidates.jsonl"))).toBe(true);
    expect(existsSync(resolve(EXPORT, "adversarial-examples.jsonl"))).toBe(true);
    expect(existsSync(resolve(EXPORT, "dataset-manifest.json"))).toBe(true);
    expect(existsSync(TAXONOMY_JSON)).toBe(true);
  });

  it("taxonomy is complete and validates", () => {
    const doc = JSON.parse(readFileSync(TAXONOMY_JSON, "utf8"));
    const entries = validateTaxonomy(doc.entries);
    expect(entries.length).toBe(FORMULA_TAXONOMY.length);
    expect(new Set(entries.map((e) => e.formulaKind)).size).toBe(entries.length);
  });

  it("every basket candidate validates, grounds in source, and obeys capacity rules", () => {
    const rows = readJsonl(resolve(EXPORT, "basket-candidates.jsonl"));
    expect(rows.length).toBeGreaterThanOrEqual(40);
    const cache = new Map<string, string>();
    const families = new Set<string>();
    let computable = 0;
    for (const row of rows) {
      const { record, span } = validateBasketCandidate(row, ROOT, cache);
      expect(span.ok, span.reason ?? record.id).toBe(true);
      families.add(record.basketFamily);
      for (const sec of record.secondaryFamilies ?? []) families.add(sec);
      if (record.capacityComputable) computable += 1;
      if (record.capacitySemantics === "AFFIRMATIVE_CAPACITY" && !record.capacityComputable) {
        expect(record.capacityComputationBlockers.length).toBeGreaterThan(0);
      }
      // Never promote incomplete inputs into a computed permission amount.
      if (record.capacityComputationBlockers.length > 0) {
        expect(record.capacityComputable).toBe(false);
      }
    }
    for (const fam of BASKET_FAMILIES) {
      expect(families.has(fam), `missing family coverage: ${fam}`).toBe(true);
    }
    // This corpus intentionally does not fabricate financial inputs; computable should stay 0.
    expect(computable).toBe(0);
  });

  it("adversarial examples ground and keep non-capacity roles distinct from capacity controls", () => {
    const rows = readJsonl(resolve(EXPORT, "adversarial-examples.jsonl"));
    expect(rows.length).toBeGreaterThanOrEqual(8);
    const cache = new Map<string, string>();
    const roles = new Set<string>();
    for (const row of rows) {
      const { record, span } = validateAdversarialExample(row, ROOT, cache);
      expect(span.ok, span.reason ?? record.id).toBe(true);
      roles.add(record.role);
      if (record.role !== "AFFIRMATIVE_CAPACITY_CONTROL") {
        expect(record.whyNotAffirmativeCapacity.toLowerCase()).not.toContain("n/a — this is affirmative");
      }
    }
    expect(roles.has("FINANCIAL_MAINTENANCE_TEST")).toBe(true);
    expect(roles.has("COMPARATOR_THRESHOLD") || roles.has("DEFAULT_OR_EVENT_THRESHOLD")).toBe(true);
    expect(roles.has("AFFIRMATIVE_CAPACITY_CONTROL")).toBe(true);
  });

  it("manifest reports production engine untouched and no paid/certification side effects", () => {
    const manifest = JSON.parse(readFileSync(resolve(EXPORT, "dataset-manifest.json"), "utf8"));
    expect(manifest.productionEngineUntouched).toBe(true);
    expect(manifest.paidCalls).toBe(false);
    expect(manifest.merges).toBe(false);
    expect(manifest.certificationChanges).toBe(false);
    expect(manifest.counts.familiesCovered).toBe(20);
    expect(manifest.counts.spanGrounded).toBe(manifest.counts.basketCandidates);
    expect(manifest.counts.capacityComputable).toBe(0);
  });
});
