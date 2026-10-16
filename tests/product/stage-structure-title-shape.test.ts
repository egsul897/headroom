/**
 * Rule 165 (audit-driven): the structural parser must not mint a section
 * node from an in-text citation whose "title" is sentence continuation
 * ("Section 6.14 , provided that ..."). The positional gate alone cannot
 * tell it from a real heading when it sits at a line start after a
 * sentence boundary.
 *
 * @prisma/client is mocked because the compiler chain value-imports the
 * EntityClassTag enum; the values below mirror the Prisma schema enum.
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("../../lib/prisma", () => ({ prisma: {} }));

vi.mock("@prisma/client", () => ({
  PrismaClient: class { constructor() { throw new Error("PrismaClient must not be constructed in this test"); } },
  Prisma: { Decimal: class { constructor(v: unknown) { this.value = Number(v); } toNumber() { return (this as unknown as { value: number }).value; } }, JsonNull: Object.freeze({ toJSON: () => null }) },
  EntityClassTag: {
    BORROWER: "BORROWER",
    GUARANTOR_RS: "GUARANTOR_RS",
    NON_GUARANTOR_RS: "NON_GUARANTOR_RS",
    FOREIGN_RS: "FOREIGN_RS",
    UNRESTRICTED_SUB: "UNRESTRICTED_SUB",
    SECURITIZATION_SUB: "SECURITIZATION_SUB",
    IMMATERIAL_SUB: "IMMATERIAL_SUB",
    PARENT: "PARENT",
    LOAN_PARTY: "LOAN_PARTY",
    MATERIAL_SUBSIDIARY: "MATERIAL_SUBSIDIARY",
    ANY_SUBSIDIARY: "ANY_SUBSIDIARY",
  },
}));

import { extractStructure } from "../../lib/knowledge-factory/pipeline/structural";

describe("rule 165: parser title shape", () => {
  it("an in-text citation with sentence continuation is not a section node", () => {
    const text = [
      "The Borrower shall deliver financial reports.",
      "",
      "Section 6.14 , provided that in the event of any change in generally accepted accounting principles used in the preparation of such financial statements, it shall also provide additional reports.",
      "",
      "Section 6.15 Notices. All notices shall be in writing.",
    ].join("\n");
    const { nodes } = extractStructure("rule165-test", text);
    expect(nodes.filter((n) => n.sectionRef === "6.14")).toHaveLength(0);
    expect(nodes.some((n) => n.sectionRef === "6.15")).toBe(true);
  });

  it("the same citation without a comma still is not a node", () => {
    const text = [
      "Section 6.01 Indebtedness.",
      "",
      "The Borrower shall not incur Indebtedness. Section 6.14 provided that in the event of any change in generally accepted accounting principles, it shall also provide additional reports.",
    ].join("\n");
    const { nodes } = extractStructure("rule165-test-2", text);
    expect(nodes.filter((n) => n.sectionRef === "6.14")).toHaveLength(0);
    expect(nodes.some((n) => n.sectionRef === "6.01")).toBe(true);
  });
});
