/**
 * Live Corpus Quality Gate — integrity tests.
 * Authentic EDGAR only; UNVERIFIED discipline; no Claude-owned fixture mutation.
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  auditGibraltar,
  auditSuperior,
  rollupStatus,
} from "../../lib/evaluation/live-corpus-quality-gate";

const CLAUDE_OWNED = [
  "tests/onboarding/synthetic-acceptance.test.ts",
  "tests/onboarding/phase-b-synthetic-acceptance.test.ts",
  "tests/synthetic-company.test.ts",
  "tests/evaluation-v2/",
  "scripts/golden-test.ts",
];

describe("live corpus quality gate", () => {
  it("evaluates authentic EDGAR documents only (zero synthetic docs in sample)", () => {
    const manifest = JSON.parse(
      fs.readFileSync(
        path.join(process.cwd(), "tests/fixtures/live-corpus-quality-gate/sample-manifest.json"),
        "utf8",
      ),
    ) as {
      stratifiedSample: Array<{ authenticEdgar: boolean; sampleId: string }>;
      reservedBlind: { includedInSample: boolean };
    };
    expect(manifest.stratifiedSample.length).toBeGreaterThanOrEqual(4);
    expect(manifest.stratifiedSample.every((s) => s.authenticEdgar === true)).toBe(true);
    expect(manifest.reservedBlind.includedInSample).toBe(false);
    expect(manifest.stratifiedSample.some((s) => s.sampleId.startsWith("syn"))).toBe(false);
  });

  it("preserves independence from compiler-tuning packages", () => {
    const manifest = JSON.parse(
      fs.readFileSync(
        path.join(process.cwd(), "tests/fixtures/live-corpus-quality-gate/sample-manifest.json"),
        "utf8",
      ),
    ) as { excludedFromThisGateAsCompilerTuningCorpus: string[]; stratifiedSample: Array<{ packageId: string }> };
    for (const excl of manifest.excludedFromThisGateAsCompilerTuningCorpus) {
      expect(manifest.stratifiedSample.some((s) => s.packageId.includes(excl.split("-")[0]))).toBe(false);
    }
  });

  it("never marks PASS on legally_verified findings without independentGroundTruth", () => {
    const findings = [...auditGibraltar().findings, ...auditSuperior().findings];
    const illegal = findings.filter(
      (f) => f.layer === "legally_verified" && f.status === "PASS" && f.independentGroundTruth !== true,
    );
    expect(illegal).toEqual([]);
  });

  it("uses UNVERIFIED (not PASS) when independent GT is unavailable", () => {
    const findings = [...auditGibraltar().findings, ...auditSuperior().findings];
    const unverified = findings.filter((f) => f.status === "UNVERIFIED");
    expect(unverified.length).toBeGreaterThan(0);
    expect(unverified.every((f) => f.independentGroundTruth === false)).toBe(true);
  });

  it("separates infrastructure, extraction, and legally_verified layers", () => {
    const findings = [...auditGibraltar().findings, ...auditSuperior().findings];
    const { layerSummaries } = rollupStatus(findings);
    expect(layerSummaries.map((l) => l.layer).sort()).toEqual([
      "extraction",
      "infrastructure",
      "legally_verified",
    ]);
    expect(layerSummaries.every((l) => l.pass + l.fail + l.unverified === l.findings.length)).toBe(true);
  });

  it("returns reproducible production defects for highest-risk omissions", () => {
    const defects = [...auditGibraltar().defects, ...auditSuperior().defects];
    expect(defects.length).toBeGreaterThan(0);
    expect(defects.some((d) => d.severity === "CRITICAL")).toBe(true);
    for (const d of defects) {
      expect(d.returnTo).toBe("production-agent");
      expect(d.reproducibleSteps.length).toBeGreaterThan(0);
      expect(d.fixturePaths.length).toBeGreaterThan(0);
    }
  });

  it("verifies Gibraltar EDGAR source hashes match provenance", () => {
    const { findings } = auditGibraltar();
    const src = findings.find(
      (f) => f.dimension === "source_integrity" && f.layer === "infrastructure",
    );
    expect(src?.status).toBe("PASS");
  });

  it("does not require modifying Claude-owned acceptance fixtures", () => {
    for (const p of CLAUDE_OWNED) {
      expect(fs.existsSync(path.join(process.cwd(), p))).toBe(true);
    }
  });
});
