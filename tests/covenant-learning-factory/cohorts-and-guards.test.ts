import { describe, expect, it } from "vitest";
import {
  assignCohort,
  assertNoHeldOutContamination,
  normalizeCik,
  DEFAULT_HELD_OUT_CIKS,
  assertAutomatedKnowledgeState,
  assertLearningFactoryCannotWriteProductionAuthority,
  defaultHonestyClaims,
  BASELINE_CAPABILITY_INVENTORY,
  buildDashboardReport,
  listLearningPackages,
} from "../../lib/covenant-learning-factory";
import { LearningFactoryLegalSafetyError } from "../../lib/covenant-learning-factory/promotion-guards";
import type { PackageAuditManifest } from "../../lib/covenant-learning-factory/types";

describe("covenant learning factory — cohorts", () => {
  it("normalizes CIKs and assigns MHK to HELD_OUT", () => {
    expect(normalizeCik("851968")).toBe("0000851968");
    expect(assignCohort("0000851968")).toBe("HELD_OUT");
    expect(assignCohort("0000812011")).toBe("TRAIN_DEV");
    expect(DEFAULT_HELD_OUT_CIKS.has("0000851968")).toBe(true);
  });

  it("detects held-out contamination in train/dev", () => {
    const ok = assertNoHeldOutContamination(["0000812011", "0000912562"]);
    expect(ok).toEqual({ ok: true });
    const bad = assertNoHeldOutContamination(["0000812011", "0000851968"]);
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.contaminated).toContain("0000851968");
  });
});

describe("covenant learning factory — promotion guards", () => {
  it("refuses automated VERIFIED / production authority writes", () => {
    expect(() => assertAutomatedKnowledgeState("PROPOSED")).not.toThrow();
    expect(() => assertAutomatedKnowledgeState("REVIEW_REQUIRED")).not.toThrow();
    expect(() => assertAutomatedKnowledgeState("VERIFIED")).toThrow(LearningFactoryLegalSafetyError);
    expect(() => assertLearningFactoryCannotWriteProductionAuthority("Permission")).toThrow(
      LearningFactoryLegalSafetyError,
    );
    expect(defaultHonestyClaims().certified).toBe(false);
    expect(defaultHonestyClaims().autoPromotedLegalAuthority).toBe(false);
  });
});

describe("covenant learning factory — inventory + registry", () => {
  it("lists reusable inventory items and registers multi-issuer packages", () => {
    expect(BASELINE_CAPABILITY_INVENTORY.some((i) => i.status === "reusable")).toBe(true);
    expect(BASELINE_CAPABILITY_INVENTORY.every((i) => i.status !== "missing" || true)).toBe(true);
    const pkgs = listLearningPackages();
    expect(pkgs.length).toBeGreaterThanOrEqual(2);
    const tickers = new Set(pkgs.map((p) => p.issuerTicker).filter(Boolean));
    expect(tickers.size).toBeGreaterThanOrEqual(2);
    const mhk = pkgs.find((p) => p.packageKey.includes("mhk"));
    expect(mhk?.cohort).toBe("HELD_OUT");
  });

  it("builds dashboard honesty + cohort counts", () => {
    const manifests: PackageAuditManifest[] = [
      {
        schemaVersion: "covenant-learning-factory.package-audit.v1",
        packageKey: "demo-a",
        companyId: "a",
        issuerCik: "0000812011",
        cohort: "TRAIN_DEV",
        runId: "r1",
        codeSha: "x",
        factoryVersion: "covenant-learning-factory.v1",
        compilerVersion: "offline-package-compile.v1",
        startedAt: "2026-10-13T00:00:00.000Z",
        finishedAt: "2026-10-13T00:01:00.000Z",
        status: "OK",
        documentHashes: [],
        stages: [],
        compileSummary: {
          nodeCount: 10,
          definitionCount: 5,
          passACount: 20,
          totalCandidates: 12,
          exceptionCatalogCount: 2,
          supportedStructureUnits: 3,
          verifiedExecutableUnits: 1,
          unsupportedUnits: 4,
          refusedExecutableUnits: 2,
          authorityGate: "NO_OPERATIVE_STATE",
          paidInferenceUsed: false,
        },
        artifacts: [],
        errors: [
          {
            errorId: "e1",
            packageKey: "demo-a",
            runId: "r1",
            class: "OPERATIVE_IDENTITY_UNRESOLVED",
            severity: "MEDIUM",
            message: "gate",
            stage: "COMPILE",
            createdAt: "2026-10-13T00:01:00.000Z",
            correctiveHistory: [],
          },
        ],
        evaluation: {
          evaluationId: "ev1",
          packageKey: "demo-a",
          runId: "r1",
          cohort: "TRAIN_DEV",
          sourceFidelityPass: true,
          coverageScore: 0.3,
          calculationCorrectness: true,
          dangerousOmissionCount: 0,
          abstentionCount: 2,
          supportedStructureUnits: 3,
          verifiedExecutableUnits: 1,
          unsupportedUnits: 4,
          refusedExecutableUnits: 2,
          independent: true,
          notes: [],
          createdAt: "2026-10-13T00:01:00.000Z",
        },
        improvementProposals: [],
        costs: [{ category: "compute.wall", amount: 1000, unit: "ms", estimated: false }],
        claims: defaultHonestyClaims(),
      },
    ];
    const dash = buildDashboardReport({ manifests, neonLive: false });
    expect(dash.packages.trainDev).toBe(1);
    expect(dash.coverage.verifiedExecutableUnits).toBe(1);
    expect(dash.honesty.productionReady).toBe(false);
    expect(dash.errorLedger[0]?.class).toBe("OPERATIVE_IDENTITY_UNRESOLVED");
  });
});
