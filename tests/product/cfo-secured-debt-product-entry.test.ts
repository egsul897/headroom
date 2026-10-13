/**
 * PR #351 — customer entry point for Matthews $50M secured-debt workflow.
 * Covers route eligibility, modeled-vs-certified labels, evidence blockers,
 * and audit export payload — not CLI-only.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  CFO_SECURED_DEBT_DEFAULT_ASK,
  classifyCfoSecuredDebtResultAuthority,
  cfoSecuredDebtResultAuthorityLabel,
  isMatthewsCfoSecuredDebtCompany,
  loadCfoSecuredDebtProductEntry,
} from "@/lib/customer-workflow/cfo-secured-debt-entry";

describe("CFO secured-debt product entry (#351)", () => {
  it("is eligible only for Matthews company ids", () => {
    expect(isMatthewsCfoSecuredDebtCompany("matthews")).toBe(true);
    expect(isMatthewsCfoSecuredDebtCompany("matthews-international")).toBe(true);
    expect(isMatthewsCfoSecuredDebtCompany("coherent")).toBe(false);
    expect(isMatthewsCfoSecuredDebtCompany("other")).toBe(false);
  });

  it("loads eight outputs on Simulate entry for Matthews with modeled authority label", async () => {
    const entry = await loadCfoSecuredDebtProductEntry({
      companyId: "matthews",
      ask: CFO_SECURED_DEBT_DEFAULT_ASK,
      amountMillions: 50,
      evaluationDate: "2024-12-31",
    });

    expect(entry.routeEligible).toBe(true);
    expect(entry.outputs).not.toBeNull();
    expect(entry.outputs!.applicableCovenants!.length).toBeGreaterThanOrEqual(5);
    expect(entry.outputs!.operativeAndAmendmentState).toBeTruthy();
    expect(entry.outputs!.debtBasketsAndRatioConditions!.length).toBeGreaterThanOrEqual(5);
    expect(entry.outputs!.approvedFinancialInputs!.ns4ApprovedPresent).toBe(false);
    expect(entry.outputs!.utilizationAndRemaining!.verifiedRemainingUsd).toBeNull();
    expect(entry.outputs!.pathAndSimulation!.verifiedSimulateExecutable).toBe(false);
    expect(entry.outputs!.result).toBeTruthy();
    expect(entry.outputs!.auditTrail!.sources.length).toBeGreaterThan(0);

    expect(entry.result).not.toBe("PERMITTED");
    expect(entry.verifiedRemainingUsd).toBeNull();
    expect(entry.certifiedSimulationAvailable).toBe(false);

    if (entry.result === "NOT_PERMITTED") {
      expect(entry.resultAuthority).toBe("MODELED_NOT_CERTIFIED_4E");
      expect(entry.resultAuthorityLabel).toMatch(/not a CERTIFIED_4E/);
    } else {
      expect(entry.resultAuthority).toBe("NEEDS_AUTHENTIC_EVIDENCE");
    }
  });

  it("labels modeled NOT_PERMITTED distinctly from certified determination", () => {
    expect(classifyCfoSecuredDebtResultAuthority("NOT_PERMITTED")).toBe(
      "MODELED_NOT_CERTIFIED_4E",
    );
    expect(cfoSecuredDebtResultAuthorityLabel("MODELED_NOT_CERTIFIED_4E")).toContain(
      "not a CERTIFIED_4E",
    );
    expect(classifyCfoSecuredDebtResultAuthority("UNSUPPORTED")).toBe(
      "UNSUPPORTED_NO_PACKAGE",
    );
  });

  it("surfaces evidence blockers and keeps certified sim unavailable", async () => {
    const entry = await loadCfoSecuredDebtProductEntry({ companyId: "matthews" });
    expect(entry.evidenceBlockers).toContain("CERTIFIED_SIMULATION_UNAVAILABLE");
    expect(entry.evidenceBlockers).toContain("VERIFIED_REMAINING_NULL");
    expect(
      entry.evidenceBlockers.some(
        (b) =>
          b.includes("NO_MATTHEWS_VERIFIED_EXECUTION_PACKAGE") ||
          b.includes("ABSENT_EVIDENCE"),
      ),
    ).toBe(true);
  });

  it("exports downloadable audit trail JSON with required fields", async () => {
    const entry = await loadCfoSecuredDebtProductEntry({ companyId: "matthews" });
    expect(entry.auditExportJson).toBeTruthy();
    expect(entry.auditExportFilename).toMatch(/matthews-secured-debt-audit/);
    const parsed = JSON.parse(entry.auditExportJson!);
    expect(parsed.schema).toBe("cfo-secured-debt-audit-export.v1");
    expect(parsed.resultAuthority).toBeTruthy();
    expect(parsed.auditTrail.sources.length).toBeGreaterThan(0);
    expect(parsed.auditTrail.gates.length).toBeGreaterThan(0);
    expect(parsed.utilizationAndRemaining.verifiedRemainingUsd).toBeNull();
    expect(parsed.pathAndSimulation.verifiedSimulateExecutable).toBe(false);
  });

  it("fail-closes when authentic package is omitted", async () => {
    const entry = await loadCfoSecuredDebtProductEntry({
      companyId: "unknown",
      omitAuthenticPackage: true,
    });
    expect(entry.routeEligible).toBe(true);
    expect(entry.result).toBe("UNSUPPORTED");
    expect(entry.resultAuthority).toBe("UNSUPPORTED_NO_PACKAGE");
    expect(entry.evidenceBlockers).toContain("MISSING_AUTHENTIC_PACKAGE");
  });

  it("wires Simulate page to the product entry (not CLI-only)", () => {
    const simulatePage = readFileSync(
      path.join(process.cwd(), "app/[companyId]/simulate/page.tsx"),
      "utf8",
    );
    expect(simulatePage).toContain("loadCfoSecuredDebtProductEntry");
    expect(simulatePage).toContain("CfoSecuredDebtWorkflowPanel");
    expect(simulatePage).toContain("isMatthewsCfoSecuredDebtCompany");

    const panel = readFileSync(
      path.join(
        process.cwd(),
        "components/customer-workflow/CfoSecuredDebtWorkflowPanel.tsx",
      ),
      "utf8",
    );
    expect(panel).toContain("cfo-secured-debt-workflow-panel");
    expect(panel).toContain("CfoSecuredDebtAuditDownload");
    expect(panel).toMatch(/Modeled outcomes are not certified legal determinations/i);
    const download = readFileSync(
      path.join(
        process.cwd(),
        "components/customer-workflow/CfoSecuredDebtAuditDownload.tsx",
      ),
      "utf8",
    );
    expect(download).toContain("Download audit trail");
  });

  it("does not show the panel entry for non-Matthews companies", async () => {
    const entry = await loadCfoSecuredDebtProductEntry({ companyId: "coherent" });
    expect(entry.routeEligible).toBe(false);
    expect(entry.workflow).toBeNull();
    expect(entry.auditExportJson).toBeNull();
  });
});
