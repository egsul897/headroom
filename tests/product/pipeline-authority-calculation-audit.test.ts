/**
 * Workstream A — compilation pipeline audit for OA/calculation mismatches.
 */
import { describe, expect, it } from "vitest";
import { auditCompilationPipelineAuthorityCalculation } from "@/lib/contract-model/analysis/pipeline-authority-calculation-audit";

describe("pipeline authority/calculation audit", () => {
  it("operative-covenant-package sanitize gate is present (P0 closed)", () => {
    const report = auditCompilationPipelineAuthorityCalculation();
    const oc = report.findings.find((f) => f.surface === "operative-covenant-package");
    expect(oc).toBeDefined();
    expect(oc!.severity).toBe("INFO_SAFE");
    expect(report.p0Count).toBe(0);
  });

  it("records residual P1 surfaces that publish capacity without local sanitize", () => {
    const report = auditCompilationPipelineAuthorityCalculation();
    // Downstream VE/offline paths are disclosed P1 risks until they either
    // consume only sanitized units or gain a local gate — not silently ignored.
    for (const f of report.findings) {
      expect(["P0_MISMATCH", "P1_RISK", "INFO_SAFE"]).toContain(f.severity);
    }
    expect(report.version).toMatch(/pipeline-authority-calculation-audit/);
  });
});
