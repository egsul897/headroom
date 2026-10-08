import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  IMPORT_CONTRACT_VERSION,
  NORMALIZATION_VERSION,
  assertImportRecord,
  buildProvenance,
  DEPENDENCY_SYSTEM_STATUS,
} from "../../lib/basket-formula-corpus";

const ROOT = resolve(__dirname, "../..");
const PHASE2 = resolve(ROOT, "docs/covenant-basket-capacity-formula-library/phase-2");
const EXPORT = resolve(PHASE2, "export");

function readJsonl(path: string): unknown[] {
  return readFileSync(path, "utf8")
    .split("\n")
    .filter((l) => l.trim().length > 0)
    .map((l) => JSON.parse(l));
}

describe("phase-2 basket formula validation", () => {
  it("emits audit, provenance, typed, dependency, scenario, expansion, and import artifacts", () => {
    for (const f of [
      "01-affirmative-capacity-audit.json",
      "02-provenance-results.json",
      "03-typed-formula-coverage.json",
      "04-dependency-validation.json",
      "05-adversarial-scenarios.json",
      "06-corpus-expansion.json",
      "07-integration-contract.json",
      "08-phase2-counts.json",
      "export/phase2-candidates.jsonl",
      "export/phase2-typed-formulas.jsonl",
      "export/phase2-dependencies.jsonl",
      "export/phase2-import-records.jsonl",
      "export/phase2-adversarial-scenarios.jsonl",
    ]) {
      expect(existsSync(resolve(PHASE2, f)), f).toBe(true);
    }
  });

  it("independent audit records false affirmative-capacity classifications without equating grounding to semantics", () => {
    const audit = JSON.parse(readFileSync(resolve(PHASE2, "01-affirmative-capacity-audit.json"), "utf8"));
    expect(audit.reviewedCount).toBeGreaterThanOrEqual(20);
    expect(audit.falseAffirmativeCount).toBeGreaterThan(0);
    expect(audit.note).toMatch(/not legal-semantic correctness/i);
    expect(Array.isArray(audit.falseAffirmativeIds)).toBe(true);
  });

  it("provenance distinguishes byte-exact from whitespace-normalized and never labels normalized as byte-exact", () => {
    const prov = JSON.parse(readFileSync(resolve(PHASE2, "02-provenance-results.json"), "utf8"));
    expect(prov.normalizationVersion).toBe(NORMALIZATION_VERSION);
    expect(prov.byteExactNeverUsedForWhitespaceEquivalent).toBe(true);
    expect(prov.notFoundCount ?? 0).toBe(0);

    const sample = "hello   world\nline";
    const spanNorm = "hello world line";
    const p = buildProvenance(sample, spanNorm, "synthetic.txt");
    expect(p.matchKind).toBe("WHITESPACE_NORMALIZED");
    expect(p.byteExact).toBe(false);
    expect(p.byteOffsetStart).toBeNull();

    const exact = "hello   world";
    const p2 = buildProvenance(sample, exact, "synthetic.txt");
    expect(p2.matchKind).toBe("BYTE_EXACT");
    expect(p2.byteExact).toBe(true);
    expect(p2.byteOffsetStart).toBe(0);
  });

  it("typed formulas never claim executability and cover REPRESENTED/UNSUPPORTED/REVIEW_REQUIRED", () => {
    const coverage = JSON.parse(readFileSync(resolve(PHASE2, "03-typed-formula-coverage.json"), "utf8"));
    expect(coverage.executableCount).toBe(0);
    const rows = readJsonl(resolve(EXPORT, "phase2-typed-formulas.jsonl")) as Array<{ status: string; executable: boolean }>;
    expect(rows.length).toBeGreaterThan(50);
    expect(rows.every((r) => r.executable === false)).toBe(true);
    const statuses = new Set(rows.map((r) => r.status));
    expect(statuses.has("REPRESENTED") || statuses.has("REVIEW_REQUIRED") || statuses.has("UNSUPPORTED")).toBe(true);
  });

  it("dependency systems are coordinated as interface-only and unresolved", () => {
    expect(DEPENDENCY_SYSTEM_STATUS.every((s) => s.availableInRepo === false)).toBe(true);
    const deps = JSON.parse(readFileSync(resolve(PHASE2, "04-dependency-validation.json"), "utf8"));
    expect(deps.executableFormulas).toBe(0);
    expect(deps.systems.every((s: { availableInRepo: boolean }) => s.availableInRepo === false)).toBe(true);
  });

  it("adversarial scenarios separate arithmetic from legal permission", () => {
    const doc = JSON.parse(readFileSync(resolve(PHASE2, "05-adversarial-scenarios.json"), "utf8"));
    expect(doc.scenarioCount).toBeGreaterThanOrEqual(12);
    expect(doc.allPassLegalModel).toBe(true);
    for (const s of doc.scenarios) {
      expect(s.expectedArithmetic).toBeTruthy();
      expect(s.expectedLegalPermission).toBeTruthy();
    }
  });

  it("knowledge-factory import records validate and stay in hypothesis lane", () => {
    const contract = JSON.parse(readFileSync(resolve(PHASE2, "07-integration-contract.json"), "utf8"));
    expect(contract.contractVersion).toBe(IMPORT_CONTRACT_VERSION);
    expect(contract.competingProductionSchema).toBe(false);
    expect(contract.productionCapacityEngineModified).toBe(false);
    const rows = readJsonl(resolve(EXPORT, "phase2-import-records.jsonl"));
    expect(rows.length).toBeGreaterThan(50);
    const one = assertImportRecord(rows[0]);
    expect(one.verificationLane).toBe("SOURCE_SUPPORTED_HYPOTHESIS");
    expect(one.stableId.length).toBeGreaterThan(0);
  });

  it("expansion does not modify Claude-owned fixtures and does not claim prevalence", () => {
    const exp = JSON.parse(readFileSync(resolve(PHASE2, "06-corpus-expansion.json"), "utf8"));
    expect(exp.claudeOwnedFixturesModified).toBe(false);
    expect(exp.marketPrevalenceClaim).toBe(false);
  });

  it("mandatory counts artifact exists with audit and provenance fields", () => {
    const counts = JSON.parse(readFileSync(resolve(PHASE2, "08-phase2-counts.json"), "utf8"));
    expect(counts.startingPR).toBe(148);
    expect(counts.startingSHA).toMatch(/^26e21e4/);
    expect(counts.falseAffirmativeCapacityClassifications).toBeGreaterThan(0);
    expect(counts.constraints.productionCapacityEngineEdits).toBe(false);
    expect(counts.constraints.paidInference).toBe(false);
  });
});
