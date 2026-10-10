import { describe, expect, it } from "vitest";
import { OPERATIVE_GOLD_CASES } from "../../lib/knowledge-factory/quality-gate/operative-audit";
import { RETRIEVAL_GOLD_QUESTIONS } from "../../lib/knowledge-factory/quality-gate/retrieval-completeness";
import {
  FINANCING_PACKAGE_REGISTRY_PROPOSAL,
  renderPackageRegistryProposalMarkdown,
} from "../../lib/knowledge-factory/quality-gate/package-registry-proposal";

describe("quality-gate fixtures", () => {
  it("operative gold cases forbid filing-order-only resolution", () => {
    expect(OPERATIVE_GOLD_CASES.length).toBeGreaterThanOrEqual(4);
    for (const c of OPERATIVE_GOLD_CASES) {
      expect(c.forbidLatestFilingHeuristicAlone).toBe(true);
    }
  });

  it("retrieval gold includes critical covenant families", () => {
    const ids = new Set(RETRIEVAL_GOLD_QUESTIONS.map((q) => q.id));
    expect(ids.has("rp-available-amount")).toBe(true);
    expect(ids.has("indebtedness-incurrence")).toBe(true);
    expect(ids.has("incremental-facility")).toBe(true);
    expect(RETRIEVAL_GOLD_QUESTIONS.filter((q) => q.critical).length).toBeGreaterThanOrEqual(5);
  });

  it("package registry proposal is non-migrating and fail-closed", () => {
    expect(FINANCING_PACKAGE_REGISTRY_PROPOSAL.status).toBe("PROPOSAL_ONLY_NO_MIGRATE");
    expect(FINANCING_PACKAGE_REGISTRY_PROPOSAL.linkingRules.join(" ")).toMatch(/UNRESOLVED/i);
    expect(FINANCING_PACKAGE_REGISTRY_PROPOSAL.outOfScope.join(" ")).toMatch(/operative/i);
    const md = renderPackageRegistryProposalMarkdown();
    expect(md).toContain("PROPOSAL_ONLY_NO_MIGRATE");
    expect(md).toContain("FinancingPackage");
  });
});
