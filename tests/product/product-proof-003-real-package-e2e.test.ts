/**
 * Locks Product Proof 003 invariants: authentic Matthews package on main,
 * three transactions refuse without invented VEP/utilization, domain matrix honesty.
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
  const evaluation = path.join(ARTIFACTS, "00-evaluation.json");
  if (!fs.existsSync(evaluation)) {
    execSync("npx tsx scripts/product-proof/run-003-real-package-e2e.ts", {
      cwd: ROOT,
      stdio: "pipe",
      env: process.env,
    });
  }
  return JSON.parse(fs.readFileSync(evaluation, "utf8")) as {
    overallProductVerdict: string;
    domainStatus: Array<{ domain: string; status: string }>;
    transactions: Array<{
      id: string;
      verifiedSimulate: { executable: boolean; selectedPathId: string | null };
      truthfulBlocker: string | null;
      applicableCovenants: Array<{
        selectedPath: string | null;
        capacityConsumption: string | null;
      }>;
    }>;
    package: { authenticity: string };
  };
}

describe("product-proof-003 real financing package E2E", () => {
  it("reproducible evaluation refuses all three transactions without false affirmatives", () => {
    const report = ensureArtifacts();

    expect(report.package.authenticity).toBe("AUTHENTIC_SOURCE_BACKED");
    expect(report.overallProductVerdict).toBe("PARTIAL_PRODUCT_CAPABILITY_PROVEN");

    const byDomain = Object.fromEntries(
      report.domainStatus.map((d) => [d.domain, d.status]),
    );
    expect(byDomain.debt_incurrence).toBe("PARTIALLY_EXECUTABLE");
    expect(byDomain.liens).toBe("PARTIALLY_EXECUTABLE");
    expect(byDomain.investments).toBe("NOT_IMPLEMENTED");
    expect(byDomain.restricted_payments).toBe("NOT_IMPLEMENTED");
    expect(byDomain.asset_sales).toBe("NOT_IMPLEMENTED");
    expect(byDomain.historical_utilization).toBe(
      "BLOCKED_BY_MISSING_REAL_EVIDENCE",
    );
    expect(
      report.domainStatus.every(
        (d) => d.status !== "IMPLEMENTED_AND_INDEPENDENTLY_EXECUTABLE",
      ),
    ).toBe(true);

    expect(report.transactions).toHaveLength(3);
    for (const txn of report.transactions) {
      expect(txn.verifiedSimulate.executable).toBe(false);
      expect(txn.verifiedSimulate.selectedPathId).toBeNull();
      expect(txn.truthfulBlocker).toBeTruthy();
      for (const c of txn.applicableCovenants) {
        expect(c.selectedPath).toBeNull();
        expect(c.capacityConsumption).toBeNull();
      }
    }

    expect(report.transactions.map((t) => t.id)).toEqual([
      "txn-debt-funded-acquisition",
      "txn-restricted-payment",
      "txn-asset-sale",
    ]);
  });

  it("labels Coherent cross-domain track as seeded GROSS-only without verified remaining", () => {
    const seededPath = path.join(ARTIFACTS, "04-seeded-cross-domain-track.json");
    if (!fs.existsSync(seededPath)) {
      execSync("npx tsx scripts/product-proof/run-003-real-package-e2e.ts", {
        cwd: ROOT,
        stdio: "pipe",
        env: process.env,
      });
    }
    const seeded = JSON.parse(fs.readFileSync(seededPath, "utf8")) as {
      anyVerifiedRemainingClaimed: boolean;
      coherentScenarios: Array<{
        overallStatus: string;
        anyVerifiedRemainingClaimed: boolean;
        utilizationAttributed: boolean;
      }>;
    };
    expect(seeded.anyVerifiedRemainingClaimed).toBe(false);
    expect(seeded.coherentScenarios).toHaveLength(3);
    for (const s of seeded.coherentScenarios) {
      expect(s.utilizationAttributed).toBe(false);
      expect(s.anyVerifiedRemainingClaimed).toBe(false);
    }
  });
});
