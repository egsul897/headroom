import { describe, expect, it } from "vitest";
import { normName, preambleBorrowerNames, resolveBorrowerCik } from "@/lib/covenant-learning-factory/xbrl/cik-resolve";

const idx = new Map<string, Set<string>>([
  [normName("GIBRALTAR INDUSTRIES, INC."), new Set(["0000912562"])],
  [normName("CONMED CORP"), new Set(["0000816956"])],
  [normName("AUTONATION, INC."), new Set(["0000350698", "0001111111"])],
]);

describe("borrower → CIK", () => {
  it("reads the borrower from the preamble and matches EDGAR's conformed name exactly", () => {
    const t = `This CREDIT AGREEMENT is entered into as of February 2, 2026, among GIBRALTAR INDUSTRIES, INC., a Delaware corporation (the " Borrower ") , each lender`;
    expect(preambleBorrowerNames(t)).toEqual(["GIBRALTAR INDUSTRIES, INC."]);
    expect(resolveBorrowerCik(t, idx)).toEqual({ cik: "0000912562", name: "GIBRALTAR INDUSTRIES, INC." });
    expect(resolveBorrowerCik(`among CONMED Corporation, a Delaware corporation (the " Parent Borrower "), the lenders`, idx)).toMatchObject({ cik: "0000816956" });
  });
  it("several CIKs: only the one listed registrant resolves; otherwise NEEDS_INPUT", () => {
    const t = `is made by and among: AUTONATION, INC. , a Delaware corporation (the " Borrower "); and JPMorgan`;
    expect(resolveBorrowerCik(t, idx).cik).toBeNull();
    expect(resolveBorrowerCik(t, idx, new Set(["0000350698"])).cik).toBe("0000350698");
  });
  it("an unlisted subsidiary or two borrower names stays unresolved", () => {
    expect(resolveBorrowerCik(`among V2X LLC, a Delaware limited liability company (the "Borrower"), the lenders`, idx).cik).toBeNull();
    expect(resolveBorrowerCik(`among GIBRALTAR INDUSTRIES, INC., a Delaware corporation (the "Borrower"), and CONMED Corporation, a New York corporation (the "Company")`, idx).cik).toBeNull();
  });
});
