/**
 * MATW-SECURED-01 — authentic operative debt + lien evidence package.
 * Does not claim CERTIFIED_4E, verified remaining, or PERMITTED.
 */
import { describe, expect, it } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { evaluateMatwSecured01Package } from "@/lib/product/matw-secured-01";
import { MATTHEWS_CREDIT_AGREEMENT_SOURCE } from "@/lib/product/real-dashboard-vertical-slice/source-excerpts-matthews";

const STARTING_MAIN_SHA = "14c805c6412ca36bfe753112abac78fa6c3736fa";

describe("MATW-SECURED-01 operative package", () => {
  it("returns BLOCKED_BY_SOURCE_EVIDENCE and refuses permission claims", () => {
    const pkg = evaluateMatwSecured01Package({ startingMainSha: STARTING_MAIN_SHA });
    expect(pkg.startingMainSha).toBe(STARTING_MAIN_SHA);
    expect(pkg.readinessVerdict).toBe("BLOCKED_BY_SOURCE_EVIDENCE");
    expect(pkg.claimsRefused).toContain("CERTIFIED_4E");
    expect(pkg.claimsRefused).toContain("verified remaining");
    expect(pkg.claimsRefused).toContain("transaction PERMITTED");
    expect(pkg.nextStageRecommendation.proposePhase3Compile).toBe(false);
    expect(pkg.financialUtilizationDependencies.verifiedRemainingClaimable).toBe(false);
  });

  it("records SOURCE_BACKED Sixth Amendment narrowing and package excerpt fidelity FAIL", () => {
    const pkg = evaluateMatwSecured01Package({ startingMainSha: STARTING_MAIN_SHA });
    expect(pkg.amendmentPrecedence.sixthAmendment.changeClass).toBe("PERMISSION_NARROWING");
    expect(pkg.amendmentPrecedence.sixthAmendment.authorityStatus).toBe("SOURCE_BACKED");
    expect(pkg.amendmentPrecedence.sixthAmendment.afterText).toMatch(/2024 Note Offering/);
    expect(pkg.amendmentPrecedence.sixthAmendment.beforeText).toMatch(/Permitted Amount/);
    expect(pkg.amendmentPrecedence.packageCaExcerptFidelity).toBe("FAIL");
    expect(pkg.amendmentPrecedence.packageCaExcerptDefects.length).toBeGreaterThan(0);
    // Package excerpt must not be treated as verbatim Am6
    expect(MATTHEWS_CREDIT_AGREEMENT_SOURCE.text).not.toContain("Prior Security Interest");
  });

  it("builds debt/lien candidate path matrix — five leaves are not five secured alternatives", () => {
    const pkg = evaluateMatwSecured01Package({ startingMainSha: STARTING_MAIN_SHA });
    expect(pkg.candidatePathMatrix).toHaveLength(5);
    const byCode = Object.fromEntries(pkg.candidatePathMatrix.map((r) => [r.leafCode, r]));
    expect(byCode.ind_permitted_debt_1a_flat?.validForNew50mSecured).toBe(
      "DEBT_ONLY_UNRESOLVED_LIEN",
    );
    expect(byCode.ind_ratio_debt_fccr?.validForNew50mSecured).toBe("NO");
    expect(byCode.ind_permitted_debt_1b_ratio_secured?.companionStatus).toBe(
      "FALSE_OR_OVERSTATED_LIEN_LINK",
    );
    expect(byCode.ca_lien_601j_2024notes?.pathRole).toBe("LIEN_COMPANION");
    expect(byCode.ca_lien_601j_2024notes?.validForNew50mSecured).toBe("NO");
  });

  it("runs independent adversarial checks with at least one FAIL on debt-without-lien", () => {
    const pkg = evaluateMatwSecured01Package({ startingMainSha: STARTING_MAIN_SHA });
    expect(pkg.independentSemanticVerification.checks).toHaveLength(10);
    const debtLien = pkg.independentSemanticVerification.checks.find(
      (c) => c.id === "DEBT_WITHOUT_LIEN",
    );
    expect(debtLien?.result).toBe("FAIL");
    const fails = pkg.independentSemanticVerification.checks.filter((c) => c.result === "FAIL");
    expect(fails.length).toBeGreaterThanOrEqual(5);
  });

  it("requires chain research artifacts present (SOURCE_BACKED before/after)", () => {
    expect(
      existsSync(join(process.cwd(), "docs/amendment-chain-research/before-after/matw-am6-lien-601j.json")),
    ).toBe(true);
    const ba = JSON.parse(
      readFileSync(
        join(process.cwd(), "docs/amendment-chain-research/before-after/matw-am6-lien-601j.json"),
        "utf8",
      ),
    );
    const narrowing = ba.comparisons.find(
      (c: { changeClass: string }) => c.changeClass === "PERMISSION_NARROWING",
    );
    expect(narrowing.authority.status).toBe("SOURCE_BACKED");
  });

  it("documents that full EDGAR fixtures are not in git", () => {
    const pkg = evaluateMatwSecured01Package({ startingMainSha: STARTING_MAIN_SHA });
    const indenture = pkg.documentManifest.find(
      (d) => d.docId === "matw-2027-second-lien-notes-indenture",
    );
    const am6 = pkg.documentManifest.find((d) => d.docId === "matw-am6");
    expect(indenture?.localFixturePath).toBeNull();
    expect(am6?.localFixturePath).toBeNull();
    expect(
      pkg.missingInputsAndLimitations.some((m) => m.code === "FULL_EDGAR_EXHIBITS_NOT_IN_GIT"),
    ).toBe(true);
  });
});
