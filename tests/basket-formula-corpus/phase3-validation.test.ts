import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  DEPENDENCY_SYSTEM_STATUS,
  IMPORT_CONTRACT_VERSION,
  LEGAL_ROLES,
  assertImportRecord,
} from "../../lib/basket-formula-corpus";

const ROOT = resolve(__dirname, "../..");
const PHASE2 = resolve(ROOT, "docs/covenant-basket-capacity-formula-library/phase-2");
const PHASE3 = resolve(ROOT, "docs/covenant-basket-capacity-formula-library/phase-3");
const EXPORT3 = resolve(PHASE3, "export");

function readJsonl(path: string): unknown[] {
  return readFileSync(path, "utf8")
    .split("\n")
    .filter((l) => l.trim().length > 0)
    .map((l) => JSON.parse(l));
}

describe("phase-3 false-permission audit and dependency closure", () => {
  it("emits required Phase-3 artifacts", () => {
    for (const f of [
      "01-frozen-phase2-regression-reviews.json",
      "02-independent-legal-safety-reviews.json",
      "03-full-390-classification-audit.json",
      "04-context-closure-summary.json",
      "05-independent-evaluation-metrics.json",
      "06-genuine-positive-permissions.json",
      "07-integration-status.json",
      "08-legal-safety-blockers.json",
      "09-phase3-counts.json",
      "10-phase3-mandatory-return.md",
      "export/phase3-candidates.jsonl",
      "export/phase3-context-closures.jsonl",
      "export/phase3-audit.jsonl",
      "export/phase3-import-records.jsonl",
    ]) {
      expect(existsSync(resolve(PHASE3, f)), f).toBe(true);
    }
  });

  it("freezes Phase-2 30 reviews and adds at least 100 additional independent reviews", () => {
    const frozen = JSON.parse(
      readFileSync(resolve(PHASE3, "01-frozen-phase2-regression-reviews.json"), "utf8"),
    );
    const indep = JSON.parse(
      readFileSync(resolve(PHASE3, "02-independent-legal-safety-reviews.json"), "utf8"),
    );
    expect(frozen.frozenCount).toBe(30);
    expect(frozen.reviews.every((r: { frozenPhase2: boolean }) => r.frozenPhase2)).toBe(true);
    expect(indep.additionalIndependentCount).toBeGreaterThanOrEqual(100);
    expect(indep.totalIndependentReviews).toBe(
      indep.frozenPhase2Count + indep.additionalIndependentCount,
    );
    expect(indep.positivePermissionControls).toBeGreaterThan(0);
    expect(indep.negativeControls).toBeGreaterThan(0);
    expect(indep.note).toMatch(/not derived from remediator/i);
  });

  it("audits all 390 candidates and never marks formulas executable", () => {
    const audit = JSON.parse(
      readFileSync(resolve(PHASE3, "03-full-390-classification-audit.json"), "utf8"),
    );
    expect(audit.candidateCount).toBe(390);
    expect(audit.executableCount).toBe(0);
    expect(audit.correctedFalseAffirmatives).toBeGreaterThan(0);

    const candidates = readJsonl(resolve(EXPORT3, "phase3-candidates.jsonl")) as Array<{
      capacityComputable: boolean;
      executable: boolean;
      capacitySemantics: string;
      legalRole: string;
      verificationLane: string;
    }>;
    expect(candidates.length).toBe(390);
    expect(candidates.every((c) => c.capacityComputable === false)).toBe(true);
    expect(candidates.every((c) => c.executable === false)).toBe(true);
    expect(candidates.every((c) => c.verificationLane === "SOURCE_SUPPORTED_HYPOTHESIS")).toBe(
      true,
    );
    for (const c of candidates) {
      expect(LEGAL_ROLES.includes(c.legalRole as (typeof LEGAL_ROLES)[number])).toBe(true);
    }

    const phase2 = readJsonl(
      resolve(PHASE2, "export/phase2-candidates.jsonl"),
    ) as Array<{ capacitySemantics: string }>;
    const beforeAff = phase2.filter((c) => c.capacitySemantics === "AFFIRMATIVE_CAPACITY").length;
    const afterAff = candidates.filter((c) => c.capacitySemantics === "AFFIRMATIVE_CAPACITY").length;
    expect(afterAff).toBeLessThan(beforeAff);
  });

  it("reports independent metrics with numerators and denominators", () => {
    const metrics = JSON.parse(
      readFileSync(resolve(PHASE3, "05-independent-evaluation-metrics.json"), "utf8"),
    );
    expect(metrics.groundTruthSource).toBe("independent_legal_safety_reviews_only");
    expect(metrics.evaluationSetSize).toBeGreaterThanOrEqual(130);
    for (const key of [
      "precisionAffirmativePermission",
      "recallAffirmativePermission",
      "falsePermissionRate",
      "falseRefusalRate",
    ]) {
      expect(typeof metrics[key].numerator).toBe("number");
      expect(typeof metrics[key].denominator).toBe("number");
    }
    expect(metrics.falsePermissionRate.numerator).toBeGreaterThanOrEqual(0);
  });

  it("records unresolved dependencies by cause and keeps context closures non-executable", () => {
    const summary = JSON.parse(
      readFileSync(resolve(PHASE3, "04-context-closure-summary.json"), "utf8"),
    );
    expect(summary.executableCount).toBe(0);
    expect(Object.keys(summary.unresolvedDependenciesByCause).length).toBeGreaterThan(0);
    expect(summary.workstreams.every((w: { availableInRepo: boolean }) => w.availableInRepo === false)).toBe(
      true,
    );

    const closures = readJsonl(resolve(EXPORT3, "phase3-context-closures.jsonl")) as Array<{
      executable: boolean;
      closureStatus: string;
    }>;
    expect(closures.length).toBe(390);
    expect(closures.every((c) => c.executable === false)).toBe(true);
  });

  it("preserves canonical import contract without promoting hypotheses to verified", () => {
    const status = JSON.parse(readFileSync(resolve(PHASE3, "07-integration-status.json"), "utf8"));
    expect(status.importContract).toBe(IMPORT_CONTRACT_VERSION);
    expect(status.autoPromoteToVerified).toBe(false);
    expect(status.competingSchema).toBe(false);
    expect(status.independentSecDownload).toBe(false);
    expect(status.productionCapacityEngineEdits).toBe(false);

    const imports = readJsonl(resolve(EXPORT3, "phase3-import-records.jsonl"));
    expect(imports.length).toBe(390);
    for (const row of imports.slice(0, 20)) {
      const parsed = assertImportRecord(row);
      expect(parsed.verificationLane).toBe("SOURCE_SUPPORTED_HYPOTHESIS");
      expect(parsed.kind).toBe("BASKET_FORMULA_HYPOTHESIS");
    }
  });

  it("coordinates extended workstream interfaces as INTERFACE_ONLY", () => {
    const systems = new Set(DEPENDENCY_SYSTEM_STATUS.map((s) => s.system));
    expect(systems.has("ARCHITECTURE_REMEDIATION_LEGAL_CORE")).toBe(true);
    expect(systems.has("FINANCIAL_DEFINITIONS_PRECEDENT")).toBe(true);
    expect(DEPENDENCY_SYSTEM_STATUS.every((s) => s.availableInRepo === false)).toBe(true);
  });
});
