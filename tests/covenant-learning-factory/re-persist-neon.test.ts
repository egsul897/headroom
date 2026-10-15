import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  defaultLearningStorePaths,
  LearningFileStore,
} from "../../lib/covenant-learning-factory/store/file-store";
import { processLearningPackage } from "../../lib/covenant-learning-factory/process-package";
import { listLearningPackages } from "../../lib/covenant-learning-factory/package-registry";
import type { NeonHttpsExecutor } from "../../lib/covenant-learning-factory/store/neon-transport";
import type { PackageAuditManifest } from "../../lib/covenant-learning-factory/types";

describe("clf batch re-persist to Neon", () => {
  it("writes prior local OK manifest to Neon without recompile", async () => {
    const root = mkdtempSync(path.join(tmpdir(), "clf-repersist-"));
    const store = new LearningFileStore(defaultLearningStorePaths(root));
    const chwy = listLearningPackages().find((p) => p.packageKey.includes("chwy"));
    expect(chwy).toBeTruthy();

    const now = new Date().toISOString();
    const prior: PackageAuditManifest = {
      schemaVersion: "covenant-learning-factory.package-audit.v1",
      packageKey: chwy!.packageKey,
      companyId: chwy!.companyId,
      issuerCik: chwy!.issuerCik,
      issuerTicker: chwy!.issuerTicker,
      cohort: chwy!.cohort,
      runId: "clr_prior_ok",
      codeSha: "abc",
      factoryVersion: "covenant-learning-factory.v1",
      compilerVersion: "offline-package-compile.v1",
      startedAt: now,
      finishedAt: now,
      status: "OK",
      documentHashes: chwy!.documents.map((d) => {
        const abs = path.join(process.cwd(), d.localPath);
        const buf = readFileSync(abs);
        return {
          documentId: d.documentId,
          path: d.localPath,
          sha256: createHash("sha256").update(buf).digest("hex"),
          byteSize: statSync(abs).size,
        };
      }),
      stages: [],
      artifacts: [],
      errors: [],
      improvementProposals: [],
      costs: [],
      claims: {
        trained: false,
        certified: false,
        generalized: false,
        productionReady: false,
        autoPromotedLegalAuthority: false,
      },
    };
    store.writePackageManifest(prior);

    const calls: string[] = [];
    const executor: NeonHttpsExecutor = {
      async execute(sql) {
        calls.push(sql);
        return [];
      },
    };

    const out = await processLearningPackage({
      spec: chwy!,
      store,
      persistNeon: true,
      rePersistNeon: true,
      skipIfUnchanged: true,
      neonExecutor: executor,
    });

    expect(out.manifest.status).toBe("SKIPPED_DUPLICATE");
    expect(out.neon.ok).toBe(true);
    expect(calls.some((s) => /learning_packages/i.test(s))).toBe(true);
    expect(calls.some((s) => /learning_runs/i.test(s))).toBe(true);
  });
});
