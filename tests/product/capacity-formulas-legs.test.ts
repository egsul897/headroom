/**
 * Rule 19 — secured capacity requires BOTH legs (debt ∩ lien).
 *
 * syncDocumentCapacityFormulas minted secured = SUM(debt) when only
 * debt baskets were compiled (and SUM(lien) when only lien
 * baskets were), with a label noting the other regime was "not yet
 * counsel-compiled". But the engine treats any present formula as
 * authoritative and never reads the label — so the number flowed
 * into capacity as if the missing leg were unconstrained,
 * overstating secured capacity. A missing leg is unknown, not
 * unlimited. Now no secured formula is minted until both legs
 * exist. Unsecured = SUM(debt) is unaffected (unsecured debt
 * needs only the debt leg).
 */
import { describe, expect, it } from "vitest";
import { buildCapacityFormulas } from "../../lib/product/customer-intelligence/capacity-formulas";

describe("capacity formulas both-legs rule", () => {
  it("mints secured = MIN(debt, lien) when both legs exist", () => {
    const f = buildCapacityFormulas(["counsel:d1"], ["counsel:l1"]);
    expect(f.secured?.op).toBe("MIN");
    expect(f.unsecured?.op).toBe("SUM");
  });

  it("mints NO secured formula when only debt baskets exist", () => {
    const f = buildCapacityFormulas(["counsel:d1", "counsel:d2"], []);
    expect(f.secured).toBeUndefined();
    expect(f.unsecured?.op).toBe("SUM");
    expect(f.unsecured?.items).toHaveLength(2);
  });

  it("mints NO secured formula when only lien baskets exist", () => {
    const f = buildCapacityFormulas([], ["counsel:l1"]);
    expect(f.secured).toBeUndefined();
    expect(f.unsecured).toBeUndefined();
  });

  it("mints nothing when no baskets exist", () => {
    expect(buildCapacityFormulas([], [])).toEqual({});
  });
});
