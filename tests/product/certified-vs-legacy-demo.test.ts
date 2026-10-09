/**
 * SYNTHETIC certified-vs-legacy comparison harness (CONMED-form-inspired).
 *
 * - Legacy: analyzeMultiPathTransaction → LEGACY_ENGINE_MULTIPATH / NOT_CERTIFIED_4E
 * - Certified/fixture: hand-built FIXTURE_IR + VerifiedUnitArtifact → evaluateVerifiedCapacity
 * - Never claims Phase 3 customer IR is certified
 * - Provider-free / no network
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { SemanticVerificationResult } from "@/lib/contract-model/compiler/semantic-verification/types";
import type {
  IRCapacityExpression,
  IRExpression,
  IRRule,
} from "@/lib/contract-model/ir/types";
import type { RuntimeVerificationIdentity } from "@/lib/contract-model/runtime/verification-envelope";
import type { LedgerUsageRecord } from "@/lib/contract-model/runtime/capacity/types";
import {
  CONMED_FORM_INSPIRED_CERT,
  InMemoryApprovedSnapshotStore,
  InMemoryContractLedgerStore,
  LedgerProposalRecorder,
  approveCertificateProposal,
  proposeFromCertificate,
  snapshotInputResolver,
} from "@/lib/contract-model/north-star-bridge";
import {
  evaluateVerifiedCapacity,
  type VerifiedExecutionPackage,
  type VerifiedUnitArtifact,
} from "@/lib/contract-model/verified-execution";
import { analyzeMultiPathTransaction } from "@/lib/product/customer-intelligence/multi-path-analysis";
import {
  DEMO_COMPANY_ID,
  DEMO_EXERCISES,
  DEMO_INSTRUMENT_KEY,
  DEMO_IR_LABEL,
  DEMO_LABEL,
  DEMO_LEGACY_AUTHORITY,
  DEMO_NOT_CERTIFIED,
  buildDemoReportShell,
  renderDemoReportMarkdown,
  type CapacityDiscrepancy,
  type DemoExercise,
  type ExerciseComparisonRow,
} from "@/lib/product/north-star-workflow/demo-exercises";

const OUT_JSON = path.join(
  "docs",
  "product",
  "customer-workflow",
  "certified-vs-legacy-demo-report.json",
);
const OUT_MD = path.join("docs", "product", "customer-workflow", "certified-vs-legacy-demo.md");

const STRONG = {
  irSchemaVersion: "fixture-demo-v1",
  compilerVersion: "fixture-compiler-v1",
  sourceContentVersion: "fixture-source-v1",
} as const;

const DOC = "synthetic-credit-agreement";

let exprN = 0;
const nid = () => `demo-expr-${++exprN}`;

const MONEY = (amount: number): IRExpression => ({
  kind: "MONEY",
  type: "MONEY",
  amount,
  currency: "USD",
  exprId: nid(),
});
const PCT = (value: number): IRExpression => ({
  kind: "PERCENT",
  type: "PERCENT",
  value,
  exprId: nid(),
});
const FIGURE = (metricName: string): IRExpression =>
  ({
    kind: "METRIC_REFERENCE",
    type: "MONEY",
    metricName,
    companyId: DEMO_COMPANY_ID,
    instrumentKey: DEMO_INSTRUMENT_KEY,
    resolvedDefinitionId: null,
    exprId: nid(),
  }) as IRExpression;
const MUL = (...operands: IRExpression[]): IRExpression => ({
  kind: "MULTIPLY",
  type: "MONEY",
  operands,
  exprId: nid(),
});

function capacityFor(
  flatUsd: number | null,
  ebitdaPct: number | null,
): IRCapacityExpression {
  if (flatUsd != null) return MONEY(flatUsd) as IRCapacityExpression;
  if (ebitdaPct != null) return MUL(PCT(ebitdaPct), FIGURE("Consolidated EBITDA")) as IRCapacityExpression;
  throw new Error("FIXTURE_IR rule needs flatUsd or ebitdaPct");
}

function buildRule(def: DemoExercise["fixtureIr"]["rules"][number]): IRRule {
  return {
    ruleId: def.ruleId,
    irSchemaVersion: STRONG.irSchemaVersion,
    companyId: DEMO_COMPANY_ID,
    instrumentKey: DEMO_INSTRUMENT_KEY,
    sourceDocumentId: DOC,
    sourceSectionRef: def.sectionRef,
    covenantFamily: def.family,
    ruleType: "QUANTITATIVE_PERMISSION",
    posture: "PERMISSION",
    action: def.action,
    entityScope: ["BORROWER"],
    entityScopeExcluded: [],
    transactionScope: null,
    capacityExpression: capacityFor(def.flatUsd, def.ebitdaPct),
    conditions: [],
    exceptions: [],
    dependsOn: [],
    operativeLineage: null,
    sufficiency: "COMPLETE",
    sufficiencyReasons: [],
    provenance: {
      documentId: DOC,
      sourceNodeKey: null,
      sourceCitation: `Section ${def.sectionRef} (SYNTHETIC)`,
      excerpt: `[FIXTURE_IR] ${def.sectionRef}`,
    },
    compilerVersion: STRONG.compilerVersion,
    sourceContentVersion: STRONG.sourceContentVersion,
  };
}

function identityOf(u: IRRule): RuntimeVerificationIdentity {
  return {
    ruleOrDefinitionId: u.ruleId,
    companyId: u.companyId,
    instrumentKey: u.instrumentKey,
    irSchemaVersion: u.irSchemaVersion ?? "",
    compilerVersion: u.compilerVersion ?? null,
    sourceContentVersion: u.sourceContentVersion ?? null,
  };
}

/**
 * Honest test-constructed verification artifact: COMPLETED status, no MATERIAL
 * findings, STRONG identity matching the IR unit. Not live verifier output —
 * labeled FIXTURE in the report. Empty findings + VERIFIED_NO_MATERIAL_GAP_FOUND
 * is the same shape used by verified-execution.test.ts helpers.
 */
function artifactFor(u: IRRule): VerifiedUnitArtifact {
  const result = {
    candidateRef: "synth-demo-cand",
    status: "VERIFIED_NO_MATERIAL_GAP_FOUND",
    findings: [],
    sourceInventory: { items: [] },
    irInventory: { items: [] },
    reconciliation: { items: [] },
    semanticReviewInvoked: false,
    semanticReviewSkippedReason: "FIXTURE_IR demo — no live verifier",
    conditionSuspicion: null,
    verifierAlgorithmVersion: "fixture-demo-verifier-v1",
    verifiedAt: "2026-07-01T00:00:00.000Z",
    evidenceSetHash: "fixture-eh-demo",
  } as unknown as SemanticVerificationResult;
  return {
    ruleOrDefinitionId: u.ruleId,
    kind: "RULE",
    verifiedIdentity: identityOf(u),
    result,
  };
}

function moneyAmount(a: {
  kind: string;
  value?: { type?: string; amount?: string };
} | null | undefined): number | null {
  if (!a || a.kind !== "AMOUNT" || a.value?.type !== "MONEY") return null;
  const n = Number(a.value.amount);
  return Number.isFinite(n) ? n : null;
}

function setupInMemoryStores(exercise: DemoExercise): {
  snapshots: ReturnType<InMemoryApprovedSnapshotStore["getSnapshots"]>;
  ledger: LedgerUsageRecord[];
} {
  const snapStore = new InMemoryApprovedSnapshotStore();
  const ledgerProposals = new LedgerProposalRecorder();
  const proposed = proposeFromCertificate(snapStore, CONMED_FORM_INSPIRED_CERT, ledgerProposals);
  if (!proposed.ok) {
    throw new Error(`SYNTHETIC cert propose failed: ${JSON.stringify(proposed)}`);
  }
  const approved = approveCertificateProposal(snapStore, {
    snapshotId: CONMED_FORM_INSPIRED_CERT.snapshotId,
    reviewedBy: "synth-demo-reviewer",
    reviewedAt: "2026-07-20T12:00:00Z",
    approvalRef: `apr-synth-demo-${exercise.id}`,
    sourceDocumentId: CONMED_FORM_INSPIRED_CERT.documentId,
    sourceVersionHash: CONMED_FORM_INSPIRED_CERT.versionHash,
    proposerKind: "human",
  });
  if (!approved.ok) {
    throw new Error(`SYNTHETIC cert approve failed: ${JSON.stringify(approved)}`);
  }

  const contractLedger = new InMemoryContractLedgerStore();
  for (const u of exercise.fixtureIr.ledgerUsages) {
    const write = contractLedger.appendUsage({
      usage: {
        usageId: u.usageId,
        companyId: DEMO_COMPANY_ID,
        instrumentKey: DEMO_INSTRUMENT_KEY,
        effectiveAsOf: u.effectiveAsOf,
        amount: { amount: String(u.amountUsd), currency: "USD" },
        capacityPath: { kind: "RULE", ruleId: u.ruleId },
        transactionRef: `synth-hist-${u.usageId}`,
        status: "RECORDED",
        supersededByUsageId: null,
        provenance: {
          source: `SYNTHETIC demo ledger:${exercise.id}`,
          sourceVersion: CONMED_FORM_INSPIRED_CERT.versionHash,
          approvalRef: `apr-synth-demo-${exercise.id}`,
          approvalState: "APPROVED",
        },
      },
    });
    if (!write.ok) {
      throw new Error(`SYNTHETIC ledger append failed: ${JSON.stringify(write)}`);
    }
  }

  return {
    snapshots: snapStore.getSnapshots(DEMO_COMPANY_ID),
    ledger: contractLedger.getActiveUsages(DEMO_COMPANY_ID),
  };
}

function runCertifiedPath(exercise: DemoExercise): ExerciseComparisonRow["certified"] {
  if (exercise.fixtureIr.blockVerifiedPackage) {
    return {
      ran: false,
      irLabel: DEMO_IR_LABEL,
      blocker: exercise.fixtureIr.blockReason ?? "NO_VERIFIED_EXECUTION_PACKAGE",
      outcome: null,
      capacities: [],
      coverageComplete: null,
    };
  }

  const rules = exercise.fixtureIr.rules.map(buildRule);
  if (rules.length === 0) {
    return {
      ran: false,
      irLabel: DEMO_IR_LABEL,
      blocker: "NO_VERIFIED_EXECUTION_PACKAGE",
      outcome: null,
      capacities: [],
      coverageComplete: null,
    };
  }

  const verifications = rules.map(artifactFor);
  // Refuse to claim COMPLETE if any artifact lacks identity versions (honesty gate).
  for (const a of verifications) {
    if (
      !a.verifiedIdentity.compilerVersion ||
      !a.verifiedIdentity.sourceContentVersion ||
      !a.verifiedIdentity.irSchemaVersion
    ) {
      return {
        ran: false,
        irLabel: DEMO_IR_LABEL,
        blocker: "NO_VERIFIED_EXECUTION_PACKAGE / incomplete verification identity",
        outcome: null,
        capacities: [],
        coverageComplete: null,
      };
    }
  }

  const pkg: VerifiedExecutionPackage = {
    companyId: DEMO_COMPANY_ID,
    instrumentKey: DEMO_INSTRUMENT_KEY,
    rules,
    definitions: [],
    verifications,
  };

  const { snapshots, ledger } = setupInMemoryStores(exercise);
  const inputs = snapshotInputResolver({
    snapshots: [...snapshots],
    definitions: [],
    rules,
    companyId: DEMO_COMPANY_ID,
    instrumentKey: DEMO_INSTRUMENT_KEY,
  });

  const result = evaluateVerifiedCapacity({
    package: pkg,
    inputs,
    ledger,
    asOf: exercise.applicableCutoff.evaluationDate,
  });

  if (result.outcome === "REFUSED") {
    return {
      ran: false,
      irLabel: DEMO_IR_LABEL,
      blocker: `VERIFIED_CAPACITY_REFUSED:${result.refusals.map((r) => r.code).join(",") || "unknown"}`,
      outcome: "REFUSED",
      capacities: [],
      coverageComplete: false,
    };
  }

  return {
    ran: true,
    irLabel: DEMO_IR_LABEL,
    blocker: null,
    outcome: result.outcome,
    capacities: result.state.capacities.map((c) => ({
      ruleId: c.ruleId,
      status: c.status,
      grossUsd: moneyAmount(c.grossCapacity),
      remainingUsd: moneyAmount(c.effectiveRemaining),
      usageUsd: moneyAmount(c.usage),
    })),
    coverageComplete: result.coverage.complete,
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

  // Unit / scale: legacy paths report millions; certified remaining is USD.
  for (const p of legacy.paths) {
    if (p.capacityMillions == null) continue;
    const match = certified.capacities.find((c) => c.ruleId.includes(p.sectionRef.replace(/[()]/g, (ch) => ch)));
    // Prefer sectionRef substring match on ruleId
    const bySection =
      certified.capacities.find((c) => c.ruleId.includes(p.sectionRef)) ??
      certified.capacities.find((c) => {
        const sec = p.sectionRef.replace(/[()]/g, "");
        return c.ruleId.replace(/[()]/g, "").includes(sec);
      });
    const cap = bySection ?? match;
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

  // Ledger-aware remaining vs legacy gross on historical-consumption style exercises
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

  // EBITDA stress: certified still uses APPROVED pack; legacy used stressed fin
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

  // Always record authority label discrepancy framing
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

  const certified = runCertifiedPath(exercise);
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

    // At least one FIXTURE_IR verified path should execute when artifacts are honest
    expect(report.summary.verifiedExecutionRan).toBeGreaterThanOrEqual(1);

    // Reclassification must stay blocked (honesty)
    const reclass = rows.find((r) => r.exerciseId === "reclassification")!;
    expect(reclass.certified.ran).toBe(false);
    expect(reclass.certified.blocker).toMatch(/NO_VERIFIED_EXECUTION_PACKAGE/);

    // Historical consumption should surface ledger-aware divergence when certified ran
    const hist = rows.find((r) => r.exerciseId === "historical-basket-consumption")!;
    if (hist.certified.ran) {
      const rem = hist.certified.capacities[0]?.remainingUsd;
      expect(rem).toBe(32_000_000);
      expect(
        hist.discrepancies.some((d) => d.field === "ledgerAwareRemaining" || d.field === "remainingCapacity"),
      ).toBe(true);
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
  });
});
