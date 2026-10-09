import { describe, expect, it } from "vitest";
import {
  exhibitsFromPrimaryDocument,
  parsePrimaryExhibitIndex,
} from "../../lib/edgar-historical-backfill/primary-exhibit-index";

const SAMPLE = `
<html><body>
Item 15. Exhibits and Financial Statement Schedules
EXHIBIT INDEX
10.1 - Amended and Restated Guarantee and Collateral Agreement. Incorporated by reference to Exhibit 10.2 of the Company's Current Report on Form 8-K filed with the Securities and Exchange Commission on June 16, 2025 (accession 0001174947-25-000941).
10.2 - Eighth Amended and Restated Credit Agreement. Incorporated by reference to Exhibit 10.1 of the Company's Current Report on Form 8-K filed with the Securities and Exchange Commission on June 16, 2025 (accession 0001174947-25-000941).
10.3 - First Omnibus Amendment. Incorporated by reference to Exhibit 10.1 of the Company's Current Report on Form 8-K filed February 2, 2026.
3.1 - By-laws of the Company. Incorporated by reference to Exhibit 3.2 of Form 8-K filed May 22, 2020.
SIGNATURES
</body></html>
`;

describe("primary exhibit index (IBR source)", () => {
  it("parses exhibit numbers, descriptions, and IBR prose", () => {
    const rows = parsePrimaryExhibitIndex(SAMPLE);
    expect(rows.some((r) => r.exhibitType === "EX-10.2" && /Eighth Amended and Restated Credit Agreement/i.test(r.description))).toBe(true);
    expect(rows.find((r) => r.exhibitType === "EX-10.2")?.ibrText).toMatch(/incorporated by reference/i);
  });

  it("emits IBR exhibit refs with accession resolution when present", () => {
    const exhibits = exhibitsFromPrimaryDocument(
      { cik: "0000816956", accessionNumber: "0000816956-26-000009", form: "10-K", filingDate: "2026-02-17" },
      SAMPLE,
    );
    expect(exhibits.some((e) => e.documentKind === "CREDIT_AGREEMENT" || e.documentKind === "RESTATEMENT")).toBe(true);
    const ca = exhibits.find((e) => /Credit Agreement/i.test(e.description));
    expect(ca?.isIncorporatedByReference).toBe(true);
    expect(ca?.ibr?.resolvedAccessionNumber).toBe("0001174947-25-000941");
    // Bylaws should be filtered as non-debt false positive
    expect(exhibits.every((e) => !/by-?laws/i.test(e.description))).toBe(true);
  });
});
