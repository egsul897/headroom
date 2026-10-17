import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { covenantRatioThresholds } from "@/lib/contract-model/covenant-computation/ratio-terms";
import { runAgreementPipeline } from "@/lib/covenant-learning-factory/pipeline/agreement-pipeline";
import { extractFinancials } from "@/lib/covenant-learning-factory/xbrl/companyfacts";

const DOC = "/workspace/fresh/docs/8177_ef20026270_ex10-1.htm";
const CF = "/workspace/xbrl-cache/CIK0000008177.json";

describe("pipeline emits headroom", () => {
  it("reads a percent-of maintenance covenant and ignores a closing condition", () => {
    const text = "(vi) Evidence demonstrating a Debt to Capital Ratio of no greater than 40%; and (vii) other documents. Section 7.1. Debt to Capital Ratio. The Borrower will not permit, as of the last day of each Fiscal Quarter, Consolidated Indebtedness at such time to exceed 35% of Consolidated Capitalization at such time.";
    const t = covenantRatioThresholds(text, "Debt to Capital Ratio", ["Consolidated Indebtedness"], ["Consolidated Capitalization"]);
    expect(t).toHaveLength(1);
    expect(t[0]).toMatchObject({ comparator: "NO_GREATER_THAN", num: 35, den: 100 });
  });

  it.skipIf(!existsSync(DOC) || !existsSync(CF))("Atlantic American: Debt to Capital Ratio ≥ 5623/23871 against a 35% maximum gives headroom at most 54637/477420", () => {
    const fin = extractFinancials(JSON.parse(readFileSync(CF, "utf8")), "0000008177", { asOf: "2026-10-15" });
    const r = runAgreementPipeline({ sourceId: "fresh:8177", text: readFileSync(DOC, "utf8"), issuerCik: "8177", financials: fin });
    const h = r.headroom.find((x) => x.kind === "RATIO" && x.name === "Debt to Capital Ratio");
    expect(h).toMatchObject({ status: "COMPUTED", usage: "5623/23871", usageBound: "AT_LEAST", limit: "7/20", direction: "MAX", headroom: "54637/477420", headroomBound: "AT_MOST" });
    // 7/20 − 5623/23871 = (7·23871 − 20·5623) / (20·23871)
    expect(7 * 23871 - 20 * 5623).toBe(54637 * (20 * 23871) / 477420);
    // Baskets: cap computed, usage unknown → headroom stays NEEDS_INPUT, never invented.
    for (const b of r.headroom.filter((x) => x.kind === "BASKET")) expect(b).toMatchObject({ status: "NEEDS_INPUT", headroom: null });
  });
});
