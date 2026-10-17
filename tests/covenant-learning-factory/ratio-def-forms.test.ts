import { describe, expect, it } from "vitest";
import { parseDefinitions } from "@/lib/contract-model/covenant-computation/ratios";

const parse = (text: string) => parseDefinitions({ documentId: "d", text } as never);

describe("ratio definition forms", () => {
  it("reads 'the ratio, determined as of …, of (i) X to (ii) Y'", () => {
    const d = parse(`"Total Leverage Ratio" means the ratio, determined as of the end of each fiscal quarter of the Company, of (i) Consolidated Indebtedness as of such date to (ii) Consolidated EBITDA for the period of four consecutive fiscal quarters. "Transactions" means the deal.`);
    expect(d).toHaveLength(1);
    expect(d[0]!.numeratorMetrics).toContain("Consolidated Indebtedness");
    expect(d[0]!.denominatorMetrics).toContain("Consolidated EBITDA");
  });
  it("reads the colon form 'X Ratio: as at …, the ratio of (a) X to (b) Y'", () => {
    const d = parse(`"Consolidated Leverage Ratio": as at the last day of any period of four consecutive fiscal quarters of the Borrower, the ratio of (a) Consolidated Total Debt on such day to (b) Consolidated EBITDA for such period. "Default": any event.`);
    expect(d).toHaveLength(1);
    expect(d[0]!.ratioName).toBe("Consolidated Leverage Ratio");
    expect(d[0]!.numeratorMetrics).toContain("Consolidated Total Debt");
  });
});
