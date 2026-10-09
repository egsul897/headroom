/**
 * SYNTHETIC certified-vs-legacy comparison harness (CONMED-form-inspired).
 *
 * - Legacy: analyzeMultiPathTransaction → LEGACY_ENGINE_MULTIPATH / NOT_CERTIFIED_4E
 * - Certified/fixture: hand-built FIXTURE_IR VerifiedExecutionPackage → evaluateVerifiedCapacity
 *   (optional simulateVerifiedTransaction) via product bridges only
 * - Never claims Phase 3 customer IR is certified
 * - Provider-free / no network
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { analyzeMultiPathTransaction } from "@/lib/product/customer-intelligence/multi-path-analysis";
import {
  DEMO_EXERCISES,
  DEMO_IR_LABEL,
  DEMO_LABEL,
  DEMO_LEGACY_AUTHORITY,
  DEMO_NOT_CERTIFIED,
  buildDemoReportShell,
  renderDemoReportMarkdown,
  structuredExerciseFields,
  type CapacityDiscrepancy,
  type DemoExercise,
  type ExerciseComparisonRow,
} from "@/lib/product/north-star-workflow/demo-exercises";
import {
  moneyAmountOf,
  runFixtureCertifiedPath,
} from "@/lib/product/north-star-workflow/fixture-verified-package";

const OUT_JSON = path.join(
  "docs",
  "product",
  "customer-workflow",
  "certified-vs-legacy-demo-report.json",
);
const OUT_MD = path.join("docs", "product", "customer-workflow", "certified-vs-legacy-demo.md");

function certifiedRowFromRun(
  run: ReturnType<typeof runFixtureCertifiedPath>,
): ExerciseComparisonRow["certified"] {
  if (run.blocked || !run.capacity || run.capacity.outcome !== "EXECUTED") {
    return {
      ran: false,
      irLabel: DEMO_IR_LABEL,
      blocker: run.blocker ?? "NO_VERIFIED_EXECUTION_PACKAGE",
      outcome: run.capacity?.outcome ?? null,
      capacities: [],
      coverageComplete: null,
    };
  }
  return {
    ran: true,
    irLabel: DEMO_IR_LABEL,
    blocker: null,
    outcome: run.capacity.outcome,
    capacities: run.capacity.state.capacities.map((c) => ({
      ruleId: c.ruleId,
      status: c.status,
      grossUsd: moneyAmountOf(c.grossCapacity),
      remainingUsd: moneyAmountOf(c.effectiveRemaining),
      usageUsd: moneyAmountOf(c.usage),
    })),
    coverageComplete: run.capacity.coverage.complete,
  };
}

function collectDiscrepancies(
  exercise: DemoExercise,
  legacy: ReturnType<typeof analyzeMultiPathTransaction>,
  certified: ExerciseComparisonRow["certified"],
): CapacityDiscrepancy[] {
  const out: CapacityDiscrepancy[] = [];

  if (!certified.ran) {
    out.push({
      exerciseId: exercise.id,
      pathOrRule: "(package)",
      field: "verifiedExecution",
      legacyValue: legacy.authority,
      certifiedValue: certified.blocker,
      note: `Certified/FIXTURE path blocked (${certified.blocker}). Legacy remains ${DEMO_NOT_CERTIFIED}.`,
    });
    return out;
  }

  for (const p of legacy.paths) {
    if (p.capacityMillions == null) continue;
    const bySection =
      certified.capacities.find((c) => c.ruleId.includes(p.sectionRef)) ??
      certified.capacities.find((c) => {
        const sec = p.sectionRef.replace(/[()]/g, "");
        return c.ruleId.replace(/[()]/g, "").includes(sec);
      });
    const cap = bySection;
    if (!cap || cap.remainingUsd == null) {
      out.push({
        exerciseId: exercise.id,
        pathOrRule: `${p.sectionRef}:${p.family}`,
        field: "remainingCapacity",
        legacyValue: p.capacityMillions,
        certifiedValue: cap?.remainingUsd ?? null,
        note: "Legacy path has numerical capacity (millions); no matching FIXTURE_IR remaining USD (or null)",
      });
      continue;
    }
    const legacyUsd = p.capacityMillions * 1_000_000;
    if (Math.abs(legacyUsd - cap.remainingUsd) > 1) {
      out.push({
        exerciseId: exercise.id,
        pathOrRule: `${p.sectionRef}:${p.family}`,
        field: "remainingCapacity",
        legacyValue: p.capacityMillions,
        certifiedValue: cap.remainingUsd,
        note: `Legacy capacityMillions×1e6=${legacyUsd} vs FIXTURE_IR remainingUsd=${cap.remainingUsd} (scale/formula/ledger divergence)`,
      });
    }
  }

  if (exercise.fixtureIr.ledgerUsages.length > 0) {
    const totalUsage = exercise.fixtureIr.ledgerUsages.reduce((n, u) => n + u.amountUsd, 0);
    for (const c of certified.capacities) {
      if (c.usageUsd != null && c.usageUsd > 0) {
        const legacyPath = legacy.paths.find((p) => c.ruleId.includes(p.sectionRef));
        if (legacyPath?.capacityMillions != null) {
          const legacyUsd = legacyPath.capacityMillions * 1_000_000;
          if (c.remainingUsd != null && Math.abs(legacyUsd - c.remainingUsd) > 1) {
            out.push({
              exerciseId: exercise.id,
              pathOrRule: c.ruleId,
              field: "ledgerAwareRemaining",
              legacyValue: legacyPath.capacityMillions,
              certifiedValue: c.remainingUsd,
              note: `Ledger usage $${totalUsage} reflected on FIXTURE_IR but not on legacy Permission capacity`,
            });
          }
        }
      }
    }
  }

  if (exercise.id === "ebitda-decline") {
    const certifiedGrower = certified.capacities.find((c) => c.ruleId.includes("7.01(c)"));
    const legacyGrower = legacy.paths.find((p) => p.sectionRef === "7.01(c)");
    if (certifiedGrower?.remainingUsd != null && legacyGrower?.capacityMillions != null) {
      const legacyUsd = legacyGrower.capacityMillions * 1_000_000;
      if (Math.abs(legacyUsd - certifiedGrower.remainingUsd) > 1) {
        out.push({
          exerciseId: exercise.id,
          pathOrRule: "7.01(c)",
          field: "stressedEbitdaCapacity",
          legacyValue: legacyGrower.capacityMillions,
          certifiedValue: certifiedGrower.remainingUsd,
          note: "Legacy stressed EBITDA (−20%); FIXTURE_IR binds APPROVED snapshot EBITDA — expected divergence",
        });
      }
    }
  }

  if (legacy.authority === DEMO_LEGACY_AUTHORITY || legacy.authority === "AI_PROPOSED_ONLY") {
    out.push({
      exerciseId: exercise.id,
      pathOrRule: "(authority)",
      field: "authority",
      legacyValue: `${legacy.authority}/${DEMO_NOT_CERTIFIED}`,
      certifiedValue: certified.ran
        ? "FIXTURE_IR/evaluateVerifiedCapacity(REQUIRE)"
        : certified.blocker,
      note: "Authority surfaces differ by design — legacy must not be presented as certified Phase 4E",
    });
  }

  return out;
}

function compareExercise(exercise: DemoExercise): ExerciseComparisonRow {
  const structured = structuredExerciseFields(exercise);
  expect(structured.cutoff.evaluationDate).toBeTruthy();
  expect(structured.provisions.length).toBeGreaterThan(0);
  expect(structured.paths.length).toBeGreaterThan(0);
  expect(structured.authority.notCertified).toBe(DEMO_NOT_CERTIFIED);

  const legacy = analyzeMultiPathTransaction({
    amountMillions: exercise.transaction.amountMillions,
    kind: exercise.transaction.kind,
    secured: exercise.transaction.secured,
    label: exercise.transaction.label,
    items: exercise.legacy.items,
    approvals: exercise.legacy.approvals,
    permissions: exercise.legacy.permissions,
    financials: exercise.legacy.financials,
  });

  expect(legacy.narrative).toMatch(/NOT_CERTIFIED_4E/);
  expect(["LEGACY_ENGINE_MULTIPATH", "AI_PROPOSED_ONLY"]).toContain(legacy.authority);

  const run = runFixtureCertifiedPath(exercise);
  const certified = certifiedRowFromRun(run);
  const discrepancies = collectDiscrepancies(exercise, legacy, certified);

  return {
    exerciseId: exercise.id,
    title: exercise.title,
    label: DEMO_LABEL,
    applicableCutoff: exercise.applicableCutoff,
    legacyAuthority:
      legacy.authority === "LEGACY_ENGINE_MULTIPATH"
        ? DEMO_LEGACY_AUTHORITY
        : "AI_PROPOSED_ONLY",
    legacyNotCertifiedLabel: DEMO_NOT_CERTIFIED,
    legacy: {
      pathCount: legacy.paths.length,
      sufficientSingle: legacy.sufficientSinglePaths.map((p) => ({
        sectionRef: p.sectionRef,
        family: p.family,
        capacityMillions: p.capacityMillions,
      })),
      partial: legacy.partialPaths.map((p) => ({
        sectionRef: p.sectionRef,
        family: p.family,
        capacityMillions: p.capacityMillions,
      })),
      narrative: legacy.narrative,
      stackingAssumed: false,
    },
    certified,
    discrepancies,
    limitations: exercise.limitations,
  };
}

describe("SYNTHETIC certified-vs-legacy CONMED-form demo harness", () => {
  it("runs all demo exercises, records discrepancies, writes report artifacts", () => {
    expect(DEMO_EXERCISES).toHaveLength(7);
    expect(DEMO_EXERCISES.map((e) => e.id)).toEqual([
      "secured-borrowing-100m",
      "restricted-payment-75m",
      "acquisition-financing-150m",
      "ebitda-decline",
      "amendment-basket-capacity",
      "historical-basket-consumption",
      "reclassification",
    ]);

    const rows = DEMO_EXERCISES.map(compareExercise);
    const report = buildDemoReportShell(rows);

    expect(report.label).toBe(DEMO_LABEL);
    expect(report.irLabel).toBe(DEMO_IR_LABEL);
    expect(report.exercises.length).toBe(7);
    expect(report.discrepancies.length).toBeGreaterThan(0);
    expect(report.summary.legacyAlwaysNotCertified4E).toBe(true);
    expect(report.summary.verifiedExecutionBlocked).toBeGreaterThanOrEqual(1);
    expect(report.summary.verifiedExecutionRan).toBeGreaterThanOrEqual(1);

    // Report lists every exercise
    for (const ex of DEMO_EXERCISES) {
      expect(report.exercises.some((r) => r.exerciseId === ex.id)).toBe(true);
    }

    // Every discrepancy has a cause (note) and appears in the flat list
    for (const d of report.discrepancies) {
      expect(d.note.trim().length).toBeGreaterThan(0);
      expect(d.field.trim().length).toBeGreaterThan(0);
      expect(DEMO_EXERCISES.some((e) => e.id === d.exerciseId)).toBe(true);
    }

    const reclass = rows.find((r) => r.exerciseId === "reclassification")!;
    expect(reclass.certified.ran).toBe(false);
    expect(reclass.certified.blocker).toMatch(/NO_VERIFIED_EXECUTION_PACKAGE/);

    const hist = rows.find((r) => r.exerciseId === "historical-basket-consumption")!;
    if (hist.certified.ran) {
      expect(hist.certified.capacities.length).toBeGreaterThan(0);
      expect(
        hist.discrepancies.some(
          (d) => d.field === "ledgerAwareRemaining" || d.field === "remainingCapacity",
        ),
      ).toBe(true);
    }

    const rp = rows.find((r) => r.exerciseId === "restricted-payment-75m")!;
    if (rp.certified.ran) {
      expect(rp.certified.outcome).toBe("EXECUTED");
      expect(rp.certified.capacities.some((c) => c.ruleId.includes("7.06"))).toBe(true);
      // Ledger-aware remaining may be AVAILABLE or NEEDS_INPUT depending on shared-cap binding;
      // discrepancies must still be recorded either way.
      expect(rp.discrepancies.length).toBeGreaterThan(0);
    }

    for (const row of rows) {
      expect(row.legacyNotCertifiedLabel).toBe(DEMO_NOT_CERTIFIED);
      expect(row.label).toBe(DEMO_LABEL);
      expect(row.discrepancies.length).toBeGreaterThan(0);
    }

    fs.mkdirSync(path.dirname(OUT_JSON), { recursive: true });
    fs.writeFileSync(OUT_JSON, JSON.stringify(report, null, 2) + "\n");
    fs.writeFileSync(OUT_MD, renderDemoReportMarkdown(report));

    expect(fs.existsSync(OUT_JSON)).toBe(true);
    expect(fs.existsSync(OUT_MD)).toBe(true);
    const written = JSON.parse(fs.readFileSync(OUT_JSON, "utf8")) as typeof report;
    expect(written.schema).toBe("product.certified-vs-legacy-demo.v1");
    expect(written.exercises.length).toBe(7);
    expect(Array.isArray(written.discrepancies)).toBe(true);
    expect(written.discrepancies.length).toBeGreaterThan(0);
    for (const d of written.discrepancies) {
      expect(typeof d.note).toBe("string");
      expect(d.note.length).toBeGreaterThan(0);
    }
  });
});
