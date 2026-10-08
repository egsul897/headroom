import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  IMPORT_CONTRACT_VERSION,
  assertImportRecord,
  integratePeerWorkstreams,
  LIBRARY_STATUSES,
} from "../../lib/basket-formula-corpus";

const ROOT = resolve(__dirname, "../..");
const PHASE4 = resolve(ROOT, "docs/covenant-basket-capacity-formula-library/phase-4");
const EXPORT4 = resolve(PHASE4, "export");

function readJsonl(path: string): unknown[] {
  return readFileSync(path, "utf8")
    .split("\n")
    .filter((l) => l.trim())
    .map((l) => JSON.parse(l));
}

describe("phase-4 production integration and corpus replay", () => {
  it("emits Phase-4 artifacts for the full 390-candidate corpus", () => {
    for (const f of [
      "00-phase3-baseline-replay.json",
      "01-peer-integration.json",
      "02-governing-binding-results.json",
      "03-legal-semantic-classification.json",
      "04-dependency-closure.json",
      "05-independent-evaluation-preserved.json",
      "06-production-integration.json",
      "07-remaining-blockers.json",
      "08-phase4-counts.json",
      "10-phase4-mandatory-return.md",
      "export/phase4-governing-bindings.jsonl",
      "export/phase4-semantic-roles.jsonl",
      "export/phase4-dependency-graphs.jsonl",
      "export/phase4-library-statuses.jsonl",
      "export/phase4-import-records.jsonl",
    ]) {
      expect(existsSync(resolve(PHASE4, f)), f).toBe(true);
    }
  });

  it("replays 390 candidates with zero executable/verified promotions", () => {
    const bindings = readJsonl(resolve(EXPORT4, "phase4-governing-bindings.jsonl"));
    const graphs = readJsonl(resolve(EXPORT4, "phase4-dependency-graphs.jsonl")) as Array<{
      executable: boolean;
      completeness: { fullyClosed: boolean };
    }>;
    const statuses = readJsonl(resolve(EXPORT4, "phase4-library-statuses.jsonl")) as Array<{
      status: string;
      executable: boolean;
      verified: boolean;
    }>;
    expect(bindings.length).toBe(390);
    expect(graphs.length).toBe(390);
    expect(statuses.length).toBe(390);
    expect(graphs.every((g) => g.executable === false)).toBe(true);
    expect(graphs.every((g) => g.completeness.fullyClosed === false)).toBe(true);
    expect(statuses.every((s) => s.executable === false && s.verified === false)).toBe(true);
    expect(statuses.every((s) => s.status !== "VERIFIED" && s.status !== "EXECUTABLE")).toBe(true);
    for (const s of statuses) {
      expect(LIBRARY_STATUSES.includes(s.status as (typeof LIBRARY_STATUSES)[number])).toBe(true);
    }
  });

  it("reproduces Phase-3 baseline counts or explains drift", () => {
    const replay = JSON.parse(readFileSync(resolve(PHASE4, "00-phase3-baseline-replay.json"), "utf8"));
    expect(replay.reproducedOnMain.candidates).toBe(390);
    expect(replay.reproducedOnMain.executable).toBe(0);
    expect(typeof replay.driftExplanation).toBe("string");
    expect(replay.historical.independentReviews).toBe(145);
  });

  it("reports zero false-permission rate on preserved independent reviews", () => {
    const metrics = JSON.parse(readFileSync(resolve(PHASE4, "09-evaluation-metrics.json"), "utf8"));
    expect(metrics.falsePermissionRate.numerator).toBe(0);
    expect(metrics.falsePermissionRate.denominator).toBe(145);
    expect(metrics.precisionAffirmativePermission.numerator).toBe(25);
    expect(metrics.recallAffirmativePermission.numerator).toBe(25);
    expect(metrics.sourceSpanFidelity.corpusOperativeSpanRate.numerator).toBeGreaterThanOrEqual(300);
    expect(metrics.dependencyClosure.fullyClosedRate.numerator).toBe(0);
  });

  it("integrates peers without fabricating verified/executable sufficiency", () => {
    const peers = integratePeerWorkstreams(ROOT);
    expect(peers.competingSourceRegistry).toBe(false);
    expect(peers.knowledgeFactory.legallyVerified).toBe(false);
    expect(peers.knowledgeFactory.sufficientForExecutable).toBe(false);
    expect(peers.legalCore.legallyVerified).toBe(false);
    // Sample fixtures must not count as published peer exports.
    if (peers.dependencyAtlas.note.includes("sample fixture")) {
      expect(peers.dependencyAtlas.availability).toBe("UNAVAILABLE");
    }
    const report = JSON.parse(readFileSync(resolve(PHASE4, "01-peer-integration.json"), "utf8"));
    expect(report.importContract).toBe(IMPORT_CONTRACT_VERSION);
  });

  it("keeps import records on the hypothesis lane", () => {
    const rows = readJsonl(resolve(EXPORT4, "phase4-import-records.jsonl"));
    expect(rows.length).toBe(390);
    for (const row of rows.slice(0, 25)) {
      const parsed = assertImportRecord(row);
      expect(parsed.verificationLane).toBe("SOURCE_SUPPORTED_HYPOTHESIS");
      expect(parsed.kind).toBe("BASKET_FORMULA_HYPOTHESIS");
      expect((parsed.payload as { executable?: boolean }).executable).toBe(false);
    }
  });

  it("does not edit the production capacity engine surface", () => {
    // Structural guard: Phase-4 library modules must not import runtime/capacity.
    const files = [
      "lib/basket-formula-corpus/governing-binding.ts",
      "lib/basket-formula-corpus/semantic-role.ts",
      "lib/basket-formula-corpus/dependency-graph.ts",
      "lib/basket-formula-corpus/peer-integration.ts",
      "lib/basket-formula-corpus/promotion-status.ts",
    ];
    for (const f of files) {
      const text = readFileSync(resolve(ROOT, f), "utf8");
      expect(text).not.toMatch(/runtime\/capacity/);
      expect(text).not.toMatch(/phase3-certification\/certify/);
    }
  });
});
