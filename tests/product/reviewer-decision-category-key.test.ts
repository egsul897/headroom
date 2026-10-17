/**
 * Fix 6 — reviewer decisions key on (sourceId, sectionRef, category).
 *
 * The old key ignored category, so two summary items sharing a
 * sectionRef (e.g. 1.01(g)(c)(c) as EVENTS_OF_DEFAULT and as OTHER)
 * overwrote each other's decisions — counsel could never complete
 * review of a doc with duplicate refs, and the wizard's
 * decisions < items gate never cleared. Source-assertion test (the
 * decision path is prisma-backed, like the rule-67 test).
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

function source(rel: string): string {
  return readFileSync(path.join(process.cwd(), rel), "utf8");
}

describe("reviewer decision category key (Fix 6)", () => {
  it("recordReviewerDecision matches existing/filtered/current item on category", () => {
    const s = source("lib/product/customer-intelligence/reviewer-approvals.ts");
    expect(s).toContain("a.category === params.category");
    expect(s).toContain("i.category === params.category");
    expect(s).toContain("a.category === next.category");
  });

  it("reviewer overlay matches approvals on category", () => {
    const s = source("lib/product/customer-intelligence/reviewer-overlay.ts");
    expect(s).toContain("a.category === item.category)");
  });

  it("counsel coverage counts decidedness by (sectionRef, category)", () => {
    const s = source("lib/product/customer-intelligence/counsel-coverage.ts");
    expect(s).toContain("decidedKeys");
    expect(s).toContain("::${typeof a.category");
  });

  it("rulebook page decision lookup keys on category", () => {
    const s = source("app/[companyId]/rulebook/page.tsx");
    expect(s).toContain("${a.sourceId}|${a.sectionRef}|${a.category}");
    expect(s).toContain("${item.sourceId}|${item.sectionRef}|${item.category}");
  });

  it("review queue dedupes by (sourceId, sectionRef, category)", () => {
    const s = source("lib/product/customer-intelligence/covenant-review.ts");
    expect(s).toContain("seenQueueKeys");
    expect(s).toContain("${doc.sourceId}|${item.sectionRef}|${item.category}");
  });

  it("rulebook readiness counts unique (sectionRef, category, nodeId) units", () => {
    const s = source("lib/product/customer-intelligence/rulebook-readiness.ts");
    expect(s).toContain("uniqueUnits");
    // Phase C (D11): review identity is (sourceId, sectionRef,
    // category, nodeId) — two items sharing (ref, category) are
    // distinct occurrences with distinct decisions.
    expect(s).toContain("`${sourceId}::${i.sectionRef}::${i.category}::${i.nodeId ?? \"\"}`");
    expect(s).toContain('`${a.sourceId ?? ""}::${a.sectionRef}::${a.category}::${(a as { nodeId?: string }).nodeId ?? ""}`');
  });
});
