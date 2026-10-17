import { describe, expect, it } from "vitest";
import { evaluateDefinition } from "@/lib/covenant-learning-factory/xbrl/definition-items";
import type { IssuerFinancials } from "@/lib/covenant-learning-factory/xbrl/companyfacts";

describe("definition group headers", () => {
  it("'(and excluding the effect of), without duplication' is a header, not an unmapped item", () => {
    const text = `"Consolidated EBITDA" means, for any period, Consolidated Net Income for such period plus (and excluding the effect of), without duplication: (a) interest expense; (b) income tax expense.`;
    const fin = { cik: "1", metrics: {} } as unknown as IssuerFinancials;
    const r = evaluateDefinition("EBITDA" as never, "Consolidated EBITDA", text, fin);
    expect(JSON.stringify(r)).not.toContain("(and excluding the effect of)");
  });
});
