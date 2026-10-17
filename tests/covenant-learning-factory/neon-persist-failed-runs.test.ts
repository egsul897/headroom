/**
 * Reproduces live #356 failure mode:
 * 1) DATABASE_URL set must not trip ContractRule guard during factory compile
 * 2) FAILED runs + error ledger must still persist to learning_* via HTTPS writer
 */

import { describe, expect, it, vi } from "vitest";
import { compileFrozenDebtPackage } from "../../lib/contract-model/analysis/offline-package-compile";
import { processLearningPackage } from "../../lib/covenant-learning-factory/process-package";
import { persistPackageManifestToNeon } from "../../lib/covenant-learning-factory/store/neon-store";
import {
  assertLearningFactoryCannotWriteProductionAuthority,
} from "../../lib/covenant-learning-factory/promotion-guards";
import { LearningFactoryLegalSafetyError } from "../../lib/covenant-learning-factory/promotion-guards";
import type { NeonHttpsExecutor } from "../../lib/covenant-learning-factory/store/neon-transport";
import type { PackageAuditManifest } from "../../lib/covenant-learning-factory/types";
import {
  defaultLearningStorePaths,
  LearningFileStore,
} from "../../lib/covenant-learning-factory/store/file-store";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

function mockHttpsExecutor() {
  const statements: { sql: string; params?: unknown[] }[] = [];
  const tables = {
    learning_packages: 0,
    learning_runs: 0,
    learning_artifacts: 0,
    learning_error_ledger_entries: 0,
    learning_evaluation_outcomes: 0,
    learning_improvement_proposals: 0,
  };
  const executor: NeonHttpsExecutor = {
    async execute(sql, params) {
      statements.push({ sql, params });
      const u = sql.toUpperCase();
      if (u.includes("INSERT INTO LEARNING_PACKAGES") || u.includes('INSERT INTO learning_packages')) {
        tables.learning_packages += 1;
      }
      if (u.includes("INSERT INTO LEARNING_RUNS") || u.includes('INSERT INTO learning_runs')) {
        tables.learning_runs += 1;
      }
      if (u.includes("INSERT INTO LEARNING_ARTIFACTS") || u.includes('INSERT INTO learning_artifacts')) {
        tables.learning_artifacts += 1;
      }
      if (
        u.includes("INSERT INTO LEARNING_ERROR_LEDGER_ENTRIES") ||
        u.includes('INSERT INTO learning_error_ledger_entries')
      ) {
        tables.learning_error_ledger_entries += 1;
      }
      if (
        u.includes("INSERT INTO LEARNING_EVALUATION_OUTCOMES") ||
        u.includes('INSERT INTO learning_evaluation_outcomes')
      ) {
        tables.learning_evaluation_outcomes += 1;
      }
      if (
        u.includes("INSERT INTO LEARNING_IMPROVEMENT_PROPOSALS") ||
        u.includes('INSERT INTO learning_improvement_proposals')
      ) {
        tables.learning_improvement_proposals += 1;
      }
      return [];
    },
  };
  return { executor, statements, tables };
}

function failedManifest(): PackageAuditManifest {
  const now = new Date().toISOString();
  return {
    schemaVersion: "covenant-learning-factory.package-audit.v1",
    packageKey: "chwy-2026-credit-agreement",
    companyId: "co_chwy_test",
    issuerCik: "0001766502",
    issuerTicker: "CHWY",
    cohort: "TRAIN_DEV",
    runId: "clr_chwy_failed_test",
    codeSha: "testsha",
    factoryVersion: "covenant-learning-factory.v1",
    compilerVersion: "offline-package-compile.v1",
    startedAt: now,
    finishedAt: now,
    status: "FAILED",
    documentHashes: [],
    stages: [
      {
        stage: "COMPILE",
        status: "FAILED",
        startedAt: now,
        finishedAt: now,
        diagnostics: "synthetic failure for neon persist",
      },
    ],
    artifacts: [],
    errors: [
      {
        errorId: "err_failed_1",
        packageKey: "chwy-2026-credit-agreement",
        runId: "clr_chwy_failed_test",
        class: "UNKNOWN",
        severity: "HIGH",
        message: "synthetic compile failure",
        stage: "COMPILE",
        createdAt: now,
        correctiveHistory: [],
      },
    ],
    improvementProposals: [
      {
        proposalId: "prop_1",
        packageKey: "chwy-2026-credit-agreement",
        runId: "clr_chwy_failed_test",
        lever: "COMPILATION",
        summary: "bounded proposal",
        bounded: true,
        autoApply: false,
        evidenceRefs: ["err_failed_1"],
        createdAt: now,
        state: "PROPOSED",
      },
    ],
    costs: [],
    claims: {
      trained: false,
      certified: false,
      generalized: false,
      productionReady: false,
      autoPromotedLegalAuthority: false,
    },
  };
}

describe("neon persist + compileOnly with DATABASE_URL (mocked HTTPS)", () => {
  it("keeps production-authority guard armed for ContractRule", () => {
    expect(() => assertLearningFactoryCannotWriteProductionAuthority("ContractRule")).toThrow(
      LearningFactoryLegalSafetyError,
    );
  });

  it("persists FAILED runs, errors, and proposals without writing ContractRule", async () => {
    const prev = process.env.DATABASE_URL;
    const prevTransport = process.env.NEON_TRANSPORT;
    process.env.DATABASE_URL = "postgresql://u:p@ep-test.neon.tech/neondb?sslmode=require";
    process.env.NEON_TRANSPORT = "https";
    try {
      const { executor, statements, tables } = mockHttpsExecutor();
      const result = await persistPackageManifestToNeon(failedManifest(), {
        executor,
        skipProbe: true,
      });
      expect(result.ok).toBe(true);
      expect(result.detail).not.toMatch(/ContractRule/i);
      expect(result.insertedErrors).toBe(1);
      expect(result.insertedProposals).toBe(1);
      expect(tables.learning_packages).toBe(1);
      expect(tables.learning_runs).toBe(1);
      expect(tables.learning_error_ledger_entries).toBe(1);
      expect(tables.learning_improvement_proposals).toBe(1);
      expect(statements.some((s) => /ContractRule/i.test(s.sql))).toBe(false);
      expect(statements.some((s) => /\b(DROP|TRUNCATE|DELETE)\b/i.test(s.sql))).toBe(false);
      const runInsert = statements.find((s) => /learning_runs/i.test(s.sql) && /INSERT/i.test(s.sql));
      expect(runInsert?.params).toContain("FAILED");
    } finally {
      if (prev === undefined) delete process.env.DATABASE_URL;
      else process.env.DATABASE_URL = prev;
      if (prevTransport === undefined) delete process.env.NEON_TRANSPORT;
      else process.env.NEON_TRANSPORT = prevTransport;
    }
  });

  it("factory compileOnly with DATABASE_URL does not trip ContractRule guard", async () => {
    const prev = process.env.DATABASE_URL;
    process.env.DATABASE_URL = "postgresql://u:p@ep-test.neon.tech/neondb?sslmode=require";
    try {
      const result = await compileFrozenDebtPackage({
        companyId: "co_toy",
        packageKey: "toy-pkg",
        compileOnly: true,
        authorizePaidInference: false,
        documents: [
          {
            documentId: "doc_toy",
            label: "Toy CA",
            text: [
              "CREDIT AGREEMENT",
              "",
              "SECTION 6.01 Indebtedness. The Borrower shall not incur Indebtedness except:",
              "(a) Indebtedness under this Agreement;",
              "(b) Indebtedness in an aggregate principal amount not to exceed $5,000,000;",
            ].join("\n"),
          },
        ],
      });
      expect(result.stages).toBeTruthy();
      expect(result.humanInterventions.some((h) => h.kind === "COMPILE_ONLY")).toBe(true);
    } finally {
      if (prev === undefined) delete process.env.DATABASE_URL;
      else process.env.DATABASE_URL = prev;
    }
  });

  it("processLearningPackage persists FAILED outcome via mocked HTTPS executor", async () => {
    const prev = process.env.DATABASE_URL;
    const prevTransport = process.env.NEON_TRANSPORT;
    process.env.DATABASE_URL = "postgresql://u:p@ep-test.neon.tech/neondb?sslmode=require";
    process.env.NEON_TRANSPORT = "https";

    const { executor, tables } = mockHttpsExecutor();
    const root = mkdtempSync(path.join(tmpdir(), "clf-neon-"));
    const store = new LearningFileStore(defaultLearningStorePaths(root));

    // Force compile failure after compileOnly path by using an empty document set
    // via a package that loads, then stub compile through a bad instrument — instead
    // inject failure by persisting a FAILED manifest through the same persistNeon path
    // used by the catch block (integration of processLearningPackage catch is covered
    // by calling persist after building FAILED status, and by spying compile).
    const compileSpy = vi
      .spyOn(
        await import("../../lib/contract-model/analysis/offline-package-compile"),
        "compileFrozenDebtPackage",
      )
      .mockRejectedValueOnce(
        new LearningFactoryLegalSafetyError(
          "learning-factory must not write ContractRule; automated precedent processing is not production legal authority",
        ),
      );

    try {
      const pkgs = (
        await import("../../lib/covenant-learning-factory/package-registry")
      ).listLearningPackages();
      const chwy = pkgs.find((p) => p.packageKey.includes("chwy"));
      expect(chwy).toBeTruthy();

      const out = await processLearningPackage({
        spec: chwy!,
        store,
        persistNeon: true,
        neonExecutor: executor,
        skipIfUnchanged: false,
      });

      expect(out.manifest.status).toBe("FAILED");
      expect(out.neon.attempted).toBe(true);
      expect(out.neon.ok).toBe(true);
      expect(out.neon.detail).not.toMatch(/must not write ContractRule/i);
      expect(tables.learning_packages).toBeGreaterThanOrEqual(1);
      expect(tables.learning_runs).toBeGreaterThanOrEqual(1);
      expect(tables.learning_error_ledger_entries).toBeGreaterThanOrEqual(1);
      // compileOnly must have been requested before the mocked rejection
      expect(compileSpy).toHaveBeenCalled();
      const compileArgs = compileSpy.mock.calls[0]?.[0] as { compileOnly?: boolean };
      expect(compileArgs.compileOnly).toBe(true);
    } finally {
      compileSpy.mockRestore();
      if (prev === undefined) delete process.env.DATABASE_URL;
      else process.env.DATABASE_URL = prev;
      if (prevTransport === undefined) delete process.env.NEON_TRANSPORT;
      else process.env.NEON_TRANSPORT = prevTransport;
    }
  });
});
