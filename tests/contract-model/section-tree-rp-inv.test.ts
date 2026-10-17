import { describe, expect, it } from "vitest";
import { parseDocumentTree } from "@/lib/contract-model/section-tree/parse";
import { covenantChecklist, familyEvidence } from "@/lib/contract-model/section-tree/semantics";

const st = (text: string, fam: string) => { const t = parseDocumentTree(text); return covenantChecklist(t, t.text).find((c) => c.family === fam)!; };

describe("RP / INVESTMENTS / PREPAYMENTS checklist (coder C)", () => {
  it("indenture RP stem items make any Investment / redeem Subordinated Obligations count as INVESTMENTS and PREPAYMENTS", () => {
    const doc = `ARTICLE 4 COVENANTS\n\nSection 4.01 Limitation on Indebtedness. The Company will not, and will not permit any Restricted Subsidiary to, incur any Indebtedness.\n\nSection 4.02 Limitation on Restricted Payments. The Company will not, and will not permit any Restricted Subsidiary to, directly or indirectly, to:\n(1) declare or pay any dividend on its Capital Stock;\n(2) purchase, redeem or otherwise acquire any Capital Stock of the Company;\n(3) purchase, repurchase, redeem, defease or otherwise acquire or retire for value any Subordinated Obligations prior to scheduled maturity; or\n(4) make any Restricted Investment,\nunless no Default has occurred.\n\nSection 4.03 Limitation on Liens. The Company will not create any Lien.\n`;
    expect(st(doc, "INVESTMENTS").sectionPaths).toContain("4.2");
    expect(st(doc, "PREPAYMENTS").sectionPaths).toContain("4.2");
  });
  it("designation of Unrestricted Subsidiaries and covenant suspension are not INVESTMENTS evidence", () => {
    expect(familyEvidence("The Borrower shall not designate any Restricted Subsidiary as an Unrestricted Subsidiary unless such designation would be permitted as an Investment and it shall not make Investments thereby.", "INVESTMENTS")).toEqual([]);
    expect(familyEvidence("During any Suspension Period the covenants shall be suspended and the Company shall not be required to comply with restrictions on Investments; it will not make investments in breach thereof.", "INVESTMENTS")).toEqual([]);
  });
  it("a supplement that replaces a clause is classified by the replacement text", () => {
    const doc = `FIRST SUPPLEMENTAL INDENTURE\n\nSection 1. Amendment. Section 4.10(c) of the Indenture is hereby deleted in its entirety and replaced with the following: "(c) Asset Sales. The Company will not, and will not permit any Restricted Subsidiary to, consummate any Asset Sale unless the Company receives fair market value."\n\nSection 2. Governing Law. This Supplemental Indenture is governed by New York law.\n`;
    expect(st(doc, "ASSET_SALES").status).not.toBe("ABSENT_VERIFIED");
    expect(st(doc, "ASSET_SALES").sectionPaths.length).toBeGreaterThan(0);
  });
  it("entity distribution mechanics (LLC statutory limits, record dates, in-kind) are not RESTRICTED_PAYMENTS", () => {
    expect(familyEvidence("Notwithstanding any provision to the contrary contained in this Agreement the Company shall not make any Distribution to Members if such Distribution would violate Section 18-607 of the Act or other applicable law.", "RESTRICTED_PAYMENTS")).toEqual([]);
    const doc = `ARTICLE 9 STOCK\n\nSection 9.2 Transfers. Shares may be transferred on the books.\n\nSection 9.3 Dividends, Distributions, and Other Rights. For the purpose of determining the stockholders entitled to receive payment of any dividend, the Board of Directors may fix a record date, which record date shall not precede the date on which the resolution is adopted.\n\nSection 9.4 Seal. The corporation shall not be required to have a seal.\n`;
    expect(st(doc, "RESTRICTED_PAYMENTS").status).toBe("ABSENT_VERIFIED");
  });
});
