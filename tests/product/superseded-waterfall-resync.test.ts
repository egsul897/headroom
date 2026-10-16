/**
 * Rule 22 — superseding permissions on an amended doc must resync
 * the superseded doc's RP waterfall too.
 *
 * supersedeCounselPermissionsOnAmendedDocs ended prior permissions
 * on the superseded doc and resynced its capacity formulas — but
 * NOT its RP waterfall. The superseded doc's waterfall kept
 * referencing ended RP permissions, so RP transactions still drew
 * on superseded baskets. The waterfall sync is the symmetric
 * piece: it rebuilds from remaining operative permissions (or
 * clears when none remain, per rule 21).
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("superseded-doc waterfall resync", () => {
  it("supersede path resyncs both capacity formulas and RP waterfall on the superseded doc", () => {
    const source = readFileSync(
      path.join(process.cwd(), "lib/product/customer-intelligence/compile-accepted.ts"),
      "utf8",
    );
    const fn = source.slice(source.indexOf("async function supersedeCounselPermissionsOnAmendedDocs"));
    expect(fn).toContain("syncDocumentCapacityFormulas(companyId, doc.supersedesDocumentId)");
    expect(fn).toContain("syncDocumentRpWaterfall(companyId, doc.supersedesDocumentId)");
  });
});
