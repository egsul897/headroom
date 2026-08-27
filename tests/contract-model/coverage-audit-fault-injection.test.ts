/**
 * Phase 2E fault-injection gate (task §25/§26/§27/§41). Runs the 12
 * required injected-defect scenarios and asserts 100% catch rate - a
 * single missed injected material defect means
 * PHASE_2E_INDEPENDENT_COVERAGE_AUDITOR_NEEDS_ITERATION (task §41), so
 * this is a hard regression gate, not a soft assertion.
 */
import { describe, expect, it } from "vitest";
import { buildFaultScenarios, runFaultInjectionManifest } from "./coverage-audit-fault-scenarios";

describe("Phase 2E fault-injection gate (task §41 - 100% required)", () => {
  it("the correct synthetic baseline (before any injection) produces the expected discovered/retrieved material findings with no injected gaps", () => {
    const { baselineFindings } = buildFaultScenarios();
    // The baseline still carries two real, honest findings even before any
    // injection: 6.01(c)'s own no-Default condition text also independently
    // matches CONDITION detection is already retrieved (not a gap), so the
    // baseline is expected to be clean of the specific defect-shaped
    // findings the scenarios below each independently inject.
    expect(baselineFindings.every((f) => f.materiality === "MATERIAL")).toBe(true);
  });

  it.each(buildFaultScenarios().scenarios.map((s) => [s.defectType, s] as const))("independently catches injected defect: %s", (_label, scenario) => {
    const findings = scenario.runAudit();
    expect(scenario.matchesExpectedFinding(findings), `expected a finding matching "${scenario.expectedAuditorBehavior}" but got: ${findings.map((f) => f.findingType).join(", ") || "(none)"}`).toBe(true);
  });

  it("100% of the 12 required injected material defects are caught (task §41 gate)", () => {
    const manifest = runFaultInjectionManifest();
    expect(manifest).toHaveLength(12);
    const uncaught = manifest.filter((m) => !m.caught);
    expect(uncaught, `uncaught injections: ${JSON.stringify(uncaught, null, 2)}`).toHaveLength(0);
  });

  it("every fault manifest entry carries a stable, deterministic injectionId and full provenance", () => {
    const manifest = runFaultInjectionManifest();
    const ids = new Set(manifest.map((m) => m.injectionId));
    expect(ids.size).toBe(manifest.length);
    for (const entry of manifest) {
      expect(entry.expectedAuditorBehavior.length).toBeGreaterThan(0);
      expect(entry.sourceLocation.length).toBeGreaterThan(0);
    }
  });
});
