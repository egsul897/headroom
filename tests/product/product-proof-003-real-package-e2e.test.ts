/**
 * Locks Product Proof 003 certification-integrity invariants after remediation.
 */
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";

const ROOT = process.cwd();
const ARTIFACTS = path.join(
  ROOT,
  "docs/product-proof/003-real-financing-package-e2e/artifacts",
);

function ensureArtifacts() {
  execSync("npx tsx scripts/product-proof/run-003-real-package-e2e.ts", {
    cwd: ROOT,
    stdio: "pipe",
    env: process.env,
  });
  const evaluation = path.join(ARTIFACTS, "00-evaluation.json");
  return JSON.parse(fs.readFileSync(evaluation, "utf8")) as {
    overallProductVerdict: string;
    baselineSha: string;
    independentlyExecutableFamilies: string[];
    fidelityPassHypotheticalGrossFamilies?: string[];
    certificationIntegrity: {
      fabricatedVerificationArtifacts: boolean;
      phase3EvidencePresent: boolean;
      certified4eClaimed: boolean;
      hypotheticalCtaIsApprovedNs4: boolean;
    };
    domainStatus: Array<{ domain: string; status: string }>;
    transactions: Array<{
      id: string;
      verifiedSimulate: {
        executable: boolean;
        selectedPathId: string | null;
        verifiedRemainingUsd: null;
        pathEnumerationAuthority: string;
        simulationOutcome: string | null;
      };
      truthfulBlocker: string | null;
      draft: { kind: string };
    }>;
    package: {
      authenticity: string;
      authenticMultiFamilyAlternate: {
        independentlyExecutableFamilies: string[];
        units: Array<{
          verifiedRemainingUsd: null;
          capability: { rollup: string; semanticCertification: string };
        }>;
      };
    };
    consolidationAbsorb: { doNotSelfMerge: boolean };
  };
}

describe("product-proof-003 real financing package E2E", () => {
  it("certification-integrity: hypo-gross partial; no false CERTIFIED_4E / independently executable", () => {
    const report = ensureArtifacts();

    expect(report.package.authenticity).toBe("AUTHENTIC_SOURCE_BACKED");
    expect(report.overallProductVerdict).toBe("PARTIAL_PRODUCT_CAPABILITY_PROVEN");
    expect(report.baselineSha).toBe("046161e78dc206c50ee951d71a18dfa4befd3206");
    expect(report.consolidationAbsorb.doNotSelfMerge).toBe(true);
    expect(report.certificationIntegrity.fabricatedVerificationArtifacts).toBe(false);
    expect(report.certificationIntegrity.phase3EvidencePresent).toBe(false);
    expect(report.certificationIntegrity.certified4eClaimed).toBe(false);
    expect(report.certificationIntegrity.hypotheticalCtaIsApprovedNs4).toBe(false);

    const byDomain = Object.fromEntries(
      report.domainStatus.map((d) => [d.domain, d.status]),
    );
    expect(byDomain.debt_incurrence).toBe("PARTIALLY_EXECUTABLE");
    expect(byDomain.liens).toBe("PARTIALLY_EXECUTABLE");
    expect(byDomain.investments).toBe("PARTIALLY_EXECUTABLE");
    expect(byDomain.restricted_payments).toBe("PARTIALLY_EXECUTABLE");
    expect(byDomain.asset_sales).toBe("PARTIALLY_EXECUTABLE");
    expect(byDomain.historical_utilization).toBe("BLOCKED_BY_MISSING_REAL_EVIDENCE");

    expect(report.independentlyExecutableFamilies).toEqual([]);
    expect((report.fidelityPassHypotheticalGrossFamilies ?? []).sort()).toEqual(
      ["ASSET_SALES", "INVESTMENTS", "RESTRICTED_PAYMENTS"].sort(),
    );
    expect(report.package.authenticMultiFamilyAlternate.independentlyExecutableFamilies).toEqual(
      [],
    );
    for (const u of report.package.authenticMultiFamilyAlternate.units) {
      expect(u.verifiedRemainingUsd).toBeNull();
      expect(u.capability.rollup).toBe("FIDELITY_PASS_HYPOTHETICAL_GROSS_NOT_CERTIFIED");
      expect(u.capability.semanticCertification).toBe("ABSENT_NO_PHASE3_EVIDENCE");
    }

    expect(report.transactions).toHaveLength(3);
    for (const txn of report.transactions) {
      expect(txn.verifiedSimulate.executable).toBe(false);
      expect(txn.verifiedSimulate.verifiedRemainingUsd).toBeNull();
      expect(txn.truthfulBlocker).toBeTruthy();
    }

    const rp = report.transactions.find((t) => t.id === "txn-restricted-payment")!;
    const as = report.transactions.find((t) => t.id === "txn-asset-sale")!;
    expect(rp.draft.kind).toBe("RESTRICTED_PAYMENT");
    expect(as.draft.kind).toBe("ASSET_SALE");
    expect(rp.verifiedSimulate.pathEnumerationAuthority).toBe("NOT_CERTIFIED_4E");
    expect(as.verifiedSimulate.pathEnumerationAuthority).toBe("NOT_CERTIFIED_4E");
    expect(rp.verifiedSimulate.selectedPathId).toBeNull();
    expect(as.verifiedSimulate.selectedPathId).toBeNull();
    expect(rp.verifiedSimulate.simulationOutcome).toBeNull();
    expect(as.verifiedSimulate.simulationOutcome).toBeNull();
  });
});
