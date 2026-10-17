/**
 * Rule 66 — a failed re-analysis must not wipe the prior analysis.
 *
 * The FAILED-extraction branch of analyzeCustomerDocument built
 * failMeta from scratch and replaced the whole metadata, so a
 * failed re-analysis of a previously analyzed document
 * destroyed covenantSummary / amendmentPackage /
 * reviewerApprovals / compile results (the rule-4 bug class in
 * a different branch). The success branch preserves reviewer
 * decisions and the staging branch merges priorMeta; the FAILED
 * branch must merge priorMeta too. Source-assertion test (the
 * module is prisma-backed, like the rule-25 test).
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("failed re-analysis preserves prior analysis", () => {
  it("FAILED branch merges prior metadata instead of replacing it", () => {
    const source = readFileSync(
      path.join(process.cwd(), "lib/product/customer-intelligence/analyze-upload.ts"),
      "utf8",
    );
    const fn = source.slice(source.indexOf("export async function analyzeCustomerDocument"));
    const failedBranch = fn.slice(0, fn.indexOf("const documentClass = documentClassFromDeclared"));
    expect(failedBranch).toContain("failedPriorRow");
    expect(failedBranch).toContain("failedPriorMeta");
    expect(failedBranch).toContain("...failedPriorMeta");
    expect(failedBranch).toContain("analysisError");
  });
});
