/**
 * Stage D probe regression — lien-only pkg-i VEP must not claim SECURED_DEBT CERTIFIED_4E.
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { enumerateCertifiedPaths } from "../../lib/product/north-star-workflow/verified-path-enumeration";
import type { VerifiedExecutionPackage } from "../../lib/contract-model/verified-execution";

const ARTIFACTS = "docs/product/customer-workflow/stage-d-pkgi-secured-lien";

describe("Stage D pkg-i secured-lien probe", () => {
  it("persisted probe reports INCOMPLETE_PACKAGE for SECURED_DEBT without debt primary", () => {
    const enumFile = JSON.parse(fs.readFileSync(path.join(ARTIFACTS, "02-phase4e-enumeration.json"), "utf8")) as {
      results: Array<{
        transactionKind: string;
        authority: string;
        incompleteReasons: string[];
        paths: unknown[];
      }>;
    };
    const secured = enumFile.results.find((r) => r.transactionKind === "SECURED_DEBT")!;
    expect(secured.authority).toBe("INCOMPLETE_PACKAGE");
    expect(secured.incompleteReasons).toContain("NO_MATCHING_PRIMARY_RULES_FOR_SECURED_DEBT");
    expect(secured.paths).toEqual([]);

    const report = fs.readFileSync(path.join(ARTIFACTS, "00-probe-report.md"), "utf8");
    expect(report).toContain("BLOCKED");
    expect(report).toContain("INCOMPLETE_PACKAGE");
  });

  it("live re-enumeration over the DERIVED lien-only VEP stays fail-closed", () => {
    const pkg = JSON.parse(
      fs.readFileSync(path.join(ARTIFACTS, "verified-execution-package.json"), "utf8"),
    ) as VerifiedExecutionPackage;
    expect(pkg.rules.every((r) => r.action === "CREATE_LIEN" || r.action === "GRANT_COLLATERAL")).toBe(true);
    const secured = enumerateCertifiedPaths({
      verifiedPackage: pkg,
      transactionKind: "SECURED_DEBT",
      secured: true,
    });
    expect(secured.authority).toBe("INCOMPLETE_PACKAGE");
    expect(secured.paths).toEqual([]);
  });
});
