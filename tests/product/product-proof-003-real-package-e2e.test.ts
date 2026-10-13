/**
 * Locks Product Proof 003 invariants: authentic Matthews + CONMED multi-family,
 * three transactions refuse customer PERMITTED without inventing remaining,
 * domain matrix honesty (RP/Inv/AS independently GROSS-executable).
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
  // Always regenerate — capability proof must stay truthful to current SHA.
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
    domainStatus: Array<{ domain: string; status: string; sourcePackage?: string }>;
    transactions: Array<{
      id: string;
      verifiedSimulate: {
        executable: boolean;
        selectedPathId: string | null;
        verifiedRemainingUsd: null;
        pathEnumerationAuthority: string;
        capacityOutcome: string | null;
        simulationOutcome: string | null;
      };
      truthfulBlocker: string | null;
      draft: { kind: string };
      applicableCovenants: Array<{
        selectedPath: string | null;
        capacityConsumption: string | null;
        verifiedRemainingUsd?: null;
      }>;
    }>;
    package: {
      authenticity: string;
      authenticMultiFamilyAlternate: {
        independentlyExecutableFamilies: string[];
        units: Array<{ verifiedRemainingUsd: null; status: string }>;
      };
    };
    consolidationAbsorb: { doNotSelfMerge: boolean };
  };
}

describe("product-proof-003 real financing package E2E", () => {
  it("reproducible evaluation advances authentic RP/Inv/AS without false remaining or false PERMITTED", () => {
    const report = ensureArtifacts();

    expect(report.package.authenticity).toBe("AUTHENTIC_SOURCE_BACKED");
    expect(report.overallProductVerdict).toBe("PARTIAL_PRODUCT_CAPABILITY_PROVEN");
    expect(report.baselineSha).toBe("046161e78dc206c50ee951d71a18dfa4befd3206");
    expect(report.consolidationAbsorb.doNotSelfMerge).toBe(true);

    const byDomain = Object.fromEntries(
      report.domainStatus.map((d) => [d.domain, d.status]),
    );
    expect(byDomain.debt_incurrence).toBe("PARTIALLY_EXECUTABLE");
    expect(byDomain.liens).toBe("PARTIALLY_EXECUTABLE");
    expect(byDomain.investments).toBe("IMPLEMENTED_AND_INDEPENDENTLY_EXECUTABLE");
    expect(byDomain.restricted_payments).toBe("IMPLEMENTED_AND_INDEPENDENTLY_EXECUTABLE");
    expect(byDomain.asset_sales).toBe("IMPLEMENTED_AND_INDEPENDENTLY_EXECUTABLE");
    expect(byDomain.historical_utilization).toBe(
      "BLOCKED_BY_MISSING_REAL_EVIDENCE",
    );

    expect(report.independentlyExecutableFamilies.sort()).toEqual(
      ["asset_sales", "investments", "restricted_payments"].sort(),
    );
    expect(
      report.package.authenticMultiFamilyAlternate.independentlyExecutableFamilies.sort(),
    ).toEqual(["ASSET_SALES", "INVESTMENTS", "RESTRICTED_PAYMENTS"].sort());
    for (const u of report.package.authenticMultiFamilyAlternate.units) {
      expect(u.verifiedRemainingUsd).toBeNull();
      expect(u.status).toBe("VERIFIED_EXECUTABLE_GROSS");
    }

    expect(report.transactions).toHaveLength(3);
    expect(report.transactions.map((t) => t.id)).toEqual([
      "txn-debt-funded-acquisition",
      "txn-restricted-payment",
      "txn-asset-sale",
    ]);

    for (const txn of report.transactions) {
      // Never claim customer-affirmative PERMITTED without completeness.
      expect(txn.verifiedSimulate.executable).toBe(false);
      expect(txn.verifiedSimulate.verifiedRemainingUsd).toBeNull();
      expect(txn.truthfulBlocker).toBeTruthy();
    }

    const rp = report.transactions.find((t) => t.id === "txn-restricted-payment")!;
    const as = report.transactions.find((t) => t.id === "txn-asset-sale")!;
    expect(rp.draft.kind).toBe("RESTRICTED_PAYMENT");
    expect(as.draft.kind).toBe("ASSET_SALE");
    expect(rp.verifiedSimulate.pathEnumerationAuthority).toBe("CERTIFIED_4E");
    expect(as.verifiedSimulate.pathEnumerationAuthority).toBe("CERTIFIED_4E");
    expect(rp.verifiedSimulate.selectedPathId).toBeTruthy();
    expect(as.verifiedSimulate.selectedPathId).toBeTruthy();
    expect(rp.verifiedSimulate.capacityOutcome).toBeTruthy();
    expect(rp.verifiedSimulate.simulationOutcome).toBeTruthy();
  });
});
