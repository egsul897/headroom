import { describe, expect, it } from "vitest";
import { learnedClauseFamily } from "@/lib/contract-model/covenant-computation/extract-baskets";

describe("learned captures take their family from the clause, never the rule label", () => {
  it("boilerplate and mechanics state no covenant family", () => {
    expect(learnedClauseFamily("Section 10.11 Counterparts . This Agreement and each other Loan Document may be executed in one or more counterparts.")).toBeNull();
    expect(learnedClauseFamily("Section 2.08 Interest . (a) Each Base Rate Loan shall bear interest at a rate per annum equal to the Alternate Base Rate.")).toBeNull();
    expect(learnedClauseFamily("Section 5.06. Books and Records; Inspection Rights . Each Loan Party will keep proper books of record and account.")).toBeNull();
  });
  it("a prohibition or a capped permission yields its own family", () => {
    expect(learnedClauseFamily("Section 7.02 Liens . The Borrower shall not create, incur, assume or permit to exist any Lien on any property.")).toBe("LIENS");
    expect(learnedClauseFamily("The Borrower may make distributions under the builder basket for Restricted Payments not to exceed $5,000,000 in any fiscal year.")).toBe("RESTRICTED_PAYMENTS");
  });
});

describe("enumerated permitted items", () => {
  it("an item headed by a family term takes that family; an item headed by anything else does not", () => {
    expect(learnedClauseFamily("(c) Liens arising out of pledges or deposits under worker’s compensation laws.")).toBe("LIENS");
    expect(learnedClauseFamily("(f) Indebtedness in respect of Swap Contracts entered into in the ordinary course.")).toBe("DEBT");
    expect(learnedClauseFamily("(b) Each Lender shall make its Advance available to the Administrative Agent.")).toBeNull();
  });
});

describe("enclosing section family", () => {
  it("an item that names no family takes the family of its enclosing covenant section", async () => {
    const { enclosingSectionFamily } = await import("@/lib/contract-model/covenant-computation/extract-baskets");
    const text = "Section 7.02 Liens . The Borrower shall not create, incur or suffer to exist any Lien on its property, except: (a) those arising by operation of law; (b) deposits to secure the performance of bids, trade contracts and leases in the ordinary course.";
    expect(enclosingSectionFamily(text, text.indexOf("deposits to secure"))).toBe("LIENS");
    const boiler = "Section 10.11 Counterparts . This Agreement may be executed in counterparts, each of which shall be an original.";
    expect(enclosingSectionFamily(boiler, boiler.indexOf("each of which"))).toBeNull();
  });
});

describe("enclosing heading families outside the negative covenants", () => {
  it("a guarantee or incremental section heading supplies the family; boilerplate headings do not", async () => {
    const { enclosingSectionFamily } = await import("@/lib/contract-model/covenant-computation/extract-baskets");
    const g = "Section 6.12 Additional Guarantors . (a) In the event that any Domestic Subsidiary is formed after the Effective Date, it shall become a Guarantor.";
    expect(enclosingSectionFamily(g, g.indexOf("it shall become"))).toBe("GUARANTEES");
    const i = "Section 2.20 Incremental Commitments . (e) On the date of effectiveness of any Incremental Commitments, the aggregate amount shall not exceed the cap.";
    expect(enclosingSectionFamily(i, i.indexOf("the aggregate"))).toBe("INCREMENTAL_DEBT_AND_FACILITIES");
    const f = "Section 2.09 Fees . (g) The Borrower agrees to pay the facing fees to the Facing Agent in the amounts agreed.";
    expect(enclosingSectionFamily(f, f.indexOf("agrees to pay"))).toBeNull();
  });
});
