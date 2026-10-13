/**
 * Evidence surface must not treat active ledger rows + NS-4 APPROVED as
 * utilization completeness — that collapses UNKNOWN → VERIFIED_EXECUTABLE.
 */
import { describe, expect, it } from "vitest";
import { explainRuleExecutability } from "@/lib/customer-workflow/evidence-view";
import { readFileSync } from "node:fs";
import path from "node:path";

describe("evidence utilizationComplete fail-closed", () => {
  it("ledger usages + NS-4 APPROVED without completeness cert → NEEDS_INPUT, not VERIFIED_EXECUTABLE", () => {
    // Simulates the false-positive the evidence page previously computed:
    // contractLedgerActiveCount > 0 && ns4ApprovedSnapshotCount > 0
    const falsePositiveComplete = true;
    const withFalsePositive = explainRuleExecutability({
      executable: true,
      blockers: [],
      missingCitations: false,
      utilizationComplete: falsePositiveComplete,
      amendmentResolved: true,
    });
    // Document the dangerous upgrade path — production must not pass true here.
    expect(withFalsePositive.status).toBe("VERIFIED_EXECUTABLE");

    const honest = explainRuleExecutability({
      executable: true,
      blockers: [],
      missingCitations: false,
      utilizationComplete: false,
      amendmentResolved: true,
    });
    expect(honest.status).toBe("NEEDS_INPUT");
    expect(honest.explanation).toMatch(/UNKNOWN|not zero|completeness/i);
  });

  it("evidence page hardcodes utilizationComplete: false (no ledger-count proxy)", () => {
    const src = readFileSync(
      path.join(process.cwd(), "app/[companyId]/evidence/page.tsx"),
      "utf8",
    );
    expect(src).toMatch(/utilizationComplete:\s*false/);
    expect(src).not.toMatch(
      /utilizationComplete:\s*readiness\.contractLedgerActiveCount\s*>\s*0/,
    );
  });
});
