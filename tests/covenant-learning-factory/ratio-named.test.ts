import { describe, expect, it } from "vitest";
import { runCovenantComputation } from "@/lib/contract-model/covenant-computation";

const pkg = (text: string) => ({ packageKey: "p", companyId: "c", instrumentKey: "i", asOf: "2026-10-15", documents: [{ documentId: "d", text }], baskets: [] }) as never;
const status = (text: string, name: string) => runCovenantComputation(pkg(text), { createdAt: "1970-01-01T00:00:00.000Z" } as never).ratios.find((r: { displayName: string }) => r.displayName === name)?.status;

describe("a ratio is named only by its own full term", () => {
  it("'Consolidated First Lien Net Leverage Ratio' does not name 'Leverage Ratio'", () => {
    expect(status("The Applicable Rate is set by the Consolidated First Lien Net Leverage Ratio of the Borrower.", "Total Leverage Ratio")).toBe("UNKNOWN");
  });
  it("'Senior Secured Leverage Ratio' does not name the plain secured ratio", () => {
    expect(status("the Senior Secured Leverage Ratio of the Initial Borrower", "Secured Leverage Ratio")).toBe("UNKNOWN");
  });
  it("a direct mention still names it", () => {
    expect(status("The Borrower will not permit the Secured Leverage Ratio to exceed 3.00 to 1.00.", "Secured Leverage Ratio")).toBe("NEEDS_INPUT");
  });
});
