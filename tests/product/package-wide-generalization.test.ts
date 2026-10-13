/**
 * Generalization guards — same evaluator across packages; no company-id engine branches;
 * unseen fixture inventories must not invent EXECUTABLE capacity.
 */

import { describe, expect, it } from "vitest";
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import {
  evaluateCrossDomainTransaction,
  covenantDomainCoverage,
  CROSS_DOMAIN_EVALUATION_VERSION,
} from "@/lib/product/cross-domain-transaction";
import { executePackageTransaction } from "@/lib/product/package-transaction-execution";
import {
  coherentDebtFundedAcquisition,
  coherentPackageData,
  evaluateCoherentScenario,
  evaluateMatthewsScenario,
  matthewsMinimalPackageData,
  matthewsRefinancing,
} from "@/lib/product/cross-domain-scenarios";
import {
  COHERENT_EBITDA_EVIDENCE,
  MATTHEWS_EBITDA_EVIDENCE,
  resolveContractualEbitdaDerivation,
} from "@/lib/financial-certificate-engine";

const UNSEEN_ROOT = join(process.cwd(), "tests/fixtures/unseen-packages");

const SOURCE_PACKAGES = [
  "chwy-2026-credit-agreement",
  "conmed-2025-credit-facility",
  "dsgr-2022-2025-credit-facility",
  "fwrg-2021-credit-agreement",
  "gibraltar-2026-credit-agreement",
  "lsb-2023-abl-credit-agreement",
  "an-2020-2026-credit-facility",
] as const;

describe("generalization — no company-specific engine branches", () => {
  it("Coherent and Matthews share evaluator version and owner path", () => {
    const c = evaluateCoherentScenario(coherentDebtFundedAcquisition(100));
    const m = evaluateMatthewsScenario(matthewsRefinancing(25));
    expect(c.version).toBe(CROSS_DOMAIN_EVALUATION_VERSION);
    expect(m.version).toBe(CROSS_DOMAIN_EVALUATION_VERSION);
    expect(c.version).toBe(m.version);
  });

  it("swapping companyId labels does not change capacity math (same data)", () => {
    const base = coherentPackageData();
    const a = evaluateCrossDomainTransaction({
      data: { ...base, companyId: "label-a" },
      transaction: coherentDebtFundedAcquisition(80),
      ebitdaDerivation: resolveContractualEbitdaDerivation(COHERENT_EBITDA_EVIDENCE),
    });
    const b = evaluateCrossDomainTransaction({
      data: { ...base, companyId: "label-b" },
      transaction: coherentDebtFundedAcquisition(80),
      ebitdaDerivation: resolveContractualEbitdaDerivation(COHERENT_EBITDA_EVIDENCE),
    });
    expect(a.debtSimulation?.overallCapacity).toBe(b.debtSimulation?.overallCapacity);
    expect(a.overallStatus).toBe(b.overallStatus);
    expect(a.contractualComputation.contractualEbitda).toBe(
      b.contractualComputation.contractualEbitda,
    );
  });

  it("hardcoded Coherent/Matthews identifiers are absent from evaluator source", () => {
    const src = readFileSync(
      join(process.cwd(), "lib/product/cross-domain-transaction.ts"),
      "utf8",
    );
    expect(src).not.toMatch(/companyId\s*===\s*["']coherent["']/i);
    expect(src).not.toMatch(/companyId\s*===\s*["']matthews["']/i);
    expect(src).not.toMatch(/if\s*\(\s*companyId/);
  });
});

describe("generalization — unseen packages fail closed without invented capacity", () => {
  it("source package fixtures exist on disk for generalization corpus", () => {
    for (const pkg of SOURCE_PACKAGES) {
      const dir = join(UNSEEN_ROOT, pkg);
      expect(existsSync(dir), `missing unseen package dir ${pkg}`).toBe(true);
    }
  });

  it("unseen packages are not silently classified EXECUTABLE in coverage inventory", () => {
    const rows = covenantDomainCoverage();
    expect(rows.every((r) => r.support !== "EXECUTABLE")).toBe(true);
  });

  it("empty / unknown package data refuses clear permission", () => {
    const empty = {
      companyId: "unseen-empty-package",
      documents: [],
      provisions: [],
      financials: {
        ebitda: Number.NaN,
        cash: Number.NaN,
        totalDebt: Number.NaN,
        securedDebt: Number.NaN,
        interestExpense: Number.NaN,
        cumulativeNetIncome: Number.NaN,
        equityProceedsSinceIssue: Number.NaN,
        assumedNewDebtRatePct: Number.NaN,
      },
      ledger: [],
    };
    const result = executePackageTransaction({
      packageIdentity: {
        companyId: "unseen-empty-package",
        evaluationDate: "2026-01-15",
      },
      data: empty,
      transaction: {
        kind: "DEBT_FUNDED_ACQUISITION",
        label: "Unseen empty package acquisition probe",
        amountMillions: 50,
        secured: true,
        assumptions: {
          statements: ["Probe only — no invented capacity."],
          entityScope: ["BORROWER"],
          evaluationDate: "2026-01-15",
        },
      },
    });
    expect(result.packagePermitted).toBe(false);
    expect(result.overallStatus).not.toBe("clear");
    for (const d of result.evaluation.domains) {
      expect(d.verifiedRemainingMillions).toBeNull();
    }
  });

  it("Matthews shape is not Coherent — different EBITDA derivation and ratio outcome", () => {
    const coherent = evaluateCoherentScenario(coherentDebtFundedAcquisition(50));
    const matthews = evaluateMatthewsScenario(matthewsRefinancing(50));
    expect(coherent.contractualComputation.ebitdaDerivation?.kind).not.toBe(
      matthews.contractualComputation.ebitdaDerivation?.kind,
    );
    expect(coherent.contractualComputation.contractualEbitda).toBe(1700);
    expect(matthews.contractualComputation.contractualEbitda).toBeCloseTo(
      MATTHEWS_EBITDA_EVIDENCE.bindingContractualEbitdaMillions,
      3,
    );
    // Matthews above threshold → blocked; Coherent seed typically not blocked at $50M.
    expect(matthews.overallStatus).toBe("blocked");
    expect(matthewsMinimalPackageData().companyId).not.toBe(coherentPackageData().companyId);
  });

  it("lists additional unseen package directories without treating them as executable product data", () => {
    const entries = readdirSync(UNSEEN_ROOT, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name);
    expect(entries.length).toBeGreaterThan(SOURCE_PACKAGES.length);
    // Sanity: compiler run caches exist but are not wired into evaluateCrossDomainTransaction.
    const txnSrc = readFileSync(
      join(process.cwd(), "lib/product/cross-domain-transaction.ts"),
      "utf8",
    );
    expect(txnSrc).not.toMatch(/unseen-packages/);
    expect(txnSrc).not.toMatch(/chwy-2026|conmed-2025|gibraltar-2026/);
  });
});
