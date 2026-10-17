/**
 * Comma-run basket lists: "except: (a) …, (b) …, (c) … in an unlimited amount so long as [ratio test], (d) … $50,000,000"
 * are split per clause, so a leverage-gated clause is never merged into an unlimited span and an unlimited clause never
 * takes a neighbour's figure. Amount limbs and inline references inside one clause stay together. Synthetic text only.
 */
import { describe, expect, it } from "vitest";
import { extractBasketClauses } from "@/lib/contract-model/covenant-computation/extract-baskets";
import { runAgreementPipeline } from "@/lib/covenant-learning-factory/pipeline/agreement-pipeline";

const ITEMS = [
  "(a) Indebtedness under the Loan Documents",
  "(b) Indebtedness existing on the Closing Date and listed on Schedule 7.1",
  "(c) other Indebtedness of the Borrower in an unlimited amount so long as, after giving pro forma effect thereto, the Total Leverage Ratio does not exceed 3.00 to 1.00",
  "(d) purchase money Indebtedness in an aggregate principal amount not to exceed $50,000,000 at any time outstanding",
  "(e) Indebtedness of Subsidiaries in an unlimited amount to the extent owed to the Borrower",
  "(f) other Indebtedness in an aggregate principal amount not to exceed $20,000,000",
];
const doc = (body: string) =>
  `CREDIT AGREEMENT\nARTICLE I DEFINITIONS\nSection 1.1 Defined Terms.\n"Indebtedness" means all obligations for borrowed money.\n"Total Leverage Ratio" means the ratio of Indebtedness to Consolidated EBITDA.\nARTICLE VII NEGATIVE COVENANTS\nSection 7.1 Indebtedness. The Borrower shall not create, incur, assume or suffer to exist any Indebtedness, except: ${body}.\nSection 7.2 Liens. The Borrower shall not create any Lien except Permitted Liens.\nARTICLE VIII EVENTS OF DEFAULT\nSection 8.1 Events of Default. Any of the following shall be an Event of Default.\n`;

describe("comma-run basket lists are split per clause", () => {
  it("each clause of a comma-run list is its own basket clause", () => {
    const clauses = extractBasketClauses({ documentId: "comma-run", text: doc(ITEMS.join(", ")) } as any);
    const gated = clauses.filter((c) => /Total Leverage Ratio does not exceed 3\.00/.test(c.operativeText));
    expect(gated.length).toBeGreaterThan(0);
    for (const c of gated) expect(c.operativeText).not.toMatch(/Loan Documents|purchase money|\$50,000,000/);
    const pm = clauses.find((c) => /purchase money/.test(c.operativeText))!;
    expect(pm.operativeText).not.toMatch(/unlimited|\$20,000,000/);
  });

  it("the leverage-gated clause is ratio-based, not merged into an unconditional unlimited span; no figure leaks", () => {
    const r = runAgreementPipeline({ sourceId: "comma-run-pipe", text: doc(ITEMS.join(", ")), issuerCik: null } as Parameters<typeof runAgreementPipeline>[0]);
    const spanOf = (b: (typeof r.computedBaskets)[number]) => b.citationExcerpt;
    for (const b of r.computedBaskets) {
      if (/Total Leverage Ratio does not exceed/.test(spanOf(b))) {
        expect(spanOf(b)).not.toMatch(/Loan Documents|Closing Date/);
        expect(b.category).not.toBe("UNLIMITED");
      }
      if (/unlimited amount/.test(spanOf(b))) expect(JSON.stringify({ ...b, citationExcerpt: undefined })).not.toMatch(/50000000|20000000/);
    }
    expect(r.computedBaskets.some((b) => /purchase money/.test(spanOf(b)) && JSON.stringify(b).includes("50000000"))).toBe(true);
    expect(r.computedBaskets.some((b) => /^\(f\) other Indebtedness/.test(spanOf(b).trim()) && JSON.stringify(b).includes("20000000"))).toBe(true);
  });

  it("'and'-joined last item is part of the run", () => {
    const body = `${ITEMS.slice(0, 5).join(", ")} and ${ITEMS[5]}`;
    const clauses = extractBasketClauses({ documentId: "comma-run-and", text: doc(body) } as any);
    expect(clauses.find((c) => /\$20,000,000/.test(c.operativeText))!.operativeText).not.toMatch(/unlimited/);
  });
});

describe("comma-led markers that are not a clause list stay inside their clause", () => {
  it("amount limbs '(x) $10,000,000, (y) 5% of Consolidated Total Assets and (z) …' are one clause", () => {
    const body = "(a) Indebtedness under the Loan Documents; (b) other Indebtedness in an aggregate principal amount not to exceed the greatest of (x) $10,000,000, (y) 5% of Consolidated Total Assets and (z) $12,000,000 less amounts outstanding under clause (a); and (c) Indebtedness owed to the Borrower";
    const clauses = extractBasketClauses({ documentId: "limbs", text: doc(body) } as any);
    const b = clauses.find((c) => /^\(b\)|other Indebtedness in an aggregate/.test(c.operativeText) && /\$10,000,000/.test(c.operativeText));
    expect(b).toBeTruthy();
    expect(b!.operativeText).toMatch(/5% of Consolidated Total Assets/);
  });

  it("a two-item comma pair inside a clause is not split (a run needs three items)", () => {
    const body = "(a) Indebtedness under the Loan Documents; (b) Indebtedness consisting of (i) obligations under performance bonds issued in the ordinary course, (ii) obligations under surety bonds issued in the ordinary course, in an aggregate amount not to exceed $7,000,000; and (c) Indebtedness owed to the Borrower";
    const clauses = extractBasketClauses({ documentId: "pair", text: doc(body) } as any);
    const b = clauses.find((c) => /\$7,000,000/.test(c.operativeText))!;
    expect(b.operativeText).toMatch(/performance bonds/);
    expect(b.operativeText).toMatch(/surety bonds/);
  });

  it("a parenthetical cross-reference '(other than (c), (d) and (e) hereof)' is never a clause start", () => {
    const body = "(a) Indebtedness under the Loan Documents; (b) Indebtedness of Subsidiaries (other than Indebtedness permitted under clauses (c), (d) and (e) hereof) not to exceed $9,000,000; (c) Indebtedness owed to the Borrower; (d) Guarantees of Indebtedness otherwise permitted hereunder; and (e) Indebtedness under hedging agreements not for speculation";
    const clauses = extractBasketClauses({ documentId: "xref", text: doc(body) } as any);
    const b = clauses.find((c) => /\$9,000,000/.test(c.operativeText))!;
    expect(b.operativeText).toMatch(/Indebtedness of Subsidiaries/);
  });
});
