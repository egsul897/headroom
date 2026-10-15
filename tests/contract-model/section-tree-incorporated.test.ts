/** Amendments, 8-Ks and incorporating instruments: an absence is "absent from this document, incorporated by reference". */
import { describe, expect, it } from "vitest";
import { parseSectionTree } from "@/lib/contract-model/section-tree/parse";
import { covenantChecklist } from "@/lib/contract-model/section-tree/semantics";

const check = (text: string) => covenantChecklist(parseSectionTree(text), text);

describe("absent from this document, incorporated by reference", () => {
  it("an amendment's absent family is marked document-only", () => {
    const text = "FIRST AMENDMENT TO CREDIT AGREEMENT\n\nSection 1. Amendments. The definition of \"Applicable Rate\" is amended to read 2.00%.\n\nSection 2. Counterparts. This Amendment may be executed in counterparts.\n";
    const debt = check(text).find((c) => c.family === "DEBT")!;
    expect(debt.status).toBe("ABSENT_VERIFIED");
    expect(debt.note).toMatch(/^absent from this document, incorporated by reference/);
    expect(debt.absentScope).toBe("DOCUMENT_ONLY_INCORPORATED_BY_REFERENCE");
  });
  it("a guaranty incorporating the credit agreement's covenants by reference is marked document-only", () => {
    const text = "GUARANTY\n\nSection 1. Guaranty. The Guarantor guarantees the Obligations.\n\nSection 2. Covenants. The covenants set forth in Article VI of the Credit Agreement are hereby incorporated herein by reference.\n";
    expect(check(text).find((c) => c.family === "LIENS")!.absentScope).toBe("DOCUMENT_ONLY_INCORPORATED_BY_REFERENCE");
  });
  it("a full agreement's absence is not document-only", () => {
    const text = "CREDIT AGREEMENT\n\nSection 1. Loans. The Lenders agree to make Loans.\n\nSection 2. Counterparts. This Agreement may be executed in counterparts.\n";
    const debt = check(text).find((c) => c.family === "DEBT")!;
    expect(debt.status).toBe("ABSENT_VERIFIED");
    expect(debt.absentScope).toBeUndefined();
  });
});
